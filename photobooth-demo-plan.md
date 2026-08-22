# AI Photobooth — 3-Minute Demo Build

**Companion to** `photobooth-requirements.md` v0.3, which stays the reference for anything past the hackathon.
**This document optimizes for one thing:** three minutes in front of judges going well.

The organizing principle: build backwards from the run of show. If a requirement doesn't serve a beat in the script below, it isn't in this version.

---

## 1. Run of Show

| Time | Beat | What judges see |
|---|---|---|
| 0:00–0:20 | Hook | One line on what it is. No slides. |
| 0:20–0:50 | Pair + live capture | A judge or teammate scans the booth QR, taps **Take Photo** on the phone, then watches the booth countdown and Pi-camera capture. |
| 0:50–1:15 | Live return | Photos appear on the already-open phone session as the Pi uploads them — no refresh. Pick one frame. |
| 1:15–2:05 | The money shot | Tap a style. **Talk track over the render window.** Result lands on the phone *and* the booth screen simultaneously. |
| 2:05–2:35 | Second style | Different look on the same face, to show it's a pipeline and not a canned asset. |
| 2:35–3:00 | Close | Stack, one sentence each on Convex and GMI, what's next. |

**Two things this table is really enforcing:**

**Your phone must be mirrored to the room.** A demo where the payoff happens on a device only the presenter can see is a demo nobody watched. Set up screen mirroring before demo day and test it on the actual venue display.

**The render window is a scripted beat, not dead air.** Measure your real p50 latency, then write exactly that many seconds of talk track — the architecture explanation lives here. If the render takes 9 seconds, you need 9 seconds of prepared words. Silently watching a spinner is the most common way a good demo dies.

---

## 2. Minimum Build

### Hardware

- The teammate's Pi, correct PSU, whatever camera it has, heatsink on.
- One light pointed at the subject. Keep one GPIO button or keyboard trigger as a fallback for the phone-controlled shutter.
- HDMI display for the booth UI.
- **Network:** ethernet if the venue has it, phone hotspot as a saved backup SSID. Test both before demo day.
- Camera focus and exposure locked at the demo table, not at your desk — the lighting is different and autofocus hunting on stage looks broken.

### Backend (Convex)

Four tables and a small function surface. That's the whole backend.

- `sessions`, `photos`, `styles`, `renders`
- **Mutation** `requestCapture(token)` — atomically records one capture command for the booth paired to that session
- **Device query/subscription** `getCaptureCommand` — Pi receives an authenticated, idempotent capture request and acknowledges capture-state changes
- **HTTP action** `/upload` — Pi posts a frame, store via `ctx.storage`, insert a `photos` row
- **Query** `getSession(token)` — returns capture state + photos + renders for one session
- **Mutation** `requestRender(token, photoId, styleId)` — insert `renders` row as `queued`, `ctx.scheduler.runAfter(0, ...)`, return immediately
- **Internal action** `runRender` — call GMI, store output, write back `done` via an internal mutation

Three things that stay even in the stripped version, because each is one line and each can end the demo:

1. **Session token is a random string.** Same effort as a sequential ID, and it means a stale QR from a test run can't surface someone else's photos mid-demo.
2. **GMI key in a Convex env var.** If it ships in client code it's scrapeable, and a drained or revoked key at 2am is unrecoverable.
3. **`try/catch` in the action that writes `status: "failed"` with the error.** Convex does not auto-retry actions. Without this, a hiccup leaves a spinner on screen forever and you have no idea why. With it, you see the error in the Convex dashboard in five seconds.

### Frontend

**Booth (Pi):** fullscreen, live preview, ready QR + short code, phone-triggered 3-2-1 countdown and capture, auto-reset. Plus the styled result appearing on the booth screen — that's the beat at 1:15, so it isn't optional here.

**Phone:** open by QR link, prominent **Take Photo** remote shutter, subscribed capture state and gallery, photo selection, style buttons, before/after, download. Capture and job state render straight off subscribed Convex documents. The phone never uses its own camera.

