export type CaptureLifecycleStatus =
  | 'pending'
  | 'counting_down'
  | 'capturing'
  | 'uploading'
  | 'complete'
  | 'failed';

const statusMessage: Record<CaptureLifecycleStatus, string> = {
  pending: 'Waiting for the booth...',
  counting_down: 'Get ready and look at the booth camera.',
  capturing: 'Smile!',
  uploading: 'Sending your photo...',
  complete: 'Photo captured.',
  failed: "We couldn't take that photo.",
};

type CaptureStatusProps = {
  status: CaptureLifecycleStatus | null;
  isReconnecting: boolean;
};

export function CaptureStatus({ status, isReconnecting }: CaptureStatusProps) {
  if (status === null && !isReconnecting) return null;

  return (
    <div className="space-y-1 text-center text-sm" role="status" aria-live="polite" aria-atomic="true">
      {isReconnecting && <p className="text-slate-500">Reconnecting...</p>}
      {status !== null && (
        <p className={status === 'failed' ? 'text-red-600' : 'text-slate-600'}>
          {statusMessage[status]}
        </p>
      )}
      {status === 'failed' && <p className="text-slate-500">Tap Take Picture to try again.</p>}
    </div>
  );
}
