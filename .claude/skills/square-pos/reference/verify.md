# Verifying a POS API result server-side, webhooks, refunds

Source: developer.squareup.com/docs/pos-api/payments-integration, /docs/webhooks/step3validate,
/reference/square/orders-api/retrieve-order. Checked 2026-09-30.

## The mapping

`transaction_id` (iOS) / `SERVER_TRANSACTION_ID` (Android) **is an Order ID**.
`GET /v2/orders/{id}` → `Order`. `order.tenders[]` each carry a `payment_id` → Payments API.
Cash tenders in Square POS produce no order id (only `client_transaction_id`); they cannot be verified.

## REST with `fetch` (no SDK)

Convex actions run in a V8 isolate; plain `fetch` avoids the Node-only SDK (`"use node"`) entirely.

```ts
const SQUARE_API = 'https://connect.squareup.com/v2';
// Pin a real version from https://developer.squareup.com/docs/build-basics/versioning-overview.
// Omitting the header uses the app's default version from the Developer Console, which is fine to start.
const SQUARE_VERSION: string | undefined = undefined;

async function square(path: string, init: RequestInit = {}) {
  const token = process.env.SQUARE_ACCESS_TOKEN;
  if (!token) throw new Error('SQUARE_ACCESS_TOKEN is not set on the deployment');
  const res = await fetch(SQUARE_API + path, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(SQUARE_VERSION ? { 'Square-Version': SQUARE_VERSION } : {}),
      ...(init.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = Array.isArray(body.errors) ? body.errors.map((e: any) => `${e.category}/${e.code}: ${e.detail ?? ''}`).join('; ') : res.statusText;
    throw new Error(`Square ${res.status} on ${path}: ${detail}`);
  }
  return body;
}
```

## The check

```ts
type Verified = { orderId: string; paymentIds: string[]; amount: number; currency: string; tender: string };

export async function verifyPosOrder(orderId: string, expect: { amountCents: number; currency: string; locationId: string }): Promise<Verified> {
  const { order } = await square(`/orders/${encodeURIComponent(orderId)}`); // 404 → forged/unknown id
  if (order.state !== 'COMPLETED') throw new Error(`order state ${order.state}`);
  if (order.location_id !== expect.locationId) throw new Error('order belongs to another location');
  const total = order.total_money ?? {};
  if (total.currency !== expect.currency || Number(total.amount) < expect.amountCents) {
    throw new Error(`order total ${total.amount} ${total.currency} < expected ${expect.amountCents}`);
  }
  const tenders: any[] = order.tenders ?? [];
  const paid = tenders.filter((t) => t.type !== 'CARD' || t.card_details?.status === 'CAPTURED');
  if (paid.length === 0) throw new Error('no captured tender on order');
  return {
    orderId: order.id,
    paymentIds: paid.map((t) => t.payment_id).filter(Boolean),
    amount: Number(total.amount),
    currency: total.currency,
    tender: paid.map((t) => t.type).join('+'),
  };
}
```

Notes:
- The order is normally readable immediately after the callback; if you ever see a 404 right
  after a real charge, retry once after ~1 s before calling it forged.
- `total_money` includes tax/tip if the seller has those on; hence `>=`, not `===`.
- Scope needed: `ORDERS_READ`. A personal access token has it.

## Webhooks (optional second path)

Why: the browser callback can be lost (operator switched apps, Safari killed). A
`payment.updated` webhook with `payment.status === 'COMPLETED'` and `payment.order_id` lets the
server mark the session paid anyway — but only if we can map order → session. Put the session
short code in `notes` (it becomes `payment.note`), or write the pending order/`state` pair first.

Signature: header `x-square-hmacsha256-signature` = base64(HMAC-SHA256(key, notificationUrl + rawBody)).
The notification URL must be the exact subscription URL (our Convex site URL + path).

```ts
// convex/http.ts — Convex runtime has WebCrypto; no SDK needed.
async function squareSignatureValid(rawBody: string, header: string | null, notificationUrl: string) {
  const key = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
  if (!key || !header) return false;
  const cryptoKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(notificationUrl + rawBody));
  const expected = btoa(String.fromCharCode(...new Uint8Array(sig)));
  if (expected.length !== header.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ header.charCodeAt(i);
  return diff === 0;
}
```

Read the body with `await request.text()` **before** any JSON parsing — the signature covers the
raw bytes. Return 200 quickly; Square retries non-2xx.

Subscribe in the Developer Console → Webhooks → add `payment.created`, `payment.updated`;
copy the **Signature Key** to Convex env.

## Refunds

`POST /v2/refunds` with `{ idempotency_key, payment_id, amount_money: { amount, currency }, reason }`.
`payment_id` comes from `order.tenders[].payment_id`. Scope `PAYMENTS_WRITE`. For test charges
during development, refunding from the Square Dashboard is fine.

## Payments API (if you need more than the order)

`GET /v2/payments/{payment_id}` → `status` (`COMPLETED`), `amount_money`, `card_details.card.last_4`,
`receipt_url`, `note`. Scope `PAYMENTS_READ`. `receipt_url` is a nice thing to show the operator.
