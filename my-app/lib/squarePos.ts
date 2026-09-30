// Square Point of Sale API, mobile-web flavour. Pure functions shared by the
// /pay page (builds the deep link) and /pay/callback (parses the return).
// Reference: .claude/skills/square-pos/reference/pos-api.md
//
// The page that opens one of these URLs must be on the same device as the
// Square POS app, in a real browser tab (not a Home-Screen web app: the
// callback always opens in Safari/Chrome, and would land outside the app).

export type PosCharge = {
  applicationId: string;
  amountCents: number;
  currency: string;
  // Must equal, byte for byte, the Web Callback URL registered in the Square
  // Developer Console (Point of Sale API → Web). HTTPS only.
  callbackUrl: string;
  // Echoed back untouched — our correlation key (the session id).
  state: string;
  // Shows on the Square receipt and in the Dashboard.
  note: string;
  locationId?: string;
  allowCash: boolean;
};

export function iosPosUrl(c: PosCharge): string {
  const data = {
    amount_money: { amount: String(c.amountCents), currency_code: c.currency },
    callback_url: c.callbackUrl,
    client_id: c.applicationId,
    version: '1.3',
    state: c.state,
    notes: c.note,
    ...(c.locationId ? { location_id: c.locationId } : {}),
    options: {
      supported_tender_types: c.allowCash ? ['CREDIT_CARD', 'CASH'] : ['CREDIT_CARD'],
      auto_return: true,
      skip_receipt: false,
    },
  };
  return 'square-commerce-v1://payment/create?data=' + encodeURIComponent(JSON.stringify(data));
}

export function androidPosUrl(c: PosCharge): string {
  const tenders = ['com.squareup.pos.TENDER_CARD', ...(c.allowCash ? ['com.squareup.pos.TENDER_CASH'] : [])];
  const parts = [
    'action=com.squareup.pos.action.CHARGE',
    'package=com.squareup',
    'S.com.squareup.pos.WEB_CALLBACK_URI=' + encodeURIComponent(c.callbackUrl),
    'S.com.squareup.pos.CLIENT_ID=' + encodeURIComponent(c.applicationId),
    'S.com.squareup.pos.API_VERSION=v2.0',
    'i.com.squareup.pos.TOTAL_AMOUNT=' + String(c.amountCents),
    'S.com.squareup.pos.CURRENCY_CODE=' + c.currency,
    'S.com.squareup.pos.TENDER_TYPES=' + tenders.join(','),
    'S.com.squareup.pos.REQUEST_METADATA=' + encodeURIComponent(c.state),
    'S.com.squareup.pos.NOTE=' + encodeURIComponent(c.note),
    ...(c.locationId ? ['S.com.squareup.pos.LOCATION_ID=' + encodeURIComponent(c.locationId)] : []),
    'l.com.squareup.pos.AUTO_RETURN_TIMEOUT_MS=3200',
    'S.browser_fallback_url=' + encodeURIComponent('https://play.google.com/store/apps/details?id=com.squareup'),
  ];
  return 'intent:#Intent;' + parts.join(';') + ';end';
}

export type PosPlatform = 'ios' | 'android' | 'other';

export function detectPosPlatform(userAgent: string): PosPlatform {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'ios';
  // iPadOS 13+ Safari reports itself as a Mac; the touch check tells them apart.
  if (/Macintosh/i.test(userAgent) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1) return 'ios';
  if (/Android/i.test(userAgent)) return 'android';
  return 'other';
}

export type PosResult =
  | { ok: true; orderId: string | null; clientTransactionId: string | null; state: string | null }
  | { ok: false; errorCode: string; state: string | null };

// One parser for both platforms. Returns null when the query string is not a
// Square callback at all (someone opened /pay/callback by hand).
export function parsePosCallback(params: URLSearchParams): PosResult | null {
  const raw = params.get('data');
  if (raw !== null) {
    // iOS: a single percent-encoded JSON object.
    let d: Record<string, unknown>;
    try {
      d = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return { ok: false, errorCode: 'data_invalid', state: null };
    }
    const str = (k: string) => (typeof d[k] === 'string' ? (d[k] as string) : null);
    const state = str('state');
    if (d.status === 'ok') {
      return { ok: true, orderId: str('transaction_id'), clientTransactionId: str('client_transaction_id'), state };
    }
    return { ok: false, errorCode: str('error_code') ?? 'unknown', state };
  }

  // Android: flat com.squareup.pos.* parameters.
  const p = (k: string) => params.get('com.squareup.pos.' + k);
  const err = p('ERROR_CODE');
  if (err !== null || p('SERVER_TRANSACTION_ID') !== null || p('CLIENT_TRANSACTION_ID') !== null) {
    const state = p('REQUEST_METADATA');
    if (err !== null) return { ok: false, errorCode: err, state };
    return { ok: true, orderId: p('SERVER_TRANSACTION_ID'), clientTransactionId: p('CLIENT_TRANSACTION_ID'), state };
  }
  return null;
}

// Operator-facing copy for the codes Square POS actually returns in practice.
export function describePosError(code: string): string {
  switch (code.toLowerCase()) {
    case 'payment_canceled':
    case 'transaction_canceled':
      return 'Cancelled in Square';
    case 'not_logged_in':
    case 'user_not_logged_in':
    case 'no_employee_logged_in':
      return 'Sign in to the Square POS app first';
    case 'user_not_active':
    case 'user_not_activated':
      return 'This Square account is not activated for payments';
    case 'no_network_connection':
    case 'no_network':
      return 'The phone is offline';
    case 'transaction_already_in_progress':
      return 'Square is still busy with the last charge — finish or cancel it';
    case 'client_not_authorized_for_user':
    case 'unauthorized_client_id':
      return 'Square rejected our Application ID for this account';
    case 'data_invalid':
    case 'invalid_request':
      return 'Square could not read the request (check the callback URL registration)';
    default:
      return 'Square error: ' + code;
  }
}

export function formatMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}
