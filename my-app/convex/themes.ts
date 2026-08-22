import { v } from 'convex/values';
import { mutation, query, internalAction, internalMutation, internalQuery } from './_generated/server';
import { internal } from './_generated/api';
import { blobToDataUri } from './renders';

// Custom themes: a guest uploads an inspiration photo (a wedding invitation, a
// poster, a vibe) and we derive a photobooth theme from it. The derivation uses
// GMI's OpenAI-compatible vision chat endpoint (api.gmi-serving.com — same
// Bearer key as the image queue) to produce {name, prompt}; the result is a
// session-scoped `styles` row, so the existing render pipeline needs no changes.

// Step 1: the phone asks for a place to PUT the inspiration image. Token-gated
// so random internet traffic can't fill our file storage.
export const generateUploadUrl = mutation({
  args: { token: v.string() },
  returns: v.string(),
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query('sessions')
      .withIndex('by_token', (q) => q.eq('token', args.token))
      .unique();
    if (session === null) throw new Error('Unknown session token');
    return await ctx.storage.generateUploadUrl();
  },
});

// Step 2: the phone hands us the uploaded file and we kick off derivation.
// Same shape as requestRender: fast mutation writes the job row, the slow
// external call happens in a scheduled action, the phone subscribes to the row.
export const requestTheme = mutation({
  args: { token: v.string(), storageId: v.id('_storage') },
  returns: v.id('themeRequests'),
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query('sessions')
      .withIndex('by_token', (q) => q.eq('token', args.token))
      .unique();
    if (session === null) throw new Error('Unknown session token');

    const requestId = await ctx.db.insert('themeRequests', {
      sessionId: session._id,
      storageId: args.storageId,
      status: 'pending',
    });
    await ctx.scheduler.runAfter(0, internal.themes.runThemeDerivation, { requestId });
    return requestId;
  },
});

// The phone's subscription: the newest theme request for this session.
export const latestThemeRequest = query({
  args: { token: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      requestId: v.id('themeRequests'),
      status: v.union(
        v.literal('pending'),
        v.literal('processing'),
        v.literal('done'),
        v.literal('failed'),
      ),
      styleId: v.union(v.id('styles'), v.null()),
      error: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query('sessions')
      .withIndex('by_token', (q) => q.eq('token', args.token))
      .unique();
    if (session === null) return null;

    const latest = await ctx.db
      .query('themeRequests')
      .withIndex('by_session', (q) => q.eq('sessionId', session._id))
      .order('desc')
      .first();
    if (latest === null) return null;
    return {
      requestId: latest._id,
      status: latest.status,
      styleId: latest.styleId ?? null,
      error: latest.error ?? null,
    };
  },
});

// Internal write-backs, mirroring renders.ts: only the action drives job state.
export const setThemeStatus = internalMutation({
  args: {
    requestId: v.id('themeRequests'),
    status: v.union(v.literal('processing'), v.literal('failed')),
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch('themeRequests', args.requestId, {
      status: args.status,
      ...(args.error !== undefined ? { error: args.error.slice(0, 300) } : {}),
    });
    return null;
  },
});

// Creates the style row and completes the request in ONE transaction, so the
// phone can never observe a `done` request whose style doesn't exist yet.
export const finishTheme = internalMutation({
  args: {
    requestId: v.id('themeRequests'),
    name: v.string(),
    prompt: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const request = await ctx.db.get('themeRequests', args.requestId);
    if (request === null) throw new Error('Unknown theme request');

    const styleId = await ctx.db.insert('styles', {
      name: args.name,
      prompt: args.prompt,
      // Presets are 0..3; Date.now() sorts customs after them, newest last.
      order: Date.now(),
      active: true,
      sessionId: request.sessionId,
    });
    await ctx.db.patch('themeRequests', args.requestId, { status: 'done', styleId });
    return null;
  },
});

// Loads what the derivation action needs. Internal — only runThemeDerivation
// calls it.
export const getRequest = internalQuery({
  args: { requestId: v.id('themeRequests') },
  returns: v.union(v.null(), v.object({ storageId: v.id('_storage') })),
  handler: async (ctx, args) => {
    const request = await ctx.db.get('themeRequests', args.requestId);
    if (request === null) return null;
    return { storageId: request.storageId };
  },
});

