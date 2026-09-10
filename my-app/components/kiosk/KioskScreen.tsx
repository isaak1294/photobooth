/* eslint-disable @next/next/no-img-element -- booth frames are remote Convex
   storage URLs and the QR is a client-generated data: URI; neither is worth a
   next/image loader on a screen that shows four pictures. */
'use client';

import { PopBackdrop } from '@/components/PopBackdrop';
import type { KioskPhase } from './useKioskRun';

// The whole kiosk, presentational. One screen, no scrolling, nothing to read
// from more than a step away that isn't set in Archivo Black.
//
// Guests get exactly one control at a time: START, or after the run, NEXT
// GUEST. Everything else on screen is status.

type KioskScreenProps = {
  phase: KioskPhase;
  shotCount: number;
  photoUrls: string[];
  shortCode: string | null;
  qrDataUrl: string | null;
  /** Session is minted and subscribed — the start button is live. */
  ready: boolean;
  /** Session couldn't be minted at all. */
  offline: boolean;
  reconnecting: boolean;
  onStart: () => void;
  onRetry: () => void;
  onFinishEarly: () => void;
  onNextGuest: () => void;
  /** Shown in the corner in nobooth mode so a demo is never mistaken for a run. */
  demo?: boolean;
};

export function KioskScreen({
  phase,
  shotCount,
  photoUrls,
  shortCode,
  qrDataUrl,
  ready,
  offline,
  reconnecting,
  onStart,
  onRetry,
  onFinishEarly,
  onNextGuest,
  demo = false,
}: KioskScreenProps) {
  const shooting = phase.kind === 'countdown' || phase.kind === 'smile' || phase.kind === 'saved';

  return (
    <main
      className="relative flex h-[100dvh] w-full touch-manipulation flex-col overflow-hidden overscroll-none select-none"
      style={{
        paddingTop: 'max(1rem, env(safe-area-inset-top))',
        paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
        paddingLeft: 'max(1.5rem, env(safe-area-inset-left))',
        paddingRight: 'max(1.5rem, env(safe-area-inset-right))',
      }}
    >
      {/* Dots only: the corner blocks would sit under the countdown numerals,
          and this screen is read from further away than any other. */}
      <PopBackdrop blocks={false} />

      {/* Shutter flash, fired the moment a frame lands. */}
      {phase.kind === 'saved' && (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-40 bg-white opacity-0 motion-safe:animate-[pop-flash_0.45s_ease-out_forwards]"
        />
      )}

      <header className="flex shrink-0 items-center justify-between gap-4">
        <span className="inline-block -rotate-2 font-display text-2xl sm:text-3xl">
          POP<span className="text-pop-pink">FLASH</span>
        </span>
        <div className="flex items-center gap-2">
          {demo && <Chip className="bg-pop-violet">DEMO MODE</Chip>}
          {reconnecting && <Chip className="animate-pulse bg-pop-paper motion-reduce:animate-none">RECONNECTING…</Chip>}
          {shortCode && !shooting && <Chip className="bg-pop-paper font-mono">{shortCode}</Chip>}
        </div>
      </header>

      {offline ? (
        <Offline />
      ) : phase.kind === 'idle' ? (
        <Idle shotCount={shotCount} ready={ready} onStart={onStart} />
      ) : phase.kind === 'failed' ? (
        <Failed
          message={phase.message}
          shot={phase.shot}
          shotCount={shotCount}
          gotSomething={photoUrls.length > 0}
          onRetry={onRetry}
          onFinishEarly={onFinishEarly}
        />
      ) : phase.kind === 'done' ? (
        <Handoff photoUrls={photoUrls} shortCode={shortCode} qrDataUrl={qrDataUrl} onNextGuest={onNextGuest} />
      ) : (
        <Shooting phase={phase} shotCount={shotCount} photoUrls={photoUrls} />
      )}
    </main>
  );
}

function Chip({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`border-2 border-pop-ink px-3 py-1 text-xs font-bold shadow-pop-sm ${className}`}>{children}</span>
  );
}

// --- idle -------------------------------------------------------------------

