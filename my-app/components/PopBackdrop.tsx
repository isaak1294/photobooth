// The shared POPFLASH backdrop: a halftone dot grid over the yellow base, plus
// two rotated colour blocks bleeding off opposite corners. Fixed and behind
// everything (-z-10), so no surface needs its own stacking tweaks.
//
// Replaces the old amber radial glow — the system has no soft light in it any
// more; depth comes from hard edges and offset shadows instead.

export function PopBackdrop({ dots = true, blocks = true }: { dots?: boolean; blocks?: boolean }) {
  return (
    <>
      {dots && (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 -z-10 opacity-[0.08]"
          style={{
            backgroundImage: 'radial-gradient(var(--pop-ink) 1.5px, transparent 1.6px)',
            backgroundSize: '22px 22px',
          }}
        />
      )}
      {/* Sized off the SMALLER viewport axis: 46vh on a tall phone is wider
          than the phone, and the block stops being an accent and becomes the
          page. Offsets are a fraction of the size, so the bleed scales too. */}
      {blocks && (
        <>
          <Block size="min(46vh, 40vw)" className="-rotate-12 bg-pop-pink" style={{ bottom: '-14%', left: '-12%' }} />
          <Block size="min(34vh, 30vw)" className="rotate-12 bg-pop-cyan" style={{ top: '-12%', right: '-10%' }} />
        </>
      )}
    </>
  );
}

function Block({ size, className, style }: { size: string; className: string; style: React.CSSProperties }) {
  return (
    <div
      aria-hidden
      style={{ width: size, height: size, ...style }}
      className={`pointer-events-none fixed -z-10 border-4 border-pop-ink ${className}`}
    />
  );
}
