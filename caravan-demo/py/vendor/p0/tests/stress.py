"""1500 ACCEPTED boards: 500 complete, independent three-batch runs.
Seeded no-replacement cargo sampling is a TEST HARNESS policy only.
Generator itself receives a sampler; no production probability is supplied.
"""
import sys, json, random, time, hashlib, math
from pathlib import Path
from collections import Counter
from concurrent.futures import ProcessPoolExecutor
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'src'))
from core import CATALOG,cargo,evaluateLayout,strategy_signature,serialize_signature
from generator import generate_board,composition_qa,first_layer_qa,difficulty_qa,partition_ambiguity

OUT=Path(__file__).resolve().parents[1]/'reports'

def one_run(index):
    b2_size=5 if index<167 else 6 if index<333 else 7
    recent=[]; results=[]
    for batch,size in [(1,4),(2,b2_size),(3,8)]:
        seed=202609090000 + index*10 + batch
        rng=random.Random(seed)
        def sampler(attempt):
            return tuple(cargo(k) for k in rng.sample(sorted(CATALOG),size))
        board,trace=generate_board(batch,sampler,seed=seed,recent=recent)
        if board is None:
            results.append({'run':index,'batch':batch,'seed':seed,'status':'GENERATION_EXHAUSTED','trace':trace})
            break
        ev=board.evidence()
        # Readback validation of accepted output, separate from accept decisions.
        errors=[]
        s=evaluateLayout(board.left,board.right,board.reference_ratio,expected=board.items)
        errors+=composition_qa(batch,board.items)
        errors+=first_layer_qa(s.physicalBalanceRatio,s.StackingScore,s.LayoutScore)
        errors+=difficulty_qa(batch,board.items,ev['nearOptimalRatio'],ev['distinctNearOptimalSolutions'],ev['weightPartitionAmbiguity'])[0]
        if s.BalanceScore != 100 or s.performanceTier is None: errors.append('INVALID_REFERENCE_SCORE_OR_TIER')
        if ev['referenceLayoutScore'] != s.LayoutScore or ev['referenceStackingScore'] != s.StackingScore: errors.append('REFERENCE_MISMATCH')
        if ev['allFeasibleLayoutCount'] != math.factorial(size)*(9-size): errors.append('ENUMERATION_COUNT_MISMATCH')
        if ev['nearOptimalLayoutCount']/ev['allFeasibleLayoutCount'] != ev['nearOptimalRatio']: errors.append('NEAR_COUNT_MISMATCH')
        if ev['decisionPatternSignature'] != serialize_signature(strategy_signature(board.left,board.right)): errors.append('SIGNATURE_MISMATCH')
        if any(ev['decisionPatternSignature']==p.metrics['decisionPatternSignature'] for p in recent): errors.append('DUPLICATE_PATTERN_ACCEPTED')
        if partition_ambiguity(board.items)['weightPartitionAmbiguity'] != ev['weightPartitionAmbiguity']: errors.append('AMBIGUITY_MISMATCH')
        results.append({'run':index,'batch':batch,'size':size,'seed':seed,'status':'ACCEPTED',
                        'validationErrors':errors,'board':ev,'trace':trace})
        recent.append(board)
    return results

def main():
    OUT.mkdir(exist_ok=True); started=time.monotonic(); all_rows=[]
    path=OUT/'accepted_boards.jsonl'
    with path.open('w') as stream, ProcessPoolExecutor(max_workers=4) as pool:
        for idx,rows in enumerate(pool.map(one_run,range(500),chunksize=1)):
            for row in rows:
                all_rows.append(row);stream.write(json.dumps(row,ensure_ascii=False,separators=(',',':'))+'\n')
            stream.flush()
            if (idx+1)%25==0: print(f'completed runs={idx+1}/500 accepted={sum(r["status"]=="ACCEPTED" for r in all_rows)} elapsed={time.monotonic()-started:.1f}s',flush=True)
    batches={}
    for b in (1,2,3):
        rows=[r for r in all_rows if r['batch']==b]; accepted=[r for r in rows if r['status']=='ACCEPTED']
        counts=Counter();warn=Counter()
        for r in rows: counts.update(r['trace']['rejectReasonDistribution'])
        for r in accepted: warn.update(r['board']['warnings'])
        near=sorted(r['board']['nearOptimalRatio'] for r in accepted)
        attempts=[r['trace']['attemptCount'] for r in rows]
        batches[f'B{b}']={'accepted':len(accepted),'target':500,'requests':len(rows),
            'attempts':sum(attempts),'meanAttempts':sum(attempts)/len(attempts) if attempts else None,
            'maxAttempts':max(attempts,default=None),'rejectedCandidates':sum(len([a for a in r['trace']['attempts'] if a['rejectReasons']]) for r in rows),
            'rejectReasonDistribution':dict(counts),'warningDistribution':dict(warn),
            'boundaryCount':sum(r['board']['boundary'] for r in accepted),
            'acceptedSizes':dict(Counter(r['size'] for r in accepted)),
            'uniqueCargoSets':len({tuple(sorted(c['kind'] for c in r['board']['cargo'])) for r in accepted}),
            'nearOptimalRatio':{'min':min(near,default=None),'max':max(near,default=None),
                'mean':sum(near)/len(near) if near else None,'median':near[len(near)//2] if near else None}}
    invalid=sum(bool(r.get('validationErrors')) for r in all_rows)
    exhausted=sum(r['status']=='GENERATION_EXHAUSTED' for r in all_rows)
    passed=all(x['accepted']==500 for x in batches.values()) and not invalid and not exhausted
    report={'status':'PASS' if passed else 'FAIL','scope':'P0_GENERATOR_STRESS','elapsedWallSeconds':time.monotonic()-started,
            'testSampler':'Python Random explicit seed; uniform sample WITHOUT replacement from 15 kinds; TEST ONLY',
            'productionSamplingPolicy':None,'B2TestOnlyAcceptedSizeTarget':{'5':167,'6':166,'7':167},
            'currentRunDedup':True,'crossRunDuplicatesAllowed':True,'batches':batches,'invalidAcceptedBoards':invalid,
            'generationExhausted':exhausted,'acceptedBoardEvidence':path.name,
            'evidenceSha256':hashlib.sha256(path.read_bytes()).hexdigest(),
            'rejectCounting':'A candidate can have multiple reasons; reason totals are not candidate counts.',
            'referenceValidation':'Every accepted reference re-evaluated with same evaluateLayout and expected instance set.',
            'independentOracleEvidence':'automated_test_results.json: ORACLE-ENUM-4..8; no pruning, every layout enumerated.'}
    (OUT/'generator_stress_report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
    print(json.dumps(report,ensure_ascii=False,indent=2),flush=True)
    return 0 if passed else 1

if __name__=='__main__': sys.exit(main())
