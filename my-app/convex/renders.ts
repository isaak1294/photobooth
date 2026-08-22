import { v } from 'convex/values';
import {
  mutation,
  internalAction,
  internalMutation,
  internalQuery,
  ActionCtx,
} from './_generated/server';
import { internal } from './_generated/api';
import { Id } from './_generated/dataModel';

// Guest taps a style. We validate the session by token, write a `renders` row as
// `queued`, schedule the render to run immediately, and return right away. The
// mutation stays fast; the slow GMI call happens in the scheduled action. That
// one `renders` doc is both the job record and what both screens subscribe to.
export const requestRender = mutation({
  args: {
    token: v.string(),
    photoId: v.id('photos'),
    styleId: v.id('styles'),
  },
  returns: v.id('renders'),
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query('sessions')
      .withIndex('by_token', (q) => q.eq('token', args.token))
      .unique();
    if (session === null) throw new Error('Unknown session token');

    // The photo must belong to this session — the token gates the whole run, so
    // don't let a request render a photo from someone else's session.
    const photo = await ctx.db.get(args.photoId);
    if (photo === null || photo.sessionId !== session._id) {
      throw new Error('Photo does not belong to this session');
    }

    const renderId = await ctx.db.insert('renders', {
      sessionId: session._id,
      photoId: args.photoId,
      styleId: args.styleId,
      status: 'queued',
    });

    await ctx.scheduler.runAfter(0, internal.renders.runRender, { renderId });
    return renderId;
  },
});

// Loads everything the render action needs. Internal — only runRender calls it.
export const getRenderJob = internalQuery({
  args: { renderId: v.id('renders') },
  returns: v.union(
    v.null(),
    v.object({
      photoStorageId: v.id('_storage'),
      prompt: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const render = await ctx.db.get(args.renderId);
    if (render === null) return null;
    const photo = await ctx.db.get(render.photoId);
    const style = await ctx.db.get(render.styleId);
    if (photo === null || style === null) return null;
    return { photoStorageId: photo.storageId, prompt: style.prompt };
  },
});

// Status write-backs. Internal: only the render action drives job state.
export const setStatus = internalMutation({
  args: {
    renderId: v.id('renders'),
    status: v.union(
      v.literal('queued'),
      v.literal('processing'),
      v.literal('done'),
      v.literal('failed'),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.renderId, { status: args.status });
    return null;
  },
});

export const setDone = internalMutation({
  args: { renderId: v.id('renders'), outputStorageId: v.id('_storage') },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.renderId, {
      status: 'done',
      outputStorageId: args.outputStorageId,
    });
    return null;
  },
});

export const setFailed = internalMutation({
  args: { renderId: v.id('renders'), error: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.renderId, { status: 'failed', error: args.error });
    return null;
  },
});

// The one function that talks to the outside world. Convex does NOT auto-retry
// actions, so the whole body is wrapped: any failure is caught and written back
// as a visible `failed` status with the error, never left as a stuck spinner
// (demo-plan §2.3). You'll see the reason in the Convex dashboard in seconds.
export const runRender = internalAction({
  args: { renderId: v.id('renders') },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.renders.setStatus, {
      renderId: args.renderId,
      status: 'processing',
    });

    try {
      const job = await ctx.runQuery(internal.renders.getRenderJob, {
        renderId: args.renderId,
      });
      if (job === null) throw new Error('Render job, photo, or style not found');

      const outputStorageId = await runGmiEdit(ctx, job.photoStorageId, job.prompt);

      await ctx.runMutation(internal.renders.setDone, {
        renderId: args.renderId,
        outputStorageId,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await ctx.runMutation(internal.renders.setFailed, {
        renderId: args.renderId,
        error: message,
      });
    }
    return null;
  },
});

