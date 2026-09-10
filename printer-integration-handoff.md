# Handoff: adding 2x6 strip printing to the AI Photobooth

**Purpose of this document.** I'm picking up work on an existing AI photobooth app
and want help integrating a photo printer that outputs classic 2x6 photobooth
strips. The printer is not yet ordered — part of what I need is help choosing it.
Everything below is the current state of the system so you don't have to
rediscover it.

Repo root: `~/Desktop/photobooth`. Two apps in it: `my-app/` (the web app +
backend) and `pi/` (a runbook for the Raspberry Pi). There is also
`requirements.md` (the long-form product spec) and `photobooth-demo-plan.md` (a
hackathon-scoped cut of it).

---

## 1. What the app does today

A guest walks up to a booth screen (a Raspberry Pi driving an HDMI display).
The screen shows **only a QR code** — no buttons, no preview. The guest scans it
with their own phone, and from that point the entire experience lives on the
phone:

1. Phone opens `/s/<token>` and subscribes to the session.
2. Guest taps **Take Photo**. The phone writes a "capture request" row.
3. The Pi — which is subscribed outbound to the backend — sees the row, fires
   the camera, uploads the JPEG, and marks the request complete.
4. The photo appears live on the phone (no refresh, no polling).
5. Guest picks a **style** and the photo is sent to an AI image-edit model.
   The styled result lands back on the phone, live.
6. Guest can download the result.

There is also a "make your own theme" path: the guest uploads an inspiration
image, a vision model derives a style prompt from it, and that becomes a
session-scoped style in their picker.

**The key architectural constraint:** the Pi is **outbound-only**. Nothing ever
connects *to* it. It holds an open subscription to the backend and reacts. This
was deliberate so the booth works on venue Wi-Fi, behind NAT, or on a phone
hotspot with no port forwarding. **This constraint is load-bearing for the
printer design — see §7.**

---

## 2. Stack

| Layer | Tech |
|---|---|
| Backend / DB / file storage / job scheduling | **Convex** (deployment `jovial-bullfrog-243`) |
| Frontend | **Next.js 16** (App Router, React, Tailwind), TypeScript |
| Booth device | **Raspberry Pi** running Raspberry Pi OS, camera is an **IMX708** |
| Pi capture | `rpicam-jpeg` shelled out from a Node script |
| AI image edit | **GMI Cloud** (`console.gmicloud.ai`), model `seedream-5.0-pro` |
| AI vision (theme derivation) | GMI, model `google/gemini-3.5-flash` |

Convex is doing a lot of work here: it's the database, the file store, the
pub/sub layer both screens subscribe to, *and* the job scheduler for render
jobs. If you're not familiar: a Convex `query` is a live subscription — when
underlying rows change, every subscribed client re-renders automatically. That's
why there's no polling anywhere in the frontend.

---

## 3. Data model

`my-app/convex/schema.ts` — five tables.

```
sessions        { token, shortCode }                        index: by_token
photos          { sessionId, storageId }                    index: by_session
styles          { name, prompt, order, active, sessionId? }
captureRequests { sessionId, status, error?, updatedAt }     index: by_status, by_session
themeRequests   { sessionId, storageId, status, styleId?, error? }  index: by_session
renders         { sessionId, photoId, styleId, status, outputStorageId?, error? }  index: by_session
```

Notes that matter:

- `sessions.token` is a `crypto.randomUUID()`, never a sequential id — a stale QR
  from a test run must not surface someone else's photos. `shortCode` (e.g.
  `PB-4821`) is the human-readable code printed under the QR as a fallback.
- **Image bytes never live in a table.** They're in Convex file storage; tables
  hold `Id<'_storage'>` handles. Three fields point at images:
  `photos.storageId`, `renders.outputStorageId`, `themeRequests.storageId`.
- `renders` is both the job record and the thing the UI subscribes to. Status
  goes `queued → processing → done | failed`.
- `styles.sessionId` is absent on the seeded presets (everyone sees them) and
  set on guest-derived custom themes (only that session sees them).

---

## 4. The capture flow, end to end

This is the pattern the printer will most likely copy, so it's worth reading
closely.

1. **Phone** calls mutation `captures:requestCapture({ token })`, which inserts a
   `captureRequests` row with `status: 'pending'`.
