(function (S) {
  'use strict';
  // SILKROAD_NEW_PLAYER_GUIDE_PATCH_v1.0 — the only new-player guide. A one-time HUD + 长安 map tour on the first entry of a new
  // game: entry choice 【按指引开始 / 自行探索】, fourteen short steps in the authority order, finish card with 【开始行动】. State lives in
  // the save (presentation.guide) and moves only through commands, so a double click, a reload or a re-entry never replays it.
  // No gameplay is touched: the guide only points at existing HUD elements and map entrances and never opens or recommends anything.
  const ensure = (...a) => S.util.ensure(...a);
  const STEPS = Object.freeze([
    { id: 'hud_money', title: '铜钱', copy: '这是你当前可以使用的钱财。买货、住宿和其他花费都会用到它。', target: 'hud.money' },
    { id: 'hud_time', title: '时辰', copy: '一日分为晨、昼、暮三个时段。营生、行商和部分行动会推进时段，暮后便将迎来新的一日。', target: 'hud.time' },
    { id: 'hud_reputation', title: '商誉', copy: '行商、按期完成委托等行为可以提升商誉。商誉提高后，会逐步解锁更多机会，例如筹建商号、接触更多货物，以及其他新的玩法。', target: 'hud.reputation' },
    { id: 'hud_inventory', title: '背包', copy: '这里可以查看你携带的货物、粮草和其他行囊内容。', target: 'hud.inventory', optional: true },
    { id: 'market_info_trigger', title: '查看行情', copy: '点击地图上的放大镜，可以查看当前城市的市场行情。', target: 'map.marketInfoTrigger', optional: true },
    { id: 'market_supplies', title: '补给', copy: '出发前可以在市场准备旅途所需的粮草。路途遥远，启程前记得检查是否备足。', target: 'market.supplies_or_market_entry' },
    { id: 'market_goods', title: '商品', copy: '各地都有不同的商品与行情。低价买入、合适时卖出，是商旅获利的重要方式。', target: 'market.goods_or_market_entry' },
    { id: 'commission', title: '委托', copy: '可以接取商旅委托，替人捎货、采买或寻货。有些委托需要在期限内完成。', target: 'map.commission' },
    { id: 'finance', title: '柜坊', copy: '行商途中需要打理钱财，可以来这里办理寄存、飞钱、借款与还款。', target: 'map.finance' },
    { id: 'inn', title: '客舍', copy: '商旅劳顿时，可以在这里歇脚留宿，等候新的一日。', target: 'map.inn' },
    { id: 'livelihood', title: '营生', copy: '城中有不同营生可做。花些时间帮工，可以赚取额外收入。', target: 'map.livelihood' },
    { id: 'merchant_house', title: '商号', copy: '商号需要满足一定条件后才会开放。开放后，你可以在长安筹建自己的商号，存放货物、安排售卖，并逐步经营长期生意。', target: 'map.merchantHouseLocation' },
    { id: 'depart', title: '出发', copy: '准备妥当后，就可以踏上商路。旅途中可能遇到各种随机事件和小游戏，每一次商旅都会有所不同。\n不过，启程前可别忘了储备粮草。', target: 'map.depart' },
    { id: 'more_help', title: '玩法说明', copy: '不用现在记住所有规则。如果之后忘记某项玩法，可以随时从【更多】中打开【玩法说明】查看。', target: 'map.more' }
  ]);
  const FINISH = Object.freeze({ copy: '本游戏的主要信息和玩法已经介绍完毕。接下来，就按自己的打算开始这趟商旅吧。', button: '开始行动' });
  const ENTRY = Object.freeze({ title: '初到长安', start: '按指引开始', explore: '自行探索', skip: '跳过导览', next: '下一步' });
  const VERSION = 'NEW_PLAYER_GUIDE_AUTHORITY_v1.0';
  function initial() { return { version: VERSION, status: 'pending', step: 0, startedTick: null, endedTick: null }; }
  // A save made before this patch never saw the entry choice: only a genuinely untouched game (nothing done, still in 长安) gets it.
  function fresh(p) { return p.journal.length === 0 && !p.trip && !p.departureDraft && p.tripHistory.length === 0 && p.world.city === 'changan' && !p.world.route && !(p.market && p.market.visit); }
  function effective(p) { const g = p.presentation && p.presentation.guide; if (g) return g; return fresh(p) ? initial() : { version: VERSION, status: 'done', step: STEPS.length, startedTick: null, endedTick: null, legacy: true }; }
  function write(p) { if (!p.presentation.guide) p.presentation.guide = effective(p); return p.presentation.guide; }
  function view(p) {
    const g = effective(p), atFinish = g.status === 'active' && g.step >= STEPS.length, current = g.status === 'active' && !atFinish ? STEPS[g.step] : null;
    return { version: VERSION, status: g.status, step: g.step, total: STEPS.length, atFinish, current: current ? { ...current, index: g.step + 1 } : null, entry: ENTRY, finish: FINISH,
      onMap: p.world.city === 'changan' && !p.world.route, showEntry: g.status === 'pending', active: g.status === 'active' };
  }
  function start(p) { const g = write(p); ensure(g.status === 'pending', 'GUIDE_NOT_PENDING', '新手指引已经开始或结束'); g.status = 'active'; g.step = 0; g.startedTick = p.world.tick; return { modal: false, status: g.status, step: g.step }; }
  function next(p, a) {
    const g = write(p); ensure(g.status === 'active', 'GUIDE_NOT_ACTIVE', '新手指引不在进行中');
    const step = Number(a.step); ensure(Number.isInteger(step) && step >= 0 && step <= STEPS.length, 'GUIDE_STEP', '指引步骤无效');
    if (step < g.step) return { modal: false, status: g.status, step: g.step, ignored: true };   // a late repeated click after the step already advanced
    ensure(step === g.step, 'GUIDE_STEP', '指引步骤不匹配'); ensure(g.step < STEPS.length, 'GUIDE_FINISHED', '指引已到结尾');
    g.step += 1; return { modal: false, status: g.status, step: g.step };
  }
  function skip(p) { const g = write(p); ensure(g.status === 'pending' || g.status === 'active', 'GUIDE_ENDED', '新手指引已经结束'); g.status = 'skipped'; g.endedTick = p.world.tick; return { modal: false, status: g.status, step: g.step }; }
  function finish(p) { const g = write(p); ensure(g.status === 'active' && g.step >= STEPS.length, 'GUIDE_NOT_AT_END', '请先看完全部指引'); g.status = 'done'; g.endedTick = p.world.tick; return { modal: false, status: g.status, step: g.step }; }
  S.guide = { VERSION, STEPS, FINISH, ENTRY, initial, effective, view, fresh };
  S.commands.register('guide.start', p => start(p));
  S.commands.register('guide.next', (p, a) => next(p, a || {}));
  S.commands.register('guide.skip', p => skip(p));
  S.commands.register('guide.finish', p => finish(p));
})(globalThis.Silk = globalThis.Silk || {});
