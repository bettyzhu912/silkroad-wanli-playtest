'use strict';
// SILKROAD_NEW_PLAYER_GUIDE_PATCH_v1.0 — engine acceptance: the guide state machine (entry choice, 14 steps in the authority order,
// finish, skip), idempotency of the commands, the retirement of the old notice tutorial, and no gameplay side effects.
const fs = require('fs'), path = require('path');
const { load, driver, ORDER } = require('./harness');
const ROOT = path.join(__dirname, '..'); const S = load().Silk; const results = [];
function test(id, title, fn) { const t0 = Date.now(); try { const details = fn() || []; results.push({ id, title, pass: true, details, ms: Date.now() - t0 }); } catch (e) { results.push({ id, title, pass: false, details: [String(e && e.stack || e)], ms: Date.now() - t0 }); } }
function assert(cond, msg) { if (!cond) throw new Error('ASSERT: ' + msg); }
const AUTH = ['铜钱', '时辰', '商誉', '背包', '查看行情', '补给', '商品', '委托', '柜坊', '客舍', '营生', '商号', '出发', '玩法说明'];
test('NG-1', '步骤表 = Authority 顺序与文案；无 Tick；商号必介绍；补给与商品分开', () => {
  const steps = S.guide.STEPS; assert(steps.length === 14 && steps.map(s => s.title).join('|') === AUTH.join('|'), 'order ' + steps.map(s => s.title).join('|'));
  const all = steps.map(s => s.title + s.copy).join('') + S.guide.FINISH.copy + Object.values(S.guide.ENTRY).join('');
  assert(!/tick/i.test(all) && !/settlementId|occurrenceId|eventSession/.test(all), 'no Tick / backstage words');
  assert(steps[1].copy.includes('一日分为晨、昼、暮三个时段'), '时辰 copy'); assert(steps[2].copy.includes('筹建商号') && steps[2].copy.includes('接触更多货物') && steps[2].copy.includes('其他新的玩法'), '商誉 copy');
  assert(steps[5].title === '补给' && steps[6].title === '商品', 'market split'); assert(steps[11].title === '商号' && steps[11].copy.includes('需要满足一定条件后才会开放'), '商号 introduced');
  assert(steps[12].copy.includes('随机事件') && steps[12].copy.includes('小游戏') && steps[12].copy.includes('储备粮草'), '出发 copy');
  assert(S.guide.FINISH.copy === '本游戏的主要信息和玩法已经介绍完毕。接下来，就按自己的打算开始这趟商旅吧。' && S.guide.FINISH.button === '开始行动', 'finish copy/button');
  assert(steps[3].optional && steps[4].optional && steps.filter(s => s.optional).length === 2, 'only 背包 and 行情 are optional');
  return ['14 steps, finish 开始行动'];
});
test('NG-2', '新档：首次进入长安为 pending；按指引开始 → 14 步 → 结束卡 → 开始行动 → done；期间无任何 gameplay 变化', () => {
  const d = driver(S, 31); const v0 = S.guide.view(d.p); assert(v0.status === 'pending' && v0.showEntry && v0.onMap, 'pending on first entry ' + JSON.stringify(v0));
  const snap = { cash: d.p.cash, tick: d.p.world.tick, rep: d.p.reputation.value, journal: d.p.journal.length, prov: d.p.inventory.provisions };
  d.run('guide.start'); let v = S.guide.view(d.p); assert(v.status === 'active' && v.step === 0 && v.current.id === 'hud_money' && v.current.index === 1, 'active step 1');
  for (let i = 0; i < 14; i++) { assert(S.guide.view(d.p).current.title === AUTH[i], 'step ' + i); d.run('guide.next', { step: i }); }
  v = S.guide.view(d.p); assert(v.atFinish && !v.current, 'finish card');
  d.run('guide.finish'); v = S.guide.view(d.p); assert(v.status === 'done' && !v.showEntry && !v.atFinish && !v.current, 'done');
  assert(d.p.cash === snap.cash && d.p.world.tick === snap.tick && d.p.reputation.value === snap.rep && d.p.journal.length === snap.journal && d.p.inventory.provisions === snap.prov && !d.p.presentation.activeResult && !d.p.market.visit, 'no gameplay side effect, nothing opened');
  return ['done after 14 steps; state untouched'];
});
test('NG-3', '幂等与拒绝：重复 next 忽略、错步拒绝、提前 finish 拒绝、结束后不能再 start；自行探索 = skipped；skipped/done 不重播', () => {
  const d = driver(S, 32); d.run('guide.start'); d.run('guide.next', { step: 0 });
  const late = d.run('guide.next', { step: 0 }); assert(late.ignored && S.guide.view(d.p).step === 1, 'late duplicate ignored');
  let r = d.tryRun('guide.next', { step: 5 }); assert(!r.ok && r.code === 'GUIDE_STEP', 'wrong step refused');
  r = d.tryRun('guide.finish'); assert(!r.ok && r.code === 'GUIDE_NOT_AT_END', 'early finish refused');
  r = d.tryRun('guide.start'); assert(!r.ok && r.code === 'GUIDE_NOT_PENDING', 'restart refused');
  d.run('guide.skip'); assert(S.guide.view(d.p).status === 'skipped', 'skip from active');
  r = d.tryRun('guide.start'); assert(!r.ok, 'no replay after skip'); r = d.tryRun('guide.skip'); assert(!r.ok && r.code === 'GUIDE_ENDED', 'skip twice refused');
  const e = driver(S, 33); e.run('guide.skip'); assert(S.guide.view(e.p).status === 'skipped' && !S.guide.view(e.p).showEntry, '自行探索 from the entry card');
  // 普通再次进入长安: travel out and back, still no replay
  e.p.cash = 200; e.quietRoute(60); e.quietCity(60); e.run('trip.begin'); e.run('trip.depart', { acknowledgeSupplyWarning: true }); e.p.world.route = null; e.p.world.city = 'changan'; e.p.trip.routeIndex = 4; e.p.trip.phase = 'in_city';
  assert(S.guide.view(e.p).status === 'skipped' && !S.guide.view(e.p).showEntry, 'no replay on re-entry');
  return ['refusals: GUIDE_STEP, GUIDE_NOT_AT_END, GUIDE_NOT_PENDING, GUIDE_ENDED'];
});
test('NG-4', '旧存档：没有 guide 字段的进行中存档 = done（不补播）；未动过的旧新档 = pending', () => {
  const d = driver(S, 34); delete d.p.presentation.guide; assert(S.guide.view(d.p).status === 'pending', 'untouched save gets the entry');
  d.p.cash = 200; d.quietRoute(60); d.quietCity(60); d.run('trip.begin'); delete d.p.presentation.guide; assert(S.guide.view(d.p).status === 'done' && S.guide.effective(d.p).legacy, 'in-progress save is done');
  return ['legacy handling'];
});
test('NG-5', '旧新手教学彻底停用：无 preparation 任务链、进入市场/柜坊/委托/营生不再弹教学、tutorial.visit 为空操作、旧存档中的 tutorial 通知被清除', () => {
  const d = driver(S, 35); S.tutorial.started(d.p); assert(!d.p.presentation.notices.some(n => n.kind === 'tutorial'), 'no preparation notice');
  for (const panel of ['market', 'guifang', 'commission', 'work', 'merchant_business', 'provisions', 'finance-vouchers']) { assert(S.tutorial.needsVisit(d.p, panel, {}) === false, 'no first-visit hint for ' + panel); d.run('tutorial.visit', { panel }); }
  d.p.cash = 200; d.quietRoute(60); d.quietCity(60); d.run('market.enter'); d.run('market.leave', { visitId: d.p.market.visit.id }); d.run('inn.wait', { ticks: 1 }); d.ack();
  assert(!d.p.presentation.notices.some(n => n.kind === 'tutorial'), 'no tutorial notices after commands');
  d.p.presentation.notices.push({ id: 'market.first', kind: 'tutorial', title: '市场与行囊', text: 'old', nonBlocking: true }); d.run('tutorial.visit', { panel: 'market' });
  assert(!d.p.presentation.notices.some(n => n.kind === 'tutorial'), 'persisted tutorial notice purged on the next command');
  assert(S.tutorial.retired === 'SILKROAD_NEW_PLAYER_GUIDE_PATCH_v1.0' && Object.keys(S.tutorial.hints).length === 0, 'old hint table removed');
  return ['old tutorial retired'];
});
test('NG-6', 'guide.* 属于安全 UI 命令：有待确认结果时仍可推进；不受市场/事件门禁影响', () => {
  const d = driver(S, 36); d.run('guide.start'); d.p.cash = 200; d.quietRoute(60); d.quietCity(60); d.run('inn.wait', { ticks: 1 });
  assert(d.p.presentation.activeResult, 'a result is pending'); const r = d.tryRun('guide.next', { step: 0 }); assert(r.ok && S.guide.view(d.p).step === 1, 'guide.next allowed while a result is pending: ' + (r.code || 'ok'));
  return ['safe UI command'];
});
test('NG-7', '商号开放条件与功能未变：新档 status locked，指引不改变 eligibility', () => {
  const d = driver(S, 37); const before = JSON.stringify(S.merchant.eligibility(d.p)); d.run('guide.start'); for (let i = 0; i < 14; i++) d.run('guide.next', { step: i }); d.run('guide.finish');
  assert(JSON.stringify(S.merchant.eligibility(d.p)) === before && d.p.merchant.status !== 'open', 'merchant unchanged');
  return ['eligibility unchanged'];
});
for (const r of results) console.log((r.pass ? 'PASS ' : 'FAIL ') + r.id + ' ' + r.title + (r.pass ? '  ' + r.details.join('; ') : '\n    ' + r.details.join('\n    ')));
const failed = results.filter(r => !r.pass).length; console.log(`new-player guide acceptance: ${results.length - failed}/${results.length}`);
fs.mkdirSync(path.join(ROOT, 'tests', 'results'), { recursive: true }); fs.writeFileSync(path.join(ROOT, 'tests', 'results', 'guide-acceptance.json'), JSON.stringify(results, null, 2));
process.exit(failed ? 1 : 0);
