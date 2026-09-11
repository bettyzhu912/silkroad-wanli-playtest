'use strict';
// Competition RC3 directed acceptance tests RC3-T01..RC3-T20 (04_YUERONG_COMPETITION_RC3_LOGIC_PATCH §16).
const fs = require('fs');
const path = require('path');
const { load, driver } = require('./harness');
const ctx = load();
const S = ctx.Silk, D = ctx.SilkData;
const results = [];
function test(id, bug, title, fn) {
  const t0 = Date.now();
  try { const details = fn() || []; results.push({ id, bug, title, pass: true, details, ms: Date.now() - t0 }); }
  catch (e) { results.push({ id, bug, title, pass: false, details: [String(e && e.stack || e)], ms: Date.now() - t0 }); }
}
function assert(cond, msg) { if (!cond) throw new Error('ASSERT: ' + msg); }
const cityIdx = { changan: 0, dunhuang: 1, khotan: 2 };
// Teleport a started trip to a later stop without spending real travel (used only to set up scenarios).
function jumpTo(d, city, routeIndex) { d.p.world.route = null; d.p.world.city = city; d.p.trip.routeIndex = routeIndex; d.p.trip.phase = 'in_city'; d.p.trip.routeHistory = ['changan', 'dunhuang', 'khotan', 'dunhuang', 'changan'].slice(0, routeIndex + 1); d.p.reputation.firstVisits = { dunhuang: true, khotan: true }; }
function startTrip(d) { d.run('trip.begin'); d.run('trip.depart', { acknowledgeSupplyWarning: true }); }
function fakeCommission(d, over) {
  const trip = d.p.trip;
  return { commissionId: 'commission-fake-' + Math.random().toString(36).slice(2, 8), templateId: 'FAKE', title: '求货 · 测试', text: 't', type: 'wanted', scale: 'good', goodId: '绢帛', quantity: 1, requiredSlots: 1, sourceCity: 'changan', pickupCity: null, procurementCity: null, deliveryCity: 'changan', pickupIndex: null, deliveryIndex: 4, segmentCount: 0, urgent: false, handoffPhase: null, valuable: false, fragile: false, rare: false, longHaul: false, replaceable: true, rewardCash: 50, referencePrice: 24, rewardRate: .2, reputationReward: 2, status: 'accepted', urgentArrivalTick: null, urgentWindow: null, tripId: trip.id, deadlineTick: trip.deadlineTick, generatedTick: d.p.world.tick, acceptedTick: d.p.world.tick, sourceStage: 0, ...over };
}
function addLot(d, goodId, quantity, acquisitionCity, extra = {}) { return S.inventory.add(d.p, { goodId, quantity, acquisitionPrice: 20, acquisitionCity, hasLeftAcquisitionCity: acquisitionCity !== d.p.world.city, ...extra }); }
function arriveChanganAtDusk(d) { // from dunhuang stop 3, depart at 晨 with 8 ticks so arrival lands on 暮
  while (S.time.phase(d.p) !== 0) { d.run('inn.wait', { ticks: 1 }); d.ack(); }
  d.run('trip.depart', { acknowledgeSupplyWarning: true }); d.p.world.route.remainingTicks = 8; d.journeyToArrival();
  assert(d.p.world.city === 'changan' && S.time.phase(d.p) === 2, 'should arrive at 长安 at 暮, got ' + d.p.world.city + ' phase ' + S.time.phase(d.p));
}
function reload(d) { // JSON round trip + full validation + upgrade path (no-op when current)
  const env = JSON.parse(JSON.stringify(d.envelope())); S.core.validate(env); const up = S.core.upgradeEnvelope(env); assert(up.changed === false, 'current save must not change on reload'); d.p = up.state.progress; return d.p;
}

