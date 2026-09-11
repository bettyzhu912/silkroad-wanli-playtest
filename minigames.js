(function (S) {
  "use strict";
  const specs = Object.freeze({
    "RM-01": { name: "稳住货箱", ms: 7000 }, "RM-02": { name: "收紧缰绳", ms: 8000 },
    "RM-03": { name: "清开风沙", ms: 8000 }, "RM-04": { name: "认准路标", ms: 6000 },
    "RM-05": { name: "拾回散货", ms: 9000 }, "RM-06": { name: "避开碎石", ms: 10000 }
  });
  const ensure = (...args) => S.util.ensure(...args);
  const copy = value => S.util.clone(value);
  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
  function initial() { return { tavern: null, lastRound: null, routeGame: null }; }
  function work(p) { return p.work || (p.work = initial()); }
  function session(p, payload) {
    const s = p.work?.routeGame;
    ensure(s && payload.sessionId === s.id, "RM_SESSION", "路线小游戏会话不匹配");
    ensure(p.eventSession && p.eventSession.id === s.eventSessionId && p.eventSession.eventId === s.moduleId
      && p.eventSession.status === "AWAITING_SKILL", "RM_EVENT_REQUIRED", "原路线事件已经变化");
    return s;
  }
  function start(p, a) {
    ensure(Object.hasOwn(specs, a.moduleId), "RM_MODULE", "无效路线小游戏");
    const e = p.eventSession;
    ensure(e && e.eventId === a.moduleId && e.id === a.eventSessionId && e.status === "AWAITING_SKILL",
      "RM_EVENT_REQUIRED", "小游戏只能由当前路线事件开启")

    // RC3: mirror the UI — a pending story protection choice must be recorded before the skill game starts, so its settlement can never be blocked afterwards.
    ensure(!(e.storyProtectionChoices && e.storyProtectionChoices.length) || Boolean(e.node && e.node.storyProtectionChoice), "STORY_PROTECTION_CHOICE_REQUIRED", "请先选择如何护住旧箱。");
    const w = work(p);
    ensure(!w.tavern || !["READY", "QUESTION", "FEEDBACK", "WAIT", "PAUSED"].includes(w.tavern.phase), "WORK_ACTIVE", "已有营生进行中");
    if (w.routeGame && w.routeGame.eventSessionId === e.id) return snapshot(w.routeGame);
    ensure(!w.routeGame || w.routeGame.result, "WORK_ACTIVE", "已有路线小游戏进行中");
    const s = {
      id: S.util.id(p, "rm"), eventSessionId: e.id, moduleId: a.moduleId,
      phase: "PLAYING", elapsedMs: 0, sequence: 0, lastInput: null,
      x: a.moduleId === "RM-01" ? 218 : 320, safeMs: 0, integratedMs: 0,
      maxDeviation: 18, taps: 0, correctTaps: 0, targets: [], selected: null,
      lane: 1, checked: 0, collisions: 0, result: null
    };
    w.routeGame = s;
    return snapshot(s);
  }
  function performance(s) {
    let tier, metrics;
    switch (s.moduleId) {
      case "RM-01": {
        const ratio = s.safeMs / Math.max(1, s.elapsedMs);
        tier = ratio >= .8 ? "GOOD" : ratio >= .45 ? "NORMAL" : "MISSED";
        metrics = { safeRatio: ratio, timeInSafeZoneMs: s.safeMs, maxDeviation: s.maxDeviation, tapCount: s.taps, correctiveTapCount: s.correctTaps };
        break;
      }
      case "RM-02": {
        const accuracy = s.correctTaps / Math.max(1, s.taps);
        tier = s.x === 88 ? (accuracy >= .8 ? "GOOD" : "NORMAL") : s.x < 204 ? "NORMAL" : "MISSED";
        metrics = { directionAccuracy: accuracy, tapCount: s.taps, correctDirectionTapCount: s.correctTaps, distanceRemaining: s.x - 88 };
        break;
      }
      case "RM-03":
        tier = s.targets.length === 4 ? "GOOD" : s.targets.length >= 2 ? "NORMAL" : "MISSED";
        metrics = { clearedPatchCount: s.targets.length, totalPatchCount: 4 }; break;
      case "RM-04":
        tier = s.selected === 1 ? (s.elapsedMs <= 3000 ? "GOOD" : "NORMAL") : "MISSED";
        metrics = { selectedTarget: s.selected === null ? null : ["old_ruts", "fresh_camel_tracks", "covered_footprints"][s.selected], isCorrect: s.selected === 1, responseTimeMs: s.elapsedMs }; break;
      case "RM-05":
        tier = s.targets.length === 5 ? "GOOD" : s.targets.length >= 3 ? "NORMAL" : "MISSED";
        metrics = { retrievedCount: s.targets.length, totalCount: 5 }; break;
      case "RM-06":
        tier = s.checked < 3 || s.collisions > 1 ? "MISSED" : s.collisions === 0 ? "GOOD" : "NORMAL";
        metrics = { obstaclesAvoided: s.checked - s.collisions, obstacleCount: 3, collisionCount: s.collisions, completed: s.checked === 3 }; break;
      default: ensure(false, "RM_MODULE", "无效路线小游戏");
    }
    return { tier, metrics };
  }
  function finish(s, status = "COMPLETED") {
    if (s.result) return s.result;
    const rated = status === "COMPLETED" ? performance(s) : { tier: null, metrics: {} };
    s.phase = "FINISHED";
    s.result = { kind: "ROUTE_MINIGAME_RESULT", sessionId: s.id, eventSessionId: s.eventSessionId,
      moduleId: s.moduleId, completionStatus: status, tier: rated.tier, metrics: rated.metrics,
      effectiveDurationMs: s.elapsedMs, worldEffectsCommitted: false };
    return s.result;
  }
  function advanceLocal(s, elapsedMs) {
    if (s.moduleId === "RM-01") {
      // Fixed 10 ms integration makes no-input clock subdivision deterministic.
      while (s.integratedMs + 10 <= elapsedMs) {
        s.integratedMs += 10;
        const seconds = s.integratedMs / 1000;
        s.x = clamp(s.x + (Math.sin(seconds * 2.6) * 25 + Math.cos(seconds * 1.1) * 22 + 12) * .01, 45, 355);
        const deviation = Math.abs(s.x - 200);
        if (deviation <= 46) s.safeMs += 10;
        s.maxDeviation = Math.max(s.maxDeviation, deviation);
      }
    }
    if (s.moduleId === "RM-06") {
      while (s.checked < 3 && elapsedMs >= 3000 + s.checked * 3000) {
        if (s.lane === [1, 0, 2][s.checked]) s.collisions++;
        s.checked++;
      }
    }
    s.elapsedMs = elapsedMs;
  }
  function input(s, action) {
    if (!action) return;
    ensure(action && typeof action === "object", "RM_INPUT", "无效操作");
    if (["RM-01", "RM-02", "RM-06"].includes(s.moduleId)) {
      ensure(action.direction === -1 || action.direction === 1, "RM_INPUT", "方向必须为左或右");
      if (s.moduleId === "RM-06") { s.lane = clamp(s.lane + action.direction, 0, 2); return; }
      s.taps++;
      const target = s.moduleId === "RM-01" ? 200 : 88;
      if (Math.sign(target - s.x) === action.direction) s.correctTaps++;
      s.x = clamp(s.x + action.direction * (s.moduleId === "RM-01" ? 25 : 58), s.moduleId === "RM-01" ? 45 : 88, s.moduleId === "RM-01" ? 355 : 360);
      if (s.moduleId === "RM-01") s.maxDeviation = Math.max(s.maxDeviation, Math.abs(s.x - 200));
      if (s.moduleId === "RM-02" && s.x === 88) finish(s);
      return;
    }
    const max = s.moduleId === "RM-03" ? 3 : s.moduleId === "RM-04" ? 2 : 4;
    ensure(Number.isInteger(action.target) && action.target >= 0 && action.target <= max, "RM_INPUT", "无效目标");
    if (s.moduleId === "RM-04") { s.selected = action.target; finish(s); return; }
    if (!s.targets.includes(action.target)) s.targets.push(action.target);
    if (s.targets.length === max + 1) finish(s);
  }
  function step(p, a) {
    const s = session(p, a), fingerprint = JSON.stringify(a);
    if (a.sequence === s.sequence && s.lastInput === fingerprint) return snapshot(s);
    ensure(!s.result && s.phase === "PLAYING", "RM_NOT_PLAYING", "小游戏不在可操作状态");
    ensure(Number.isSafeInteger(a.sequence) && a.sequence === s.sequence + 1, "RM_SEQUENCE", "操作已过期或重复");
    ensure(Number.isSafeInteger(a.elapsedMs) && a.elapsedMs >= s.elapsedMs && a.elapsedMs <= specs[s.moduleId].ms, "RM_CLOCK", "有效游玩时间无效");
    if (a.action !== undefined) {
      ensure(a.action && typeof a.action === "object", "RM_INPUT", "无效操作");
      if (["RM-01", "RM-02", "RM-06"].includes(s.moduleId)) ensure(a.action.direction === -1 || a.action.direction === 1, "RM_INPUT", "方向必须为左或右");
      else ensure(Number.isInteger(a.action.target) && a.action.target >= 0 && a.action.target <= (s.moduleId === "RM-03" ? 3 : s.moduleId === "RM-04" ? 2 : 4), "RM_INPUT", "无效目标");
    }
    advanceLocal(s, a.elapsedMs);
    if (s.elapsedMs >= specs[s.moduleId].ms) finish(s);
    else input(s, a.action);
    s.sequence = a.sequence; s.lastInput = fingerprint;
    return snapshot(s);
  }
  function snapshot(s) {
    return copy({ kind: "ROUTE_MINIGAME", modal: false, sessionId: s.id, eventSessionId: s.eventSessionId, moduleId: s.moduleId,
      name: specs[s.moduleId].name, phase: s.phase, elapsedMs: s.elapsedMs, durationMs: specs[s.moduleId].ms,
      sequence: s.sequence, x: s.x, targets: s.targets, selected: s.selected, lane: s.lane,
      checked: s.checked, collisions: s.collisions,
      obstacles: [1, 0, 2].map((lane, index) => ({ lane, atMs: 3000 + index * 3000, checked: index < s.checked })), result: s.result });
  }
  function reduce(p, command) {
    const a = command.payload || {};
    if (command.type === "RM_START") return start(p, a);
    if (command.type === "RM_STEP") return step(p, a);
    const s = session(p, a);
    if (command.type === "RM_PAUSE") { if (!s.result) s.phase = "PAUSED"; }
    else if (command.type === "RM_RESUME") { if (!s.result) s.phase = "PLAYING"; }
    else if (command.type === "RM_SKIP") finish(s, "SKIPPED");
    else if (command.type === "RM_ABORT") finish(s, "ABORTED");
    else ensure(false, "RM_COMMAND", "不支持的小游戏操作");
    return snapshot(s);
  }
  function preview(p, elapsedMs) {
    const current = p.work && p.work.routeGame;
    if (!current) return null;
    const draft = copy(current);
    if (draft.phase === "PLAYING" && Number.isFinite(elapsedMs))
      advanceLocal(draft, Math.max(draft.elapsedMs, Math.min(specs[draft.moduleId].ms, Math.floor(elapsedMs))));
    return snapshot(draft);
  }
  S.minigames = { initial, reduce, specs, performance, preview, view: p => p.work && p.work.routeGame ? snapshot(p.work.routeGame) : null };
  ["RM_START", "RM_STEP", "RM_PAUSE", "RM_RESUME", "RM_SKIP", "RM_ABORT"].forEach(type => S.commands.register(type, (p, payload, ctx) => reduce(p, { type, payload }, ctx)));
})(globalThis.Silk = globalThis.Silk || {});
