"""Exhaustive solve-before-present generator, injected sampler, 200-attempt cap."""
from itertools import permutations, combinations
from collections import Counter
from dataclasses import dataclass
from core import (cargo, CATALOG, evaluateLayout, canonical_layout, strategy_signature,
                  serialize_signature, physical_ratio, bag_summary, F, T)

def feasible_layouts(items):
    """Complete raw enumeration, including both mirrors and every vertical order."""
    items = tuple(items)
    for left_n in range(max(0, len(items)-4), min(4, len(items))+1):
        for chosen in combinations(range(len(items)), left_n):
            chosen = set(chosen)
            a = tuple(c for i,c in enumerate(items) if i in chosen)
            b = tuple(c for i,c in enumerate(items) if i not in chosen)
            right_orders = tuple(permutations(b))
            for left in permutations(a):
                for right in right_orders:
                    yield left, right

def first_layer_qa(ratio, stacking, layout):
    """Pure branch function; unreachable referenceLayout rejection uses injection only."""
    reasons = []
    if ratio < F['generation']['physicalHardFloor']: reasons.append('REJECT_PHYSICAL_BALANCE')
    if stacking < T['referenceQA']['stackingMin']: reasons.append('REJECT_STACKING_QUALITY')
    if layout < T['referenceQA']['layoutMin']: reasons.append('REJECT_LAYOUT_QUALITY')
    return reasons

def select_reference(layouts):
    """Candidate reference scores use reference-self Balance=100 (handoff).
    After selecting, every player/near-optimal score uses ONE fixed denominator.
    """
    best_key = None; reference = None; qualified_count = 0
    failure_counts = Counter()
    for left, right in layouts:
        lw = bag_summary(left)[0]; rw = bag_summary(right)[0]
        ratio = physical_ratio(lw, rw)
        score = evaluateLayout(left, right, ratio if ratio else 1.)
        reasons = first_layer_qa(ratio, score.StackingScore, score.LayoutScore)
        if reasons:
            failure_counts.update(reasons); continue
        qualified_count += 1
        key = (-score.LayoutScore, -ratio, -score.StackingScore, canonical_layout(left,right))
        if best_key is None or key < best_key:
            best_key = key
            # Store the canonical orientation, so mirror iteration order is irrelevant.
            if tuple(c.instance for c in left) > tuple(c.instance for c in right): left,right = right,left
            reference = (left, right, score)
    return reference, qualified_count, dict(failure_counts)

def partition_ambiguity(items):
    parts = {}
    n = len(items)
    for k in range(max(0,n-4), min(n,4)+1):
        for a in combinations(range(n), k):
            b = tuple(i for i in range(n) if i not in a)
            ids = (tuple(sorted(items[i].instance for i in a)), tuple(sorted(items[i].instance for i in b)))
            key = min(ids,ids[::-1])
            parts[key] = physical_ratio(sum(items[i].weight for i in a),sum(items[i].weight for i in b))
    best = max(parts.values())
    count = sum(r >= best - .05 for r in parts.values())
    return {'bestPhysicalRatio': best, 'nearBestWeightPartitions': count,
            'weightPartitionAmbiguity': 'LOW' if count <= 1 else 'MEDIUM' if count == 2 else 'HIGH'}

def composition_qa(batch, items):
    reasons = []
    allowed = {1:(4,),2:(5,6,7),3:(8,)}
    if batch not in allowed or len(items) not in allowed[batch] or len({c.instance for c in items}) != len(items):
        return ['REJECT_FEASIBILITY']
    # Validate the frozen data, not only the ID. Synthetic items never enter generation.
    if any(c.kind not in CATALOG or c != cargo(c.kind, c.instance) for c in items):
        return ['REJECT_CARGO_POOL']
    if sum(c.cw for c in items) > T['difficulty']['batches'][batch-1]['targetCW'][1]:
        reasons.append('REJECT_CONSTRAINT_WEIGHT')
    high = sum(c.cw >= 2 for c in items)
    if batch == 1 and (high > 2 or high == len(items)):
        reasons.append('REJECT_HIGH_CONSTRAINT_DENSITY')
    if batch == 3 and sum(c.cw == 3 for c in items) > 2:
        reasons.append('REJECT_HIGH_CONSTRAINT_DENSITY')
    return reasons

def difficulty_qa(batch, items, near_ratio, distinct, ambiguity):
    reasons = []; warnings = []
    cw = sum(c.cw for c in items)
    if batch in (2,3) and near_ratio < .03 and distinct < 2: reasons.append('REJECT_TOO_NARROW')
    if batch == 3 and cw < 6 and near_ratio > .30 and ambiguity == 'LOW': reasons.append('REJECT_TOO_EASY')
    cfg = T['difficulty']['batches'][batch-1]
    if not cfg['targetCW'][0] <= cw <= cfg['targetCW'][1]: warnings.append('WARN_CW_TARGET')
    if not cfg['nearOptimalRatioTarget'][0] <= near_ratio <= cfg['nearOptimalRatioTarget'][1]: warnings.append('WARN_NEAR_OPTIMAL_TARGET')
    if ambiguity not in cfg['weightComplexity']: warnings.append('WARN_WEIGHT_COMPLEXITY')
    high = sum(c.cw >= 2 for c in items)
    if batch == 2 and not 2 <= high <= 3: warnings.append('WARN_HIGH_CONSTRAINT_TARGET')
    if batch == 3 and not 2 <= high <= 4: warnings.append('WARN_HIGH_CONSTRAINT_TARGET')
    if batch == 3 and sum(c.cw <= 1 for c in items) < 2: warnings.append('WARN_FLEXIBLE_CARGO_TARGET')
    if batch in (2,3) and distinct < 2: warnings.append('WARN_DISTINCT_TARGET')
    return reasons,warnings

