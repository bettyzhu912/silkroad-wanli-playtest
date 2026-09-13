#!/usr/bin/env python3
"""Round 28 — visible-frame audit of the five HUD window backgrounds (PNG in the source tree or WebP in a build stage).
Measures, per file: canvas size, alpha bbox (alpha>8), outer edges of the four frame rails (the visible panel frame), plaque border
lines, sketch bottom and bottom-ornament rows. Exits 1 unless all five frames share one canvas and one frame bounding box.
Usage: python3 tests/tools/panel-frame-audit.py [<dir>] [--out <json>]"""
import json, os, sys
import numpy as np
from PIL import Image
args = sys.argv[1:]; out = None
if '--out' in args: i = args.index('--out'); out = args[i + 1]; del args[i:i + 2]
root = args[0] if args else os.path.join(os.path.dirname(__file__), '..', '..')
NAMES = ['B2_bag_panel_bg_v02', 'B3_commission_panel_bg_v01', 'B4_message_panel_bg_v02', 'B5_merchant_panel_bg_v01', 'B6_more_panel_bg_v01']
def measure(img):
    h, w = img.shape[:2]; a = img[:, :, 3]; lum = img[:, :, :3].astype(float).mean(axis=2)
    paper = np.median(lum[int(h*.45):int(h*.55), int(w*.3):int(w*.7)])
    frame = (a > 200) & (np.abs(lum - paper) > 25)
    cf = frame[int(h*.42):int(h*.58), :].mean(axis=0); lc = np.where(cf[:w//2] > .9)[0]; rc = np.where(cf[w//2:] > .9)[0] + w//2
    col = frame[:, 160:200].mean(axis=1); top = np.where(col[:200] > .85)[0]; bot = np.where(col[h-220:] > .85)[0] + h - 220
    ys, xs = np.where(a > 8)
    dev = np.abs(lum - paper); dev[a < 8] = 0; inter = (dev[:, int(w*.12):int(w*.88)] > 25).mean(axis=1)
    sketch = max(y for y in range(h//2) if inter[y] > .01); bottomInterior = min(y for y in range(h//2, h) if inter[y] > .01)
    dark = [y for y in range(0, 330) if ((a[y, int(w*.4):int(w*.6)] > 8) & (lum[y, int(w*.4):int(w*.6)] < 190)).mean() > .8]
    groups = []
    for y in dark:
        if groups and y - groups[-1][1] <= 2: groups[-1][1] = y
        else: groups.append([y, y])
    return dict(canvas=[int(w), int(h)], alphaBbox=[int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())],
                frame=dict(left=int(lc.min()), top=int(top.min()), right=int(rc.max()), bottom=int(bot.max()), width=int(rc.max() - lc.min()), height=int(bot.max() - top.min())),
                rails=dict(left=[int(lc.min()), int(lc.max())], right=[int(rc.min()), int(rc.max())], top=[int(top.min()), int(top.max())], bottom=[int(bot.min()), int(bot.max())]),
                plaqueLines=groups, sketchLastRow=int(sketch), bottomInteriorFirstRow=int(bottomInterior))
report = {}
for n in NAMES:
    path = next(p for p in (os.path.join(root, n + ext) for ext in ('.png', '.webp')) if os.path.exists(p))
    report[n] = dict(file=os.path.basename(path), **measure(np.array(Image.open(path).convert('RGBA'))))
    f = report[n]['frame']; print(f"{report[n]['file']:32s} canvas {report[n]['canvas']}  frame L{f['left']} T{f['top']} R{f['right']} B{f['bottom']} ({f['width']}×{f['height']})  alpha {report[n]['alphaBbox']}  plaque {report[n]['plaqueLines']}")
frames = {json.dumps(r['frame']) for r in report.values()}; canvases = {json.dumps(r['canvas']) for r in report.values()}
ok = len(frames) == 1 and len(canvases) == 1
summary = dict(root=os.path.abspath(root), identicalCanvas=len(canvases) == 1, identicalFrame=len(frames) == 1, frame=next(iter(report.values()))['frame'] if ok else None, files=report)
if out: json.dump(summary, open(out, 'w'), indent=1)
print('RESULT:', 'PASS — one canvas, one visible-frame box' if ok else 'FAIL — frames differ')
sys.exit(0 if ok else 1)
