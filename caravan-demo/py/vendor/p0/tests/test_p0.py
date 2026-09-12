"""Traceable test plan runner. Visual P1 assertions are NOT_RUN, never synthetic PASS."""
import sys,json,time,traceback,re,math,hashlib
from pathlib import Path
from functools import lru_cache
from itertools import permutations,product
from fractions import Fraction
from copy import deepcopy
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'src'))
from core import *
from generator import *
from session import *

TESTS={}; EVIDENCE={}
def test(ids,layer='UNIT'):
    def wrap(fn):
        for id in ids.split():
            assert id not in TESTS,id
            TESTS[id]=(fn,layer)
        return fn
    return wrap
def check(value,message='assertion failed'):
    if not value: raise AssertionError(message)
def raises(fn,text=None):
    try: fn()
    except ValueError as e:
        if text: check(text in str(e),str(e))
        return
    raise AssertionError('expected ValueError')
def syn(name,w=1,attrs=()):return Cargo(name,'SYNTHETIC',w,tuple(attrs),'SYNTHETIC',0)
def part(c,layer=1,above=()):return item_penalty(c,layer,tuple(above))

@lru_cache(None)
def boards():
    definitions=[['ceramics','silverware','pepper','silk'],
       ['ceramics','silverware','pepper','silk','paper','dye'],
       ['khotan_jade','paper','ceramics','silk','pepper','hexi_wool','dye','lacquerware']]
    output=[]
    for i,kinds in enumerate(definitions,1):
        b,reasons=analyze_board(i,tuple(cargo(k) for k in kinds),output)
        check(b is not None,str(reasons));output.append(b)
    return tuple(output)
def session(mode='FORMAL',seconds=75):
    return Session(lambda b:boards()[b-1],mode=mode,timerConfig=seconds)
def load_reference(s):
    for side in ('left','right'):
        for c in getattr(s.board,side):s.insert(c.instance,side)
def complete(s,n):
    for i in range(n):
        load_reference(s);s.submit();check(s.resolve_submission().passed)
        if s.state=='TRANSITION':s.finish_transition()
    return s

@test('TEST-BAG-001 TEST-BAG-002','REAL_CARGO_STATE')
def bag_order():
    s=complete(session(),1)
    for id in ['silverware','paper','pepper']:s.insert(id,'left')
    check([x.instance for x in s.left]==['silverware','paper','pepper'])
@test('TEST-BAG-003','REAL_CARGO_STATE')
def capacity():
    s=complete(session(),1)
    for c in s.board.items[:4]:s.insert(c.instance,'left')
    before=list(s.left);raises(lambda:s.insert(s.board.items[4].instance,'left'),'已满');check(s.left==before)
@test('TEST-BAG-004 TEST-BAG-005','REAL_CARGO_STATE')
def top_only():
    s=complete(session(),1)
    for k in ['silverware','pepper','paper']:s.insert(k,'left')
    raises(lambda:s.remove('silverware','left'),'先取出上层货物')
    raises(lambda:s.remove('pepper','left'),'先取出上层货物')
    original=s.original_slots;s.remove('paper','left');check('paper' in s.waiting)
    s.insert('ceramics','left');check(s.left[2].kind=='ceramics');check(s.original_slots==original)

for i,expected in enumerate([0,5,12,20],1):
    @test(f'TEST-STK-{i:03d}','REAL_CARGO_COMPONENT')
    def heavy(layer=i,p=expected):check(part(cargo('silverware'),layer)['components']['heavyLayer']==p)
for i,(weights,expected) in enumerate([([1],0),([3],8),([5],18),([3,5],28),([3,3,3],38)],5):
    @test(f'TEST-STK-{i:03d}','SYNTHETIC_COMPONENT_WEIGHTS')
    def pressure(ws=weights,p=expected):check(part(cargo('paper'),above=[syn(str(j),w) for j,w in enumerate(ws)])['components']['pressure']==p)
for i,expected in enumerate([0,0,6,12],10):
    @test(f'TEST-STK-{i:03d}','REAL_CARGO_COMPONENT')
    def fragile(layer=i-9,p=expected):check(part(cargo('ceramics'),layer)['components']['fragileLayer']==p)
