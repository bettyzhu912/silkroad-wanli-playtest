// Port of vendor/p0/tests/stress.py one_run(index): the TEST-ONLY seeded sampler (uniform no-replacement from the 15 kinds).
import { CATALOG, cargo, evaluateLayout, strategy_signature, serialize_signature } from './core.js';
import { generate_board, composition_qa, first_layer_qa, difficulty_qa, partition_ambiguity } from './generator.js';
import { PyRandom } from './pyrandom.js';
const factorial = n => { let f = 1; for (let i = 2; i <= n; i++) f *= i; return f; };
export function one_run(index) {
  const b2_size = index < 167 ? 5 : index < 333 ? 6 : 7; const recent = [], results = []; const kinds = Object.keys(CATALOG).sort();
  for (const [batch, size] of [[1, 4], [2, b2_size], [3, 8]]) {
    const seed = 202609090000 + index * 10 + batch, rng = new PyRandom(seed);
    const sampler = () => rng.sample(kinds, size).map(k => cargo(k));
    const [board, trace] = generate_board(batch, sampler, { seed, recent });
    if (board === null) { results.push({ run: index, batch, seed, status: 'GENERATION_EXHAUSTED', trace }); break; }
    const ev = board.evidence(); const errors = [];
    const s = evaluateLayout(board.left, board.right, board.reference_ratio, { expected: board.items });
    errors.push(...composition_qa(batch, board.items), ...first_layer_qa(s.physicalBalanceRatio, s.StackingScore, s.LayoutScore), ...difficulty_qa(batch, board.items, ev.nearOptimalRatio, ev.distinctNearOptimalSolutions, ev.weightPartitionAmbiguity)[0]);
    if (s.BalanceScore !== 100 || s.performanceTier === null) errors.push('INVALID_REFERENCE_SCORE_OR_TIER');
    if (ev.referenceLayoutScore !== s.LayoutScore || ev.referenceStackingScore !== s.StackingScore) errors.push('REFERENCE_MISMATCH');
    if (ev.allFeasibleLayoutCount !== factorial(size) * (9 - size)) errors.push('ENUMERATION_COUNT_MISMATCH');
    if (ev.nearOptimalLayoutCount / ev.allFeasibleLayoutCount !== ev.nearOptimalRatio) errors.push('NEAR_COUNT_MISMATCH');
    if (ev.decisionPatternSignature !== serialize_signature(strategy_signature(board.left, board.right))) errors.push('SIGNATURE_MISMATCH');
    if (recent.some(p => ev.decisionPatternSignature === p.metrics.decisionPatternSignature)) errors.push('DUPLICATE_PATTERN_ACCEPTED');
    if (partition_ambiguity(board.items).weightPartitionAmbiguity !== ev.weightPartitionAmbiguity) errors.push('AMBIGUITY_MISMATCH');
    results.push({ run: index, batch, size, seed, status: 'ACCEPTED', validationErrors: errors, board: ev, trace });
    recent.push(board);
  }
  return results;
}
