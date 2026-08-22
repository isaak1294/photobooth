import type { Session, SessionLookupResult } from './types';

const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{8,200}$/;

export const MOCK_SESSION_TOKEN = 'demo-session';
export const MOCK_LOADING_TOKEN = 'loading-session';
export const MOCK_INVALID_TOKEN = 'invalid-session';
export const MOCK_EXPIRED_TOKEN = 'expired-session';

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
  if (token === MOCK_LOADING_TOKEN) {
    return { status: 'loading' };
  }

  if (token === MOCK_EXPIRED_TOKEN) {
    return { status: 'expired' };
  }

  if (token === MOCK_INVALID_TOKEN || !isSessionTokenFormatValid(token)) {
    return { status: 'invalid' };
  }

  return { status: 'valid', session: createMockSession(token) };
}