// ---------------------------------------------------------------- RC3-T01 / T02
test('RC3-T01', 'BUG-01', '暮返长安时晨交／午交且货物齐备的委托进入冻结名单，次日晨／午／暮均可交', () => {
  const d = driver(S, 101); d.p.reputation.value = 12; d.p.cash = 300; d.quietRoute(60); d.quietCity(60);
  startTrip(d); jumpTo(d, 'dunhuang', 3);
  const morning = fakeCommission(d, { commissionId: 'c-morning', handoffPhase: 0 }), noon = fakeCommission(d, { commissionId: 'c-noon', handoffPhase: 1 }), dusk = fakeCommission(d, { commissionId: 'c-dusk', handoffPhase: 0 });
  d.p.commissions.active.push(morning, noon, dusk);
  addLot(d, '绢帛', 3, 'dunhuang');
  arriveChanganAtDusk(d);
  const ids = d.p.trip.graceIds;
  assert(ids.includes('c-morning') && ids.includes('c-noon') && ids.includes('c-dusk'), 'all three frozen: ' + JSON.stringify(ids));
  assert(d.p.trip.phase === 'returned_at_dusk_pending_rest', 'must rest first');
  const atDusk = d.tryRun('commission.deliver', { commissionId: 'c-morning' }); assert(!atDusk.ok, 'dusk arrival must rest before delivering');
  d.overnight('stay');
  assert(S.time.phase(d.p) === 0 && d.p.trip.phase === 'return_tasks', 'next morning');
  const r1 = d.tryRun('commission.deliver', { commissionId: 'c-morning' }); assert(r1.ok, '晨 delivery of 晨交: ' + r1.code + ' ' + r1.message); d.ack();
  d.run('inn.wait', { ticks: 1 }); d.ack(); assert(S.time.phase(d.p) === 1, 'now 午');
  const r2 = d.tryRun('commission.deliver', { commissionId: 'c-noon' }); assert(r2.ok, '午 delivery of 午交: ' + r2.code); d.ack();
  d.run('inn.wait', { ticks: 1 }); d.ack(); assert(S.time.phase(d.p) === 2, 'now 暮');
  const r3 = d.tryRun('commission.deliver', { commissionId: 'c-dusk' }); assert(r3.ok, '暮 delivery of 晨交 commission inside grace: ' + r3.code); d.ack();
  return ['graceIds=' + JSON.stringify(ids), 'deliveries 晨/午/暮 all OK', 'returnStatus=' + d.p.trip.returnStatus];
});
test('RC3-T02', 'BUG-01', '抵达时无货、错城、错站或已逾期的委托不进入冻结名单；宽限期不能新增资格', () => {
  const d = driver(S, 102); d.p.reputation.value = 12; d.p.cash = 300; d.quietRoute(60); d.quietCity(60);
  startTrip(d); jumpTo(d, 'dunhuang', 3);
  const noCargo = fakeCommission(d, { commissionId: 'c-nocargo', goodId: '纸张' });
  const wrongCity = fakeCommission(d, { commissionId: 'c-wrongcity', deliveryCity: 'dunhuang', deliveryIndex: 3 });
  const wrongStop = fakeCommission(d, { commissionId: 'c-wrongstop', deliveryIndex: 0 });
  const overdue = fakeCommission(d, { commissionId: 'c-overdue', deadlineTick: d.p.world.tick + 2 });
  const good = fakeCommission(d, { commissionId: 'c-good', handoffPhase: 0 });
  d.p.commissions.active.push(noCargo, wrongCity, wrongStop, overdue, good);
  addLot(d, '绢帛', 5, 'dunhuang');
  arriveChanganAtDusk(d);
  const ids = d.p.trip.graceIds;
  assert(ids.length === 1 && ids[0] === 'c-good', 'only the eligible one frozen: ' + JSON.stringify(ids));
  assert(d.p.commissions.active.find(c => c.commissionId === 'c-overdue').status === 'failed', 'overdue one already expired');
  // grace period cannot add new eligibility
  const late = fakeCommission(d, { commissionId: 'c-late' }); late.status = 'accepted'; d.p.commissions.active.push(late);
  d.overnight('stay');
  assert(S.commissions.eligibleDelivery(d.p, late, S.core.context('t')) === false, 'late commission not deliverable in grace');
  assert(S.commissions.eligibleDelivery(d.p, d.p.commissions.active.find(c => c.commissionId === 'c-good'), S.core.context('t')) === true, 'frozen one deliverable');
  return ['graceIds=' + JSON.stringify(ids), 'late commission excluded'];
});
// ---------------------------------------------------------------- RC3-T03 / T04
test('RC3-T03', 'BUG-02', '返程敦煌 deliveryIndex=3 加急委托经过敦煌去程 index=1 时不开窗、不失败、不可交', () => {
  const d = driver(S, 103); d.p.reputation.value = 12; d.p.cash = 300; d.quietRoute(60); d.quietCity(60);
  startTrip(d);
  const c = fakeCommission(d, { commissionId: 'c-urgent3', goodId: '药材', quantity: 1, sourceCity: 'dunhuang', deliveryCity: 'dunhuang', deliveryIndex: 3, urgent: true, sourceStage: 3 });
  d.p.commissions.active.push(c); addLot(d, '药材', 2, 'changan');
  d.journeyToArrival(); assert(d.p.world.city === 'dunhuang' && d.p.trip.routeIndex === 1, 'outbound dunhuang');
  const a = d.p.commissions.active.find(x => x.commissionId === 'c-urgent3');
  assert(a.urgentWindow === null && a.urgentArrivalTick === null, 'no window at outbound stop');
  assert(S.commissions.eligibleDelivery(d.p, a, S.core.context('t')) === false, 'not deliverable at index 1');
  d.run('inn.wait', { ticks: 1 }); d.ack(); d.overnight('camp');
  assert(a.status === 'accepted' || d.p.commissions.active.find(x => x.commissionId === 'c-urgent3').status === 'accepted', 'still active after time passed at wrong stop');
  d.run('trip.depart', { acknowledgeSupplyWarning: true }); d.journeyToArrival(); assert(d.p.world.city === 'khotan', 'khotan');
  d.run('trip.depart', { acknowledgeSupplyWarning: true }); d.journeyToArrival(); assert(d.p.world.city === 'dunhuang' && d.p.trip.routeIndex === 3, 'return dunhuang');
  const b = d.p.commissions.active.find(x => x.commissionId === 'c-urgent3');
  assert(b.urgentWindow && b.urgentWindow.routeIndex === 3, 'window opened at the correct stop: ' + JSON.stringify(b.urgentWindow));
  const r = d.tryRun('commission.deliver', { commissionId: 'c-urgent3' }); assert(r.ok, 'deliver at correct stop: ' + r.code);
  return ['no window at index 1', 'window at index 3 phase ' + b.urgentWindow.arrivalPhase + ' deadline ' + b.urgentWindow.deadlineTick, 'delivered'];
});
test('RC3-T04', 'BUG-02', '暮抵加急可当暮或次晨交；次晨推进到午后失败；重载不多送一天', () => {
  const build = () => { const d = driver(S, 104); d.p.reputation.value = 12; d.p.cash = 300; d.quietRoute(60); d.quietCity(60); startTrip(d); jumpTo(d, 'khotan', 2); d.p.commissions.active.push(fakeCommission(d, { commissionId: 'c-u', goodId: '药材', sourceCity: 'dunhuang', deliveryCity: 'dunhuang', deliveryIndex: 3, urgent: true, sourceStage: 3 })); addLot(d, '药材', 2, 'changan'); while (S.time.phase(d.p) !== 0) { d.run('inn.wait', { ticks: 1 }); d.ack(); } d.run('trip.depart', { acknowledgeSupplyWarning: true }); d.p.world.route.remainingTicks = 11; d.journeyToArrival(); assert(d.p.world.city === 'dunhuang' && S.time.phase(d.p) === 2, 'arrive dunhuang at 暮'); return d; };
  const d1 = build(); const w = d1.p.commissions.active[0].urgentWindow; assert(w && w.arrivalPhase === 2 && w.deadlineTick === (Math.floor(w.arrivalTick / 3) + 1) * 3, 'dusk window carries to next morning: ' + JSON.stringify(w));
  const r1 = d1.tryRun('commission.deliver', { commissionId: 'c-u' }); assert(r1.ok, 'deliver at dusk: ' + r1.code);
  const d2 = build(); d2.overnight('camp'); assert(S.time.phase(d2.p) === 0, 'morning');
  reload(d2); const c2 = d2.p.commissions.active[0]; assert(c2.status === 'accepted' && c2.urgentWindow.deadlineTick === w.deadlineTick, 'window unchanged after reload');
  const r2 = d2.tryRun('commission.deliver', { commissionId: 'c-u' }); assert(r2.ok, 'deliver next morning: ' + r2.code);
  const d3 = build(); d3.overnight('camp'); d3.run('inn.wait', { ticks: 1 }); d3.ack();
  const c3 = d3.p.commissions.active[0]; assert(c3.status === 'failed' && c3.failureReason === 'urgent_window_missed', 'expired after 晨→午: ' + c3.status + ' ' + c3.failureReason);
  return ['dusk deliver OK', 'next-morning deliver OK after reload', 'noon → failed urgent_window_missed'];
});
// ---------------------------------------------------------------- RC3-T05 / T06
test('RC3-T05', 'BUG-03', 'QY01 加固纸样被 RM-05 命中后保护次数消耗、事件可结算、旅程可继续', () => {
  const d = driver(S, 105); d.p.reputation.value = 12; d.p.reputation.firstVisits.dunhuang = true; d.p.cash = 200; d.p.inventory.provisions = 20; d.quietCity(60);
  d.run('story.begin', { lineId: 'QY01', choiceId: 'reinforce' }); d.ack();
  assert(d.p.stories.lines.QY01.flags.qy01_protectionCharges === 1, 'one charge');
  startTrip(d);
  const open = S.events.open(d.p, 'RM-05', { kind: 'route', tags: [], routeId: d.p.world.route.id });
  d.run('RM_START', { moduleId: 'RM-05', eventSessionId: open.eventSessionId }); const s = d.p.work.routeGame;
  d.run('RM_STEP', { sessionId: s.id, sequence: 1, elapsedMs: 9000 }); assert(d.p.work.routeGame.result.tier === 'MISSED', 'missed');
  const r = d.tryRun('EVENT_RM_RESOLVE', { eventSessionId: open.eventSessionId, rmSessionId: s.id }); assert(r.ok, 'resolve: ' + r.code + ' ' + r.message);
  const protection = r.result.effects.find(e => e.type === 'story_protection'); assert(protection, 'protection effect present: ' + JSON.stringify(r.result.effects));
  assert(d.p.stories.lines.QY01.flags.qy01_protectionCharges === 0, 'charge consumed');
  const lot = d.p.inventory.lots.find(l => l.ownership === 'storyOwned'); assert(lot.condition === 'intact', 'sample intact');
  d.ack(); const j = d.tryRun('trip.journey'); assert(j.ok, 'journey continues: ' + j.code);
  // second hit is no longer protected but only degrades to damaged
  const draft = structuredClone(d.p); const second = S.inventory.damage(draft, lot.id, 'moisture', { quantity: 1 }); assert(second.condition === 'damaged' && !second.storyProtected, 'second hit → damaged');
  return ['protection consumed, effects=' + JSON.stringify(r.result.effects.map(e => e.type)), 'journey ok', 'second hit damaged'];
});
test('RC3-T06', 'BUG-03', 'QY01／QY02 初始样品破损后按4／3钱分支推进并移除，不阻塞下一奇缘', () => {
  const d = driver(S, 106); d.p.reputation.value = 12; d.p.reputation.firstVisits.dunhuang = true; d.p.cash = 100; d.p.inventory.provisions = 20; d.quietRoute(60); d.quietCity(60);
  d.run('story.begin', { lineId: 'QY01', choiceId: 'normal' }); d.ack();
  const lot = d.p.inventory.lots.find(l => l.ownership === 'storyOwned'); const dmg = S.inventory.damage(d.p, lot.id, 'moisture', { quantity: 1 }); assert(dmg.condition === 'damaged', 'damaged');
  const loss = S.inventory.lose(d.p, lot.id, 1, { tag: 'loss' }); assert(d.p.inventory.lots.find(l => l.id === lot.id).condition === 'damaged', 'a loss hit cannot destroy the sample');
  startTrip(d); d.journeyToArrival(); assert(d.p.world.city === 'dunhuang', 'dunhuang');
  const cash = d.p.cash, rep = d.p.reputation.value;
  const r = d.tryRun('story.act', { lineId: 'QY01', choiceId: 'continue' }); assert(r.ok, 'act: ' + r.code + ' ' + r.message);
  assert(d.p.cash - cash === 4 && d.p.reputation.value - rep === 1, 'damaged QY01 pays 4 / +1, got ' + (d.p.cash - cash) + '/' + (d.p.reputation.value - rep));
  assert(!d.p.inventory.lots.some(l => l.ownership === 'storyOwned'), 'sample removed'); d.ack();
  // next story with cargo (QY03 at dunhuang, routeIndex 1) is not blocked
  d.p.stories.hasDunhuangPackingExperience = true; d.p.tripHistory.push({ id: 'trip-prior', status: 'completed', onTimeReturn: true, startedAt: 0, arrivedAt: 1, summary: null }); d.p.events.history.push({ eventId: 'R08', sessionId: 'x', day: 0, tripKey: 'trip-prior', tripNumber: 1, routeId: 'r', city: 'dunhuang' }); d.p.stories.lastNewChapterTrip = null;
  const r3 = d.tryRun('story.begin', { lineId: 'QY03', choiceId: 'carry' }); assert(r3.ok, 'QY03 begin: ' + r3.code + ' ' + r3.message);
  // QY02 damaged trial sample → 3 / +1
  const e = driver(S, 107); e.p.reputation.value = 25; e.p.cash = 200; e.p.inventory.provisions = 30; e.quietRoute(60); e.quietCity(60); e.p.merchant.suppliers['于阗玉'] = { stage: 'established', discountRate: 0, sourceCity: 'khotan' };
  startTrip(e); jumpTo(e, 'khotan', 2);
  e.run('story.begin', { lineId: 'QY02', choiceId: 'continue' }); e.ack(); const trial = e.p.inventory.lots.find(l => l.ownership === 'storyOwned'); S.inventory.damage(e.p, trial.id, 'impact', { quantity: 1 });
  while (S.time.phase(e.p) !== 0) { e.run('inn.wait', { ticks: 1 }); e.ack(); } e.run('trip.depart', { acknowledgeSupplyWarning: true }); e.journeyToArrival(); assert(e.p.world.city === 'dunhuang', 'dunhuang return');
  const c2 = e.p.cash, rp2 = e.p.reputation.value; const r2 = e.tryRun('story.act', { lineId: 'QY02', choiceId: 'continue' }); assert(r2.ok, 'QY02 act: ' + r2.code + ' ' + r2.message);
  assert(e.p.cash - c2 === 3 && e.p.reputation.value - rp2 === 1, 'damaged QY02 pays 3 / +1, got ' + (e.p.cash - c2));
  assert(!JSON.stringify(e.p).includes('MISSING_STORY_AUTHORITY'), 'no authority gap markers');
  return ['QY01 damaged → +4 / +1, removed, QY03 begin ok', 'QY02 damaged → +3 / +1'];
});
// ---------------------------------------------------------------- RC3-T07 / T08
test('RC3-T07', 'BUG-04', '50%判定、同城同日只判一次、NO_EVENT持久化、重载不重抽', () => {
  let triggers = 0, total = 0, noEventSeed = null, eventSeed = null;
  for (let seed = 1; seed <= 200; seed++) {
    const d = driver(S, seed); d.p.cash = 200; d.run('inn.wait', { ticks: 1 }); d.ack();
    const rec = d.p.events.cityRollDays['changan:0']; assert(rec && rec.probability === 0.5, 'roll recorded with 50%'); total++; if (rec.trigger) { triggers++; eventSeed = eventSeed || seed; } else noEventSeed = noEventSeed || seed;
  }
  const rate = triggers / total; assert(rate > 0.4 && rate < 0.6, '≈50% trigger rate, got ' + rate);
  // no-event day: further actions do not re-roll, reload keeps the record
  const d = driver(S, noEventSeed); d.p.cash = 200; d.run('inn.wait', { ticks: 1 }); d.ack(); const before = JSON.stringify(d.p.events.cityRollDays['changan:0']); assert(!d.p.eventSession, 'no event');
  d.run('inn.talk'); d.ack(); d.resolveEvent(); d.ack(); assert(JSON.stringify(d.p.events.cityRollDays['changan:0']) === before && Object.keys(d.p.events.cityRollDays).length === 1, 'single judgement per city-day');
  reload(d); assert(JSON.stringify(d.p.events.cityRollDays['changan:0']) === before, 'reload keeps the NO_EVENT record');
  // 0-tick actions never judge
  const z = driver(S, 5); z.p.cash = 200; z.run('market.enter'); z.run('market.leave', { visitId: z.p.market.visit.id }); z.run('newspaper.purchase'); assert(Object.keys(z.p.events?.cityRollDays || {}).length === 0, '0-tick actions do not judge');
  // event day: the opened session survives reload unchanged
  const e = driver(S, eventSeed); e.p.cash = 200; e.run('inn.wait', { ticks: 1 }); e.ack(); const ev = e.p.eventSession; assert(ev && ev.status === 'AWAITING_CHOICE', 'event opened'); const id = ev.id; reload(e); assert(e.p.eventSession.id === id && e.p.events.cityRollDays['changan:0'].sessionId === id, 'same event after reload');
  return ['trigger rate ' + (rate * 100).toFixed(1) + '% over ' + total + ' seeds', 'no re-roll same day', 'reload stable'];
});
test('RC3-T08', 'BUG-04', '11个原死事件均可用固定上下文触达；客舍事件打开时5钱宿费仍只记一次', () => {
  const reached = [];
  const base = (city, tickPhase = 0) => { const d = driver(S, 108); d.p.cash = 200; d.p.world.city = city; d.p.world.tick = 30 + tickPhase; d.p.events = S.events.initial(); S.pricing.initialise(d.p); return d; };
  const check = (id, d, node) => { const el = S.events.eligibility(d.p, id, node); assert(el.eligible, id + ' eligible: ' + el.reasons.join(';')); const opened = S.events.open(d.p, id, node); assert(opened.eventId === id && d.p.eventSession.status === 'AWAITING_CHOICE', id + ' opened'); reached.push(id); };
  const cityNode = { kind: 'city', tags: [] };
  check('C01', base('changan'), cityNode);
  check('C02', base('changan', 2), cityNode);
  check('C04', base('khotan'), cityNode);
  check('C05', base('khotan'), { ...cityNode, cityVisitCount: 2, hasKhotanSilkKnowledge: true });
  check('C07', base('changan'), cityNode);
  check('C08', base('dunhuang'), cityNode);
  check('C09', base('dunhuang'), cityNode);
  check('C11', base('khotan'), cityNode);
  check('C12', base('khotan'), cityNode);
  { const d = base('changan'); d.p.journal.push({ type: 'marketBuy', city: 'changan', tick: d.p.world.tick, goodId: '绢帛' }); check('G12', d, cityNode); }
  check('M08', base('changan'), { ...cityNode, innNight: true, lodgingContext: 'inn', lodgingSettled: true });
  // real path: a formal inn stay opening M08 through the shared judgement (search seeds), lodging journaled exactly once
  let found = null;
  for (let seed = 1; seed <= 400 && !found; seed++) {
    const d = driver(S, seed); d.p.cash = 200; d.toDusk(); d.resolveEvent(); d.ack(); d.p.events.cityRollDays = {}; d.p.events.pendingCityRoll = null; d.p.events.mainDays = {}; // fresh judgement for the stay
    const before = d.p.journal.length; const r = d.run('inn.stay');
    if (r.kind === 'eventOpened' && r.eventId === 'M08') { const entries = d.p.journal.slice(before).filter(x => x.type === 'inn'); assert(entries.length === 1 && entries[0].amount === -5, 'lodging journaled once: ' + JSON.stringify(entries)); d.resolveEvent(); d.ack(); found = seed; }
  }
  assert(found, 'M08 reachable through a real inn stay');
  return ['reached: ' + reached.join(','), 'M08 via inn.stay at seed ' + found + ' with single -5 journal entry'];
});
// ---------------------------------------------------------------- RC3-T09
test('RC3-T09', 'BUG-05', '六个路途小游戏的跳过都落入各自 MISSED 后果，重复命令不重复结算', () => {
  const out = [];
  for (const id of ['RM-01', 'RM-02', 'RM-03', 'RM-04', 'RM-05', 'RM-06']) {
    const d = driver(S, 109); d.p.cash = 200; d.p.inventory.provisions = 20; d.quietCity(60); startTrip(d); addLot(d, '纸张', 3, 'changan');
    const open = S.events.open(d.p, id, { kind: 'route', tags: [], routeId: d.p.world.route.id });
    d.run('RM_START', { moduleId: id, eventSessionId: open.eventSessionId }); const s = d.p.work.routeGame; const tick = d.p.world.tick, cargo = JSON.stringify(d.p.inventory.lots.map(l => l.condition));
    d.run('RM_SKIP', { sessionId: s.id });
    const r = d.run('EVENT_RM_RESOLVE', { eventSessionId: open.eventSessionId, rmSessionId: s.id });
    const missed = S.events.definitions[id].choices[0].outcomes.find(o => o.outcomeId === 'MISSED');
    assert(r.settledAs === 'MISSED' && r.outcomeId === 'MISSED', id + ' settled as MISSED');
    const kinds = r.effects.map(e => e.type), expected = missed.effects.map(e => e.type);
    for (const k of expected) assert(kinds.includes(k), id + ' effect ' + k + ' applied: ' + JSON.stringify(kinds));
    const after = { tick: d.p.world.tick, cargo: JSON.stringify(d.p.inventory.lots.map(l => l.condition)) };
    const again = d.tryRun('EVENT_RM_RESOLVE', { eventSessionId: open.eventSessionId, rmSessionId: s.id }); assert(!again.ok, 'second resolve rejected');
    const skipAgain = d.tryRun('RM_SKIP', { sessionId: s.id }); assert(!skipAgain.ok || d.p.world.tick === after.tick, 'skip again is a no-op');
    assert(d.p.world.tick === after.tick && JSON.stringify(d.p.inventory.lots.map(l => l.condition)) === after.cargo, 'no double settlement');
    out.push(id + ': ' + kinds.join('+') + (tick !== after.tick ? ' (+' + (after.tick - tick) + ' tick)' : '') + (cargo !== after.cargo ? ' (cargo damaged)' : ''));
  }
  return out;
});
// ---------------------------------------------------------------- RC3-T10 / T11
test('RC3-T10', 'BUG-06', '交付城现买求货不能交；离城后返回可交；混合堆叠只消费运输合格数量', () => {
  const d = driver(S, 110); d.p.reputation.value = 12; d.p.cash = 500; d.p.inventory.provisions = 30; d.quietRoute(60); d.quietCity(60);
  startTrip(d); d.journeyToArrival(); assert(d.p.world.city === 'dunhuang', 'dunhuang outbound');
  // wanted commission delivered at the return stop of 敦煌 (index 3), goods = 河西毛织 (local good)
  d.p.commissions.active.push(fakeCommission(d, { commissionId: 'c-w', goodId: '河西毛织', quantity: 2, requiredSlots: 2, sourceCity: 'dunhuang', deliveryCity: 'dunhuang', deliveryIndex: 3, sourceStage: 3 }));
  d.run('market.enter'); const v = d.p.market.visit; d.run('market.buy', { visitId: v.id, goodId: '河西毛织', quantity: 1 }); d.ack(); d.run('market.leave', { visitId: v.id }); d.ack(); d.resolveEvent(); d.ack();
  const bought = d.p.inventory.lots.find(l => l.goodId === '河西毛织'); assert(bought.hasLeftAcquisitionCity === false, 'fresh purchase not yet transported');
  // travel to khotan and back
  while (S.time.phase(d.p) === 2) d.overnight('camp'); d.run('trip.depart', { acknowledgeSupplyWarning: true }); d.journeyToArrival(); d.run('trip.depart', { acknowledgeSupplyWarning: true }); d.journeyToArrival(); assert(d.p.world.city === 'dunhuang' && d.p.trip.routeIndex === 3, 'back at dunhuang return stop');
  assert(d.p.inventory.lots.find(l => l.goodId === '河西毛织' && l.id === bought.id).hasLeftAcquisitionCity === true, 'carried lot now qualified');
  // buy one more here now: unqualified. commission needs 2 → only 1 qualified → cannot deliver
  while (S.time.phase(d.p) === 2) d.overnight('camp');
  d.run('market.enter'); const v2 = d.p.market.visit; d.run('market.buy', { visitId: v2.id, goodId: '河西毛织', quantity: 1 }); d.ack();
  const plan = S.commissions.cargoPlan(d.p, d.p.commissions.active.find(c => c.commissionId === 'c-w')); assert(!plan.complete && plan.missing === 1 && plan.rows.length === 1 && plan.rows[0].lotId === bought.id, 'only the transported unit counts: ' + JSON.stringify(plan));
  const no = d.tryRun('commission.deliver', { commissionId: 'c-w' }); assert(!no.ok && no.code === 'CANNOT_DELIVER', 'fresh purchase cannot complete the order');
  d.run('market.leave', { visitId: v2.id }); d.ack(); d.resolveEvent(); d.ack();
  // add a second transported unit (bought elsewhere) → deliverable, and the fresh lot must stay untouched
  addLot(d, '河西毛织', 1, 'khotan');
  const fresh = d.p.inventory.lots.find(l => l.goodId === '河西毛织' && l.acquisitionCity === 'dunhuang' && !l.hasLeftAcquisitionCity);
  const ok = d.tryRun('commission.deliver', { commissionId: 'c-w' }); assert(ok.ok, 'deliver with two transported units: ' + ok.code + ' ' + ok.message);
  assert(d.p.inventory.lots.some(l => l.id === fresh.id && l.quantity === 1), 'unqualified fresh lot untouched');
  return ['fresh purchase rejected', 'carried-out-and-back lot accepted', 'mixed stack consumed only qualified units'];
});
test('RC3-T11', 'BUG-07', '长安买货→过夜→长安卖货，商誉不因该买卖增加；离城跑商后正常累计', () => {
  const d = driver(S, 111); d.quietCity(60); d.quietRoute(60);
  d.run('market.enter'); let v = d.p.market.visit; d.run('market.buy', { visitId: v.id, goodId: '绢帛', quantity: 5 }); d.ack(); d.run('market.leave', { visitId: v.id }); d.ack();
  d.overnight('restOutside'); d.overnight('restOutside');
  assert(d.p.reputation.value === 0 && d.p.reputation.turnover === 0, 'holding across nights confirms nothing: rep ' + d.p.reputation.value + ' turnover ' + d.p.reputation.turnover);
  d.run('market.enter'); v = d.p.market.visit; d.run('market.sellAll', { visitId: v.id }); d.ack(); d.run('market.leave', { visitId: v.id }); d.ack();
  assert(d.p.reputation.value === 0 && d.p.reputation.turnover === 0, 'same-city resale earns nothing');
  const row = Object.values(d.p.market.purchaseTurnoverLots)[0]; assert(row.cancelledQuantity === 5 && row.confirmedQuantity === 0, 'pending purchase cancelled: ' + JSON.stringify(row));
  // real trade: buy, depart (leaving confirms), sell abroad
  d.overnight('restOutside');
  d.run('market.enter'); v = d.p.market.visit; d.run('market.buy', { visitId: v.id, goodId: '绢帛', quantity: 5 }); d.ack(); d.run('market.leave', { visitId: v.id }); d.ack();
  d.p.inventory.provisions = 20; startTrip(d); const afterDepart = d.p.reputation.turnover + d.p.reputation.value * 20; assert(afterDepart > 0, 'purchase confirmed when leaving the city');
  d.journeyToArrival(); d.run('market.enter'); v = d.p.market.visit; const rep = d.p.reputation.value, turn = d.p.reputation.turnover; d.run('market.sellAll', { visitId: v.id }); d.ack();
  assert(d.p.reputation.value > rep || d.p.reputation.turnover > turn, 'sale abroad earns turnover');
  return ['same-city hold+sell: rep 0 / turnover 0', 'leaving confirms purchase, abroad sale counts (rep ' + d.p.reputation.value + ')'];
});
// ---------------------------------------------------------------- RC3-T12 / T13
test('RC3-T12', 'BUG-08', '关闭出发前面板后无 currentTrip、22日不流逝；重开候选相同；最终启程只提交一次', () => {
  const d = driver(S, 112); d.p.reputation.value = 12; d.p.cash = 300; d.p.inventory.provisions = 10; d.quietCity(60); d.quietRoute(60);
  const r = d.run('trip.begin'); assert(r.kind === 'departureDraft' && d.p.trip === null && d.p.departureDraft, 'draft only');
  const draftId = d.p.departureDraft.id, ids = d.p.departureDraft.pool.map(c => c.commissionId).join(',');
  d.overnight('restOutside'); d.overnight('restOutside');
  assert(d.p.trip === null && S.time.describe(d.p).tripLabel === '未启程', 'no trip while drafting; label ' + S.time.describe(d.p).tripLabel);
  assert(S.merchant.eligibility(d.p).unstarted === true && S.inn.snapshot(d.p).canRestOutside === false /* daytime */ , 'unstarted rights intact');
  const r2 = d.run('trip.begin'); assert(d.p.departureDraft.id === draftId && d.p.departureDraft.pool.map(c => c.commissionId).join(',') === ids, 'reopen keeps the same draft and candidates');
  const pick = d.p.departureDraft.pool.find(c => c.sourceStage === 0 && c.status !== 'unavailable' && c.type !== 'delivery') || d.p.departureDraft.pool.find(c => c.sourceStage === 0 && c.status !== 'unavailable');
  assert(pick, 'a selectable stage-0 candidate exists');
  d.run('trip.draftSelect', { commissionId: pick.commissionId, selected: true }); assert(d.p.commissions.active.length === 0 && d.p.departureDraft.selectedIds.includes(pick.commissionId), 'selection is not an acceptance');
  const far = d.p.departureDraft.pool.find(c => c.sourceStage !== 0); if (far) { const no = d.tryRun('trip.draftSelect', { commissionId: far.commissionId, selected: true }); assert(!no.ok && no.code === 'COMMISSION_WRONG_STOP', 'future-stop candidate not selectable'); }
  const tick = d.p.world.tick; d.run('trip.depart', { acknowledgeSupplyWarning: true });
  assert(d.p.trip && d.p.trip.startedAt === tick && d.p.trip.deadlineTick === tick + 66 && d.p.departureDraft === null, 'trip starts at final commit');
  assert(d.p.commissions.active.some(c => c.commissionId === pick.commissionId) && d.p.commissions.poolTripId === d.p.trip.id, 'selected commission activated with the trip pool');
  const twice = d.tryRun('trip.depart', { acknowledgeSupplyWarning: true }); assert(!twice.ok, 'second commit rejected');
  return ['draft ' + draftId + ' survived 2 nights with no trip', 'same candidates on reopen', 'single atomic start at tick ' + tick];
});
test('RC3-T13', 'BUG-09', '长安不能承接敦煌／于阗张榜委托；敦煌去程与返程来源站互不混用', () => {
  const d = driver(S, 113); d.p.reputation.value = 25; d.p.cash = 400; d.p.inventory.provisions = 30; d.quietCity(60); d.quietRoute(60);
  for (const g of ['染料', '漆器', '于阗玉']) d.p.merchant.suppliers[g] = { stage: 'established', discountRate: 0, sourceCity: S.merchant.suppliers[g].city };
  d.run('trip.begin'); const draftRows = d.p.departureDraft.pool;
  const stages = [...new Set(draftRows.map(c => c.sourceStage))].sort(); assert(stages.length >= 3, 'pool spans several stages: ' + stages);
  for (const c of draftRows.filter(c => c.sourceStage !== 0 && c.status === 'available')) { const r = d.tryRun('commission.accept', { commissionId: c.commissionId }); assert(!r.ok && r.code === 'COMMISSION_WRONG_STOP', 'stage ' + c.sourceStage + ' not acceptable at 长安: ' + r.code); const r2 = d.tryRun('trip.draftSelect', { commissionId: c.commissionId, selected: true }); assert(!r2.ok && r2.code === 'COMMISSION_WRONG_STOP', 'draft select of stage ' + c.sourceStage + ' rejected'); }
  d.run('trip.depart', { acknowledgeSupplyWarning: true }); const pool = d.p.commissions.pool;
  d.journeyToArrival(); assert(d.p.trip.routeIndex === 1, 'dunhuang outbound');
  const s3 = pool.find(c => c.sourceStage === 3 && c.status === 'available'); if (s3) { const r = d.tryRun('commission.accept', { commissionId: s3.commissionId }); assert(!r.ok && r.code === 'COMMISSION_WRONG_STOP', 'return-stop posting not acceptable outbound'); }
  const s1 = pool.find(c => c.sourceStage === 1 && c.status === 'available'); if (s1) { const r = d.tryRun('commission.accept', { commissionId: s1.commissionId }); assert(r.ok, 'stage-1 posting acceptable at stage 1: ' + r.code + ' ' + r.message); }
  const snap = S.commissions.snapshot(d.p); assert(snap.pool.every(c => typeof c.acceptableHere === 'boolean' && (c.sourceStage === 1 || !c.acceptableHere)), 'snapshot exposes acceptableHere per stop');
  return ['stages in pool: ' + stages.join(','), 'wrong-stop accepts rejected', 'stage-1 accept ok at dunhuang outbound: ' + Boolean(s1)];
});
// ---------------------------------------------------------------- RC3-T14 / T15 / T16 / T17
test('RC3-T14', 'BUG-10', '只购报后离市0 Tick；购报加买卖时只按买卖正常推进一次', () => {
  const d = driver(S, 114); d.p.cash = 100; d.quietCity(60);
  d.run('market.enter'); let v = d.p.market.visit; const t0 = d.p.world.tick; d.run('newspaper.purchase', { visitId: v.id }); assert(d.p.cash === 98 && d.p.market.visit.hadActivity === false, 'newspaper does not mark activity'); d.run('market.leave', { visitId: v.id }); assert(d.p.world.tick === t0, 'leave after newspaper only = 0 tick');
  assert(S.timeRisk.actionTicks(d.p, 'newspaper.purchase', { visitId: v.id }) === 0, 'time-risk treats newspaper as 0 tick');
  d.run('market.enter'); v = d.p.market.visit; d.run('market.buy', { visitId: v.id, goodId: '纸张', quantity: 1 }); d.ack(); d.run('newspaper.purchase', { visitId: v.id }); d.run('market.leave', { visitId: v.id }); d.ack(); assert(d.p.world.tick === t0 + 1, 'buy + newspaper = exactly one tick');
  assert(!D.helpText === undefined || !/购得新一期商报的市场访问在退出时推进/.test(ctx.Silk.content.helpText), 'help text no longer claims newspaper time cost');
  return ['newspaper-only visit 0 tick', 'buy+newspaper visit 1 tick'];
});
test('RC3-T15', 'BUG-11', '面额1钱办理失败且零状态变化；最小有效面额成功且兑付至少1钱', () => {
  const d = driver(S, 115); d.p.cash = 50; const before = JSON.stringify(d.p);
  const r = d.tryRun('finance.issueVoucher', { amount: 1, source: 'cash', destinationCity: 'dunhuang' }); assert(!r.ok && r.code === 'VOUCHER_TOO_SMALL', 'rejected: ' + r.code);
  assert(JSON.stringify(d.p) === before, 'zero state change');
  const q = S.finance.voucherQuote(d.p, 1); assert(q.valid === false && q.minimumFace >= 2, 'quote reports minimum ' + q.minimumFace);
  const ok = d.tryRun('finance.issueVoucher', { amount: q.minimumFace, source: 'cash', destinationCity: 'dunhuang' }); assert(ok.ok && d.p.finance.vouchers[0].redeemableAmount >= 1, 'minimum face succeeds with redeemable ≥ 1');
  return ['1钱 rejected (VOUCHER_TOO_SMALL), no state change', 'minimum face ' + q.minimumFace + ' → redeemable ' + d.p.finance.vouchers[0].redeemableAmount];
});
test('RC3-T16', 'BUG-12', '7条指定闲谈静态校验无空标签', () => {
  const ids = ['CA_TALK_11', 'CA_TALK_12', 'CA_TALK_20', 'DH_TALK_11', 'DH_TALK_12', 'DH_TALK_20', 'YT_TALK_20'];
  const all = Object.values(D.inn.talkPools).flatMap(p => p.lines);
  for (const id of ids) { const l = all.find(x => x.id === id); assert(l && l.feedbackLabel === '客舍闲谈', id + ' label: ' + (l && l.feedbackLabel)); }
  assert(all.every(l => typeof l.feedbackLabel === 'string' && l.feedbackLabel.trim()), 'no empty labels anywhere');
  return ['7 labels = 客舍闲谈', 'all ' + all.length + ' talk lines labelled'];
});
test('RC3-T17', 'BUG-13', '委托卡片、详情、消息与总结中的属性标签均与实例真实属性一致', () => {
  let rows = 0, urgentSeen = 0, fragileSeen = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const d = driver(S, seed); d.p.reputation.value = 45; d.p.cash = 500; for (const g of ['染料', '漆器', '于阗玉', '精制玉器']) d.p.merchant.suppliers[g] = { stage: 'established', discountRate: 0, sourceCity: S.merchant.suppliers[g].city };
    d.run('trip.begin');
    for (const c of S.commissions.draftView(d.p).rows) {
      rows++; const labels = c.attributeLabels; assert(Array.isArray(labels) && labels.length, 'labels present');
      assert(labels.includes('加急') === Boolean(c.urgent), 'urgent label matches instance'); assert(labels.includes('易损') === Boolean(c.fragile), 'fragile label matches instance');
      assert(!labels.some(l => /二选一/.test(l)), 'no 二选一 text'); if (labels.includes('普通')) assert(labels.length === 1 && !c.urgent && !c.fragile && !c.valuable && !c.rare && !c.longHaul && c.handoffPhase === null, '普通 only when nothing applies');
      if (c.urgent) urgentSeen++; if (c.fragile) fragileSeen++;
    }
  }
  const ui = fs.readFileSync(path.join(__dirname, '..', 'business-ui.js'), 'utf8'); assert(!ui.includes('二选一') && ui.includes('attributeLabels'), 'UI renders attributeLabels and never the 二选一 wording');
  return ['rows checked ' + rows, 'urgent ' + urgentSeen + ', fragile ' + fragileSeen];
});
// ---------------------------------------------------------------- RC3-T18
function runQuietTrip(d, withCommission) {
  d.p.inventory.provisions = 30; d.run('trip.begin');
  if (withCommission) { const pick = d.p.departureDraft.pool.find(c => c.sourceStage === 0 && c.status !== 'unavailable' && c.type !== 'delivery'); if (pick) d.run('trip.draftSelect', { commissionId: pick.commissionId, selected: true }); }
  d.run('trip.depart', { acknowledgeSupplyWarning: true });
  for (let leg = 0; leg < 4; leg++) { d.journeyToArrival(); if (leg < 3) { while (S.time.phase(d.p) === 2) d.overnight('camp'); d.run('trip.depart', { acknowledgeSupplyWarning: true }); } }
  assert(d.p.world.city === 'changan' && d.p.trip.arrivedChanganTick !== null, 'returned');
  while (d.p.trip.phase === 'returned_at_dusk_pending_rest') d.overnight('stay');
  const view = S.trip.returnView(d.p); for (const [task, status] of Object.entries(view.tasks)) if (status === 'pending') d.run('trip.resolveReturnTask', { task, decision: 'deferred' });
  d.run('trip.finalize', { confirmOutstanding: true }); const summary = d.p.presentation.activeResult; assert(summary && summary.kind === 'tripSummary', 'summary'); d.ack(); return summary;
}
test('RC3-T18', 'BUG-14', '多趟商旅后 active 无终态累积；历史与总结仍完整；重复结束不重复归档', () => {
  const d = driver(S, 118); d.p.reputation.value = 12; d.p.cash = 400; d.quietCity(200); d.quietRoute(200);
  const summaries = [];
  for (let i = 0; i < 3; i++) { summaries.push(runQuietTrip(d, true)); assert(d.p.trip === null, 'trip closed'); assert(d.p.commissions.active.every(c => ['accepted', 'pending_pickup', 'in_transit', 'ready_to_turn_in'].includes(c.status)), 'no terminal record in active after trip ' + (i + 1) + ': ' + JSON.stringify(d.p.commissions.active.map(c => c.status))); assert(d.p.commissions.pool.length === 0, 'pool cleared'); while (S.time.phase(d.p) === 2) d.overnight('restOutside'); }
  assert(d.p.tripHistory.length === 3 && d.p.tripHistory.every(t => t.summary && t.summary.commissions), 'three trips with summaries');
  const archived = d.p.commissions.history.length, results = d.p.commissions.results.length; assert(archived >= 1 && results >= 1, 'history kept: archived ' + archived + ', results ' + results);
  const again = d.tryRun('trip.finish'); assert(!again.ok, 'repeat finish rejected: ' + again.code);
  assert(S.commissions.archiveTrip(d.p).archived === 0 && d.p.commissions.history.length === archived, 'archive idempotent');
  return ['3 trips, active=' + d.p.commissions.active.length, 'archived=' + archived + ' results=' + results, 'summaries commissions failed counts: ' + summaries.map(s => s.commissions.failed).join('/')];
});
// ---------------------------------------------------------------- RC3-T19 full loop with live events
function playMinigame(d) { const rg = d.p.work?.routeGame, ev = d.p.eventSession; if (!(rg && ev && ev.status === 'AWAITING_SKILL')) return; const spec = S.minigames.specs[rg.moduleId]; if (!rg.result) d.run('RM_STEP', { sessionId: rg.id, sequence: rg.sequence + 1, elapsedMs: spec.ms }); d.run('EVENT_RM_RESOLVE', { eventSessionId: ev.id, rmSessionId: rg.id }); d.ack(); }
function liveJourney(d) { let guard = 0; while (d.p.world.route && guard++ < 400) { const r = d.run('trip.journey'); d.ack(); if (d.p.eventSession && d.p.eventSession.status === 'AWAITING_SKILL') { d.run('RM_START', { moduleId: d.p.eventSession.eventId, eventSessionId: d.p.eventSession.id }); playMinigame(d); } else d.resolveEvent(); d.ack(); } }
function settleCity(d) { d.resolveEvent(); d.ack(); }
test('RC3-T19', '综合', '从新档完整跑通长安→敦煌→于阗→敦煌→长安，第一趟 Return Tasks 与 Trip Summary 正常', () => {
  const d = driver(S, 119, 'guided'); const log = [];
  d.run('market.enter'); let v = d.p.market.visit; d.run('market.buy', { visitId: v.id, goodId: '绢帛', quantity: 3 }); d.ack(); d.run('market.provisions', { visitId: v.id, quantity: 14 }); d.ack(); d.run('market.leave', { visitId: v.id }); d.ack(); settleCity(d);
  const begin = d.run('trip.begin'); log.push('draft candidates ' + (d.p.departureDraft ? d.p.departureDraft.pool.length : 0));
  d.run('trip.depart', {}); assert(d.p.trip && d.p.world.route, 'departed'); const started = d.p.trip.startedAt;
  liveJourney(d); assert(d.p.world.city === 'dunhuang', 'arrived dunhuang'); log.push('dunhuang tick ' + d.p.world.tick);
  while (S.time.phase(d.p) === 2) d.overnight('camp');
  d.run('market.enter'); v = d.p.market.visit; d.run('market.sellAll', { visitId: v.id }); d.ack(); d.run('market.buy', { visitId: v.id, goodId: '干果', quantity: 2 }); d.ack(); d.run('market.leave', { visitId: v.id }); d.ack(); settleCity(d);
  while (S.time.phase(d.p) === 2) d.overnight('camp'); d.run('trip.depart', { acknowledgeSupplyWarning: true }); liveJourney(d); assert(d.p.world.city === 'khotan', 'khotan'); log.push('khotan tick ' + d.p.world.tick);
  while (S.time.phase(d.p) === 2) d.overnight('camp'); d.run('trip.depart', { acknowledgeSupplyWarning: true }); liveJourney(d); assert(d.p.world.city === 'dunhuang', 'dunhuang return');
  while (S.time.phase(d.p) === 2) d.overnight('camp'); d.run('trip.depart', { acknowledgeSupplyWarning: true }); liveJourney(d); assert(d.p.world.city === 'changan', 'changan'); log.push('changan tick ' + d.p.world.tick + ' status ' + d.p.trip.returnStatus + ' phase ' + d.p.trip.phase);
  while (d.p.trip.phase === 'returned_at_dusk_pending_rest') d.overnight('stay'); settleCity(d);
  const view = S.trip.returnView(d.p); log.push('return tasks ' + JSON.stringify(view.tasks));
  for (const [task, status] of Object.entries(view.tasks)) if (status === 'pending') d.run('trip.resolveReturnTask', { task, decision: 'deferred' });
  const fin = d.run('trip.finalize', { confirmOutstanding: true }); assert(fin.kind === 'tripSummary' && fin.journey.startedTick === started && fin.journey.limitDays === 22 && typeof fin.trade.profit === 'number' && fin.firstCompletedTrip === true, 'summary shape');
  d.ack(); assert(d.p.trip === null && d.p.tripHistory.length === 1, 'trip archived');
  S.core.validate(d.envelope());
  log.push('summary profit ' + fin.trade.profit + ', rep ' + fin.reputation.current + ', events ' + d.p.events.history.length + ', city rolls ' + Object.keys(d.p.events.cityRollDays).length);
  return log;
});
// ---------------------------------------------------------------- RC3-T20 save/reload coverage
test('RC3-T20', '综合', '存档／重载覆盖事件 pending、暮抵加急、返程宽限、出发 draft、委托交付与总结，无重抽／重复结算', () => {
  const notes = [];
  // draft
  const a = driver(S, 120); a.p.reputation.value = 12; a.p.cash = 300; a.quietCity(60); a.quietRoute(60); a.run('trip.begin'); const draftBefore = JSON.stringify(a.p.departureDraft); reload(a); assert(JSON.stringify(a.p.departureDraft) === draftBefore && a.p.trip === null, 'draft survives reload'); notes.push('draft ok');
  // event pending (route)
  const b = driver(S, 121); b.p.cash = 200; b.p.inventory.provisions = 20; b.quietCity(60); startTrip(b); const open = S.events.open(b.p, 'M01', { kind: 'route', tags: [], routeId: b.p.world.route.id }); const id = open.eventSessionId; reload(b); assert(b.p.eventSession.id === id && b.p.eventSession.status === 'AWAITING_CHOICE', 'pending event survives'); const before = b.p.rngState; b.resolveEvent(); assert(b.p.rngState !== before && b.p.eventSession.status === 'ACKNOWLEDGED', 'resolved once'); const journal = b.p.journal.filter(j => j.type === 'event').length; reload(b); assert(b.p.journal.filter(j => j.type === 'event').length === journal, 'no double settlement after reload'); notes.push('event pending ok');
  // dusk urgent + reload (covered in T04) and grace + reload
  const c = driver(S, 122); c.p.reputation.value = 12; c.p.cash = 300; c.quietRoute(60); c.quietCity(60); startTrip(c); jumpTo(c, 'dunhuang', 3); c.p.commissions.active.push(fakeCommission(c, { commissionId: 'c-g', handoffPhase: 1 })); addLot(c, '绢帛', 2, 'dunhuang'); arriveChanganAtDusk(c); const grace = JSON.stringify([c.p.trip.graceIds, c.p.trip.graceDeadlineTick]); c.overnight('stay'); reload(c); assert(JSON.stringify([c.p.trip.graceIds, c.p.trip.graceDeadlineTick]) === grace, 'grace frozen set stable after reload'); const del = c.tryRun('commission.deliver', { commissionId: 'c-g' }); assert(del.ok, 'deliver after reload: ' + del.code); c.ack(); const dup = c.tryRun('commission.deliver', { commissionId: 'c-g' }); assert(!dup.ok, 'no double delivery'); notes.push('grace + delivery ok');
  // summary pending → reload → ack once
  const e = driver(S, 123); e.p.reputation.value = 12; e.p.cash = 400; e.quietCity(200); e.quietRoute(200); e.p.inventory.provisions = 30; e.run('trip.begin'); e.run('trip.depart', { acknowledgeSupplyWarning: true }); for (let leg = 0; leg < 4; leg++) { e.journeyToArrival(); if (leg < 3) { while (S.time.phase(e.p) === 2) e.overnight('camp'); e.run('trip.depart', { acknowledgeSupplyWarning: true }); } } while (e.p.trip.phase === 'returned_at_dusk_pending_rest') e.overnight('stay'); for (const [task, status] of Object.entries(S.trip.returnView(e.p).tasks)) if (status === 'pending') e.run('trip.resolveReturnTask', { task, decision: 'deferred' }); e.run('trip.finalize', { confirmOutstanding: true }); const rep = e.p.reputation.value; reload(e); assert(e.p.presentation.activeResult?.kind === 'tripSummary' && e.p.trip.phase === 'summary', 'summary pending survives'); e.ack(); assert(e.p.trip === null && e.p.tripHistory.length === 1 && e.p.reputation.value === rep, 'finish once, no extra reward'); const again = e.tryRun('result.ack', { resultId: 'r-x' }); assert(!again.ok || e.p.tripHistory.length === 1, 'repeat ack harmless'); notes.push('summary ok');
  return notes;
});

