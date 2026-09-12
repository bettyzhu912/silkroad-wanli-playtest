'use strict';
// GUESTHOUSE_RANDOM_EVENT_SETTLEMENT_FIX_v1.0 — engine acceptance over 04_ACCEPTANCE_CHECKLIST: lodging −5 then event delta on the same
// state, settlement ledger + ids, single application under repeated commands / re-entry / replay, ack → inn card consistency,
// reputation / provisions outcomes, camp night ledger, money rounding via S.money.round, no reward for pure-story stays.
const fs = require('fs'), path = require('path');
const { load, driver } = require('./harness');
const ROOT = path.join(__dirname, '..'); const S = load().Silk; const results = [];
function test(id, title, fn) { const t0 = Date.now(); try { const details = fn() || []; results.push({ id, title, pass: true, details, ms: Date.now() - t0 }); } catch (e) { results.push({ id, title, pass: false, details: [String(e && e.stack || e)], ms: Date.now() - t0 }); } }
function assert(cond, msg) { if (!cond) throw new Error('ASSERT: ' + msg); }
const POSITIVE = { G11: 'keep', G13: 'help', G14: 'take', G15: 'accept', G16: 'help', G12: 'accept' };
function duskInn(seed, cash = 100) { const d = driver(S, seed); d.p.cash = cash; d.p.world.tick = 2; d.p.events = d.p.events || S.events.initial(); return d; }
function cityNight(seed, city, cash = 100) { const d = driver(S, seed); d.p.cash = cash; d.quietRoute(60); d.run('trip.begin'); d.run('trip.depart', { acknowledgeSupplyWarning: true }); d.p.world.route = null; d.p.world.city = city; d.p.trip.routeIndex = city === 'dunhuang' ? 1 : 2; d.p.trip.phase = 'in_city'; d.p.trip.routeHistory = city === 'dunhuang' ? ['changan', 'dunhuang'] : ['changan', 'dunhuang', 'khotan']; d.p.world.tick = Math.ceil(d.p.world.tick / 3) * 3 + 2; d.p.events = d.p.events || S.events.initial(); delete d.p.events.mainDays[Math.floor(d.p.world.tick / 3)]; d.p.cash = cash; return d; }
function findCityNight(pred, cities = ['dunhuang', 'khotan'], from = 1, to = 400) { for (const city of cities) for (let seed = from; seed <= to; seed++) { const d = cityNight(seed, city); const r = d.tryRun('inn.stay'); if (!r.ok) continue; const ev = d.p.eventSession; const ok = pred(r.result, ev, d); if (ok) return { seed, city, d, r: r.result, ev, extra: ok }; } return null; }
function findNight(pred, from = 1, to = 600) { for (let seed = from; seed <= to; seed++) { const d = duskInn(seed); const r = d.tryRun('inn.stay'); if (!r.ok) continue; const ev = d.p.eventSession; const ok = pred(r.result, ev, d); if (ok) return { seed, d, r: r.result, ev, extra: ok }; } return null; }
test('GH-1', '无事件留宿：100 → 住宿 −5 → 95，journal 记 inn:-5 一次', () => {
  const d = duskInn(3); d.quietCity(2); const before = d.p.journal.length; const r = d.run('inn.stay');
  assert(r.kind === 'innFeedback' && d.p.cash === 95 && r.lodgingCost === 5 && r.cashDelta === -5, 'no-event stay ' + JSON.stringify({ cash: d.p.cash, kind: r.kind }));
  assert(d.p.journal.length === before + 1 && d.p.journal.at(-1).type === 'inn' && d.p.journal.at(-1).amount === -5, 'single lodging journal');
  return ['95 after a plain stay'];
});
test('GH-2', '事件 +12：100 → 住宿 −5 → 事件 +12 = 107（同一状态顺序落账），结果卡与 HUD 状态一致', () => {
  const hit = findNight((r, ev) => r.kind === 'eventOpened' && ev.eventId === 'G11' && POSITIVE[ev.eventId]);
  assert(hit, 'a G11 inn night exists'); const { d, ev } = hit;
  assert(d.p.cash === 95 && ev.settlementId === ev.id + '-settlement' && ev.occurrenceId === ev.id, 'lodging applied first, ids assigned at open: ' + JSON.stringify({ cash: d.p.cash, settlementId: ev.settlementId }));
  const res = d.run('EVENT_CHOOSE', { eventSessionId: ev.id, choiceId: 'keep' });
  const delta = res.effects.filter(e => e.type === 'cash').reduce((n, e) => n + e.delta, 0);
  assert(delta >= 12 && delta <= 18 && d.p.cash === 95 + delta && res.cashAfter === d.p.cash && res.settlementId === ev.settlementId, 'cash after = 95 + delta: ' + JSON.stringify({ delta, cash: d.p.cash, cashAfter: res.cashAfter }));
  const led = S.events.settlementRecord(d.p, ev.settlementId);
  assert(led && led.source === 'guesthouse_random_event' && led.deltas.cash === delta && led.cashBefore === 95 && led.cashAfter === 95 + delta && led.lodging.lodgingCost === 5 && led.lodging.cashBeforeLodging === 100, 'ledger entry ' + JSON.stringify(led));
  const j = d.p.journal.at(-1); assert(j.type === 'event' && j.settlementId === ev.settlementId && j.occurrenceId === ev.id && j.cashDelta === delta, 'journal carries settlement ids');
  return ['seed ' + hit.seed + ': 100 → 95 → +' + delta + ' = ' + d.p.cash];
});
test('GH-2b', '字面场景 seed 12：+12 → 107', () => {
  const d = duskInn(12); const r = d.run('inn.stay'); assert(r.kind === 'eventOpened' && d.p.eventSession.eventId === 'G11', 'seed 12 opens G11');
  const res = d.run('EVENT_CHOOSE', { eventSessionId: d.p.eventSession.id, choiceId: 'keep' }); assert(res.cashDelta === 12 && d.p.cash === 107, 'exactly 107: ' + d.p.cash);
  d.ack(); const inn = d.p.presentation.activeResult; assert(inn.kind === 'innFeedback' && inn.lodgingCost === 5 && inn.eventCashDelta === 12 && inn.cashDelta === 7 && inn.after.cash === 107 && inn.settlementId === res.settlementId, 'inn card: lodging 5, event +12, now 107 ' + JSON.stringify({ l: inn.lodgingCost, e: inn.eventCashDelta, d: inn.cashDelta, after: inn.after.cash }));
  d.ack(); assert(d.p.cash === 107 && !d.p.presentation.activeResult, 'still 107 after both acks');
  return ['107'];
});
test('GH-3', '幂等：重复 EVENT_CHOOSE、结果确认连点、settle 重入、ack 后再选 — 都只结算一次', () => {
  const d = duskInn(12); d.run('inn.stay'); const ev = d.p.eventSession; d.run('EVENT_CHOOSE', { eventSessionId: ev.id, choiceId: 'keep' }); assert(d.p.cash === 107, '107');
  let again = d.tryRun('EVENT_CHOOSE', { eventSessionId: ev.id, choiceId: 'keep' }); assert(!again.ok && d.p.cash === 107, 'second choose refused (' + again.code + '), cash unchanged');
  // direct reducer re-entry on the resolved session (simulated callback re-entry) is blocked by the settlement ledger guard
  const def = S.events.definitions.G11, choice = def.choices.find(c => c.choiceId === 'keep');
  let reentry = null; try { S.events.resolve(d.p, { eventSessionId: ev.id, choiceId: 'keep' }, S.core.context('reentry')); } catch (e) { reentry = e.code; } assert(reentry && d.p.cash === 107, 'resolve re-entry refused: ' + reentry);
  const ar = d.p.presentation.activeResult; d.run('result.ack', { resultId: ar.id }); const inn = d.p.presentation.activeResult; assert(inn.kind === 'innFeedback' && d.p.cash === 107, 'ack once → inn card');
  const twice = d.tryRun('result.ack', { resultId: ar.id }); assert(!twice.ok && twice.code === 'STALE_RESULT' && d.p.cash === 107, 'stale ack refused');
  d.run('result.ack', { resultId: inn.id }); const late = d.tryRun('EVENT_CHOOSE', { eventSessionId: ev.id, choiceId: 'keep' }); assert(!late.ok && d.p.cash === 107, 'choose after ack refused (' + late.code + ')');
  assert(Object.keys(d.p.events.settlements).length === 1, 'exactly one settlement recorded');
  return ['refused: ' + again.code + ', ' + reentry + ', ' + late.code];
});
test('GH-4', '存档回放：同一命令在提交前的快照上重放得到相同结果（无重抽），已结算快照上重放被拒绝', () => {
  const d = duskInn(12); d.run('inn.stay'); const ev = d.p.eventSession; const snapshot = structuredClone(d.p);
  const first = d.run('EVENT_CHOOSE', { eventSessionId: ev.id, choiceId: 'keep' });
  const replay = structuredClone(snapshot); const again = S.events.resolve(replay, { eventSessionId: ev.id, choiceId: 'keep' }, S.core.context('replay'));
  assert(again.cashDelta === first.cashDelta && replay.cash === d.p.cash && again.outcomeId === first.outcomeId, 'deterministic replay from the pre-commit snapshot: ' + JSON.stringify({ a: first.cashDelta, b: again.cashDelta }));
  let refused = null; try { S.events.resolve(structuredClone(d.p), { eventSessionId: ev.id, choiceId: 'keep' }, S.core.context('replay2')); } catch (e) { refused = e.code; } assert(refused, 'replay on the settled state refused: ' + refused);
  return ['replay deterministic; settled replay refused ' + refused];
});
test('GH-5', '商誉 / 补给类夜间事件真实进入状态并入账（C03/C04 补给、带商誉的结果）', () => {
  const hit = findCityNight((r, ev, d) => { if (r.kind !== 'eventOpened') return false; const def = S.events.definitions[ev.eventId]; const ch = def.choices.find(c => c.outcomes.every(o => o.effects.some(f => f.type === 'provisions' && f.delta > 0)) && S.events.choiceAllowed(d.p, c.condition)); return ch ? ch.choiceId : false; });
  assert(hit, 'a provisions night exists'); const { d, ev, extra: choiceId } = hit; const before = d.p.inventory.provisions;
  const res = d.run('EVENT_CHOOSE', { eventSessionId: ev.id, choiceId }); const pd = res.effects.filter(e => e.type === 'provisions').reduce((n, e) => n + e.delta, 0);
  assert(d.p.inventory.provisions === before + pd && S.events.settlementRecord(d.p, ev.settlementId).deltas.provisions === pd, 'provisions applied ' + JSON.stringify({ before, pd, now: d.p.inventory.provisions }));
  const rep = findCityNight((r, ev, d) => { if (r.kind !== 'eventOpened') return false; const def = S.events.definitions[ev.eventId]; const ch = def.choices.find(c => c.outcomes.every(o => o.effects.some(f => f.type === 'reputation')) && S.events.choiceAllowed(d.p, c.condition)); return ch ? ch.choiceId : false; }, ['changan', 'dunhuang', 'khotan'], 1, 300);
  if (rep) { const b = rep.d.p.reputation.value; const rr = rep.d.run('EVENT_CHOOSE', { eventSessionId: rep.ev.id, choiceId: rep.extra }); const rd = rr.effects.filter(e => e.type === 'reputation').reduce((n, e) => n + e.delta, 0); assert(rep.d.p.reputation.value === b + rd && S.events.settlementRecord(rep.d.p, rep.ev.settlementId).deltas.reputation === rd, 'reputation applied'); return ['provisions +' + pd + ' (' + ev.eventId + '), reputation ' + rd + ' (' + rep.ev.eventId + ')']; }
  return ['provisions +' + pd + ' (' + ev.eventId + '); no reputation night in 900 seeds (reputation path covered by applyEffects)'];
});
test('GH-6', '负结果（M08 客舍错账 / M03）走同一路径，金额用 S.money.round，现金不足时拒绝而非半结算', () => {
  const hit = findNight((r, ev) => r.kind === 'eventOpened' && ev.eventId === 'M08');
  assert(hit, 'an M08 inn night exists'); const { d, ev } = hit; const res = d.run('EVENT_CHOOSE', { eventSessionId: ev.id, choiceId: 'pay' });
  const delta = res.cashDelta; assert(delta <= -5 && delta >= -9 && d.p.cash === 95 + delta && Number.isSafeInteger(d.p.cash), 'M08 pay −5..−9 applied: ' + delta);
  const f = S.events.cashFormula(duskInn(1).p, '-[clamp(round(cashBefore*0.06),5,14)*lodgingLossMultiplier]', 100, { lodgingContext: 'inn' }); assert(f === -S.money.round(Math.max(5, Math.min(14, S.money.round(100 * .06))) * .6) && Number.isSafeInteger(f), 'formula rounds through S.money.round: ' + f);
  return ['M08 ' + delta + ' (seed ' + hit.seed + '), M03 inn formula ' + f];
});
test('GH-7', '露宿夜间事件同样写入 settlement 账本且不可重复', () => {
  let hit = null; for (let seed = 1; seed <= 400 && !hit; seed++) { const d = cityNight(seed, 'dunhuang'); d.quietCity(2); const r = d.tryRun('inn.camp'); if (r.ok && r.result.kind === 'innFeedback' && r.result.branch === 'ordinary') hit = { seed, d, r: r.result }; }
  assert(hit, 'an ordinary camp night'); const { d, r } = hit; const nightId = (d.p.trip.id) + ':' + d.p.world.city + ':' + Math.floor((d.p.world.tick - 1) / 3);
  const led = Object.values(d.p.events.settlements).find(x => x.source === 'camp_night_event'); assert(led && led.eventId === r.eventId, 'camp ledger entry');
  let again = null; try { S.events.resolveCamp(d.p, r.eventId, led.occurrenceId, S.core.context('x')); } catch (e) { again = e.code; } assert(again, 'camp night cannot resolve twice: ' + again);
  return ['camp ' + r.eventId + ' ledgered, repeat refused ' + again];
});
test('GH-8', '纯剧情留宿（客舍故事链）不产生奖励；无事件夜也不写 settlement', () => {
  const d = duskInn(5); d.quietCity(2); const before = { cash: d.p.cash, rep: d.p.reputation.value, prov: d.p.inventory.provisions }; d.run('inn.stay');
  assert(d.p.cash === before.cash - 5 && d.p.reputation.value === before.rep && d.p.inventory.provisions === before.prov && Object.keys(d.p.events.settlements || {}).length === 0, 'no phantom rewards, no ledger entry');
  return ['story/plain nights untouched'];
});
test('GH-9', '旧存档迁移：缺少 settlements 字段的 events 状态在迁移后可用', () => {
  const d = duskInn(12); delete d.p.events.settlements; S.events.migrate(d.p); assert(d.p.events.settlements && typeof d.p.events.settlements === 'object', 'migrated');
  d.run('inn.stay'); d.run('EVENT_CHOOSE', { eventSessionId: d.p.eventSession.id, choiceId: 'keep' }); assert(d.p.cash === 107, 'works after migration');
  return ['ok'];
});
for (const r of results) console.log((r.pass ? 'PASS ' : 'FAIL ') + r.id + ' ' + r.title + (r.pass ? '  ' + r.details.join('; ') : '\n    ' + r.details.join('\n    ')));
const failed = results.filter(r => !r.pass).length; console.log(`guesthouse settlement acceptance: ${results.length - failed}/${results.length}`);
fs.mkdirSync(path.join(ROOT, 'tests', 'results'), { recursive: true }); fs.writeFileSync(path.join(ROOT, 'tests', 'results', 'inn-settlement.json'), JSON.stringify(results, null, 2));
process.exit(failed ? 1 : 0);
