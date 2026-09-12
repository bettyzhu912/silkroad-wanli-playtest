"""P1 adapter tests use explicit injected monotonic time, never change P0."""
import sys,json,time,unittest,hashlib,urllib.request,http.cookiejar
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from server import Game
from core import evaluateLayout
from generator import feasible_layouts
class Clock:
 def __init__(self):self.t=100.
 def __call__(self):return self.t
 def step(self,n):self.t+=n
seedgame=Game();seedgame.prepare(0)
while 0 in seedgame.loading:time.sleep(.05)
BOARDS=seedgame.prepared[0]
class P1Tests(unittest.TestCase):
 def setup_game(self,seconds=75,mode='FORMAL'):
  self.c=Clock();self.g=Game(self.c);self.g.prepared[0]=BOARDS;self.g.action({'op':'start','mode':mode,'seconds':seconds,'index':0});return self.g
 def advance(self,n):self.c.step(n);return self.g.snapshot()
 def place(self,pair=None):
  s=self.g.session
  if pair is None:pair=(s.board.left,s.board.right)
  for side,items in zip(('left','right'),pair):
   for c in items:self.g.action({'op':'insert','id':c.instance,'side':side})
 def complete(self):
  self.place();self.g.action({'op':'submit'});self.advance(.91);self.advance(.81);self.advance(.51)
 def test_75_three_batches(self):
  g=self.setup_game(75)
  for i in range(3):self.advance(7);self.complete()
  self.assertEqual(g.state,'SETTLEMENT');self.assertEqual(g.session.remaining,54);self.assertEqual(g.session.result['cashDelta'],22)
 def test_90_three_batches(self):
  g=self.setup_game(90)
  for i in range(3):self.advance(9);self.complete()
  self.assertEqual(g.state,'SETTLEMENT');self.assertEqual(g.session.remaining,63)
 def test_not_pass_rework(self):
  g=self.setup_game();b=g.session.board
  bad=next((a,z) for a,z in feasible_layouts(b.items) if not evaluateLayout(a,z,b.reference_ratio).passed)
  self.place(bad);g.action({'op':'submit'});self.advance(.91);self.assertEqual(g.feedback,'NOT_PASS');self.advance(.81)
  self.assertEqual(g.state,'GAMEPLAY');self.assertEqual(len(g.session.results),0)
  for side in ('left','right'):
   for c in list(getattr(g.session,side))[::-1]:g.action({'op':'remove','id':c.instance,'side':side})
  self.complete();self.assertEqual(g.session.batch,2)
 def test_timeout_zero(self):
  g=self.setup_game();self.advance(75);self.assertEqual(g.state,'TIMEOUT');self.advance(.71);self.assertEqual(g.session.result['cashDelta'],0)
 def test_timeout_after_b1(self):
  g=self.setup_game();self.complete();self.advance(75);self.advance(.71);self.assertEqual(g.session.result['primaryMetrics']['completedBatchCount'],1);self.assertEqual(g.session.result['cashDelta'],12)
 def test_timeout_after_b2(self):
  g=self.setup_game();self.complete();self.complete();self.advance(75);self.advance(.71);self.assertEqual(g.session.result['primaryMetrics']['completedBatchCount'],2);self.assertEqual(g.session.result['cashDelta'],16)
 def test_trial_full_isolated(self):
  g=self.setup_game(mode='TRIAL');before=json.dumps(g.outer.state,sort_keys=True)
  for _ in range(3):self.complete()
  self.assertEqual(g.session.result['simulatedPayout'],22);self.assertEqual(g.session.result['cashDelta'],0);self.assertEqual(g.session.result['timeCostTicks'],0);self.assertEqual(json.dumps(g.outer.state,sort_keys=True),before)
 def test_abort_cancel_and_confirm(self):
  g=self.setup_game();self.complete();self.place();self.advance(5);before=g.session.remaining;layout=g.snapshot()['left'];g.action({'op':'abort'});self.advance(100)
  self.assertEqual(g.session.remaining,before);g.action({'op':'cancel_abort'});self.assertEqual(g.snapshot()['left'],layout)
  g.action({'op':'abort'});g.action({'op':'confirm_abort'});self.assertEqual(g.state,'LIVELIHOOD_LIST');self.assertEqual(g.session.result['completionStatus'],'ABORTED');self.assertEqual(g.outer.state['cash'],100)
 def test_waiting_fixed_and_top_only(self):
  g=self.setup_game();slots=list(g.session.original_slots)
  for id in slots[:2]:g.action({'op':'insert','id':id,'side':'left'})
  with self.assertRaises(ValueError):g.action({'op':'remove','id':slots[0],'side':'left'})
  g.action({'op':'remove','id':slots[1],'side':'left'});self.assertEqual(g.snapshot()['slots'],slots);self.assertIn(slots[1],g.snapshot()['waiting'])
 def test_submit_manual_locked_no_double(self):
  g=self.setup_game()
  with self.assertRaises(ValueError):g.action({'op':'submit'})
  self.place();self.assertEqual(g.state,'GAMEPLAY');g.action({'op':'submit'});remaining=g.session.remaining
  for a in [{'op':'submit'},{'op':'abort'},{'op':'remove','id':g.session.left[-1].instance,'side':'left'}]:
   with self.assertRaises(ValueError):g.action(a)
  self.advance(.5);self.assertEqual(g.session.remaining,remaining);self.advance(.5);self.advance(.9);self.advance(.6);self.assertEqual(len(g.session.results),1)
 def test_submit_timeout_race_pass(self):
  g=self.setup_game();self.place();g.action({'op':'submit'});g.session.timeout_event();self.advance(1);self.advance(1)
  self.assertEqual(g.state,'SETTLEMENT');self.assertEqual(g.session.result['primaryMetrics']['completedBatchCount'],1)
 def test_submit_timeout_race_not_pass(self):
  g=self.setup_game();b=g.session.board;bad=next((a,z) for a,z in feasible_layouts(b.items) if not evaluateLayout(a,z,b.reference_ratio).passed)
  self.place(bad);g.action({'op':'submit'});g.session.timeout_event();self.advance(1);self.advance(1);self.assertEqual(g.state,'SETTLEMENT');self.assertEqual(g.session.result['cashDelta'],0)
 def test_timeout_no_auto_submit(self):
  g=self.setup_game();self.place();self.advance(75);self.advance(1);self.assertEqual(g.session.result['cashDelta'],0)
 def test_debug_on_off(self):
  g=self.setup_game();self.assertNotIn('debug',g.snapshot());g.action({'op':'debug','enabled':True});d=g.snapshot()['debug']
  for k in ['leftWeight','rightWeight','physicalBalanceRatio','referenceBestPhysicalRatio','BalanceScore','StackingScore','LayoutScore','cargoWeights','constraintWeight','nearOptimalRatio','referenceSolution','generationAttempts','rejectReasonHistory']:self.assertIn(k,d)
  self.assertIsNone(d['BalanceScore']);g.action({'op':'debug','enabled':False});self.assertNotIn('debug',g.snapshot())
 def test_navigation_idempotent(self):
  g=self.setup_game();self.complete();self.advance(75);self.advance(1);state=json.dumps(g.outer.state,sort_keys=True);g.action({'op':'navigate','destination':'CITY'});self.assertEqual(json.dumps(g.outer.state,sort_keys=True),state);g.action({'op':'livelihood'});g.action({'op':'ready'});self.assertEqual(g.state,'READY')
 def test_how_and_ready_close_no_record(self):
  g=Game();g.action({'op':'how'});self.assertEqual(g.state,'HOW_TO_PLAY');g.action({'op':'ready'});g.action({'op':'close'});self.assertIsNone(g.session);self.assertEqual(g.state,'LIVELIHOOD_LIST')
 def test_source_hashes_unchanged(self):
  v=ROOT/'vendor/p0';manifest=json.loads((v/'reference/manifest.json').read_text())
  for row in manifest['files']:
   if row['path'].startswith(('src/','authority/','tests/')) and (v/row['path']).exists():self.assertEqual(hashlib.sha256((v/row['path']).read_bytes()).hexdigest(),row['sha256'])
 def test_http_cookie_keeps_session(self):
  jar=http.cookiejar.CookieJar();opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar));url='http://127.0.0.1:8765'
  def get():return json.loads(opener.open(url+'/api/state').read())
  def post(x):return json.loads(opener.open(urllib.request.Request(url+'/api/action',data=json.dumps(x).encode(),headers={'Content-Type':'application/json'})).read())
  get();post({'op':'how'});self.assertEqual(get()['state'],'HOW_TO_PLAY');self.assertEqual(len(list(jar)),1)
if __name__=='__main__':
 suite=unittest.defaultTestLoader.loadTestsFromTestCase(P1Tests);result=unittest.TextTestRunner(verbosity=2).run(suite)
 report={'status':'PASS' if result.wasSuccessful() else 'FAIL','executed':result.testsRun,'failures':[(str(t),e) for t,e in result.failures+result.errors],'scope':'P1 adapter; fake clock tests plus real HTTP cookie test; not visual/manual smoke'}
 (ROOT/'reports/P1_ADAPTER_TESTS.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));sys.exit(not result.wasSuccessful())
