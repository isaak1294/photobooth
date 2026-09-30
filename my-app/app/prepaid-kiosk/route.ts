import { kioskPage } from '../kiosk/route';

// GET /prepaid-kiosk[?key=…] — the kiosk for events paid up front: same page
// as /kiosk, but every session it mints is `prepaid`, so the button is plain
// "Take Photos" and Square never enters the picture, even while
// SQUARE_PRICE_CENTS is set for the pay-per-strip kiosk. Takes the same
// ?shots= and ?demo=1 as /kiosk.
//
// Gate it with KIOSK_PREPAID_KEY (Vercel + Convex) at any event that also
// charges, and bookmark /prepaid-kiosk?key=… on the kiosk device.
export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return kioskPage(request, { prepaid: true });
}