@test('TEST-STK-014 MERGE-STK-005','REAL_CARGO_COMPONENT')
def heavy_above():
    for above in [(cargo('silverware'),),(cargo('silverware'),cargo('khotan_jade'))]:
        check(part(cargo('lacquerware'),above=above)['components']['fragileHeavyAbove']==10)
@test('TEST-STK-015 TEST-STK-016 MERGE-STK-004','SYNTHETIC_COMPONENT_WEIGHTS')
def soft():
    for w,p in [(7,0),(8,5)]:check(part(cargo('silk'),above=[syn('above',w)])['penalty']==p)
@test('TEST-STK-017','REAL_CARGO_COMPONENT')
def durable():
    x=part(cargo('silverware'),2,(cargo('khotan_jade'),))
    check(x['components']=={'heavyLayer':5})
@test('TEST-STK-018','REAL_CARGO_COMPONENT')
def normal():check(part(cargo('pepper'),3,(cargo('silverware'),))['penalty']==0)
@test('TEST-STK-019','SYNTHETIC_UNIT_FIXTURE')
def cap():
    x=syn('cap',5,['FRAGILE','PRESSURE_SENSITIVE'])
    left=(syn('bottom'),x,cargo('silverware'),cargo('khotan_jade'))
    d=evaluateLayout(left,(cargo('pepper'),),1,debug=True)
    p=d['penaltySources']['left'][1]
    check(p['rawPenalty']==53 and p['penalty']==40)
    check('SYNTHETIC' not in CATALOG)
@test('TEST-STK-020','REAL_CARGO_INSTANCE_FIXTURE')
def floor():
    kinds=['lacquerware','lacquerware','ceramics','ceramics']
    left=tuple(cargo(k,'l'+str(i)) for i,k in enumerate(kinds));right=tuple(cargo(k,'r'+str(i)) for i,k in enumerate(kinds))
    d=evaluateLayout(left,right,1,debug=True)
    check(sum(p['penalty'] for b in d['penaltySources'].values() for p in b)>100)
    check(d['StackingScore']==0)

for i,(l,r,expected) in enumerate([(10,10,1),(10,9,.9),(10,8,.8),(12,8,2/3)],1):
    @test(f'TEST-BAL-{i:03d}')
    def physical(l=l,r=r,p=expected):check(physical_ratio(l,r)==p)
@test('TEST-BAL-005','EVALUATOR_SYNTHETIC_WEIGHT_FIXTURE')
def best100():
    check(evaluateLayout((syn('l',10),),(syn('r',9),),.9).BalanceScore==100)
@test('TEST-BAL-006','EVALUATOR_SYNTHETIC_WEIGHT_FIXTURE')
def relative():check(math.isclose(evaluateLayout((syn('l',8),),(syn('r',11),),.9).BalanceScore,80.8080808080808))
@test('TEST-BAL-007','EVALUATOR_SYNTHETIC_WEIGHT_FIXTURE')
def balancecap():
    d=evaluateLayout((syn('l',10),),(syn('r',10),),.9,debug=True)
    check(d['BalanceScore']==100 and d['warnings']==['WARN_PLAYER_EXCEEDS_REFERENCE_PHYSICAL_RATIO'])

for i,(b,s,l) in enumerate([(100,100,100),(50,82,66),(100,67,83.5)],1):
    @test(f'TEST-SCORE-{i:03d}')
    def scores(b=b,s=s,l=l):check(classify(b,s)[0]==l)
@test('TEST-PASS-001')
def passed():check(classify(50,82)==(66,True,'MODEST'))
@test('TEST-PASS-002')
def subbalance():check(classify(39,100)[1] is False)
@test('TEST-PASS-003')
def substack():check(classify(100,39)[1] is False)
@test('TEST-PASS-004 MERGE-PASS-001')
def boundaries():
    check(classify(40,40)==(40,False,None))
    check(classify(40,70)==classify(70,40)==(55,True,'MODEST'))
for i,(b,s,tier) in enumerate([(60,60,'MODEST'),(70,70,'NORMAL'),(84.9,84.9,'NORMAL'),(85,95,'RICH'),(100,70,'NORMAL'),(79,100,'NORMAL'),(100,79,'NORMAL')],1):
    @test(f'TEST-TIER-{i:03d}')
    def tiers(b=b,s=s,t=tier):check(classify(b,s)[2]==t)
