// Thin sticky bar pinned to the top of the phone page whenever a styled render is
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
      ? 'bg-pop-ink text-pop-yellow'
      : state.kind === 'ready'
        ? 'bg-pop-lime text-pop-ink'
        : 'bg-pop-pink text-pop-paper';

  return (
    <div className="sticky top-0 z-30 -mx-5" role="status" aria-live="polite">
      <button
        type="button"
        onClick={onTap}
        className={`flex w-full items-center justify-center gap-2 border-b-4 border-pop-ink px-5 py-2.5 text-xs font-bold uppercase ${tone}`}
      >
        <span className={state.kind === 'working' ? 'animate-pulse motion-reduce:animate-none' : ''}>
          {state.label}
        </span>
      </button>
    </div>
  );
}
