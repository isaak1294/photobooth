// Full-screen welcome shown right after the QR scan lands, then fades out to
// reveal the booth controls. Rendered during SSR too, so it doubles as the
// loading cover while the session subscription connects.

import { AmberGlow } from '../AmberGlow';

type WelcomeSplashProps = {
  stage: 'showing' | 'leaving';
};

export function WelcomeSplash({ stage }: WelcomeSplashProps) {
  return (
    <div
      aria-hidden
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#fafafa] transition-opacity duration-500 motion-reduce:transition-none ${
        stage === 'leaving' ? 'pointer-events-none opacity-0' : 'opacity-100'
      }`}
    >
      <AmberGlow sizeVh={80} />
      <p className="text-xs font-medium tracking-[0.3em] text-zinc-400 uppercase motion-safe:animate-[splash-rise_0.6s_ease-out_both]">
        Welcome to
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900 motion-safe:animate-[splash-rise_0.6s_ease-out_0.15s_both]">
        Amber Photobooths
      </h1>
    </div>
  );
}
