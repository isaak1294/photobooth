'use client';

import { useParams } from 'next/navigation';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useState } from 'react';

// The phone surface, opened from the QR at /s/<token>. Everything here is a live
// Convex subscription — photos and render results appear with no refresh.
export default function PhonePage() {
  const token = useParams().token as string;
  const session = useQuery(api.sessions.getSession, { token });
  const styles = useQuery(api.styles.listStyles, {}) ?? [];
  const requestCapture = useMutation(api.captures.requestCapture);
  const requestRender = useMutation(api.renders.requestRender);
  const [capturing, setCapturing] = useState(false);

  if (session === undefined) return <Centered>Loading…</Centered>;
  if (session === null) return <Centered>Session not found.</Centered>;

  const photos = session.photos;
  const latest = photos[photos.length - 1];
  const styleName = (id: string) => styles.find((s) => s._id === id)?.name ?? 'Style';

  async function onCapture() {
    setCapturing(true);
    try {
      await requestCapture({ token });
    } finally {
      // Brief feedback; the photo itself arrives via the subscription.
      setTimeout(() => setCapturing(false), 2500);
    }
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 p-5">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">AI Photobooth</h1>
        <span className="rounded-full bg-slate-200 px-3 py-1 font-mono text-sm dark:bg-slate-800">
          {session.shortCode}
        </span>
      </header>

      <button
        onClick={onCapture}
        disabled={capturing}
        className="rounded-2xl bg-foreground px-6 py-5 text-lg font-semibold text-background disabled:opacity-50"
      >
        {capturing ? 'Say cheese… 📸' : 'Take Picture'}
      </button>

      {photos.length === 0 ? (
        <p className="text-center text-slate-500">
          Tap Take Picture — your photo will appear here.
        </p>
      ) : (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-slate-500">Latest photo</h2>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {latest.url && <img src={latest.url} alt="capture" className="w-full rounded-xl" />}
          <div className="flex flex-wrap gap-2">
            {styles.map((s) => (
              <button
                key={s._id}
                onClick={() => void requestRender({ token, photoId: latest._id, styleId: s._id })}
                className="rounded-full border border-slate-300 px-4 py-2 text-sm dark:border-slate-700"
              >
                {s.name}
              </button>
            ))}
          </div>
        </section>
      )}

      {session.renders.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-slate-500">Renders</h2>
          {session.renders
            .slice()
            .reverse()
            .map((r) => (
              <div key={r._id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                <div className="mb-2 text-sm font-medium">{styleName(r.styleId)}</div>
                {r.status === 'done' && r.outputUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.outputUrl} alt="render" className="w-full rounded-lg" />
                ) : r.status === 'failed' ? (
                  <div className="text-sm text-red-500">Failed: {r.error}</div>
                ) : (
                  <div className="text-sm text-slate-500">Rendering… ({r.status})</div>
                )}
              </div>
            ))}
        </section>
      )}
    </main>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center text-slate-500">{children}</div>;
}