@test('MERGE-TIER-001')
def corrected():check(classify(79,100)==classify(100,79)==(89.5,True,'NORMAL'))

@test('TEST-GEN-001','REAL_BOARD_FIRST_LAYER')
def goodreference():
    b=boards()[0];d=evaluateLayout(b.left,b.right,b.reference_ratio)
    check(not first_layer_qa(d.physicalBalanceRatio,d.StackingScore,d.LayoutScore))
@test('TEST-GEN-002','QA_BRANCH_INJECTION')
def ratio_bad():check('REJECT_PHYSICAL_BALANCE' in first_layer_qa(8/12,95,97.5))
@test('TEST-GEN-003','QA_BRANCH_INJECTION')
def stack_bad():check('REJECT_STACKING_QUALITY' in first_layer_qa(1,70,85))
@test('TEST-GEN-004','UNREACHABLE_REFERENCE_QA_INJECTION_ONLY')
def layout_bad():check('REJECT_LAYOUT_QUALITY' in first_layer_qa(.8,80,84))
@test('TEST-GEN-005','SYNTHETIC_LAYOUT_SET_UNIT_NOT_GENERATOR_POOL')
def same_reference():
    # A: equal weights, severely bad stack; B: clean stack but physical imbalance.
    a=(syn('a',1,['PRESSURE_SENSITIVE']),syn('b',5),syn('c',5))
    b=(syn('d',1,['PRESSURE_SENSITIVE']),syn('e',5),syn('f',5))
    c=(syn('g',5),);d=(syn('h',1),)
    check(evaluateLayout(a,b,1).StackingScore<80)
    check(evaluateLayout(c,d,.2).StackingScore==100)
    selected,count,_=select_reference([(a,b),(c,d)])
    check(selected is None and count==0)
for i,(ratio,reject) in enumerate([(.79,True),(.8,False),(.83,False),(.85,False)],6):
    @test(f'TEST-GEN-{i:03d}','QA_BRANCH_INJECTION')
    def qaedge(r=ratio,reject=reject):check(('REJECT_PHYSICAL_BALANCE' in first_layer_qa(r,100,100))==reject)
@test('TEST-CW-001','REAL_CARGO_DATA')
def cw():
    check(sum(cargo(k).cw for k in ['ceramics','silverware','pepper','silk'])==4.5)
    check(len(CATALOG)==15 and {x['weight'] for x in CATALOG.values()}=={1,3,5})
    for k,v in {'pepper':0,'silk':.5,'hexi_wool':1,'paper':2,'lacquerware':2.5,'ceramics':3}.items():check(cargo(k).cw==v)
@test('TEST-DIFF-001','QA_BRANCH_REAL_CARGO')
def b1good():check(not composition_qa(1,boards()[0].items))
@test('TEST-DIFF-002','QA_BRANCH_REAL_CARGO')
def b1bad():check('REJECT_CONSTRAINT_WEIGHT' in composition_qa(1,tuple(cargo(k) for k in ['ceramics','lacquerware','paper','medicinal_herbs'])))
@test('TEST-DIFF-003','QA_BRANCH_INJECTION')
def easy():
    items=tuple(cargo('pepper',str(i)) for i in range(8))
    check('REJECT_TOO_EASY' in difficulty_qa(3,items,.31,2,'LOW')[0])
    for cw,nr,amb in [(items,.30,'LOW'),(items,.31,'MEDIUM')]:check('REJECT_TOO_EASY' not in difficulty_qa(3,cw,nr,2,amb)[0])
@test('TEST-DIFF-004','QA_BRANCH_INJECTION')
def narrow():
    check('REJECT_TOO_NARROW' in difficulty_qa(3,boards()[2].items,.029,1,'HIGH')[0])
    check('REJECT_TOO_NARROW' not in difficulty_qa(3,boards()[2].items,.029,2,'HIGH')[0])
@test('MERGE-GEN-002','QA_BRANCH_INJECTION_CLOSURE_SUPERSEDES_OLD_TODO')
def distinct_warning():
    r,w=difficulty_qa(3,boards()[2].items,.03,1,'HIGH')
    check(not r and 'WARN_DISTINCT_TARGET' in w)