@dataclass
class Board:
    batch: int
    items: tuple
    left: tuple
    right: tuple
    reference_ratio: float
    metrics: dict

    def evidence(self):
        return {'batch':self.batch, 'cargo': [{'instance':c.instance,'kind':c.kind} for c in self.items],
                'referenceSolution': {'left':[c.instance for c in self.left], 'right':[c.instance for c in self.right]},
                'referencePhysicalBalanceRatio':self.reference_ratio, **self.metrics,
                'referenceDebug':evaluateLayout(self.left,self.right,self.reference_ratio,expected=self.items,debug=True)}

def analyze_board(batch, items, recent=()):
    items = tuple(items)
    reasons = composition_qa(batch, items)
    if reasons: return None, reasons
    ref, qcount, fail_counts = select_reference(feasible_layouts(items))
    if ref is None:
        # No invented primary-reason priority; retain all observed failures as diagnostics.
        return None, ['REJECT_REFERENCE_NOT_FOUND', *sorted(fail_counts)]
    left,right,rs = ref; ratio = rs.physicalBalanceRatio
    values = []; best = -1
    for a,b in feasible_layouts(items):
        s = evaluateLayout(a,b,ratio)
        best = max(best,s.LayoutScore)
        values.append((a,b,s.LayoutScore))
    near = [(a,b) for a,b,l in values if l >= best-T['difficulty']['nearOptimalDelta']]
    distinct = len({strategy_signature(a,b) for a,b in near})
    near_ratio = len(near)/len(values)
    ambiguity = partition_ambiguity(items)
    reasons,warnings = difficulty_qa(batch,items,near_ratio,distinct,ambiguity['weightPartitionAmbiguity'])
    sig = serialize_signature(strategy_signature(left,right))
    for prior in recent:
        if sig == prior.metrics['decisionPatternSignature']: reasons.append('REJECT_DUPLICATE_DECISION_PATTERN')
        # Unquantified "high overlap/similar" is telemetry of exact counts, no invented threshold.
        if {c.kind for c in items} & {c.kind for c in prior.items}: warnings.append('WARN_REPEAT_CARGO')
        if {c.archetype for c in items} & {c.archetype for c in prior.items}: warnings.append('WARN_REPEAT_ARCHETYPE')
        if sorted(c.weight for c in items) == sorted(c.weight for c in prior.items): warnings.append('WARN_REPEAT_WEIGHT_PATTERN')
    if reasons: return None,sorted(set(reasons))
    metrics = {'referenceStackingScore':rs.StackingScore,'referenceLayoutScore':rs.LayoutScore,
        'qualifiedReferenceCount':qcount,'allFeasibleLayoutCount':len(values),
        'nearOptimalLayoutCount':len(near),'nearOptimalRatio':near_ratio,
        'distinctNearOptimalSolutions':distinct,'bestFeasibleLayoutScore':best,
        'decisionPatternSignature':sig,'constraintWeight':sum(c.cw for c in items),
        'boundary':ratio < T['referenceQA']['preferredPhysicalTarget'],**ambiguity,
        'warnings':sorted(set(warnings)), 'qaStatus':'ACCEPT_WITH_WARNING' if warnings else 'ACCEPT',
        'repeatTelemetry':[{'batch':p.batch,'sharedCargoKinds':len({c.kind for c in items}&{c.kind for c in p.items}),
                            'sharedArchetypes':len({c.archetype for c in items}&{c.archetype for c in p.items})} for p in recent]}
    return Board(batch,items,left,right,ratio,metrics),[]

def generate_board(batch, sampler, *, seed, recent=()):
    """sampler(attempt) is REQUIRED. No default production probabilities/policy."""
    if len(recent) > batch-1 or any(p.batch >= batch for p in recent): raise ValueError('invalid current-run history')
    counts = Counter(); attempts = []
    for attempt in range(1,201):
        items = tuple(sampler(attempt))
        board, reasons = analyze_board(batch, items, recent)
        attempts.append({'attempt':attempt,'cargo':[c.kind for c in items], 'rejectReasons':reasons})
        if board:
            board.metrics.update({'generationAttempts':attempt,'seed':seed,'rejectReasonHistory':attempts[:-1],
                                  'rejectReasonDistribution':dict(counts)})
            return board, {'status':board.metrics['qaStatus'],'attemptCount':attempt,'attempts':attempts,'rejectReasonDistribution':dict(counts)}
        counts.update(reasons)
    return None, {'status':'GENERATION_EXHAUSTED','batch':batch,'seed':seed,'attemptCount':200,
                  'rejectReasonDistribution':dict(counts),'attempts':attempts}
