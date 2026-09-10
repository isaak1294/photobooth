'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useConvexConnectionState, useMutation, useQuery } from 'convex/react';
import { SetupNeeded } from '@/components/SetupNeeded';
import { KioskScreen } from '@/components/kiosk/KioskScreen';
import { useKioskRun, type KioskBooth } from '@/components/kiosk/useKioskRun';
import { useWakeLock } from '@/components/kiosk/useWakeLock';
import { makeMockPhoto } from '@/lib/mockPhoto';
import { NOBOOTH } from '@/lib/nobooth';
import { makeQr, phoneUrlFor } from '@/lib/qr';
import { api } from '@/convex/_generated/api';

// The kiosk: an iPad on a stand that takes payment out of band and does one
// thing on screen — press once, get a strip of photos, scan the QR.
//
// It is the BOOTH surface, not the guest's: it mints the session, drives the Pi
// shutter, and hands the session off by QR at the end. The phone page
// (/s/<token>) is where styling and downloading happen.
//
// Shots default to 4; ?shots=N (1-8) overrides for a run where that's too many.

const DEFAULT_SHOTS = 4;
const MAX_SHOTS = 8;

export function Kiosk() {
  useWakeLock();
  const shotCount = useShotCount();

  // nobooth mode: the whole kiosk runs against a simulated booth, so the screens
  // can be worked on with no Convex deployment, Pi, or camera.
  if (NOBOOTH) return <MockKiosk shotCount={shotCount} />;
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) return <SetupNeeded />;
  return <LiveKiosk shotCount={shotCount} />;
}

// The query string is browser state the server can't see, so it's read through
// useSyncExternalStore: the server (and the hydrating pass) get the default, the
// client swaps in ?shots=N without a hydration mismatch. Nothing changes it
// after load, so the subscription is a no-op.
const subscribeToNothing = () => () => {};

function useShotCount() {
  return useSyncExternalStore(
    subscribeToNothing,
    () => {
      const requested = Number(new URLSearchParams(window.location.search).get('shots'));
      return Number.isInteger(requested) && requested >= 1 && requested <= MAX_SHOTS ? requested : DEFAULT_SHOTS;
    },
    () => DEFAULT_SHOTS,
  );
}

function LiveKiosk({ shotCount }: { shotCount: number }) {
  const createSession = useMutation(api.sessions.createSession);
  const requestCaptureMutation = useMutation(api.captures.requestCapture);
  const connection = useConvexConnectionState();

  const [session, setSession] = useState<{ token: string; shortCode: string } | null>(null);
  const [offline, setOffline] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  // Bumped by "Next guest" to mint a fresh session — one guest's photos must
  // never appear behind the next guest's QR.
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    let cancelled = false;

    void createSession()
      .then((minted) => {
        if (!cancelled) setSession({ token: minted.token, shortCode: minted.shortCode });
      })
      .catch((error: unknown) => {
        console.error('[kiosk] could not start a session:', error);
        if (!cancelled) setOffline(true);
      });

    return () => {
      cancelled = true;
    };
  }, [createSession, generation]);

  // Generated as soon as the session exists, not when the run ends, so the
  // handoff screen never makes a guest wait on a QR. Clearing it is "Next
  // guest"'s job, below.
  useEffect(() => {
    if (session === null) return;
    let cancelled = false;
    void makeQr(phoneUrlFor(session.token)).then((dataUrl) => {
      if (!cancelled) setQrDataUrl(dataUrl);
    });
    return () => {
      cancelled = true;
    };
  }, [session]);

  const sessionData = useQuery(api.sessions.getSession, session === null ? 'skip' : { token: session.token });

  const token = session?.token ?? null;
  const requestCapture = useCallback(async () => {
    if (token === null) throw new Error('No session yet');
    return await requestCaptureMutation({ token });
  }, [requestCaptureMutation, token]);

  const booth: KioskBooth = {
    ready: sessionData !== undefined && sessionData !== null,
    offline,
    reconnecting: connection.hasEverConnected && !connection.isWebSocketConnected,
    shortCode: session?.shortCode ?? null,
    qrDataUrl,
    capture: sessionData?.capture ?? null,
    photoUrls: (sessionData?.photos ?? []).map((photo) => photo.url).filter((url): url is string => url !== null),
    requestCapture,
    // Clear the old session's QR and code here rather than in the mint effect:
    // this is the event that ends a guest's run, and nothing of theirs should
    // still be on screen while the next session is minted.
    newSession: () => {
      setSession(null);
      setQrDataUrl(null);
      setOffline(false);
      setGeneration((g) => g + 1);
    },
  };

  return <KioskView booth={booth} shotCount={shotCount} />;
}

// The Pi's timeline, simulated: 3s countdown, shutter, upload, frame lands.
const MOCK_TIMELINE = { capturing: 3000, uploading: 3600, complete: 4200 };

function MockKiosk({ shotCount }: { shotCount: number }) {
  const [capture, setCapture] = useState<KioskBooth['capture']>(null);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const seq = useRef(0);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const pending = timers;
    void makeQr(`${window.location.origin}/s/demo`).then(setQrDataUrl);
    return () => pending.current.forEach(window.clearTimeout);
  }, []);

  const requestCapture = useCallback(async () => {
    const requestId = `mock-${++seq.current}`;
    const at = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms));

    setCapture({ requestId, status: 'counting_down', error: null });
    at(MOCK_TIMELINE.capturing, () => setCapture({ requestId, status: 'capturing', error: null }));
    at(MOCK_TIMELINE.uploading, () => setCapture({ requestId, status: 'uploading', error: null }));
    at(MOCK_TIMELINE.complete, () => {
      setPhotoUrls((prev) => [...prev, makeMockPhoto(prev.length + 1)]);
      setCapture({ requestId, status: 'complete', error: null });
    });

    return requestId;
  }, []);

  const newSession = useCallback(() => {
    timers.current.forEach(window.clearTimeout);
    timers.current = [];
    setCapture(null);
    setPhotoUrls([]);
  }, []);

  const booth: KioskBooth = {
    ready: true,
    offline: false,
    reconnecting: false,
    shortCode: 'PB-DEMO',
    qrDataUrl,
    capture,
    photoUrls,
    requestCapture,
    newSession,
  };

  return <KioskView booth={booth} shotCount={shotCount} demo />;
}

// Both adapters share the run loop and the screen; only where the booth's state
// comes from differs.
function KioskView({ booth, shotCount, demo = false }: { booth: KioskBooth; shotCount: number; demo?: boolean }) {
  const run = useKioskRun(booth, shotCount);

  return (
    <KioskScreen
      phase={run.phase}
      shotCount={shotCount}
      photoUrls={booth.photoUrls}
      shortCode={booth.shortCode}
      qrDataUrl={booth.qrDataUrl}
      ready={booth.ready}
      offline={booth.offline}
      reconnecting={booth.reconnecting}
      onStart={run.start}
      onRetry={run.retry}
      onFinishEarly={run.finishEarly}
      onNextGuest={run.nextGuest}
      demo={demo}
    />
  );
}
