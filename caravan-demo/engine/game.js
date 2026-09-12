// Port of the P1 presentation adapter (P1_PLAYABLE server.py `Game`, deployment copy py/p1_game.py): same states, actions,
// snapshot fields and timings. Board preparation is synchronous (the worker is the background thread).
import { CATALOG, ATTR, cargo, evaluateLayout } from './core.js';
import { Board } from './generator.js';
import { Session, MockOuter } from './session.js';
import { one_run } from './stress.js';
const uuid = () => (globalThis.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'run-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
export class Game {
  constructor(clock = now) { this.clock = clock; this.state = 'READY'; this.session = null; this.prepared = {}; this.loading = new Set(); this.errors = {}; this.debug = false; this.outer = new MockOuter(); this.last = clock(); this.deadline = null; this.feedback = null; this.events = []; }
  prepare(index) {
    if (!Number.isInteger(index) || !(0 <= index && index < 500)) throw new Error('测试题组应在0–499之间');
    if (index in this.prepared || this.loading.has(index)) return;
    this.loading.add(index);
    try {
      const rows = one_run(index), boards = [];
      for (const row of rows) {
        if (row.status !== 'ACCEPTED' || row.validationErrors.length) throw new Error('GENERATION_EXHAUSTED / QA rejected');
        const e = row.board, items = e.cargo.map(c => cargo(c.kind, c.instance)), ids = Object.fromEntries(items.map(c => [c.instance, c]));
        boards.push(new Board(e.batch, items, e.referenceSolution.left.map(i => ids[i]), e.referenceSolution.right.map(i => ids[i]), e.referencePhysicalBalanceRatio, e));
      }
      if (boards.length !== 3) throw new Error('GENERATION_EXHAUSTED');
      this.prepared[index] = boards;
    } catch (e) { this.errors[index] = String(e.message || e); } finally { this.loading.delete(index); }
  }
  sync() {
    const t = this.clock(), dt = Math.max(0, t - this.last); this.last = t; const s = this.session; if (!s) return;
    if (this.state === 'GAMEPLAY') { s.tick(dt); if (s.state === 'SETTLEMENT') { this.state = 'TIMEOUT'; this.deadline = t + .7; } }
    else if (this.state === 'EVALUATING' && t >= this.deadline) { const score = s.resolve_submission(); this.feedback = score.passed ? 'PASS' : 'NOT_PASS'; this.state = 'FEEDBACK'; this.deadline = t + .8; }
    else if (this.state === 'FEEDBACK' && t >= this.deadline) { if (s.state === 'TRANSITION') { this.state = 'TRANSITION'; this.deadline = t + .5; } else if (s.state === 'SETTLEMENT') { this.state = 'SETTLEMENT'; this.outer.apply(s.result); } else this.state = 'GAMEPLAY'; }
    else if (this.state === 'TRANSITION' && t >= this.deadline) { s.finish_transition(); this.state = 'GAMEPLAY'; this.feedback = null; }
    else if (this.state === 'TIMEOUT' && t >= this.deadline) { this.state = 'SETTLEMENT'; this.outer.apply(s.result); }
  }
  action(a) {
    this.sync(); const op = a.op, s = this.session;
    if (op === 'prepare') this.prepare(a.index);
    else if (op === 'debug') this.debug = Boolean(a.enabled);
    else if (op === 'how' && this.state === 'READY') this.state = 'HOW_TO_PLAY';
    else if (op === 'ready' && ['HOW_TO_PLAY', 'LIVELIHOOD_LIST'].includes(this.state)) this.state = 'READY';
    else if (op === 'livelihood' && this.state === 'CITY') this.state = 'LIVELIHOOD_LIST';
    else if (op === 'start' && this.state === 'READY') { const boards = this.prepared[a.index]; if (!boards) throw new Error(this.errors[a.index] || '题目尚未准备完成'); this.session = new Session(b => boards[b - 1], { mode: a.mode, timerConfig: a.seconds, phase: '晨', jobId: 'P1_STANDALONE', runId: uuid() }); this.state = 'GAMEPLAY'; this.feedback = null; }
    else if (['insert', 'remove', 'submit', 'abort'].includes(op) && this.state === 'GAMEPLAY') { if (op === 'insert') s.insert(a.id, a.side); else if (op === 'remove') s.remove(a.id, a.side); else if (op === 'abort') { s.request_abort(); this.state = 'ABORT_CONFIRM'; } else { s.submit(); this.state = 'EVALUATING'; this.deadline = this.clock() + .9; } }
    else if (op === 'cancel_abort' && this.state === 'ABORT_CONFIRM') { s.cancel_abort(); this.state = 'GAMEPLAY'; }
    else if (op === 'confirm_abort' && this.state === 'ABORT_CONFIRM') { s.confirm_abort(); this.outer.apply(s.result); this.state = 'LIVELIHOOD_LIST'; }
    else if (op === 'close' && ['READY', 'HOW_TO_PLAY'].includes(this.state)) this.state = 'LIVELIHOOD_LIST';
    else if (op === 'navigate' && this.state === 'SETTLEMENT') this.state = s.navigate(a.destination);
    else throw new Error('当前暂不可操作');
    this.last = this.clock(); this.events.push({ op, state: this.state, time: this.last }); return this.snapshot();
  }
  snapshot() {
    this.sync(); const s = this.session;
    const d = { state: this.state, debugEnabled: this.debug, prepared: Object.keys(this.prepared).map(Number), loading: [...this.loading], errors: this.errors, feedback: this.feedback };
    if (s) {
      const ev = evaluateLayout(s.left, s.right, s.board.reference_ratio, { debug: true }); const lw = s.left.reduce((x, c) => x + c.weight, 0), rw = s.right.reduce((x, c) => x + c.weight, 0), ratio = ev.physicalBalanceRatio;
      Object.assign(d, { lastTier: s.last_evaluation ? s.last_evaluation.performanceTier : null, batch: s.batch, mode: s.mode, remaining: s.remaining, left: s.left.map(c => c.instance), right: s.right.map(c => c.instance), slots: s.original_slots.slice(), waiting: [...s.waiting], canSubmit: this.state === 'GAMEPLAY' && s.can_submit,
        cargo: Object.fromEntries(s.board.items.map(c => [c.instance, { name: CATALOG[c.kind].name, kind: c.kind, weightLabel: CATALOG[c.kind].weightLabel, attributes: c.attributes.map(t => ATTR[t]) }])),
        balance: { ratio, direction: lw > rw ? -1 : rw > lw ? 1 : 0, band: ratio === null ? 'empty' : ratio >= .85 ? 'green' : ratio >= .80 ? 'yellow' : 'red' },
        warnings: Object.values(ev.penaltySources || {}).flat().filter(r => Object.entries(r.components).some(([k, v]) => v > 0 && ['heavyLayer', 'pressure', 'fragileHeavyAbove'].includes(k))).map(r => r.instance) });
      if (this.state === 'SETTLEMENT') { const r = s.result; d.settlement = { completed: r.primaryMetrics.completedBatchCount, tiers: s.results.map(x => x.performanceTier), base: r.payoutBreakdown.baseWage, extra: r.payoutBreakdown.extraWage, cash: s.mode === 'TRIAL' ? r.simulatedPayout : r.cashDelta }; }
      if (this.debug) { const dbg = s.debug(); Object.assign(dbg, { leftWeight: lw, rightWeight: rw, cargoWeights: Object.fromEntries(s.board.items.map(c => [c.instance, c.weight])), constraintWeight: s.board.metrics.constraintWeight, referenceBestPhysicalRatio: s.board.reference_ratio, result: s.result, mockOuter: this.outer.state, clockAdapter: 'monotonic operable seconds -> unchanged P0 tick (JS port)', testRunIndex: s.board.metrics.seed ?? null }); d.debug = dbg; }
    }
    return d;
  }
}
// Deployment parity probe (mirror of py/parity_probe.py): generator evidence + a scripted FORMAL session per index.
import { feasible_layouts } from './generator.js';
export function fingerprint(indices) {
  const out = { python: 'js-port', runs: {} };
  for (const index of indices) {
    let t = 100.0; const clock = () => t; const g = new Game(clock); g.prepare(index); const boards = g.prepared[index];
    if (!boards) { out.runs[String(index)] = { error: g.errors[index] }; continue; }
    const row = { boards: [] };
    for (const b of boards) { const m = b.metrics; row.boards.push({ batch: b.batch, cargo: b.items.map(c => c.instance), reference: { left: b.left.map(c => c.instance), right: b.right.map(c => c.instance) }, referencePhysicalBalanceRatio: b.reference_ratio, referenceStackingScore: m.referenceStackingScore, referenceLayoutScore: m.referenceLayoutScore, allFeasibleLayoutCount: m.allFeasibleLayoutCount, nearOptimalLayoutCount: m.nearOptimalLayoutCount, distinctNearOptimalSolutions: m.distinctNearOptimalSolutions, bestFeasibleLayoutScore: m.bestFeasibleLayoutScore, constraintWeight: m.constraintWeight, weightPartitionAmbiguity: m.weightPartitionAmbiguity, boundary: m.boundary, warnings: m.warnings, qaStatus: m.qaStatus, generationAttempts: m.generationAttempts, decisionPatternSignature: m.decisionPatternSignature }); }
    g.action({ op: 'start', mode: 'FORMAL', seconds: 75, index });
    const place = pair => { [['left', pair[0]], ['right', pair[1]]].forEach(([side, items]) => { for (const it of items) g.action({ op: 'insert', id: it.instance, side }); }); };
    const settleCycle = () => { g.action({ op: 'submit' }); t += .91; g.snapshot(); t += .81; g.snapshot(); t += .51; g.snapshot(); };
    let s = g.session, b = s.board; place([b.left, b.right]); t += 3; settleCycle();
    s = g.session; b = s.board; let bad = null; for (const [a, z] of feasible_layouts(b.items)) { if (!evaluateLayout(a, z, b.reference_ratio).passed) { bad = [a, z]; break; } }
    if (bad) { place(bad); t += 2; g.action({ op: 'submit' }); t += .91; g.snapshot(); row.b2FirstFeedback = g.feedback; t += .81; g.snapshot(); for (const side of ['left', 'right']) for (const it of g.session[side].slice().reverse()) g.action({ op: 'remove', id: it.instance, side }); }
    place([b.left, b.right]); t += 2; settleCycle();
    s = g.session; b = s.board; place([b.left, b.right]); t += 4; settleCycle();
    g.snapshot(); const r = g.session.result;
    row.final = { state: g.state, remaining: g.session.remaining, completed: r.primaryMetrics.completedBatchCount, tiers: g.session.results.map(x => x.performanceTier), cashDelta: r.cashDelta, timeCostTicks: r.timeCostTicks, payout: r.payoutBreakdown, scores: r.secondaryMetrics, mockOuter: g.outer.state };
    out.runs[String(index)] = row;
  }
  return out;
}
export function worstLayout(session) { if (!session) return null; const b = session.board; for (const [a, z] of feasible_layouts(b.items)) if (!evaluateLayout(a, z, b.reference_ratio).passed) return { left: a.map(c => c.instance), right: z.map(c => c.instance) }; return null; }
