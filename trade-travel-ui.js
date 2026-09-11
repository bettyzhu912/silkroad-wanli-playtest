(function(S){
  'use strict';
  const cities={changan:'长安',dunhuang:'敦煌',khotan:'于阗'};
  const conditions={intact:'完好',damaged:'受损',destroyed:'损毁'};
  const ownership={playerOwned:'自有货物',commissionOwned:'委托专用',storyOwned:'剧情专用'};
  const signed=n=>n>0?'+'+n:String(n);
  function header(c,b,t){b.append(c.el('h3','section-title',t));}
  function info(c,b,text){c.paragraph(b,text,'form-hint');}
  function money(c,b,label,value){c.row(label,c.formatMoney(value),b);}
  function gap(c,b,text){c.paragraph(b,'工程预览：'+text,'engineering-note');}
  function quantityForm(c,b,spec){
    const form=c.el('form','finance-form'),label=c.el('label','field-label',spec.label||'件数'),input=c.el('input','amount-input');
    input.name='quantity-'+spec.id;input.type='text';input.inputMode='numeric';input.pattern='[0-9]*';input.autocomplete='off';input.value='1';label.append(input);form.append(label);
    const hint=c.el('p','form-hint'),submit=c.button(spec.button||'确认',()=>form.requestSubmit());
    function validate(){const n=Number(input.value),max=typeof spec.max==='function'?spec.max():spec.max;const ok=/^[0-9]+$/.test(input.value)&&Number.isSafeInteger(n)&&n>0&&n<=max;submit.disabled=!ok||c.app.busy;if(ok)submit.dataset.busyDisabled='true';else delete submit.dataset.busyDisabled;hint.textContent=spec.preview?spec.preview(n):'最多'+max+'件';return ok;}
    input.addEventListener('input',validate);form.addEventListener('submit',e=>{e.preventDefault();if(form.isConnected&&!input.disabled&&validate())spec.submit(Number(input.value));});form.append(hint,submit);b.append(form);validate();
  }
  function currentPrice(p,id){try{return S.market.price(p,id,S.core.context('price-view'));}catch(e){if(e.code==='MISSING_PRICE_AUTHORITY')return null;throw e;}}
  S.ui.registerPanel('market',{title:'市场',render(c,b){
    const visit=c.p.market.visit;
    if(!visit||visit.settled){
      info(c,b,'查看商品不耗时；有买卖、补给或商报操作后，离开市场统一耗时1个时段。');
      b.append(c.button('进入'+cities[c.p.world.city]+'市场',()=>c.dispatch('market.enter'),{disabled:S.time.phase(c.p)===2||Boolean(c.p.world.route)}));
      if(S.time.phase(c.p)===2)info(c,b,'市场已经收市，请安排歇息后再来。');return;
    }
    c.row('可用货位',S.inventory.available(c.p)+' / '+S.inventory.capacity(c.p),b);money(c,b,'随身铜钱',c.p.cash);
    info(c,b,'同城同日转手的货物不计入商誉积累。');
    if(c.p.market.pendingPurchaseTurnover)info(c,b,'待确认购入成交额：'+c.formatMoney(c.p.market.pendingPurchaseTurnover)+'。持货跨日或运离购入城市后计入商誉。');
    b.append(c.button('旅途补给',()=>c.openSecondary('provisions')),c.button('商报',()=>c.openSecondary('newspaper')));
    header(c,b,'购买商品');
    const latestReport=S.newspapers.latest(c.p);
    for(const good of S.inventory.goods){
      const unlocked=S.inventory.unlocked(c.p,good.id),price=currentPrice(c.p,good.id),card=c.el('section','voucher-card');
      c.row(good.name,unlocked?(price===null?'价格规则待补齐':c.formatMoney(price)):'货源尚未建立',card);
      info(c,card,'每件'+good.slotCost+'货位'+(good.fragile?' · 易碎':'')+(['绢帛','纸张','于阗丝织'].includes(good.id)?' · 怕潮':''));
      const judgement=latestReport?.productJudgements[good.id];
      if(judgement){c.row('商报判断',judgement.label,card);if(judgement.text)info(c,card,judgement.text);info(c,card,'本城最新一期 · '+c.date(latestReport.issueWorldDay*3).replace(/·晨$/,''));}
      card.append(c.button('买入',()=>c.openSecondary('trade-form',{mode:'buy',goodId:good.id}),{disabled:!unlocked||price===null}));b.append(card);
    }
    header(c,b,'出售行囊货物');
    const lots=c.p.inventory.lots.filter(l=>l.ownership==='playerOwned'&&!l.nonMarketable&&l.condition!=='destroyed');
    for(const lot of lots){const card=c.el('section','voucher-card'),normal=currentPrice(c.p,lot.goodId),unit=normal===null?null:S.market.sellUnitPrice(c.p,lot,normal);c.row(lot.goodId,lot.quantity+'件 · '+conditions[lot.condition],card);money(c,card,'实际买入单价',lot.acquisitionPrice);if(unit!==null){money(c,card,'当前卖出单价',unit);money(c,card,'每件盈亏',unit-lot.acquisitionPrice);}card.append(c.button('出售',()=>c.openSecondary('trade-form',{mode:'sell',lotId:lot.id}),{disabled:unit===null}));b.append(card);}
    if(!lots.length)info(c,b,'暂无可以出售的自有货物。');
    b.append(c.button('一键出售',()=>c.showModal({title:'出售全部可售货物？',body:'只出售行囊中可交易的自有货物，按当前实际卖价逐批结算。',actions:[{label:'返回',run:c.dismissModal},{label:'确认出售',run:async()=>{const r=await c.dispatch('market.sellAll',{visitId:visit.id});if(r)c.dismissModal();}}]}),{disabled:!lots.length||lots.some(l=>currentPrice(c.p,l.goodId)===null)}));
    if(S.inventory.goods.some(g=>currentPrice(c.p,g.id)===null))gap(c,b,'正式价格数据缺失；商品交易尚不能作为正式跑商验收。补给仍按已确认价格办理。');
  },footer(c,f){f.append(c.button('离开市场',()=>c.closePanel()));}});
  S.ui.registerPanel('trade-form',{title:'商品交易',render(c,b,d){
    const lot=d.mode==='sell'?c.p.inventory.lots.find(l=>l.id===d.lotId):null,good=S.inventory.good(lot?.goodId||d.goodId),normal=currentPrice(c.p,good.id);
    if(normal===null){gap(c,b,'缺少正式市场价格。');return;}
    const supplierChannel=!lot&&good.originCity===c.p.world.city&&Boolean(c.p.merchant.suppliers[good.id]);
    const quote=lot?null:S.market.buyQuote(c.p,good.id,supplierChannel,S.core.context('quote-view'));
    const unit=lot?S.market.sellUnitPrice(c.p,lot,normal):quote.unitPrice;c.row('商品',good.name,b);money(c,b,'单价',unit);
    if(quote?.supplierDiscountRate)info(c,b,'按已建立的供应往来熟价采购；原城回售不超过实际买入成本。');
    quantityForm(c,b,{id:d.lotId||good.id,button:lot?'确认出售':'确认买入',max:lot?lot.quantity:Math.min(Math.floor(c.p.cash/unit),Math.floor(S.inventory.available(c.p)/good.slotCost)),preview:n=>'合计'+c.formatMoney(Number.isSafeInteger(n*unit)?n*unit:0),submit:async quantity=>{
      const payload={visitId:c.p.market.visit.id,quantity,...(lot?{lotId:lot.id}:{goodId:good.id,supplierChannel})};await c.dispatch(lot?'market.sell':'market.buy',payload);
    }});
  }});
  S.ui.registerPanel('provisions',{title:'旅途补给',render(c,b){
    const leg=S.trip.plan[c.p.trip?.routeIndex||0];c.row('现有补给',c.p.inventory.provisions+'日份',b);info(c,b,'1钱购买整支商队1日份补给。补给大于0时，整体占1个货位。');
    if(leg)info(c,b,'下一程：'+cities[leg.from]+'至'+cities[leg.to]+'，基础路程'+leg.days+'日。途中事件可能延误。');
    if(!c.p.market.visit||c.p.market.visit.settled){info(c,b,'请先进入市场。');return;}
    quantityForm(c,b,{id:'provisions',label:'日份',button:'购买补给',max:c.p.inventory.provisions>0||S.inventory.available(c.p)>=1?c.p.cash:0,preview:n=>'支出'+c.formatMoney(Number.isSafeInteger(n)?n:0),submit:quantity=>c.dispatch('market.provisions',{visitId:c.p.market.visit.id,quantity})});
  }});
  S.ui.registerPanel('pack',{title:'行囊',render(c,b){
    c.row('货位',S.inventory.used(c.p)+' / '+S.inventory.capacity(c.p),b);c.row('补给',c.p.inventory.provisions+'日份'+(c.p.inventory.provisions?' · 占1货位':''),b);c.row('骆驼',c.p.inventory.camelCount+'匹',b);
    for(const lot of c.p.inventory.lots){const card=c.el('section','voucher-card');c.row(lot.storyLabel||lot.goodId,(lot.storyUnits?.length||lot.quantity)+'件 · '+conditions[lot.condition],card);if(lot.storyUnits)info(c,card,Object.entries(conditions).map(([key,label])=>label+lot.storyUnits.filter(u=>u.condition===key).length+'件').join(' · '));c.row('所属',ownership[lot.ownership],card);if(lot.ownership==='playerOwned'){money(c,card,'实际买入单价',lot.acquisitionPrice);c.row('购入地',cities[lot.acquisitionCity],card);}c.row('占用货位',lot.condition==='destroyed'?0:lot.quantity*lot.slotCost,card);if(lot.nonMarketable)info(c,card,'此物不可用于市场交易或商号上柜。');b.append(card);}
    if(!c.p.inventory.lots.length)info(c,b,'行囊里还没有货物。');
  }});
  function endTrip(c){
    const view=S.trip.returnView(c.p);
    if(!view.requiresWarning){c.dispatch('trip.finalize');return;}
    c.showModal({title:'还有未处理的委托',body:'结束本次商旅后，这些委托将按原失败规则处理。',actions:[{label:'返回处理',run:c.dismissModal},{label:'仍要结束（你还有未处理的委托哦）',run:async()=>{const r=await c.dispatch('trip.finalize',{confirmOutstanding:true});if(r)c.dismissModal();}}]});
  }
  function depart(c){
    const v=S.trip.departureView(c.p),payload={acknowledgeSupplyWarning:v.requiresSupplyWarning,confirmMissedPickup:v.pendingPickupIds.length>0};
    const commit=async()=>{const result=await c.dispatch('trip.depart',payload);if(result){c.dismissModal();c.openPanel('trip');}};
    const extra=[v.requiresCargoWarning?'你没有携带可供交易的商品，仍可出发，但无法通过现有货物跑商获利。':'',v.pendingPickupIds.length?'离开后将无法领取部分委托货物，这些委托会按原规则失效。':''].filter(Boolean).join('\n');
    const cancel=()=>{c.dismissModal();c.closePanel();};
    c.showModal({title:v.requiresSupplyWarning?'粮草可能不足':'确认出发',body:(v.requiresSupplyWarning?'当前粮草：'+c.p.inventory.provisions+'日份\n':'')+'此程预计'+v.leg.days+'日。'+(v.requiresSupplyWarning?'\n途中断粮可能需要高价补给、绕路寻粮、消耗干果或承担延误。':'')+(extra?'\n'+extra:''),actions:[{label:'返回城中',run:cancel},{label:v.requiresSupplyWarning?'继续出发':'确认出发',run:commit}]});
  }
  S.ui.registerPanel('trip',{title:c=>c.p.world.route?'旅程':c.p.trip?.arrivedChanganTick!==null&&c.p.trip?.arrivedChanganTick!==undefined?'商旅':'出发',noClose:c=>Boolean(c.p.world.route),render(c,b){
    const trip=c.p.trip,route=c.p.world.route;
    if(route){if(S.ui.renderTravelArt)S.ui.renderTravelArt(c,b,route);c.row('前往',cities[route.to],b);c.row('本段基础路程',route.days+'日',b);c.row('剩余路程',Math.floor(route.remainingTicks/3)+'日'+route.remainingTicks%3+'个时段',b);c.row('现有补给',c.p.inventory.provisions+'日份',b);return;}
    if(trip?.arrivedChanganTick!==null&&trip?.arrivedChanganTick!==undefined){
      c.row('返程状态',trip.returnStatus==='on_time'?'按期归来':'已逾期',b);c.row('返抵',c.date(trip.arrivedChanganTick),b);
      if(trip.phase==='returned_at_dusk_pending_rest'){info(c,b,'暮时抵达。请先安排歇息，次晨再处理返程事务。');b.append(c.button('安排歇息',()=>c.openPanel('inn')));}
      else b.append(c.button('处理返程事务',()=>c.openSecondary('return-tasks')));return;
    }
    const view=S.trip.departureView(c.p);if(view.leg){c.row('当前粮草',c.p.inventory.provisions+'日份',b);header(c,b,'选择目的地');b.append(c.button(cities[view.leg.to],()=>depart(c),{disabled:!view.canDepart}));if(S.time.phase(c.p)===2)info(c,b,'暮时请先安排歇息。');}
  },footer(c,f){if(c.p.world.route)f.append(c.button('继续赶路',()=>c.dispatch('trip.journey')));}});
  S.ui.registerPanel('return-tasks',{title:'返程事务',render(c,b){
    if(c.p.trip?.phase!=='return_tasks'){info(c,b,'返程事务状态已更新。');return;}
    const view=S.trip.returnView(c.p),merchantOpen=c.p.merchant.status==='open';
    info(c,b,'商旅将尽，可在此处理返程后的必要事务。');
    if(view.graceDeadlineLabel)info(c,b,view.graceClosePending?'本次返程宽限已结束，请先确认过夜结果。':'冻结委托可办理至'+view.graceDeadlineLabel+'；离开市场后仍可在期限内交付。');
    if(view.pendingGraceIds.length)b.append(c.button('处理宽限委托',()=>c.openSecondary('return-commissions')));
    if(merchantOpen)b.append(c.button('商号事务',()=>c.openSecondary('merchant_business',{returnTasks:true})));
    if(!view.pendingGraceIds.length&&!merchantOpen)info(c,b,'返程事务已处理完毕');
  },footer(c,f){if(c.p.trip?.phase==='return_tasks')f.append(c.button('结束本次商旅',()=>endTrip(c)));}});
  S.ui.registerPanel('return-commissions',{title:'处理宽限委托',render(c,b){
    if(c.p.trip?.phase!=='return_tasks'){info(c,b,'返程事务状态已更新。');return;}
    const view=S.trip.returnView(c.p),ids=new Set(view.pendingGraceIds),rows=S.commissions.snapshot(c.p,S.core.context('return-ui')).active.filter(x=>ids.has(x.commissionId));
    if(view.graceDeadlineLabel)info(c,b,'交付期限：'+view.graceDeadlineLabel+'。只保留抵达时已冻结的委托；交付时按当前合格货物验收。');
    if(!rows.length)info(c,b,'宽限委托已处理完毕');
    for(const task of rows){const card=c.el('section','voucher-card');c.row(task.title,task.goodId+' × '+task.quantity,card);card.append(c.button('查看委托',()=>c.openSecondary('commission-detail',{commissionId:task.commissionId,returnGrace:true})));b.append(card);}
  },footer(c,f){f.append(c.button('返回返程事务',c.closeSecondary));}});
  S.ui.registerPanel('settings-controls',{render(c,b){
    for(const [key,label]of [['tutorialEnabled','新手提示'],['soundEnabled','声音']]){c.row(label,c.state.preferences[key]?'开启':'关闭',b,()=>c.dispatch('settings.update',{key,value:!c.state.preferences[key]}));}
  }});
  S.ui.registerPanel('help',{title:'玩法说明',render(c,b){
    for(const line of S.content.helpText.split('\n'))if(line.trim())c.paragraph(b,line);
    b.append(c.button(c.p.presentation.tutorialEnabled?'关闭新手提示':'重新开启新手提示',()=>c.dispatch('settings.update',{key:'tutorialEnabled',value:!c.p.presentation.tutorialEnabled})));
  }});
  S.ui.registerPanel('reputation',{title:'商誉详情',render(c,b){
    c.row('当前商誉',c.p.reputation.value,b);c.row('已累计有效交易额',c.formatMoney(c.p.reputation.turnover),b);
    for(const r of c.p.journal.filter(r=>r.type==='reputation').slice(-50).reverse()){c.row(({marketBuy:'买入商品',marketSell:'卖出商品',firstVisit:'首次抵达',onTimeTrip:'按期商旅',tripOverdue:'商期逾期','loan-overdue':'贷款逾期',commission:'委托完成'})[r.source?.type]||'商誉变化',signed(r.actual),b);info(c,b,c.date(r.tick));}
  }});
  S.ui.registerResult('marketBuy',(c,b,r)=>{c.row('买入',r.goodId+' × '+r.quantity,b);money(c,b,'实际支出',r.total);});
  S.ui.registerResult('marketSell',(c,b,r)=>{c.row('卖出',r.goodId+' × '+r.quantity,b);money(c,b,'售货收入',r.total);money(c,b,'对应成本',r.cost);money(c,b,'贸易利润',r.profit);});
  S.ui.registerResult('marketSellAll',(c,b,r)=>{for(const x of r.items)c.row(x.goodId+' × '+x.quantity,c.formatMoney(x.total),b);money(c,b,'售货收入合计',r.cashDelta);});
  S.ui.registerResult('provisionsBought',(c,b,r)=>{c.row('购入补给',r.quantity+'日份',b);money(c,b,'支出',-r.cashDelta);c.row('现有补给',r.totalProvisions+'日份',b);});
  S.ui.registerResult('tripSummary',(c,b,r)=>{
    const night=r.graceEnd?.overnightFeedback;
    if(night){header(c,b,'最后一夜');c.row('昨夜宿费',c.formatMoney(night.lodgingCost),b);c.row('当前',night.dateLabel||c.date(night.after.tick),b);c.paragraph(b,night.text);if(night.explanation)c.paragraph(b,night.explanation);for(const e of night.effects||[]){if(e.goodId)c.row(e.goodId,e.quantity+'件 · '+(e.condition==='damaged'?'受损':e.type==='cargo_remove'?'失去':'状态已更新'),b);}}
    const j=r.journey;header(c,b,'行程');c.row('出发',c.date(j.startedTick),b);c.row('返抵',c.date(j.arrivedTick),b);c.row('实际路线',j.route.map(x=>cities[x]).join(' → '),b);c.row('商旅耗时',Math.floor(j.elapsedTicks/3)+'日'+j.elapsedTicks%3+'个时段 / 22日',b);c.row('返程状态',j.status==='on_time'?'按期归来':'已逾期',b);
    if(j.status==='on_time')c.row('按期商誉奖励',signed(j.onTimeReward),b);else{if(j.overdueTick!==null)c.row('发生逾期','商旅第'+(Math.floor((j.overdueTick-j.startedTick)/3)+1)+'日·'+['晨','午','暮'][j.overdueTick%3],b);if(j.lostOnTimeReward)c.row('失去按期奖励','商誉+'+j.lostOnTimeReward,b);if(j.overduePenalty!==0)c.row('逾期商誉处罚',j.overduePenalty,b);}
    header(c,b,'贸易结果');money(c,b,'售货收入',r.trade.salesRevenue);money(c,b,'购货成本',r.trade.purchaseCost);money(c,b,'贸易利润',r.trade.profit);
    header(c,b,'委托与商誉');c.row('普通委托完成',r.commissions.completed+'项',b);money(c,b,'普通委托收入',r.commissions.income);c.row('普通委托获得商誉',signed(r.commissions.reputation),b);c.row('本次商誉变化',signed(r.reputation.change),b);c.row('当前商誉',r.reputation.current,b);if(r.commissions.failed)c.row('失败／逾期委托',r.commissions.failed+'项',b);for(const x of r.commissions.results)if(x.rewardRatio<1){c.row('受损交付',x.title+' · 实得'+c.formatMoney(x.actualCash),b);info(c,b,'原约报酬'+c.formatMoney(x.originalReward)+'，按'+Math.round(x.rewardRatio*100)+'%交付结算。');}
    if(r.other.length){header(c,b,'其他收支');for(const x of r.other)money(c,b,x.label,x.amount);}
    header(c,b,'期末资金');money(c,b,'随身铜钱',r.funds.cash);money(c,b,'资金总额',r.funds.totalFunds);money(c,b,'负债合计',r.funds.totalDebt);money(c,b,'净资金',r.funds.netFunds);
    if(r.important.length){header(c,b,'重要结果');for(const x of r.important)info(c,b,x.text);}
    if(r.firstCompletedTrip&&r.tutorialEnabled){header(c,b,'初次商旅完成');c.paragraph(b,'你已经掌握最基本的跑商方式。之后可以继续出发，也可以留在长安经营；更多玩法会随商誉与经营进度逐步开放。');b.append(c.button('查看玩法说明',()=>c.openSecondary('help')));}
  });
})(globalThis.Silk=globalThis.Silk||{});