@test('TEST-NEAR-001')
def near():
    check(94-T['difficulty']['nearOptimalDelta']==84)
    check([v for v in [83.999,84,94] if v>=94-10]==[84,94])
@test('TEST-NEAR-002','REAL_LAYOUT_SIGNATURE')
def mirror():
    b=boards()[0]
    check(strategy_signature(b.left,b.right)==strategy_signature(b.right,b.left))
    check(len({strategy_signature(b.left,b.right),strategy_signature(b.right,b.left)})==1)
@test('TEST-SEQ-001','REAL_BOARD_QA_CLOSURE')
def dedup():
    # Same exact board is a direct QA unit fixture; runtime B1->B2 sizes differ.
    b=boards()[0];duplicate,reasons=analyze_board(1,b.items,[b])
    check(duplicate is None and 'REJECT_DUPLICATE_DECISION_PATTERN' in reasons)

@test('TEST-SUBMIT-001','P0_LOGICAL_SUBMIT_GUARD_UI_NOT_RUN')
def incomplete():
    s=session();check(not s.can_submit);raises(s.submit,'INCOMPLETE')
@test('TEST-SUBMIT-002','REAL_CARGO_STATE')
def explicit_submit():
    s=session();load_reference(s);check(s.can_submit and not s.results and s.state=='GAMEPLAY')
@test('TEST-SUBMIT-003 LOGIC-FLOW-003','REAL_CARGO_STATE')
def retry():
    s=session()
    for c in s.board.items:s.insert(c.instance,'left')
    s.submit();check(not s.resolve_submission().passed);check(s.state=='GAMEPLAY')
    for c in list(reversed(s.left)):s.remove(c.instance,'left')
    load_reference(s);s.submit();check(s.resolve_submission().passed)

@test('TEST-TIME-001','REAL_SESSION_MOCK_CONTRACT')
def timeout_keep():
    s=complete(session(),2);s.tick(75)
    check(s.result['primaryMetrics']['completedBatchCount']==2)
    check(s.result['cashDelta']==payout([r['performanceTier'] for r in s.results])['cash'])
    check(s.result['completionStatus']!='ABORTED' and s.result['timeCostTicks']==2)
@test('TEST-TIME-002 TEST-WORLD-004','REAL_SESSION_MOCK_CONTRACT')
def timeout_zero():
    s=session();s.tick(75);check(s.result['cashDelta']==0 and s.result['timeCostTicks']==2 and s.result['completionStatus'] is None)
@test('TEST-ABORT-001 TEST-FLOW-009','REAL_SESSION_MOCK_CONTRACT')
def abort():
    for n in (0,1,2):
        s=complete(session(),n);s.request_abort();s.confirm_abort();r=s.result
        check(r['completionStatus']=='ABORTED' and r['cashDelta']==r['timeCostTicks']==0 and not r['formalWorkHistory'])
        m=MockOuter(True);before=deepcopy(m.state);m.apply(r);check(m.state==before)
@test('TEST-ABORT-002 TEST-FLOW-008','REAL_SESSION_MOCK_CONTRACT')
def abort_cancel():
    s=complete(session(),1);s.insert(s.board.items[0].instance,'left');s.tick(3)
    before=(list(s.left),set(s.waiting),s.remaining,deepcopy(s.results))
    s.request_abort();s.tick(12);s.cancel_abort()
    check(before==(s.left,s.waiting,s.remaining,s.results));check(s.result is None and s.state=='GAMEPLAY')
@test('TEST-TRIAL-001 TEST-TRIAL-002','REAL_SESSION_MOCK_CONTRACT')
def trial():
    for termination in ('complete','timeout','abort'):
        s=complete(session('TRIAL'),3 if termination=='complete' else 1)
        if termination=='timeout':s.tick(75)
        if termination=='abort':s.request_abort();s.confirm_abort()
        m=MockOuter(True);before=deepcopy(m.state);m.apply(s.result)
        check(m.state==before and s.result['cashDelta']==s.result['timeCostTicks']==s.result['tripStateDelta']==0 and not s.result['formalWorkHistory'])
        if termination=='complete':check(s.result['simulatedPayout']==payout([r['performanceTier'] for r in s.results])['cash'])
