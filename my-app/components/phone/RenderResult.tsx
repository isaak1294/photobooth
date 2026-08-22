/* eslint-disable @next/next/no-img-element */

export type RenderStatus = 'queued' | 'processing' | 'done' | 'failed';

export type RenderResultItem = {
  _id: string;
  styleId: string;
  status: RenderStatus;
  outputUrl: string | null;
};

type RenderResultProps = {
  render: RenderResultItem | null;
  styleName: string;
  retryDisabled: boolean;
  onRetry: () => void;
};

export function RenderResult({ render, styleName, retryDisabled, onRetry }: RenderResultProps) {
  if (render === null) return null;

  if (render.status === 'queued' || render.status === 'processing') {
    return (
      <section
        className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center"
        aria-labelledby="render-result-title"
        aria-live="polite"
      >
        <h2 id="render-result-title" className="font-semibold text-slate-900">
          Creating your {styleName} photo
        </h2>
        <p className="mt-2 text-sm text-slate-500">
          {render.status === 'queued' ? 'Your edit is in line.' : 'The AI is working. This may take about a minute.'}
        </p>
      </section>
    );
  }

  if (render.status === 'failed') {
    return (
      <section className="rounded-2xl border border-red-200 bg-red-50 p-5" aria-labelledby="render-result-title">
        <h2 id="render-result-title" className="font-semibold text-red-900">
          The AI edit didn&apos;t finish
        </h2>
        <p className="mt-2 text-sm text-red-700">Please try the {styleName} style again.</p>
        <button
          type="button"
          onClick={onRetry}
          disabled={retryDisabled}
          className="mt-4 rounded-xl bg-red-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Try again
        </button>
      </section>
    );
  }

  if (!render.outputUrl) {
    return (
      <section className="rounded-2xl bg-slate-100 p-5 text-sm text-slate-600" role="status">
        Your edited photo is finishing up...
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3" aria-labelledby="render-result-title">
      <div className="flex items-baseline justify-between">
        <h2 id="render-result-title" className="font-semibold text-slate-900">
          Your AI photo
        </h2>
        <span className="text-xs text-slate-500">{styleName}</span>
      </div>
      <img src={render.outputUrl} alt={`AI-generated ${styleName} photobooth result`} className="w-full rounded-2xl" />
      <a
        href={render.outputUrl}
        download={`photobooth-${styleName.toLowerCase().replaceAll(' ', '-')}.jpg`}
        target="_blank"
        rel="noreferrer"
        className="rounded-2xl border border-slate-300 px-6 py-3 text-center font-semibold text-slate-800"
      >
        Download photo
      </a>
    </section>
  );
}
