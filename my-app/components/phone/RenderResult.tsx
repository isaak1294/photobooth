/* eslint-disable @next/next/no-img-element */

export type RenderStatus = 'queued' | 'processing' | 'done' | 'failed';

export type RenderResultItem = {
  _id: string;
  styleId: string;
  status: RenderStatus;
  outputUrl: string | null;
};

type RenderResultProps = {
  /** All renders for the selected photo, oldest → newest. */
  renders: RenderResultItem[];
  styleNameOf: (styleId: string) => string;
  retryDisabled: boolean;
  onRetry: (styleId: string) => void;
};

// AI results for the selected photo. The newest render is the hero; earlier
// finished ones stay reachable in a small rail so trying a second style never
// throws away the first.
export function RenderResult({ renders, styleNameOf, retryDisabled, onRetry }: RenderResultProps) {
  if (renders.length === 0) return null;

  const hero = renders[renders.length - 1];
  const heroName = styleNameOf(hero.styleId);
  const earlierDone = renders.slice(0, -1).filter((r) => r.status === 'done' && r.outputUrl !== null);

  return (
    <section className="flex flex-col gap-3" aria-labelledby="render-result-title">
      {hero.status === 'queued' || hero.status === 'processing' ? (
        <div
          className="rounded-3xl border border-fuchsia-500/30 bg-fuchsia-500/10 p-6 text-center"
          aria-live="polite"
        >
          <h2 id="render-result-title" className="font-semibold">
            Creating your {heroName} photo
          </h2>
          <p className="mt-2 animate-pulse text-sm text-white/55 motion-reduce:animate-none">
            {hero.status === 'queued' ? 'Your edit is in line…' : 'The AI is painting — usually under a minute.'}
          </p>
        </div>
      ) : hero.status === 'failed' ? (
        <div className="rounded-3xl border border-red-500/30 bg-red-500/10 p-5" role="alert">
          <h2 id="render-result-title" className="font-semibold text-red-300">
            The AI edit didn&apos;t finish
          </h2>
          <p className="mt-2 text-sm text-red-300/80">Please try the {heroName} style again.</p>
          <button
            type="button"
            onClick={() => onRetry(hero.styleId)}
            disabled={retryDisabled}
            className="mt-4 rounded-xl bg-red-500/80 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            Try again
          </button>
        </div>
      ) : !hero.outputUrl ? (
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 text-sm text-white/55" role="status">
          Your edited photo is finishing up…
        </div>
      ) : (
        <>
          <div className="flex items-baseline justify-between">
            <h2 id="render-result-title" className="font-semibold">
              Your AI photo
            </h2>
            <span className="text-xs text-white/45">{heroName}</span>
          </div>
          <img
            src={hero.outputUrl}
            alt={`AI-generated ${heroName} photobooth result`}
            className="w-full rounded-3xl border border-white/10"
          />
          <a
            href={hero.outputUrl}
            download={`photobooth-${heroName.toLowerCase().replaceAll(' ', '-')}.jpg`}
            target="_blank"
            rel="noreferrer"
            className="rounded-2xl border border-white/20 px-6 py-3.5 text-center font-semibold text-white/90 transition-colors hover:border-white/40"
          >
            Download photo
          </a>
        </>
      )}

      {earlierDone.length > 0 && (
        <div className="mt-1">
          <p className="mb-2 text-xs text-white/45">Earlier styles for this photo</p>
          <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1">
            {earlierDone.map((render) => (
              <a
                key={render._id}
                href={render.outputUrl!}
                target="_blank"
                rel="noreferrer"
                className="w-24 shrink-0 snap-start"
                aria-label={`Open ${styleNameOf(render.styleId)} result`}
              >
                <img
                  src={render.outputUrl!}
                  alt=""
                  loading="lazy"
                  className="aspect-square w-24 rounded-xl border border-white/10 object-cover"
                />
                <span className="mt-1 block truncate text-center text-[11px] text-white/50">
                  {styleNameOf(render.styleId)}
                </span>
              </a>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
