// Shown on the booth surfaces when NEXT_PUBLIC_CONVEX_URL is missing, instead of
// a blank crash: the hooks underneath would otherwise throw for want of a
// provider, and "nothing rendered" is a bad way to learn about a setup step.
export function SetupNeeded() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-pop-yellow px-8 text-center">
      <div className="text-7xl">🔌</div>
      <h1 className="font-display text-4xl uppercase sm:text-5xl">Convex isn&rsquo;t connected</h1>
      <p className="max-w-2xl text-lg font-bold">
        NEXT_PUBLIC_CONVEX_URL isn&rsquo;t set.{' '}
        <code className="border-2 border-pop-ink bg-pop-paper px-2 py-0.5 font-mono">.env.local</code> is gitignored, so
        a fresh checkout has to create it:
      </p>
      <pre className="border-4 border-pop-ink bg-pop-paper px-6 py-4 text-left font-mono text-base shadow-pop-md">
        cd my-app{'\n'}
        cp .env.local.example .env.local{'\n'}
        npx next dev
      </pre>
      {/* Not `npx convex dev`: that provisions a LOCAL deployment and rewrites
          the cloud URLs in .env.local to 127.0.0.1, which looks like the app
          half-working against an empty database. */}
      <p className="max-w-2xl font-bold">
        Use <code className="font-mono">npx next dev</code>, not <code className="font-mono">npm run dev</code>. The
        latter starts a local Convex deployment and overwrites those URLs.
      </p>
    </main>
  );
}
