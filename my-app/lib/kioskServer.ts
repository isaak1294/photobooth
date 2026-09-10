import { ConvexHttpClient } from 'convex/browser';

// Server-side helpers for the kiosk's /kiosk/api/* route handlers.
//
// The kiosk runs on an iPad mini 3 (iOS 12, Safari 12.1), which can't parse the
// Convex JS client or the Next bundle, so the page is plain HTML that talks
// only to its own origin. These handlers do the Convex calls on its behalf —
// same origin, no CORS, and the old browser never sees modern JS.

export function convexClient(): ConvexHttpClient | null {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  return url ? new ConvexHttpClient(url) : null;
}

// Where the QR should send a guest's phone. NEXT_PUBLIC_BOOTH_PUBLIC_URL wins;
// otherwise the address the kiosk itself reached us on, which on a LAN dev
// server is the machine's IP — exactly what a phone on the same Wi-Fi needs.
export function publicBase(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_BOOTH_PUBLIC_URL;
  if (configured) return configured.replace(/\/$/, '');
  const url = new URL(request.url);
  const proto = request.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '');
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? url.host;
  return `${proto}://${host}`;
}

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}
