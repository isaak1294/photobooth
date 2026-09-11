# Pi runbook

The Pi runs **two** services, deliberately separate:

| Service | Language | Owns | Needs network? |
|---|---|---|---|
| `booth-capture` | Node | the camera, the Convex subscription | yes |
| `booth-print` | Python | the SELPHY, the CUPS queue | **no** |

```
phone press ─▶ captureRequests row ─▶ booth-capture ─▶ rpicam-jpeg
                                            │
                        /var/lib/booth/sessions/<sessionId>/<burstId>/NN.jpg
                                            │
                     ┌──────────────────────┴───────────────────────┐
                     ▼ (4th frame of a strip)                       ▼
        spool/pending/<burstId>.json                     POST /upload
                     │                                              │
                     ▼                                              ▼
              booth-print ─▶ compose ─▶ CUPS ─▶ paper      Convex ─▶ GMI ─▶ phone
```

Two things follow from that diagram, and both are load-bearing:

**The print path never touches the network.** Frames are already on local disk,
composition is Pillow, CUPS is on localhost. Venue Wi-Fi can die mid-event and
strips keep coming out; the uploads queue up and drain when it returns.

**The Pi is outbound-only.** Nothing ever connects *to* it, so NAT, venue Wi-Fi
and phone hotspots all work with no port forwarding. Manage it over a direct
ethernet cable — AP client isolation blocks inbound SSH on the venue network.

## Exactly one listener, always via systemd

Never start `node pi-listener.mjs` by hand while `booth-capture` is enabled.
Two listeners both subscribe to the same capture requests, both claim every
one, and both try to shoot — `rpicam-jpeg` lets only one of them open the
sensor, so the loser marks the request `failed`. The kiosk then says the photo
didn't take while the other process really took it, and which one wins is a
race, so it comes and goes. Check before an event:

```bash
pgrep -af pi-listener        # exactly one line, /usr/bin/node pi-listener.mjs
```

Two lines means a stray copy: `kill <pid>` the one without `/usr/bin/`. For a
manual run, stop the service first (`sudo systemctl stop booth-capture`).

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

Verify the camera is free before starting:

```bash
rpicam-jpeg -o /tmp/test.jpg -t 1000 -n && echo "camera is free"
```

## First-time setup

**The repo is not cloned on the Pi.** The booth needs eight files — four
programs and four unit files — and nothing else in this repository is useful on
a device with an SD card and a hotspot. `deploy-to-pi.sh` fetches exactly those.

Everything runs from one flat directory, `~/ai-photobooth/booth`. There are no
subdirectories in it, so a repo-relative path like `pi/systemd/...` will not
resolve there — that is the most common way this setup goes wrong.

```bash
sudo apt install -y curl nodejs npm python3-pil python3-cups

mkdir -p ~/ai-photobooth/booth && cd ~/ai-photobooth/booth
npm install convex

curl -fsSL https://raw.githubusercontent.com/isaak1294/photobooth/main/pi/deploy-to-pi.sh | bash
```

That script is also how you **update**: re-run it and restart the two services.
It only pulls from `main`, so anything unpushed on a laptop won't be there.

If the repo is private (or the hotspot is blocking GitHub), copy the same eight
files from the Mac over a direct ethernet cable instead:

```bash
# on the Mac, from the repo root
scp my-app/scripts/pi-listener.mjs photobooth_print.py \
    pi/booth_print_agent.py pi/booth_retention.py \
    ming@photo-pi.local:~/ai-photobooth/booth/
scp pi/systemd/* ming@photo-pi.local:/tmp/
# then on the Pi
sudo cp /tmp/booth-*.service /tmp/booth-*.timer /etc/systemd/system/
```

Secrets go in `/etc/booth.env`, not in the unit files (those are world-readable):

```bash
sudo tee /etc/booth.env >/dev/null <<'EOF'
CONVEX_URL=https://jovial-bullfrog-243.convex.cloud
CONVEX_SITE_URL=https://jovial-bullfrog-243.convex.site
BOOTH_SECRET=<ask the team — not in this repo>
COUNTDOWN_MS=0
BOOTH_SPOOL_DIR=/var/lib/booth
BOOTH_PRINTER=selphy-net
BOOTH_PAGE_SIZE=jpn_hagaki_100x148mm
BOOTH_THEME=thunderfest
EOF
sudo chmod 600 /etc/booth.env
```

