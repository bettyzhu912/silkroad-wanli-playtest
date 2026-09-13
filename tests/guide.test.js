'use strict';
// NEW_PLAYER_GUIDE_CLARITY_REPLACEMENT_v1.1 — engine acceptance: the replaced guide state machine (entry choice, 15 items in the fixed
// order, must-enter phases intro → inside → next item, the single market visit for 补给 + 商品, finish, skip), idempotency, the v1.0 → v1.1
// replacement rules for existing saves, the retired first-use tutorial, and no gameplay side effects.
const fs = require('fs'), path = require('path');
const { load, driver } = require('./harness');
const ROOT = path.join(__dirname, '..'); const S = load().Silk; const results = [];
function test(id, title, fn) { const t0 = Date.now(); try { const details = fn() || []; results.push({ id, title, pass: true, details, ms: Date.now() - t0 }); } catch (e) { results.push({ id, title, pass: false, details: [String(e && e.stack || e)], ms: Date.now() - t0 }); } }
function assert(cond, msg) { if (!cond) throw new Error('ASSERT: ' + msg); }
const AUTH = ['铜钱', '时辰', '商誉', '行囊', '委托', '消息', '商情', '补给', '商品', '柜坊', '客舍', '营生', '商号', '出发', '玩法说明'];
const COPY = {
  铜钱: '这里显示你当前随身可用的钱财。购买商品、补给、住宿和其他花费都会从这里支出。',
  时辰: '一日分为晨、昼、暮三个时段。营生、行商和部分行动会推进时段。\n商旅途中还要留意整趟商期；与此同时，委托等活动也可能有各自的期限，一定要注意哦。',
  商誉: '商誉代表你在丝路上的信用与名声。随着商誉提升，可以逐步解锁委托、商号资格、更多货物，以及其他经营玩法。',
  行囊: '在这里可以查看你携带的商品、粮草、当前骆驼数量和可用货位。\n想扩充驼队，需要等长安商号满足筹办资格并正式开张后，在长安商号中购置更多骆驼。',
  委托: '委托是商旅中赚取钱财和积累经历的重要方式之一。\n在这里可以接取新的委托、查看正在进行中的委托，也会遇到一些特殊内容，例如商路奇缘。\n捎货：将委托人的指定货物带到指定地点。\n采买：使用自己的钱购买指定商品，再按要求交付。\n求货：找到并持有符合要求的商品后进行交付。\n不同委托会有自己的目的地、要求和期限，接取前记得看清条件。',
  消息: '这里会收纳旅途中收到的各种消息和市面信息。\n想回看以前获得的商报，可以从这里进入【历期商报】查看。',
  商情: '想判断当前城市哪些商品更值得关注，可以查看这里的商情。\n它会提供当前市面的行情信息，帮助你判断买入和卖出的时机。\n已经获得过的旧商报，可以在顶部【消息 → 历期商报】中回看。',
  补给: '旅途中需要的粮草可以在市场购买。\n每经过一日，整支商队会消耗 1 日份粮草。出发前一定要检查储备是否足够。',
  商品: '普通商品也在市场买卖。不同城市会有不同的商品和价格。\n在价格合适的城市买入，再带到其他城市出售，是商旅最基本的获利方式。',
  柜坊: '柜坊负责钱财周转，可以办理本地寄存、取钱、异地飞钱、借款和还款。\n进入柜坊后，可以查看当前适用的存款规则、借款额度、贷款利率、期限和飞钱手续费。',
  客舍: '客舍可以用来歇脚、住宿，也可能遇到商旅闲谈、消息等内容。\n如果暂时不知道下一步要做什么，客舍也是推动时间、等待新一天或新变化的一个好去处。',
  营生: '城中可以做不同的营生赚取现钱。\n营生会消耗一定时间，不同城市也可能有不同的营生内容。',
  商号: '商号是一项长期经营玩法。满足筹办资格后，你可以在长安筹办并开张自己的商号，经营货柜、建立供应往来，并逐步发展长期生意。\n想扩充驼队、购买更多骆驼，也需要在商号开张后前往长安商号办理。',
  出发: '准备好商品、粮草和随身钱财后，就可以从这里踏上商路。\n路途中可能遇到各种随机事件和小游戏，你的选择也可能影响时间、钱财、粮草或货物。\n出发前别忘了再次检查粮草是否充足。',
  玩法说明: '如果之后忘记某项规则，可以随时从【更多】进入【玩法说明】查看。\n市场、补给、委托、柜坊、商号、驼队等完整规则都会在这里整理。'
};
const FINISH = '本游戏的主要信息和功能入口已经介绍完毕。之后如果有不确定的规则，可以随时查看对应页面，或从【更多 → 玩法说明】重新查找。\n接下来，就按自己的打算开始这趟商旅吧。';
const PANELS = { 行囊: 'pack', 委托: 'commission', 消息: 'message', 商情: 'inspect', 补给: 'market', 商品: 'market', 柜坊: 'guifang', 客舍: 'inn', 营生: 'work', 商号: 'merchant_business', 出发: 'trip', 玩法说明: 'more' };
const view = d => S.guide.view(d.p);
// walk the whole tour through the state machine exactly as the overlay does (real pages are opened / closed by the player in the browser run)
function walk(d, opts = {}) {
  d.run('guide.start');
  for (let i = 0; i < S.guide.STEPS.length; i++) {
    const s = S.guide.STEPS[i]; let v = view(d); assert(v.current && v.current.id === s.id && v.step === i, 'at ' + s.id);
    if (s.kind === 'hud') { d.run('guide.next', { step: i }); continue; }
    if (v.phase === 'info') { d.run('guide.next', { step: i }); continue; }               // the map-side 商品 note after an early market leave
    if (v.phase === 'intro') d.run('guide.entered', { step: i });                          // the player opened the real page
    v = view(d); assert(v.phase === 'inside' && v.step === i, 'inside ' + s.id);
    if (s.insideNext) { if (opts.leaveMarketEarly) { d.run('guide.returned', { step: i }); continue; } d.run('guide.next', { step: i }); continue; }   // 补给 → 商品 in the same visit
    d.run('guide.returned', { step: i });                                                     // the player closed the real page
  }
}
test('NG-1', '步骤表 = v1.1 固定顺序与逐字文案；HUD 三项为说明，其余十二项须进入真实页面；补给 / 商品 共用一次市场进入；无 Tick；商号不写"后续开放"', () => {
  const steps = S.guide.STEPS; assert(S.guide.VERSION === 'NEW_PLAYER_GUIDE_CLARITY_REPLACEMENT_v1.1' && S.guide.REPLACES === 'NEW_PLAYER_GUIDE_AUTHORITY_v1.0', 'version');
  assert(steps.length === 15 && steps.map(s => s.title).join('|') === AUTH.join('|'), 'order ' + steps.map(s => s.title).join('|'));
  for (const s of steps) assert(s.copy === COPY[s.title], 'copy of ' + s.title + ' differs');
  assert(S.guide.FINISH.copy === FINISH && S.guide.FINISH.button === '开始行动', 'finish copy / button');
  assert(steps.slice(0, 3).every(s => s.kind === 'hud') && steps.slice(3).every(s => s.kind === 'enter' && Array.isArray(s.panels) && s.panels[0] === PANELS[s.title]), 'kinds and real pages');
  assert(steps[8].sameVisit === true && steps[7].insideNext === true && steps[7].panels[0] === 'market' && steps[8].panels[0] === 'market', '补给 + 商品 share one market visit');
  assert(steps[13].panels.join() === 'trip,departure' && steps[13].hold === 'departure.start', '出发 shows the real departure pages, 开始行程 held during the tour');
  const all = steps.map(s => [s.title, s.copy, s.inside || ''].join('')).join('') + FINISH + Object.values(S.guide.ENTRY).join('') + Object.values(S.guide.GUIDE_TEXT).map(x => typeof x === 'function' ? x('X') : x).join('');
  assert(!/tick/i.test(all) && !/settlementId|occurrenceId|eventSession/.test(all), 'no Tick / backstage words');
  assert(!/后续开放|未来才会开放|以后才会开放/.test(all) && steps[12].copy.includes('长期经营玩法'), '商号 is a live system');
  assert(steps[1].copy.includes('期限') && steps[4].copy.includes('捎货') && steps[4].copy.includes('采买') && steps[4].copy.includes('求货') && steps[5].copy.includes('历期商报') && steps[6].copy.includes('消息 → 历期商报'), 'time deadlines, three commission types, 历期商报 distinction');
  return ['15 items, exact copy, finish 开始行动'];
});
test('NG-2', '新档：首次进入长安为 pending；按指引开始 → 15 项（12 项经 entered / returned）→ 结束卡 → 开始行动 → done；期间无任何 gameplay 变化', () => {
  const d = driver(S, 31); const v0 = view(d); assert(v0.status === 'pending' && v0.showEntry && v0.onMap, 'pending on first entry ' + JSON.stringify(v0));
  const snap = { cash: d.p.cash, tick: d.p.world.tick, rep: d.p.reputation.value, journal: d.p.journal.length, prov: d.p.inventory.provisions };
  walk(d); let v = view(d); assert(v.atFinish && !v.current, 'finish card');
  d.run('guide.finish'); v = view(d); assert(v.status === 'done' && !v.showEntry && !v.atFinish && !v.current, 'done');
  assert(d.p.cash === snap.cash && d.p.world.tick === snap.tick && d.p.reputation.value === snap.rep && d.p.journal.length === snap.journal && d.p.inventory.provisions === snap.prov && !d.p.presentation.activeResult && !d.p.market.visit, 'no gameplay side effect, nothing opened by the guide itself');
  return ['done after 15 items; state untouched'];
});
test('NG-3', '幂等与拒绝：进入页面前 下一步 被拒；entered / returned 重复或错位被忽略；重复 next 忽略；错步拒绝；提前 finish 拒绝；结束后不能再 start；跳过后不重播', () => {
  const d = driver(S, 32); d.run('guide.start'); d.run('guide.next', { step: 0 });
  const late = d.run('guide.next', { step: 0 }); assert(late.ignored && view(d).step === 1, 'late duplicate ignored');
  let r = d.tryRun('guide.next', { step: 5 }); assert(!r.ok && r.code === 'GUIDE_STEP', 'wrong step refused');
  d.run('guide.next', { step: 1 }); d.run('guide.next', { step: 2 }); assert(view(d).current.id === 'pack' && view(d).phase === 'intro', 'at 行囊');
  r = d.tryRun('guide.next', { step: 3 }); assert(!r.ok && r.code === 'GUIDE_ENTER_REQUIRED', '下一步 refused before entering the real page');
  assert(d.run('guide.returned', { step: 3 }).ignored && view(d).phase === 'intro', 'returned before entered ignored');
  d.run('guide.entered', { step: 3 }); assert(view(d).phase === 'inside', 'inside'); assert(d.run('guide.entered', { step: 3 }).ignored && view(d).phase === 'inside', 'entered twice ignored');
  assert(d.run('guide.entered', { step: 4 }).ignored && view(d).step === 3, 'entered for another step ignored');
  d.run('guide.returned', { step: 3 }); assert(view(d).step === 4 && view(d).phase === 'intro', 'returned → next item'); assert(d.run('guide.returned', { step: 3 }).ignored && view(d).step === 4, 'returned twice ignored');
  r = d.tryRun('guide.finish'); assert(!r.ok && r.code === 'GUIDE_NOT_AT_END', 'early finish refused');
  r = d.tryRun('guide.start'); assert(!r.ok && r.code === 'GUIDE_NOT_PENDING', 'restart refused');
  d.run('guide.entered', { step: 4 }); d.run('guide.skip'); assert(view(d).status === 'skipped', 'skip from inside a page');
  r = d.tryRun('guide.start'); assert(!r.ok, 'no replay after skip'); r = d.tryRun('guide.skip'); assert(!r.ok && r.code === 'GUIDE_ENDED', 'skip twice refused');
  const e = driver(S, 33); e.run('guide.skip'); assert(view(e).status === 'skipped' && !view(e).showEntry, '自行探索 from the entry card');
  e.p.cash = 200; e.quietRoute(60); e.quietCity(60); e.run('trip.begin'); e.run('trip.depart', { acknowledgeSupplyWarning: true }); e.p.world.route = null; e.p.world.city = 'changan'; e.p.trip.routeIndex = 4; e.p.trip.phase = 'in_city';
  assert(view(e).status === 'skipped' && !view(e).showEntry, 'no replay on re-entry');
  return ['refusals: GUIDE_STEP, GUIDE_ENTER_REQUIRED, GUIDE_NOT_AT_END, GUIDE_NOT_PENDING, GUIDE_ENDED; ignored: late / misplaced entered / returned'];
});
test('NG-4', '替换迁移：v1.0 未完成 → v1.1 从第 1 项重来一次；v1.0 pending → v1.1 入口卡；v1.0 done / skipped → 不重播；无 guide 字段的进行中存档 = done；写回后版本即 v1.1', () => {
  const d = driver(S, 34); delete d.p.presentation.guide; assert(view(d).status === 'pending', 'untouched save gets the entry');
  d.p.cash = 200; d.quietRoute(60); d.quietCity(60); d.run('inn.wait', { ticks: 1 }); d.ack(); delete d.p.presentation.guide; assert(view(d).status === 'done' && S.guide.effective(d.p).legacy, 'in-progress save is done');
  const v10 = status => ({ version: 'NEW_PLAYER_GUIDE_AUTHORITY_v1.0', status, step: status === 'active' ? 7 : status === 'done' ? 14 : 0, startedTick: 0, endedTick: null });
  const a = driver(S, 341); a.p.presentation.guide = v10('active'); let v = view(a); assert(v.status === 'active' && v.step === 0 && v.phase === 'intro' && v.current.id === 'hud_money' && v.version === S.guide.VERSION, 'v1.0 mid-tour → v1.1 restarts at item 1: ' + JSON.stringify([v.status, v.step]));
  a.run('guide.next', { step: 0 }); assert(a.p.presentation.guide.version === S.guide.VERSION && a.p.presentation.guide.replaced === 'NEW_PLAYER_GUIDE_AUTHORITY_v1.0' && a.p.presentation.guide.step === 1, 'persisted as v1.1 after the first command');
  const b = driver(S, 342); b.p.presentation.guide = v10('pending'); assert(view(b).status === 'pending' && view(b).showEntry, 'v1.0 pending → v1.1 entry card');
  const c = driver(S, 343); c.p.presentation.guide = v10('done'); assert(view(c).status === 'done' && !view(c).showEntry && !view(c).current, 'v1.0 done stays done'); assert(!c.tryRun('guide.start').ok, 'no replay');
  const e = driver(S, 344); e.p.presentation.guide = v10('skipped'); assert(view(e).status === 'skipped' && !view(e).showEntry, 'v1.0 skipped stays skipped');
  return ['legacy handling; v1.0 states converted, never played'];
});
test('NG-5', '旧首次教学彻底停用：无 preparation 任务链、进入市场 / 柜坊 / 委托 / 营生 / 商号不再弹教学、tutorial.visit 为空操作、旧存档中的 tutorial 通知被清除', () => {
  const d = driver(S, 35); S.tutorial.started(d.p); assert(!d.p.presentation.notices.some(n => n.kind === 'tutorial'), 'no preparation notice');
  for (const panel of ['market', 'guifang', 'commission', 'work', 'merchant_business', 'provisions', 'finance-vouchers', 'pack', 'message', 'inspect', 'inn', 'trip', 'more']) { assert(S.tutorial.needsVisit(d.p, panel, {}) === false, 'no first-visit hint for ' + panel); d.run('tutorial.visit', { panel }); }
  d.p.cash = 200; d.quietRoute(60); d.quietCity(60); d.run('market.enter'); d.run('market.leave', { visitId: d.p.market.visit.id }); d.run('inn.wait', { ticks: 1 }); d.ack();
  assert(!d.p.presentation.notices.some(n => n.kind === 'tutorial'), 'no tutorial notices after commands');
  d.p.presentation.notices.push({ id: 'market.first', kind: 'tutorial', title: '市场与行囊', text: 'old', nonBlocking: true }); d.run('tutorial.visit', { panel: 'market' });
  assert(!d.p.presentation.notices.some(n => n.kind === 'tutorial'), 'persisted tutorial notice purged on the next command');
  assert(S.tutorial.retired === 'NEW_PLAYER_GUIDE_CLARITY_REPLACEMENT_v1.1' && Object.keys(S.tutorial.hints).length === 0, 'old hint table removed');
  return ['old tutorial retired'];
});
test('NG-6', 'guide.* 属于安全 UI 命令：有待确认结果时仍可推进；不受市场 / 事件门禁影响；市场进入中也可推进', () => {
  const d = driver(S, 36); d.run('guide.start'); d.p.cash = 200; d.quietRoute(60); d.quietCity(60); d.run('inn.wait', { ticks: 1 });
  assert(d.p.presentation.activeResult, 'a result is pending'); let r = d.tryRun('guide.next', { step: 0 }); assert(r.ok && view(d).step === 1, 'guide.next allowed while a result is pending: ' + (r.code || 'ok'));
  d.ack(); d.run('guide.next', { step: 1 }); d.run('guide.next', { step: 2 }); for (let i = 3; i < 7; i++) { d.run('guide.entered', { step: i }); d.run('guide.returned', { step: i }); }
  assert(view(d).current.id === 'market_supplies', 'at the market item'); d.run('market.enter'); assert(d.p.market.visit && !d.p.market.visit.settled, 'visit open');
  r = d.tryRun('guide.entered', { step: 7 }); assert(r.ok && view(d).phase === 'inside', 'guide.entered allowed inside the market visit'); r = d.tryRun('guide.next', { step: 7 }); assert(r.ok && view(d).current.id === 'market_goods' && view(d).phase === 'inside', '补给 → 商品 inside the same visit');
  d.run('market.leave', { visitId: d.p.market.visit.id }); d.run('guide.returned', { step: 8 }); assert(view(d).current.id === 'guifang' && view(d).phase === 'intro', 'leaving the market → 柜坊');
  return ['safe UI command; one market visit'];
});
test('NG-7', '商号开放条件与功能未变：新档 status locked，指引不改变 eligibility', () => {
  const d = driver(S, 37); const before = JSON.stringify(S.merchant.eligibility(d.p)); walk(d); d.run('guide.finish');
  assert(JSON.stringify(S.merchant.eligibility(d.p)) === before && d.p.merchant.status !== 'open', 'merchant unchanged');
  return ['eligibility unchanged'];
});
test('NG-8', '市场只进一次：补给 → 下一步 → 商品 → 离开市场 → 柜坊；若在补给时就离开市场，商品改为地图说明（不要求再次进入），下一步 → 柜坊', () => {
  const d = driver(S, 38); d.run('guide.start'); for (let i = 0; i < 3; i++) d.run('guide.next', { step: i }); for (let i = 3; i < 7; i++) { d.run('guide.entered', { step: i }); d.run('guide.returned', { step: i }); }
  assert(view(d).current.id === 'market_supplies' && view(d).phase === 'intro', 'market item');
  d.run('guide.entered', { step: 7 }); d.run('guide.next', { step: 7 }); let v = view(d); assert(v.current.id === 'market_goods' && v.phase === 'inside', '商品 inside the same visit');
  assert(!d.tryRun('guide.next', { step: 8 }).ok, '商品 inside has no 下一步 (leaving the market continues)');
  d.run('guide.returned', { step: 8 }); assert(view(d).current.id === 'guifang' && view(d).phase === 'intro', '→ 柜坊');
  const e = driver(S, 39); e.run('guide.start'); for (let i = 0; i < 3; i++) e.run('guide.next', { step: i }); for (let i = 3; i < 7; i++) { e.run('guide.entered', { step: i }); e.run('guide.returned', { step: i }); }
  e.run('guide.entered', { step: 7 }); e.run('guide.returned', { step: 7 }); v = view(e); assert(v.current.id === 'market_goods' && v.phase === 'info', 'early leave → 商品 as a map note: ' + JSON.stringify([v.current.id, v.phase]));
  assert(e.run('guide.entered', { step: 8 }).ignored && view(e).phase === 'info', 'no second entry expected'); e.run('guide.next', { step: 8 }); assert(view(e).current.id === 'guifang', 'note → 柜坊');
  const f = driver(S, 40); walk(f, { leaveMarketEarly: true }); assert(view(f).atFinish, 'the early-leave path also reaches the finish card');
  return ['one visit; early-leave fallback'];
});
for (const r of results) console.log((r.pass ? 'PASS ' : 'FAIL ') + r.id + ' ' + r.title + (r.pass ? '  ' + r.details.join('; ') : '\n    ' + r.details.join('\n    ')));
const failed = results.filter(r => !r.pass).length; console.log(`new-player guide acceptance: ${results.length - failed}/${results.length}`);
fs.mkdirSync(path.join(ROOT, 'tests', 'results'), { recursive: true }); fs.writeFileSync(path.join(ROOT, 'tests', 'results', 'guide-acceptance.json'), JSON.stringify(results, null, 2));
process.exit(failed ? 1 : 0);
