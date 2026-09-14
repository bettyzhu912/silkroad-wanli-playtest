'use strict';
// 敦煌《缀纹成章》 + 于阗《于阗织坊》 main-game integration (R32) — parity + host contract acceptance, the same shape as caravan.test.js.
// LV-P: the root copies of the standalone engines / layout / art are byte-for-byte the standalone files (tests/tools/sync-livelihood-minigames.js);
// LV-A/B/C/D (缀纹成章): entry rules (敦煌, 晨 / 午 — HALF_DAY), start (seed from the host RNG, reproducible board), finish validation, settlement
// (pay once within the frozen HALF_DAY bounds 6..15 / 0 without a valid stroke, +1 tick, journal), abort, gating; LV-E/F/G/H (于阗织坊): entry
// rules (于阗, 晨 — FULL_DAY), start, finish validation (wages recomputed from the frozen bands), settlement (+total, +2 ticks to 暮, journal),
// abort, 继续留坊 = settle then a new run only when the time allows, gating; LV-X: cross-gating between all four livelihood jobs.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { load, driver } = require('./harness');
const { PAIRS } = require('./tools/sync-livelihood-minigames');
const ROOT = path.join(__dirname, '..');
const ctx = load(); const S = ctx.Silk;
const results = [];
function test(id, title, fn) { const t0 = Date.now(); try { const details = fn() || []; results.push({ id, title, pass: true, details, ms: Date.now() - t0 }); } catch (e) { results.push({ id, title, pass: false, details: [String(e && e.stack || e)], ms: Date.now() - t0 }); } }
function assert(cond, msg) { if (!cond) throw new Error('ASSERT: ' + msg); }
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
function atCity(city, seed = 21) {
  const d = driver(S, seed); d.p.cash = 200; d.quietRoute(60); d.quietCity(60);
  d.run('trip.begin'); d.run('trip.depart', { acknowledgeSupplyWarning: true });
  d.p.world.route = null; d.p.world.city = city; d.p.trip.routeIndex = city === 'dunhuang' ? 1 : 2; d.p.trip.phase = 'in_city'; d.p.trip.routeHistory = city === 'dunhuang' ? ['changan', 'dunhuang'] : ['changan', 'dunhuang', 'khotan'];
  d.p.world.tick = Math.ceil(d.p.world.tick / 3) * 3 + 3;   // next 晨
  return d;
}
const PE = () => S.patternChain.engine(), WE = () => S.weaving.engine();
const pcOutcome = over => ({ endedBy: 'STROKES', score: 42, validStrokes: 10, longestChain: 6, wildcardsGenerated: 0, representativeMotif: 'LOTUS', elapsedMs: 41000, ...over });
const wvOutcome = over => ({ status: 'complete', totalCompleted: 15, roundsCompleted: 3, urgentSuccess: false, ...over });
function pcFormal(d) { const v = d.run('PATTERN_START', { mode: 'FORMAL' }); assert(v.kind === 'PATTERN_SESSION' && v.phase === 'PLAYING', 'formal run created'); return v; }
function wvFormal(d) { const v = d.run('WEAVING_START', { mode: 'FORMAL' }); assert(v.kind === 'WEAVING_SESSION' && v.phase === 'PLAYING', 'formal run created'); return v; }
// plays a real engine run to the end with a greedy strategy (prefers 5-chains); returns the engine result
function playPattern(seed, mode = 'FORMAL', strokes = 10) {
  const E = PE(); const run = E.createRun({ mode, seed, now: 0 }); let guard = 0;
  while (run.phase === 'PLAYING' && guard++ < 40) {
    if (run.validStrokes >= strokes) { E.tick(run, 60001); break; }
    const p = E.findPath(run.board, 6, 7, 5) || E.findPath(run.board, 6, 7, 3); if (!p) { E.tick(run, 60001); break; }
    E.pathStart(run, p[0]); for (const i of p.slice(1)) E.pathExtend(run, i); E.pathRelease(run, { zone: 'board' }); E.resolveDone(run); E.tick(run, 3000);
  }
  return run;
}
const pcMetrics = run => { const r = run.result; return { endedBy: run.endedBy, score: r.primaryMetrics.score, validStrokes: r.primaryMetrics.validStrokes, longestChain: r.primaryMetrics.longestChain, wildcardsGenerated: r.primaryMetrics.wildcardsGenerated, representativeMotif: r.secondaryMetrics.representativeMotif, elapsedMs: Math.round(run.elapsedMs) }; };

