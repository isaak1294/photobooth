# Pi runbook

The Pi runs **one** thing: `my-app/scripts/pi-listener.mjs`.

It is outbound-only — it opens a Convex subscription and waits. Nothing connects
*to* the Pi, so venue Wi-Fi, NAT, and a phone hotspot all work without port
forwarding.

```
booth button ─┐
              ├─▶ captureRequests row ─▶ listener ─▶ rpicam-jpeg ─▶ POST /upload
phone button ─┘                                                          │
                                                                         ▼
                                              photo appears on booth + phone
```

## Nothing else may hold the camera

`rpicam-jpeg` needs **exclusive** access to the IMX708. If any other process has
the camera open, every capture fails with `Device or resource busy`.

An earlier Flask capture server (`capture_server.py`) held the camera open
permanently. It has been removed from this repo, but **if a copy is still
running on the Pi it will break every capture**:

```bash
pkill -f capture_server.py
rm -f ~/capture_server.py
```

Verify the camera is free before starting the listener:

```bash
rpicam-jpeg -o /tmp/test.jpg -t 1000 -n && echo "camera is free"
```

## Run the listener

Needs Node 18+ on the Pi (`sudo apt install -y nodejs npm`, or nodesource for a
current version).

```bash
cd ~/photobooth/my-app
npm install

CONVEX_URL=<NEXT_PUBLIC_CONVEX_URL> \
CONVEX_SITE_URL=<NEXT_PUBLIC_CONVEX_SITE_URL> \
BOOTH_SECRET=<the shared secret> \
node scripts/pi-listener.mjs
```

Expect `Booth listener running. Waiting for capture requests…`, then one
`✅ captured + uploaded for <token>` per shot.

`BOOTH_SECRET` must match the value set on the deployment
(`npx convex env set BOOTH_SECRET ...`). If it doesn't, `pendingCaptures` throws
`Invalid booth secret` and the listener sees no requests — it will sit there
looking healthy while every capture times out on the booth screen.

## Keep it running for the demo

The command above dies with your SSH session. Use `tmux`, or install it:

```bash
sudo tee /etc/systemd/system/photobooth-listener.service >/dev/null <<'EOF'
[Unit]
Description=Photobooth Pi listener
After=network-online.target

[Service]
User=ming
WorkingDirectory=/home/ming/photobooth/my-app
Environment=CONVEX_URL=...
Environment=CONVEX_SITE_URL=...
Environment=BOOTH_SECRET=...
ExecStart=/usr/bin/node scripts/pi-listener.mjs
Restart=always

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl enable --now photobooth-listener
journalctl -u photobooth-listener -f
```

## Notes

- **Capture latency.** `pi-listener.mjs` calls `rpicam-jpeg -t 3000`, which
  spends 3 seconds settling exposure *after* the booth's countdown ends. If that
  gap feels long on stage, lower `-t`; the tradeoff is exposure accuracy on the
  first frame.
- **Lock focus and exposure at the demo table**, not at your desk. Autofocus
  hunting on stage looks broken.
