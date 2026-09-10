#!/usr/bin/env bash
# Fetch just the files the booth needs onto a Raspberry Pi. Run ON THE PI:
#
#   curl -fsSL https://raw.githubusercontent.com/isaak1294/photobooth/main/pi/deploy-to-pi.sh | bash
#
# The repo is deliberately NOT cloned here. The Pi needs four programs and four
# systemd units; the rest of the repository (the Next.js app, the Expo client,
# node_modules) is dead weight on an SD card. This is also the update path —
# re-run it, then restart the two services.
#
# Everything lands in ONE FLAT directory, ~/ai-photobooth/booth. There are no
# subdirectories, so repo-relative paths like `pi/systemd/...` do not resolve
# there. That is the single most common way this setup goes wrong.
#
# Env overrides:
#   BOOTH_DIR    where the programs go   (default ~/ai-photobooth/booth)
#   BRANCH       which branch to pull    (default main)

set -euo pipefail

REPO="${REPO:-isaak1294/photobooth}"
BRANCH="${BRANCH:-main}"
BOOTH_DIR="${BOOTH_DIR:-$HOME/ai-photobooth/booth}"
RAW="${RAW:-https://raw.githubusercontent.com/${REPO}/${BRANCH}}"
# Where the systemd units go. Overridable so this script can be exercised
# without root, and so it works when run AS root (where sudo may not exist).
UNIT_DIR="${UNIT_DIR:-/etc/systemd/system}"

# repo path -> destination filename in BOOTH_DIR
PROGRAMS=(
  "my-app/scripts/pi-listener.mjs:pi-listener.mjs"
  "photobooth_print.py:photobooth_print.py"
  "pi/booth_print_agent.py:booth_print_agent.py"
  "pi/booth_retention.py:booth_retention.py"
)
UNITS=(
  booth-capture.service
  booth-print.service
  booth-retention.service
  booth-retention.timer
)

mkdir -p "$BOOTH_DIR"
cd "$BOOTH_DIR"

# Download to a staging directory first. A half-fetched booth directory is worse
# than an untouched one: systemd would restart the services against a mix of old
# and new files, and the failure would look like a code bug rather than a bad
# download.
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

echo "Fetching from ${REPO}@${BRANCH}"
for entry in "${PROGRAMS[@]}"; do
  src="${entry%%:*}"
  dst="${entry##*:}"
  echo "  $src"
  curl -fsSL "${RAW}/${src}" -o "${STAGE}/${dst}"
done
for unit in "${UNITS[@]}"; do
  echo "  pi/systemd/$unit"
  curl -fsSL "${RAW}/pi/systemd/${unit}" -o "${STAGE}/${unit}"
done

# Cheap sanity check: GitHub serves a 404 page as 200 for some paths, and an
# HTML error page silently installed as pi-listener.mjs is a confusing failure.
for entry in "${PROGRAMS[@]}"; do
  dst="${entry##*:}"
  if head -c 20 "${STAGE}/${dst}" | grep -qi '<!doctype\|<html'; then
    echo "ERROR: ${dst} came back as HTML, not source. Wrong branch, or the repo is private." >&2
    exit 1
  fi
done

for entry in "${PROGRAMS[@]}"; do
  dst="${entry##*:}"
  install -m 0644 "${STAGE}/${dst}" "${BOOTH_DIR}/${dst}"
done
mkdir -p "$UNIT_DIR" 2>/dev/null || sudo mkdir -p "$UNIT_DIR"
for unit in "${UNITS[@]}"; do
  if [ -w "$UNIT_DIR" ]; then
    install -m 0644 "${STAGE}/${unit}" "${UNIT_DIR}/${unit}"
  else
    sudo install -m 0644 "${STAGE}/${unit}" "${UNIT_DIR}/${unit}"
  fi
done

echo
echo "Programs -> ${BOOTH_DIR}"
echo "Units    -> ${UNIT_DIR}"

if [ ! -d "${BOOTH_DIR}/node_modules/convex" ]; then
  echo
  echo "NEXT: the capture listener needs its one dependency:"
  echo "  cd ${BOOTH_DIR} && npm install convex"
fi

if [ ! -s /etc/booth.env ]; then
  echo
  echo "NEXT: /etc/booth.env is missing or empty — booth-capture will exit on start."
  echo "  See the 'First-time setup' section of pi/README.md for the template."
fi

echo
echo "Then:  sudo systemctl daemon-reload && sudo systemctl restart booth-capture booth-print"
