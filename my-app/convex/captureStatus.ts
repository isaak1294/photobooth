import { v } from 'convex/values';

// The capture lifecycle the phone observes in real time. Shared by the schema,
// the capture functions, and getSession so they can never drift apart.
export const captureStatus = v.union(
  v.literal('pending'), // written by the phone; Pi hasn't picked it up yet
  v.literal('counting_down'), // Pi claimed it, 3-2-1 on the booth
  v.literal('capturing'), // shutter
  v.literal('uploading'), // POSTing the frame to /upload
  v.literal('complete'), // frame uploaded successfully
  v.literal('failed'), // capture or upload failed (see error)
);

// Statuses that mean a capture is still in flight for a session. Used to reject
// a second concurrent capture request.
export const ACTIVE_CAPTURE_STATUSES = ['pending', 'counting_down', 'capturing', 'uploading'];
