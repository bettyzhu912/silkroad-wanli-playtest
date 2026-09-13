'use strict';
// WEIGHTED_AVERAGE_INVENTORY_COST_PATCH v1.0 (2026-09-13) — acceptance (04_ACCEPTANCE_CHECKLIST_v1.0.md), engine level.
// One cost per productId: every pool lot carries the product's single integer 持仓均价 (avgCost); purchases merge through the global
// S.money.round; sales use quantity × avgCost; partial sales leave it; selling out drops it; a batch is never a cost basis again.
const assert = require('assert');
const fs = require('fs'), path = require('path');
const { load, driver } = require('./harness');
const S = load().Silk;
const ROOT = process.env.SILK_ROOT || path.join(__dirname, '..');
let passed = 0; const test = (name, fn) => { fn(); passed++; console.log('PASS ' + name); };
const fresh = seed => { const d = driver(S, seed); d.quietCity(60); d.quietRoute(60); d.p.cash = 2000; d.p.inventory.camelCount = 6; return d; };
const add = (d, goodId, quantity, acquisitionPrice, extra = {}) => S.inventory.add(d.p, { goodId, quantity, acquisitionPrice, ...extra });
const pool = (d, goodId) => S.inventory.costPool(d.p, goodId);
const avg = (d, goodId) => S.inventory.avgCost(d.p, goodId);
const ctx = () => S.core.context('wac');
const roundMoney = v => S.money.round(v);

