(function (S) {
  'use strict';
  // ---- COMMISSION_SYSTEM_MASTER_PATCH v3.0 (2026-09-13): the single commission domain. ----
  // Ordinary commissions no longer belong to a trip: one global candidate board (p.commissions.board) is the only source of
  // candidates, acceptance is possible anywhere at any time within the capacity, every accepted commission runs on its own
  // 30-world-day deadline (acceptedAtWorldTick + 90), and delivery eligibility is one typed domain result that the card text,
  // the button and the submit all read. Trips never generate, freeze, fail, reset or clear commissions.
  const E = S.util.ensure, clone = S.util.clone, data = () => globalThis.SilkData.commissions;
  const cities = { 长安: 'changan', 敦煌: 'dunhuang', 于阗: 'khotan' }, cityOrder = ['changan', 'dunhuang', 'khotan'], labels = { changan: '长安', dunhuang: '敦煌', khotan: '于阗' };
  const activeStatuses = new Set(['accepted', 'pending_pickup', 'in_transit', 'ready_to_turn_in']);
  const terminalStatuses = new Set(['completed', 'failed', 'cancelled', 'expired', 'abandoned']);
  const DEADLINE_TICKS = 90;   // 30 world days × 3 phases (晨 / 午 / 暮)
  const scales = { basic: { rep: [1, 2], margin: [15, 20], premium: [10, 15], minimum: 6 }, good: { rep: [2, 3], margin: [20, 25], premium: [15, 20], minimum: 10 }, entrusted: { rep: [3, 4], margin: [25, 30], premium: [20, 25], minimum: 15 } };
  const PRICE_CODES = new Set(['MISSING_PRICE_AUTHORITY', 'INVALID_REFERENCE_PRICE', 'PRICE_SNAPSHOT_UNAVAILABLE', 'NONCURRENT_PRICE_READ']);
  function initial() { return { board: [], active: [], results: [], history: [], boardTarget: 0, lastRefillDay: null, templateHistory: [], boardVersion: 3 }; }
  const rollInt = (p, lo, hi) => lo + Math.floor(S.random.next(p) * (hi - lo + 1));
  const cityLabel = id => labels[id] || id;
  // ---- reputation → capacity / board target (5–9: 1 / 3, 10–19: 2 / 5, 20–39: 3 / 7, 40+: 4 / 9) ----
  function capacity(p) { return p.reputation.value < 5 ? 0 : p.reputation.value < 10 ? 1 : p.reputation.value < 20 ? 2 : p.reputation.value < 40 ? 3 : 4; }
  function boardTarget(p) { return p.reputation.value < 5 ? 0 : p.reputation.value < 10 ? 3 : p.reputation.value < 20 ? 5 : p.reputation.value < 40 ? 7 : 9; }
  function activeRows(p) { return p.commissions.active.filter(c => activeStatuses.has(c.status)); }
  function activeCount(p) { return activeRows(p).length; }
  function hasAcceptable(p) { return (p.commissions.board || []).length > 0 && activeCount(p) < capacity(p); }
  // Board composition per reputation tier (unchanged scale / type mix; the sums are the 3 / 5 / 7 / 9 board targets). The former
  // posting-stop distribution becomes a source-city mix, since candidates are no longer tied to a route position.
  function config(p) {
    const v = p.reputation.value;
    if (v < 10) return { counts: [3, 0, 0], cityMix: [1, 1, 1], typeMin: 1 };
    if (v < 20) return { counts: [3, 2, 0], cityMix: [2, 2, 1], typeMin: 1 };
    if (v < 40) return { counts: S.random.pick(p, [[3, 3, 1], [2, 4, 1]]), cityMix: [2, 3, 2], typeMin: 2 };
    return { counts: S.random.pick(p, [[2, 5, 2], [1, 5, 3], [2, 4, 3]]), cityMix: [2, 5, 2], typeMin: 2 };
  }
  const legs = (from, to) => Math.abs(cityOrder.indexOf(from) - cityOrder.indexOf(to));
  function templateFields(template) {
    const type = { 捎货: 'delivery', 采买: 'procurement', 求货: 'wanted' }[template.typeLabel], scale = { 常契: 'basic', 良契: 'good', 重托: 'entrusted' }[template.scaleLabel];
    const [goodId, countText] = template.goodsText.split('×'), range = countText.split(/[–～—-]/).map(Number), parts = template.routeText.split('→');
    const from = type === 'wanted' ? null : cities[parts[0]], to = type === 'wanted' ? cities[template.routeText.slice(1)] : cities[parts[1]];
    return { type, scale, goodId, min: range[0], max: range[1] || range[0], from, to, sourceCity: cities[template.sourceCityLabel] };
  }
  // RC3 BUG-13: only the attributes an instance really carries are ever shown.
  function attributeLabels(c) {
    const rows = [];
    if (c.urgent) rows.push('加急');
    if (c.fragile) rows.push('易损');
    if (c.valuable) rows.push('贵重');
    if (c.rare) rows.push('稀有');
    if (c.longHaul) rows.push('远途');
    if (c.handoffPhase !== null && c.handoffPhase !== undefined) rows.push(['晨交', '午交'][c.handoffPhase]);
    return rows.length ? rows : ['普通'];
  }
  function instantiate(p, template, ctx) {
    const f = templateFields(template), item = S.inventory.good(f.goodId), quantity = rollInt(p, f.min, f.max), slots = quantity * item.slotCost;
    if (f.type !== 'delivery' && !S.inventory.unlocked(p, f.goodId)) return null;
    const segmentCount = f.type === 'wanted' ? 0 : legs(f.from, f.to);
    if (f.scale === 'basic' && (segmentCount > 1 || slots > 2) || f.scale === 'good' && (slots < 2 || slots > 3) || slots > 4) return null;
    const text = template.attributesText;
    const urgent = text.includes('加急') && (!text.includes('二选一') || S.random.next(p) < .5);
    const handoffPhase = text.includes('晨交或昼交') ? rollInt(p, 0, 1) : text.includes('晨交') ? 0 : text.includes('昼交') ? 1 : null;
    E(!(urgent && handoffPhase !== null), 'IMPOSSIBLE_COMMISSION');
    const attributes = { urgent, handoffPhase, valuable: text.includes('贵重'), fragile: item.fragile, rare: text.includes('稀有'), longHaul: segmentCount === 2 };
    const cfg = scales[f.scale]; let rewardCash, referencePrice = null, rate = null;
    if (f.type === 'delivery') {
      const bonus = Math.min(.60, (urgent ? .25 : 0) + (handoffPhase !== null ? .10 : 0) + (attributes.valuable ? .20 : 0) + (attributes.fragile ? .15 : 0) + (attributes.rare ? .15 : 0));
      rewardCash = Math.ceil((6 + 4 * slots + 6 * (segmentCount - 1)) * (1 + bonus));
    } else {
      E(typeof ctx?.marketPrice === 'function', 'MISSING_PRICE_AUTHORITY', '正式市场价格规则尚未补齐。');
      referencePrice = ctx.marketPrice(p, f.type === 'procurement' ? f.from : f.to, f.goodId, S.time.day(p)); E(S.util.integer(referencePrice, 1), 'INVALID_REFERENCE_PRICE');
      const extra = urgent || handoffPhase !== null || attributes.valuable || attributes.fragile || attributes.rare ? rollInt(p, 0, 5) : 0;
      if (f.type === 'procurement') { rate = Math.min(35, rollInt(p, ...cfg.margin) + extra) / 100; const referenceCost = referencePrice * quantity; rewardCash = Math.ceil(referenceCost + Math.max(referenceCost * rate, cfg.minimum)); }
      else { rate = Math.min(30, rollInt(p, ...cfg.premium) + extra) / 100; rewardCash = Math.ceil(referencePrice * (1 + rate)) * quantity; }
    }
    return { templateId: template.templateId, title: template.typeLabel + ' · ' + f.goodId, text: template.text, originalAttributesText: template.attributesText, type: f.type, scale: f.scale, goodId: f.goodId, quantity, requiredSlots: slots, sourceCity: f.sourceCity, pickupCity: f.type === 'delivery' ? f.from : null, procurementCity: f.type === 'procurement' ? f.from : null, deliveryCity: f.to, segmentCount, ...attributes, replaceable: true, rewardCash, referencePrice, rewardRate: rate, reputationReward: rollInt(p, ...cfg.rep), status: 'available', urgentArrivalTick: null, urgentWindow: null };
  }
  function tryInstantiate(p, template, ctx) { try { return instantiate(p, template, ctx); } catch (e) { if (e instanceof S.util.DomainError && PRICE_CODES.has(e.code)) return null; throw e; } }
  // ---- the board: fill only the difference, never re-roll what is already posted; best effort, never throws ----
  function fillBoard(p, ctx, needed) {
    const s = p.commissions; s.board ||= []; if (!(needed > 0)) return [];
    const cfg = config(p), kinds = ['delivery', 'procurement', 'wanted'], scaleNames = ['basic', 'good', 'entrusted'];
    const priceCtx = typeof ctx?.marketPrice === 'function' ? ctx : S.core.context('commission-board');
    const candidates = []; for (const t of data().templates) { const c = tryInstantiate(p, t, priceCtx); if (c) candidates.push(c); }
    const shuffled = []; while (candidates.length) { const i = rollInt(p, 0, candidates.length - 1); shuffled.push(candidates.splice(i, 1)[0]); }
    const onBoard = new Set(s.board.map(c => c.templateId)), cooling = new Set((s.templateHistory || []).slice(-2).flatMap(h => h.templateIds));
    const count = (rows, key, value) => rows.filter(c => c[key] === value).length, sum = a => a.reduce((n, x) => n + x, 0);
    const scaleRemain = scaleNames.map((name, i) => Math.max(0, cfg.counts[i] - count(s.board, 'scale', name)));
    const cityRemain = cityOrder.map((name, i) => Math.max(0, cfg.cityMix[i] - count(s.board, 'sourceCity', name)));
    const typeRemain = kinds.map(name => Math.max(0, cfg.typeMin - count(s.board, 'type', name)));
    let selected = null, attempts = 0;
    // level 0 all constraints → 1 no template cooling → 2 no goods diversity → 3 no source-city mix → 4 no scale / type quotas
    function solve(level, at, rows, sr, cr, tr, goods) {
      if (++attempts > 20000) return false;
      if (at === needed) { if (level < 2 && new Set([...s.board, ...rows].map(c => c.goodId)).size < Math.min(s.board.length + needed, 3)) return false; selected = rows; return true; }
      const left = needed - at;
      for (const c of shuffled) {
        if (onBoard.has(c.templateId) || rows.some(r => r.templateId === c.templateId)) continue;
        if (level < 1 && cooling.has(c.templateId)) continue;
        const si = scaleNames.indexOf(c.scale), ci = cityOrder.indexOf(c.sourceCity), ki = kinds.indexOf(c.type);
        if (level < 4 && !(sr[si] > 0 || sum(sr) < left)) continue;
        if (level < 3 && !(cr[ci] > 0 || sum(cr) < left)) continue;
        if (level < 4 && sum(tr) - (tr[ki] > 0 ? 1 : 0) > left - 1) continue;
        if (level < 2 && (goods[c.goodId] || 0) + count(s.board, 'goodId', c.goodId) >= 2) continue;
        const sr2 = sr.slice(), cr2 = cr.slice(), tr2 = tr.slice(); if (sr2[si] > 0) sr2[si]--; if (cr2[ci] > 0) cr2[ci]--; if (tr2[ki] > 0) tr2[ki]--;
        if (solve(level, at + 1, [...rows, c], sr2, cr2, tr2, { ...goods, [c.goodId]: (goods[c.goodId] || 0) + 1 })) return true;
      }
      return false;
    }
    for (let level = 0; level <= 4 && !selected; level++) { attempts = 0; solve(level, 0, [], scaleRemain, cityRemain, typeRemain, {}); }
    if (!selected) selected = shuffled.filter(c => !onBoard.has(c.templateId)).slice(0, needed);
    const rows = selected.map(c => ({ ...c, commissionId: S.util.id(p, 'commission'), postedTick: p.world.tick, status: 'available' }));
    s.board.push(...rows);
    if (rows.length) { s.templateHistory ||= []; s.templateHistory.push({ tick: p.world.tick, templateIds: rows.map(c => c.templateId) }); if (s.templateHistory.length > 6) s.templateHistory.splice(0, s.templateHistory.length - 6); }
    return rows;
  }
  // Runs after every command and at every world-day start. A rising board target (first unlock 4→5, 4→21, or any tier up) is
  // topped up immediately; a board reduced by acceptances is topped up once at the next world-day boundary only. Nothing here
  // ever removes or re-rolls a posted candidate; UI reads, reloads, page or city changes never reach this code.
  function syncBoard(p, ctx, trigger = 'command') {
    const s = p.commissions; s.board ||= [];
    const target = boardTarget(p), day = S.time.day(p), previous = s.boardTarget || 0, added = [];
    if (target > previous) { added.push(...fillBoard(p, ctx, target - s.board.length)); s.boardTarget = target; s.lastRefillDay = day; }
    else if (trigger === 'day' && s.board.length < target && s.lastRefillDay !== day) { added.push(...fillBoard(p, ctx, target - s.board.length)); s.lastRefillDay = day; }
    if (target < previous) s.boardTarget = target;
    return added;
  }
  // ---- arrivals: a global monotonic sequence and the goods really brought in by the current arrival ----
  function arrivalSequence(p) { return S.util.integer(p.world.arrivalSequence) ? p.world.arrivalSequence : 0; }
  function eligibleLot(l) { return l.ownership === 'playerOwned' && !l.nonMarketable && l.condition === 'intact' && l.quantity > 0; }
  function eligibleCounts(p) { const counts = {}; for (const l of p.inventory.lots) if (eligibleLot(l)) counts[l.goodId] = (counts[l.goodId] || 0) + l.quantity; return counts; }
  function recordArrival(p) {
    p.world.arrivalSequence = arrivalSequence(p) + 1;
    p.world.currentArrival = { arrivalSequence: p.world.arrivalSequence, city: p.world.city, arrivedAtWorldTick: p.world.tick, eligibleCargoCounts: eligibleCounts(p) };
    return p.world.currentArrival;
  }
  // Called by S.inventory.take (and the 商号 stocking move) before an intact, marketable, player-owned unit leaves the caravan:
  // sale, delivery to any commission, damage, loss, story consumption, cabinet stocking. Local purchases never add anything back.
  function cargoRemoved(p, lot, quantity) {
    const a = p.world.currentArrival; if (!a || !eligibleLot({ ...lot, quantity: 1 }) || !a.eligibleCargoCounts) return;
    a.eligibleCargoCounts[lot.goodId] = Math.max(0, (a.eligibleCargoCounts[lot.goodId] || 0) - quantity);
  }
  function getActive(p, id) { const c = p.commissions.active.find(c => c.commissionId === id); E(c, 'COMMISSION_UNKNOWN', '委托不存在。'); return c; }
  function get(p, id) { const c = p.commissions.active.find(c => c.commissionId === id) || p.commissions.board.find(c => c.commissionId === id) || (p.commissions.history || []).find(c => c.commissionId === id); E(c, 'COMMISSION_UNKNOWN', '委托不存在。'); return c; }
  // ---- accept / pickup ----
  function accept(p, x) {
    const s = p.commissions, c = s.board.find(r => r.commissionId === x.commissionId); E(c, 'COMMISSION_UNKNOWN', '委托不存在。');
    E(activeCount(p) < capacity(p), 'COMMISSION_CAPACITY', capacity(p) ? '同时进行的委托已满。' : '商誉达到5后开放普通委托。');
    const accepted = { ...clone(c), status: c.type === 'delivery' ? 'pending_pickup' : 'accepted', acceptedAtWorldTick: p.world.tick, deadlineWorldTick: p.world.tick + DEADLINE_TICKS, acceptedAtArrivalSequence: arrivalSequence(p), acceptedCity: p.world.city, acceptedOnRoute: Boolean(p.world.route), acceptedTripId: p.trip?.id || null, urgentWindow: null };
    s.board = s.board.filter(r => r.commissionId !== c.commissionId); s.active.push(accepted);
    if (accepted.type === 'delivery' && !p.world.route && p.world.city === accepted.pickupCity && S.inventory.available(p) >= accepted.requiredSlots) return pickup(p, { commissionId: accepted.commissionId });
    return { kind: 'commissionAccepted', commissionId: accepted.commissionId, status: accepted.status, deadlineWorldTick: accepted.deadlineWorldTick, missingSlots: Math.max(0, accepted.requiredSlots - S.inventory.available(p)), elapsed: 0 };
  }
  function pickup(p, x) {
    const c = getActive(p, x.commissionId); E(c.status === 'pending_pickup', 'PICKUP_UNAVAILABLE', '此委托无需领取货物。'); E(!p.world.route && p.world.city === c.pickupCity, 'WRONG_CITY', '请前往取货城市。');
    E(p.world.tick <= c.deadlineWorldTick, 'COMMISSION_EXPIRED', '此委托已过期。'); E(S.inventory.available(p) >= c.requiredSlots, 'CARGO_FULL', '请先腾出所需货位。');
    const cargo = S.inventory.add(p, { goodId: c.goodId, quantity: c.quantity, acquisitionPrice: 0, ownership: 'commissionOwned', commissionId: c.commissionId, condition: 'intact', nonMarketable: true, slotCost: S.inventory.good(c.goodId).slotCost, fragile: c.fragile });
    c.status = 'in_transit'; c.pickupTick = p.world.tick; c.pickupArrivalSequence = arrivalSequence(p);
    return { kind: 'commissionPickup', commissionId: c.commissionId, lot: clone(cargo), elapsed: 0 };
  }
  // ---- urgent window: opens at the first arrival in the delivery city after acceptance (捎货: after pickup) ----
  function openUrgentWindow(p, c) {
    if (!c.urgent || c.urgentWindow) return;
    const tick = p.world.tick, phase = tick % 3, day = Math.floor(tick / 3);
    // 晨 → same day 晨/午/暮; 午 → same day 午/暮; 暮 → this 暮 or the following 晨 only (single carry-over).
    c.urgentWindow = { arrivalTick: tick, arrivalPhase: phase, city: p.world.city, arrivalSequence: arrivalSequence(p), deadlineTick: phase === 2 ? (day + 1) * 3 : day * 3 + 2, duskCarryUsed: phase === 2 };
    c.urgentArrivalTick = tick;
  }
  function urgentOpen(p, c) { const w = c.urgentWindow; return Boolean(w && !p.world.route && w.city === p.world.city && w.arrivalSequence === arrivalSequence(p) && p.world.tick >= w.arrivalTick && p.world.tick <= w.deadlineTick); }
  function arrived(p) {
    recordArrival(p);
    for (const c of activeRows(p)) if (c.status !== 'pending_pickup' && c.urgent && !c.urgentWindow && p.world.city === c.deliveryCity && arrivalSequence(p) > c.acceptedAtArrivalSequence) openUrgentWindow(p, c);
  }
  // ---- typed delivery eligibility (MASTER v3.0 §13–§15) ----
  // getCommissionDeliveryEligibility dispatches by type: 捎货 → getCourierCommissionEligibility (the commissionOwned cargo of that commission;
  // own intact goods may still fill in for lost commission cargo, as before — never the arrival rule); 采买 / 求货 →
  // getPlayerOwnedCommissionEligibility (a post-acceptance arrival in the delivery city and that arrival's eligibleCargoCounts budget; 采买
  // keeps the purchase city its data configures). 货物准备 x / y, the 交付委托 button and commission.deliver read only this result.
  const REASONS = {
    NOT_ACTIVE: () => '此委托已结束。', EXPIRED: () => '此委托已过期。', PICKUP_REQUIRED: c => '请先到' + cityLabel(c.pickupCity) + '领取委托货物。',
    ON_ROUTE: c => '请抵达' + cityLabel(c.deliveryCity) + '后交付。', WRONG_CITY: c => '请前往' + cityLabel(c.deliveryCity) + '交付。',
    NO_ARRIVAL: c => '请把货物带到' + cityLabel(c.deliveryCity) + '。', NO_POST_ACCEPTANCE_ARRIVAL: c => '须在接取后重新入城，把货物实际带进' + cityLabel(c.deliveryCity) + '。',
    HANDOFF_PHASE: c => '约定' + ['晨', '午'][c.handoffPhase] + '时交付，请候至该时辰。', URGENT_WINDOW: c => c.urgentWindow ? '加急交付窗口已关闭。' : '加急委托须在抵达交付城市后的交付窗口内交付。'
  };
  function verdict(c, cargo, code) {
    const ok = code === 'OK', reason = ok ? '' : REASONS[code] ? REASONS[code](c) : cargo.reason || '';
    return { ok, canDeliver: ok, code, failureReason: ok ? null : code, reason, have: cargo.have, eligibleQuantity: cargo.have, need: c.quantity, requiredQuantity: c.quantity, prepared: cargo.complete, damaged: cargo.damaged, plan: cargo.rows, cargoCode: cargo.code, deliveryCity: c.deliveryCity };
  }
  function commonGate(p, c) { if (!activeStatuses.has(c.status)) return 'NOT_ACTIVE'; if (p.world.tick > c.deadlineWorldTick) return 'EXPIRED'; if (c.status === 'pending_pickup') return 'PICKUP_REQUIRED'; if (p.world.route) return 'ON_ROUTE'; if (p.world.city !== c.deliveryCity) return 'WRONG_CITY'; return null; }
  // the commission's own stricter conditions (§10: 加急 / 晨交 / 午交 stay in force inside the 30-day limit)
  function specificGate(p, c) { if (c.handoffPhase !== null && c.handoffPhase !== undefined && S.time.phase(p) !== c.handoffPhase) return 'HANDOFF_PHASE'; if (c.urgent && !urgentOpen(p, c)) return 'URGENT_WINDOW'; return null; }
  function planner(c) { const plan = [], st = { needed: c.quantity, have: 0 }; return { plan, st, push(lot, max) { const q = Math.min(st.needed, lot.quantity, max === undefined ? lot.quantity : max); if (q <= 0) return 0; plan.push({ lotId: lot.id, quantity: q, condition: lot.condition, ownership: lot.ownership }); st.needed -= q; st.have += q; return q; } }; }
  function courierCargo(p, c) {
    const lots = p.inventory.lots.filter(l => l.goodId === c.goodId && l.quantity > 0 && l.condition !== 'destroyed'), pl = planner(c);
    for (const lot of lots.filter(l => l.ownership === 'commissionOwned' && l.commissionId === c.commissionId)) pl.push(lot);
    if (pl.st.needed > 0 && c.replaceable) for (const lot of lots.filter(eligibleLot)) pl.push(lot);
    const needed = pl.st.needed;
    return { rows: pl.plan, have: pl.st.have, need: c.quantity, complete: needed === 0, missing: needed, damaged: pl.plan.some(r => r.condition === 'damaged'), code: needed ? 'CARGO_MISSING' : 'OK', reason: needed ? '还缺' + needed + '件委托货物。' : '', arrivalHere: null, postAcceptance: null, budget: null };
  }
  function playerOwnedCargo(p, c) {
    const lots = p.inventory.lots.filter(l => l.goodId === c.goodId && l.quantity > 0 && l.condition !== 'destroyed'), pl = planner(c);
    const a = p.world.currentArrival, arrivalHere = Boolean(a) && !p.world.route && a.city === p.world.city, postAcceptance = arrivalHere && a.arrivalSequence > c.acceptedAtArrivalSequence;
    const budget = postAcceptance ? (a.eligibleCargoCounts?.[c.goodId] || 0) : 0;
    const owned = lots.filter(l => eligibleLot(l) && (c.type !== 'procurement' || !c.procurementCity || l.acquisitionCity === c.procurementCity));
    let remaining = budget; for (const lot of owned) { if (!remaining) break; remaining -= pl.push(lot, remaining); }
    const held = owned.reduce((n, l) => n + l.quantity, 0), needed = pl.st.needed;
    let code = 'OK', reason = '';
    if (needed) {
      if (!postAcceptance) { code = arrivalHere ? 'NO_POST_ACCEPTANCE_ARRIVAL' : 'NO_ARRIVAL'; reason = REASONS[code](c); }
      else if (held >= c.quantity) { code = 'LOCAL_GOODS'; reason = '本地现买或未随本次入城带入的货物不能用于交付，仍缺' + needed + '件带入货物。'; }
      else { code = 'CARGO_MISSING'; reason = '还缺' + needed + '件' + (c.type === 'procurement' && c.procurementCity ? '在' + cityLabel(c.procurementCity) + '购入的' : '') + '完好自有货物。'; }
    }
    return { rows: pl.plan, have: pl.st.have, need: c.quantity, complete: needed === 0, missing: needed, damaged: false, code, reason, arrivalHere, postAcceptance, budget, held };
  }
  function cargoPlan(p, c) { return c.type === 'delivery' ? courierCargo(p, c) : playerOwnedCargo(p, c); }
  function getCourierCommissionEligibility(p, c) {
    const cargo = courierCargo(p, c), gate = commonGate(p, c); if (gate) return verdict(c, cargo, gate);
    if (!cargo.complete) return verdict(c, cargo, cargo.code);
    return verdict(c, cargo, specificGate(p, c) || 'OK');
  }
  function getPlayerOwnedCommissionEligibility(p, c) {
    const cargo = playerOwnedCargo(p, c), gate = commonGate(p, c); if (gate) return verdict(c, cargo, gate);
    if (!cargo.arrivalHere) return verdict(c, cargo, 'NO_ARRIVAL');
    if (!cargo.postAcceptance) return verdict(c, cargo, 'NO_POST_ACCEPTANCE_ARRIVAL');
    if (!cargo.complete) return verdict(c, cargo, cargo.code);
    return verdict(c, cargo, specificGate(p, c) || 'OK');
  }
  function getCommissionDeliveryEligibility(p, c) {
    switch (c.type) {
      case 'delivery': return getCourierCommissionEligibility(p, c);
      case 'procurement': case 'wanted': return getPlayerOwnedCommissionEligibility(p, c);
      default: E(false, 'INVALID_COMMISSION');
    }
  }
  const deliveryEligibility = getCommissionDeliveryEligibility;
  function deliver(p, x) {
    const c = getActive(p, x.commissionId), el = deliveryEligibility(p, c); E(el.ok, 'CANNOT_DELIVER', el.reason || '当前城市、时辰、货物或期限尚不符合交付条件。');
    const ratio = el.damaged ? c.valuable ? .5 : .7 : 1, actualCash = Math.ceil(c.rewardCash * ratio), previous = p.reputation.value, tripId = p.trip?.id || null;
    const deliveredLots = el.plan.map(row => S.inventory.take(p, row.lotId, row.quantity)); p.cash += actualCash;
    S.reputation.change(p, c.reputationReward, { type: 'commission', commissionId: c.commissionId, tripId }); c.status = 'completed'; c.completedTick = p.world.tick; c.completedTripId = tripId;
    const result = { kind: 'commissionDelivered', status: 'completed', commissionId: c.commissionId, tripId, title: c.title, type: c.type, goodId: c.goodId, quantity: c.quantity, attributeLabels: attributeLabels(c), originalReward: c.rewardCash, rewardRatio: ratio, actualCash, actualReputation: p.reputation.value - previous, deliveredLots: clone(deliveredLots), tick: p.world.tick, text: '货物已经验收，钱款照约结清。', elapsed: 0 };
    p.commissions.results.push(clone(result)); p.journal.push({ type: 'commission', tripId, commissionId: c.commissionId, amount: actualCash, reputation: result.actualReputation, tick: p.world.tick });
    archiveTerminal(p); return result;
  }
  function failure(p, c, reason) {
    const previous = p.commissions.results.find(r => r.commissionId === c.commissionId && r.status === 'failed'); if (previous) return clone(previous);
    E(activeStatuses.has(c.status), 'COMMISSION_NOT_ACTIVE'); const cargo = p.inventory.lots.filter(l => l.ownership === 'commissionOwned' && l.commissionId === c.commissionId), tripId = p.trip?.id || null;
    const result = { kind: 'commissionFailed', status: 'failed', commissionId: c.commissionId, tripId, title: c.title, type: c.type, attributeLabels: attributeLabels(c), reason, originalReward: c.rewardCash, actualCash: 0, actualReputation: 0, removedCargo: clone(cargo), pendingRemoval: cargo.length > 0, tick: p.world.tick, text: reason === 'expired' ? '这份委托已超过三十日期限，尚未领取的报酬已取消。' : '这份委托未能照约完成，尚未领取的报酬已取消。' };
    c.status = 'failed'; c.failureReason = reason; c.failedTick = p.world.tick; p.commissions.results.push(clone(result)); archiveTerminal(p); return result;
  }
  function cleanup(p, ids) {
    const eligible = new Set(ids.filter(id => p.commissions.results.some(r => r.commissionId === id && r.status === 'failed')));
    p.inventory.lots = p.inventory.lots.filter(l => !(l.ownership === 'commissionOwned' && eligible.has(l.commissionId)));
    for (const r of p.commissions.results) if (eligible.has(r.commissionId)) r.pendingRemoval = false;
    return { removedForIds: [...eligible] };
  }
  function expire(p, options = {}) {
    const ids = options.ids || activeRows(p).filter(c => p.world.tick > c.deadlineWorldTick).map(c => c.commissionId), results = [];
    for (const id of ids) { const c = get(p, id); if (activeStatuses.has(c.status)) results.push(failure(p, c, options.reason || 'expired')); }
    if (results.length && options.notify !== false) p.presentation.notices.push({ id: S.util.id(p, 'commission-failed'), kind: 'commissionFailure', title: '委托已失效', text: results.map(r => r.title).join('、'), commissionIds: results.map(r => r.commissionId), results: clone(results) });
    return results;
  }
  function abandon(p, x) { const c = getActive(p, x.commissionId); const result = failure(p, c, 'abandoned'); return { ...result, cleanupAfterAcknowledgement: true }; }
  // Runs on every tick, with or without a trip: the 30-day deadline and an open urgent window are the only clocks.
  function afterTick(p) {
    const overdue = [], urgent = [];
    for (const c of activeRows(p)) { if (p.world.tick > c.deadlineWorldTick) overdue.push(c.commissionId); else if (c.urgent && c.urgentWindow && p.world.tick > c.urgentWindow.deadlineTick) urgent.push(c.commissionId); }
    expire(p, { ids: overdue, reason: 'expired' }); expire(p, { ids: urgent, reason: 'urgent_window_missed' });
  }
  function waitTarget(p, id) { const c = getActive(p, id); E(activeStatuses.has(c.status) && c.deliveryCity === p.world.city && c.handoffPhase !== null && !c.urgent, 'NO_FIXED_HANDOFF'); let target = Math.floor(p.world.tick / 3) * 3 + c.handoffPhase; if (target < p.world.tick) target += 3; E(target <= c.deadlineWorldTick, 'COMMISSION_EXPIRED'); return target; }
  function acknowledgeNotices(p, notices) { return cleanup(p, notices.filter(n => n.kind === 'commissionFailure').flatMap(n => n.commissionIds || [])); }
  function ackResult(p, result) { if (result.kind === 'commissionFailed' && result.cleanupAfterAcknowledgement) cleanup(p, [result.commissionId]); }
  // Terminal records leave `active` for `history` as soon as they are settled (results keep their own copies). Idempotent; never touches the board.
  function archiveTerminal(p) {
    const s = p.commissions; s.history ||= [];
    const terminal = s.active.filter(c => terminalStatuses.has(c.status));
    for (const c of terminal) if (!s.history.some(h => h.commissionId === c.commissionId)) s.history.push({ ...clone(c), archivedTick: p.world.tick });
    s.active = s.active.filter(c => !terminalStatuses.has(c.status));
    return { archived: terminal.length, remaining: s.active.length };
  }
  // ---- save migration to v3.0 (every pre-v3 save; idempotent) ----
  function migrate(p) {
    const s = p.commissions = p.commissions || initial(); s.history ||= []; s.results ||= []; s.active ||= []; s.templateHistory ||= [];
    const arrival = p.world.currentArrival; if (arrival && arrival.arrivedAtWorldTick === undefined) { arrival.arrivedAtWorldTick = S.util.integer(arrival.tick) ? arrival.tick : null; delete arrival.tick; }   // r24 field name → MASTER §11.2
    if (s.boardVersion === 3 && Array.isArray(s.board)) return;
    // 1. global arrival sequence: four arrivals per finished trip plus the stops already reached on the current one; never reset later.
    if (!S.util.integer(p.world.arrivalSequence)) p.world.arrivalSequence = 4 * (p.tripHistory || []).length + Math.max(0, ((p.trip?.routeHistory || []).length || 1) - 1);
    const seq = p.world.arrivalSequence;
    // 2. the board: legal candidates of the old trip pool and the old departure draft move over unchanged — no second roll.
    const seen = new Set(), rows = [];
    for (const c of [...(s.pool || []), ...(p.departureDraft?.pool || [])]) {
      if (!c || seen.has(c.commissionId) || !['available', 'unavailable'].includes(c.status) || s.active.some(a => a.commissionId === c.commissionId)) continue;
      seen.add(c.commissionId); const row = { ...clone(c), status: 'available', postedTick: S.util.integer(c.generatedTick) ? c.generatedTick : p.world.tick, migratedFromTrip: c.tripId || null };
      for (const k of ['tripId', 'deadlineTick', 'generatedTick', 'sourceStage', 'pickupIndex', 'deliveryIndex']) delete row[k];
      if (!S.util.integer(row.segmentCount)) row.segmentCount = row.type === 'wanted' ? 0 : legs(row.pickupCity || row.procurementCity || row.sourceCity, row.deliveryCity);
      rows.push(row);
    }
    s.board = rows; const migratedCount = rows.length; delete s.pool; delete s.poolTripId; delete s.starterGenerated; delete s.generatedReputation; delete p.departureDraft;
    // 3. active commissions: independent 30-day deadline and arrival provenance recovered from the old stop data where possible.
    for (const c of s.active) {
      if (!S.util.integer(c.acceptedAtWorldTick)) {
        if (S.util.integer(c.acceptedTick, 0, p.world.tick)) { c.acceptedAtWorldTick = c.acceptedTick; c.deadlineWorldTick = c.acceptedTick + DEADLINE_TICKS; }
        else { c.acceptedAtWorldTick = p.world.tick; c.deadlineWorldTick = p.world.tick + DEADLINE_TICKS; c.deadlineMigrated = true; }
      }
      if (!S.util.integer(c.acceptedAtArrivalSequence)) {
        // accepted at an earlier stop of the current trip → that many arrivals have happened since; otherwise a new arrival is still required.
        const stopsSince = p.trip && S.util.integer(c.sourceStage) && S.util.integer(p.trip.routeIndex) ? Math.max(0, p.trip.routeIndex - c.sourceStage) : 0;
        c.acceptedAtArrivalSequence = Math.max(0, seq - stopsSince); c.arrivalSequenceMigrated = true;
      }
      if (c.urgentWindow === undefined) c.urgentWindow = null;
      if (c.urgent && !c.urgentWindow && S.util.integer(c.urgentArrivalTick) && activeStatuses.has(c.status)) {
        const tick = c.urgentArrivalTick, phase = tick % 3, day = Math.floor(tick / 3);
        c.urgentWindow = { arrivalTick: tick, arrivalPhase: phase, city: c.deliveryCity, arrivalSequence: seq, deadlineTick: phase === 2 ? (day + 1) * 3 : day * 3 + 2, duskCarryUsed: phase === 2, migrated: true };
      }
      if (c.urgentWindow && !S.util.integer(c.urgentWindow.arrivalSequence)) { const stops = p.trip && S.util.integer(c.urgentWindow.routeIndex) && S.util.integer(p.trip.routeIndex) ? Math.max(0, p.trip.routeIndex - c.urgentWindow.routeIndex) : 0; c.urgentWindow.arrivalSequence = Math.max(0, seq - stops); delete c.urgentWindow.routeIndex; }
      if (c.tripId !== undefined) { c.acceptedTripId = c.acceptedTripId ?? c.tripId ?? null; delete c.tripId; }
      for (const k of ['deadlineTick', 'sourceStage', 'pickupIndex', 'deliveryIndex']) delete c[k];
    }
    // 4. current arrival: only goods whose old provenance flags prove they were carried in count; everything else waits for the next real arrival.
    if (!p.world.currentArrival) {
      if (seq > 0 && !p.world.route) {
        const counts = {}; for (const l of p.inventory.lots) if (eligibleLot(l) && (l.acquisitionCity !== p.world.city || l.hasLeftAcquisitionCity === true)) counts[l.goodId] = (counts[l.goodId] || 0) + l.quantity;
        p.world.currentArrival = { arrivalSequence: seq, city: p.world.city, arrivedAtWorldTick: null, eligibleCargoCounts: counts, migrated: true };
      } else p.world.currentArrival = null;
    }
    // 5. trip-side leftovers of the old coupling; terminal rows out of `active`.
    if (p.trip) { for (const k of ['graceIds', 'graceArrivalTick', 'graceDeadlineTick', 'graceFrozenTick', 'graceClosePending', 'graceClosed', 'graceEnd', 'draftId']) delete p.trip[k]; if (p.trip.returnTasks) delete p.trip.returnTasks.commission; }
    archiveTerminal(p);
    // 6. MASTER v3.0 §20.1: an empty migrated board is initialised to the tier target at once (CASE 02: 商誉21 → 7 candidates); migrated
    //    candidates are kept exactly as they are and any shortfall is topped up at the next world-day boundary (§6.3) — never a second roll now.
    s.boardVersion = 3; s.lastRefillDay = null;
    if (s.board.length === 0) { s.boardTarget = 0; const added = syncBoard(p, S.core.context('commission-migration')); s.boardMigrated = { tick: p.world.tick, migratedCandidates: 0, added: added.length }; }
    else { s.boardTarget = boardTarget(p); s.boardMigrated = { tick: p.world.tick, migratedCandidates: migratedCount, added: 0, topUp: 'nextWorldDay' }; }
  }
  function validate(p) {
    const s = p.commissions; E(s && Array.isArray(s.board) && Array.isArray(s.active) && Array.isArray(s.results), 'INVALID_COMMISSIONS', '委托记录无效');
    E(S.util.integer(p.world.arrivalSequence), 'INVALID_ARRIVAL_SEQUENCE');
    const a = p.world.currentArrival; if (a !== null && a !== undefined) E(a.arrivalSequence === p.world.arrivalSequence && ['changan', 'dunhuang', 'khotan'].includes(a.city) && a.eligibleCargoCounts && Object.values(a.eligibleCargoCounts).every(n => S.util.integer(n)), 'INVALID_ARRIVAL');
    const ids = new Set();
    for (const c of [...s.board, ...s.active]) { E(typeof c.commissionId === 'string' && !ids.has(c.commissionId), 'DUPLICATE_COMMISSION'); ids.add(c.commissionId); E(['delivery', 'procurement', 'wanted'].includes(c.type) && ['changan', 'dunhuang', 'khotan'].includes(c.deliveryCity) && S.util.integer(c.quantity, 1), 'INVALID_COMMISSION'); }
    for (const c of s.board) E(c.status === 'available', 'INVALID_BOARD_ROW');
    for (const c of s.active) {
      E(activeStatuses.has(c.status), 'INVALID_ACTIVE_ROW');
      E(S.util.integer(c.acceptedAtWorldTick, 0, p.world.tick) && S.util.integer(c.deadlineWorldTick) && (c.deadlineWorldTick === c.acceptedAtWorldTick + DEADLINE_TICKS || c.deadlineMigrated === true), 'INVALID_DEADLINE');
      E(S.util.integer(c.acceptedAtArrivalSequence, 0, p.world.arrivalSequence), 'INVALID_ARRIVAL_SEQUENCE');
    }
    return true;
  }
  function snapshot(p) {
    const acceptable = activeCount(p) < capacity(p);
    return {
      capacity: capacity(p), activeCount: activeCount(p), boardTarget: boardTarget(p), locked: p.reputation.value < 5,
      board: p.commissions.board.map(c => ({ ...clone(c), attributeLabels: attributeLabels(c), acceptable })),
      active: activeRows(p).map(c => ({ ...clone(c), attributeLabels: attributeLabels(c), delivery: deliveryEligibility(p, c), urgentOpen: c.urgent ? urgentOpen(p, c) : null, deadlineLabel: S.time.format(c.deadlineWorldTick) })),
      results: clone(p.commissions.results.slice(-20)), history: (p.commissions.history || []).length,
      arrival: p.world.currentArrival ? clone(p.world.currentArrival) : null
    };
  }
  S.commissions = { initial, capacity, boardTarget, config, fillBoard, syncBoard, hasAcceptable, arrivalSequence, recordArrival, cargoRemoved, accept, pickup, cargoPlan, deliveryEligibility, getCommissionDeliveryEligibility, getCourierCommissionEligibility, getPlayerOwnedCommissionEligibility, deliver, expire, cleanup, arrived, waitTarget, acknowledgeNotices, ackResult, archiveTerminal, migrate, validate, snapshot, templateFields, attributeLabels, urgentOpen, DEADLINE_TICKS, activeStatuses, terminalStatuses };
  for (const [type, fn] of Object.entries({ accept, pickup, deliver, abandon })) S.commands.register('commission.' + type, fn);
  S.time.register('commissions', { afterTick, dayStart(p, ctx) { syncBoard(p, ctx, 'day'); } });
})(globalThis.Silk = globalThis.Silk || {});
