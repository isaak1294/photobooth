# AI Photobooth — Requirements Document

**Version:** 0.1 (draft)
**Status:** For review

---

## 0. Overview

A self-contained photobooth built on a Raspberry Pi captures photos at an event. Each session is issued a short-lived access code (shown as a QR code). Guests scan the code on their own phone, open a web app, view their photos, download them, and optionally re-render them in AI-generated styles.

**System components**

| Component | Runs on | Purpose |
|---|---|---|
| Booth capture app | Raspberry Pi | Live preview, countdown, capture, upload, QR display |
| Guest web app | Guest's phone browser | Gallery, download, style selection |
| Backend API + workers | Cloud / server | Storage, session tokens, AI style jobs |

**Priority keys:** `MUST` = required for v1, `SHOULD` = target for v1, `MAY` = future.

**Primary flow**

1. Guest taps the trigger → countdown → N frames captured
2. Frames upload to backend; session code + QR rendered on booth screen
3. Guest scans → gallery opens on phone
4. Guest downloads originals and/or requests a styled render
5. Session expires and media is purged after the retention window

---

## 1. Hardware Requirements

### 1.1 Compute

- **HW-1 (MUST)** Raspberry Pi 5, 8 GB RAM. The 4 GB model is acceptable only if no on-device inference or local preview encoding is performed.
- **HW-2 (MUST)** Active cooling (official active cooler or equivalent). The Pi must sustain continuous camera preview for a full event without thermal throttling below the preview framerate target.
- **HW-3 (MUST)** Official 27 W USB-C PSU. Under-powered supplies cause camera brownouts and SD corruption.
- **HW-4 (SHOULD)** UPS HAT or supercapacitor shutdown board so power loss triggers a clean shutdown rather than filesystem corruption mid-event.

### 1.2 Camera

- **HW-5 (MUST)** CSI-attached camera. Baseline: Camera Module 3 (12 MP, autofocus, wide variant for tight booths). Upgrade path: HQ Camera + C/CS lens where image quality is a selling point.
- **HW-6 (MUST)** Captured stills at minimum 3000 × 2000 px, JPEG quality ≥ 90, so AI re-renders and prints have usable source resolution.
- **HW-7 (MUST)** Fixed focus/exposure lock per event, set during setup. Autofocus hunting between frames of the same strip is a defect.
- **HW-8 (SHOULD)** Ribbon cable routed with strain relief and no tight radius; camera rigidly mounted so framing does not drift over the event.

### 1.3 Display & Input

- **HW-9 (MUST)** Touchscreen, 10"–15", mounted at adult eye level (~1.5 m to lens), oriented so the guest's eyeline lands near the lens rather than the screen.
- **HW-10 (MUST)** Physical trigger: illuminated arcade button on GPIO, hardware- or software-debounced. On-screen trigger is a fallback, not the primary.
- **HW-11 (SHOULD)** Speaker or buzzer for countdown audio cues, since guests look at the lens, not the screen.

### 1.4 Lighting

- **HW-12 (MUST)** Dedicated continuous lighting — diffused LED panel or ring light, 5000–5600 K, dimmable. Ambient venue light is not an acceptable dependency.
- **HW-13 (SHOULD)** Light positioned to avoid glasses glare and hard nose shadows; diffusion material rather than a bare LED array.

### 1.5 Storage & Network

- **HW-14 (MUST)** A2-rated microSD ≥ 64 GB for the OS, or boot-from-USB SSD. Media is written to a separate volume from the OS where possible.
- **HW-15 (MUST)** Local buffer sized for a full event's captures at full resolution, assuming zero successful uploads (see BE-14 offline queue).
- **HW-16 (MUST)** Wired Ethernet preferred; Wi-Fi supported. Venue Wi-Fi with captive portals must not be a hard dependency — the booth must capture and queue without connectivity.
- **HW-17 (MAY)** Cellular failover (USB LTE modem) for venues with no usable network.

### 1.6 Enclosure

- **HW-18 (MUST)** Enclosure with unobstructed airflow to the Pi, no exposed mains wiring, and all cabling internal or sheathed.
- **HW-19 (SHOULD)** Serviceable without full disassembly: SD card, power, and camera reachable in under two minutes.
- **HW-20 (MAY)** Thermal receipt/dye-sub printer for instant physical prints.

