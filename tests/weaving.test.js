'use strict';
// 于阗织坊 FINAL v1.0 — engine acceptance (05_QA/ACCEPTANCE_AND_REGRESSION.md sections A, E (rules), G (run-level roll), H, I).
const { load, driver } = require('./harness');
const ctx = load();
const S = ctx.Silk;
const results = [];
function test(id, title, fn) { const t0 = Date.now(); try { const details = fn() || []; results.push({ id, title, pass: true, details, ms: Date.now() - t0 }); } catch (e) { results.push({ id, title, pass: false, details: [String(e && e.stack || e)], ms: Date.now() - t0 }); } }
function assert(cond, msg) { if (!cond) throw new Error('ASSERT: ' + msg); }
function atKhotanMorning(seed = 11) {
  const d = driver(S, seed); d.p.cash = 200; d.quietRoute(60); d.quietCity(60);
  d.run('trip.begin'); d.run('trip.depart', { acknowledgeSupplyWarning: true });
  d.p.world.route = null; d.p.world.city = 'khotan'; d.p.trip.routeIndex = 2; d.p.trip.phase = 'in_city'; d.p.trip.routeHistory = ['changan', 'dunhuang', 'khotan'];
  d.p.world.tick = Math.ceil(d.p.world.tick / 3) * 3 + 3; // next 晨
  return d;
}
const stats = over => ({ reason: 'DAY_END', correct: 0, unresolved: 0, wrongEndpoint: false, idleClean: false, looseRecovered: false, urgentTriggered: false, urgentSuccess: false, ...over });
function formal(d) { const v = d.run('WEAVE_START', { mode: 'FORMAL' }); assert(v.kind === 'WEAVING_SESSION' && v.phase === 'PLAYING', 'formal run created'); return v; }

