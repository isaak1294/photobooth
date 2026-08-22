import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

// AI Photobooth — four tables, per photobooth-demo-plan.md §2.
// A session is created for one booth run; the QR handoff carries the random
// `token`. Photos and renders both hang off the session. A `renders` row IS the
// job record and the thing both screens subscribe to.
export default defineSchema({
  // One booth run. `token` is a random string that gates the phone gallery —
  // never a sequential id, so a stale QR can't surface someone else's photos.
  sessions: defineTable({
    token: v.string(),
    // Short human-readable code shown under the QR (e.g. "PB-4821").
    shortCode: v.string(),
  }).index('by_token', ['token']),

  // A captured frame. The image bytes live in Convex file storage; we keep the
  // `storageId` handle here.
  photos: defineTable({
    sessionId: v.id('sessions'),
    storageId: v.id('_storage'),
  }).index('by_session', ['sessionId']),

  // The styles a guest can pick. Seeded as a handful of rows; the render action
  // reads `prompt` to drive the GMI edit model.
  styles: defineTable({
    name: v.string(),
    prompt: v.string(),
    // Lower sorts first in the picker; lets us hide a style without deleting it.
    order: v.number(),
    active: v.boolean(),
  }),

  // A "please take a photo now" signal. The phone's Take Picture button inserts
  // a `pending` row; the Pi (subscribed to Convex, outbound-only) picks it up,
  // shoots, uploads via /upload, then flips it to `done`. This is the remote
  // shutter — no inbound connection to the Pi.
  captureRequests: defineTable({
    sessionId: v.id('sessions'),
    status: v.union(v.literal('pending'), v.literal('done')),
  }).index('by_status', ['status']),

  // One render job: source photo + chosen style -> styled output. This single
  // document is both the job state and what the phone + booth subscribe to.
  renders: defineTable({
    sessionId: v.id('sessions'),
    photoId: v.id('photos'),
    styleId: v.id('styles'),
    status: v.union(
      v.literal('queued'),
      v.literal('processing'),
      v.literal('done'),
      v.literal('failed'),
    ),
    // Populated when status === 'done'.
    outputStorageId: v.optional(v.id('_storage')),
    // Populated when status === 'failed' — Convex does not auto-retry actions,
    // so every failure path must write a visible reason here.
    error: v.optional(v.string()),
  }).index('by_session', ['sessionId']),
});
