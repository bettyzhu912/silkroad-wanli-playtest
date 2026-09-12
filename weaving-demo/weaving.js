(function (S) {
  'use strict';
  // 于阗织坊 (Khotan weaving workshop) — engine side of the one-day job. Implements YUTIAN_WEAVING_GAMEPLAY_FINAL v1.0 over the
  // PLAYABLE v0.1 baseline: the run (templates, difficulty, the one-time 急束 roll) and the settlement live here; the live loom
  // interaction runs in weaving-ui.js and only reports the finished run back. The host pays the wage and advances +2 ticks exactly once.
  const ensure = (...args) => S.util.ensure(...args);
  const clone = value => S.util.clone(value);
  const GROUPS = Object.freeze([3, 4, 5]);
  // Hand-checked solvable templates (v0.1 authority §6A): destination slot -> motif index. 3根6组 / 4根6组 / 5根8组 = 288 combinations.
  const TEMPLATES = Object.freeze({
    3: [[1,0,2],[0,2,1],[2,0,1],[1,2,0],[0,1,2],[2,1,0]],
    4: [[1,0,3,2],[0,2,1,3],[2,0,3,1],[1,3,0,2],[3,1,2,0],[0,3,1,2]],
    5: [[1,0,3,2,4],[0,2,1,4,3],[2,0,4,1,3],[1,3,0,4,2],[3,1,4,0,2],[0,3,1,4,2],[4,1,3,0,2],[2,4,0,3,1]]
  });
  const RULES = Object.freeze({
    baseSeconds: 75, rushSeconds: 8, rushProbability: .2, rushAfter: 7, looseAfter: 7, looseRecoverySeconds: 5, looseWarnSeconds: 1,
    secondLoose: Object.freeze({ after: 10, minRemainingSeconds: 18, probability: .35 }), idleLimitSeconds: 8,
    knotProbability: Object.freeze({ 0: 0, 1: .2, more: .35 }), ticks: 2,
    wage: Object.freeze([[2, 9], [5, 11], [8, 15], [12, 19]]), craftCap: 3, rushBonus: 1, maxTotal: 23
  });
  const TAGS = Object.freeze(['引线有方', '丝缕不乱', '机声未歇', '见松即理', '丝缕俱齐']);
  const COPY = Object.freeze({
    entryTitle: '于阗织坊', entryDescription: '理顺丝线，替织坊赶完今日活计。', entryTime: '耗时：一日', entryPay: '工钱：按完成情况结算', enter: '进入织坊',
    managerLabel: '织坊管事', managerLine: '今日还有一架丝线待理，顺着纹样接好便成。', trial: '先试一试', start: '开始帮工',
    noTime: '今日余时不足，改日再来。', startDuration: '正式帮工耗时一日', transition: ['理丝', '定经', '开工'],
    progressFormat: '已理丝线 {connected} / 12', sun: '日影', remainingFormat: '余 {seconds}', wrongPattern: '纹样不合', knot: '丝结缠住',
    looseWarn: '丝势微松', loose: '丝头松脱', looseSkill: '见松即理', milestones: { 3: '丝绪渐齐', 6: '经线已顺', 9: '机杼渐和', 12: '满架皆顺' },
    rushMessage: '织坊传话：商队将行，还有两缕丝急着收尾。', rushProgressFormat: '急束 {connected} / 2', rushSuccess: '急束已齐', rushMiss: '未及理完',
    resume: '续理余丝', trialDone: '试工结束', dayEnd: '日影已尽，今日收工', allConnectedKnotted: '丝线已接，尚有交结', resultTitle: '今日收工',
    details: '查看明细', leave: '离开织坊', abortTitle: '尚未收工', abortBody: '此时离开，今日工钱不作结，也不耗去时辰。', abortContinue: '继续理丝', abortLeave: '离开织坊'
  });
  function initialHistory() { return { formalRuns: 0, recentCombos: [] }; }
  function work(p) { return p.work || (p.work = S.tavern ? S.tavern.initial() : { tavern: null, lastRound: null, routeGame: null }); }
  function history(p) { const w = work(p); return w.weavingHistory || (w.weavingHistory = initialHistory()); }
  function session(p, payload = {}) {
    const s = p.work && p.work.weaving;
    ensure(s && payload.sessionId === s.id, 'WEAVING_SESSION', '织坊会话不匹配');
    return s;
  }
  function otherWorkActive(p) {
    const w = p.work; if (!w) return false;
    if (w.tavern && (!w.tavern.result || w.tavern.result.completionStatus === 'COMPLETED' && !w.tavern.resultAcknowledged)) return true;
    return Boolean(w.routeGame && !w.routeGame.result);
  }
  // A formal run is only offered when the whole day is still ahead: 晨 + 2 ticks ends exactly at 暮.
  function availability(p) {
    const phase = p.world.tick % 3, inKhotan = p.world.city === 'khotan' && !p.world.route, remainingTicks = 2 - phase;
    const current = p.work && p.work.weaving, busy = Boolean(current && (current.phase === 'PLAYING' || current.result && !current.settled));
    const enoughTime = remainingTicks >= RULES.ticks;
    return { inKhotan, remainingTicks, enoughTime, busy, otherWork: otherWorkActive(p), canStartFormal: inKhotan && enoughTime && !busy && !otherWorkActive(p), canTrial: inKhotan && !busy && !otherWorkActive(p), noTimeText: COPY.noTime };
  }
  function difficultyPlan(p, first) {
    if (first) return ['simple', 'simple', 'normal'];
    const roll = S.random.next(p);
    return roll < .30 ? ['simple', 'simple', 'normal'] : roll < .85 ? ['simple', 'normal', 'normal'] : ['simple', 'normal', 'hard'];
  }
  function templatePool(count, difficulty) {
    const n = TEMPLATES[count].length, all = Array.from({ length: n }, (_, i) => i);
    const pools = { simple: all.slice(0, 2), normal: all.slice(2, Math.max(4, n - 2)), hard: all.slice(-2) };
    return pools[difficulty] && pools[difficulty].length ? pools[difficulty] : all;
  }
  function routePlan(p, difficulties, recent) {
    let plan, signature, attempts = 0;
    do {
      plan = {};
      GROUPS.forEach((count, i) => { const pool = templatePool(count, difficulties[i]); plan[count] = pool[Math.min(pool.length - 1, Math.floor(S.random.next(p) * pool.length))]; });
      signature = GROUPS.map(count => count + '-' + plan[count]).join('|');
      attempts++;
    } while (recent.length && recent[recent.length - 1] === signature && attempts < 12);
    return { plan, signature };
  }
  function start(p, a) {
    ensure(a.mode === 'FORMAL', 'WEAVING_MODE', '试工不需要开工登记');
    const avail = availability(p);
    ensure(avail.inKhotan, 'WEAVING_CITY', '于阗织坊仅在于阗城内。');
    ensure(!avail.busy, 'WORK_ACTIVE', '已有织坊活计进行中');
    ensure(!avail.otherWork, 'WORK_ACTIVE', '已有营生进行中');
    ensure(avail.enoughTime, 'WEAVING_NO_TIME', COPY.noTime);
    const h = history(p), first = h.formalRuns === 0, difficulties = difficultyPlan(p, first), route = routePlan(p, difficulties, h.recentCombos);
    const rushPlanned = S.random.next(p) < RULES.rushProbability;   // rolled once when the run is created; never re-rolled
    const id = S.util.id(p, 'weaving');
    work(p).weaving = { id, mode: 'FORMAL', phase: 'PLAYING', startedWorldTick: p.world.tick, difficultyPlan: difficulties, routePlan: route.plan,
      comboSignature: route.signature, rushPlanned, firstFormal: first, result: null, settled: false, settlementId: id + '-settlement' };
    h.formalRuns++; h.recentCombos = [...h.recentCombos, route.signature].slice(-3);
    return view(p);
  }
  function baseWage(correct) { for (const [upTo, wage] of RULES.wage) if (correct <= upTo) return wage; return RULES.wage[RULES.wage.length - 1][1]; }
  function tags(stats) {
    const out = [];
    if (!stats.wrongEndpoint) out.push('引线有方');
    if (stats.unresolved === 0) out.push('丝缕不乱');
    if (stats.idleClean) out.push('机声未歇');
    if (stats.looseRecovered) out.push('见松即理');
    if (stats.correct === 12) out.push('丝缕俱齐');
    return out;
  }
  function wage(stats) {
    const earned = tags(stats), base = baseWage(stats.correct), craftBonus = Math.min(RULES.craftCap, earned.length), urgentBonus = stats.urgentSuccess ? RULES.rushBonus : 0;
    return { tags: earned, baseWage: base, craftBonus, urgentBonus, totalWage: Math.min(RULES.maxTotal, base + craftBonus + urgentBonus) };
  }
  function statusPhrase(correct, unresolved) { return correct === 12 ? (unresolved === 0 ? COPY.milestones[12] : COPY.allConnectedKnotted) : COPY.dayEnd; }
  const bool = v => v === true || v === false;
  function finish(p, a) {
    const s = session(p, a);
    ensure(s.phase === 'PLAYING' && !s.result, 'WEAVING_NOT_PLAYING', '织坊活计不在进行中');
    const st = a.stats || {};
    ensure(S.util.integer(st.correct, 0, 12) && S.util.integer(st.unresolved, 0, 12) && bool(st.wrongEndpoint) && bool(st.idleClean) && bool(st.looseRecovered) && bool(st.urgentTriggered) && bool(st.urgentSuccess), 'WEAVING_STATS', '收工记录无效');
    ensure(!st.urgentTriggered || s.rushPlanned, 'WEAVING_RUSH', '本局并无急束');
    ensure(!st.urgentSuccess || st.urgentTriggered, 'WEAVING_RUSH', '急束记录无效');
    ensure(st.correct === 12 || st.reason === 'DAY_END', 'WEAVING_REASON', '未满十二根只能在日影尽时收工');
    const pay = wage(st);
    s.result = { kind: 'WEAVING_RESULT', sessionId: s.id, settlementId: s.settlementId, mode: 'FORMAL', completionStatus: 'COMPLETED', correct: st.correct, unresolved: st.unresolved,
      reason: st.correct === 12 ? (st.unresolved === 0 ? 'ALL_CLEAN' : 'ALL_KNOTTED') : 'DAY_END', tags: pay.tags, baseWage: pay.baseWage, craftBonus: pay.craftBonus,
      urgentTriggered: st.urgentTriggered, urgentSuccess: st.urgentSuccess, urgentBonus: pay.urgentBonus, totalWage: pay.totalWage, ticks: RULES.ticks,
      title: COPY.resultTitle, statusPhrase: statusPhrase(st.correct, st.unresolved), summary: '共理顺 ' + st.correct + ' 缕丝线。' };
    s.phase = 'FINISHED';
    return view(p);
  }
  function settle(p, a, ctx) {
    const s = session(p, a);
    ensure(s.result, 'WEAVING_UNFINISHED', '织坊活计尚未收工');
    if (s.settled) return { kind: 'weavingSettled', modal: false, settlementId: s.settlementId, alreadySettled: true, totalWage: s.result.totalWage, ticks: 0 };
    ensure(a.settlementId === s.settlementId, 'WEAVING_SETTLEMENT', '结算凭据不匹配');
    ensure(p.world.city === 'khotan' && !p.world.route && p.world.tick === s.startedWorldTick, 'WEAVING_WORLD_CHANGED', '织坊期间的世界状态已变化');
    ensure(ctx && typeof ctx.advance === 'function', 'WEAVING_OUTER_COMMIT', '缺少统一时间提交接口');
    const beforeCash = p.cash, beforeTick = p.world.tick;
    p.cash += s.result.totalWage;
    p.journal.push({ type: 'weaving', tripId: p.trip ? p.trip.id : null, sessionId: s.id, settlementId: s.settlementId, tick: beforeTick, amount: s.result.totalWage, cashDelta: s.result.totalWage, correct: s.result.correct });
    ctx.advance(p, RULES.ticks, 'weaving_formal_completion');
    s.settled = true; s.phase = 'SETTLED';
    return { kind: 'weavingSettled', modal: false, settlementId: s.settlementId, totalWage: s.result.totalWage, cashDelta: p.cash - beforeCash, ticks: p.world.tick - beforeTick };
  }
  function abort(p, a) {
    const s = session(p, a);
    ensure(!s.result, 'WEAVING_FINISHED', '已收工的活计请离开织坊结算');
    if (s.phase === 'PLAYING') { s.phase = 'ABORTED'; s.abortedAtTick = p.world.tick; }
    return view(p);
  }
  function view(p) {
    const s = p.work && p.work.weaving;
    if (!s) return null;
    return clone({ kind: 'WEAVING_SESSION', modal: false, sessionId: s.id, mode: s.mode, phase: s.phase, startedWorldTick: s.startedWorldTick, difficultyPlan: s.difficultyPlan,
      routePlan: s.routePlan, rushPlanned: s.rushPlanned, firstFormal: s.firstFormal, result: s.result, settled: s.settled, settlementId: s.settlementId });
  }
  function isActive(p) { const s = p.work && p.work.weaving; return Boolean(s && (s.phase === 'PLAYING' || s.result && !s.settled)); }
  // Geometry shared with the UI: proper mid-segment crossings between two polylines; meeting at a shared ring is not a crossing.
  function segmentIntersection(a, b, c, d) {
    const den = (a.x - b.x) * (c.y - d.y) - (a.y - b.y) * (c.x - d.x); if (Math.abs(den) < .01) return null;
    const t = ((a.x - c.x) * (c.y - d.y) - (a.y - c.y) * (c.x - d.x)) / den;
    const u = -((a.x - b.x) * (a.y - c.y) - (a.y - b.y) * (a.x - c.x)) / den;
    if (t > .04 && t < .96 && u > .04 && u < .96) return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
    return null;
  }
  function nearSharedNode(hit, pts) { return pts.some(q => q.type === 'node' && Math.hypot(q.x - hit.x, q.y - hit.y) < 9); }
  function crossings(points, others) {
    const out = [];
    for (const other of others) {
      if (!other || other.length < 2) continue;
      for (let i = 1; i < points.length; i++) for (let j = 1; j < other.length; j++) {
        const hit = segmentIntersection(points[i - 1], points[i], other[j - 1], other[j]);
        if (hit && !nearSharedNode(hit, [points[i - 1], points[i], other[j - 1], other[j]])) out.push({ x: hit.x, y: hit.y, segmentIndex: i });
      }
    }
    return out;
  }
  function knotProbability(crossingCount) { return crossingCount <= 0 ? RULES.knotProbability[0] : crossingCount === 1 ? RULES.knotProbability[1] : RULES.knotProbability.more; }
  function reduce(p, command, ctx) {
    const a = command.payload || {};
    if (command.type === 'WEAVE_START') return start(p, a);
    if (command.type === 'WEAVE_FINISH') return finish(p, a);
    if (command.type === 'WEAVE_SETTLE') return settle(p, a, ctx);
    if (command.type === 'WEAVE_ABORT') return abort(p, a);
    ensure(false, 'WEAVING_COMMAND', '不支持的织坊操作');
  }
  S.weaving = { GROUPS, TEMPLATES, RULES, TAGS, COPY, initialHistory, availability, view, isActive, wage, tags, baseWage, statusPhrase, crossings, segmentIntersection, knotProbability, templatePool };
  ['WEAVE_START', 'WEAVE_FINISH', 'WEAVE_SETTLE', 'WEAVE_ABORT'].forEach(type => S.commands.register(type, (p, payload, ctx) => reduce(p, { type, payload }, ctx)));
})(globalThis.Silk = globalThis.Silk || {});
