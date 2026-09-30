'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useQuery } from 'convex/react';
import { SetupNeeded } from '@/components/SetupNeeded';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import {
  androidPosUrl,
  describePosError,
  detectPosPlatform,
  encodePosState,
  formatMoney,
  iosPosUrl,
  type PosPlatform,
} from '@/lib/squarePos';

// The operator's till. Opened in Safari/Chrome on the phone that has the Square
// POS app signed in and the Reader paired. Lists the latest sessions (the kiosk
// shows its code in the top-right chip), one Charge button each. Tapping hands
// off to Square POS; Square comes back to /pay/callback, which verifies the
// order with Square, marks the session paid, and redirects here with ?result=.
// The kiosk notices within a poll and unlocks its Start button.
//
// Two things this page cannot fix, only explain: it must be served over HTTPS
// (Square refuses any other callback URL), and it must be a real browser tab —
// a Home-Screen web app never receives the callback.

const APPLICATION_ID = process.env.NEXT_PUBLIC_SQUARE_APPLICATION_ID ?? '';
const LOCATION_ID = process.env.NEXT_PUBLIC_SQUARE_LOCATION_ID || undefined;
// If Square POS hasn't taken over the screen by then, it isn't installed / the
// scheme was blocked. iOS gives no error for a scheme nobody handles.
const LAUNCH_TIMEOUT_MS = 2500;

export default function PayPage() {
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) return <SetupNeeded />;
  return <Pay />;
}

type Result = { result: string; code: string | null; error: string | null };

// Browser-only facts, read once on the client and `null` during prerender, via
// the store hook rather than setState-in-an-effect (which the lint forbids).
const noSubscribe = () => () => {};
function useBrowserValue<T>(read: () => T): T | null {
  return useSyncExternalStore(noSubscribe, read, () => null);
}

// The ?result= banner from /pay/callback's redirect. Parsed once and cached, so
// the store snapshot is stable; the URL is cleaned so a reload doesn't re-announce it.
let urlResult: Result | null | undefined;
function readUrlResult(): Result | null {
  if (urlResult === undefined) {
    const params = new URLSearchParams(window.location.search);
    const r = params.get('result');
    urlResult = r ? { result: r, code: params.get('code'), error: params.get('error') } : null;
    if (r) window.history.replaceState(null, '', '/pay');
  }
  return urlResult;
}

