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
* The strip's colours, caption and ornaments are a THEME (StripLayout preset in
  THEMES), picked per event with BOOTH_THEME / --theme. Geometry is shared.

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


RGB = tuple[int, int, int]


@dataclass
class StripLayout:
    """All strip geometry in millimetres so it stays DPI-independent.

    The colour/text fields are the THEME. Presets live in THEMES below and are
    chosen with BOOTH_THEME (env) or --theme (CLI); the geometry defaults are
    shared by all of them."""

    photos: int = 4
    outer_margin_mm: float = 2.5
    gutter_mm: float = 2.0
    # 18mm left most of the footer band as dead white: _fit_text shrinks the
    # caption until it fits the 530px cell width, which lands around 30px tall.
    # 10mm still clears the text and gives each of the four cells ~23px back.
    footer_mm: float = 10.0
    # Footer copy: the big line, and an optional small line under it.
    footer_text: str = "THE BOOTH  ·  2026"
    footer_subtext: str = ""
    background: RGB = (255, 255, 255)
    footer_colour: RGB = (25, 25, 25)
    footer_subcolour: RGB = (25, 25, 25)
    # Keyline drawn around each photo cell, 0 for none.
    cell_border_mm: float = 0.0
    cell_border_colour: RGB = (0, 0, 0)
    # Ornament drawn either side of the big footer line: "bolt", "star" or "".
    footer_ornament: str = ""
    ornament_colour: RGB = (255, 184, 28)


# UVic Vikes navy + gold. Approximations of the brand Pantones (2955 C / 1235 C),
# tuned so the gold still reads as gold on dye-sub rather than going mustard.
UVIC_NAVY: RGB = (0, 58, 112)
UVIC_GOLD: RGB = (255, 184, 28)
# POPFLASH — the booth's own brand (my-app/app/globals.css).
POP_YELLOW: RGB = (255, 222, 3)
POP_PINK: RGB = (255, 45, 149)
INK: RGB = (0, 0, 0)
PAPER: RGB = (255, 255, 255)

# Keys are what the kiosk sends on each capture (app/kiosk/route.ts lists them
# for the picker) and what the print job carries; keep them stable. An unknown
# key falls back to BOOTH_THEME, so adding one here first is always safe.
THEMES: dict[str, StripLayout] = {
    # UVic Thunderfest: navy strip, gold keylines, bolts around the wordmark.
    # 14mm footer instead of 10 to fit the two-line lockup; each cell gives up
    # ~1mm of height for it.
    "thunderfest": StripLayout(
        footer_mm=14.0,
        footer_text="THUNDERFEST",
        footer_subtext="UVIC  ·  2026",
        background=UVIC_NAVY,
        footer_colour=UVIC_GOLD,
        footer_subcolour=PAPER,
        cell_border_mm=0.6,
        cell_border_colour=UVIC_GOLD,
        footer_ornament="bolt",
        ornament_colour=UVIC_GOLD,
    ),
    # Vikes colours the other way round: gold field, navy everything else.
    "vikes": StripLayout(
        footer_mm=14.0,
        footer_text="GO VIKES",
        footer_subtext="UVIC  ·  2026",
        background=UVIC_GOLD,
        footer_colour=UVIC_NAVY,
        footer_subcolour=UVIC_NAVY,
        cell_border_mm=0.6,
        cell_border_colour=UVIC_NAVY,
        footer_ornament="bolt",
        ornament_colour=UVIC_NAVY,
    ),
    # The booth's own look: yellow, black keylines, pink stars.
    "popflash": StripLayout(
        footer_mm=14.0,
        footer_text="POPFLASH",
        footer_subtext="YOUR PARTY. BUT LOUDER.",
        background=POP_YELLOW,
        footer_colour=INK,
        footer_subcolour=INK,
        cell_border_mm=0.6,
        cell_border_colour=INK,
        footer_ornament="star",
        ornament_colour=POP_PINK,
    ),
    # Black field, hairline white keylines, quiet caption.
    "midnight": StripLayout(
        footer_text="THE BOOTH  ·  2026",
        background=INK,
        footer_colour=PAPER,
        footer_subcolour=PAPER,
        cell_border_mm=0.4,
        cell_border_colour=PAPER,
    ),
    # Plain white strip, dark caption. What the booth printed before themes.
    "classic": StripLayout(),
}
DEFAULT_THEME = "thunderfest"


