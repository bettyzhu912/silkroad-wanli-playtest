"""P0 pure scoring. All consumers call evaluateLayout; no UI or external writes."""
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import NamedTuple
import json, math

ROOT = Path(__file__).resolve().parents[1]
CONFIG = json.loads((ROOT / 'authority/PROTOTYPE_CONFIG.json').read_text())
F = CONFIG['FROZEN_FOR_PROTOTYPE']
T = CONFIG['PLAYTEST_TUNABLE']

@dataclass(frozen=True)
class Cargo:
    instance: str
    kind: str
    weight: int
    attributes: tuple
    archetype: str
    cw: float

CATALOG = {c['id']: c for c in json.loads((ROOT / 'authority/CARGO_DATA.json').read_text())['cargo']}

def cargo(kind, instance=None):
    c = CATALOG[kind]
    return Cargo(instance or kind, kind, c['weight'], tuple(c['attributes']), c['archetype'], c['constraintWeight'])

def physical_ratio(left, right):
    if left < 0 or right < 0 or not math.isfinite(left + right):
        raise ValueError('invalid weight')
    return min(left, right) / max(left, right) if max(left, right) else None

class Score(NamedTuple):
    physicalBalanceRatio: float
    BalanceScore: float
    StackingScore: float
    LayoutScore: float
    passed: bool
    performanceTier: str | None

def classify(balance, stacking):
    """Also exposes score-boundary unit tests; no rounding before comparisons."""
    if not all(math.isfinite(v) and 0 <= v <= 100 for v in (balance, stacking)):
        raise ValueError('invalid score')
    layout = T['layoutWeights']['balance'] * balance + T['layoutWeights']['stacking'] * stacking
    p = T['pass']
    passed = layout >= p['layoutMin'] and balance >= p['balanceMin'] and stacking >= p['stackingMin']
    tier = None
    if passed:
        tier = ('RICH' if layout >= T['performance']['richLayoutMin'] and
                balance >= F['scoringArchitecture']['richBalanceMin'] and
                stacking >= F['scoringArchitecture']['richStackingMin'] else
                'MODEST' if layout < T['performance']['normalLayoutMin'] else 'NORMAL')
    return layout, passed, tier

def item_penalty(c, layer, above):
    st = T['stacking']; parts = {}
    weight_above = sum(x.weight for x in above)
    if c.weight == 5:
        parts['heavyLayer'] = st['heavyLayerPenalties'][layer - 1]
    if 'PRESSURE_SENSITIVE' in c.attributes and 'DURABLE' not in c.attributes:
        parts['pressure'] = next(b['penalty'] for b in st['pressureBands']
            if weight_above >= b['minAbove'] and (b['maxAbove'] is None or weight_above <= b['maxAbove']))
    if 'FRAGILE' in c.attributes:
        parts['fragileLayer'] = st['fragileLayerPenalties'][layer - 1]
        parts['fragileHeavyAbove'] = st['fragileAnyHeavyAbovePenalty'] if any(x.weight == 5 for x in above) else 0
    if 'SOFT' in c.attributes:
        parts['soft'] = st['softPenalty'] if weight_above >= st['softAboveThreshold'] else 0
    raw = sum(parts.values())
    return {'instance': c.instance, 'layer': layer, 'weightAbove': weight_above,
            'components': parts, 'rawPenalty': raw, 'penalty': min(st['maxPenaltyPerCargo'], raw)}

@lru_cache(maxsize=30000)
def bag_summary(bag):
    return sum(c.weight for c in bag), sum(item_penalty(c, i+1, bag[i+1:])['penalty'] for i,c in enumerate(bag))

def validate_layout(left, right, expected=None):
    if len(left) > 4 or len(right) > 4 or any(not isinstance(c, Cargo) for c in (*left, *right)):
        raise ValueError('REJECT_FEASIBILITY')
    ids = [c.instance for c in (*left, *right)]
    if len(ids) != len(set(ids)):
        raise ValueError('REJECT_FEASIBILITY')
    if expected is not None and sorted(ids) != sorted(c.instance for c in expected):
        raise ValueError('REJECT_INCOMPLETE_LAYOUT')

def evaluateLayout(left, right, referenceBestPhysicalRatio, *, expected=None, debug=False):
    """Nonempty partial layouts may be inspected; submission enforces expected.
    Empty layout produces an explicit unscored diagnostic, never a formal score.
    """
    left, right = tuple(left), tuple(right)
    validate_layout(left, right, expected)
    lw, lp = bag_summary(left); rw, rp = bag_summary(right)
    ratio = physical_ratio(lw, rw)
    if ratio is None:
        return {'state': 'EMPTY_UNSCORED', 'physicalBalanceRatio': None, 'BalanceScore': None,
                'StackingScore': None, 'LayoutScore': None, 'passed': False, 'performanceTier': None}
    if not math.isfinite(referenceBestPhysicalRatio) or not 0 < referenceBestPhysicalRatio <= 1:
        raise ValueError('invalid reference denominator')
    balance = min(100., 100 * ratio / referenceBestPhysicalRatio)
    stacking = max(0, 100 - lp - rp)
    layout, passed, tier = classify(balance, stacking)
    score = Score(ratio, balance, stacking, layout, passed, tier)
    if not debug:
        return score
    return {**score._asdict(), 'leftWeight': lw, 'rightWeight': rw,
            'cargoWeights': [c.weight for c in (*left,*right)],
            'constraintWeight': sum(c.cw for c in (*left,*right)),
            'referenceBestPhysicalRatio': referenceBestPhysicalRatio,
            'penaltySources': {s: [item_penalty(c,i+1,b[i+1:]) for i,c in enumerate(b)]
                               for s,b in [('left',left),('right',right)]},
            'warnings': ['WARN_PLAYER_EXCEEDS_REFERENCE_PHYSICAL_RATIO'] if ratio > referenceBestPhysicalRatio else []}

def canonical_layout(left, right):
    pair = (tuple(c.instance for c in left), tuple(c.instance for c in right))
    return min(pair, pair[::-1])

def strategy_signature(left, right):
    """Closure §§9–11: normalized totals + relative archetype categories.
    Archetypes within each LOW/HIGH category are multisets, not art or names.
    """
    all_cargo = (*left,*right)
    def side(b):
        return (sum(c.weight for c in b), tuple(sorted(c.archetype for c in b[:2])),
                tuple(sorted(c.archetype for c in b[2:])))
    pair = (side(left), side(right))
    return (len(all_cargo), tuple(sorted(c.weight for c in all_cargo)),
            tuple(sorted(c.archetype for c in all_cargo)), sum(c.cw >= 2 for c in all_cargo),
            sum(c.archetype == 'HEAVY_DURABLE' for c in all_cargo),
            sum(c.archetype == 'HEAVY_FRAGILE' for c in all_cargo),
            sum('PRESSURE_SENSITIVE' in c.attributes for c in all_cargo),
            sum('SOFT' in c.attributes for c in all_cargo), min(pair, pair[::-1]))

def serialize_signature(s):
    return json.dumps(s, ensure_ascii=False, separators=(',',':'))