@test('TEST-WORLD-001','REAL_SESSION_MOCK_CONTRACT')
def world():
    s=complete(session(),3);m=MockOuter();m.apply(s.result)
    check(m.state['worldTicks']==2 and ['晨','昼','暮'][m.state['worldTicks']%3]=='暮')
@test('TEST-WORLD-002','IMPLEMENTATION_API_AUDIT')
def no_day():check(not hasattr(MockOuter,'advanceDay') and F['worldTime']['worldDayTicks']==3)
@test('TEST-WORLD-003','P0_ENTRY_CONTRACT_UI_NOT_RUN')
def day_disabled():
    check(formal_entry('昼')=={'visible':True,'enabled':False,'reason':'今日时间不足'})
    raises(lambda:Session(lambda i:boards()[i-1],mode='FORMAL',timerConfig=75,phase='昼'))
    check(formal_entry('暮')['visible'] is False)

for i,(tiers,amount) in enumerate([(['MODEST']*3,16),(['NORMAL']*3,19),(['RICH']*3,22)],1):
    @test(f'TEST-ECO-{i:03d}','PAYOUT_CONTRACT_UNIT')
    def economy(ts=tiers,a=amount):check(payout(ts)['cash']==a)
@test('TEST-ECO-004','PAYOUT_CAP_FAULT_INJECTION')
def cashcap():
    old=F['economy']['baseWage']
    try:
        F['economy']['baseWage']=100;check(payout(['RICH']*3)['cash']==22)
    finally:F['economy']['baseWage']=old
@test('TEST-ECO-005','PAYOUT_CONTRACT_UNIT')
def mincash():check(payout(['MODEST'])['cash']==11)
@test('TEST-ECO-006','PAYOUT_CONTRACT_UNIT')
def nocash():check(payout([])['cash']==0 and payout([])['baseWage']==0)
@test('TEST-ECO-007','PAYOUT_CONTRACT_UNIT')
def two():
    for t,v in [('MODEST',13),('NORMAL',14),('RICH',16)]:check(payout([t,t])['cash']==v)
@test('TEST-INTEGRATION-001 TEST-INTEGRATION-002','MOCK_ONLY_NO_B7')
def outer():
    s=complete(session(),3);m=MockOuter(True);before=deepcopy(m.state);m.apply(s.result)
    check(m.state['tripSummary']['livelihoodIncome']==s.result['cashDelta'])
    for k in ['tradeProfit','reputation','reputationTurnover','goods','market']:check(m.state[k]==before[k])

@test('TEST-FLOW-001','REAL_SESSION_STATE')
def submit_once():
    s=session();load_reference(s);s.submit();raises(s.submit,'LOCKED')
    raises(lambda:s.remove(s.left[-1].instance,'left'),'LOCKED');s.resolve_submission()
    raises(s.resolve_submission);check(len(s.results)==1)
@test('TEST-FLOW-004','REAL_SESSION_STATE')
def pauses():
    s=session();s.tick(5);load_reference(s);s.submit();s.tick(100);check(s.remaining==70)
    s.resolve_submission();check(s.state=='TRANSITION');s.tick(100);check(s.remaining==70)
    s.finish_transition();s.tick(1);check(s.remaining==69)
@test('TEST-FLOW-005','REAL_SESSION_STATE')
def accepted_race():
    for good in (True,False):
        s=session()
        if good:load_reference(s)
        else:
            for c in s.board.items:s.insert(c.instance,'left')
        s.submit();s.timeout_event();check(s.state=='EVALUATING')
        s.resolve_submission();check(s.state=='SETTLEMENT' and len(s.results)==int(good))
@test('TEST-FLOW-006','REAL_SESSION_STATE')
def zero_first():
    s=session();load_reference(s);s.timeout_event();raises(s.submit)
    check(len(s.results)==0 and s.last_evaluation is None)
@test('TEST-FLOW-007','REAL_SESSION_STATE')
def no_speed_reward():
    outcomes=[]
    for remaining in (1,20):
        s=complete(session(),2);s.tick(75-remaining);complete(s,1);outcomes.append(s.result['cashDelta'])
    check(outcomes[0]==outcomes[1])
