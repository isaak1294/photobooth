'use client';

import { ReactNode, useState } from 'react';
import { ConvexReactClient, ConvexProvider } from 'convex/react';

// Plain Convex provider — no auth. Sessions are gated by a random token in the
// QR link, not user logins, so the booth and phone are anonymous clients.
export function ConvexClientProvider({ children }: { children: ReactNode }) {
  const [convex] = useState(() => {
    const deploymentUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
    return deploymentUrl ? new ConvexReactClient(deploymentUrl) : null;
  });

  // Phase 1 uses typed mock data and must be usable before a developer has
  // connected a local Convex deployment. Phase 2 will require this provider.
  if (convex === null) return children;

  return <ConvexProvider client={convex}>{children}</ConvexProvider>;
}
