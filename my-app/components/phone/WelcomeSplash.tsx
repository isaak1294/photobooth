// Full-screen welcome shown right after the QR scan lands, then fades out to
// reveal the booth controls. Rendered during SSR too, so it doubles as the
// loading cover while the session subscription connects.

type WelcomeSplashProps = {
  stage: 'showing' | 'leaving';
};

export function WelcomeSplash({ stage }: WelcomeSplashProps) {
  return (
    <div
      aria-hidden
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#0b0b14] transition-opacity duration-500 motion-reduce:transition-none ${
        stage === 'leaving' ? 'pointer-events-none opacity-0' : 'opacity-100'
      }`}
    >
      {/* Flex-centered wrapper so the glow's keyframes only touch scale/opacity
          and can't fight the centering transform. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-[80vh] w-[80vh] rounded-full bg-[radial-gradient(circle,rgba(217,70,239,0.28),rgba(11,11,20,0)_65%)] motion-safe:animate-[splash-glow_1.2s_ease-out_both]" />
      </div>
      <span className="relative text-6xl text-fuchsia-300 motion-safe:animate-[splash-pop_0.7s_cubic-bezier(0.2,1.4,0.4,1)_both]">
        ✦
      </span>
      <p className="relative mt-6 text-sm font-medium tracking-[0.3em] text-white/50 uppercase motion-safe:animate-[splash-rise_0.7s_ease-out_0.25s_both]">
        Welcome to
      </p>
      <h1 className="relative mt-2 text-4xl font-black tracking-tight text-white motion-safe:animate-[splash-rise_0.7s_ease-out_0.4s_both]">
        AI Photobooth
      </h1>
    </div>
  );
}
