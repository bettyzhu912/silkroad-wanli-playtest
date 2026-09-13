(function (S) {
  "use strict";
  const data = globalThis.SilkData.events;
  const all = [...data.mainEvents, ...data.conditionalEvents];
  const definitions = Object.fromEntries(all.map(e => [e.eventId, e]));
  const campDefinitions = [...data.campPool.common, ...Object.values(data.campPool.citySpecific).flat()];
  const ensure = (...a) => S.util.ensure(...a);
  const copy = x => S.util.clone(x);
  const mainIds = new Set(data.mainEvents.map(e => e.eventId));
  const goodFlags = ["helpedTraveller", "helpedMerchant", "gaveDirections", "returnedLostPurse", "helpedCaravan"];
  const moistureGoods = ["纸张", "绢帛", "于阗丝织"];
  const selectors = new Set(["eligibleCargo", "moistureSensitiveCargo", "good:唐代陶瓷", "good:药材|干果", "good:干果"]);
  const damageTags = { R02: "impact", R07: "drop", R08: "moisture", R09: "impact", R15: "moisture", R16: "impact", "RM-01": "impact", "RM-05": "drop" };
  const preparedCargoEvents = new Set(["R02", "R07", "R08", "R09", "R15", "R16", "RM-01", "RM-05"]);
  const formulas = new Set();
  for (const e of all) for (const c of e.choices) for (const o of c.outcomes) for (const effect of o.effects) if (effect.formula) formulas.add(effect.formula);
  for (const e of campDefinitions) for (const effect of e.effects) if (effect.formula) formulas.add(effect.formula);
  function initial() { return { history: [], moneyHistory: [], flags: {}, consumedGoodwill: {}, lossCounts: {}, consecutiveLosses: 0,
    segmentModifiers: {}, routeCounts: {}, routeTargets: {}, routeRollDays: {}, mainDays: {}, campNights: {}, conditionalDays: {}, cityRollDays: {}, pendingCityRoll: null, settlements: {} }; }
  // GUESTHOUSE_RANDOM_EVENT_SETTLEMENT_FIX_v1.0: every event occurrence (a session, e.g. an inn-night event) settles exactly once.
  // The applied-settlement ledger is part of the game state, so it survives reloads and is checked before any delta is applied;
  // the command store's own idempotency ledger (generation:source:id) remains the outer guard for repeated commands.
  function settlements(p) { const st = state(p); return st.settlements || (st.settlements = {}); }
  function settlementRecord(p, settlementId) { return settlements(p)[settlementId] || null; }
  function summarizeDeltas(actual) {
    const d = { cash: 0, reputation: 0, provisions: 0, cargo: [], worldTicks: 0, routeTicks: 0, info: 0, protection: 0 };
    for (const e of actual) {
      if (e.type === 'cash') d.cash += e.delta; else if (e.type === 'reputation') d.reputation += e.delta; else if (e.type === 'provisions') d.provisions += e.delta;
      else if (e.type === 'cargo_damage' || e.type === 'cargo_loss') d.cargo.push({ type: e.type, lotId: e.lotId, goodId: e.goodId, quantity: e.quantity, condition: e.condition });
      else if (e.type === 'world_time') d.worldTicks += e.deltaTicks; else if (e.type === 'route_remaining') d.routeTicks += e.deltaTicks; else if (e.type === 'info') d.info++; else if (e.type === 'protection') d.protection++;
    }
    return d;
  }
  function state(p) { return p.events || (p.events = initial()); }
  const day = p => Math.floor(p.world.tick / 3);
  const tripKey = p => p.trip ? p.trip.id : "interlude-" + p.tripHistory.length;
  const tripNumber = p => p.tripHistory.length + (p.trip ? 1 : 0);
  function missing(key) { throw new S.util.DomainError("MISSING_AUTHORITY", "缺少已确认规则：" + key, { authorityKey: key }); }
  function selectLots(p, selector) {
    ensure(selectors.has(selector), "EVENT_SELECTOR", "未定义的货物选择器");
    return p.inventory.lots.filter(l => l.quantity > 0 && l.condition !== "destroyed" && (selector === "eligibleCargo"
      || selector === "moistureSensitiveCargo" && moistureGoods.includes(l.goodId)
      || selector.startsWith("good:") && selector.slice(5).split("|").includes(l.goodId)));
  }
  function canAddProvisions(p) { return p.inventory.provisions > 0 || S.inventory.available(p) >= 1; }
  function goodwill(p) { const st = p.events || initial(); return goodFlags.filter(f => st.flags[f] && !st.consumedGoodwill[f]); }
  function lastRecord(p, id) { return (p.events?.history || []).filter(h => h.eventId === id).at(-1); }
  function used(p, id, scope) {
    return (p.events?.history || []).some(h => h.eventId === id && (scope === "save"
      || scope === "trip" && h.tripKey === tripKey(p)
      || scope === "cityTrip" && h.tripKey === tripKey(p) && h.city === p.world.city
      || scope === "route" && h.tripKey === tripKey(p) && h.routeId === p.world.route?.id));
  }
  const routePair = (p, a, b) => Boolean(p.world.route && [p.world.route.from, p.world.route.to].includes(a) && [p.world.route.from, p.world.route.to].includes(b));
  function visitCount(p, city, node) {
    if (Number.isSafeInteger(node?.cityVisitCount)) return node.cityVisitCount;
    const historical = p.tripHistory.filter(t => t.status === "completed").reduce((total, t) => {
      const visits = t.summary?.journey?.route;
      return total + (visits ? visits.filter(c => c === city).length : city === "dunhuang" ? 2 : 1);
    }, 0);
    return historical + (p.trip?.routeHistory || []).filter(c => c === city).length;
  }
  function silkKnowledge(p, node) {
    return node?.hasKhotanSilkKnowledge === true || p.inventory.lots.some(l => l.goodId === "于阗丝织")
      || p.journal.some(j => j.type === "marketBuy" && j.goodId === "于阗丝织")
      || Boolean(p.collectionFlags.khotan_silk || p.collectionFlags.khotan_mulberry_oasis);
  }
  function eligibility(p, id, node) {
    ensure(Object.hasOwn(definitions, id), "EVENT_UNKNOWN", "事件不属于正式内容");
    const e = definitions[id], reasons = [], authority = [], st = p.events || initial();
    const tags = new Set(node?.tags || []), has = tag => tags.has(tag), route = Boolean(p.world.route), city = !route;
    const require = (ok, reason) => { if (!ok) reasons.push(reason); };
    const repeat = scope => require(!used(p, id, scope), "使用次数已达到上限");
    const cooldown = days => { const last = lastRecord(p, id); require(!last || day(p) - last.day >= days, "事件仍在冷却"); };
    const cities = allowed => require(allowed.includes(p.world.city), "城市不符合");
    const inRoute = () => require(route && node?.kind === "route", "不是路线事件节点");
    const inCity = () => require(city && node?.kind === "city", "不是城市事件节点");
    const cargo = selector => selectLots(p, selector).length > 0;
    const edge = has("departure") || has("arrival") || has("cityEdge") || route && (p.world.route.traveledTicks === 0 || p.world.route.remainingTicks === 0);
    // Narrative scenes are generated by the chosen event; they do not require a second node scheduler.
    require(node && ["route", "city", "overnight"].includes(node.kind), "缺少明确事件节点");
    const ongoing = p.eventSession && !p.eventSession.resultCardAcknowledged && p.eventSession.status !== "ACKNOWLEDGED";
    require(!ongoing, "另一事件尚未完成并确认");
    if (id === "S01") {
      inRoute(); require(p.inventory.provisions <= 0, "补给尚未耗尽"); require(!st.conditionalDays[day(p)], "今日已经处理断粮");
      return { eventId: id, eligible: reasons.length === 0, reasons, authority, weight: 0 };
    }
    const overnightSub = node?.kind === "overnight" && node?.nightId && node?.soleNightOutcome === true;
    require(overnightSub || !st.mainDays[day(p)], "今日已有主事件");
    if (/^M0[1-8]$/.test(id)) {
      require(p.cash >= 20, "低现金保护"); require((st.lossCounts[tripKey(p)] || 0) < 3, "本趟破财已达三次");
      require(st.consecutiveLosses < 2, "连续破财保护");
    }
    switch (id) {
      case "M01": inRoute(); repeat("trip"); break;
      case "M02": inRoute(); require(node?.terrain !== "nonSand", "当前明确不是沙地情境"); require(!has("majorSandCrisis"), "正在大型风沙事件"); repeat("route"); break;
      case "M03": require(["inn", "camp"].includes(node?.lodgingContext) && node?.lodgingSettled === true, "需要已结算住宿节点"); repeat("trip"); break;
      case "M04": require(p.inventory.camelCount >= 1 && edge, "需要有骆驼的出发/抵达/近郊节点"); repeat("trip"); break;
      case "M05": require((route || edge) && !has("pureCityMenu"), "需要路线/城门路检情境"); repeat("route"); break;
      case "M06": inRoute(); require(!has("citySafeZone"), "城市安全区不触发"); repeat("trip"); break;
      case "M07": { inRoute(); const last = lastRecord(p, id); require(!last || tripNumber(p) - last.tripNumber >= 2, "两趟内已经出现"); break; }
      case "M08": require(node?.lodgingContext === "inn" && node?.lodgingSettled === true, "需要已结算客舍住宿"); repeat("cityTrip"); break;
      case "G09": inRoute(); repeat("trip"); break;
      case "G10": inRoute(); repeat("trip"); break;
      case "G11": require(node?.kind === "route" || node?.kind === "city", "需要普通主事件节点"); repeat("trip"); break;
      case "G12": {
        inCity();
        require(p.journal.some(j => ["marketBuy", "marketSell", "warehouseHandoff"].includes(j.type) && j.city === p.world.city && day(p) - Math.floor(j.tick / 3) >= 0 && day(p) - Math.floor(j.tick / 3) < 3), "近三日没有同城真实交易/交接"); repeat("cityTrip"); break;
      }
      case "G13": inRoute(); require(!has("majorRouteCrisis"), "大型危机期间不触发同行事件"); repeat("trip"); break;
      case "G14": require(node?.kind === "route" || node?.kind === "city", "需要普通主事件节点"); cooldown(5); break;
      case "G15": require(city || edge, "需要城市/到城社交情境"); require(goodwill(p).length > 0, "没有未兑现善意"); break;
      case "G16": { require(city || edge || has("routeHandoff"), "需要路线交接/到城/货栈情境"); const last = lastRecord(p, id); require(!last || tripNumber(p) - last.tripNumber >= 2, "两趟内已经出现"); break; }
      case "R01": inRoute(); repeat("route"); break;
      case "R02": inRoute(); require(p.inventory.camelCount >= 1, "无骆驼"); repeat("trip"); break;
      case "R03": inRoute(); require(p.world.route?.remainingTicks >= 1, "路程不足一个时段"); repeat("route"); break;
      case "R04": inRoute(); require(Boolean(p.world.route?.to), "需要明确目的地"); repeat("trip"); break;
      case "R05": inRoute(); require(p.inventory.provisions >= 1, "没有补给"); repeat("trip"); break;
      case "R06": inRoute(); require(routePair(p, "dunhuang", "khotan"), "需要敦煌于阗沙路天气节点"); repeat("route"); break;
      case "R07": inRoute(); require(cargo("eligibleCargo"), "没有可运输货物"); repeat("trip"); break;
      case "R08": inRoute(); require(cargo("moistureSensitiveCargo"), "需要怕潮货物和湿气节点"); repeat("trip"); break;
      case "R09": inRoute(); require(cargo("good:唐代陶瓷"), "没有唐代陶瓷"); repeat("trip"); break;
      case "R10": inRoute(); require(cargo("good:药材|干果"), "没有药材或干果"); repeat("trip"); break;
      case "R11": inRoute(); require(canAddProvisions(p), "无法容纳补给"); repeat("trip"); break;
      case "R12": inRoute(); require(p.world.route?.remainingTicks > 0 && !st.segmentModifiers.cargoCamelRiskMultiplier, "已抵达或已有同类保护"); repeat("trip"); break;
      case "R13": inRoute(); repeat("trip"); break;
      case "R14": inRoute(); require(!st.segmentModifiers.weatherCargoRiskMultiplier, "需要未保护的天气前兆节点"); repeat("trip"); break;
      case "R15": inRoute(); require(routePair(p, "dunhuang", "khotan"), "需要敦煌于阗绿洲/河道节点"); repeat("route"); break;
      case "R16": inRoute(); require(routePair(p, "changan", "dunhuang"), "需要长安敦煌道路节点"); repeat("route"); break;
      case "C01": inCity(); cities(["changan"]); cooldown(3); break;
      case "C02": inCity(); cities(["changan"]); require(p.world.tick % 3 === 2, "仅暮时"); break;
      case "C03": cities(["dunhuang"]); require(node?.kind === "city" || edge, "需要敦煌城市/近郊节点"); cooldown(5); break;
      case "C04": inCity(); cities(["khotan"]); cooldown(4); break;
      case "C05": inCity(); cities(["khotan"]); require(visitCount(p, "khotan", node) >= 2 && silkKnowledge(p, node), "需要重复到访及丝织经历"); repeat("save"); break;
      case "C06": cities(["khotan"]); require(city || edge, "需要城市边缘/沙路边缘情境"); repeat("save"); break;
      case "C07": inCity(); cities(["changan"]); cooldown(4); break;
      case "C08": inCity(); cities(["dunhuang"]); cooldown(3); break;
      case "C09": inCity(); cities(["dunhuang"]); cooldown(5); break;
      case "C10": cities(["dunhuang"]); require(city || edge, "需要敦煌城市边缘情境"); repeat("trip"); break;
      case "C11": inCity(); cities(["khotan"]); cooldown(3); break;
      case "C12": inCity(); cities(["khotan"]); cooldown(4); break;
      case "RM-01": case "RM-02": case "RM-03": case "RM-04": case "RM-05": case "RM-06":
        inRoute(); require(Boolean(S.minigames), "没有可启动模块"); repeat("route");
        if (id === "RM-02") require(p.inventory.camelCount >= 1, "没有骆驼");
        if (id === "RM-03") require(node?.terrain !== "nonSand", "当前明确不是沙地情境");
        if (id === "RM-05") require(cargo("eligibleCargo"), "没有可运输货物");
        break;
      default: missing("eligibility:" + id);
    }
    let weight = e.baseWeight;
    if (id === "G14" && p.cash < 20) weight *= 1.5;
    if (id === "M03") weight *= node?.lodgingContext === "inn" ? .15 : 2;
    if (p.world.route?.prepared && preparedCargoEvents.has(id)) weight *= .8;
    if (id === "R01" && (has("sand") || routePair(p, "dunhuang", "khotan")) || id === "R09" && routePair(p, "changan", "dunhuang")
      || id === "R11" && routePair(p, "dunhuang", "khotan") || id === "R15" && cargo("moistureSensitiveCargo")
      || id === "RM-06" && routePair(p, "changan", "dunhuang") || id === "C03" && canAddProvisions(p)
      || id === "C07" && cargo("good:唐代陶瓷") || id === "C12" && (p.reputation.value >= 10 || visitCount(p, "khotan", node) >= 2)
      || id === "C02" && p.collectionFlags.huxuan_dance || id === "C09" && lastRecord(p, id)) authority.push("contextualWeight:" + id);
    if (id === "C01" && p.world.tick % 3 < 2) authority.push("contextualWeight:C01_daytimePriority");
    if (id === "C07" && !cargo("good:唐代陶瓷") && p.journal.some(j => ["marketBuy", "marketSell"].includes(j.type) && j.goodId === "唐代陶瓷"))
      authority.push("contextualWeight:C07_recentTradeWindow");
    return { eventId: id, eligible: reasons.length === 0, reasons, authority, weight };
  }
  function choiceAllowed(p, condition) {
    switch (condition) {
      case null: return true;
      case "provisions>=1": return p.inventory.provisions >= 1;
      case "cash>=8": return p.cash >= 8;
      case "cash>=5": return p.cash >= 5;
      case "cash>=6": return p.cash >= 6;
      case "reputation>=20": return p.reputation.value >= 20;
      case "inventory.干果>=1": return selectLots(p, "good:干果").some(l=>l.ownership==='playerOwned'&&!l.nonMarketable);
      // These jobs are BLOCK. No current command is allowed to manufacture their work history.
      case "workHistory.dunhuangPackingDays>0": case "workHistory.changanInspectionDays>0": return false;
      default: missing("choiceCondition:" + condition);
    }
  }
  function formulaShape(expression) {
    ensure(formulas.has(expression), "EVENT_FORMULA", "公式不在正式事件白名单中");
    let m = /^([+-])randInt\((\d+),(\d+)\)$/.exec(expression);
    if (m) return { type: "range", sign: m[1] === "-" ? -1 : 1, lo: +m[2], hi: +m[3] };
    m = /^-clamp\(round\(cashBefore\*(0\.\d+)\),(\d+),(\d+)\)$/.exec(expression);
    if (m) return { type: "clamp", rate: +m[1], lo: +m[2], hi: +m[3], lodging: false };
    m = /^-\[clamp\(round\(cashBefore\*(0\.\d+)\),(\d+),(\d+)\)\*lodgingLossMultiplier\]$/.exec(expression);
    if (m) return { type: "clamp", rate: +m[1], lo: +m[2], hi: +m[3], lodging: true };
    missing("formulaGrammar:" + expression);
  }
  function cashFormula(p, expression, cashBefore, node) {
    const f = formulaShape(expression);
    if (f.type === "range") return f.sign * (f.lo + Math.floor(S.random.next(p) * (f.hi - f.lo + 1)));
    let amount = Math.max(f.lo, Math.min(f.hi, S.money.round(cashBefore * f.rate)));
    if (f.lodging) {
      ensure(["inn", "camp"].includes(node?.lodgingContext), "EVENT_LODGING", "缺少住宿类型");
      amount *= node.lodgingContext === "inn" ? .60 : 1.25;
    }
    return -S.money.round(amount);
  }
  function preflight(effects, eventId, node) {
    for (const effect of effects) {
      if (effect.type === "info") ensure(S.observations?.selectors.includes(effect.selector),"OBS_SELECTOR","信息解析尚未接入");
      if (effect.type === "segment_modifier") ensure(['cargoCamelRiskMultiplier','weatherCargoRiskMultiplier','ceramicDamageRiskMultiplier'].includes(effect.key)&&Number.isFinite(effect.value)&&effect.value>0&&effect.value<=1,'EVENT_MODIFIER');
      if (effect.type === "cash" && effect.formula) {
        const parsed = formulaShape(effect.formula);
        if (parsed.lodging) ensure(["inn", "camp"].includes(node?.lodgingContext), "EVENT_LODGING");
      }
      if (effect.type === "cargo_damage" || effect.type === "cargo_loss") ensure(selectors.has(effect.selector), "EVENT_SELECTOR");
      if (effect.type === "cargo_damage") ensure(damageTags[eventId], "EVENT_DAMAGE_TAG", "缺少已定义货损类型");
      ensure(["cash", "world_time", "route_remaining", "provisions", "cargo_damage", "cargo_loss", "reputation", "segment_modifier", "info"].includes(effect.type), "EVENT_EFFECT", "未实现的正式效果");
    }
  }
  function hiddenFlags(p, flags, node) {
    const st = state(p);
    for (const flag of flags || []) {
      if (flag === "consume善意flag") {
        const available = goodwill(p); ensure(available.length, "EVENT_GOODWILL");
        st.consumedGoodwill[available[0]] = true;
      } else if (flag === "warehouseRefundClaimed[city]=true") {
        st.flags.warehouseRefundClaimed = st.flags.warehouseRefundClaimed || {}; st.flags.warehouseRefundClaimed[p.world.city] = true;
      } else if (flag.startsWith("pendingCollectionUnlock:")) {
        const id = flag.slice(24).replace(/_if_unseen$/, ""); p.collectionFlags[id] = true;
      } else if (flag.startsWith("historyFlag:")) st.flags[flag.slice(12)] = true;
      else {
        const match = /^([A-Za-z][A-Za-z0-9]*)=true$/.exec(flag);
        ensure(match, "EVENT_FLAG", "未定义的事件标记"); st.flags[match[1]] = true;
      }
    }
  }
  function applyEffects(p, effects, eventId, node, ctx) {
    preflight(effects, eventId, node);
    const actual = [], cashBefore = p.cash, beforeTick = p.world.tick;
    let time = 0;
    for (const [effectIndex,effect] of effects.entries()) {
      if (effect.type === "cash") {
        const delta = effect.formula ? cashFormula(p, effect.formula, cashBefore, node) : effect.delta;
        ensure(Number.isSafeInteger(delta) && p.cash + delta >= 0, "EVENT_CASH", "现金不足以执行结果");
        p.cash += delta; if (delta) actual.push({ type: "cash", delta });
      } else if (effect.type === "world_time") time += effect.deltaTicks;
      else if (effect.type === "route_remaining") {
        ensure(p.world.route, "EVENT_ROUTE", "没有当前路程"); const before = p.world.route.remainingTicks;
        p.world.route.remainingTicks = Math.max(0, before + effect.deltaTicks);
        if (before !== p.world.route.remainingTicks) actual.push({ type: "route_remaining", deltaTicks: p.world.route.remainingTicks - before });
      } else if (effect.type === "provisions") {
        const before = p.inventory.provisions;
        if (effect.delta <= 0 || canAddProvisions(p)) p.inventory.provisions = Math.max(0, before + effect.delta);
        const delta = p.inventory.provisions - before; if (delta) actual.push({ type: "provisions", delta });
      } else if (effect.type === "cargo_loss" || effect.type === "cargo_damage") {
        for (let n = 0; n < effect.count; n++) {
          const rows = selectLots(p, effect.selector).filter(l=>eventId!=='S01'||effect.selector!=='good:干果'||l.ownership==='playerOwned'&&!l.nonMarketable); if (!rows.length) break;
          const lot = S.random.pick(p, rows, x => x.storyUnits?x.storyUnits.filter(u=>u.condition!=='destroyed').length:x.quantity);
          const incidentId=(node?.kind==='overnight'?ctx.sourceId:p.eventSession?.id||ctx.sourceId)+':'+effectIndex+':'+n;
          const item = effect.type === "cargo_loss" ? S.inventory.lose(p, lot.id, 1, {eventId,tag:damageTags[eventId],incidentId}) : S.inventory.damage(p, lot.id, damageTags[eventId], { quantity: 1,incidentId });
          if(item.storyProtected)actual.push({type:'story_protection',lotId:item.id,goodId:item.goodId,quantity:item.protectedQuantity,text:(item.storyLabel||item.goodId)+'已护住，未受到本次伤害。'});
          else actual.push({ type: effect.type, lotId: item.id, goodId: item.goodId, quantity: item.damageQuantity??1, condition: item.storyUnits?item.condition:effect.type === "cargo_loss" ? "lost" : item.condition, ownership: item.ownership });
        }
      } else if (effect.type === "reputation") {
        const before = p.reputation.value; S.reputation.change(p, effect.delta, { type: "event", eventId });
        if (p.reputation.value !== before) actual.push({ type: "reputation", delta: p.reputation.value - before });
      } else if (effect.type === "info") {
        const info=S.observations.resolve(p,effect.selector,{sourceId:node?.kind==='overnight'?'camp:'+p.world.city+':'+day(p)+':'+eventId:p.eventSession?.id||ctx.sourceId,eventId},ctx);
        actual.push({type:'info',observationId:info.id,templateId:info.templateId,actualInfoText:info.text,text:info.text});
      } else if (effect.type === "segment_modifier") {
        state(p).segmentModifiers[effect.key] = { value: effect.value, consume: effect.consume, routeId: p.world.route?.id || null };
        actual.push({ type: "protection", key: effect.key });
      }
    }
    if (time) { ensure(ctx && typeof ctx.advance === "function", "EVENT_OUTER_TIME"); ctx.advance(p, time, "event:" + eventId); }
    if (p.world.tick !== beforeTick) actual.push({ type: "world_time", deltaTicks: p.world.tick - beforeTick });
    return actual;
  }
  function open(p, eventId, node) {
    const eligible = eligibility(p, eventId, node);
    ensure(eligible.eligible, "EVENT_INELIGIBLE", eligible.reasons.join("；"));
    const st = state(p), e = definitions[eventId];
    const id = S.util.id(p, "event");
    const s = { id, occurrenceId: id, settlementId: id + "-settlement", eventId, status: eventId.startsWith("RM-") ? "AWAITING_SKILL" : "AWAITING_CHOICE",
      node: copy(node), openedTick: p.world.tick, tripKey: tripKey(p), tripNumber: tripNumber(p), routeId: p.world.route?.id || null,
      resultCardAcknowledged: false, result: null };
    const boxChoices=S.stories?.damageChoices(p)||[];
    if(boxChoices.length&&e.choices.some(c=>c.outcomes.some(o=>o.effects.some(f=>f.type==='cargo_damage'&&selectLots(p,f.selector).some(l=>l.storyLineId==='QY03')))))s.storyProtectionChoices=copy(boxChoices);
    p.eventSession = s;
    if(node.kind==='route')for(const [key,m]of Object.entries(st.segmentModifiers))if(modifierApplies(p,key,m,eventId)){m.consumed=true;m.consumedAt=p.world.tick;m.consumedBy=s.id;}
    st.history.push({ eventId, sessionId: s.id, day: day(p), tripKey: s.tripKey, tripNumber: s.tripNumber, routeId: s.routeId, city: p.world.city });
    if (eventId === "S01") st.conditionalDays[day(p)] = s.id;
    else if (node.kind !== "overnight") {
      st.mainDays[day(p)] = s.id;
      if (node.kind === "route") st.routeCounts[s.routeId] = (st.routeCounts[s.routeId] || 0) + 1;
    }
    return { kind: "eventOpened", modal: false, eventSessionId: s.id, eventId, title: e.title, text: e.eventText,
      choices: e.choices.map(c => ({ id: c.choiceId, text: c.choiceText, enabled: choiceAllowed(p, c.condition) })) };
  }
  function active(p, id) { ensure(p.eventSession && p.eventSession.id === id, "EVENT_SESSION", "事件会话不匹配"); return p.eventSession; }
  function selectStoryProtection(p,payload){
    const s=active(p,payload.eventSessionId);ensure(['AWAITING_CHOICE','AWAITING_SKILL'].includes(s.status),'EVENT_RESOLVED');
    ensure(s.storyProtectionChoices?.some(c=>c.id===payload.choiceId),'STORY_CHOICE');
    if(s.node.storyProtectionChoice)ensure(s.node.storyProtectionChoice===payload.choiceId,'STORY_CHOICE_FIXED','护箱方式已经记下');
    s.node.storyProtectionChoice=payload.choiceId;
    S.stories?.recordProtectionChoice(p,payload.choiceId,s.id);
    return {kind:'storyProtectionSelected',modal:false,choiceId:payload.choiceId};
  }
  function resolve(p, payload, ctx) {
    const s = active(p, payload.eventSessionId), e = definitions[s.eventId];
    ensure(s.status === "AWAITING_CHOICE", "EVENT_RESOLVED", "该事件已经结算或需要操作小游戏");
    const choice = e.choices.find(c => c.choiceId === payload.choiceId);
    ensure(choice && choiceAllowed(p, choice.condition), "EVENT_CHOICE", "该选项当前不可用");
    // Preflight every possible branch before outcome Roll or any cash/flags/time mutation.
    choice.outcomes.forEach(o => preflight(o.effects, e.eventId, s.node));
    const outcome = S.random.pick(p, choice.outcomes, o => o.probability);
    return settle(p, s, choice, outcome, ctx);
  }
  function settle(p, s, choice, outcome, ctx) {
    const e = definitions[s.eventId], beforeCash = p.cash, beforeTick = p.world.tick, beforeRep = p.reputation.value, beforeProvisions = p.inventory.provisions;
    const sourceTripId = p.trip?.id || null, sourceCity = p.world.city;
    const settlementId = s.settlementId || (s.settlementId = s.id + "-settlement"), occurrenceId = s.occurrenceId || (s.occurrenceId = s.id);
    ensure(!settlementRecord(p, settlementId) && s.status !== "RESOLVED" && s.status !== "ACKNOWLEDGED", "EVENT_SETTLED", "该事件结果已经结算");
    preflight(outcome.effects, e.eventId, s.node);
    const time = outcome.effects.filter(f => f.type === "world_time").reduce((sum, f) => sum + f.deltaTicks, 0);
    const actual = applyEffects(p, outcome.effects.filter(f => f.type !== "world_time"), e.eventId, s.node, ctx);
    hiddenFlags(p, outcome.hiddenFlags, s.node);
    const st = state(p), cashDelta = p.cash - beforeCash;
    if (/^[MG]\d{2}$/.test(e.eventId)) {
      if (cashDelta < 0) { st.consecutiveLosses++; st.lossCounts[s.tripKey] = (st.lossCounts[s.tripKey] || 0) + 1; }
      else st.consecutiveLosses = 0;
      st.moneyHistory.push({ eventId: s.eventId, sessionId: s.id, tripId: sourceTripId, worldTick: s.openedTick,
        cityId: sourceCity, routeId: s.routeId, lodgingContext: s.node.lodgingContext || "none", choiceId: choice.choiceId,
        outcomeId: outcome.outcomeId, cashBefore: beforeCash, delta: cashDelta, cashAfter: p.cash });
    }
    p.journal.push({ type: "event", tripId: sourceTripId, eventId: s.eventId, sessionId: s.id, occurrenceId, settlementId,
      title: e.title, cashDelta, repDelta: p.reputation.value - beforeRep, tick: beforeTick, outcomeId: outcome.outcomeId });
    const night = s.node.nightSnapshot || null;
    settlements(p)[settlementId] = { settlementId, occurrenceId, source: night ? "guesthouse_random_event" : s.node.kind === "route" ? "route_event" : "city_event", eventId: s.eventId, sessionId: s.id,
      choiceId: choice.choiceId, outcomeId: outcome.outcomeId, tick: beforeTick, tripId: sourceTripId, city: sourceCity,
      cashBefore: beforeCash, cashAfter: p.cash, reputationBefore: beforeRep, reputationAfter: p.reputation.value, provisionsBefore: beforeProvisions, provisionsAfter: p.inventory.provisions,
      deltas: summarizeDeltas(actual), lodging: night ? { action: night.action, lodgingCost: night.lodgingCost, cashBeforeLodging: night.before.cash } : null };
    // Outcome state and histories are visible to the one outer time transaction.
    if (time) { ensure(ctx && typeof ctx.advance === "function", "EVENT_OUTER_TIME"); ctx.advance(p, time, "event:" + e.eventId); }
    if (p.world.tick !== beforeTick) actual.push({ type: "world_time", deltaTicks: p.world.tick - beforeTick });
    s.status = "RESOLVED";
    s.result = { kind: "event", modal: true, eventSessionId: s.id, occurrenceId, settlementId, eventId: s.eventId, title: e.title,
      chosenDisplayText: choice.chosenDisplayText, outcomeId: outcome.outcomeId, resultText: outcome.resultText,
      effects: actual, outcomeNotes: copy(outcome.outcomeNotes || []), acknowledged: false, cashDelta, cashAfter: p.cash,
      nightSnapshot: copy(s.node.nightSnapshot || null) };
    return copy(s.result);
  }
  function resolveRM(p, payload, ctx) {
    const s = active(p, payload.eventSessionId), result = p.work?.routeGame?.result;
    ensure(s.status === "AWAITING_SKILL" && result && result.sessionId === payload.rmSessionId
      && result.eventSessionId === s.id && result.moduleId === s.eventId && !result.worldEffectsCommitted, "RM_RESULT_REQUIRED", "没有当前事件的未消费小游戏结果");
    // RC3 BUG-05: skipping or aborting a route minigame settles the module's approved MISSED outcome, exactly once.
    if (result.completionStatus !== "COMPLETED") ensure(["SKIPPED", "ABORTED"].includes(result.completionStatus), "RM_RESULT_STATUS");
    const tier = result.completionStatus === "COMPLETED" ? result.tier : "MISSED";
    const choice = definitions[s.eventId].choices[0], outcome = choice.outcomes.find(o => o.outcomeId === tier);
    ensure(outcome, "RM_RESULT_TIER");
    const snapshot = settle(p, s, choice, outcome, ctx); result.worldEffectsCommitted = true; result.settledAs = tier; snapshot.settledAs = tier; snapshot.completionStatus = result.completionStatus; return snapshot;
  }
  function ack(p, id) {
    const s = active(p, id); ensure(s.status === "RESOLVED" || s.status === "ACKNOWLEDGED", "EVENT_UNRESOLVED");
    s.resultCardAcknowledged = true; s.status = "ACKNOWLEDGED"; if (s.result) s.result.acknowledged = true;
  }
  function campPool(city) { ensure(data.campPool.citySpecific[city], "EVENT_CITY"); return [...data.campPool.common, ...data.campPool.citySpecific[city]]; }
  function resolveCamp(p, eventId, nightId, ctx) {
    ensure(typeof nightId === "string" && nightId.length > 0, "CAMP_NIGHT");
    const e = campPool(p.world.city).find(row => row.eventId === eventId); ensure(e, "CAMP_EVENT");
    ensure(!p.events?.campNights[nightId], "CAMP_RESOLVED", "当夜已经结算");
    const settlementId = "camp-" + nightId.replace(/:/g, "-") + "-settlement"; ensure(!settlementRecord(p, settlementId), "EVENT_SETTLED", "当夜已经结算");
    preflight(e.effects, e.eventId, { kind: "overnight" });
    const st = state(p), beforeCash = p.cash, beforeRep = p.reputation.value, beforeProvisions = p.inventory.provisions;
    const actual = applyEffects(p, e.effects, e.eventId, { kind: "overnight" }, ctx); hiddenFlags(p, e.hiddenFlags);
    const result = { kind: "camp", modal: true, nightId, eventId, occurrenceId: nightId, settlementId, title: e.title, resultText: e.resultText, effects: actual, cashDelta: p.cash - beforeCash, cashAfter: p.cash };
    st.campNights[nightId] = copy(result);
    settlements(p)[settlementId] = { settlementId, occurrenceId: nightId, source: "camp_night_event", eventId, tick: p.world.tick, tripId: p.trip?.id || null, city: p.world.city, cashBefore: beforeCash, cashAfter: p.cash, reputationBefore: beforeRep, reputationAfter: p.reputation.value, provisionsBefore: beforeProvisions, provisionsAfter: p.inventory.provisions, deltas: summarizeDeltas(actual), lodging: null };
    return result;
  }
  function routeTarget(p) {
    ensure(p.world.route && p.trip, "EVENT_ROUTE"); const st = state(p), route = p.world.route;
    if (Object.hasOwn(st.routeTargets, route.id)) return st.routeTargets[route.id];
    if (Number.isSafeInteger(route.targetEvents) && [2, 3].includes(route.targetEvents)) st.routeTargets[route.id] = route.targetEvents;
    else if (p.tripHistory.length === 0) st.routeTargets[route.id] = 3;
    else if (routePair(p, "changan", "dunhuang")) st.routeTargets[route.id] = S.random.next(p) < .6 ? 2 : 3;
    else if (routePair(p, "dunhuang", "khotan")) st.routeTargets[route.id] = S.random.next(p) < .4 ? 2 : 3;
    else missing("routeTarget:" + route.id);
    return st.routeTargets[route.id];
  }
  function routeDecision(p, remainingOpportunityDays, extraDelayDay = false) {
    ensure(Number.isSafeInteger(remainingOpportunityDays) && remainingOpportunityDays >= 1, "EVENT_OPPORTUNITIES");
    const st = state(p), target = routeTarget(p), count = st.routeCounts[p.world.route.id] || 0, today = day(p);
    if (st.mainDays[today]) return { trigger: false, reason: "dailyLimit", target, count };
    if (Object.hasOwn(st.routeRollDays, today)) return copy(st.routeRollDays[today]);
    const forced = target - count >= remainingOpportunityDays;
    const hadRouteEvent = d => st.history.some(h => h.day === d && h.routeId && h.eventId !== "S01");
    const twoPrevious = hadRouteEvent(today - 1) && hadRouteEvent(today - 2);
    // Approved approximate 20–25% delay-day range: the P0 build uses its 20% lower bound.
    const probability = count >= target ? extraDelayDay ? .20 : 0 : forced ? 1 : twoPrevious ? .35 : .65;
    const trigger = probability === 1 || probability > 0 && S.random.next(p) < probability;
    const decision = { trigger, target, count, forced, probability }; st.routeRollDays[today] = copy(decision); return decision;
  }
  function chooseMain(p, node) {
    const candidates = data.mainEvents.map(e => eligibility(p, e.eventId, node)).filter(r => r.eligible);
    // Canonical base weights are executable. Qualitative balancing notes are not
    // gameplay eligibility failures and must not block the whole route pool.
    if(!candidates.length)return null;
    for(const c of candidates)for(const [key,m]of Object.entries(p.events?.segmentModifiers||{}))if(modifierApplies(p,key,m,c.eventId))c.weight*=m.value;
    return S.random.pick(p, candidates, c => c.weight).eventId;
  }
  function modifierApplies(p,key,m,eventId){
    if(m.consumed||!p.world.route||m.routeId&&m.routeId!==p.world.route.id)return false;
    const e=definitions[eventId];if(!e)return false;
    if(key==='cargoCamelRiskMultiplier')return preparedCargoEvents.has(eventId);
    if(key==='weatherCargoRiskMultiplier')return ['R01','R06','R08','R15','RM-03'].includes(eventId);
    if(key==='ceramicDamageRiskMultiplier')return selectLots(p,'good:唐代陶瓷').length>0&&e.choices.some(c=>c.outcomes.some(o=>o.effects.some(f=>['cargo_damage','cargo_loss'].includes(f.type)&&selectLots(p,f.selector).some(l=>l.goodId==='唐代陶瓷'))));
    return false;
  }
  function enteredRoute(p){for(const m of Object.values(p.events?.segmentModifiers||{}))if(!m.routeId&&!m.consumed)m.routeId=p.world.route.id;}
  function arrivedRoute(p,routeId){for(const m of Object.values(p.events?.segmentModifiers||{}))if(m.routeId===routeId){m.consumed=true;m.consumedAt=p.world.tick;m.reason='arrival';}}
  // ---- RC3 BUG-04: city event scheduler. Locked probability 50%, one judgement per (city, world day), result persisted.
  const CITY_EVENT_PROBABILITY = 0.5;
  const cityRollKey = (city, worldDay) => city + ':' + worldDay;
  function cityDecision(p, ctx, options = {}) {
    const st = state(p); st.cityRollDays ||= {};
    const city = options.city || p.world.city, worldDay = Number.isSafeInteger(options.day) ? options.day : day(p), key = cityRollKey(city, worldDay);
    if (Object.hasOwn(st.cityRollDays, key)) return copy(st.cityRollDays[key]);
    ensure(!p.world.route && p.world.city === city, 'CITY_EVENT_CONTEXT', '城市事件只能在城内判定');
    const roll = S.random.next(p), trigger = roll < CITY_EVENT_PROBABILITY;
    const record = { key, city, day: worldDay, roll, probability: CITY_EVENT_PROBABILITY, trigger, innNight: Boolean(options.innNight), eventId: null, sessionId: null, tick: p.world.tick, reason: trigger ? null : 'noTrigger' };
    st.cityRollDays[key] = record; // Saved before candidate filtering: a failed draw is never re-rolled.
    if (!trigger) return copy(record);
    const node = { kind: 'city', tags: [], city, innNight: Boolean(options.innNight), ...(options.innNight ? { lodgingContext: 'inn', lodgingSettled: true } : {}) };
    const eventId = chooseMain(p, node);
    if (!eventId) { record.reason = 'noCandidate'; return copy(record); }
    const opened = open(p, eventId, node);
    record.eventId = eventId; record.sessionId = opened.eventSessionId;
    return { ...copy(record), opened };
  }
  // A formal inn stay shares the same daily judgement; the node carries the inn lodging context (M08 etc.).
  function innNight(p, ctx) { const decision = cityDecision(p, ctx, { innNight: true }); return decision.opened || null; }
  function blockedForCityRoll(p) {
    if (p.world.route) return true;
    if (p.eventSession && p.eventSession.status !== 'ACKNOWLEDGED') return true;
    const tavern = p.work?.tavern; if (tavern && (!tavern.result || tavern.result.completionStatus === 'COMPLETED' && !tavern.resultAcknowledged)) return true;
    if (p.work?.routeGame && !p.work.routeGame.result) return true;
    if (S.caravan?.isActive && S.caravan.isActive(p)) return true;
    if (p.market?.visit && !p.market.visit.settled) return true;
    return false;
  }
  // Called after every command. Only a successful, time-advancing in-city action earns a judgement (keyed by its start day).
  function afterCityAction(p, command, before, ctx) {
    const st = state(p); st.cityRollDays ||= {};
    const advanced = p.world.tick > before.tick && !before.onRoute && !p.world.route && command.type !== 'trip.journey';
    if (advanced && !Object.hasOwn(st.cityRollDays, cityRollKey(before.city, before.day)) && !st.pendingCityRoll) st.pendingCityRoll = { city: before.city, day: before.day, tick: before.tick, command: command.type };
    const pending = st.pendingCityRoll; if (!pending) return null;
    if (pending.city !== p.world.city || pending.day < day(p) - 1 || Object.hasOwn(st.cityRollDays, cityRollKey(pending.city, pending.day))) { st.pendingCityRoll = null; return null; }
    if (blockedForCityRoll(p)) return null;
    st.pendingCityRoll = null;
    return cityDecision(p, ctx, { city: pending.city, day: pending.day });
  }
  function migrate(p) { const st = state(p); st.cityRollDays ||= {}; if (st.pendingCityRoll === undefined) st.pendingCityRoll = null; st.settlements ||= {}; }
  function settlementsView(p) { return copy(settlements(p)); }
  S.events = { initial, definitions, eligibility, choiceAllowed, selectLots, preflight, cashFormula, applyEffects,
    open, resolve, resolveRM, ack, campPool, resolveCamp, settlementRecord, settlements: settlementsView, summarizeDeltas, routeTarget, routeDecision, chooseMain, cityDecision, innNight, afterCityAction, cityRollKey, CITY_EVENT_PROBABILITY, migrate, selectStoryProtection, modifierApplies, enteredRoute, arrivedRoute };
  S.commands.register('EVENT_STORY_PROTECTION_SELECT',selectStoryProtection);
  S.commands.register("EVENT_CHOOSE", (p, payload, ctx) => resolve(p, payload, ctx));
  S.commands.register("EVENT_RM_RESOLVE", (p, payload, ctx) => resolveRM(p, payload, ctx));
})(globalThis.Silk = globalThis.Silk || {});
