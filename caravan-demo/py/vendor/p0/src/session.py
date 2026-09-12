"""Headless three-batch session and mock-only settlement contracts."""
from copy import deepcopy
import math
from core import evaluateLayout, T, F

def formal_entry(phase):
    return {'visible':phase != '暮','enabled':phase == '晨',
            'reason':'今日时间不足' if phase == '昼' else None}

def payout(tiers):
    if len(tiers) > 3 or any(t not in ('MODEST','NORMAL','RICH') for t in tiers):
        raise ValueError('only sequential valid batch tiers')
    base = F['economy']['baseWage'] if tiers else 0
    rewards = [{'batchIndex':i+1,'completionReward':F['economy']['completionRewards'][i],
                'qualityReward':T['qualityReward'][f'B{i+1}'][tier]} for i,tier in enumerate(tiers)]
    extra = sum(x['completionReward']+x['qualityReward'] for x in rewards)
    return {'baseWage':base,'extraWage':extra,'cash':min(F['economy']['cashCap'],base+extra),'rewards':rewards}

class Session:
    def __init__(self, board_provider, *, mode, timerConfig, phase='晨', jobId='P0_MOCK_JOB', runId='P0_MOCK_RUN'):
        if mode not in ('FORMAL','TRIAL') or timerConfig not in (75,90): raise ValueError('explicit mode/timer required')
        if mode == 'FORMAL' and not formal_entry(phase)['enabled']: raise ValueError('formal entry unavailable')
        self.provider = board_provider; self.mode=mode; self.timerConfig=timerConfig
        self.remaining=float(timerConfig); self.elapsed=0.; self.batch=1
        self.jobId=jobId; self.runId=runId; self.results=[]; self.state='GAMEPLAY'
        self.pending_timeout=False; self.result=None; self.last_evaluation=None
        self._load()

    def _load(self):
        self.board=self.provider(self.batch)
        if self.board is None or self.board.batch != self.batch: raise ValueError('board unavailable')
        self.left=[]; self.right=[]
        self.by_id={c.instance:c for c in self.board.items}
        self.original_slots=tuple(c.instance for c in self.board.items)
        self.waiting=set(self.original_slots)

    def _operable(self):
        if self.state != 'GAMEPLAY': raise ValueError('INPUT_LOCKED')

    @property
    def can_submit(self):
        return self.state == 'GAMEPLAY' and not self.waiting

    def insert(self, instance, side):
        self._operable()
        if side not in ('left','right') or instance not in self.waiting: raise ValueError('invalid placement')
        bag=getattr(self,side)
        if len(bag)==4: raise ValueError('已满')
        bag.append(self.by_id[instance]); self.waiting.remove(instance)

    def remove(self, instance, side):
        self._operable()
        if side not in ('left','right'): raise ValueError('invalid side')
        bag=getattr(self,side)
        if not bag or bag[-1].instance != instance: raise ValueError('先取出上层货物')
        c=bag.pop(); self.waiting.add(c.instance)

    def debug(self):
        return {**evaluateLayout(self.left,self.right,self.board.reference_ratio,debug=True),
                'referenceSolution':{'left':[c.instance for c in self.board.left],'right':[c.instance for c in self.board.right]},
                'nearOptimalRatio':self.board.metrics['nearOptimalRatio'],
                'generationAttempts':self.board.metrics.get('generationAttempts'),
                'rejectReasonHistory':self.board.metrics.get('rejectReasonHistory',[])}

    def tick(self, seconds):
        if not math.isfinite(seconds) or seconds < 0: raise ValueError('invalid clock delta')
        if self.state != 'GAMEPLAY': return
        used=min(seconds,self.remaining); self.remaining-=used; self.elapsed+=used
        if self.remaining == 0: self.timeout_event()

    def timeout_event(self):
        # External zero event is distinct from paused gameplay-clock ticking.
        if self.state in ('SETTLEMENT','ABORTED'): return
        if self.state == 'ABORT_CONFIRM': return  # confirmation pauses the clock
        self.remaining=0
        if self.state == 'EVALUATING': self.pending_timeout=True
        else: self._settle('TIMEOUT')

    def submit(self):
        self._operable()
        if not self.can_submit: raise ValueError('REJECT_INCOMPLETE_LAYOUT')
        self.state='EVALUATING'
        self.submitted_at=self.elapsed
        # Snapshot is immutable while the accepted submission is pending.
        self.snapshot=(tuple(self.left),tuple(self.right))

    def resolve_submission(self):
        if self.state != 'EVALUATING': raise ValueError('no accepted submission')
        a,b=self.snapshot
        s=evaluateLayout(a,b,self.board.reference_ratio,expected=self.board.items)
        self.last_evaluation=s
        if s.passed:
            self.results.append({'batchIndex':self.batch,'cargoIds':[c.kind for c in self.board.items],
                'performanceTier':s.performanceTier,'balanceScore':s.BalanceScore,'stackingScore':s.StackingScore,
                'layoutScore':s.LayoutScore,'submittedAtSeconds':self.submitted_at,
                'rewardData':payout([x['performanceTier'] for x in self.results]+[s.performanceTier])['rewards'][-1]})
        if self.pending_timeout or self.remaining == 0: self._settle('TIMEOUT')
        elif s.passed and self.batch == 3: self._settle('ALL_BATCHES_COMPLETED')
        elif s.passed: self.state='TRANSITION'
        else: self.state='GAMEPLAY'
        return s

    def finish_transition(self):
        if self.state != 'TRANSITION': raise ValueError('no transition')
        self.batch+=1; self._load(); self.state='GAMEPLAY'

    def request_abort(self):
        self._operable(); self.state='ABORT_CONFIRM'

    def cancel_abort(self):
        if self.state != 'ABORT_CONFIRM': raise ValueError('no abort confirmation')
        self.state='GAMEPLAY'

    def confirm_abort(self):
        if self.state != 'ABORT_CONFIRM': raise ValueError('no abort confirmation')
        self._settle('ABORTED')

    def _settle(self, reason):
        if self.result is not None: return self.result
        aborted=reason == 'ABORTED'; formal=self.mode == 'FORMAL' and not aborted
        pay=payout([r['performanceTier'] for r in self.results]) if not aborted else payout([])
        self.state='ABORTED' if aborted else 'SETTLEMENT'
        self.result={'minigameId':'DUNHUANG_CARAVAN_LOADING','jobId':self.jobId,'runId':self.runId,
            'mode':self.mode,'completionStatus':'ABORTED' if aborted else None,
            'p0TerminationReason':reason,'performanceTier':None,
            'primaryMetrics':{'completedBatchCount':len(self.results),'batchResults':deepcopy(self.results)},
            'secondaryMetrics':{'finalBalanceScores':[r['balanceScore'] for r in self.results],
                'finalStackingScores':[r['stackingScore'] for r in self.results],
                'finalLayoutScores':[r['layoutScore'] for r in self.results]},'bonusMetrics':{},
            'durationData':{'elapsedSeconds':self.elapsed,'remainingSeconds':self.remaining,'clock':'P0_SYNTHETIC_OPERABLE_SECONDS'},
            'cashDelta':pay['cash'] if formal else 0,'timeCostTicks':2 if formal else 0,
            'tripStateDelta':0,'formalWorkHistory':formal,'reputationDelta':0,
            'simulatedPayout':pay['cash'] if self.mode=='TRIAL' and not aborted else 0,
            'payoutBreakdown':pay}
        return self.result

    def navigate(self, destination):
        if self.state != 'SETTLEMENT' or destination not in ('LIVELIHOOD_LIST','CITY'): raise ValueError('invalid navigation')
        # Navigation is data only; cannot re-settle or publish effects.
        return destination

class MockOuter:
    """In-memory contract consumer only. Never attached to real B7/state/storage."""
    def __init__(self, active_trip=False):
        self.state={'cash':100,'worldTicks':0,'tripSummary':{'livelihoodIncome':0},'tradeProfit':17,
                    'reputation':3,'reputationTurnover':11,'goods':['unchanged'],'market':{'unchanged':True},'workHistory':[]}
        self.applied=set(); self.active_trip=active_trip

    def apply(self, result):
        if result['mode']=='TRIAL' or result['completionStatus']=='ABORTED': return
        if result['runId'] in self.applied: return
        self.applied.add(result['runId'])
        self.state['cash']+=result['cashDelta']; self.advanceTime(result['timeCostTicks'])
        if self.active_trip: self.state['tripSummary']['livelihoodIncome']+=result['cashDelta']
        if result['formalWorkHistory']:
            self.state['workHistory'].append({'runId':result['runId'],'cash':result['cashDelta'],
                                            'batchTiers':[x['performanceTier'] for x in result['primaryMetrics']['batchResults']]})

    def advanceTime(self, ticks):
        self.state['worldTicks']+=ticks
