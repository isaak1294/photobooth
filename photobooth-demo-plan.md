# AI Photobooth — 3-Minute Demo Build

**Companion to** `photobooth-requirements.md` v0.3, which stays the reference for anything past the hackathon.
**This document optimizes for one thing:** three minutes in front of judges going well.

The organizing principle: build backwards from the run of show. If a requirement doesn't serve a beat in the script below, it isn't in this version.

---

## 1. Run of Show

| Time | Beat | What judges see |
|---|---|---|
| 0:00–0:20 | Hook | One line on what it is. No slides. |
| 0:20–0:50 | Live capture | A judge or teammate steps in, hits the button, countdown, capture. |
| 0:50–1:15 | Handoff | Scan the QR on a phone (mirrored to the projector). Photos appear as they upload — no refresh. |
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
- One button on GPIO. One light pointed at the subject.
- HDMI display for the booth UI.
- **Network:** ethernet if the venue has it, phone hotspot as a saved backup SSID. Test both before demo day.
- Camera focus and exposure locked at the demo table, not at your desk — the lighting is different and autofocus hunting on stage looks broken.

### Backend (Convex)

Four tables, four functions. That's the whole backend.

- `sessions`, `photos`, `styles`, `renders`
- **HTTP action** `/upload` — Pi posts a frame, store via `ctx.storage`, insert a `photos` row
- **Query** `getSession(token)` — returns photos + renders for one session
- **Mutation** `requestRender(token, photoId, styleId)` — insert `renders` row as `queued`, `ctx.scheduler.runAfter(0, ...)`, return immediately
- **Internal action** `runRender` — call GMI, store output, write back `done` via an internal mutation

Three things that stay even in the stripped version, because each is one line and each can end the demo:

1. **Session token is a random string.** Same effort as a sequential ID, and it means a stale QR from a test run can't surface someone else's photos mid-demo.
2. **GMI key in a Convex env var.** If it ships in client code it's scrapeable, and a drained or revoked key at 2am is unrecoverable.
3. **`try/catch` in the action that writes `status: "failed"` with the error.** Convex does not auto-retry actions. Without this, a hiccup leaves a spinner on screen forever and you have no idea why. With it, you see the error in the Convex dashboard in five seconds.

### Frontend

**Booth (Pi):** fullscreen, live preview, 3-2-1 countdown, capture, QR + short code, auto-reset. Plus the styled result appearing on the booth screen — that's the beat at 1:15, so it isn't optional here.

**Phone:** open by QR link, subscribed gallery, style buttons, before/after, download. Job state renders straight off the subscribed `renders` doc.

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
