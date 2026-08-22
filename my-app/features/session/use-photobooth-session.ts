'use client';

import { useMemo } from 'react';
import { getMockSession } from './mock-session';
import type { SessionLookupResult } from './types';

// This is the frontend seam for session data. Phase 2 will replace the mock
// lookup with the reactive Convex getSession query without changing consumers.
export function usePhotoboothSession(token: string): SessionLookupResult {
  return useMemo(() => getMockSession(token), [token]);
}
