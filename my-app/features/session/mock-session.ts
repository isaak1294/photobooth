import type { Session, SessionLookupResult } from './types';

const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{8,200}$/;

export const MOCK_SESSION_TOKEN = 'demo-session';

export function isSessionTokenFormatValid(token: string): boolean {
  return SESSION_TOKEN_PATTERN.test(token);
}

export function createMockSession(token: string = MOCK_SESSION_TOKEN): Session {
  return {
    token,
    shortCode: 'PB-DEMO',
    captureStatus: 'ready',
    photos: [],
    renders: [],
  };
}

export function getMockSession(token: string): SessionLookupResult {
  if (!isSessionTokenFormatValid(token)) {
    return { status: 'invalid' };
  }

  return { status: 'valid', session: createMockSession(token) };
}
