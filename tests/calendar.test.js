'use strict';
// Simplified calendar (design decision 2026-09-13): 30-day months, 12 months a year, epoch 贞元十六年三月十一日 = world day 1.
const assert = require('assert');
const { load, driver } = require('./harness');
const S = load().Silk;
let passed = 0; const test = (name, fn) => { fn(); passed++; console.log('PASS ' + name); };
const cal = t => S.time.calendar(t);
test('epoch: tick 0 = 贞元十六年三月十一日·晨, ticks 1/2 = 午/暮 of the same day', () => {
  assert.deepStrictEqual([cal(0).label, cal(1).label, cal(2).label], ['贞元十六年三月十一日·晨', '贞元十六年三月十一日·午', '贞元十六年三月十一日·暮']);
  assert.strictEqual(cal(0).worldDay, 1); assert.strictEqual(S.time.format(0), '贞元十六年三月十一日·晨');
});
test('every month has 30 days: 三月三十日 → 四月一日, no 三十一日 anywhere in a year', () => {
  assert.strictEqual(cal(57).dateLabel, '三月三十日'); assert.strictEqual(cal(60).dateLabel, '四月一日');
  for (let t = 0; t < 3 * 360 * 2; t += 3) { const c = cal(t); assert.ok(c.day >= 1 && c.day <= 30 && c.month >= 1 && c.month <= 12, c.label); assert.ok(!/三十一/.test(c.dateLabel)); }
});
test('year rollover: 十二月三十日 → 贞元十七年正月一日, a year is 360 world days', () => {
  assert.strictEqual(cal(867).label, '贞元十六年十二月三十日·晨'); assert.strictEqual(cal(870).label, '贞元十七年正月一日·晨');
  assert.strictEqual(cal(870 + 360 * 3).label, '贞元十八年正月一日·晨'); assert.strictEqual(cal(870).worldDay, 291);
});
test('Chinese numerals: 一日 … 十日 … 十一日 … 二十日 … 二十六日 … 三十日; 正月 for month 1', () => {
  const days = []; for (let d = 1; d <= 30; d++) days.push(cal(60 + (d - 1) * 3).dayLabel);
  assert.deepStrictEqual(days.slice(0, 12), ['一日', '二日', '三日', '四日', '五日', '六日', '七日', '八日', '九日', '十日', '十一日', '十二日']);
  assert.deepStrictEqual([days[19], days[20], days[25], days[29]], ['二十日', '二十一日', '二十六日', '三十日']);
  assert.deepStrictEqual([cal(870).monthLabel, cal(870 + 30 * 3).monthLabel, cal(870 + 300 * 3).monthLabel, cal(870 + 330 * 3).monthLabel], ['正月', '二月', '十一月', '十二月']);
});
test('describe(): yearLabel / dateLabel follow the calendar on every tick (HUD, 时间 panel, loan, inn card consumers)', () => {
  const p = driver(S).p; p.world.tick = 77; const d = S.time.describe(p);
  assert.deepStrictEqual([d.yearLabel, d.dateLabel, d.phaseLabel, d.worldDay, d.tripLabel], ['贞元十六年', '四月六日', '暮', 26, '未启程']);
  p.world.tick = 870; const e = S.time.describe(p); assert.deepStrictEqual([e.yearLabel, e.dateLabel], ['贞元十七年', '正月一日']);
});
test('calendar is presentation only: ticks, day(), phase() and the 22-day 商期 arithmetic are untouched', () => {
  const p = driver(S).p; p.world.tick = 100; assert.strictEqual(S.time.day(p), 33); assert.strictEqual(S.time.phase(p), 1);
  p.trip = { id: 'probe', startedAt: 33, deadlineTick: 99, arrivedChanganTick: null, returnStatus: null, phase: 'in_city', routeIndex: 1, routeHistory: ['changan', 'dunhuang'] };
  const d = S.time.describe(p); assert.strictEqual(d.tripDay, 23); assert.strictEqual(d.tripTotal, 22); assert.strictEqual(d.deadlineLabel, '贞元十六年四月十四日·晨'); assert.strictEqual(d.remainingLabel, '已逾期0日1个时段');
  assert.throws(() => cal(-1)); assert.throws(() => cal(1.5));
});
test('help text documents the 30-day calendar', () => { const h = S.content.helpText; assert.ok(h.includes('每月固定30天') && h.includes('十二个月为一年') && h.includes('贞元十七年正月一日')); });
console.log(`calendar: ${passed}/7 passed`);
