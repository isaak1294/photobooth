// Amber radial glow used as the background accent on every surface: a larger
// circle anchored on the viewport's bottom-left corner and a smaller one on the
// top-right. The corner shift is relative to each circle's own size, so the
// offset reads the same on a vertical phone and the wide booth screen. -z-10
// keeps both behind content without the content needing its own stacking
// tweaks. sizeVh sets the overall scale; the two circles derive from it.
export function AmberGlow({ sizeVh = 100 }: { sizeVh?: number }) {
  return (
    <>
      <Circle sizeVh={sizeVh * 1.2} className="bottom-0 left-0 -translate-x-2/5 translate-y-2/5" />
      <Circle sizeVh={sizeVh * 0.6} className="top-0 right-0 translate-x-2/5 -translate-y-2/5" />
    </>
  );
}

function Circle({ sizeVh, className }: { sizeVh: number; className: string }) {
  return (
    <div
      aria-hidden
      style={{ width: `${sizeVh}vh`, height: `${sizeVh}vh` }}
      className={`pointer-events-none fixed -z-10 rounded-full bg-[radial-gradient(circle,rgba(251,142,36,1),rgba(251,191,36,0)_65%)] ${className}`}
    />
  );
}
