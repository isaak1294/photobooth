# AI Photobooth — Requirements Document

**Version:** 0.3 — Convex backend, GMI Cloud inference, hackathon build
**Status:** For review

**Changes from 0.2:** Model provider fixed to GMI Cloud (new §3.4). Model selection promoted from an open question to a hard requirement with a first-hour bake-off. Requirement IDs are stable and never reused, so the new items are numbered BE-41+ despite sitting mid-document.

**Changes from 0.1:** Backend rewritten around Convex primitives. Guest-app polling removed in favour of reactive subscriptions. Hardware section relaxed to whatever Pi is on hand. Priorities re-cut for a hackathon timeline.

---

## 0. Overview

A Raspberry Pi photobooth captures photos at an event. Each session is issued a short-lived access code (shown as a QR code). Guests scan the code on their own phone, view their photos, download them, and re-render them in AI-generated styles.

Convex is the entire backend: database, file storage, serverless functions, job scheduling, and the sync engine that pushes results to clients. There is no separate API server, object store, queue, or WebSocket layer.

**System components**

| Component | Runs on | Purpose |
|---|---|---|
| Booth capture app | Raspberry Pi | Live preview, countdown, capture, upload, QR display |
| Guest web app | Guest's phone browser | Gallery, download, style selection — subscribed to Convex |
| Convex deployment | Convex cloud | Schema, functions, file storage, scheduler, crons |
| Style render worker | Convex action → GMI Cloud Inference Engine | AI image-to-image transformation |

**Priority keys:** `DEMO` = must work on stage, `V1` = required for a real event, `LATER` = post-hackathon.

**Primary flow**

1. Guest taps the trigger → countdown → N frames captured on the Pi
2. Pi POSTs frames to a Convex HTTP action; session code + QR render on the booth screen
3. Guest scans → web app opens, subscribes to the session's photos
4. Guest picks a style → mutation records the job → scheduler fires an action → action calls the image model → result written back by a mutation
5. The styled image appears on the guest's phone with no refresh, no polling
6. A cron purges sessions after the retention window

---

## 1. Hardware Requirements

A teammate's Pi is the target device. Requirements adapt to that unit rather than specifying an ideal build.

### 1.1 Compute

- **HW-1 (DEMO)** Whatever Raspberry Pi the team has on hand. Pi 4 (2 GB+) or Pi 5. No on-device inference, so compute is only driving preview and upload.
- **HW-2 (DEMO)** Adequate cooling for continuous camera preview across the demo window. A bare Pi 5 in open air throttles; a heatsink or fan is enough.
- **HW-3 (DEMO)** Correctly rated PSU for the specific board (27 W USB-C for Pi 5, 15 W for Pi 4). Under-powered supplies cause camera brownouts and SD corruption — the most likely way to lose the demo.
- **HW-4 (V1)** Clean-shutdown protection (UPS HAT or equivalent) so power loss does not corrupt the filesystem mid-event.

### 1.2 Camera

- **HW-5 (DEMO)** Any camera the Pi can drive: CSI Camera Module (v2, v3, or HQ) via `picamera2`, or a USB webcam via V4L2. Confirm which one the teammate has before writing capture code — the two paths differ.
- **HW-6 (DEMO)** Stills at ≥ 1920 × 1080, JPEG quality ≥ 85. Higher is better for AI re-renders, but see BE-6: Convex HTTP action request bodies are capped at 20 MB, so keep a single frame comfortably under that.
- **HW-7 (V1)** Captures at ≥ 3000 × 2000 for print-quality downloads.
- **HW-8 (V1)** Fixed focus and exposure lock per event. Autofocus hunting between frames of one strip is a defect.
- **HW-9 (V1)** Camera rigidly mounted with strain-relieved ribbon so framing does not drift.

### 1.3 Display & Input

- **HW-10 (DEMO)** Any HDMI display the Pi can drive, running the booth UI fullscreen. Touchscreen preferred; a monitor plus physical button is fine.
- **HW-11 (DEMO)** Trigger input: GPIO button (debounced) or keyboard/touch fallback. A physical button reads far better to judges than a mouse click.
- **HW-12 (V1)** Screen at adult eye level (~1.5 m to lens), positioned so the guest's eyeline lands near the lens.
- **HW-13 (LATER)** Speaker or buzzer for countdown audio.

### 1.4 Lighting

- **HW-14 (DEMO)** Any dedicated light source pointed at the subject. Venue and hackathon-hall lighting is unreliable and unflattering; a cheap ring light materially improves every AI render downstream.
- **HW-15 (V1)** Diffused, dimmable, 5000–5600 K, positioned to avoid glasses glare and hard nose shadows.

### 1.5 Storage & Network