---

## 2. Frontend Requirements

Two distinct surfaces. They share a design system but not a codebase concern.

### 2.A Booth Kiosk UI (on the Pi)

- **FE-1 (MUST)** Runs fullscreen in kiosk mode with no browser chrome, no cursor, no reachable OS UI. Guests cannot exit to the desktop.
- **FE-2 (MUST)** Live camera preview at ≥ 24 fps, mirrored horizontally so the guest sees themselves as in a mirror.
- **FE-3 (MUST)** Visible countdown (numeric + audio) before each frame. Default 3 seconds.
- **FE-4 (MUST)** Multi-frame strip: configurable 1–4 frames per session, with a short inter-frame gap and an on-screen pose prompt.
- **FE-5 (MUST)** Review screen showing captured frames with **Keep** / **Retake** actions and an auto-accept timeout (default 15 s).
- **FE-6 (MUST)** Handoff screen displaying a QR code plus a human-readable short code (e.g. 6 characters, unambiguous alphabet — no O/0, I/1).
- **FE-7 (MUST)** Auto-reset to the attract screen after an inactivity timeout (default 45 s). No previous guest's photos, code, or QR remain visible after reset.
- **FE-8 (MUST)** Attract/idle screen with clear call to action and a visible notice that photos are captured, stored temporarily, and processed by AI (see BE-17).
- **FE-9 (MUST)** Full function while offline: capture, review, code issuance, and queueing all work without network. Upload state shown as a discreet indicator, never as a blocking error to the guest.
- **FE-10 (SHOULD)** Touch targets ≥ 60 px, high contrast, legible at 2 m in dim venue lighting.
- **FE-11 (SHOULD)** Hidden operator menu (long-press corner + PIN) exposing diagnostics: disk, temperature, upload queue depth, last error, test capture.

### 2.B Guest Web App (on the guest's phone)

- **FE-12 (MUST)** No account creation, no login. Access is granted solely by the session token in the QR URL or by entering the short code.
- **FE-13 (MUST)** Mobile-first, responsive, works on current iOS Safari and Android Chrome. No app install.
- **FE-14 (MUST)** Gallery view of the session's frames with per-photo download and a download-all action.
- **FE-15 (MUST)** Downloads save at full captured resolution, correctly oriented, with no watermark on originals unless event branding is enabled.
- **FE-16 (MUST)** Style picker showing available AI styles as labelled thumbnail examples. Style set is configurable per event, not hardcoded.
- **FE-17 (MUST)** Style rendering is asynchronous: on submit, show queued/processing state with progress or elapsed time, and deliver the result without requiring a manual refresh (poll or push).
- **FE-18 (MUST)** Result view with before/after comparison, download, and retry-with-different-style.
- **FE-19 (MUST)** Clear, non-technical messaging for the failure cases: expired session, invalid code, render failed, render quota reached.
- **FE-20 (SHOULD)** Visible remaining render quota and session expiry time, so limits are not a surprise at the point of use.
- **FE-21 (SHOULD)** Native share sheet integration (Web Share API) with file sharing, falling back to download.
- **FE-22 (MAY)** Installable PWA; email/SMS delivery of the session link.

---

## 3. Backend Requirements

### 3.1 API

- **BE-1 (MUST)** HTTPS-only REST API covering: create session, upload frame(s), fetch session manifest, list styles, create style job, poll job status, issue download URL.
- **BE-2 (MUST)** Booth authenticates as a device using a per-device credential; guests authenticate only via session token. Device and guest scopes are strictly separated.
- **BE-3 (MUST)** Session tokens are cryptographically random, unguessable, scoped to exactly one session, and expire (default 24 h).
- **BE-4 (MUST)** Uploads are idempotent by client-generated frame ID, so retries after a network failure do not create duplicates.
- **BE-5 (SHOULD)** Uploads use pre-signed URLs direct to object storage rather than proxying image bytes through the API.

### 3.2 Storage

