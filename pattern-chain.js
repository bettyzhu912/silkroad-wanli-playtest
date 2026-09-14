(function (S) {
  'use strict';
  // 敦煌《缀纹成章》 (DUNHUANG_PATTERN_CHAIN) — host side of the half-day livelihood job, the same contract shape as 驼队装货 (caravan.js).
  // The minigame itself (6×7 board, 60 s / 10 strokes, chains, wildcards, gravity, shuffle, four-level representative rule) runs
  // unchanged in pattern-chain-engine.js — a byte-for-byte copy of pattern-chain/pattern-chain-engine.js of the standalone edition
  // (tests/tools/sync-livelihood-minigames.js; tests/livelihood.test.js proves parity). This file owns only the world contract: when a
  // FORMAL run may start (敦煌, 晨 / 午 — HALF_DAY, C4 frozen), what the UI reports back, and the single settlement that pays the wage
  // through p.cash / p.journal and advances +1 tick exactly once via ctx.advance. Trial runs never touch the world.
  const ensure = (...args) => S.util.ensure(...args);
  const clone = value => S.util.clone(value);
  const E = () => S.patternChainEngine || (S.patternChainEngine = (typeof PatternChainEngine !== 'undefined' ? PatternChainEngine : null));
  // TEMP_CASH_MAPPING_v0 (integration round R32): the score → cash mapping was left unfrozen by Master v1.1 (C3); the main game needs a
  // wage to pay, so this table applies the frozen HALF_DAY economy bounds of Master §2.2 (base 5, normal completion ≥ 6 = base + 1,
  // cap 15) to the score: base 5 once ≥ 1 valid stroke, extra = floor(score / 6) clamped so that total ∈ [6, 15]; a run without a valid
  // stroke pays 0 (like a caravan run without a batch). One table, no tiers (performanceTier stays unfrozen / null). Awaiting confirmation.
  const RULES = Object.freeze({ ticks: 1, seconds: 60, strokes: 10, baseWage: 5, minWage: 6, cashCap: 15, scorePerCoin: 6, minigameId: 'DUNHUANG_PATTERN_CHAIN', version: 'v0.1', cashMapping: 'TEMP_CASH_MAPPING_v0' });
  const PHASES = Object.freeze(['晨', '午', '暮']);
  const END_REASONS = Object.freeze(['TIME', 'STROKES', 'NO_MOVE_UNRESOLVED']);
  const COPY = Object.freeze({
    entryTitle: '缀纹成章', entryDescription: '连缀纹样，观其成章。拖动连起相同纹样，连得越长，得分越高。', entryTime: '耗时：半日', entryPay: '工钱：按得分结算，至多 15 钱', enter: '进入纹坊',
    noTime: '今日时间不足，改日再来。', cityOnly: '缀纹成章仅在敦煌城内。', busy: '已有营生进行中', duration: '半日',
    abortTitle: '中止本次帮工？', abortBody: '本局不计收益，不推进时间，不写入记录。', abortTrialBody: '中止本次试玩？本局不会保留任何结果。', abortContinue: '继续帮工', abortContinueTrial: '继续试玩', abortLeave: '中止',
    stale: '这次帮工已经中断。', leave: '离开纹坊', retryFinish: '重试收工', finishError: '收工记录尚未保存，请重试。', finishWork: '结束帮工'
  });
  function work(p) { return p.work || (p.work = S.tavern ? S.tavern.initial() : { tavern: null, lastRound: null, routeGame: null }); }
  function history(p) { const w = work(p); return w.patternHistory || (w.patternHistory = { formalRuns: 0 }); }
  function session(p, payload = {}) { const s = p.work && p.work.pattern; ensure(s && payload.sessionId === s.id, 'PATTERN_SESSION', '帮工会话不匹配'); return s; }
  function otherWorkActive(p) {
    const w = p.work; if (!w) return false;
    if (w.tavern && (!w.tavern.result || w.tavern.result.completionStatus === 'COMPLETED' && !w.tavern.resultAcknowledged)) return true;
    if (w.routeGame && !w.routeGame.result) return true;
    if (S.caravan && S.caravan.isActive && S.caravan.isActive(p)) return true;
    return Boolean(S.weaving && S.weaving.isActive && S.weaving.isActive(p));
  }
  // HALF_DAY entry (Master v1.1 §2.1 / C4): 晨 and 午 may start, 暮 may not; the formal button stays visible (disabled with the reason).
  function availability(p) {
    const phase = p.world.tick % 3, inDunhuang = p.world.city === 'dunhuang' && !p.world.route, enoughTime = phase < 2;
    const current = p.work && p.work.pattern, busy = Boolean(current && (current.phase === 'PLAYING' || current.result && !current.settled)), otherWork = otherWorkActive(p);
    return { inDunhuang, phase, phaseName: PHASES[phase], remainingTicks: 2 - phase, enoughTime, formalVisible: true, busy, otherWork,
      canStartFormal: inDunhuang && enoughTime && !busy && !otherWork, canTrial: inDunhuang && !busy && !otherWork, noTimeText: COPY.noTime,
      reason: !inDunhuang ? COPY.cityOnly : busy ? '已有缀纹帮工进行中' : otherWork ? COPY.busy : !enoughTime ? COPY.noTime : null };
  }
  // The board seed comes from the host's deterministic RNG and is stored in the session, so a run is reproducible from the save.
  function pickSeed(p) { return Math.max(1, Math.floor(S.random.next(p) * 0x7fffffff)) >>> 0; }
  function start(p, a) {
    ensure(a.mode === 'FORMAL', 'PATTERN_MODE', '试玩不需要开工登记');
    const av = availability(p);
    ensure(av.inDunhuang, 'PATTERN_CITY', COPY.cityOnly);
    ensure(!av.busy, 'WORK_ACTIVE', '已有缀纹帮工进行中');
    ensure(!av.otherWork, 'WORK_ACTIVE', COPY.busy);
    ensure(av.enoughTime, 'PATTERN_NO_TIME', COPY.noTime);
    const h = history(p), seed = pickSeed(p), id = S.util.id(p, 'pattern');
    work(p).pattern = { id, mode: 'FORMAL', phase: 'PLAYING', startedWorldTick: p.world.tick, seed, seconds: RULES.seconds, strokes: RULES.strokes, firstFormal: h.formalRuns === 0, result: null, settled: false, settlementId: id + '-settlement' };
    h.formalRuns++;
    return view(p);
  }
  const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
  function payout(o) {   // TEMP_CASH_MAPPING_v0, see RULES
    if (!o.validStrokes) return { baseWage: 0, extraWage: 0, cash: 0 };
    const total = Math.min(RULES.cashCap, Math.max(RULES.minWage, RULES.baseWage + Math.floor(o.score / RULES.scorePerCoin)));
    return { baseWage: RULES.baseWage, extraWage: total - RULES.baseWage, cash: total };
  }
  function finish(p, a) {
    const s = session(p, a);
    ensure(s.phase === 'PLAYING' && !s.result, 'PATTERN_NOT_PLAYING', '缀纹帮工不在进行中');
    const o = a.outcome || {}, motifs = E() ? E().MOTIFS : [];
    ensure(END_REASONS.includes(o.endedBy), 'PATTERN_REASON', '收工原因无效');
    ensure(int(o.validStrokes, 0, RULES.strokes) && int(o.score, 0, 800) && int(o.longestChain, 0, 42) && int(o.wildcardsGenerated, 0, RULES.strokes), 'PATTERN_METRICS', '成绩记录无效');
    ensure(o.validStrokes === 0 ? o.score === 0 && o.longestChain === 0 : o.score >= 3 * o.validStrokes && o.longestChain >= 3, 'PATTERN_METRICS', '成绩记录不自洽');
    ensure(o.endedBy !== 'STROKES' || o.validStrokes === RULES.strokes, 'PATTERN_METRICS', '笔数用尽的记录不自洽');
    ensure(o.representativeMotif === null || motifs.includes(o.representativeMotif), 'PATTERN_MOTIF', '代表纹样无效');
    ensure(o.validStrokes > 0 ? o.representativeMotif !== null : o.representativeMotif === null, 'PATTERN_MOTIF', '代表纹样与落笔数不自洽');
    ensure(int(o.elapsedMs, 0, RULES.seconds * 1000 + 5000), 'PATTERN_CLOCK', '计时记录无效');
    const pay = payout(o);
    ensure(pay.cash >= 0 && pay.cash <= RULES.cashCap, 'PATTERN_PAYOUT', '工钱超出范围');
    s.result = { kind: 'PATTERN_RESULT', minigameId: RULES.minigameId, sessionId: s.id, settlementId: s.settlementId, mode: 'FORMAL', completionStatus: 'COMPLETED', endedBy: o.endedBy,
      score: o.score, validStrokes: o.validStrokes, longestChain: o.longestChain, wildcardsGenerated: o.wildcardsGenerated, representativeMotif: o.representativeMotif, elapsedMs: o.elapsedMs,
      baseWage: pay.baseWage, extraWage: pay.extraWage, totalWage: pay.cash, cashMapping: RULES.cashMapping, ticks: RULES.ticks, title: '缀纹成章 · 帮工完成' };
    s.phase = 'FINISHED';
    return view(p);
  }
  function settle(p, a, ctx) {
    const s = session(p, a);
    ensure(s.result, 'PATTERN_UNFINISHED', '缀纹帮工尚未收工');
    if (s.settled) return { kind: 'patternSettled', modal: false, settlementId: s.settlementId, alreadySettled: true, totalWage: s.result.totalWage, cashDelta: 0, ticks: 0 };
    ensure(a.settlementId === s.settlementId, 'PATTERN_SETTLEMENT', '结算凭据不匹配');
    ensure(p.world.city === 'dunhuang' && !p.world.route && p.world.tick === s.startedWorldTick, 'PATTERN_WORLD_CHANGED', '帮工期间的世界状态已变化');
    ensure(ctx && typeof ctx.advance === 'function', 'PATTERN_OUTER_COMMIT', '缺少统一时间提交接口');
    const beforeCash = p.cash, beforeTick = p.world.tick;
    p.cash += s.result.totalWage;   // settle first, then advance world time (Master §2.1)
    p.journal.push({ type: 'pattern', tripId: p.trip ? p.trip.id : null, sessionId: s.id, settlementId: s.settlementId, tick: beforeTick, amount: s.result.totalWage, cashDelta: s.result.totalWage, score: s.result.score, validStrokes: s.result.validStrokes, representativeMotif: s.result.representativeMotif });
    ctx.advance(p, RULES.ticks, 'pattern_chain_formal_completion');
    s.settled = true; s.phase = 'SETTLED';
    return { kind: 'patternSettled', modal: false, settlementId: s.settlementId, totalWage: s.result.totalWage, cashDelta: p.cash - beforeCash, ticks: p.world.tick - beforeTick };
  }
  function abort(p, a) {
    const s = session(p, a);
    ensure(!s.result, 'PATTERN_FINISHED', '已收工的帮工请先结算');
    if (s.phase === 'PLAYING') { s.phase = 'ABORTED'; s.abortedAtTick = p.world.tick; }
    return view(p);
  }
  function view(p) {
    const s = p.work && p.work.pattern; if (!s) return null;
    return clone({ kind: 'PATTERN_SESSION', modal: false, sessionId: s.id, mode: s.mode, phase: s.phase, startedWorldTick: s.startedWorldTick, seed: s.seed, seconds: s.seconds, strokes: s.strokes, firstFormal: s.firstFormal, result: s.result, settled: s.settled, settlementId: s.settlementId });
  }
  function isActive(p) { const s = p.work && p.work.pattern; return Boolean(s && (s.phase === 'PLAYING' || s.result && !s.settled)); }
  function reduce(p, command, ctx) {
    const a = command.payload || {};
    if (command.type === 'PATTERN_START') return start(p, a);
    if (command.type === 'PATTERN_FINISH') return finish(p, a);
    if (command.type === 'PATTERN_SETTLE') return settle(p, a, ctx);
    if (command.type === 'PATTERN_ABORT') return abort(p, a);
    ensure(false, 'PATTERN_COMMAND', '不支持的缀纹操作');
  }
  S.patternChain = { RULES, COPY, PHASES, END_REASONS, availability, payout, view, isActive, engine: E };
  ['PATTERN_START', 'PATTERN_FINISH', 'PATTERN_SETTLE', 'PATTERN_ABORT'].forEach(type => S.commands.register(type, (p, payload, ctx) => reduce(p, { type, payload }, ctx)));
})(globalThis.Silk = globalThis.Silk || {});
