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
      className="rounded-3xl border border-white/10 bg-white/[0.04] p-4"
      aria-label="Booth camera"
    >
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-medium text-white/60">Booth camera</p>
        <div
          className="flex rounded-full border border-white/10 bg-white/5 p-1"
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
              className={`min-w-10 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors disabled:opacity-40 ${
                shots === n ? 'bg-fuchsia-500 text-white' : 'text-white/55'
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
          className="flex min-h-16 w-full items-center justify-center rounded-2xl bg-fuchsia-500 px-6 text-lg font-semibold text-white transition-colors hover:bg-fuchsia-400 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-fuchsia-400 disabled:opacity-40 motion-reduce:transition-none"
        >
          {shots === 1 ? 'Take photo' : `Take ${shots} photos`}
        </button>
      )}

      <div aria-live="polite" aria-atomic="true">
        {burst && (
          <p className="mt-3 text-center text-sm text-white/50">
            Photo {burst.index} of {burst.total}
          </p>
        )}
        {phase.kind === 'failed' && (
          <p className="mt-3 text-center text-sm text-red-400" role="alert">
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
      className="flex min-h-16 w-full items-center justify-center rounded-2xl border border-fuchsia-500/40 bg-fuchsia-500/10 px-6"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {phase.kind === 'starting' && <Pulse>Connecting to booth…</Pulse>}
      {phase.kind === 'counting_down' && (
        <span className="flex items-baseline gap-3">
          <span className="text-sm font-medium text-white/60">Look at the booth</span>
          {/* Key on the digit so each tick re-mounts and re-plays the pop-in. */}
          <span
            key={phase.secondsLeft ?? 'go'}
            className="animate-[ping_0.15s_ease-out_1] text-4xl leading-none font-black text-fuchsia-300 motion-reduce:animate-none"
          >
            {phase.secondsLeft === null || phase.secondsLeft <= 0 ? '…' : phase.secondsLeft}
          </span>
        </span>
      )}
      {phase.kind === 'capturing' && <span className="text-2xl font-black tracking-tight">Smile!</span>}
      {phase.kind === 'uploading' && <Pulse>Sending your photo…</Pulse>}
      {phase.kind === 'saved' && <span className="text-lg font-bold text-fuchsia-300">Saved ✓</span>}
    </div>
  );
}

function Pulse({ children }: { children: React.ReactNode }) {
  return <span className="animate-pulse font-medium text-white/70 motion-reduce:animate-none">{children}</span>;
}
