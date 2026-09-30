#!/usr/bin/env python3
"""
make_enclosure_v2.py  -  low-material TEST enclosure, two parts, no supports.

  printer_frame  : sits on the table around the SELPHY. Open front (cassette +
                   prints), open rear (paper travel, rear ports, air vents),
                   window on the ink-door side, vertical vents on the other.
  electronics_tray : sits on top of the frame on 4 pins. Grid floor (zip-tie
                   anywhere, cables drop through to the printer), camera on the
                   front wall, open-top cord notch in the rear wall.

Both parts are exported in their print orientation (flat side on the bed).
Axes: X = width, Y = depth (front = 0), Z = up.

Run:  pip install cadquery && python3 make_enclosure_v2.py
Out:  out_v2/*.step, out_v2/*.stl, out_v2/assembly_preview.step
"""

import os
import cadquery as cq

# ============================================================ PARAMETERS
# Printer - Canon spec 182.2 W x 57.6 H x 133 D mm, excluding protrusions.
prn_w, prn_d, prn_h = 182.2, 133.0, 57.6      # MEASURE yours anyway
side_clr = 3.0        # gap between printer and each side wall
plug_clr = 40.0       # room behind the printer for the USB-C + DC IN plugs
top_gap = 20.0        # air gap / finger room above the printer
ink_side = "right"    # side with the ink-cassette door (seen from the front) CHECK
ink_win_len = 100.0   # length of the ink-side window
ink_win_floor = 6.0   # window starts this far above the table

wall = 2.0            # every wall and floor
post = 8.0            # square corner posts on the frame
frame_base = True     # floor under the printer (ties the frame together)
foot_band = 30.0      # solid floor this far in from the printer's edges (its feet sit here)
rail_h, rail_t = 8.0, 4.0     # low rear rail, only used when frame_base = False

# Electronics tray
tray_h = 60.0         # total tray height incl. floor
grid_border = 10.0    # solid floor border
grid_rib = 8.0        # rib width between grid windows
grid_n = (5, 5)       # windows across X, Y

# Camera Module 3: board goes flat against the inside of the front wall,
# lens poking into the opening, held with 4x M2 screws + nuts.
camera_in_tray = True
cam_dia = 18.0
cam_holes = (21.0, 12.5)      # mounting pattern (x, z)   CHECK your board
cam_hole_d = 2.4              # M2 clearance

# Cord notch (rear wall of tray, open at the top - lay cables in, no threading)
notch_w, notch_depth = 60.0, 40.0
notch_side = "right"          # put it on the side where your power strip sits

# Vents: vertical slots (only a 4 mm bridge at the top of each slot)
vent_w, vent_pitch, vent_margin = 4.0, 9.0, 18.0
frame_vent_h = 20.0           # printer-level slots
tray_vent_h = 40.0            # tray slots, twice as tall

pin_d, pin_h, pin_clr = 4.0, 4.0, 0.4

# ============================================================ DERIVED
W = prn_w + 2 * side_clr + 2 * wall
prn_x0 = wall + side_clr
prn_y0 = post                      # printer front face rests on the front posts
prn_y1 = prn_y0 + prn_d
D = prn_y1 + plug_clr + post
base_t = wall if frame_base else 0.0
frame_h = base_t + prn_h + top_gap
pin_xy = [(5, 5), (W - 5, 5), (5, D - 5), (W - 5, D - 5)]

print(f"Footprint {W:.1f} x {D:.1f} mm | frame h {frame_h:.1f} | tray h {tray_h:.1f} "
      f"| total h {frame_h + tray_h:.1f}")


def box(x, y, z, dx, dy, dz):
    return cq.Workplane("XY").box(dx, dy, dz, centered=False).translate((x, y, z))


def cyl(x, y, z, r, length, axis):
    d = {"X": (1, 0, 0), "Y": (0, 1, 0), "Z": (0, 0, 1)}[axis]
    return cq.Workplane("XY").add(
        cq.Solid.makeCylinder(r, length, cq.Vector(x, y, z), cq.Vector(*d)))


def side_x(side):
    """x of the outer face of the left/right wall, for wall cuts."""
    return -1 if side == "left" else W - wall - 1


def vent_row(part, x0, z0, h):
    y = vent_margin
    while y + vent_w <= D - vent_margin:
        part = part.cut(box(x0, y, z0, wall + 2, vent_w, h))
        y += vent_pitch
    return part


# ============================================================ PRINTER FRAME
frame = box(0, 0, 0, wall, D, frame_h).union(box(W - wall, 0, 0, wall, D, frame_h))
for px, py in [(0, 0), (W - post, 0), (0, D - post), (W - post, D - post)]:
    frame = frame.union(box(px, py, 0, post, post, frame_h))
