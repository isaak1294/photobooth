export function SessionLoading() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md items-center justify-center bg-white px-5 sm:px-6">
      <div className="text-center" role="status" aria-live="polite">
        <div
          className="mx-auto mb-4 size-2 animate-pulse rounded-full bg-slate-900 motion-reduce:animate-none"
          aria-hidden="true"
        />
        <p className="text-sm text-slate-600">Opening your booth session…</p>
      </div>
    </main>
  );
}
