---
name: square-pos
description: Square Point of Sale API + Square Reader payments for this photobooth. Use whenever work touches Square, the POS API, the Reader, charging a guest, marking a session paid, the /pay surface, the pay callback, Orders/Payments/Refunds lookups, or Square webhooks. Read this before the target files — it encodes hard constraints (iPadOS 17.1 floor, no sandbox, Safari-only callback) that the code can't tell you.
---

# Square POS API + Reader for the photobooth

The Point of Sale (POS) API is a **deep link into the Square Point of Sale app**. Our
page builds a URL, the device opens Square POS, the operator taps the card on the
Square Reader (paired to the POS app over Bluetooth), and Square POS opens our
callback URL with the result. We never touch card data and never talk to the
Reader directly. Everything money-related that is *ours* is: build the URL, catch
the callback, **verify server-side with the Orders API**, and flip a session to
paid in Convex.

Reference files (read on demand, not up front):

- `reference/pos-api.md` — URL formats, every field, callback shapes, error codes, iOS + Android.
- `reference/verify.md` — Orders API lookup, amount/location checks, webhooks (HMAC), refunds, REST via `fetch`.
- `reference/photobooth-plan.md` — where this lands in *this* repo: schema, routes, kiosk gating, env vars, test plan.

## Hard constraints (verified 2026-09-30)

1. **Square POS requires iOS/iPadOS 17.1+.** The kiosk iPad mini 3 is on iOS 12.3 and
   can never run it. So the device that charges is a **separate phone/iPad** (or Android)
   running Square POS + the Reader. The kiosk only *observes* "paid" via Convex.
2. **Same device.** The page that launches `square-commerce-v1://` must be on the same
   device as the Square POS app. You cannot launch POS on device A and have device B pay.
3. **Callback lands in Safari (iOS) / the browser (Android), as a GET.** `callback_url`
   must be HTTPS and must exactly match the "Web Callback URL" registered in the
   Developer Console under *Point of Sale API*. A Home-Screen web app does NOT get the
   callback back — Safari opens instead. Run the pay page in plain Safari/Chrome.
4. **No Sandbox for the POS API.** Test with production credentials, a real card
   (your own), small amounts, and refund afterwards (Dashboard or Refunds API).
5. **Never trust the callback alone.** It arrives as URL query params from a browser;
   anyone can forge it. `transaction_id` == a Square **Order ID**. Retrieve the order
   server-side and check `state`, `location_id`, `total_money`, and the tenders before
   marking anything paid. Consume each order id once.
6. **Cash can't be verified.** A cash tender returns only `client_transaction_id`, which
   is not an order id. Either don't offer `CASH` in `supported_tender_types`, or record
   it as `unverified` and let the operator device be the trust anchor.
7. **Secrets live on the Convex deployment** (`npx convex env set`), never in
   `NEXT_PUBLIC_*` and never in the pay page. Only the Application ID is public.

## The flow we build

```
operator device (iOS 17.1+ / Android, Square POS + Reader)
  /pay ── tap "Charge PB-4821" ──► square-commerce-v1://payment/create?data=…
                                        │  (state = session token)
        ◄── GET /pay/callback?data={…} ─┘  Square POS auto-returns
  /pay/callback (Next route handler, server)
      → convex.action(api.payments.recordPosResult, {...})
          → GET https://connect.squareup.com/v2/orders/{transaction_id}
          → checks pass → internal mutation upserts payments row {status:'paid'}
      → 302 /pay?result=paid&code=PB-4821

kiosk iPad (iOS 12, unchanged hardware)
  idle screen polls /kiosk/api/state → { paid: true } → Start button unlocks
```

## Minimal iOS launch (mobile web)

```js
var data = {
  amount_money: { amount: String(priceCents), currency_code: 'USD' }, // smallest unit, as a string
  callback_url: origin + '/pay/callback',   // must equal the registered Web Callback URL
  client_id: SQUARE_APPLICATION_ID,         // public; production app id
  version: '1.3',
  state: sessionToken,                      // echoed back verbatim — our correlation key
  notes: 'Photobooth ' + shortCode,         // shows on the Square receipt + Dashboard
  location_id: SQUARE_LOCATION_ID,          // optional; forces the location
  options: {
    supported_tender_types: ['CREDIT_CARD'], // add 'CASH' only if you accept unverified
    auto_return: true,
    skip_receipt: false,
  },
};
window.location.href = 'square-commerce-v1://payment/create?data=' + encodeURIComponent(JSON.stringify(data));
```

Callback on iOS: `GET callback_url?data=<percent-encoded JSON>` with
`{ status: 'ok'|'error', transaction_id?, client_transaction_id?, error_code?, state? }`.
Android uses an `intent:` URL and returns flat `com.squareup.pos.*` params — see `reference/pos-api.md`.

## Gotchas that bite

- If Square POS isn't installed the `square-commerce-v1://` navigation silently does nothing
  on iOS. Set a `setTimeout` fallback (~1.5 s) that shows "Install/open Square POS".
- The operator must be **logged in** to Square POS and have taken it through first-run
  before the first API charge, or you get `not_logged_in` / `user_not_active`.
- `amount` is a **string of the smallest unit** on iOS (`"500"` = $5.00), an integer on Android.
- The callback page can be reloaded or opened twice: make the recording mutation
  idempotent on `squareOrderId`.
- A dropped callback (operator backgrounded Safari) is why the plan has an optional
  `payment.updated` webhook as a second path — same verification, same mutation.
- `Square-Version` header: pin one explicitly from the versioning docs; don't invent a date.
- The Orders API needs `ORDERS_READ` (and `PAYMENTS_READ` for the Payments API, `PAYMENTS_WRITE`
  for refunds). A personal production access token from the same app has all of these.

## Checklist before saying "payments work"

- [ ] Developer Console: app created, **production** Application ID copied, Web Callback URL set to `https://<host>/pay/callback`.
- [ ] Convex env: `SQUARE_ACCESS_TOKEN`, `SQUARE_LOCATION_ID`, `SQUARE_PRICE_CENTS` (and `SQUARE_WEBHOOK_SIGNATURE_KEY` if webhooks).
- [ ] Next env: `NEXT_PUBLIC_SQUARE_APPLICATION_ID`; the pay device reaches the app over **HTTPS** (deployed host or a tunnel — `http://192.168.x.x:3000` cannot be a callback URL).
- [ ] Pay device: iOS 17.1+/Android, Square POS installed + logged in, Reader paired inside Square POS, page opened in Safari/Chrome (not Home Screen).
- [ ] Real $1 charge → session flips paid on the kiosk within one poll → refunded from Dashboard.
- [ ] Forged callback with a made-up `transaction_id` → 404 from Orders API → session stays unpaid.
- [ ] Replayed callback → second call is a no-op, not a second payment row.
