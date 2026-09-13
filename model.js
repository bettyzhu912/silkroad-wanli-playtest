(function (S) {
  'use strict';
  class DomainError extends Error {
    constructor(code, message, details) { super(message || code); this.name = 'DomainError'; this.code = code; this.details = details || null; }
  }
  function ensure(ok, code, message, details) { if (!ok) throw new DomainError(code, message, details); }
  function integer(n, min = 0, max = Number.MAX_SAFE_INTEGER) { return Number.isSafeInteger(n) && n >= min && n <= max; }
  function clone(value) { return structuredClone(value); }
  function stable(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
    return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + stable(value[k])).join(',') + '}';
  }
  S.util = { ensure, integer, clone, stable, DomainError, id(p, prefix) { p.idCounter = (p.idCounter || 0) + 1; return prefix + '-' + p.idCounter; } };
  S.money = {
    round(value) {
      ensure(Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER, 'INVALID_MONEY', '金额无效');
      const floor = Math.floor(value);
      return floor + (value - floor > 0.5 ? 1 : 0);
    },
    signed(value) { return Math.sign(value) * S.money.round(Math.abs(value)); },
    requireAmount(value) { ensure(integer(value, 1), 'INVALID_AMOUNT', '请输入正整数金额'); return value; }
  };
  S.random = {
    next(p) { let x = p.rngState >>> 0; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; p.rngState = x >>> 0; return p.rngState / 4294967296; },
    pick(p, rows, weight = () => 1) {
      ensure(rows.length > 0, 'NO_CANDIDATE', '没有符合条件的内容');
      const weights = rows.map(weight); ensure(weights.every(w => Number.isFinite(w) && w >= 0), 'INVALID_WEIGHT');
      const total = weights.reduce((a, b) => a + b, 0); ensure(total > 0, 'NO_CANDIDATE');
      let at = S.random.next(p) * total;
      for (let i = 0; i < rows.length; i++) { at -= weights[i]; if (at < 0) return rows[i]; }
      return rows[rows.length - 1];
    }
  };
  const handlers = new Map();
  S.commands = {
    register(type, handler) { ensure(!handlers.has(type), 'DUPLICATE_HANDLER', type); handlers.set(type, handler); },
    has(type) { return handlers.has(type); },
    run(p, command, context) {
      ensure(handlers.has(command.type), 'NOT_IMPLEMENTED', '此功能尚未完成接入');
      const safeUI = ['result.ack', 'tutorial.dismiss', 'tutorial.visit', 'notice.dismiss'].includes(command.type) || command.type.startsWith('guide.');
      if (p.presentation.activeResult && !safeUI) ensure(false, 'RESULT_PENDING', '请先查看并确认上次操作结果');
      if(p.market.visit&&!p.market.visit.settled&&!safeUI)ensure(command.type.startsWith('market.')||command.type.startsWith('newspaper.')||['commission.accept','commission.pickup','commission.deliver','commission.abandon'].includes(command.type),'MARKET_VISIT_OPEN','请先离开当前市场');
      const tavernActive = p.work?.tavern && (!p.work.tavern.result || p.work.tavern.result.completionStatus === 'COMPLETED' && !p.work.tavern.resultAcknowledged);
      const routeGameActive = p.work?.routeGame && !p.work.routeGame.result;
      const caravanActive = Boolean(S.caravan?.isActive && S.caravan.isActive(p));
      if (tavernActive && !safeUI) ensure(command.type.startsWith('TAVERN_'), 'MINIGAME_ACTIVE', '请先完成当前诗令');
      if (routeGameActive && !safeUI) ensure(command.type.startsWith('RM_'), 'MINIGAME_ACTIVE', '请先处理当前路途小游戏');
      if (caravanActive && !safeUI) ensure(command.type.startsWith('CARAVAN_'), 'MINIGAME_ACTIVE', '请先完成当前驼队装货');
      if (p.eventSession && ['AWAITING_CHOICE', 'AWAITING_SKILL'].includes(p.eventSession.status) && !safeUI) ensure(command.type.startsWith('EVENT_') || command.type.startsWith('RM_'), 'EVENT_PENDING', '请先处理当前事件');
      const tracked = command.type.startsWith('finance.') || command.type.startsWith('merchant.');
      const before = tracked ? { cash:p.cash, finance:S.finance?.snapshot(p) } : null;
      // RC3 BUG-04: the city-event roll is keyed by the world day at which the action started.
      const cityCtx = { tick: p.world.tick, day: Math.floor(p.world.tick / 3), city: p.world.city, onRoute: Boolean(p.world.route) };
      let result = handlers.get(command.type)(p, command.payload || {}, context);
      if(S.market?.settlePurchaseTurnover)S.market.settlePurchaseTurnover(p);
      if(S.events?.afterCityAction)S.events.afterCityAction(p,command,cityCtx,context);
      if(S.trip?.afterCommand)result=S.trip.afterCommand(p,command,result,context);
      if (tracked) p.journal.push({type:command.type.startsWith('finance.')?'finance':'merchant',operation:command.type,tripId:p.trip?.id||null,tick:p.world.tick,cashDelta:p.cash-before.cash,before,after:{cash:p.cash,finance:S.finance?.snapshot(p)},result:clone(result)});
      // COMMISSION v3.0: the board follows the reputation tier after every command (first unlock / tier up fill immediately; consumption is topped up at the next world-day start by the time hook).
      if (S.commissions?.syncBoard) S.commissions.syncBoard(p, context);
      if(S.tutorial?.onCommand)S.tutorial.onCommand(p,command,result);
      return result;
    },
    types() { return [...handlers.keys()]; }
  };
  S.featureState = Object.freeze({
    trade: 'LOCKED', journey: 'LOCKED', randomEvents50: 'LOCKED', routeMinigames: 'LOCKED',
    commissions: 'LOCKED', storyCommissions: 'LOCKED', inn: 'LOCKED', finance: 'LOCKED',
    merchant: 'LOCKED', newspapers: 'LOCKED', tavern: 'LOCKED', saves: 'LOCKED', collectionFlags: 'LOCKED',
    changanSearchWork: 'BLOCK', changanInspectionWork: 'BLOCK', dunhuangWork: 'LOCKED', khotanWork: 'BLOCK',
    compendiumUI: 'BLOCK', compendiumRewards: 'BLOCK', compendiumProgress: 'BLOCK', compendiumNotices: 'BLOCK',
    longStories30Runtime: 'BLOCK', npcAffinity: 'BLOCK', futureCities: 'BLOCK', goodsQuality: 'DELETED', legacyProject: 'REFERENCE_ONLY'
  });
  S.core = {
    versions: Object.freeze({ releaseVersion: 'v0.3.0-competition-rc3', schemaVersion: 2, balanceVersion: '2026-09-13-commission-master-v3-1' }),
    emptyEnvelope() { return { meta: { ...S.core.versions, generation: 0, revision: 0 }, preferences: { tutorialEnabled: true, soundEnabled: true }, progress: null, ledger: {}, pending: null, results: {} }; },
    upgradeEnvelope(envelope) {
      S.core.validate(envelope);
      if(S.core.isCurrent(envelope))return {state:clone(envelope),changed:false};
      const fromRC2=['2026-09-09-effective','2026-09-10-g01-g05'].includes(envelope.meta.balanceVersion);
      ensure(fromRC2||['2026-09-11-rc3-logic-patch','2026-09-13-weighted-avg-cost','2026-09-13-qiyuan-final','2026-09-13-commission-master-v3'].includes(envelope.meta.balanceVersion),'BALANCE_UNSUPPORTED','此存档来自另一套规则版本，原记录已保留');
      ensure(!envelope.pending,'TRANSACTION_PENDING','请先恢复上次尚未保存的操作');
      const next=clone(envelope),p=next.progress;
      if(p&&fromRC2){
        p.market.purchaseTurnoverLots=p.market.purchaseTurnoverLots||{};
        p.market.pendingPurchaseTurnover=p.market.pendingPurchaseTurnover||0;
        // Legacy purchases were credited under the old rule. Do not credit them a second time.
        for(const lot of [...p.inventory.lots,...(p.merchant?.cabinets||[]).flatMap(c=>c.lots)])if(!p.market.purchaseTurnoverLots[lot.purchaseTurnoverId])lot.purchaseTurnoverPending=false;
        if(S.stories?.migrate)S.stories.migrate(p);
        if(S.pricing)S.pricing.initialise(p);
        if(S.trip?.migrate)S.trip.migrate(p);
        // RC3 logic patch migrations (BUG-02 urgent windows, BUG-06/07 transport flags, BUG-04 city rolls, BUG-14 archive).
        if(S.inventory?.migrate)S.inventory.migrate(p);
        if(S.events?.migrate)S.events.migrate(p);
      }
      // WEIGHTED_AVERAGE_INVENTORY_COST_PATCH v1.0 (RC2 and RC3-logic-patch saves): fold the batches of each good once into one integer 持仓均价.
      if(p&&S.inventory?.migrateCost)S.inventory.migrateCost(p);
      // 商路奇缘 FINAL v1.0 (all older saves): finale chapters, read-only result snapshots for completed lines, legacy chapter-5 handling — never a roll, never a reward.
      if(p&&S.stories?.migrate)S.stories.migrate(p);
      // COMMISSION_SYSTEM_MASTER_PATCH v3.0 (all older saves): global commission board, independent 30-day deadlines, arrival provenance; no second roll of existing candidates.
      if(p&&S.commissions?.migrate)S.commissions.migrate(p);
      next.meta.migrations=[...(next.meta.migrations||[]),{from:envelope.meta.balanceVersion,to:S.core.versions.balanceVersion,atRevision:envelope.meta.revision}];
      Object.assign(next.meta,S.core.versions);next.meta.revision++;
      S.core.validate(next);return {state:next,changed:true};
    },
    isCurrent(envelope){return Object.entries(S.core.versions).every(([key,value])=>envelope?.meta?.[key]===value);},
    initialProgress(mode, seed) {
      ensure(mode === 'guided' || mode === 'explore', 'INVALID_MODE');
      const progress = {
        idCounter: 0, rngState: (seed >>> 0) || 0x83ba65c1,
        world: { tick: 0, city: 'changan', route: null, arrivalSequence: 0, currentArrival: null }, cash: 200,
        inventory: { lots: [], provisions: 0, camelCount: 1 },
        reputation: { value: 0, turnover: 0, milestones: {}, firstVisits: {} },
        trip: null, tripHistory: [], market: { visit: null, prices: {}, scheduled: [], purchaseTurnoverLots: {}, pendingPurchaseTurnover: 0 },
        commissions: S.commissions ? S.commissions.initial() : { board: [], active: [], results: [], history: [] },
        stories: S.stories?S.stories.initial():{ lines: {}, lastNewChapterTrip: null, activeCargoChapter: null },
        inn: S.inn ? S.inn.initial() : { daily: {}, recentTalks: [], chains: {}, prepared: false },
        finance: S.finance ? S.finance.initial() : {}, merchant: S.merchant ? S.merchant.initial() : {},
        messages: { reports: [], observations: [] }, work: null, collectionFlags: {},
        presentation: { activeResult: null, notices: [], seen: {}, tutorialSeen: {}, tutorialEnabled: mode === 'guided' },
        journal: []
      };
      if(S.pricing)S.pricing.initialise(progress);
      return progress;
    },
    validate(envelope) {
      ensure(envelope && envelope.meta && integer(envelope.meta.generation) && integer(envelope.meta.revision), 'INVALID_SAVE');
      ensure([1,2].includes(envelope.meta.schemaVersion), 'SCHEMA_UNSUPPORTED', '此存档版本暂不能读取');
      if (!envelope.progress) return true;
      const p = envelope.progress;
      if(S.core.isCurrent(envelope)&&p.world.route&&S.trip?.routeStateValid)ensure(S.trip.routeStateValid(p),'INVALID_JOURNEY_STATE','旅程记录不完整，请恢复最近可读备份或重新开始。');
      ensure(integer(p.world.tick) && ['changan', 'dunhuang', 'khotan'].includes(p.world.city), 'INVALID_WORLD');
      ensure(integer(p.cash) && integer(p.reputation.value) && integer(p.reputation.turnover), 'INVALID_BALANCE');
      ensure(integer(p.inventory.provisions) && integer(p.inventory.camelCount, 1, 6), 'INVALID_INVENTORY');
      if(p.world.route){const r=p.world.route;ensure(p.trip&&integer(r.remainingTicks)&&integer(r.traveledTicks)&&integer(r.days,1)&&['changan','dunhuang','khotan'].includes(r.from)&&['changan','dunhuang','khotan'].includes(r.to),'INVALID_ROUTE','路程记录无效');}
      const ids = new Set();
      for (const lot of p.inventory.lots) {
        ensure(lot.id && !ids.has(lot.id), 'DUPLICATE_LOT'); ids.add(lot.id);
        ensure(integer(lot.quantity, 1) && integer(lot.acquisitionPrice), 'INVALID_LOT');
        ensure(integer(lot.slotCost,1),'INVALID_SLOT_COST');
        if(!lot.nonMarketable&&S.inventory?.good)ensure(lot.slotCost===S.inventory.good(lot.goodId).slotCost,'INVALID_SLOT_COST');
        ensure(['playerOwned', 'commissionOwned', 'storyOwned'].includes(lot.ownership), 'INVALID_OWNERSHIP');
        ensure(['intact', 'damaged', 'destroyed'].includes(lot.condition), 'INVALID_CONDITION');
        ensure(!Object.hasOwn(lot, 'quality'), 'DELETED_QUALITY');
      }
      // WEIGHTED_AVERAGE_INVENTORY_COST_PATCH v1.0: on a current save every pool lot carries the integer 持仓均价 of its good, one value per good (carried + cabinets).
      if(S.core.isCurrent(envelope)&&S.inventory?.validateCost)S.inventory.validateCost(p);
      if(S.inventory?.available)ensure(S.inventory.available(p)>=0,'CAPACITY_EXCEEDED','存档中的货物超过实际货位');
      if (S.finance?.validate) S.finance.validate(p);
      if (S.trip?.validate) S.trip.validate(p);
      if (S.merchant?.validate) S.merchant.validate(p);
      if (S.inn?.validate) S.inn.validate(p);
      if (S.core.isCurrent(envelope) && S.commissions?.validate) S.commissions.validate(p);
      if (S.newspapers?.validate) S.newspapers.validate(p);
      if (S.stories?.validate) S.stories.validate(p);
      if (S.market?.validate) S.market.validate(p);
      if (S.pricing?.validate) S.pricing.validate(p);
      return true;
    },
    context(sourceId) {
      return {
        sourceId,
        advance(p, count, reason) { return S.time.advance(p, count, { ...this, reason }); },
        // RC3 BUG-04: a formal inn stay uses the same once-per-city-day 50% roll, with the inn context attached.
        innNight(p) { return S.events?.innNight ? S.events.innNight(p, this) : null; },
        marketPrice(p, city, goodId, worldDay) {
          if(S.pricing)return S.pricing.quote(p,city,goodId,worldDay);
          const prices = p.market.prices[city];
          ensure(prices && prices.day === worldDay && integer(prices.values[goodId], 1), 'MISSING_PRICE_AUTHORITY', '正式市场价格规则尚未补齐');
          return prices.values[goodId];
        },
        assertScheduledMarketEventsSupported(){ensure(S.pricing?.policyVersion==='YUERONG-G01-2026-09-10-v1.0','PRICE_POLICY_UNAVAILABLE');}
      };
    }
  };
  S.commands.register('result.ack', (p, payload) => {
    const current = p.presentation.activeResult;
    if (!current) return { kind: 'ack', modal: false, acknowledged: false };
    ensure(current.id === payload.resultId, 'STALE_RESULT', '结果已更新');
    if (current.eventSessionId && S.events?.ack) S.events.ack(p, current.eventSessionId);
    const next=S.inn?.afterEventAcknowledged?S.inn.afterEventAcknowledged(p,current):null;
    if (S.commissions?.ackResult) S.commissions.ackResult(p,current);
    p.presentation.activeResult = null;
    if(current.kind==='tripSummary'&&p.trip?.phase==='summary')return S.trip.finish(p);
    if(next)return next;
    return { kind: 'ack', modal: false, acknowledged: true };
  });
  S.commands.register('notice.dismiss', (p, { id, ids }) => {
    const targets = ids || [id];
    ensure(Array.isArray(targets) && targets.length <= 100 && targets.every(x => typeof x === 'string'), 'INVALID_NOTICE');
    const dismissed = p.presentation.notices.filter(n => targets.includes(n.id));
    for (const n of dismissed) p.presentation.seen[n.id] = true;
    p.presentation.notices = p.presentation.notices.filter(n => !targets.includes(n.id));
    if (S.finance?.acknowledgeNotices) S.finance.acknowledgeNotices(p, dismissed);
    if (S.commissions?.acknowledgeNotices) S.commissions.acknowledgeNotices(p, dismissed);
    return { modal: false, dismissed: dismissed.length };
  });
  S.commands.register('tutorial.dismiss', (p, { id }) => {
    ensure(typeof id === 'string' && id.length < 150, 'INVALID_HINT'); p.presentation.tutorialSeen[id] = true;
    p.presentation.notices = p.presentation.notices.filter(n => !(n.kind === 'tutorial' && n.id === id));
    return { modal: false, dismissed: true };
  });
  S.commands.register('settings.update', () => { throw new DomainError('ENVELOPE_COMMAND','设置必须通过存档事务办理'); });
})(globalThis.Silk = globalThis.Silk || {});
