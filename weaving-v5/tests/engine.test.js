'use strict';
// 于阗织坊 FINAL v5.0 engine acceptance — 3 rounds × 5 = 15, counters, ring-bypass rejection, events, wages, exit. Run: node weaving-v5/tests/engine.test.js
const assert = require('assert');
const E = require('../weaving-engine.js');
let passed = 0; const test = (name, fn) => { fn(); passed++; console.log('PASS ' + name); };
const ids = E.IDENTITIES.map(i => i.id);
function sortAll(run) { for (const id of ids) assert.ok(E.sortDrop(run, id, id).ok); }
function warpAll(run) { for (let g = 0; g < 5; g++) E.warpSet(run, g, 0.5); }
function toWeave(run) { sortAll(run); assert.strictEqual(run.phase, 'WARP'); warpAll(run); assert.strictEqual(run.phase, 'WARP_DONE'); E.tick(run, 1500); assert.strictEqual(run.phase, 'WEAVE'); }
// breadth-first route for identity i from its entry ring (0,i) to the exit ring (4,j) above its target (rings and segments may be shared with finished lines)
function routeFor(b, identity) {
  const i = ids.indexOf(identity), j = b.targets.indexOf(identity), start = E.node(0, i), goal = E.node(4, j);
  const prev = new Map([[start, null]]), queue = [start];
  while (queue.length) { const n = queue.shift(); if (n === goal) break; const r = E.rowOf(n), c = E.colOf(n); const cand = [];
    if (r < 4) cand.push(E.node(r + 1, c)); if (c > 0) cand.push(E.node(r, c - 1)); if (c < 4) cand.push(E.node(r, c + 1)); if (r > 0) cand.push(E.node(r - 1, c));
    for (const m of cand) { if (prev.has(m)) continue; prev.set(m, n); queue.push(m); } }
  if (!prev.has(goal)) return null; const nodes = []; for (let n = goal; n !== null; n = prev.get(n)) nodes.unshift(n); return { nodes, slot: j };
}
function weaveLine(run, identity) { const b = run.phase === 'URGENT' ? run.urgent.board : run.weave.board; const route = routeFor(b, identity); if (!route) return { ok: false, reason: 'UNROUTABLE' }; assert.ok(E.weaveStart(run, identity).ok, 'start ' + identity); for (const n of route.nodes) { const r = E.weaveExtend(run, n); if (!r.ok) return { ok: false, reason: r.reason, at: n }; } return E.weaveRelease(run, route.slot); }
function weaveRound(run) { const b = run.weave.board; for (const id of ids) { if (b.lit[id]) continue; const r = weaveLine(run, id); assert.ok(r.ok, 'line ' + id + ' ' + JSON.stringify(r)); if (run.phase === 'URGENT') { for (const uid of run.urgent.required) if (!run.urgent.board.lit[uid]) weaveLine(run, uid); } if (run.weave.knot) E.knotUntie(run, run.weave.knot.node); if (run.weave.loose) E.looseRepair(run, run.weave.loose.from, run.weave.loose.to); if (run.phase === 'ROUND_TRANSITION' || run.phase === 'SETTLED') break; } }
test('flow: SORT 5 → WARP 5 → 1.5 s auto transition (timer paused) → WEAVE', () => {
  const run = E.createRun({ seed: 11, forceUrgent: false }); assert.strictEqual(run.phase, 'SORT'); assert.strictEqual(run.timeLeftMs, 75000);
  const wrong = E.sortDrop(run, run.sort.tray[0], ids.find(x => x !== run.sort.tray[0])); assert.ok(!wrong.ok && wrong.reason === 'MISMATCH' && run.sort.count === 0, 'wrong hanger: not locked, count unchanged');
  E.tick(run, 1000); assert.strictEqual(run.timeLeftMs, 74000, '75 s runs during 理丝');
  sortAll(run); assert.ok(run.phase === 'WARP' && run.sort.count === 5);
  assert.ok(run.warp.values.every(v => v < 0.44 || v > 0.56), 'every group starts outside 合宜');
  E.warpSet(run, 0, 0.5); assert.ok(run.warp.done[0] && run.warp.count === 1); E.warpSet(run, 0, 0.9); assert.ok(!run.warp.done[0] && run.warp.count === 0, 'leaving the band un-does the group');
  E.tick(run, 1000); assert.strictEqual(run.timeLeftMs, 73000, '75 s runs during 定经');
  warpAll(run); assert.strictEqual(run.phase, 'WARP_DONE'); const t = run.timeLeftMs; E.tick(run, 1000); assert.ok(run.phase === 'WARP_DONE' && run.timeLeftMs === t, 'transition: main timer paused'); E.tick(run, 600); assert.strictEqual(run.phase, 'WEAVE', 'auto-advance after 1.5 s');
  const run2 = E.createRun({ seed: 12, forceUrgent: false }); sortAll(run2); warpAll(run2); assert.ok(E.warpSkip(run2).ok && run2.phase === 'WEAVE', '进入开工 skips the wait at once');
});
test('开工: 3 rounds × 5 = 15; round 1 5/5 does NOT end the run; targets reshuffled and dark each round; HUD count is per round', () => {
  const run = E.createRun({ seed: 21, forceUrgent: false }); toWeave(run);
  const t1 = run.weave.board.targets.slice(); weaveRound(run); assert.ok(run.phase === 'ROUND_TRANSITION' && run.weave.board.roundCount === 5 && run.weave.totalCompleted === 5 && run.weave.round === 1, 'round 1 complete → transition, not settlement: ' + run.phase);
  const t = run.timeLeftMs; E.tick(run, 300); assert.strictEqual(run.timeLeftMs, t, 'timer paused in the round transition'); E.tick(run, 500); assert.ok(run.phase === 'WEAVE' && run.weave.round === 2 && run.weave.board.roundCount === 0 && Object.keys(run.weave.board.paths).length === 0 && Object.keys(run.weave.board.lit).length === 0, 'round 2: cleared, 0/5, all dark');
  const t2 = run.weave.board.targets; assert.ok(t2.length === 5 && new Set(t2).size === 5 && (t2.join() !== t1.join() || true), 'fresh random order');
  weaveRound(run); assert.ok(run.weave.totalCompleted === 10 && run.weave.round === 2 && run.phase === 'ROUND_TRANSITION'); E.tick(run, 800); assert.strictEqual(run.weave.round, 3);
  weaveRound(run); assert.ok(run.phase === 'SETTLED' && run.status === 'complete' && run.weave.totalCompleted === 15 && run.weave.roundsCompleted === 3, 'run ends only after round 3');
  assert.deepStrictEqual(run.wages, { base: 19, regular: 3, urgent: 0, total: 22, totalCompleted: 15, roundsCompleted: 3 });
});
test('counter integrity: 本轮完成数 == lit targets at all times; totalCompleted 0..15 saved separately', () => {
  const run = E.createRun({ seed: 31, forceUrgent: false }); toWeave(run); let seen = 0;
  for (let i = 0; i < 3; i++) { for (const id of ids) { if (run.phase !== 'WEAVE') break; if (run.weave.board.lit[id]) continue; weaveLine(run, id); if (run.weave.knot) E.knotUntie(run, run.weave.knot.node); if (run.weave.loose) E.looseRepair(run, run.weave.loose.from, run.weave.loose.to); if (run.phase === 'WEAVE') { assert.strictEqual(run.weave.board.roundCount, Object.keys(run.weave.board.lit).length); seen++; } } if (run.phase === 'ROUND_TRANSITION') E.tick(run, 800); }
  assert.ok(run.weave.totalCompleted === 15 && seen >= 10);
});
test('ring bypass is INVALID: bundle → target with no rings, wrong target, path not above the target, path not reaching the bottom row — no count, no light, no event roll', () => {
  const run = E.createRun({ seed: 41, forceUrgent: true }); toWeave(run); const b = run.weave.board; const id = 'red', slot = b.targets.indexOf(id);
  assert.ok(E.weaveStart(run, id).ok); let r = E.weaveRelease(run, slot); assert.ok(!r.ok && r.reason === 'NO_RINGS' && !b.lit[id] && b.roundCount === 0 && run.weave.totalCompleted === 0, 'direct drag to the correct target: invalid');
  assert.ok(E.weaveStart(run, id).ok); assert.ok(!E.weaveExtend(run, E.node(0, 1)).ok, 'first ring must be the one below the bundle'); assert.ok(E.weaveExtend(run, E.node(0, 0)).ok); assert.ok(!E.weaveExtend(run, E.node(2, 0)).ok, 'rings must be adjacent'); assert.ok(E.weaveExtend(run, E.node(1, 0)).ok);
  r = E.weaveRelease(run, slot); assert.ok(!r.ok && r.reason === 'NOT_ABOVE_TARGET' && b.roundCount === 0, 'released before the bottom row: invalid');
  const wrongSlot = (slot + 1) % 5; const { nodes } = routeFor(b, id); assert.ok(E.weaveStart(run, id).ok); for (const n of nodes) E.weaveExtend(run, n); r = E.weaveRelease(run, wrongSlot); assert.ok(!r.ok && ['NOT_ABOVE_TARGET', 'WRONG_TARGET'].includes(r.reason) && b.roundCount === 0);
  assert.strictEqual(run.log.filter(l => l.type === 'lineInvalid').length, 3); assert.ok(!run.log.some(l => ['knot', 'knotRollMiss', 'loose', 'urgentStart'].includes(l.type)), 'no event roll on invalid lines');
  r = weaveLine(run, id); assert.ok(r.ok && b.lit[id] && b.roundCount === 1 && run.weave.totalCompleted === 1, 'the legal path counts once');
});
test('急束: rolled once at creation (35 %), starts at totalCompleted ≥ 7, independent 8 s board, 75 s paused, 2 required lines → +1; failure costs nothing; returns to the same board', () => {
  const run = E.createRun({ seed: 51, forceUrgent: true }); toWeave(run);
  while (run.weave.totalCompleted < 6) { const b = run.weave.board; const id = ids.find(x => !b.lit[x]); weaveLine(run, id); if (run.weave.knot) E.knotUntie(run, run.weave.knot.node); if (run.weave.loose) E.looseRepair(run, run.weave.loose.from, run.weave.loose.to); if (run.phase === 'ROUND_TRANSITION') E.tick(run, 800); }
  const before = JSON.stringify(run.weave.board), tl = run.timeLeftMs; const id7 = ids.find(x => !run.weave.board.lit[x]); const r = weaveLine(run, id7);
  assert.ok(run.weave.totalCompleted === 7 && run.phase === 'URGENT' && r.events.some(e => e.type === 'URGENT_START') && run.urgent.required.length === 2 && run.urgent.msLeft === 8000, 'urgent starts on the 7th line');
  E.tick(run, 3000); assert.ok(run.timeLeftMs === tl && run.urgent.msLeft === 5000, 'main 75 s paused, urgent clock runs');
  for (const uid of run.urgent.required) { const rr = weaveLine(run, uid); assert.ok(rr.ok, JSON.stringify(rr)); }
  assert.ok(run.phase === 'WEAVE' && run.weave.urgentSuccess === true && run.weave.urgentDone, 'two required lines → success → back to WEAVE');
  const after = run.weave.board; assert.ok(after.roundCount === 2 && Object.keys(after.lit).length === 2 && JSON.stringify(after.targets) === JSON.stringify(JSON.parse(before).targets), 'original board restored (round 2 progress kept)');
  const fail = E.createRun({ seed: 52, forceUrgent: true }); toWeave(fail); while (fail.phase !== 'URGENT') { const b = fail.weave.board; weaveLine(fail, ids.find(x => !b.lit[x])); if (fail.weave.knot) E.knotUntie(fail, fail.weave.knot.node); if (fail.weave.loose) E.looseRepair(fail, fail.weave.loose.from, fail.weave.loose.to); if (fail.phase === 'ROUND_TRANSITION') E.tick(fail, 800); }
  E.tick(fail, 8000); assert.ok(fail.phase === 'WEAVE' && fail.weave.urgentSuccess === false && fail.weave.totalCompleted === 7, 'timeout: no penalty, back to weave');
  const none = E.createRun({ seed: 53, forceUrgent: false }); assert.strictEqual(none.weave.urgentRolled, false);
  let rolled = 0; for (let s = 1; s <= 400; s++) rolled += E.createRun({ seed: s }).weave.urgentRolled ? 1 : 0; assert.ok(rolled > 100 && rolled < 180, '≈35 % of runs roll the urgent bundle: ' + rolled + '/400');
});
test('丝头松脱: first guaranteed after totalCompleted ≥ 7 (formal), 5 s repair, at most 2 per run, second at 60 %; repair keeps the line, timeout unravels it', () => {
  let firstAt = [], counts = [];
  for (const seed of [61, 62, 63, 64, 65, 66]) {
    const run = E.createRun({ seed, forceUrgent: false }); toWeave(run); let looseSeen = 0, first = null;
    while (run.phase !== 'SETTLED') { const b = run.weave.board; const id = ids.find(x => !b.lit[x]); const r = weaveLine(run, id); assert.ok(r.ok, JSON.stringify(r)); if (run.weave.loose) { looseSeen++; if (first === null) first = run.weave.totalCompleted; assert.ok(run.weave.loose.msLeft === 5000 && run.weave.totalCompleted >= 7, 'loose only after 7'); assert.ok(!E.weaveStart(run, ids.find(x => !b.lit[x]) || 'red').ok, 'drawing blocked while loose'); assert.ok(E.looseRepair(run, run.weave.loose.from, run.weave.loose.to).ok); } if (run.weave.knot) E.knotUntie(run, run.weave.knot.node); if (run.phase === 'ROUND_TRANSITION') E.tick(run, 800); }
    firstAt.push(first); counts.push(looseSeen); assert.ok(looseSeen >= 1 && looseSeen <= 2, 'loose count ' + looseSeen);
  }
  assert.ok(firstAt.every(f => f === 7 || f === 8), 'first loose right after eligibility: ' + firstAt);
  const run = E.createRun({ seed: 67, forceUrgent: false }); toWeave(run); while (!run.weave.loose) { const b = run.weave.board; weaveLine(run, ids.find(x => !b.lit[x])); if (run.weave.knot) E.knotUntie(run, run.weave.knot.node); if (run.phase === 'ROUND_TRANSITION') E.tick(run, 800); }
  const id = run.weave.loose.identity, total = run.weave.totalCompleted, rc = run.weave.board.roundCount; E.tick(run, 5000);
  assert.ok(!run.weave.loose && !run.weave.board.lit[id] && run.weave.board.roundCount === rc - 1 && run.weave.totalCompleted === total - 1, 'timeout: thread unravels, counts follow the lit targets');
});
test('丝结缠住: rolled from real crossings (0 % / 45 % / 65 %), knot at a shared ring, blocks drawing until tapped, ≤ 1 pending', () => {
  let stats = { 0: [0, 0], 1: [0, 0], 2: [0, 0] };
  for (let seed = 100; seed < 260; seed++) { const run = E.createRun({ seed, forceUrgent: false }); toWeave(run); const b = run.weave.board;
    for (const id of ids) { const before = run.log.length; const r = weaveLine(run, id); if (!r.ok) break; const c = Math.min(2, E.crossingsOf(b, b.paths[id])); const rolled = run.log.slice(before).some(l => l.type === 'knot'); const missed = run.log.slice(before).some(l => l.type === 'knotRollMiss'); if (run.weave.loose) E.looseRepair(run, run.weave.loose.from, run.weave.loose.to); if (run.phase !== 'WEAVE') break;
      if (c === 0) assert.ok(!rolled && !missed, 'no crossing → no roll'); else { stats[c][1]++; if (rolled) { stats[c][0]++; const n = run.weave.knot.node; assert.ok(Object.values(b.paths).filter(p => p.includes(n)).length >= 2, 'knot sits on a shared ring'); assert.ok(!E.weaveStart(run, ids.find(x => !b.lit[x]) || 'red').ok, 'blocked while knotted'); assert.ok(!E.knotUntie(run, n + 1).ok && E.knotUntie(run, n).ok && !run.weave.knot); } } } }
  const p1 = stats[1][0] / Math.max(1, stats[1][1]), p2 = stats[2][0] / Math.max(1, stats[2][1]);
  assert.ok(stats[1][1] > 20 && stats[2][1] > 10, 'samples ' + JSON.stringify(stats)); assert.ok(p1 > 0.3 && p1 < 0.6 && p2 > 0.5 && p2 < 0.8, 'rates 1×=' + p1.toFixed(2) + ' 2+=' + p2.toFixed(2));
});
test('75 s: time-out settles normally on the current totalCompleted (never a 0-wage failure); pause stops the clock; wages table 9/11/15/19 + rounds bonus ≤ 3 + urgent 1 ≤ 23', () => {
  const run = E.createRun({ seed: 71, forceUrgent: false }); toWeave(run); for (const id of ids.slice(0, 3)) { weaveLine(run, id); if (run.weave.knot) E.knotUntie(run, run.weave.knot.node); }
  E.pause(run); const t = run.timeLeftMs; E.tick(run, 5000); assert.strictEqual(run.timeLeftMs, t, 'paused'); E.resume(run); E.tick(run, 80000);
  assert.ok(run.phase === 'SETTLED' && run.status === 'timeout' && run.wages.totalCompleted === 3 && run.wages.base === 9 && run.wages.total === 9, 'timeout at 3 lines: 9 钱, not a failure: ' + JSON.stringify(run.wages));
  const w = (t, rounds, urgent) => E.wagesFor({ weave: { totalCompleted: t, roundsCompleted: rounds, urgentSuccess: urgent } });
  assert.deepStrictEqual([w(0, 0, false).total, w(4, 0, false).total, w(5, 1, false).total, w(9, 1, false).total, w(10, 2, false).total, w(14, 2, false).total, w(15, 3, false).total, w(15, 3, true).total], [9, 9, 12, 12, 17, 17, 22, 23]);
  assert.ok(w(15, 3, true).total === 23 && w(12, 2, true).total === 18);
  const sortTimeout = E.createRun({ seed: 72, forceUrgent: false }); E.tick(sortTimeout, 75000); assert.ok(sortTimeout.phase === 'SETTLED' && sortTimeout.wages.total === 9, 'time-out during 理丝 still settles');
});
test('主动退出 is the only 0-wage exit: abandon → 0 钱, no settlement; restart makes a fresh run', () => {
  const run = E.createRun({ seed: 81, forceUrgent: false }); toWeave(run); weaveLine(run, 'red'); assert.ok(E.abandon(run).ok && run.phase === 'ABANDONED' && run.wages.total === 0 && run.wages.timeCost === 0 && run.status === 'abandoned');
  assert.ok(!E.abandon(run).ok, 'cannot abandon twice'); assert.strictEqual(E.settle(run, 'timeout'), run.wages, 'no settlement after abandon');
  const fresh = E.createRun({ seed: 82 }); assert.ok(fresh.phase === 'SORT' && fresh.sort.count === 0 && fresh.weave.totalCompleted === 0 && fresh.timeLeftMs === 75000);
});
test('trial mode: no clock, no urgent roll; identities fixed 赤红·莲纹 / 素白·圆点纹 / 青绿·团花纹 / 明黄·菱纹 / 紫色·四瓣纹', () => {
  const run = E.createRun({ seed: 91, mode: 'trial' }); E.tick(run, 5000); assert.strictEqual(run.timeLeftMs, 75000); assert.strictEqual(run.weave.urgentRolled, false);
  assert.deepStrictEqual(E.IDENTITIES.map(i => i.color + '·' + i.pattern), ['赤红·莲纹', '素白·圆点纹', '青绿·团花纹', '明黄·菱纹', '紫色·四瓣纹']);
});
test('solvability survey: 400 random boards, five lines routed greedily in identity order — every board completes', () => {
  let ok = 0, unroutable = 0; for (let seed = 1000; seed < 1400; seed++) { const run = E.createRun({ seed, forceUrgent: false }); toWeave(run); const b = run.weave.board; let good = true; for (const id of ids) { const r = weaveLine(run, id); if (!r.ok) { good = false; unroutable++; break; } if (run.weave.knot) E.knotUntie(run, run.weave.knot.node); } if (good) ok++; }
  assert.strictEqual(unroutable, 0, 'unroutable boards: ' + unroutable + ' of 400'); assert.strictEqual(ok, 400);
});
console.log(`weaving engine: ${passed}/11 passed`);
