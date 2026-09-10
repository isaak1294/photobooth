import { api } from '@/convex/_generated/api';
import { convexClient, json, publicBase } from '@/lib/kioskServer';
import { makeQr } from '@/lib/qr';

// POST /kiosk/api/session[?demo=1] → { token, shortCode, qr }
// Mints a session for one guest. The QR is generated here, not on the iPad:
// the page can't run the qrcode library, and the handoff should never wait.
export async function POST(request: Request) {
  const base = publicBase(request);

  if (new URL(request.url).searchParams.get('demo') === '1') {
    return json({ token: 'demo', shortCode: 'PB-DEMO', qr: await makeQr(`${base}/s/demo`) });
  }

  const convex = convexClient();
  if (convex === null) return json({ error: 'NEXT_PUBLIC_CONVEX_URL is not set' }, 500);

  try {
    const session = await convex.mutation(api.sessions.createSession, {});
    return json({
      token: session.token,
      shortCode: session.shortCode,
      qr: await makeQr(`${base}/s/${session.token}`),
    });
  } catch (error) {
    console.error('[kiosk] could not start a session:', error);
    return json({ error: 'Could not start a session' }, 502);
  }
}
