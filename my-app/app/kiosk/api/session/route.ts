import { api } from '@/convex/_generated/api';
import { convexClient, json, publicBase } from '@/lib/kioskServer';
import { makeQr } from '@/lib/qr';

// POST /kiosk/api/session[?demo=1] {resume?, prepaid?, key?} → { token, shortCode, qr, price, paid, resumed }
// Mints a session for one guest. The QR is generated here, not on the iPad:
// the page can't run the qrcode library, and the handoff should never wait.
// `price` is `{ cents, currency }` when Square payments are on, or null for a
// free booth. `paid` is whether this session may shoot already.
//
// `resume: <token>` re-adopts an existing session instead of minting one: the
// kiosk comes back from Square POS as a fresh page load (/kiosk?resume=…) and
// must pick up the guest it was serving. An unknown token mints a new session
// and says `resumed: false`, so a stale URL can't leave the kiosk stuck.
//
// `prepaid: true` (from /prepaid-kiosk) mints a session that shoots without a
// Square payment. When KIOSK_PREPAID_KEY is set here and on Convex, `key` must
// match it — checked here first so a bad key never reaches the deployment.
export async function POST(request: Request) {
  const base = publicBase(request);
  const body = (await request.json().catch(() => ({}))) as { resume?: unknown; prepaid?: unknown; key?: unknown };
  const resume = typeof body.resume === 'string' && /^[0-9a-f-]{36}$|^demo$/.test(body.resume) ? body.resume : null;
  const prepaid = body.prepaid === true;
  const key = typeof body.key === 'string' ? body.key : undefined;
  if (prepaid && process.env.KIOSK_PREPAID_KEY && key !== process.env.KIOSK_PREPAID_KEY) {
    return json({ error: 'Wrong kiosk key' }, 403);
  }

  if (new URL(request.url).searchParams.get('demo') === '1') {
    // The demo walks the pay gate too; the simulated Square app "pays" on tap.
    return json({
      token: 'demo',
      shortCode: 'PB-DEMO',
      qr: await makeQr(`${base}/s/demo`),
      price: prepaid ? null : { cents: 500, currency: 'USD' },
      paid: prepaid,
      resumed: resume === 'demo',
    });
  }

  const convex = convexClient();
  if (convex === null) return json({ error: 'NEXT_PUBLIC_CONVEX_URL is not set' }, 500);

  try {
    const payments = await convex.query(api.payments.config, {});
    // A prepaid kiosk never shows a price: its sessions are paid by definition.
    const price =
      payments.priceCents > 0 && !prepaid ? { cents: payments.priceCents, currency: payments.currency } : null;

    if (resume !== null) {
      const existing = await convex.query(api.sessions.getSession, { token: resume });
      if (existing !== null) {
        return json({
          token: resume,
          shortCode: existing.shortCode,
          qr: await makeQr(`${base}/s/${resume}`),
          price,
          paid: existing.paid,
          resumed: true,
        });
      }
    }

    const session = await convex.mutation(api.sessions.createSession, prepaid ? { prepaid: true, key } : {});
    return json({
      token: session.token,
      shortCode: session.shortCode,
      qr: await makeQr(`${base}/s/${session.token}`),
      price,
      paid: price === null,
      resumed: false,
    });
  } catch (error) {
    console.error('[kiosk] could not start a session:', error);
    return json({ error: 'Could not start a session' }, 502);
  }
}