function Idle({ shotCount, ready, onStart }: { shotCount: number; ready: boolean; onStart: () => void }) {
  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-[4vh]">
      <p className="rotate-1 border-2 border-pop-ink bg-pop-paper px-4 py-2 text-sm font-bold shadow-pop sm:text-base">
        📸 STEP UP · LOOK AT THE CAMERA
      </p>

      {/* The nudge lives on the wrapper: an animation on the button itself would
          outrank pop-press's :active transform and kill the press feedback. */}
      <div className="w-full max-w-4xl motion-safe:animate-[pop-nudge_5s_ease-in-out_infinite]">
        <button
          type="button"
          onClick={onStart}
          disabled={!ready}
          className="pop-press w-full cursor-pointer border-[6px] border-pop-ink bg-pop-ink px-6 py-[6vh] text-pop-yellow shadow-pop-pink disabled:cursor-default disabled:opacity-40"
        >
          <span className="block font-display text-[clamp(3rem,13vw,9rem)] leading-[0.85] uppercase">
            {ready ? 'Take Photos' : 'Warming up…'}
          </span>
          <span className="mt-[2vh] block text-[clamp(0.9rem,2.2vw,1.5rem)] font-bold tracking-wide">
            {shotCount} SHOTS · 3-2-1 EACH TIME
          </span>
        </button>
      </div>

      <p className="max-w-xl text-center text-[clamp(0.9rem,2vw,1.25rem)] font-bold">
        You&rsquo;ll get a QR at the end — scan it and every photo lands on your phone.
      </p>
    </section>
  );
}

// --- shooting ----------------------------------------------------------------

function Shooting({
  phase,
  shotCount,
  photoUrls,
}: {
  phase: Extract<KioskPhase, { kind: 'countdown' | 'smile' | 'saved' }>;
  shotCount: number;
  photoUrls: string[];
}) {
  return (
    <section className="flex flex-1 flex-col items-center justify-between py-[2vh]">
      <Pips shot={phase.shot} shotCount={shotCount} />

      <div className="flex flex-col items-center justify-center" role="status" aria-live="assertive" aria-atomic="true">
        {phase.kind === 'countdown' ? (
          <>
            {/* Keyed on the digit so each tick re-mounts and re-plays the slam. */}
            <span
              key={phase.secondsLeft}
              className="pop-outline block font-display text-[clamp(8rem,40vh,26rem)] leading-none motion-safe:animate-[pop-count_0.35s_ease-out]"
            >
              {phase.secondsLeft}
            </span>
            <p className="mt-[1vh] text-[clamp(1rem,3vw,2rem)] font-bold uppercase">Look at the camera</p>
          </>
        ) : phase.kind === 'smile' ? (
          <span className="pop-outline block font-display text-[clamp(3.5rem,15vh,11rem)] uppercase">Smile!</span>
        ) : (
          <span className="block -rotate-2 border-4 border-pop-ink bg-pop-lime px-[4vw] py-[2vh] font-display text-[clamp(2.5rem,11vh,8rem)] uppercase shadow-pop-lg motion-safe:animate-[pop-stamp_0.3s_ease-out]">
            Got it!
          </span>
        )}
      </div>

      <Strip photoUrls={photoUrls} shotCount={shotCount} />
    </section>
  );
}

function Pips({ shot, shotCount }: { shot: number; shotCount: number }) {
  return (
    <div className="flex shrink-0 items-center gap-4">
      <span className="font-display text-[clamp(1rem,2.6vw,1.75rem)] uppercase">
        Shot {shot} of {shotCount}
      </span>
      <div className="flex gap-2" aria-hidden>
        {Array.from({ length: shotCount }, (_, i) => (
          <span
            key={i}
            className={`h-5 w-5 border-2 border-pop-ink sm:h-6 sm:w-6 ${
              i + 1 < shot ? 'bg-pop-ink' : i + 1 === shot ? 'bg-pop-pink' : 'bg-pop-paper'
            }`}
          />
        ))}
      </div>
    </div>
  );
}

