(function (S) {
  'use strict';
  // NEW_PLAYER_GUIDE_CLARITY_REPLACEMENT_v1.1 — the only new-player guide. It replaces SILKROAD_NEW_PLAYER_GUIDE_PATCH_v1.0 in place
  // (same engine, same overlay mechanism, same save field presentation.guide; the v1.0 copy, step list and step ids are gone).
  // One-time HUD + 长安 map tour on the first entry of a new game: entry choice 【按指引开始 / 自行探索】, fifteen items in the fixed order
  // 铜钱 → 时辰 → 商誉 → 行囊 → 委托 → 消息 → 商情 → 市场：补给 → 市场：商品 → 柜坊 → 客舍 → 营生 → 商号 → 出发 → 更多 / 玩法说明, then the finish card.
  // The three HUD items are plain callouts. Every other item is a must-enter item: the real entrance is spotlit and clickable, the player
  // opens the real page (real state, real prices, real time rules — nothing is frozen, refunded or faked), a short in-page callout stays until
  // the page is closed, and the tour continues with the next item. 补给 and 商品 share one real market visit. The state lives in the save and
  // moves only through guide.* commands, so a double click, a reload, a page re-mount or a re-entry never replays or duplicates anything.
  const ensure = (...a) => S.util.ensure(...a);
  const VERSION = 'NEW_PLAYER_GUIDE_CLARITY_REPLACEMENT_v1.1';
  const REPLACES = 'NEW_PLAYER_GUIDE_AUTHORITY_v1.0';
  const STEPS = Object.freeze([
    { id: 'hud_money', title: '铜钱', kind: 'hud', target: 'hud.money', copy: '这里显示你当前随身可用的钱财。购买商品、补给、住宿和其他花费都会从这里支出。' },
    { id: 'hud_time', title: '时辰', kind: 'hud', target: 'hud.time', copy: '一日分为晨、昼、暮三个时段。营生、行商和部分行动会推进时段。\n商旅途中还要留意整趟商期；与此同时，委托等活动也可能有各自的期限，一定要注意哦。' },
    { id: 'hud_reputation', title: '商誉', kind: 'hud', target: 'hud.reputation', copy: '商誉代表你在丝路上的信用与名声。随着商誉提升，可以逐步解锁委托、商号资格、更多货物，以及其他经营玩法。' },
    { id: 'pack', title: '行囊', kind: 'enter', target: 'hud.pack', panels: ['pack'], entrance: '行囊', copy: '在这里可以查看你携带的商品、粮草、当前骆驼数量和可用货位。\n想扩充驼队，需要等长安商号满足筹办资格并正式开张后，在长安商号中购置更多骆驼。', inside: '这里就是行囊：携带的商品、粮草、骆驼数量和可用货位都在这一页。看完后关闭返回，继续导览。' },
    { id: 'commission', title: '委托', kind: 'enter', target: 'hud.commission', panels: ['commission'], entrance: '委托', copy: '委托是商旅中赚取钱财和积累经历的重要方式之一。\n在这里可以接取新的委托、查看正在进行中的委托，也会遇到一些特殊内容，例如商路奇缘。\n捎货：将委托人的指定货物带到指定地点。\n采买：使用自己的钱购买指定商品，再按要求交付。\n求货：找到并持有符合要求的商品后进行交付。\n不同委托会有自己的目的地、要求和期限，接取前记得看清条件。', inside: '这里就是委托：可接的新委托、正在进行中的委托，以及商路奇缘都在这一页。看完后关闭返回，继续导览。' },
    { id: 'message', title: '消息', kind: 'enter', target: 'hud.message', panels: ['message'], entrance: '消息', copy: '这里会收纳旅途中收到的各种消息和市面信息。\n想回看以前获得的商报，可以从这里进入【历史商报】查看。', inside: '这里就是消息。以前获得的商报可以从【历史商报】回看。看完后关闭返回，继续导览。', insideTarget: 'message.archive' },
    { id: 'inspect', title: '商情', kind: 'enter', target: 'map.inspect', panels: ['inspect'], entrance: '商情', copy: '想判断当前城市哪些商品更值得关注，可以查看这里的商情。\n它会提供当前市面的行情信息，帮助你判断买入和卖出的时机。\n已经获得过的旧商报，可以在顶部【消息 → 历史商报】中回看。', inside: '这里就是当前城市的商情。看完后关闭返回，继续导览。' },
    { id: 'market_supplies', title: '补给', kind: 'enter', target: 'map.market', panels: ['market'], entrance: '市场', copy: '旅途中需要的粮草可以在市场购买。\n每经过一日，整支商队会消耗 1 日份粮草。出发前一定要检查储备是否足够。', inside: '这里就是粮草补给。看过后点【下一步】，接着认识商品。', insideTarget: 'market.provisions', insideNext: true },
    { id: 'market_goods', title: '商品', kind: 'enter', sameVisit: true, target: 'map.market', panels: ['market'], entrance: '市场', copy: '普通商品也在市场买卖。不同城市会有不同的商品和价格。\n在价格合适的城市买入，再带到其他城市出售，是商旅最基本的获利方式。', inside: '看完后点【离开市场】返回，继续导览。', insideTarget: 'market.goods', insideCopy: true },
    { id: 'guifang', title: '柜坊', kind: 'enter', target: 'map.guifang', panels: ['guifang'], entrance: '柜坊', copy: '柜坊负责钱财周转，可以办理本地寄存、取钱、异地飞钱、借款和还款。\n进入柜坊后，可以查看当前适用的存款规则、借款额度、贷款利率、期限和飞钱手续费。', inside: '这里就是柜坊：存款规则、借款额度、利率、期限和飞钱手续费都以这一页显示的为准。看完后关闭返回，继续导览。' },
    { id: 'inn', title: '客舍', kind: 'enter', target: 'map.inn', panels: ['inn'], entrance: '客舍', copy: '客舍可以用来歇脚、住宿，也可能遇到商旅闲谈、消息等内容。\n如果暂时不知道下一步要做什么，客舍也是推动时间、等待新一天或新变化的一个好去处。', inside: '这里就是客舍。看完后点【离开客舍】返回，继续导览。' },
    { id: 'work', title: '营生', kind: 'enter', target: 'map.work', panels: ['work'], entrance: '营生', copy: '城中可以做不同的营生赚取现钱。\n营生会消耗一定时间，不同城市也可能有不同的营生内容。', inside: '这里就是长安的营生。看完后关闭返回，继续导览。' },
    { id: 'merchant', title: '商号', kind: 'enter', target: 'map.merchant', panels: ['merchant_business'], entrance: '商号', copy: '商号是一项长期经营玩法。满足筹办资格后，你可以在长安筹办并开张自己的商号，经营货柜、建立供应往来，并逐步发展长期生意。\n想扩充驼队、购买更多骆驼，也需要在商号开张后前往长安商号办理。', inside: '这里就是商号：筹办资格的已满足 / 未满足项目都在这一页。看完后关闭返回，继续导览。' },
    { id: 'depart', title: '出发', kind: 'enter', target: 'map.depart', panels: ['trip', 'departure'], entrance: '出发', copy: '准备好商品、粮草和随身钱财后，就可以从这里踏上商路。\n路途中可能遇到各种随机事件和小游戏，你的选择也可能影响时间、钱财、粮草或货物。\n出发前别忘了再次检查粮草是否充足。', inside: '这里就是出发页。点【敦煌】可以查看出发准备信息；看过后关闭返回，继续导览（导览期间先不启程）。', hold: 'departure.start' },
    { id: 'more_help', title: '玩法说明', kind: 'enter', target: 'hud.more', panels: ['more'], entrance: '更多', copy: '如果之后忘记某项规则，可以随时从【更多】进入【玩法说明】查看。\n市场、补给、委托、柜坊、商号、驼队等完整规则都会在这里整理。', inside: '【玩法说明】就在这里。看完后关闭返回，导览就结束了。', insideTarget: 'more.help' }
  ]);
  const FINISH = Object.freeze({ copy: '本游戏的主要信息和功能入口已经介绍完毕。之后如果有不确定的规则，可以随时查看对应页面，或从【更多 → 玩法说明】重新查找。\n接下来，就按自己的打算开始这趟商旅吧。', button: '开始行动' });
  const ENTRY = Object.freeze({ title: '初到长安', start: '按指引开始', explore: '自行探索', skip: '跳过导览', next: '下一步', enter: '进入看看' });
  const GUIDE_TEXT = Object.freeze({ enterHint: entrance => '请点击高亮的【' + entrance + '】进入看看。', infoHint: '这次先不用再进市场。', holdHint: '导览期间先不启程' });
  function initial() { return { version: VERSION, status: 'pending', step: 0, phase: 'intro', startedTick: null, endedTick: null }; }
  // Replacement rule: whatever v1.0 left in the save is converted, never played. pending stays pending (the v1.1 entry card), an unfinished
  // v1.0 tour restarts as v1.1 from item 1 (once), skipped / done stay skipped / done (never replayed).
  function convert(g) {
    if (!g || g.version === VERSION) return g;
    const status = ['pending', 'active', 'skipped', 'done'].includes(g.status) ? g.status : 'done';
    return { version: VERSION, status, step: status === 'done' ? STEPS.length : status === 'active' || status === 'pending' ? 0 : Math.min(Number(g.step) || 0, STEPS.length), phase: 'intro', startedTick: g.startedTick ?? null, endedTick: g.endedTick ?? null, replaced: g.version || 'legacy' };
  }
  // A save made before any guide existed never saw the entry choice: only a genuinely untouched game (nothing done, still in 长安) gets it.
  function fresh(p) { return p.journal.length === 0 && !p.trip && p.tripHistory.length === 0 && p.world.city === 'changan' && !p.world.route && !(p.market && p.market.visit); }
  function effective(p) { const g = p.presentation && p.presentation.guide; if (g) return convert(g); return fresh(p) ? initial() : { version: VERSION, status: 'done', step: STEPS.length, phase: 'intro', startedTick: null, endedTick: null, legacy: true }; }
  function write(p) { p.presentation.guide = effective(p); return p.presentation.guide; }
  function view(p) {
    const g = effective(p), atFinish = g.status === 'active' && g.step >= STEPS.length, current = g.status === 'active' && !atFinish ? STEPS[g.step] : null;
    return { version: VERSION, status: g.status, step: g.step, phase: g.phase || 'intro', total: STEPS.length, atFinish, current: current ? { ...current, index: g.step + 1 } : null, entry: ENTRY, finish: FINISH, text: GUIDE_TEXT,
      onMap: p.world.city === 'changan' && !p.world.route, showEntry: g.status === 'pending', active: g.status === 'active' };
  }
  function active(p) { const g = write(p); ensure(g.status === 'active', 'GUIDE_NOT_ACTIVE', '新手指引不在进行中'); return g; }
  function stepArg(g, a) { const step = Number(a.step); ensure(Number.isInteger(step) && step >= 0 && step <= STEPS.length, 'GUIDE_STEP', '指引步骤无效'); return step; }
  function reply(g, extra) { return { modal: false, status: g.status, step: g.step, phase: g.phase, ...extra }; }
  function advance(g, phase) { g.step += 1; g.phase = phase; if (g.step >= STEPS.length) g.phase = 'intro'; }
  function start(p) { const g = write(p); ensure(g.status === 'pending', 'GUIDE_NOT_PENDING', '新手指引已经开始或结束'); g.status = 'active'; g.step = 0; g.phase = 'intro'; g.startedTick = p.world.tick; return reply(g); }
  // 下一步: HUD items and the map-side 商品 note advance; inside the market the 补给 note advances to the 商品 note of the same visit.
  function next(p, a) {
    const g = active(p), step = stepArg(g, a);
    if (step < g.step) return reply(g, { ignored: true });   // a late repeated click after the step already advanced
    ensure(step === g.step && g.step < STEPS.length, 'GUIDE_STEP', '指引步骤不匹配');
    const cur = STEPS[g.step], nxt = STEPS[g.step + 1];
    if (cur.kind === 'hud' || g.phase === 'info') { advance(g, 'intro'); return reply(g); }
    if (cur.kind === 'enter' && g.phase === 'inside' && nxt && nxt.sameVisit) { advance(g, 'inside'); return reply(g); }
    ensure(false, 'GUIDE_ENTER_REQUIRED', '请先进入该页面看看');
  }
  // the real page of the current item is open → the in-page part of the item
  function entered(p, a) {
    const g = active(p), step = stepArg(g, a);
    if (step !== g.step || STEPS[g.step]?.kind !== 'enter' || g.phase !== 'intro') return reply(g, { ignored: true });
    g.phase = 'inside'; return reply(g);
  }
  // the real page was closed → the next item (leaving the market before the 商品 note moves that note to the map, without a second entry)
  function returned(p, a) {
    const g = active(p), step = stepArg(g, a);
    if (step !== g.step || STEPS[g.step]?.kind !== 'enter' || g.phase !== 'inside') return reply(g, { ignored: true });
    const nxt = STEPS[g.step + 1]; advance(g, nxt && nxt.sameVisit ? 'info' : 'intro'); return reply(g);
  }
  function skip(p) { const g = write(p); ensure(g.status === 'pending' || g.status === 'active', 'GUIDE_ENDED', '新手指引已经结束'); g.status = 'skipped'; g.endedTick = p.world.tick; return reply(g); }
  function finish(p) { const g = write(p); ensure(g.status === 'active' && g.step >= STEPS.length, 'GUIDE_NOT_AT_END', '请先看完全部指引'); g.status = 'done'; g.endedTick = p.world.tick; return reply(g); }
  S.guide = { VERSION, REPLACES, STEPS, FINISH, ENTRY, GUIDE_TEXT, initial, convert, effective, view, fresh };
  S.commands.register('guide.start', p => start(p));
  S.commands.register('guide.next', (p, a) => next(p, a || {}));
  S.commands.register('guide.entered', (p, a) => entered(p, a || {}));
  S.commands.register('guide.returned', (p, a) => returned(p, a || {}));
  S.commands.register('guide.skip', p => skip(p));
  S.commands.register('guide.finish', p => finish(p));
})(globalThis.Silk = globalThis.Silk || {});
