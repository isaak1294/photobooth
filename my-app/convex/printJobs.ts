import { v } from 'convex/values';
import { internalMutation } from './_generated/server';
import { printStatus } from './printStatus';

// Called by the /print-status HTTP action, which the Pi's Python print agent
// POSTs to. Upserts by `burstId` so a retried POST (the agent retries a couple
// of times over flaky venue Wi-Fi) updates the row rather than duplicating it.
//
// Internal: printing is driven entirely on the Pi. Nothing in the app — and no
// client — may write these rows.
export const upsertFromAgent = internalMutation({
  args: {
    token: v.string(),
    burstId: v.string(),
    status: printStatus,
    detail: v.optional(v.string()),
    sheets: v.optional(v.number()),
    attempts: v.optional(v.number()),
    error: v.optional(v.string()),
  },
  returns: v.union(v.id('printJobs'), v.null()),
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query('sessions')
      .withIndex('by_token', (q) => q.eq('token', args.token))
      .unique();
    if (session === null) return null;

    // Bound the strings so a runaway CUPS reason can't stuff the document.
    const detail = args.detail?.slice(0, 300);
    const error = args.error?.slice(0, 300);

    const existing = await ctx.db
      .query('printJobs')
      .withIndex('by_burst', (q) => q.eq('burstId', args.burstId))
      .unique();

    if (existing !== null) {
      // A print that already reached paper stays printed. Status POSTs can
      // arrive out of order after a reconnect, and re-opening a terminal job
      // would put a finished sheet back on the phone as "printing…".
      if (existing.status === 'printed') return existing._id;

      await ctx.db.patch('printJobs', existing._id, {
        status: args.status,
        updatedAt: Date.now(),
        ...(detail !== undefined ? { detail } : {}),
        ...(args.sheets !== undefined ? { sheets: args.sheets } : {}),
        ...(args.attempts !== undefined ? { attempts: args.attempts } : {}),
        ...(error !== undefined ? { error } : {}),
      });
      return existing._id;
    }

    return await ctx.db.insert('printJobs', {
      sessionId: session._id,
      burstId: args.burstId,
      status: args.status,
      sheets: args.sheets ?? 1,
      attempts: args.attempts ?? 0,
      updatedAt: Date.now(),
      ...(detail !== undefined ? { detail } : {}),
      ...(error !== undefined ? { error } : {}),
    });
  },
});