- **BE-6 (MUST)** Object storage for media (S3-compatible: S3, R2, or self-hosted MinIO). Originals and derivatives stored under separate prefixes.
- **BE-7 (MUST)** No media served from public buckets. All reads go through time-limited pre-signed URLs (default 15 min).
- **BE-8 (MUST)** Relational database for sessions, frames, style jobs, devices, events, and audit records. Media bytes are never stored in the database.
- **BE-9 (MUST)** Derivatives generated on upload: web-sized preview and thumbnail, so the gallery does not serve full-resolution files.

### 3.3 AI Style Pipeline

- **BE-10 (MUST)** Style transformation runs as queued background jobs, not inside the request cycle. Queue with retry, per-job timeout, and a dead-letter path.
- **BE-11 (MUST)** The AI provider sits behind an internal interface so a hosted image-to-image API and a self-hosted model (e.g. SDXL img2img with ControlNet/IP-Adapter) are interchangeable without touching API or frontend code.
- **BE-12 (MUST)** A style is a named, versioned config record — prompt, negative prompt, strength/denoise, guidance, model ref, optional reference image. Styles are added and tuned as data, not code changes.
- **BE-13 (MUST)** Identity preservation: a rendered face must remain recognizably the same person. Any style whose settings routinely fail this is not shippable.
- **BE-14 (MUST)** P90 render latency ≤ 30 s from job submission to result availability under expected event load.
- **BE-15 (MUST)** Per-session render quota (default 3 per photo, configurable) and a per-event spend cap that halts AI jobs and degrades to a clear guest-facing message rather than an unbounded bill.
- **BE-16 (SHOULD)** Automated safety screening on both inputs and outputs; failed screening returns a neutral failure rather than the image.

### 3.4 Privacy & Retention

- **BE-17 (MUST)** Consent notice presented at the booth before capture, stating that photos are stored temporarily and processed by third-party AI services if a style is applied. Consent event recorded against the session.
- **BE-18 (MUST)** Automatic hard deletion of all media and derivatives after a configurable retention window (default 7 days). Deletion covers object storage and any provider-side copies where the provider supports it.
- **BE-19 (MUST)** On-demand session deletion endpoint reachable from the guest web app.
- **BE-20 (MUST)** Storing images of identifiable faces triggers privacy-law obligations in most jurisdictions — confirm applicable requirements (in Canada, PIPEDA and provincial equivalents) before any public event, and select AI providers whose terms permit this use and prohibit training on submitted images.
- **BE-21 (SHOULD)** Data processing terms reviewed and documented for each third-party AI provider used.

### 3.5 Booth Sync & Reliability

- **BE-22 (MUST)** Booth-side durable upload queue: captures persist locally and upload with exponential backoff until acknowledged. Nothing is deleted locally before a confirmed server-side write.
- **BE-23 (MUST)** Session codes are generated in a way that guarantees uniqueness while offline (device-prefixed or pre-allocated block), so codes issued without connectivity never collide on sync.
- **BE-24 (SHOULD)** Booth heartbeat with device health (temperature, disk, queue depth, last capture) and alerting when a device goes silent during an active event.
- **BE-25 (SHOULD)** Structured logging and metrics on capture count, upload success rate, render success rate, render latency, and per-event AI cost.

### 3.6 Admin

- **BE-26 (SHOULD)** Admin interface for creating events, assigning devices, selecting the active style set, setting quotas and retention, and viewing event stats.
- **BE-27 (MAY)** Event-level branding: overlay/frame applied to downloads, custom attract screen.

---

## 4. Out of Scope for v1

- Guest accounts, cross-event photo history
- Video, boomerangs, GIF strips
- Live social media posting from the booth
- Multi-tenant / white-label operator accounts
- On-device (Pi-local) AI rendering

---

## 5. Open Questions

1. Hosted AI API or self-hosted GPU? This drives per-photo cost, latency, and privacy posture more than any other decision.
2. Is instant physical printing part of the product, or is digital-only sufficient?
3. Expected peak concurrency — guests per hour per booth — needed to size the render queue and set the quota defaults.
4. Single booth or fleet? Fleet changes device provisioning, code allocation, and admin scope significantly.
