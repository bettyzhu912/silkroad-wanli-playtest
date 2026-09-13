'use strict';
// COMMISSION_SYSTEM_MASTER_PATCH v3.0 — regression CASE 01–12 (七) plus the structural guarantees of 五 A–L, 六 (migration) and 十 A–N.
const fs = require('fs');
const path = require('path');
const { load, driver } = require('./harness');
const ctx = load();
const S = ctx.Silk;
const results = [];
function test(id, title, fn) { const t0 = Date.now(); try { const details = fn() || []; results.push({ id, title, pass: true, details, ms: Date.now() - t0 }); } catch (e) { results.push({ id, title, pass: false, details: [String(e && e.stack || e)], ms: Date.now() - t0 }); } }
function assert(cond, msg) { if (!cond) throw new Error('ASSERT: ' + msg); }
const src = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
let postN = 0;
// A board candidate in the exact shape fillBoard posts (fixed rewards, so no price authority is needed); accepted through the real command.
function post(d, over = {}) {
  const row = { templateId: 'TEST-' + (++postN), title: ({ delivery: '捎货', procurement: '采买', wanted: '求货' })[over.type || 'wanted'] + ' · ' + (over.goodId || '绢帛'), text: 't', originalAttributesText: '—', type: 'wanted', scale: 'good', goodId: '绢帛', quantity: 1, requiredSlots: over.quantity || 1, sourceCity: 'changan', pickupCity: null, procurementCity: null, deliveryCity: 'changan', segmentCount: 0, urgent: false, handoffPhase: null, valuable: false, fragile: false, rare: false, longHaul: false, replaceable: true, rewardCash: 50, referencePrice: 24, rewardRate: .2, reputationReward: 2, status: 'available', urgentArrivalTick: null, urgentWindow: null, ...over };
  row.commissionId = over.commissionId || 'c-' + postN; row.postedTick = d.p.world.tick;
  d.p.commissions.board.push(row); return row.commissionId;
}
const active = (d, id) => d.p.commissions.active.find(c => c.commissionId === id);
const archived = (d, id) => d.p.commissions.history.find(c => c.commissionId === id);
function sync(d) { d.run('notice.dismiss', { ids: [] }); }   // any 0-tick command runs the after-command board sync
function accept(d, id) { const r = d.run('commission.accept', { commissionId: id }); d.ack(); return r; }
function startTrip(d) { while (S.time.phase(d.p) === 2) d.overnight(); d.run('trip.begin'); d.run('trip.depart', { acknowledgeSupplyWarning: true }); }
function travel(d) { while (S.time.phase(d.p) === 2) d.overnight('camp'); d.run('trip.depart', { acknowledgeSupplyWarning: true }); d.journeyToArrival(); }
function toMorning(d) { while (S.time.phase(d.p) !== 0) { if (S.time.phase(d.p) === 2) d.overnight(); else { d.run('inn.wait', { ticks: 1 }); d.ack(); } } }
function buy(d, goodId, quantity) { while (S.time.phase(d.p) === 2) d.overnight(); d.run('market.enter'); const v = d.p.market.visit; d.run('market.buy', { visitId: v.id, goodId, quantity }); d.ack(); d.run('market.leave', { visitId: v.id }); d.ack(); d.resolveEvent(); d.ack(); }
function sell(d, goodId, quantity) { while (S.time.phase(d.p) === 2) d.overnight(); d.run('market.enter'); const v = d.p.market.visit; d.run('market.sell', { visitId: v.id, goodId, quantity }); d.ack(); d.run('market.leave', { visitId: v.id }); d.ack(); d.resolveEvent(); d.ack(); }
const held = (d, goodId) => d.p.inventory.lots.filter(l => l.goodId === goodId && l.ownership === 'playerOwned').reduce((n, l) => n + l.quantity, 0);
const eligible = (d, goodId) => d.p.world.currentArrival ? (d.p.world.currentArrival.eligibleCargoCounts[goodId] || 0) : null;
function reload(d) { const env = JSON.parse(JSON.stringify(d.envelope())); S.core.validate(env); const up = S.core.upgradeEnvelope(env); assert(up.changed === false, 'current save must not change on reload'); d.p = up.state.progress; return d.p; }
function fresh(seed, rep, cash = 400) { const d = driver(S, seed); d.p.reputation.value = rep; d.p.cash = cash; d.p.inventory.provisions = 40; d.quietCity(300); d.quietRoute(300); return d; }
function finishTrip(d) { while (d.p.trip.phase === 'returned_at_dusk_pending_rest') d.overnight('stay'); for (const [task, status] of Object.entries(S.trip.returnView(d.p).tasks)) if (status === 'pending') d.run('trip.resolveReturnTask', { task, decision: 'deferred' }); const summary = d.run('trip.finalize'); d.ack(); assert(d.p.trip === null, 'trip closed'); return summary; }

