import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { IDENTITY_SUFFIX } from './identity';

// The style buttons the phone shows. Ordered, and `active` lets you hide one
// that stops looking good on your team's faces without deleting the row.
// Pass the session token to also get that session's custom themes — presets
// (no sessionId) are global, derived themes are visible only to their session.
export const listStyles = query({
  args: { token: v.optional(v.string()) },
  returns: v.array(
    v.object({
      _id: v.id('styles'),
      name: v.string(),
      order: v.number(),
      custom: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    const session = args.token
      ? await ctx.db
          .query('sessions')
          .withIndex('by_token', (q) => q.eq('token', args.token!))
          .unique()
      : null;

    const styles = await ctx.db.query('styles').collect();
    return styles
      .filter((s) => s.active)
      .filter((s) => s.sessionId === undefined || (session !== null && s.sessionId === session._id))
      .sort((a, b) => a.order - b.order)
      .map((s) => ({ _id: s._id, name: s.name, order: s.order, custom: s.sessionId !== undefined }));
  },
});

// Convenience seeder for the demo — run once from the dashboard or
// `npx convex run styles:seedStyles`. Idempotent: clears existing styles first
// so re-running while you tune prompts doesn't pile up duplicates. Prompts are
// placeholders; tune them against your real faces + light during the bake-off.
export const seedStyles = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    // Only clear the presets — session-scoped custom themes belong to guests.
    const existing = await ctx.db.query('styles').collect();
    for (const s of existing) {
      if (s.sessionId === undefined) await ctx.db.delete('styles', s._id);
    }

    // Each prompt describes only the LOOK; the shared IDENTITY_SUFFIX
    // (identity.ts) carries the people-preservation rules, so the presets and
    // derived custom themes always enforce the same ones.
    const seeds = [
      {
        name: 'Professional',
        prompt:
          'Retouch this photo into a polished professional studio portrait: clean flattering soft lighting, subtle business attire, crisp editorial color, LinkedIn-quality.' +
          IDENTITY_SUFFIX,
        order: 0,
      },
      {
        name: 'Ghibli',
        prompt:
          'Transform this photo into a hand-painted Studio Ghibli style anime illustration: soft watercolor shading, warm cinematic light, gentle painterly background.' +
          IDENTITY_SUFFIX,
        order: 1,
      },
      {
        name: 'Vintage',
        prompt:
          'Transform this into a heavily stylized 1970s vintage photograph: strong warm amber-orange color cast, heavily faded low-contrast film look, coarse visible film grain, light leaks and a pronounced soft vignette, period wardrobe in earthy 70s tones. Nostalgic, unmistakably retro and exaggerated.' +
          IDENTITY_SUFFIX,
        order: 2,
      },
      {
        name: 'Valentine',
        prompt:
          'Transform this into a romantic Valentine’s Day themed photo: soft warm pink-and-red color palette, dreamy glowing light, floating heart-shaped bokeh, delicate rose petals and subtle hearts in the background, tender romantic mood.' +
          IDENTITY_SUFFIX,
        order: 3,
      },
    ];
    for (const s of seeds) await ctx.db.insert('styles', { ...s, active: true });
    return null;
  },
});
