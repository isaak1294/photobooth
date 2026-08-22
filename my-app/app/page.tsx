import Link from 'next/link';

// Placeholder landing page. The real surfaces:
//   /booth — fullscreen kiosk (countdown, capture; QR + auto-reset still to come)
//   /s/[token] — the phone gallery opened from the QR
export default function Home() {
  return (
    <main className="p-8 flex flex-col gap-4 max-w-lg mx-auto">
      <h1 className="text-4xl font-bold">AI Photobooth</h1>
      <p className="text-slate-500">
        Backend is up (four tables: sessions, photos, styles, renders). The booth kiosk is live; the phone gallery is
        next.
      </p>
      <Link href="/booth" className="text-fuchsia-600 underline underline-offset-4">
        Open the booth →
      </Link>
    </main>
  );
}
