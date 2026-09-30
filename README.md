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
without browser chrome (unless the kiosk takes Square payments — then it must
stay a Safari tab; see "Taking payment with Square"). Set **Auto-Lock to Never** (iOS 12 has no wake-lock API)
and turn on Guided Access if it will be unattended. The QR points at
`NEXT_PUBLIC_BOOTH_PUBLIC_URL` if set, otherwise at whatever address the iPad
reached the server on — which on a LAN dev server is the machine's IP, i.e.
what a phone on the same Wi-Fi needs. `/kiosk?demo=1` runs the whole loop with
a simulated booth.

The kiosk owns the countdown. The Pi runs with `COUNTDOWN_MS=0` (see
`pi/README.md`) and shoots ~1.5–2s after it sees a request, so the kiosk sends
the request `SHUTTER_LEAD_MS` (1.8s) before its on-screen count hits zero and
the shutter lands on "SMILE". If the Pi were left at the old 3000ms default the
shot would land ~3s late and "SMILE" would hold until it did — not broken, just
slow.

**Printing is automatic.** Every kiosk capture carries `{burstId, seq,
framesTotal}`; when the Pi writes the 4th frame it drops a print job on its
local spool and the print agent composes one sheet (two identical 4-photo
strips, one centre cut). The handoff screen polls the agent's status report
and says "printing…" / "strips are out". `?shots=` other than 4 never prints —
`STRIP_FRAMES` in the listener and `StripLayout.photos` in
`photobooth_print.py` are both 4.

Use `npx next dev`, **not `npm run dev`** — the latter runs `convex dev`, which
spins up a local deployment and overwrites the cloud URLs in your `.env.local`
with `127.0.0.1`. To make `npm run dev` correct, run `npx convex login && npx
convex dev` once to link your checkout to the cloud project.

## Taking payment with Square

Off by default: the kiosk shoots for free until `SQUARE_PRICE_CENTS` is set on
the Convex deployment. With it set, every session must be paid before the
shutter fires: the kiosk's button reads "$5.00 · TAP TO PAY" and the
`requestCapture` mutation refuses unpaid sessions, whoever calls it.

**On the kiosk (the normal way).** The guest taps the button, the Square Point
of Sale app opens on the kiosk iPad with the amount, they tap their card on
the Reader, Square hands the screen back, and the countdown starts. For that
the kiosk device must be an iPad on **iPadOS 17.1+** (or Android 7+) with
Square Point of Sale installed and signed in, the Reader paired inside it, and
the kiosk page open in a **Safari tab** — not Add to Home Screen, because
Square's callback always returns to the browser. Use Guided Access on Safari
to keep guests in the tab. The old iPad mini 3 can still run the kiosk, but
it can't run Square POS, so on it the button just waits for a payment taken
elsewhere.

**On the operator's phone (backup).** `/pay`, opened in Safari/Chrome on any
phone with Square POS + the Reader, lists recent sessions by the kiosk's
top-right code with a Charge button each. Same Square round trip; the kiosk
notices within two seconds and unlocks.

Both paths end at `/pay/callback`, which asks Square's Orders API for the
order and marks the session paid only if it is completed, at our location,
for at least our price. The `payments` table in the Convex dashboard is the
audit trail; a `failed` row's `error` says why a session won't unlock.

Setup, once:

- [Square Developer Console](https://developer.squareup.com/apps): create an app,
  copy the **production** Application ID. Under *Point of Sale API → Web*, set the
  **Web Callback URL** to exactly `https://<your host>/pay/callback`. It must be
  HTTPS — a LAN `http://192.168…` dev server cannot be a callback; use the
  deployed host or a tunnel. There is no sandbox for the POS API.
- On the Convex deployment the app actually uses (the one in Vercel's
  `NEXT_PUBLIC_CONVEX_URL`, not the personal one `npx convex dev` creates):
  `SQUARE_ACCESS_TOKEN` (production token), `SQUARE_LOCATION_ID`,
  `SQUARE_PRICE_CENTS` (e.g. `500`), `SQUARE_CURRENCY` (the account's currency,
  e.g. `CAD`; a mismatch fails every charge with `currency_code_mismatch`).
  Optional: `SQUARE_ALLOW_CASH=1` accepts cash tenders on `/pay` as
  *unverified* (Square gives no order id for cash).
- Vercel (and `.env.local`): `NEXT_PUBLIC_SQUARE_APPLICATION_ID`. Public env vars
  are baked in at build time, so redeploy after setting it.

Testing is a real $1 charge on your own card, then a refund from the Square
Dashboard. `/kiosk?demo=1` walks the whole pay gate with a stand-in for Square.
The full API notes live in `.claude/skills/square-pos/`.

**Prepaid events.** `/prepaid-kiosk` is the same kiosk with payment taken out:
every session it mints is marked prepaid, the button is plain "Take Photos",
and Square is never opened, even with a price set. It takes the same
`?shots=`/`?demo=1`. At an event that also charges, set `KIOSK_PREPAID_KEY`
(same value on Vercel and Convex) and bookmark `/prepaid-kiosk?key=…` on the
kiosk; without the variable the page is open to anyone who knows the URL.

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
