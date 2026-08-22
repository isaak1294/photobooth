'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import QRCode from 'qrcode';
import { api } from '@/convex/_generated/api';

// The booth is a Convex client like the phone is. Pressing the button does NOT
// talk to the Pi directly — it writes a captureRequest row, which the Pi's
// listener (scripts/pi-listener.mjs) is subscribed to. The Pi shoots, uploads to
// /upload, and the photo arrives back here through the same getSession
// subscription the phone is on. Nothing polls, and nothing connects inbound to
// the Pi.
type BoothState = 'ready' | 'countdown' | 'capturing' | 'success' | 'error';

const COUNTDOWN_FROM = 3;
const COUNTDOWN_STEP_MS = 1000;

// The listener shoots (rpicam-jpeg spends ~3s settling exposure), uploads, and
// the row lands. Generous, because the alternative to waiting is telling the
// guest it failed when it didn't — but bounded, so a dead listener surfaces as
// an error instead of a spinner that never ends.
const PHOTO_WAIT_MS = 30_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function BoothPage() {
  // Convex is now the entire capture path, so a missing deployment URL is a
  // setup step worth naming — otherwise the hooks below throw for want of a
  // provider and the booth is a blank screen.
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) return <SetupNeeded />;
  return <Booth />;
}

function Booth() {
  const createSession = useMutation(api.sessions.createSession);
  const requestCapture = useMutation(api.captures.requestCapture);

  const [token, setToken] = useState<string | null>(null);
  const [state, setState] = useState<BoothState>('ready');
  const [count, setCount] = useState(COUNTDOWN_FROM);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  // The live subscription. Everything the booth shows about photos comes from
  // here, including frames a phone triggered.
  const session = useQuery(api.sessions.getSession, token ? { token } : 'skip');
  const photos = session?.photos ?? [];
  const photoCount = photos.length;
  const latestPhoto = photoCount > 0 ? photos[photoCount - 1] : null;

  const busyRef = useRef(false);
  // How many photos existed when this run's shutter fired; the run is finished
  // when a new one lands.
  const baselineRef = useRef(0);

  // One session per booth run, reused across photos so every frame lands in the
  // same gallery behind one QR. The ref guards React's development double-invoke
  // of effects, which would otherwise create a second, orphaned session.
  const sessionRequested = useRef(false);
  useEffect(() => {
    if (sessionRequested.current) return;
    sessionRequested.current = true;

    void createSession()
      .then((created) => setToken(created.token))
      .catch((error: unknown) => {
        console.error('[booth] could not create a session:', error);
        setErrorMessage('Could not reach the backend to start a session.');
        setState('error');
      });
  }, [createSession]);

  // The QR the guest scans. It has to point at an address a phone can reach, so
  // it can't just use window.location.origin — on the Pi that's localhost, which
  // means nothing on someone's phone.
  useEffect(() => {
    if (!token) return;
    const base = process.env.NEXT_PUBLIC_BOOTH_PUBLIC_URL || window.location.origin;
    QRCode.toDataURL(`${base}/s/${token}`, { width: 512, margin: 1 })
      .then(setQrDataUrl)
      .catch((error: unknown) => console.error('[booth] QR generation failed:', error));
  }, [token]);

  // The photo arriving is what ends the run — pushed by the subscription, not
  // waited on by the click handler.
  useEffect(() => {
    if (state !== 'capturing') return;
    if (photoCount > baselineRef.current) setState('success');
  }, [state, photoCount]);

  // A capture that never lands must not hang the booth forever.
  useEffect(() => {
    if (state !== 'capturing') return;
    const timer = setTimeout(() => {
      console.error(`[booth] no photo arrived within ${PHOTO_WAIT_MS}ms`);
      setErrorMessage('The camera never sent a photo back. Is the Pi listener running?');
      setState('error');
    }, PHOTO_WAIT_MS);
    return () => clearTimeout(timer);
  }, [state]);

  const resetBooth = useCallback(() => {
    setErrorMessage(null);
    setCount(COUNTDOWN_FROM);
    setState('ready');
  }, []);

  const startCapture = useCallback(async () => {
    if (busyRef.current || !token) return;
    busyRef.current = true;
    resetBooth();

    try {
      // The countdown is the booth's job — the guest has to see the number
      // change on the screen they're posing at.
      setState('countdown');
      for (let n = COUNTDOWN_FROM; n >= 1; n--) {
        setCount(n);
        await sleep(COUNTDOWN_STEP_MS);
      }

      // Record the baseline before the shutter, so the effect above can tell
      // this run's photo from one that was already there.
      baselineRef.current = photoCount;
      setState('capturing');
      await requestCapture({ token });
    } catch (error) {
      console.error('[booth] capture request failed:', error);
      setErrorMessage(error instanceof Error ? error.message : String(error));
      setState('error');
    } finally {
      busyRef.current = false;
    }
  }, [token, photoCount, requestCapture, resetBooth]);

  const starting = token === null || session === undefined;

  return (
    <main className="relative flex h-[100dvh] w-full flex-col items-center justify-center overflow-hidden overscroll-none bg-[#0b0b14] text-white select-none">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-1/3 left-1/2 h-[120vh] w-[120vh] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(217,70,239,0.22),rgba(11,11,20,0)_65%)]"
      />

      {/* The handoff. Kept on screen through every state except the countdown so
          guests can scan whenever they think of it. */}
      {state !== 'countdown' && qrDataUrl && session && <QrCard dataUrl={qrDataUrl} shortCode={session.shortCode} />}

      <div className="relative flex flex-col items-center px-8 text-center">
        {state === 'ready' && (
          <>
            <h1 className="text-6xl leading-none font-black tracking-tight md:text-8xl">AI Photobooth</h1>
            <p className="mt-6 text-2xl text-white/60 md:text-3xl">
              {starting ? 'Starting up…' : 'Step in, strike a pose, and tap the button.'}
            </p>
            <BoothButton className="mt-16" disabled={starting} onClick={() => void startCapture()}>
              Take Photo
            </BoothButton>
          </>
        )}

        {state === 'countdown' && (
          <>
            {/* key= replays the pop animation on every new number. */}
            <div key={count} className="booth-pop text-[38vh] leading-none font-black tabular-nums">
              {count}
            </div>
            <p className="mt-2 text-3xl tracking-[0.3em] text-white/50 uppercase md:text-4xl">Get ready</p>
          </>
        )}

        {state === 'capturing' && (
          <>
            <div className="booth-breathe text-8xl md:text-9xl">📸</div>
            <p className="mt-10 text-5xl font-black md:text-7xl">Capturing…</p>
            <p className="mt-4 text-2xl text-white/50">Hold still</p>
          </>
        )}

        {state === 'success' && (
          <>
            <h2 className="text-4xl font-black md:text-5xl">Photo captured!</h2>
            <PhotoFrame url={latestPhoto?.url ?? null} />
            <p className="mt-4 text-xl text-white/50">Scan the code to pick a style on your phone.</p>
            <BoothButton className="mt-8" onClick={() => void startCapture()}>
              Take Another Photo
            </BoothButton>
          </>
        )}

        {state === 'error' && (
          <>
            <div className="text-8xl md:text-9xl">😵</div>
            <h2 className="mt-8 text-5xl font-black md:text-6xl">That didn&apos;t work</h2>
            <p className="mt-6 max-w-3xl text-2xl text-white/60">
              {errorMessage ?? 'Something went wrong on the way to the camera.'}
            </p>
            <BoothButton className="mt-14" onClick={() => void startCapture()}>
              Try Again
            </BoothButton>
          </>
        )}
      </div>
    </main>
  );
}