@test('LOGIC-FLOW-002','P0_LOGIC_SUBSET_VISUALS_NOT_RUN')
def transition():
    s=session();load_reference(s);s.submit();s.resolve_submission();check(s.state=='TRANSITION')
    s.finish_transition();check(s.batch==2 and s.state=='GAMEPLAY')
@test('LOGIC-FLOW-010 LOGIC-FLOW-011','P0_LOGIC_SUBSET_VISUALS_NOT_RUN')
def navigation():
    s=complete(session(),3);m=MockOuter(True);m.apply(s.result);before=deepcopy(m.state)
    for dest in ('CITY','LIVELIHOOD_LIST','CITY'):
        check(s.navigate(dest)==dest);m.apply(s.result)
    check(m.state==before);raises(s.request_abort)

@test('MERGE-STK-001 MERGE-STK-002','REAL_CARGO_LAYOUT_NOT_BOARD_ACCEPTANCE')
def merge_layouts():
    l=(cargo('khotan_jade'),cargo('paper'));r=(cargo('ceramics'),cargo('silk'))
    check(evaluateLayout(l,r,1)==(1,100,100,100,True,'RICH'))
    check(evaluateLayout(l[::-1],r[::-1],1)==(1,100,72,86,True,'NORMAL'))
@test('MERGE-STK-003','REAL_CARGO_COMPONENT')
def real_cap():
    d=evaluateLayout((cargo('lacquerware'),cargo('khotan_jade'),cargo('silverware')),(cargo('pepper'),),1,debug=True)
    p=d['penaltySources']['left'][0];check(p['rawPenalty']==48 and p['penalty']==40)
@test('MERGE-GEN-001 MERGE-GEN-003','REAL_ENUMERATION')
def feasible_denominator():
    b=boards()[0];scores=[evaluateLayout(a,c,b.reference_ratio) for a,c in feasible_layouts(b.items)]
    check(len(scores)==120 and any(not s.passed for s in scores))
    near=sum(s.LayoutScore>=max(x.LayoutScore for x in scores)-10 for s in scores)
    check(b.metrics['nearOptimalRatio']==near/len(scores))
    check(any(s.StackingScore<80 for s in scores))
@test('MERGE-ECO-001','PAYOUT_ENUMERATION')
def all_payouts():
    rows=[]
    for n in range(4):
        for tiers in product(['MODEST','NORMAL','RICH'],repeat=n):
            cash=payout(tiers)['cash'];expected=0 if n==0 else 9+sum([2,2,3][i]+{'MODEST':[0,0,0],'NORMAL':[0,1,2],'RICH':[1,2,3]}[t][i] for i,t in enumerate(tiers))
            check(cash==expected and cash<=22);rows.append(cash)
    check(len(rows)==40)

@test('CLOSURE-ATTEMPT-CAP','REAL_GENERATOR_REJECT_PATH')
def attempt_cap():
    items=tuple(cargo(k) for k in ['ceramics','lacquerware','paper','medicinal_herbs'])
    calls=[]
    def sample(a):calls.append(a);return items
    b,d=generate_board(1,sample,seed='cap-test')
    check(b is None and d['status']=='GENERATION_EXHAUSTED' and calls==list(range(1,201)))
    check(d['rejectReasonDistribution']['REJECT_CONSTRAINT_WEIGHT']==200)
@test('CLOSURE-FROZEN-CARGO','GENERATOR_POOL_ISOLATION')
def pool_guard():
    items=list(boards()[0].items);items[0]=syn('not-frozen',5,['FRAGILE'])
    check('REJECT_CARGO_POOL' in composition_qa(1,items))
@test('CLOSURE-EMPTY-DEBUG','UNSCORED_EMPTY_DIAGNOSTIC')
def empty():
    d=session().debug();check(d['state']=='EMPTY_UNSCORED' and d['BalanceScore'] is None)
    json.dumps(d,allow_nan=False)
