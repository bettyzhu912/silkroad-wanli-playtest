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
  function currentPrice(p,id){try{return S.market.price(p,id,S.core.context('price-view'));}catch(e){if(e.code==='MISSING_PRICE_AUTHORITY')return null;throw e;}}
  function marketRows(p){
    return S.inventory.goods.map((good,index)=>{
      const lots=p.inventory.lots.filter(l=>l.goodId===good.id&&l.ownership==='playerOwned'&&!l.nonMarketable&&l.condition!=='destroyed'&&l.quantity>0),held=lots.reduce((n,l)=>n+l.quantity,0),unlocked=S.inventory.unlocked(p,good.id),local=good.originCity===p.world.city;
      return {good,lots,held,unlocked,index,rank:held?1:local?(unlocked?2:3):(unlocked?4:5)};
    }).sort((a,b)=>a.rank-b.rank||a.index-b.index);
  }
  // ---- 市场交易页 UI/UX（已确认设计实施稿 2026-09-13 + MARKET_UI_CORRECTION v0.2）: centred title, three-column status, time hint,
  // 25/75 goods cards (title + tags / 当前价格·货位 / 持有·商报 / holding summary when held), in-card buy/sell expand opened only by
  // the 买入⌄ / 卖出⌄ buttons (one normal card at a time), compact stepper with no affordability clamp, one live feedback line under
  // the confirm, goodId-level aggregation (no lot exposure), provisions special card, card-level button tier, three equal bottom
  // entries, MARKET_EXIT_CONFIRM (0 tick) → 确认离市 = atomic close + advance once, then straight back to the city.
  const expandState={visitId:null,goodId:null,mode:null,provisions:false};
  function syncExpand(p){const id=p.market.visit&&!p.market.visit.settled?p.market.visit.id:null;if(expandState.visitId!==id){expandState.visitId=id;expandState.goodId=null;expandState.mode=null;expandState.provisions=false;}}
  function iconImg(c,name){const img=c.el('img','ui-icon');img.src=S.assets['global_icon_'+name+'_v01'];img.alt='';img.draggable=false;return img;}
  function reportState(p){try{const a=S.newspapers.availability(p);return a.owned?'latest':a.latest?'history':'none';}catch(e){return S.newspapers.latest(p)?'history':'none';}}
  const reportLabels={latest:'最新',history:'历史',none:'未购买'};
  function reportStatus(p){return reportLabels[reportState(p)];}
  function statusCell(c,iconName,label,value,stateClass){const cell=c.el('span','market-status-cell');cell.append(iconImg(c,iconName),c.el('span','status-label',label+' '),c.el('b','status-value'+(stateClass?' '+stateClass:''),value));return cell;}
  function tag(c,text,kind){return c.el('span','market-tag '+(kind==='specialty'?'tag-specialty':'tag-attr'),text);}
  function statItem(c,label,value,valueClass){const item=c.el('span','stat-item');item.append(c.el('span','stat-label',label+' '),c.el('b','stat-value'+(valueClass?' '+valueClass:''),value));return item;}
  function statLine(c,parent,items,className){const line=c.el('div',className||'market-stat-line');for(const it of items)line.append(Array.isArray(it)?statItem(c,it[0],it[1],it[2]):it);parent.append(line);return line;}
  const signedMoney=(c,n)=>(n>0?'+':'')+c.formatMoney(n);
  function marketStatus(c){const p=c.p,block=c.el('div','market-status-block'),rowEl=c.el('div','market-status-row'),state=reportState(p);
    rowEl.append(statusCell(c,'pack','可用货位',S.inventory.available(p)+'/'+S.inventory.capacity(p)),statusCell(c,'money','随身铜钱',c.formatMoney(p.cash)),statusCell(c,'message','商报',reportLabels[state],'report-'+state));
    const v=p.market.visit,traded=Boolean(v&&!v.settled&&v.hadActivity);const hint=c.el('p','market-time-hint',traded?'已发生交易 · 离市后将推进半日':'查看市价不推进时间');hint.dataset.traded=String(traded);
    block.append(rowEl,hint);return block;}
  const blockReason=(kind,f)=>S.market.blockReason(kind,f);
  function rerender(c){S.ui.render(c.state);}
  // Compact expand: 交易数量 [−] n [+] · one-line summary with a fixed right column · confirm · one feedback line (only when blocked).
  // The stepper carries no affordability maximum (input range ≠ current tradable range); blocked states disable the confirm instead.
  function tradeExpand(c,card,spec){
    const box=c.el('div','trade-expand');box.dataset.mode=spec.kind;
    const field=c.el('div','trade-quantity');field.append(c.el('span','field-label',spec.fieldLabel));
    const stepper=c.numericStepper({name:'quantity-'+spec.id,value:'1',min:1,label:spec.fieldLabel});stepper.element.classList.add('stepper-compact');field.append(stepper.element);box.append(field);
    const summary=c.el('div','trade-summary');const left=c.el('span','trade-summary-left'),right=c.el('span','trade-summary-right');summary.append(left,right);
    const confirm=c.button(spec.confirmLabel,()=>{void submit();},{});const reason=c.el('p','trade-block-reason');reason.setAttribute('role','status');
    const facts=()=>{const raw=stepper.input.value;const valid=/^[0-9]+$/.test(raw)&&Number.isSafeInteger(Number(raw))&&Number(raw)>0;const n=valid?Number(raw):0;return {valid,n,...spec.facts(n)};};
    function refresh(){const f=facts();const r=blockReason(spec.kind,f);spec.summary(left,right,f);reason.textContent=r;reason.hidden=!r;const ok=!r&&f.valid&&(!spec.commitAvailable||spec.commitAvailable(f.n));confirm.disabled=!ok||c.app.busy;if(ok)confirm.dataset.busyDisabled='true';else delete confirm.dataset.busyDisabled;stepper.refresh();return ok;}
    async function submit(){if(!box.isConnected||!refresh())return;await spec.submit(facts().n);}
    stepper.input.addEventListener('input',refresh);stepper.input.addEventListener('change',refresh);
    box.append(summary,confirm,reason);card.append(box);refresh();return box;
  }
  function toggleGood(c,goodId,mode){if(expandState.goodId===goodId&&expandState.mode===mode){expandState.goodId=null;expandState.mode=null;}else{expandState.goodId=goodId;expandState.mode=mode;}rerender(c);}
  function goodsCard(c,b,visit,latestReport,reportSt,{good,lots,held,unlocked,rank}){
    const p=c.p,price=currentPrice(p,good.id),open=expandState.goodId===good.id?expandState.mode:null;
    const card=c.el('section','market-product'+(!unlocked?' locked-product':'')+(open?' is-expanded':''));card.dataset.goodId=good.id;card.dataset.sortGroup=rank;if(open)card.dataset.mode=open;
    const art=c.el('img','goods-art');art.src=S.assets['goods_'+good.id];art.alt=good.name;art.draggable=false;card.append(art);
    const infoBox=c.el('div','market-info');
    const title=c.el('h3','market-title');title.append(c.el('span','goods-name',good.name),tag(c,cities[good.originCity]+'特产','specialty'));if(good.fragile)title.append(tag(c,'易碎','attr'));infoBox.append(title);
    const judgement=latestReport?.productJudgements?.[good.id];
    statLine(c,infoBox,[['当前价格',c.formatMoney(price)],['货位',good.slotCost+'/件']],'market-stat-line market-row-1');
    statLine(c,infoBox,[['持有',String(held)],['商报',latestReport?(judgement?.label||'—'):'未购买','report-'+reportSt]],'market-stat-line market-row-2');
    // Aggregated by goodId (InventoryLot never shown). WEIGHTED_AVERAGE_INVENTORY_COST_PATCH v1.0: 持有成本 = 持有 × the product's single integer 持仓均价 (S.inventory.avgCost); value keeps the existing sale-price calculation.
    let cost=0,value=0;if(held){cost=held*S.inventory.avgCost(p,good.id);value=lots.reduce((n,l)=>n+S.market.sellUnitPrice(p,l,price)*l.quantity,0);}
    const lockedReason=!unlocked?'尚未打通此货货源。请达到相应商誉并建立供应往来。':'';
    if(lockedReason){const note=c.el('p','form-hint locked-reason',lockedReason);note.setAttribute('role','note');infoBox.append(note);}
    card.append(infoBox);
    // third row (only when held) spans the card width so the three amounts stay on one line
    if(held)statLine(c,card,[['持有成本',c.formatMoney(cost)],['可售价值',c.formatMoney(value)],['盈亏',signedMoney(c,value-cost)]],'market-stat-line market-holding-line');
    const actions=c.el('div','market-card-actions');
    const buyBtn=c.button('买入'+(open==='buy'?'⌃':'⌄'),()=>toggleGood(c,good.id,'buy'),{disabled:!unlocked||price===null});buyBtn.setAttribute('aria-expanded',String(open==='buy'));buyBtn.dataset.action='buy';
    const sellBtn=c.button('卖出'+(open==='sell'?'⌃':'⌄'),()=>toggleGood(c,good.id,'sell'),{disabled:!held||price===null});sellBtn.setAttribute('aria-expanded',String(open==='sell'));sellBtn.dataset.action='sell';
    actions.append(buyBtn,sellBtn);card.append(actions);
    if(open==='buy'&&unlocked&&price!==null){
      const supplierChannel=good.originCity===p.world.city&&Boolean(p.merchant?.suppliers?.[good.id]);
      const unit=S.market.buyQuote(p,good.id,supplierChannel,S.core.context('quote-view')).unitPrice;
      tradeExpand(c,card,{kind:'buy',id:good.id,fieldLabel:'交易数量',confirmLabel:'确认买入',
        facts:n=>({unlocked,lockedReason,slotCost:good.slotCost,available:S.inventory.available(c.p),cash:c.p.cash,unit}),
        summary(left,right,f){const total=f.valid&&Number.isSafeInteger(f.n*unit)?f.n*unit:0;left.textContent='本次合计 '+c.formatMoney(total);right.textContent='占用货位 '+(f.valid&&Number.isSafeInteger(f.n*good.slotCost)?f.n*good.slotCost:0);},
        submit:quantity=>c.dispatch('market.buy',{visitId:visit.id,quantity,goodId:good.id,supplierChannel})});
    }else if(open==='sell'&&held&&price!==null){
      const avgUnit=value/held; // display estimate over all lots of the good; the engine sells per its existing per-lot rule
      tradeExpand(c,card,{kind:'sell',id:good.id,fieldLabel:'交易数量',confirmLabel:'确认出售',
        facts:n=>({held,lots:lots.length,slotCost:good.slotCost}),
        // Unresolved gameplay dependency (reported, not player-facing): a partial quantity over lots with different cost / provenance
        // has no committed consumption rule yet, so the confirm stays unavailable for exactly that case — no copy, no invented rule.
        commitAvailable:n=>S.market.sellPlan(c.p,good.id,n).ok,
        summary(left,right,f){const n=f.valid?Math.min(f.n,held):0;const est=n===held?value:Math.round(avgUnit*n);left.textContent='本次可得 '+c.formatMoney(f.valid?est:0);right.textContent='释放货位 '+(f.valid?n*good.slotCost:0);},
        submit:quantity=>c.dispatch('market.sell',{visitId:visit.id,quantity,goodId:good.id})});
    }
    if(open&&(open==='buy'?!(unlocked&&price!==null):!(held&&price!==null))){expandState.goodId=null;expandState.mode=null;card.classList.remove('is-expanded');delete card.dataset.mode;}
    b.append(card);
  }
  function provisionsCard(c,b,visit){
    const p=c.p,open=expandState.provisions,card=c.el('section','market-product provisions-product'+(open?' is-expanded':''));card.dataset.goodId='provisions';
    const head=c.el('div','provisions-head');head.append(c.el('h3','market-title','粮草补给'),statItem(c,'现有补给',p.inventory.provisions+'日份'));card.append(head);
    statLine(c,card,[['单价','1钱 / 商队日份'],['有补给时共用','1货位']]);
    const leg=S.trip.plan[p.trip?.routeIndex||0];if(leg)statLine(c,card,[['下一程',cities[leg.from]+' → '+cities[leg.to]+' · 基础路程'+leg.days+'日']],'market-stat-line provisions-leg');
    info(c,card,'途中事件可能延误');
    const actions=c.el('div','market-card-actions provisions-actions');const btn=c.button('购买粮草'+(open?'⌃':'⌄'),()=>{expandState.provisions=!expandState.provisions;rerender(c);});btn.setAttribute('aria-expanded',String(open));btn.dataset.action='provisions';actions.append(btn);card.append(actions);
    if(open)tradeExpand(c,card,{kind:'provisions',id:'provisions',fieldLabel:'购买日份',confirmLabel:'确认购买',
      facts:n=>({needsSlot:c.p.inventory.provisions===0,available:S.inventory.available(c.p),cash:c.p.cash,unit:1}),
      summary(left,right,f){left.textContent='本次合计 '+c.formatMoney(f.valid?f.n:0);right.textContent='购买后共有 '+(c.p.inventory.provisions+(f.valid?f.n:0))+'日份';},
      submit:quantity=>c.dispatch('market.provisions',{visitId:visit.id,quantity})});
    b.append(card);
  }
  function groupByGood(records){const m=new Map();for(const r of records)m.set(r.goodId,(m.get(r.goodId)||0)+r.quantity);return [...m.entries()];}
  function renderMarketSummary(c,b,r,{preview=false}={}){
    info(c,b,preview?'确认离市后将推进半日 · 返回市场可继续交易':'已过半日 · 当前：'+c.date(r.currentTick));
    if(r.cashDelta)money(c,b,'随身铜钱净变化',r.cashDelta);for(const [goodId,q] of groupByGood(r.bought))c.row('买入',goodId+' × '+q,b);for(const [goodId,q] of groupByGood(r.sold))c.row('卖出',goodId+' × '+q,b);if(r.provisions)c.row('补给','+'+r.provisions+'日份',b);if(r.slotsChanged)c.row('当前货位',r.slots+' / '+S.inventory.capacity(c.p),b);
  }
  S.marketUI={marketRows,expandState,reportStatus,reportState,blockReason};
  S.ui.registerPanel('market',{title:c=>({changan:'长安 · 西市',dunhuang:'敦煌 · 沙洲驿市',khotan:'于阗 · 绿洲市集'})[c.p.world.city],noClose:true,header(c,h){h.append(marketStatus(c));},render(c,b){
    const visit=c.p.market.visit;syncExpand(c.p);
    if(!visit||visit.settled){info(c,b,S.time.phase(c.p)===2?'暮时不可进入市场。请安排歇息后再来。':'正在打开市场…');return;}
    provisionsCard(c,b,visit);
    const latestReport=S.newspapers.latest(c.p),reportSt=reportState(c.p);
    for(const row of marketRows(c.p))goodsCard(c,b,visit,latestReport,reportSt,row);
    const lots=c.p.inventory.lots.filter(l=>l.ownership==='playerOwned'&&!l.nonMarketable&&l.condition!=='destroyed');
    const tools=c.el('div','market-tools');
    tools.append(c.button('一键出售',()=>c.showModal({title:'出售全部可售货物？',body:'只出售可交易的自有货物，按当前实际卖价逐批结算。',actions:[{label:'返回',run:c.dismissModal},{label:'确认出售',run:async()=>{const r=await c.dispatch('market.sellAll',{visitId:visit.id});if(r)c.dismissModal();}}]}),{disabled:!lots.length}));
    tools.append(c.button('查看委托',()=>c.openSecondary('commission')),c.button('查看商情',()=>c.openSecondary('inspect')));b.append(tools);
  },footer(c,f){const v=c.p.market.visit;f.append(c.button('离开市场',()=>{if(v&&!v.settled&&v.hadActivity)c.openSecondary('market-exit-confirm');else c.closePanel();}));}});
  // MARKET_EXIT_CONFIRM: 0 tick on entry; 返回市场 keeps the same visit; 确认离市 = market.leave (close + advance once), then straight back to the city.
  S.ui.registerPanel('market-exit-confirm',{title:'本次市场交易',noClose:true,render(c,b){
    const v=c.p.market.visit;if(!v||v.settled||!v.hadActivity){info(c,b,'本次尚无成功交易。');return;}
    renderMarketSummary(c,b,S.market.summaryPreview(c.p,v.id),{preview:true});
  },footer(c,f){f.append(c.button('返回市场',()=>c.closeSecondary()),c.button('确认离市',()=>c.closePanel()));}});
  S.ui.registerPanel('pack',{title:'行囊',render(c,b){
    const status=c.el('section','pack-status');header(c,status,'驼队概况');
    for(const [name,label,value] of [['icon_camel_status_v01','骆驼',c.p.inventory.camelCount+'匹'],['icon_packgear_status_v01','行装',c.p.inn?.prepared?'已整理':'尚未整理']]){const item=c.el('div','pack-status-row'),art=c.el('img','pack-status-icon');art.src=S.assets[name];art.alt='';item.append(art);c.row(label,value,item);status.append(item);}
    c.row('货位',S.inventory.used(c.p)+' / '+S.inventory.capacity(c.p),status);c.row('补给',c.p.inventory.provisions+'日份'+(c.p.inventory.provisions?' · 占1货位':''),status);b.append(status);header(c,b,'随行货物');
    for(const lot of c.p.inventory.lots){const card=c.el('section','voucher-card');if(S.assets['goods_'+lot.goodId]){const art=c.el('img','goods-art');art.src=S.assets['goods_'+lot.goodId];art.alt=lot.goodId;card.append(art);}c.row(lot.storyLabel||lot.goodId,(lot.storyUnits?.length||lot.quantity)+'件 · '+conditions[lot.condition],card);if(lot.storyUnits)info(c,card,Object.entries(conditions).map(([key,label])=>label+lot.storyUnits.filter(u=>u.condition===key).length+'件').join(' · '));c.row('所属',ownership[lot.ownership],card);if(lot.ownership==='playerOwned'){money(c,card,'实际买入单价',lot.acquisitionPrice);c.row('购入地',cities[lot.acquisitionCity],card);}c.row('占用货位',lot.condition==='destroyed'?0:lot.quantity*lot.slotCost,card);if(lot.nonMarketable)info(c,card,'此物不可用于市场交易或商号上柜。');b.append(card);}
    if(!c.p.inventory.lots.length)info(c,b,'行囊里还没有货物。');
  }});
  // COMMISSION v3.0: ending a trip never touches ordinary commissions, so there is nothing to warn about here.
  function endTrip(c){c.dispatch('trip.finalize');}
  function depart(c,destinationCity){
    // RC3 BUG-08: from 长安 the confirm only prepares the departure; the supply/cargo warnings and the 22-day period belong to 【开始行程】. COMMISSION v3.0: no commission draft, no pickup warning — commissions run on their own 30-day deadline.
    if(!c.p.trip){c.dispatch('trip.begin').then(result=>{if(result){c.dismissModal();c.openPanel('departure')}});return}
    const v=S.trip.departureView(c.p),payload={destinationCity,acknowledgeSupplyWarning:v.requiresSupplyWarning}
    const commit=async()=>{const result=await c.dispatch('trip.depart',payload);if(result){c.dismissModal();c.openPanel('trip')}}
    const extra=v.requiresCargoWarning?'你没有携带可供交易的商品，仍可出发，但无法通过现有货物跑商获利。':''
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
    }
  }});
  function startTrip(c){
    // RC3 BUG-08: the only place where the trip (clock, route) actually starts. Same warning texts as the former 确认出发 step. COMMISSION v3.0: commissions are not part of departure.
    const v=S.trip.departureView(c.p),go=async()=>{const result=await c.dispatch('trip.depart',{destinationCity:'dunhuang',acknowledgeSupplyWarning:v.requiresSupplyWarning});if(result){c.dismissModal();c.openPanel('trip')}}
    const extra=v.requiresCargoWarning?'你没有携带可供交易的商品，仍可出发，但无法通过现有货物跑商获利。':''
    c.showModal({title:v.requiresSupplyWarning?'粮草可能不足':'确认出发',body:(v.requiresSupplyWarning?'当前粮草：'+c.p.inventory.provisions+'日份\n':'')+'此程预计'+v.leg.days+'日。'+(v.requiresSupplyWarning?'\n途中断粮可能需要高价补给、绕路寻粮、消耗干果或承担延误。':'')+(extra?'\n'+extra:'')+'\n点击【开始行程】后，22日商期正式开始。',actions:[{label:'返回准备',run:c.dismissModal},{label:'开始行程',run:go}]})
  }
  // COMMISSION v3.0: the departure page carries no commission function — at most one hint line; the candidates live only in the top 【委托】 board.
  S.ui.registerPanel('departure',{title:'开始行程',render(c,b){
    const view=S.trip.departureView(c.p);
    if(c.p.trip){info(c,b,'本趟商旅已经开始。');return;}
    info(c,b,'这里只是准备：关闭本面板不会启动商期，也不影响未启程时的经营。点击【开始行程】后，22日商期才开始。');
    c.row('当前粮草',c.p.inventory.provisions+'日份',b);if(view.leg)c.row('此程预计',view.leg.days+'日',b);
    if(view.commissionHint){const hint=c.el('p','form-hint departure-commission-hint','有委托可接，可在顶部【委托】中查看。');b.append(hint);}
  },footer(c,f){const view=S.trip.departureView(c.p);f.append(c.button('开始行程',()=>startTrip(c),{disabled:!view.canDepart||Boolean(c.p.trip)}));}});
  S.ui.registerPanel('return-tasks',{title:'返程事务',render(c,b){
    if(c.p.trip?.phase!=='return_tasks'){info(c,b,'请先安排歇息，次晨处理返程事务。');return;}
    const view=S.trip.returnView(c.p),labels={commission:'委托',market:'市场',merchant:'商号'};
    for(const [task,status]of Object.entries(view.tasks)){
      if(status==='not_applicable')continue;
      const card=c.el('section','voucher-card');header(c,card,labels[task]);info(c,card,{pending:'待处理',processed:'已处理',deferred:'已选择暂不处理'}[status]);
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
  S.ui.registerResult('marketSummary',(c,b,r)=>renderMarketSummary(c,b,r));
  S.ui.registerResult('marketBuy',(c,b,r)=>{c.row('买入',r.goodId+' × '+r.quantity,b);money(c,b,'实际支出',r.total);});
  S.ui.registerResult('marketSell',(c,b,r)=>{c.row('卖出',r.goodId+' × '+r.quantity,b);money(c,b,'售货收入',r.total);money(c,b,'对应成本',r.cost);money(c,b,'贸易利润',r.profit);});
  S.ui.registerResult('marketSellAll',(c,b,r)=>{for(const x of r.items)c.row(x.goodId+' × '+x.quantity,c.formatMoney(x.total),b);money(c,b,'售货收入合计',r.cashDelta);});
  S.ui.registerResult('provisionsBought',(c,b,r)=>{c.row('购入补给',r.quantity+'日份',b);money(c,b,'支出',-r.cashDelta);c.row('现有补给',r.totalProvisions+'日份',b);});
  S.ui.registerResult('tripSummary',(c,b,r)=>{
    const night=r.graceEnd?.overnightFeedback;
    if(night){header(c,b,'最后一夜');c.row('昨夜宿费',c.formatMoney(night.lodgingCost),b);c.row('当前',night.dateLabel||c.date(night.after.tick),b);c.paragraph(b,night.text);if(night.explanation)c.paragraph(b,night.explanation);for(const e of night.effects||[]){if(e.goodId)c.row(e.goodId,e.quantity+'件 · '+(e.condition==='damaged'?'受损':e.type==='cargo_remove'?'失去':'状态已更新'),b);}}
    const j=r.journey;header(c,b,'行程');c.row('出发',c.date(j.startedTick),b);c.row('返抵',c.date(j.arrivedTick),b);c.row('实际路线',j.route.map(x=>cities[x]).join(' → '),b);c.row('商旅耗时',Math.floor(j.elapsedTicks/3)+'日'+j.elapsedTicks%3+'个时段 / 22日',b);c.row('返程状态',j.status==='on_time'?'按期归来':'已逾期',b);
    if(j.status==='on_time')c.row('按期商誉奖励',signed(j.onTimeReward),b);else{if(j.overdueTick!==null)c.row('发生逾期',c.date(j.overdueTick)+'（商旅第'+(Math.floor((j.overdueTick-j.startedTick)/3)+1)+'日）',b);if(j.lostOnTimeReward)c.row('失去按期奖励','商誉+'+j.lostOnTimeReward,b);if(j.overduePenalty!==0)c.row('逾期商誉处罚',j.overduePenalty,b);}
    header(c,b,'贸易结果');money(c,b,'售货收入',r.trade.salesRevenue);money(c,b,'购货成本',r.trade.purchaseCost);money(c,b,'贸易利润',r.trade.profit);
    header(c,b,'委托与商誉');c.row('普通委托完成',r.commissions.completed+'项',b);money(c,b,'普通委托收入',r.commissions.income);c.row('普通委托获得商誉',signed(r.commissions.reputation),b);c.row('本次商誉变化',signed(r.reputation.change),b);c.row('当前商誉',r.reputation.current,b);if(r.commissions.failed)c.row('失败／逾期委托',r.commissions.failed+'项',b);for(const x of r.commissions.results)if(x.rewardRatio<1){c.row('受损交付',x.title+' · 实得'+c.formatMoney(x.actualCash),b);info(c,b,'原约报酬'+c.formatMoney(x.originalReward)+'，按'+Math.round(x.rewardRatio*100)+'%交付结算。');}
    if(r.other.length){header(c,b,'其他收支');for(const x of r.other)money(c,b,x.label,x.amount);}
    header(c,b,'期末资金');money(c,b,'随身铜钱',r.funds.cash);money(c,b,'资金总额',r.funds.totalFunds);money(c,b,'负债合计',r.funds.totalDebt);money(c,b,'净资金',r.funds.netFunds);
    if(r.important.length){header(c,b,'重要结果');for(const x of r.important)info(c,b,x.text);}

  });
})(globalThis.Silk=globalThis.Silk||{});
