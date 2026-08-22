# photobooth

AI photobooth. A Raspberry Pi shoots, Convex stores and syncs, GMI restyles, and
two screens — the booth kiosk and the guest's phone — both live off the same
subscription.

## Run the frontend

```bash
cd my-app
npm install
cp .env.local.example .env.local
npx next dev
```

- **`/booth`** — the kiosk. Countdown, capture, QR handoff.
- **`/s/<token>`** — the phone gallery, opened from the QR.

Use `npx next dev`, **not `npm run dev`** — the latter runs `convex dev`, which
spins up a local deployment and overwrites the cloud URLs in your `.env.local`
with `127.0.0.1`. To make `npm run dev` correct, run `npx convex login && npx
convex dev` once to link your checkout to the cloud project.

## Does the pipeline work?

```bash
cd my-app && node scripts/verify-capture.mjs
```

This drives the backend exactly as a frontend does — create a session, request a
capture — then waits for the Pi and proves the frame really landed: the row
exists, its URL resolves, and the bytes are a real JPEG of a plausible size. No
browser and no login required. Exit code 0 on success.

**Run this before blaming your UI.** If it passes, the backend and the Pi are
fine and the bug is in the frontend. If it fails, the staged output says which
step broke.

## How a capture actually happens

The frontend never talks to the Pi. It writes a row; the Pi is subscribed and
gets it pushed. The Pi only makes outbound connections, so it works behind venue
Wi-Fi, NAT, or a hotspot with no port forwarding.

```
frontend ──writes captureRequests row──▶ Convex
                                          │  push
                                          ▼
                                         Pi ──shoots, POSTs /upload──▶ Convex
                                                                        │ push
                                          frontend renders it ◀─────────┘
```

Three calls are the entire frontend contract:

| Call | Type | Purpose |
|---|---|---|
| `sessions:createSession` | mutation | on load → `{ token, shortCode }` |
| `captures:requestCapture` | mutation | the button → `{ token }` |
| `sessions:getSession` | query (live) | `{ capture, photos[], renders[] }` |

`capture.status` is a live progress feed — `pending → counting_down → capturing
→ uploading → complete`, or `failed` with the reason — so a UI can show real
per-stage progress instead of a spinner.

The countdown belongs in the **frontend**, before `requestCapture` is called.
The Pi has its own `COUNTDOWN_MS` (set it to `0` when the UI counts) — if both
count, the guest waits twice.

## The Pi

See [pi/README.md](pi/README.md). One long-running process, `pi-listener.mjs`.

## Secrets

`NEXT_PUBLIC_*` values are compiled into the browser bundle and are not secret.
Real secrets live on the Convex deployment and are never committed:

```bash
npx convex env set BOOTH_SECRET <shared with the Pi>
npx convex env set GMI_API_KEY <key>     # optional
```

Without `GMI_API_KEY`, renders fall back to returning the source frame, so the
full reactive pipeline still demos end to end.

hi
