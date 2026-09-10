#!/usr/bin/env python3
"""
photobooth_print.py
===================
Sheet composition + CUPS print worker for a Canon SELPHY CP1500 driven
from a Raspberry Pi 5.

Design notes
------------
* The SELPHY "Postcard" media is 100 x 148 mm (3.94" x 5.83"), NOT a true
  4" x 6". At 300 DPI that is ~1181 x 1748 px. The exact page geometry is
  read from the installed PPD at runtime so the canvas always matches what
  CUPS/Gutenprint expects; the nominal values are only a fallback.
* Two identical strips are composed side by side on one sheet. One straight
  cut down the middle yields two ~50 x 148 mm strips. Printing a single
  strip on a half-blank sheet costs the same media for half the output.
* Composition is fully deterministic (exact pixels, no browser, no scaling).
  The job is handed to CUPS as a PDF whose MediaBox equals the page size,
  and submitted with print-scaling=none so nothing re-scales it.
* `cups` is imported lazily so the composition half of this module runs on a
  laptop with no printer attached.

Dependencies on the Pi:
    sudo apt install -y python3-pil python3-cups
"""

from __future__ import annotations

import argparse
import logging
import os
import queue
import re
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Sequence

from PIL import Image, ImageDraw, ImageFont, ImageOps

log = logging.getLogger("booth.print")

# --------------------------------------------------------------------------
# Geometry
# --------------------------------------------------------------------------

DPI = 300
MM_PER_IN = 25.4

# Nominal SELPHY postcard media. Only used if the PPD cannot be read.
NOMINAL_SHEET_MM = (100.0, 148.0)

# IPP job states (RFC 8011). pycups exposes these as cups.IPP_JOB_*.
JOB_PENDING, JOB_HELD, JOB_PROCESSING = 3, 4, 5
JOB_STOPPED, JOB_CANCELED, JOB_ABORTED, JOB_COMPLETED = 6, 7, 8, 9
JOB_TERMINAL = {JOB_CANCELED, JOB_ABORTED, JOB_COMPLETED}

# Canon quotes ~41 s per postcard print. Anything past this is a stall.
SINGLE_PRINT_TIMEOUT_S = 150


def mm_to_px(value_mm: float) -> int:
    """Millimetres -> pixels at the working DPI."""
    return round(value_mm / MM_PER_IN * DPI)


def read_page_size_px(printer: str, page_size: str) -> tuple[int, int]:
    """
    Return the sheet size in pixels by parsing *PaperDimension out of the
    PPD CUPS generated for this queue. This is the single source of truth:
    if Gutenprint adds bleed for borderless output, the canvas grows to match
    and the composition still lands exactly where it should.
    """
    ppd = Path(f"/etc/cups/ppd/{printer}.ppd")
    if ppd.exists():
        pattern = re.compile(
            r'^\*PaperDimension\s+' + re.escape(page_size) + r'[^:]*:\s*"([\d.]+)\s+([\d.]+)"',
            re.MULTILINE,
        )
        match = pattern.search(ppd.read_text(errors="ignore"))
        if match:
            w_pt, h_pt = float(match.group(1)), float(match.group(2))
            size = (round(w_pt / 72 * DPI), round(h_pt / 72 * DPI))
            log.info("Page %s from PPD: %.2f x %.2f pt -> %d x %d px", page_size, w_pt, h_pt, *size)
            return size
        log.warning("PageSize %r not found in %s; falling back to nominal", page_size, ppd)
    else:
        log.warning("No PPD at %s; falling back to nominal page size", ppd)

    return mm_to_px(NOMINAL_SHEET_MM[0]), mm_to_px(NOMINAL_SHEET_MM[1])


# --------------------------------------------------------------------------
# Layout
# --------------------------------------------------------------------------


@dataclass
class StripLayout:
    """All strip geometry in millimetres so it stays DPI-independent."""

    photos: int = 4
    outer_margin_mm: float = 2.5
    gutter_mm: float = 2.0
    # 18mm left most of the footer band as dead white: _fit_text shrinks the
    # caption until it fits the 530px cell width, which lands around 30px tall.
    # 10mm still clears the text and gives each of the four cells ~23px back.
    footer_mm: float = 10.0
    footer_text: str = "THE BOOTH  ·  2026"
    background: tuple[int, int, int] = (255, 255, 255)
    footer_colour: tuple[int, int, int] = (25, 25, 25)


