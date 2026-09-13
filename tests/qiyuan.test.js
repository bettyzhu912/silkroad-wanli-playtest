'use strict';
// 商路奇缘 FINAL v1.0 (2026-09-13) — engine acceptance for QY01–QY06 (06_QA_ACCEPTANCE_CHECKLIST sections C–I + save compatibility):
// every gameplay chapter settles at once, the fifth chapter is a summary with nothing to pay, the finale snapshot is read-only, repeats are refused.
const assert = require('assert');
const { load, driver } = require('./harness');
const S = load().Silk;
let passed = 0; const test = (name, fn) => { fn(); passed++; console.log('PASS ' + name); };
const ids = { QY01: ['QY01_1', 'QY01_2', 'QY01_3', 'QY01_4', 'QY01_5'], QY02: ['QY02_1', 'QY02_2', 'QY02_3', 'QY02_4', 'QY02_5'], QY03: ['QY03_1', 'QY03_2', 'QY03_3', 'QY03_4', 'QY03_5'], QY04: ['QY04_1', 'QY04_2', 'QY04_3', 'QY04_4', 'QY04_5'], QY05: ['QY05_1', 'QY05_2', 'QY05_3', 'QY05_4', 'QY05_5'], QY06: ['QY06_1', 'QY06_2', 'QY06_3', 'QY06_4', 'QY06_5'] };
function fresh(seed, rep) { const d = driver(S, seed); d.p.cash = 400; d.p.inventory.provisions = 30; d.p.inventory.camelCount = 3; d.p.reputation.value = rep; d.p.reputation.firstVisits = { dunhuang: true, khotan: true }; d.quietCity(120); d.quietRoute(120); return d; }
function jumpTo(d, city, routeIndex) { d.p.world.route = null; d.p.world.city = city; d.p.trip.routeIndex = routeIndex; d.p.trip.phase = 'in_city'; d.p.trip.routeHistory = ['changan', 'dunhuang', 'khotan', 'dunhuang', 'changan'].slice(0, routeIndex + 1); }
function startTrip(d) { d.run('trip.begin'); d.run('trip.depart', { acknowledgeSupplyWarning: true }); jumpTo(d, 'dunhuang', 1); }
const line = (d, id) => d.p.stories.lines[id];
const freeBudget = (d, id) => { d.p.stories.lastNewChapterTrip = null; if (line(d, id)) line(d, id).lastCompletedTrip = 'earlier-trip'; };
const begin = (d, id, choiceId = 'continue') => { freeBudget(d, id); const r = d.run('story.begin', { lineId: id, choiceId }); d.ack(); return r; };
const act = (d, id, choiceId = 'continue') => { const before = { cash: d.p.cash, rep: d.p.reputation.value }; const r = d.run('story.act', { lineId: id, choiceId }); d.ack(); return { r, cash: d.p.cash - before.cash, rep: d.p.reputation.value - before.rep }; };
const storyLots = d => d.p.inventory.lots.filter(l => l.ownership === 'storyOwned');
const closedLine = id => ({ lineId: id, status: 'closed', completed: true, completedChapters: ids[id], activeChapter: null, flags: {}, lastCompletedTrip: null });
function assertFinale(d, id) {
  const l = line(d, id); assert.strictEqual(l.status, 'closed'); assert.ok(l.completed === true && l.completedChapters.length === 5 && l.completedChapters[4] === ids[id][4], 'finale chapter recorded');
  const fin = d.p.stories.history.filter(h => h.lineId === id && h.chapterId === ids[id][4]); assert.ok(fin.length === 1 && fin[0].kind === 'storyFinale' && fin[0].actualCash === 0 && fin[0].actualReputation === 0, 'finale pays nothing');
  assert.ok(l.finalSnapshot && l.finalSnapshot.chapters.length === 5 && l.finalSnapshot.subtitle && l.finalSnapshot.closeLabel, 'snapshot written');
  const cash0 = d.p.cash, rep0 = d.p.reputation.value, before = JSON.stringify(d.p);
  const f = S.stories.finaleOf(d.p, l); assert.ok(f.entries.recap === '一路所记' && f.entries.gains === '此缘所得' && f.entries.notes === '卷外余话' && f.backLabel === '返回终章' && f.eyebrow === '商路奇缘·终章' && f.gains.footer === '此缘所得均已在沿途结清。', 'finale copy');
  assert.strictEqual(JSON.stringify(d.p), before, 'reading the finale mutates nothing'); assert.ok(d.p.cash === cash0 && d.p.reputation.value === rep0);
  const again = d.tryRun('story.act', { lineId: id, choiceId: 'continue' }); assert.ok(!again.ok && again.code === 'STORY_NOT_ACTIVE', 'repeat act refused'); const b2 = d.tryRun('story.begin', { lineId: id }); assert.ok(!b2.ok, 'begin refused on a completed line');
  assert.ok(d.p.cash === cash0 && d.p.reputation.value === rep0 && JSON.stringify(d.p.stories.lines[id]) === JSON.stringify(l), 'nothing changed by the refused repeats');
  const env = JSON.parse(JSON.stringify(d.envelope())); S.core.validate(env); const up = S.core.upgradeEnvelope(env); assert.strictEqual(up.changed, false, 'current save reloads unchanged');
  const snap = S.stories.snapshot(d.p, S.core.context('t')).find(x => x.lineId === id); assert.ok(snap.displayStatus === 'completed' && snap.finale && snap.finale.recap.length === 5, 'card shows 已完成 with the finale read model');
  return f;
}
const cashRow = (f, label) => f.gains.cashRows.find(r => r.label.endsWith(label));