function Pay() {
  const config = useQuery(api.payments.config);
  const sessions = useQuery(api.payments.recentSessions);

  const origin = useBrowserValue(() => window.location.origin);
  const platform: PosPlatform = useBrowserValue(() => detectPosPlatform(navigator.userAgent)) ?? 'other';
  const initialResult = useBrowserValue(readUrlResult);
  // `undefined` = show whatever the URL said; set to null once a new charge starts.
  const [resultOverride, setResultOverride] = useState<Result | null | undefined>(undefined);
  const result = resultOverride === undefined ? initialResult : resultOverride;
  const [launching, setLaunching] = useState<string | null>(null);
  const [stuck, setStuck] = useState(false);
  const launchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Square POS taking the foreground is the success signal for the launch.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden' && launchTimer.current !== null) {
        clearTimeout(launchTimer.current);
        launchTimer.current = null;
        setStuck(false);
      }
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, []);

  const callbackUrl = origin ? `${origin}/pay/callback` : null;
  const httpsOk = callbackUrl !== null && callbackUrl.startsWith('https://');
  const ready =
    config !== undefined && config.priceCents > 0 && APPLICATION_ID !== '' && httpsOk && platform !== 'other';

  function charge(sessionId: Id<'sessions'>, shortCode: string) {
    if (!config || !callbackUrl) return;
    const c = {
      applicationId: APPLICATION_ID,
      amountCents: config.priceCents,
      currency: config.currency,
      callbackUrl,
      state: encodePosState({ surface: 'pay', sessionId }),
      note: `Photobooth ${shortCode}`,
      locationId: LOCATION_ID,
      allowCash: config.cashAllowed,
    };
    const url = platform === 'android' ? androidPosUrl(c) : iosPosUrl(c);
    setResultOverride(null);
    setStuck(false);
    setLaunching(shortCode);
    if (launchTimer.current !== null) clearTimeout(launchTimer.current);
    launchTimer.current = setTimeout(() => {
      launchTimer.current = null;
      if (document.visibilityState === 'visible') {
        setStuck(true);
        setLaunching(null);
      }
    }, LAUNCH_TIMEOUT_MS);
    window.location.assign(url);
  }

  return (
    <main className="min-h-dvh bg-pop-yellow px-4 pb-16 pt-6 text-pop-ink">
      <header className="mb-5 flex items-baseline justify-between">
        <span className="font-display text-3xl">
          POP<span className="text-pop-pink">FLASH</span>
        </span>
        <span className="border-2 border-pop-ink bg-pop-paper px-2 py-0.5 text-xs font-black uppercase shadow-pop-sm">
          Till
        </span>
      </header>

      {result && <ResultBanner {...result} />}

      {stuck && (
        <Notice tone="pink" title="Square POS didn’t open">
          Is the Square Point of Sale app installed and signed in on this phone? Open it once, then try again.
        </Notice>
      )}

      {config === undefined ? (
        <p className="font-bold">Loading…</p>
      ) : config.priceCents === 0 ? (
        <Notice tone="paper" title="Payments are off">
          Set <code className="font-mono">SQUARE_PRICE_CENTS</code> on the Convex deployment (e.g. 500 for $5) to turn
          them on. The kiosk shoots for free until then.
        </Notice>
      ) : (
        <>
          {APPLICATION_ID === '' && (
            <Notice tone="pink" title="No Square Application ID">
              Set <code className="font-mono">NEXT_PUBLIC_SQUARE_APPLICATION_ID</code> in{' '}
              <code className="font-mono">.env.local</code> and restart <code className="font-mono">next dev</code>.
            </Notice>
          )}
          {!config.verifiable && (
            <Notice tone="pink" title="Deployment can’t verify orders">
              <code className="font-mono">SQUARE_ACCESS_TOKEN</code> and{' '}
              <code className="font-mono">SQUARE_LOCATION_ID</code> must be set on Convex, or every charge will be
              recorded as failed.
            </Notice>
          )}
          {callbackUrl !== null && !httpsOk && (
            <Notice tone="pink" title="Not HTTPS">
              Square only calls back to an HTTPS URL. This page is at <code className="font-mono">{origin}</code>; open
              the deployed host (or a tunnel) on this phone instead.
            </Notice>
          )}
          {platform === 'other' && (
            <Notice tone="paper" title="Open this on the Square phone">
              Charging works from iOS or Android with the Square POS app installed. This browser is neither.
            </Notice>
          )}

          <p className="mb-3 text-sm font-bold">
            {formatMoney(config.priceCents, config.currency)} per session
            {config.cashAllowed ? ' · card or cash' : ' · card only'}. Match the code on the kiosk’s top-right chip.
          </p>

          <ul className="flex flex-col gap-3">
            {sessions === undefined && <li className="font-bold">Loading sessions…</li>}
            {sessions !== undefined && sessions.length === 0 && (
              <li className="font-bold">No sessions yet — the kiosk mints one when it boots.</li>
            )}
            {sessions?.map((s) => {
              const settled = s.prepaid || s.payment?.status === 'paid' || s.payment?.status === 'unverified';
              const isLaunching = launching === s.shortCode;
              return (
                <li
                  key={s.sessionId}
                  className={`border-4 border-pop-ink p-4 shadow-pop-md ${settled ? 'bg-pop-lime' : 'bg-pop-paper'}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-mono text-2xl font-black">{s.shortCode}</div>
                      <div className="text-xs font-bold uppercase opacity-70">
                        <Age at={s.createdAt} />
                        {s.photos > 0 ? ` · ${s.photos} shot${s.photos === 1 ? '' : 's'}` : ''}
                      </div>
                    </div>
                    {settled ? (
                      <span className="font-display text-xl uppercase">
                        {s.prepaid ? 'Prepaid' : s.payment?.status === 'unverified' ? 'Cash ✓' : 'Paid ✓'}
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={!ready || isLaunching}
                        onClick={() => charge(s.sessionId, s.shortCode)}
                        className="cursor-pointer border-4 border-pop-ink bg-pop-ink px-5 py-3 font-display text-lg uppercase text-pop-yellow shadow-pop-pink transition-all active:translate-x-[6px] active:translate-y-[6px] active:shadow-none disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {isLaunching ? 'Opening Square…' : `Charge ${formatMoney(config.priceCents, config.currency)}`}
                      </button>
                    )}
                  </div>
                  {s.payment?.status === 'failed' && (
                    <p className="mt-2 border-t-2 border-pop-ink pt-2 text-sm font-bold">
                      ⚠ Last attempt: {s.payment.error ? describePosError(s.payment.error) : 'failed'}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>

          {callbackUrl && (
            <p className="mt-8 text-xs font-bold opacity-70">
              Registered Web Callback URL must be exactly <code className="font-mono">{callbackUrl}</code> (Square
              Developer Console → your app → Point of Sale API → Web).
            </p>
          )}
        </>
      )}
    </main>
  );
}

function ResultBanner({ result, code, error }: Result) {
  if (result === 'paid' || result === 'unverified') {
    return (
      <Notice tone="lime" title={`${code ?? 'Session'} is paid`}>
        {result === 'unverified' ? 'Recorded as cash. ' : ''}The kiosk unlocks in a moment.
      </Notice>
    );
  }
  return (
    <Notice tone="pink" title={`${code ?? 'Charge'} did not go through`}>
      {error ? describePosError(error) : 'Unknown error'}
    </Notice>
  );
}

function Notice({
  tone,
  title,
  children,
}: {
  tone: 'lime' | 'pink' | 'paper';
  title: string;
  children: React.ReactNode;
}) {
  const bg = tone === 'lime' ? 'bg-pop-lime' : tone === 'pink' ? 'bg-pop-pink text-pop-paper' : 'bg-pop-paper';
  return (
    <div role={tone === 'pink' ? 'alert' : 'status'} className={`mb-4 border-4 border-pop-ink p-4 shadow-pop-md ${bg}`}>
      <div className="font-display text-xl uppercase">{title}</div>
      <p className="mt-1 text-sm font-bold">{children}</p>
    </div>
  );
}

function Age({ at }: { at: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);
  const mins = Math.max(0, Math.round((now - at) / 60_000));
  return <>{mins === 0 ? 'just now' : mins < 60 ? `${mins} min ago` : `${Math.round(mins / 60)} h ago`}</>;
}
