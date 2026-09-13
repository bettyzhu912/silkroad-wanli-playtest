(function (S) {
  'use strict';
  const { ensure, integer } = S.util;
  function purchaseRecords(p){return p.market.purchaseTurnoverLots||(p.market.purchaseTurnoverLots={});}
  function heldLots(p){return [...p.inventory.lots.map(l=>({lot:l,city:p.world.city,travelling:Boolean(p.world.route)})),...(p.merchant?.cabinets||[]).flatMap(c=>c.lots.map(l=>({lot:l,city:'changan',travelling:false})))];}
  function pendingTotal(p){p.market.pendingPurchaseTurnover=Object.values(purchaseRecords(p)).reduce((n,r)=>n+r.pendingQuantity*r.unitPrice,0);return p.market.pendingPurchaseTurnover;}
  function confirmPurchase(p,lot,reason){
    const row=purchaseRecords(p)[lot.purchaseTurnoverId];
    if(!row||!lot.purchaseTurnoverPending||lot.condition==='destroyed')return {amount:0,gained:0,remainder:p.reputation.turnover};
    ensure(row.pendingQuantity>=lot.quantity,'INVALID_PENDING_TURNOVER');
    const amount=row.unitPrice*lot.quantity;row.pendingQuantity-=lot.quantity;row.confirmedQuantity+=lot.quantity;lot.purchaseTurnoverPending=false;
    const result=S.reputation.addTurnover(p,amount,{type:'marketBuyConfirmed',purchaseId:row.purchaseId,reason});
    p.journal.push({type:'purchaseTurnoverConfirmed',purchaseId:row.purchaseId,quantity:lot.quantity,amount,reason,tick:p.world.tick,tripId:p.trip?.id||null});pendingTotal(p);return result;
  }
  function settlePurchaseTurnover(p){
    const rows=purchaseRecords(p),holdings=heldLots(p),day=S.time.day(p),confirmed=[];
    for(const {lot,city,travelling} of holdings){
      if(!lot.purchaseTurnoverPending||!rows[lot.purchaseTurnoverId]||lot.condition==='destroyed')continue;
      // RC3 BUG-07 (overrides G01.4): a purchase amount is confirmed only once the cargo has really left its purchase city
      // (carried on the road away from it, or held in another city). Merely holding it across a world day no longer confirms it.
      const left=lot.hasLeftAcquisitionCity===true||city!==lot.acquisitionCity||(travelling&&city===lot.acquisitionCity);
      if(left)confirmed.push(confirmPurchase(p,lot,'leftPurchaseCity'));
    }
    // A removed/destroyed unit cannot later qualify as transported cargo.
    // Transfers and damage splitting finish before this reconciliation runs.
    const pending={};for(const {lot} of holdings)if(lot.purchaseTurnoverPending&&lot.condition!=='destroyed')pending[lot.purchaseTurnoverId]=(pending[lot.purchaseTurnoverId]||0)+lot.quantity;
    for(const row of Object.values(rows)){
      const held=pending[row.purchaseId]||0;ensure(held<=row.pendingQuantity,'INVALID_PENDING_TURNOVER');
      row.cancelledQuantity+=row.pendingQuantity-held;row.pendingQuantity=held;
    }
    for(const {lot} of holdings)if(lot.condition==='destroyed')lot.purchaseTurnoverPending=false;
    pendingTotal(p);return confirmed;
  }
  function cancelResale(p,lot,quantity){
    const row=purchaseRecords(p)[lot.purchaseTurnoverId];if(!row||!lot.purchaseTurnoverPending)return 0;
    ensure(row.pendingQuantity>=quantity,'INVALID_PENDING_TURNOVER');row.pendingQuantity-=quantity;row.cancelledQuantity+=quantity;pendingTotal(p);return quantity*row.unitPrice;
  }
  function validate(p){
    const held={};for(const {lot} of heldLots(p))if(lot.purchaseTurnoverPending&&lot.condition!=='destroyed'){
      ensure(p.market.purchaseTurnoverLots?.[lot.purchaseTurnoverId],'INVALID_PENDING_TURNOVER');
      held[lot.purchaseTurnoverId]=(held[lot.purchaseTurnoverId]||0)+lot.quantity;
    }
    let total=0;for(const [key,r] of Object.entries(p.market.purchaseTurnoverLots||{})){
      ensure(r.purchaseId===key&&integer(r.unitPrice,1)&&integer(r.originalQuantity,1)&&integer(r.pendingQuantity)&&integer(r.confirmedQuantity)&&integer(r.cancelledQuantity)&&r.originalQuantity===r.pendingQuantity+r.confirmedQuantity+r.cancelledQuantity,'INVALID_PENDING_TURNOVER');
      ensure(r.pendingQuantity===(held[key]||0),'INVALID_PENDING_TURNOVER');
      total+=r.pendingQuantity*r.unitPrice;
    }
    ensure(p.market.pendingPurchaseTurnover===undefined||p.market.pendingPurchaseTurnover===total,'INVALID_PENDING_TURNOVER');return true;
  }
  function visit(p, payload) {
    const v = p.market.visit;
    ensure(v && !v.settled && v.id === payload.visitId && v.city === p.world.city && !p.world.route, 'STALE_MARKET_VISIT', '请重新打开当前市场');
    return v;
  }
  function price(p, goodId, ctx) { return ctx.marketPrice(p, p.world.city, goodId, S.time.day(p)); }
  function buyQuote(p, goodId, supplierChannel, ctx) {
    const row=S.inventory.good(goodId),normal=price(p,goodId,ctx);let supplierDiscountRate=0;
    if(supplierChannel){
      ensure(p.world.city===row.originCity,'SUPPLIER_CITY','请在货源所在城市采购');
      const relation=p.merchant?.suppliers?.[row.id]||p.merchant?.supplyRelations?.[row.id];ensure(relation,'SUPPLY_LOCKED');
      if(relation.deepened||relation.level>=2||relation.status==='deepened'||relation.stage==='deepened')supplierDiscountRate=row.id==='于阗玉'?.03:['染料','漆器'].includes(row.id)?.05:0;
    }
    return {normal,unitPrice:S.money.round(normal*(1-supplierDiscountRate)),supplierDiscountRate};
  }
  function sellUnitPrice(p, lot, normal, city = p.world.city) {
    return lot.discountOriginCity === city && !lot.hasTransportedToOtherCity ? Math.min(normal, lot.acquisitionPrice) : normal;
  }
  function enter(p) {
    ensure(!p.world.route, 'CITY_REQUIRED');
    if (p.market.visit && !p.market.visit.settled) return { kind: 'marketEntered', visit: p.market.visit, modal: false };
    ensure(S.time.phase(p) !== 2, 'MARKET_CLOSED', '暮时市场已经收市');
    p.market.visit = { id: S.util.id(p, 'market'), city: p.world.city, enteredTick: p.world.tick, journalStart:p.journal.length, initialSlots:S.inventory.used(p), hadActivity: false, settled: false };
    return { kind: 'marketEntered', visit: p.market.visit, modal: false };
  }
  // 市场交易页 (2026-09-13): one summary builder for the 0-tick MARKET_EXIT_CONFIRM preview and the final leave record.
  function buildSummary(p, v, currentTick) {
    const records=Number.isInteger(v.journalStart)?p.journal.slice(v.journalStart).filter(r=>['marketBuy','marketSell','provisions'].includes(r.type)):[];
    return {kind:'marketSummary',title:'本次市场交易',visitId:v.id,elapsed:1,currentTick,cashDelta:records.reduce((n,r)=>n+(r.type==='marketBuy'?-r.total:r.type==='marketSell'?r.total:r.amount),0),bought:records.filter(r=>r.type==='marketBuy'),sold:records.filter(r=>r.type==='marketSell'),provisions:records.filter(r=>r.type==='provisions').reduce((n,r)=>n-r.amount,0),slots:S.inventory.used(p),slotsChanged:v.initialSlots!==S.inventory.used(p),continueLabel:'确认'};
  }
  // Read-only: the latest summary of the open visit (regenerated on every call). No state change, no time.
  function summaryPreview(p, visitId) {
    const v = visit(p, { visitId }); ensure(v.hadActivity, 'NO_MARKET_ACTIVITY', '本次尚无成功交易');
    return { ...buildSummary(p, v, p.world.tick), preview: true, modal: false };
  }
  function leave(p, payload, ctx) {
    const v = visit(p, payload); const elapsed = v.hadActivity ? 1 : 0;
    // Atomic: close the visit and advance exactly once; a second leave for the same visit fails on STALE_MARKET_VISIT above.
    v.settled = true; v.closedTick = p.world.tick;
    if (elapsed) ctx.advance(p, elapsed, 'marketVisit');
    if(!elapsed)return {kind:'marketLeft',visitId:v.id,elapsed:0,modal:false};
    const summary=buildSummary(p,v,p.world.tick);
    v.summary=S.util.clone(summary);
    // The player has already confirmed this summary on the MARKET_EXIT_CONFIRM page; the record is kept on the visit, no second page.
    return {...summary,modal:false};
  }
  function buy(p, payload, ctx) {
    const v = visit(p, payload); const row = S.inventory.good(payload.goodId);
    ensure(integer(payload.quantity, 1), 'INVALID_QUANTITY', '请输入正整数件数');
    ensure(S.inventory.unlocked(p, row.id), 'SUPPLY_LOCKED', '尚未建立该货源关系');
    const {unitPrice,supplierDiscountRate}=buyQuote(p,row.id,Boolean(payload.supplierChannel),ctx);
    const total = unitPrice * payload.quantity; ensure(integer(total), 'INVALID_AMOUNT'); ensure(p.cash >= total, 'INSUFFICIENT_CASH', '随身现钱不足');
    const lot = S.inventory.add(p, { goodId: row.id, quantity: payload.quantity, acquisitionPrice: unitPrice, supplierDiscountRate, discountOriginCity: supplierDiscountRate ? p.world.city : null });
    p.cash -= total; v.hadActivity = true;
    lot.purchaseTurnoverId=lot.id;lot.purchaseTurnoverPending=true;
    purchaseRecords(p)[lot.id]={purchaseId:lot.id,city:p.world.city,worldDay:S.time.day(p),unitPrice,originalQuantity:lot.quantity,pendingQuantity:lot.quantity,confirmedQuantity:0,cancelledQuantity:0};pendingTotal(p);
    const reputation = {amount:0,gained:0,remainder:p.reputation.turnover,pendingAmount:total};
    p.journal.push({ type: 'marketBuy', lotId: lot.id, goodId: row.id, quantity: lot.quantity, unitPrice, total, city: p.world.city, tick: p.world.tick, tripId: p.trip?.id || null });
    return { kind: 'marketBuy', goodId: row.id, quantity: payload.quantity, unitPrice, total, cashDelta: -total, reputation, lotId: lot.id };
  }
  function sell(p, payload, ctx) {
    const v = visit(p, payload); const lot = p.inventory.lots.find(l => l.id === payload.lotId);
    ensure(lot && lot.ownership === 'playerOwned' && !lot.nonMarketable && lot.condition !== 'destroyed', 'NOT_MARKETABLE', '这批货物不能出售');
    ensure(integer(payload.quantity, 1, lot.quantity), 'INVALID_QUANTITY', '出售件数无效');
    const normal = price(p, lot.goodId, ctx);
    const unitPrice = sellUnitPrice(p, lot, normal);
    const total = unitPrice * payload.quantity; ensure(integer(total), 'INVALID_AMOUNT');
    // RC3 BUG-07: only cargo that has really left its purchase city earns turnover. Selling an unmoved lot in its
    // purchase city (same day or days later) cancels the pending purchase amount and earns no sale turnover either.
    const transported = S.inventory.transportQualified(lot, p.world.city);
    if(transported)confirmPurchase(p,lot,'beforeSale');
    const cancelledPurchaseTurnover=transported?0:cancelResale(p,lot,payload.quantity);
    const sold = S.inventory.take(p, lot.id, payload.quantity); p.cash += total; v.hadActivity = true;
    const reputation = S.reputation.addTurnover(p, transported ? total : 0, { type: 'marketSell', lotId: sold.id });
    const cost = sold.acquisitionPrice * sold.quantity;
    const entry = { type: 'marketSell', goodId: sold.goodId, lotId: sold.id, quantity: sold.quantity, unitPrice, total, cost, profit: total - cost, city: p.world.city, acquisitionCity:sold.acquisitionCity,crossCity:sold.acquisitionCity!==p.world.city, transportQualified: transported, tick: p.world.tick, tripId: p.trip?.id || null };
    p.journal.push(entry);
    return { kind: 'marketSell', ...entry, cashDelta: total, reputation, cancelledPurchaseTurnover };
  }
  function sellAll(p, payload, ctx) {
    visit(p, payload);
    const eligible = p.inventory.lots.filter(l => l.ownership === 'playerOwned' && !l.nonMarketable && l.condition !== 'destroyed');
    ensure(eligible.length > 0, 'NO_MARKETABLE_GOODS', '没有可出售的货物');
    const results = eligible.map(l => sell(p, { visitId: payload.visitId, lotId: l.id, quantity: l.quantity }, ctx));
    return { kind: 'marketSellAll', items: results, cashDelta: results.reduce((n, r) => n + r.cashDelta, 0) };
  }
  function provisions(p, payload) {
    const v = visit(p, payload); ensure(integer(payload.quantity, 1), 'INVALID_QUANTITY', '请输入正整数日份');
    ensure(p.cash >= payload.quantity, 'INSUFFICIENT_CASH', '随身现钱不足');
    ensure(p.inventory.provisions > 0 || S.inventory.available(p) >= 1, 'CAPACITY_EXCEEDED', '补给需要一个货位');
    p.cash -= payload.quantity; p.inventory.provisions += payload.quantity; v.hadActivity = true;
    p.journal.push({ type: 'provisions', amount: -payload.quantity, tick: p.world.tick, tripId: p.trip?.id || null });
    return { kind: 'provisionsBought', quantity: payload.quantity, cashDelta: -payload.quantity, totalProvisions: p.inventory.provisions };
  }
  // 市场交易页 UI feedback (2026-09-13): one blocking reason at a time, fixed priority 未解锁 → 货位不足 → 铜钱不足 → 数量限制. Pure read model over the existing rules and their messages; the reducers above stay the authority.
  function blockReason(kind,f){
    const n=f.valid?f.n:1; // an empty / zero entry is judged as the smallest trade so the real blocker (slots, cash) still wins over 数量限制
    if(kind==='buy'&&!f.unlocked)return '尚未建立该货源关系';
    if(kind==='buy'&&n*f.slotCost>f.available)return '行囊货位不足';
    if(kind==='provisions'&&f.needsSlot&&f.available<1)return '补给需要一个货位';
    if((kind==='buy'||kind==='provisions')&&n*f.unit>f.cash)return '随身现钱不足';
    if(!f.valid)return kind==='sell'?'出售件数无效':kind==='provisions'?'请输入正整数日份':'请输入正整数件数';
    if(kind==='sell'&&f.n>f.max)return '出售件数无效';
    return '';
  }
  const reducers = { 'market.enter': enter, 'market.leave': leave, 'market.buy': buy, 'market.sell': sell, 'market.sellAll': sellAll, 'market.provisions': provisions };
  S.market = { price, quote:(p,city,id)=>S.pricing.quote(p,city,id), buyQuote, sellUnitPrice, enter, leave, summaryPreview, blockReason, buy, sell, sellAll, provisions, settlePurchaseTurnover, validate };
  for (const [type, fn] of Object.entries(reducers)) S.commands.register(type, fn);
  S.time.register('purchaseTurnover',{dayStart:settlePurchaseTurnover});
})(globalThis.Silk = globalThis.Silk || {});
