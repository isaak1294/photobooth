import { ConvexError, v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { captureStatus, ACTIVE_CAPTURE_STATUSES } from './captureStatus';

// PHONE/KIOSK -> writes the shutter signal. Called by the Take Picture button.
// Rejects if this session already has a capture in flight, so a double-tap (or
// two phones on the same session) can't queue overlapping shots. The whole
// handler is one Convex transaction, so the read-then-insert is atomic.
//
// Rejections are ConvexError, not Error: a production deployment redacts a
// plain Error to "Server Error" before it reaches the client, and the kiosk
// operator standing at the table needs to read the actual reason.
export const requestCapture = mutation({
  args: {
    token: v.string(),
    // Multi-shot run metadata, minted on the phone at press time. The phone
    // fires shots one at a time, so it is the only participant that knows the
    // set exists — the Pi needs `seq`/`framesTotal` to recognise the final frame
    // and kick off the local print.
    burstId: v.optional(v.string()),
    seq: v.optional(v.number()),
    framesTotal: v.optional(v.number()),
    // Strip theme key from the kiosk's picker. Validated to a short slug: it
    // ends up in a filename-adjacent JSON job on the Pi and in a log line.
    theme: v.optional(v.string()),
  },
  returns: v.id('captureRequests'),
  handler: async (ctx, { token, burstId, seq, framesTotal, theme }) => {
    if (theme !== undefined && !/^[a-z0-9-]{1,32}$/.test(theme)) throw new ConvexError('Invalid theme');
    const session = await ctx.db
      .query('sessions')
      .withIndex('by_token', (q) => q.eq('token', token))
      .unique();
    if (session === null) throw new ConvexError('Unknown session token');

    const existing = await ctx.db
      .query('captureRequests')
      .withIndex('by_session', (q) => q.eq('sessionId', session._id))
      .collect();
    if (existing.some((r) => ACTIVE_CAPTURE_STATUSES.includes(r.status))) {
      throw new ConvexError('A capture is already in progress for this session');
    }

    return await ctx.db.insert('captureRequests', {
      sessionId: session._id,
      status: 'pending',
      updatedAt: Date.now(),
      ...(burstId !== undefined ? { burstId } : {}),
      ...(seq !== undefined ? { seq } : {}),
      ...(framesTotal !== undefined ? { framesTotal } : {}),
      ...(theme !== undefined ? { theme } : {}),
    });
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
// token to upload the resulting frame to. Once the Pi advances a request past
// `pending` (to counting_down) it drops out of here — that's the claim.
export const pendingCaptures = query({
  args: { secret: v.string() },
  returns: v.array(
    v.object({
      requestId: v.id('captureRequests'),
      token: v.string(),
      // The Pi files frames on local disk under the session, and needs a stable
      // directory name that isn't the secret-bearing token.
      sessionId: v.id('sessions'),
      // Burst metadata, passed straight through. When `seq === framesTotal - 1`
      // and framesTotal is a full strip, the Pi drops a print job on local disk
      // as soon as that frame is written — before it uploads anything.
      burstId: v.union(v.string(), v.null()),
      seq: v.union(v.number(), v.null()),
      framesTotal: v.union(v.number(), v.null()),
      theme: v.union(v.string(), v.null()),
      // When the request was written. A request that sat pending while the Pi
      // was offline is not a guest still standing there — the listener expires
      // it rather than shooting it.
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx, { secret }) => {
    assertBooth(secret);
    const pending = await ctx.db
      .query('captureRequests')
      .withIndex('by_status', (q) => q.eq('status', 'pending'))
      .collect();
    const out = [];
    for (const r of pending) {
      const session = await ctx.db.get('sessions', r.sessionId);
      if (session) {
        out.push({
          requestId: r._id,
          token: session.token,
          sessionId: session._id,
          burstId: r.burstId ?? null,
          seq: r.seq ?? null,
          framesTotal: r.framesTotal ?? null,
          theme: r.theme ?? null,
          createdAt: r._creationTime,
        });
      }
    }
    return out;
  },
});

// PI -> drives the capture through its lifecycle. Device-authenticated. The Pi
// should only send `complete` after the frame has uploaded successfully, and
// `failed` (with a short, safe message) on any capture/upload error.
export const updateCaptureStatus = mutation({
  args: {
    secret: v.string(),
    requestId: v.id('captureRequests'),
    status: captureStatus,
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { secret, requestId, status, error }) => {
    assertBooth(secret);
    const request = await ctx.db.get('captureRequests', requestId);
    if (request === null) throw new Error('Unknown capture request');

    // Store a bounded error string so a caller can't stuff the doc with a huge
    // payload; default a generic message on failure so the phone never shows a
    // blank error.
    const safeError = error !== undefined ? error.slice(0, 300) : status === 'failed' ? 'Capture failed' : undefined;

    await ctx.db.patch('captureRequests', requestId, {
      status,
      updatedAt: Date.now(),
      ...(safeError !== undefined ? { error: safeError } : {}),
    });
    return null;
  },
});
