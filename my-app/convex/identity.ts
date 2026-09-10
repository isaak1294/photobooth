// The one identity-preservation clause every render prompt ends with — the
// seeded presets (styles.ts) and derived custom themes (themes.ts) both append
// it, so tuning it here tunes every style at once. (Presets bake it in at seed
// time: re-run `npx convex run styles:seedStyles` after changing it.)
//
// History: the face/hair language survived a 4-person identity test; the
// expression clause was added after renders invented smiles with shrunken
// teeth, and the no-new-people clause after themes conjured extra guests.
export const IDENTITY_SUFFIX =
  ' Apply the theme to everyone in the frame. Keep every person’s exact face, features, and hair so all are clearly recognizable, and keep each person’s natural expression exactly as captured — never alter anyone’s mouth, teeth, or smile, and never give anyone an expression they did not have in the original photo. Preserve the original composition, framing, and number of people: never add new people or faces, unless the theme itself calls for a large anonymous background crowd (a stadium, a packed street) kept distant and indistinct so no added face is recognizable.';