- **HW-16 (DEMO)** microSD ≥ 32 GB (A2 rated if available). Captures buffer to local disk before upload.
- **HW-17 (DEMO)** Network access to `*.convex.cloud` and `*.convex.site` over HTTPS. Ethernet strongly preferred at a hackathon venue; conference Wi-Fi is the second most likely way to lose the demo.
- **HW-18 (DEMO)** Phone hotspot identified as a fallback network before demo day, with the SSID already saved on the Pi.
- **HW-19 (V1)** Local buffer sized for a full event at full resolution assuming zero successful uploads.

### 1.6 Enclosure

- **HW-20 (DEMO)** Cable management sufficient that the booth can be carried to a judging table without disconnecting the camera.
- **HW-21 (V1)** Enclosure with airflow to the Pi, no exposed mains wiring, serviceable without full disassembly.
- **HW-22 (LATER)** Thermal or dye-sub printer for instant physical prints.

---

## 2. Frontend Requirements

Two surfaces. Both are Convex clients, so both get live data for free — the booth screen and the guest's phone can show the same render completing at the same instant.

### 2.A Booth Kiosk UI (on the Pi)

- **FE-1 (DEMO)** Runs fullscreen with no browser chrome, no cursor, no reachable OS UI.
- **FE-2 (DEMO)** Live camera preview, mirrored horizontally. Target ≥ 24 fps; accept lower on a Pi 4 rather than blocking on it.
- **FE-3 (DEMO)** Visible countdown before each frame. Default 3 seconds.
- **FE-4 (DEMO)** Configurable 1–4 frames per session with an inter-frame gap.
- **FE-5 (DEMO)** Handoff screen with QR code plus a human-readable short code (6 characters, unambiguous alphabet — no O/0, I/1).
- **FE-6 (DEMO)** Auto-reset to the attract screen after inactivity (default 45 s). No previous guest's photos or code remain visible after reset.
- **FE-7 (DEMO)** Attract screen with a clear call to action and a visible notice that photos are stored temporarily and processed by AI.
- **FE-8 (DEMO)** Upload state indicated discreetly. Upload failures never block the guest or surface as raw errors.
- **FE-9 (V1)** Review screen with Keep / Retake and a 15 s auto-accept timeout.
- **FE-10 (V1)** Booth screen subscribes to the active session and displays styled renders as they complete, so the reaction happens in the room. This is the strongest single demo moment and is nearly free once the guest app works.
- **FE-11 (V1)** Touch targets ≥ 60 px, high contrast, legible at 2 m in dim lighting.
- **FE-12 (LATER)** Hidden operator menu (long-press corner + PIN) with diagnostics: disk, temperature, upload queue depth, last error, test capture.

### 2.B Guest Web App (on the guest's phone)

- **FE-13 (DEMO)** No account creation, no login. Access granted solely by the session token in the QR URL, or by entering the short code.
- **FE-14 (DEMO)** Mobile-first, works on current iOS Safari and Android Chrome. No app install.
- **FE-15 (DEMO)** Gallery of the session's frames, subscribed via a Convex query keyed on the session token. Photos appear as the Pi uploads them, without a refresh.
- **FE-16 (DEMO)** Per-photo download at full captured resolution, correctly oriented, unwatermarked.
- **FE-17 (DEMO)** Style picker showing available styles as labelled thumbnails, read from the styles table rather than hardcoded.
- **FE-18 (DEMO)** Submitting a style calls a mutation and returns immediately. The UI renders job state directly from the subscribed `renders` document — `queued`, `running`, `done`, `failed`. **No polling, no status endpoint, no manual refresh.** If the implementation contains a `setInterval` fetching job status, it is wrong.
- **FE-19 (DEMO)** Result view with before/after comparison and download.
- **FE-20 (DEMO)** Non-technical error states for: invalid code, expired session, render failed, quota reached.
- **FE-21 (V1)** Visible remaining render quota and session expiry time.
- **FE-22 (V1)** Download-all as a zip.
- **FE-23 (V1)** Web Share API integration with file sharing, falling back to download.
- **FE-24 (LATER)** Installable PWA; SMS/email delivery of the session link.

---

## 3. Backend Requirements (Convex)

### 3.1 Schema