/** The single big target. Sized to be unmissable from across a room. */
function BoothButton({
  children,
  onClick,
  className = '',
  disabled = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`touch-manipulation rounded-full bg-[linear-gradient(100deg,#f472b6,#d946ef_45%,#fb923c)] px-14 py-7 text-3xl font-black tracking-wide text-black uppercase shadow-[0_0_80px_-20px_rgba(217,70,239,0.9)] transition duration-150 hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none md:px-20 md:py-9 md:text-5xl ${className}`}
    >
      {children}
    </button>
  );
}

/**
 * The captured frame, matted like a print. The URL is a Convex storage URL, so
 * this is the same image the phone sees.
 */
function PhotoFrame({ url }: { url: string | null }) {
  const [failed, setFailed] = useState(false);

  if (!url || failed) {
    return (
      <div className="mt-6 flex h-[40vh] w-[65vh] max-w-full items-center justify-center rounded-2xl border border-white/15 bg-white/5 px-10 text-center text-xl text-white/50">
        Photo uploaded, but the booth couldn&apos;t load it back.
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-2xl bg-white p-2 shadow-[0_25px_80px_-20px_rgba(0,0,0,0.9)]">
      {/* eslint-disable-next-line @next/next/no-img-element -- a Convex storage URL
          on a deployment host that's only known at runtime, so next/image has no
          static remotePattern to match it against. */}
      <img
        src={url}
        alt="The photo just captured"
        onError={() => setFailed(true)}
        className="max-h-[50vh] w-auto rounded-xl object-contain"
      />
    </div>
  );
}

/** The QR handoff, plus the short code as a spoken fallback. */
function QrCard({ dataUrl, shortCode }: { dataUrl: string; shortCode: string }) {
  return (
    <div className="absolute right-8 bottom-8 flex flex-col items-center gap-2 rounded-2xl bg-white p-3 shadow-2xl">
      {/* eslint-disable-next-line @next/next/no-img-element -- generated client-side
          as a data: URI; there is no remote source for next/image to optimize. */}
      <img src={dataUrl} alt={`Scan to open session ${shortCode}`} className="h-36 w-36" />
      <span className="font-mono text-sm font-bold tracking-wide text-black">{shortCode}</span>
    </div>
  );
}

/** Shown when the Convex deployment URL is missing, instead of a blank crash. */
function SetupNeeded() {
  return (
    <main className="flex h-[100dvh] flex-col items-center justify-center gap-6 bg-[#0b0b14] px-8 text-center text-white">
      <div className="text-7xl">🔌</div>
      <h1 className="text-4xl font-black">Convex isn&apos;t connected yet</h1>
      <p className="max-w-xl text-xl text-white/60">
        The booth needs a deployment before it can start a session. Run{' '}
        <code className="rounded bg-white/10 px-2 py-1 font-mono text-lg">npx convex dev</code> in{' '}
        <code className="rounded bg-white/10 px-2 py-1 font-mono text-lg">my-app</code>, then restart the dev server.
      </p>
    </main>
  );
}
