#!/usr/bin/env python3
"""
make_enclosure.py
Parametric photobooth enclosure -> STEP files you can import into Fusion 360.

Edit the PARAMETERS block, run:  python3 make_enclosure.py
Outputs (in ./out):  enclosure_base.step, enclosure_lid.step,
                     cable_grommet.step, fit_check_printer.step

Axes / orientation
  X = width (left -> right), Y = depth (FRONT = Y 0, REAR = Y max), Z = up.
  Origin is the bottom-front-left OUTER corner of the base.
  Paper exits the front wall; the printer pushes paper out the REAR during
  printing, hence the extra rear clearance.

!! Every value marked MEASURE is a placeholder. Replace with caliper values.
"""

import os
import cadquery as cq

# ----------------------------------------------------------------- PARAMETERS
wall = 3.0            # side wall thickness
floor_t = 4.0         # floor thickness
clr = 5.0             # clearance around printer
rear_clr = 60.0       # extra depth behind printer for paper travel   (MEASURE)

prn_w = 189.0         # printer footprint width   (MEASURE)
prn_d = 157.0         # printer footprint depth   (MEASURE)
prn_h = 60.0          # printer height incl. loaded cassette (MEASURE)

H = 250.0             # outer height of the base
shelf_gap = 20.0      # space between printer top and Pi shelf
shelf_t = 3.0
shelf_depth = 95.0    # shelf depth, measured forward from the rear wall
                      # (Pi case + cables; must fit your black case)

slot_w = 110.0        # print slot width  (paper is 100 mm)
slot_h = 20.0         # print slot height
slot_z = 14.0         # slot bottom above floor top (MEASURE paper exit height)

cam_dia = 18.0        # lens opening; must stay inside the standoff ring (MEASURE your lens)
cam_z = 190.0         # camera height above outer floor
cam_holes = (21.0, 12.5)   # Camera Module 3 mounting pattern (x, z)
cam_hole_d = 2.2
cam_standoff_od = 5.0
cam_standoff_len = 4.0

cable_dia = 25.0      # cord exit hole, rear wall
tol = 0.3             # lid fit tolerance

boss_od = 8.0
boss_hole = 4.2       # M3 heat-set insert
boss_depth = 6.0
lid_hole = 3.4
lip_h = 4.0
lip_t = 3.0

vent_w, vent_h, vent_pitch, vent_n = 3.0, 25.0, 6.0, 12

# ------------------------------------------------------------------- DERIVED
W = prn_w + 2 * clr + 2 * wall
D = prn_d + 2 * clr + 2 * wall + rear_clr
iw, idp = W - 2 * wall, D - 2 * wall          # interior width / depth
prn_x0 = wall + clr                           # printer footprint origin
prn_y0 = wall + clr
shelf_z = floor_t + prn_h + shelf_gap
cx = W / 2.0

print(f"Outer box: {W:.1f} x {D:.1f} x {H:.1f} mm  (W x D x H)")
print(f"Interior : {iw:.1f} x {idp:.1f} mm, shelf top at z={shelf_z + shelf_t:.1f}")


# -------------------------------------------------------------------- HELPERS
def box(x, y, z, dx, dy, dz):
    """Axis-aligned box from its min corner."""
    return (cq.Workplane("XY").box(dx, dy, dz, centered=False)
            .translate((x, y, z)))


def cyl(x, y, z, r, length, axis):
    """Cylinder starting at (x,y,z) extending along +axis ('X','Y','Z')."""
    d = {"X": (1, 0, 0), "Y": (0, 1, 0), "Z": (0, 0, 1)}[axis]
    solid = cq.Solid.makeCylinder(r, length, cq.Vector(x, y, z), cq.Vector(*d))
    return cq.Workplane("XY").add(solid)


# ----------------------------------------------------------------------- BASE
base = box(0, 0, 0, W, D, H)
base = base.cut(box(wall, wall, floor_t, iw, idp, H))          # hollow, open top

# Pi shelf, fused to the rear and both side walls, with zip-tie slots
shelf = box(wall, D - wall - shelf_depth, shelf_z, iw, shelf_depth, shelf_t)
for sx in (cx - 25, cx + 25):                                  # tie-wrap slots
    shelf = shelf.cut(box(sx - 4, D - wall - shelf_depth / 2 - 1.5,
                          shelf_z - 1, 8, 3, shelf_t + 2))
base = base.union(shelf)

# Printer stops (front + sides only, rear stays open for paper).
# Each one is fused to a wall and ends 0.5 mm short of the printer.
stop_h = 8.0
px1 = prn_x0 + prn_w
gap = 0.5
for bx in (prn_x0 + 20, px1 - 30):                             # front stops
    base = base.union(box(bx, wall - 0.5, floor_t, 10, clr - gap + 0.5, stop_h))
