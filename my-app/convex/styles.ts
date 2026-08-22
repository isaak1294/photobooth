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

    const seeds = [
      { name: '80s Yearbook', prompt: 'A 1980s high-school yearbook portrait, soft studio lighting, laser background, keep the exact same face and identity.', order: 0 },
      { name: 'Renaissance', prompt: 'An oil-painting Renaissance portrait in the style of a classical master, keep the exact same face and identity.', order: 1 },
      { name: 'Cyberpunk', prompt: 'A neon cyberpunk portrait, rain-slick city at night, cinematic rim light, keep the exact same face and identity.', order: 2 },
    ];
    for (const s of seeds) await ctx.db.insert('styles', { ...s, active: true });
    return null;
  },
});
