'use client';

import { useEffect, useRef, useState } from 'react';
import type { Session } from '../types';
import { PrivacyNotice } from './PrivacyNotice';

type ReadyToCaptureProps = {
  session: Session;
};

export function ReadyToCapture({ session }: ReadyToCaptureProps) {
  const [isRequesting, setIsRequesting] = useState(false);
  const resetTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    };
  }, []);

  function handleMockCapture() {
    if (isRequesting) return;

    setIsRequesting(true);
    resetTimer.current = window.setTimeout(() => setIsRequesting(false), 800);
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-between overflow-x-hidden bg-white px-5 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))] text-slate-950 sm:px-6">
      <header className="flex items-center justify-between text-sm">
        <span className="font-medium">AI Photobooth</span>
        <span
          className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600"
          aria-label={`Session code ${session.shortCode}`}
        >
          {session.shortCode}
        </span>
      </header>

      <section className="py-12 text-center">
        <p className="text-sm font-medium text-slate-500">Booth camera ready</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Ready when you are</h1>
        <p className="mx-auto mt-4 max-w-xs text-sm leading-6 text-slate-600">
          Stand in front of the booth, look at its camera, and tap the button below.
        </p>

        <button
          type="button"
          onClick={handleMockCapture}
          disabled={isRequesting}
          aria-busy={isRequesting}
          className="mt-8 min-h-14 w-full rounded-xl bg-slate-950 px-5 py-3 font-medium text-white transition-opacity focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-slate-950 disabled:cursor-wait disabled:opacity-60 motion-reduce:transition-none"
        >
          {isRequesting ? 'Connecting to booth…' : 'Take Photo'}
        </button>

        <p className="sr-only" aria-live="polite">
          {isRequesting ? 'Connecting to the booth camera.' : 'The booth camera is ready.'}
        </p>
      </section>

      <footer>
        <PrivacyNotice />
      </footer>
    </main>
  );
}
