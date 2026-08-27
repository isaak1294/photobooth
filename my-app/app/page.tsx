import Link from 'next/link';
import { AmberGlow } from '@/components/AmberGlow';

// Landing page. The real surfaces:
//   /booth — fullscreen kiosk showing the QR handoff
//   /s/[token] — the phone experience opened from the QR
export default function Home() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <AmberGlow sizeVh={120} />
      <div className="flex flex-col items-center gap-4">
        <h1 className="text-4xl font-semibold tracking-tight">Amber Photobooths</h1>
        <p className="max-w-sm text-zinc-500">
          Guests join by scanning the QR on the booth screen. Everything else happens on their phone.
        </p>
        <Link
          href="/booth"
          className="mt-2 rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
        >
          Open the booth screen
        </Link>
      </div>
    </main>
  );
}
