#!/usr/bin/env python3
"""
booth_print_agent.py
====================
Runs ON THE PI, next to (but independent of) the Node capture listener.
Watches a local spool directory for print jobs and drives them through
PrintWorker to the SELPHY.

Why a second process
--------------------
Capture is Node (it owns the camera and the Convex subscription); printing is
Python (PrintWorker is a blocking state machine with a park-for-operator path
that has no clean event-loop equivalent). They are separate systemd units so a
jammed printer cannot take the camera down with it, and vice versa.

The handoff between them is the FILESYSTEM, not the network:

    <spool>/spool/pending/<burstId>.json   Node renames a job in here
    <spool>/spool/active/<burstId>.json    we rename it here to claim it
    <spool>/spool/done/<burstId>.json      terminal

rename(2) within a directory is atomic, so the move *is* the claim — no lock,
no lease, no race, and it survives a restart of either side. On startup we sweep
active/ back to pending/ to recover anything a crash interrupted.

Nothing here pulls work from Convex. The print path is entirely local and
offline-capable: the frames are already on this disk, composition is Pillow, and
CUPS is on localhost. Convex only ever receives a status report, and losing one
costs a phone indicator, never a sheet.

Env:
    BOOTH_SPOOL_DIR   default /var/lib/booth
    CONVEX_SITE_URL   the .convex.site URL (status reports go here)
    BOOTH_SECRET      shared secret, must match the deployment's
    BOOTH_PRINTER     CUPS queue name      (default: selphy)
    BOOTH_PAGE_SIZE   PPD PageSize name    (default: Postcard)

Both printer vars are read straight through to PrintService, so swapping the
temporary IPP-over-Wi-Fi queue for the USB + Gutenprint one is config, not code.

Dependencies on the Pi:
    sudo apt install -y python3-pil python3-cups
"""

from __future__ import annotations

import json
import logging
import os
import queue
import signal
import sys
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

# photobooth_print.py sits at the repo root in a checkout, and alongside this
# file in a flat deploy directory on the Pi. Accept both.
_HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(_HERE), str(_HERE.parent)]

from photobooth_print import PrintService, PrintTask, PrintWorker, StripLayout, layout_for  # noqa: E402

log = logging.getLogger("booth.agent")

SPOOL_ROOT = Path(os.environ.get("BOOTH_SPOOL_DIR", "/var/lib/booth"))
PENDING_DIR = SPOOL_ROOT / "spool" / "pending"
ACTIVE_DIR = SPOOL_ROOT / "spool" / "active"
DONE_DIR = SPOOL_ROOT / "spool" / "done"

POLL_INTERVAL_S = 1.0

# Worker state -> the coarse printStatus union in convex/printStatus.ts. The
# worker's own vocabulary is finer and free to change; only this table has to
# keep up. Anything not listed is reported as-is and rejected by the endpoint,
# which is the loud failure we want rather than a silently dropped state.
STATUS_MAP = {
    "queued": "queued",
    "composing": "composing",
    "printing": "printing",
    "printed": "printed",
    "blocked": "blocked",
    "waiting-operator": "blocked",
    # A retry is not on the printer right now, so it is honestly "queued".
    "retrying": "queued",
    "failed": "failed",
    "rejected": "failed",
}

# States after which the job file moves to done/ and we stop caring about it.
TERMINAL_WORKER_STATES = {"printed", "failed", "rejected"}


# --------------------------------------------------------------------------
# Status reporting
# --------------------------------------------------------------------------


