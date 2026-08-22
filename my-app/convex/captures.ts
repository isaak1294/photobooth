import { v } from 'convex/values';
import { mutation, query } from './_generated/server';

// PHONE -> writes the shutter signal. Called by the Take Picture button.
export const requestCapture = mutation({
  args: { token: v.string() },
  returns: v.id('captureRequests'),
  handler: async (ctx, { token }) => {
    const session = await ctx.db
      .query('sessions')
      .withIndex('by_token', (q) => q.eq('token', token))
      .unique();
    if (session === null) throw new Error('Unknown session token');
    return await ctx.db.insert('captureRequests', { sessionId: session._id, status: 'pending' });
  },
});

// The booth (Pi) authenticates with a shared secret rather than a session token,
// because it watches ALL sessions' pending requests and each request tells it
// which token to upload to. Gating this keeps tokens from leaking via a public
// query. Fail-closed: if BOOTH_SECRET is unset, nothing matches.
function assertBooth(secret: string) {
  if (!process.env.BOOTH_SECRET || secret !== process.env.BOOTH_SECRET) {
    throw new Error('Invalid booth secret');
  }
}

// PI subscribes to this. Returns each pending shutter request with the session
// token to upload the resulting frame to.
export const pendingCaptures = query({
  args: { secret: v.string() },
  returns: v.array(v.object({ requestId: v.id('captureRequests'), token: v.string() })),
  handler: async (ctx, { secret }) => {
    assertBooth(secret);
    const pending = await ctx.db
      .query('captureRequests')
      .withIndex('by_status', (q) => q.eq('status', 'pending'))
      .collect();
    const out = [];
    for (const r of pending) {
      const session = await ctx.db.get(r.sessionId);
      if (session) out.push({ requestId: r._id, token: session.token });
    }
    return out;
  },
});

// PI marks a request handled — immediately on claim (to dedupe) and after upload.
export const markCaptured = mutation({
  args: { secret: v.string(), requestId: v.id('captureRequests') },
  returns: v.null(),
  handler: async (ctx, { secret, requestId }) => {
    assertBooth(secret);
    await ctx.db.patch(requestId, { status: 'done' });
    return null;
  },
});
