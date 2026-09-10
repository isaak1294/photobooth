// Runs ON THE PI. Subscribes to Convex for capture requests and, for each one,
// takes a photo, saves it to durable local storage, and uploads it.
// Outbound-only — the Pi never accepts an inbound connection, so it works behind
// venue Wi-Fi / a phone hotspot / NAT.
//
// Flow: phone taps Take Photos -> captures.requestCapture writes a `pending`
// row -> this subscription fires -> we claim it (advance status, to dedupe) ->
// shoot -> save to disk -> POST the frame to /upload -> it appears on the phone.
//
// PRINTING. A strip is four frames, and the phone fires them ONE AT A TIME
// (press -> shot -> "Got it!" -> next shot), so each arrives as its own capture
// request. The phone stamps every request with {burstId, seq, framesTotal}; when
// we write the frame with seq === framesTotal - 1 of a full strip, we drop a job
// file into the local print spool. The Python print agent picks it up from there.
//
// The print path is deliberately LOCAL AND OFFLINE: composition and CUPS both
// run on this Pi against files already on this disk. No cloud round trip, no GMI,
// no dependency on the upload succeeding. Venue Wi-Fi can die mid-event and
// strips keep coming out; the uploads simply queue up and drain when it returns.
// So the spool drop happens BEFORE the upload, never after.
//
// Env:
//   CONVEX_URL       the deployment URL   (NEXT_PUBLIC_CONVEX_URL from .env.local)
//   CONVEX_SITE_URL  the HTTP actions URL (NEXT_PUBLIC_CONVEX_SITE_URL)
//   BOOTH_SECRET     shared secret; must match the Convex `BOOTH_SECRET` env var
//   BOOTH_SPOOL_DIR  optional, default /var/lib/booth
//   COUNTDOWN_MS     optional, default 3000 (the frontend owns the countdown, so
//                    the Pi runbook sets this to 0)
//   BOOTH_SHUTTER / BOOTH_GAIN / BOOTH_AWBGAINS
//                    optional 3A locks — see the note above buildCameraArgs()
//
// Run on the Pi:
//   CONVEX_URL=... CONVEX_SITE_URL=... BOOTH_SECRET=... node scripts/pi-listener.mjs

