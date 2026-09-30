import { api } from '@/convex/_generated/api';
import { convexClient, json, publicBase } from '@/lib/kioskServer';
import { makeQr } from '@/lib/qr';

// POST /kiosk/api/session[?demo=1] → { token, shortCode, qr, price }
// Mints a session for one guest. The QR is generated here, not on the iPad:
// the page can't run the qrcode library, and the handoff should never wait.
// `price` is `{ cents, currency }` when Square payments are on (the kiosk then
// locks Start until /kiosk/api/state reports `paid`), or null for a free booth.
export async function POST(request: Request) {
  const base = publicBase(request);

  if (new URL(request.url).searchParams.get('demo') === '1') {
    // The demo walks the pay gate too; the simulated till "pays" a few seconds in.
    return json({ token: 'demo', shortCode: 'PB-DEMO', qr: await makeQr(`${base}/s/demo`), price: { cents: 500, currency: 'USD' } });
  }

  const convex = convexClient();
  if (convex === null) return json({ error: 'NEXT_PUBLIC_CONVEX_URL is not set' }, 500);

  try {
    const [session, payments] = await Promise.all([
      convex.mutation(api.sessions.createSession, {}),
      convex.query(api.payments.config, {}),
    ]);
    return json({
      token: session.token,
      shortCode: session.shortCode,
      qr: await makeQr(`${base}/s/${session.token}`),
      price: payments.priceCents > 0 ? { cents: payments.priceCents, currency: payments.currency } : null,
    });
  } catch (error) {
    console.error('[kiosk] could not start a session:', error);
    return json({ error: 'Could not start a session' }, 502);
  }
}
