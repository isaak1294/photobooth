import { v } from 'convex/values';
import { mutation, query, internalMutation } from './_generated/server';

// Create a new booth run. The `token` is a random string carried in the QR link
// — never a sequential id, so a stale QR from a test run can't surface someone
// else's photos mid-demo (demo-plan §2.1). `shortCode` is the human-readable
// code printed under the QR.
export const createSession = mutation({
  args: {},
  returns: v.object({
    sessionId: v.id('sessions'),
    token: v.string(),
    shortCode: v.string(),
  }),
  handler: async (ctx) => {
    const token = crypto.randomUUID();
    // e.g. "PB-4821" — enough to disambiguate the handful of sessions in a demo.
    const shortCode = `PB-${Math.floor(1000 + Math.random() * 9000)}`;
    const sessionId = await ctx.db.insert('sessions', { token, shortCode });
    return { sessionId, token, shortCode };
  },
});

// The subscription both screens live on. Returns everything the phone/booth need
// for one session: its photos and renders, each with a resolved file URL. Convex
// re-runs this for every subscribed client whenever any of these rows change —
// that's the "no polling" centerpiece (demo-plan §5).
export const getSession = query({
  args: { token: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      sessionId: v.id('sessions'),
      shortCode: v.string(),
      photos: v.array(
        v.object({
          _id: v.id('photos'),
          _creationTime: v.number(),
          url: v.union(v.string(), v.null()),
        }),
      ),
      renders: v.array(
        v.object({
          _id: v.id('renders'),
          _creationTime: v.number(),
          photoId: v.id('photos'),
          styleId: v.id('styles'),
          status: v.union(
            v.literal('queued'),
            v.literal('processing'),
            v.literal('done'),
            v.literal('failed'),
          ),
          error: v.union(v.string(), v.null()),
          outputUrl: v.union(v.string(), v.null()),
        }),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query('sessions')
      .withIndex('by_token', (q) => q.eq('token', args.token))
      .unique();
    if (session === null) return null;

    const photoDocs = await ctx.db
      .query('photos')
      .withIndex('by_session', (q) => q.eq('sessionId', session._id))
      .collect();
    const renderDocs = await ctx.db
      .query('renders')
      .withIndex('by_session', (q) => q.eq('sessionId', session._id))
      .collect();

    const photos = await Promise.all(
      photoDocs.map(async (p) => ({
        _id: p._id,
        _creationTime: p._creationTime,
        url: await ctx.storage.getUrl(p.storageId),
      })),
    );
    const renders = await Promise.all(
      renderDocs.map(async (r) => ({
        _id: r._id,
        _creationTime: r._creationTime,
        photoId: r.photoId,
        styleId: r.styleId,
        status: r.status,
        error: r.error ?? null,
        outputUrl: r.outputStorageId ? await ctx.storage.getUrl(r.outputStorageId) : null,
      })),
    );

    return { sessionId: session._id, shortCode: session.shortCode, photos, renders };
  },
});

// Called by the /upload HTTP action after it stores a frame in file storage.
// Internal: actions have no ctx.db, so the write goes through a mutation, and we
// don't want this callable from the client. Looks the session up by token so the
// booth only ever passes the token it already has.
export const addPhoto = internalMutation({
  args: { token: v.string(), storageId: v.id('_storage') },
  returns: v.union(v.id('photos'), v.null()),
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query('sessions')
      .withIndex('by_token', (q) => q.eq('token', args.token))
      .unique();
    if (session === null) return null;
    return await ctx.db.insert('photos', { sessionId: session._id, storageId: args.storageId });
  },
});
