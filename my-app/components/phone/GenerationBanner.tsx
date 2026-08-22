// Thin sticky bar pinned to the top of the phone page whenever an AI render is
// in flight — visible no matter which photo is selected or how far the guest
// has scrolled. Flips to a "ready" (or "failed") notice when the render they
// asked for lands; tapping always jumps to the relevant photo.

export type BannerState =
  | { kind: 'working'; label: string }
  | { kind: 'ready'; label: string }
  | { kind: 'failed'; label: string }
  | null;

type GenerationBannerProps = {
  state: BannerState;
  onTap: () => void;
};

export function GenerationBanner({ state, onTap }: GenerationBannerProps) {
  if (state === null) return null;

  const tone =
    state.kind === 'working'
      ? 'border-fuchsia-500/40 bg-fuchsia-600/90'
      : state.kind === 'ready'
        ? 'border-emerald-400/40 bg-emerald-600/90'
        : 'border-red-400/40 bg-red-600/90';

  return (
    <div className="sticky top-0 z-30 -mx-5" role="status" aria-live="polite">
      <button
        type="button"
        onClick={onTap}
        className={`flex w-full items-center justify-center gap-2 border-b px-5 py-2 text-xs font-semibold text-white backdrop-blur ${tone}`}
      >
        <span
          aria-hidden
          className={state.kind === 'working' ? 'animate-pulse motion-reduce:animate-none' : ''}
        >
          ✦
        </span>
        <span className={state.kind === 'working' ? 'animate-pulse motion-reduce:animate-none' : ''}>
          {state.label}
        </span>
      </button>
    </div>
  );
}
