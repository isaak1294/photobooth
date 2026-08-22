'use client';

import { useParams } from 'next/navigation';
import { useConvexConnectionState, useMutation, useQuery } from 'convex/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CapturePanel, type CapturePhase } from '@/components/phone/CapturePanel';
import { PhotoGallery } from '@/components/phone/PhotoGallery';
import { RenderResult } from '@/components/phone/RenderResult';
import { StylePicker, type ThemeJob } from '@/components/phone/StylePicker';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';

// Matches the Pi's default COUNTDOWN_MS. Only cosmetic: the numerals tick on a
// local clock, and the Pi's real `capturing` status overrides the display, so a
// mismatch can't desync anything worse than the last digit's timing.
const COUNTDOWN_SECONDS = 3;
// How long "Saved ✓" lingers before the next burst shot / back to idle.
const SAVED_FLASH_MS = 1200;

// The phone surface, opened from the QR at /s/<token>. Everything here is a live
// Convex subscription — photos, theme derivation, and render results appear with
// no refresh.
//
// The capture UI is DERIVED from the subscription on every render rather than
// mirrored into state: local state only records user intent (a press, a
// selection) and timer outcomes (flash dismissed), which keeps the booth's
// lifecycle and the screen from ever disagreeing.
export default function PhonePage() {
  const token = useParams().token as string;
  const session = useQuery(api.sessions.getSession, { token });
  const stylesQuery = useQuery(api.styles.listStyles, { token });
  const themeRequest = useQuery(api.themes.latestThemeRequest, { token });
  const requestCapture = useMutation(api.captures.requestCapture);
  const requestRender = useMutation(api.renders.requestRender);
  const generateUploadUrl = useMutation(api.themes.generateUploadUrl);
  const requestTheme = useMutation(api.themes.requestTheme);
  const connectionState = useConvexConnectionState();
  const isReconnecting = connectionState.hasEverConnected && !connectionState.isWebSocketConnected;

  // --- capture state ---------------------------------------------------------
  // Set on press: the capture request the session showed BEFORE this press, so
  // "starting" can be told apart from that stale request's terminal status.
  const [pressState, setPressState] = useState<{ sinceRequestId: string | null } | null>(null);
  // A completed capture whose "Saved ✓" flash already played.
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<{ requestId: string; left: number } | null>(null);
  const [shots, setShots] = useState(1);
  const [burstInfo, setBurstInfo] = useState<{ index: number; total: number } | null>(null);
  const burstRef = useRef({ remaining: 0, total: 1 });
  // A failed capture from BEFORE this page opened is history, not news; the
  // capture's server-side updatedAt is compared against this to tell them apart.
  const [loadedAt] = useState(() => Date.now());

  // --- selection state ---------------------------------------------------------
  // countAtSelection lets a NEW photo override an explicit pick: once more
  // photos exist than when the guest chose, the default (newest) wins again.
  const [photoChoice, setPhotoChoice] = useState<{ photoId: string; countAtSelection: number } | null>(null);
  const [styleChoice, setStyleChoice] = useState<string | null>(null);

  // --- render request state ----------------------------------------------------
  const [isRenderSubmitting, setIsRenderSubmitting] = useState(false);
  const [renderSubmissionError, setRenderSubmissionError] = useState<string | null>(null);
  const [lastRequestedRenderId, setLastRequestedRenderId] = useState<string | null>(null);
  const renderSubmissionLock = useRef(false);

  // --- custom theme state --------------------------------------------------------
  const [themeUploading, setThemeUploading] = useState(false);
  const [pendingThemeId, setPendingThemeId] = useState<Id<'themeRequests'> | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const capture = session?.capture ?? null;

  const fireCapture = useCallback(async () => {
    try {
      await requestCapture({ token });
    } catch (error) {
      console.error('Capture request failed', error);
      burstRef.current.remaining = 0;
      setBurstInfo(null);
      setPressState(null);
      setRequestError("We couldn't reach the booth.");
    }
  }, [requestCapture, token]);

  // Local 3-2-1 ticker while the Pi reports counting_down.
  const countingRequestId = capture?.status === 'counting_down' ? capture.requestId : null;
  useEffect(() => {
    if (countingRequestId === null) return;
    const started = Date.now();
    const interval = window.setInterval(() => {
      const left = COUNTDOWN_SECONDS - Math.floor((Date.now() - started) / 1000);
      setCountdown((prev) =>
        prev !== null && prev.requestId === countingRequestId && prev.left === left
          ? prev
          : { requestId: countingRequestId, left },
      );
    }, 100);
    return () => window.clearInterval(interval);
  }, [countingRequestId]);

  // After a capture completes, let "Saved ✓" breathe, then either fire the next
  // burst shot or settle back to idle.
  useEffect(() => {
    if (capture === null || capture.status !== 'complete' || pressState === null) return;
    const key = `${capture.requestId}:complete`;
    if (dismissedKey === key) return;

    const timer = window.setTimeout(() => {
      setDismissedKey(key);
      if (burstRef.current.remaining > 0) {
        burstRef.current.remaining -= 1;
        setBurstInfo({
          index: burstRef.current.total - burstRef.current.remaining,
          total: burstRef.current.total,
        });
        // Keep deriving "starting" until the next request row shows up.
        setPressState({ sinceRequestId: capture.requestId });
        void fireCapture();
      } else {
        setBurstInfo(null);
        setPressState(null);
      }
    }, SAVED_FLASH_MS);
    return () => window.clearTimeout(timer);
  }, [capture, pressState, dismissedKey, fireCapture]);

  if (session === undefined) return <Centered>Loading…</Centered>;
  if (session === null) return <Centered>Session not found — scan the booth&apos;s QR again.</Centered>;

  // --- derived capture phase ---------------------------------------------------
  const phase: CapturePhase = (() => {
    if (requestError !== null) return { kind: 'failed', error: requestError };
    if (capture === null) return pressState !== null ? { kind: 'starting' } : { kind: 'idle' };
    const key = `${capture.requestId}:${capture.status}`;

    switch (capture.status) {
      case 'pending':
        return { kind: 'starting' };
      case 'counting_down':
        return {
          kind: 'counting_down',
          secondsLeft: countdown?.requestId === capture.requestId ? countdown.left : COUNTDOWN_SECONDS,
        };
      case 'capturing':
        return { kind: 'capturing' };
      case 'uploading':
        return { kind: 'uploading' };
      case 'complete':
        // A press is in flight and the flash hasn't played: show "Saved ✓".
        // Without a press this status is history (or a reload mid-capture).
        if (pressState !== null && dismissedKey !== key) return { kind: 'saved' };
        return pressState !== null ? { kind: 'starting' } : { kind: 'idle' };
      case 'failed':
        // Pressed again after seeing this failure — we're starting over.
        if (pressState !== null && pressState.sinceRequestId === capture.requestId) {
          return { kind: 'starting' };
        }
        // Only failures that happened since this page opened get the banner.
        if (capture.updatedAt >= loadedAt) return { kind: 'failed', error: capture.error };
        return pressState !== null ? { kind: 'starting' } : { kind: 'idle' };
    }
  })();
  const captureBusy = phase.kind !== 'idle' && phase.kind !== 'failed';

  // --- derived selections --------------------------------------------------------
  const photos = session.photos;
  const latestAvailablePhoto = photos
    .slice()
    .reverse()
    .find((photo) => photo.url !== null);
  const explicitPhoto =
    photoChoice !== null && photos.length <= photoChoice.countAtSelection
      ? photos.find((photo) => photo._id === photoChoice.photoId)
      : undefined;
  const selectedPhoto = explicitPhoto ?? latestAvailablePhoto ?? photos[photos.length - 1];

  const styles = stylesQuery ?? [];
  const activeThemeRequest =
    pendingThemeId !== null && themeRequest?.requestId === pendingThemeId ? themeRequest : null;
  const themeStyleId = activeThemeRequest?.status === 'done' ? activeThemeRequest.styleId : null;
  const selectedStyleId = styleChoice ?? themeStyleId;
  const selectedStyle = styles.find((style) => style._id === selectedStyleId);
  const styleNameOf = (id: string) => styles.find((s) => s._id === id)?.name ?? 'Style';

  const themeJob: ThemeJob = themeUploading
    ? { status: 'uploading' }
    : activeThemeRequest?.status === 'pending' || activeThemeRequest?.status === 'processing'
      ? { status: 'deriving' }
      : activeThemeRequest?.status === 'failed'
        ? { status: 'failed', error: activeThemeRequest.error }
        : uploadError !== null
          ? { status: 'failed', error: uploadError }
          : null;
  const themeBusy = themeJob?.status === 'uploading' || themeJob?.status === 'deriving';

  const rendersForSelectedPhoto = selectedPhoto
    ? session.renders.filter((render) => render.photoId === selectedPhoto._id)
    : [];
  const activeRender = rendersForSelectedPhoto
    .slice()
    .reverse()
    .find((render) => render.status === 'queued' || render.status === 'processing');
  const renderRequestAwaitingSubscription =
    lastRequestedRenderId !== null && !session.renders.some((render) => render._id === lastRequestedRenderId);
  const isGenerating = isRenderSubmitting || renderRequestAwaitingSubscription || activeRender !== undefined;

  // --- handlers --------------------------------------------------------------
  function onCapture() {
    if (captureBusy || isReconnecting) return;
    setRequestError(null);
    burstRef.current = { remaining: shots - 1, total: shots };
    setBurstInfo(shots > 1 ? { index: 1, total: shots } : null);
    setPressState({ sinceRequestId: capture?.requestId ?? null });
    void fireCapture();
  }

  async function submitRender(styleId: (typeof styles)[number]['_id']) {
    if (!selectedPhoto || renderSubmissionLock.current || isGenerating || isReconnecting) return;

    renderSubmissionLock.current = true;
    setIsRenderSubmitting(true);
    setRenderSubmissionError(null);

    try {
      const renderId = await requestRender({ token, photoId: selectedPhoto._id, styleId });
      setLastRequestedRenderId(renderId);
    } catch (error) {
      console.error('Render request failed', error);
      setRenderSubmissionError("We couldn't start the AI edit. Please try again.");
    } finally {
      renderSubmissionLock.current = false;
      setIsRenderSubmitting(false);
    }
  }

  async function onCreateTheme(file: File) {
    if (themeBusy) return;
    setUploadError(null);
    // Let the derived theme chip win the selection once it lands.
    setStyleChoice(null);
    setThemeUploading(true);
    try {
      // Shrink on the phone: venue Wi-Fi is slow and the vision model doesn't
      // need more than ~1280px to read an invitation.
      const blob = await downscaleImage(file, 1280);
      const uploadUrl = await generateUploadUrl({ token });
      const res = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': blob.type || 'image/jpeg' },
        body: blob,
      });
      if (!res.ok) throw new Error(`Upload failed (${res.status})`);
      const { storageId } = (await res.json()) as { storageId: Id<'_storage'> };
      const requestId = await requestTheme({ token, storageId });
      setPendingThemeId(requestId);
    } catch (error) {
      console.error('Theme upload failed', error);
      setUploadError("We couldn't upload that photo.");
    } finally {
      setThemeUploading(false);
    }
  }

  return (
    <main className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 overflow-x-hidden px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))]">
      <div
        aria-hidden
        className="pointer-events-none fixed -top-1/4 left-1/2 h-[90vh] w-[90vh] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(217,70,239,0.14),rgba(11,11,20,0)_65%)]"
      />

      <header className="relative flex items-center justify-between">
        <h1 className="text-lg font-black tracking-tight">AI Photobooth</h1>
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 font-mono text-xs text-white/70">
          {session.shortCode}
        </span>
      </header>

      {isReconnecting && (
        <p
          className="relative rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-2 text-center text-sm text-amber-200"
          role="status"
        >
          Reconnecting…
        </p>
      )}

      <div className="relative flex flex-col gap-5">
        <CapturePanel
          phase={phase}
          shots={shots}
          onShotsChange={setShots}
          burst={captureBusy ? burstInfo : null}
          disabled={isReconnecting}
          onCapture={onCapture}
        />

        <PhotoGallery
          photos={photos}
          selectedPhotoId={selectedPhoto?._id ?? null}
          onSelect={(photoId) => {
            setPhotoChoice({ photoId, countAtSelection: photos.length });
            setRenderSubmissionError(null);
          }}
        />

        {selectedPhoto?.url && (
          <StylePicker
            styles={styles}
            selectedStyleId={selectedStyleId}
            isLoading={stylesQuery === undefined}
            isGenerating={isGenerating}
            isDisabled={isGenerating || isReconnecting}
            error={renderSubmissionError}
            themeJob={themeJob}
            onSelect={(styleId) => {
              setStyleChoice(styleId);
              setRenderSubmissionError(null);
            }}
            onGenerate={() => {
              if (selectedStyle) void submitRender(selectedStyle._id);
            }}
            onCreateTheme={(file) => void onCreateTheme(file)}
          />
        )}

        <RenderResult
          renders={rendersForSelectedPhoto}
          styleNameOf={styleNameOf}
          retryDisabled={isGenerating || isReconnecting}
          onRetry={(styleId) => {
            setStyleChoice(styleId);
            void submitRender(styleId as (typeof styles)[number]['_id']);
          }}
        />
      </div>
    </main>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-dvh items-center justify-center px-8 text-center text-white/50">{children}</div>;
}

// Downscale an image on the client before upload. Falls back to the original
// file if decode fails (e.g. an exotic format) — the server can still try it.
async function downscaleImage(file: File, maxDimension: number): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    if (scale >= 1) return file;

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    return blob ?? file;
  } catch {
    return file;
  }
}