test('QY01 一卷西行经: ch1 8/+1 · ch2 truthful +1 · ch3 locked 于阗丝织 reference cost refund + 10 + 1 · ch4 8/+2 → finale (old chapter-5 reward table not paid)', () => {
  const d = fresh(301, 12); begin(d, 'QY01', 'reinforce'); assert.strictEqual(d.p.cash, 397, '添钱加固 −3'); startTrip(d);
  let s = act(d, 'QY01'); assert.ok(s.cash === 8 && s.rep === 1 && s.r.lines[0].label === '交付酬劳' && s.r.text.startsWith('纸样已经送到'), JSON.stringify(s.r.lines));
  begin(d, 'QY01'); jumpTo(d, 'khotan', 2); s = act(d, 'QY01', 'truthful'); assert.ok(s.cash === 0 && s.rep === 1);
  begin(d, 'QY01'); const ref = line(d, 'QY01').activeChapter.referenceCost; assert.ok(Number.isInteger(ref) && ref === S.market.quote(d.p, 'khotan', '于阗丝织'), 'reference cost locked at chapter generation');
  jumpTo(d, 'dunhuang', 3); const noSilk = d.tryRun('story.act', { lineId: 'QY01' }); assert.ok(!noSilk.ok && noSilk.code === 'STORY_GOODS_REQUIRED', 'chapter kept until the silk is held');
  S.inventory.add(d.p, { goodId: '于阗丝织', quantity: 1, acquisitionPrice: 30, acquisitionCity: 'khotan', hasLeftAcquisitionCity: true });
  s = act(d, 'QY01'); assert.ok(s.cash === ref + 10 && s.rep === 1 && s.r.lines.map(l => l.label).join('|') === '材料款返还|制帙酬劳' && s.r.lines[0].amount === ref, 'ch3 = refund + 10 + 1: ' + JSON.stringify(s.r.lines));
  begin(d, 'QY01'); s = act(d, 'QY01', 'report'); assert.ok(s.cash === 8 && s.rep === 2 && s.r.finale === true, 'ch4 settles and finalises');
  const f = assertFinale(d, 'QY01');
  assert.strictEqual(f.gains.netCash, -3 + 8 + ref + 10 + 8); assert.strictEqual(f.gains.repTotal, 1 + 1 + 1 + 2);
  assert.ok(cashRow(f, '添钱加固').amount === -3 && cashRow(f, '材料款返还').amount === ref && cashRow(f, '制帙酬劳').amount === 10, JSON.stringify(f.gains.cashRows));
  assert.ok(f.recap[1].text === '你把三地真正需要的材料一一问清。' && f.recap[3].text.startsWith('于阗的回话') && f.recap[4].text.startsWith('纸从长安来'), JSON.stringify(f.recap));
  assert.ok(f.notes.includes('经卷包帙') && f.subtitle === '一卷成形' && f.closeLabel === '收起经卷');
});
test('QY01 exaggerate → admit: ch2 +4 · ch4 4 / no 商誉', () => {
  const d = fresh(302, 12); begin(d, 'QY01', 'normal'); startTrip(d); act(d, 'QY01'); begin(d, 'QY01'); jumpTo(d, 'khotan', 2);
  let s = act(d, 'QY01', 'exaggerate'); assert.ok(s.cash === 4 && s.rep === 0); begin(d, 'QY01'); jumpTo(d, 'dunhuang', 3); S.inventory.add(d.p, { goodId: '于阗丝织', quantity: 1, acquisitionPrice: 30, acquisitionCity: 'khotan', hasLeftAcquisitionCity: true }); act(d, 'QY01');
  begin(d, 'QY01'); const choices = S.stories.actionChoices(d.p, 'QY01').map(c => c.id).join('|'); assert.strictEqual(choices, 'admit|insist');
  s = act(d, 'QY01', 'admit'); assert.ok(s.cash === 4 && s.rep === 0); const f = assertFinale(d, 'QY01'); assert.ok(f.recap[1].text.startsWith('你让一句回话') && f.recap[3].text.startsWith('市面并没有'));
});
test('QY02 玉料两价: trial kept through 敦煌 and 长安, removed only at 于阗; main route 18/+4 settles at once; special offer (rolled once) accept → 长安 delivery 16/+2 → finale', () => {
  const d = fresh(303, 25); d.p.merchant.suppliers['于阗玉'] = { stage: 'established', discountRate: 0, sourceCity: 'khotan' }; startTrip(d); jumpTo(d, 'khotan', 2);
  begin(d, 'QY02'); assert.strictEqual(storyLots(d).length, 1); jumpTo(d, 'dunhuang', 3);
  let s = act(d, 'QY02'); assert.ok(s.cash === 6 && s.rep === 1 && storyLots(d).length === 1, 'ch1 6/+1, trial kept');
  begin(d, 'QY02'); s = act(d, 'QY02', 'honest'); assert.ok(s.cash === 0 && storyLots(d).length === 1, 'ch2 honest, trial kept');
  jumpTo(d, 'changan', 4); begin(d, 'QY02'); s = act(d, 'QY02', 'full'); assert.ok(s.rep === 2 && storyLots(d).length === 1, 'ch3 full, trial still kept after 长安');
  jumpTo(d, 'khotan', 2); begin(d, 'QY02'); const a = line(d, 'QY02').activeChapter; assert.ok(a.specialProbability === .8 && Number.isFinite(a.specialRoll), 'honest×2 → 80 % rolled once');
  const rollBefore = a.specialRoll; a.specialRoll = .05; a.specialAvailable = true; // force the offer for this run (the saved roll is what decides)
  s = act(d, 'QY02'); assert.ok(s.r.kind === 'storyStageSettled' && s.cash === 18 && s.rep === 4 && storyLots(d).length === 0 && s.r.offer === true, '归还试料: main route paid at once, trial removed, offer shown');
  assert.strictEqual(line(d, 'QY02').status, 'active'); assert.strictEqual(line(d, 'QY02').activeChapter.phase, 'offer');
  const twice = d.tryRun('story.act', { lineId: 'QY02', choiceId: 'continue' }); assert.ok(!twice.ok && twice.code === 'STORY_CHOICE', 'main route cannot be settled twice');
  const env = JSON.parse(JSON.stringify(d.envelope())); const up = S.core.upgradeEnvelope(env); assert.ok(!up.changed && up.state.progress.stories.lines.QY02.activeChapter.specialAvailable === true, 'offer survives reload');
  s = act(d, 'QY02', 'defer'); assert.ok(s.cash === 0 && s.r.kind === 'storyDeferred' && line(d, 'QY02').activeChapter.phase === 'offer', '暂且不接 keeps the chapter');
  s = act(d, 'QY02', 'accept'); assert.ok(storyLots(d).length === 1 && storyLots(d)[0].storyCargoKind === 'QY02_SPECIAL_CARGO' && line(d, 'QY02').activeChapter.phase === 'delivery' && s.cash === 0);
  jumpTo(d, 'changan', 4); s = act(d, 'QY02'); assert.ok(s.cash === 16 && s.rep === 2 && s.r.finale === true && storyLots(d).length === 0, '长安 delivery 16/+2');
  const f = assertFinale(d, 'QY02'); assert.strictEqual(f.gains.netCash, 6 + 18 + 16); assert.strictEqual(f.gains.repTotal, 1 + 2 + 4 + 2);
  assert.ok(cashRow(f, '主路线结清').amount === 18 && cashRow(f, '代售交付').amount === 16 && f.recap[3].text.includes('特别代售'), JSON.stringify(f.gains.cashRows) + JSON.stringify(f.recap));
  assert.ok(f.gains.cargoRows.some(r => r.startsWith('归还 玉料试料')) && f.gains.cargoRows.some(r => r.startsWith('交出 贵重重托')), JSON.stringify(f.gains.cargoRows));
  void rollBefore;
});
test('QY02 conceal + favorable: +6 · +8 · main route 28/+2 with no offer → finale directly', () => {
  const d = fresh(304, 25); d.p.merchant.suppliers['于阗玉'] = { stage: 'established', discountRate: 0, sourceCity: 'khotan' }; startTrip(d); jumpTo(d, 'khotan', 2); begin(d, 'QY02'); jumpTo(d, 'dunhuang', 3); act(d, 'QY02');
  begin(d, 'QY02'); let s = act(d, 'QY02', 'conceal'); assert.strictEqual(s.cash, 6); jumpTo(d, 'changan', 4); begin(d, 'QY02'); s = act(d, 'QY02', 'favorable'); assert.ok(s.cash === 8 && s.rep === 0);
  jumpTo(d, 'khotan', 2); begin(d, 'QY02'); const a = line(d, 'QY02').activeChapter; assert.strictEqual(a.specialProbability, .2); a.specialRoll = .9; a.specialAvailable = false;
  s = act(d, 'QY02'); assert.ok(s.cash === 28 && s.rep === 2 && s.r.finale === true, '28/+2 then finale'); const f = assertFinale(d, 'QY02'); assert.ok(f.recap[3].text.startsWith('你的确替它') && !f.recap[3].text.includes('特别代售'));
});
test('QY03 风沙旧箱: no compatible event → intact; open → 旧货票, no box; ch4 15/+3 → finale (five chapters)', () => {
  const d = fresh(305, 12); d.p.tripHistory.push({ id: 'trip-prior', status: 'completed', onTimeReturn: true, startedAt: 0, arrivedAt: 1, summary: null }); d.p.events.history.push({ eventId: 'R08', sessionId: 'x', day: 0, tripKey: 'trip-prior', tripNumber: 1, routeId: 'r', city: 'dunhuang' });
  startTrip(d); begin(d, 'QY03', 'repack'); assert.strictEqual(d.p.cash, 398); let s = act(d, 'QY03'); assert.strictEqual(storyLots(d).length, 1);
  jumpTo(d, 'khotan', 2); S.stories.arrived(d.p); assert.ok(line(d, 'QY03').completedChapters.includes('QY03_2') && line(d, 'QY03').flags.boxIncident.outcome === 'intact_no_incident');
  begin(d, 'QY03'); s = act(d, 'QY03', 'open'); assert.ok(storyLots(d).length === 0 && line(d, 'QY03').flags.voucher?.obtained === true && s.r.voucher, 'opened: box gone, voucher held');
  const snap = S.stories.snapshot(d.p, S.core.context('t')).find(x => x.lineId === 'QY03'); assert.ok(snap.vouchers.length === 1 && snap.vouchers[0].label === '旧货票');
  jumpTo(d, 'dunhuang', 3); begin(d, 'QY03'); s = act(d, 'QY03'); assert.ok(s.cash === 15 && s.rep === 3 && s.r.finale === true && line(d, 'QY03').flags.voucherReturned === true);
  const f = assertFinale(d, 'QY03'); assert.strictEqual(f.gains.netCash, -2 + 15); assert.ok(f.recap[1].text === '箱上的旧封仍在。' && f.recap[2].text.includes('旧货票') && f.gains.cargoRows.some(r => r.includes('旧货票')), JSON.stringify(f.recap));
});
test('QY03: damaged box opened → 10/+1; returned unopened → no voucher, box travels back, 15/+3', () => {
  const setup = seed => { const d = fresh(seed, 12); d.p.tripHistory.push({ id: 'trip-prior', status: 'completed', onTimeReturn: true, startedAt: 0, arrivedAt: 1, summary: null }); d.p.events.history.push({ eventId: 'R08', sessionId: 'x', day: 0, tripKey: 'trip-prior', tripNumber: 1, routeId: 'r', city: 'dunhuang' }); startTrip(d); begin(d, 'QY03', 'carry'); act(d, 'QY03'); return d; };
  let d = setup(306); S.inventory.damage(d.p, storyLots(d)[0].id, 'impact', { quantity: 1 }); jumpTo(d, 'khotan', 2); S.stories.arrived(d.p); assert.strictEqual(line(d, 'QY03').flags.boxIncident.outcome, 'damaged');
  begin(d, 'QY03'); act(d, 'QY03', 'open'); jumpTo(d, 'dunhuang', 3); begin(d, 'QY03'); let s = act(d, 'QY03'); assert.ok(s.cash === 10 && s.rep === 1); assertFinale(d, 'QY03');
  d = setup(307); jumpTo(d, 'khotan', 2); S.stories.arrived(d.p); begin(d, 'QY03'); s = act(d, 'QY03', 'return'); assert.ok(storyLots(d).length === 1 && !line(d, 'QY03').flags.voucher, 'unopened: box kept, no voucher');
  jumpTo(d, 'dunhuang', 3); begin(d, 'QY03'); s = act(d, 'QY03'); assert.ok(s.cash === 15 && s.rep === 3 && storyLots(d).length === 0); const f = assertFinale(d, 'QY03'); assert.ok(f.gains.cargoRows.some(r => r.includes('原封送回')) && f.recap[2].text.includes('原封'));
});
test('QY04 织坊东行 (supplied): samples kept after 敦煌 10/+1; small order; 只报行情 keeps samples; 于阗 swap is atomic; 长安 delivery 22/+4 → finale', () => {
  const d = fresh(308, 25); d.p.commissions.results.push({ status: 'completed', goodId: '于阗丝织', tripId: 'x' }); startTrip(d); jumpTo(d, 'khotan', 2);
  begin(d, 'QY04', 'safe'); assert.strictEqual(storyLots(d)[0].slotCost, 2); jumpTo(d, 'dunhuang', 3); let s = act(d, 'QY04'); assert.ok(s.cash === 10 && s.rep === 1 && storyLots(d).length === 1, 'samples not removed at 敦煌');
  begin(d, 'QY04'); s = act(d, 'QY04', 'small'); assert.strictEqual(line(d, 'QY04').flags.orderSize, 2);
  jumpTo(d, 'changan', 4); begin(d, 'QY04'); const obs = d.p.messages.observations.length; s = act(d, 'QY04', 'observe'); assert.ok(s.cash === 0 && storyLots(d).length === 1 && d.p.messages.observations.length === obs + 1 && /^今日/.test(s.r.text), 'observation only');
  jumpTo(d, 'khotan', 2); begin(d, 'QY04'); const cash0 = d.p.cash; s = act(d, 'QY04'); assert.ok(s.r.kind === 'storyStageSettled' && s.cash === 0 && storyLots(d).length === 1 && storyLots(d)[0].storyCargoKind === 'QY04_ORDER' && storyLots(d)[0].storyUnits.length === 2 && line(d, 'QY04').activeChapter.phase === 'delivery' && line(d, 'QY04').flags.orderType === 'supplied', 'old samples gone, order cargo generated in one transaction');
  assert.strictEqual(d.p.cash, cash0);
  jumpTo(d, 'changan', 4); s = act(d, 'QY04'); assert.ok(s.cash === 22 && s.rep === 4 && s.r.finale === true && storyLots(d).length === 0, '22/+4');
  const f = assertFinale(d, 'QY04'); assert.strictEqual(f.gains.netCash, 10 + 22); assert.ok(cashRow(f, '订单酬劳').amount === 22 && !cashRow(f, '采买本金返还') && f.recap[3].text.includes('织坊备下'), JSON.stringify(f.gains.cashRows));
});
test('QY04 (procurement, large order, damage): sell samples (受损件 70 % 向上取整), pay 4 × 于阗 price, principal refunded in full + 18 on 1 damaged unit', () => {
  const d = fresh(309, 25); d.p.cash = 2000; d.p.inventory.camelCount = 4; d.p.commissions.results.push({ status: 'completed', goodId: '于阗丝织', tripId: 'x' }); startTrip(d); jumpTo(d, 'khotan', 2);
  begin(d, 'QY04', 'compressed'); jumpTo(d, 'dunhuang', 3); act(d, 'QY04'); begin(d, 'QY04'); d.p.trip.deadlineTick = d.p.world.tick + 200; assert.ok(S.stories.largeOrderEligible(d.p), 'large order available with slots and time'); act(d, 'QY04', 'large');
  jumpTo(d, 'changan', 4); begin(d, 'QY04'); S.inventory.damage(d.p, storyLots(d)[0].id, 'impact', { quantity: 1 }); const price = S.market.quote(d.p, 'changan', '于阗丝织');
  let s = act(d, 'QY04', 'sell'); const expected = storyLots.length ? 0 : 0; void expected; assert.ok(s.cash === 2 * Math.ceil(price * .7) && storyLots(d).length === 0, 'compressed: both units damaged → 2 × ceil(70 %): ' + s.cash + ' vs price ' + price);
  jumpTo(d, 'khotan', 2); begin(d, 'QY04'); const kp = S.market.quote(d.p, 'khotan', '于阗丝织'); s = act(d, 'QY04'); assert.ok(s.cash === -4 * kp && line(d, 'QY04').flags.procurementPrincipal === 4 * kp && storyLots(d)[0].storyUnits.length === 4, 'pays the whole batch at once');
  S.inventory.damage(d.p, storyLots(d)[0].id, 'impact', { quantity: 1 }); jumpTo(d, 'changan', 4); s = act(d, 'QY04'); assert.ok(s.cash === 4 * kp + 20 && s.rep === 2, 'principal back in full + 20 (大单1件受损)');
  const f = assertFinale(d, 'QY04'); assert.ok(cashRow(f, '采买本金支出').amount === -4 * kp && cashRow(f, '采买本金返还').amount === 4 * kp && cashRow(f, '订单酬劳').amount === 20);
});
test('QY05 河西药帖: 4 钱 for every route · ch3 needs 2 intact 药材 (stable), reference cost + 12 (+2 when supply is tight) + 2 商誉 · ch4 14/+3 → finale (five chapters)', () => {
  const d = fresh(310, 12); d.p.commissions.results.push({ status: 'completed', goodId: '药材', tripId: 'x' }); startTrip(d); begin(d, 'QY05');
  jumpTo(d, 'changan', 4); const noVisit = d.tryRun('story.act', { lineId: 'QY05' }); assert.ok(!noVisit.ok && noVisit.code === 'STORY_MARKET_VISIT_REQUIRED');
  d.run('market.enter'); d.run('market.leave', { visitId: d.p.market.visit.id }); d.ack(); let s = act(d, 'QY05'); assert.strictEqual(s.cash, 0);
  begin(d, 'QY05'); s = act(d, 'QY05', 'stable'); assert.ok(s.cash === 4 && s.rep === 0);
  jumpTo(d, 'dunhuang', 3); begin(d, 'QY05'); const a = line(d, 'QY05').activeChapter; assert.ok(a.quantity === 2 && a.referenceCost === 2 * a.referenceUnitPrice && [12, 14].includes(a.storyReward), 'locked reference + reward');
  S.inventory.add(d.p, { goodId: '药材', quantity: 1, acquisitionPrice: 10 }); const short = d.tryRun('story.act', { lineId: 'QY05' }); assert.ok(!short.ok && short.code === 'STORY_GOODS_REQUIRED' && d.p.inventory.lots.some(l => l.goodId === '药材'), 'not enough: kept, nothing deducted');
  S.inventory.add(d.p, { goodId: '药材', quantity: 1, acquisitionPrice: 10 }); s = act(d, 'QY05'); assert.ok(s.cash === a.referenceCost + a.storyReward && s.rep === 2 && s.r.lines[0].label === '药材款' && s.r.lines[1].label === '跑商酬劳' && s.r.lines[1].amount === 12 && (a.storyReward === 12 ? s.r.lines.length === 2 : s.r.lines[2].label === '临时添酬' && s.r.lines[2].amount === 2), JSON.stringify(s.r.lines));
  jumpTo(d, 'changan', 4); begin(d, 'QY05'); s = act(d, 'QY05'); assert.ok(s.cash === 14 && s.rep === 3 && s.r.finale === true); const f = assertFinale(d, 'QY05'); assert.ok(f.recap[2].text === '你送去了两份药材。' && f.recap[3].text.startsWith('“你带回的价不算最高') && f.subtitle === '一纸成价' && f.closeLabel === '收起药帖');
});
test('QY05 high routes: truthful → 1 件 / 18/+2 ; exaggerated → 3 件 / 10/+1', () => {
  for (const [seed, disclosure, qty, cash4, rep4] of [[311, 'highTruthful', 1, 18, 2], [312, 'highExaggerate', 3, 10, 1]]) {
    const d = fresh(seed, 12); d.p.inventory.camelCount = 4; d.p.commissions.results.push({ status: 'completed', goodId: '药材', tripId: 'x' }); startTrip(d); begin(d, 'QY05'); jumpTo(d, 'changan', 4); d.run('market.enter'); d.run('market.leave', { visitId: d.p.market.visit.id }); d.ack(); act(d, 'QY05');
    begin(d, 'QY05'); let s = act(d, 'QY05', 'high'); assert.ok(s.r.kind === 'storyChapterOpened' && s.cash === 0, 'high → disclosure step'); s = act(d, 'QY05', disclosure); assert.strictEqual(s.cash, 4);
    jumpTo(d, 'dunhuang', 3); begin(d, 'QY05'); assert.strictEqual(line(d, 'QY05').activeChapter.quantity, qty); S.inventory.add(d.p, { goodId: '药材', quantity: qty, acquisitionPrice: 10 }); s = act(d, 'QY05'); assert.strictEqual(s.rep, 2);
    jumpTo(d, 'changan', 4); begin(d, 'QY05'); s = act(d, 'QY05'); assert.ok(s.cash === cash4 && s.rep === rep4, disclosure + ': ' + s.cash + '/' + s.rep); assertFinale(d, 'QY05');
  }
});
test('QY06 三路归一: steady 纸张 ×4 · 敦煌 reconfigure (3 slots) · keep · 敦煌 stage 12 paid at once · 长安 45/+5 → finale; damaged variant 10 then 41', () => {
  for (const [seed, damageIt] of [[313, false], [314, true]]) {
    const d = fresh(seed, 45); d.p.inventory.camelCount = 4; for (const id of ['QY01', 'QY03', 'QY05']) d.p.stories.lines[id] = closedLine(id);
    begin(d, 'QY06'); let s = act(d, 'QY06', 'steady:纸张'); assert.ok(line(d, 'QY06').flags.branch === 'steady' && line(d, 'QY06').flags.originalGoodId === '纸张');
    startTrip(d); begin(d, 'QY06'); s = act(d, 'QY06', 'prepare'); assert.ok(s.cash === 0 && line(d, 'QY06').flags.preparation === true);
    jumpTo(d, 'khotan', 2); begin(d, 'QY06'); s = act(d, 'QY06', 'keep'); assert.ok(storyLots(d)[0].slotCost === 3 && storyLots(d)[0].storyUnits.length === 4 && storyLots(d)[0].storyPacking === 'pairedFirstTwo');
    if (damageIt) S.inventory.damage(d.p, storyLots(d)[0].id, 'impact', { quantity: 1, storyUnitIndex: 3 });
    jumpTo(d, 'dunhuang', 3); begin(d, 'QY06'); s = act(d, 'QY06'); assert.ok(s.r.kind === 'storyStageSettled' && s.cash === (damageIt ? 10 : 12) && s.rep === 0 && storyLots(d).length === 1 && line(d, 'QY06').activeChapter.phase === 'delivery', '敦煌 stage: ' + s.cash);
    const again = d.tryRun('story.act', { lineId: 'QY06' }); assert.ok(!again.ok && again.code === 'STORY_WRONG_CITY', 'stage cannot be paid twice (delivery is in 长安)');
    jumpTo(d, 'changan', 4); s = act(d, 'QY06'); assert.ok(s.cash === (damageIt ? 41 : 45) && s.rep === 5 && s.r.finale === true && storyLots(d).length === 0, '长安: ' + s.cash);
    const f = assertFinale(d, 'QY06'); assert.strictEqual(f.gains.netCash, damageIt ? 51 : 57); assert.ok(f.recap[0].text.includes('纸张 × 4') && f.recap[2].text === '于阗换单：坚持原货。' && f.subtitle === '长安结契' && f.closeLabel === '收起三城货目');
    assert.ok(cashRow(f, '路线基础酬劳').amount === 45 && (damageIt ? cashRow(f, '货损扣减').amount === -4 : !cashRow(f, '货损扣减')));
  }
});
test('QY06 value 于阗玉 with 3 钱 protection: first compatible hit cancelled (actuallyProtected) → 敦煌 12 + 3, switch to 漆器 → 长安 35/+5; minimum 20', () => {
  const d = fresh(315, 45); d.p.inventory.camelCount = 4; for (const id of ['QY01', 'QY03', 'QY05']) d.p.stories.lines[id] = closedLine(id);
  begin(d, 'QY06'); act(d, 'QY06', 'value:于阗玉'); startTrip(d); begin(d, 'QY06'); let s = act(d, 'QY06', 'prepare'); assert.strictEqual(s.cash, -3);
  jumpTo(d, 'khotan', 2); begin(d, 'QY06'); s = act(d, 'QY06', 'switch'); assert.strictEqual(line(d, 'QY06').flags.orderGoodId, '漆器');
  const hit = S.inventory.damage(d.p, storyLots(d)[0].id, 'impact', { quantity: 1 }); assert.ok(hit.storyProtected === true && line(d, 'QY06').flags.actuallyProtected === true && storyLots(d)[0].storyUnits.every(u => u.condition === 'intact'), 'first hit cancelled');
  jumpTo(d, 'dunhuang', 3); begin(d, 'QY06'); s = act(d, 'QY06'); assert.strictEqual(s.cash, 8 + 3, 'switched 8 + protected 3');
  jumpTo(d, 'changan', 4); s = act(d, 'QY06'); assert.ok(s.cash === 35 && s.rep === 5); const f = assertFinale(d, 'QY06'); assert.ok(f.recap[3].text.includes('真正护住') && f.recap[2].text === '于阗换单：改换为漆器。');
});
test('story cargo never reaches the market or 一键出售; refused repeats keep money, 商誉 and cargo unchanged', () => {
  const d = fresh(316, 25); d.p.merchant.suppliers['于阗玉'] = { stage: 'established', discountRate: 0, sourceCity: 'khotan' }; startTrip(d); jumpTo(d, 'khotan', 2); begin(d, 'QY02');
  d.run('market.enter'); const v = d.p.market.visit; const sell = d.tryRun('market.sell', { visitId: v.id, goodId: '于阗玉', quantity: 1 }); assert.ok(!sell.ok && sell.code === 'NOT_MARKETABLE');
  const all = d.tryRun('market.sellAll', { visitId: v.id }); assert.ok(!all.ok && all.code === 'NO_MARKETABLE_GOODS'); assert.strictEqual(S.market.marketableLots(d.p, '于阗玉').length, 0);
  assert.strictEqual(storyLots(d).length, 1); assert.ok(S.inventory.used(d.p) >= 1, 'story cargo occupies its slot');
});
test('save compatibility: completed 4-chapter QY03 (old shape) gains the finale chapter + snapshot; QY01 standing at the abolished chapter 5 closes with nothing paid; QY02/QY04/QY06 standing at the old chapter 5 keep exactly the settlement still owed', () => {
  const d = fresh(317, 30); d.p.inventory.camelCount = 4;
  d.p.stories.lines.QY03 = { lineId: 'QY03', status: 'closed', completed: true, completedChapters: ids.QY03.slice(0, 4), activeChapter: null, flags: { boxChoice: 'open', boxCondition: 'intact', ending: 'open' }, lastCompletedTrip: null };
  d.p.stories.history.push({ kind: 'storyChapterCompleted', lineId: 'QY03', chapterId: 'QY03_4', actualCash: 15, actualReputation: 3, choiceId: 'continue' });
  d.p.stories.lines.QY01 = { lineId: 'QY01', status: 'waiting', completedChapters: ids.QY01.slice(0, 4), activeChapter: null, flags: { qy01_exaggerated: false }, lastCompletedTrip: 'old' };
  d.p.stories.lines.QY02 = { lineId: 'QY02', status: 'waiting', completedChapters: ids.QY02.slice(0, 4), activeChapter: null, flags: { branch: 'honest', qy02_report: 'full' }, lastCompletedTrip: 'old' };
  d.p.stories.lines.QY04 = { lineId: 'QY04', status: 'waiting', completedChapters: ids.QY04.slice(0, 4), activeChapter: null, flags: { orderSize: 2, orderType: 'supplied', procurementPrincipal: 0, sampleDecision: 'observe', packing: 'safe', knownDestination: 'changan' }, lastCompletedTrip: 'old' };
  S.inventory.add(d.p, { goodId: '于阗丝织', storyLabel: '织坊正式订单', quantity: 1, acquisitionPrice: 0, slotCost: 2, fragile: false, ownership: 'storyOwned', nonMarketable: true, storyLineId: 'QY04', storyChapterId: 'QY04_4', storyCargoKind: 'QY04_ORDER', storyMaxCondition: 'damaged', storyPacking: 'individual', storyUnits: [{ goodId: '于阗丝织', condition: 'intact' }, { goodId: '于阗丝织', condition: 'intact' }] });
  const env = JSON.parse(JSON.stringify(d.envelope())); env.meta.balanceVersion = '2026-09-13-weighted-avg-cost'; env.ledger = {}; env.pending = null; env.results = {}; env.preferences = { tutorialEnabled: true, soundEnabled: true };
  const cash = env.progress.cash, rep = env.progress.reputation.value; S.core.validate(env); const up = S.core.upgradeEnvelope(env); assert.ok(up.changed); const p = up.state.progress;
  assert.ok(p.cash === cash && p.reputation.value === rep, 'migration pays nothing');
  assert.ok(p.stories.lines.QY03.completedChapters.length === 5 && p.stories.lines.QY03.finalSnapshot && p.stories.lines.QY03.finalSnapshot.netCash === 15, 'QY03 folded');
  assert.ok(p.stories.lines.QY01.status === 'closed' && p.stories.lines.QY01.completedChapters.length === 5 && p.stories.lines.QY01.finalSnapshot, 'QY01 closed without the abolished reward');
  assert.ok(p.stories.lines.QY02.flags.legacyFinalChapter === true && p.stories.lines.QY02.status === 'waiting' && p.stories.lines.QY04.flags.legacyFinalChapter === true, 'legacy lines flagged');
  S.core.validate(up.state); assert.strictEqual(S.core.upgradeEnvelope(up.state).changed, false);
  // the legacy QY02 line settles its old chapter 5 (= the still-owed main route 18/+4) exactly once, then finalises
  const e = driver(S, 318); e.p = p; e.p.stories.lastNewChapterTrip = null; e.p.world.city = 'changan'; e.quietCity(60);
  let r = e.run('story.begin', { lineId: 'QY02' }); e.ack(); const c0 = e.p.cash, r0 = e.p.reputation.value; r = e.run('story.act', { lineId: 'QY02' }); e.ack();
  assert.ok(e.p.cash - c0 === 18 && e.p.reputation.value - r0 === 4 && r.finale === true && e.p.stories.lines.QY02.status === 'closed' && !e.p.stories.lines.QY02.flags.legacyFinalChapter, 'legacy QY02: 18/+4 once');
  const dup = e.tryRun('story.act', { lineId: 'QY02' }); assert.ok(!dup.ok && e.p.cash - c0 === 18);
  // the legacy QY04 line delivers its order in 长安 (old chapter 5) and finalises
  e.p.stories.lastNewChapterTrip = null; r = e.run('story.begin', { lineId: 'QY04' }); e.ack(); const c1 = e.p.cash; r = e.run('story.act', { lineId: 'QY04' }); e.ack();
  assert.ok(e.p.cash - c1 === 22 && r.finale === true && e.p.stories.lines.QY04.status === 'closed' && !e.p.inventory.lots.some(l => l.ownership === 'storyOwned'), 'legacy QY04: 22 once, cargo removed');
  S.core.validate(e.envelope());
});
test('cards: six permanent cards from the definition table with the final names; completed lines stay listed; 0-tick reads', () => {
  const d = fresh(319, 45); for (const id of ['QY01', 'QY03', 'QY05']) d.p.stories.lines[id] = closedLine(id); const tick = d.p.world.tick, before = JSON.stringify(d.p);
  const rows = S.stories.snapshot(d.p, S.core.context('t')); assert.strictEqual(rows.map(r => r.lineId).join(), 'QY01,QY02,QY03,QY04,QY05,QY06');
  assert.strictEqual(rows.map(r => r.name).join('|'), '一卷西行经|玉料两价|风沙旧箱|织坊东行|河西药帖|三路归一');
  assert.ok(rows.filter(r => r.displayStatus === 'completed').length === 3 && rows.every(r => r.finale ? r.displayStatus === 'completed' : true), 'completed cards kept with finale');
  assert.ok(rows.find(r => r.lineId === 'QY06').displayStatus === 'available' && rows.find(r => r.lineId === 'QY02').displayStatus === 'locked');
  assert.ok(JSON.stringify(d.p) === before && d.p.world.tick === tick, 'read model is pure');
  const src = require('fs').readFileSync(require('path').join(process.env.SILK_ROOT || require('path').join(__dirname, '..'), 'business-ui.js'), 'utf8'); assert.ok(!/商路起源|丝路奇缘|思路起源/.test(src) && /商路奇缘/.test(src), 'only the final system name in the UI');
});
console.log(`商路奇缘: ${passed}/15 passed`);
