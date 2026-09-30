# Landing Square payments in this repo

> **Status (2026-09-30): implemented on branch `pos-api-integration`.** Files: `convex/schema.ts` (payments
> table), `convex/paymentConfig.ts`, `convex/payments.ts`, `convex/sessions.ts` (`paid`), `convex/captures.ts` (gate),
> `lib/squarePos.ts`, `app/pay/page.tsx`, `app/pay/callback/route.ts`, `app/kiosk/api/{session,state}/route.ts`,
> `public/kiosk.js`. Two deviations from the sketch below: the POS `state` carries the **session id**, not the
> token (a token opens the gallery; an id opens nothing), and the operator list is `payments.recentSessions`,
> which returns the 8 newest sessions with their payment state rather than filtering to unpaid ones.

Where each piece goes, following the conventions already here (kiosk talks only to `/kiosk/api/*`,
secrets on the Convex deployment, every failure path writes a visible reason, Safari-12 JS on the kiosk).

## Decision: separate pay device, kiosk observes

The kiosk iPad (iOS 12) can't run Square POS (needs 17.1+). So:

- **`/pay`** — new React page in `my-app/app/pay/page.tsx`, opened in Safari/Chrome on the
  operator's phone/iPad that has Square POS + the Reader. Subscribes to Convex, lists open
  unpaid sessions by short code (the kiosk shows its code in the top-right chip), one big
  "Charge $X · PB-4821" button per session. Tapping builds the POS URL with `state = token`.
- **`/pay/callback`** — `my-app/app/pay/callback/route.ts`, a server GET handler. Parses the
  Square result (see `pos-api.md` parser), calls the Convex action, then `302 → /pay?result=…`.
  Being a route handler (not a page) means no client JS has to survive the app switch.
- **Kiosk** — unchanged hardware. `/kiosk/api/state` gains `paid`; the idle screen polls it and
  keeps the Start button disabled with "Pay at the counter" until `paid` is true.

If the kiosk is ever moved to an iPadOS 17.1+ device, the same `/pay` code can run *on the kiosk*
in Safari — but then the kiosk page must be Safari, not Home-Screen, and must rebuild its state
from Convex on every load, since the callback reloads it. Don't do that on day one.

## Convex

### Schema (`my-app/convex/schema.ts`)

```ts
payments: defineTable({
  sessionId: v.id('sessions'),
  status: v.union(v.literal('paid'), v.literal('unverified'), v.literal('failed'), v.literal('refunded')),
  amount: v.number(),          // smallest unit
  currency: v.string(),
  tender: v.optional(v.string()),            // 'CARD', 'CASH', …
  squareOrderId: v.optional(v.string()),     // transaction_id; absent for cash
  squarePaymentIds: v.optional(v.array(v.string())),
  clientTransactionId: v.optional(v.string()),
  error: v.optional(v.string()),             // POS error_code or verification failure
  updatedAt: v.number(),
})
  .index('by_session', ['sessionId'])
  .index('by_order', ['squareOrderId']),
```

A session is "paid" iff it has a `payments` row with status `paid` (or `unverified` if cash is
allowed). Don't put a boolean on `sessions`; the row is the audit trail and the idempotency key.

### Functions (`my-app/convex/payments.ts`)

- `config` (query): `{ priceCents, currency, cashAllowed }` from env — so the pay page and the kiosk
  show the same price. Return `priceCents: 0` when `SQUARE_PRICE_CENTS` is unset → payments off.
- `listOpenSessions` (query): sessions created in the last ~2 h with no captured photos and no paid
  row, newest first. That's what `/pay` renders.
- `recordPosResult` (**action**, public): args `{ token, ok, orderId?, clientTransactionId?, errorCode? }`.
  - Look up the session by token (internal query). Unknown → throw `ConvexError`.
  - `ok && orderId` → `verifyPosOrder` (see `verify.md`) with `SQUARE_LOCATION_ID`, `SQUARE_PRICE_CENTS`,
    then `internal.payments.upsert` with `status: 'paid'`. Any verification throw → upsert
    `status: 'failed', error: message` (visible in the dashboard, per project rule) and rethrow.
  - `ok && !orderId` (cash/offline) → `status: 'unverified'` only if `SQUARE_ALLOW_CASH=1`, else `failed`.
  - `!ok` → `status: 'failed', error: errorCode`. `payment_canceled` is expected, not a bug.
  - Public callers can only ever mark paid via a real, completed, correctly-priced order at our
    location whose id hasn't been used — that is the security boundary. No shared secret needed.
- `upsert` (internalMutation): if `squareOrderId` is set and a row with that order id exists for a
  *different* session → throw (replay onto another session). Same session → update. Otherwise insert.
- `getSession` (in `sessions.ts`): add `paid: boolean` to the return validator and handler
  (one indexed query on `payments.by_session`). Both the phone page and the kiosk poll read it.
- `isSessionPaid` (internal query) for `captures.requestCapture`: **also gate the shutter server-side**
  when payments are on — the kiosk button being disabled is UX, not enforcement.

### Env (Convex deployment, `npx convex env set …`)

