# Turns the Concorde pre-series exploded-view drawing (black lines on white) into the blueprint sheet:
# removes the numbered callout circles, their leader lines, the legend/title and the caption, then writes white
# linework on transparent (main.js tints it navy) to assets/blueprint.json and source/blueprint.png.
# usage: python3 tools/clean-blueprint.py <drawing image>      (needs opencv-python-headless, numpy, pillow)
import sys, json, base64, io, os
import cv2
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = cv2.cvtColor(np.array(Image.open(sys.argv[1]).convert('RGB')), cv2.COLOR_RGB2GRAY)
H, W = src.shape
ink = (src < 150).astype(np.uint8) * 255
faint = src < 205                                  # light enough to include the thin leader lines
erase = np.zeros_like(ink)                          # everything to remove, painted as we go

# 1. callout circles: listed by hand (centre x, y on the 1600 x 729 original). Automatic circle detection also
#    finds wheels, engine faces and fuselage frames, so it isn't used.
CALLOUTS = [(192, 397), (372, 328), (678, 206), (537, 258), (777, 170), (914, 667), (1006, 40), (1076, 668),
            (496, 712), (1170, 663), (1247, 32), (1252, 646), (1335, 625), (1369, 17), (1434, 609), (1520, 217),
            (1548, 272), (1576, 586)]
R = 16
sx0, sy0 = W / 1600, H / 729
circles = [(int(x * sx0), int(y * sy0)) for x, y in CALLOUTS]

# 2. leader lines: find where ink leaves each circle, then walk outward along that direction erasing the line,
#    re-aiming as it goes, until the line stops (it ends where it touches the part it points at).
def walk(x, y, ang):
    dx, dy = np.cos(ang), np.sin(ang)
    px, py, miss, pts = x + (R + 2) * dx, y + (R + 2) * dy, 0, []
    for step in range(900):
        nx, ny = -dy, dx
        best = None
        for o in (0, -1, 1, -2, 2):
            qx, qy = int(round(px + o * nx)), int(round(py + o * ny))
            if 0 <= qx < W and 0 <= qy < H and faint[qy, qx]:
                best = (qx, qy); break
        if best is None:
            miss += 1
            if miss > 3: break
        else:
            bx0, by0 = best
            win = ink[max(0, by0 - 4):by0 + 5, max(0, bx0 - 4):bx0 + 5]
            if step > 6 and win.mean() > 255 * 0.45: break   # reached a solid part (a wheel): stop
            miss = 0; pts.append(best)
            cv2.circle(erase, best, 2, 255, -1)
            if len(pts) > 12:                           # re-aim along the last stretch of line found
                (ax, ay), (bx, by) = pts[-12], pts[-1]
                d = np.hypot(bx - ax, by - ay)
                if d > 0: dx, dy = (bx - ax) / d, (by - ay) / d
            px, py = best[0], best[1]
        px, py = px + dx, py + dy
for x, y in circles:
    angs = []
    for a in np.linspace(0, 2 * np.pi, 360, endpoint=False):
        qx, qy = int(round(x + (R + 5) * np.cos(a))), int(round(y + (R + 5) * np.sin(a)))
        if 0 <= qx < W and 0 <= qy < H and faint[qy, qx]: angs.append(a)
    groups = []                                         # neighbouring angles belong to the same leader line
    for a in angs:
        if groups and a - groups[-1][-1] < 0.08: groups[-1].append(a)
        else: groups.append([a])
    if len(groups) > 1 and (angs[0] + 2 * np.pi) - groups[-1][-1] < 0.08:
        groups[0] = [g - 2 * np.pi for g in groups.pop()] + groups[0]
    for g in groups:
        if len(g) <= 12: walk(x, y, float(np.mean(g)))  # a thin line, not a part the circle overlaps
    cv2.circle(erase, (x, y), R + 4, 255, -1)

# 3. title, legend and caption blocks (measured on the 1600 x 729 original; scaled if the source differs)
sx, sy = W / 1600, H / 729
for x0, y0, x1, y1 in [(90, 10, 575, 292), (1290, 668, 1600, 729)]:
    erase[int(y0 * sy):int(y1 * sy), int(x0 * sx):int(x1 * sx)] = 255

# 4. leftovers: a stub of callout 10's second leader (original coordinates)
for x0, y0, x1, y1 in [(196, 444, 206, 466)]:
    erase[int(y0 * sy):int(y1 * sy), int(x0 * sx):int(x1 * sx)] = 255

# 5. keep the drawing's own line shading (a hard threshold makes thin lines look dashed): darkness from the grey
#    level, zeroed wherever something was erased above
erased = cv2.dilate(erase, np.ones((3, 3), np.uint8)) > 0
dark = np.clip((235.0 - src) / (235.0 - 70.0), 0, 1)
dark[erased] = 0
dark[dark < 0.08] = 0
alpha_full = (dark * 255).astype(np.uint8)

# crop to the drawing with a margin; white lines on transparent
ys, xs = np.nonzero(alpha_full > 110)
m = 24
x0, y0, x1, y1 = max(0, xs.min() - m), max(0, ys.min() - m), min(W, xs.max() + m), min(H, ys.max() + m)
alpha = alpha_full[y0:y1, x0:x1]
rgba = np.dstack([np.full_like(alpha, 255)] * 3 + [alpha])
img = Image.fromarray(rgba, 'RGBA')
img.save(os.path.join(ROOT, 'source/blueprint.png'))
buf = io.BytesIO(); img.save(buf, 'PNG', optimize=True)
json.dump(['data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()], open(os.path.join(ROOT, 'assets/blueprint.json'), 'w'))
print('callouts', len(circles), 'crop', (x0, y0), 'size', img.size, 'aspect', round(img.size[0] / img.size[1], 4))
