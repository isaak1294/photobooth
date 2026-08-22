'use client';

import { usePhotoboothSession } from './use-photobooth-session';

type SessionRouteProps = {
  token: string;
};

export function SessionRoute({ token }: SessionRouteProps) {
  const sessionResult = usePhotoboothSession(token);

  if (sessionResult.status !== 'valid') {
    return (
      <main className="mx-auto flex min-h-screen max-w-md items-center justify-center p-6">
        <p>Session state: {sessionResult.status}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-3 p-6">
      <p className="text-sm text-slate-500">AI Photobooth session</p>
      <h1 className="text-3xl font-semibold">{sessionResult.session.shortCode}</h1>
      <p className="break-all text-sm text-slate-500">Token: {sessionResult.session.token}</p>
    </main>
  );
}