test('WV-A1', '入口：于阗晨间可开工；午/暮"今日余时不足"；试工不需登记', () => {
  const d = atKhotanMorning();
  let a = S.weaving.availability(d.p); assert(a.canStartFormal && a.canTrial && a.remainingTicks === 2, 'morning available');
  d.p.world.tick += 1; a = S.weaving.availability(d.p); assert(!a.canStartFormal && a.canTrial && !a.enoughTime && a.noTimeText === '今日余时不足，改日再来。', 'noon: formal blocked, trial ok');
  const r = d.tryRun('WEAVE_START', { mode: 'FORMAL' }); assert(!r.ok && r.code === 'WEAVING_NO_TIME', 'engine refuses formal at noon: ' + r.code);
  d.p.world.tick += 1; assert(!S.weaving.availability(d.p).canStartFormal, 'dusk blocked');
  const t = d.tryRun('WEAVE_START', { mode: 'TRIAL' }); assert(!t.ok && t.code === 'WEAVING_MODE', 'trial is UI-only');
  return ['noon/dusk blocked, trial available'];
});
test('WV-A2', '入口：仅于阗可开工；其他城市/途中拒绝', () => {
  const d = driver(S, 12); d.quietRoute(60); d.quietCity(60);
  const r = d.tryRun('WEAVE_START', { mode: 'FORMAL' }); assert(!r.ok && r.code === 'WEAVING_CITY', 'changan refused ' + r.code);
});
test('WV-G1', '急束：run 建立时只 Roll 一次并保存；每局固定；样本落在 20% 附近', () => {
  let hits = 0, n = 400;
  for (let seed = 1; seed <= n; seed++) { const d = atKhotanMorning(seed); const v = formal(d); if (v.rushPlanned) hits++; assert(d.p.work.weaving.rushPlanned === v.rushPlanned, 'stored'); }
  const rate = hits / n; assert(rate > .12 && rate < .30, 'rush rate ' + rate);
  return ['rush rate over ' + n + ' runs: ' + rate.toFixed(3)];
});
test('WV-G2', '急束：同一 run 内不可重抽；放弃后新 run 才重新建立', () => {
  const d = atKhotanMorning(21); const v1 = formal(d); const v2 = S.weaving.view(d.p); assert(v1.rushPlanned === v2.rushPlanned && v1.sessionId === v2.sessionId, 'view stable');
  const again = d.tryRun('WEAVE_START', { mode: 'FORMAL' }); assert(!again.ok && again.code === 'WORK_ACTIVE', 'no second run while playing');
  d.run('WEAVE_ABORT', { sessionId: v1.sessionId }); assert(d.p.work.weaving.phase === 'ABORTED' && d.p.cash === 200, 'abort: 0钱');
  const v3 = formal(d); assert(v3.sessionId !== v1.sessionId, 'new run id');
});
test('WV-E1', '线结规则：0 交叉 0%，1 交叉 20%，2+ 交叉 35%；共用丝环不算交叉', () => {
  assert(S.weaving.knotProbability(0) === 0 && S.weaving.knotProbability(1) === .2 && S.weaving.knotProbability(2) === .35 && S.weaving.knotProbability(5) === .35, 'probabilities');
  const a = [{ x: 0, y: 0, type: 'start' }, { x: 100, y: 100, type: 'target' }], b = [{ x: 100, y: 0, type: 'start' }, { x: 0, y: 100, type: 'target' }];
  assert(S.weaving.crossings(a, [b]).length === 1, 'X crossing detected');
  const shared = { x: 50, y: 50, type: 'node' };
  const a2 = [{ x: 0, y: 0, type: 'start' }, shared, { x: 100, y: 100, type: 'target' }], b2 = [{ x: 100, y: 0, type: 'start' }, shared, { x: 0, y: 100, type: 'target' }];
  assert(S.weaving.crossings(a2, [b2]).length === 0, 'meeting at a shared ring is not a crossing');
  const par = [{ x: 0, y: 10, type: 'start' }, { x: 100, y: 10, type: 'target' }];
  assert(S.weaving.crossings(a, [par]).length === 1 && S.weaving.crossings(par, [[{ x: 0, y: 40 }, { x: 100, y: 40 }]]).length === 0, 'parallel lines never cross');
});
test('WV-H1', '工钱档：0–2=9，3–5=11，6–8=15，9–12=19；记名 +1 上限 +3；急束 +1 在上限外；最高 23', () => {
  const w = c => S.weaving.wage(stats({ correct: c }));
  assert([0, 1, 2].every(c => w(c).baseWage === 9) && [3, 4, 5].every(c => w(c).baseWage === 11) && [6, 7, 8].every(c => w(c).baseWage === 15) && [9, 10, 11, 12].every(c => w(c).baseWage === 19), 'tiers');
  const all = S.weaving.wage(stats({ correct: 12, wrongEndpoint: false, idleClean: true, looseRecovered: true, urgentTriggered: true, urgentSuccess: true }));
  assert(all.tags.length === 5 && all.craftBonus === 3 && all.urgentBonus === 1 && all.totalWage === 23, 'max 23: ' + JSON.stringify(all));
  const noRush = S.weaving.wage(stats({ correct: 12, idleClean: true, looseRecovered: true })); assert(noRush.totalWage === 22 && noRush.tags.length === 5, 'regular max 22');
  const two = S.weaving.wage(stats({ correct: 7, wrongEndpoint: true, idleClean: true, unresolved: 2 })); assert(two.tags.join() === '机声未歇' && two.totalWage === 16, 'partial tags ' + JSON.stringify(two));
  const low = S.weaving.wage(stats({ correct: 0, wrongEndpoint: true, unresolved: 1 })); assert(low.totalWage === 9 && low.tags.length === 0, '0 根仍 9 钱');
});
test('WV-I1', '收工→结算：结果创建即保存；离开织坊发钱一次 +2 Tick 至暮；重复结算不再发钱', () => {
  const d = atKhotanMorning(31); const v = formal(d); const cash0 = d.p.cash, tick0 = d.p.world.tick;
  d.run('WEAVE_FINISH', { sessionId: v.sessionId, stats: stats({ correct: 10, idleClean: true, urgentTriggered: v.rushPlanned, urgentSuccess: v.rushPlanned }) });
  const s = d.p.work.weaving; assert(s.result && s.phase === 'FINISHED' && !s.settled && s.result.totalWage === 19 + 3 + (v.rushPlanned ? 1 : 0) && s.result.tags.join() === '引线有方,丝缕不乱,机声未歇', 'result saved: ' + JSON.stringify(s.result));
  assert(d.p.cash === cash0 && d.p.world.tick === tick0, 'no money/time before leaving');
  const blocked = d.tryRun('inn.wait', { ticks: 1 }); assert(!blocked.ok && blocked.code === 'MINIGAME_ACTIVE', 'other commands blocked while result pending');
  const bad = d.tryRun('WEAVE_SETTLE', { sessionId: v.sessionId, settlementId: 'wrong' }); assert(!bad.ok && bad.code === 'WEAVING_SETTLEMENT', 'settlement id checked');
  const out = d.run('WEAVE_SETTLE', { sessionId: v.sessionId, settlementId: s.settlementId });
  assert(out.kind === 'weavingSettled' && out.cashDelta === s.result.totalWage && out.ticks === 2, 'settled once: ' + JSON.stringify(out));
  assert(d.p.cash === cash0 + s.result.totalWage && d.p.world.tick === tick0 + 2 && S.time.phase(d.p) === 2, '+2 Tick lands on 暮');
  const twice = d.run('WEAVE_SETTLE', { sessionId: v.sessionId, settlementId: s.settlementId }); assert(twice.alreadySettled === true && twice.ticks === 0 && d.p.cash === cash0 + s.result.totalWage && d.p.world.tick === tick0 + 2, 'second settle is a no-op');
  assert(d.p.journal.filter(j => j.type === 'weaving').length === 1, 'one journal entry');
  const snap = S.inn.snapshot(d.p); assert(snap.canStay || snap.canCamp, 'lodging available at 暮');
  return ['wage ' + s.result.totalWage + ', tags ' + s.result.tags.join('/')];
});
test('WV-I2', '结算前世界改变则拒绝；放弃后不能结算；未收工不能结算', () => {
  const d = atKhotanMorning(41); const v = formal(d);
  const early = d.tryRun('WEAVE_SETTLE', { sessionId: v.sessionId, settlementId: v.settlementId }); assert(!early.ok && early.code === 'WEAVING_UNFINISHED', 'unfinished');
  d.run('WEAVE_FINISH', { sessionId: v.sessionId, stats: stats({ correct: 3 }) });
  const s = d.p.work.weaving; d.p.world.tick += 1;
  const changed = d.tryRun('WEAVE_SETTLE', { sessionId: v.sessionId, settlementId: s.settlementId }); assert(!changed.ok && changed.code === 'WEAVING_WORLD_CHANGED', 'world changed refused');
  d.p.world.tick -= 1;
  const ab = d.tryRun('WEAVE_ABORT', { sessionId: v.sessionId }); assert(!ab.ok && ab.code === 'WEAVING_FINISHED', 'no abort after result');
});
test('WV-I3', '主动放弃：0 钱 0 Tick，回到可再次开工状态；未满12根只能日影尽收工', () => {
  const d = atKhotanMorning(51); const v = formal(d); const cash0 = d.p.cash, tick0 = d.p.world.tick;
  const wrong = d.tryRun('WEAVE_FINISH', { sessionId: v.sessionId, stats: stats({ correct: 5, reason: 'ALL_CLEAN' }) }); assert(!wrong.ok && wrong.code === 'WEAVING_REASON', 'early finish below 12 refused');
  const rushLie = d.tryRun('WEAVE_FINISH', { sessionId: v.sessionId, stats: stats({ correct: 5, urgentTriggered: !v.rushPlanned }) }); if (!v.rushPlanned) assert(!rushLie.ok && rushLie.code === 'WEAVING_RUSH', 'rush claim without plan refused');
  d.run('WEAVE_ABORT', { sessionId: v.sessionId }); assert(d.p.cash === cash0 && d.p.world.tick === tick0 && !S.weaving.isActive(d.p), 'abort 0/0');
  assert(S.weaving.availability(d.p).canStartFormal, 'can start again');
});
test('WV-D1', '难度与模板：首局 简→简→普；后续分布 30/55/15；相邻两局不同组合', () => {
  const d = atKhotanMorning(61); const v1 = formal(d); assert(v1.firstFormal && v1.difficultyPlan.join() === 'simple,simple,normal', 'first plan');
  d.run('WEAVE_ABORT', { sessionId: v1.sessionId });
  const counts = { 'simple,simple,normal': 0, 'simple,normal,normal': 0, 'simple,normal,hard': 0 }; let prev = v1.routePlan; let same = 0;
  for (let i = 0; i < 300; i++) { const v = formal(d); counts[v.difficultyPlan.join()]++; if (JSON.stringify(v.routePlan) === JSON.stringify(prev)) same++; prev = v.routePlan; d.run('WEAVE_ABORT', { sessionId: v.sessionId }); }
  assert(same === 0, 'adjacent runs never share the full combination');
  assert(counts['simple,simple,normal'] > 60 && counts['simple,normal,normal'] > 130 && counts['simple,normal,hard'] > 20, 'distribution ' + JSON.stringify(counts));
  for (const [count, list] of Object.entries(S.weaving.TEMPLATES)) for (const order of list) assert(order.length === Number(count) && new Set(order).size === Number(count), 'template is a permutation');
  return [JSON.stringify(counts)];
});
test('WV-S1', '存档：进行中局重载视为放弃（恢复命令）；已收工结果重载后仍在', () => {
  const d = atKhotanMorning(71); const v = formal(d);
  const env = JSON.parse(JSON.stringify(d.envelope())); S.core.validate(env);
  const p2 = S.core.upgradeEnvelope(env).state.progress; assert(p2.work.weaving.phase === 'PLAYING', 'reload keeps the record; app.js boot then issues WEAVE_ABORT');
  d.run('WEAVE_FINISH', { sessionId: v.sessionId, stats: stats({ correct: 12, reason: 'ALL_CLEAN', idleClean: true }) });
  const env2 = JSON.parse(JSON.stringify(d.envelope())); const p3 = S.core.upgradeEnvelope(env2).state.progress; assert(p3.work.weaving.result && !p3.work.weaving.settled, 'result survives reload');
});
test('WV-T1', '时间提醒：正式帮工登记为 2 时段（仅于阗晨间）', () => {
  const d = atKhotanMorning(81); assert(S.timeRisk.actionTicks(d.p, 'WEAVE_START', { mode: 'FORMAL' }) === 2, 'morning 2 ticks'); d.p.world.tick++; assert(S.timeRisk.actionTicks(d.p, 'WEAVE_START', { mode: 'FORMAL' }) === 0, 'noon 0');
});
const passed = results.filter(r => r.pass).length;
for (const r of results) console.log((r.pass ? 'PASS ' : 'FAIL ') + r.id + ' ' + r.title + (r.details.length ? '  ' + r.details.join(' | ') : ''));
console.log('weaving engine: ' + passed + '/' + results.length);
require('fs').mkdirSync(require('path').join(__dirname, 'results'), { recursive: true });
require('fs').writeFileSync(require('path').join(__dirname, 'results', 'weaving-engine.json'), JSON.stringify(results, null, 1));
process.exit(passed === results.length ? 0 : 1);
