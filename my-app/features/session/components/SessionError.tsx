type SessionErrorProps = {
  kind: 'invalid' | 'expired';
};

const errorContent = {
  invalid: {
    title: 'Session not found',
    message: 'This link is not connected to a photobooth session.',
  },
  expired: {
    title: 'Session expired',
    message: 'This photobooth session is no longer available.',
  },
};

export function SessionError({ kind }: SessionErrorProps) {
  const content = errorContent[kind];

  return (
    <main className="mx-auto flex min-h-dvh max-w-md items-center bg-white px-6 py-12">
      <section className="w-full text-center">
        <p className="mb-3 text-sm font-medium text-slate-500">AI Photobooth</p>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">{content.title}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">{content.message}</p>
        <p className="mt-6 text-sm text-slate-500">Scan the QR code currently shown on the booth.</p>
      </section>
    </main>
  );
}
