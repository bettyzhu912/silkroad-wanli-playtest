/*
 * 《缀纹成章》standalone mock host — 模拟主游戏外层：世界时间（晨 / 午 / 暮，1 day = 3 ticks）、现金、正式记录。
 * 全部为 standalone 脚手架，不连接真实经济 / 存档 / 旅途统计 / B7 入口。主游戏接入时由真实 adapter 替换（对应 S.time.advance(p, count)）。
 */
(function (root) {
  'use strict';
  const E = root.PatternChainEngine;
  const KEY = 'zhuwen-chengzhang-standalone-mock-v1';
  const PHASES = ['晨', '午', '暮'];
  const fresh = () => ({ tick: 0, cash: 100, records: [], trials: 0, aborted: 0, lastResult: null, lastRecord: null });
  let state = fresh();
  try { const raw = localStorage.getItem(KEY); if (raw) state = Object.assign(fresh(), JSON.parse(raw)); } catch (e) { /* storage unavailable: memory only */ }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignore */ } }
  const host = {
    kind: 'MOCK_HOST (standalone)', phases: PHASES,
    get state() { return state; },
    phase() { return state.tick % 3; },
    phaseName() { return PHASES[state.tick % 3]; },
    day() { return Math.floor(state.tick / 3) + 1; },
    timeLabel() { return '第 ' + host.day() + ' 天 · ' + host.phaseName(); },
    canStartFormal() { return E.CONFIG.formalStartPhases.includes(state.tick % 3); }, // HALF_DAY：晨 / 午可开始，暮不可
    advanceTime(ticks) { state.tick += ticks; save(); return state.tick; },       // ≙ 主游戏 S.time.advance(p, count)
    // ZHUWEN_CHENGZHANG_SCORE_TO_CASH_MAPPING (frozen by the user 2026-09-14, defined once in the engine): validStrokes == 0 → 0; else min(15, 6 + floor((score − 1) / 15)).
    scoreToCash(result) { const m = result.primaryMetrics; return E.scoreToCash(m.score, m.validStrokes); },
    commitFormal(result) { // 正式营生：先完成结算记录（冻结映射的模拟现金），再推进世界时间
      const cash = host.scoreToCash(result);
      const rec = { at: new Date().toISOString(), mode: 'FORMAL', workDuration: E.CONFIG.workDuration, jobId: 'MOCK_JOB_ID_UNFROZEN', tickBefore: state.tick, cash, cashMapping: E.SCORE_TO_CASH.id, cashNote: 'ZHUWEN_CHENGZHANG_SCORE_TO_CASH_MAPPING（已冻结）', result };
      state.cash += cash; state.records.push(rec); state.lastResult = result; state.lastRecord = rec;
      host.advanceTime(result.economy.timeCostTicks); rec.tickAfter = state.tick; save(); return rec;
    },
    recordTrial(result) { state.trials++; state.lastResult = result; save(); },   // 0 real cash / 0 world time / 0 trip delta / 不写正式历史
    recordAbort(result) { state.aborted++; state.lastResult = result; save(); },  // ABORTED：0 cash / 0 tick / no formal record
    setPhase(i) { state.tick = Math.floor(state.tick / 3) * 3 + (i % 3); save(); },
    reset() { state = fresh(); save(); }
  };
  root.PatternChainHost = host;
})(window);
