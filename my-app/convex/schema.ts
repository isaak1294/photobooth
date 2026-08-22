import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import { captureStatus } from './captureStatus';

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
    // Set on guest-created custom themes: only that session's picker shows them.
    // Absent on the seeded presets, which every session sees.
    sessionId: v.optional(v.id('sessions')),
  }),

  // A "please take a photo now" signal. The phone's Take Picture button inserts
  // a `pending` row; the Pi (subscribed to Convex, outbound-only) picks it up and
  // drives it through the capture lifecycle, ending at `complete` (or `failed`).
  // The phone observes this status live. Remote shutter — no inbound connection.
  captureRequests: defineTable({
    sessionId: v.id('sessions'),
    status: captureStatus,
    error: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index('by_status', ['status'])
    .index('by_session', ['sessionId']),

  // A guest's "make me a theme from this photo" job. The uploaded inspiration
  // image lives in file storage; a scheduled action derives {name, prompt} from
  // it via GMI's vision endpoint and writes a session-scoped `styles` row. The
  // phone subscribes to this row to show derivation progress (~8s).
  themeRequests: defineTable({
    sessionId: v.id('sessions'),
    storageId: v.id('_storage'),
    status: v.union(
      v.literal('pending'),
      v.literal('processing'),
      v.literal('done'),
      v.literal('failed'),
    ),
    // Populated when status === 'done'.
    styleId: v.optional(v.id('styles')),
    // Populated when status === 'failed'.
    error: v.optional(v.string()),
  }).index('by_session', ['sessionId']),

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
