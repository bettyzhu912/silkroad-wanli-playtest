#!/usr/bin/env python3
"""Parity 3/3 (native side) — exhaustive scoring: every feasible layout of the three fixed P0 test boards (4/6/8 cargo,
42,600 layouts) plus the 12 saved evidence boards of runs 0/200/400/499 is scored with the Python evaluateLayout and hashed."""
import sys, json, hashlib, pathlib
ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / 'py/vendor/p0/src'), str(ROOT / 'py/vendor/p0/tests'), str(ROOT / 'py')]
from core import cargo, evaluateLayout
from generator import feasible_layouts, analyze_board
from stress import one_run
def rows_for(items, ref):
    for a, b in feasible_layouts(items):
        s = evaluateLayout(a, b, ref)
        yield '|'.join([','.join(c.instance for c in a), ','.join(c.instance for c in b), repr(float(s.physicalBalanceRatio)), repr(float(s.BalanceScore)), repr(float(s.StackingScore)), repr(float(s.LayoutScore)), str(s.passed).lower(), s.performanceTier or 'null'])
boards = []
fixed = [['ceramics','silverware','pepper','silk'], ['ceramics','silverware','pepper','silk','paper','dye'], ['khotan_jade','paper','ceramics','silk','pepper','hexi_wool','dye','lacquerware']]
prev = []
for i, kinds in enumerate(fixed, 1):
    b, reasons = analyze_board(i, tuple(cargo(k) for k in kinds), prev); assert b is not None, reasons; prev.append(b)
    boards.append({'name': 'fixed-B%d' % i, 'items': [c.instance for c in b.items], 'ref': b.reference_ratio})
for idx in (0, 200, 400, 499):
    for row in one_run(idx):
        e = row['board']; boards.append({'name': 'run%d-B%d' % (idx, e['batch']), 'items': [c['instance'] for c in e['cargo']], 'ref': e['referencePhysicalBalanceRatio']})
out = {'boards': [], 'sha256': None}
h = hashlib.sha256(); total = 0
for spec in boards:
    items = tuple(cargo(i) for i in spec['items']); rows = sorted(rows_for(items, spec['ref'])); total += len(rows)
    bh = hashlib.sha256('\n'.join(rows).encode()).hexdigest(); h.update(bh.encode()); out['boards'].append({**spec, 'layouts': len(rows), 'sha256': bh})
out['totalLayouts'] = total; out['sha256'] = h.hexdigest()
(ROOT / 'tests/parity_scores_native.json').write_text(json.dumps(out, ensure_ascii=False, indent=1)); print('native scoring hash', out['sha256'], 'layouts', total)