/** Thumbnails of the run so far, with an empty slot per shot still to come. */
function Strip({ photoUrls, shotCount }: { photoUrls: string[]; shotCount: number }) {
  return (
    <div className="flex shrink-0 items-end justify-center gap-3 sm:gap-4">
      {Array.from({ length: shotCount }, (_, i) => {
        const url = photoUrls[i];
        return (
          <div
            key={i}
            className={`h-[12vh] w-[12vh] max-h-28 max-w-28 border-4 border-pop-ink ${
              i % 2 ? 'rotate-2' : '-rotate-2'
            } ${url ? 'bg-pop-paper shadow-pop' : 'border-dashed bg-transparent'}`}
          >
            {url ? (
              <img
                src={url}
                alt=""
                className="h-full w-full object-cover motion-safe:animate-[pop-stamp_0.3s_ease-out]"
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center font-display text-xl opacity-30">
                {i + 1}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// --- handoff -----------------------------------------------------------------

function Handoff({
  photoUrls,
  shortCode,
  qrDataUrl,
  onNextGuest,
}: {
  photoUrls: string[];
  shortCode: string | null;
  qrDataUrl: string | null;
  onNextGuest: () => void;
}) {
  return (
    <section className="flex min-h-0 flex-1 flex-col items-center justify-center gap-[2.5vh] lg:flex-row lg:gap-12">
      {/* Polaroid pile of what we just shot. One strip across when the screen is
          stacked (portrait), 2×2 beside the QR when it isn't. Tiles are sized
          off the smaller axis so four of them always fit the width. */}
      <div className="grid grid-cols-4 gap-3 lg:grid-cols-2 lg:gap-4">
        {photoUrls.slice(0, 4).map((url, i) => (
          <div
            key={url}
            className={`border-4 border-pop-ink bg-pop-paper p-1.5 shadow-pop ${i % 2 ? 'rotate-2' : '-rotate-2'}`}
          >
            <img
              src={url}
              alt={`Photo ${i + 1}`}
              className="h-[min(15vh,17vw)] w-[min(15vh,17vw)] max-h-44 max-w-44 object-cover"
            />
          </div>
        ))}
      </div>

      <div className="flex flex-col items-center">
        <h2 className="text-center font-display text-[clamp(1.75rem,5vh,3.5rem)] leading-none uppercase">
          Scan for your pics
        </h2>
        <p className="mt-2 text-center text-[clamp(0.85rem,1.8vw,1.15rem)] font-bold">
          Every shot, plus AI styles, on your phone.
        </p>

        <div className="mt-[2vh] border-4 border-pop-ink bg-pop-paper p-3 shadow-pop-lg">
          {qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt={shortCode ? `Scan to open session ${shortCode}` : 'Scan for your photos'}
              className="h-[min(30vh,55vw)] w-[min(30vh,55vw)] max-h-80 max-w-80 object-contain"
            />
          ) : (
            <div className="flex h-[min(30vh,55vw)] w-[min(30vh,55vw)] max-h-80 max-w-80 items-center justify-center font-bold">
              Making your code…
            </div>
          )}
        </div>

        {shortCode && (
          <p className="mt-[1.5vh] font-mono text-[clamp(1rem,2.4vw,1.6rem)] font-bold tracking-[0.2em]">{shortCode}</p>
        )}

        <button
          type="button"
          onClick={onNextGuest}
          className="pop-press mt-[3vh] cursor-pointer border-4 border-pop-ink bg-pop-ink px-10 py-4 font-display text-[clamp(1.1rem,2.6vw,1.75rem)] text-pop-yellow uppercase shadow-pop-pink"
        >
          Next guest →
        </button>
      </div>
    </section>
  );
}

// --- failure -----------------------------------------------------------------

function Failed({
  message,
  shot,
  shotCount,
  gotSomething,
  onRetry,
  onFinishEarly,
}: {
  message: string;
  shot: number;
  shotCount: number;
  gotSomething: boolean;
  onRetry: () => void;
  onFinishEarly: () => void;
}) {
  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-[3vh]" role="alert">
      <div className="max-w-3xl -rotate-1 border-4 border-pop-ink bg-pop-pink p-[4vh] text-center shadow-pop-lg">
        <h2 className="pop-outline font-display text-[clamp(2rem,8vh,5rem)] leading-none uppercase">
          That one didn&rsquo;t take
        </h2>
        <p className="mt-[2vh] text-[clamp(0.9rem,2.2vw,1.4rem)] font-bold text-pop-paper">
          {message} (Shot {shot} of {shotCount}.)
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-4">
        <button
          type="button"
          onClick={onRetry}
          className="pop-press cursor-pointer border-4 border-pop-ink bg-pop-ink px-10 py-5 font-display text-[clamp(1.2rem,3vw,2rem)] text-pop-yellow uppercase shadow-pop-md"
        >
          Try again
        </button>
        {gotSomething && (
          <button
            type="button"
            onClick={onFinishEarly}
            className="pop-press cursor-pointer border-4 border-pop-ink bg-pop-paper px-8 py-5 font-display text-[clamp(1rem,2.4vw,1.5rem)] uppercase shadow-pop-md"
          >
            Use what we got
          </button>
        )}
      </div>
    </section>
  );
}

function Offline() {
  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-[3vh] text-center" role="alert">
      <div className="max-w-2xl rotate-1 border-4 border-pop-ink bg-pop-paper p-[5vh] shadow-pop-lg">
        <h2 className="font-display text-[clamp(2rem,7vh,4.5rem)] leading-none uppercase">Booth offline</h2>
        <p className="mt-[2vh] text-[clamp(0.9rem,2.2vw,1.3rem)] font-bold">
          Couldn&rsquo;t start a session. Check the connection, then reload this screen.
        </p>
      </div>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="pop-press cursor-pointer border-4 border-pop-ink bg-pop-ink px-10 py-5 font-display text-[clamp(1.1rem,2.6vw,1.75rem)] text-pop-yellow uppercase shadow-pop-pink"
      >
        Reload
      </button>
    </section>
  );
}