base = base.union(box(wall - 0.5, prn_y0 + 20, floor_t, clr - gap + 0.5, 10, stop_h))   # left
base = base.union(box(px1 + gap, prn_y0 + 20, floor_t, clr - gap + 0.5, 10, stop_h))    # right

# Screw bosses, tops flush with the rim, each touching two walls
boss_r = boss_od / 2
ov = 0.5   # overlap into the wall so the boss fuses to it
corners = [(wall + boss_r - ov, wall + boss_r - ov),
           (W - wall - boss_r + ov, wall + boss_r - ov),
           (wall + boss_r - ov, D - wall - boss_r + ov),
           (W - wall - boss_r + ov, D - wall - boss_r + ov)]
boss_h = 12.0
for bx, by in corners:
    base = base.union(cyl(bx, by, H - boss_h, boss_r, boss_h, "Z"))
for bx, by in corners:                                          # insert holes
    base = base.cut(cyl(bx, by, H - boss_depth, boss_hole / 2, boss_depth + 1, "Z"))

# Print slot (front wall)
base = base.cut(box(cx - slot_w / 2, -1, floor_t + slot_z, slot_w, wall + 2, slot_h))

# Camera opening + 4 standoffs with holes (front wall, inside face)
base = base.cut(cyl(cx, -1, cam_z, cam_dia / 2, wall + 2, "Y"))
hx, hz = cam_holes[0] / 2, cam_holes[1] / 2
for ox in (-hx, hx):
    for oz in (-hz, hz):
        base = base.union(cyl(cx + ox, wall, cam_z + oz, cam_standoff_od / 2,
                              cam_standoff_len, "Y"))
for ox in (-hx, hx):
    for oz in (-hz, hz):
        base = base.cut(cyl(cx + ox, wall - 0.5, cam_z + oz, cam_hole_d / 2,
                            cam_standoff_len + 1, "Y"))
base = base.cut(box(cx - 9, -1, cam_z + 12, 18, wall + 2, 3))   # ribbon slot

# Cable exit (rear wall, low, off to one side, away from the paper path)
base = base.cut(cyl(W - 30, D - wall - 1, floor_t + 25, cable_dia / 2, wall + 2, "Y"))

# Vents on both side walls: one row by the printer, one above the shelf
for z0 in (floor_t + 15, shelf_z + shelf_t + 20):
    for i in range(vent_n):
        y0 = 40 + i * vent_pitch * 1.0
        for x0 in (-1, W - wall - 1):
            base = base.cut(box(x0, y0, z0, wall + 2, vent_w, vent_h))

# ------------------------------------------------------------------------ LID
lid = box(0, 0, 0, W, D, wall)
lip_outer = (iw - 2 * tol, idp - 2 * tol)
ring = (box(wall + tol, wall + tol, -lip_h, lip_outer[0], lip_outer[1], lip_h)
        .cut(box(wall + tol + lip_t, wall + tol + lip_t, -lip_h - 1,
                 lip_outer[0] - 2 * lip_t, lip_outer[1] - 2 * lip_t, lip_h + 2)))
# notch the lip at each corner so it clears the screw bosses
notch = boss_od + 4
for nx, ny in [(wall, wall), (W - wall - notch, wall),
               (wall, D - wall - notch), (W - wall - notch, D - wall - notch)]:
    ring = ring.cut(box(nx, ny, -lip_h - 1, notch, notch, lip_h + 2))
lid = lid.union(ring)
for bx, by in corners:
    lid = lid.cut(cyl(bx, by, -lip_h - 1, lid_hole / 2, wall + lip_h + 2, "Z"))

# -------------------------------------------------------------------- GROMMET
g_hole = 12.0
neck_d = cable_dia - 0.4
grommet = (cyl(0, 0, 0, 16, 2, "Z")
           .union(cyl(0, 0, 2, neck_d / 2, wall, "Z"))
           .union(cyl(0, 0, 2 + wall, 16, 2, "Z"))
           .cut(cyl(0, 0, -1, g_hole / 2, 2 + wall + 2 + 2, "Z"))
           .cut(box(-2, 0, -1, 4, 20, 2 + wall + 2 + 2)))        # slit for the plug

# ------------------------------------------------- PRINTER DUMMY (fit check)
dummy = box(prn_x0, prn_y0, floor_t, prn_w, prn_d, prn_h)

# --------------------------------------------------------------------- EXPORT
os.makedirs("out", exist_ok=True)
for name, part in [("enclosure_base", base), ("enclosure_lid", lid),
                   ("cable_grommet", grommet), ("fit_check_printer", dummy)]:
    cq.exporters.export(part, f"out/{name}.step")
    print(f"wrote out/{name}.step")
