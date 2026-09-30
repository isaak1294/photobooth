# Point of Sale API — technical reference (mobile web + native)

Source: developer.squareup.com/docs/pos-api/{how-it-works,build-mobile-web,web-technical-reference,build-on-ios}. Checked 2026-09-30.

## What it is / isn't

- A deep link into the installed **Square Point of Sale app** on the same device. Square POS
  does the charge (with the Reader, or keyed/cash) and returns to a callback URL.
- Works from **native iOS/Android** (SDK / Intent) and from **mobile web** (URL scheme / intent URL).
- **No Sandbox.** Production credentials only.
- Not the Terminal API (that's for the Square Terminal device, driven server-side) and not the
  Mobile Payments SDK (native in-app Reader control; needs Expo prebuild, not Expo Go). POS API
  is the only option that works from a plain web page.

## Developer Console setup

1. Create an application → copy the **production Application ID** (public, goes in the page).
2. Left panel → **Point of Sale API** → *Web* section → **Web Callback URL** = exact HTTPS URL our
   callback route lives at. Must match `callback_url` byte-for-byte (scheme, host, path).
3. Copy a **production access token** (for Orders/Payments/Refunds lookups, server-side only).
4. Location ID: Dashboard → Locations, or `GET /v2/locations`.

## iOS (mobile web)

```
square-commerce-v1://payment/create?data=<percent-encoded JSON>
```

### `data` object

| Field | Type | Req | Notes |
|---|---|---|---|
| `amount_money.amount` | string | yes | Smallest currency unit, **as a string** (`"500"` = $5.00) |
| `amount_money.currency_code` | string | yes | e.g. `USD` |
| `callback_url` | string | yes | HTTPS; must equal the registered Web Callback URL |
| `client_id` | string | yes | Application ID |
| `version` | string | yes | `"1.3"` |
| `options.supported_tender_types` | string[] | yes | `CREDIT_CARD`, `CASH`, `OTHER`, `SQUARE_GIFT_CARD`, `CARD_ON_FILE`, `PAYPAY` |
| `options.auto_return` | bool | no | `true` → POS switches back to callback automatically |
| `options.skip_receipt` | bool | no | default false |
| `options.clear_default_fees` | bool | no | default false |
| `location_id` | string | no | Forces the transaction onto that location |
| `state` | string | no | Echoed back verbatim in the response → put the session token here |
| `notes` | string | no | Saved to Dashboard, printed on receipts |
| `customer_id` | string | no | Links to a Customer; needs network on the POS device |

### iOS callback

Square POS opens `callback_url?data=<percent-encoded JSON>` in Safari (GET).

| Field | Present when |
|---|---|
| `status` | always — `"ok"` or `"error"` |
| `transaction_id` | success, online, non-cash — **this is an Order ID** |
| `client_transaction_id` | success — device-minted id; the only id for cash/offline |
| `error_code` | error |
| `state` | when sent in the request |

### iOS error codes

`amount_invalid_format`, `amount_too_large`, `amount_too_small`, `could_not_perform`,
`currency_code_mismatch`, `currency_code_missing`, `customer_management_not_supported`,
`data_invalid`, `invalid_customer_id`, `invalid_tender_type`, `no_network_connection`,
`not_logged_in`, `payment_canceled`, `unsupported_api_version`, `unsupported_currency_code`,
`unsupported_tender_type`, `user_id_mismatch`, `user_not_active`,
`client_not_authorized_for_user` (deprecated).

Human copy worth having: `payment_canceled` → "Cancelled in Square", `not_logged_in` →
"Sign in to Square POS first", `no_network_connection` → "POS device is offline",
anything else → show the code.

## Android (mobile web)

```
intent:#Intent;action=com.squareup.pos.action.CHARGE;package=com.squareup;
  S.com.squareup.pos.WEB_CALLBACK_URI=<url>;
  S.com.squareup.pos.CLIENT_ID=<app id>;
  S.com.squareup.pos.API_VERSION=v2.0;
  i.com.squareup.pos.TOTAL_AMOUNT=<int, smallest unit>;
  S.com.squareup.pos.CURRENCY_CODE=USD;
  S.com.squareup.pos.TENDER_TYPES=com.squareup.pos.TENDER_CARD;
  S.com.squareup.pos.REQUEST_METADATA=<session token>;   (echoed back — the "state")
  S.com.squareup.pos.NOTE=<note>;
  S.com.squareup.pos.LOCATION_ID=<id>;
  l.com.squareup.pos.AUTO_RETURN_TIMEOUT_MS=3200;         (3200..10000)
  S.browser_fallback_url=<url if POS not installed>;
end
```

Tender types: `TENDER_CARD`, `TENDER_CARD_ON_FILE`, `TENDER_CASH`, `TENDER_OTHER`, `TENDER_PAYPAY`
(comma-delimited, all prefixed `com.squareup.pos.`).

Callback: flat query params on `WEB_CALLBACK_URI`:
`com.squareup.pos.SERVER_TRANSACTION_ID` (the Order ID), `com.squareup.pos.CLIENT_TRANSACTION_ID`,
`com.squareup.pos.REQUEST_METADATA`, `com.squareup.pos.ERROR_CODE`, `com.squareup.pos.ERROR_DESCRIPTION`.

Android error codes: `CUSTOMER_MANAGEMENT_NOT_SUPPORTED`, `DISABLED`, `ILLEGAL_LOCATION_ID`,
`INVALID_CUSTOMER_ID`, `INVALID_REQUEST`, `NO_EMPLOYEE_LOGGED_IN`, `NO_NETWORK`, `NO_RESULT`,
`TRANSACTION_ALREADY_IN_PROGRESS`, `TRANSACTION_CANCELED`, `UNAUTHORIZED_CLIENT_ID`, `UNEXPECTED`,
`UNSUPPORTED_API_VERSION`, `UNSUPPORTED_WEB_API_VERSION`, `USER_NOT_ACTIVATED`, `USER_NOT_LOGGED_IN`.

## One parser for both platforms

```ts
export type PosResult =
  | { ok: true; orderId: string | null; clientTransactionId: string | null; state: string | null }
  | { ok: false; errorCode: string; state: string | null };

export function parsePosCallback(params: URLSearchParams): PosResult | null {
  const raw = params.get('data');
  if (raw !== null) {
    // iOS
    let d: Record<string, unknown>;
    try { d = JSON.parse(raw); } catch { return { ok: false, errorCode: 'data_invalid', state: null }; }
    const state = typeof d.state === 'string' ? d.state : null;
    if (d.status === 'ok') {
      return {
        ok: true,
        orderId: typeof d.transaction_id === 'string' ? d.transaction_id : null,
        clientTransactionId: typeof d.client_transaction_id === 'string' ? d.client_transaction_id : null,
        state,
      };
    }
    return { ok: false, errorCode: typeof d.error_code === 'string' ? d.error_code : 'unknown', state };
  }
  const p = (k: string) => params.get('com.squareup.pos.' + k);
  if (p('SERVER_TRANSACTION_ID') || p('CLIENT_TRANSACTION_ID') || p('ERROR_CODE')) {
    // Android
    const state = p('REQUEST_METADATA');
    const err = p('ERROR_CODE');
    if (err) return { ok: false, errorCode: err, state };
    return { ok: true, orderId: p('SERVER_TRANSACTION_ID'), clientTransactionId: p('CLIENT_TRANSACTION_ID'), state };
  }
  return null; // not a Square callback
}
```

## Native iOS (only if we ever ship the Expo app as the pay device)

- `SquarePointOfSaleSDK` (CocoaPods/Carthage/SPM). `Info.plist`: `LSApplicationQueriesSchemes` →
  `square-commerce-v1`; register our own `CFBundleURLTypes` scheme for the return.
- Build an `SCCAPIRequest` (callbackURL, `SCCMoney`, notes, `userInfoString` = state, tender types),
  handle the response in `application:openURL:options:` with `SCCAPIResponse`.
- In Expo this means a config plugin + prebuild; not Expo Go. The web flow above needs none of that.
