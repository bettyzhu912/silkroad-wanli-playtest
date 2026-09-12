// Port of vendor/p0/src/generator.py (exhaustive solve-before-present generator, two-layer QA, 200-attempt cap).
import { cargo, CATALOG, cargoEquals, evaluateLayout, canonical_layout, strategy_signature, serialize_signature, physical_ratio, bag_summary, cmp, pyMin, F, T } from './core.js';
function* combinations(n, k) { const idx = Array.from({ length: k }, (_, i) => i); if (k > n) return; for (;;) { yield idx.slice(); let i = k - 1; while (i >= 0 && idx[i] === i + n - k) i--; if (i < 0) return; idx[i]++; for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1; } }
function* permutations(arr) { const n = arr.length, c = new Array(n).fill(0), a = arr.slice(); yield a.slice(); let i = 0; // Python itertools order via index-array algorithm
  const pool = arr, indices = Array.from({ length: n }, (_, k) => k), cycles = Array.from({ length: n }, (_, k) => n - k); if (n === 0) return;
  for (;;) { let found = false; for (let ii = n - 1; ii >= 0; ii--) { cycles[ii]--; if (cycles[ii] === 0) { const t = indices[ii]; indices.splice(ii, 1); indices.push(t); cycles[ii] = n - ii; } else { const j = cycles[ii]; const tmp = indices[ii]; indices[ii] = indices[n - j]; indices[n - j] = tmp; yield indices.map(x => pool[x]); found = true; break; } } if (!found) return; }
}
export function* feasible_layouts(items) {
  items = Array.from(items); const n = items.length;
  for (let left_n = Math.max(0, n - 4); left_n <= Math.min(4, n); left_n++) for (const chosen of combinations(n, left_n)) {
    const set = new Set(chosen); const a = items.filter((_, i) => set.has(i)), b = items.filter((_, i) => !set.has(i));
    const right_orders = Array.from(permutations(b));
    for (const left of permutations(a)) for (const right of right_orders) yield [left, right];
  }
}
export function first_layer_qa(ratio, stacking, layout) { const r = []; if (ratio < F.generation.physicalHardFloor) r.push('REJECT_PHYSICAL_BALANCE'); if (stacking < T.referenceQA.stackingMin) r.push('REJECT_STACKING_QUALITY'); if (layout < T.referenceQA.layoutMin) r.push('REJECT_LAYOUT_QUALITY'); return r; }
export function select_reference(layouts) {
  let best_key = null, reference = null, qualified_count = 0; const failure_counts = {};
  for (const [left, right] of layouts) {
    const lw = bag_summary(left)[0], rw = bag_summary(right)[0], ratio = physical_ratio(lw, rw);
    const score = evaluateLayout(left, right, ratio ? ratio : 1.0); const reasons = first_layer_qa(ratio, score.StackingScore, score.LayoutScore);
    if (reasons.length) { for (const r of reasons) failure_counts[r] = (failure_counts[r] || 0) + 1; continue; }
    qualified_count++;
    const key = [-score.LayoutScore, -ratio, -score.StackingScore, canonical_layout(left, right)];
    if (best_key === null || cmp(key, best_key) < 0) { best_key = key; let L = left, R = right; if (cmp(L.map(c => c.instance), R.map(c => c.instance)) > 0) { L = right; R = left; } reference = [L, R, score]; }
  }
  return [reference, qualified_count, failure_counts];
}
export function partition_ambiguity(items) {
  const parts = new Map(), n = items.length;
  for (let k = Math.max(0, n - 4); k <= Math.min(n, 4); k++) for (const a of combinations(n, k)) {
    const set = new Set(a), b = items.map((_, i) => i).filter(i => !set.has(i));
    const ids = [a.map(i => items[i].instance).sort(), b.map(i => items[i].instance).sort()]; const key = JSON.stringify(pyMin(ids, [ids[1], ids[0]]));
    parts.set(key, physical_ratio(a.reduce((s, i) => s + items[i].weight, 0), b.reduce((s, i) => s + items[i].weight, 0)));
  }
  const vals = [...parts.values()]; const best = Math.max(...vals); const count = vals.filter(r => r >= best - .05).length;
  return { bestPhysicalRatio: best, nearBestWeightPartitions: count, weightPartitionAmbiguity: count <= 1 ? 'LOW' : count === 2 ? 'MEDIUM' : 'HIGH' };
}
export function composition_qa(batch, items) {
  const reasons = [], allowed = { 1: [4], 2: [5, 6, 7], 3: [8] };
  if (!allowed[batch] || !allowed[batch].includes(items.length) || new Set(items.map(c => c.instance)).size !== items.length) return ['REJECT_FEASIBILITY'];
  if (items.some(c => !CATALOG[c.kind] || !cargoEquals(c, cargo(c.kind, c.instance)))) return ['REJECT_CARGO_POOL'];
  if (items.reduce((s, c) => s + c.cw, 0) > T.difficulty.batches[batch - 1].targetCW[1]) reasons.push('REJECT_CONSTRAINT_WEIGHT');
  const high = items.filter(c => c.cw >= 2).length;
  if (batch === 1 && (high > 2 || high === items.length)) reasons.push('REJECT_HIGH_CONSTRAINT_DENSITY');
  if (batch === 3 && items.filter(c => c.cw === 3).length > 2) reasons.push('REJECT_HIGH_CONSTRAINT_DENSITY');
  return reasons;
}
export function difficulty_qa(batch, items, near_ratio, distinct, ambiguity) {
  const reasons = [], warnings = [], cw = items.reduce((s, c) => s + c.cw, 0);
  if ((batch === 2 || batch === 3) && near_ratio < .03 && distinct < 2) reasons.push('REJECT_TOO_NARROW');
  if (batch === 3 && cw < 6 && near_ratio > .30 && ambiguity === 'LOW') reasons.push('REJECT_TOO_EASY');
  const cfg = T.difficulty.batches[batch - 1];
  if (!(cfg.targetCW[0] <= cw && cw <= cfg.targetCW[1])) warnings.push('WARN_CW_TARGET');
  if (!(cfg.nearOptimalRatioTarget[0] <= near_ratio && near_ratio <= cfg.nearOptimalRatioTarget[1])) warnings.push('WARN_NEAR_OPTIMAL_TARGET');
  if (!cfg.weightComplexity.includes(ambiguity)) warnings.push('WARN_WEIGHT_COMPLEXITY');
  const high = items.filter(c => c.cw >= 2).length;
  if (batch === 2 && !(2 <= high && high <= 3)) warnings.push('WARN_HIGH_CONSTRAINT_TARGET');
  if (batch === 3 && !(2 <= high && high <= 4)) warnings.push('WARN_HIGH_CONSTRAINT_TARGET');
  if (batch === 3 && items.filter(c => c.cw <= 1).length < 2) warnings.push('WARN_FLEXIBLE_CARGO_TARGET');
  if ((batch === 2 || batch === 3) && distinct < 2) warnings.push('WARN_DISTINCT_TARGET');
  return [reasons, warnings];
}
const sortedUnique = a => [...new Set(a)].sort((x, y) => x < y ? -1 : x > y ? 1 : 0);
export class Board {
  constructor(batch, items, left, right, reference_ratio, metrics) { this.batch = batch; this.items = items; this.left = left; this.right = right; this.reference_ratio = reference_ratio; this.metrics = metrics; }
  evidence() { return { batch: this.batch, cargo: this.items.map(c => ({ instance: c.instance, kind: c.kind })), referenceSolution: { left: this.left.map(c => c.instance), right: this.right.map(c => c.instance) }, referencePhysicalBalanceRatio: this.reference_ratio, ...this.metrics, referenceDebug: evaluateLayout(this.left, this.right, this.reference_ratio, { expected: this.items, debug: true }) }; }
}
export function analyze_board(batch, items, recent = []) {
  items = Array.from(items); let reasons = composition_qa(batch, items); if (reasons.length) return [null, reasons];
  const [ref, qcount, fail_counts] = select_reference(feasible_layouts(items));
  if (ref === null) return [null, ['REJECT_REFERENCE_NOT_FOUND', ...Object.keys(fail_counts).sort()]];
  const [left, right, rs] = ref, ratio = rs.physicalBalanceRatio; const values = []; let best = -1;
  for (const [a, b] of feasible_layouts(items)) { const s = evaluateLayout(a, b, ratio); best = Math.max(best, s.LayoutScore); values.push([a, b, s.LayoutScore]); }
  const near = values.filter(([, , l]) => l >= best - T.difficulty.nearOptimalDelta).map(([a, b]) => [a, b]);
  const distinct = new Set(near.map(([a, b]) => serialize_signature(strategy_signature(a, b)))).size;
  const near_ratio = near.length / values.length, ambiguity = partition_ambiguity(items);
  let warnings; [reasons, warnings] = difficulty_qa(batch, items, near_ratio, distinct, ambiguity.weightPartitionAmbiguity);
  const sig = serialize_signature(strategy_signature(left, right));
  for (const prior of recent) {
    if (sig === prior.metrics.decisionPatternSignature) reasons.push('REJECT_DUPLICATE_DECISION_PATTERN');
    const kinds = new Set(items.map(c => c.kind)), pk = new Set(prior.items.map(c => c.kind)); if ([...kinds].some(k => pk.has(k))) warnings.push('WARN_REPEAT_CARGO');
    const arch = new Set(items.map(c => c.archetype)), pa = new Set(prior.items.map(c => c.archetype)); if ([...arch].some(k => pa.has(k))) warnings.push('WARN_REPEAT_ARCHETYPE');
    const w1 = items.map(c => c.weight).sort((x, y) => x - y).join(), w2 = prior.items.map(c => c.weight).sort((x, y) => x - y).join(); if (w1 === w2) warnings.push('WARN_REPEAT_WEIGHT_PATTERN');
  }
  if (reasons.length) return [null, sortedUnique(reasons)];
  const uw = sortedUnique(warnings);
  const metrics = { referenceStackingScore: rs.StackingScore, referenceLayoutScore: rs.LayoutScore, qualifiedReferenceCount: qcount, allFeasibleLayoutCount: values.length, nearOptimalLayoutCount: near.length, nearOptimalRatio: near_ratio, distinctNearOptimalSolutions: distinct, bestFeasibleLayoutScore: best, decisionPatternSignature: sig, constraintWeight: items.reduce((s, c) => s + c.cw, 0), boundary: ratio < T.referenceQA.preferredPhysicalTarget, ...ambiguity, warnings: uw, qaStatus: uw.length ? 'ACCEPT_WITH_WARNING' : 'ACCEPT',
    repeatTelemetry: recent.map(p => { const kinds = new Set(items.map(c => c.kind)), arch = new Set(items.map(c => c.archetype)); return { batch: p.batch, sharedCargoKinds: [...new Set(p.items.map(c => c.kind))].filter(k => kinds.has(k)).length, sharedArchetypes: [...new Set(p.items.map(c => c.archetype))].filter(k => arch.has(k)).length }; }) };
  return [new Board(batch, items, left, right, ratio, metrics), []];
}
export function generate_board(batch, sampler, { seed, recent = [] }) {
  if (recent.length > batch - 1 || recent.some(p => p.batch >= batch)) throw new Error('invalid current-run history');
  const counts = {}, attempts = [];
  for (let attempt = 1; attempt <= 200; attempt++) {
    const items = Array.from(sampler(attempt)); const [board, reasons] = analyze_board(batch, items, recent);
    attempts.push({ attempt, cargo: items.map(c => c.kind), rejectReasons: reasons });
    if (board) { Object.assign(board.metrics, { generationAttempts: attempt, seed, rejectReasonHistory: attempts.slice(0, -1), rejectReasonDistribution: { ...counts } }); return [board, { status: board.metrics.qaStatus, attemptCount: attempt, attempts, rejectReasonDistribution: { ...counts } }]; }
    for (const r of reasons) counts[r] = (counts[r] || 0) + 1;
  }
  return [null, { status: 'GENERATION_EXHAUSTED', batch, seed, attemptCount: 200, rejectReasonDistribution: { ...counts }, attempts }];
}
