import Link from 'next/link';

// Landing page. The real surfaces:
//   /booth — fullscreen kiosk showing the QR handoff
//   /s/[token] — the phone experience opened from the QR
export default function Home() {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6 text-center">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-1/3 left-1/2 h-[120vh] w-[120vh] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(217,70,239,0.18),rgba(11,11,20,0)_65%)]"
      />
      <div className="relative flex flex-col items-center gap-5">
        <h1 className="text-5xl font-black tracking-tight">AI Photobooth</h1>
        <p className="max-w-sm text-white/60">
          Guests join by scanning the QR on the booth screen — everything else happens on their phone.
        </p>
        <Link
          href="/booth"
          className="mt-2 rounded-full bg-fuchsia-500 px-7 py-3 font-semibold text-white transition-colors hover:bg-fuchsia-400"
        >
          Open the booth screen
        </Link>
      </div>
    </main>
  );
}
