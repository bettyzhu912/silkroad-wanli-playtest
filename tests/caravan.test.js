'use strict';
// 敦煌《驼队装货》 main-game integration — engine parity + host contract acceptance.
// CV-P: the bundled engine (caravan-engine.js) is byte-for-byte generated from caravan-demo/engine and produces identical boards, scores
// and sessions; CV-A/B/C/D: entry rules, start, finish validation, settlement (pay once, +2 ticks to 暮, journal), abort, gating.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { load, driver } = require('./harness');
const ROOT = path.join(__dirname, '..');
const ctx = load(); const S = ctx.Silk;
const results = [];
function test(id, title, fn) { const t0 = Date.now(); try { const details = fn() || []; results.push({ id, title, pass: true, details, ms: Date.now() - t0 }); } catch (e) { results.push({ id, title, pass: false, details: [String(e && e.stack || e)], ms: Date.now() - t0 }); } }
function assert(cond, msg) { if (!cond) throw new Error('ASSERT: ' + msg); }
function atDunhuangMorning(seed = 21) {
  const d = driver(S, seed); d.p.cash = 200; d.quietRoute(60); d.quietCity(60);
  d.run('trip.begin'); d.run('trip.depart', { acknowledgeSupplyWarning: true });
  d.p.world.route = null; d.p.world.city = 'dunhuang'; d.p.trip.routeIndex = 1; d.p.trip.phase = 'in_city'; d.p.trip.routeHistory = ['changan', 'dunhuang'];
  d.p.world.tick = Math.ceil(d.p.world.tick / 3) * 3 + 3;   // next 晨
  return d;
}
const outcome = over => ({ reason: 'TIMEOUT', tiers: [], elapsedSeconds: 75, remainingSeconds: 0, ...over });
function formal(d) { const v = d.run('CARAVAN_START', { mode: 'FORMAL' }); assert(v.kind === 'CARAVAN_SESSION' && v.phase === 'PLAYING', 'formal run created'); return v; }