import { ConvexClient } from 'convex/browser';
import { anyApi } from 'convex/server';
import { execFile } from 'node:child_process';
import { open, mkdir, rename, readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

const CONVEX_URL = process.env.CONVEX_URL;
const SITE_URL = process.env.CONVEX_SITE_URL;
const SECRET = process.env.BOOTH_SECRET;
if (!CONVEX_URL || !SITE_URL || !SECRET) {
  console.error('Set CONVEX_URL, CONVEX_SITE_URL and BOOTH_SECRET.');
  process.exit(1);
}

// Must equal StripLayout.photos in photobooth_print.py. build_strip() raises if
// it gets fewer, so a burst of any other length is a plain capture run and never
// produces a print job.
const STRIP_FRAMES = 4;

const SPOOL_ROOT = process.env.BOOTH_SPOOL_DIR ?? '/var/lib/booth';
const SESSIONS_DIR = path.join(SPOOL_ROOT, 'sessions');
const PENDING_DIR = path.join(SPOOL_ROOT, 'spool', 'pending');

const client = new ConvexClient(CONVEX_URL);
const inFlight = new Set();

// pendingCaptures returns EVERY request still marked pending — including ones
// written while this listener was down (a reboot, a setup session, a bad
// BOOTH_SECRET). Those guests are long gone. Shooting the backlog anyway is
// worse than useless: each stale row costs a shutter cycle plus an upload, the
// camera fires at nobody, and a real press queues behind all of it until the
// kiosk's watchdog gives up and says the photo didn't take. So anything older
// than this is failed with a reason instead of shot.
const STALE_REQUEST_MS = Number(process.env.STALE_REQUEST_MS ?? 45_000);

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
  for (const row of rows) {
    const { requestId, token } = row;
    if (inFlight.has(requestId)) continue;
    inFlight.add(requestId);
    try {
      const age = Date.now() - row.createdAt;
      if (age > STALE_REQUEST_MS) {
        console.warn(`⏭  expiring request ${requestId}: ${Math.round(age / 1000)}s old, nobody is waiting`);
        await setStatus(requestId, 'failed', 'Expired before the booth saw it');
        continue;
      }

      // Advancing past `pending` also claims it (drops it from pendingCaptures),
      // so a re-fired subscription won't double-shoot.
      await setStatus(requestId, 'counting_down');
      // Start the camera DURING the countdown: rpicam's -t is preview/AE settle
      // time, so the sensor warms up while the phone shows 3-2-1 and the shutter
      // fires right as the count ends — instead of a second 3s wait after
      // "Smile!". (If a previous shot still holds the camera, withCamera queues
      // this one and the shutter lands late; that only happens on overlapping
      // requests, which the phone doesn't produce.)
      const framePath = frameDestination(row);
      const shot = withCamera(() => capturePhoto(framePath));
      await countdown();
      await setStatus(requestId, 'capturing');
      await shot;

      // The frame is now durable on local disk. If it completes a strip, hand it
      // to the printer NOW — before the upload, which can be slow or fail
      // outright. Paper must never wait on the network.
      await maybeDropPrintJob(row, framePath);

      await setStatus(requestId, 'uploading');
      await uploadPhoto(row, await readFile(framePath));
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

// --------------------------------------------------------------------------
// Durable local storage
// --------------------------------------------------------------------------
// Frames live under <spool>/sessions/<sessionId>/<burstId>/NN.jpg and are NEVER
// deleted by this process. That single directory is doing three jobs at once:
// the print source (the agent composes straight from these paths), the fallback
// when an upload fails, and the post-event archive. Retention is a separate
// sweeper — see pi/README.md.
//
// The old code wrote /tmp/frame-<id>.jpg and unlinked it. On Raspberry Pi OS
// /tmp is tmpfs — RAM — so those frames were not merely temporary, they were
// gone on reboot and unavailable to a print retry.

function frameDestination(row) {
  // A legacy single-shot request carries no burst metadata; give it a directory
  // of its own so it still lands durably.
  const burst = row.burstId ?? `single-${row.requestId}`;
  const seq = row.seq ?? 0;
  return path.join(SESSIONS_DIR, row.sessionId, burst, `${String(seq).padStart(2, '0')}.jpg`);
}

// Write + fsync the file, then fsync its directory. Without the directory sync
// the new entry can survive in page cache but be missing after a power cut, and
// a photo booth gets power-cut by whoever trips over the extension lead.
async function writeDurable(filePath, bytes) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const handle = await open(filePath, 'w');
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await syncDir(path.dirname(filePath));
}

async function syncDir(dirPath) {
  const handle = await open(dirPath, 'r');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

const exists = (p) =>
  access(p).then(
    () => true,
    () => false,
  );

// --------------------------------------------------------------------------
// Camera
// --------------------------------------------------------------------------

// Shots in a strip are seconds apart, and each rpicam-jpeg invocation re-runs
// auto-exposure and auto-white-balance from scratch. Left alone, the four cells
// of one strip visibly drift in brightness and colour — which requirements.md
// HW-8 calls out as a defect ("autofocus hunting between frames of one strip").
//
// So lock 3A for the event. Meter once at the table with the real lighting:
//   rpicam-hello -t 5000 --info-text "%exp %ag %awbg" -n
// then export the values it settles on. Unset means auto, which is fine for
// single shots and wrong for strips.
function buildCameraArgs(outPath, warmupMs) {
  const args = ['-o', outPath, '-t', String(warmupMs), '--width', '1920', '--height', '1080', '-n'];
  if (process.env.BOOTH_SHUTTER) args.push('--shutter', process.env.BOOTH_SHUTTER);
  if (process.env.BOOTH_GAIN) args.push('--gain', process.env.BOOTH_GAIN);
  if (process.env.BOOTH_AWBGAINS) args.push('--awbgains', process.env.BOOTH_AWBGAINS);
  return args;
}

async function capturePhoto(outPath) {
  // The real camera command. On Raspberry Pi OS (Bookworm): rpicam-jpeg
  // (older releases: libcamera-jpeg). 1080p is deliberate and sufficient: a
  // strip cell is 530x350px, so even after the centre-crop to 1.514 the frame
  // is downsampled ~3x. More pixels would only slow the upload and GMI.
  // The -t (preview before shooting) is timed to the countdown: the camera is
  // started as counting_down begins, warms up through it, and fires ~500ms
  // after the phone's count hits zero. With no countdown (booth-as-shutter,
  // COUNTDOWN_MS=0) keep >=1s so auto-exposure still settles.
  const warmupMs = Math.max(1000, COUNTDOWN_MS + 500);
  await mkdir(path.dirname(outPath), { recursive: true });
  await execFileP('rpicam-jpeg', buildCameraArgs(outPath, warmupMs));

  // rpicam wrote the file itself, so re-open it to force it to stable storage.
  const bytes = await readFile(outPath);
  await writeDurable(outPath, bytes);
  return bytes;
}

// --------------------------------------------------------------------------
// Print spool
// --------------------------------------------------------------------------

async function maybeDropPrintJob(row, framePath) {
  const { burstId, seq, framesTotal } = row;
  if (burstId === null || seq === null || framesTotal === null) return;
  // Only a full strip prints. 1x/2x/3x presses are digital-only.
  if (framesTotal !== STRIP_FRAMES) return;
  if (seq !== framesTotal - 1) return;

  // A mid-burst failure aborts the run on the phone, but be defensive: compose
  // only from a complete set, since build_strip() raises on a short one.
  const burstDir = path.dirname(framePath);
  const frames = Array.from({ length: framesTotal }, (_, i) =>
    path.join(burstDir, `${String(i).padStart(2, '0')}.jpg`),
  );
  const present = await Promise.all(frames.map(exists));
  if (present.some((ok) => !ok)) {
    const missing = frames.filter((_, i) => !present[i]);
    console.warn(`skipping print for ${burstId}: incomplete burst, missing ${missing.join(', ')}`);
    return;
  }

  const job = {
    burstId,
    sessionId: row.sessionId,
    // The agent reports status back to Convex with this, so it needs no session
    // lookup of its own — and no Convex SDK.
    token: row.token,
    frames,
    sheets: 1,
    createdAt: Date.now(),
  };

  // Write to a dotfile then rename into place. rename(2) within a directory is
  // atomic, so the agent can never observe a half-written job — and it globs
  // *.json, which the dot-prefixed temp file does not match.
  await mkdir(PENDING_DIR, { recursive: true });
  const finalPath = path.join(PENDING_DIR, `${burstId}.json`);
  const tmpPath = path.join(PENDING_DIR, `.${burstId}.json.tmp`);
  await writeDurable(tmpPath, JSON.stringify(job, null, 2));
  await rename(tmpPath, finalPath);
  await syncDir(PENDING_DIR);
  console.log(`🖨  queued print for burst ${burstId} (${framesTotal} frames)`);
}

// --------------------------------------------------------------------------
// Upload
// --------------------------------------------------------------------------

async function uploadPhoto(row, bytes) {
  const params = new URLSearchParams({ token: row.token });
  // Frames of one burst can land out of order, so the strip's cell order has to
  // travel with the bytes rather than be inferred from _creationTime.
  if (row.burstId !== null) params.set('burstId', row.burstId);
  if (row.seq !== null) params.set('seq', String(row.seq));

  const res = await fetch(`${SITE_URL}/upload?${params}`, {
    method: 'POST',
    headers: { 'Content-Type': 'image/jpeg' },
    body: bytes,
  });
  if (!res.ok) throw new Error(`upload ${res.status}: ${await res.text()}`);
}

console.log(`Booth listener running. Frames -> ${SESSIONS_DIR}, print jobs -> ${PENDING_DIR}`);
