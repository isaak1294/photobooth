'use client';

import { useState } from 'react';
import type { Session } from '../types';
import { PrivacyNotice } from './PrivacyNotice';

type ReadyToCaptureProps = {
  session: Session;
};

export function ReadyToCapture({ session }: ReadyToCaptureProps) {
  const [isRequesting, setIsRequesting] = useState(false);

  async function handleMockCapture() {
    if (isRequesting) return;

    setIsRequesting(true);
    await new Promise((resolve) => setTimeout(resolve, 800));
    setIsRequesting(false);
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-between bg-white px-6 py-8 text-slate-950">
      <header className="flex items-center justify-between text-sm">
        <span className="font-medium">AI Photobooth</span>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
          {session.shortCode}
        </span>
      </header>

      <section className="py-12 text-center">
        <p className="text-sm font-medium text-slate-500">Booth camera ready</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">Ready when you are</h1>
        <p className="mx-auto mt-4 max-w-xs text-sm leading-6 text-slate-600">
          Stand in front of the booth, look at its camera, and tap the button below.
        </p>

        <button
          type="button"
          onClick={handleMockCapture}
          disabled={isRequesting}
          className="mt-8 min-h-12 w-full rounded-xl bg-slate-950 px-5 py-3 font-medium text-white transition-opacity disabled:cursor-wait disabled:opacity-60"
        >
          {isRequesting ? 'Connecting to booth…' : 'Take Photo'}
        </button>
      </section>

      <footer>
        <PrivacyNotice />
      </footer>
    </main>
  );
}
