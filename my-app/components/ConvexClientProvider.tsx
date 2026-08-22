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

  // The URL is allowed to be missing so the app is usable before a developer has
  // connected a deployment — ConvexReactClient throws from its constructor on an
  // undefined address, which would turn every page into a crash screen. Anything
  // that actually calls useQuery/useMutation still needs the deployment running;
  // /booth says so itself rather than failing blank.
  if (convex === null) return children;

  return <ConvexProvider client={convex}>{children}</ConvexProvider>;
}