// ---------------------------------------------------------------- CASE 01
test('CASE-01', '长安启程时商誉4，途中4→5：不回长安，顶部【委托】立刻 0/1 与 3 个候选，可马上接（含 4→6 / 3→7 / 4→21）', () => {
  const d = fresh(301, 4);
  startTrip(d); assert(d.p.commissions.board.length === 0 && S.commissions.capacity(d.p) === 0, 'nothing before 5');
  d.run('trip.journey'); d.ack(); assert(d.p.world.route, 'on the road');
  d.p.reputation.value = 5; d.run('trip.journey'); d.ack();           // the gain lands during the journey; the next command syncs the board
  assert(d.p.world.route && d.p.world.city === 'changan', 'still on the 长安→敦煌 road');
  const snap = S.commissions.snapshot(d.p);
  assert(snap.capacity === 1 && snap.activeCount === 0 && snap.locked === false && snap.board.length === 3, 'snapshot 0/1 with 3 candidates: ' + JSON.stringify([snap.capacity, snap.activeCount, snap.board.length]));
  const r = d.tryRun('commission.accept', { commissionId: snap.board[0].commissionId }); assert(r.ok, 'accept on the road: ' + r.code + ' ' + r.message); d.ack();
  assert(d.p.commissions.active.length === 1 && d.p.commissions.board.length === 2 && d.p.world.route, 'accepted while travelling');
  const variants = [];
  for (const [seed, from, to, board, cap] of [[311, 4, 6, 3, 1], [312, 3, 7, 3, 1], [313, 4, 21, 7, 3]]) { const e = fresh(seed, from); sync(e); assert(e.p.commissions.board.length === 0, 'locked below 5'); e.p.reputation.value = to; sync(e); assert(e.p.commissions.board.length === board && S.commissions.capacity(e.p) === cap, from + '→' + to + ' gives ' + board + ' / ' + cap + ', got ' + e.p.commissions.board.length + ' / ' + S.commissions.capacity(e.p)); variants.push(from + '→' + to + ':' + board + '/' + cap); }
  return ['on-road unlock: 0/1, 3 candidates, accepted on route', 'variants ' + variants.join(' ')];
});
// ---------------------------------------------------------------- CASE 02
test('CASE-02', '旧存档 reputation=21 / active 0 / board empty：更新后 0/3、7 个候选，不要求重新启程；再次读档不再 Roll', () => {
  const d = driver(S, 302); d.p.reputation.value = 21; d.p.cash = 400;
  const env = JSON.parse(JSON.stringify(d.envelope())); env.meta = { ...S.core.versions, balanceVersion: '2026-09-13-qiyuan-final', generation: 0, revision: 9 }; env.preferences = { tutorialEnabled: false, soundEnabled: true }; env.ledger = {}; env.pending = null; env.results = {};
  const p = env.progress; p.commissions = { pool: [], active: [], results: [], history: [], starterGenerated: false, poolTripId: null, generatedReputation: null, templateHistory: [] }; delete p.world.arrivalSequence; delete p.world.currentArrival; p.departureDraft = null;
  const up = S.core.upgradeEnvelope(env); assert(up.changed, 'upgraded'); const q = up.state.progress; S.core.validate(up.state);
  assert(q.commissions.board.length === 7 && S.commissions.capacity(q) === 3 && q.commissions.active.length === 0 && q.trip === null, 'board 7, 0/3, no trip: ' + q.commissions.board.length);
  assert(q.commissions.boardMigrated && q.commissions.boardMigrated.added === 7 && q.commissions.boardMigrated.migratedCandidates === 0 && q.departureDraft === undefined && q.commissions.pool === undefined, 'migration flags');
  const ids = q.commissions.board.map(c => c.commissionId).join();
  const again = S.core.upgradeEnvelope(JSON.parse(JSON.stringify(up.state))); assert(again.changed === false && again.state.progress.commissions.board.map(c => c.commissionId).join() === ids, 'second load: no second roll');
  return ['7 candidates after upgrade, capacity 3, no trip', 'reload keeps ' + ids.split(',').length + ' ids'];
});
// ---------------------------------------------------------------- CASE 03
test('CASE-03', '商誉≥5 有候选：【开始行程】不再有出发前委托列表 / 选定按钮，只有一行"有委托可接，可在顶部【委托】中查看。"', () => {
  const d = fresh(303, 12); sync(d); assert(d.p.commissions.board.length === 5, 'board 5');
  const r = d.run('trip.begin'); assert(r.kind === 'departurePrepared' && r.commissionHint === true && d.p.trip === null && d.p.departureDraft === undefined, 'begin is a 0-tick prepare with a hint only: ' + JSON.stringify(r));
  const view = S.trip.departureView(d.p); assert(view.commissionHint === true && !('draft' in view) && !('pendingPickupIds' in view), 'departure view knows only whether something is acceptable');
  assert(!S.commands.has('trip.draftSelect') && !S.trip.ensureDraft && !S.commissions.draftView && !S.commissions.activateDraft, 'draft API gone');
  const ui = src('trade-travel-ui.js'), bui = src('business-ui.js');
  assert(ui.includes('有委托可接，可在顶部【委托】中查看。') && !ui.includes('选定（启程时承接）') && !ui.includes('出发前委托') && !ui.includes('departure-commissions') && !/departureDraft|draftSelect/.test(ui), 'departure page copy');
  assert(!bui.includes('选定') && !bui.includes('出发前候选') && !bui.includes('本商期委托') && bui.includes('可接委托'), 'commission panel copy');
  for (const id of d.p.commissions.board.slice(0, 2).map(c => c.commissionId)) accept(d, id);   // capacity 2 at 商誉12 → nothing more acceptable → no hint
  assert(S.trip.departureView(d.p).commissionHint === false && d.run('trip.begin').commissionHint === false, 'no hint when nothing can be accepted');
  return ['begin: departurePrepared + hint', 'no draft API / copy', 'hint off when capacity is full'];
});
// ---------------------------------------------------------------- CASE 04
test('CASE-04', '第一趟接到普通委托 → 返长安 → 商旅总结 → 结束 → 第二趟启程：任务仍 ACTIVE，deadline 不重置，候选不重 Roll', () => {
  const d = fresh(304, 12, 600); sync(d);
  const id = post(d, { goodId: '纸张', deliveryCity: 'khotan', sourceCity: 'dunhuang' });
  startTrip(d); d.journeyToArrival(); assert(d.p.world.city === 'dunhuang', '敦煌');
  accept(d, id); const deadline = active(d, id).deadlineWorldTick, acceptedAt = active(d, id).acceptedAtWorldTick; assert(deadline === acceptedAt + 90, '+90');
  const boardBefore = d.p.commissions.board.map(c => c.commissionId);
  travel(d); travel(d); travel(d); assert(d.p.world.city === 'changan' && d.p.trip.arrivedChanganTick !== null, 'back in 长安');
  const summary = finishTrip(d);
  assert(summary.kind === 'tripSummary' && summary.commissions.completed === 0 && summary.commissions.failed === 0 && summary.commissions.stillActive === 1, 'summary counts nothing settled, one still active: ' + JSON.stringify(summary.commissions));
  const a = active(d, id); assert(a && a.status === 'accepted' && a.deadlineWorldTick === deadline && a.acceptedAtWorldTick === acceptedAt, 'still active with the same deadline after finalize / finish');
  assert(boardBefore.every(x => d.p.commissions.board.some(c => c.commissionId === x)), 'earlier candidates never re-rolled');
  assert(d.p.commissions.results.length === 0 && d.p.commissions.history.length === 0, 'no failure recorded by the trip end');
  toMorning(d); d.run('trip.begin'); d.run('trip.depart', { acknowledgeSupplyWarning: true }); assert(d.p.trip && d.p.tripHistory.length === 1, 'second trip started');
  const b = active(d, id); assert(b && b.status === 'accepted' && b.deadlineWorldTick === deadline, 'still active with the same deadline after the second startTrip');
  return ['deadline ' + deadline + ' unchanged across finalize / finish / startTrip', 'board ids kept'];
});
// ---------------------------------------------------------------- CASE 05
test('CASE-05', 'accepted tick = 100 → deadline = 190：≤190 可交，>190 失效（独立 30 世界日）', () => {
  const d = fresh(305, 12, 800);
  while (d.p.world.tick < 100) { if (S.time.phase(d.p) === 2) d.overnight('restOutside'); else { d.run('inn.wait', { ticks: 1 }); d.ack(); } }
  assert(d.p.world.tick === 100, 'tick 100');
  const id = post(d, { goodId: '绢帛', deliveryCity: 'changan', quantity: 1 }); accept(d, id);
  assert(active(d, id).acceptedAtWorldTick === 100 && active(d, id).deadlineWorldTick === 190, 'deadline 190');
  buy(d, '绢帛', 1); startTrip(d); d.journeyToArrival(); travel(d); travel(d); travel(d); assert(d.p.world.city === 'changan', 'round trip done at tick ' + d.p.world.tick);
  assert(d.p.world.tick < 190 && S.commissions.deliveryEligibility(d.p, active(d, id)).ok === true, 'deliverable after bringing the goods in (tick ' + d.p.world.tick + ')');
  while (d.p.trip.phase === 'returned_at_dusk_pending_rest') d.overnight('stay');
  while (d.p.world.tick < 190) { if (S.time.phase(d.p) === 2) d.overnight('stay'); else { d.run('inn.wait', { ticks: 1 }); d.ack(); } }
  assert(d.p.world.tick === 190 && active(d, id) && active(d, id).status === 'accepted' && S.commissions.deliveryEligibility(d.p, active(d, id)).ok === true, 'at 190 still deliverable');
  d.run('inn.wait', { ticks: 1 }); d.ack();
  assert(d.p.world.tick === 191 && !active(d, id) && archived(d, id) && archived(d, id).status === 'failed' && archived(d, id).failureReason === 'expired', 'at 191 expired: ' + JSON.stringify(archived(d, id) && [archived(d, id).status, archived(d, id).failureReason]));
  assert(d.p.commissions.results.some(r => r.commissionId === id && r.status === 'failed') && d.p.presentation.notices.some(n => n.kind === 'commissionFailure'), 'failure result + notice');
  return ['accepted 100 → deadline 190', 'deliverable at 190, expired at 191'];
});
// ---------------------------------------------------------------- CASE 06
test('CASE-06', '真实交付 Bug：敦煌接精制玉器委托 → 于阗取得 ×3 → 返回敦煌：3/3 已齐备、按钮可点、扣 3、发奖励、完成', () => {
  const d = fresh(306, 21, 3000); d.p.merchant.suppliers['精制玉器'] = { stage: 'established', discountRate: 0, sourceCity: 'khotan' };
  startTrip(d); d.journeyToArrival(); assert(d.p.world.city === 'dunhuang' && d.p.world.arrivalSequence === 1, '敦煌 arrival 1');
  const id = post(d, { goodId: '精制玉器', quantity: 3, requiredSlots: 3, sourceCity: 'dunhuang', deliveryCity: 'dunhuang', scale: 'entrusted', rewardCash: 900, reputationReward: 3 });
  accept(d, id); assert(active(d, id).acceptedAtArrivalSequence === 1, 'accepted at arrival 1');
  travel(d); assert(d.p.world.city === 'khotan' && d.p.world.arrivalSequence === 2, '于阗');
  buy(d, '精制玉器', 3); assert(held(d, '精制玉器') === 3, 'bought 3');
  let el = S.commissions.deliveryEligibility(d.p, active(d, id)); assert(!el.ok && el.code === 'WRONG_CITY' && el.have === 0, 'not deliverable in 于阗: ' + JSON.stringify(el));
  travel(d); assert(d.p.world.city === 'dunhuang' && d.p.world.arrivalSequence === 3 && eligible(d, '精制玉器') === 3, 'back in 敦煌 with 3 brought in');
  const row = S.commissions.snapshot(d.p).active.find(x => x.commissionId === id);
  assert(row.delivery.ok === true && row.delivery.have === 3 && row.delivery.need === 3 && row.delivery.prepared === true, 'UI result 3/3 已齐备 and enabled: ' + JSON.stringify(row.delivery));
  const cash = d.p.cash, rep = d.p.reputation.value;
  const r = d.run('commission.deliver', { commissionId: id }); d.ack();
  assert(r.kind === 'commissionDelivered' && r.actualCash === 900 && d.p.cash === cash + 900 && d.p.reputation.value === rep + 3 && held(d, '精制玉器') === 0 && eligible(d, '精制玉器') === 0, 'delivered: -3 goods, +900, +3 商誉');
  assert(!active(d, id) && archived(d, id).status === 'completed' && d.p.commissions.results.some(x => x.commissionId === id && x.status === 'completed'), 'completed and archived');
  return ['敦煌 accept (arrival 1) → 于阗 buy 3 (arrival 2) → 敦煌 (arrival 3): 3/3, delivered', 'cash +900, 商誉 +3'];
});
// ---------------------------------------------------------------- CASE 07
test('CASE-07', '敦煌接委托 deliveryCity=长安 → 于阗取得商品 → 最后到长安：正常交付（接取 / 取货 / 交付三城分离）', () => {
  const d = fresh(307, 12, 1500);
  startTrip(d); d.journeyToArrival(); const id = post(d, { goodId: '于阗丝织', quantity: 2, requiredSlots: 2, sourceCity: 'dunhuang', deliveryCity: 'changan', rewardCash: 200 }); accept(d, id);
  travel(d); buy(d, '于阗丝织', 2);
  travel(d); assert(d.p.world.city === 'dunhuang' && S.commissions.deliveryEligibility(d.p, active(d, id)).code === 'WRONG_CITY', 'passing 敦煌 again: wrong city');
  travel(d); assert(d.p.world.city === 'changan' && d.p.world.arrivalSequence === 4 && eligible(d, '于阗丝织') === 2, '长安 arrival 4');
  while (d.p.trip.phase === 'returned_at_dusk_pending_rest') d.overnight('stay');
  const el = S.commissions.deliveryEligibility(d.p, active(d, id)); assert(el.ok && el.have === 2, 'deliverable in 长安: ' + JSON.stringify(el));
  const r = d.run('commission.deliver', { commissionId: id }); d.ack(); assert(r.actualCash === 200 && archived(d, id).status === 'completed', 'delivered');
  return ['accepted 敦煌, goods 于阗, delivered 长安'];
});
// ---------------------------------------------------------------- CASE 08
test('CASE-08', '进入交付城市 eligible=2，本地买 1 → inventory 3 但 eligible 仍 2，不可交 3', () => {
  const d = fresh(308, 12, 800);
  const id = post(d, { goodId: '河西毛织', quantity: 3, requiredSlots: 3, sourceCity: 'dunhuang', deliveryCity: 'dunhuang' }); accept(d, id);
  buy(d, '河西毛织', 2); startTrip(d); d.journeyToArrival(); assert(d.p.world.city === 'dunhuang' && eligible(d, '河西毛织') === 2, 'arrived with 2 eligible');
  buy(d, '河西毛织', 1); assert(held(d, '河西毛织') === 3 && eligible(d, '河西毛织') === 2, 'local purchase does not add eligibility');
  const el = S.commissions.deliveryEligibility(d.p, active(d, id)); assert(!el.ok && el.have === 2 && el.need === 3 && el.code === 'LOCAL_GOODS', '2/3: ' + JSON.stringify(el));
  const r = d.tryRun('commission.deliver', { commissionId: id }); assert(!r.ok && r.code === 'CANNOT_DELIVER', 'submit refused too');
  return ['inventory 3, eligible 2 → 2/3 not deliverable'];
});
// ---------------------------------------------------------------- CASE 09
test('CASE-09', '入城带 3（eligible 3）→ 卖掉 3（eligible 0）→ 本地重新买 3：inventory 3、eligible 0，不可交付', () => {
  const d = fresh(309, 12, 800);
  const id = post(d, { goodId: '河西毛织', quantity: 3, requiredSlots: 3, sourceCity: 'dunhuang', deliveryCity: 'dunhuang' }); accept(d, id);
  buy(d, '河西毛织', 3); startTrip(d); d.journeyToArrival(); assert(eligible(d, '河西毛织') === 3 && S.commissions.deliveryEligibility(d.p, active(d, id)).ok, 'deliverable on arrival');
  sell(d, '河西毛织', 3); assert(held(d, '河西毛织') === 0 && eligible(d, '河西毛织') === 0, 'sold: eligible 0');
  buy(d, '河西毛织', 3); assert(held(d, '河西毛织') === 3 && eligible(d, '河西毛织') === 0, 'rebought locally: eligible stays 0');
  const el = S.commissions.deliveryEligibility(d.p, active(d, id)); assert(!el.ok && el.have === 0 && el.code === 'LOCAL_GOODS', '0/3: ' + JSON.stringify(el));
  const r = d.tryRun('commission.deliver', { commissionId: id }); assert(!r.ok && r.code === 'CANNOT_DELIVER', 'refused');
  return ['sell-and-rebuy cannot restore eligibility'];
});
// ---------------------------------------------------------------- CASE 10
test('CASE-10', '捎货 commissionOwned：不被 playerOwned 入城资格误拒（无 arrival 记录也能按委托货物交付）', () => {
  const d = fresh(310, 12, 400);
  const id = post(d, { type: 'delivery', goodId: '纸张', quantity: 2, requiredSlots: 2, sourceCity: 'changan', pickupCity: 'changan', deliveryCity: 'dunhuang', rewardCash: 20 });
  const r = accept(d, id); assert(r.kind === 'commissionPickup' && active(d, id).status === 'in_transit', 'accepted in the pickup city → goods handed over');
  const lot = d.p.inventory.lots.find(l => l.commissionId === id); assert(lot && lot.ownership === 'commissionOwned' && lot.nonMarketable && lot.quantity === 2, 'commission lot');
  assert(d.p.world.currentArrival === null, 'no arrival yet');
  startTrip(d); d.journeyToArrival(); assert(d.p.world.city === 'dunhuang' && eligible(d, '纸张') === 0, 'the commission lot is not player cargo');
  const el = S.commissions.deliveryEligibility(d.p, active(d, id)); assert(el.ok && el.have === 2 && el.plan.every(x => x.ownership === 'commissionOwned'), 'deliverable by the commission-owned rule: ' + JSON.stringify(el));
  const res = d.run('commission.deliver', { commissionId: id }); d.ack(); assert(res.actualCash === 20 && !d.p.inventory.lots.some(l => l.commissionId === id), 'delivered, lot consumed');
  return ['捎货 judged by its own commissionOwned lots; arrival counts untouched'];
});
// ---------------------------------------------------------------- CASE 11
test('CASE-11', '多个 active（不同商品 / 交付城市 / 类型）互不污染', () => {
  const d = fresh(311, 21, 2000);
  const A = post(d, { goodId: '河西毛织', quantity: 2, requiredSlots: 2, deliveryCity: 'dunhuang', rewardCash: 60 });
  const B = post(d, { type: 'procurement', goodId: '药材', quantity: 2, requiredSlots: 2, procurementCity: 'dunhuang', deliveryCity: 'changan', rewardCash: 80 });
  const C = post(d, { type: 'delivery', goodId: '纸张', quantity: 1, requiredSlots: 1, pickupCity: 'changan', deliveryCity: 'khotan', rewardCash: 30 });
  accept(d, A); accept(d, B); accept(d, C); assert(S.commissions.snapshot(d.p).activeCount === 3, '3 active');
  buy(d, '河西毛织', 2); startTrip(d); d.journeyToArrival();
  let sA = S.commissions.deliveryEligibility(d.p, active(d, A)), sB = S.commissions.deliveryEligibility(d.p, active(d, B)), sC = S.commissions.deliveryEligibility(d.p, active(d, C));
  assert(sA.ok && sA.have === 2 && !sB.ok && sB.code === 'WRONG_CITY' && !sC.ok && sC.code === 'WRONG_CITY', '敦煌: only A deliverable');
  d.run('commission.deliver', { commissionId: A }); d.ack(); assert(held(d, '河西毛织') === 0 && d.p.inventory.lots.some(l => l.commissionId === C && l.quantity === 1), 'A consumed only 河西毛织');
  buy(d, '药材', 2); assert(held(d, '药材') === 2 && eligible(d, '药材') === 0, '药材 bought here: not eligible here');
  travel(d); assert(d.p.world.city === 'khotan', '于阗'); sC = S.commissions.deliveryEligibility(d.p, active(d, C)); assert(sC.ok, 'C deliverable in 于阗'); d.run('commission.deliver', { commissionId: C }); d.ack(); assert(held(d, '药材') === 2, 'C did not touch 药材');
  travel(d); sB = S.commissions.deliveryEligibility(d.p, active(d, B)); assert(!sB.ok && sB.code === 'WRONG_CITY', 'B not in 敦煌 (return)');
  travel(d); assert(d.p.world.city === 'changan' && eligible(d, '药材') === 2, '长安 with 药材 brought in');
  while (d.p.trip.phase === 'returned_at_dusk_pending_rest') d.overnight('stay');
  sB = S.commissions.deliveryEligibility(d.p, active(d, B)); assert(sB.ok && sB.have === 2 && sB.plan.every(x => d.p.inventory.lots.find(l => l.id === x.lotId).acquisitionCity === 'dunhuang'), 'B deliverable with 敦煌-bought 药材'); d.run('commission.deliver', { commissionId: B }); d.ack();
  const done = d.p.commissions.results.filter(r => r.status === 'completed').map(r => r.goodId).sort().join(); assert(done === '河西毛织,纸张,药材' && d.p.commissions.active.length === 0, 'three completions: ' + done);
  return ['A 求货→敦煌, C 捎货→于阗, B 采买→长安 all delivered in their own cities with their own goods'];
});
// ---------------------------------------------------------------- CASE 12
test('CASE-12', '同一世界日：开关委托 / 读档 / 切页面 / 展开启程 / 0-tick 命令都不重新 Roll；只在下一世界日边界补足一次', () => {
  const d = fresh(312, 12, 400); sync(d); const ids0 = d.p.commissions.board.map(c => c.commissionId);
  assert(ids0.length === 5, 'board 5');
  accept(d, ids0[0]); const ids1 = () => d.p.commissions.board.map(c => c.commissionId).join();
  const expect = ids0.slice(1).join(); assert(ids1() === expect, 'accept removes one, nothing re-rolled');
  for (let i = 0; i < 3; i++) S.commissions.snapshot(d.p);                      // open / close the panel
  reload(d); d.run('trip.begin'); sync(d); d.run('market.enter'); d.run('market.leave', { visitId: d.p.market.visit.id }); d.ack(); d.run('inn.wait', { ticks: 1 }); d.ack();
  S.commissions.syncBoard(d.p, S.core.context('t'), 'day');                     // an explicit same-day day-trigger is a no-op too
  assert(ids1() === expect && S.time.day(d.p) === d.p.commissions.lastRefillDay, 'same day: still the same 4 candidates');
  d.overnight('restOutside'); const now = d.p.commissions.board.map(c => c.commissionId);
  assert(now.length === 5 && ids0.slice(1).every(x => now.includes(x)) && now.filter(x => !ids0.includes(x)).length === 1, 'next day: topped up by exactly one new candidate');
  accept(d, now[0]); d.run('inn.wait', { ticks: 1 }); d.ack(); assert(d.p.commissions.board.length === 4, 'no second refill on the refill day');
  return ['same-day operations keep the board', 'next day +1 only'];
});
// ---------------------------------------------------------------- structural guarantees
test('BOARD-1', '商誉升档只补足差额（原候选保留）；商誉回落不删候选；分档目标 3/5/7/9 与上限 1/2/3/4', () => {
  const d = fresh(321, 6); sync(d); const first = d.p.commissions.board.map(c => c.commissionId);
  d.p.reputation.value = 10; sync(d); const second = d.p.commissions.board.map(c => c.commissionId);
  assert(second.length === 5 && first.every(x => second.includes(x)), '10: 5 with the first 3 kept');
  d.p.reputation.value = 25; sync(d); assert(d.p.commissions.board.length === 7 && second.every(x => d.p.commissions.board.some(c => c.commissionId === x)), '25: 7, earlier kept');
  d.p.reputation.value = 40; sync(d); assert(d.p.commissions.board.length === 9, '40: 9');
  d.p.reputation.value = 8; sync(d); assert(d.p.commissions.board.length === 9 && S.commissions.capacity(d.p) === 1, 'reputation drop keeps candidates, capacity follows the tier');
  assert([0, 4, 5, 9, 10, 19, 20, 39, 40, 99].map(v => { d.p.reputation.value = v; return S.commissions.boardTarget(d.p) + '/' + S.commissions.capacity(d.p); }).join(' ') === '0/0 0/0 3/1 3/1 5/2 5/2 7/3 7/3 9/4 9/4', 'tier table');
  return ['3 → 5 → 7 → 9 by difference only'];
});
test('BOARD-2', '无商旅也计期限：未启程状态接取后 90 tick 过期并归档；结果 / 通知 / 绑定货清理正常', () => {
  const d = fresh(322, 12, 800); const id = post(d, { type: 'delivery', goodId: '绢帛', quantity: 1, pickupCity: 'changan', deliveryCity: 'dunhuang' }); accept(d, id);
  const deadline = active(d, id).deadlineWorldTick; while (d.p.world.tick <= deadline) { if (S.time.phase(d.p) === 2) d.overnight('restOutside'); else { d.run('inn.wait', { ticks: 1 }); d.ack(); } }
  assert(!active(d, id) && archived(d, id).failureReason === 'expired' && d.p.trip === null, 'expired without any trip');
  const notice = d.p.presentation.notices.find(n => n.kind === 'commissionFailure'); assert(notice && notice.commissionIds.includes(id) && d.p.inventory.lots.some(l => l.commissionId === id), 'notice pending, bound cargo still there');
  d.run('notice.dismiss', { ids: [notice.id], id: notice.id }); assert(!d.p.inventory.lots.some(l => l.commissionId === id), 'acknowledging the notice removes the bound cargo');
  return ['expired at tick ' + d.p.world.tick + ' with no trip'];
});
test('MIGRATE-1', '旧 active 委托：能还原 acceptedTick → deadline=accepted+90；不能还原 → now+90 + migration flag；旧 pool / draft 候选并入 board 不重 Roll；再次读档不延长', () => {
  const d = driver(S, 323); d.p.reputation.value = 12; d.p.cash = 400; d.p.inventory.provisions = 30; d.quietCity(60); d.quietRoute(60); d.run('trip.begin'); d.run('trip.depart', { acknowledgeSupplyWarning: true }); d.journeyToArrival();
  const env = JSON.parse(JSON.stringify(d.envelope())); env.meta = { ...S.core.versions, balanceVersion: '2026-09-13-qiyuan-final', generation: 0, revision: 3 }; env.preferences = { tutorialEnabled: false, soundEnabled: true }; env.ledger = {}; env.pending = null; env.results = {};
  const p = env.progress, tick = p.world.tick; delete p.world.arrivalSequence; delete p.world.currentArrival;
  const oldRow = over => ({ commissionId: over.commissionId, templateId: 'OLD', title: '求货 · 绢帛', text: 't', type: 'wanted', scale: 'good', goodId: '绢帛', quantity: 1, requiredSlots: 1, sourceCity: 'changan', pickupCity: null, procurementCity: null, deliveryCity: 'changan', pickupIndex: null, deliveryIndex: 4, segmentCount: 0, sourceStage: 0, urgent: false, handoffPhase: null, valuable: false, fragile: false, rare: false, longHaul: false, replaceable: true, rewardCash: 50, referencePrice: 24, rewardRate: .2, reputationReward: 2, status: 'available', urgentArrivalTick: null, urgentWindow: null, tripId: p.trip.id, deadlineTick: p.trip.deadlineTick, generatedTick: 0, ...over });
  p.commissions = { pool: [oldRow({ commissionId: 'old-a' }), oldRow({ commissionId: 'old-b', status: 'unavailable', sourceStage: 3 })], active: [oldRow({ commissionId: 'old-1', status: 'accepted', acceptedTick: 4 }), oldRow({ commissionId: 'old-2', status: 'accepted' })], results: [], history: [], starterGenerated: true, poolTripId: p.trip.id, generatedReputation: 12, templateHistory: [] };
  p.departureDraft = null; p.trip.graceIds = [];
  const up = S.core.upgradeEnvelope(env); const q = up.state.progress; S.core.validate(up.state);
  const one = q.commissions.active.find(c => c.commissionId === 'old-1'), two = q.commissions.active.find(c => c.commissionId === 'old-2');
  assert(one.acceptedAtWorldTick === 4 && one.deadlineWorldTick === 94 && !one.deadlineMigrated, 'restorable: 4 + 90');
  assert(two.acceptedAtWorldTick === tick && two.deadlineWorldTick === tick + 90 && two.deadlineMigrated === true, 'not restorable: now + 90 flagged');
  assert(one.tripId === undefined && one.deadlineTick === undefined && one.sourceStage === undefined && Number.isInteger(one.acceptedAtArrivalSequence), 'route-stop fields gone');
  assert(q.commissions.board.some(c => c.commissionId === 'old-a' && c.status === 'available') && q.commissions.board.some(c => c.commissionId === 'old-b' && c.status === 'available'), 'old pool rows migrated, not re-rolled');
  assert(q.commissions.board.length === 2 && q.commissions.boardMigrated.migratedCandidates === 2 && q.commissions.boardMigrated.added === 0 && q.commissions.boardTarget === 5 && q.commissions.lastRefillDay === null, 'MASTER §20.1: migrated candidates kept, no second roll now');
  { const e = driver(S, 3231); e.p = q; e.run('notice.dismiss', { ids: [] }); assert(e.p.commissions.board.length === 2, 'no immediate top-up by a command either'); e.overnight('camp'); assert(e.p.commissions.board.length === 5 && ['old-a', 'old-b'].every(x => e.p.commissions.board.some(c => c.commissionId === x)), 'next world day: topped up 2 → 5 (§6.3), old rows kept'); }
  assert(q.world.arrivalSequence === 1 && q.world.currentArrival && q.world.currentArrival.city === 'dunhuang', 'arrival sequence recovered from the trip stop');
  const again = S.core.upgradeEnvelope(JSON.parse(JSON.stringify(up.state))); assert(again.changed === false && again.state.progress.commissions.active.find(c => c.commissionId === 'old-2').deadlineWorldTick === tick + 90, 'a later load never extends again');
  return ['old-1 deadline 94, old-2 ' + (tick + 90) + ' flagged', 'pool rows kept; +3 only at the next world day'];
});
test('MIGRATE-2', '货物 eligibility 迁移：只有购入地≠当前城市或旧旗标证明已离城的完好自有货计入；本地未离城的货等待下次真实入城', () => {
  const d = driver(S, 324); d.p.reputation.value = 12; d.p.cash = 400; d.p.inventory.provisions = 30; d.quietCity(60); d.quietRoute(60); d.run('trip.begin'); d.run('trip.depart', { acknowledgeSupplyWarning: true }); d.journeyToArrival();
  S.inventory.add(d.p, { goodId: '绢帛', quantity: 2, acquisitionPrice: 20, acquisitionCity: 'changan', hasLeftAcquisitionCity: true });
  S.inventory.add(d.p, { goodId: '河西毛织', quantity: 2, acquisitionPrice: 20, acquisitionCity: 'dunhuang', hasLeftAcquisitionCity: false });
  S.inventory.add(d.p, { goodId: '干果', quantity: 1, acquisitionPrice: 20, acquisitionCity: 'dunhuang', hasLeftAcquisitionCity: true });
  const env = JSON.parse(JSON.stringify(d.envelope())); env.meta = { ...S.core.versions, balanceVersion: '2026-09-13-qiyuan-final', generation: 0, revision: 3 }; env.preferences = { tutorialEnabled: false, soundEnabled: true }; env.ledger = {}; env.pending = null; env.results = {};
  const p = env.progress; delete p.world.arrivalSequence; delete p.world.currentArrival; p.commissions = { pool: [], active: [], results: [], history: [], starterGenerated: false, poolTripId: null, generatedReputation: null, templateHistory: [] }; p.departureDraft = null;
  const q = S.core.upgradeEnvelope(env).state.progress; const a = q.world.currentArrival;
  assert(a && a.migrated && a.eligibleCargoCounts['绢帛'] === 2 && a.eligibleCargoCounts['干果'] === 1 && !a.eligibleCargoCounts['河西毛织'], 'provenance-based counts: ' + JSON.stringify(a.eligibleCargoCounts));
  return ['绢帛 2 (bought elsewhere), 干果 1 (left and returned), 河西毛织 0 (local, never left)'];
});
test('VALIDATE-1', '当前版本存档校验：缺少独立期限的 active、非 available 的 board 行、arrival 序列不一致均被拒绝', () => {
  const d = fresh(325, 12); sync(d); const id = post(d, {}); accept(d, id);
  const bad = fn => { const env = JSON.parse(JSON.stringify(d.envelope())); fn(env.progress); try { S.core.validate(env); return null; } catch (e) { return e.code; } };
  assert(bad(p => { delete p.commissions.active[0].deadlineWorldTick; }) === 'INVALID_DEADLINE', 'deadline required');
  assert(bad(p => { p.commissions.active[0].deadlineWorldTick += 3; }) === 'INVALID_DEADLINE', 'deadline must be accepted + 90 unless migrated');
  assert(bad(p => { p.commissions.board[0].status = 'accepted'; }) === 'INVALID_BOARD_ROW', 'board rows are available');
  assert(bad(p => { p.world.currentArrival = { arrivalSequence: 9, city: 'changan', tick: 0, eligibleCargoCounts: {} }; }) === 'INVALID_ARRIVAL', 'arrival sequence consistency');
  assert(bad(() => { }) === null, 'the real save is valid');
  return ['three invariants enforced on current saves'];
});
test('SOURCE-1', '无针对长安 / 敦煌 / 于阗 / 精制玉器 / 特定 commissionId 的 hardcode；三处交付判定同源；startTrip / finalizeTrip 不碰委托', () => {
  const c = src('commissions.js'), t = src('trip.js'), b = src('business-ui.js');
  assert(!/精制玉器|CA-E|DH-E|HT-E|commissionId\s*===\s*'(?!string')/.test(c), 'no good / template / id special case in the domain');
  assert(!/'khotan'\s*(===|!==)|(===|!==)\s*'khotan'|'dunhuang'\s*(===|!==)|(===|!==)\s*'dunhuang'|'changan'\s*(===|!==)|(===|!==)\s*'changan'/.test(c), 'no city special case in the domain');
  assert((c.match(/function getCommissionDeliveryEligibility\(/g) || []).length === 1 && (c.match(/function getCourierCommissionEligibility\(/g) || []).length === 1 && (c.match(/function getPlayerOwnedCommissionEligibility\(/g) || []).length === 1 && /E\(el\.ok, 'CANNOT_DELIVER'/.test(c) && /task\.delivery\.have\s*\+\s*' \/ '/.test(b) && /const el=task\.delivery;if\(el\.ok\)mutate/.test(b), 'typed dispatcher (§14) and the three consumers (§15) read the one eligibility result');
  assert(!/commissions\.(activateDraft|finalizeFailures|freezeGrace|generatePool|draftPool)/.test(t) && !/graceIds|departureDraft/.test(t) && !/p\.commissions\.(pool|board)\s*=/.test(t), 'trip never generates, freezes, fails, resets or clears commissions');
  assert(!/routeIndex|deliveryIndex|pickupIndex|sourceStage/.test(c.replace(/\/\/[^\n]*/g, '').replace(/migrate\(p\)[\s\S]*?\n  }\n  function validate/, '')), 'no route index in the live commission rules (only the migration reads the old fields)');
  return ['source guarantees hold'];
});
test('URGENT-1', '加急：承接后首次抵达交付城市开窗（去程 / 返程不再区分，按 arrivalSequence）；暮到顺延一次；错过即失效；重载不多送', () => {
  const build = seed => { const d = fresh(seed, 12, 800); const id = post(d, { goodId: '药材', quantity: 1, sourceCity: 'dunhuang', deliveryCity: 'dunhuang', urgent: true, commissionId: 'c-u' }); accept(d, id); buy(d, '药材', 2); toMorning(d); d.run('trip.begin'); return d; };   // two units: a camp night may damage one
  const d = build(331); assert(!active(d, 'c-u').urgentWindow, 'no window at acceptance');
  d.run('trip.depart', { acknowledgeSupplyWarning: true }); d.journeyToArrival(); const w = active(d, 'c-u').urgentWindow; assert(w && w.arrivalSequence === 1 && w.city === 'dunhuang', 'window opened at the first arrival after acceptance: ' + JSON.stringify(w));
  assert(S.commissions.deliveryEligibility(d.p, active(d, 'c-u')).ok, 'deliverable inside the window'); d.run('commission.deliver', { commissionId: 'c-u' }); d.ack();
  // dusk arrival: this 暮 or the next 晨 only
  const e = build(332); e.run('trip.depart', { acknowledgeSupplyWarning: true }); e.p.world.route.remainingTicks = 8; e.journeyToArrival(); assert(S.time.phase(e.p) === 2, 'arrived at 暮');
  const w2 = active(e, 'c-u').urgentWindow; assert(w2.arrivalPhase === 2 && w2.deadlineTick === (Math.floor(w2.arrivalTick / 3) + 1) * 3, 'carry-over to next 晨');
  e.overnight('stay'); reload(e); assert(active(e, 'c-u').urgentWindow.deadlineTick === w2.deadlineTick, 'reload keeps the window'); assert(e.tryRun('commission.deliver', { commissionId: 'c-u' }).ok, 'next morning ok'); e.ack();
  const f = build(333); f.run('trip.depart', { acknowledgeSupplyWarning: true }); f.p.world.route.remainingTicks = 8; f.journeyToArrival(); f.overnight('stay'); f.run('inn.wait', { ticks: 1 }); f.ack();
  assert(!active(f, 'c-u') && archived(f, 'c-u').failureReason === 'urgent_window_missed', 'missed after 晨 → 午');
  return ['window keyed by arrivalSequence', 'dusk carry-over once', 'missed → urgent_window_missed'];
});
test('HANDOFF-1', '晨交 / 午交：只在约定时段可交（其他时段 HANDOFF_PHASE）；客舍候时到约定时辰', () => {
  const d = fresh(334, 12, 800); const id = post(d, { goodId: '纸张', quantity: 1, sourceCity: 'dunhuang', deliveryCity: 'dunhuang', handoffPhase: 0 }); accept(d, id); buy(d, '纸张', 1); startTrip(d); d.journeyToArrival();
  toMorning(d); assert(S.commissions.deliveryEligibility(d.p, active(d, id)).ok, '晨: ok');
  d.run('inn.wait', { ticks: 1 }); d.ack(); const el = S.commissions.deliveryEligibility(d.p, active(d, id)); assert(!el.ok && el.code === 'HANDOFF_PHASE' && el.have === 1, '午: goods ready but wrong phase');
  assert(S.commissions.waitTarget(d.p, id) === Math.floor(d.p.world.tick / 3) * 3 + 3, 'inn wait target = next 晨');
  return ['handoff phase enforced by the same eligibility'];
});
test('PICKUP-1', '捎货三城分离：于阗承接 长安取货 敦煌交付；离开取货城不再判失败；取货后交付', () => {
  const d = fresh(335, 12, 800); startTrip(d); d.journeyToArrival(); travel(d); assert(d.p.world.city === 'khotan', '于阗');
  const id = post(d, { type: 'delivery', goodId: '绢帛', quantity: 1, sourceCity: 'khotan', pickupCity: 'changan', deliveryCity: 'dunhuang', rewardCash: 30 }); accept(d, id); assert(active(d, id).status === 'pending_pickup', 'waiting for the pickup city');
  let el = S.commissions.deliveryEligibility(d.p, active(d, id)); assert(!el.ok && el.code === 'PICKUP_REQUIRED', 'not deliverable before pickup');
  travel(d); travel(d); assert(d.p.world.city === 'changan', '长安'); const r = d.tryRun('commission.pickup', { commissionId: id }); assert(r.ok && active(d, id).status === 'in_transit', 'picked up in 长安'); d.ack();
  assert(!S.trip.departureView(d.p).pendingPickupIds, 'no departure pickup warning any more');
  finishTrip(d); toMorning(d); d.run('trip.begin'); d.run('trip.depart', { acknowledgeSupplyWarning: true }); d.journeyToArrival(); assert(d.p.world.city === 'dunhuang', '敦煌 on the second trip');
  el = S.commissions.deliveryEligibility(d.p, active(d, id)); assert(el.ok, 'deliverable: ' + JSON.stringify(el)); d.run('commission.deliver', { commissionId: id }); d.ack(); assert(archived(d, id).status === 'completed', 'done');
  return ['accept 于阗 → pickup 长安 → deliver 敦煌 (second trip)'];
});

test('MATRIX-A4', '§22 A4 商誉 9→10：上限 1→2，目标 3→5，只补 2，旧 3 不变', () => {
  const d = fresh(341, 9); sync(d); const old = d.p.commissions.board.map(c => c.commissionId); assert(old.length === 3 && S.commissions.capacity(d.p) === 1, '9: 3 / cap 1');
  d.p.reputation.value = 10; sync(d); const now = d.p.commissions.board.map(c => c.commissionId);
  assert(now.length === 5 && S.commissions.capacity(d.p) === 2 && old.every(x => now.includes(x)) && now.filter(x => !old.includes(x)).length === 2, '10: 5 / cap 2, exactly 2 new, old 3 kept: ' + JSON.stringify([old, now]));
  return ['9→10: +2 only'];
});
test('MATRIX-D5', '§22 D5 入城 eligible 3 → 卖 2 → eligible 1，不可交 ×3', () => {
  const d = fresh(342, 12, 800); const id = post(d, { goodId: '河西毛织', quantity: 3, requiredSlots: 3, sourceCity: 'dunhuang', deliveryCity: 'dunhuang' }); accept(d, id);
  buy(d, '河西毛织', 3); startTrip(d); d.journeyToArrival(); assert(eligible(d, '河西毛织') === 3 && S.commissions.deliveryEligibility(d.p, active(d, id)).canDeliver, 'eligible 3');
  sell(d, '河西毛织', 2); const el = S.commissions.deliveryEligibility(d.p, active(d, id));
  assert(eligible(d, '河西毛织') === 1 && el.eligibleQuantity === 1 && el.requiredQuantity === 3 && el.canDeliver === false && el.failureReason === 'CARGO_MISSING', 'eligible 1 / 3: ' + JSON.stringify(el));
  return ['sell 2 of 3 → 1 / 3'];
});
test('MATRIX-D6', '§22 D6 接单时已在交付城市且背包足量：不能原地交，须一次接取后的新入城（同时覆盖 E2 采买 / E3 求货的既有库存）', () => {
  const d = fresh(343, 21, 2000);
  buy(d, '河西毛织', 2); buy(d, '药材', 2); startTrip(d); d.journeyToArrival(); assert(d.p.world.city === 'dunhuang' && eligible(d, '河西毛织') === 2, '敦煌 with goods already carried in');
  const W = post(d, { goodId: '河西毛织', quantity: 2, requiredSlots: 2, sourceCity: 'dunhuang', deliveryCity: 'dunhuang' }); accept(d, W);
  const P = post(d, { type: 'procurement', goodId: '药材', quantity: 2, requiredSlots: 2, procurementCity: 'changan', deliveryCity: 'dunhuang' }); accept(d, P);
  let w = S.commissions.deliveryEligibility(d.p, active(d, W)), pr = S.commissions.deliveryEligibility(d.p, active(d, P));
  assert(!w.canDeliver && w.failureReason === 'NO_POST_ACCEPTANCE_ARRIVAL' && !pr.canDeliver && pr.failureReason === 'NO_POST_ACCEPTANCE_ARRIVAL', 'in place: no post-acceptance arrival: ' + JSON.stringify([w.code, pr.code]));
  assert(d.tryRun('commission.deliver', { commissionId: W }).code === 'CANNOT_DELIVER', 'submit refused');
  travel(d); assert(d.p.world.city === 'khotan', '于阗'); travel(d); assert(d.p.world.city === 'dunhuang' && d.p.world.arrivalSequence === 3, 'back in 敦煌');
  w = S.commissions.deliveryEligibility(d.p, active(d, W)); pr = S.commissions.deliveryEligibility(d.p, active(d, P));
  assert(w.canDeliver && w.eligibleQuantity === 2 && pr.canDeliver && pr.eligibleQuantity === 2, 'pre-owned goods carried in after acceptance deliver (求货 E3 / 采买 E2 with its configured purchase city 长安): ' + JSON.stringify([w.code, pr.code]));
  d.run('commission.deliver', { commissionId: W }); d.ack(); d.run('commission.deliver', { commissionId: P }); d.ack(); assert(d.p.commissions.active.length === 0, 'both delivered');
  return ['in-place refused (NO_POST_ACCEPTANCE_ARRIVAL)', 'delivered after the next real arrival with goods owned before acceptance'];
});
test('MATRIX-F2-F3', '§22 F2/F3 读档：acceptedAt / deadline 不变；入城 eligibility 数量不变、不被本地库存重新灌满', () => {
  const d = fresh(344, 12, 800); const id = post(d, { goodId: '河西毛织', quantity: 3, requiredSlots: 3, sourceCity: 'dunhuang', deliveryCity: 'dunhuang' }); accept(d, id);
  const acceptedAt = active(d, id).acceptedAtWorldTick, deadline = active(d, id).deadlineWorldTick;
  buy(d, '河西毛织', 2); startTrip(d); d.journeyToArrival(); buy(d, '河西毛织', 1); assert(held(d, '河西毛织') === 3 && eligible(d, '河西毛织') === 2, 'eligible 2 with 3 held');
  const before = JSON.stringify([d.p.world.currentArrival, S.commissions.deliveryEligibility(d.p, active(d, id))]);
  reload(d);
  assert(active(d, id).acceptedAtWorldTick === acceptedAt && active(d, id).deadlineWorldTick === deadline, 'F2: reload keeps acceptedAt / deadline');
  assert(JSON.stringify([d.p.world.currentArrival, S.commissions.deliveryEligibility(d.p, active(d, id))]) === before && eligible(d, '河西毛织') === 2 && Number.isInteger(d.p.world.currentArrival.arrivedAtWorldTick), 'F3: arrival eligibility identical after reload (2, not 3)');
  return ['deadline ' + deadline + ' kept', 'eligible 2 kept after reload'];
});
test('MIGRATE-3', 'r24（v3）存档：只改 currentArrival 字段名 tick → arrivedAtWorldTick，其余不变，不重 Roll，不延长', () => {
  const d = fresh(345, 12, 400); sync(d); const id = post(d, {}); accept(d, id); buy(d, '绢帛', 1); startTrip(d); d.journeyToArrival();
  const env = JSON.parse(JSON.stringify(d.envelope())); env.meta = { ...S.core.versions, balanceVersion: '2026-09-13-commission-master-v3', generation: 0, revision: 4 }; env.preferences = { tutorialEnabled: false, soundEnabled: true }; env.ledger = {}; env.pending = null; env.results = {};
  const a = env.progress.world.currentArrival; a.tick = a.arrivedAtWorldTick; delete a.arrivedAtWorldTick;   // r24 shape
  const snapshot = JSON.stringify([env.progress.commissions.board, env.progress.commissions.active, env.progress.world.arrivalSequence, a.eligibleCargoCounts]);
  const up = S.core.upgradeEnvelope(env); const q = up.state.progress; S.core.validate(up.state);
  assert(up.changed && q.world.currentArrival.arrivedAtWorldTick === a.tick && q.world.currentArrival.tick === undefined, 'field renamed');
  assert(JSON.stringify([q.commissions.board, q.commissions.active, q.world.arrivalSequence, q.world.currentArrival.eligibleCargoCounts]) === snapshot, 'board / active / sequence / counts untouched');
  return ['r24 save upgraded by the field rename only'];
});

// ---------------------------------------------------------------- report
const passed = results.filter(r => r.pass).length;
fs.mkdirSync(path.join(__dirname, 'results'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'results', 'commission-v3.json'), JSON.stringify({ engine: S.core.versions, run: new Date().toISOString(), results }, null, 1));
const lines = ['# COMMISSION_SYSTEM_MASTER_PATCH v3.0 regression', '', 'Engine: ' + JSON.stringify(S.core.versions), 'Run: ' + new Date().toISOString(), '', '| ID | Result | Title | Details |', '|---|---|---|---|'];
for (const r of results) lines.push('| ' + r.id + ' | ' + (r.pass ? 'PASS' : 'FAIL') + ' | ' + r.title + ' | ' + r.details.map(x => String(x).replace(/\|/g, '/').replace(/\n/g, ' ')).join('<br>') + ' |');
lines.push('', 'Total: ' + passed + '/' + results.length + ' PASS');
fs.writeFileSync(path.join(__dirname, 'results', 'commission-v3.md'), lines.join('\n'));
for (const r of results) console.log((r.pass ? 'PASS ' : 'FAIL ') + r.id + ' ' + r.title + (r.pass ? '  ' + r.details.join(' | ') : '\n    ' + r.details.join('\n    ')));
console.log('commission v3.0: ' + passed + '/' + results.length);
process.exitCode = passed === results.length ? 0 : 1;
