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
    const form=c.el('form','finance-form'),field=c.el('div','form-field');field.append(c.el('span','field-label',spec.label||'件数'));
    const maxOf=()=>typeof spec.max==='function'?spec.max():spec.max;
    const stepper=c.numericStepper({name:'quantity-'+spec.id,value:'1',min:1,max:maxOf,label:spec.label||'件数'}),input=stepper.input;field.append(stepper.element);form.append(field);
    const hint=c.el('p','form-hint'),submit=c.button(spec.button||'确认',()=>form.requestSubmit());
    function validate(){const n=Number(input.value),max=maxOf();const ok=/^[0-9]+$/.test(input.value)&&Number.isSafeInteger(n)&&n>0&&n<=max;submit.disabled=!ok||c.app.busy;if(ok)submit.dataset.busyDisabled='true';else delete submit.dataset.busyDisabled;hint.textContent=(spec.preview?spec.preview(n):'')+(spec.preview?' · ':'')+'最多'+max+(spec.unit||'件');stepper.refresh();return ok;}
    input.addEventListener('input',validate);form.addEventListener('submit',e=>{e.preventDefault();if(form.isConnected&&!input.disabled&&validate())spec.submit(Number(input.value));});form.append(hint,submit);b.append(form);validate();
  }
  function currentPrice(p,id){try{return S.market.price(p,id,S.core.context('price-view'));}catch(e){if(e.code==='MISSING_PRICE_AUTHORITY')return null;throw e;}}
  function marketRows(p){
    return S.inventory.goods.map((good,index)=>{
      const lots=p.inventory.lots.filter(l=>l.goodId===good.id&&l.ownership==='playerOwned'&&!l.nonMarketable&&l.condition!=='destroyed'&&l.quantity>0),held=lots.reduce((n,l)=>n+l.quantity,0),unlocked=S.inventory.unlocked(p,good.id),local=good.originCity===p.world.city;
      return {good,lots,held,unlocked,index,rank:held?1:local?(unlocked?2:3):(unlocked?4:5)};
    }).sort((a,b)=>a.rank-b.rank||a.index-b.index);
  }
  S.marketUI={marketRows};
  S.ui.registerPanel('market',{title:c=>({changan:'长安 · 西市',dunhuang:'敦煌 · 沙洲驿市',khotan:'于阗 · 绿洲市集'})[c.p.world.city],noClose:true,header(c,h){const meta=c.el('div','market-header-meta');meta.append(c.el('span','','货位 '+S.inventory.used(c.p)+' / '+S.inventory.capacity(c.p)),c.el('span','',c.formatMoney(c.p.cash)),c.el('small','',c.p.market.visit?.hadActivity&&!c.p.market.visit.settled?'离市后将过半日':'查看市价不耗时'));h.append(meta);},render(c,b){
    const visit=c.p.market.visit;
    if(!visit||visit.settled){info(c,b,S.time.phase(c.p)===2?'暮时不可进入市场。请安排歇息后再来。':'正在打开市场…');return;}
    const provision=c.el('section','market-product provisions-product');header(c,provision,'粮草补给');c.row('现有补给',c.p.inventory.provisions+'日份',provision);info(c,provision,'1钱／商队日份；补给大于0时共占1货位。');provision.append(c.button('购买粮草',()=>c.openSecondary('provisions')));b.append(provision);
    info(c,b,'只有真正运离购入城市的货物才计入有效交易额；同城囤放或转手不增加商誉。购买商报不耗时、不计市场活动。');
    const latestReport=S.newspapers.latest(c.p);
    for(const {good,lots,held,unlocked,rank}of marketRows(c.p)){
      const price=currentPrice(c.p,good.id),card=c.el('section','market-product'+(!unlocked?' locked-product':''));card.dataset.goodId=good.id;card.dataset.sortGroup=rank;
      const art=c.el('img','goods-art');art.src=S.assets['goods_'+good.id];art.alt=good.name;art.draggable=false;card.append(art);
      header(c,card,good.name);card.append(c.el('span','specialty-tag',cities[good.originCity]+'特产'));
      c.row('当前价',c.formatMoney(price),card);c.row('持有',held+'件',card);info(c,card,'每件'+good.slotCost+'货位'+(good.fragile?' · 易碎':''));
      if(held){const cost=lots.reduce((n,l)=>n+l.acquisitionPrice*l.quantity,0),value=lots.reduce((n,l)=>n+S.market.sellUnitPrice(c.p,l,price)*l.quantity,0);money(c,card,'持有货物成本',cost);money(c,card,'当前可售价值',value);money(c,card,'持仓盈亏',value-cost);}
      const judgement=latestReport?.productJudgements[good.id];if(judgement){c.row('商报判断',judgement.label,card);if(judgement.text)info(c,card,judgement.text);}
      if(!unlocked)info(c,card,'尚未打通此货货源。请达到相应商誉并建立供应往来。');
      const actions=c.el('div','market-card-actions');actions.append(c.button('买入',()=>c.openSecondary('trade-form',{mode:'buy',goodId:good.id}),{disabled:!unlocked||price===null}));
      actions.append(c.button('卖出',()=>c.openSecondary(lots.length===1?'trade-form':'sale-lots',lots.length===1?{mode:'sell',lotId:lots[0].id}:{goodId:good.id}),{disabled:!held}));card.append(actions);b.append(card);
    }
    const lots=c.p.inventory.lots.filter(l=>l.ownership==='playerOwned'&&!l.nonMarketable&&l.condition!=='destroyed');
    b.append(c.button('一键出售',()=>c.showModal({title:'出售全部可售货物？',body:'只出售可交易的自有货物，按当前实际卖价逐批结算。',actions:[{label:'返回',run:c.dismissModal},{label:'确认出售',run:async()=>{const r=await c.dispatch('market.sellAll',{visitId:visit.id});if(r)c.dismissModal();}}]}),{disabled:!lots.length}));
    b.append(c.button('查看委托',()=>c.openSecondary('commission')),c.button('查看商情',()=>c.openSecondary('inspect')));
  },footer(c,f){f.append(c.button('离开市场',()=>c.closePanel()));}});
  S.ui.registerPanel('sale-lots',{title:'选择出售货物',render(c,b,d){for(const lot of c.p.inventory.lots.filter(l=>l.goodId===d.goodId&&l.ownership==='playerOwned'&&!l.nonMarketable&&l.condition!=='destroyed'))b.append(c.button(lot.goodId+' × '+lot.quantity+' · '+conditions[lot.condition]+' · 买入价'+c.formatMoney(lot.acquisitionPrice),()=>c.openSecondary('trade-form',{mode:'sell',lotId:lot.id})));}});
  S.ui.registerPanel('trade-form',{title:'商品交易',render(c,b,d){
    const lot=d.mode==='sell'?c.p.inventory.lots.find(l=>l.id===d.lotId):null;if(d.mode==='sell'&&!lot){info(c,b,'这批货物已经售出。');b.append(c.button('返回市场',()=>c.closeSecondary()));return;}const good=S.inventory.good(lot?.goodId||d.goodId),normal=currentPrice(c.p,good.id);
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
    const status=c.el('section','pack-status');header(c,status,'驼队概况');
    for(const [name,label,value] of [['icon_camel_status_v01','骆驼',c.p.inventory.camelCount+'匹'],['icon_packgear_status_v01','行装',c.p.inn?.prepared?'已整理':'尚未整理']]){const item=c.el('div','pack-status-row'),art=c.el('img','pack-status-icon');art.src=S.assets[name];art.alt='';item.append(art);c.row(label,value,item);status.append(item);}
    c.row('货位',S.inventory.used(c.p)+' / '+S.inventory.capacity(c.p),status);c.row('补给',c.p.inventory.provisions+'日份'+(c.p.inventory.provisions?' · 占1货位':''),status);b.append(status);header(c,b,'随行货物');
    for(const lot of c.p.inventory.lots){const card=c.el('section','voucher-card');if(S.assets['goods_'+lot.goodId]){const art=c.el('img','goods-art');art.src=S.assets['goods_'+lot.goodId];art.alt=lot.goodId;card.append(art);}c.row(lot.storyLabel||lot.goodId,(lot.storyUnits?.length||lot.quantity)+'件 · '+conditions[lot.condition],card);if(lot.storyUnits)info(c,card,Object.entries(conditions).map(([key,label])=>label+lot.storyUnits.filter(u=>u.condition===key).length+'件').join(' · '));c.row('所属',ownership[lot.ownership],card);if(lot.ownership==='playerOwned'){money(c,card,'实际买入单价',lot.acquisitionPrice);c.row('购入地',cities[lot.acquisitionCity],card);}c.row('占用货位',lot.condition==='destroyed'?0:lot.quantity*lot.slotCost,card);if(lot.nonMarketable)info(c,card,'此物不可用于市场交易或商号上柜。');b.append(card);}
    if(!c.p.inventory.lots.length)info(c,b,'行囊里还没有货物。');
  }});
  function endTrip(c){
    const view=S.trip.returnView(c.p);
    if(!view.requiresWarning){c.dispatch('trip.finalize');return;}
    c.showModal({title:'还有未处理的委托',body:'结束本次商旅后，这些委托将按原失败规则处理。',actions:[{label:'返回处理',run:c.dismissModal},{label:'仍要结束（你还有未处理的委托哦）',run:async()=>{const r=await c.dispatch('trip.finalize',{confirmOutstanding:true});if(r)c.dismissModal();}}]});
  }
  function depart(c,destinationCity){
    // RC3 BUG-08: from 长安 the confirm only prepares a departure draft; the supply/cargo warnings and the 22-day period belong to 【开始行程】.
    if(!c.p.trip){c.dispatch('trip.begin').then(result=>{if(result){c.dismissModal();c.openPanel('departure-commissions')}});return}
    const v=S.trip.departureView(c.p),payload={destinationCity,acknowledgeSupplyWarning:v.requiresSupplyWarning,confirmMissedPickup:v.pendingPickupIds.length>0}
    const commit=async()=>{const result=await c.dispatch('trip.depart',payload);if(result){c.dismissModal();c.openPanel('trip')}}
    const extra=[v.requiresCargoWarning?'你没有携带可供交易的商品，仍可出发，但无法通过现有货物跑商获利。':'',v.pendingPickupIds.length?'离开后将无法领取部分委托货物，这些委托会按原规则失效。':''].filter(Boolean).join('\n')
    const cancel=()=>{c.dismissModal();c.closePanel()}
    c.showModal({title:v.requiresSupplyWarning?'粮草可能不足':'确认出发',body:(v.requiresSupplyWarning?'当前粮草：'+c.p.inventory.provisions+'日份\n':'')+'此程预计'+v.leg.days+'日。'+(v.requiresSupplyWarning?'\n途中断粮可能需要高价补给、绕路寻粮、消耗干果或承担延误。':'')+(extra?'\n'+extra:''),actions:[{label:'返回城中',run:cancel},{label:v.requiresSupplyWarning?'继续出发':'确认出发',run:commit}]})
  }
  S.ui.registerPanel('trip',{title:c=>c.p.world.route?'旅程':c.p.trip?.arrivedChanganTick!==null&&c.p.trip?.arrivedChanganTick!==undefined?'商旅':'出发',noClose:c=>Boolean(c.p.world.route),render(c,b){
    const trip=c.p.trip,route=c.p.world.route;
    if(route){if(S.ui.renderTravelArt)S.ui.renderTravelArt(c,b,route);c.row('前往',cities[route.to],b);c.row('本段基础路程',route.days+'日',b);c.row('剩余路程',Math.floor(route.remainingTicks/3)+'日'+route.remainingTicks%3+'个时段',b);c.row('现有补给',c.p.inventory.provisions+'日份',b);return;}
    if(trip?.arrivedChanganTick!==null&&trip?.arrivedChanganTick!==undefined){
      c.row('返程状态',trip.returnStatus==='on_time'?'按期归来':'已逾期',b);c.row('返抵',c.date(trip.arrivedChanganTick),b);
      if(trip.phase==='returned_at_dusk_pending_rest'){info(c,b,'暮时抵达。请先安排歇息，次晨再处理返程事务。');b.append(c.button('安排歇息',()=>c.openPanel('inn')));}
      else b.append(c.button('处理返程事务',()=>c.openSecondary('return-tasks')));return;
    }
    const view=S.trip.departureView(c.p);if(view.leg){
      c.row('当前粮草',c.p.inventory.provisions+'日份',b);header(c,b,'选择目的地');
      const destinations={changan:['dunhuang'],dunhuang:['changan','khotan'],khotan:['dunhuang']}[c.p.world.city];
      for(const destination of destinations)b.append(c.button(cities[destination],()=>depart(c,destination),{disabled:!view.canDepart||destination!==view.leg.to}));
      if(c.p.world.city==='dunhuang')info(c,b,'本趟商旅下一站：'+cities[view.leg.to]+'。正式路线：长安 → 敦煌 → 于阗 → 敦煌 → 长安。');
      if(S.time.phase(c.p)===2)info(c,b,'暮时请先安排歇息。');
      if(view.draft){info(c,b,'出发准备已保存（关闭面板不会启动商期）。');b.append(c.button('出发前委托 · 已选定 '+view.draft.selectedCount+' / '+view.draft.capacity,()=>c.openSecondary('departure-commissions')));}
    }
  }});
  function startFromDraft(c){
    // RC3 BUG-08: the only place where the trip (clock, commissions, route) actually starts. Same warning texts as the former 确认出发 step.
    const v=S.trip.departureView(c.p),go=async()=>{const result=await c.dispatch('trip.depart',{destinationCity:'dunhuang',acknowledgeSupplyWarning:v.requiresSupplyWarning,confirmMissedPickup:v.pendingPickupIds.length>0});if(result){c.dismissModal();c.openPanel('trip')}}
    const extra=[v.requiresCargoWarning?'你没有携带可供交易的商品，仍可出发，但无法通过现有货物跑商获利。':'',v.pendingPickupIds.length?'离开后将无法领取部分委托货物，这些委托会按原规则失效。':''].filter(Boolean).join('\n')
    c.showModal({title:v.requiresSupplyWarning?'粮草可能不足':'确认出发',body:(v.requiresSupplyWarning?'当前粮草：'+c.p.inventory.provisions+'日份\n':'')+'此程预计'+v.leg.days+'日。'+(v.requiresSupplyWarning?'\n途中断粮可能需要高价补给、绕路寻粮、消耗干果或承担延误。':'')+(extra?'\n'+extra:'')+'\n点击【开始行程】后，22日商期正式开始。',actions:[{label:'返回准备',run:c.dismissModal},{label:'开始行程',run:go}]})
  }
  S.ui.registerPanel('departure-commissions',{title:'出发前委托',render(c,b){
    const view=S.trip.departureView(c.p),draft=view.draft;
    if(!draft){info(c,b,c.p.trip?'本趟商旅已经开始。':'当前没有出发准备。');return;}
    info(c,b,'这里只是准备：关闭本面板不会启动商期，也不影响未启程时的经营。点击【开始行程】后，22日商期才开始，选定的委托才正式承接。');
    c.row('可同时承接',draft.selectedCount+' / '+draft.capacity,b);
    if(!draft.rows.length)info(c,b,'本趟没有委托候选（商誉达到5后开放普通委托）。');
    for(const task of draft.rows){
      const card=c.el('section','voucher-card');c.row(task.title,task.goodId+' × '+task.quantity,card);c.row('属性',task.attributeLabels.join('、'),card);c.row('交付',cities[task.deliveryCity]+(task.type==='delivery'?' · 取货 '+cities[task.pickupCity]:task.type==='procurement'?' · 采买 '+cities[task.procurementCity]:''),card);money(c,card,'约定报酬',task.rewardCash);
      if(task.acceptAt)info(c,card,'到达'+task.acceptAt+'后可承接。');
      else if(!task.selectable)info(c,card,'本期已无法承接。');
      else card.append(c.button(task.selected?'取消选定':'选定（启程时承接）',()=>c.dispatch('trip.draftSelect',{commissionId:task.commissionId,selected:!task.selected})));
      if(task.selected&&task.willPickup===false)info(c,card,'货位不足以领取该委托货物，启程前请腾出货位或取消选定。');
      card.append(c.button('查看详情',()=>c.openSecondary('commission-detail',{commissionId:task.commissionId,draft:true})));b.append(card);
    }
  },footer(c,f){const view=S.trip.departureView(c.p);f.append(c.button('开始行程',()=>startFromDraft(c),{disabled:!view.canDepart||Boolean(view.draft&&view.draft.blockedPickups.length)}));}});
  S.ui.registerPanel('return-tasks',{title:'返程事务',render(c,b){
    if(c.p.trip?.phase!=='return_tasks'){info(c,b,'请先安排歇息，次晨处理返程事务。');return;}
    const view=S.trip.returnView(c.p),labels={commission:'委托',market:'市场',merchant:'商号'};
    if(view.graceDeadlineLabel)info(c,b,'冻结委托可办理至'+view.graceDeadlineLabel+'；交付时仍检查当前库存。');
    for(const [task,status]of Object.entries(view.tasks)){
      if(status==='not_applicable')continue;
      const card=c.el('section','voucher-card');header(c,card,labels[task]);info(c,card,{pending:'待处理',processed:'已处理',deferred:'已选择暂不处理'}[status]);
      if(task==='commission')card.append(c.button('查看返程委托',()=>c.openSecondary('commission')));
      if(task==='market')card.append(c.button('前往市场',()=>c.openPanel('market'),{disabled:S.time.phase(c.p)===2}));
      if(task==='merchant')card.append(c.button('转入商号货物',()=>c.openSecondary('merchant_business',{returnTasks:true})));
      if(status==='pending'){
        if(task==='merchant')card.append(c.button('已处理商号事务',()=>c.dispatch('trip.resolveReturnTask',{task,decision:'processed'})));
        card.append(c.button('暂不处理'+labels[task],()=>c.dispatch('trip.resolveReturnTask',{task,decision:'deferred'})));
      }
      b.append(card);
    }
    if(view.ready)info(c,b,'返程事务已处理完毕，可查看本趟商旅总结。');
  },footer(c,f){if(c.p.trip?.phase==='return_tasks')f.append(c.button('结束本次商旅',()=>endTrip(c),{disabled:!S.trip.returnView(c.p).ready}));}});
  S.ui.registerPanel('return-commissions',{title:'处理宽限委托',render(c,b){
    if(c.p.trip?.phase!=='return_tasks'){info(c,b,'返程事务状态已更新。');return;}
    const view=S.trip.returnView(c.p),ids=new Set(view.pendingGraceIds),rows=S.commissions.snapshot(c.p,S.core.context('return-ui')).active.filter(x=>ids.has(x.commissionId));
    if(view.graceDeadlineLabel)info(c,b,'交付期限：'+view.graceDeadlineLabel+'。只保留抵达时已冻结的委托；交付时按当前合格货物验收。');
    if(!rows.length)info(c,b,'宽限委托已处理完毕');
    for(const task of rows){const card=c.el('section','voucher-card');c.row(task.title,task.goodId+' × '+task.quantity,card);card.append(c.button('查看委托',()=>c.openSecondary('commission-detail',{commissionId:task.commissionId,returnGrace:true})));b.append(card);}
  },footer(c,f){f.append(c.button('返回返程事务',c.closeSecondary));}});
  S.ui.registerPanel('settings-controls',{render(c,b){
    for(const [key,label]of [['soundEnabled','声音']]){c.row(label,c.state.preferences[key]?'开启':'关闭',b,()=>c.dispatch('settings.update',{key,value:!c.state.preferences[key]}));}
  }});
  S.ui.registerPanel('help',{title:'玩法说明',render(c,b){
    for(const line of S.content.helpText.split('\n'))if(line.trim())c.paragraph(b,line);
  }});
  S.ui.registerPanel('reputation',{title:'商誉详情',render(c,b){
    c.row('当前商誉',c.p.reputation.value,b);c.row('已累计有效交易额',c.formatMoney(c.p.reputation.turnover),b);
    for(const r of c.p.journal.filter(r=>r.type==='reputation').slice(-50).reverse()){c.row(({marketBuy:'买入商品',marketSell:'卖出商品',firstVisit:'首次抵达',onTimeTrip:'按期商旅',tripOverdue:'商期逾期','loan-overdue':'贷款逾期',commission:'委托完成'})[r.source?.type]||'商誉变化',signed(r.actual),b);info(c,b,c.date(r.tick));}
  }});
  S.ui.registerResult('marketSummary',(c,b,r)=>{info(c,b,'已过半日 · 当前：'+c.date(r.currentTick));if(r.cashDelta)money(c,b,'随身铜钱净变化',r.cashDelta);for(const x of r.bought)c.row('买入',x.goodId+' × '+x.quantity,b);for(const x of r.sold)c.row('卖出',x.goodId+' × '+x.quantity,b);if(r.provisions)c.row('补给','+'+r.provisions+'日份',b);if(r.slotsChanged)c.row('当前货位',r.slots+' / '+S.inventory.capacity(c.p),b);});
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

  });
})(globalThis.Silk=globalThis.Silk||{});