if frame_base:
    frame = frame.union(box(0, 0, 0, W, D, base_t))
    # lightening windows: middle of the printer footprint + the plug zone behind it
    def windows(part, x0, y0, x1, y1, nx, ny, rib=8.0):
        ww = (x1 - x0 - (nx - 1) * rib) / nx
        wd = (y1 - y0 - (ny - 1) * rib) / ny
        for i in range(nx):
            for j in range(ny):
                part = part.cut(box(x0 + i * (ww + rib), y0 + j * (wd + rib), -1, ww, wd, base_t + 2))
        return part
    frame = windows(frame, prn_x0 + foot_band, prn_y0 + foot_band,
                    prn_x0 + prn_w - foot_band, prn_y1 - foot_band, 3, 2)
    frame = windows(frame, post + 10, prn_y1 + 8, W - post - 10, D - post - 4, 3, 1)
else:
    frame = frame.union(box(post, D - rail_t, 0, W - 2 * post, rail_t, rail_h))   # rear rail

# rear stops at the printer's back corners (3 mm overlap, clear of the ports)
for rx in (wall, W - post):
    frame = frame.union(box(rx, prn_y1 + 0.5, 0, post - wall, 6, base_t + 20))

# ink window: open to the top edge so it prints without bridging
ink_x = side_x(ink_side)
ink_y0 = prn_y0 + (prn_d - ink_win_len) / 2
frame = frame.cut(box(ink_x, ink_y0, base_t + ink_win_floor, wall + 2, ink_win_len, frame_h))

# vertical vents on the other side, mid-height of the printer bay
other = "left" if ink_side == "right" else "right"
frame = vent_row(frame, side_x(other), (frame_h - frame_vent_h) / 2, frame_vent_h)

for x, y in pin_xy:                                                         # pins
    frame = frame.union(cyl(x, y, frame_h, pin_d / 2, pin_h, "Z"))

# ============================================================ ELECTRONICS TRAY
tray = box(0, 0, 0, W, D, tray_h).cut(box(wall, wall, wall, W - 2 * wall, D - 2 * wall, tray_h))

# grid floor
nx, ny = grid_n
gw = (W - 2 * grid_border - (nx - 1) * grid_rib) / nx
gd = (D - 2 * grid_border - (ny - 1) * grid_rib) / ny
for i in range(nx):
    for j in range(ny):
        tray = tray.cut(box(grid_border + i * (gw + grid_rib),
                            grid_border + j * (gd + grid_rib), -1, gw, gd, wall + 2))

for x, y in pin_xy:                                                         # pin holes
    tray = tray.cut(cyl(x, y, -1, (pin_d + pin_clr) / 2, wall + 2, "Z"))

if camera_in_tray:
    cx, cz = W / 2, wall + (tray_h - wall) / 2
    tray = tray.cut(cyl(cx, -1, cz, cam_dia / 2, wall + 2, "Y"))
    for ox in (-cam_holes[0] / 2, cam_holes[0] / 2):
        for oz in (-cam_holes[1] / 2, cam_holes[1] / 2):
            tray = tray.cut(cyl(cx + ox, -1, cz + oz, cam_hole_d / 2, wall + 2, "Y"))

ncx = W - 20 - notch_w / 2 if notch_side == "right" else 20 + notch_w / 2
tray = tray.cut(box(ncx - notch_w / 2, D - wall - 1, tray_h - notch_depth,
                    notch_w, wall + 2, notch_depth + 1))

for s in ("left", "right"):
    tray = vent_row(tray, side_x(s), (tray_h - tray_vent_h) / 2, tray_vent_h)

# ============================================================ EXPORT + CHECKS
dummy = box(prn_x0, prn_y0, base_t, prn_w, prn_d, prn_h)
os.makedirs("out_v2", exist_ok=True)
for name, part in [("printer_frame", frame), ("electronics_tray", tray)]:
    cq.exporters.export(part, f"out_v2/{name}.step")
    cq.exporters.export(part, f"out_v2/{name}.stl", tolerance=0.05, angularTolerance=0.1)

asm = (cq.Assembly()
       .add(frame, name="printer_frame", color=cq.Color(0.85, 0.20, 0.20))
       .add(tray, name="electronics_tray", loc=cq.Location((0, 0, frame_h)),
            color=cq.Color(0.92, 0.88, 0.80))
       .add(dummy, name="printer_dummy_do_not_print", color=cq.Color(0.2, 0.2, 0.2, 0.6)))
asm.save("out_v2/assembly_preview.step")

for name, part in [("printer_frame", frame), ("electronics_tray", tray)]:
    v = part.val()
    print(f"{name}: valid={v.isValid()} solids={len(part.solids().vals())} "
          f"volume={v.Volume() / 1000:.0f} cm3 (~{v.Volume() / 1000 * 1.24:.0f} g PLA)")
print(f"printer vs frame overlap: {frame.val().intersect(dummy.val()).Volume():.3f} mm3")
