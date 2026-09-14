(function (S) {
  'use strict';
  // 敦煌《驼队装货》 (Dunhuang caravan loading) — host side of the one-day livelihood job. The minigame itself (boards, frozen v0.3
  // rules, scoring, the 75 s three-batch session) runs unchanged in caravan-engine.js, bundled from caravan-demo/engine/*.js of the
  // standalone archive v1.0. This file owns only the world contract: when a FORMAL run may start (敦煌, 晨, no other work), what the
  // UI reports back, and the single settlement that pays the wage through p.cash / p.journal and advances +2 ticks exactly once via
  // ctx.advance. Trial runs never touch the world and therefore never reach these commands.
  const ensure = (...args) => S.util.ensure(...args);
  const clone = value => S.util.clone(value);
  const E = () => S.caravanEngine;
  const RULES = Object.freeze({ ticks: 2, seconds: 75, groups: 500, cashCap: 22, minigameId: 'DUNHUANG_CARAVAN_LOADING', version: 'v1.0' });
  const PHASES = Object.freeze(['晨', '昼', '暮']);   // P0 phase names for the host's 晨 / 午 / 暮 ticks
  const TIERS = Object.freeze(['MODEST', 'NORMAL', 'RICH']);
  const COPY = Object.freeze({
    entryTitle: '驼队装货', entryDescription: '替货栈将货物稳妥装上驼背。左右装匀，货物放稳，可多得工钱。', entryTime: '耗时：一日', entryPay: '工钱：按装载结算，至多 22 钱', enter: '进入货栈',
    noTime: '今日时间不足，改日再来。', cityOnly: '驼队装货仅在敦煌城内。', busy: '已有营生进行中', startDuration: '正式装货耗时一日',
    abortTitle: '要结束这次装货吗？', abortBody: '已完成的进度不会保留，本次也不会获得工钱或消耗时间。', abortContinue: '继续装货', abortLeave: '结束装货',
    stale: '这次装货已经中断。', leave: '离开货栈', retryFinish: '重试收工', finishError: '收工记录尚未保存，请重试。', finishWork: '结束帮工'   // UI supplement v1.0 §7.6: the settlement keeps a single 结束帮工 (返回营生 / 退出营生 withdrawn)
  });
  function work(p) { return p.work || (p.work = S.tavern ? S.tavern.initial() : { tavern: null, lastRound: null, routeGame: null }); }
  function history(p) { const w = work(p); return w.caravanHistory || (w.caravanHistory = { formalRuns: 0, recentGroups: [] }); }
  function session(p, payload = {}) { const s = p.work && p.work.caravan; ensure(s && payload.sessionId === s.id, 'CARAVAN_SESSION', '装货会话不匹配'); return s; }
  function otherWorkActive(p) {
    const w = p.work; if (!w) return false;
    if (w.tavern && (!w.tavern.result || w.tavern.result.completionStatus === 'COMPLETED' && !w.tavern.resultAcknowledged)) return true;
    if (w.routeGame && !w.routeGame.result) return true;
    if (S.patternChain && S.patternChain.isActive && S.patternChain.isActive(p)) return true;
    return Boolean(S.weaving && S.weaving.isActive && S.weaving.isActive(p));
  }
  // FORMAL entry follows the frozen P0 rule (formal_entry): visible unless 暮, enabled only at 晨 — 晨 + 2 ticks ends exactly at 暮.
  function availability(p) {
    const phase = p.world.tick % 3, inDunhuang = p.world.city === 'dunhuang' && !p.world.route, entry = E().formal_entry(PHASES[phase]);
    const current = p.work && p.work.caravan, busy = Boolean(current && (current.phase === 'PLAYING' || current.result && !current.settled)), otherWork = otherWorkActive(p);
    return { inDunhuang, phase, phaseName: PHASES[phase], remainingTicks: 2 - phase, enoughTime: entry.enabled, formalVisible: entry.visible, busy, otherWork,
      canStartFormal: inDunhuang && entry.enabled && !busy && !otherWork, canTrial: inDunhuang && !busy && !otherWork, noTimeText: COPY.noTime,
      reason: !inDunhuang ? COPY.cityOnly : busy ? '已有装货活计进行中' : otherWork ? COPY.busy : !entry.enabled ? COPY.noTime : null };
  }
  // The question set (test group 0–499 of the verified generator) is drawn from the host's deterministic RNG and stored in the session,
  // so the boards are reproducible from the save without persisting them.
  function pickGroup(p, recent) { let g, tries = 0; do { g = Math.min(RULES.groups - 1, Math.floor(S.random.next(p) * RULES.groups)); tries++; } while (recent.includes(g) && tries < 8); return g; }
  function start(p, a) {
    ensure(a.mode === 'FORMAL', 'CARAVAN_MODE', '试玩不需要开工登记');
    const av = availability(p);
    ensure(av.inDunhuang, 'CARAVAN_CITY', COPY.cityOnly);
    ensure(!av.busy, 'WORK_ACTIVE', '已有装货活计进行中');
    ensure(!av.otherWork, 'WORK_ACTIVE', COPY.busy);
    ensure(av.enoughTime, 'CARAVAN_NO_TIME', COPY.noTime);
    const h = history(p), groupIndex = pickGroup(p, h.recentGroups), id = S.util.id(p, 'caravan');
    work(p).caravan = { id, mode: 'FORMAL', phase: 'PLAYING', startedWorldTick: p.world.tick, groupIndex, seconds: RULES.seconds, firstFormal: h.formalRuns === 0, result: null, settled: false, settlementId: id + '-settlement' };
    h.formalRuns++; h.recentGroups = [...h.recentGroups, groupIndex].slice(-5);
    return view(p);
  }
  const seconds = v => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= RULES.seconds;
  function finish(p, a) {
    const s = session(p, a);
    ensure(s.phase === 'PLAYING' && !s.result, 'CARAVAN_NOT_PLAYING', '装货活计不在进行中');
    const o = a.outcome || {};
    ensure(['ALL_BATCHES_COMPLETED', 'TIMEOUT'].includes(o.reason), 'CARAVAN_REASON', '收工原因无效');
    ensure(Array.isArray(o.tiers) && o.tiers.length <= 3 && o.tiers.every(t => TIERS.includes(t)), 'CARAVAN_TIERS', '批次记录无效');
    ensure(o.reason !== 'ALL_BATCHES_COMPLETED' || o.tiers.length === 3, 'CARAVAN_TIERS', '三批完成才可提前收工');
    ensure(seconds(o.elapsedSeconds) && seconds(o.remainingSeconds), 'CARAVAN_CLOCK', '计时记录无效');
    const pay = E().payout(o.tiers);   // frozen v0.3 economy: base 9 once ≥1 batch, completion 2/2/3, quality by tier, cap 22
    ensure(pay.cash >= 0 && pay.cash <= RULES.cashCap, 'CARAVAN_PAYOUT', '工钱超出范围');
    s.result = { kind: 'CARAVAN_RESULT', minigameId: RULES.minigameId, sessionId: s.id, settlementId: s.settlementId, mode: 'FORMAL', completionStatus: 'COMPLETED', reason: o.reason,
      completed: o.tiers.length, tiers: o.tiers.slice(), baseWage: pay.baseWage, extraWage: pay.extraWage, rewards: clone(pay.rewards), totalWage: pay.cash, ticks: RULES.ticks,
      elapsedSeconds: o.elapsedSeconds, remainingSeconds: o.remainingSeconds, title: o.tiers.length === 3 ? '驼队装货完成' : '驼队装货结束' };
    s.phase = 'FINISHED';
    return view(p);
  }
  function settle(p, a, ctx) {
    const s = session(p, a);
    ensure(s.result, 'CARAVAN_UNFINISHED', '装货活计尚未收工');
    if (s.settled) return { kind: 'caravanSettled', modal: false, settlementId: s.settlementId, alreadySettled: true, totalWage: s.result.totalWage, cashDelta: 0, ticks: 0 };
    ensure(a.settlementId === s.settlementId, 'CARAVAN_SETTLEMENT', '结算凭据不匹配');
    ensure(p.world.city === 'dunhuang' && !p.world.route && p.world.tick === s.startedWorldTick, 'CARAVAN_WORLD_CHANGED', '装货期间的世界状态已变化');
    ensure(ctx && typeof ctx.advance === 'function', 'CARAVAN_OUTER_COMMIT', '缺少统一时间提交接口');
    const beforeCash = p.cash, beforeTick = p.world.tick;
    p.cash += s.result.totalWage;
    p.journal.push({ type: 'caravan', tripId: p.trip ? p.trip.id : null, sessionId: s.id, settlementId: s.settlementId, tick: beforeTick, amount: s.result.totalWage, cashDelta: s.result.totalWage, completed: s.result.completed, tiers: s.result.tiers.slice() });
    ctx.advance(p, RULES.ticks, 'caravan_formal_completion');
    s.settled = true; s.phase = 'SETTLED';
    return { kind: 'caravanSettled', modal: false, settlementId: s.settlementId, totalWage: s.result.totalWage, cashDelta: p.cash - beforeCash, ticks: p.world.tick - beforeTick };
  }
  function abort(p, a) {
    const s = session(p, a);
    ensure(!s.result, 'CARAVAN_FINISHED', '已收工的活计请在货栈结算');
    if (s.phase === 'PLAYING') { s.phase = 'ABORTED'; s.abortedAtTick = p.world.tick; }
    return view(p);
  }
  function view(p) {
    const s = p.work && p.work.caravan; if (!s) return null;
    return clone({ kind: 'CARAVAN_SESSION', modal: false, sessionId: s.id, mode: s.mode, phase: s.phase, startedWorldTick: s.startedWorldTick, groupIndex: s.groupIndex, seconds: s.seconds, firstFormal: s.firstFormal, result: s.result, settled: s.settled, settlementId: s.settlementId });
  }
  function isActive(p) { const s = p.work && p.work.caravan; return Boolean(s && (s.phase === 'PLAYING' || s.result && !s.settled)); }
  function reduce(p, command, ctx) {
    const a = command.payload || {};
    if (command.type === 'CARAVAN_START') return start(p, a);
    if (command.type === 'CARAVAN_FINISH') return finish(p, a);
    if (command.type === 'CARAVAN_SETTLE') return settle(p, a, ctx);
    if (command.type === 'CARAVAN_ABORT') return abort(p, a);
    ensure(false, 'CARAVAN_COMMAND', '不支持的装货操作');
  }
  S.caravan = { RULES, COPY, PHASES, TIERS, availability, view, isActive };
  ['CARAVAN_START', 'CARAVAN_FINISH', 'CARAVAN_SETTLE', 'CARAVAN_ABORT'].forEach(type => S.commands.register(type, (p, payload, ctx) => reduce(p, { type, payload }, ctx)));
})(globalThis.Silk = globalThis.Silk || {});