- **BE-1 (DEMO)** Tables: `events`, `devices`, `sessions`, `photos`, `styles`, `renders`. Defined in `convex/schema.ts` with validators on every field.
- **BE-2 (DEMO)** `sessions` carries a random `token` (unguessable, ≥ 128 bits of entropy), a `shortCode`, `eventId`, `expiresAt`, and `consentAt`. Indexed by both `token` and `shortCode` — never table-scanned.
- **BE-3 (DEMO)** `photos` and `renders` store Convex **storage IDs**, not URLs. URLs are generated at read time; storing them produces stale links.
- **BE-4 (DEMO)** `renders` carries `photoId`, `styleId`, `status` (`queued` | `running` | `done` | `failed`), `outputStorageId`, `error`, and timestamps. This document is the job record *and* the thing the UI subscribes to — one source of truth, no separate queue state.
- **BE-5 (DEMO)** `styles` are versioned data rows — name, thumbnail, prompt, negative prompt, strength, guidance, model ref, optional reference image. Adding a style is an insert, not a deploy.

### 3.2 Ingest from the Pi

- **BE-6 (DEMO)** The Pi uploads through a Convex **HTTP action** at `https://<deployment>.convex.site/upload`, since it is not a browser client. Request bodies are capped at 20 MB — one frame per request, or upload-URL flow for larger files.
- **BE-7 (DEMO)** The Pi authenticates with a device secret in a header, checked against a Convex environment variable. Full device credentials and rotation are V1; a shared secret is acceptable for the demo but must not be committed to the repo.
- **BE-8 (DEMO)** The HTTP action stores bytes via `ctx.storage`, then calls an **internal** mutation to insert the `photos` row. Guest-facing functions and device-facing functions share no public surface.
- **BE-9 (DEMO)** Uploads are idempotent on a Pi-generated frame ID, so a retried upload after a flaky connection does not duplicate the photo.
- **BE-10 (V1)** Durable upload queue on the Pi: captures persist locally and retry with exponential backoff. Nothing is deleted locally before a confirmed server-side write.
- **BE-11 (V1)** Session short codes generated so that codes issued while offline cannot collide on sync (device-prefixed or pre-allocated block).

### 3.3 Style Render Pipeline

- **BE-12 (DEMO)** The guest calls a **mutation** that validates the session, enforces quota, and inserts a `renders` row with status `queued`, then schedules an internal action via `ctx.scheduler.runAfter(0, ...)`. The mutation returns immediately.
- **BE-13 (DEMO)** The **action** fetches the source image, calls the GMI Cloud edit model (§3.4), stores the output via `ctx.storage`, and writes the result back through an internal mutation setting status `done`. Actions cannot touch the database directly — all reads and writes go through `runQuery` / `runMutation`.
- **BE-14 (DEMO)** Actions are **not** automatically retried by Convex, because they have side effects. Every failure path must be caught explicitly and written back as status `failed` with a message. A job silently stuck in `queued` is the failure mode that will bite during judging.
- **BE-15 (DEMO)** The model API key lives in Convex environment variables, never in client code or the repo (see BE-44).
- **BE-16 (DEMO)** Quota enforcement happens inside the mutation, where it is transactional. Two rapid taps cannot both pass the check — this is a correctness reason to enforce limits in a mutation rather than in the action or the client.
- **BE-17 (V1)** Per-event spend cap that halts new render jobs and returns a clear guest-facing message instead of an unbounded bill.
- **BE-18 (V1)** P90 render latency ≤ 30 s from submission to result visible.
- **BE-19 (V1)** Identity preservation: a rendered face remains recognizably the same person. Any style whose settings routinely fail this is not shippable.
- **BE-20 (V1)** Automated safety screening on inputs and outputs; a failed screen returns a neutral failure rather than the image.
- **BE-21 (LATER)** Convex Workflow for multi-step renders (per-face crop → render → recomposite) where a single action's guarantees are insufficient.

### 3.4 Model Provider — GMI Cloud

- **BE-41 (DEMO)** Style rendering runs on GMI Cloud's Inference Engine — serverless, per-request inference from their hosted model library — called from the Convex action over HTTPS. Their endpoints are OpenAI-compatible, so a standard client works without a bespoke SDK.
- **BE-42 (DEMO)** The selected model must be an **image editing / image-to-image** model, not text-to-image. Text-to-image returns a plausible stranger; the entire product depends on the guest recognising themselves. This outranks price and speed as a selection criterion.
- **BE-43 (DEMO)** Model bake-off in the first working hour, before any UI work: run a photo of an actual teammate through each candidate edit model and record (a) identity preservation, (b) wall-clock latency, (c) cost per request. Pick a winner and a runner-up. A failure here invalidates BE-18 and the quota defaults, which is why it happens first rather than on Saturday night.
- **BE-44 (DEMO)** GMI API key stored as a Convex environment variable (e.g. `GMI_API_KEY`). Never client-side, never committed.
- **BE-45 (V1)** The provider call is wrapped in a single internal module, so swapping model or provider touches one file and never the schema, mutations, or UI.
- **BE-46 (V1)** Per-request cost recorded on the `renders` document, so per-event spend (BE-17) is measured rather than estimated.
- **BE-47 (LATER)** Dedicated GPU endpoints or a custom img2img stack on GMI's H100/H200 instances, if fine-tuned or LoRA-driven styles become the differentiator. Explicitly out of scope for the hackathon: provisioning is measured in days and the guest-visible result is identical. Revisit only if GMI's judging criteria specifically reward use of their GPU infrastructure over their inference API.

