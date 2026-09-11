(function (S) {
  'use strict';
  const E = S.util.ensure, clone = S.util.clone, data = () => globalThis.SilkData.commissions;
  const cities = { 长安: 'changan', 敦煌: 'dunhuang', 于阗: 'khotan' }, route = ['changan', 'dunhuang', 'khotan', 'dunhuang', 'changan'], ticks = [9, 12, 12, 9];
  const activeStatuses = new Set(['accepted', 'pending_pickup', 'in_transit', 'ready_to_turn_in']);
  const terminalStatuses = new Set(['completed', 'failed', 'cancelled', 'expired', 'abandoned']);
  // RC3 BUG-09: fixed posting stops. 长安出发 0 / 敦煌去程 1 / 于阗 2 / 敦煌返程 3 / 长安返程 4.
  const stageLabels = ['长安（出发）', '敦煌（去程）', '于阗', '敦煌（返程）', '长安（返程）'];
  const scales = { basic: { rep: [1, 2], margin: [15, 20], premium: [10, 15], minimum: 6 }, good: { rep: [2, 3], margin: [20, 25], premium: [15, 20], minimum: 10 }, entrusted: { rep: [3, 4], margin: [25, 30], premium: [20, 25], minimum: 15 } };
  function initial() { return { pool: [], active: [], results: [], history: [], starterGenerated: false, poolTripId: null, generatedReputation: null, templateHistory: [] }; }
  const rollInt = (p, lo, hi) => lo + Math.floor(S.random.next(p) * (hi - lo + 1));
  function capacity(p) { return p.reputation.value < 5 ? 0 : p.reputation.value < 10 ? 1 : p.reputation.value < 20 ? 2 : p.reputation.value < 40 ? 3 : 4; }
  function config(p, starter) {
    if (starter || p.reputation.value < 10) return { counts: [3, 0, 0], stage: [1, 1, 1, 0], typeMin: 1 };
    if (p.reputation.value < 20) return { counts: [3, 2, 0], stage: [2, 1, 1, 1], typeMin: 1 };
    if (p.reputation.value < 40) return { counts: S.random.pick(p, [[3, 3, 1], [2, 4, 1]]), stage: [2, 2, 2, 1], typeMin: 2 };
    return { counts: S.random.pick(p, [[2, 5, 2], [1, 5, 3], [2, 4, 3]]), stage: [2, 3, 2, 2], typeMin: 2 };
  }
  function paths(from, to, type) {
    if (type === 'wanted') return route.flatMap((c, j) => c === to ? [{ pickupIndex: null, deliveryIndex: j, segmentCount: 0 }] : []);
    const rows = []; for (let i = 0; i < 4; i++) for (let j = i + 1; j <= 4; j++) if (route[i] === from && route[j] === to && j - i <= 2) rows.push({ pickupIndex: i, deliveryIndex: j, segmentCount: j - i }); return rows;
  }
  function templateFields(template) {
    const type = { 捎货: 'delivery', 采买: 'procurement', 求货: 'wanted' }[template.typeLabel], scale = { 常契: 'basic', 良契: 'good', 重托: 'entrusted' }[template.scaleLabel];
    const [goodId, countText] = template.goodsText.split('×'), range = countText.split(/[–～—-]/).map(Number), parts = template.routeText.split('→');
    const from = type === 'wanted' ? null : cities[parts[0]], to = type === 'wanted' ? cities[template.routeText.slice(1)] : cities[parts[1]];
    return { type, scale, goodId, min: range[0], max: range[1] || range[0], from, to, sourceCity: cities[template.sourceCityLabel] };
  }
  // RC3 BUG-13: only the attributes an instance really carries are ever shown.
  function attributeLabels(c) {
    const labels = [];
    if (c.urgent) labels.push('加急');
    if (c.fragile) labels.push('易损');
    if (c.valuable) labels.push('贵重');
    if (c.rare) labels.push('稀有');
    if (c.longHaul) labels.push('远途');
    if (c.handoffPhase !== null && c.handoffPhase !== undefined) labels.push(['晨交', '午交'][c.handoffPhase]);
    return labels.length ? labels : ['普通'];
  }
  function instantiate(p, template, ctx) {
    const f = templateFields(template), item = S.inventory.good(f.goodId), quantity = rollInt(p, f.min, f.max), slots = quantity * item.slotCost;
    if (f.type !== 'delivery' && !S.inventory.unlocked(p, f.goodId)) return null;
    const possible = paths(f.from, f.to, f.type).filter(r => f.scale !== 'basic' || r.segmentCount <= 1);
    if (!possible.length || f.scale === 'basic' && slots > 2 || f.scale === 'good' && (slots < 2 || slots > 3) || slots > 4) return null;
    const path = S.random.pick(p, possible), text = template.attributesText;
    const urgent = text.includes('加急') && (!text.includes('二选一') || S.random.next(p) < .5);
    const handoffPhase = text.includes('晨交或昼交') ? rollInt(p, 0, 1) : text.includes('晨交') ? 0 : text.includes('昼交') ? 1 : null;
    E(!(urgent && handoffPhase !== null), 'IMPOSSIBLE_COMMISSION');
    const attributes = { urgent, handoffPhase, valuable: text.includes('贵重'), fragile: item.fragile, rare: text.includes('稀有'), longHaul: path.segmentCount === 2 };
    const cfg = scales[f.scale]; let rewardCash, referencePrice = null, rate = null;
    if (f.type === 'delivery') {
      const bonus = Math.min(.60, (urgent ? .25 : 0) + (handoffPhase !== null ? .10 : 0) + (attributes.valuable ? .20 : 0) + (attributes.fragile ? .15 : 0) + (attributes.rare ? .15 : 0));
      rewardCash = Math.ceil((6 + 4 * slots + 6 * (path.segmentCount - 1)) * (1 + bonus));
    } else {
      E(typeof ctx?.marketPrice === 'function', 'MISSING_PRICE_AUTHORITY', '正式市场价格规则尚未补齐。');
      referencePrice = ctx.marketPrice(p, f.type === 'procurement' ? f.from : f.to, f.goodId, S.time.day(p)); E(S.util.integer(referencePrice, 1), 'INVALID_REFERENCE_PRICE');
      const extra = urgent || handoffPhase !== null || attributes.valuable || attributes.fragile || attributes.rare ? rollInt(p, 0, 5) : 0;
      if (f.type === 'procurement') { rate = Math.min(35, rollInt(p, ...cfg.margin) + extra) / 100; const referenceCost = referencePrice * quantity; rewardCash = Math.ceil(referenceCost + Math.max(referenceCost * rate, cfg.minimum)); }
      else { rate = Math.min(30, rollInt(p, ...cfg.premium) + extra) / 100; rewardCash = Math.ceil(referencePrice * (1 + rate)) * quantity; }
    }
    return { templateId: template.templateId, title: template.typeLabel + ' · ' + f.goodId, text: template.text, originalAttributesText: template.attributesText, type: f.type, scale: f.scale, goodId: f.goodId, quantity, requiredSlots: slots, sourceCity: f.sourceCity, pickupCity: f.type === 'delivery' ? f.from : null, procurementCity: f.type === 'procurement' ? f.from : null, deliveryCity: f.to, ...path, ...attributes, replaceable: true, rewardCash, referencePrice, rewardRate: rate, reputationReward: rollInt(p, ...cfg.rep), status: 'available', urgentArrivalTick: null, urgentWindow: null };
  }
  // trip may be a real trip or a departure-draft stand-in ({ id, routeIndex: 0, deadlineTick }).
  function remainingFeasible(p, c, trip = p.trip) {
    if (!trip || c.tripId !== trip.id || p.world.tick > c.deadlineTick) return false;
    const index = trip.routeIndex;
    if (c.deliveryIndex < index) return false;
    if (p.world.route && c.type === 'delivery' && !['in_transit', 'ready_to_turn_in'].includes(c.status) && c.pickupIndex <= index) return false;
    if (c.type === 'delivery' && !['in_transit', 'ready_to_turn_in'].includes(c.status) && c.pickupIndex < index) return false;
    if (c.type === 'procurement' && !cargoPlan(p, c).complete) {
      // Existing intact owned lots may satisfy an order even after its source city
      // has been passed. Otherwise the remaining route must still reach that city
      // before delivery; an already-departed origin is no longer a buying stop.
      const firstBuyingStop = index + (p.world.route ? 1 : 0);
      if (!route.slice(firstBuyingStop, c.deliveryIndex + 1).includes(c.procurementCity)) return false;
    }
    const travel = ticks.slice(index, c.deliveryIndex).reduce((n, t) => n + t, 0);
    const remaining = p.world.route ? travel - ticks[index] + p.world.route.remainingTicks : travel;
    return p.world.tick + remaining <= c.deadlineTick;
  }
  // Builds the candidate rows for one trip (real trip or departure draft). Template cooling uses the last two trips.
  function buildPool(p, ctx, target, options = {}) {
    const s = p.commissions;
    if (p.reputation.value < 5) return [];
    const cfg = config(p, options.starter), n = cfg.stage.reduce((a, b) => a + b, 0), kinds = ['delivery', 'procurement', 'wanted'], scaleNames = ['basic', 'good', 'entrusted'];
    const sourceStageCities = ['changan', 'dunhuang', 'khotan', 'dunhuang'];
    const candidates = data().templates.map(t => instantiate(p, t, ctx)).filter(Boolean);
    const shuffled = []; while (candidates.length) { const i = rollInt(p, 0, candidates.length - 1); shuffled.push(candidates.splice(i, 1)[0]); }
    const stages = cfg.stage.flatMap((count, stage) => Array(count).fill(stage)); let selected = null, attempts = 0; const cooling = new Set((s.templateHistory || []).slice(-2).flatMap(h => h.templateIds));
    function solve(at, rows, remaining, counts, usedGoods, diverse, cooldown) {
      if (++attempts > 100000) return false;
      if (at === n) { if (kinds.every(k => counts[k] >= cfg.typeMin) && (!diverse || new Set(rows.map(c => c.goodId)).size >= Math.min(n, 3))) { selected = rows; return true; } return false; }
      for (const candidate of shuffled) {
        const si = scaleNames.indexOf(candidate.scale);
        if (cooldown && cooling.has(candidate.templateId) || !remaining[si] || candidate.sourceCity !== sourceStageCities[stages[at]] || rows.some(c => c.templateId === candidate.templateId) || diverse && (usedGoods[candidate.goodId] || 0) >= 2) continue;
        const nextCounts = { ...counts, [candidate.type]: (counts[candidate.type] || 0) + 1 };
        if (kinds.reduce((sum, k) => sum + Math.max(0, cfg.typeMin - (nextCounts[k] || 0)), 0) > n - at - 1) continue;
        const remain = remaining.slice(); remain[si]--;
        if (solve(at + 1, [...rows, { ...candidate, sourceStage: stages[at], deliveryIndex: candidate.type === 'wanted' ? (stages[at] === 0 ? 4 : stages[at]) : candidate.deliveryIndex }], remain, nextCounts, { ...usedGoods, [candidate.goodId]: (usedGoods[candidate.goodId] || 0) + 1 }, diverse, cooldown)) return true;
      }
      return false;
    }
    solve(0, [], cfg.counts, { delivery: 0, procurement: 0, wanted: 0 }, {}, true, true);
    if (!selected) { attempts = 0; solve(0, [], cfg.counts, { delivery: 0, procurement: 0, wanted: 0 }, {}, true, false); }
    if (!selected) { attempts = 0; solve(0, [], cfg.counts, { delivery: 0, procurement: 0, wanted: 0 }, {}, false, false); }
    E(selected && selected.length === n, 'COMMISSION_POOL_UNSATISFIABLE', '现有模板无法满足本商期全部约束。');
    return selected.map(c => { const row = { ...c, commissionId: S.util.id(p, 'commission'), tripId: target.id, deadlineTick: target.deadlineTick, generatedTick: p.world.tick }; if (!remainingFeasible(p, row, target)) row.status = 'unavailable'; return row; });
  }
  function generatePool(p, ctx, options = {}) {
    E(p.trip, 'NO_TRIP'); const s = p.commissions;
    if (s.poolTripId === p.trip.id) return clone(s.pool);
    if (p.reputation.value < 5) return [];
    s.pool = buildPool(p, ctx, p.trip, options);
    s.poolTripId = p.trip.id; s.generatedReputation = p.reputation.value; s.templateHistory ||= []; s.templateHistory.push({ tripId: p.trip.id, templateIds: s.pool.map(c => c.templateId) });
    if (options.starter) s.starterGenerated = true;
    return clone(s.pool);
  }
  function generateStarterIfNeeded(p, ctx) { if (p.trip && p.trip.initialReputation < 5 && p.reputation.value >= 5 && !p.commissions.starterGenerated && p.commissions.poolTripId !== p.trip.id) return generatePool(p, ctx, { starter: true }); return null; }
  // ---- RC3 BUG-08: departure draft. Candidates are generated once and kept until the trip really starts.
  function draftPool(p, ctx, draft) { return buildPool(p, ctx, { id: draft.id, routeIndex: 0, deadlineTick: draft.createdTick + 66 }); }
  function draftView(p) {
    const draft = p.departureDraft; if (!draft) return null;
    const stand = { id: draft.id, routeIndex: 0, deadlineTick: p.world.tick + 66 };
    let free = S.inventory.available(p);
    const rows = draft.pool.map(c => {
      const selected = draft.selectedIds.includes(c.commissionId), feasible = c.status !== 'unavailable' && remainingFeasible(p, { ...c, deadlineTick: stand.deadlineTick }, stand);
      let willPickup = null;
      if (selected && c.type === 'delivery') { willPickup = free >= c.requiredSlots; if (willPickup) free -= c.requiredSlots; }
      return { ...clone(c), attributeLabels: attributeLabels(c), selected, selectable: feasible && c.sourceStage === 0, acceptAt: c.sourceStage === 0 ? null : stageLabels[c.sourceStage], willPickup };
    });
    const selectedRows = rows.filter(r => r.selected);
    return { id: draft.id, createdTick: draft.createdTick, rows, selectedIds: [...draft.selectedIds], capacity: capacity(p), selectedCount: selectedRows.length, blockedPickups: selectedRows.filter(r => r.willPickup === false).map(r => r.commissionId) };
  }
  function draftToggle(p, x) {
    const draft = p.departureDraft; E(draft && !p.trip, 'NO_DEPARTURE_DRAFT', '当前没有出发草稿。');
    const c = draft.pool.find(r => r.commissionId === x.commissionId); E(c, 'COMMISSION_UNKNOWN', '委托不存在。');
    const selected = x.selected !== false;
    if (selected) {
      E(c.sourceStage === 0, 'COMMISSION_WRONG_STOP', '到达' + stageLabels[c.sourceStage] + '后可承接。');
      E(c.status !== 'unavailable' && remainingFeasible(p, { ...c, deadlineTick: p.world.tick + 66 }, { id: draft.id, routeIndex: 0, deadlineTick: p.world.tick + 66 }), 'COMMISSION_UNAVAILABLE', '本期已无法承接。');
      if (!draft.selectedIds.includes(c.commissionId)) { E(draft.selectedIds.length < capacity(p), 'COMMISSION_CAPACITY', '同时进行的委托已满。'); draft.selectedIds.push(c.commissionId); }
    } else draft.selectedIds = draft.selectedIds.filter(id => id !== c.commissionId);
    return { kind: 'draftSelectionChanged', modal: false, commissionId: c.commissionId, selected, selectedIds: [...draft.selectedIds] };
  }
  // Called inside the atomic trip start: the draft becomes the trip pool and selected rows are accepted for real.
  function activateDraft(p, ctx, trip) {
    const s = p.commissions, draft = p.departureDraft;
    E(trip && s.poolTripId !== trip.id, 'DRAFT_ALREADY_ACTIVATED');
    const rows = draft ? draft.pool : buildPool(p, ctx, trip);
    s.pool = rows.map(c => { const row = { ...c, tripId: trip.id, deadlineTick: trip.deadlineTick, generatedTick: p.world.tick, status: 'available' }; if (!remainingFeasible(p, row, trip)) row.status = 'unavailable'; return row; });
    s.poolTripId = trip.id; s.generatedReputation = p.reputation.value; s.templateHistory ||= []; s.templateHistory.push({ tripId: trip.id, templateIds: s.pool.map(c => c.templateId) });
    const accepted = [];
    for (const id of draft ? draft.selectedIds : []) accepted.push(accept(p, { commissionId: id }));
    const blocked = p.commissions.active.filter(c => c.tripId === trip.id && c.status === 'pending_pickup');
    E(!blocked.length, 'DRAFT_PICKUP_SLOTS', '货位不足以领取已选委托的货物，请先腾出货位或取消选定。');
    p.departureDraft = null;
    return accepted;
  }
  function get(p, id) { const c = p.commissions.active.find(c => c.commissionId === id) || p.commissions.pool.find(c => c.commissionId === id) || (p.commissions.history || []).find(c => c.commissionId === id); E(c, 'COMMISSION_UNKNOWN', '委托不存在。'); return c; }
  function setStatus(p, c, status) { c.status = status; const row = p.commissions.pool.find(r => r.commissionId === c.commissionId); if (row) row.status = status; }
  function pickup(p, x) {
    const c = get(p, x.commissionId); E(c.status === 'pending_pickup', 'PICKUP_UNAVAILABLE', '此委托无需领取货物。'); E(!p.world.route && p.world.city === c.pickupCity, 'WRONG_CITY', '请前往取货城市。');
    E(remainingFeasible(p, c), 'COMMISSION_UNAVAILABLE', '本期已无法承接或完成。'); E(S.inventory.available(p) >= c.requiredSlots, 'CARGO_FULL', '请先腾出所需货位。');
    const cargo = S.inventory.add(p, { goodId: c.goodId, quantity: c.quantity, acquisitionPrice: 0, ownership: 'commissionOwned', commissionId: c.commissionId, condition: 'intact', nonMarketable: true, slotCost: S.inventory.good(c.goodId).slotCost, fragile: c.fragile });
    setStatus(p, c, 'in_transit'); c.pickupTick = p.world.tick; return { kind: 'commissionPickup', commissionId: c.commissionId, lot: clone(cargo), elapsed: 0 };
  }
  // RC3 BUG-02: every urgent decision uses the same stop test — correct city AND correct route index.
  function stopMatches(p, c) { return Boolean(p.trip) && !p.world.route && p.world.city === c.deliveryCity && p.trip.routeIndex === c.deliveryIndex; }
  function openUrgentWindow(p, c) {
    if (!c.urgent || c.urgentWindow) return;
    const tick = p.world.tick, phase = tick % 3, day = Math.floor(tick / 3);
    // 晨 → same day 晨/午/暮; 午 → same day 午/暮; 暮 → this 暮 or the following 晨 only (single carry-over).
    c.urgentWindow = { arrivalTick: tick, arrivalPhase: phase, city: p.world.city, routeIndex: p.trip.routeIndex, deadlineTick: phase === 2 ? (day + 1) * 3 : day * 3 + 2, duskCarryUsed: phase === 2 };
    c.urgentArrivalTick = tick;
  }
  function urgentOpen(p, c) { const w = c.urgentWindow; return Boolean(w && p.trip && w.routeIndex === p.trip.routeIndex && w.city === p.world.city && p.world.tick >= w.arrivalTick && p.world.tick <= w.deadlineTick); }
  function accept(p, x) {
    if (!p.trip && p.departureDraft) return draftToggle(p, { commissionId: x.commissionId, selected: x.selected });
    E(p.trip, 'NO_TRIP'); E(!p.world.route, 'CITY_REQUIRED', '请抵达城市后承接。'); const c = get(p, x.commissionId); E(c.status === 'available' && remainingFeasible(p, c), 'COMMISSION_UNAVAILABLE', '本期已无法承接。');
    // RC3 BUG-09: only at the posting city and posting stop.
    E(c.sourceCity === p.world.city && (!Number.isSafeInteger(c.sourceStage) || c.sourceStage === p.trip.routeIndex), 'COMMISSION_WRONG_STOP', '到达' + (Number.isSafeInteger(c.sourceStage) ? stageLabels[c.sourceStage] : ({ changan: '长安', dunhuang: '敦煌', khotan: '于阗' })[c.sourceCity]) + '后可承接。');
    E(p.commissions.active.filter(c => activeStatuses.has(c.status)).length < capacity(p), 'COMMISSION_CAPACITY', '同时进行的委托已满。');
    const accepted = clone(c); accepted.acceptedTick = p.world.tick; accepted.status = c.type === 'delivery' ? 'pending_pickup' : 'accepted'; accepted.urgentWindow = accepted.urgentWindow || null; p.commissions.active.push(accepted); c.status = accepted.status;
    if (accepted.urgent && stopMatches(p, accepted)) openUrgentWindow(p, accepted);
    if (accepted.type === 'delivery' && p.world.city === accepted.pickupCity && !p.world.route && S.inventory.available(p) >= accepted.requiredSlots) return pickup(p, { commissionId: accepted.commissionId });
    return { kind: 'commissionAccepted', commissionId: accepted.commissionId, status: accepted.status, missingSlots: Math.max(0, accepted.requiredSlots - S.inventory.available(p)), elapsed: 0 };
  }
  function cargoPlan(p, c) {
    const rows = p.inventory.lots.filter(l => l.goodId === c.goodId && l.quantity > 0 && l.condition !== 'destroyed');
    const bound = rows.filter(l => l.ownership === 'commissionOwned' && l.commissionId === c.commissionId);
    // RC3 BUG-06: a wanted order only accepts cargo with real transport provenance (bought elsewhere, or having left its purchase city).
    const owned = rows.filter(l => l.ownership === 'playerOwned' && !l.nonMarketable && l.condition === 'intact' && (c.type !== 'procurement' || l.acquisitionCity === c.procurementCity) && (c.type !== 'wanted' || S.inventory.transportQualified(l, c.deliveryCity)));
    const selected = c.type === 'delivery' ? [...bound, ...(c.replaceable ? owned : [])] : owned;
    let needed = c.quantity; const plan = [];
    for (const lot of selected) { const quantity = Math.min(needed, lot.quantity); if (!quantity) break; plan.push({ lotId: lot.id, quantity, condition: lot.condition, ownership: lot.ownership }); needed -= quantity; }
    return { rows: plan, complete: needed === 0, missing: needed, damaged: plan.some(l => l.condition === 'damaged') };
  }
  // options.ignoreTiming: RC3 BUG-01 grace freeze evaluates delivery without the handoff phase or the urgent window.
  function ownConditions(p, c, options = {}) {
    if (!(activeStatuses.has(c.status) && c.status !== 'pending_pickup' && stopMatches(p, c) && cargoPlan(p, c).complete)) return false;
    if (options.ignoreTiming) return true;
    if (c.handoffPhase !== null && c.handoffPhase !== undefined && S.time.phase(p) !== c.handoffPhase) return false;
    if (c.urgent && !urgentOpen(p, c)) return false;
    return true;
  }
  function eligibleDelivery(p, c, ctx, freeze = false) {
    if (!p.trip || c.tripId !== p.trip.id || !activeStatuses.has(c.status) || c.status === 'pending_pickup' || p.world.route || !stopMatches(p, c) || !cargoPlan(p, c).complete) return false;
    if (freeze) return p.world.tick <= c.deadlineTick && ownConditions(p, c, { ignoreTiming: true });
    if (p.trip.phase === 'returned_at_dusk_pending_rest') return false;
    if (Number.isSafeInteger(p.trip.graceArrivalTick) && p.world.tick > p.trip.graceArrivalTick) {
      // G03 return grace has priority over the ordinary urgent window and the handoff phase.
      if (!p.trip.graceIds?.includes(c.commissionId)) return false;
      const eligible=ctx?.graceEligibility||S.trip?.graceEligibility;
      E(typeof eligible === 'function', 'GRACE_NOT_CONNECTED', '返程宽限尚未接入。');
      return eligible(p, c);
    }
    return p.world.tick <= c.deadlineTick && ownConditions(p, c);
  }
  function freezeGrace(p) {
    E(p.trip && p.world.city === 'changan' && S.time.phase(p) === 2 && !p.world.route, 'GRACE_ARRIVAL_REQUIRED');
    if (p.trip.graceFrozenTick !== undefined) return [...p.trip.graceIds];
    const ids = p.commissions.active.filter(c => eligibleDelivery(p, c, null, true)).map(c => c.commissionId);
    p.trip.graceFrozenTick = p.world.tick; p.trip.graceArrivalTick = p.world.tick; p.trip.graceDeadlineTick = p.world.tick + 3; p.trip.graceIds = ids; return [...ids];
  }
  function deliver(p, x, ctx) {
    const c = get(p, x.commissionId); E(eligibleDelivery(p, c, ctx), 'CANNOT_DELIVER', '当前城市、站点、时辰、货物或期限尚不符合交付条件。');
    const goods = cargoPlan(p, c), ratio = goods.damaged ? c.valuable ? .5 : .7 : 1, actualCash = Math.ceil(c.rewardCash * ratio), previous = p.reputation.value;
    const deliveredLots = goods.rows.map(row => S.inventory.take(p, row.lotId, row.quantity)); p.cash += actualCash;
    S.reputation.change(p, c.reputationReward, { type: 'commission', commissionId: c.commissionId, tripId: c.tripId }); setStatus(p, c, 'completed');
    const result = { kind: 'commissionDelivered', status: 'completed', commissionId: c.commissionId, tripId: c.tripId, title: c.title, type: c.type, goodId: c.goodId, quantity: c.quantity, attributeLabels: attributeLabels(c), originalReward: c.rewardCash, rewardRatio: ratio, actualCash, actualReputation: p.reputation.value - previous, deliveredLots: clone(deliveredLots), tick: p.world.tick, text: '货物已经验收，钱款照约结清。', elapsed: 0 };
    p.commissions.results.push(clone(result)); p.journal.push({ type: 'commission', tripId: c.tripId, commissionId: c.commissionId, amount: actualCash, reputation: result.actualReputation, tick: p.world.tick }); return result;
  }
  function failure(p, c, reason) {
    const previous = p.commissions.results.find(r => r.commissionId === c.commissionId && r.status === 'failed'); if (previous) return clone(previous);
    E(activeStatuses.has(c.status), 'COMMISSION_NOT_ACTIVE'); const cargo = p.inventory.lots.filter(l => l.ownership === 'commissionOwned' && l.commissionId === c.commissionId);
    const result = { kind: 'commissionFailed', status: 'failed', commissionId: c.commissionId, tripId: c.tripId, title: c.title, type: c.type, attributeLabels: attributeLabels(c), reason, originalReward: c.rewardCash, actualCash: 0, actualReputation: 0, removedCargo: clone(cargo), pendingRemoval: cargo.length > 0, tick: p.world.tick, text: '这份委托未能照约完成，尚未领取的报酬已取消。' };
    setStatus(p, c, 'failed'); c.failureReason = reason; p.commissions.results.push(clone(result)); return result;
  }
  function cleanup(p, ids) {
    const eligible = new Set(ids.filter(id => p.commissions.results.some(r => r.commissionId === id && r.status === 'failed')));
    p.inventory.lots = p.inventory.lots.filter(l => !(l.ownership === 'commissionOwned' && eligible.has(l.commissionId)));
    for (const r of p.commissions.results) if (eligible.has(r.commissionId)) r.pendingRemoval = false;
    return { removedForIds: [...eligible] };
  }
  function expire(p, options = {}) {
    const ids = options.ids || p.commissions.active.filter(c => activeStatuses.has(c.status) && p.world.tick > c.deadlineTick && !p.trip?.graceIds?.includes(c.commissionId)).map(c => c.commissionId), results = [];
    for (const id of ids) { const c = get(p, id); if (activeStatuses.has(c.status)) results.push(failure(p, c, options.reason || 'trip_expired')); }
    if (results.length && options.notify !== false) p.presentation.notices.push({ id: S.util.id(p, 'commission-failed'), kind: 'commissionFailure', title: '委托已失效', text: results.map(r => r.title).join('、'), commissionIds: results.map(r => r.commissionId), results: clone(results) });
    return results;
  }
  function finalizeFailures(p, ids, options = {}) { const results = ids.map(id => failure(p, get(p, id), options.reason || 'trip_ended')); cleanup(p, ids); return results.map(r => ({ ...r, pendingRemoval: false })); }
  function abandon(p, x) { const c = get(p, x.commissionId); const result = failure(p, c, 'abandoned'); return { ...result, cleanupAfterAcknowledgement: true }; }
  function arrived(p) {
    // RC3 BUG-02: the urgent window opens only at the commission's own delivery stop (city + route index).
    for (const c of p.commissions.active) if (activeStatuses.has(c.status) && c.urgent && !c.urgentWindow && stopMatches(p, c)) openUrgentWindow(p, c);
    refreshAvailability(p);
  }
  function refreshAvailability(p) { for (const c of p.commissions.pool) if (c.status === 'available' && !remainingFeasible(p, c)) c.status = 'unavailable'; }
  function afterTick(p, ctx) {
    if (!p.trip) return;
    const overdue = [], urgent = [];
    for (const c of p.commissions.active) {
      if (!activeStatuses.has(c.status)) continue;
      if (p.trip.graceIds?.includes(c.commissionId)) continue;
      if (p.world.tick > c.deadlineTick) overdue.push(c.commissionId);
      else if (c.urgent && c.urgentWindow && p.world.tick > c.urgentWindow.deadlineTick) urgent.push(c.commissionId);
    }
    expire(p, { ids: overdue, reason: 'trip_expired' }); expire(p, { ids: urgent, reason: 'urgent_window_missed' }); refreshAvailability(p);
  }
  function departureWarnings(p) { if (!p.trip) return []; return p.commissions.active.filter(c => c.status === 'pending_pickup' && c.pickupCity === p.world.city && !route.slice(p.trip.routeIndex + 1).includes(c.pickupCity)).map(c => c.commissionId); }
  function waitTarget(p, id) { const c = get(p, id); E(activeStatuses.has(c.status) && c.deliveryCity === p.world.city && c.handoffPhase !== null && !c.urgent, 'NO_FIXED_HANDOFF'); let target = Math.floor(p.world.tick / 3) * 3 + c.handoffPhase; if (target < p.world.tick) target += 3; E(target <= c.deadlineTick, 'COMMISSION_EXPIRED'); return target; }
  function acknowledgeNotices(p, notices) { return cleanup(p, notices.filter(n => n.kind === 'commissionFailure').flatMap(n => n.commissionIds || [])); }
  function ackResult(p, result) { if (result.kind === 'commissionFailed' && result.cleanupAfterAcknowledgement) cleanup(p, [result.commissionId]); }
  // RC3 BUG-14: terminal records leave `active` at trip end (results/summary keep their own copies). Idempotent.
  function archiveTrip(p, tripId) {
    const s = p.commissions; s.history ||= [];
    const terminal = s.active.filter(c => terminalStatuses.has(c.status));
    for (const c of terminal) if (!s.history.some(h => h.commissionId === c.commissionId)) s.history.push({ ...clone(c), archivedTripId: tripId || c.tripId || null, archivedTick: p.world.tick });
    s.active = s.active.filter(c => !terminalStatuses.has(c.status));
    if (tripId === undefined || s.poolTripId === tripId) { s.pool = []; }
    return { archived: terminal.length, remaining: s.active.length };
  }
  function migrate(p) {
    const s = p.commissions; s.history ||= [];
    for (const c of [...s.active, ...s.pool]) {
      if (c.urgentWindow === undefined) c.urgentWindow = null;
      if (c.urgent && !c.urgentWindow && Number.isSafeInteger(c.urgentArrivalTick) && activeStatuses.has(c.status)) {
        const tick = c.urgentArrivalTick, phase = tick % 3, day = Math.floor(tick / 3);
        c.urgentWindow = { arrivalTick: tick, arrivalPhase: phase, city: c.deliveryCity, routeIndex: c.deliveryIndex, deadlineTick: phase === 2 ? (day + 1) * 3 : day * 3 + 2, duskCarryUsed: phase === 2, migrated: true };
      }
    }
    if (!p.trip) archiveTrip(p);
  }
  function snapshot(p, ctx) {
    const here = c => Boolean(p.trip) && !p.world.route && c.status === 'available' && c.sourceCity === p.world.city && (!Number.isSafeInteger(c.sourceStage) || c.sourceStage === p.trip.routeIndex);
    return {
      capacity: capacity(p), activeCount: p.commissions.active.filter(c => activeStatuses.has(c.status)).length,
      pool: p.commissions.pool.map(c => ({ ...clone(c), attributeLabels: attributeLabels(c), acceptableHere: here(c), acceptAt: Number.isSafeInteger(c.sourceStage) ? stageLabels[c.sourceStage] : null })),
      active: p.commissions.active.map(c => ({ ...clone(c), attributeLabels: attributeLabels(c), cargo: cargoPlan(p, c), urgentOpen: c.urgent ? urgentOpen(p, c) : null })),
      results: clone(p.commissions.results.slice(-20)), history: (p.commissions.history || []).length, draft: draftView(p), locked: p.reputation.value < 5
    };
  }
  S.commissions = { initial, capacity, generatePool, generateStarterIfNeeded, buildPool, draftPool, draftView, draftToggle, activateDraft, remainingFeasible, accept, pickup, cargoPlan, ownConditions, eligibleDelivery, freezeGrace, deliver, expire, finalizeFailures, cleanup, arrived, refreshAvailability, departureWarnings, waitTarget, acknowledgeNotices, ackResult, archiveTrip, migrate, snapshot, templateFields, attributeLabels, stageLabels, stopMatches, urgentOpen };
  for (const [type, fn] of Object.entries({ accept, pickup, deliver, abandon })) S.commands.register('commission.' + type, fn);
  S.time.register('commissions', { afterTick });
})(globalThis.Silk = globalThis.Silk || {});
