export type AiStyle = {
  _id: string;
  name: string;
};

type StylePickerProps = {
  styles: AiStyle[];
  selectedStyleId: string | null;
  isLoading: boolean;
  isGenerating: boolean;
  isDisabled: boolean;
  error: string | null;
  onSelect: (styleId: string) => void;
  onGenerate: () => void;
};

export function StylePicker({
  styles,
  selectedStyleId,
  isLoading,
  isGenerating,
  isDisabled,
  error,
  onSelect,
  onGenerate,
}: StylePickerProps) {
  const selectedStyle = styles.find((style) => style._id === selectedStyleId);

  return (
    <section className="flex flex-col gap-3" aria-labelledby="style-picker-title">
      <div>
        <h2 id="style-picker-title" className="font-semibold text-slate-900">
          Choose an AI style
        </h2>
        <p className="mt-1 text-sm text-slate-500">Pick a look, then generate your new photo.</p>
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-500" role="status">
          Loading styles...
        </p>
      ) : styles.length === 0 ? (
        <p className="rounded-xl bg-slate-100 p-4 text-sm text-slate-600">No AI styles are available yet.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2" aria-label="AI styles">
          {styles.map((style) => {
            const isSelected = style._id === selectedStyleId;

            return (
              <button
                key={style._id}
                type="button"
                onClick={() => onSelect(style._id)}
                disabled={isDisabled}
                aria-pressed={isSelected}
                className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-medium text-slate-700 outline-offset-2 transition-colors disabled:opacity-50 aria-pressed:border-slate-950 aria-pressed:bg-slate-950 aria-pressed:text-white"
              >
                {style.name}
              </button>
            );
          })}
        </div>
      )}

      <button
        type="button"
        onClick={onGenerate}
        disabled={isDisabled || selectedStyle === undefined}
        aria-busy={isGenerating}
        className="rounded-2xl bg-foreground px-6 py-4 font-semibold text-background disabled:opacity-50"
      >
        {isGenerating ? 'Creating your photo...' : selectedStyle ? `Generate ${selectedStyle.name}` : 'Select a style'}
      </button>

      {error && (
        <p className="text-center text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
