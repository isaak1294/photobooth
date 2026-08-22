import { v } from 'convex/values';
import { mutation, query } from './_generated/server';

// The style buttons the phone shows. Ordered, and `active` lets you hide one
// that stops looking good on your team's faces without deleting the row.
export const listStyles = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id('styles'),
      name: v.string(),
      order: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const styles = await ctx.db.query('styles').collect();
    return styles
      .filter((s) => s.active)
      .sort((a, b) => a.order - b.order)
      .map((s) => ({ _id: s._id, name: s.name, order: s.order }));
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
    const existing = await ctx.db.query('styles').collect();
    for (const s of existing) await ctx.db.delete(s._id);

    // Prompts are written to be people-count- and composition-agnostic: they
    // apply to everyone in the frame and preserve the original framing/number of
    // people, so they work whether the booth captures one person or a group.
    const seeds = [
      {
        name: 'Professional',
        prompt:
          'Retouch this photo into a polished professional studio portrait: clean flattering soft lighting, subtle business attire, crisp editorial color, LinkedIn-quality. Apply to everyone in the frame. Preserve the original composition, framing, poses, and the exact same faces, features, hair, and identity of every person — do not change who anyone is or how many people are in the photo.',
        order: 0,
      },
      {
        name: 'Ghibli',
        prompt:
          'Transform this photo into a hand-painted Studio Ghibli style anime illustration: soft watercolor shading, warm cinematic light, gentle painterly background. Keep every person’s facial features, expression, and hairstyle so each one is clearly and immediately recognizable as themselves. Preserve the original composition, framing, and the number of people.',
        order: 1,
      },
      {
        name: 'Vintage',
        prompt:
          'Transform this into a heavily stylized 1970s vintage photograph: strong warm amber-orange color cast, heavily faded low-contrast film look, coarse visible film grain, light leaks and a pronounced soft vignette, period wardrobe in earthy 70s tones. Apply to everyone in the frame. Nostalgic, unmistakably retro and exaggerated. Keep every person’s exact face, features, and hair so all are clearly recognizable, and preserve the original composition, framing, and number of people.',
        order: 2,
      },
      {
        name: 'Valentine',
        prompt:
          'Transform this into a romantic Valentine’s Day themed photo: soft warm pink-and-red color palette, dreamy glowing light, floating heart-shaped bokeh, delicate rose petals and subtle hearts in the background, tender romantic mood. Apply to everyone in the frame. Keep every person’s exact face, features, and hair so all are clearly recognizable, and preserve the original composition, framing, and number of people.',
        order: 3,
      },
    ];
    for (const s of seeds) await ctx.db.insert('styles', { ...s, active: true });
    return null;
  },
});
