// Placeholder landing page. The real surfaces come next:
//   /booth — fullscreen kiosk (preview, countdown, capture, QR, auto-reset)
//   /s/[token] — the phone gallery opened from the QR
export default function Home() {
  return (
    <main className="p-8 flex flex-col gap-4 max-w-lg mx-auto">
      <h1 className="text-4xl font-bold">AI Photobooth</h1>
      <p className="text-slate-500">
        Backend is up (four tables: sessions, photos, styles, renders). Booth and phone UIs are
        next.
      </p>
    </main>
  );
}
