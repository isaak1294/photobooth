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
// GMI seam. Swap the body of the `GMI_API_KEY` branch for the real edit-model
// call once the bake-off (demo-plan §GMI) picks a winner — read the endpoint +
// model from env vars, never hardcode the key in client code.
//
// Until a key is set, this returns an IDENTITY render (the original frame) so
// the whole reactive pipeline — capture → request → schedule → write-back →
// both screens update — is demoable end-to-end today, before GMI is wired.
// ---------------------------------------------------------------------------
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

  const source = await ctx.storage.get(photoStorageId);
  if (source === null) throw new Error('Source frame missing from storage');

  // TODO(bake-off): replace with the chosen GMI edit/img2img endpoint + model.
  // Shape it as: POST image + prompt -> receive edited image bytes.
  const model = process.env.GMI_MODEL ?? 'REPLACE_WITH_CHOSEN_MODEL';
  const form = new FormData();
  form.append('image', source, 'frame.jpg');
  form.append('prompt', prompt);
  form.append('model', model);

  const res = await fetch(process.env.GMI_ENDPOINT ?? 'https://api.gmi.example/v1/edit', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) {
    throw new Error(`GMI ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }

  const outputBlob = await res.blob();
  return await ctx.storage.store(outputBlob);
}
