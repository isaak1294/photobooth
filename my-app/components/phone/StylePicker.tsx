'use client';

import { useRef } from 'react';

export type AiStyle = {
  _id: string;
  name: string;
  custom: boolean;
};

/** State of the guest's "make a theme from my photo" job, if one is running. */
export type ThemeJob =
  | { status: 'uploading' } // picking the file up off the phone
  | { status: 'deriving' } // GMI vision is reading it (~8s)
  | { status: 'failed'; error: string | null }
  | null;

type StylePickerProps = {
  styles: AiStyle[];
  selectedStyleId: string | null;
  isLoading: boolean;
  isGenerating: boolean;
  isDisabled: boolean;
  error: string | null;
  themeJob: ThemeJob;
  onSelect: (styleId: string) => void;
  onGenerate: () => void;
  onCreateTheme: (file: File) => void;
};

// Style chips + the custom-theme creator. "New from photo" opens the phone's
// picker/camera; the derived theme then appears as one more (session-private)
// chip, so choosing it and rendering it works exactly like a preset.
export function StylePicker({
  styles,
  selectedStyleId,
  isLoading,
  isGenerating,
  isDisabled,
  error,
  themeJob,
  onSelect,
  onGenerate,
  onCreateTheme,
}: StylePickerProps) {
  const fileInput = useRef<HTMLInputElement | null>(null);
  const selectedStyle = styles.find((style) => style._id === selectedStyleId);
  const themeBusy = themeJob !== null && themeJob.status !== 'failed';

  return (
    <section className="flex flex-col gap-3" aria-labelledby="style-picker-title">
      <div>
        <h2 id="style-picker-title" className="font-display text-lg uppercase">
          Pick a style
        </h2>
        <p className="mt-1 text-sm font-bold">
          Or upload any photo, like an invitation or a poster, and we&apos;ll turn it into one.
        </p>
      </div>

      {isLoading ? (
        <p className="text-sm font-bold uppercase" role="status">
          Loading styles…
        </p>
      ) : (
        <div className="flex flex-wrap gap-2 p-1" aria-label="Styles">
          {styles.map((style) => {
            const isSelected = style._id === selectedStyleId;

            return (
              <button
                key={style._id}
                type="button"
                onClick={() => onSelect(style._id)}
                disabled={isDisabled}
                aria-pressed={isSelected}
                className={`border-2 border-pop-ink px-3.5 py-2 text-sm font-bold uppercase disabled:opacity-40 ${
                  isSelected ? 'bg-pop-ink text-pop-yellow shadow-pop' : 'bg-pop-paper shadow-pop-sm'
                }`}
              >
                {style.name}
              </button>
            );
          })}

          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            className="sr-only"
            disabled={isDisabled || themeBusy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              // Clear the value so re-picking the same file fires onChange again.
              event.target.value = '';
              if (file) onCreateTheme(file);
            }}
          />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={isDisabled || themeBusy}
            aria-busy={themeBusy}
            className="border-2 border-dashed border-pop-ink bg-pop-violet px-3.5 py-2 text-sm font-bold uppercase disabled:opacity-50"
          >
            {themeJob?.status === 'uploading'
              ? 'Uploading…'
              : themeJob?.status === 'deriving'
                ? 'Making your theme…'
                : '＋ New from photo'}
          </button>
        </div>
      )}

      {themeJob !== null && themeJob.status !== 'failed' && (
        <p className="animate-pulse text-sm font-bold uppercase motion-reduce:animate-none" role="status">
          {themeJob.status === 'uploading' ? 'Sending your photo…' : 'Reading your photo and writing a theme (~10s)…'}
        </p>
      )}
      {themeJob?.status === 'failed' && (
        <p className="border-2 border-pop-ink bg-pop-pink px-3 py-2 text-sm font-bold text-pop-paper" role="alert">
          {themeJob.error ?? "We couldn't make a theme from that photo."} Try a different one.
        </p>
      )}

      <button
        type="button"
        onClick={onGenerate}
        disabled={isDisabled || selectedStyle === undefined}
        aria-busy={isGenerating}
        className="pop-press min-h-14 border-4 border-pop-ink bg-pop-ink px-6 font-display text-lg text-pop-yellow uppercase shadow-pop-pink disabled:opacity-40"
      >
        {isGenerating ? 'Creating your photo…' : selectedStyle ? `Generate ${selectedStyle.name}` : 'Select a style'}
      </button>

      {error && (
        <p
          className="border-2 border-pop-ink bg-pop-pink px-3 py-2 text-center text-sm font-bold text-pop-paper"
          role="alert"
        >
          {error}
        </p>
      )}
    </section>
  );
}