test('LV-P1', '根目录副本与独立版逐字节一致（引擎 / 揭示 / 布局表 / 图与字体）', () => {
  const out = []; let n = 0;
  for (const [from, to] of PAIRS) { assert(fs.existsSync(path.join(ROOT, to)), 'root copy missing: ' + to); assert(sha(path.join(ROOT, from)) === sha(path.join(ROOT, to)), 'root copy differs from the standalone: ' + to); n++; }
  assert(n >= 40, 'pairs counted ' + n);
  assert(typeof PE().createRun === 'function' && typeof WE().createRun === 'function' && typeof WE().wagesFor === 'function', 'engine surfaces');
  const layoutText = fs.readFileSync(path.join(ROOT, 'weaving-layout.js'), 'utf8'); assert(/YutianWeavingLayout/.test(layoutText), 'layout table');
  return [n + ' pairs identical'];
});
test('LV-P2', '主游戏 assets 映射覆盖两游戏全部运行时图（每个映射指向存在的文件）', () => {
  const keys = ['DPC_READY_BG_v01', 'DPC_BOARD_BG_SILK_v01', 'DPC_01_LOTUS_PETAL_C217_v01', 'DPC_07_BAOXIANGHUA_WILDCARD_v01', 'DPC_FULL_06_DIAMOND_REPEAT_C079_v01', 'yutian_weaving_body_sort_v5', 'yutian_weaving_body_settle_v5', 'yutian_weaving_bundle_top_red_v5', 'yutian_weaving_bundle_tray_purple_v5', 'yutian_weaving_ring_v5', 'yutian_weaving_slot_empty_v5', 'yutian_weaving_weight_v5', 'yutian_weaving_wood_patch_v5'];
  const runRoot = process.env.SILK_ROOT || ROOT;   // on a build stage the PNG values are rewritten to WebP names
  for (const k of keys) { const v = S.assets[k]; assert(v, 'mapping missing ' + k); assert(fs.existsSync(path.join(runRoot, v)), 'mapped file missing ' + v); }
  return [keys.length + ' keys checked'];
});
test('LV-A1', '缀纹成章入口：敦煌晨 / 午可开工（HALF_DAY）；暮「今日时间不足」；试玩不需登记', () => {
  const d = atCity('dunhuang');
  let a = S.patternChain.availability(d.p); assert(a.canStartFormal && a.canTrial && a.enoughTime && a.phase === 0, 'morning available');
  d.p.world.tick += 1; a = S.patternChain.availability(d.p); assert(a.canStartFormal && a.phase === 1, 'noon available (HALF_DAY)');
  d.p.world.tick += 1; a = S.patternChain.availability(d.p); assert(!a.canStartFormal && a.canTrial && !a.enoughTime && a.reason === '今日时间不足，改日再来。', 'dusk blocked, trial ok');
  const r = d.tryRun('PATTERN_START', { mode: 'FORMAL' }); assert(!r.ok && r.code === 'PATTERN_NO_TIME', 'engine refuses formal at dusk: ' + r.code);
  const t = d.tryRun('PATTERN_START', { mode: 'TRIAL' }); assert(!t.ok && t.code === 'PATTERN_MODE', 'trial is UI-only');
  return ['晨 / 午 ok, 暮 blocked, trial available'];
});
test('LV-A2', '缀纹成章入口：仅敦煌可开工；长安 / 于阗 / 途中拒绝', () => {
  const d = driver(S, 22); d.quietRoute(60); d.quietCity(60);
  let r = d.tryRun('PATTERN_START', { mode: 'FORMAL' }); assert(!r.ok && r.code === 'PATTERN_CITY', 'changan refused ' + r.code);
  const k = atCity('khotan'); r = k.tryRun('PATTERN_START', { mode: 'FORMAL' }); assert(!r.ok && r.code === 'PATTERN_CITY', 'khotan refused ' + r.code);
  return ['changan / khotan refused'];
});
test('LV-B1', '缀纹成章开工：会话记录 seed（主游戏 RNG），棋盘可由引擎从 seed 重现；开工不改钱与时间', () => {
  const d = atCity('dunhuang'); const cash = d.p.cash, tick = d.p.world.tick; const v = pcFormal(d);
  assert(Number.isInteger(v.seed) && v.seed > 0, 'seed stored'); assert(d.p.cash === cash && d.p.world.tick === tick, 'no world effect at start');
  const a = PE().createRun({ mode: 'FORMAL', seed: v.seed }), b = PE().createRun({ mode: 'FORMAL', seed: v.seed });
  assert(JSON.stringify(a.board.map(c => c.motif)) === JSON.stringify(b.board.map(c => c.motif)), 'board reproducible from the seed');
  const again = d.tryRun('PATTERN_START', { mode: 'FORMAL' }); assert(!again.ok && ['MINIGAME_ACTIVE', 'WORK_ACTIVE'].includes(again.code), 'second start blocked while playing: ' + again.code);
  return ['seed ' + v.seed];
});
test('LV-B2', '缀纹成章收工校验：非法原因 / 越界指标 / 不自洽的代表纹样被拒绝，会话仍在进行', () => {
  const d = atCity('dunhuang'); const v = pcFormal(d);
  for (const [bad, code] of [[{ endedBy: 'NOPE' }, 'PATTERN_REASON'], [{ score: 900 }, 'PATTERN_METRICS'], [{ validStrokes: 11 }, 'PATTERN_METRICS'], [{ endedBy: 'TIME', validStrokes: 0, score: 0, longestChain: 0, representativeMotif: 'LOTUS' }, 'PATTERN_MOTIF'], [{ representativeMotif: 'BAOXIANGHUA_WILDCARD' }, 'PATTERN_MOTIF'], [{ validStrokes: 3, endedBy: 'STROKES' }, 'PATTERN_METRICS'], [{ elapsedMs: -1 }, 'PATTERN_CLOCK']]) {
    const r = d.tryRun('PATTERN_FINISH', { sessionId: v.sessionId, outcome: pcOutcome(bad) }); assert(!r.ok && r.code === code, JSON.stringify(bad) + ' → ' + r.code);
  }
  assert(d.p.work.pattern.phase === 'PLAYING' && !d.p.work.pattern.result, 'still playing');
  const wrong = d.tryRun('PATTERN_FINISH', { sessionId: 'x', outcome: pcOutcome() }); assert(!wrong.ok && wrong.code === 'PATTERN_SESSION', 'session id checked');
  return ['7 invalid outcomes refused'];
});
test('LV-B3', '缀纹成章工钱（TEMP_PROTOTYPE_SCORE_TO_CASH_MAPPING）：0 有效笔 → 0；有效笔 ≥ 1 → 5 + ⌊score/6⌋ 夹在 [6, 15]（冻结的 HALF_DAY 上下限）', () => {
  const pay = S.patternChain.payout;
  assert(pay({ validStrokes: 0, score: 0 }).cash === 0, 'zero-clear → 0');
  assert(pay({ validStrokes: 1, score: 3 }).cash === 6 && pay({ validStrokes: 1, score: 3 }).baseWage === 5 && pay({ validStrokes: 1, score: 3 }).extraWage === 1, 'one 3-chain → 6 (base 5 + 1)');
  assert(pay({ validStrokes: 10, score: 30 }).cash === 10, 'score 30 → 10'); assert(pay({ validStrokes: 10, score: 54 }).cash === 14, 'score 54 → 14');
  assert(pay({ validStrokes: 10, score: 60 }).cash === 15 && pay({ validStrokes: 10, score: 400 }).cash === 15, 'cap 15');
  for (let s = 0; s <= 200; s++) { const c = pay({ validStrokes: 5, score: s }).cash; assert(c >= 6 && c <= 15, 'bounds at score ' + s); }
  assert(S.patternChain.RULES.cashMapping === 'TEMP_PROTOTYPE_SCORE_TO_CASH_MAPPING' && S.patternChain.RULES.ticks === 1, 'rules tagged');
  return ['0 → 0; 3 → 6; 30 → 10; 54 → 14; ≥ 60 → 15'];
});
test('LV-C1', '缀纹成章正式局（真实引擎对局）：收工写入会话（钱未变）→ 结算一次付钱 + 1 时段 + journal；重复结算幂等', () => {
  const d = atCity('dunhuang'); const v = pcFormal(d); const cash = d.p.cash, tick = d.p.world.tick;
  const run = playPattern(v.seed); assert(run.phase === 'ENDED' && run.result, 'engine run ended: ' + run.phase);
  const m = pcMetrics(run); const fin = d.run('PATTERN_FINISH', { sessionId: v.sessionId, outcome: m });
  assert(fin.phase === 'FINISHED' && fin.result && fin.result.totalWage === S.patternChain.payout(m).cash && !fin.settled, 'finished, unsettled');
  assert(d.p.cash === cash && d.p.world.tick === tick, 'finish pays nothing');
  const other = d.tryRun('market.enter'); assert(!other.ok && other.code === 'MINIGAME_ACTIVE', 'other commands blocked until settled: ' + other.code);
  const st = d.run('PATTERN_SETTLE', { sessionId: v.sessionId, settlementId: fin.settlementId });
  assert(st.kind === 'patternSettled' && st.cashDelta === fin.result.totalWage && st.ticks === 1, 'settled once: ' + JSON.stringify(st));
  assert(d.p.cash === cash + fin.result.totalWage && d.p.world.tick === tick + 1, 'cash + wage, +1 tick');
  const j = d.p.journal.filter(r => r.type === 'pattern'); assert(j.length === 1 && j[0].amount === fin.result.totalWage && j[0].tick === tick, 'journal entry');
  const again = d.run('PATTERN_SETTLE', { sessionId: v.sessionId, settlementId: fin.settlementId }); assert(again.alreadySettled && d.p.cash === cash + fin.result.totalWage && d.p.world.tick === tick + 1, 'idempotent');
  assert(!S.patternChain.isActive(d.p), 'no longer active'); assert(d.tryRun('market.enter').ok || d.tryRun('market.enter').code !== 'MINIGAME_ACTIVE', 'world free again');
  return ['score ' + m.score + ' / ' + m.validStrokes + ' strokes → ' + fin.result.totalWage + ' 钱 (' + fin.result.baseWage + '+' + fin.result.extraWage + '), tick ' + tick + ' → ' + d.p.world.tick];
});
test('LV-C2', '缀纹成章午间开工 → 结算落在暮（HALF_DAY 第二局）；同日两局 = 晨 + 午', () => {
  const d = atCity('dunhuang'); const cash = d.p.cash;
  const v1 = pcFormal(d); const r1 = playPattern(v1.seed); const f1 = d.run('PATTERN_FINISH', { sessionId: v1.sessionId, outcome: pcMetrics(r1) }); d.run('PATTERN_SETTLE', { sessionId: v1.sessionId, settlementId: f1.settlementId });
  assert(d.p.world.tick % 3 === 1, 'noon after the first run');
  const v2 = pcFormal(d); const r2 = playPattern(v2.seed); const f2 = d.run('PATTERN_FINISH', { sessionId: v2.sessionId, outcome: pcMetrics(r2) }); d.run('PATTERN_SETTLE', { sessionId: v2.sessionId, settlementId: f2.settlementId });
  assert(d.p.world.tick % 3 === 2, 'dusk after the second run'); assert(d.p.cash === cash + f1.result.totalWage + f2.result.totalWage, 'both wages paid');
  const third = d.tryRun('PATTERN_START', { mode: 'FORMAL' }); assert(!third.ok && third.code === 'PATTERN_NO_TIME', 'no third run at dusk');
  return ['晨 → 午 → 暮, wages ' + f1.result.totalWage + ' + ' + f2.result.totalWage];
});
test('LV-C3', '缀纹成章零有效落笔的超时局：0 钱，仍耗半日；代表纹样 null', () => {
  const d = atCity('dunhuang'); const v = pcFormal(d); const cash = d.p.cash, tick = d.p.world.tick;
  const f = d.run('PATTERN_FINISH', { sessionId: v.sessionId, outcome: pcOutcome({ endedBy: 'TIME', score: 0, validStrokes: 0, longestChain: 0, wildcardsGenerated: 0, representativeMotif: null, elapsedMs: 60000 }) });
  assert(f.result.totalWage === 0 && f.result.baseWage === 0, 'zero wage'); d.run('PATTERN_SETTLE', { sessionId: v.sessionId, settlementId: f.settlementId });
  assert(d.p.cash === cash && d.p.world.tick === tick + 1, '0 钱, +1 tick');
  return ['0 钱 / +1 tick'];
});
test('LV-D1', '缀纹成章中止：进行中可中止（0 钱 0 时段，无 journal）；已收工不可中止；结算前世界变化被拒绝', () => {
  const d = atCity('dunhuang'); const v = pcFormal(d); const cash = d.p.cash, tick = d.p.world.tick;
  const ab = d.run('PATTERN_ABORT', { sessionId: v.sessionId }); assert(ab.phase === 'ABORTED' && d.p.cash === cash && d.p.world.tick === tick && !d.p.journal.some(r => r.type === 'pattern'), 'aborted without cost');
  assert(!S.patternChain.isActive(d.p) && S.patternChain.availability(d.p).canStartFormal, 'can start again');
  const v2 = pcFormal(d); const f = d.run('PATTERN_FINISH', { sessionId: v2.sessionId, outcome: pcOutcome() });
  const noAbort = d.tryRun('PATTERN_ABORT', { sessionId: v2.sessionId }); assert(!noAbort.ok && noAbort.code === 'PATTERN_FINISHED', 'finished run cannot be aborted');
  d.p.world.tick += 1; const moved = d.tryRun('PATTERN_SETTLE', { sessionId: v2.sessionId, settlementId: f.settlementId }); assert(!moved.ok && moved.code === 'PATTERN_WORLD_CHANGED', 'world changed → refused: ' + moved.code);
  return ['abort free; finished cannot abort; world change refused'];
});
test('LV-E1', '于阗织坊入口：于阗晨可开工（FULL_DAY）；午 / 暮「今日时间不足」；试工不需登记；仅于阗', () => {
  const d = atCity('khotan');
  let a = S.weaving.availability(d.p); assert(a.canStartFormal && a.canTrial && a.phase === 0 && a.inKhotan, 'morning available');
  d.p.world.tick += 1; a = S.weaving.availability(d.p); assert(!a.canStartFormal && a.canTrial && a.reason === '今日时间不足，改日再来。', 'noon blocked (FULL_DAY)');
  let r = d.tryRun('WEAVING_START', { mode: 'FORMAL' }); assert(!r.ok && r.code === 'WEAVING_NO_TIME', 'engine refuses at noon: ' + r.code);
  d.p.world.tick += 1; a = S.weaving.availability(d.p); assert(!a.canStartFormal && a.canTrial, 'dusk blocked');
  const t = d.tryRun('WEAVING_START', { mode: 'TRIAL' }); assert(!t.ok && t.code === 'WEAVING_MODE', 'trial is UI-only');
  const dh = atCity('dunhuang'); r = dh.tryRun('WEAVING_START', { mode: 'FORMAL' }); assert(!r.ok && r.code === 'WEAVING_CITY', 'dunhuang refused');
  assert(S.weaving.RULES.ticks === 2, 'FULL_DAY');
  return ['晨 ok, 午 / 暮 blocked, only 于阗'];
});
test('LV-F1', '于阗织坊开工：会话记录 seed，引擎从 seed 重现同一局（理丝托盘顺序、定经初值、目标顺序）', () => {
  const d = atCity('khotan'); const v = wvFormal(d);
  const a = WE().createRun({ mode: 'formal', seed: v.seed }), b = WE().createRun({ mode: 'formal', seed: v.seed });
  assert(JSON.stringify([a.sort.tray, a.warp.values, a.weave.board.targets, a.weave.urgentRolled]) === JSON.stringify([b.sort.tray, b.warp.values, b.weave.board.targets, b.weave.urgentRolled]), 'reproducible');
  assert(a.mode === 'formal' && a.timeLeftMs === 75000, 'formal 75 s');
  return ['seed ' + v.seed];
});
test('LV-F2', '于阗织坊收工校验：工钱由主游戏按冻结档位重算（引擎 wagesFor）；非法状态 / 根数 / 轮数被拒绝', () => {
  const d = atCity('khotan'); const v = wvFormal(d);
  for (const [bad, code] of [[{ status: 'abandoned' }, 'WEAVING_STATUS'], [{ totalCompleted: 16 }, 'WEAVING_METRICS'], [{ totalCompleted: 7, roundsCompleted: 2, status: 'timeout' }, 'WEAVING_METRICS'], [{ totalCompleted: 14, roundsCompleted: 2, status: 'complete' }, 'WEAVING_METRICS'], [{ urgentSuccess: 'yes' }, 'WEAVING_METRICS']]) {
    const r = d.tryRun('WEAVING_FINISH', { sessionId: v.sessionId, outcome: wvOutcome(bad) }); assert(!r.ok && r.code === code, JSON.stringify(bad) + ' → ' + r.code);
  }
  const w = S.weaving.wages({ totalCompleted: 15, roundsCompleted: 3, urgentSuccess: true }); assert(w.base === 19 && w.regular === 3 && w.urgent === 1 && w.total === 23, 'max wage 23: ' + JSON.stringify(w));
  assert(S.weaving.wages({ totalCompleted: 7, roundsCompleted: 1, urgentSuccess: false }).total === 12, '7 lines → 11 + 1');
  assert(S.weaving.wages({ totalCompleted: 0, roundsCompleted: 0, urgentSuccess: false }).total === 9, '0 lines → 9');
  return ['5 invalid outcomes refused; 15/3/urgent → 23; 7/1 → 12; 0 → 9'];
});
test('LV-G1', '于阗织坊正式局（真实引擎对局到 15 根）：收工写入会话 → 结算付钱 + 2 时段落在暮 + journal；幂等', () => {
  const E = WE(); const d = atCity('khotan'); const v = wvFormal(d); const cash = d.p.cash, tick = d.p.world.tick;
  const run = E.createRun({ mode: 'formal', seed: v.seed, forceUrgent: false }); const ids = E.IDENTITIES.map(i => i.id);
  for (const id of ids) assert(E.sortDrop(run, id, id).ok, 'sort ' + id); for (let g = 0; g < 5; g++) E.warpSet(run, g, 0.5); assert(run.phase === 'WARP_DONE', 'warp done'); E.tick(run, 1500); assert(run.phase === 'WEAVE', 'weave');
  const route = (b, identity) => { const i = ids.indexOf(identity), j = b.targets.indexOf(identity), start = E.node(0, i), goal = E.node(4, j); const prev = new Map([[start, null]]), q = [start]; while (q.length) { const n = q.shift(); if (n === goal) break; const r = E.rowOf(n), c = E.colOf(n); for (const m of [r < 4 ? E.node(r + 1, c) : -1, c > 0 ? E.node(r, c - 1) : -1, c < 4 ? E.node(r, c + 1) : -1, r > 0 ? E.node(r - 1, c) : -1]) { if (m < 0 || prev.has(m)) continue; prev.set(m, n); q.push(m); } } const nodes = []; for (let n = goal; n !== null; n = prev.get(n)) nodes.unshift(n); return { nodes, slot: j }; };
  let guard = 0;
  while (run.phase !== 'SETTLED' && guard++ < 60) {
    if (run.phase === 'ROUND_TRANSITION') { E.tick(run, 800); continue; }
    if (run.weave.knot) E.knotUntie(run, run.weave.knot.node); if (run.weave.loose) E.looseRepair(run, run.weave.loose.from, run.weave.loose.to);
    const b = run.phase === 'URGENT' ? run.urgent.board : run.weave.board; const id = ids.find(x => !b.lit[x]); if (!id) { E.tick(run, 100); continue; }
    const rt = route(b, id); assert(E.weaveStart(run, id).ok, 'start ' + id); for (const n of rt.nodes) E.weaveExtend(run, n); E.weaveRelease(run, rt.slot);
  }
  assert(run.phase === 'SETTLED' && run.status === 'complete' && run.weave.totalCompleted === 15, 'engine run complete: ' + run.phase + ' ' + run.weave.totalCompleted);
  const o = { status: run.status, totalCompleted: run.weave.totalCompleted, roundsCompleted: run.weave.roundsCompleted, urgentSuccess: Boolean(run.weave.urgentSuccess) };
  const fin = d.run('WEAVING_FINISH', { sessionId: v.sessionId, outcome: o });
  assert(fin.phase === 'FINISHED' && fin.result.totalWage === run.wages.total && JSON.stringify(fin.result.wages) === JSON.stringify(run.wages), 'host wages = engine wages: ' + JSON.stringify(fin.result.wages));
  assert(d.p.cash === cash && d.p.world.tick === tick, 'finish pays nothing');
  const blocked = d.tryRun('market.enter'); assert(!blocked.ok && blocked.code === 'MINIGAME_ACTIVE', 'gated until settled');
  const st = d.run('WEAVING_SETTLE', { sessionId: v.sessionId, settlementId: fin.settlementId });
  assert(st.cashDelta === run.wages.total && st.ticks === 2 && d.p.world.tick % 3 === 2 && d.p.cash === cash + run.wages.total, 'settled: +' + run.wages.total + ', 暮');
  const j = d.p.journal.filter(r => r.type === 'weaving'); assert(j.length === 1 && j[0].amount === run.wages.total && j[0].totalCompleted === 15, 'journal');
  const again = d.run('WEAVING_SETTLE', { sessionId: v.sessionId, settlementId: fin.settlementId }); assert(again.alreadySettled && d.p.cash === cash + run.wages.total, 'idempotent');
  return ['15 lines, wages ' + JSON.stringify(run.wages) + ', tick ' + tick + ' → ' + d.p.world.tick];
});
test('LV-G2', '于阗织坊日影耗尽（部分完成）：按根数结算，仍是一日；继续留坊 = 先结算，暮时不能再开新局（试工仍可）', () => {
  const d = atCity('khotan'); const v = wvFormal(d); const cash = d.p.cash;
  const f = d.run('WEAVING_FINISH', { sessionId: v.sessionId, outcome: wvOutcome({ status: 'timeout', totalCompleted: 7, roundsCompleted: 1, urgentSuccess: true }) });
  assert(f.result.totalWage === 13 && f.result.wages.base === 11 && f.result.wages.regular === 1 && f.result.wages.urgent === 1, '7 lines + urgent → 13: ' + JSON.stringify(f.result.wages));
  d.run('WEAVING_SETTLE', { sessionId: v.sessionId, settlementId: f.settlementId }); assert(d.p.cash === cash + 13 && d.p.world.tick % 3 === 2, 'paid, dusk');
  const a = S.weaving.availability(d.p); assert(!a.canStartFormal && a.canTrial && !a.busy, '继续留坊 at dusk: no new formal run, trial ok');
  const r = d.tryRun('WEAVING_START', { mode: 'FORMAL' }); assert(!r.ok && r.code === 'WEAVING_NO_TIME', 'refused');
  return ['13 钱, 暮; stay → entry only'];
});
test('LV-H1', '于阗织坊主动离开：进行中中止 0 钱 0 时辰（唯一不结算的路径）；已收工不可中止；世界变化拒绝结算', () => {
  const d = atCity('khotan'); const v = wvFormal(d); const cash = d.p.cash, tick = d.p.world.tick;
  const ab = d.run('WEAVING_ABORT', { sessionId: v.sessionId }); assert(ab.phase === 'ABORTED' && d.p.cash === cash && d.p.world.tick === tick && !d.p.journal.some(r => r.type === 'weaving'), 'abandon free');
  assert(S.weaving.availability(d.p).canStartFormal, 'can start again');
  const v2 = wvFormal(d); const f = d.run('WEAVING_FINISH', { sessionId: v2.sessionId, outcome: wvOutcome() });
  const noAbort = d.tryRun('WEAVING_ABORT', { sessionId: v2.sessionId }); assert(!noAbort.ok && noAbort.code === 'WEAVING_FINISHED', 'finished cannot abort');
  d.p.world.city = 'dunhuang'; const moved = d.tryRun('WEAVING_SETTLE', { sessionId: v2.sessionId, settlementId: f.settlementId }); assert(!moved.ok && moved.code === 'WEAVING_WORLD_CHANGED', 'world changed refused');
  return ['abandon free; finished cannot abort; world change refused'];
});
test('LV-X1', '四种营生互斥：驼队装货 / 缀纹成章 / 于阗织坊 / 酒肆诗令进行中时其他营生不可开工，其他命令 MINIGAME_ACTIVE', () => {
  const d = atCity('dunhuang'); pcFormal(d);
  let r = d.tryRun('CARAVAN_START', { mode: 'FORMAL' }); assert(!r.ok && r.code === 'MINIGAME_ACTIVE', 'caravan blocked by pattern: ' + r.code);
  assert(!S.caravan.availability(d.p).canStartFormal && S.caravan.availability(d.p).otherWork, 'caravan availability sees other work');
  d.run('PATTERN_ABORT', { sessionId: d.p.work.pattern.id });
  d.run('CARAVAN_START', { mode: 'FORMAL' }); r = d.tryRun('PATTERN_START', { mode: 'FORMAL' }); assert(!r.ok && r.code === 'MINIGAME_ACTIVE', 'pattern blocked by caravan: ' + r.code);
  assert(S.patternChain.availability(d.p).otherWork && !S.patternChain.availability(d.p).canTrial, 'pattern availability sees caravan (no trial either)');
  d.run('CARAVAN_ABORT', { sessionId: d.p.work.caravan.id });
  const k = atCity('khotan'); wvFormal(k); r = k.tryRun('inn.wait', { ticks: 1 }); assert(!r.ok && r.code === 'MINIGAME_ACTIVE', 'inn.wait blocked by weaving: ' + r.code);
  r = k.tryRun('PATTERN_START', { mode: 'FORMAL' }); assert(!r.ok && r.code === 'MINIGAME_ACTIVE', 'pattern blocked by weaving');
  const ack = k.tryRun('result.ack', { resultId: 'none' }); void ack;   // safe UI commands are never gated by the minigame guard (they may fail for their own reasons)
  return ['pattern ↔ caravan ↔ weaving mutually exclusive'];
});
test('LV-X2', '存档校验：带营生会话的进度通过 core.validate；时间风险提示把 PATTERN_START 记 1 时段、WEAVING_START 记 2 时段', () => {
  const d = atCity('dunhuang'); pcFormal(d); S.core.validate({ meta: { ...S.core.versions, generation: 0, revision: 0 }, progress: d.p });
  assert(S.timeRisk.actionTicks(d.p, 'PATTERN_START', { mode: 'FORMAL' }) === 1, 'pattern 1 tick'); d.p.world.tick += 2; assert(S.timeRisk.actionTicks(d.p, 'PATTERN_START', { mode: 'FORMAL' }) === 0, 'pattern 0 at dusk');
  const k = atCity('khotan'); assert(S.timeRisk.actionTicks(k.p, 'WEAVING_START', { mode: 'FORMAL' }) === 2, 'weaving 2 ticks'); k.p.world.tick += 1; assert(S.timeRisk.actionTicks(k.p, 'WEAVING_START', { mode: 'FORMAL' }) === 0, 'weaving 0 at noon');
  return ['validate ok; time risk ticks 1 / 2'];
});

const passed = results.filter(r => r.pass).length;
for (const r of results) console.log((r.pass ? 'PASS ' : 'FAIL ') + r.id + ' ' + r.title + (r.pass ? '  ' + r.details.join('; ') : '\n  ' + r.details.join('\n  ')));
fs.mkdirSync(path.join(ROOT, 'tests', 'results'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'tests', 'results', 'livelihood-acceptance.json'), JSON.stringify({ generatedAt: new Date().toISOString(), root: process.env.SILK_ROOT || ROOT, legacy: process.env.SILK_LEGACY_RUNTIME === '1', passed, total: results.length, results }, null, 2));
console.log(`livelihood acceptance: ${passed}/${results.length}`);
process.exit(passed === results.length ? 0 : 1);