def layout_for(name: str | None) -> StripLayout:
    """The layout for a theme key carried on a print job. Unknown or missing
    falls back to the event default — a strip in the wrong colours beats no
    strip, and the kiosk and this file can be deployed in either order."""
    if name is not None and name in THEMES:
        return THEMES[name]
    if name is not None:
        log.warning("unknown theme %r; using %s", name, os.environ.get("BOOTH_THEME", DEFAULT_THEME))
    return layout_from_env()


def layout_from_env() -> StripLayout:
    """The strip theme for this event: BOOTH_THEME, else the default. An
    unknown name is a loud failure at startup, not a white strip at 9pm."""
    name = os.environ.get("BOOTH_THEME", DEFAULT_THEME)
    try:
        return THEMES[name]
    except KeyError:
        raise SystemExit(f"BOOTH_THEME={name!r} is not one of: {', '.join(THEMES)}") from None


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
    draw = ImageDraw.Draw(strip)
    border = mm_to_px(layout.cell_border_mm)
    for i, photo in enumerate(photos[:n]):
        y = margin + i * (cell_h + gutter)
        # The keyline sits INSIDE the cell so the geometry above still holds;
        # the photo shrinks by the line width on each side.
        if border > 0:
            draw.rectangle([margin, y, margin + cell_w - 1, y + cell_h - 1], fill=layout.cell_border_colour)
        strip.paste(
            fill_cell(photo, cell_w - 2 * border, cell_h - 2 * border),
            (margin + border, y + border),
        )

    if layout.footer_text:
        _draw_footer(draw, layout, width, height, margin, footer, cell_w)
    return strip


