import { ConvexReactClient } from 'convex/react';
import { anyApi } from 'convex/server';

// Set EXPO_PUBLIC_CONVEX_URL in .env to your deployment (e.g.
// https://<name>.convex.cloud, or http://<your-LAN-ip>:3210 for local dev).
export const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL ?? '';
export const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

// This app is a separate package from my-app, so we reference the backend by
// name via anyApi (no generated types to share) and type the shapes by hand.
export const fns = {
  getSession: anyApi.sessions.getSession,
  listStyles: anyApi.styles.listStyles,
  createSession: anyApi.sessions.createSession,
  requestCapture: anyApi.captures.requestCapture,
  requestRender: anyApi.renders.requestRender,
};

export type CaptureStatus =
  | 'pending'
  | 'counting_down'
  | 'capturing'
  | 'uploading'
  | 'complete'
  | 'failed';
export type RenderStatus = 'queued' | 'processing' | 'done' | 'failed';

export type Photo = { _id: string; _creationTime: number; url: string | null };
export type Render = {
  _id: string;
  _creationTime: number;
  photoId: string;
  styleId: string;
  status: RenderStatus;
  error: string | null;
  outputUrl: string | null;
};
export type Session = {
  sessionId: string;
  shortCode: string;
  capture: { requestId: string; status: CaptureStatus; error: string | null } | null;
  photos: Photo[];
  renders: Render[];
};
export type Style = { _id: string; name: string; order: number };

export const ACTIVE_CAPTURE: CaptureStatus[] = [
  'pending',
  'counting_down',
  'capturing',
  'uploading',
];
