(function (S) {
  "use strict";
  const { ensure: E, integer, clone } = S.util;
  const cities = { CA: "changan", DH: "dunhuang", HT: "khotan" };
  const types = { "需求↑": "demand_up", "需求↓": "demand_down", "供应↑": "supply_up", "供应↓": "supply_down" };
  const levels = { "轻度": ["light", .05], "中等": ["medium", .10], "显著": ["strong", .15] };
  const labels = { demand_up: "需求渐旺", demand_down: "需求转弱", supply_up: "供应渐增", supply_down: "货源趋紧" };
  const sign = type => ["demand_up", "supply_down"].includes(type) ? 1 : -1;
  const day = p => S.time.day(p);
  const authority='03_YUERONG_G01-G05_GAMEPLAY_CONTRACT_2026-09-10_v1.0_LOCKED:G05';
  const insufficient='当前没有足够可靠的消息形成新一期商报，请稍后再来。';
  function missing(key, message) { throw new S.util.DomainError("MISSING_AUTHORITY", message, { authorityKey: key }); }
  const definitions = Object.fromEntries(globalThis.SilkData.reports.map(row => {
    const goods = row.goods.split("；"), raw = row.pressure.split("；"), start = /^(\d)日后(?:起)?$/.exec(row.start), duration = /^(\d)(?:[–—-](\d))?日$/.exec(row.duration);
    E(goods.length === raw.length && start && duration, "REPORT_SOURCE_INVALID");
    const pressures = raw.map((text, i) => {
      const match = /^(需求[↑↓]|供应[↑↓]) (轻度|中等|显著)$/.exec(text); E(match, "REPORT_SOURCE_INVALID");
      return { goodId: goods[i], pressureType: types[match[1]], pressureLevel: levels[match[2]][0], pressureDelta: levels[match[2]][1] };
    });
    return [row.id, Object.freeze({ ...clone(row), city: cities[row.id.slice(0, 2)], affectedGoods: Object.freeze(goods), pressures: Object.freeze(pressures.map(Object.freeze)), startOffsetDays: Number(start[1]), minDurationDays: Number(duration[1]), maxDurationDays: Number(duration[2] || duration[1]) })];
  }));
  Object.freeze(definitions);
  function allIssues(p) { return p.market.reportIssues || []; }
  function eligibleTemplates(p, city, issueDay = day(p)) {
    E(Object.values(cities).includes(city) && integer(issueDay) && issueDay <= day(p), "REPORT_CITY_OR_DAY");
    return Object.values(definitions).filter(row => row.city === city && !allIssues(p).some(issue => issue.city === city && issue.issueWorldDay <= issueDay && issueDay - issue.issueWorldDay < 5 && issue.messages.some(m => m.templateId === row.id)));
  }
  function eventStatus(event, currentDay) {
    if (event.status === "cancelled") return "cancelled";
    if (currentDay >= event.plannedStartWorldDay + event.durationDays) return "completed";
    if (currentDay >= event.plannedStartWorldDay) return "active";
    return event.delayed ? "delayed" : "scheduled";
  }
  function visibleIssue(issue) {
    // Internal pressure values are never part of the UI/read model.
    return { id: issue.id, city: issue.city, issueWorldDay: issue.issueWorldDay, acquiredWorldDay: issue.acquiredWorldDay, acquiredTick: issue.acquiredTick,
      price: 2, messages: issue.messages.map(m => ({ templateId: m.templateId, eventId: m.eventId, title: m.title, text: m.text, updateId:m.updateId||null })), productJudgements: clone(issue.productJudgements) };
  }
  function latest(p, city = p.world.city) {
    const rows = p.messages.reports.filter(r => r.city === city);
    const row = rows.reduce((last, r) => !last || r.issueWorldDay > last.issueWorldDay || r.issueWorldDay === last.issueWorldDay && r.acquiredTick >= last.acquiredTick ? r : last, null);
    return row ? visibleIssue(row) : null;
  }
  function history(p, city) { return p.messages.reports.filter(r => !city || r.city === city).map(visibleIssue); }
  function judgements(p, entries, events, plan) {
    const result = {}, map = new Map(events.map(e => [e.eventId, e]));
    for (const good of S.inventory.goods) {
      const affected = entries.flatMap(m => {
        const event = map.get(m.eventId);
        return ["completed", "cancelled"].includes(eventStatus(event, plan.issueWorldDay)) ? [] : event.pressures.filter(e => e.goodId === good.id);
      });
      const directions = new Set(affected.map(e => sign(e.pressureType))), words = [...new Set(affected.map(e => labels[e.pressureType]))];
      if (directions.size > 1) {
        const approval = plan.conflictJudgements?.[good.id];
        if (!approval || approval.label !== "波动加剧" || typeof approval.text !== "string" || !approval.text.trim() || typeof approval.authoritySource !== "string" || !approval.authoritySource.trim()) missing("newspaper.conflictNarrative:" + good.id, "同商品相反预测缺少明确的两股力量文案");
        result[good.id] = { label: "波动加剧", text: approval.text };
      } else result[good.id] = { label: words[0] || "价稳", labels: words.length ? words : ["价稳"] };
    }
    return result;
  }
  function validIdentity(value) { return typeof value === "string" && /^[A-Za-z0-9_:.\/-]{1,180}$/.test(value); }
  function issueCandidates(p,city){
    return eligibleTemplates(p,city).flatMap(row=>{
      const previous=p.market.scheduled.filter(e=>e.cityId===city&&e.templateId===row.id).slice(-1)[0];
      if(!previous)return [{templateId:row.id}];
      const status=eventStatus(previous,day(p));
      if(status==='completed')return [{templateId:row.id}];
      if(status==='scheduled')return []; // The same pending event may only be updated, never created again.
      const updateKey=previous.eventId+':'+status+':'+(previous.changes?.length||0);
      const already=allIssues(p).some(issue=>issue.messages.some(m=>m.updateKey===updateKey));
      if(already)return status==='cancelled'?[{templateId:row.id}]:[];
      const updateIds={delayed:'REPORT-UPDATE-DELAYED',active:'REPORT-UPDATE-ACTIVE',cancelled:'REPORT-UPDATE-CANCELLED'};
      if(!updateIds[status])return [];
      const suffix={delayed:'已有延期消息，原定安排已经推迟。',active:'所涉市场变化已经开始。',cancelled:'原定安排已经取消。'}[status];
      return [{templateId:row.id,eventId:previous.eventId,updateKey,update:{id:updateIds[status],title:row.title+' · 进展',text:'此前报道的「'+row.title+'」'+suffix,authoritySource:authority}}];
    });
  }
  function validCombination(entries,city){
    const counts={},directions={};let updates=0,hasLocal=false;
    for(const entry of entries){
      if(entry.eventId&&++updates>1)return null;
      for(const x of definitions[entry.templateId].pressures){
        if((counts[x.goodId]=(counts[x.goodId]||0)+1)>2)return null;
        const direction=sign(x.pressureType);if(directions[x.goodId]&&directions[x.goodId]!==direction)return null;
        directions[x.goodId]=direction;if(S.inventory.good(x.goodId).originCity===city)hasLocal=true;
      }
    }
    return Object.keys(counts).length>=2?{entries,hasLocal}:null;
  }
  function combinations(pool,size,city){
    const rows=[];
    function walk(start,chosen){if(chosen.length===size){const valid=validCombination(chosen,city);if(valid)rows.push(valid);return;}
      for(let i=start;i<=pool.length-(size-chosen.length);i++)walk(i+1,[...chosen,pool[i]]);
    }
    walk(0,[]);const local=rows.filter(r=>r.hasLocal);return local.length?local:rows;
  }
  function options(p,city){
    const pool=issueCandidates(p,city),sizes=pool.length>=5?[3,4,5]:pool.length>=3?[pool.length]:[];
    const possible=sizes.map(size=>({size,rows:combinations(pool,size,city)})).filter(x=>x.rows.length);
    // Prefer a feasible local-specialty composition without relaxing count/cooldown constraints.
    const local=possible.filter(x=>x.rows.some(r=>r.hasLocal));return {pool,possible:local.length?local:possible};
  }
  function availability(p,city=p.world.city){
    E(Object.values(cities).includes(city),'REPORT_CITY_OR_DAY');
    const current=latest(p,city),next=current?current.issueWorldDay+5:day(p),owned=Boolean(current&&day(p)<next);
    const eligible=!owned&&options(p,city).possible.length>0;
    return {city,owned,canGenerate:eligible,nextEligibleWorldDay:next,latest:current,reason:owned?'本期已购':eligible?null:insufficient};
  }
  function generatePlan(p,city){
    const available=options(p,city);E(available.possible.length,'REPORT_INSUFFICIENT_CANDIDATES',insufficient);
    const selectedSize=S.random.pick(p,available.possible),selected=S.random.pick(p,selectedSize.rows);
    const entries=selected.entries.map(entry=>{const row=definitions[entry.templateId];return entry.eventId?clone(entry):{...entry,durationDays:row.minDurationDays+Math.floor(S.random.next(p)*(row.maxDurationDays-row.minDurationDays+1))};});
    return {id:S.util.id(p,'report-'+city),city,issueWorldDay:day(p),entries,...(!selected.hasLocal?{localSpecialtyUnavailable:{authoritySource:authority,reason:'No composition satisfying current candidate/cooldown/good limits contains a local specialty'}}:{})};
  }
  function prepareIssue(p, plan) {
    E(plan && validIdentity(plan.id) && plan.id.length <= 120 && Object.values(cities).includes(plan.city) && integer(plan.issueWorldDay), "REPORT_PLAN_INVALID");
    const existing = allIssues(p).find(r => r.id === plan.id);
    if (existing) {
      E(existing.city === plan.city && existing.issueWorldDay === plan.issueWorldDay && existing.planSignature === S.util.stable(plan), "REPORT_ISSUE_CONFLICT");
      return { issue: clone(existing), events: [], existing: true };
    }
    E(plan.issueWorldDay === day(p), "REPORT_RETROACTIVE_ISSUE", "新刊必须按当前世界状态形成");
    E(Array.isArray(plan.entries) && plan.entries.length >= 3 && plan.entries.length <= 5, "REPORT_COUNT", "每期须有三至五条正式消息");
    const unique = new Set(), counts = {}, newEvents = [], linkedEvents = [], messages = [], eligible = new Set(eligibleTemplates(p, plan.city, plan.issueWorldDay).map(r => r.id));let updates=0;
    for (const entry of plan.entries) {
      const row = definitions[entry.templateId]; E(row && row.city === plan.city && !unique.has(row.id), "REPORT_TEMPLATE_INVALID"); unique.add(row.id);
      // An existing event can only be reported with an explicit state-aware update; never clone it.
      let event;
      if (entry.eventId) {
        E(++updates<=1,'REPORT_UPDATE_LIMIT');
        event = p.market.scheduled.find(e => e.eventId === entry.eventId);
        E(event && event.cityId === plan.city && event.templateId === row.id, "REPORT_EVENT_REFERENCE");
        E(eligible.has(row.id), "REPORT_TEMPLATE_COOLDOWN", "同一消息模板尚未满五日冷却");
        E(entry.update && validIdentity(entry.update.id) && typeof entry.update.text === "string" && entry.update.text.trim() && typeof entry.update.title === "string" && entry.update.title.trim() && typeof entry.update.authoritySource === "string" && entry.update.authoritySource.trim(), "REPORT_UPDATE_REQUIRED", "事件进展必须提供正式更新文案");
      } else {
        E(eligible.has(row.id), "REPORT_TEMPLATE_COOLDOWN", "同一消息模板尚未满五日冷却");
        let durationDays = row.minDurationDays;
        if (row.minDurationDays !== row.maxDurationDays) {
          if (entry.durationDays === undefined) missing("newspaper.duration:" + row.id, "此市场事件的持续天数范围尚未选定");
          E(integer(entry.durationDays, row.minDurationDays, row.maxDurationDays), "REPORT_DURATION"); durationDays = entry.durationDays;
        } else E(entry.durationDays === undefined || entry.durationDays === durationDays, "REPORT_DURATION");
        const eventId = "market-event:" + plan.id + ":" + row.id;
        E(!p.market.scheduled.some(e => e.eventId === eventId), "DUPLICATE_MARKET_EVENT");
        event = { eventId, templateId: row.id, sourceReportId: plan.id, cityId: plan.city, affectedGoods: [...row.affectedGoods], pressures: clone(row.pressures),
          plannedStartWorldDay: plan.issueWorldDay + row.startOffsetDays, originalPlannedStartWorldDay: plan.issueWorldDay + row.startOffsetDays,
          durationDays, status: "scheduled", delayed: false, changes: [] };
        newEvents.push(event);
      }
      linkedEvents.push(event);
      for (const good of event.affectedGoods) { counts[good] = (counts[good] || 0) + 1; E(counts[good] <= 2, "REPORT_GOOD_LIMIT"); }
      messages.push({ templateId: row.id, eventId: event.eventId, title: entry.update?.title || row.title, text: entry.update?.text || row.text, updateId: entry.update?.id || null, updateKey:entry.updateKey||null });
    }
    E(Object.keys(counts).length >= 2, "REPORT_GOOD_DIVERSITY");
    const hasLocal = Object.keys(counts).some(id => S.inventory.good(id).originCity === plan.city);
    if (!hasLocal) {
      // A policy must show why local goods were unavailable, instead of silently ignoring this rule.
      if (!plan.localSpecialtyUnavailable || typeof plan.localSpecialtyUnavailable.authoritySource !== "string") missing("newspaper.localSpecialtyEligibility", "本期未含当地特产，缺少候选不可行依据");
    }
    const productJudgements = judgements(p, messages, linkedEvents, plan);
    return { issue: { id: plan.id, city: plan.city, issueWorldDay: plan.issueWorldDay, price: 2, messages, productJudgements, planSignature: S.util.stable(plan) }, events: newEvents, existing: false };
  }
  function purchase(p, payload, ctx) {
    E(!p.world.route, 'CITY_REQUIRED', '请抵达城市后查看商情。');
    if(payload.visitId!==undefined)E(p.market.visit?.id===payload.visitId&&!p.market.visit.settled&&p.market.visit.city===p.world.city,'STALE_MARKET_VISIT','当前市场访问已结束，请从商情购买。');
    const current=availability(p);
    if(current.owned)return {kind:'newspaper',modal:false,report:current.latest,text:'本期已购',alreadyOwned:true,cashDelta:0,elapsed:0};
    if(!current.canGenerate)return {kind:'newspaperUnavailable',modal:false,text:insufficient,cashDelta:0,elapsed:0};
    E(p.cash >= 2, "INSUFFICIENT_CASH", "随身现钱不足");
    // All rolls, IDs and preflight operate on a draft; even direct callers retain an exact snapshot on failure.
    const draft=clone(p),plan=generatePlan(draft,p.world.city),prepared = prepareIssue(draft, plan);
    if (typeof ctx.assertScheduledMarketEventsSupported !== "function") missing("market.scheduledEventPricePolicy", "正式价格引擎尚未接入商报市场事件");
    ctx.assertScheduledMarketEventsSupported(clone(draft), clone(prepared.events));
    // Schedule first, snapshot the resulting issue, then charge. One outer store transaction owns all three.
    draft.cash-=2;draft.market.scheduled.push(...clone(prepared.events));
    if (!prepared.existing) { draft.market.reportIssues = draft.market.reportIssues || []; draft.market.reportIssues.push(clone(prepared.issue)); }
    const acquired = { ...clone(prepared.issue), acquiredWorldDay: day(draft), acquiredTick: draft.world.tick };
    draft.messages.reports.push(acquired);
    draft.journal.push({ type: "newspaper", tripId: draft.trip?.id || null, tick: draft.world.tick, city: draft.world.city, reportId: acquired.id, cashDelta: -2 });
    Object.assign(p,draft);
    return { kind: "newspaper", modal: false, report: visibleIssue(acquired), cashDelta: -2, elapsed: 0 };
  }
  function activeEvents(p, city, observedDay = day(p)) {
    E(Object.values(cities).includes(city) && integer(observedDay) && observedDay <= day(p), "FUTURE_MARKET_READ", "实际市价不得读取未来市场事件");
    return clone(p.market.scheduled.filter(e => e.cityId === city && eventStatus(e, observedDay) === "active"));
  }
  function reviseEvent(p, change) {
    const event = p.market.scheduled.find(e => e.eventId === change.eventId);
    E(event && validIdentity(change.changeId), "MARKET_EVENT_CHANGE");
    const signature = S.util.stable(change), prior = event.changes.find(c => c.id === change.changeId);
    if (prior) { E(prior.signature === signature, "MARKET_EVENT_CHANGE_CONFLICT"); return clone(prior.result); }
    E(eventStatus(event, day(p)) !== "completed" && event.status !== "cancelled", "MARKET_EVENT_FINISHED");
    E(change.notice && typeof change.notice.text === "string" && change.notice.text.trim() && typeof change.notice.authoritySource === "string" && change.notice.authoritySource.trim(), "MARKET_UPDATE_NOTICE_REQUIRED", "预测变化必须有正式可见消息");
    E(Object.keys(change).every(k => ["eventId", "changeId", "plannedStartWorldDay", "pressureLevel", "cancel", "notice"].includes(k)), "MARKET_EVENT_CHANGE");
    E(change.cancel === undefined || typeof change.cancel === "boolean", "MARKET_EVENT_CHANGE");
    if (change.plannedStartWorldDay !== undefined) E(integer(change.plannedStartWorldDay, day(p)), "MARKET_EVENT_START");
    const level = change.pressureLevel === undefined ? null : Object.values(levels).find(l => l[0] === change.pressureLevel);
    if (change.pressureLevel !== undefined) E(level && event.pressures.every(x => level[1] <= x.pressureDelta), "MARKET_EVENT_PRESSURE", "此接口仅接受明确的压力减弱");
    E(change.cancel || change.plannedStartWorldDay !== undefined || level, "MARKET_EVENT_NO_CHANGE");
    const before = clone(event);
    if (change.plannedStartWorldDay !== undefined) { event.delayed = change.plannedStartWorldDay > event.plannedStartWorldDay; event.plannedStartWorldDay = change.plannedStartWorldDay; }
    if (level) for (const pressure of event.pressures) { pressure.pressureLevel = level[0]; pressure.pressureDelta = level[1]; }
    if (change.cancel) event.status = "cancelled"; else event.status = eventStatus(event, day(p));
    const observation = { id: S.util.id(p, "observation"), source: "marketEventUpdate", sourceId: change.changeId, eventId: event.eventId, city: event.cityId, tick: p.world.tick, text: change.notice.text };
    p.messages.observations.push(observation);
    const result = { eventId: event.eventId, changeId: change.changeId, observationId: observation.id, previousStartWorldDay: before.plannedStartWorldDay, plannedStartWorldDay: event.plannedStartWorldDay };
    event.changes.push({ id: change.changeId, signature, tick: p.world.tick, result: clone(result) });
    return result;
  }
  function updateStatuses(p) { for (const event of p.market.scheduled) event.status = eventStatus(event, day(p)); }
  function validate(p) {
    const ids = new Set();
    for (const event of p.market.scheduled) {
      E(validIdentity(event.eventId) && !ids.has(event.eventId), "DUPLICATE_MARKET_EVENT"); ids.add(event.eventId);
      E(definitions[event.templateId] && event.cityId === definitions[event.templateId].city && integer(event.plannedStartWorldDay) && integer(event.durationDays, 1, 3), "MARKET_EVENT_INVALID");
      E(Array.isArray(event.pressures) && event.pressures.every(x => definitions[event.templateId].affectedGoods.includes(x.goodId) && Object.values(types).includes(x.pressureType) && Object.values(levels).some(l => l[0] === x.pressureLevel && l[1] === x.pressureDelta)), "MARKET_EVENT_INVALID");
    }
    E(new Set(p.messages.reports.map(r => r.id)).size === p.messages.reports.length, "DUPLICATE_REPORT");
  }
  S.newspapers = { definitions, eligibleTemplates, issueCandidates, availability, prepareIssue, purchase, latest, history, activeEvents, reviseEvent, updateStatuses, validate };
  S.commands.register("newspaper.purchase", purchase);
  S.time.register("newspapers", { dayStart: updateStatuses });
})(globalThis.Silk = globalThis.Silk || {});