def _draw_footer(
    draw: ImageDraw.ImageDraw, layout: StripLayout, width: int, height: int, margin: int, footer: int, cell_w: int
) -> None:
    """The caption band at the bottom of the strip: one big line, an optional
    small line, and optional lightning bolts flanking the big one."""
    top = height - margin - footer
    has_sub = bool(layout.footer_subtext)

    # Bolts take a square zone at each end of the band; the text fits between.
    bolt_h = int(footer * (0.62 if has_sub else 0.8))
    bolt_w = int(bolt_h * 0.55)
    bolt_pad = int(footer * 0.12)
    text_max = cell_w - (2 * (bolt_w + bolt_pad) if layout.footer_ornament else 0)

    title_start = int(footer * (0.42 if has_sub else 0.55))
    font, box = _fit_text(draw, layout.footer_text, text_max, title_start)
    text_w, text_h = box[2] - box[0], box[3] - box[1]

    if has_sub:
        sub_font, sub_box = _fit_text(draw, layout.footer_subtext, text_max, int(footer * 0.2))
        sub_w, sub_h = sub_box[2] - sub_box[0], sub_box[3] - sub_box[1]
        gap = int(footer * 0.08)
        block_h = text_h + gap + sub_h
    else:
        sub_font = sub_box = None
        sub_w = sub_h = gap = 0
        block_h = text_h

    block_top = top + (footer - block_h) // 2
    title_x = (width - text_w) // 2
    draw.text((title_x - box[0], block_top - box[1]), layout.footer_text, font=font, fill=layout.footer_colour)
    if sub_font is not None and sub_box is not None:
        draw.text(
            ((width - sub_w) // 2 - sub_box[0], block_top + text_h + gap - sub_box[1]),
            layout.footer_subtext,
            font=sub_font,
            fill=layout.footer_subcolour,
        )

    if layout.footer_ornament:
        # Centred on the title line, just outside it on both sides. A bolt is
        # mirrored on the right so the pair points inward.
        top_y = block_top + text_h // 2 - bolt_h // 2
        left_x = title_x - bolt_pad - bolt_w
        right_x = title_x + text_w + bolt_pad
        if layout.footer_ornament == "bolt":
            _draw_bolt(draw, left_x, top_y, bolt_w, bolt_h, layout.ornament_colour)
            _draw_bolt(draw, right_x, top_y, bolt_w, bolt_h, layout.ornament_colour, mirror=True)
        elif layout.footer_ornament == "star":
            _draw_star(draw, left_x + bolt_w // 2, top_y + bolt_h // 2, bolt_h // 2, layout.ornament_colour)
            _draw_star(draw, right_x + bolt_w // 2, top_y + bolt_h // 2, bolt_h // 2, layout.ornament_colour)
        else:
            raise ValueError(f"unknown footer_ornament {layout.footer_ornament!r}")


# A lightning bolt in a unit box, top-left origin. Zig down-left, kick out to
# the right, zig down-left to the tip.
_BOLT_UNIT = [(0.62, 0.0), (0.12, 0.56), (0.44, 0.56), (0.30, 1.0), (0.92, 0.40), (0.56, 0.40), (0.78, 0.0)]


def _draw_star(draw: ImageDraw.ImageDraw, cx: int, cy: int, r: int, colour: RGB) -> None:
    """Five-point star, one point up, outer radius r."""
    import math

    points = []
    for i in range(10):
        radius = r if i % 2 == 0 else r * 0.42
        angle = math.radians(-90 + i * 36)
        points.append((cx + radius * math.cos(angle), cy + radius * math.sin(angle)))
    draw.polygon(points, fill=colour)


def _draw_bolt(
    draw: ImageDraw.ImageDraw, x: int, y: int, w: int, h: int, colour: RGB, mirror: bool = False
) -> None:
    points = [(x + (w * (1 - ux) if mirror else w * ux), y + h * uy) for ux, uy in _BOLT_UNIT]
    draw.polygon(points, fill=colour)


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
    strip_layout: StripLayout = field(default_factory=layout_from_env)
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

    NAMING: this subclasses threading.Thread, which keeps private state on the
    instance and does not guard against subclasses. Python 3.13 stores the
    native thread handle as `self._handle`, and older versions have a
    `_stop()` method that join() calls — so a method named `_handle` or an
    attribute named `_stop` here is silently shadowed the moment start() runs
    ("'_thread._ThreadHandle' object is not callable", on every job). Keep
    every name in this class off Thread's namespace: nothing named _handle,
    _stop, _started, _target, _args, _kwargs, _name, _ident, _daemonic.
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
        self._stopping = threading.Event()

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
        self._stopping.set()
        self.q.put(None)

    def run(self) -> None:
        while not self._stopping.is_set():
            task = self.q.get()
            if task is None:
                break
            try:
                self._process(task)
            except Exception as exc:
                # Anything _process didn't expect — a corrupt JPEG, a short frame
                # set, a full disk. This MUST still emit a terminal status: the
                # caller uses it to retire the job, and a job that never reaches
                # a terminal state is retried on every restart forever.
                log.exception("unhandled error on burst %s", task.job_key)
                self.on_status(task, "failed", f"{type(exc).__name__}: {exc}"[:300])
            finally:
                self.q.task_done()

    def _process(self, task: PrintTask) -> None:
        self.on_status(task, "composing", "")
        photos = [Image.open(p) for p in task.photo_paths]
        sheet = build_sheet(photos, self.sheet_px, task.strip_layout, task.sheet_layout)
        pdf = sheet_to_pdf(sheet, self.spool_dir / f"{task.job_key}.pdf")
        # Keep a flat preview for the kiosk screen / phone gallery.
        sheet.save(self.spool_dir / f"{task.job_key}.jpg", quality=92)

        # Outer loop: a consumable fault parks the task until a human reloads,
        # then the attempt budget starts over. This used to be recursion —
        # _park() called _process() — which added a stack frame per ribbon change
        # and would grow without bound over a long event.
        while not self._stopping.is_set():
            outcome = self._print_with_retries(task, pdf)
            if outcome != "parked":
                return
            if not self._await_operator(task):
                return
            task.attempts = 0

    def _print_with_retries(self, task: PrintTask, pdf: Path) -> str:
        """One budget of attempts. Returns 'printed', 'failed', or 'parked'
        (consumables are out and only a human can clear it)."""
        while task.attempts < self.MAX_ATTEMPTS and not self._stopping.is_set():
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

        if self._stopping.is_set():
            return "failed"
        self.on_status(task, "failed", "gave up after retries")
        return "failed"

    def _await_operator(self, task: PrintTask) -> bool:
        """Block until someone reloads paper or ribbon. Returns False if the
        worker is shutting down instead. The whole queue stalls here on purpose —
        there is one printer, so nothing behind this task could print anyway."""
        self.on_status(task, "waiting-operator", "; ".join(self.service.printer_reasons()))
        while not self._stopping.is_set():
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
    parser.add_argument(
        "--theme",
        choices=sorted(THEMES),
        default=os.environ.get("BOOTH_THEME", DEFAULT_THEME),
        help="strip theme (default: $BOOTH_THEME or %(default)s)",
    )
    parser.add_argument("--print", dest="do_print", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    sheet_px = read_page_size_px(args.printer, args.page_size)
    strip_layout = THEMES[args.theme]
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
