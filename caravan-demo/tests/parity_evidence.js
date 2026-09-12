// Parity 1/3 — generator + QA + sampler: the JS port must reproduce, for every one of the 500 P0 stress runs, the exact
// accepted-board evidence saved by the verified Python P0 (reports/accepted_boards.jsonl, SHA-256 2deea753…):
// cargo instances, reference solution, every metric, warnings, telemetry, reject history, attempt traces, referenceDebug penalties.
import { one_run } from '../engine/stress.js';
import fs from 'node:fs'; import zlib from 'node:zlib'; import path from 'node:path'; import crypto from 'node:crypto';
const here = path.dirname(new URL(import.meta.url).pathname);
const raw = zlib.gunzipSync(fs.readFileSync(path.join(here, 'oracle/accepted_boards.jsonl.gz')));
const sha = crypto.createHash('sha256').update(raw).digest('hex'); const expectedSha = fs.readFileSync(path.join(here, 'oracle/accepted_boards.sha256'), 'utf8').trim();
const rows = raw.toString('utf8').trim().split('\n').map(l => JSON.parse(l));
const byRun = new Map(); for (const r of rows) { if (!byRun.has(r.run)) byRun.set(r.run, []); byRun.get(r.run).push(r); }
function diff(a, b, p = '') {
  if (Array.isArray(a) || Array.isArray(b)) { if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return p + ': array mismatch'; for (let i = 0; i < a.length; i++) { const d = diff(a[i], b[i], p + '[' + i + ']'); if (d) return d; } return null; }
  if (a && typeof a === 'object' || b && typeof b === 'object') { if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return p + ': type mismatch ' + JSON.stringify(a) + ' vs ' + JSON.stringify(b); const ka = Object.keys(a).sort(), kb = Object.keys(b).sort(); if (ka.join() !== kb.join()) return p + ': keys ' + ka.join() + ' vs ' + kb.join(); for (const k of ka) { const d = diff(a[k], b[k], p + '.' + k); if (d) return d; } return null; }
  if (a !== b && !(Number.isNaN(a) && Number.isNaN(b))) return p + ': ' + JSON.stringify(a) + ' vs ' + JSON.stringify(b); return null;
}
const limit = Number(process.argv[2] || 500); let ok = 0, bad = 0; const t0 = Date.now(); const failures = [];
for (let i = 0; i < limit; i++) {
  const expected = byRun.get(i); const actual = one_run(i);
  const d = diff(JSON.parse(JSON.stringify(expected)), JSON.parse(JSON.stringify(actual)));
  if (d) { bad++; if (failures.length < 5) failures.push('run ' + i + ': ' + d); } else ok++;
  if ((i + 1) % 100 === 0) console.log('runs compared', i + 1, 'ok', ok, 'bad', bad, (Date.now() - t0) + 'ms');
}
const report = { oracle: 'accepted_boards.jsonl', oracleSha256: sha, oracleShaMatchesP0Report: sha === expectedSha, runsCompared: limit, boardsCompared: rows.filter(r => r.run < limit).length, identical: ok, different: bad, failures, ms: Date.now() - t0 };
fs.writeFileSync(path.join(here, 'parity_evidence.json'), JSON.stringify(report, null, 1)); console.log(JSON.stringify(report, null, 1));
process.exit(bad === 0 && sha === expectedSha ? 0 : 1);
