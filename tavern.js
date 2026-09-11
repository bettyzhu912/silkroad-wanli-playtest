(function (S) {
  "use strict";
  const source = globalThis.SilkData.tavern;
  const questions = source.questions.questions;
  const lines = Object.fromEntries(source.lines.lines.map(x => [x.lineId, x]));
  const poems = Object.fromEntries(source.poems.poems.map(x => [x.poemId, x]));
  const byId = Object.fromEntries(questions.map(x => [x.questionId, x]));
  const weights = { VERY_HIGH: 2.7, HIGH: 1.8, NORMAL: 1, LOW_NORMAL: .72, NORMAL_LOW: .58, LOW: .42, VERY_LOW: .22 };
  const READY_MS = 1350, ROUND_MS = 45000, GUARD_MS = 180;
  const ensure = (...args) => S.util.ensure(...args);
  const clone = value => S.util.clone(value);
  function initial() { return { tavern: null, lastRound: null, routeGame: null }; }
  function work(p) { return p.work || (p.work = initial()); }
  const uniquePush = (a, x) => { if (x && !a.includes(x)) a.push(x); };
  const randomIndex = (p, length) => Math.min(length - 1, Math.floor(S.random.next(p) * length));
  function weighted(p, items, weight) {
    const values = items.map(weight), total = values.reduce((a, b) => a + b, 0);
    if (total <= 0) return items[randomIndex(p, items.length)];
    let point = S.random.next(p) * total;
    for (let i = 0; i < items.length; i++) { point -= values[i]; if (point < 0) return items[i]; }
    return items[items.length - 1];
  }
  function shuffle(p, items) {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) { const j = randomIndex(p, i + 1); [out[i], out[j]] = [out[j], out[i]]; }
    return out;
  }
  function phaseWeights(playMs) {
    return playMs < 12000 ? { NEXT_LINE: 75, PREVIOUS_LINE: 25, SAME_POEM: 0 }
      : playMs < 35000 ? { NEXT_LINE: 55, PREVIOUS_LINE: 30, SAME_POEM: 15 }
      : { NEXT_LINE: 55, PREVIOUS_LINE: 35, SAME_POEM: 10 };
  }
  function candidates(s, bank = questions) {
    return bank.filter(q => q.enabled === true && !s.usedQuestions.includes(q.questionId)
      && !(q.questionType === "SAME_POEM" && s.samePoemUsed));
  }
  function choose(p, s, bank = questions) {
    let pool = candidates(s, bank);
    if (!pool.length) return null;
    if (s.wrongStreak >= 2) {
      const preferred = pool.filter(q => q.questionType === "NEXT_LINE" && q.warmupEligible.value);
      if (preferred.length) pool = preferred;
    }
    let isBonus = false;
    if (s.bonusCountdown !== null) {
      s.bonusCountdown = Math.max(0, s.bonusCountdown - 1);
      if (s.bonusCountdown === 0) {
        const bonusPool = pool.filter(q => q.bonusEligible.value && q.questionType !== "SAME_POEM");
        if (bonusPool.length) { pool = bonusPool; isBonus = true; s.bonusCountdown = null; s.bonusTriggered++; }
      }
    }
    const repeatedType = s.recentTypes.length >= 2 && s.recentTypes.at(-1) === s.recentTypes.at(-2) ? s.recentTypes.at(-1) : null;
    // 0908 replaces old whole-round poem/pair exclusions with relaxable recency preferences.
    const noAuthor = q => !s.recentAuthors.slice(-3).includes(poems[q.poemId].author);
    const noPoem = q => !s.recentPoems.slice(-2).includes(q.poemId);
    const noType = q => q.questionType !== repeatedType;
    const levels = [q => noAuthor(q) && noPoem(q) && noType(q), q => noPoem(q) && noType(q), noType, () => true];
    for (const filter of levels) { const preferred = pool.filter(filter); if (preferred.length) { pool = preferred; break; } }
    const phases = phaseWeights(Math.max(0, s.clockMs - READY_MS));
    const last = work(p).lastRound || { questions: [], pairs: [], poems: [] };
    const q = weighted(p, pool, item => {
      let value = (phases[item.questionType] || 0) * (weights[item.releaseWeight.value] || 1);
      if (s.clockMs - READY_MS < 12000 && item.warmupEligible.value) value *= 2.3;
      if (!last.questions.includes(item.questionId) && !last.poems.includes(item.poemId)) value *= 1.2;
      if (last.questions.includes(item.questionId)) value *= .2;
      if (item.pairFamilyId && last.pairs.includes(item.pairFamilyId)) value *= .25;
      if (last.poems.includes(item.poemId)) value *= .5;
      return value;
    });
    let positions = [0, 1, 2, 3];
    if (s.recentPositions.length >= 2 && s.recentPositions.at(-1) === s.recentPositions.at(-2))
      positions = positions.filter(n => n !== s.recentPositions.at(-1));
    const correctPosition = positions[randomIndex(p, positions.length)];
    const options = shuffle(p, q.distractorLineIds); options.splice(correctPosition, 0, q.correctLineId);
    uniquePush(s.usedQuestions, q.questionId); uniquePush(s.usedPairs, q.pairFamilyId); uniquePush(s.usedPoems, q.poemId);
    s.recentAuthors.push(poems[q.poemId].author); s.recentPoems.push(q.poemId); s.recentTypes.push(q.questionType); s.recentPositions.push(correctPosition);
    if (q.questionType === "SAME_POEM") s.samePoemUsed = true;
    return { questionId: q.questionId, options, isBonus, openedMs: s.clockMs, deadlineMs: s.clockMs + 7000, answer: null };
  }
  function get(p, a) {
    const s = p.work?.tavern;
    ensure(s && a.sessionId === s.id, "TAVERN_SESSION", "诗令会话不匹配");
    return s;
  }
  function start(p, a) {
    ensure(a.mode === "FORMAL" || a.mode === "TRIAL", "TAVERN_MODE", "无效的诗令模式");
    ensure(p.world.city === "changan" && !p.world.route && p.world.tick % 3 < 2, "TAVERN_UNAVAILABLE", "酒肆诗令仅能在长安晨间或午间开始");
    const w = work(p);
    ensure(!w.tavern || ["FINISHED", "ABORTED"].includes(w.tavern.phase), "WORK_ACTIVE", "已有诗令正在进行");
    ensure(!w.routeGame || w.routeGame.result, "WORK_ACTIVE", "已有路线小游戏正在进行");
    w.tavern = { id: S.util.id(p, "tavern"), mode: a.mode, phase: "READY", beforePause: null, startedWorldTick: p.world.tick,
      clockMs: 0, sequence: 0, lastInput: null, current: null, nextAtMs: READY_MS,
      usedQuestions: [], usedPairs: [], usedPoems: [], samePoemUsed: false,
      recentAuthors: [], recentPoems: [], recentTypes: [], recentPositions: [],
      answered: 0, correct: 0, combo: 0, maxCombo: 0, quick: 0, wrongStreak: 0,
      bonusCountdown: null, bonusTriggered: 0, bonusWon: 0, firstBonusResolved: false,
      result: null, committed: false, resultAcknowledged: false };
    return view(p);
  }
  function rewards(stats) {
    const accuracy = stats.answered ? stats.correct / stats.answered : 0;
    const tier = stats.correct >= 5 && accuracy >= .75 && stats.maxCombo >= 4 ? "RICH"
      : stats.correct >= 3 && accuracy >= .6 ? "NORMAL" : "MODEST";
    const performance = { MODEST: 1, NORMAL: 3, RICH: 6 }[tier];
    const quick = stats.quick >= 4 ? 2 : stats.quick >= 2 ? 1 : 0;
    const bonus = Math.min(2, stats.bonusWon);
    return { tier, accuracy, base: 5, performance, quick, bonus, income: Math.min(15, 5 + performance + quick + bonus) };
  }
  function complete(p, s, ctx) {
    if (s.result) return;
    const reward = rewards(s), beforeCash = p.cash, beforeTick = p.world.tick;
    ensure(p.world.city === "changan" && !p.world.route && p.world.tick === s.startedWorldTick,
      "TAVERN_WORLD_CHANGED", "诗令期间的世界状态已变化，请恢复当前局");
    if (s.mode === "FORMAL") {
      ensure(ctx && typeof ctx.advance === "function", "TAVERN_OUTER_COMMIT", "缺少统一时间提交接口");
      p.cash += reward.income;
      p.journal.push({ type: "tavern", tripId: p.trip?.id || null, sessionId: s.id, tick: beforeTick,
        amount: reward.income, cashDelta: reward.income, performanceTier: reward.tier });
      ctx.advance(p, 1, "tavern_formal_completion");
    }
    s.committed = true; s.phase = "FINISHED";
    work(p).lastRound = { questions: [...s.usedQuestions], pairs: [...s.usedPairs], poems: [...s.usedPoems] };
    s.result = { kind: "TAVERN_RESULT", sessionId: s.id, minigameId: "JIUSI_SHILING", jobId: "CHANGAN_JIUSI_SHILING",
      mode: s.mode, completionStatus: "COMPLETED", performanceTier: reward.tier, answeredCount: s.answered,
      correctCount: s.correct, accuracy: reward.accuracy, maxCombo: s.maxCombo, quickAnswerCount: s.quick,
      bonusTriggered: s.bonusTriggered, bonusWon: s.bonusWon, reward,
      income: s.mode === "FORMAL" ? reward.income : 0, simulatedIncome: s.mode === "TRIAL" ? reward.income : null,
      effectiveDurationMs: ROUND_MS, cashDelta: p.cash - beforeCash, ticksAdvanced: p.world.tick - beforeTick };
  }
  function next(p, s) {
    if (READY_MS + ROUND_MS - s.clockMs < 3000) { s.phase = "WAIT"; s.current = null; return; }
    s.current = choose(p, s);
    s.phase = s.current ? "QUESTION" : "WAIT";
  }
  function answer(p, s, selected, timeout) {
    const current = s.current, q = byId[current.questionId];
    ensure(!current.answer, "TAVERN_ANSWERED", "本题已经回答");
    const correct = !timeout && selected === q.correctLineId;
    const quick = correct && s.clockMs - (current.openedMs + GUARD_MS) <= 2100;
    current.answer = { selectedLineId: selected, correctLineId: q.correctLineId, correct, quick, timeout, atMs: s.clockMs };
    s.answered++;
    if (correct) {
      s.correct++; s.combo++; s.maxCombo = Math.max(s.maxCombo, s.combo); s.wrongStreak = 0;
      if (quick) s.quick++;
      if (current.isBonus) s.bonusWon++;
    } else { s.combo = 0; s.wrongStreak++; if (s.bonusTriggered === 0) s.bonusCountdown = null; }
    if (current.isBonus) s.firstBonusResolved = true;
    if (correct && s.bonusCountdown === null) {
      const first = s.combo >= 4 && s.bonusTriggered === 0;
      const second = s.firstBonusResolved && s.combo >= 7 && READY_MS + ROUND_MS - s.clockMs >= 8000 && s.bonusTriggered < 2;
      if (first || second) s.bonusCountdown = 1 + randomIndex(p, 3);
    }
    s.phase = "FEEDBACK"; s.nextAtMs = s.clockMs + (correct ? 780 : 1200);
  }
  function clockTo(p, s, target, ctx) {
    const end = READY_MS + ROUND_MS;
    while (!s.result && s.clockMs < target) {
      const transition = s.phase === "READY" || s.phase === "FEEDBACK" ? s.nextAtMs
        : s.phase === "QUESTION" ? s.current.deadlineMs : end;
      const nextTime = Math.min(target, transition, end);
      s.clockMs = nextTime;
      if (nextTime >= end) { complete(p, s, ctx); break; }
      if (nextTime < transition) break;
      if (s.phase === "READY" || s.phase === "FEEDBACK") next(p, s);
      else if (s.phase === "QUESTION") answer(p, s, null, true);
      else break;
    }
  }
  function step(p, a, ctx) {
    const s = get(p, a), fingerprint = JSON.stringify(a);
    if (a.sequence === s.sequence && s.lastInput === fingerprint) return view(p);
    ensure(!s.result && s.phase !== "PAUSED" && s.phase !== "ABORTED", "TAVERN_NOT_PLAYING", "当前诗令不能作答");
    ensure(Number.isSafeInteger(a.sequence) && a.sequence === s.sequence + 1, "TAVERN_SEQUENCE", "操作已过期或重复");
    ensure(Number.isSafeInteger(a.elapsedMs) && a.elapsedMs >= s.clockMs && a.elapsedMs <= READY_MS + ROUND_MS, "TAVERN_CLOCK", "有效游玩时间无效");
    const hasAnswer = a.lineId !== undefined;
    if (hasAnswer) {
      ensure(s.phase === "QUESTION" && a.questionId === s.current.questionId && !s.current.answer, "TAVERN_QUESTION", "本题已过期或已回答");
      ensure(s.current.options.includes(a.lineId), "TAVERN_OPTION", "答案不属于当前题目");
      ensure(a.elapsedMs >= s.current.openedMs + GUARD_MS, "TAVERN_INPUT_GUARD", "题目尚未接受输入");
    }
    clockTo(p, s, a.elapsedMs, ctx);
    // A late input belongs to the expired question; it must not answer a newly opened question.
    if (hasAnswer && !s.result && s.phase === "QUESTION" && a.questionId === s.current.questionId && !s.current.answer)
      answer(p, s, a.lineId, false);
    s.sequence = a.sequence; s.lastInput = fingerprint;
    return view(p);
  }
  function view(p) {
    const s = p.work && p.work.tavern;
    if (!s) return null;
    const out = { kind: "TAVERN_SESSION", modal: false, sessionId: s.id, mode: s.mode, phase: s.phase, sequence: s.sequence,
      elapsedMs: s.clockMs, playElapsedMs: Math.max(0, s.clockMs - READY_MS), roundDurationMs: ROUND_MS,
      readyMs: READY_MS, endMs: READY_MS + ROUND_MS, resultAcknowledged: s.resultAcknowledged,
      nextTransitionMs: Math.min(READY_MS + ROUND_MS, ["READY", "FEEDBACK"].includes(s.phase) ? s.nextAtMs : s.phase === "QUESTION" ? s.current.deadlineMs : READY_MS + ROUND_MS),
      answeredCount: s.answered, correctCount: s.correct, combo: s.combo, maxCombo: s.maxCombo,
      quickAnswerCount: s.quick, bonusWon: s.bonusWon, current: null, result: s.result };
    if (s.current) {
      const q = byId[s.current.questionId], current = s.current;
      out.current = { questionId: q.questionId, questionType: q.questionType, prompt: lines[q.promptLineId].text,
        options: current.options.map(id => ({ lineId: id, text: lines[id].text })), isBonus: current.isBonus,
        openedMs: current.openedMs, inputAllowedMs: current.openedMs + GUARD_MS, deadlineMs: current.deadlineMs,
        feedback: current.answer ? { ...current.answer, promptText: lines[q.promptLineId].text,
          correctText: lines[q.correctLineId].text, poemTitle: poems[q.poemId].title, author: poems[q.poemId].author } : null };
    }
    return clone(out);
  }
  function reduce(p, command, ctx) {
    const a = command.payload || {};
    if (command.type === "TAVERN_START") return start(p, a);
    if (command.type === "TAVERN_STEP") return step(p, a, ctx);
    const s = get(p, a);
    if (command.type === "TAVERN_ACK") {
      ensure(s.result, "TAVERN_UNFINISHED", "诗令尚未结束"); s.resultAcknowledged = true;
    } else if (command.type === "TAVERN_PAUSE") {
      if (!s.result && s.phase !== "PAUSED" && s.phase !== "ABORTED") { s.beforePause = s.phase; s.phase = "PAUSED"; }
    } else if (command.type === "TAVERN_RESUME") {
      if (s.phase === "PAUSED") { s.phase = s.beforePause; s.beforePause = null; }
    } else if (command.type === "TAVERN_ABORT") {
      ensure(s.mode === "TRIAL", "TAVERN_FORMAL_NO_EXIT", "正式诗令开始后不能主动退出");
      if (!s.result) { s.phase = "ABORTED"; s.result = { kind: "TAVERN_RESULT", sessionId: s.id, mode: s.mode, completionStatus: "ABORTED", income: 0, cashDelta: 0, ticksAdvanced: 0 }; }
    } else ensure(false, "TAVERN_COMMAND", "不支持的诗令操作");
    return view(p);
  }
  S.tavern = { initial, reduce, view, rewards, candidates, choose, phaseWeights };
  ["TAVERN_START", "TAVERN_STEP", "TAVERN_PAUSE", "TAVERN_RESUME", "TAVERN_ABORT", "TAVERN_ACK"].forEach(type => S.commands.register(type, (p, payload, ctx) => reduce(p, { type, payload }, ctx)));
})(globalThis.Silk = globalThis.Silk || {});
