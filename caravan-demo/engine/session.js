// Port of vendor/p0/src/session.py (headless three-batch session and mock-only settlement contracts).
import { evaluateLayout, T, F } from './core.js';
export function formal_entry(phase) { return { visible: phase !== '暮', enabled: phase === '晨', reason: phase === '昼' ? '今日时间不足' : null }; }
export function payout(tiers) {
  if (tiers.length > 3 || tiers.some(t => !['MODEST', 'NORMAL', 'RICH'].includes(t))) throw new Error('only sequential valid batch tiers');
  const base = tiers.length ? F.economy.baseWage : 0;
  const rewards = tiers.map((tier, i) => ({ batchIndex: i + 1, completionReward: F.economy.completionRewards[i], qualityReward: T.qualityReward['B' + (i + 1)][tier] }));
  const extra = rewards.reduce((s, x) => s + x.completionReward + x.qualityReward, 0);
  return { baseWage: base, extraWage: extra, cash: Math.min(F.economy.cashCap, base + extra), rewards };
}
const clone = v => JSON.parse(JSON.stringify(v));
export class Session {
  constructor(board_provider, { mode, timerConfig, phase = '晨', jobId = 'P0_MOCK_JOB', runId = 'P0_MOCK_RUN' }) {
    if (!['FORMAL', 'TRIAL'].includes(mode) || ![75, 90].includes(timerConfig)) throw new Error('explicit mode/timer required');
    if (mode === 'FORMAL' && !formal_entry(phase).enabled) throw new Error('formal entry unavailable');
    this.provider = board_provider; this.mode = mode; this.timerConfig = timerConfig; this.remaining = Number(timerConfig); this.elapsed = 0; this.batch = 1;
    this.jobId = jobId; this.runId = runId; this.results = []; this.state = 'GAMEPLAY'; this.pending_timeout = false; this.result = null; this.last_evaluation = null; this._load();
  }
  _load() { this.board = this.provider(this.batch); if (!this.board || this.board.batch !== this.batch) throw new Error('board unavailable'); this.left = []; this.right = []; this.by_id = Object.fromEntries(this.board.items.map(c => [c.instance, c])); this.original_slots = this.board.items.map(c => c.instance); this.waiting = new Set(this.original_slots); }
  _operable() { if (this.state !== 'GAMEPLAY') throw new Error('INPUT_LOCKED'); }
  get can_submit() { return this.state === 'GAMEPLAY' && this.waiting.size === 0; }
  insert(instance, side) { this._operable(); if (!['left', 'right'].includes(side) || !this.waiting.has(instance)) throw new Error('invalid placement'); const bag = this[side]; if (bag.length === 4) throw new Error('已满'); bag.push(this.by_id[instance]); this.waiting.delete(instance); }
  remove(instance, side) { this._operable(); if (!['left', 'right'].includes(side)) throw new Error('invalid side'); const bag = this[side]; if (!bag.length || bag[bag.length - 1].instance !== instance) throw new Error('先取出上层货物'); const c = bag.pop(); this.waiting.add(c.instance); }
  debug() { return { ...evaluateLayout(this.left, this.right, this.board.reference_ratio, { debug: true }), referenceSolution: { left: this.board.left.map(c => c.instance), right: this.board.right.map(c => c.instance) }, nearOptimalRatio: this.board.metrics.nearOptimalRatio, generationAttempts: this.board.metrics.generationAttempts ?? null, rejectReasonHistory: this.board.metrics.rejectReasonHistory || [] }; }
  tick(seconds) { if (!Number.isFinite(seconds) || seconds < 0) throw new Error('invalid clock delta'); if (this.state !== 'GAMEPLAY') return; const used = Math.min(seconds, this.remaining); this.remaining -= used; this.elapsed += used; if (this.remaining === 0) this.timeout_event(); }
  timeout_event() { if (['SETTLEMENT', 'ABORTED'].includes(this.state)) return; if (this.state === 'ABORT_CONFIRM') return; this.remaining = 0; if (this.state === 'EVALUATING') this.pending_timeout = true; else this._settle('TIMEOUT'); }
  submit() { this._operable(); if (!this.can_submit) throw new Error('REJECT_INCOMPLETE_LAYOUT'); this.state = 'EVALUATING'; this.submitted_at = this.elapsed; this.snapshot = [this.left.slice(), this.right.slice()]; }
  resolve_submission() {
    if (this.state !== 'EVALUATING') throw new Error('no accepted submission');
    const [a, b] = this.snapshot; const s = evaluateLayout(a, b, this.board.reference_ratio, { expected: this.board.items }); this.last_evaluation = s;
    if (s.passed) this.results.push({ batchIndex: this.batch, cargoIds: this.board.items.map(c => c.kind), performanceTier: s.performanceTier, balanceScore: s.BalanceScore, stackingScore: s.StackingScore, layoutScore: s.LayoutScore, submittedAtSeconds: this.submitted_at, rewardData: payout([...this.results.map(x => x.performanceTier), s.performanceTier]).rewards.slice(-1)[0] });
    if (this.pending_timeout || this.remaining === 0) this._settle('TIMEOUT'); else if (s.passed && this.batch === 3) this._settle('ALL_BATCHES_COMPLETED'); else if (s.passed) this.state = 'TRANSITION'; else this.state = 'GAMEPLAY';
    return s;
  }
  finish_transition() { if (this.state !== 'TRANSITION') throw new Error('no transition'); this.batch++; this._load(); this.state = 'GAMEPLAY'; }
  request_abort() { this._operable(); this.state = 'ABORT_CONFIRM'; }
  cancel_abort() { if (this.state !== 'ABORT_CONFIRM') throw new Error('no abort confirmation'); this.state = 'GAMEPLAY'; }
  confirm_abort() { if (this.state !== 'ABORT_CONFIRM') throw new Error('no abort confirmation'); this._settle('ABORTED'); }
  _settle(reason) {
    if (this.result !== null) return this.result;
    const aborted = reason === 'ABORTED', formal = this.mode === 'FORMAL' && !aborted; const pay = aborted ? payout([]) : payout(this.results.map(r => r.performanceTier));
    this.state = aborted ? 'ABORTED' : 'SETTLEMENT';
    this.result = { minigameId: 'DUNHUANG_CARAVAN_LOADING', jobId: this.jobId, runId: this.runId, mode: this.mode, completionStatus: aborted ? 'ABORTED' : null, p0TerminationReason: reason, performanceTier: null,
      primaryMetrics: { completedBatchCount: this.results.length, batchResults: clone(this.results) },
      secondaryMetrics: { finalBalanceScores: this.results.map(r => r.balanceScore), finalStackingScores: this.results.map(r => r.stackingScore), finalLayoutScores: this.results.map(r => r.layoutScore) }, bonusMetrics: {},
      durationData: { elapsedSeconds: this.elapsed, remainingSeconds: this.remaining, clock: 'P0_SYNTHETIC_OPERABLE_SECONDS' },
      cashDelta: formal ? pay.cash : 0, timeCostTicks: formal ? 2 : 0, tripStateDelta: 0, formalWorkHistory: formal, reputationDelta: 0,
      simulatedPayout: this.mode === 'TRIAL' && !aborted ? pay.cash : 0, payoutBreakdown: pay };
    return this.result;
  }
  navigate(destination) { if (this.state !== 'SETTLEMENT' || !['LIVELIHOOD_LIST', 'CITY'].includes(destination)) throw new Error('invalid navigation'); return destination; }
}
export class MockOuter {
  constructor(active_trip = false) { this.state = { cash: 100, worldTicks: 0, tripSummary: { livelihoodIncome: 0 }, tradeProfit: 17, reputation: 3, reputationTurnover: 11, goods: ['unchanged'], market: { unchanged: true }, workHistory: [] }; this.applied = new Set(); this.active_trip = active_trip; }
  apply(result) {
    if (result.mode === 'TRIAL' || result.completionStatus === 'ABORTED') return; if (this.applied.has(result.runId)) return; this.applied.add(result.runId);
    this.state.cash += result.cashDelta; this.advanceTime(result.timeCostTicks);
    if (this.active_trip) this.state.tripSummary.livelihoodIncome += result.cashDelta;
    if (result.formalWorkHistory) this.state.workHistory.push({ runId: result.runId, cash: result.cashDelta, batchTiers: result.primaryMetrics.batchResults.map(x => x.performanceTier) });
  }
  advanceTime(ticks) { this.state.worldTicks += ticks; }
}
