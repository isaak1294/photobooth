#!/usr/bin/env python3
"""
booth_retention.py
==================
Deletes captured frames, composed sheets, and retired spool files older than
N days from the Pi's local storage.

Why this exists
---------------
Frames are written to /var/lib/booth and never deleted by the capture listener —
that is deliberate, since the same files are the print source, the upload
fallback, and the post-event archive. Something has to reclaim them eventually.

There is also a moderation angle: guests can upload arbitrary inspiration images
for custom themes, and printing raises the stakes on anything the booth retains.
Nothing in convex/ calls ctx.storage.delete, so this only handles the Pi's copy —
the Convex-side files still have to be cleared from the dashboard.

Usage:
    python3 booth_retention.py --days 7            # delete
    python3 booth_retention.py --days 7 --dry-run  # list only
"""

from __future__ import annotations

import argparse
import logging
import os
import shutil
import time
from pathlib import Path

log = logging.getLogger("booth.retention")

SPOOL_ROOT = Path(os.environ.get("BOOTH_SPOOL_DIR", "/var/lib/booth"))


def sweep(root: Path, cutoff: float, dry_run: bool) -> tuple[int, int]:
    """Delete entries under `root` last modified before `cutoff`."""
    removed = 0
    freed = 0
    if not root.exists():
        return 0, 0

    for entry in sorted(root.iterdir()):
        try:
            if entry.stat().st_mtime >= cutoff:
                continue
            size = entry_size(entry)
            if dry_run:
                log.info("would remove %s (%.1f MB)", entry, size / 1e6)
            else:
                shutil.rmtree(entry) if entry.is_dir() else entry.unlink()
                log.info("removed %s (%.1f MB)", entry, size / 1e6)
            removed += 1
            freed += size
        except OSError as exc:
            log.error("could not remove %s: %s", entry, exc)
    return removed, freed


def entry_size(entry: Path) -> int:
    if entry.is_file():
        return entry.stat().st_size
    return sum(p.stat().st_size for p in entry.rglob("*") if p.is_file())


def main() -> None:
    parser = argparse.ArgumentParser(description="Reclaim old booth media.")
    parser.add_argument("--days", type=float, default=7.0)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    cutoff = time.time() - args.days * 86400

    total_removed = 0
    total_freed = 0
    # Session frame directories, composed sheets, and retired job files. `pending`
    # and `active` are deliberately NOT swept — anything in them is either
    # waiting to print or printing right now.
    for root in (SPOOL_ROOT / "sessions", SPOOL_ROOT / "sheets", SPOOL_ROOT / "spool" / "done"):
        removed, freed = sweep(root, cutoff, args.dry_run)
        total_removed += removed
        total_freed += freed

    verb = "would free" if args.dry_run else "freed"
    log.info("%s entries, %s %.1f MB", total_removed, verb, total_freed / 1e6)


if __name__ == "__main__":
    main()