test('加权平均 A: 10件@20 + 5件@30 → 15件, 均价 23 (23.333… → 23); every lot carries the same integer', () => {
  const d = fresh(1); add(d, '绢帛', 10, 20); assert.strictEqual(avg(d, '绢帛'), 20, 'first purchase: avg = its own integer unit price');
  add(d, '绢帛', 5, 30);
  assert.strictEqual(pool(d, '绢帛').reduce((n, l) => n + l.quantity, 0), 15); assert.strictEqual(avg(d, '绢帛'), 23);
  assert.ok(pool(d, '绢帛').every(l => l.avgCost === 23), 'one value on every lot');
});
test('加权平均 B: 10件@23 + 5件@31 → 15件, 均价 26 (25.666… → 26)', () => {
  const d = fresh(2); add(d, '纸张', 10, 23); add(d, '纸张', 5, 31); assert.strictEqual(avg(d, '纸张'), 26);
});
test('0.5 边界: 1件@23 + 1件@24 = 23.5 → 23 (never 24); 2件@23 + 3件@24 = 23.6 → 24', () => {
  const d = fresh(3); add(d, '绢帛', 1, 23); add(d, '绢帛', 1, 24); assert.strictEqual(avg(d, '绢帛'), 23, '23.5 rounds down');
  add(d, '纸张', 2, 23); add(d, '纸张', 3, 24); assert.strictEqual(avg(d, '纸张'), 24, '23.6 rounds up');
});
test('rounding = the existing global roundMoney (S.money.round: fraction > .5 up, ≤ .5 down); no second helper in the cost code', () => {
  assert.strictEqual(roundMoney(23.3), 23); assert.strictEqual(roundMoney(23.5), 23); assert.strictEqual(roundMoney(23.6), 24);
  let seed = 12345; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let i = 0; i < 300; i++) {
    const d = fresh(100 + i); const q1 = 1 + Math.floor(rnd() * 7), p1 = 1 + Math.floor(rnd() * 80), q2 = 1 + Math.floor(rnd() * 7), p2 = 1 + Math.floor(rnd() * 80); // ≤ 14 units: 16 slots minus the provisions slot
    add(d, '绢帛', q1, p1); add(d, '绢帛', q2, p2);
    assert.strictEqual(avg(d, '绢帛'), roundMoney((q1 * p1 + q2 * p2) / (q1 + q2)), `q1 ${q1}@${p1} + q2 ${q2}@${p2}`);
  }
  for (const f of ['inventory.js', 'market.js']) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.ok(!/Math\.round\(|toFixed\(|Math\.ceil\(|Math\.floor\(/.test(src), f + ' defines no rounding of its own');
  }
  assert.ok(/S\.money\.round\(/.test(fs.readFileSync(path.join(ROOT, 'inventory.js'), 'utf8')), 'the merge calls S.money.round');
});
test('权威成本: after rounding no hidden precision exists; the next purchase uses 现有数量 × 当前整数均价, never the batch prices', () => {
  const d = fresh(4); add(d, '绢帛', 4, 20); add(d, '绢帛', 2, 30); assert.strictEqual(avg(d, '绢帛'), 23, '(80 + 60) / 6 = 23.33 → 23');
  // batch prices are rewritten to nonsense on purpose: if the engine ever read them as a cost basis the next result would change
  for (const l of pool(d, '绢帛')) l.acquisitionPrice = 999;
  add(d, '绢帛', 6, 40);
  // integer basis: (6 × 23 + 6 × 40) / 12 = 31.5 → 31 ; a hidden exact basis (140 + 240) / 12 = 31.67 would give 32
  assert.strictEqual(avg(d, '绢帛'), 31);
  const keys = new Set(); for (const l of d.p.inventory.lots) for (const k of Object.keys(l)) keys.add(k); for (const k of Object.keys(d.p.inventory)) keys.add(k);
  assert.ok(![...keys].some(k => /precise|hidden|exact|raw|basis/i.test(k)), 'no precise / hidden cost field anywhere: ' + [...keys].join(','));
  assert.deepStrictEqual(Object.keys(d.p.inventory).sort(), ['camelCount', 'lots', 'provisions'], 'no cost map added to the inventory');
  assert.ok(d.p.inventory.lots.every(l => Number.isInteger(l.avgCost)), 'avgCost is always an integer');
});
test('出售: no batch selection — goodId + quantity over lots of different purchase prices commits; cost = quantity × 均价; partial sale keeps 均价; sell-out resets it; rebuy from 0 = new unit price', () => {
  const d = fresh(5); d.run('market.enter'); const v = d.p.market.visit; const price = S.market.price(d.p, '绢帛', ctx());
  add(d, '绢帛', 10, 20); add(d, '绢帛', 5, 30, { acquisitionCity: 'dunhuang', hasLeftAcquisitionCity: true }); assert.strictEqual(avg(d, '绢帛'), 23);
  assert.strictEqual(S.market.outcomeEquivalent, undefined, 'the equivalence gate is gone'); const plan = S.market.sellPlan(d.p, '绢帛', 5); assert.ok(plan.ok && plan.avgCost === 23 && plan.lots.length === 2);
  const cash0 = d.p.cash; const r = d.run('market.sell', { visitId: v.id, goodId: '绢帛', quantity: 5 }); d.ack();
  assert.ok(r.kind === 'marketSell' && r.quantity === 5 && r.cost === 5 * 23 && r.avgCost === 23 && r.total === 5 * price && r.profit === r.total - 5 * 23 && d.p.cash === cash0 + r.total, JSON.stringify(r));
  const journal = d.p.journal.filter(j => j.type === 'marketSell'); assert.strictEqual(journal[journal.length - 1].cost, 115, 'journal cost = 5 × 23');
  assert.strictEqual(pool(d, '绢帛').reduce((n, l) => n + l.quantity, 0), 10); assert.strictEqual(avg(d, '绢帛'), 23, '部分卖出后持仓均价不变 (not recalculated)');
  assert.strictEqual(pool(d, '绢帛')[0].quantity, 5, 'units taken from the lots in inventory order (first lot 10 → 5)');
  const all = d.run('market.sell', { visitId: v.id, goodId: '绢帛', quantity: 10 }); d.ack(); assert.strictEqual(all.cost, 230);
  assert.strictEqual(pool(d, '绢帛').length, 0); assert.strictEqual(avg(d, '绢帛'), null, '全部卖光: quantity 0 and no 均价 kept anywhere');
  assert.ok(!d.p.inventory.lots.some(l => l.goodId === '绢帛'));
  const buy = d.run('market.buy', { visitId: v.id, goodId: '绢帛', quantity: 3 }); d.ack();
  assert.strictEqual(buy.avgCost, buy.unitPrice, '从 0 库存重新买入: 均价 = 本次实际整数买入单价'); assert.strictEqual(avg(d, '绢帛'), buy.unitPrice);
  const over = d.tryRun('market.sell', { visitId: v.id, goodId: '绢帛', quantity: 4 }); assert.ok(!over.ok && over.code === 'INVALID_QUANTITY');
});
test('同商品: the same productId bought in 长安 then in 敦煌 (market.buy in both) merges into one 均价; a different productId never merges', () => {
  const d = fresh(6); d.run('market.enter'); let v = d.p.market.visit;
  const b1 = d.run('market.buy', { visitId: v.id, goodId: '绢帛', quantity: 4 }); d.ack(); const paper = d.run('market.buy', { visitId: v.id, goodId: '纸张', quantity: 2 }); d.ack();
  assert.strictEqual(b1.avgCost, b1.unitPrice); assert.strictEqual(paper.avgCost, paper.unitPrice);
  d.run('market.leave', { visitId: v.id }); d.ack();
  d.p.world.city = 'dunhuang'; S.inventory.departed(d.p, 'changan'); d.run('market.enter'); v = d.p.market.visit; assert.strictEqual(v.city, 'dunhuang');
  const b2 = d.run('market.buy', { visitId: v.id, goodId: '绢帛', quantity: 6 }); d.ack();
  const expected = roundMoney((4 * b1.unitPrice + 6 * b2.unitPrice) / 10);
  assert.strictEqual(b2.avgCost, expected); assert.strictEqual(avg(d, '绢帛'), expected);
  assert.ok(pool(d, '绢帛').length === 2 && pool(d, '绢帛').every(l => l.avgCost === expected) && new Set(pool(d, '绢帛').map(l => l.acquisitionCity)).size === 2, 'two provenance lots (长安 / 敦煌), one cost');
  assert.strictEqual(avg(d, '纸张'), paper.unitPrice, '纸张 untouched by the 绢帛 purchases');
});
test('存档兼容: a save from balanceVersion 2026-09-11-rc3-logic-patch folds each good\'s batches once into one integer 均价 on load; idempotent; an RC2 save still upgrades', () => {
  const d = fresh(7); add(d, '绢帛', 6, 20); add(d, '绢帛', 3, 30); add(d, '纸张', 3, 12);
  const env = JSON.parse(JSON.stringify(d.envelope())); env.meta.balanceVersion = '2026-09-11-rc3-logic-patch'; env.ledger = {}; env.pending = null; env.results = {}; env.preferences = { tutorialEnabled: true, soundEnabled: true };
  for (const l of env.progress.inventory.lots) delete l.avgCost;
  S.core.validate(env); assert.ok(!S.core.isCurrent(env));
  const up = S.core.upgradeEnvelope(env); assert.ok(up.changed, 'upgrade applied');
  const lots = up.state.progress.inventory.lots.filter(l => l.goodId === '绢帛'); assert.ok(lots.length === 2 && lots.every(l => l.avgCost === 23), 'batches folded once: (6×20 + 3×30) / 9 = 23.33 → 23');
  assert.strictEqual(up.state.progress.inventory.lots.find(l => l.goodId === '纸张').avgCost, 12);
  assert.ok(S.core.isCurrent(up.state) && up.state.meta.migrations.some(m => m.from === '2026-09-11-rc3-logic-patch' && m.to === S.core.versions.balanceVersion));
  S.core.validate(up.state); const again = S.core.upgradeEnvelope(up.state); assert.strictEqual(again.changed, false, 'current save reloads unchanged');
  assert.strictEqual(up.state.progress.cash, env.progress.cash); assert.strictEqual(up.state.progress.world.tick, env.progress.world.tick);
  const rc2 = JSON.parse(JSON.stringify(env)); rc2.meta.balanceVersion = '2026-09-10-g01-g05'; const up2 = S.core.upgradeEnvelope(rc2); assert.ok(up2.changed && up2.state.progress.inventory.lots.filter(l => l.goodId === '绢帛').every(l => l.avgCost === 23));
});
test('validate guard: a current save whose lots of one good disagree on 均价 is rejected (INVALID_COST_BASIS) — no silent divergence can be stored', () => {
  const d = fresh(8); add(d, '绢帛', 2, 20); add(d, '绢帛', 2, 30); const env = d.envelope(); S.core.validate(env);
  env.progress.inventory.lots[1].avgCost = 30; assert.throws(() => S.core.validate(env), e => e.code === 'INVALID_COST_BASIS');
  delete env.progress.inventory.lots[1].avgCost; assert.throws(() => S.core.validate(env), e => e.code === 'INVALID_COST_BASIS');
});
test('范围回归: buy price, sale price, the supplier-discount resale cap (actual purchase price), capacity and turnover rules are untouched', () => {
  const d = fresh(9); d.run('market.enter'); const v = d.p.market.visit; const price = S.market.price(d.p, '绢帛', ctx());
  const buy = d.run('market.buy', { visitId: v.id, goodId: '绢帛', quantity: 2 }); d.ack(); assert.strictEqual(buy.unitPrice, S.market.buyQuote(d.p, '绢帛', false, ctx()).unitPrice, 'buy price rule unchanged');
  assert.strictEqual(buy.unitPrice, price);
  const lot = add(d, '漆器', 2, price - 5, { discountOriginCity: 'changan', supplierDiscountRate: .05 });
  assert.strictEqual(S.market.sellUnitPrice(d.p, lot, price), Math.min(price, price - 5), 'resale cap still uses the lot\'s actual purchase price');
  assert.strictEqual(S.inventory.capacity(d.p), 6 + (6 - 1) * 2, 'capacity formula unchanged');
  const sell = d.run('market.sell', { visitId: v.id, goodId: '绢帛', quantity: 1 }); d.ack();
  assert.strictEqual(sell.total, price, 'sale price = current market price'); assert.strictEqual(sell.transportQualified, false, 'unmoved cargo sold in its purchase city: no turnover (existing BUG-07 rule)');
  assert.strictEqual(sell.cancelledPurchaseTurnover, price, 'pending purchase turnover cancelled for the resold unit (existing rule)');
});
console.log(`weighted-average cost: ${passed}/10 passed`);
