"""Standalone P1 presentation adapter. Frozen P0 modules are imported unchanged."""
from pathlib import Path
import sys, json, time, uuid, threading, argparse, webbrowser
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse
ROOT=Path(__file__).resolve().parent
sys.dont_write_bytecode=True
sys.path[:0]=[str(ROOT/'vendor/p0/src'),str(ROOT/'vendor/p0/tests')]
from core import CATALOG, cargo, evaluateLayout
from generator import Board
from session import Session, MockOuter
from stress import one_run
ATTR=json.loads((ROOT/'vendor/p0/authority/CARGO_DATA.json').read_text())['attributeLabels']

class Game:
    def __init__(self, clock=time.monotonic):
        self.clock=clock;self.lock=threading.RLock();self.state='READY';self.session=None
        self.prepared={};self.loading=set();self.errors={};self.debug=False;self.outer=MockOuter()
        self.last=clock();self.deadline=None;self.feedback=None;self.events=[]
    def prepare(self,index):
        if not isinstance(index,int) or not 0<=index<500:raise ValueError('测试题组应在0–499之间')
        if index in self.prepared or index in self.loading:return
        self.loading.add(index)
        def worker():
            try:
                rows=one_run(index);boards=[]
                for row in rows:
                    if row['status']!='ACCEPTED' or row['validationErrors']:raise ValueError('GENERATION_EXHAUSTED / QA rejected')
                    e=row['board'];items=tuple(cargo(c['kind'],c['instance']) for c in e['cargo']);ids={c.instance:c for c in items}
                    boards.append(Board(e['batch'],items,tuple(ids[i] for i in e['referenceSolution']['left']),tuple(ids[i] for i in e['referenceSolution']['right']),e['referencePhysicalBalanceRatio'],e))
                if len(boards)!=3:raise ValueError('GENERATION_EXHAUSTED')
                with self.lock:self.prepared[index]=boards
            except Exception as e:
                with self.lock:self.errors[index]=str(e)
            finally:
                with self.lock:self.loading.discard(index)
        threading.Thread(target=worker,daemon=True).start()
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

GAMES={};GLOCK=threading.Lock()
class Handler(BaseHTTPRequestHandler):
    def log_message(self,*a):pass
    def game(self):
        cookie=self.headers.get('Cookie','');sid=next((x.strip()[3:] for x in cookie.split(';') if x.strip().startswith('p1=')),None)
        with GLOCK:
            if sid not in GAMES:sid=uuid.uuid4().hex;GAMES[sid]=Game()
        return sid,GAMES[sid]
    def send(self,status,data,typ='application/json',sid=None):
        body=json.dumps(data,ensure_ascii=False,allow_nan=False).encode() if typ=='application/json' else data
        self.send_response(status);self.send_header('Content-Type',typ+'; charset=utf-8');self.send_header('Content-Length',str(len(body)));self.send_header('Cache-Control','no-store')
        if sid:self.send_header('Set-Cookie',f'p1={sid}; HttpOnly; SameSite=Strict; Path=/')
        self.end_headers();self.wfile.write(body)
    def do_GET(self):
        p=urlparse(self.path).path
        if p=='/api/state':
            sid,g=self.game();return self.send(200,g.snapshot(),sid=sid)
        files={'/':('index.html','text/html'),'/app.js':('app.js','text/javascript'),'/style.css':('style.css','text/css'),'/assets/camel.png':('assets/camel.png','image/png')}
        if p not in files:return self.send(404,{'error':'Not found'})
        name,typ=files[p];f=ROOT/'web'/name
        if not f.exists():return self.send(404,{'error':'Asset unavailable'})
        self.send(200,f.read_bytes(),typ)
    def do_POST(self):
        # Only same-origin local browser requests are accepted.
        origin=self.headers.get('Origin');host=self.headers.get('Host')
        if origin and origin!=f'http://{host}':return self.send(403,{'error':'Origin rejected'})
        if self.path!='/api/action':return self.send(404,{'error':'Not found'})
        sid,g=self.game()
        try:
            n=int(self.headers.get('Content-Length','0'))
            if not 0<n<8192:raise ValueError('Invalid request size')
            self.send(200,g.action(json.loads(self.rfile.read(n))),sid=sid)
        except (ValueError,KeyError,TypeError) as e:self.send(400,{'error':str(e)},sid=sid)
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--port',type=int,default=8765);p.add_argument('--open',action='store_true');a=p.parse_args()
    http=ThreadingHTTPServer(('127.0.0.1',a.port),Handler);url=f'http://127.0.0.1:{http.server_port}'
    print(f'驼队装货 P1: {url}',flush=True)
    if a.open:threading.Timer(.5,lambda:webbrowser.open(url)).start()
    http.serve_forever()
