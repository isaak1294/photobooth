import { ConvexError } from 'convex/values';
import { api } from '@/convex/_generated/api';
import { convexClient, json } from '@/lib/kioskServer';

// POST /kiosk/api/capture { token, burstId, seq, framesTotal } → { requestId }
// The shutter. Same mutation the phone calls; it rejects if this session already
// has a capture in flight, which surfaces here as a 409 the page can show.
//
// The burst fields are what make the kiosk PRINT: the Pi listener drops a print
// job on its local spool when it writes frame seq === framesTotal - 1 of a
// 4-frame burst (scripts/pi-listener.mjs, maybeDropPrintJob). A request without
// them is a plain single capture and never reaches the printer.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    token?: unknown;
    burstId?: unknown;
    seq?: unknown;
    framesTotal?: unknown;
    theme?: unknown;
  };
  if (typeof body.token !== 'string' || body.token === '') return json({ error: 'Missing token' }, 400);
  const burst =
    typeof body.burstId === 'string' && Number.isInteger(body.seq) && Number.isInteger(body.framesTotal)
      ? { burstId: body.burstId, seq: body.seq as number, framesTotal: body.framesTotal as number }
      : {};
  const theme = typeof body.theme === 'string' && /^[a-z0-9-]{1,32}$/.test(body.theme) ? { theme: body.theme } : {};

  const convex = convexClient();
  if (convex === null) return json({ error: 'NEXT_PUBLIC_CONVEX_URL is not set' }, 500);

  try {
    const requestId = await convex.mutation(api.captures.requestCapture, { token: body.token, ...burst, ...theme });
    return json({ requestId });
  } catch (error) {
    console.error('[kiosk] capture request failed:', error);
    // ConvexError carries the mutation's real reason through a production
    // deployment; anything else was redacted to "Server Error" upstream.
    const reason =
      error instanceof ConvexError
        ? String(error.data)
        : error instanceof Error
          ? error.message
          : 'Capture request failed';
    return json({ error: reason }, 409);
  }
}
