"""JSON bridge between the web worker and the unchanged P1 Game adapter (replaces the HTTP layer of server.py)."""
import json, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path: sys.path.insert(0, str(ROOT))
from p1_game import Game
import time
_OFFSET = 0.0
def _clock(): return time.monotonic() + _OFFSET
GAME = Game(_clock)
def _dump(x): return json.dumps(x, ensure_ascii=False, allow_nan=False)
def state(): return _dump(GAME.snapshot())
def action(payload_json):
    try: return _dump({'ok': True, 'data': GAME.action(json.loads(payload_json))})
    except (ValueError, KeyError, TypeError) as e: return _dump({'ok': False, 'error': str(e)})
def reset():
    global GAME, _OFFSET; _OFFSET = 0.0; GAME = Game(_clock); return state()
def advance(seconds):
    """Test/debug hook: moves the standalone build's mock clock forward (never touches P0 logic or any real state)."""
    global _OFFSET; _OFFSET += float(seconds); return state()
def parity(indices_json):
    """Deployment parity probe: same fingerprint is computed natively (tests/parity_native.py) and in the browser."""
    import parity_probe
    return _dump(parity_probe.fingerprint(json.loads(indices_json)))
def worst_layout():
    """Test hook: a feasible NOT-PASS layout for the current board (same helper the P1 adapter tests use)."""
    from core import evaluateLayout
    from generator import feasible_layouts
    s = GAME.session
    if not s: return _dump(None)
    b = s.board
    bad = next(((a, z) for a, z in feasible_layouts(b.items) if not evaluateLayout(a, z, b.reference_ratio).passed), None)
    return _dump(None if bad is None else {'left': [c.instance for c in bad[0]], 'right': [c.instance for c in bad[1]]})