// ---------------------------------------------------------------------------
// GMI Cloud edit call. GMI's image API is an async request QUEUE (verified
// against docs.gmicloud.ai):
//   submit: POST {base}/api/v1/ie/requestqueue/apikey/requests
//           body: {"model", "payload": {"image": <base64|url>, "prompt"}}
//   poll:   GET  {base}/api/v1/ie/requestqueue/apikey/requests/{request_id}
//           until status === "success"; output at outcome.media_urls[0].url
//   auth:   Authorization: Bearer <GMI_API_KEY>
//
// Default model is seedream-5.0-pro — verified working on this account with the
// {image, prompt} payload below, and it preserves facial identity well on a real
// face (~42s/render). NOTE: the doc-recommended flux-kontext-pro / seededit-*
// IDs are listed but NOT entitled on this plan (403/404), and the gemini-*-image
// models reject base64 and require an https:// image URL — so they don't work
// against a local deployment. Swap GMI_MODEL to bake off faster models later.
//
// Set on the deployment (never in client code):
//   npx convex env set GMI_API_KEY <key>
//   npx convex env set GMI_MODEL seedream-5.0-pro   # optional override
//
// Until GMI_API_KEY is set, this returns an IDENTITY render (the original frame)
// so the whole reactive pipeline is demoable end-to-end before GMI is wired.
// ---------------------------------------------------------------------------
const GMI_BASE_URL = 'https://console.gmicloud.ai';
const GMI_POLL_INTERVAL_MS = 2000;
const GMI_MAX_POLLS = 60; // ~2 min ceiling, then we fail visibly rather than hang

async function runGmiEdit(
  ctx: ActionCtx,
  photoStorageId: Id<'_storage'>,
  prompt: string,
): Promise<Id<'_storage'>> {
  const apiKey = process.env.GMI_API_KEY;

  if (!apiKey) {
    // No key yet: echo the source frame back so status flips to `done` and the
    // subscription fires. Reuse the same stored file — no re-upload needed.
    console.warn('GMI_API_KEY not set — returning identity render (source frame). Prompt:', prompt);
    return photoStorageId;
  }

  const base = process.env.GMI_BASE_URL ?? GMI_BASE_URL;
  const model = process.env.GMI_MODEL ?? 'seedream-5.0-pro';

  // GMI fetches the input image itself, so a local deployment's 127.0.0.1
  // storage URL is unreachable from GMI's servers. Send the frame inline as a
  // base64 data URI — works for both local and hosted deployments. (If GMI
  // rejects the data: prefix, send raw base64 instead — a bake-off-time tweak.)
  const source = await ctx.storage.get(photoStorageId);
  if (source === null) throw new Error('Source frame missing from storage');
  const imageDataUri = await blobToDataUri(source);

  // 1. Submit the edit job.
  const submitRes = await fetch(`${base}/api/v1/ie/requestqueue/apikey/requests`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      payload: { image: imageDataUri, prompt, response_format: 'url' },
    }),
  });
  if (!submitRes.ok) {
    throw new Error(`GMI submit ${submitRes.status}: ${(await submitRes.text()).slice(0, 300)}`);
  }
  const submitJson = (await submitRes.json()) as { request_id?: string; id?: string };
  const requestId = submitJson.request_id ?? submitJson.id;
  if (!requestId) {
    throw new Error(`GMI submit returned no request_id: ${JSON.stringify(submitJson).slice(0, 300)}`);
  }

  // 2. Poll until the job finishes.
  let outputUrl: string | undefined;
  for (let attempt = 0; attempt < GMI_MAX_POLLS; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, GMI_POLL_INTERVAL_MS));

    const pollRes = await fetch(`${base}/api/v1/ie/requestqueue/apikey/requests/${requestId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!pollRes.ok) {
      throw new Error(`GMI poll ${pollRes.status}: ${(await pollRes.text()).slice(0, 300)}`);
    }
    const pollJson = (await pollRes.json()) as {
      status?: string;
      outcome?: { media_urls?: Array<{ url?: string }> };
      error?: string;
    };

    if (pollJson.status === 'success') {
      outputUrl = pollJson.outcome?.media_urls?.[0]?.url;
      break;
    }
    if (pollJson.status === 'failed') {
      throw new Error(`GMI render failed: ${pollJson.error ?? 'unknown error'}`);
    }
    // queued | processing -> keep polling
  }
  if (!outputUrl) throw new Error(`GMI render timed out after ${GMI_MAX_POLLS} polls`);

  // 3. Download the edited image and store it back in Convex.
  const outRes = await fetch(outputUrl);
  if (!outRes.ok) throw new Error(`GMI output download ${outRes.status}`);
  return await ctx.storage.store(await outRes.blob());
}

// Base64-encode a Blob into a data URI. Chunked so a large frame doesn't blow
// the stack on the String.fromCharCode(...spread).
async function blobToDataUri(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  const mime = blob.type || 'image/jpeg';
  return `data:${mime};base64,${btoa(binary)}`;
}
