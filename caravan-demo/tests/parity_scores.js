// Parity 3/3 (JS side) — recompute the exhaustive scoring hash of tests/parity_scores.py with the JS evaluateLayout.
import { cargo, evaluateLayout } from '../engine/core.js';
import { feasible_layouts } from '../engine/generator.js';
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto';
const here = path.dirname(new URL(import.meta.url).pathname);
const native = JSON.parse(fs.readFileSync(path.join(here, 'parity_scores_native.json'), 'utf8'));
const pyFloat = x => Number.isInteger(x) ? x.toFixed(1) : String(x);   // CPython repr(float) for the values that occur here
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const all = crypto.createHash('sha256'); const boards = []; let total = 0, ok = true;
for (const spec of native.boards) {
  const items = spec.items.map(i => cargo(i)); const rows = [];
  for (const [a, b] of feasible_layouts(items)) { const s = evaluateLayout(a, b, spec.ref); rows.push([a.map(c => c.instance).join(','), b.map(c => c.instance).join(','), pyFloat(s.physicalBalanceRatio), pyFloat(s.BalanceScore), pyFloat(s.StackingScore), pyFloat(s.LayoutScore), String(s.passed), s.performanceTier || 'null'].join('|')); }
  rows.sort(); total += rows.length; const bh = sha(rows.join('\n')); all.update(bh); const same = bh === spec.sha256 && rows.length === spec.layouts; ok = ok && same; boards.push({ name: spec.name, layouts: rows.length, identical: same });
}
const report = { totalLayouts: total, nativeSha256: native.sha256, jsSha256: all.digest('hex'), identical: ok && total === native.totalLayouts, boards };
fs.writeFileSync(path.join(here, 'parity_scores.json'), JSON.stringify(report, null, 1)); console.log(JSON.stringify(report)); process.exit(report.identical ? 0 : 1);