// ---------------------------------------------------------------- report
const passed = results.filter(r => r.pass).length;
const lines = ['# RC3 directed acceptance (RC3-T01 – RC3-T20)', '', 'Engine: ' + JSON.stringify(S.core.versions), 'Run: ' + new Date().toISOString(), '', '| ID | Bug | Result | Title | Details |', '|---|---|---|---|---|'];
for (const r of results) lines.push('| ' + r.id + ' | ' + r.bug + ' | ' + (r.pass ? 'PASS' : 'FAIL') + ' | ' + r.title + ' | ' + r.details.map(x => String(x).replace(/\|/g, '/').replace(/\n/g, ' ')).join('<br>') + ' |');
lines.push('', 'Total: ' + passed + '/' + results.length + ' PASS');
fs.mkdirSync(path.join(__dirname, 'results'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'results', 'rc3-directed.md'), lines.join('\n'));
fs.writeFileSync(path.join(__dirname, 'results', 'rc3-directed.json'), JSON.stringify(results, null, 1));
for (const r of results) console.log((r.pass ? 'PASS ' : 'FAIL ') + r.id + ' ' + r.title + (r.pass ? '' : '\n    ' + r.details.join('\n    ')));
console.log('RC3 directed: ' + passed + '/' + results.length);
process.exitCode = passed === results.length ? 0 : 1;
