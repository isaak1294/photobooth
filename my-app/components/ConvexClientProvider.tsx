'use client';

import { ReactNode, useState } from 'react';
import { ConvexReactClient, ConvexProvider } from 'convex/react';

// Plain Convex provider — no auth. Sessions are gated by a random token in the
// QR link, not user logins, so the booth and phone are anonymous clients.
//
// The URL is allowed to be missing: the booth's capture path (button ->
// countdown -> Pi camera) touches no Convex data, and ConvexReactClient throws
// from its constructor on an undefined address, which would turn every page
// into a crash screen before the deployment is provisioned. Any component that
// actually calls useQuery/useMutation still needs the deployment running.
export function ConvexClientProvider({ children }: { children: ReactNode }) {
  const [convex] = useState(() => {
    const url = process.env.NEXT_PUBLIC_CONVEX_URL;
    return url ? new ConvexReactClient(url) : null;
  });

  if (!convex) return <>{children}</>;
  return <ConvexProvider client={convex}>{children}</ConvexProvider>;
}