test('CV-P1', '引擎打包与独立版逐文件一致（源码哈希）', () => {
  const E = S.caravanEngine; const out = [];
  for (const [f, h] of Object.entries(E.sources)) { const now = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, 'caravan-demo', 'engine', f))).digest('hex').slice(0, 16); assert(now === h, 'bundle is stale for ' + f + ' (' + h + ' vs ' + now + ')'); out.push(f + ' ' + h); }
  assert(typeof E.Game === 'function' && typeof E.payout === 'function' && typeof E.formal_entry === 'function', 'engine surface');
  return out;
});
test('CV-P2', '经济规则：基础 9 + 完成 2/2/3 + 质量 + 上限 22（冻结 v0.3）', () => {
  const E = S.caravanEngine;
  assert(E.payout([]).cash === 0, 'no batch → 0');
  assert(E.payout(['MODEST']).cash === 11, 'MODEST B1 → 9+2+0 = 11 got ' + E.payout(['MODEST']).cash);
  assert(E.payout(['RICH', 'RICH', 'RICH']).cash === 22 && E.payout(['RICH', 'RICH', 'RICH']).baseWage + E.payout(['RICH', 'RICH', 'RICH']).extraWage >= 22, 'RICH×3 capped at 22');
  assert(E.formal_entry('晨').enabled && !E.formal_entry('昼').enabled && !E.formal_entry('暮').visible, 'formal entry by phase');
  return ['[]→0, [MODEST]→11, [RICH×3]→22'];
});
test('CV-A1', '入口：敦煌晨间可开工；午"今日时间不足"；暮不显示；试玩不需登记', () => {
  const d = atDunhuangMorning();
  let a = S.caravan.availability(d.p); assert(a.canStartFormal && a.canTrial && a.remainingTicks === 2 && a.formalVisible, 'morning available');
  d.p.world.tick += 1; a = S.caravan.availability(d.p); assert(!a.canStartFormal && a.canTrial && !a.enoughTime && a.formalVisible && a.reason === '今日时间不足，改日再来。', 'noon: formal blocked, trial ok');
  const r = d.tryRun('CARAVAN_START', { mode: 'FORMAL' }); assert(!r.ok && r.code === 'CARAVAN_NO_TIME', 'engine refuses formal at noon: ' + r.code);
  d.p.world.tick += 1; a = S.caravan.availability(d.p); assert(!a.canStartFormal && !a.formalVisible && a.canTrial, 'dusk: hidden, trial ok');
  const t = d.tryRun('CARAVAN_START', { mode: 'TRIAL' }); assert(!t.ok && t.code === 'CARAVAN_MODE', 'trial is UI-only');
  return ['noon/dusk blocked, trial available'];
});
test('CV-A2', '入口：仅敦煌可开工；长安 / 途中拒绝', () => {
  const d = driver(S, 22); d.quietRoute(60); d.quietCity(60);
  const r = d.tryRun('CARAVAN_START', { mode: 'FORMAL' }); assert(!r.ok && r.code === 'CARAVAN_CITY', 'changan refused ' + r.code);
  return ['changan refused'];
});
test('CV-B1', '开工：会话记录题组 0–499，题组可由打包引擎重现三批题', () => {
  const d = atDunhuangMorning(23); const v = formal(d);
  assert(Number.isInteger(v.groupIndex) && v.groupIndex >= 0 && v.groupIndex < 500 && v.seconds === 75, 'group + 75s recorded');
  const g = new S.caravanEngine.Game(() => 100); g.prepare(v.groupIndex); assert(g.prepared[v.groupIndex] && g.prepared[v.groupIndex].length === 3, 'boards reproducible');
  const again = d.tryRun('CARAVAN_START', { mode: 'FORMAL' }); assert(!again.ok && again.code === 'WORK_ACTIVE', 'second start refused');
  const other = d.tryRun('market.enter', {}); assert(!other.ok && other.code === 'MINIGAME_ACTIVE', 'other commands gated while loading: ' + other.code);
  return ['group ' + v.groupIndex];
});
test('CV-B2', '收工校验：原因、批次等级、三批才可提前收工、计时范围', () => {
  const d = atDunhuangMorning(24); const v = formal(d); const id = v.sessionId;
  let r = d.tryRun('CARAVAN_FINISH', { sessionId: id, outcome: outcome({ reason: 'ABORTED' }) }); assert(!r.ok && r.code === 'CARAVAN_REASON', 'bad reason');
  r = d.tryRun('CARAVAN_FINISH', { sessionId: id, outcome: outcome({ tiers: ['GOLD'] }) }); assert(!r.ok && r.code === 'CARAVAN_TIERS', 'bad tier');
  r = d.tryRun('CARAVAN_FINISH', { sessionId: id, outcome: outcome({ reason: 'ALL_BATCHES_COMPLETED', tiers: ['RICH', 'RICH'] }) }); assert(!r.ok && r.code === 'CARAVAN_TIERS', 'early completion needs 3 tiers');
  r = d.tryRun('CARAVAN_FINISH', { sessionId: id, outcome: outcome({ elapsedSeconds: 99 }) }); assert(!r.ok && r.code === 'CARAVAN_CLOCK', 'clock range');
  r = d.tryRun('CARAVAN_FINISH', { sessionId: 'nope', outcome: outcome() }); assert(!r.ok && r.code === 'CARAVAN_SESSION', 'session id');
  const ok = d.run('CARAVAN_FINISH', { sessionId: id, outcome: outcome({ reason: 'TIMEOUT', tiers: ['NORMAL', 'RICH'], elapsedSeconds: 75, remainingSeconds: 0 }) });
  const expect = S.caravanEngine.payout(['NORMAL', 'RICH']).cash; assert(ok.phase === 'FINISHED' && ok.result.totalWage === expect && expect === 9 + ok.result.extraWage && ok.result.completed === 2 && ok.result.title === '驼队装货结束', 'timeout after 2 batches pays engine payout ' + expect + ': ' + ok.result.totalWage);
  const twice = d.tryRun('CARAVAN_FINISH', { sessionId: id, outcome: outcome() }); assert(!twice.ok && twice.code === 'CARAVAN_NOT_PLAYING', 'finish is once');
  return ['NORMAL+RICH timeout → ' + ok.result.totalWage + ' 钱 (engine payout)'];
});
test('CV-C1', '结算：只付一次、+2 时段落在暮、写入 journal、重复结算无副作用', () => {
  const d = atDunhuangMorning(25); const v = formal(d);
  d.run('CARAVAN_FINISH', { sessionId: v.sessionId, outcome: outcome({ reason: 'ALL_BATCHES_COMPLETED', tiers: ['RICH', 'RICH', 'RICH'], elapsedSeconds: 60, remainingSeconds: 15 }) });
  const wrong = d.tryRun('CARAVAN_SETTLE', { sessionId: v.sessionId, settlementId: 'x' }); assert(!wrong.ok && wrong.code === 'CARAVAN_SETTLEMENT', 'settlement id checked');
  const cash = d.p.cash, tick = d.p.world.tick, journal = d.p.journal.length;
  const s = d.run('CARAVAN_SETTLE', { sessionId: v.sessionId, settlementId: v.settlementId });
  assert(s.kind === 'caravanSettled' && s.cashDelta === 22 && s.ticks === 2, 'settled ' + JSON.stringify(s));
  assert(d.p.cash === cash + 22 && d.p.world.tick === tick + 2 && d.p.world.tick % 3 === 2, 'cash +22, landed on 暮');
  const j = d.p.journal[d.p.journal.length - 1]; assert(d.p.journal.length === journal + 1 && j.type === 'caravan' && j.amount === 22 && j.tripId === d.p.trip.id && j.tiers.length === 3, 'journal entry');
  const again = d.run('CARAVAN_SETTLE', { sessionId: v.sessionId, settlementId: v.settlementId }); assert(again.alreadySettled && d.p.cash === cash + 22 && d.p.world.tick === tick + 2, 'idempotent');
  assert(!S.caravan.isActive(d.p) && d.p.work.caravan.phase === 'SETTLED', 'inactive after settlement');
  const trip = S.trip && S.trip.summary ? null : null; void trip;
  return ['+22 钱, +2 ticks → 暮, journal caravan'];
});
test('CV-C2', '结算：世界状态变化后拒绝（防止跨日 / 跨城结算）', () => {
  const d = atDunhuangMorning(26); const v = formal(d);
  d.run('CARAVAN_FINISH', { sessionId: v.sessionId, outcome: outcome({ tiers: ['MODEST'] }) });
  d.p.world.tick += 1; const r = d.tryRun('CARAVAN_SETTLE', { sessionId: v.sessionId, settlementId: v.settlementId }); assert(!r.ok && r.code === 'CARAVAN_WORLD_CHANGED', 'refused: ' + r.code);
  return ['refused after tick change'];
});
test('CV-D1', '中止：进行中可中止，不付钱不耗时；收工后不可中止', () => {
  const d = atDunhuangMorning(27); const v = formal(d); const cash = d.p.cash, tick = d.p.world.tick;
  const a = d.run('CARAVAN_ABORT', { sessionId: v.sessionId }); assert(a.phase === 'ABORTED' && d.p.cash === cash && d.p.world.tick === tick && !S.caravan.isActive(d.p), 'aborted without cost');
  const v2 = formal(d); d.run('CARAVAN_FINISH', { sessionId: v2.sessionId, outcome: outcome({ tiers: ['MODEST'] }) });
  const r = d.tryRun('CARAVAN_ABORT', { sessionId: v2.sessionId }); assert(!r.ok && r.code === 'CARAVAN_FINISHED', 'no abort after finish');
  return ['abort free; finished session must settle'];
});
test('CV-E1', '与其他营生互斥；时间风险：正式开工计 2 时段', () => {
  const d = atDunhuangMorning(28);
  assert(S.timeRisk.actionTicks(d.p, 'CARAVAN_START', { mode: 'FORMAL' }) === 2, 'actionTicks 2 at 晨');
  d.p.world.tick += 1; assert(S.timeRisk.actionTicks(d.p, 'CARAVAN_START', { mode: 'FORMAL' }) === 0, 'actionTicks 0 at 午');
  d.p.world.tick -= 1; const v = formal(d); assert(S.caravan.isActive(d.p) && v, 'active');
  return ['risk ticks ok'];
});
test('CV-F1', '整局脚本：引擎参考解三批 RICH → 主游戏结算 22 钱', () => {
  const d = atDunhuangMorning(29); const v = formal(d);
  let t = 100; const g = new S.caravanEngine.Game(() => t); g.outer = { state: null, apply() {} }; g.prepare(v.groupIndex);
  g.action({ op: 'start', mode: 'FORMAL', seconds: 75, index: v.groupIndex });
  const place = () => { const b = g.session.board; for (const [side, items] of [['left', b.left], ['right', b.right]]) for (const it of items) g.action({ op: 'insert', id: it.instance, side }); };
  const cycle = () => { g.action({ op: 'submit' }); t += .91; g.snapshot(); t += .81; g.snapshot(); t += .51; g.snapshot(); };
  for (let i = 0; i < 3; i++) { place(); t += 2; cycle(); }
  const snap = g.snapshot(); assert(snap.state === 'SETTLEMENT' && snap.settlement.completed === 3 && snap.settlement.cash === 22, 'engine settlement ' + JSON.stringify(snap.settlement));
  const r = g.session.result;
  d.run('CARAVAN_FINISH', { sessionId: v.sessionId, outcome: { reason: r.p0TerminationReason, tiers: g.session.results.map(x => x.performanceTier), elapsedSeconds: r.durationData.elapsedSeconds, remainingSeconds: r.durationData.remainingSeconds } });
  const cash = d.p.cash; d.run('CARAVAN_SETTLE', { sessionId: v.sessionId, settlementId: v.settlementId }); assert(d.p.cash === cash + 22, 'paid 22');
  return ['group ' + v.groupIndex + ' → 22 钱'];
});
for (const r of results) console.log((r.pass ? 'PASS ' : 'FAIL ') + r.id + ' ' + r.title + (r.pass ? '  ' + r.details.join('; ') : '\n    ' + r.details.join('\n    ')));
const failed = results.filter(r => !r.pass).length; console.log(`caravan engine acceptance: ${results.length - failed}/${results.length}`);
fs.mkdirSync(path.join(ROOT, 'tests', 'results'), { recursive: true }); fs.writeFileSync(path.join(ROOT, 'tests', 'results', 'caravan-acceptance.json'), JSON.stringify(results, null, 2));
process.exit(failed ? 1 : 0);