// Convex does not auto-retry actions, so like runRender the whole body is
// wrapped: any failure lands as a visible `failed` + error, never a stuck
// spinner.
export const runThemeDerivation = internalAction({
  args: { requestId: v.id('themeRequests') },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.themes.setThemeStatus, {
      requestId: args.requestId,
      status: 'processing',
    });
    try {
      const request = await ctx.runQuery(internal.themes.getRequest, {
        requestId: args.requestId,
      });
      if (request === null) throw new Error('Theme request not found');

      const image = await ctx.storage.get(request.storageId);
      if (image === null) throw new Error('Inspiration image missing from storage');

      const theme = await deriveThemeFromImage(await blobToDataUri(image));

      await ctx.runMutation(internal.themes.finishTheme, {
        requestId: args.requestId,
        name: theme.name,
        prompt: theme.prompt,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await ctx.runMutation(internal.themes.setThemeStatus, {
        requestId: args.requestId,
        status: 'failed',
        error: message,
      });
    }
    return null;
  },
});

// ---------------------------------------------------------------------------
// GMI vision call. This is the CHAT surface (api.gmi-serving.com), not the
// image request queue — OpenAI-compatible, same Bearer key. Verified working
// with google/gemini-3.5-flash: base64 data-uri in image_url, json_object
// response format, ~8s to return {name, prompt}.
//
// Until GMI_API_KEY is set this falls back to a generic theme so the whole
// upload → derive → pick → render loop is demoable without the key.
// ---------------------------------------------------------------------------
const GMI_CHAT_URL = 'https://api.gmi-serving.com/v1/chat/completions';

// Appended server-side to every derived prompt. The vision model describes the
// LOOK; this line keeps the render from repainting who is in the photo. Same
// language as the seeded presets, which survived a 4-person identity test.
const IDENTITY_SUFFIX =
  ' Apply the theme to everyone in the frame. Keep every person’s exact face, features, and hair so all are clearly recognizable, and preserve the original composition, framing, and number of people.';

const DERIVE_INSTRUCTION = [
  'You design photo-editing themes for an AI photobooth. Study the attached inspiration image',
  '(it might be an invitation, poster, artwork, or just a vibe) and design a theme from it.',
  'Respond with a JSON object with exactly two string fields:',
  '"name": a short catchy theme name, at most 3 words;',
  '"prompt": one paragraph instructing an image-editing model how to restyle a photobooth photo',
  'into this theme — color palette, lighting, mood, background, wardrobe accents, and any motifs',
  'drawn from the inspiration image. Describe only the look and atmosphere; never instruct it to',
  'replace, add, or remove people.',
].join(' ');

async function deriveThemeFromImage(imageDataUri: string): Promise<{ name: string; prompt: string }> {
  const apiKey = process.env.GMI_API_KEY;
  if (!apiKey) {
    console.warn('GMI_API_KEY not set — returning a placeholder custom theme.');
    return {
      name: 'My Custom Theme',
      prompt: 'Restyle this photo with a tasteful, cohesive artistic treatment inspired by the guest’s uploaded image.' + IDENTITY_SUFFIX,
    };
  }

  const model = process.env.GMI_VISION_MODEL ?? 'google/gemini-3.5-flash';
  const res = await fetch(GMI_CHAT_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: DERIVE_INSTRUCTION },
            { type: 'image_url', image_url: { url: imageDataUri } },
          ],
        },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error(`GMI vision ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error('GMI vision returned no content');

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(`GMI vision returned non-JSON: ${content.slice(0, 200)}`);
  }
  const { name, prompt } = parsed as { name?: unknown; prompt?: unknown };
  if (typeof name !== 'string' || typeof prompt !== 'string' || !name.trim() || !prompt.trim()) {
    throw new Error('GMI vision JSON missing name/prompt');
  }

  return { name: name.trim().slice(0, 40), prompt: prompt.trim().slice(0, 2000) + IDENTITY_SUFFIX };
}
