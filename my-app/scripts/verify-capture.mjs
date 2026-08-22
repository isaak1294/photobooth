// End-to-end check of the capture pipeline, with no frontend involved.
//
// Drives exactly what a booth or phone UI drives — createSession, then
// requestCapture — then watches the Pi do its work and proves the frame really
// landed: a photos row exists, its URL resolves, and the bytes are a real JPEG
// of a believable size. If this passes, any UI built on getSession will work.
//
// Usage (from my-app/):
//   node scripts/verify-capture.mjs
//   CONVEX_URL=https://<name>.convex.cloud node scripts/verify-capture.mjs
//
// Reads CONVEX_URL, or falls back to NEXT_PUBLIC_CONVEX_URL in .env.local.

import { readFile } from 'node:fs/promises';

const TIMEOUT_MS = 60_000;
const POLL_MS = 1000;
// A 1920x1080 JPEG is hundreds of KB. Anything tiny means we stored an error
// page, a truncated upload, or a placeholder — all of which would otherwise
// look like success.
const MIN_PLAUSIBLE_BYTES = 10_000;

const url = await resolveConvexUrl();
console.log(`deployment: ${url}\n`);

let failures = 0;
const step = (ok, label, detail = '') => {
  if (!ok) failures++;
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
};

// 1. A session, exactly as a booth does on load.
const session = await call('mutation', 'sessions:createSession', {});
step(Boolean(session?.token), 'created a session', session?.shortCode);
if (!session?.token) finish();
const { token } = session;

// 2. The shutter signal. This is the whole of what a UI's button does.
const requestId = await call('mutation', 'captures:requestCapture', { token });
step(Boolean(requestId), 'wrote a captureRequest', 'the Pi should pick this up');

// 3. Watch the Pi work. Statuses come from the listener as it goes, so a stall
//    tells you which stage broke rather than just "it timed out".
console.log('\n  waiting for the Pi…');
const startedAt = Date.now();
let seen = new Set();
let photo = null;
let captureError = null;

while (Date.now() - startedAt < TIMEOUT_MS) {
  const state = await call('query', 'sessions:getSession', { token });
  const status = state?.capture?.status;

  if (status && !seen.has(status)) {
    seen.add(status);
    console.log(`    ${((Date.now() - startedAt) / 1000).toFixed(1)}s  ${status}`);
  }
  if (state?.capture?.error) captureError = state.capture.error;
  if (state?.photos?.length) {
    photo = state.photos[state.photos.length - 1];
    break;
  }
  if (status === 'failed') break;
  await new Promise((r) => setTimeout(r, POLL_MS));
}

console.log('');
if (!seen.size) {
  step(false, 'the Pi never claimed the request', 'listener not running, or BOOTH_SECRET mismatch');
} else {
  step(true, 'the Pi claimed the request', [...seen].join(' → '));
}
step(Boolean(photo), 'a photos row appeared', captureError ?? (photo ? '' : 'nothing uploaded'));

// 4. The row is only half of it — the bytes have to actually be retrievable,
//    which is what any UI will do with the url field.
if (photo) {
  step(Boolean(photo.url), 'the row resolves to a URL', photo.url ?? 'url was null');

  if (photo.url) {
    const res = await fetch(photo.url);
    const type = res.headers.get('content-type') ?? '';
    const bytes = Buffer.from(await res.arrayBuffer());
    // ff d8 ff is the JPEG magic number — proves it's an image, not an error body.
    const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;

    step(res.ok, 'the URL is fetchable', `HTTP ${res.status}`);
    step(type.startsWith('image/'), 'served as an image', type || 'no content-type');
    step(isJpeg, 'the bytes are a real JPEG');
    step(bytes.length >= MIN_PLAUSIBLE_BYTES, 'plausible size', `${bytes.length.toLocaleString()} bytes`);
  }
}

finish();

function finish() {
  const ok = failures === 0;
  console.log(`\n${ok ? 'PASS' : 'FAIL'} — the pipeline ${ok ? 'works' : 'is broken'}.`);
  if (ok) console.log('Any frontend reading sessions:getSession will see this photo.');
  process.exit(ok ? 0 : 1);
}

// The public HTTP API, so this needs no Convex client and no login.
async function call(kind, path, args) {
  const res = await fetch(`${url}/api/${kind}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, args, format: 'json' }),
  });
  const body = await res.json();
  if (body.status !== 'success') {
    console.error(`\n  ✗ ${path} failed: ${body.errorMessage ?? JSON.stringify(body)}`);
    process.exit(1);
  }
  return body.value;
}

async function resolveConvexUrl() {
  if (process.env.CONVEX_URL) return process.env.CONVEX_URL.replace(/\/+$/, '');
  const env = await readFile(new URL('../.env.local', import.meta.url), 'utf8').catch(() => '');
  const match = env.match(/^NEXT_PUBLIC_CONVEX_URL=(.+)$/m);
  if (!match) {
    console.error('No CONVEX_URL set and none found in .env.local.');
    process.exit(1);
  }
  return match[1].trim().replace(/\/+$/, '');
}
