// Demo mode for UI work: every screen renders with a simulated booth, so no
// Convex deployment, Pi, or camera is needed. Enable with `npm run nobooth`
// (which sets NEXT_PUBLIC_NOBOOTH=1). Inlined at build time, so the whole app
// consistently runs in one mode or the other.
export const NOBOOTH = process.env.NEXT_PUBLIC_NOBOOTH === '1';
