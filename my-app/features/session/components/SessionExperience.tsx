import type { SessionLookupResult } from '../types';
import { ReadyToCapture } from './ReadyToCapture';
import { SessionError } from './SessionError';
import { SessionLoading } from './SessionLoading';

type SessionExperienceProps = {
  result: SessionLookupResult;
};

export function SessionExperience({ result }: SessionExperienceProps) {
  if (result.status === 'loading') {
    return <SessionLoading />;
  }

  if (result.status === 'invalid' || result.status === 'expired') {
    return <SessionError kind={result.status} />;
  }

  return <ReadyToCapture session={result.session} />;
}
