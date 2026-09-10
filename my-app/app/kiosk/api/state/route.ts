import { api } from '@/convex/_generated/api';
import { convexClient, json } from '@/lib/kioskServer';

// GET /kiosk/api/state?token= → { capture, photos }
// Polled by the page while a shot is in flight — it stands in for the live
// subscription the other surfaces use. Only the latest capture's lifecycle and
// the photo URLs, in capture order.
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token');
  if (!token) return json({ error: 'Missing token' }, 400);

  const convex = convexClient();
  if (convex === null) return json({ error: 'NEXT_PUBLIC_CONVEX_URL is not set' }, 500);

  try {
    const session = await convex.query(api.sessions.getSession, { token });
    if (session === null) return json({ error: 'Unknown session' }, 404);
    return json({
      capture: session.capture
        ? { requestId: session.capture.requestId, status: session.capture.status, error: session.capture.error }
        : null,
      photos: session.photos.map((photo) => photo.url).filter((url): url is string => url !== null),
    });
  } catch (error) {
    console.error('[kiosk] state poll failed:', error);
    return json({ error: 'Could not read the session' }, 502);
  }
}
