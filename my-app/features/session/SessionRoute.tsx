'use client';

import { usePhotoboothSession } from './use-photobooth-session';
import { SessionExperience } from './components/SessionExperience';

type SessionRouteProps = {
  token: string;
};

export function SessionRoute({ token }: SessionRouteProps) {
  const sessionResult = usePhotoboothSession(token);

  return <SessionExperience result={sessionResult} />;
}
