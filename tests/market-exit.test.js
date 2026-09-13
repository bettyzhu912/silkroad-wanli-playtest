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
test('sell by goodId (InventoryLot never exposed): single lot, all lots in full, partial across lots refused as LOT_POLICY_PENDING', () => {
  const d = fresh(204); d.run('market.enter'); const v = d.p.market.visit;
  d.run('market.buy', { visitId: v.id, goodId: '绢帛', quantity: 2 }); d.ack();
  const one = d.run('market.sell', { visitId: v.id, goodId: '绢帛', quantity: 1 }); d.ack();
  assert.ok(one.kind === 'marketSell' && one.quantity === 1 && one.goodId === '绢帛', 'single lot: partial sell by goodId ok');
  d.run('market.buy', { visitId: v.id, goodId: '绢帛', quantity: 3 }); d.ack();
  const lots = S.market.marketableLots(d.p, '绢帛'); assert.strictEqual(lots.length, 2, 'two backend lots kept (no merge)');
  const partial = d.tryRun('market.sell', { visitId: v.id, goodId: '绢帛', quantity: 2 });
  assert.ok(!partial.ok && partial.code === 'LOT_POLICY_PENDING' && /全部 4 件/.test(partial.message), 'partial across lots refused, rule left to the gameplay authority: ' + partial.message);
  assert.strictEqual(S.market.marketableLots(d.p, '绢帛').length, 2, 'refusal changes nothing');
  const over = d.tryRun('market.sell', { visitId: v.id, goodId: '绢帛', quantity: 5 }); assert.ok(!over.ok && over.code === 'INVALID_QUANTITY');
  const before = d.p.cash; const all = d.run('market.sell', { visitId: v.id, goodId: '绢帛', quantity: 4 }); d.ack();
  assert.ok(all.kind === 'marketSell' && all.quantity === 4 && all.items.length === 2 && all.total === all.items[0].total + all.items[1].total && d.p.cash === before + all.total, 'all lots in full (existing 一键出售 semantics per good)');
  assert.strictEqual(S.market.marketableLots(d.p, '绢帛').length, 0);
  assert.strictEqual(S.market.blockReason('sell', { valid: true, n: 2, held: 4, lots: 2 }), S.market.lotPolicyPendingMessage(4));
  assert.strictEqual(S.market.blockReason('sell', { valid: true, n: 4, held: 4, lots: 2 }), ''); assert.strictEqual(S.market.blockReason('sell', { valid: true, n: 5, held: 4, lots: 1 }), '出售件数无效');
  assert.strictEqual(S.market.blockReason('buy', { valid: true, n: 3, unlocked: true, slotCost: 2, available: 4, cash: 999, unit: 10 }), '货位不足，还需 2 个货位');
  assert.strictEqual(S.market.blockReason('buy', { valid: true, n: 3, unlocked: true, slotCost: 1, available: 6, cash: 5, unit: 10 }), '随身铜钱不足');
});
console.log(`market exit: ${passed}/5 passed`);
