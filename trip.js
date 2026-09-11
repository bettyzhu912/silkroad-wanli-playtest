(function(S){
  'use strict';
  const {ensure,clone}=S.util;
  const plan=Object.freeze([
    {from:'changan',to:'dunhuang',days:3},
    {from:'dunhuang',to:'khotan',days:4},
    {from:'khotan',to:'dunhuang',days:4},
    {from:'dunhuang',to:'changan',days:3}
  ]);
  const graceWarningText='继续过夜将结束本次返程宽限，尚未交付的冻结委托会按未完成处理。';
  function departureView(p){
    const leg=plan[p.trip?p.trip.routeIndex:0];
    return {leg:leg?clone(leg):null,requiresSupplyWarning:Boolean(leg&&p.inventory.provisions<leg.days),requiresCargoWarning:!p.inventory.lots.some(l=>l.ownership==='playerOwned'&&!l.nonMarketable&&l.condition!=='destroyed'),pendingPickupIds:S.commissions?.departureWarnings(p)||[],canDepart:!p.world.route&&(!p.market.visit||p.market.visit.settled)&&(!p.trip||p.trip.phase==='in_city')&&S.time.phase(p)!==2};
  }
  function depart(p,a,ctx){
    ensure(!p.world.route,'ON_ROUTE','当前已经在路上');
    ensure(!p.market.visit||p.market.visit.settled,'MARKET_VISIT_OPEN','请先完整离开市场');
    ensure(S.time.phase(p)!==2,'DEPARTURE_AT_DUSK','请先过夜，次晨再出发');
    if(!p.trip){
      ensure(p.world.city==='changan','TRIP_START_CITY');
      p.trip={id:S.util.id(p,'trip'),startedAt:p.world.tick,deadlineTick:p.world.tick+66,routeIndex:0,routePlan:clone(plan),routeHistory:['changan'],arrivedChanganTick:null,returnStatus:null,graceIds:[],phase:'in_city',overduePenaltyApplied:false,initialReputation:p.reputation.value,initialMilestones:clone(p.reputation.milestones),initialFunds:S.finance.snapshot(p),initialMerchantLedgerIndex:p.merchant.ledger?.length||0,summary:null};
      if(p.reputation.value>=5){ensure(S.commissions?.generatePool,'COMMISSION_NOT_CONNECTED','委托候选尚未完成接入');S.commissions.generatePool(p,ctx);}
      if(S.stories?.onTripStart)S.stories.onTripStart(p);
    }
    ensure(p.trip.phase==='in_city'&&p.trip.routeIndex<plan.length,'RETURN_TASKS_PENDING','请先结束本次商旅');
    const leg=plan[p.trip.routeIndex];ensure(leg.from===p.world.city,'ROUTE_MISMATCH');
    if(p.inventory.provisions<leg.days)ensure(a.acknowledgeSupplyWarning===true,'SUPPLY_WARNING_REQUIRED','补给少于下一段基础路程，请确认后再出发');
    const missed=S.commissions?.departureWarnings(p)||[];
    if(missed.length){ensure(a.confirmMissedPickup===true,'PICKUP_WARNING_REQUIRED','本次离城后将无法再领取这些委托货物');S.commissions.finalizeFailures(p,missed,{reason:'pickup_city_missed'});}
    p.world.route={id:S.util.id(p,'route'),index:p.trip.routeIndex,...clone(leg),startedTick:p.world.tick,remainingTicks:leg.days*3,traveledTicks:0,provisionTicks:0,eventCount:0,targetEvents:p.tripHistory.length===0?3:(S.random.next(p)<(leg.days===3?.6:.4)?2:3),eventDays:[],lastStarvationDay:null,prepared:Boolean(p.inn.prepared)};
    p.inn.prepared=false;p.trip.phase='traveling';p.presentation.tutorialSeen.preparation=true;
    if(S.stories?.onDepart)S.stories.onDepart(p);
    S.events?.enteredRoute?.(p);
    return {kind:'departed',modal:false,route:clone(p.world.route)};
  }
  function arrive(p){
    const route=p.world.route;ensure(route&&route.remainingTicks===0,'ROUTE_NOT_FINISHED');
    ensure(!p.eventSession||p.eventSession.status==='ACKNOWLEDGED','EVENT_PENDING','请先处理路途事件');
    settleOverdue(p);
    S.events?.arrivedRoute?.(p,route.id);
    p.world.city=route.to;S.inventory.transported(p,route.to);p.trip.routeHistory.push(route.to);p.trip.routeIndex=route.index+1;p.world.route=null;
    if(S.inn?.arrived)S.inn.arrived(p);
    if(S.commissions?.arrived)S.commissions.arrived(p);
    if(['dunhuang','khotan'].includes(p.world.city)&&!p.reputation.firstVisits[p.world.city]){p.reputation.firstVisits[p.world.city]=true;S.reputation.change(p,1,{type:'firstVisit',city:p.world.city});}
    if(p.world.city==='changan'){
      p.trip.arrivedChanganTick=p.world.tick;p.trip.returnStatus=p.world.tick-p.trip.startedAt<=66?'on_time':'overdue';
      p.trip.phase=S.time.phase(p)===2?'returned_at_dusk_pending_rest':'return_tasks';
      if(S.time.phase(p)===2){ensure(S.commissions?.freezeGrace,'COMMISSION_NOT_CONNECTED');p.trip.graceIds=S.commissions.freezeGrace(p);p.trip.graceArrivalTick=p.world.tick;}
    }else p.trip.phase='in_city';
    if(S.stories?.arrived)S.stories.arrived(p);
    return {kind:'arrived',modal:false,city:p.world.city,returnStatus:p.trip.returnStatus,returnPhase:p.trip.phase};
  }
  function advanceRoute(p,count,ctx){
    const route=p.world.route;ensure(route&&p.trip?.phase==='traveling','NOT_TRAVELING');
    ensure(S.util.integer(count,1,route.remainingTicks),'INVALID_TRAVEL_TIME');
    const before=route.remainingTicks;
    for(let n=0;n<count;n++){route.remainingTicks--;route.traveledTicks++;ctx.advance(p,1,'routeTravel');}
    return {remainingBefore:before,remainingAfter:route.remainingTicks};
  }
  function journey(p,a,ctx){
    const route=p.world.route;ensure(route,'NOT_TRAVELING');
    ensure(routeStateValid(p),'INVALID_JOURNEY_STATE','旅程记录不完整，请重新载入或使用存档恢复。');
    ensure(!p.eventSession||p.eventSession.status==='ACKNOWLEDGED','EVENT_PENDING');
    if(route.remainingTicks===0)return arrive(p);
    ensure(S.events?.chooseMain,'EVENT_SCHEDULER_NOT_CONNECTED','路途事件调度尚未完成接入');
    const node={kind:'route',tags:[],routeId:route.id};
    if(S.events.eligibility(p,'S01',node).eligible)return S.events.open(p,'S01',node);
    const opportunities=Math.ceil((route.remainingTicks+S.time.phase(p))/3);
    const decision=S.events.routeDecision(p,opportunities,p.world.tick-route.startedTick>=route.days*3);
    if(decision.trigger){const eventId=S.events.chooseMain(p,node);if(eventId)return S.events.open(p,eventId,node);}
    const elapsed=Math.min(3-S.time.phase(p),route.remainingTicks);
    advanceRoute(p,elapsed,ctx);
    return route.remainingTicks===0?arrive(p):{kind:'journeyProgress',modal:false,elapsed,remainingTicks:route.remainingTicks};
  }
  function routeStateValid(p){
    const r=p.world.route,t=p.trip,leg=r&&plan.find(x=>x.from===r.from&&x.to===r.to);
    return Boolean(r&&t&&leg&&r.index===plan.indexOf(leg)&&t.routeIndex===r.index&&t.phase==='traveling'&&p.world.city===r.from&&S.util.integer(r.startedTick)&&r.startedTick<=p.world.tick&&S.util.integer(r.remainingTicks)&&S.util.integer(r.traveledTicks)&&S.util.integer(r.provisionTicks,0,2)&&r.days===leg.days&&r.id);
  }
  function migrate(p){
    const r=p.world.route;if(!r)return;
    // Recover only redundant fields from a valid persisted endpoint pair. Never
    // manufacture movement, money, event outcomes or a new random seed.
    const index=plan.findIndex(x=>x.from===r.from&&x.to===r.to);
    if(index<0||!p.trip)return;
    if(!S.util.integer(r.index,0,3))r.index=index;
    if(!S.util.integer(p.trip.routeIndex,0,3))p.trip.routeIndex=r.index;
    if(!p.trip.phase)p.trip.phase='traveling';
    if(r.provisionTicks===undefined&&S.util.integer(r.startedTick)&&r.startedTick<=p.world.tick)r.provisionTicks=(p.world.tick-r.startedTick)%3;
  }
  function graceDeadline(p){
    const t=p.trip;
    if(!t||!Number.isSafeInteger(t.graceArrivalTick))return null;
    // Internal world tick is zero-based; the approved 66/67/68/69/70 world
    // period example is 65/66/67/68/69. Existing saves derive this same bound.
    return Number.isSafeInteger(t.graceDeadlineTick)?t.graceDeadlineTick:t.graceArrivalTick+3;
  }
  function graceEligibility(p,commission){
    const trip=p.trip;const id=typeof commission==='string'?commission:commission.id||commission.commissionId;
    if(!trip||trip.graceClosePending||!trip.graceIds.includes(id))return false;
    const deadline=graceDeadline(p);
    return deadline!==null&&p.world.tick>=trip.graceArrivalTick&&p.world.tick<=deadline;
  }
  function graceAdvanceWarning(p,type,payload={}){
    const deadline=graceDeadline(p),elapsed=S.timeRisk?.actionTicks(p,type,payload)||0;
    if(deadline===null||p.trip.graceClosePending||!elapsed||p.world.tick+elapsed<=deadline)return null;
    return {title:'返程宽限即将结束',text:graceWarningText,confirmPayload:{confirmGraceEnd:{tripId:p.trip.id,deadlineTick:deadline}}};
  }
  function authorizeGraceAdvance(p,command,ctx){
    delete ctx.graceEndAuthorization;
    const deadline=graceDeadline(p);if(deadline===null)return;
    const t=p.trip,payload=command.payload||{},token=payload.confirmGraceEnd;
    const pending=t.graceClosePending;
    if(pending){
      const safeUI=['result.ack','notice.dismiss','tutorial.dismiss','tutorial.visit'].includes(command.type);
      const continuation=command.type.startsWith('EVENT_')&&payload.eventSessionId===pending.eventSessionId;
      ensure(safeUI||continuation,'GRACE_END_PENDING','请先处理本次过夜结果，返程宽限已经结束。');
      if(continuation||command.type==='result.ack')ctx.graceEndAuthorization={tripId:t.id,deadlineTick:deadline};
      return;
    }
    if(token){ensure(token.tripId===t.id&&token.deadlineTick===deadline,'STALE_GRACE_CONFIRMATION','返程宽限状态已更新，请重新确认。');ctx.graceEndAuthorization={tripId:t.id,deadlineTick:deadline};}
    if(graceAdvanceWarning(p,command.type,payload))ensure(ctx.graceEndAuthorization,'GRACE_END_CONFIRMATION_REQUIRED',graceWarningText);
  }
  function afterCommand(p,command,result,ctx){
    const deadline=graceDeadline(p),t=p.trip;
    if(deadline===null||p.world.tick<=deadline)return result;
    const authorization=ctx?.graceEndAuthorization;
    if(!t.graceClosePending){
      if(!authorization||authorization.tripId!==t.id||authorization.deadlineTick!==deadline)return result;
      t.graceClosePending={confirmedBy:ctx.sourceId||null,deadlineTick:deadline,crossedTick:p.world.tick,eventSessionId:null};
    }
    const session=p.eventSession;
    if(session&&session.status!=='ACKNOWLEDGED'){
      ensure(session.node?.nightSnapshot,'GRACE_EVENT_MISMATCH','请先处理本次过夜事件。');
      t.graceClosePending.eventSessionId=session.id;
      return result;
    }
    // For a staged night event, its actual result is acknowledged before the
    // single final R1/R2 transaction. No commission is eligible after the bound.
    const closure=clone(t.graceClosePending);
    const fixed=finalize(p,{confirmOutstanding:true},ctx);
    fixed.graceEnd={deadlineTick:deadline,completedTick:p.world.tick,nightEventId:closure.eventSessionId,overnightFeedback:result?.kind==='innFeedback'?clone(result):null};
    const history=p.tripHistory.at(-1);if(history?.id===fixed.tripId)history.summary=clone(fixed);
    return fixed;
  }
  function activeCommissionIds(p){return p.commissions.active.filter(c=>!['completed','failed','cancelled','expired','abandoned'].includes(c.status)).map(c=>c.id||c.commissionId);}
  function returnView(p){
    ensure(p.trip&&p.world.city==='changan'&&p.trip.arrivedChanganTick!==null,'NOT_RETURNED');
    const pending=activeCommissionIds(p).filter(id=>p.trip.graceIds.includes(id));
    const deadline=graceDeadline(p);
    return {phase:p.trip.phase,returnStatus:p.trip.returnStatus,arrivedTick:p.trip.arrivedChanganTick,pendingGraceIds:pending,requiresWarning:pending.length>0,graceDeadlineTick:deadline,graceDeadlineLabel:deadline===null?null:S.time.format(deadline),graceOpen:deadline!==null&&!p.trip.graceClosePending&&p.world.tick<=deadline,graceClosePending:Boolean(p.trip.graceClosePending)};
  }
  function summary(p,trip,failures){
    const records=p.journal.filter(r=>r.tripId===trip.id);
    const sales=records.filter(r=>r.type==='marketSell');
    const soldRevenue=sales.reduce((n,r)=>n+r.total,0),soldCost=sales.reduce((n,r)=>n+r.cost,0);
    const completed=p.commissions.results.filter(r=>r.tripId===trip.id&&['completed','delivered'].includes(r.status));
    failures=p.commissions.results.filter(r=>r.tripId===trip.id&&r.status==='failed');
    const money=S.finance.snapshot(p);
    const categories={provisions:'补给支出',inn:'住宿费用',innWait:'候时支出',innTalk:'闲谈支出',newspaper:'商报支出',tavern:'营生收入',event:'随机事件收支',story:'商路奇缘推进／奖励',merchant:'商号办理'};
    const other=Object.entries(categories).flatMap(([type,label])=>{const items=records.filter(r=>r.type===type);return items.length?[{type,label,occurred:true,amount:items.reduce((n,r)=>n+(r.amount??r.cashDelta??0),0),records:clone(items)}]:[];});
    const financeEntries=records.filter(r=>r.type==='finance');
    for(const [type,label,operations]of [['deposits','存款变化',['finance.deposit','finance.withdraw']],['loans','贷款变化',['finance.borrow','finance.repay']],['vouchers','飞钱变化',['finance.issueVoucher','finance.redeemVoucher']]]){
      const items=financeEntries.filter(r=>operations.includes(r.operation));
      if(items.length||S.util.stable(trip.initialFunds[type])!==S.util.stable(money[type]))other.push({type,label,occurred:true,amount:items.reduce((n,r)=>n+r.cashDelta,0),before:clone(trip.initialFunds[type]),after:clone(money[type]),records:clone(items)});
    }
    const merchantLedger=p.merchant.ledger.slice(trip.initialMerchantLedgerIndex||0);
    for(const [type,label,amount]of [['sale','商号自动销售',r=>r.revenue],['rent','院落租金',r=>r.rent],['payroll','员工工钱',r=>-r.paid],['arrearsPaid','补付欠薪',r=>-r.amount]]){
      const items=merchantLedger.filter(r=>r.type===type);if(items.length)other.push({type,label,occurred:true,amount:items.reduce((n,r)=>n+amount(r),0),records:clone(items)});
    }
    const important=merchantLedger.filter(r=>['opened','expanded'].includes(r.type)).map(r=>({type:r.type,text:r.type==='opened'?'商号开张':'商号扩建完成',record:clone(r)}));
    for(const r of records.filter(r=>r.type==='merchant'&&['supplier','buyCamel','buyProperty','renovate'].includes(r.result?.type)))important.push({type:r.result.type,text:({supplier:'供应往来变化',buyCamel:'驼队扩充',buyProperty:'购入院落',renovate:'院落修缮'})[r.result.type],record:clone(r.result)});
    for(const level of [5,10,20,40])if(!trip.initialMilestones?.[level]&&p.reputation.milestones[level])important.push({type:'reputationMilestone',text:'本趟首次达到商誉'+level});
    return {
      kind:'tripSummary',title:'本次商旅总结',tripId:trip.id,modal:true,
      journey:{startedTick:trip.startedAt,arrivedTick:trip.arrivedChanganTick,route:clone(trip.routeHistory),elapsedTicks:trip.arrivedChanganTick-trip.startedAt,limitDays:22,status:trip.returnStatus,overdueTick:trip.overdueTick??null,overduePenalty:trip.overdueActualPenalty??0,onTimeReward:trip.onTimeReward??0,lostOnTimeReward:trip.returnStatus==='overdue'?1:0},
      trade:{salesRevenue:soldRevenue,purchaseCost:soldCost,profit:soldRevenue-soldCost},
      commissions:{completed:completed.length,income:completed.reduce((n,r)=>n+(r.actualCash??r.cashReward??0),0),reputation:completed.reduce((n,r)=>n+(r.actualReputation??r.reputationReward??0),0),failed:failures.length,results:clone([...completed,...failures])},
      reputation:{change:p.reputation.value-trip.initialReputation,current:p.reputation.value},other,
      funds:{cash:money.cash,totalFunds:money.totalAssets,totalDebt:money.totalDebt,netFunds:money.netFunds},
      important,firstCompletedTrip:p.tripHistory.length===0,tutorialEnabled:p.presentation.tutorialEnabled,
      continueLabel:'结束并返回长安'
    };
  }
  function requestEnd(p){
    const view=returnView(p);ensure(p.trip.phase==='return_tasks','RETURN_NOT_READY','请先完成返抵事务');
    if(view.requiresWarning)return {kind:'returnWarning',title:'还有未处理的委托',text:'结束本次商旅后，这些委托将按原失败规则处理。',pendingIds:view.pendingGraceIds,modal:false,confirmLabel:'仍要结束（你还有未处理的委托哦）'};
    return {kind:'returnEndReady',modal:false};
  }
  function finalize(p,a,ctx){
    const view=returnView(p);ensure(p.trip.phase==='return_tasks','RETURN_NOT_READY');
    ensure(!view.pendingGraceIds.length||a.confirmOutstanding===true,'RETURN_WARNING_REQUIRED','请先确认未处理委托');
    ensure(S.commissions?.finalizeFailures,'COMMISSION_NOT_CONNECTED');
    const trip=p.trip,ids=activeCommissionIds(p);
    const failures=S.commissions.finalizeFailures(p,ids,{reason:'tripEnded',sourceId:ctx.sourceId});
    if(trip.returnStatus==='on_time'&&!trip.onTimeRewardApplied){S.reputation.change(p,1,{type:'onTimeTrip',tripId:trip.id});trip.onTimeReward=1;trip.onTimeRewardApplied=true;}
    const snapshot=summary(p,trip,failures);trip.summary=clone(snapshot);trip.phase='summary';
    finish(p);
    return snapshot;
  }
  function finish(p){
    ensure(p.trip?.phase==='summary'&&p.trip.summary,'SUMMARY_NOT_READY');
    const trip=p.trip;
    ensure(!p.tripHistory.some(t=>t.id===trip.id),'TRIP_ALREADY_FINALIZED');
    p.tripHistory.push({id:trip.id,status:'completed',onTimeReturn:trip.returnStatus==='on_time',startedAt:trip.startedAt,arrivedAt:trip.arrivedChanganTick,summary:clone(trip.summary)});
    p.trip=null;p.commissions.pool=[];
    return {kind:'tripFinished',modal:false};
  }
  function settleOverdue(p){
    const t=p.trip;if(!t||t.arrivedChanganTick!==null||p.world.tick<=t.deadlineTick)return;
    const target=Math.min(5,2+Math.floor((p.world.tick-t.deadlineTick)/6));
    const applied=t.overduePenaltyLevel??(t.overduePenaltyApplied?2:0);
    if(target<=applied)return;
    const change=S.reputation.change(p,-(target-applied),{type:'tripOverdue',tripId:t.id,targetPenalty:target});
    t.overduePenaltyApplied=true;t.overduePenaltyLevel=target;t.overdueTick??=p.world.tick;
    t.overdueActualPenalty=(t.overdueActualPenalty||0)+change.actual;
  }
  S.trip={plan,departureView,depart,arrive,advanceRoute,journey,routeStateValid,migrate,graceDeadline,graceEligibility,graceAdvanceWarning,authorizeGraceAdvance,afterCommand,returnView,summary,requestEnd,finalize,finish,settleOverdue};
  for(const [name,fn]of Object.entries({depart,journey,requestEnd,finalize,finish}))S.commands.register('trip.'+name,fn);
  S.time.register('trip',{
    beforeTick(p,ctx){
      const deadline=graceDeadline(p);
      if(deadline===null||p.world.tick+1<=deadline)return;
      const authorization=ctx?.graceEndAuthorization;
      ensure(authorization?.tripId===p.trip.id&&authorization.deadlineTick===deadline,'GRACE_END_CONFIRMATION_REQUIRED',graceWarningText);
    },
    afterTick(p){
      if(p.world.route){p.world.route.provisionTicks++;if(p.world.route.provisionTicks>=3){p.world.route.provisionTicks-=3;if(p.inventory.provisions>0)p.inventory.provisions--;}}
      settleOverdue(p);
      if(p.trip&&p.trip.arrivedChanganTick===null){
        const t=p.trip,remaining=t.deadlineTick-p.world.tick;
        const tier=remaining<0?'overdue':remaining<=2?'lastTwo':remaining<=3?'oneDay':remaining<=9?'threeDays':null;
        t.warningFlags||={};
        if(tier&&!t.warningFlags[tier]){t.warningFlags[tier]=true;p.presentation.notices=p.presentation.notices.filter(n=>!(n.kind==='risk'&&n.tripId===t.id));p.presentation.notices.push({id:t.id+'-risk-'+tier,kind:'risk',tripId:t.id,title:{overdue:'本趟商期已过',lastTwo:'商期仅余两个时段',oneDay:'商期仅余一日',threeDays:'商期将近'}[tier],text:tier==='overdue'?'仍可继续返程。本趟首次逾期的商誉后果已结算。':'请留意返程时间。等待行情或途中延误可能影响按期返抵。',severity:{threeDays:1,oneDay:2,lastTwo:3,overdue:4}[tier]});}
      }
      if(p.trip?.phase==='returned_at_dusk_pending_rest'&&S.time.phase(p)===0)p.trip.phase='return_tasks';
    }
  });
})(globalThis.Silk=globalThis.Silk||{});
