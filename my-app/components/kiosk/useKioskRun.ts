'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// The kiosk's shutter loop: press once, get `shotCount` photos, hand off.
//
// The kiosk is the BOOTH surface — it owns the session and it is the only thing
// driving it — so unlike the phone (which has to reconcile with whatever the
// booth was already doing) this can run a plain state machine and match each
// capture by the requestId the mutation handed back.
//
// Only three things are stored: which shot is in flight, when its countdown
// started, and any error we produced ourselves. Everything the guest sees is
// DERIVED from those plus the booth's live capture row, so the screen and the
// Pi can't disagree, and the only writes are from real events (a press, a timer
// firing, a mutation settling).
//
// Countdown timing: the on-screen 3-2-1 starts the moment the guest presses,
// and the capture request goes out on that same tick. The Pi's own countdown
// (scripts/pi-listener.mjs, COUNTDOWN_MS, 3000 by default) then runs
// concurrently with ours and the shutter fires ~500ms after both hit zero — so
// this lines up with a Pi in its default configuration, and nothing has to be
// reconfigured for the kiosk. Numerals tick on a local clock, so venue Wi-Fi
// can't make them stutter.

export type BoothCaptureStatus = 'pending' | 'counting_down' | 'capturing' | 'uploading' | 'complete' | 'failed';

/** What the run loop needs from a booth — live Convex or the nobooth simulation. */
export type KioskBooth = {
  /** A session exists and its subscription has loaded. */
  ready: boolean;
  /** The session couldn't be minted at all. */
  offline: boolean;
  reconnecting: boolean;
  shortCode: string | null;
  /** QR to the guest's phone surface, pre-generated so the handoff is instant. */
  qrDataUrl: string | null;
  capture: { requestId: string; status: BoothCaptureStatus; error: string | null } | null;
  photoUrls: string[];
  /** Writes the shutter signal; resolves with the capture request's id. */
  requestCapture: () => Promise<string>;
  /** Throw this session away and mint a fresh one for the next guest. */
  newSession: () => void;
};

export type KioskPhase =
  | { kind: 'idle' }
  | { kind: 'countdown'; shot: number; secondsLeft: number }
  | { kind: 'smile'; shot: number }
  | { kind: 'saved'; shot: number }
  | { kind: 'failed'; shot: number; message: string }
  | { kind: 'done' };

// Must match the Pi's COUNTDOWN_MS (3000). See the note above.
const COUNTDOWN_SECONDS = 3;
// How long the "GOT IT" flash holds before the next shot starts.
const SAVED_FLASH_MS = 900;
// Per-stage ceiling. Every stage the Pi reports resets it, so a slow upload
// doesn't trip it — but a listener that never picks the request up, or a camera
// that hangs, surfaces as a real error instead of a screen stuck on "SMILE".
const STAGE_TIMEOUT_MS = 20000;

type Run =
  | { kind: 'idle' }
  | { kind: 'shooting'; shot: number; startedAt: number; requestId: string | null; error: string | null }
  | { kind: 'done' };

export function useKioskRun(booth: KioskBooth, shotCount: number) {
  const [run, setRun] = useState<Run>({ kind: 'idle' });
  // Drives the countdown re-render. The digit itself is derived from the clock,
  // not stored, so a dropped tick can't leave it on the wrong number.
  const [now, setNow] = useState(() => Date.now());

  // `booth` is rebuilt on every render of the adapter, so hold it in a ref:
  // depending on its identity would re-fire every effect below on every render.
  // Only ever read from events and timers, never during render.
  const boothRef = useRef(booth);
  useEffect(() => {
    boothRef.current = booth;
  });

  const fire = useCallback((shot: number) => {
    const startedAt = Date.now();
    setNow(startedAt);
    setRun({ kind: 'shooting', shot, startedAt, requestId: null, error: null });

    boothRef.current.requestCapture().then(
      (requestId) => {
        setRun((prev) => (prev.kind === 'shooting' && prev.shot === shot ? { ...prev, requestId } : prev));
      },
      (error: unknown) => {
        console.error('[kiosk] capture request failed:', error);
        setRun((prev) =>
          prev.kind === 'shooting' && prev.shot === shot ? { ...prev, error: "We couldn't reach the booth." } : prev,
        );
      },
    );
  }, []);

  // --- derive what the guest sees --------------------------------------------
  const capture = booth.capture;
  // The booth's progress on the shot we're actually waiting for. A row for some
  // earlier request (or one whose id hasn't come back yet) tells us nothing.
  const shotCapture =
    run.kind === 'shooting' && run.requestId !== null && capture !== null && capture.requestId === run.requestId
      ? capture
      : null;

  const phase: KioskPhase = (() => {
    if (run.kind === 'idle') return { kind: 'idle' };
    if (run.kind === 'done') return { kind: 'done' };
    if (run.error !== null) return { kind: 'failed', shot: run.shot, message: run.error };
    if (shotCapture?.status === 'failed') {
      return { kind: 'failed', shot: run.shot, message: shotCapture.error ?? "That one didn't take." };
    }
    if (shotCapture?.status === 'complete') return { kind: 'saved', shot: run.shot };

    const left = COUNTDOWN_SECONDS - Math.floor((now - run.startedAt) / 1000);
    // "SMILE" holds past zero until the Pi reports the frame landed, so a slow
    // shutter never leaves the screen ahead of the camera.
    return left > 0 ? { kind: 'countdown', shot: run.shot, secondsLeft: left } : { kind: 'smile', shot: run.shot };
  })();

  // --- timers ------------------------------------------------------------------
  // Countdown ticker. Stops on its own at zero: past that the screen shows
  // "SMILE" until the booth answers, and there is nothing left to count.
  const counting = phase.kind === 'countdown';
  useEffect(() => {
    if (!counting) return;
    const interval = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(interval);
  }, [counting]);

  // "GOT IT" flash, then either the next shot or the handoff.
  const savedShot = phase.kind === 'saved' ? phase.shot : null;
  useEffect(() => {
    if (savedShot === null) return;
    const timer = window.setTimeout(() => {
      if (savedShot >= shotCount) setRun({ kind: 'done' });
      else fire(savedShot + 1);
    }, SAVED_FLASH_MS);
    return () => window.clearTimeout(timer);
  }, [savedShot, shotCount, fire]);

  // Watchdog, keyed on the stage so each one gets its own window.
  const waitingShot = phase.kind === 'countdown' || phase.kind === 'smile' ? phase.shot : null;
  const stageKey = shotCapture?.status ?? 'sent';
  useEffect(() => {
    if (waitingShot === null) return;
    const timer = window.setTimeout(() => {
      setRun((prev) =>
        prev.kind === 'shooting' && prev.shot === waitingShot ? { ...prev, error: "The booth didn't answer." } : prev,
      );
    }, STAGE_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [waitingShot, stageKey]);

  return {
    phase,
    start: useCallback(() => {
      if (run.kind !== 'idle' || !boothRef.current.ready) return;
      fire(1);
    }, [run.kind, fire]),
    retry: useCallback(() => {
      if (phase.kind === 'failed') fire(phase.shot);
    }, [phase, fire]),
    finishEarly: useCallback(() => setRun({ kind: 'done' }), []),
    nextGuest: useCallback(() => {
      boothRef.current.newSession();
      setRun({ kind: 'idle' });
    }, []),
  };
}
