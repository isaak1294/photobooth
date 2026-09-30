import type { DatabaseReader } from './_generated/server';
import type { Id } from './_generated/dataModel';

// Payment settings, read from the deployment's environment (`npx convex env
// set …`). Kept beside the functions rather than inside them so the capture
// mutation, the session query and the payments module all agree on one rule:
// payments are ON iff SQUARE_PRICE_CENTS is a positive integer. Unset it and
// every surface behaves exactly as it did before Square existed.
export type PaymentConfig = {
  priceCents: number;
  currency: string;
  cashAllowed: boolean;
  // Whether the deployment can actually verify an order: token + location set.
  verifiable: boolean;
};

export function paymentConfig(): PaymentConfig {
  const raw = Number(process.env.SQUARE_PRICE_CENTS ?? 0);
  const priceCents = Number.isInteger(raw) && raw > 0 ? raw : 0;
  return {
    priceCents,
    currency: (process.env.SQUARE_CURRENCY || 'USD').toUpperCase(),
    cashAllowed: process.env.SQUARE_ALLOW_CASH === '1',
    verifiable: Boolean(process.env.SQUARE_ACCESS_TOKEN && process.env.SQUARE_LOCATION_ID),
  };
}

// A session counts as paid when it has a verified row, or an unverified cash row
// (the operator vouched for it). `failed` and `refunded` do not unlock anything.
export async function isSessionPaid(db: DatabaseReader, sessionId: Id<'sessions'>): Promise<boolean> {
  const payment = await db
    .query('payments')
    .withIndex('by_session', (q) => q.eq('sessionId', sessionId))
    .first();
  return payment !== null && (payment.status === 'paid' || payment.status === 'unverified');
}