| Name | Purpose |
|---|---|
| `SQUARE_ACCESS_TOKEN` | production token; Orders read (+ Payments/Refunds if used) |
| `SQUARE_LOCATION_ID` | the booth's location; orders from other locations are rejected |
| `SQUARE_PRICE_CENTS` | e.g. `500`; unset/0 = payments disabled everywhere |
| `SQUARE_CURRENCY` | default `USD` |
| `SQUARE_ALLOW_CASH` | `1` to accept unverified cash tenders |
| `SQUARE_WEBHOOK_SIGNATURE_KEY` | only with the webhook route |

Next (`.env.local`): `NEXT_PUBLIC_SQUARE_APPLICATION_ID`. Document it in `.env.local.example`.

## Next.js

### `app/pay/page.tsx` ('use client')

- `useQuery(api.payments.config)` and `useQuery(api.payments.listOpenSessions)`.
- Detect platform: `/iPad|iPhone|iPod/.test(ua)` → iOS URL; `/Android/.test(ua)` → intent URL;
  otherwise show "Open this on the Square device".
- On tap: `sessionStorage.setItem('pos:pending', token)`; set a 1500 ms timer that shows
  "Square POS didn't open — is it installed and signed in?"; then `window.location.href = url`.
  Clear the timer on `pagehide`/`visibilitychange` (the app switch fires them).
- Read `?result=paid|failed&code=…&error=…` from the callback redirect and toast it.
- `callback_url` must be `https://<public host>/pay/callback` — compute from `window.location.origin`
  and assert it starts with `https://`; show a loud error otherwise (LAN http will never work).

### `app/pay/callback/route.ts`

```ts
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const url = new URL(request.url);
  const result = parsePosCallback(url.searchParams);
  const back = (q: Record<string, string>) => Response.redirect(new URL('/pay?' + new URLSearchParams(q), url), 302);
  if (result === null) return back({ result: 'failed', error: 'not_a_square_callback' });
  const token = result.state ?? '';
  const convex = convexClient();
  if (convex === null || !token) return back({ result: 'failed', error: 'misconfigured' });
  try {
    const paid = await convex.action(api.payments.recordPosResult, {
      token, ok: result.ok,
      orderId: result.ok ? result.orderId ?? undefined : undefined,
      clientTransactionId: result.ok ? result.clientTransactionId ?? undefined : undefined,
      errorCode: result.ok ? undefined : result.errorCode,
    });
    return back({ result: paid.status, code: paid.shortCode });
  } catch (error) {
    console.error('[pay] record failed:', error);
    return back({ result: 'failed', error: error instanceof ConvexError ? String(error.data) : 'verify_failed' });
  }
}
```

`convexClient()` is the existing helper in `lib/kioskServer.ts`; reuse it.

### Kiosk (`app/kiosk/api/state/route.ts`, `public/kiosk.js`, `app/kiosk/route.ts`)

- `state` response: add `paid: session.paid` and `price: config.priceCents` (or fold price into
  `session` POST). Zero price → kiosk behaves exactly as today.
- `kiosk.js` (ES2017 only, no `?.`, no `??`): in `boot()`, after the session is minted, if
  `price > 0` set the start title to `'Pay at the counter · $5'`, keep `disabled`, and start
  `timers.pay = setInterval(pollPaid, 2000)`; `pollPaid` hits `getState` and on `paid` clears the
  interval, enables Start, sets title `'Take Photos'`. Clear `timers.pay` in `clearTimers()`.
  Stop polling when `run` starts. Demo mode (`?demo=1`) reports `paid: true` after ~3 s.
- Run the acorn `ecmaVersion: 2017` check on `kiosk.js` after editing (README).
- `route.ts`: nothing else changes; prices are not rendered server-side because the price is Convex env.

### Optional: `convex/http.ts` `/square-webhook`

Only after the callback path works. Validate signature (see `verify.md`), handle
`payment.updated` with `status === 'COMPLETED'` → find the session via `payment.note`
(`'Photobooth PB-4821'`) or a pending row keyed by order id → same `upsert`. Return 200 always
after validation; log and swallow lookup misses so Square stops retrying.

## Test plan (no sandbox exists)

1. Deploy or tunnel so the app has an HTTPS origin the pay device can reach; register
   `https://<origin>/pay/callback` in the Developer Console.
2. `SQUARE_PRICE_CENTS=100`. Kiosk shows "Pay at the counter · $1", Start disabled.
3. On the pay device: `/pay` → tap the session → Square POS → tap your own card on the Reader →
   returns to `/pay?result=paid` → kiosk unlocks within 2 s. Dashboard shows the sale with note.
4. Curl the callback with a fake `transaction_id` → `/pay?result=failed&error=…`, `payments` row
   `failed` with the Orders 404 in `error`, kiosk still locked.
5. Re-open the real callback URL from Safari history → no new row, still `paid`.
6. Cancel in Square POS → `payment_canceled` row, kiosk still locked, no crash.
7. Refund the $1 from the Dashboard. (Optionally handle `refund.updated` later to flip `refunded`.)
8. Unset `SQUARE_PRICE_CENTS` → kiosk back to free mode, `/pay` says payments are off.
