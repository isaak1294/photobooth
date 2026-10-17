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

Then **calibrate the overscan**. Borderless dye-sub **overscans**: the printer
enlarges the image a few percent so colour reaches the paper edge, which crops
that much off every side, and not necessarily evenly. The bordered size loses
its hard margins instead. Either way the symptom is photos nicked at the top,
left and right while the **bottom looks fine**. The bottom is probably cropped
too; you can't see it because the lowest ink (the footer) sits 6.5mm up, while
photos sit 2.5mm from the other three edges. So measure rather than eyeball.

### Dialling it in

**1. Make sure the Pi is running the overscan code at all.** `deploy-to-pi.sh`
pulls `main`, so a branch that hasn't been merged never reaches the Pi, and
older code silently ignores `BOOTH_OVERSCAN_*`:

```bash
grep -c overscan_top_mm ~/ai-photobooth/booth/photobooth_print.py   # 0 = old code
journalctl -u booth-print -b | grep 'overscan mm'                  # what the agent loaded
```

No `overscan mm:` line in the journal means old code or no restart. Run
`deploy-to-pi.sh` with `BRANCH=<branch>`, then `sudo systemctl restart booth-print`.

**2. Measure.** Print the ruler sheet **on the booth's page size**, twice:

```bash
cd ~/ai-photobooth/booth
python3 photobooth_print.py --calibrate --printer selphy-net --page-size jpn_hagaki_100x148mm.Borderless --print
```

Each edge has three rulers that count mm in from the image edge, with a tick
every half mm. On each ruler, find the **first tick you can see whole**: a long
numbered tick is that many mm, and a short tick is the half mm between its
neighbours. That is the side's overscan. The sheet prints its page size and
time in the middle, so you can tell prints apart later.

- The three rulers on one side should agree. If they differ by more than a half
  mm, the paper is feeding in crooked: reseat the cassette and print again. No
  setting fixes a skewed feed.
- The two sheets should agree too. If they don't, take the larger reading per
  side. If they differ by a whole mm or more, the feed varies that much from
  sheet to sheet. Absorb it by raising `BOOTH_OUTER_MARGIN_MM` (say to 3.5); that
  margin is symmetric, so the strips stay centred.
- Fold test: fold a print in half side to side. The grey centre line should sit
  on the fold. If it's off by X mm, left and right overscan differ by 2X.

**3. Set it.** Put the four readings in `/etc/booth.env` with no safety added
(the strip's own 2.5mm border is the safety), then
`sudo systemctl restart booth-print`. These are our CP1500's values: measured
2026-09-30, then nudged from a test strip on 2026-10-08:

```
BOOTH_OVERSCAN_TOP_MM=4
BOOTH_OVERSCAN_BOTTOM_MM=3
BOOTH_OVERSCAN_LEFT_MM=2.5
BOOTH_OVERSCAN_RIGHT_MM=3
```

**4. Check a real strip, and nudge.** The CLI reads these from the shell, not
from `/etc/booth.env`, and prints the overscan it used, so check that line:

```bash
export BOOTH_OVERSCAN_TOP_MM=4 BOOTH_OVERSCAN_BOTTOM_MM=3 BOOTH_OVERSCAN_LEFT_MM=2.5 BOOTH_OVERSCAN_RIGHT_MM=3
python3 photobooth_print.py --printer selphy-net --page-size jpn_hagaki_100x148mm.Borderless --print
```

Measure from each keyline to the paper edge; every side should be 2.5mm. Each
side is independent. If a side's gap is X mm short, add X to that side's
overscan. If it's X mm wide, subtract X. Re-export, reprint, and repeat until
they match. Then copy the final numbers into `/etc/booth.env` and restart.

**5. Cut on the grey ticks, not the middle of the paper.** The ticks mark the
centre of what printed. With the overscan right, that is the middle of the
paper anyway. If it's still off, the ticks keep both strips identical.

Don't use `BOOTH_OUTER_MARGIN_MM` to dodge cropping: it also applies at the
centre cut, so raising it for one edge leaves each strip off-centre after
cutting. If you set it (or `BOOTH_MARGIN_TOP_MM` / `_BOTTOM_MM`) for that in the
past, remove them.

Photos shrink by the overscan: each strip loses half the left+right total in
width, and each of the four cells loses a quarter of the top+bottom total in
height (about 2.75mm and 1.75mm for the numbers above). Re-run the calibration
after any change of printer, queue or page size.

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
