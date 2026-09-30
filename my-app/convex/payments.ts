import { ConvexError, v } from 'convex/values';
import { action, internalMutation, internalQuery, query } from './_generated/server';
import { internal } from './_generated/api';
import { paymentConfig } from './paymentConfig';

// Square payments. The operator's phone runs the Square Point of Sale app with
// the Reader paired; our /pay page deep-links into it (Square POS API), Square
// charges the card, then opens /pay/callback in the phone's browser with a
// `transaction_id`. That id is a Square ORDER id, and the callback is just a
// GET anyone could forge — so `recordPosResult` fetches the order from Square
// and only marks the session paid when the order is COMPLETED, at our location,
// for at least our price, with a captured tender. That check is the whole
// security boundary: no shared secret, because forging a callback buys nothing.
//
// The POS API has no sandbox. Testing is a real $1 charge and a refund.

const paymentStatus = v.union(v.literal('paid'), v.literal('unverified'), v.literal('failed'), v.literal('refunded'));
type PaymentStatus = 'paid' | 'unverified' | 'failed' | 'refunded';
type Outcome = { status: PaymentStatus; shortCode: string };

// What the /pay page and the kiosk need to agree on: is there a price, and how
// much. `priceCents: 0` means payments are off everywhere.
export const config = query({
  args: {},
  returns: v.object({
    priceCents: v.number(),
    currency: v.string(),
    cashAllowed: v.boolean(),
    verifiable: v.boolean(),
  }),
  handler: async () => paymentConfig(),
});