### 3.5 Reads & Sync

- **BE-22 (DEMO)** Guest data is read through a query taking the session token as an argument and returning only that session's photos, renders, and styles. Token validation happens server-side in the query; never filter on the client.
- **BE-23 (DEMO)** Image URLs come from `ctx.storage.getUrl(storageId)` at query time.
- **BE-24 (DEMO)** Every function that should not be publicly callable is defined with `internalQuery` / `internalMutation` / `internalAction`. Anything exported as public is callable by any client with the deployment URL.
- **BE-25 (V1)** Rate limiting per session token on render submissions.

### 3.6 Privacy & Retention

- **BE-26 (DEMO)** Consent notice shown at the booth before capture, stating that photos are stored temporarily and processed by a third-party AI service. `consentAt` recorded on the session.
- **BE-27 (DEMO)** Every session has an `expiresAt`. Expired sessions return "expired", not photos.
- **BE-28 (V1)** Convex **cron** sweeping expired sessions, deleting documents *and* the underlying files from storage. Deleting rows while leaving orphaned blobs is a common miss.
- **BE-29 (V1)** Guest-triggered "delete my photos" mutation reachable from the web app.
- **BE-30 (V1)** Storing images of identifiable faces triggers privacy-law obligations in most jurisdictions — confirm applicable requirements (in Canada, PIPEDA and provincial equivalents) before any public event, and select an image-model provider whose terms permit this use and prohibit training on submitted images.

### 3.7 Operations

- **BE-31 (DEMO)** Separate dev and prod deployments. The Pi points at prod for the demo; nobody deploys during judging.
- **BE-32 (V1)** Booth heartbeat mutation with device health (temperature, disk, queue depth, last capture), surfaced in an admin view.
- **BE-33 (V1)** Metrics on capture count, upload success rate, render success rate, render latency, per-event AI cost.
- **BE-34 (LATER)** Admin UI for events, device assignment, active style set, quotas, retention.

### 3.8 Convex Constraints to Design Around

- **BE-35** Actions time out at 10 minutes and run with 512 MB (Node runtime) or 64 MB (Convex runtime) memory. Image work is fine; large batch processing is not.
- **BE-36** HTTP action request and response bodies are capped at 20 MB.
- **BE-37** Queries cannot call external APIs, write, or schedule. Anything touching the network is an action.
- **BE-38** Do not call an action from another action except to cross runtimes. Chain through mutations and the scheduler instead.
- **BE-39** Auth context does not propagate into scheduled functions — pass what the job needs as explicit arguments to an internal function.
- **BE-40** Document field names must be ASCII. Emoji in style names go in the *value*, not the key.

---

## 4. Cut for the Hackathon

- Guest accounts and cross-event history
- Video, boomerangs, GIF strips
- Instant physical printing
- Multi-booth fleet management
- On-device (Pi-local) AI rendering
- Social posting from the booth

---

## 5. Suggested Build Order

0. **GMI model bake-off (BE-43)** — one hour, one teammate's face, curl. Everything downstream assumes a model that preserves identity inside your latency budget; find out on hour one, not hour thirty.
1. **Convex schema + a fake render action** that waits 3 seconds and returns the input image. Get the reactive loop visible end to end before any AI is involved.
2. **Guest web app** against seeded data. Prove that a render row changing status updates the phone with no polling.
3. **Real GMI call** swapped in behind the same action, using the winner from step 0.
4. **Pi capture → HTTP action upload.** Hardware last, because it is the part most likely to eat a day.
5. **Booth QR + attract loop**, then the live booth-screen render display (FE-10) if time remains.

Fallback if the Pi fights back on demo day: the same HTTP action accepts uploads from a laptop webcam. Keep that path working — it costs nothing and it is the difference between a demo and no demo.

---

## 6. Open Questions

1. Which specific GMI edit model wins the bake-off, and what its measured latency and per-request cost are — these set the quota defaults (BE-16) and the spend cap (BE-17). Also confirm the provider's terms on training with submitted images before a public event (BE-30).
2. Which camera is actually on the teammate's Pi, and which Pi model? Determines `picamera2` vs V4L2 and the achievable preview framerate.
3. Expected demo throughput — is this one guest at a time in front of judges, or open to a room?
4. Is the booth screen a touchscreen, or monitor plus button?