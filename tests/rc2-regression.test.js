'use strict';
// Re-run of the RC2 review scenarios T1–T23 against the RC3 engine. Former [BUG CONFIRMED] outcomes must now PASS;
// scenarios that were already correct in RC2 must not regress.
const fs = require('fs');
const path = require('path');
const { load, driver } = require('./harness');
const ctx = load(); const S = ctx.Silk, D = ctx.SilkData;
const rows = [];
function t(id, title, rc2, fn) { try { const d = fn() || []; rows.push({ id, title, rc2, pass: true, details: d }); } catch (e) { rows.push({ id, title, rc2, pass: false, details: [String(e.stack || e)] }); } }
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); };
function jumpTo(d, city, routeIndex) { d.p.world.route = null; d.p.world.city = city; d.p.trip.routeIndex = routeIndex; d.p.trip.phase = 'in_city'; d.p.trip.routeHistory = ['changan', 'dunhuang', 'khotan', 'dunhuang', 'changan'].slice(0, routeIndex + 1); d.p.reputation.firstVisits = { dunhuang: true, khotan: true }; }
function startTrip(d) { d.run('trip.begin'); d.run('trip.depart', { acknowledgeSupplyWarning: true }); }

t('T1', '求货委托在交付城市现买现交', 'BUG', () => {
  let found = null;
  for (let seed = 1; seed < 300 && !found; seed++) { const d = driver(S, seed); d.p.reputation.value = 12; d.p.cash = 400; d.p.inventory.provisions = 20; d.quietCity(80); d.quietRoute(80); d.run('trip.begin'); const c = d.p.departureDraft.pool.find(x => x.type === 'wanted' && x.sourceStage === 0 && x.status !== 'unavailable' && S.inventory.unlocked(d.p, x.goodId)); if (c) found = { d, c }; }
  assert(found, 'a changan wanted commission exists'); const { d, c } = found;
  d.run('trip.draftSelect', { commissionId: c.commissionId, selected: true }); d.run('trip.depart', { acknowledgeSupplyWarning: true }); jumpTo(d, 'changan', 4); d.p.trip.arrivedChanganTick = d.p.world.tick; d.p.trip.phase = 'return_tasks'; d.p.trip.returnStatus = 'on_time';
  d.run('market.enter'); const v = d.p.market.visit; d.run('market.buy', { visitId: v.id, goodId: c.goodId, quantity: c.quantity }); d.ack();
  const r = d.tryRun('commission.deliver', { commissionId: c.commissionId }); assert(!r.ok && r.code === 'CANNOT_DELIVER', 'instant delivery now rejected: ' + r.code);
  d.run('market.leave', { visitId: v.id }); d.ack(); S.inventory.add(d.p, { goodId: c.goodId, quantity: c.quantity, acquisitionPrice: 20, acquisitionCity: 'dunhuang', hasLeftAcquisitionCity: true });
  const ok = d.tryRun('commission.deliver', { commissionId: c.commissionId }); assert(ok.ok, 'transported goods deliver: ' + ok.code);
  return ['fresh purchase rejected, transported goods accepted (' + c.templateId + ')'];
});
t('T2', '暮返长安晨交委托被排除在宽限外', 'BUG', () => {
  const d = driver(S, 11); d.p.reputation.value = 12; d.p.cash = 300; d.quietRoute(60); d.quietCity(60); startTrip(d); jumpTo(d, 'dunhuang', 3);
  d.p.commissions.active.push({ commissionId: 'c1', templateId: 'X', title: '求货 · 绢帛', text: 't', type: 'wanted', scale: 'good', goodId: '绢帛', quantity: 1, requiredSlots: 1, sourceCity: 'changan', pickupCity: null, procurementCity: null, deliveryCity: 'changan', pickupIndex: null, deliveryIndex: 4, segmentCount: 0, urgent: false, handoffPhase: 0, valuable: false, fragile: false, rare: false, longHaul: false, replaceable: true, rewardCash: 50, referencePrice: 24, rewardRate: .2, reputationReward: 2, status: 'accepted', urgentArrivalTick: null, urgentWindow: null, tripId: d.p.trip.id, deadlineTick: d.p.trip.deadlineTick, generatedTick: 0, acceptedTick: 0, sourceStage: 0 });
  S.inventory.add(d.p, { goodId: '绢帛', quantity: 1, acquisitionPrice: 24, acquisitionCity: 'dunhuang', hasLeftAcquisitionCity: true });
  while (S.time.phase(d.p) !== 0) { d.run('inn.wait', { ticks: 1 }); d.ack(); } d.run('trip.depart', { acknowledgeSupplyWarning: true }); d.p.world.route.remainingTicks = 8; d.journeyToArrival();
  assert(S.time.phase(d.p) === 2 && d.p.trip.graceIds.includes('c1'), 'frozen: ' + JSON.stringify(d.p.trip.graceIds)); d.overnight('stay'); const r = d.tryRun('commission.deliver', { commissionId: 'c1' }); assert(r.ok, 'deliverable next morning');
  return ['graceIds contains the 晨交 commission; delivered next morning'];
});
t('T3', '返程加急委托在去程敦煌被误判', 'BUG', () => {
  const d = driver(S, 5); d.p.reputation.value = 12; d.p.cash = 300; d.quietRoute(60); d.quietCity(60); startTrip(d);
  d.p.commissions.active.push({ commissionId: 'cu', templateId: 'X', title: '求货 · 药材(加急)', text: 't', type: 'wanted', scale: 'good', goodId: '药材', quantity: 1, requiredSlots: 1, sourceCity: 'dunhuang', pickupCity: null, procurementCity: null, deliveryCity: 'dunhuang', pickupIndex: null, deliveryIndex: 3, segmentCount: 0, urgent: true, handoffPhase: null, valuable: false, fragile: false, rare: false, longHaul: false, replaceable: true, rewardCash: 60, referencePrice: 15, rewardRate: .2, reputationReward: 2, status: 'accepted', urgentArrivalTick: null, urgentWindow: null, tripId: d.p.trip.id, deadlineTick: d.p.trip.deadlineTick, generatedTick: 0, acceptedTick: 0, sourceStage: 3 });
  d.journeyToArrival(); d.run('inn.wait', { ticks: 1 }); d.ack(); const c = d.p.commissions.active[0]; assert(c.status === 'accepted' && !c.urgentWindow, 'still active, no window at outbound stop');
  return ['outbound dunhuang: status accepted, window null'];
});
t('T4a', '加固纸样货损抛 MISSING_STORY_AUTHORITY', 'BUG', () => {
  const d = driver(S, 21); d.p.reputation.value = 12; d.p.reputation.firstVisits.dunhuang = true; d.p.cash = 100; d.quietCity(60); d.run('story.begin', { lineId: 'QY01', choiceId: 'reinforce' }); d.ack();
  const lot = d.p.inventory.lots.find(l => l.ownership === 'storyOwned'); const r = S.inventory.damage(structuredClone(d.p), lot.id, 'moisture', { quantity: 1 }); assert(r.storyProtected === true, 'protected instead of throwing');
  return ['first hit protected'];
});
t('T4b', '普通包扎受损后章节无法完成', 'BUG', () => {
  const d = driver(S, 22); d.p.reputation.value = 12; d.p.reputation.firstVisits.dunhuang = true; d.p.cash = 100; d.p.inventory.provisions = 20; d.quietRoute(60); d.quietCity(60); d.run('story.begin', { lineId: 'QY01', choiceId: 'normal' }); d.ack();
  const lot = d.p.inventory.lots.find(l => l.ownership === 'storyOwned'); S.inventory.damage(d.p, lot.id, 'moisture', { quantity: 1 }); startTrip(d); d.journeyToArrival(); const r = d.tryRun('story.act', { lineId: 'QY01', choiceId: 'continue' }); assert(r.ok && r.result.actualCash === 4, 'damaged chapter settles at 4: ' + (r.ok ? r.result.actualCash : r.code));
  return ['chapter completes with 4 钱'];
});
t('T4c', '加固纸样 + RM-05 MISSED 永久卡死', 'BUG', () => {
  const d = driver(S, 23); d.p.reputation.value = 12; d.p.reputation.firstVisits.dunhuang = true; d.p.cash = 200; d.p.inventory.provisions = 20; d.quietCity(60); d.run('story.begin', { lineId: 'QY01', choiceId: 'reinforce' }); d.ack(); startTrip(d);
  const open = S.events.open(d.p, 'RM-05', { kind: 'route', tags: [], routeId: d.p.world.route.id }); d.run('RM_START', { moduleId: 'RM-05', eventSessionId: open.eventSessionId }); const s = d.p.work.routeGame; d.run('RM_STEP', { sessionId: s.id, sequence: 1, elapsedMs: 9000 });
  const r = d.tryRun('EVENT_RM_RESOLVE', { eventSessionId: open.eventSessionId, rmSessionId: s.id }); assert(r.ok, 'resolves: ' + r.code); d.ack(); assert(d.tryRun('trip.journey').ok, 'journey continues');
  return ['event settled, journey continues'];
});
t('T5', '同城隔夜刷商誉', 'BUG', () => {
  const d = driver(S, 3); d.quietCity(60); d.run('market.enter'); let v = d.p.market.visit; const price = S.pricing.quote(d.p, 'changan', '绢帛'); d.run('market.buy', { visitId: v.id, goodId: '绢帛', quantity: Math.min(6, Math.floor(d.p.cash / price)) }); d.ack(); d.run('market.leave', { visitId: v.id }); d.ack(); d.overnight('restOutside');
  assert(d.p.reputation.value === 0, 'rep after one night: ' + d.p.reputation.value); d.run('market.enter'); v = d.p.market.visit; d.run('market.sellAll', { visitId: v.id }); d.ack(); assert(d.p.reputation.value === 0 && d.p.reputation.turnover === 0, 'rep after resale: ' + d.p.reputation.value);
  return ['reputation stays 0 (was 11 in RC2)'];
});
t('T6', '小游戏跳过零代价', 'BUG', () => {
  const d = driver(S, 9); d.p.cash = 200; d.p.inventory.provisions = 20; d.quietCity(60); startTrip(d); S.inventory.add(d.p, { goodId: '纸张', quantity: 3, acquisitionPrice: 10 });
  const open = S.events.open(d.p, 'RM-05', { kind: 'route', tags: [], routeId: d.p.world.route.id }); d.run('RM_START', { moduleId: 'RM-05', eventSessionId: open.eventSessionId }); d.run('RM_SKIP', { sessionId: d.p.work.routeGame.id }); const r = d.run('EVENT_RM_RESOLVE', { eventSessionId: open.eventSessionId, rmSessionId: d.p.work.routeGame.id });
  assert(r.settledAs === 'MISSED' && r.effects.some(e => e.type === 'cargo_damage' || e.type === 'story_protection'), 'skip → MISSED cargo damage: ' + JSON.stringify(r.effects));
  return ['skip settled as MISSED with ' + r.effects.map(e => e.type).join(',')];
});
t('T7', '客舍夜间事件不可达', 'BUG', () => {
  let opened = 0; for (let seed = 1; seed <= 60; seed++) { const d = driver(S, seed); d.p.cash = 200; d.toDusk(); d.resolveEvent(); d.ack(); d.p.events.cityRollDays = {}; d.p.events.pendingCityRoll = null; d.p.events.mainDays = {}; const r = d.run('inn.stay'); if (r.kind === 'eventOpened') opened++; }
  assert(opened > 0, 'inn stays can open events now: ' + opened); return ['events opened on ' + opened + '/60 seeded stays'];
});
t('T8', 'trip.begin 提前启动商期', 'BUG', () => {
  const d = driver(S, 2); d.p.reputation.value = 6; d.quietCity(60); d.run('trip.begin'); for (let i = 0; i < 3; i++) d.overnight('restOutside'); const desc = S.time.describe(d.p); assert(d.p.trip === null && desc.tripLabel === '未启程' && S.merchant.eligibility(d.p).unstarted, 'no trip: ' + desc.tripLabel); return ['3 nights after 确认出发: still 未启程, draft kept'];
});
t('T15', '商号日结（工钱/租金/成交）', 'OK', () => {
  const d = driver(S, 31); d.p.cash = 3000; d.p.reputation.value = 25; d.quietCity(120); d.p.tripHistory.push({ id: 'trip-a', status: 'completed', onTimeReturn: true, startedAt: 0, arrivedAt: 60, summary: null }, { id: 'trip-b', status: 'completed', onTimeReturn: true, startedAt: 70, arrivedAt: 130, summary: null });
  for (const [part, amount] of [['premises', 180], ['fixtures', 70], ['workingCapital', 50]]) { d.run('merchant.fund', { part, amount }); d.ack(); } d.overnight('restOutside'); d.overnight('restOutside'); assert(d.p.merchant.status === 'open', 'opened');
  d.run('market.enter'); const v = d.p.market.visit; d.run('market.buy', { visitId: v.id, goodId: '纸张', quantity: 3 }); d.ack(); d.run('market.leave', { visitId: v.id }); d.ack(); const lot = d.p.inventory.lots[0], cab = d.p.merchant.cabinets[0]; d.run('merchant.stock', { cabinetId: cab.cabinetId, lotId: lot.id, quantity: 3 }); d.ack(); d.run('merchant.saleRule', { cabinetId: cab.cabinetId, mode: 'fixedPrice', value: 1 }); d.ack(); d.run('merchant.hire', { staffId: 'manager_repeat' }); d.ack();
  for (let i = 0; i < 35; i++) d.overnight('restOutside'); const led = d.p.merchant.ledger; assert(led.some(x => x.type === 'sale') && led.some(x => x.type === 'payroll'), 'sales + payroll happened'); return ['sales ' + led.filter(x => x.type === 'sale').length + ', payroll ' + led.filter(x => x.type === 'payroll').length];
});
t('T16', '贷款逾期 + 1钱飞钱', 'BUG', () => {
  const d = driver(S, 41); d.p.cash = 100; d.quietCity(60); d.run('finance.borrow', { amount: 200 }); d.ack(); for (let i = 0; i < 31; i++) d.overnight('restOutside'); const snap = S.finance.snapshot(d.p); assert(snap.loans[0].status === 'overdue' && !snap.borrowingAllowed, 'overdue');
  const r = d.tryRun('finance.issueVoucher', { amount: 1, source: 'cash', destinationCity: 'dunhuang' }); assert(!r.ok && r.code === 'VOUCHER_TOO_SMALL', '1钱 rejected'); return ['loan overdue path intact; 1钱 voucher rejected'];
});
t('T19', '委托池可满足性（草稿）', 'OK', () => {
  let bad = 0; for (const rep of [5, 10, 20, 40]) for (const all of [false, true]) for (let seed = 1; seed <= 30; seed++) { const d = driver(S, seed * 31 + rep); d.p.reputation.value = rep; d.p.cash = 500; if (all) for (const g of ['染料', '漆器', '于阗玉', '精制玉器']) d.p.merchant.suppliers[g] = { stage: 'established', discountRate: 0, sourceCity: S.merchant.suppliers[g].city }; const r = d.tryRun('trip.begin'); if (!r.ok) bad++; }
  assert(bad === 0, 'failures ' + bad); return ['240 drafts generated, 0 unsatisfiable'];
});
t('T20', '跨城承接', 'BUG', () => {
  const d = driver(S, 12); d.p.reputation.value = 25; d.p.cash = 500; d.quietCity(60); for (const g of ['染料', '漆器', '于阗玉']) d.p.merchant.suppliers[g] = { stage: 'established', discountRate: 0, sourceCity: S.merchant.suppliers[g].city }; d.run('trip.begin');
  const far = d.p.departureDraft.pool.find(c => c.sourceCity !== 'changan'); assert(far, 'far candidate'); const r = d.tryRun('commission.accept', { commissionId: far.commissionId }); assert(!r.ok && r.code === 'COMMISSION_WRONG_STOP', 'rejected: ' + r.code); return ['敦煌/于阗 posting cannot be taken in 长安'];
});
t('T21', '异地商品可在任意城市购买（设计保留）', 'OK', () => { const d = driver(S, 13); d.p.cash = 500; d.run('market.enter'); const r = d.tryRun('market.buy', { visitId: d.p.market.visit.id, goodId: '毛毡鞋', quantity: 1 }); assert(r.ok, 'still allowed'); return ['12 goods purchasable everywhere (unchanged by design)']; });
t('T22', '市场内购报耗时', 'BUG', () => { const d = driver(S, 14); d.p.cash = 100; d.quietCity(60); d.run('market.enter'); const v = d.p.market.visit; d.run('newspaper.purchase', { visitId: v.id }); const t0 = d.p.world.tick; d.run('market.leave', { visitId: v.id }); assert(d.p.world.tick === t0 && S.timeRisk.actionTicks(d.p, 'newspaper.purchase', { visitId: v.id }) === 0, '0 tick'); return ['0 tick, time-risk consistent']; });
t('T23', '逾期扣分曲线', 'OK', () => {
  const d = driver(S, 15); d.p.cash = 300; d.p.inventory.provisions = 30; d.p.reputation.value = 10; d.quietCity(120); d.quietRoute(120); startTrip(d); d.journeyToArrival(); const reps = []; for (let i = 0; i < 26; i++) { d.overnight('camp'); reps.push(d.p.reputation.value); }
  const rc2Curve = '11,11,11,11,11,11,11,11,11,11,11,11,11,11,11,11,11,11,11,9,8,8,7,7,6,6'; // recorded on v0.3.0-competition-rc2 with the same seed/steps
  assert(d.p.trip.overduePenaltyLevel === 5 && d.p.trip.overdueActualPenalty === -5 && reps.join(',') === rc2Curve, 'penalty schedule: ' + reps.join(',')); return ['rep by day: ' + reps.join(',')];
});
t('STATIC', '数据静态校验', 'OK', () => {
  const all = [...D.events.mainEvents, ...D.events.conditionalEvents]; for (const e of all) for (const c of e.choices) { S.events.choiceAllowed({ inventory: { provisions: 5, lots: [] }, cash: 100, reputation: { value: 50 } }, c.condition); for (const o of c.outcomes) S.events.preflight(o.effects, e.eventId, { kind: e.scene === 'route' ? 'route' : 'city', lodgingContext: 'inn' }); }
  for (const t of D.commissions.templates) S.commissions.templateFields(t);
  const src = ['events.js', 'stories.js', 'commissions.js', 'trip.js', 'inn.js', 'market.js', 'inventory.js', 'model.js'].map(f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n');
  assert(!src.includes('MISSING_STORY_AUTHORITY') && !src.includes('cityEventProbability:25'), 'no reachable authority-gap placeholders in patched modules');
  return ['events/choices/formulas preflight ok', 'templates parse', 'no MISSING_STORY_AUTHORITY / city stub left'];
});
const passed = rows.filter(r => r.pass).length;
const lines = ['# RC2 review scenarios re-run on RC3 (T1–T23)', '', '| ID | RC2 result | RC3 result | Title | Details |', '|---|---|---|---|---|', ...rows.map(r => '| ' + r.id + ' | ' + (r.rc2 === 'BUG' ? 'BUG CONFIRMED' : 'PASS') + ' | ' + (r.pass ? 'PASS' : 'FAIL') + ' | ' + r.title + ' | ' + r.details.map(x => String(x).replace(/\|/g, '/').replace(/\n/g, ' ')).join('<br>') + ' |'), '', 'Total: ' + passed + '/' + rows.length + ' PASS'];
fs.mkdirSync(path.join(__dirname, 'results'), { recursive: true }); fs.writeFileSync(path.join(__dirname, 'results', 'rc2-regression.md'), lines.join('\n'));
for (const r of rows) console.log((r.pass ? 'PASS ' : 'FAIL ') + r.id + ' ' + r.title + (r.pass ? '' : '\n    ' + r.details.join('\n    ')));
console.log('RC2 regression: ' + passed + '/' + rows.length); process.exitCode = passed === rows.length ? 0 : 1;
