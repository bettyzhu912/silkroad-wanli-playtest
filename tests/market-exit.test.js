'use strict';
// 市场交易页 (2026-09-13) — exit flow contract: 0-tick summary preview, atomic close + advance once, no summary page without trades.
const assert = require('assert');
const { load, driver } = require('./harness');
const S = load().Silk;
let passed = 0; const test = (name, fn) => { fn(); passed++; console.log('PASS ' + name); };
const fresh = seed => { const d = driver(S, seed); d.quietCity(60); d.quietRoute(60); d.p.cash = 200; return d; };
test('no successful trade: leave = +0 tick, no summary (viewing prices, newspaper only)', () => {
  const d = fresh(201); d.run('market.enter'); const v = d.p.market.visit; const t0 = d.p.world.tick;
  assert.strictEqual(v.hadActivity, false); assert.throws(() => S.market.summaryPreview(d.p, v.id), /NO_MARKET_ACTIVITY|本次尚无成功交易/);
  d.run('newspaper.purchase', { visitId: v.id }); assert.strictEqual(d.p.market.visit.hadActivity, false, 'newspaper is not a trade');
  const r = d.run('market.leave', { visitId: v.id }); assert.strictEqual(r.kind, 'marketLeft'); assert.strictEqual(r.modal, false);
  assert.strictEqual(d.p.world.tick, t0); assert.strictEqual(d.p.presentation.activeResult, null, 'no summary page');
});
test('summaryPreview is read-only and regenerates with the latest trades (0 tick, visit stays open)', () => {
  const d = fresh(202); d.run('market.enter'); const v = d.p.market.visit; const t0 = d.p.world.tick;
  d.run('market.buy', { visitId: v.id, goodId: '绢帛', quantity: 2 }); d.ack();
  const before = JSON.stringify(d.p); const s1 = S.market.summaryPreview(d.p, v.id);
  assert.strictEqual(JSON.stringify(d.p), before, 'preview mutates nothing'); assert.strictEqual(d.p.world.tick, t0);
  assert.ok(s1.preview === true && s1.modal === false && s1.kind === 'marketSummary' && s1.bought.length === 1 && s1.bought[0].quantity === 2 && s1.sold.length === 0 && s1.currentTick === t0);
  assert.strictEqual(d.p.market.visit.settled, false, 'visit still open after preview (返回市场)');
  d.run('market.provisions', { visitId: v.id, quantity: 3 }); d.ack();
  const s2 = S.market.summaryPreview(d.p, v.id); assert.strictEqual(s2.provisions, 3); assert.strictEqual(s2.cashDelta, s1.cashDelta - 3, 'second preview reflects the newer trade');
  assert.strictEqual(d.p.world.tick, t0, 'still 0 tick after two previews');
});
test('确认离市: close + advance exactly once, atomic; repeated confirm for the same visit is rejected without advancing', () => {
  const d = fresh(203); d.run('market.enter'); const v = d.p.market.visit; const t0 = d.p.world.tick;
  d.run('market.buy', { visitId: v.id, goodId: '绢帛', quantity: 1 }); d.ack();
  const r = d.run('market.leave', { visitId: v.id });
  assert.strictEqual(d.p.world.tick, t0 + 1, 'advanceTime(1)'); assert.ok(d.p.market.visit.settled && d.p.market.visit.closedTick === t0);
  assert.strictEqual(r.modal, false, 'no second summary page after the confirm page'); assert.strictEqual(d.p.presentation.activeResult, null);
  assert.ok(d.p.market.visit.summary && d.p.market.visit.summary.bought.length === 1, 'summary record kept on the visit');
  const again = d.tryRun('market.leave', { visitId: v.id }); assert.ok(!again.ok && again.code === 'STALE_MARKET_VISIT', 'repeat rejected'); assert.strictEqual(d.p.world.tick, t0 + 1, 'no double advance');
  assert.throws(() => S.market.summaryPreview(d.p, v.id), e => e.code === 'STALE_MARKET_VISIT');
});
test('blocking-reason priority helper: 未解锁 → 货位不足 → 铜钱不足 → 数量限制, one reason at a time', () => {
  const ui = S.market; assert.ok(ui.blockReason, 'market exposes blockReason');
  const f = { valid: true, n: 2, unlocked: false, slotCost: 1, available: 0, cash: 0, unit: 10, total: 20 };
  assert.strictEqual(ui.blockReason('buy', f), '商品尚未解锁'); assert.strictEqual(ui.blockReason('buy', { ...f, lockedReason: '尚未打通此货货源。' }), '尚未打通此货货源。');
  assert.strictEqual(ui.blockReason('buy', { ...f, unlocked: true }), '货位不足，还需 2 个货位');
  assert.strictEqual(ui.blockReason('buy', { ...f, unlocked: true, available: 6 }), '随身铜钱不足');
  assert.strictEqual(ui.blockReason('buy', { ...f, unlocked: true, available: 6, cash: 100, valid: false, n: 0 }), '请输入正整数件数');
  assert.strictEqual(ui.blockReason('buy', { ...f, unlocked: true, available: 6, cash: 100 }), '');
  assert.strictEqual(ui.blockReason('buy', { valid: false, n: 0, unlocked: true, slotCost: 2, available: 1, cash: 100, unit: 10 }), '货位不足，还需 1 个货位', 'empty entry judged as the smallest trade');
  assert.strictEqual(ui.blockReason('sell', { valid: true, n: 3, held: 2, lots: 1 }), '出售件数无效'); assert.strictEqual(ui.blockReason('sell', { valid: true, n: 2, held: 2, lots: 1 }), '');
  assert.strictEqual(ui.blockReason('provisions', { valid: true, n: 5, needsSlot: true, available: 0, cash: 100, unit: 1 }), '补给需要一个货位');
  assert.strictEqual(ui.blockReason('provisions', { valid: true, n: 5, needsSlot: false, available: 0, cash: 3, unit: 1 }), '随身铜钱不足');
  assert.strictEqual(ui.blockReason('provisions', { valid: false, n: 0, needsSlot: false, available: 0, cash: 3, unit: 1 }), '请输入正整数日份');
});
test('sell by goodId (InventoryLot never exposed): single lot; partial over several lots; lots of different purchase prices share one integer 持仓均价 and sell without any batch selection or policy gate', () => {
  const d = fresh(204); d.run('market.enter'); const v = d.p.market.visit;
  d.run('market.buy', { visitId: v.id, goodId: '绢帛', quantity: 2 }); d.ack();
  const one = d.run('market.sell', { visitId: v.id, goodId: '绢帛', quantity: 1 }); d.ack();
  assert.ok(one.kind === 'marketSell' && one.quantity === 1 && one.goodId === '绢帛', 'single lot: partial sell by goodId ok');
  d.run('market.buy', { visitId: v.id, goodId: '绢帛', quantity: 3 }); d.ack();
  let lots = S.market.marketableLots(d.p, '绢帛'); assert.strictEqual(lots.length, 2, 'two backend lots kept as provenance records (no merge of lots)');
  assert.ok(lots.every(l => l.avgCost === lots[0].avgCost), 'one integer 持仓均价 on every lot');
  assert.deepStrictEqual(S.market.sellPlan(d.p, '绢帛', 2).ok, true);
  const before = d.p.cash; const two = d.run('market.sell', { visitId: v.id, goodId: '绢帛', quantity: 2 }); d.ack();
  assert.ok(two.kind === 'marketSell' && two.quantity === 2 && two.items.length === 2 && d.p.cash === before + two.total, 'partial over two lots commits (1 from the first lot, 1 from the second)');
  lots = S.market.marketableLots(d.p, '绢帛'); assert.strictEqual(lots.length, 1, 'the first lot was consumed in inventory order, one lot of 2 remains'); assert.strictEqual(lots[0].quantity, 2);
  d.run('market.buy', { visitId: v.id, goodId: '绢帛', quantity: 2 }); d.ack(); lots = S.market.marketableLots(d.p, '绢帛'); assert.strictEqual(lots.length, 2);
  // WEIGHTED_AVERAGE_INVENTORY_COST_PATCH v1.0: a batch bought elsewhere at another price is the same product — one cost, no batch to choose
  S.inventory.add(d.p, { goodId: '绢帛', quantity: 1, acquisitionPrice: lots[0].acquisitionPrice + 10, acquisitionCity: 'dunhuang', hasLeftAcquisitionCity: true }); // 5 units + the provisions slot = the 6 slots of one camel
  lots = S.market.marketableLots(d.p, '绢帛'); const held = lots.reduce((n, l) => n + l.quantity, 0);
  const expected = S.money.round(lots.reduce((n, l) => n + l.quantity * l.acquisitionPrice, 0) / held);
  assert.ok(lots.length === 3 && new Set(lots.map(l => l.acquisitionPrice)).size === 2 && lots.every(l => l.avgCost === expected), 'three lots, two purchase prices, one integer 均价 = roundMoney of the weighted average');
  const plan = S.market.sellPlan(d.p, '绢帛', 1); assert.ok(plan.ok && plan.avgCost === expected, 'partial over lots of different prices is a normal sale');
  const partial = d.run('market.sell', { visitId: v.id, goodId: '绢帛', quantity: 1 }); d.ack();
  assert.ok(partial.kind === 'marketSell' && partial.cost === expected && partial.avgCost === expected, 'cost = 1 × 均价');
  assert.strictEqual(S.inventory.avgCost(d.p, '绢帛'), expected, '部分卖出后均价不变');
  assert.strictEqual(S.market.blockReason('sell', { valid: true, n: 1, held: 5, lots: 3 }), '', 'no player-facing copy about batches');
  const over = d.tryRun('market.sell', { visitId: v.id, goodId: '绢帛', quantity: 99 }); assert.ok(!over.ok && over.code === 'INVALID_QUANTITY');
  const cash2 = d.p.cash; const all = d.run('market.sell', { visitId: v.id, goodId: '绢帛', quantity: held - 1 }); d.ack();
  assert.ok(all.kind === 'marketSell' && all.quantity === held - 1 && all.cost === (held - 1) * expected && d.p.cash === cash2 + all.total, 'all remaining units in one sale');
  assert.strictEqual(S.market.marketableLots(d.p, '绢帛').length, 0); assert.strictEqual(S.inventory.avgCost(d.p, '绢帛'), null, 'sold out: no 均价 kept');
  assert.strictEqual(S.market.blockReason('sell', { valid: true, n: 5, held: 4, lots: 1 }), '出售件数无效');
  assert.strictEqual(S.market.blockReason('buy', { valid: true, n: 3, unlocked: true, slotCost: 2, available: 4, cash: 999, unit: 10 }), '货位不足，还需 2 个货位');
  assert.strictEqual(S.market.blockReason('buy', { valid: true, n: 3, unlocked: true, slotCost: 1, available: 6, cash: 5, unit: 10 }), '随身铜钱不足');
});
console.log(`market exit: ${passed}/5 passed`);
