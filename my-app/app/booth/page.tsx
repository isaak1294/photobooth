'use client';

import { useEffect, useState } from 'react';
import { useMutation } from 'convex/react';
import { PopBackdrop } from '@/components/PopBackdrop';
import { SetupNeeded } from '@/components/SetupNeeded';
import { api } from '@/convex/_generated/api';
import { NOBOOTH } from '@/lib/nobooth';
import { makeQr, phoneUrlFor } from '@/lib/qr';

// The booth screen is a handoff surface and nothing else: it mints a session and
// shows the QR for it. The shutter, the styles, and the results all live on the
// guest's phone (/s/<token>), so this screen has no button and no state machine.
// (The kiosk at /kiosk is the other shape of this: iPad, one button, shoots the
// strip itself, then hands off the same way.)
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
        const dataUrl = await makeQr(phoneUrlFor(session.token));

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
      <PopBackdrop />

      <h1 className="inline-block -rotate-2 font-display text-[clamp(3rem,9vw,7rem)] leading-none uppercase">
        POP<span className="text-pop-pink">FLASH</span>
      </h1>
      <p className="mt-6 rotate-1 border-2 border-pop-ink bg-pop-paper px-5 py-2 text-lg font-bold shadow-pop md:text-2xl">
        SCAN TO START · IT ALL HAPPENS ON YOUR PHONE
      </p>

      {failed ? (
        <div className="mt-12 max-w-2xl -rotate-1 border-4 border-pop-ink bg-pop-pink p-8 shadow-pop-lg" role="alert">
          <p className="font-display text-3xl text-pop-paper uppercase">Booth offline</p>
          <p className="mt-3 font-bold text-pop-paper">
            Couldn&rsquo;t start a session. Check the backend and reload this screen.
          </p>
        </div>
      ) : qrDataUrl ? (
        <>
          {/* White plate: a QR needs a clean quiet zone to scan reliably, and
              POPFLASH yellow behind one costs contrast. */}
          <div className="mt-10 border-4 border-pop-ink bg-pop-paper p-5 shadow-pop-lg">
            {/* eslint-disable-next-line @next/next/no-img-element -- generated
                client-side as a data: URI; nothing remote for next/image. */}
            <img
              src={qrDataUrl}
              alt={shortCode ? `Scan to open session ${shortCode}` : 'Scan to start'}
              className="h-[42vh] w-[42vh] max-w-[80vw] object-contain"
            />
          </div>
          {/* Spoken fallback when a camera won't cooperate. */}
          <p className="mt-8 border-2 border-pop-ink bg-pop-ink px-6 py-2 font-mono text-2xl font-bold tracking-[0.2em] text-pop-yellow md:text-3xl">
            {shortCode}
          </p>
        </>
      ) : (
        <p className="mt-16 animate-pulse font-display text-3xl uppercase motion-reduce:animate-none">Warming up…</p>
      )}
    </main>
  );
}
