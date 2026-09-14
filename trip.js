(function(S){
  'use strict';
  const {ensure,clone}=S.util;
  const plan=Object.freeze([
    {from:'changan',to:'dunhuang',days:3},
    {from:'dunhuang',to:'khotan',days:4},
    {from:'khotan',to:'dunhuang',days:4},
    {from:'dunhuang',to:'changan',days:3}
  ]);
  // COMMISSION_SYSTEM_MASTER_PATCH v3.0: the trip owns only the 22-day period and the route. Ordinary commissions live in the
  // commission domain (S.commissions) — starting, returning, summarising or finishing a trip never generates, freezes, fails,
  // resets or clears them. The departure page may know whether there is something to accept, nothing more.
  function departureView(p){
    const leg=plan[p.trip?p.trip.routeIndex:0];
    return {leg:leg?clone(leg):null,requiresSupplyWarning:Boolean(leg&&p.inventory.provisions<leg.days),requiresCargoWarning:!p.inventory.lots.some(l=>l.ownership==='playerOwned'&&!l.nonMarketable&&l.condition!=='destroyed'),canDepart:!p.world.route&&(!p.market.visit||p.market.visit.settled)&&(!p.trip||p.trip.phase==='in_city')&&S.time.phase(p)!==2,commissionHint:Boolean(S.commissions?.hasAcceptable?.(p))};
  }
  // RC3 BUG-08: preparing a departure is a 0-tick step; nothing about the 22-day period starts here.
  function begin(p){
    ensure(!p.world.route,'ON_ROUTE','当前已经在路上');
    ensure(!p.market.visit||p.market.visit.settled,'MARKET_VISIT_OPEN','请先完整离开市场');
    if(p.trip)return {kind:'tripPrepared',modal:false};
    ensure(p.world.city==='changan','TRIP_START_CITY','商旅只能从长安出发。');
    return {kind:'departurePrepared',modal:false,commissionHint:departureView(p).commissionHint};
  }
  // The single atomic transaction that really starts a trip: currentTrip and its deadline.
  function startTrip(p){
    ensure(p.world.city==='changan','TRIP_START_CITY','商旅只能从长安出发。');
    p.trip={id:S.util.id(p,'trip'),startedAt:p.world.tick,deadlineTick:p.world.tick+66,routeIndex:0,routePlan:clone(plan),routeHistory:['changan'],arrivedChanganTick:null,returnStatus:null,phase:'in_city',overduePenaltyApplied:false,initialReputation:p.reputation.value,initialMilestones:clone(p.reputation.milestones),initialFunds:S.finance.snapshot(p),initialMerchantLedgerIndex:p.merchant.ledger?.length||0,summary:null};
    if(S.stories?.onTripStart)S.stories.onTripStart(p);
  }
  function depart(p,a,ctx){
    ensure(!p.world.route,'ON_ROUTE','当前已经在路上');
    ensure(!p.market.visit||p.market.visit.settled,'MARKET_VISIT_OPEN','请先完整离开市场');
    ensure(S.time.phase(p)!==2,'DEPARTURE_AT_DUSK','请先过夜，次晨再出发');
    if(!p.trip)startTrip(p,ctx);
    ensure(p.trip.phase==='in_city'&&p.trip.routeIndex<plan.length,'RETURN_TASKS_PENDING','请先结束本次商旅');
    const leg=plan[p.trip.routeIndex];ensure(leg.from===p.world.city,'ROUTE_MISMATCH');
    ensure(!a.destinationCity||a.destinationCity===leg.to,'ROUTE_DESTINATION_MISMATCH','本趟商旅沿长安、敦煌、于阗、敦煌、长安的路线行进。');
    if(p.inventory.provisions<leg.days)ensure(a.acknowledgeSupplyWarning===true,'SUPPLY_WARNING_REQUIRED','补给少于下一段基础路程，请确认后再出发');
    p.world.route={id:S.util.id(p,'route'),index:p.trip.routeIndex,...clone(leg),startedTick:p.world.tick,remainingTicks:leg.days*3,traveledTicks:0,provisionTicks:0,eventCount:0,targetEvents:p.tripHistory.length===0?3:(S.random.next(p)<(leg.days===3?.6:.4)?2:3),eventDays:[],lastStarvationDay:null,prepared:Boolean(p.inn.prepared)};
    p.inn.prepared=false;p.trip.phase='traveling';p.presentation.tutorialSeen.preparation=true;
    // RC3 BUG-06/07: cargo bought in this city has now really left it.
    if(S.inventory?.departed)S.inventory.departed(p,leg.from);
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
    // COMMISSION v3.0: one real arrival = arrivalSequence + 1 and a fresh eligibleCargoCounts snapshot (S.commissions.arrived).
    if(S.commissions?.arrived)S.commissions.arrived(p);
    if(['dunhuang','khotan'].includes(p.world.city)&&!p.reputation.firstVisits[p.world.city]){p.reputation.firstVisits[p.world.city]=true;S.reputation.change(p,1,{type:'firstVisit',city:p.world.city});}
    if(p.world.city==='changan'){
      p.trip.arrivedChanganTick=p.world.tick;p.trip.returnStatus=p.world.tick-p.trip.startedAt<=66?'on_time':'overdue';
      p.trip.phase=S.time.phase(p)===2?'returned_at_dusk_pending_rest':'return_tasks';
    }else p.trip.phase='in_city';
    if(S.stories?.arrived)S.stories.arrived(p);
    if(p.world.city==='changan')p.trip.returnTasks=returnTaskStatus(p);
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
  // Old envelopes are validated before they are migrated, so nothing trip-specific is asserted here any more (the departure draft is gone).
  function validate(){return true;}
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
  function afterCommand(p,command,result){
    if(p.trip?.phase==='return_tasks'&&command.type==='market.leave'&&p.market.visit?.settled){p.trip.returnTasks||=returnTaskStatus(p);p.trip.returnTasks.market='processed';}
    return result;
  }
  function returnTaskStatus(p){
    const hasCargo=p.inventory.lots.some(l=>l.ownership==='playerOwned'&&!l.nonMarketable&&l.condition!=='destroyed'&&l.quantity>0);
    const merchantCargo=hasCargo&&p.merchant.cabinets.some(c=>!c.goodId||p.inventory.lots.some(l=>l.goodId===c.goodId&&l.ownership==='playerOwned'&&!l.nonMarketable&&l.condition!=='destroyed'&&l.quantity>0));
    // COMMISSION v3.0: commissions are not a return task — they simply keep running on their own deadline.
    return p.trip.returnTasks||{market:hasCargo?'pending':'not_applicable',merchant:p.merchant.status==='open'&&merchantCargo?'pending':'not_applicable'};
  }
  function resolveReturnTask(p,a){
    ensure(p.trip?.phase==='return_tasks'&&!p.world.route,'RETURN_NOT_READY');
    ensure(['market','merchant'].includes(a.task)&&['processed','deferred'].includes(a.decision),'INVALID_RETURN_DECISION');
    p.trip.returnTasks={...returnTaskStatus(p),[a.task]:a.decision};
    return {kind:'returnTaskDecision',modal:false,task:a.task,decision:a.decision};
  }
  function returnView(p){
    ensure(p.trip&&p.world.city==='changan'&&p.trip.arrivedChanganTick!==null,'NOT_RETURNED');
    const tasks={...returnTaskStatus(p)};delete tasks.commission;
    return {tasks,ready:Object.values(tasks).every(s=>s!=='pending'),phase:p.trip.phase,returnStatus:p.trip.returnStatus,arrivedTick:p.trip.arrivedChanganTick,requiresWarning:false};
  }
  function summary(p,trip){
    const records=p.journal.filter(r=>r.tripId===trip.id);
    const sales=records.filter(r=>r.type==='marketSell');
    const soldRevenue=sales.reduce((n,r)=>n+r.total,0),soldCost=sales.reduce((n,r)=>n+r.cost,0);
    // COMMISSION v3.0: the summary counts the commissions settled while this trip was running (results carry the trip of the settlement).
    const completed=p.commissions.results.filter(r=>r.tripId===trip.id&&['completed','delivered'].includes(r.status));
    const failures=p.commissions.results.filter(r=>r.tripId===trip.id&&r.status==='failed');
    const money=S.finance.snapshot(p);
    const categories={provisions:'补给支出',inn:'住宿费用',innWait:'候时支出',innTalk:'闲谈支出',newspaper:'商报支出',tavern:'营生收入',caravan:'营生收入·驼队装货',pattern:'营生收入·缀纹成章',weaving:'营生收入·于阗织坊',event:'随机事件收支',story:'商路奇缘推进／奖励',merchant:'商号办理'};
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
      commissions:{completed:completed.length,income:completed.reduce((n,r)=>n+(r.actualCash??r.cashReward??0),0),reputation:completed.reduce((n,r)=>n+(r.actualReputation??r.reputationReward??0),0),failed:failures.length,results:clone([...completed,...failures]),stillActive:p.commissions.active.filter(c=>S.commissions.activeStatuses.has(c.status)).length},
      reputation:{change:p.reputation.value-trip.initialReputation,current:p.reputation.value},other,
      funds:{cash:money.cash,totalFunds:money.totalAssets,totalDebt:money.totalDebt,netFunds:money.netFunds},
      important,firstCompletedTrip:p.tripHistory.length===0,tutorialEnabled:p.presentation.tutorialEnabled,
      continueLabel:'结束并返回长安'
    };
  }
  function requestEnd(p){
    returnView(p);ensure(p.trip.phase==='return_tasks','RETURN_NOT_READY','请先完成返抵事务');
    return {kind:'returnEndReady',modal:false};
  }
  function finalize(p){
    const view=returnView(p);ensure(p.trip.phase==='return_tasks','RETURN_NOT_READY');
    ensure(view.ready,'RETURN_TASKS_PENDING','请先处理返程事务，或明确选择暂不处理。');
    const trip=p.trip;
    // COMMISSION v3.0: no commission is settled here. 1) on-time reward, 2) immutable summary snapshot.
    if(trip.returnStatus==='on_time'&&!trip.onTimeRewardApplied){S.reputation.change(p,1,{type:'onTimeTrip',tripId:trip.id});trip.onTimeReward=1;trip.onTimeRewardApplied=true;}
    const snapshot=summary(p,trip);trip.summary=clone(snapshot);trip.phase='summary';
    return snapshot;
  }
  function finish(p){
    ensure(p.trip?.phase==='summary'&&p.trip.summary,'SUMMARY_NOT_READY');
    const trip=p.trip;
    ensure(!p.tripHistory.some(t=>t.id===trip.id),'TRIP_ALREADY_FINALIZED');
    p.tripHistory.push({id:trip.id,status:'completed',onTimeReturn:trip.returnStatus==='on_time',startedAt:trip.startedAt,arrivedAt:trip.arrivedChanganTick,summary:clone(trip.summary)});
    // RC3 BUG-14: terminal records go to history. COMMISSION v3.0: active commissions and the board are left exactly as they are.
    const archived=S.commissions?.archiveTerminal?S.commissions.archiveTerminal(p):null;
    p.trip=null;
    return {kind:'tripFinished',modal:false,archived};
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
  S.trip={plan,departureView,begin,depart,arrive,advanceRoute,journey,routeStateValid,validate,migrate,afterCommand,returnTaskStatus,resolveReturnTask,returnView,summary,requestEnd,finalize,finish,settleOverdue};
  for(const [name,fn]of Object.entries({begin,depart,journey,resolveReturnTask,requestEnd,finalize,finish}))S.commands.register('trip.'+name,fn);
  S.time.register('trip',{
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