@dataclass
class SheetLayout:
    """How strips are arranged on the physical sheet."""

    strips_per_sheet: int = 2          # 2 = duplicate + single centre cut
    draw_cut_marks: bool = True        # short ticks at the sheet edges only
    cut_mark_mm: float = 3.0


def _load_font(size_px: int) -> ImageFont.FreeTypeFont:
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    ]
    for path in candidates:
        if Path(path).exists():
            return ImageFont.truetype(path, size_px)
    return ImageFont.load_default()


def _fit_text(draw: ImageDraw.ImageDraw, text: str, max_width: int, start_px: int):
    """Largest font size at which `text` still fits inside max_width."""
    size = max(10, start_px)
    while size > 10:
        font = _load_font(size)
        box = draw.textbbox((0, 0), text, font=font)
        if box[2] - box[0] <= max_width:
            return font, box
        size -= 2
    font = _load_font(10)
    return font, draw.textbbox((0, 0), text, font=font)


def fill_cell(src: Image.Image, width: int, height: int) -> Image.Image:
    """Centre-crop to the cell aspect ratio, then resample. No distortion,
    no letterboxing — the classic photo-booth look."""
    return ImageOps.fit(
        src.convert("RGB"), (width, height), method=Image.LANCZOS, centering=(0.5, 0.5)
    )


