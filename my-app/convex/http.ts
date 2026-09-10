import { httpRouter } from 'convex/server';
import { type Infer } from 'convex/values';
import { httpAction } from './_generated/server';
import { internal } from './_generated/api';
import { printStatus } from './printStatus';

const http = httpRouter();

// POST /upload?token=<session token>&burstId=<id>&seq=<n>
// The Pi (or a laptop webcam as the hardware fallback) posts a single frame as
// the raw request body. We store the bytes in Convex file storage, then insert a
// `photos` row via an internal mutation (actions have no ctx.db). Same endpoint
// for both capture paths — keep it working all weekend (demo-plan §4).
//
// `burstId`/`seq` are optional and group a multi-shot run. The Pi uploads a
// burst's frames concurrently, so arrival order is not capture order and
// `_creationTime` cannot be trusted to order a strip's cells — `seq` can.
const upload = httpAction(async (ctx, request) => {
  const params = new URL(request.url).searchParams;
  const token = params.get('token');
  if (!token) {
    return new Response('Missing ?token', { status: 400 });
  }

  const burstId = params.get('burstId') ?? undefined;
  const rawSeq = params.get('seq');
  const seq = rawSeq === null ? undefined : Number(rawSeq);
  if (seq !== undefined && !Number.isInteger(seq)) {
    return new Response('seq must be an integer', { status: 400 });
  }

  const blob = await request.blob();
  if (blob.size === 0) {
    return new Response('Empty body', { status: 400 });
  }

  const storageId = await ctx.storage.store(blob);
  const photoId = await ctx.runMutation(internal.sessions.addPhoto, {
    token,
    storageId,
    burstId,
    seq,
  });
  if (photoId === null) {
    return new Response('Unknown session token', { status: 404 });
  }

  return Response.json({ photoId });
});

http.route({ path: '/upload', method: 'POST', handler: upload });

// POST /print-status  {secret, token, burstId, status, detail?, sheets?, attempts?, error?}
//
// The Pi's Python print agent reports here. It exists so the agent needs NO
// Convex SDK — the Python client is a far less exercised codebase than the JS
// one, and a plain POST over urllib is one less thing to break at a live event.
//
// This is a mirror, not a queue: the print has already happened (or failed) on
// the Pi by the time this lands, and the agent treats a failure here as
// non-fatal. Losing a status POST costs you a phone indicator, never a sheet.
const printStatusRoute = httpAction(async (ctx, request) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response('Body must be JSON', { status: 400 });
  }

  const { secret, token, burstId, status, detail, sheets, attempts, error } = (body ?? {}) as Record<string, unknown>;

  // Fail closed, exactly like captures.assertBooth: an unset BOOTH_SECRET on the
  // deployment must reject every caller rather than accept every caller.
  if (!process.env.BOOTH_SECRET || secret !== process.env.BOOTH_SECRET) {
    return new Response('Invalid booth secret', { status: 401 });
  }
  if (typeof token !== 'string' || typeof burstId !== 'string') {
    return new Response('token and burstId are required', { status: 400 });
  }
  if (!isPrintStatus(status)) {
    return new Response(`status must be one of: ${PRINT_STATUSES.join(', ')}`, { status: 400 });
  }

  const jobId = await ctx.runMutation(internal.printJobs.upsertFromAgent, {
    token,
    burstId,
    status,
    detail: typeof detail === 'string' ? detail : undefined,
    sheets: typeof sheets === 'number' ? sheets : undefined,
    attempts: typeof attempts === 'number' ? attempts : undefined,
    error: typeof error === 'string' ? error : undefined,
  });
  if (jobId === null) {
    return new Response('Unknown session token', { status: 404 });
  }

  return Response.json({ jobId });
});

// A runtime copy of the printStatus union, since a validator can't be queried at
// runtime. The two assertions below pin it to the validator in BOTH directions:
// `satisfies` rejects a literal that isn't a real status, and `_covers` fails to
// compile if a status is ever added to printStatus.ts and forgotten here. So the
// endpoint can't silently start rejecting a status the agent legitimately sends.
type PrintStatusValue = Infer<typeof printStatus>;
const PRINT_STATUSES = [
  'queued',
  'composing',
  'printing',
  'printed',
  'blocked',
  'failed',
] as const satisfies readonly PrintStatusValue[];
const _covers: (typeof PRINT_STATUSES)[number] = null as unknown as PrintStatusValue;
void _covers;

function isPrintStatus(value: unknown): value is PrintStatusValue {
  return typeof value === 'string' && (PRINT_STATUSES as readonly string[]).includes(value);
}

http.route({ path: '/print-status', method: 'POST', handler: printStatusRoute });

export default http;
