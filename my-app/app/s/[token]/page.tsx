'use client';

import { useParams } from 'next/navigation';
import { useConvexConnectionState, useMutation, useQuery } from 'convex/react';
import { useRef, useState } from 'react';
import { CaptureStatus } from '@/components/phone/CaptureStatus';
import { PhotoGallery } from '@/components/phone/PhotoGallery';
import { RenderResult } from '@/components/phone/RenderResult';
import { StylePicker } from '@/components/phone/StylePicker';
import { api } from '../../../convex/_generated/api';

// The phone surface, opened from the QR at /s/<token>. Everything here is a live
// Convex subscription — photos and render results appear with no refresh.
export default function PhonePage() {
  const token = useParams().token as string;
  const session = useQuery(api.sessions.getSession, { token });
  const stylesQuery = useQuery(api.styles.listStyles, {});
  const styles = stylesQuery ?? [];
  const requestCapture = useMutation(api.captures.requestCapture);
  const requestRender = useMutation(api.renders.requestRender);
  const connectionState = useConvexConnectionState();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
  const [selectedStyleId, setSelectedStyleId] = useState<string | null>(null);
  const [isRenderSubmitting, setIsRenderSubmitting] = useState(false);
  const [renderSubmissionError, setRenderSubmissionError] = useState<string | null>(null);
  const [lastRequestedRenderId, setLastRequestedRenderId] = useState<string | null>(null);
  const submissionLock = useRef(false);
  const renderSubmissionLock = useRef(false);
  const isReconnecting = connectionState.hasEverConnected && !connectionState.isWebSocketConnected;

  if (session === undefined) return <Centered>Loading…</Centered>;
  if (session === null) return <Centered>Session not found.</Centered>;

  const photos = session.photos;
  const latestAvailablePhoto = photos
    .slice()
    .reverse()
    .find((photo) => photo.url !== null);
  const selectedPhoto =
    photos.find((photo) => photo._id === selectedPhotoId) ?? latestAvailablePhoto ?? photos[photos.length - 1];
  const selectedStyle = styles.find((style) => style._id === selectedStyleId);
  const styleName = (id: string) => styles.find((s) => s._id === id)?.name ?? 'Style';
  const rendersForSelectedPhoto = selectedPhoto
    ? session.renders.filter((render) => render.photoId === selectedPhoto._id)
    : [];
  const latestRender = rendersForSelectedPhoto[rendersForSelectedPhoto.length - 1] ?? null;
  const activeRender = rendersForSelectedPhoto
    .slice()
    .reverse()
    .find((render) => render.status === 'queued' || render.status === 'processing');
  const renderRequestAwaitingSubscription =
    lastRequestedRenderId !== null && !session.renders.some((render) => render._id === lastRequestedRenderId);
  const isGenerating = isRenderSubmitting || renderRequestAwaitingSubscription || activeRender !== undefined;

  // Drive the button off the Pi's real capture status (via the subscription).
  const capture = session.capture;
  const ACTIVE = ['pending', 'counting_down', 'capturing', 'uploading'];
  const isCapturing = capture !== null && ACTIVE.includes(capture.status);
  const captureLabel: Record<string, string> = {
    pending: 'Waiting for booth...',
    counting_down: 'Get ready...',
    capturing: 'Smile!',
    uploading: 'Sending photo...',
  };
  const captureDisabled = isSubmitting || isCapturing || isReconnecting;
  const buttonLabel = isSubmitting ? 'Starting booth...' : isCapturing ? captureLabel[capture!.status] : 'Take Picture';

  async function onCapture() {
    if (submissionLock.current || isCapturing || isReconnecting) return;

    submissionLock.current = true;
    setIsSubmitting(true);
    setSubmissionError(null);

    try {
      await requestCapture({ token });
    } catch (error) {
      console.error('Capture request failed', error);
      setSubmissionError("We couldn't start the booth. Try again.");
      // e.g. a capture is already in progress — the status UI already reflects it.
    } finally {
      submissionLock.current = false;
      setIsSubmitting(false);
    }
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

  function onSelectPhoto(photoId: string) {
    setSelectedPhotoId(photoId);
    setRenderSubmissionError(null);
  }

  function onSelectStyle(styleId: string) {
    setSelectedStyleId(styleId);
    setRenderSubmissionError(null);
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 p-5">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">AI Photobooth</h1>
        <span className="rounded-full bg-slate-200 px-3 py-1 font-mono text-sm dark:bg-slate-800">
          {session.shortCode}
        </span>
      </header>

      <button
        onClick={onCapture}
        disabled={captureDisabled}
        aria-busy={isSubmitting || isCapturing}
        className="rounded-2xl bg-foreground px-6 py-5 text-lg font-semibold text-background disabled:opacity-50"
      >
        {buttonLabel}
      </button>
      {submissionError && <p className="text-center text-sm text-red-500">{submissionError}</p>}
      <CaptureStatus status={capture?.status ?? null} isReconnecting={isReconnecting} />

      <PhotoGallery photos={photos} selectedPhotoId={selectedPhoto?._id ?? null} onSelect={onSelectPhoto} />

      {selectedPhoto?.url && (
        <StylePicker
          styles={styles}
          selectedStyleId={selectedStyleId}
          isLoading={stylesQuery === undefined}
          isGenerating={isGenerating}
          isDisabled={isGenerating || isReconnecting}
          error={renderSubmissionError}
          onSelect={onSelectStyle}
          onGenerate={() => {
            if (selectedStyle) void submitRender(selectedStyle._id);
          }}
        />
      )}

      <RenderResult
        render={latestRender}
        styleName={latestRender ? styleName(latestRender.styleId) : 'AI'}
        retryDisabled={isGenerating || isReconnecting}
        onRetry={() => {
          if (!latestRender) return;
          setSelectedStyleId(latestRender.styleId);
          void submitRender(latestRender.styleId);
        }}
      />
    </main>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center text-slate-500">{children}</div>;
}
