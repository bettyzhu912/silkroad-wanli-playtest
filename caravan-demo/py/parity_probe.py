"""Deterministic fingerprint of generator output and a scripted session, used to prove native CPython == browser Pyodide."""
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent
for p in (str(ROOT), str(ROOT / 'vendor/p0/src'), str(ROOT / 'vendor/p0/tests')):
    if p not in sys.path: sys.path.insert(0, p)
from p1_game import Game
from core import evaluateLayout
from generator import feasible_layouts

class Clock:
    def __init__(self): self.t = 100.0
    def __call__(self): return self.t
    def step(self, n): self.t += n

def fingerprint(indices):
    out = {'python': sys.version.split()[0], 'runs': {}}
    for index in indices:
        g = Game(Clock()); g.prepare(index)
        boards = g.prepared.get(index)
        if not boards: out['runs'][str(index)] = {'error': g.errors.get(index)}; continue
        row = {'boards': []}
        for b in boards:
            m = b.metrics
            row['boards'].append({'batch': b.batch, 'cargo': [c.instance for c in b.items],
                'reference': {'left': [c.instance for c in b.left], 'right': [c.instance for c in b.right]},
                'referencePhysicalBalanceRatio': b.reference_ratio, 'referenceStackingScore': m['referenceStackingScore'],
                'referenceLayoutScore': m['referenceLayoutScore'], 'allFeasibleLayoutCount': m['allFeasibleLayoutCount'],
                'nearOptimalLayoutCount': m['nearOptimalLayoutCount'], 'distinctNearOptimalSolutions': m['distinctNearOptimalSolutions'],
                'bestFeasibleLayoutScore': m['bestFeasibleLayoutScore'], 'constraintWeight': m['constraintWeight'],
                'weightPartitionAmbiguity': m['weightPartitionAmbiguity'], 'boundary': m['boundary'], 'warnings': m['warnings'],
                'qaStatus': m['qaStatus'], 'generationAttempts': m['generationAttempts'], 'decisionPatternSignature': m['decisionPatternSignature']})
        # scripted FORMAL run: reference layout for B1, worst feasible layout then rework for B2, reference for B3
        c = g.clock; g.action({'op': 'start', 'mode': 'FORMAL', 'seconds': 75, 'index': index})
        def place(pair):
            for side, items in zip(('left', 'right'), pair):
                for it in items: g.action({'op': 'insert', 'id': it.instance, 'side': side})
        def settle_cycle():
            g.action({'op': 'submit'}); c.step(.91); g.snapshot(); c.step(.81); g.snapshot(); c.step(.51); g.snapshot()
        s = g.session; b = s.board; place((b.left, b.right)); c.step(3); settle_cycle()
        s = g.session; b = s.board
        bad = next(((a, z) for a, z in feasible_layouts(b.items) if not evaluateLayout(a, z, b.reference_ratio).passed), None)
        if bad:
            place(bad); c.step(2); g.action({'op': 'submit'}); c.step(.91); snap = g.snapshot(); row['b2FirstFeedback'] = g.feedback; c.step(.81); g.snapshot()
            for side in ('left', 'right'):
                for it in list(getattr(g.session, side))[::-1]: g.action({'op': 'remove', 'id': it.instance, 'side': side})
        place((b.left, b.right)); c.step(2); settle_cycle()
        s = g.session; b = s.board; place((b.left, b.right)); c.step(4); settle_cycle()
        snap = g.snapshot(); r = g.session.result
        row['final'] = {'state': g.state, 'remaining': g.session.remaining, 'completed': r['primaryMetrics']['completedBatchCount'],
            'tiers': [x['performanceTier'] for x in g.session.results], 'cashDelta': r['cashDelta'], 'timeCostTicks': r['timeCostTicks'],
            'payout': r['payoutBreakdown'], 'scores': r['secondaryMetrics'], 'mockOuter': g.outer.state}
        out['runs'][str(index)] = row
    return out
