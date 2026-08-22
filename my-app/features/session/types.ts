export type CaptureStatus =
  | 'ready'
  | 'requested'
  | 'counting_down'
  | 'capturing'
  | 'uploading'
  | 'complete'
  | 'failed';

export type RenderStatus = 'queued' | 'processing' | 'done' | 'failed';

export type Photo = {
  id: string;
  url: string;
  createdAt: number;
};

export type Render = {
  id: string;
  photoId: string;
  styleId: string;
  status: RenderStatus;
  outputUrl?: string;
  error?: string;
};

export type Session = {
  token: string;
  shortCode: string;
  captureStatus: CaptureStatus;
  captureError?: string;
  photos: Photo[];
  renders: Render[];
};

export type SessionLookupResult =
  | { status: 'loading' }
  | { status: 'invalid' }
  | { status: 'expired' }
  | { status: 'valid'; session: Session };
