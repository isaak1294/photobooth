'use client';

import { useEffect } from 'react';

// Keep the kiosk screen awake. An iPad left on a stand will otherwise dim and
// lock mid-queue, and the next guest meets a lock screen instead of a button.
//
// Screen Wake Lock is iPadOS 16.4+; where it's missing this is a no-op and the
// device's own auto-lock setting is the fallback (turn it off on the kiosk iPad).
// The lock is released whenever the tab is hidden, so it has to be re-taken when
// the kiosk comes back to the foreground.
export function useWakeLock(enabled = true) {
  useEffect(() => {
    if (!enabled || !('wakeLock' in navigator)) return;

    let sentinel: WakeLockSentinel | null = null;
    let released = false;

    const acquire = async () => {
      if (released || document.visibilityState !== 'visible') return;
      try {
        sentinel = await navigator.wakeLock.request('screen');
      } catch (error) {
        // Denied (low battery, no user gesture yet) — not worth interrupting a run.
        console.warn('[kiosk] screen wake lock unavailable:', error);
      }
    };

    void acquire();
    document.addEventListener('visibilitychange', acquire);

    return () => {
      released = true;
      document.removeEventListener('visibilitychange', acquire);
      void sentinel?.release().catch(() => {});
    };
  }, [enabled]);
}
