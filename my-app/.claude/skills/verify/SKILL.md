---
name: verify
description: Runtime-verify the photobooth web app (booth kiosk + phone session page) against the local Convex deployment with a fake Pi and headless chromium.
---

# Verify the photobooth end-to-end (no hardware)

Recipe that worked 2026-08-22. All commands from `my-app/`.

1. **Backend**: `npx convex dev` must be running (serves http://127.0.0.1:3210 / :3211). `.env.local` points the app there. Check: `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3210` → 200.
2. **Seed**: `npx convex run styles:seedStyles`. Local deployment already has `BOOTH_SECRET=dev-booth-secret`, `GMI_API_KEY`, `GMI_MODEL` (check `npx convex env list`) — so theme derivation and renders hit the REAL GMI APIs (~8s and ~45s respectively).
3. **Fake Pi**: copy `scripts/pi-listener.mjs` control flow, stub only `capturePhoto()` to sleep `max(1000, COUNTDOWN_MS+500)`ms and return a pre-generated JPEG (PIL is installed). Run with `CONVEX_URL=http://127.0.0.1:3210 CONVEX_SITE_URL=http://127.0.0.1:3211 BOOTH_SECRET=dev-booth-secret FRAME_PATH=<jpg> node fake-pi.mjs`.
4. **Frontend**: `npx next build && npx next start -p 3200`. Don't reuse a dev server already on :3000 — its HMR/asset requests 403 for a second browser. Don't run `npm run dev` (starts its own convex dev and rewrites `.env.local`).
5. **Session**: `npx convex run sessions:createSession` → open `/s/<token>`.
6. **Browser**: playwright-core (npm, no browser download) + `executablePath: '/snap/bin/chromium'`, args `--no-sandbox --disable-dev-shm-usage`, mobile viewport 390x844.

## Gotchas
- **Snap chromium cannot read /tmp**: files for `setInputFiles` (theme upload) must live under `$HOME` (non-hidden path), else the in-page fetch dies with ERR_FILE_NOT_FOUND / "Failed to fetch". Clean up after.
- **Zombie `next start` after rebuild**: if you rebuild while a `next start` is up, the old process keeps the port with a stale in-memory manifest → 500s on random chunks → hydration never finishes (symptom: effects don't run, e.g. splash never fades). Before every restart: `ss -ltnp | grep 3200`, `kill -9` the exact pid, confirm the port is free, and check the start log for EADDRINUSE. Never `pkill -f "next start -p 3200"` — it matches your own shell and kills your command (exit 144).
- Kill the fake Pi when done — a leftover listener double-claims captures when the real Pi runs.
- Storage upload URLs from the local backend allow CORS from any localhost origin — a "Failed to fetch" there is NOT CORS, it's the file-read issue above.

## Flows worth driving
burst 3× (countdown ticks → Smile! → "Photo N of 3" → thumbnails, newest auto-selected) · theme upload → "✦ <name>" chip auto-selected → Generate → Download link · reload (no stale banners, ✦ persists) · second session (✦ must NOT appear) · garbage token (friendly error).
