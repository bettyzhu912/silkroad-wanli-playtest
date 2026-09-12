// Parity 2/3 — session / economy / adapter: the JS Game + Session must reproduce the native CPython fingerprint
// (tests/parity_native.json from py/parity_probe.py): generator metrics plus a scripted FORMAL run per index (reference layout,
// NOT PASS rework on batch 2, settlement payout, mock outer state).
import { fingerprint } from '../engine/game.js';
import fs from 'node:fs'; import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname);
const native = JSON.parse(fs.readFileSync(path.join(here, 'parity_native.json'), 'utf8'));
const indices = Object.keys(native.runs).map(Number); const js = fingerprint(indices);
// runId is a random uuid in both runtimes; every other field must match exactly
const norm = o => JSON.stringify(o, (k, v) => k === 'runId' ? 'RUNID' : (v && typeof v === 'object' && !Array.isArray(v)) ? Object.fromEntries(Object.keys(v).sort().map(x => [x, v[x]])) : v);
const same = norm(native.runs) === norm(js.runs);
const report = { indices, nativePython: native.python, identical: same };
if (!same) { for (const i of indices) if (norm(native.runs[i]) !== norm(js.runs[i])) { report.firstDifferentRun = i; report.native = native.runs[i].final; report.js = js.runs[i].final; break; } }
fs.writeFileSync(path.join(here, 'parity_session.json'), JSON.stringify(report, null, 1)); console.log(JSON.stringify(report).slice(0, 600)); process.exit(same ? 0 : 1);
