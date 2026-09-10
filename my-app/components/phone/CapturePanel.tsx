// The shutter card: shots-per-press selector, the big capture button, and the
// live status the button morphs into while the booth works. One fixed-height
// slot swaps between button and status so the layout never jumps mid-capture.

export type CapturePhase =
  | { kind: 'idle' }
  | { kind: 'starting' } // requestCapture in flight
  | { kind: 'counting_down'; secondsLeft: number | null }
  | { kind: 'capturing' }
  | { kind: 'uploading' }
  | { kind: 'saved' } // brief flash after the frame lands, then back to idle
  | { kind: 'failed'; error: string | null };

type CapturePanelProps = {
  phase: CapturePhase;
  shots: number;
  onShotsChange: (shots: number) => void;
  /** Set during a multi-shot run, e.g. { index: 2, total: 3 }. */
  burst: { index: number; total: number } | null;
  disabled: boolean;
  onCapture: () => void;
};

const SHOT_CHOICES = [1, 2, 3];

export function CapturePanel({ phase, shots, onShotsChange, burst, disabled, onCapture }: CapturePanelProps) {
  const busy = phase.kind !== 'idle' && phase.kind !== 'failed';

  return (
    <section className="pop-frame bg-pop-paper p-4" aria-label="Booth camera">
      <div className="mb-3 flex items-center justify-between">
        <p className="font-display text-sm uppercase">Booth camera</p>
        <div className="flex gap-1.5" role="radiogroup" aria-label="Photos per press">
          {SHOT_CHOICES.map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={shots === n}
              onClick={() => onShotsChange(n)}
              disabled={busy}
              className={`min-w-10 border-2 border-pop-ink px-3 py-1 text-sm font-bold disabled:opacity-40 ${
                shots === n ? 'bg-pop-ink text-pop-yellow shadow-pop-sm' : 'bg-pop-paper'
              }`}
            >
              {n}×
            </button>
          ))}
        </div>
      </div>

      {busy ? (
        <StatusSlot phase={phase} />
      ) : (
        <button
          type="button"
          onClick={onCapture}
          disabled={disabled}
          className="pop-press flex min-h-14 w-full items-center justify-center border-4 border-pop-ink bg-pop-ink px-6 font-display text-lg text-pop-yellow uppercase shadow-pop-pink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-pop-ink disabled:opacity-40"
        >
          {shots === 1 ? 'Take photo' : `Take ${shots} photos`}
        </button>
      )}

      <div aria-live="polite" aria-atomic="true">
        {burst && (
          <p className="mt-3 text-center text-sm font-bold uppercase">
            Photo {burst.index} of {burst.total}
          </p>
        )}
        {phase.kind === 'failed' && (
          <p className="mt-3 border-2 border-pop-ink bg-pop-pink px-3 py-2 text-center text-sm font-bold text-pop-paper" role="alert">
            {phase.error ?? "That photo didn't work."} Tap the button to try again.
          </p>
        )}
      </div>
    </section>
  );
}

function StatusSlot({ phase }: { phase: CapturePhase }) {
  return (
    <div
      className="flex min-h-14 w-full items-center justify-center border-4 border-dashed border-pop-ink bg-pop-yellow px-6"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {phase.kind === 'starting' && <Pulse>Connecting to booth…</Pulse>}
      {phase.kind === 'counting_down' && (
        <span className="flex items-baseline gap-3">
          <span className="text-sm font-bold uppercase">Look at the booth</span>
          {/* Key on the digit so each tick re-mounts and re-plays the slam. */}
          <span
            key={phase.secondsLeft ?? 'go'}
            className="font-display text-3xl leading-none motion-safe:animate-[pop-count_0.35s_ease-out]"
          >
            {phase.secondsLeft === null || phase.secondsLeft <= 0 ? '…' : phase.secondsLeft}
          </span>
        </span>
      )}
      {phase.kind === 'capturing' && <span className="font-display text-xl uppercase">Smile!</span>}
      {phase.kind === 'uploading' && <Pulse>Sending your photo…</Pulse>}
      {phase.kind === 'saved' && (
        <span className="-rotate-2 border-2 border-pop-ink bg-pop-lime px-3 py-1 font-display text-base uppercase motion-safe:animate-[pop-stamp_0.3s_ease-out]">
          Got it!
        </span>
      )}
    </div>
  );
}

function Pulse({ children }: { children: React.ReactNode }) {
  return <span className="animate-pulse text-sm font-bold uppercase motion-reduce:animate-none">{children}</span>;
}