2. **Pi** (`my-app/scripts/pi-listener.mjs`) holds a Convex subscription to a
   query that returns pending capture requests, authenticated with a shared
   secret env var `BOOTH_SECRET`. When a row appears it:
   - shells out to `rpicam-jpeg -o /tmp/frame-<requestId>.jpg -t <warmup> --width 1920 --height 1080 -n`
   - POSTs the raw bytes to the backend HTTP endpoint `/upload?token=<token>`
   - `unlink`s the temp file
   - advances the request status as it goes (`counting down → capturing → uploading → complete`)
3. **Backend** `my-app/convex/http.ts` receives `/upload`, does
   `ctx.storage.store(blob)`, then inserts a `photos` row via an internal
   mutation (HTTP actions have no DB access, so the write is delegated).
4. **Phone** is subscribed to `sessions:getSession({ token })`, which returns the
   session's photos and renders with resolved URLs. It re-renders automatically.

Important detail: `rpicam-jpeg` needs **exclusive** access to the sensor. If any
other process holds the camera open, every capture fails with `Device or
resource busy`. There's a warning about this in `pi/README.md` — an older Flask
`capture_server.py` used to hold it permanently.

---

## 5. The render flow

`my-app/convex/renders.ts`.

1. Phone calls mutation `renders:requestRender({ token, photoId, styleId })`.
   It validates that the photo belongs to that session (the token gates the
   whole run), inserts a `renders` row as `queued`, calls
   `ctx.scheduler.runAfter(0, internal.renders.runRender, ...)`, and returns
   immediately. The mutation stays fast; the slow work is scheduled.
2. `runRender` (an internal action) base64s the source frame into a data URI,
   POSTs it to GMI's edit-request queue with the style's `prompt`, polls every
   2s up to 60 times (~2 min ceiling), downloads the output URL, and
   `ctx.storage.store()`s it back into Convex.
3. Everything is wrapped so a failure writes `status: 'failed'` with the error
   text — Convex does **not** auto-retry actions, so an unhandled throw would
   leave a spinner on screen forever.

If `GMI_API_KEY` is unset, `runRender` deliberately returns an **identity
render** (the original frame) so the pipeline is testable without a key.

Convex env vars in play (set via `npx convex env set ...`, not in the repo):
`GMI_API_KEY`, `GMI_MODEL` (default `seedream-5.0-pro`), `GMI_VISION_MODEL`
(default `google/gemini-3.5-flash`), `GMI_BASE_URL`, `BOOTH_SECRET`.

---

## 6. Frontend layout

```
app/page.tsx           landing / explainer
app/booth/page.tsx     the fullscreen kiosk — mints a session, renders the QR, nothing else
app/s/[token]/page.tsx the phone experience (366 lines, orchestrates the components below)
components/phone/CapturePanel.tsx    the shutter button + live capture status
components/phone/PhotoGallery.tsx    thumbnails of captured frames, select one
components/phone/StylePicker.tsx     style grid + custom-theme upload
components/phone/RenderResult.tsx    the styled hero image + Download link
```

The booth QR encodes `${base}/s/${token}` where `base` is
`process.env.NEXT_PUBLIC_BOOTH_PUBLIC_URL || window.location.origin` — the env
var exists because on the booth machine `window.location.origin` is `localhost`,
which would resolve to the *phone itself* and fail silently.

**`components/phone/RenderResult.tsx` around line 78 is where a "Print" button
would naturally sit** — right next to the existing `Download photo` anchor, in
the branch that only renders once `hero.outputUrl` exists.

Dev servers:
- `npm run booth` — plain `next dev`, uses the cloud Convex deployment.
- `npm run dev` — `convex dev --start 'next dev'`, spins up a **local** deployment
  and **rewrites `.env.local`**. Avoid unless you mean it.

---

## 7. What I want help with: 2x6 strip printing

### The format

Classic photobooth output is a **2" x 6" strip**, normally 3 or 4 photo cells
stacked vertically with a branded footer. The industry-standard way to produce
these is a **dye-sublimation printer running 4x6 media with a "2-inch cut"
mode** — the printer lays down a 4x6 sheet containing two identical strips and
cuts it in half, giving you two copies per print cycle (one for the guest, one
for the scrapbook). That's why strips are traditionally handed over in pairs.

### Open questions for you

1. **Which printer.** I haven't ordered yet. The names that come up are DNP
   DS-RX1HS, DNP DS620A, Mitsubishi CP-M15, and Sinfonia CS2. I care about:
   Linux/CUPS driver quality (it may be driven from the Pi), cost per strip,
   print speed (this is a live event — a 10s print is fine, a 60s print is not),
   and whether 2-inch cut is native or something I have to fake.