@test('CLOSURE-DETERMINISTIC-REFERENCE','REAL_ENUMERATION')
def deterministic():
    b=boards()[1]
    reversed_board,reasons=analyze_board(2,tuple(reversed(b.items)))
    check(not reasons and canonical_layout(b.left,b.right)==canonical_layout(reversed_board.left,reversed_board.right))
    check(b.reference_ratio==reversed_board.reference_ratio)
@test('CLOSURE-INVARIANTS','STATE_AND_INPUT_VALIDATION')
def invariants():
    c=cargo('pepper');raises(lambda:evaluateLayout([c],[c],1))
    raises(lambda:evaluateLayout([c],[],0))
    raises(lambda:evaluateLayout([c]*5,[],1))
    raises(lambda:Session(lambda i:boards()[0],mode='FORMAL',timerConfig=80))
    s=session();raises(lambda:s.tick(-1));raises(lambda:s.tick(float('nan')))
    check(len({x.instance for x in boards()[0].items})==4)

def oracle_score(a,b,ref):
    """Independent hand-calculation oracle with Fraction arithmetic, no core helpers."""
    penalties=0
    for bag in (a,b):
        for i,c in enumerate(bag):
            above=sum(x.weight for x in bag[i+1:]);attrs=c.attributes;p=0
            if c.weight==5:p+=(0,5,12,20)[i]
            if 'PRESSURE_SENSITIVE' in attrs and 'DURABLE' not in attrs:
                p+=0 if above<=1 else 8 if above<=3 else 18 if above<=5 else 28 if above<=8 else 38
            if 'FRAGILE' in attrs:p+=(0,0,6,12)[i]+(10 if any(x.weight==5 for x in bag[i+1:]) else 0)
            if 'SOFT' in attrs and above>=8:p+=5
            penalties+=min(40,p)
    w1=sum(x.weight for x in a);w2=sum(x.weight for x in b)
    ratio=Fraction(min(w1,w2),max(w1,w2));balance=min(Fraction(100),100*ratio/ref)
    stacking=max(0,100-penalties);layout=(balance+stacking)/2
    passed=layout>=55 and balance>=40 and stacking>=40
    tier=None if not passed else 'RICH' if layout>=85 and balance>=80 and stacking>=80 else 'MODEST' if layout<70 else 'NORMAL'
    return ratio,balance,stacking,layout,passed,tier

def oracle_signature(a,b):
    # Independently encode closure's LOW/HIGH archetype multisets and mirror pairs.
    both=list(a)+list(b)
    sides=[]
    for side in (a,b):
        cats=[[],[]]
        for i,c in enumerate(side):cats[int(i>=2)].append(c.archetype)
        sides.append((sum(c.weight for c in side),tuple(sorted(cats[0])),tuple(sorted(cats[1]))))
    return (len(both),tuple(sorted(c.weight for c in both)),tuple(sorted(c.archetype for c in both)),
        len([c for c in both if c.cw>=2]),len([c for c in both if c.archetype=='HEAVY_DURABLE']),
        len([c for c in both if c.archetype=='HEAVY_FRAGILE']),len([c for c in both if 'PRESSURE_SENSITIVE' in c.attributes]),
        len([c for c in both if 'SOFT' in c.attributes]),tuple(sorted(sides)))