// The operator's list on /pay: the most recent sessions, newest first, with
// their payment state, so the code on the kiosk's chip can be matched to a
// Charge button. Session ids (not tokens) leave the deployment here — a session
// id opens nothing, the gallery is keyed by token.
export const recentSessions = query({
  args: {},
  returns: v.array(
    v.object({
      sessionId: v.id('sessions'),
      shortCode: v.string(),
      createdAt: v.number(),
      payment: v.union(
        v.null(),
        v.object({ status: paymentStatus, error: v.union(v.string(), v.null()), updatedAt: v.number() }),
      ),
      photos: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const sessions = await ctx.db.query('sessions').order('desc').take(8);
    const out = [];
    for (const session of sessions) {
      const payment = await ctx.db
        .query('payments')
        .withIndex('by_session', (q) => q.eq('sessionId', session._id))
        .first();
      const photos = await ctx.db
        .query('photos')
        .withIndex('by_session', (q) => q.eq('sessionId', session._id))
        .collect();
      out.push({
        sessionId: session._id,
        shortCode: session.shortCode,
        createdAt: session._creationTime,
        payment: payment ? { status: payment.status, error: payment.error ?? null, updatedAt: payment.updatedAt } : null,
        photos: photos.length,
      });
    }
    return out;
  },
});

// PHONE (via /pay/callback) -> the result of one Square POS round trip.
// Public on purpose; see the header comment for why that is safe.
export const recordPosResult = action({
  args: {
    sessionId: v.id('sessions'),
    ok: v.boolean(),
    // iOS `transaction_id` / Android SERVER_TRANSACTION_ID — an Order id.
    orderId: v.optional(v.string()),
    clientTransactionId: v.optional(v.string()),
    errorCode: v.optional(v.string()),
  },
  returns: v.object({ status: paymentStatus, shortCode: v.string() }),
  // Return types are spelled out because the action calls `internal.payments.*`
  // from inside the same module, which is circular for inference.
  handler: async (ctx, args): Promise<Outcome> => {
    const session: { shortCode: string } | null = await ctx.runQuery(internal.payments.sessionById, {
      sessionId: args.sessionId,
    });
    if (session === null) throw new ConvexError('Unknown session');
    const cfg = paymentConfig();
    if (cfg.priceCents === 0) throw new ConvexError('Payments are off: SQUARE_PRICE_CENTS is not set on the deployment');

    const record = async (fields: {
      status: 'paid' | 'unverified' | 'failed';
      amount?: number;
      tender?: string;
      squareOrderId?: string;
      squarePaymentIds?: string[];
      error?: string;
    }): Promise<Outcome> => {
      const status: PaymentStatus = await ctx.runMutation(internal.payments.upsert, {
        sessionId: args.sessionId,
        currency: cfg.currency,
        amount: fields.amount ?? cfg.priceCents,
        clientTransactionId: args.clientTransactionId,
        ...fields,
      });
      return { status, shortCode: session.shortCode };
    };

    // Cancelled, declined, not signed in, … — Square already told the operator.
    if (!args.ok) return await record({ status: 'failed', error: args.errorCode ?? 'unknown' });

    // Cash / offline: Square returns no order id, so there is nothing to verify.
    if (args.orderId === undefined || args.orderId === '') {
      if (cfg.cashAllowed) return await record({ status: 'unverified', tender: 'CASH' });
      return await record({ status: 'failed', error: 'Cash or offline tender is not accepted (SQUARE_ALLOW_CASH is unset)' });
    }

    try {
      const verified = await verifyPosOrder(args.orderId, cfg.priceCents, cfg.currency);
      return await record({
        status: 'paid',
        amount: verified.amount,
        tender: verified.tender,
        squareOrderId: verified.orderId,
        squarePaymentIds: verified.paymentIds,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Write the reason before rethrowing: Convex does not retry actions, and a
      // silent failure here is a locked kiosk with no explanation.
      await record({ status: 'failed', squareOrderId: undefined, error: message });
      throw new ConvexError(message);
    }
  },
});

// --- Square Orders API --------------------------------------------------------

type Verified = { orderId: string; paymentIds: string[]; amount: number; currency: string; tender: string };

type SquareTender = { type?: string; payment_id?: string; card_details?: { status?: string } };
type SquareOrder = {
  id: string;
  state?: string;
  location_id?: string;
  total_money?: { amount?: number | string; currency?: string };
  tenders?: SquareTender[];
};

const SQUARE_API = 'https://connect.squareup.com/v2';

// Fetch the order the POS API said it created and make sure it is the sale we
// think it is. Every rejection is a plain Error whose message is safe to show
// the operator and to store on the payments row.
async function verifyPosOrder(orderId: string, expectCents: number, expectCurrency: string): Promise<Verified> {
  const token = process.env.SQUARE_ACCESS_TOKEN;
  const locationId = process.env.SQUARE_LOCATION_ID;
  if (!token || !locationId) throw new Error('SQUARE_ACCESS_TOKEN / SQUARE_LOCATION_ID are not set on the deployment');
  if (!/^[A-Za-z0-9_-]{1,192}$/.test(orderId)) throw new Error('Malformed Square order id');

  const res = await fetch(`${SQUARE_API}/orders/${orderId}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  const body = (await res.json().catch(() => ({}))) as { order?: SquareOrder; errors?: { code?: string; detail?: string }[] };
  if (res.status === 404) throw new Error('Square has no order with that id');
  if (!res.ok) {
    const detail = (body.errors ?? []).map((e) => `${e.code ?? '?'}${e.detail ? `: ${e.detail}` : ''}`).join('; ');
    throw new Error(`Square Orders API ${res.status}${detail ? ` (${detail})` : ''}`);
  }
  const order = body.order;
  if (!order) throw new Error('Square returned no order');
  if (order.state !== 'COMPLETED') throw new Error(`Square order is ${order.state ?? 'in an unknown state'}, not COMPLETED`);
  if (order.location_id !== locationId) throw new Error('Square order belongs to a different location');

  const amount = Number(order.total_money?.amount ?? NaN);
  const currency = order.total_money?.currency ?? '';
  if (currency !== expectCurrency || !Number.isFinite(amount) || amount < expectCents) {
    throw new Error(`Square order total is ${amount} ${currency}; expected at least ${expectCents} ${expectCurrency}`);
  }

  // A card tender only counts once captured; any other tender type Square
  // completes the order with (gift card, "other") is taken at face value.
  const captured = (order.tenders ?? []).filter((t) => t.type !== 'CARD' || t.card_details?.status === 'CAPTURED');
  if (captured.length === 0) throw new Error('Square order has no captured tender');

  return {
    orderId: order.id,
    paymentIds: captured.map((t) => t.payment_id).filter((id): id is string => typeof id === 'string'),
    amount,
    currency,
    tender: captured.map((t) => t.type ?? 'UNKNOWN').join('+'),
  };
}

// --- internal plumbing --------------------------------------------------------

export const sessionById = internalQuery({
  args: { sessionId: v.id('sessions') },
  returns: v.union(v.null(), v.object({ shortCode: v.string() })),
  handler: async (ctx, { sessionId }) => {
    const session = await ctx.db.get('sessions', sessionId);
    return session ? { shortCode: session.shortCode } : null;
  },
});

// One row per session. Rules, all inside one transaction:
//  - an order id already used by ANOTHER session is a replay → rejected;
//  - the same order id on the same session is the callback being reloaded → no-op;
//  - a failure never downgrades a session that is already paid (a second tap
//    that gets cancelled must not lock the kiosk again).
export const upsert = internalMutation({
  args: {
    sessionId: v.id('sessions'),
    status: v.union(v.literal('paid'), v.literal('unverified'), v.literal('failed')),
    amount: v.number(),
    currency: v.string(),
    tender: v.optional(v.string()),
    squareOrderId: v.optional(v.string()),
    squarePaymentIds: v.optional(v.array(v.string())),
    clientTransactionId: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  returns: paymentStatus,
  handler: async (ctx, args) => {
    if (args.squareOrderId !== undefined) {
      const used = await ctx.db
        .query('payments')
        .withIndex('by_order', (q) => q.eq('squareOrderId', args.squareOrderId))
        .first();
      if (used !== null && used.sessionId !== args.sessionId) {
        throw new ConvexError('That Square order already paid for a different session');
      }
    }

    const existing = await ctx.db
      .query('payments')
      .withIndex('by_session', (q) => q.eq('sessionId', args.sessionId))
      .first();
    const settled = existing !== null && (existing.status === 'paid' || existing.status === 'unverified');
    if (settled && args.status === 'failed') return existing.status;
    if (settled && existing.squareOrderId !== undefined && existing.squareOrderId === args.squareOrderId) {
      return existing.status; // replayed callback
    }

    const fields = {
      status: args.status,
      amount: args.amount,
      currency: args.currency,
      updatedAt: Date.now(),
      ...(args.tender !== undefined ? { tender: args.tender } : {}),
      ...(args.squareOrderId !== undefined ? { squareOrderId: args.squareOrderId } : {}),
      ...(args.squarePaymentIds !== undefined ? { squarePaymentIds: args.squarePaymentIds } : {}),
      ...(args.clientTransactionId !== undefined ? { clientTransactionId: args.clientTransactionId } : {}),
      ...(args.error !== undefined ? { error: args.error.slice(0, 300) } : {}),
    };
    if (existing === null) {
      await ctx.db.insert('payments', { sessionId: args.sessionId, ...fields });
    } else {
      // `replace` rather than `patch`, so a stale error/order id from a
      // previous attempt doesn't linger on the row that now says paid.
      await ctx.db.replace('payments', existing._id, { sessionId: args.sessionId, ...fields });
    }
    return args.status;
  },
});
