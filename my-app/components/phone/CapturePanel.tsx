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
    <section
      className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm"
      aria-label="Booth camera"
    >
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-medium text-zinc-500">Booth camera</p>
        <div
          className="flex rounded-lg bg-zinc-100 p-1"
          role="radiogroup"
          aria-label="Photos per press"
        >
          {SHOT_CHOICES.map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={shots === n}
              onClick={() => onShotsChange(n)}
              disabled={busy}
              className={`min-w-10 rounded-md px-3 py-1 text-sm font-medium transition-colors disabled:opacity-40 ${
                shots === n ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500'
              }`}
            >
              {n}×
            </button>
          ))}
        </div>
      </div>

      {busy ? <StatusSlot phase={phase} /> : (
        <button
          type="button"
          onClick={onCapture}
          disabled={disabled}
          className="flex min-h-12 w-full items-center justify-center rounded-lg bg-zinc-900 px-6 text-base font-medium text-white transition-colors hover:bg-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-zinc-900 disabled:opacity-40 motion-reduce:transition-none"
        >
          {shots === 1 ? 'Take photo' : `Take ${shots} photos`}
        </button>
      )}

      <div aria-live="polite" aria-atomic="true">
        {burst && (
          <p className="mt-3 text-center text-sm text-zinc-500">
            Photo {burst.index} of {burst.total}
          </p>
        )}
        {phase.kind === 'failed' && (
          <p className="mt-3 text-center text-sm text-red-600" role="alert">
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
      className="flex min-h-12 w-full items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 px-6"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {phase.kind === 'starting' && <Pulse>Connecting to booth…</Pulse>}
      {phase.kind === 'counting_down' && (
        <span className="flex items-baseline gap-3">
          <span className="text-sm font-medium text-zinc-500">Look at the booth</span>
          {/* Key on the digit so each tick re-mounts and re-plays the pop-in. */}
          <span
            key={phase.secondsLeft ?? 'go'}
            className="animate-[ping_0.15s_ease-out_1] text-3xl leading-none font-semibold text-zinc-900 motion-reduce:animate-none"
          >
            {phase.secondsLeft === null || phase.secondsLeft <= 0 ? '…' : phase.secondsLeft}
          </span>
        </span>
      )}
      {phase.kind === 'capturing' && <span className="text-xl font-semibold tracking-tight">Smile!</span>}
      {phase.kind === 'uploading' && <Pulse>Sending your photo…</Pulse>}
      {phase.kind === 'saved' && <span className="text-base font-semibold text-emerald-600">Saved ✓</span>}
    </div>
  );
}

function Pulse({ children }: { children: React.ReactNode }) {
  return <span className="animate-pulse font-medium text-zinc-500 motion-reduce:animate-none">{children}</span>;
}