def build_strip(
    photos: Sequence[Image.Image], width: int, height: int, layout: StripLayout
) -> Image.Image:
    """Compose one vertical strip at exactly (width x height) pixels."""
    if len(photos) < layout.photos:
        raise ValueError(f"need {layout.photos} photos, got {len(photos)}")

    margin = mm_to_px(layout.outer_margin_mm)
    gutter = mm_to_px(layout.gutter_mm)
    footer = mm_to_px(layout.footer_mm)
    n = layout.photos

    cell_w = width - 2 * margin
    usable_h = height - 2 * margin - footer - gutter * (n - 1)
    cell_h = usable_h // n
    if cell_w <= 0 or cell_h <= 0:
        raise ValueError("strip margins/footer leave no room for photos")

    strip = Image.new("RGB", (width, height), layout.background)
    for i, photo in enumerate(photos[:n]):
        y = margin + i * (cell_h + gutter)
        strip.paste(fill_cell(photo, cell_w, cell_h), (margin, y))

    if layout.footer_text:
        draw = ImageDraw.Draw(strip)
        font, box = _fit_text(draw, layout.footer_text, cell_w, int(footer * 0.55))
        text_w, text_h = box[2] - box[0], box[3] - box[1]
        draw.text(
            ((width - text_w) // 2 - box[0],
             height - margin - footer // 2 - text_h // 2 - box[1]),
            layout.footer_text,
            font=font,
            fill=layout.footer_colour,
        )
    return strip


def build_sheet(
    photos: Sequence[Image.Image],
    sheet_px: tuple[int, int],
    strip_layout: StripLayout | None = None,
    sheet_layout: SheetLayout | None = None,
) -> Image.Image:
    """Compose the full printable sheet: N identical strips side by side."""
    strip_layout = strip_layout or StripLayout()
    sheet_layout = sheet_layout or SheetLayout()

    sheet_w, sheet_h = sheet_px
    column_w = sheet_w // sheet_layout.strips_per_sheet

    strip = build_strip(photos, column_w, sheet_h, strip_layout)

    sheet = Image.new("RGB", (sheet_w, sheet_h), strip_layout.background)
    for i in range(sheet_layout.strips_per_sheet):
        sheet.paste(strip, (i * column_w, 0))

    if sheet_layout.draw_cut_marks and sheet_layout.strips_per_sheet > 1:
        draw = ImageDraw.Draw(sheet)
        tick = mm_to_px(sheet_layout.cut_mark_mm)
        for i in range(1, sheet_layout.strips_per_sheet):
            x = i * column_w
            draw.line([(x, 0), (x, tick)], fill=(140, 140, 140), width=2)
            draw.line([(x, sheet_h - tick), (x, sheet_h)], fill=(140, 140, 140), width=2)

    return sheet


def sheet_to_pdf(sheet: Image.Image, out_path: Path) -> Path:
    """
    Write a single-page PDF whose MediaBox equals the image size at DPI.
    Handing CUPS a PDF that already matches the page removes every
    opportunity for a filter to rescale or re-centre the artwork.
    """
    out_path.parent.mkdir(parents=True, exist_ok=True)
    sheet.convert("RGB").save(out_path, "PDF", resolution=float(DPI))
    return out_path


# --------------------------------------------------------------------------
# CUPS
# --------------------------------------------------------------------------


class PrinterBusy(Exception):
    """Raised when the printer needs a human (paper, ribbon, cover, jam)."""


@dataclass
class PrintService:
    printer: str = os.environ.get("BOOTH_PRINTER", "selphy")
    page_size: str = os.environ.get("BOOTH_PAGE_SIZE", "Postcard")
    copies: int = 1

    def _conn(self):
        import cups  # lazy: keeps composition usable off-device

        return cups.Connection()

    # ---- state -----------------------------------------------------------

    def printer_reasons(self) -> list[str]:
        attrs = self._conn().getPrinterAttributes(self.printer)
        reasons = attrs.get("printer-state-reasons", [])
        return [reasons] if isinstance(reasons, str) else list(reasons)

    def preflight(self) -> tuple[bool, str]:
        """Call this at the start of the event and between guests."""
        try:
            reasons = self.printer_reasons()
        except Exception as exc:  # cupsd down, printer removed, USB gone
            return False, f"cannot reach CUPS: {exc}"

        blocking = [r for r in reasons if r.endswith("-error") or r in {
            "media-empty", "media-needed", "media-jam", "cover-open",
            "marker-supply-empty", "offline-report", "paused",
        }]
        if blocking:
            return False, "; ".join(blocking)
        return True, "ready"

    # ---- submission ------------------------------------------------------

    def submit(self, pdf_path: Path, title: str = "booth-strip") -> int:
        options = {
            "media": self.page_size,
            "print-scaling": "none",   # modern CUPS: do not fit/fill/scale
            "fit-to-page": "false",    # legacy filters honour this instead
            "copies": str(self.copies),
            "StpImageType": "Photo",   # Gutenprint: photographic rendering
        }
        job_id = self._conn().printFile(self.printer, str(pdf_path), title, options)
        log.info("submitted job %s (%s)", job_id, pdf_path.name)
        return job_id

    def wait(self, job_id: int, timeout_s: int = SINGLE_PRINT_TIMEOUT_S) -> str:
        """Block until the job finishes. Raises PrinterBusy on a stall."""
        conn = self._conn()
        deadline = time.monotonic() + timeout_s
        last_state = None

        while time.monotonic() < deadline:
            attrs = conn.getJobAttributes(job_id)
            state = attrs.get("job-state")
            if state != last_state:
                log.info("job %s state=%s", job_id, state)
                last_state = state

            if state == JOB_COMPLETED:
                return "completed"
            if state in {JOB_CANCELED, JOB_ABORTED}:
                raise PrinterBusy(f"job {job_id} ended in state {state}")
            if state in {JOB_HELD, JOB_STOPPED}:
                raise PrinterBusy("; ".join(self.printer_reasons()) or f"state {state}")

            time.sleep(1.0)

        # Timed out: pull the job so it cannot silently print later.
        try:
            conn.cancelJob(job_id)
        except Exception:
            pass
        raise PrinterBusy(f"job {job_id} exceeded {timeout_s}s — stalled")

    # ---- recovery --------------------------------------------------------

    def resume(self) -> None:
        """Re-enable a queue CUPS stopped on a transient backend failure.
        Deliberately does NOT clear consumable faults — those need a human."""
        self._conn().enablePrinter(self.printer)

    def needs_operator(self) -> bool:
        return any(
            r.startswith(("media-empty", "media-needed", "media-jam",
                          "cover-open", "marker-supply"))
            for r in self.printer_reasons()
        )


# --------------------------------------------------------------------------
# Worker: capture must never block on a 41-second print
# --------------------------------------------------------------------------


@dataclass
class PrintTask:
    photo_paths: list[Path]
    session_id: str
    # The burst these frames came from. One press of "Take 4 photos" is one
    # burst is one sheet.
    burst_id: str = ""
    # Carried so the status callback can report to Convex without a lookup.
    token: str = ""
    strip_layout: StripLayout = field(default_factory=StripLayout)
    sheet_layout: SheetLayout = field(default_factory=SheetLayout)
    attempts: int = 0

    @property
    def job_key(self) -> str:
        """Spool filename stem. Keyed on the BURST, not the session: a guest who
        takes a second round of photos would otherwise overwrite the first
        sheet's PDF while it was still being printed."""
        return self.burst_id or self.session_id


class PrintWorker(threading.Thread):
    """
    Single background thread owning the printer. The UI thread only ever
    calls enqueue(); everything slow, retryable, or failure-prone happens
    here, and status flows back through on_status for the kiosk/Convex.
    """

    MAX_ATTEMPTS = 3

    def __init__(
        self,
        service: PrintService,
        spool_dir: Path = Path("/var/tmp/booth"),
        on_status: Callable[[PrintTask, str, str], None] | None = None,
        # ~41s per sheet, so this is the queue's depth in MINUTES: 8 sheets is
        # about 5 minutes of backlog. The old default of 20 was nearly 14
        # minutes — a guest queued that deep has left the venue, and the sheet
        # prints to nobody. Reject beyond this instead: the phone gallery is the
        # primary deliverable, so "your photos are on your phone" is a fine
        # answer and the printer stays inside a human attention span.
        max_pending: int = 8,
    ):
        super().__init__(daemon=True, name="print-worker")
        self.service = service
        self.spool_dir = spool_dir
        self.on_status = on_status or (lambda task, state, detail: None)
        self.q: queue.Queue[PrintTask | None] = queue.Queue(maxsize=max_pending)
        self._sheet_px: tuple[int, int] | None = None
        self._stop = threading.Event()

    @property
    def sheet_px(self) -> tuple[int, int]:
        if self._sheet_px is None:
            self._sheet_px = read_page_size_px(self.service.printer, self.service.page_size)
        return self._sheet_px

    def enqueue(self, task: PrintTask) -> bool:
        """Non-blocking. Returns False if the queue is full — show the guest
        a 'printer is catching up' message instead of silently dropping."""
        try:
            self.q.put_nowait(task)
            self.on_status(task, "queued", f"{self.q.qsize()} ahead")
            return True
        except queue.Full:
            self.on_status(task, "rejected", "print queue full")
            return False

    def stop(self) -> None:
        self._stop.set()
        self.q.put(None)

    def run(self) -> None:
        while not self._stop.is_set():
            task = self.q.get()
            if task is None:
                break
            try:
                self._handle(task)
            except Exception as exc:
                # Anything _handle didn't expect — a corrupt JPEG, a short frame
                # set, a full disk. This MUST still emit a terminal status: the
                # caller uses it to retire the job, and a job that never reaches
                # a terminal state is retried on every restart forever.
                log.exception("unhandled error on burst %s", task.job_key)
                self.on_status(task, "failed", f"{type(exc).__name__}: {exc}"[:300])
            finally:
                self.q.task_done()

    def _handle(self, task: PrintTask) -> None:
        self.on_status(task, "composing", "")
        photos = [Image.open(p) for p in task.photo_paths]
        sheet = build_sheet(photos, self.sheet_px, task.strip_layout, task.sheet_layout)
        pdf = sheet_to_pdf(sheet, self.spool_dir / f"{task.job_key}.pdf")
        # Keep a flat preview for the kiosk screen / phone gallery.
        sheet.save(self.spool_dir / f"{task.job_key}.jpg", quality=92)

        # Outer loop: a consumable fault parks the task until a human reloads,
        # then the attempt budget starts over. This used to be recursion —
        # _park() called _handle() — which added a stack frame per ribbon change
        # and would grow without bound over a long event.
        while not self._stop.is_set():
            outcome = self._print_with_retries(task, pdf)
            if outcome != "parked":
                return
            if not self._await_operator(task):
                return
            task.attempts = 0

    def _print_with_retries(self, task: PrintTask, pdf: Path) -> str:
        """One budget of attempts. Returns 'printed', 'failed', or 'parked'
        (consumables are out and only a human can clear it)."""
        while task.attempts < self.MAX_ATTEMPTS and not self._stop.is_set():
            task.attempts += 1
            ok, detail = self.service.preflight()
            if not ok:
                self.on_status(task, "blocked", detail)
                if self.service.needs_operator():
                    # Paper or ribbon: park the task, do not burn retries.
                    return "parked"
                self.service.resume()
                time.sleep(3)
                continue

            try:
                job_id = self.service.submit(pdf, title=f"booth-{task.job_key}")
                self.on_status(task, "printing", f"job {job_id}")
                self.service.wait(job_id)
                self.on_status(task, "printed", "")
                return "printed"
            except PrinterBusy as exc:
                log.warning("attempt %s/%s failed: %s", task.attempts, self.MAX_ATTEMPTS, exc)
                self.on_status(task, "retrying", str(exc))
                if self.service.needs_operator():
                    return "parked"
                self.service.resume()
                time.sleep(2 * task.attempts)  # linear backoff

        if self._stop.is_set():
            return "failed"
        self.on_status(task, "failed", "gave up after retries")
        return "failed"

    def _await_operator(self, task: PrintTask) -> bool:
        """Block until someone reloads paper or ribbon. Returns False if the
        worker is shutting down instead. The whole queue stalls here on purpose —
        there is one printer, so nothing behind this task could print anyway."""
        self.on_status(task, "waiting-operator", "; ".join(self.service.printer_reasons()))
        while not self._stop.is_set():
            time.sleep(5)
            if not self.service.needs_operator():
                self.service.resume()
                self.on_status(task, "queued", "resumed after reload")
                return True
        return False


# --------------------------------------------------------------------------
# CLI / smoke test
# --------------------------------------------------------------------------


def _placeholder(i: int, size=(1200, 800)) -> Image.Image:
    """Synthetic frame so the layout can be checked without a camera."""
    img = Image.new("RGB", size, (245, 245, 245))
    draw = ImageDraw.Draw(img)
    for y in range(size[1]):
        shade = int(200 - 90 * y / size[1])
        draw.line([(0, y), (size[0], y)], fill=(shade, shade - 12 * i % 60, 210 - shade // 3))
    font = _load_font(160)
    draw.text((size[0] // 2 - 50, size[1] // 2 - 90), str(i + 1), font=font, fill=(255, 255, 255))
    return img


def main() -> None:
    parser = argparse.ArgumentParser(description="Compose (and optionally print) a booth sheet.")
    parser.add_argument("photos", nargs="*", type=Path, help="source frames, in order")
    parser.add_argument("--out", type=Path, default=Path("./sheet.pdf"))
    parser.add_argument("--printer", default=os.environ.get("BOOTH_PRINTER", "selphy"))
    parser.add_argument("--page-size", default=os.environ.get("BOOTH_PAGE_SIZE", "Postcard"))
    parser.add_argument("--strips", type=int, default=2)
    parser.add_argument("--print", dest="do_print", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    sheet_px = read_page_size_px(args.printer, args.page_size)
    strip_layout = StripLayout()
    photos = (
        [Image.open(p) for p in args.photos]
        if args.photos
        else [_placeholder(i) for i in range(strip_layout.photos)]
    )

    sheet = build_sheet(photos, sheet_px, strip_layout, SheetLayout(strips_per_sheet=args.strips))
    pdf = sheet_to_pdf(sheet, args.out)
    sheet.save(args.out.with_suffix(".png"))
    print(f"sheet: {sheet.size[0]} x {sheet.size[1]} px -> {pdf}")

    if args.do_print:
        service = PrintService(printer=args.printer, page_size=args.page_size)
        ok, detail = service.preflight()
        if not ok:
            raise SystemExit(f"printer not ready: {detail}")
        job = service.submit(pdf)
        print("result:", service.wait(job))


if __name__ == "__main__":
    main()
