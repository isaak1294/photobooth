// Runs ON THE PI. Subscribes to Convex for capture requests and, for each one,
// takes a photo and uploads it. Outbound-only — the Pi never accepts an inbound
// connection, so it works behind venue Wi-Fi / a phone hotspot / NAT.
//
// Flow: phone taps Take Picture -> captures.requestCapture writes a `pending`
// row -> this subscription fires -> we claim it (mark done, to dedupe) -> shoot
// -> POST the frame to /upload?token=... -> it appears on phone + booth.
//
// Env (all required):
//   CONVEX_URL       the deployment URL   (NEXT_PUBLIC_CONVEX_URL from .env.local)
//   CONVEX_SITE_URL  the HTTP actions URL (NEXT_PUBLIC_CONVEX_SITE_URL)
//   BOOTH_SECRET     shared secret; must match the Convex `BOOTH_SECRET` env var
//
// Run on the Pi:
//   CONVEX_URL=... CONVEX_SITE_URL=... BOOTH_SECRET=... node scripts/pi-listener.mjs

import { ConvexClient } from 'convex/browser';
import { anyApi } from 'convex/server';
import { execFile } from 'node:child_process';
import { readFile, unlink } from 'node:fs/promises';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

const CONVEX_URL = process.env.CONVEX_URL;
const SITE_URL = process.env.CONVEX_SITE_URL;
const SECRET = process.env.BOOTH_SECRET;
if (!CONVEX_URL || !SITE_URL || !SECRET) {
  console.error('Set CONVEX_URL, CONVEX_SITE_URL and BOOTH_SECRET.');
  process.exit(1);
}

const client = new ConvexClient(CONVEX_URL);
const inFlight = new Set();

client.onUpdate(anyApi.captures.pendingCaptures, { secret: SECRET }, async (rows) => {
  for (const { requestId, token } of rows) {
    if (inFlight.has(requestId)) continue;
    inFlight.add(requestId);
    try {
      // Claim first so a re-fired subscription doesn't double-shoot.
      await client.mutation(anyApi.captures.markCaptured, { secret: SECRET, requestId });
      const bytes = await capturePhoto();
      await uploadPhoto(token, bytes);
      console.log(`✅ captured + uploaded for ${token}`);
    } catch (err) {
      console.error('capture failed:', err);
    } finally {
      inFlight.delete(requestId);
    }
  }
});

async function capturePhoto() {
  // The real camera command. On Raspberry Pi OS (Bookworm): rpicam-jpeg
  // (older releases: libcamera-jpeg). Add your 3-2-1 countdown + light around
  // this call. 1080p is plenty — smaller frames also render faster on GMI.
  const path = '/tmp/frame.jpg';
  await execFileP('rpicam-jpeg', ['-o', path, '-t', '3000', '--width', '1920', '--height', '1080', '-n']);
  const bytes = await readFile(path);
  await unlink(path).catch(() => {});
  return bytes;
}

async function uploadPhoto(token, bytes) {
  const res = await fetch(`${SITE_URL}/upload?token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'image/jpeg' },
    body: bytes,
  });
  if (!res.ok) throw new Error(`upload ${res.status}: ${await res.text()}`);
}

console.log('Booth listener running. Waiting for capture requests…');
