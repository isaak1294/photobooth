export function SessionLoading() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md items-center justify-center bg-white px-6">
      <div className="text-center" role="status" aria-live="polite">
        <div className="mx-auto mb-4 size-2 animate-pulse rounded-full bg-slate-900" />
        <p className="text-sm text-slate-600">Opening your booth session…</p>
      </div>
    </main>
  );
}
