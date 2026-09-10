// Full-screen welcome shown right after the QR scan lands, then fades out to
// reveal the booth controls. Rendered during SSR too, so it doubles as the
// loading cover while the session subscription connects.

import { PopBackdrop } from '../PopBackdrop';

type WelcomeSplashProps = {
  stage: 'showing' | 'leaving';
};

export function WelcomeSplash({ stage }: WelcomeSplashProps) {
  return (
    <div
      aria-hidden
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-pop-yellow transition-opacity duration-500 motion-reduce:transition-none ${
        stage === 'leaving' ? 'pointer-events-none opacity-0' : 'opacity-100'
      }`}
    >
      <PopBackdrop />
      <p className="border-2 border-pop-ink bg-pop-paper px-3 py-1 text-xs font-bold tracking-[0.25em] uppercase shadow-pop-sm motion-safe:animate-[splash-rise_0.6s_ease-out_both]">
        Welcome to
      </p>
      <h1 className="mt-4 -rotate-2 font-display text-5xl uppercase motion-safe:animate-[splash-rise_0.6s_ease-out_0.15s_both]">
        POP<span className="text-pop-pink">FLASH</span>
      </h1>
    </div>
  );
}