### GMI

Bake-off first (BE-43 in the full doc) — an edit/img2img model on a real teammate's face, measured for identity preservation and latency. Hardcode the winner. Two or three styles as rows in `styles`, tuned until they reliably look good on your actual team's faces under your actual light.

---

## 3. Explicitly Cut

Everything here is in v0.3 and is deliberately not being built this weekend:

- Retention crons, delete-my-photos, consent recording *(keep a single line of copy on the attract screen — it's free and observant judges notice its absence)*
- Quotas, rate limits, spend caps *(instead: watch the GMI console during the demo)*
- Device credentials and rotation, admin UI, heartbeats, metrics
- Offline upload queue and retry, collision-safe offline codes
- Review/retake screen, download-all zip, share sheet, PWA
- Print, multi-booth, accounts, safety screening
- Print-quality resolution — 1080p captures upload faster and look identical on a projector

---

## 4. Failure Plan

Rehearse each of these once. The recovery matters more than the prevention.

| If this breaks | Do this |
|---|---|
| Pi won't boot / camera dead | Laptop webcam posts to the same `/upload` HTTP action. Keep this path working all weekend. |
| Venue Wi-Fi drops | Hotspot, already saved on the Pi and tested. |
| GMI slow or erroring | Pre-rendered results already in the DB from a session captured 10 minutes earlier. Switch to that session's QR and narrate it as "here's one from earlier." |
| Everything is on fire | 60-second screen recording of a successful end-to-end run, on your phone, ready to play. |

Two rules for demo day: **do not deploy during judging**, and pre-warm the model with a throwaway render five minutes before you go on, so the first request judges see isn't paying a cold start.

---

## 5. What Each Sponsor Should See

- **Convex** — the moment the styled image lands on the phone and the booth screen at the same instant, with no refresh and no polling. Say the words "no polling, it's a subscription on the render document." That is the platform's entire pitch, demonstrated.
- **GMI** — the transformation itself, plus one line on the model choice: an edit model rather than text-to-image, because the guest has to recognise their own face. It shows you picked deliberately from the library instead of grabbing the first image endpoint.

Time-check the whole thing out loud at least twice. Three minutes is much shorter than it reads.


## 6. Executive Summaries

Hardware. A Raspberry Pi drives a camera, a light, and a display — and does nothing else. The guest's phone is the primary shutter: a tap records a capture command in Convex, the Pi receives it, runs the booth countdown, takes the photo with the Pi camera, and posts it over HTTPS. A GPIO button or keyboard follows the same path as a fallback. All intelligence lives in the cloud, which makes the booth a deliberately dumb capture-and-display terminal. That choice keeps the demo independent of which Pi model or camera the team happens to have, since nothing on the device is compute-bound. The single hard dependency is network, so the booth runs on wired ethernet with a pre-tested phone hotspot as fallback, and the same upload endpoint accepts frames from a laptop webcam if the hardware fails entirely.

Frontend. Two surfaces, both Convex clients, both live. The booth screen runs a fullscreen kiosk loop — ready QR, preview, remotely triggered countdown, capture, result, auto-reset — while the guest's phone opens from the QR as the token-gated remote shutter, capture-status display, gallery, style picker, and before/after view. Neither surface polls for anything: both subscribe to the session's data and re-render when it changes. The phone initiates capture but the Pi camera takes every booth photo. The result is the demo's centerpiece — captured frames and then a styled photo appearing live, with no refresh anywhere.

Backend. Convex is the entire backend: four tables and four functions, with no separate API server, object store, queue, or socket layer. A guest's style request is a mutation that writes a renders row and schedules an action; the action calls a GMI Cloud image-editing model, stores the output, and writes the result back through another mutation. That one document is simultaneously the job record and the thing both screens are subscribed to, which is why the UI needs no status endpoint. Because Convex deliberately does not retry actions that have side effects, every failure path is caught and written back as a visible failed state rather than leaving a job silently stuck.
