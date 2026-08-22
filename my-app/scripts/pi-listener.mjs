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

const setStatus = (requestId, status, error) =>
  client.mutation(anyApi.captures.updateCaptureStatus, { secret: SECRET, requestId, status, error });

// rpicam-jpeg needs EXCLUSIVE access to the sensor. `inFlight` dedupes by
// requestId, but it can't stop two *different* requests from overlapping: the
// subscription re-fires while a shot is still running, and that callback starts
// its own capture. Two concurrent shots make both fail — "Pipeline handler in
// use by another process" and "Failed to start streaming: Broken pipe". Funnel
// every capture through one promise chain so they queue instead of racing.
let cameraChain = Promise.resolve();
function withCamera(job) {
  const result = cameraChain.then(job, job);
  // Swallow into the chain only — a failed shot must not wedge the queue, but
  // the caller still sees its own rejection.
  cameraChain = result.then(
    () => {},
    () => {},
  );
  return result;
}

client.onUpdate(anyApi.captures.pendingCaptures, { secret: SECRET }, async (rows) => {
  for (const { requestId, token } of rows) {
    if (inFlight.has(requestId)) continue;
    inFlight.add(requestId);
    try {
      // Advancing past `pending` also claims it (drops it from pendingCaptures),
      // so a re-fired subscription won't double-shoot.
      await setStatus(requestId, 'counting_down');
      // Start the camera DURING the countdown: rpicam's -t is preview/AE settle
      // time, so the sensor warms up while the phone shows 3-2-1 and the shutter
      // fires right as the count ends — instead of a second 3s wait after
      // "Smile!". (If a previous shot still holds the camera, withCamera queues
      // this one and the shutter lands late; that only happens on overlapping
      // requests, which the phone doesn't produce.)
      const shot = withCamera(() => capturePhoto(requestId));
      await countdown();
      await setStatus(requestId, 'capturing');
      const bytes = await shot;
      await setStatus(requestId, 'uploading');
      await uploadPhoto(token, bytes);
      // Only mark complete AFTER the upload succeeded.
      await setStatus(requestId, 'complete');
      console.log(`✅ complete for ${token}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await setStatus(requestId, 'failed', msg).catch(() => {});
      console.error('capture failed:', msg);
    } finally {
      inFlight.delete(requestId);
    }
  }
});

// Pre-shutter pause, for a surface that has no countdown of its own (the phone's
// Take Picture button). The BOOTH runs its own 3-2-1 on screen before the
// request is ever written, so counting again here just adds dead air after the
// number hits 1 — set COUNTDOWN_MS=0 when the booth is the shutter.
const COUNTDOWN_MS = Number(process.env.COUNTDOWN_MS ?? 3000);

async function countdown() {
  if (COUNTDOWN_MS <= 0) return;
  await new Promise((r) => setTimeout(r, COUNTDOWN_MS));
}

async function capturePhoto(requestId) {
  // The real camera command. On Raspberry Pi OS (Bookworm): rpicam-jpeg
  // (older releases: libcamera-jpeg). 1080p is plenty — smaller frames also
  // render faster on GMI.
  // The -t (preview before shooting) is timed to the countdown: the camera is
  // started as counting_down begins, warms up through it, and fires ~500ms
  // after the phone's count hits zero. With no countdown (booth-as-shutter,
  // COUNTDOWN_MS=0) keep >=1s so auto-exposure still settles.
  // Per-request path: a shared /tmp/frame.jpg would let a queued shot read the
  // previous frame's bytes if anything ever overlapped.
  const warmupMs = Math.max(1000, COUNTDOWN_MS + 500);
  const path = `/tmp/frame-${requestId}.jpg`;
  await execFileP('rpicam-jpeg', ['-o', path, '-t', String(warmupMs), '--width', '1920', '--height', '1080', '-n']);
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