2. **Where the printer physically attaches.** USB to the Raspberry Pi is the
   obvious answer, but see the constraint below.
3. **Who composites the strip.** The AI output is a single square-ish image.
   Something has to lay N images into a 2x6 canvas with margins and a footer.
   Candidates: browser `<canvas>` on the phone, Pillow/ImageMagick on the Pi, or
   a Convex action. I don't have a strong opinion — tell me which is least
   painful.
4. **How the print job reaches the printer.** This is the interesting one.

### The architectural constraint you must respect

**Nothing can connect *to* the Pi.** This isn't a preference, it's been proven
in practice on the current network: the Pi is reachable via mDNS and ARP but
every inbound TCP connection fails, which is AP client isolation on the venue
router. SSH to it only works over a direct ethernet cable. So:

- A Convex action **cannot** POST a print job to the Pi.
- Any design where the backend pushes to the printer host is dead on arrival.

**The good news:** the existing `captureRequests` table is exactly the right
template. The Pi already subscribes outbound and reacts to rows appearing. A
`printRequests` table with the same shape (`sessionId`, `renderId`, `status`,
`error?`, `updatedAt`, plus maybe `copies`) and the same listener loop in
`pi-listener.mjs` would slot in with almost no new concepts. The Pi would pull
the composited image down and hand it to CUPS via `lp`/`lpr`.

If you think the printer should hang off a different machine entirely (a laptop
at the table, say), that's worth arguing for — but it has to solve the same
"outbound-only" problem.

### Resolution — please sanity-check my math

A 2x6 strip at 300 DPI is **600 x 1800 px**. The Pi currently captures at
**1920 x 1080** (hardcoded in `pi-listener.mjs`), which was a deliberate demo-era
choice — `photobooth-demo-plan.md` lists "print-quality resolution" as
explicitly cut, on the reasoning that 1080p uploads faster and looks identical
on a projector.

My read is that 1080p is actually *fine* for strips, because each of 3–4 cells
is only ~600x450 px, so we're downscaling regardless. But:
- `requirements.md` HW-7 asks for ≥ 3000x2000 for print-quality downloads.
- **I don't know what resolution GMI returns.** The edit model's output
  dimensions are whatever `seedream-5.0-pro` gives back, and I've never
  measured it. If it returns something small (512px, 1024px), that becomes the
  real ceiling, not the camera. Worth verifying early.

Also relevant: `requirements.md` HW-8 says focus and exposure must be locked per
event — "autofocus hunting between frames of one strip is a defect." So the
multi-frame strip use case was anticipated in the spec even though nothing
implements it yet.

### What is genuinely not built yet

- **No multi-shot sequence.** A strip needs 3–4 frames in quick succession. Right
  now one tap = one frame. Someone has to design the burst: does the phone fire
  4 capture requests, or does one request tell the Pi to take 4?
- **No compositor.** Nothing anywhere lays out a strip.
- **No print anything.** `requirements.md` HW-22 lists "thermal or dye-sub
  printer for instant physical prints" as LATER, and the demo plan cut printing
  entirely.
- **No delete path.** `ctx.storage.delete` is never called anywhere in
  `convex/`. Worth knowing because printing raises the stakes on moderation —
  guests can upload arbitrary inspiration images for custom themes, and right
  now the only way to remove one is the Convex dashboard by hand.

---

## 8. Practical environment notes

- Convex deployment: `jovial-bullfrog-243`
  (`https://jovial-bullfrog-243.convex.cloud`, site URL `.convex.site`).
- The Pi is `photo-pi.local`, user `ming`. The booth code on it is at
  `~/ai-photobooth/booth` (note: `pi/README.md` says `~/booth`, which is stale).
- There's a `server.py` and `capture.py` on the Pi from an earlier Python
  implementation, plus a local `photos/` directory. Those are legacy and
  separate from the Node listener; the `server.py` is a camera-hogging risk.
- `BOOTH_SECRET` is shared between the Convex deployment and the Pi listener and
  is deliberately not in the repo.
- Manage the Pi over a direct ethernet cable, not Wi-Fi, for the reason in §7.

---

## 9. What I'd like out of this conversation

1. A printer recommendation with reasoning, given a live-event photobooth on a Pi.
2. A concrete integration design — tables, where compositing happens, how the
   job reaches the printer without violating outbound-only.
3. The multi-shot burst design.
4. A flag on anything above where my assumptions are wrong.

Start by telling me what you'd want to verify first before committing to a
design.