for n in range(4,9):
    @test(f'ORACLE-ENUM-{n}','INDEPENDENT_EXHAUSTIVE_FRACTION_ORACLE')
    def oracle(n=n):
        kinds=['ceramics','silverware','pepper','silk','paper','dye','hexi_wool','lacquerware'][:n]
        items=tuple(cargo(k) for k in kinds);batch=1 if n==4 else 3 if n==8 else 2
        board,reasons=analyze_board(batch,items);check(board is not None,str(reasons))
        w1=sum(c.weight for c in board.left);w2=sum(c.weight for c in board.right)
        ref=Fraction(min(w1,w2),max(w1,w2));rows=[];q=[];layout_ids=set()
        for ordering in permutations(items):
            for k in range(max(0,n-4),min(4,n)+1):
                a,b=ordering[:k],ordering[k:]
                expected=oracle_score(a,b,ref);actual=evaluateLayout(a,b,float(ref),expected=items)
                check(all(math.isclose(float(x),float(y),rel_tol=1e-12,abs_tol=1e-12) for x,y in zip(expected[:4],actual[:4])))
                check(expected[4:]==actual[4:])
                sig=(tuple(x.instance for x in a),tuple(x.instance for x in b));canonical=min(sig,sig[::-1])
                layout_ids.add(sig);rows.append((a,b,expected))
                rr=expected[0]
                if rr>=Fraction(4,5) and expected[2]>=80:
                    q.append((-(100+expected[2])/2,-rr,-expected[2],canonical))
        check(len(rows)==len(layout_ids)==math.factorial(n)*(9-n))
        generated_ids={(tuple(x.instance for x in a),tuple(x.instance for x in b)) for a,b in feasible_layouts(items)}
        check(generated_ids==layout_ids)
        check(min(q)[3]==canonical_layout(board.left,board.right))
        best=max(r[2][3] for r in rows);near=[r for r in rows if r[2][3]>=best-10]
        check(board.metrics['bestFeasibleLayoutScore']==float(best))
        check(board.metrics['nearOptimalLayoutCount']==len(near))
        check(board.metrics['distinctNearOptimalSolutions']==len({oracle_signature(a,b) for a,b,s in near}))
        EVIDENCE[f'ORACLE-ENUM-{n}']={'layoutsCompared':len(rows),'nearCompared':len(near),'reference':min(q)[3],
                                    'enumeration':'full permutation-and-split independent of generator combination-and-bag-order enumeration'}

def main():
    root=Path(__file__).resolve().parents[1];out=root/'reports';out.mkdir(exist_ok=True)
    text=(root/'authority/AUTOMATED_TEST_PLAN.md').read_text()
    plan_ids=re.findall(r'^#{2,3} (TEST-[A-Z]+-\d{3})',text,re.M)+re.findall(r'^\| (TEST-[A-Z]+-\d{3}) \|',text,re.M)
    merge_ids=re.findall(r'^\|(MERGE-[A-Z]+-\d{3})\|',(root/'authority/TEST_CASES.md').read_text(),re.M)
    skipped={f'TEST-UI-{i:03d}':'P1 UI rendering/interaction outside P0 scope' for i in range(1,11)}
    skipped.update({f'TEST-FLOW-{i:03d}':'Full case requires P1 visuals/navigation; separate LOGIC-FLOW test covers P0 subset' for i in [2,3,10,11]})
    skipped['MERGE-UI-001']='P1 visual waiting-area case outside P0 scope'
    check(len(plan_ids)==106);check(set(plan_ids+merge_ids)<=set(TESTS)|set(skipped),'unmapped plan case')
    results=[]
    for id,(fn,layer) in TESTS.items():
        started=time.monotonic()
        try:fn();status='PASS';detail=EVIDENCE.get(id)
        except Exception:status='FAIL';detail=traceback.format_exc()
        results.append({'id':id,'status':status,'layer':layer,'seconds':time.monotonic()-started,'evidence':detail})
        print(id,status,flush=True)
        if status=='FAIL':print(detail,flush=True)
    for id,reason in skipped.items():results.append({'id':id,'status':'NOT_RUN','layer':'P1_OUT_OF_SCOPE','reason':reason})
    failed=sum(r['status']=='FAIL' for r in results)
    report={'status':'FAIL' if failed else 'PASS','scope':'P0_AUTOMATED_TESTS_ONLY',
        'approvedPlanDefinitions':106,'planPassed':sum(r['status']=='PASS' and r['id'] in plan_ids for r in results),
        'planNotRun':sum(r['status']=='NOT_RUN' and r['id'] in plan_ids for r in results),
        'executed':sum(r['status']!='NOT_RUN' for r in results),'passed':sum(r['status']=='PASS' for r in results),
        'failed':failed,'notRun':sum(r['status']=='NOT_RUN' for r in results),'results':results,
        'scopeNote':'Headless logical assertions only. UI-labelled full cases remain NOT_RUN. No P1 acceptance claim.',
        'closureSupersession':'MERGE-GEN-002 now warns outside strict AND rejection per closure sections 3/4.'}
    (out/'automated_test_results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
    print(json.dumps({k:v for k,v in report.items() if k!='results'},ensure_ascii=False),flush=True)
    return 1 if failed else 0
if __name__=='__main__':sys.exit(main())
