'use client';

import { useEffect, useState } from 'react';
import { useMutation } from 'convex/react';
import QRCode from 'qrcode';
import { api } from '@/convex/_generated/api';

// The booth screen is a handoff surface and nothing else: it mints a session and
// shows the QR for it. The shutter, the styles, and the results all live on the
// guest's phone (/s/<token>), so this screen has no button and no state machine.
//
// It is displayed fullscreen over HDMI and read from several feet away, so the
// QR gets the whole screen rather than a corner.
export default function BoothPage() {
  // Convex mints the session, so a missing deployment URL is a setup step worth
  // naming — the hooks below would otherwise throw for want of a provider.
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) return <SetupNeeded />;
  return <Booth />;
}

function Booth() {
  const createSession = useMutation(api.sessions.createSession);
  const [shortCode, setShortCode] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void createSession()
      .then(async (session) => {
        if (cancelled) return;

        // The QR has to point somewhere a guest's PHONE can reach, so it can't
        // use window.location.origin — on the booth machine that's localhost,
        // which resolves to the phone itself and fails silently.
        const base = process.env.NEXT_PUBLIC_BOOTH_PUBLIC_URL || window.location.origin;
        // Rendered large: generate at high resolution so it stays crisp
        // scaled up, and keep the quiet zone the spec wants.
        const dataUrl = await QRCode.toDataURL(`${base}/s/${session.token}`, {
          width: 1024,
          margin: 2,
          errorCorrectionLevel: 'M',
        });

        if (cancelled) return;
        setShortCode(session.shortCode);
        setQrDataUrl(dataUrl);
      })
      .catch((error: unknown) => {
        console.error('[booth] could not start a session:', error);
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [createSession]);

  return (
    <main className="relative flex h-[100dvh] w-full flex-col items-center justify-center overflow-hidden overscroll-none bg-[#0b0b14] px-8 text-center text-white select-none">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-1/3 left-1/2 h-[120vh] w-[120vh] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(217,70,239,0.22),rgba(11,11,20,0)_65%)]"
      />

      <div className="relative flex flex-col items-center">
        <h1 className="text-5xl leading-none font-black tracking-tight md:text-7xl">AI Photobooth</h1>
        <p className="mt-5 text-2xl text-white/60 md:text-3xl">Scan to start — everything happens on your phone.</p>

        {failed ? (
          <p className="mt-16 max-w-xl text-2xl text-white/50">
            Couldn&apos;t start a session. Check the backend and reload this screen.
          </p>
        ) : qrDataUrl ? (
          <>
            {/* White plate: a QR needs a light quiet zone to scan reliably, and
                this screen is otherwise dark. */}
            <div className="mt-10 rounded-3xl bg-white p-5 shadow-[0_0_120px_-20px_rgba(217,70,239,0.8)]">
              {/* eslint-disable-next-line @next/next/no-img-element -- generated
                  client-side as a data: URI; nothing remote for next/image. */}
              <img
                src={qrDataUrl}
                alt={shortCode ? `Scan to open session ${shortCode}` : 'Scan to start'}
                className="h-[42vh] w-[42vh] max-w-[80vw] object-contain"
              />
            </div>
            {/* Spoken fallback when a camera won't cooperate. */}
            <p className="mt-8 font-mono text-4xl font-bold tracking-[0.2em] text-white/80">{shortCode}</p>
          </>
        ) : (
          <p className="mt-16 text-2xl text-white/40">Starting up…</p>
        )}
      </div>
    </main>
  );
}

/** Shown when the Convex deployment URL is missing, instead of a blank crash. */
function SetupNeeded() {
  return (
    <main className="flex h-[100dvh] flex-col items-center justify-center gap-6 bg-[#0b0b14] px-8 text-center text-white">
      <div className="text-7xl">🔌</div>
      <h1 className="text-4xl font-black">Convex isn&apos;t connected yet</h1>
      <p className="max-w-2xl text-xl text-white/60">
        NEXT_PUBLIC_CONVEX_URL isn&apos;t set.{' '}
        <code className="rounded bg-white/10 px-2 py-1 font-mono">.env.local</code> is gitignored, so a fresh checkout
        has to create it:
      </p>
      <pre className="rounded-xl bg-white/10 px-6 py-4 text-left font-mono text-base">
        cd my-app{'\n'}
        cp .env.local.example .env.local{'\n'}
        npx next dev
      </pre>
      {/* Not `npx convex dev`: that provisions a LOCAL deployment and rewrites
          the cloud URLs in .env.local to 127.0.0.1, which looks like the app
          half-working against an empty database. */}
      <p className="max-w-2xl text-lg text-white/40">
        Use <code className="font-mono">npx next dev</code>, not <code className="font-mono">npm run dev</code> — the
        latter starts a local Convex deployment and overwrites those URLs.
      </p>
    </main>
  );
}