class StatusReporter(threading.Thread):
    """POSTs job status to Convex on its OWN thread.

    This exists so the print worker never blocks on the network. If reporting
    happened inline in the on_status callback, one hung POST on flaky venue
    Wi-Fi would stall the printer mid-queue — exactly the coupling the whole
    local-print design is meant to avoid. Reports are best-effort and dropped
    after a few tries; paper does not depend on them.
    """

    MAX_TRIES = 3
    TIMEOUT_S = 5

    def __init__(self, site_url: str | None, secret: str | None):
        super().__init__(daemon=True, name="status-reporter")
        self.endpoint = f"{site_url.rstrip('/')}/print-status" if site_url else None
        self.secret = secret
        self.q: queue.Queue[dict | None] = queue.Queue()
        if self.endpoint is None or not self.secret:
            log.warning("CONVEX_SITE_URL/BOOTH_SECRET unset — printing locally, reporting nothing")

    def report(self, payload: dict) -> None:
        if self.endpoint is not None and self.secret:
            self.q.put(payload)

    def stop(self) -> None:
        self.q.put(None)

    def run(self) -> None:
        while True:
            payload = self.q.get()
            if payload is None:
                break
            self._post(payload)

    def _post(self, payload: dict) -> None:
        body = json.dumps({**payload, "secret": self.secret}).encode()
        request = urllib.request.Request(
            self.endpoint,
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        for attempt in range(1, self.MAX_TRIES + 1):
            try:
                with urllib.request.urlopen(request, timeout=self.TIMEOUT_S) as res:
                    res.read()
                return
            except (urllib.error.URLError, OSError) as exc:
                log.warning("status POST %s/%s failed: %s", attempt, self.MAX_TRIES, exc)
                time.sleep(attempt)
        log.error("giving up on status %r for burst %s", payload.get("status"), payload.get("burstId"))


# --------------------------------------------------------------------------
# Spool
# --------------------------------------------------------------------------


def sweep_active() -> None:
    """Recover jobs interrupted by a crash or a restart.

    Anything still in active/ was mid-flight when we died, so put it back.
    NOTE: a job that finished printing but died before its file moved to done/
    will print a second sheet. That window is milliseconds wide, and for a photo
    booth an occasional duplicate strip beats an occasional missing one.
    """
    for job_path in sorted(ACTIVE_DIR.glob("*.json")):
        target = PENDING_DIR / job_path.name
        job_path.rename(target)
        log.info("recovered interrupted job %s", job_path.stem)


def claim_next() -> tuple[Path, dict] | None:
    """Atomically take the oldest pending job. The rename IS the claim."""
    for job_path in sorted(PENDING_DIR.glob("*.json")):
        active_path = ACTIVE_DIR / job_path.name
        try:
            job_path.rename(active_path)
        except FileNotFoundError:
            continue  # someone else got it (or it was cleaned up); try the next
        try:
            return active_path, json.loads(active_path.read_text())
        except (json.JSONDecodeError, OSError) as exc:
            log.error("unreadable job %s: %s — parking in done/", active_path.name, exc)
            active_path.rename(DONE_DIR / active_path.name)
            continue
    return None


def build_task(job: dict) -> PrintTask:
    frames = [Path(p) for p in job["frames"]]
    # Check the COUNT before the files: build_strip() raises on a short set, and
    # an empty `frames` list would otherwise sail past the existence check below
    # and only blow up inside the worker.
    expected = StripLayout.photos
    if len(frames) != expected:
        raise ValueError(f"need {expected} frames, job declares {len(frames)}")
    missing = [str(p) for p in frames if not p.exists()]
    if missing:
        raise FileNotFoundError(f"frames missing from disk: {', '.join(missing)}")
    theme = job.get("theme")
    return PrintTask(
        photo_paths=frames,
        session_id=str(job.get("sessionId", "")),
        burst_id=str(job["burstId"]),
        token=str(job.get("token", "")),
        # The guest's pick on the kiosk travels with the capture and lands in
        # the job; a phone-started burst carries none and gets BOOTH_THEME.
        strip_layout=layout_for(theme if isinstance(theme, str) else None),
    )


# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")

    for directory in (PENDING_DIR, ACTIVE_DIR, DONE_DIR):
        directory.mkdir(parents=True, exist_ok=True)

    reporter = StatusReporter(os.environ.get("CONVEX_SITE_URL"), os.environ.get("BOOTH_SECRET"))
    reporter.start()

    service = PrintService()
    log.info("printer=%s page_size=%s spool=%s", service.printer, service.page_size, SPOOL_ROOT)

    # burstId -> the job file we hold in active/, so a terminal status can
    # retire it. The worker thread only ever hands us a PrintTask.
    active_files: dict[str, Path] = {}
    active_lock = threading.Lock()

    def on_status(task: PrintTask, state: str, detail: str) -> None:
        log.info("[%s] %s %s", task.burst_id, state, detail)
        reporter.report(
            {
                "token": task.token,
                "burstId": task.burst_id,
                "status": STATUS_MAP.get(state, state),
                "detail": detail or None,
                "attempts": task.attempts,
                "sheets": 1,
                **({"error": detail} if state in ("failed", "rejected") else {}),
            }
        )
        if state in TERMINAL_WORKER_STATES:
            retire(task.burst_id)

    def retire(burst_id: str) -> None:
        with active_lock:
            job_path = active_files.pop(burst_id, None)
        if job_path is not None and job_path.exists():
            job_path.rename(DONE_DIR / job_path.name)

    worker = PrintWorker(service, spool_dir=SPOOL_ROOT / "sheets", on_status=on_status)
    worker.start()

    stopping = threading.Event()
    # systemd stops us with SIGTERM; Ctrl-C during a manual run sends SIGINT.
    # Both drain cleanly rather than killing a job mid-print. Registration only
    # works on the main thread, which is where the service runs it — under a
    # test harness or an embedding host we simply run without handlers.
    try:
        signal.signal(signal.SIGTERM, lambda *_: stopping.set())
        signal.signal(signal.SIGINT, lambda *_: stopping.set())
    except ValueError:
        log.warning("not on the main thread — running without signal handlers")

    sweep_active()
    log.info("print agent running — watching %s", PENDING_DIR)

    while not stopping.is_set():
        claimed = claim_next()
        if claimed is None:
            stopping.wait(POLL_INTERVAL_S)
            continue

        job_path, job = claimed
        burst_id = str(job.get("burstId", job_path.stem))
        try:
            task = build_task(job)
        except (KeyError, ValueError, FileNotFoundError, TypeError) as exc:
            log.error("unusable job %s: %s", burst_id, exc)
            reporter.report(
                {
                    "token": str(job.get("token", "")),
                    "burstId": burst_id,
                    "status": "failed",
                    "error": str(exc)[:300],
                }
            )
            job_path.rename(DONE_DIR / job_path.name)
            continue

        with active_lock:
            active_files[burst_id] = job_path
        if not worker.enqueue(task):
            # enqueue() already reported "rejected", which retires the file.
            log.warning("queue full — dropped burst %s", burst_id)

    log.info("shutting down")
    worker.stop()
    worker.join(timeout=10)
    reporter.stop()
    reporter.join(timeout=10)


if __name__ == "__main__":
    main()
