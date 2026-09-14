(function (S) {
  'use strict';
  // 于阗《于阗织坊》 (KHOTAN_WEAVING, FINAL v5.0 · 15 根) — host side of the one-day livelihood job, the same contract shape as 驼队装货
  // (caravan.js). The minigame itself (理丝 → 定经 → 开工 three rounds × five lines, 75 s shared sun, 急束 / 丝结 / 松脱 events, the wage bands)
  // runs unchanged in weaving-engine.js — a byte-for-byte copy of weaving-v5/weaving-engine.js of the standalone edition
  // (tests/tools/sync-livelihood-minigames.js; tests/livelihood.test.js proves parity). This file owns only the world contract: when a
  // FORMAL run may start (于阗, 晨 — FULL_DAY, see RULES), what the UI reports back, and the single settlement that pays the wage
  // through p.cash / p.journal and advances +2 ticks exactly once via ctx.advance. 试工 never touches the world.
  const ensure = (...args) => S.util.ensure(...args);
  const clone = value => S.util.clone(value);
  const E = () => S.weavingEngine || (S.weavingEngine = (typeof YutianWeavingEngine !== 'undefined' ? YutianWeavingEngine : null));
  // Time cost (integration round R32, awaiting confirmation): FINAL v5.0 defines the 75 s real-time sun but no world-time cost. The wage
  // scale (base 9 / 11 / 15 / 19 + bonuses, max 23) sits on the frozen FULL_DAY economy tier of the livelihood rules (base 9, cap 22), so
  // the job is booked as FULL_DAY — 晨 only, advanceTime(2) — exactly like 驼队装货. One constant: RULES.ticks (1 = 半日 / 2 = 一日).
  const RULES = Object.freeze({ ticks: 2, seconds: 75, lines: 15, rounds: 3, maxTotal: 23, minigameId: 'KHOTAN_WEAVING', version: 'v5.0' });
  const PHASES = Object.freeze(['晨', '午', '暮']);
  const STATUSES = Object.freeze(['complete', 'timeout']);
  const COPY = Object.freeze({
    entryTitle: '于阗织坊', entryDescription: '替织坊理丝、定经、开工织造。织成越多，工钱越多。', entryTime: '耗时：一日', entryPay: '工钱：按织成根数结算，至多 23 钱', enter: '进入织坊',
    noTime: '今日时间不足，改日再来。', cityOnly: '于阗织坊仅在于阗城内。', busy: '已有营生进行中', duration: '一日',
    stale: '这次帮工已经中断。', leave: '离开织坊', retryFinish: '重试收工', finishError: '收工记录尚未保存，请重试。', settleError: '结算尚未保存，请重试。'
  });
  function work(p) { return p.work || (p.work = S.tavern ? S.tavern.initial() : { tavern: null, lastRound: null, routeGame: null }); }
  function history(p) { const w = work(p); return w.weavingHistory || (w.weavingHistory = { formalRuns: 0 }); }
  function session(p, payload = {}) { const s = p.work && p.work.weaving; ensure(s && payload.sessionId === s.id, 'WEAVING_SESSION', '帮工会话不匹配'); return s; }
  function otherWorkActive(p) {
    const w = p.work; if (!w) return false;
    if (w.tavern && (!w.tavern.result || w.tavern.result.completionStatus === 'COMPLETED' && !w.tavern.resultAcknowledged)) return true;
    if (w.routeGame && !w.routeGame.result) return true;
    if (S.caravan && S.caravan.isActive && S.caravan.isActive(p)) return true;
    return Boolean(S.patternChain && S.patternChain.isActive && S.patternChain.isActive(p));
  }
  function availability(p) {
    const phase = p.world.tick % 3, inKhotan = p.world.city === 'khotan' && !p.world.route, enoughTime = phase + RULES.ticks <= 2;   // the day must end at 暮 at the latest (FULL_DAY → 晨 only)
    const current = p.work && p.work.weaving, busy = Boolean(current && (current.phase === 'PLAYING' || current.result && !current.settled)), otherWork = otherWorkActive(p);
    return { inKhotan, phase, phaseName: PHASES[phase], remainingTicks: 2 - phase, enoughTime, formalVisible: true, busy, otherWork,
      canStartFormal: inKhotan && enoughTime && !busy && !otherWork, canTrial: inKhotan && !busy && !otherWork, noTimeText: COPY.noTime,
      reason: !inKhotan ? COPY.cityOnly : busy ? '已有织坊帮工进行中' : otherWork ? COPY.busy : !enoughTime ? COPY.noTime : null };
  }
  function pickSeed(p) { return Math.max(1, Math.floor(S.random.next(p) * 0x7fffffff)) >>> 0; }
  function start(p, a) {
    ensure(a.mode === 'FORMAL', 'WEAVING_MODE', '试工不需要开工登记');
    const av = availability(p);
    ensure(av.inKhotan, 'WEAVING_CITY', COPY.cityOnly);
    ensure(!av.busy, 'WORK_ACTIVE', '已有织坊帮工进行中');
    ensure(!av.otherWork, 'WORK_ACTIVE', COPY.busy);
    ensure(av.enoughTime, 'WEAVING_NO_TIME', COPY.noTime);
    const h = history(p), seed = pickSeed(p), id = S.util.id(p, 'weaving');
    work(p).weaving = { id, mode: 'FORMAL', phase: 'PLAYING', startedWorldTick: p.world.tick, seed, seconds: RULES.seconds, firstFormal: h.formalRuns === 0, result: null, settled: false, settlementId: id + '-settlement' };
    h.formalRuns++;
    return view(p);
  }
  const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
  // The wage is recomputed by the host from the frozen bands (engine wagesFor on the reported counters) — the UI never sends money.
  function wages(o) { const eng = E(); ensure(eng, 'WEAVING_ENGINE', '织坊引擎未加载'); return eng.wagesFor({ weave: { totalCompleted: o.totalCompleted, roundsCompleted: o.roundsCompleted, urgentSuccess: Boolean(o.urgentSuccess) } }); }
  function finish(p, a) {
    const s = session(p, a);
    ensure(s.phase === 'PLAYING' && !s.result, 'WEAVING_NOT_PLAYING', '织坊帮工不在进行中');
    const o = a.outcome || {};
    ensure(STATUSES.includes(o.status), 'WEAVING_STATUS', '收工原因无效');
    ensure(int(o.totalCompleted, 0, RULES.lines) && int(o.roundsCompleted, 0, RULES.rounds) && typeof o.urgentSuccess === 'boolean', 'WEAVING_METRICS', '织造记录无效');
    ensure(o.roundsCompleted === Math.floor(o.totalCompleted / 5), 'WEAVING_METRICS', '轮数与根数不自洽');
    ensure(o.status === 'complete' ? o.totalCompleted === RULES.lines : o.totalCompleted < RULES.lines, 'WEAVING_METRICS', '收工原因与根数不自洽');
    const w = wages(o);
    ensure(w.total >= 0 && w.total <= RULES.maxTotal, 'WEAVING_PAYOUT', '工钱超出范围');
    s.result = { kind: 'WEAVING_RESULT', minigameId: RULES.minigameId, sessionId: s.id, settlementId: s.settlementId, mode: 'FORMAL', completionStatus: 'COMPLETED', status: o.status,
      totalCompleted: o.totalCompleted, roundsCompleted: o.roundsCompleted, urgentSuccess: Boolean(o.urgentSuccess), wages: clone(w), totalWage: w.total, ticks: RULES.ticks, title: '于阗织坊 · 今日收工' };
    s.phase = 'FINISHED';
    return view(p);
  }
  function settle(p, a, ctx) {
    const s = session(p, a);
    ensure(s.result, 'WEAVING_UNFINISHED', '织坊帮工尚未收工');
    if (s.settled) return { kind: 'weavingSettled', modal: false, settlementId: s.settlementId, alreadySettled: true, totalWage: s.result.totalWage, cashDelta: 0, ticks: 0 };
    ensure(a.settlementId === s.settlementId, 'WEAVING_SETTLEMENT', '结算凭据不匹配');
    ensure(p.world.city === 'khotan' && !p.world.route && p.world.tick === s.startedWorldTick, 'WEAVING_WORLD_CHANGED', '帮工期间的世界状态已变化');
    ensure(ctx && typeof ctx.advance === 'function', 'WEAVING_OUTER_COMMIT', '缺少统一时间提交接口');
    const beforeCash = p.cash, beforeTick = p.world.tick;
    p.cash += s.result.totalWage;   // settle first, then advance world time
    p.journal.push({ type: 'weaving', tripId: p.trip ? p.trip.id : null, sessionId: s.id, settlementId: s.settlementId, tick: beforeTick, amount: s.result.totalWage, cashDelta: s.result.totalWage, status: s.result.status, totalCompleted: s.result.totalCompleted, roundsCompleted: s.result.roundsCompleted, wages: clone(s.result.wages) });
    ctx.advance(p, RULES.ticks, 'weaving_formal_completion');
    s.settled = true; s.phase = 'SETTLED';
    return { kind: 'weavingSettled', modal: false, settlementId: s.settlementId, totalWage: s.result.totalWage, cashDelta: p.cash - beforeCash, ticks: p.world.tick - beforeTick };
  }
  function abort(p, a) {   // 主动离开织坊 = the only path that leaves without a settlement: 0 工钱, 0 时辰 (FINAL v5.0)
    const s = session(p, a);
    ensure(!s.result, 'WEAVING_FINISHED', '已收工的帮工请先结算');
    if (s.phase === 'PLAYING') { s.phase = 'ABORTED'; s.abortedAtTick = p.world.tick; }
    return view(p);
  }
  function view(p) {
    const s = p.work && p.work.weaving; if (!s) return null;
    return clone({ kind: 'WEAVING_SESSION', modal: false, sessionId: s.id, mode: s.mode, phase: s.phase, startedWorldTick: s.startedWorldTick, seed: s.seed, seconds: s.seconds, firstFormal: s.firstFormal, result: s.result, settled: s.settled, settlementId: s.settlementId });
  }
  function isActive(p) { const s = p.work && p.work.weaving; return Boolean(s && (s.phase === 'PLAYING' || s.result && !s.settled)); }
  function reduce(p, command, ctx) {
    const a = command.payload || {};
    if (command.type === 'WEAVING_START') return start(p, a);
    if (command.type === 'WEAVING_FINISH') return finish(p, a);
    if (command.type === 'WEAVING_SETTLE') return settle(p, a, ctx);
    if (command.type === 'WEAVING_ABORT') return abort(p, a);
    ensure(false, 'WEAVING_COMMAND', '不支持的织坊操作');
  }
  S.weaving = { RULES, COPY, PHASES, STATUSES, availability, wages, view, isActive, engine: E };
  ['WEAVING_START', 'WEAVING_FINISH', 'WEAVING_SETTLE', 'WEAVING_ABORT'].forEach(type => S.commands.register(type, (p, payload, ctx) => reduce(p, { type, payload }, ctx)));
})(globalThis.Silk = globalThis.Silk || {});