The strip's colours, caption and ornaments are a **theme**: `thunderfest`
(UVic navy and gold, bolts around the wordmark), `vikes` (gold field, navy),
`popflash` (the booth's yellow, pink stars), `midnight` (black, white keylines)
or `classic` (plain white). Guests pick one on the kiosk before pressing start
— it rides on every capture request and into the print job, so each sheet
prints in the frame that guest chose. `BOOTH_THEME` is the **fallback** for
bursts that carry no theme (phone-started runs, or a key the Pi doesn't know
yet), and the kiosk's preselected chip. Presets are `THEMES` in
`photobooth_print.py`; the year and caption text live there too. To add one,
add it there first, then to the picker list in `my-app/app/kiosk/route.ts`.
Preview one without a printer:

```bash
python3 photobooth_print.py --theme thunderfest --out /tmp/preview.pdf   # also writes /tmp/preview.png
```

`COUNTDOWN_MS=0` because the *frontend* owns the countdown. Leave it unset and
the Pi waits another 3s after the on-screen count finishes.

The listener **expires** any pending request older than 45s (`STALE_REQUEST_MS`)
instead of shooting it. Requests pile up whenever the Pi is down — a reboot, a
setup session, a wrong `BOOTH_SECRET` — and without this the camera would fire
through that whole backlog at nobody while a real press waited behind it, until
the kiosk gave up and reported the photo didn't take. `journalctl` shows each
one as `⏭  expiring request …`.

`BOOTH_SECRET` must match the deployment (`npx convex env set BOOTH_SECRET ...`).
If it doesn't, `pendingCaptures` throws `Invalid booth secret` and the listener
sits there looking healthy while every capture times out on the phone.

Then start the services (`deploy-to-pi.sh` already put the unit files in place):

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now booth-capture booth-print booth-retention.timer
journalctl -u booth-capture -u booth-print -f
```

`StateDirectory=booth` creates `/var/lib/booth` owned by `ming` on first start.
**Do not put frames in `/tmp`** — it is tmpfs on Raspberry Pi OS, so it is RAM,
and everything in it is gone on reboot.

## Lock exposure at the table — do this before guests arrive

A strip's four shots fire seconds apart, and **each `rpicam-jpeg` invocation
re-runs auto-exposure and auto-white-balance from scratch**. Left on auto, the
four cells of one strip visibly drift in brightness and colour. `requirements.md`
HW-8 calls this a defect, and it is the single most likely way the printed output
looks wrong while every individual frame looks fine.

Meter once under the real event lighting:

```bash
rpicam-hello -t 5000 --info-text "%exp %ag %awbg" -n
```

Take the values it settles on and add them to `/etc/booth.env`:

```
BOOTH_SHUTTER=8000      # microseconds
BOOTH_GAIN=2.0
BOOTH_AWBGAINS=1.8,1.6  # red,blue
```

Then `sudo systemctl restart booth-capture`. Unset means auto, which is fine for
single shots and wrong for strips.

## Verifying without a phone

Print path only, no camera and no Convex — this composes a real sheet and sends
it to the printer:

```bash
cd ~/ai-photobooth/booth
python3 photobooth_print.py --printer selphy-net --page-size jpn_hagaki_100x148mm --print
```

Spool handoff only, no printer — drop a fake job and watch the agent take it:

```bash
ls /var/lib/booth/spool/pending/    # Node drops jobs here
ls /var/lib/booth/spool/active/     # agent renames them here to claim
ls /var/lib/booth/spool/done/       # terminal
journalctl -u booth-print -f
```

Capture path only, from a laptop:

```bash
cd my-app && node scripts/verify-capture.mjs
```

## Edge-to-edge (borderless)

`jpn_hagaki_100x148mm` is the **bordered** postcard size: the printer keeps
3.7mm top/bottom and 2.5mm sides white. The SELPHY prints borderless natively;
over IPP that is a separate page-size choice, which CUPS names with a
`.Borderless` suffix. Find it:

```bash
grep -o 'PageSize [^/]*Borderless[^:/]*' /etc/cups/ppd/selphy-net.ppd | sort -u
```

Set `BOOTH_PAGE_SIZE=jpn_hagaki_100x148mm.Borderless` in `/etc/booth.env`.
`read_page_size_px()` picks up the borderless page geometry from the PPD on
its own.

Then **calibrate the margins**. Borderless dye-sub **overscans** — the printer
enlarges the image a few percent so colour reaches the paper edge — which crops
that much off every side, and unevenly (the SELPHY loses more off the top than
the bottom). The strip's background fills the sheet so that goes unseen, but
photos and the footer at the default 2.5mm inset get cut. Print one sheet of
nested millimetre rulers:

```bash
cd ~/ai-photobooth/booth
python3 photobooth_print.py --calibrate --printer selphy-net --page-size jpn_hagaki_100x148mm.Borderless --print
```

On the print, the outermost rectangle still visible on each side is that
side's overscan in mm. Add 2mm of safety and put the numbers in
`/etc/booth.env`:

```
BOOTH_OUTER_MARGIN_MM=5      # left and right (and top/bottom unless set below)
BOOTH_MARGIN_TOP_MM=8
BOOTH_MARGIN_BOTTOM_MM=4
```

`sudo systemctl restart booth-print`, then test a real strip with the same
values (the CLI reads them from the environment, not from `/etc/booth.env`):

```bash
BOOTH_OUTER_MARGIN_MM=5 BOOTH_MARGIN_TOP_MM=8 BOOTH_MARGIN_BOTTOM_MM=4 \
  python3 photobooth_print.py --printer selphy-net --page-size jpn_hagaki_100x148mm.Borderless --print
```

Photos shrink by whatever the margins grow; on a 148mm strip a 3mm change is
under 1mm per cell.

If the grep finds no `.Borderless` size, this printer's IPP path can't do it
and the answer is the USB + Gutenprint queue below.

## Swapping to USB + Gutenprint

The `selphy-net` IPP-over-Wi-Fi queue is a **test path**.

Debian's packaged Gutenprint is a June 2022 snapshot that predates CP1500
support (added October 2022), so the production path needs 5.3.5 from source.
Once the queue exists, read the page size name out of the generated PPD rather
than guessing it:

```bash
grep -i PaperDimension /etc/cups/ppd/<queue>.ppd
```

Then update `BOOTH_PRINTER` and `BOOTH_PAGE_SIZE` in `/etc/booth.env` and
restart `booth-print`. **No code changes** — both values are read straight
through to `PrintService`, and `read_page_size_px()` re-derives the canvas from
the new PPD, so if Gutenprint adds bleed for borderless output the composition
grows to match automatically.

## Power-cycling

**Shut down before pulling power** — yanking it on a running Pi risks corrupting
the SD card.

```bash
sudo shutdown -h now
```

Wait for the green activity LED to stop blinking, then unplug. Both services
come back on their own after boot (~45s).

## Retention

Frames are never deleted by the capture listener — the same files are the print
source, the upload fallback, and the post-event archive. `booth-retention.timer`
sweeps anything older than 7 days daily. It deliberately skips `spool/pending`
and `spool/active`, which hold work that hasn't printed yet.

```bash
python3 booth_retention.py --days 7 --dry-run   # see what would go
```

This only clears the *Pi's* copy. Nothing in `convex/` calls
`ctx.storage.delete`, so Convex-side files still need clearing by hand.

## Throughput ceiling

A SELPHY pass is ~41s, so **~1.4 sheets/min** is a hard ceiling — one sheet is
two strips, i.e. the traditional pair. The print queue is capped at 8 jobs
(~5 minutes of backlog); past that `enqueue()` rejects and the phone says the
photos are on the phone instead. That cap is intentional: a guest queued 20 deep
has left the venue, and the sheet prints to nobody.
