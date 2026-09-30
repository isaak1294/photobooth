import { ConvexError } from 'convex/values';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { convexClient, publicBase } from '@/lib/kioskServer';
import { parsePosCallback } from '@/lib/squarePos';

// GET /pay/callback?data=… (iOS) | ?com.squareup.pos.*=… (Android)
//
// Where Square POS sends the phone's browser after a charge. A route handler,
// not a page: the work happens server-side before any HTML, so nothing depends
// on client state surviving the app switch. Whatever happens, the operator
// ends up back on /pay with a banner.
//
// This is the registered Web Callback URL. Its path is part of the Square
// Developer Console config — rename it there too or every charge dead-ends.
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const base = publicBase(request);
  const back = (q: Record<string, string>) => Response.redirect(`${base}/pay?${new URLSearchParams(q)}`, 302);

  const parsed = parsePosCallback(url.searchParams);
  if (parsed === null) return back({ result: 'failed', error: 'not_a_square_callback' });
  const sessionId = parsed.state;
  if (!sessionId) return back({ result: 'failed', error: 'missing_state' });

  const convex = convexClient();
  if (convex === null) return back({ result: 'failed', error: 'convex_not_configured' });

  try {
    const outcome = await convex.action(api.payments.recordPosResult, {
      sessionId: sessionId as Id<'sessions'>,
      ok: parsed.ok,
      orderId: parsed.ok ? (parsed.orderId ?? undefined) : undefined,
      clientTransactionId: parsed.ok ? (parsed.clientTransactionId ?? undefined) : undefined,
      errorCode: parsed.ok ? undefined : parsed.errorCode,
    });
    const q: Record<string, string> = { result: outcome.status, code: outcome.shortCode };
    if (outcome.status === 'failed' && !parsed.ok) q.error = parsed.errorCode;
    return back(q);
  } catch (error) {
    console.error('[pay] could not record the Square result:', error);
    const reason = error instanceof ConvexError ? String(error.data) : 'verify_failed';
    return back({ result: 'failed', error: reason });
  }
}
