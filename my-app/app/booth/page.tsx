'use client';

import { useEffect, useState } from 'react';
import { useMutation } from 'convex/react';
import QRCode from 'qrcode';
import { AmberGlow } from '@/components/AmberGlow';
import { api } from '@/convex/_generated/api';
import { NOBOOTH } from '@/lib/nobooth';

// The booth screen is a handoff surface and nothing else: it mints a session and
// shows the QR for it. The shutter, the styles, and the results all live on the
// guest's phone (/s/<token>), so this screen has no button and no state machine.
//
// It is displayed fullscreen over HDMI and read from several feet away, so the
// QR gets the whole screen rather than a corner.
export default function BoothPage() {
  // nobooth mode: no session is minted; the QR just links to the simulated
  // phone surface, so the whole handoff can be walked with no backend.
  if (NOBOOTH) return <MockBooth />;
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
        const dataUrl = await makeQr(`${base}/s/${session.token}`);

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

  return <BoothScreen shortCode={shortCode} qrDataUrl={qrDataUrl} failed={failed} />;
}

function MockBooth() {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void makeQr(`${window.location.origin}/s/demo`).then((dataUrl) => {
      if (!cancelled) setQrDataUrl(dataUrl);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return <BoothScreen shortCode="PB-DEMO" qrDataUrl={qrDataUrl} failed={false} />;
}

// Rendered large: generate at high resolution so it stays crisp scaled up, and
// keep the quiet zone the spec wants.
function makeQr(url: string) {
  return QRCode.toDataURL(url, { width: 1024, margin: 2, errorCorrectionLevel: 'M' });
}

function BoothScreen({
  shortCode,
  qrDataUrl,
  failed,
}: {
  shortCode: string | null;
  qrDataUrl: string | null;
  failed: boolean;
}) {
  return (
    <main className="flex h-[100dvh] w-full flex-col items-center justify-center overflow-hidden overscroll-none px-8 text-center select-none">
      <AmberGlow sizeVh={120} />
      <div className="flex flex-col items-center">
        <h1 className="text-5xl leading-none font-semibold tracking-tight md:text-6xl">Amber Photobooths</h1>
        <p className="mt-4 text-xl text-zinc-500 md:text-2xl">Scan to start. Everything happens on your phone.</p>

        {failed ? (
          <p className="mt-16 max-w-xl text-2xl text-zinc-500">
            Couldn&apos;t start a session. Check the backend and reload this screen.
          </p>
        ) : qrDataUrl ? (
          <>
            {/* White plate: a QR needs a clean quiet zone to scan reliably. */}
            <div className="mt-10 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element -- generated
                  client-side as a data: URI; nothing remote for next/image. */}
              <img
                src={qrDataUrl}
                alt={shortCode ? `Scan to open session ${shortCode}` : 'Scan to start'}
                className="h-[42vh] w-[42vh] max-w-[80vw] object-contain"
              />
            </div>
            {/* Spoken fallback when a camera won't cooperate. */}
            <p className="mt-8 font-mono text-3xl font-semibold tracking-[0.2em] text-zinc-700">{shortCode}</p>
          </>
        ) : (
          <p className="mt-16 text-2xl text-zinc-400">Starting up…</p>
        )}
      </div>
    </main>
  );
}

/** Shown when the Convex deployment URL is missing, instead of a blank crash. */
function SetupNeeded() {
  return (
    <main className="flex h-[100dvh] flex-col items-center justify-center gap-6 px-8 text-center">
      <div className="text-7xl">🔌</div>
      <h1 className="text-4xl font-semibold tracking-tight">Convex isn&apos;t connected yet</h1>
      <p className="max-w-2xl text-xl text-zinc-500">
        NEXT_PUBLIC_CONVEX_URL isn&apos;t set.{' '}
        <code className="rounded bg-zinc-100 px-2 py-1 font-mono">.env.local</code> is gitignored, so a fresh checkout
        has to create it:
      </p>
      <pre className="rounded-xl border border-zinc-200 bg-white px-6 py-4 text-left font-mono text-base shadow-sm">
        cd my-app{'\n'}
        cp .env.local.example .env.local{'\n'}
        npx next dev
      </pre>
      {/* Not `npx convex dev`: that provisions a LOCAL deployment and rewrites
          the cloud URLs in .env.local to 127.0.0.1, which looks like the app
          half-working against an empty database. */}
      <p className="max-w-2xl text-lg text-zinc-400">
        Use <code className="font-mono">npx next dev</code>, not <code className="font-mono">npm run dev</code>. The
        latter starts a local Convex deployment and overwrites those URLs.
      </p>
    </main>
  );
}
