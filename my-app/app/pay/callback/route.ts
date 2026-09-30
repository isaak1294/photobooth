import { ConvexError } from 'convex/values';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { convexClient, publicBase } from '@/lib/kioskServer';
import { decodePosState, parsePosCallback } from '@/lib/squarePos';

// GET /pay/callback?data=… (iOS) | ?com.squareup.pos.*=… (Android)
//
// Where Square POS sends the browser after a charge — from the operator's
// phone (/pay) or from the kiosk itself (/kiosk on an iPad that runs Square
// POS). The `state` we sent says which; the browser is sent back to that
// surface with ?result=. A route handler, not a page: the work happens
// server-side before any HTML, so nothing depends on client state surviving
// the app switch.
//
// This is the ONE registered Web Callback URL. Its path is part of the Square
// Developer Console config — rename it there too or every charge dead-ends.
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const base = publicBase(request);
  const redirect = (path: string, q: Record<string, string>) =>
    Response.redirect(`${base}${path}?${new URLSearchParams(q)}`, 302);

  const parsed = parsePosCallback(url.searchParams);
  if (parsed === null) return redirect('/pay', { result: 'failed', error: 'not_a_square_callback' });
  const state = decodePosState(parsed.state);
  if (state === null) return redirect('/pay', { result: 'failed', error: 'missing_state' });

  // Where to land, and the query that reconstructs that surface.
  const back = (q: Record<string, string>) => {
    if (state.surface === 'kiosk') {
      const kioskQuery: Record<string, string> = { resume: state.token, shots: String(state.shots), ...q };
      if (state.theme) kioskQuery.theme = state.theme;
      return redirect('/kiosk', kioskQuery);
    }
    return redirect('/pay', q);
  };

  const convex = convexClient();
  if (convex === null) return back({ result: 'failed', error: 'convex_not_configured' });

  try {
    let sessionId: Id<'sessions'>;
    if (state.surface === 'kiosk') {
      // The kiosk only knows its token; the action wants the id.
      const session = await convex.query(api.sessions.getSession, { token: state.token });
      if (session === null) return back({ result: 'failed', error: 'unknown_session' });
      sessionId = session.sessionId;
    } else {
      sessionId = state.sessionId as Id<'sessions'>;
    }

    const outcome = await convex.action(api.payments.recordPosResult, {
      sessionId,
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
