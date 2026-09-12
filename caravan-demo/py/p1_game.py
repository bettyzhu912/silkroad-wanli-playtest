"""P1 presentation adapter for the browser (Pyodide) build.

Copied from the P1 package's server.py `Game` class. The only change is deployment-driven: board preparation runs
synchronously in the caller's thread (Pyodide has no OS threads) instead of a daemon thread. Frozen P0 modules are
imported unchanged; every rule, snapshot field and action name is identical to server.py.
"""
from pathlib import Path
import sys, json, time, uuid, threading
ROOT = Path(__file__).resolve().parent
sys.dont_write_bytecode = True
for p in (str(ROOT / 'vendor/p0/src'), str(ROOT / 'vendor/p0/tests')):
    if p not in sys.path: sys.path.insert(0, p)
from core import CATALOG, cargo, evaluateLayout
from generator import Board
from session import Session, MockOuter
from stress import one_run
ATTR = json.loads((ROOT / 'vendor/p0/authority/CARGO_DATA.json').read_text())['attributeLabels']

class Game:
    def __init__(self, clock=time.monotonic):
        self.clock=clock;self.lock=threading.RLock();self.state='READY';self.session=None
        self.prepared={};self.loading=set();self.errors={};self.debug=False;self.outer=MockOuter()
        self.last=clock();self.deadline=None;self.feedback=None;self.events=[]
    def prepare(self,index):
        if not isinstance(index,int) or not 0<=index<500:raise ValueError('测试题组应在0–499之间')
        if index in self.prepared or index in self.loading:return
        # Deployment change: synchronous preparation (the web worker hosting Pyodide is the background thread).
        self.loading.add(index)
        try:
            rows=one_run(index);boards=[]
            for row in rows:
                if row['status']!='ACCEPTED' or row['validationErrors']:raise ValueError('GENERATION_EXHAUSTED / QA rejected')
                e=row['board'];items=tuple(cargo(c['kind'],c['instance']) for c in e['cargo']);ids={c.instance:c for c in items}
                boards.append(Board(e['batch'],items,tuple(ids[i] for i in e['referenceSolution']['left']),tuple(ids[i] for i in e['referenceSolution']['right']),e['referencePhysicalBalanceRatio'],e))
            if len(boards)!=3:raise ValueError('GENERATION_EXHAUSTED')
            self.prepared[index]=boards
        except Exception as e:
            self.errors[index]=str(e)
        finally:
            self.loading.discard(index)
    def sync(self):
        now=self.clock();dt=max(0,now-self.last);self.last=now;s=self.session
        if not s:return
        if self.state=='GAMEPLAY':
            s.tick(dt)
            if s.state=='SETTLEMENT':self.state='TIMEOUT';self.deadline=now+.7
        elif self.state=='EVALUATING' and now>=self.deadline:
            score=s.resolve_submission();self.feedback='PASS' if score.passed else 'NOT_PASS';self.state='FEEDBACK';self.deadline=now+.8
        elif self.state=='FEEDBACK' and now>=self.deadline:
            if s.state=='TRANSITION':self.state='TRANSITION';self.deadline=now+.5
            elif s.state=='SETTLEMENT':self.state='SETTLEMENT';self.outer.apply(s.result)
            else:self.state='GAMEPLAY'
        elif self.state=='TRANSITION' and now>=self.deadline:
            s.finish_transition();self.state='GAMEPLAY';self.feedback=None
        elif self.state=='TIMEOUT' and now>=self.deadline:
            self.state='SETTLEMENT';self.outer.apply(s.result)
    def action(self,a):
        with self.lock:
            self.sync();op=a['op'];s=self.session
            if op=='prepare':self.prepare(a['index'])
            elif op=='debug':self.debug=bool(a['enabled'])
            elif op=='how' and self.state=='READY':self.state='HOW_TO_PLAY'
            elif op=='ready' and self.state in ('HOW_TO_PLAY','LIVELIHOOD_LIST'):self.state='READY'
            elif op=='livelihood' and self.state=='CITY':self.state='LIVELIHOOD_LIST'
            elif op=='start' and self.state=='READY':
                boards=self.prepared.get(a['index'])
                if not boards:raise ValueError(self.errors.get(a['index'],'题目尚未准备完成'))
                self.session=Session(lambda b:boards[b-1],mode=a['mode'],timerConfig=a['seconds'],phase='晨',jobId='P1_STANDALONE',runId=str(uuid.uuid4()))
                self.state='GAMEPLAY';self.feedback=None
            elif op in ('insert','remove','submit','abort') and self.state=='GAMEPLAY':
                if op=='insert':s.insert(a['id'],a['side'])
                elif op=='remove':s.remove(a['id'],a['side'])
                elif op=='abort':s.request_abort();self.state='ABORT_CONFIRM'
                else:s.submit();self.state='EVALUATING';self.deadline=self.clock()+.9
            elif op=='cancel_abort' and self.state=='ABORT_CONFIRM':s.cancel_abort();self.state='GAMEPLAY'
            elif op=='confirm_abort' and self.state=='ABORT_CONFIRM':s.confirm_abort();self.outer.apply(s.result);self.state='LIVELIHOOD_LIST'
            elif op=='close' and self.state in ('READY','HOW_TO_PLAY'):self.state='LIVELIHOOD_LIST'
            elif op=='navigate' and self.state=='SETTLEMENT':self.state=s.navigate(a['destination'])
            else:raise ValueError('当前暂不可操作')
            self.last=self.clock();self.events.append({'op':op,'state':self.state,'time':self.last})
            return self.snapshot()
    def snapshot(self):
        with self.lock:
            self.sync();s=self.session
            d={'state':self.state,'debugEnabled':self.debug,'prepared':list(self.prepared),'loading':list(self.loading),'errors':self.errors,'feedback':self.feedback}
            if s:
                ev=evaluateLayout(s.left,s.right,s.board.reference_ratio,debug=True)
                lw=sum(c.weight for c in s.left);rw=sum(c.weight for c in s.right)
                ratio=ev['physicalBalanceRatio']
                # Only presentation uses the physical ratio. Null is unscored, never a substitute score.
                d.update({'lastTier':s.last_evaluation.performanceTier if s.last_evaluation else None,'batch':s.batch,'mode':s.mode,'remaining':s.remaining,'left':[c.instance for c in s.left],'right':[c.instance for c in s.right],
                    'slots':list(s.original_slots),'waiting':list(s.waiting),'canSubmit':self.state=='GAMEPLAY' and s.can_submit,
                    'cargo':{c.instance:{'name':CATALOG[c.kind]['name'],'kind':c.kind,'weightLabel':CATALOG[c.kind]['weightLabel'],'attributes':[ATTR[t] for t in c.attributes]} for c in s.board.items},
                    'balance':{'ratio':ratio,'direction':-1 if lw>rw else 1 if rw>lw else 0,'band':'empty' if ratio is None else 'green' if ratio>=.85 else 'yellow' if ratio>=.80 else 'red'},
                    'warnings':[r['instance'] for rows in ev.get('penaltySources',{}).values() for r in rows if any(v>0 for k,v in r['components'].items() if k in ('heavyLayer','pressure','fragileHeavyAbove'))]})
                if self.state=='SETTLEMENT':
                    r=s.result;d['settlement']={'completed':r['primaryMetrics']['completedBatchCount'],'tiers':[x['performanceTier'] for x in s.results],
                        'base':r['payoutBreakdown']['baseWage'],'extra':r['payoutBreakdown']['extraWage'],'cash':r['simulatedPayout'] if s.mode=='TRIAL' else r['cashDelta']}
                if self.debug:
                    dbg=s.debug();dbg.update({'leftWeight':lw,'rightWeight':rw,'cargoWeights':{c.instance:c.weight for c in s.board.items},'constraintWeight':s.board.metrics['constraintWeight'],'referenceBestPhysicalRatio':s.board.reference_ratio,'result':s.result,'mockOuter':self.outer.state,'clockAdapter':'monotonic operable seconds -> unchanged P0 tick','testRunIndex':s.board.metrics.get('seed')})
                    d['debug']=dbg
            return d
