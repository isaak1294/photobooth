'use client';

import { ReactNode, useState } from 'react';
import { ConvexReactClient, ConvexProvider } from 'convex/react';

// Plain Convex provider — no auth. Sessions are gated by a random token in the
// QR link, not user logins, so the booth and phone are anonymous clients.
export function ConvexClientProvider({ children }: { children: ReactNode }) {
  const [convex] = useState(() => new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!));
  return <ConvexProvider client={convex}>{children}</ConvexProvider>;
}
