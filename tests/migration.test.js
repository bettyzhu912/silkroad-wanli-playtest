'use strict';
// RC2 → RC3 save migration: play random sessions on the archived RC2 engine (git tag v0.3.0-competition-rc2),
// wrap them as RC2 envelopes, upgrade with the RC3 engine, validate, then keep playing on RC3.
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { execSync } = require('child_process');
const { load, ORDER } = require('./harness');
const { simulate } = require('./fuzz');
const ROOT = path.join(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rc2-engine-'));
// Files added after RC2 (caravan-engine.js, caravan.js) do not exist in the baseline tag; archive only those the tag has and skip them when loading the old engine.
const OLD_FILES = ORDER.filter(f => { try { execSync('git cat-file -e v0.3.0-competition-rc2:' + f, { cwd: ROOT, stdio: 'ignore' }); return true; } catch (_) { return false; } });
execSync('git archive v0.3.0-competition-rc2 ' + OLD_FILES.join(' ') + ' | tar -x -C ' + JSON.stringify(tmp), { cwd: ROOT });
function loadOld() { const ctx = { console, structuredClone, setTimeout, clearTimeout, Math, JSON }; ctx.globalThis = ctx; ctx.crypto = require('crypto').webcrypto; vm.createContext(ctx); for (const f of OLD_FILES) vm.runInContext(fs.readFileSync(path.join(tmp, f), 'utf8'), ctx, { filename: f }); return ctx; }
const OLD = loadOld().Silk, NEW = load().Silk;
console.log('old engine', JSON.stringify(OLD.core.versions), '→ new engine', JSON.stringify(NEW.core.versions));
const results = [];
const SEEDS = Number(process.argv[2] || 24), OLD_STEPS = Number(process.argv[3] || 1200), NEW_STEPS = Number(process.argv[4] || 400);
for (let i = 0; i < SEEDS; i++) {
  const seed = 500 + i;
  const row = { seed, ok: false };
  try {
    // the RC2 engine keeps its known defects (that is the point of the sample); its run diagnostics are not judged here
    const oldRun = simulate(OLD, seed, OLD_STEPS, { crashes: new Map(), validationBugs: new Map(), stuck: new Map(), coverage: {}, legacy: true });
    const crashes = new Map(), validationBugs = new Map(), stuck = new Map();
    const env = { meta: { ...OLD.core.versions, generation: 0, revision: 7 }, preferences: { tutorialEnabled: true, soundEnabled: true }, progress: JSON.parse(JSON.stringify(oldRun.progress)), ledger: {}, pending: null, results: {} };
    OLD.core.validate(env);
    const before = { tick: env.progress.world.tick, cash: env.progress.cash, rep: env.progress.reputation.value, turnover: env.progress.reputation.turnover, activeTerminal: env.progress.commissions.active.filter(c => ['completed', 'failed'].includes(c.status)).length, pendingLots: env.progress.inventory.lots.filter(l => l.purchaseTurnoverPending).length, trip: env.progress.trip?.phase || null, story: Object.keys(env.progress.stories.lines) };
    const up = NEW.core.upgradeEnvelope(env);
    if (!up.changed) throw new Error('upgrade should change the envelope');
    NEW.core.validate(up.state);
    const p = up.state.progress;
    // migration guarantees
    if (p.cash !== before.cash || p.world.tick !== before.tick) throw new Error('migration changed money/time');
    if (p.reputation.value !== before.rep || p.reputation.turnover !== before.turnover) throw new Error('migration changed reputation (BUG-07: pending purchases must not be batch-confirmed)');
    if (!p.trip && p.commissions.active.some(c => ['completed', 'failed'].includes(c.status))) throw new Error('terminal commissions still in active after migration');
    for (const l of [...p.inventory.lots, ...p.merchant.cabinets.flatMap(c => c.lots)]) if (typeof l.hasLeftAcquisitionCity !== 'boolean') throw new Error('lot without transport flag');
    for (const l of p.inventory.lots) if (l.ownership === 'storyOwned' && ['QY01_SAMPLE', 'QY02_TRIAL'].includes(l.storyCargoKind) && l.condition === 'destroyed') throw new Error('destroyed initial sample survived migration');
    if (!p.events || typeof p.events.cityRollDays !== 'object') throw new Error('city roll state missing');
    if (p.departureDraft !== null) throw new Error('draft must be null after migration');
    for (const c of p.commissions.active) if (c.urgent && Number.isSafeInteger(c.urgentArrivalTick) && !c.urgentWindow && ['accepted', 'in_transit', 'ready_to_turn_in'].includes(c.status)) throw new Error('urgent window not rebuilt');
    // keep playing on the new engine from the migrated state
    const after = simulate(NEW, seed + 1000, NEW_STEPS, { crashes, validationBugs, stuck, coverage: {}, progress: p });
    if (crashes.size || validationBugs.size || stuck.size) throw new Error('post-migration play issues: ' + JSON.stringify({ crashes: [...crashes.keys()], validation: [...validationBugs.keys()], stuck: [...stuck.keys()].slice(0, 2) }));
    row.ok = true; row.before = before; row.after = { tick: after.tick, cash: after.cash, rep: after.rep, trips: after.trips }; row.migrations = up.state.meta.migrations.length;
  } catch (e) { row.error = String(e.message || e); }
  results.push(row); console.log((row.ok ? 'PASS' : 'FAIL') + ' seed ' + seed + (row.ok ? ' before ' + JSON.stringify(row.before) + ' after ' + JSON.stringify(row.after) : ' ' + row.error));
}
fs.mkdirSync(path.join(__dirname, 'results'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'results', 'migration.json'), JSON.stringify({ old: OLD.core.versions, new: NEW.core.versions, results }, null, 1));
const passed = results.filter(r => r.ok).length; console.log('migration: ' + passed + '/' + results.length);
process.exitCode = passed === results.length ? 0 : 1;
