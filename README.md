# photobooth

AI photobooth. A Raspberry Pi shoots, Convex stores and syncs, GMI restyles, and
the screens — the booth surface and the guest's phone — all live off the same
subscription. The look is POPFLASH: the design system (colour, type, the hard
offset shadows) lives in `my-app/app/globals.css`.

## Run the frontend

```bash
cd my-app
npm install
cp .env.local.example .env.local
npx next dev
```

- **`/kiosk`** — the iPad kiosk. One button, 4 shots with a 3-2-1 each, then a
  QR handoff and reset for the next guest. `?shots=N` (1–8) changes the count.
  Take payment out of band; there are no prices on screen.
- **`/booth`** — the HDMI booth screen. QR only; the guest's phone is the shutter.
- **`/s/<token>`** — the phone gallery, opened from either QR.

`npm run nobooth` runs every surface against a simulated booth — no Convex, Pi,
or camera needed (the kiosk also takes `?demo=1`).

### Running the kiosk on an iPad

The kiosk is an **iPad mini 3 on iOS 12.3** (Safari 12.1). That browser can't
parse the rest of the app — Next's bundle, Tailwind v4, the Convex client — so
`/kiosk` is deliberately not a React page: `app/kiosk/route.ts` serves a
hand-written document, `public/kiosk.css` + `public/kiosk.js` are written to
Safari 12's limits (no `clamp()`, no flex `gap`, no `?.`), and the page talks
only to `/kiosk/api/*` on its own origin, which proxies to Convex server-side.
Keep it that way when editing: `node -e` with acorn at `ecmaVersion: 2017` is
the cheap check for the script. Nothing else in the app is affected.

On the iPad: open `/kiosk` in Safari and **Add to Home Screen** so it launches
without browser chrome. Set **Auto-Lock to Never** (iOS 12 has no wake-lock API)
and turn on Guided Access if it will be unattended. The QR points at
`NEXT_PUBLIC_BOOTH_PUBLIC_URL` if set, otherwise at whatever address the iPad
reached the server on — which on a LAN dev server is the machine's IP, i.e.
what a phone on the same Wi-Fi needs. `/kiosk?demo=1` runs the whole loop with
a simulated booth.

The kiosk runs its own 3-2-1 on screen and fires the capture request on the same
tick, which lines up with the Pi's default `COUNTDOWN_MS=3000`. Leave that alone;
setting it to 0 makes the kiosk shoot three seconds early.

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
