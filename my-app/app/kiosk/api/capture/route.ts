import { api } from '@/convex/_generated/api';
import { convexClient, json } from '@/lib/kioskServer';

// POST /kiosk/api/capture { token } → { requestId }
// The shutter. Same mutation the phone calls; it rejects if this session already
// has a capture in flight, which surfaces here as a 409 the page can show.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { token?: unknown };
  if (typeof body.token !== 'string' || body.token === '') return json({ error: 'Missing token' }, 400);

  const convex = convexClient();
  if (convex === null) return json({ error: 'NEXT_PUBLIC_CONVEX_URL is not set' }, 500);

  try {
    const requestId = await convex.mutation(api.captures.requestCapture, { token: body.token });
    return json({ requestId });
  } catch (error) {
    console.error('[kiosk] capture request failed:', error);
    return json({ error: error instanceof Error ? error.message : 'Capture request failed' }, 409);
  }
}
