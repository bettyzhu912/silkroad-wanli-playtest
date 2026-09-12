'use strict';
// Random-walk invariant runner over the real engine (store semantics: clone / discard on DomainError / validate after success).
// Usage: node tests/fuzz.js [seeds] [steps] [offset]
const { load } = require('./harness');
const fs = require('fs');
const path = require('path');
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const sig = e => (e.code || e.name) + ': ' + String(e.message).slice(0, 160);
function record(map, key, detail) { const row = map.get(key) || { count: 0, detail }; row.count++; map.set(key, row); }

function simulate(S, seed, STEPS, opts = {}) {
  const R = rng(seed * 7919 + 13), pick = arr => arr[Math.floor(R() * arr.length)];
  const crashes = opts.crashes || new Map(), validationBugs = opts.validationBugs || new Map(), stuck = opts.stuck || new Map(), coverage = opts.coverage || {}, cov = k => { coverage[k] = (coverage[k] || 0) + 1; };
  let p = opts.progress || S.core.initialProgress(R() < .5 ? 'guided' : 'explore', seed);
  if (!opts.progress) S.tutorial.started(p);
  const legacy = Boolean(opts.legacy); // legacy: drive an older engine (RC2) for migration samples — only its own validate applies
  const preexistingVouchers = new Set((p.finance?.vouchers || []).map(v => v.voucherId ?? v.id));
  const envelope = pr => ({ meta: { ...S.core.versions, generation: 0, revision: 0 }, progress: pr });
  let n = 0, consecutiveFail = 0, lastErrors = []; const history = [];
  function run(type, payload = {}) {
    n++; const draft = structuredClone(p); let result;
    try { result = S.commands.run(draft, { type, payload }, S.core.context('sim-' + seed + '-' + n)) || { modal: false }; if (result && result.modal !== false) { result = { ...result, id: 'r-' + n }; draft.presentation.activeResult = structuredClone(result); } }
    catch (e) {
      if (e instanceof S.util.DomainError) { consecutiveFail++; lastErrors.push(type + ' -> ' + sig(e)); if (lastErrors.length > 12) lastErrors.shift(); if (/MISSING_/.test(e.code || '')) record(crashes, 'AUTHORITY GAP ' + type + ' | ' + sig(e), { seed, step: n, payload: JSON.stringify(payload).slice(0, 200), recent: history.slice(-8) }); return null; }
      record(crashes, type + ' | ' + sig(e), { stack: String(e.stack).split('\n').slice(0, 6).join('\n'), payload: JSON.stringify(payload).slice(0, 300), seed, step: n, recent: history.slice(-8) }); consecutiveFail++; return null;
    }
    try { S.core.validate(envelope(draft)); if (!legacy) invariants(draft); } catch (e) { record(validationBugs, type + ' | ' + sig(e), { payload: JSON.stringify(payload).slice(0, 300), seed, step: n, recent: history.slice(-8) }); consecutiveFail++; return null; }
    p = draft; consecutiveFail = 0; lastErrors = []; history.push(type); if (history.length > 40) history.shift(); return result;
  }
  function invariants(q) {
    const E = S.util.ensure;
    if (!q.trip) E(q.commissions.active.every(c => !['completed', 'failed', 'cancelled', 'expired', 'abandoned'].includes(c.status)), 'RC3_ACTIVE_TERMINAL', 'terminal commission left in active with no trip');
    if (q.departureDraft) E(!q.trip, 'RC3_DRAFT_WITH_TRIP', 'draft and trip coexist');
    for (const l of q.inventory.lots) if (l.ownership === 'storyOwned' && ['QY01_SAMPLE', 'QY02_TRIAL'].includes(l.storyCargoKind)) E(l.condition !== 'destroyed', 'RC3_SAMPLE_DESTROYED', 'initial story sample destroyed');
    for (const c of q.commissions.active) if (c.urgentWindow) E(c.urgentWindow.deadlineTick - c.urgentWindow.arrivalTick <= 3, 'RC3_URGENT_WINDOW', 'urgent window longer than one carry-over');
    const rolls = q.events?.cityRollDays || {}; for (const [k, v] of Object.entries(rolls)) E(v.key === k && v.probability === 0.5, 'RC3_CITY_ROLL', 'bad city roll record');
    for (const v of q.finance.vouchers) if (!preexistingVouchers.has(v.voucherId ?? v.id)) E(v.redeemableAmount >= 1, 'RC3_VOUCHER_ZERO', 'zero-redeemable voucher issued');
  }
  const q = (city, id) => S.pricing.quote(p, city, id);
  for (let step = 0; step < STEPS; step++) {
    if (consecutiveFail >= 60) { record(stuck, [...new Set(lastErrors)].sort().join(' || '), { seed, step, tick: p.world.tick, city: p.world.city, route: !!p.world.route, phase: p.world.tick % 3, cash: p.cash, trip: p.trip?.phase, draft: !!p.departureDraft, event: p.eventSession?.status + ':' + p.eventSession?.eventId, recent: history.slice(-10) }); break; }
    const ar = p.presentation.activeResult; if (ar) { run('result.ack', { resultId: ar.id }); cov('ack'); continue; }
    const notices = p.presentation.notices; if (notices.length && R() < .5) { const nt = notices[0]; run(nt.kind === 'tutorial' ? 'tutorial.dismiss' : 'notice.dismiss', nt.kind === 'tutorial' ? { id: nt.id } : { ids: [nt.id], id: nt.id }); continue; }
    const wv = p.work?.weaving;
    if (wv && (wv.phase === 'PLAYING' || wv.result && !wv.settled)) {
      cov('weaving.play');
      if (wv.result) { const before = { cash: p.cash, tick: p.world.tick }; run('WEAVE_SETTLE', { sessionId: wv.id, settlementId: wv.settlementId }); if (p.work.weaving.settled && p.world.tick !== before.tick) { S.util.ensure(p.cash - before.cash === wv.result.totalWage && p.world.tick - before.tick === 2 && p.world.tick % 3 === 2, 'WEAVING_SETTLE_INVARIANT', 'settlement must pay once and land on 暮'); cov('weaving.settled'); } continue; }
      if (R() < .15) { run('WEAVE_ABORT', { sessionId: wv.id }); cov('weaving.abort'); continue; }
      const correct = Math.floor(R() * 13), unresolved = R() < .3 ? Math.floor(R() * 3) : 0;
      run('WEAVE_FINISH', { sessionId: wv.id, stats: { reason: correct === 12 && R() < .7 ? 'ALL_CLEAN' : 'DAY_END', correct, unresolved, wrongEndpoint: R() < .5, idleClean: R() < .5, looseRecovered: R() < .5, urgentTriggered: wv.rushPlanned, urgentSuccess: wv.rushPlanned && R() < .6 } });
      if (p.work.weaving.result) S.util.ensure(p.work.weaving.result.totalWage <= 23 && p.work.weaving.result.totalWage >= 9, 'WEAVING_WAGE_RANGE', 'wage out of range');
      continue;
    }
    if (S.weaving && !p.world.route && p.world.city === 'khotan' && p.world.tick % 3 === 0 && !p.work?.tavern && R() < .25 && S.weaving.availability(p).canStartFormal) { run('WEAVE_START', { mode: 'FORMAL' }); cov('weaving.start'); continue; }
    const tav = p.work?.tavern;
    if (tav && !tav.result) { cov('tavern.play'); if (tav.phase === 'PAUSED') { run('TAVERN_RESUME', { sessionId: tav.id }); continue; } if (tav.mode === 'TRIAL' && R() < .05) { run('TAVERN_ABORT', { sessionId: tav.id }); continue; }
      let ms; if (tav.phase === 'QUESTION' && tav.current && !tav.current.answer) { ms = Math.min(tav.current.deadlineMs + (R() < .15 ? 50 : -1), tav.current.openedMs + 180 + Math.floor(R() * 2500)); if (R() < .1) ms = tav.clockMs + Math.floor(R() * 8000); const answer = R() < .8 && ms >= tav.current.openedMs + 180 && ms < tav.current.deadlineMs; run('TAVERN_STEP', { sessionId: tav.id, sequence: tav.sequence + 1, elapsedMs: Math.min(46350, Math.max(tav.clockMs, ms)), ...(answer ? { questionId: tav.current.questionId, lineId: pick(tav.current.options) } : {}) }); }
      else { const next = tav.phase === 'READY' || tav.phase === 'FEEDBACK' ? tav.nextAtMs : tav.phase === 'WAIT' ? 46350 : tav.clockMs + 500; run('TAVERN_STEP', { sessionId: tav.id, sequence: tav.sequence + 1, elapsedMs: Math.min(46350, Math.max(tav.clockMs, next + Math.floor(R() * 40))) }); } continue; }
    if (tav && tav.result && tav.result.completionStatus === 'COMPLETED' && !tav.resultAcknowledged) { run('TAVERN_ACK', { sessionId: tav.id }); cov('tavern.done.' + tav.mode); continue; }
    const rg = p.work?.routeGame, ev = p.eventSession;
    if (rg && !rg.result && ev && ev.status === 'AWAITING_SKILL') { cov('rm.play.' + rg.moduleId); if (rg.phase === 'PAUSED') { run('RM_RESUME', { sessionId: rg.id }); continue; } if (R() < .05) { run(R() < .5 ? 'RM_SKIP' : 'RM_ABORT', { sessionId: rg.id }); continue; }
      const spec = S.minigames.specs[rg.moduleId], ms = Math.min(spec.ms, rg.elapsedMs + 150 + Math.floor(R() * 500)); let action; const r = R();
      if (r < .8) { if (rg.moduleId === 'RM-01') action = { direction: rg.x > 200 ? -1 : 1 }; else if (rg.moduleId === 'RM-02') action = { direction: R() < .85 ? -1 : 1 }; else if (rg.moduleId === 'RM-06') { const nextObs = [1, 0, 2][rg.checked]; action = { direction: nextObs === rg.lane ? (rg.lane === 2 ? -1 : 1) : (R() < .5 ? -1 : 1) }; } else if (rg.moduleId === 'RM-04') action = { target: R() < .6 ? 1 : Math.floor(R() * 3) }; else action = { target: Math.floor(R() * (rg.moduleId === 'RM-03' ? 4 : 5)) }; }
      run('RM_STEP', { sessionId: rg.id, sequence: rg.sequence + 1, elapsedMs: ms, ...(action ? { action } : {}) }); continue; }
    if (rg && rg.result && !rg.result.worldEffectsCommitted && ev && ev.status === 'AWAITING_SKILL') { run('EVENT_RM_RESOLVE', { eventSessionId: ev.id, rmSessionId: rg.id }); cov('rm.resolve.' + rg.result.completionStatus + '.' + (rg.result.settledAs || rg.result.tier)); continue; }
    if (ev && ev.status === 'AWAITING_SKILL') { if (ev.storyProtectionChoices?.length && !ev.node?.storyProtectionChoice) { run('EVENT_STORY_PROTECTION_SELECT', { eventSessionId: ev.id, choiceId: pick(ev.storyProtectionChoices).id }); continue; } run('RM_START', { moduleId: ev.eventId, eventSessionId: ev.id }); continue; }
    if (ev && ev.status === 'AWAITING_CHOICE') { cov('event.' + ev.eventId + (ev.node?.kind === 'city' ? '.city' : '')); if (ev.storyProtectionChoices?.length && !ev.node.storyProtectionChoice && R() < .7) { run('EVENT_STORY_PROTECTION_SELECT', { eventSessionId: ev.id, choiceId: pick(ev.storyProtectionChoices).id }); continue; }
      const def = S.events.definitions[ev.eventId], enabled = def.choices.filter(c => S.events.choiceAllowed(p, c.condition)); const choice = R() < .9 && enabled.length ? pick(enabled) : pick(def.choices); run('EVENT_CHOOSE', { eventSessionId: ev.id, choiceId: choice.choiceId }); continue; }
    if (p.world.route) { run('trip.journey'); cov('journey'); continue; }
    const city = p.world.city, phase = p.world.tick % 3, v = p.market.visit && !p.market.visit.settled ? p.market.visit : null;
    if (v) { cov('market.visit'); const r = R(), own = p.inventory.lots.filter(l => l.ownership === 'playerOwned' && !l.nonMarketable && l.condition !== 'destroyed');
      if (r < .25) run('market.leave', { visitId: v.id });
      else if (r < .5) { const goods = S.inventory.goods.filter(g => S.inventory.unlocked(p, g.id)); const g = R() < .7 ? pick(goods.filter(x => x.originCity === city)) : pick(goods); const unit = q(city, g.id); const max = Math.min(Math.floor(p.cash / unit), Math.floor(S.inventory.available(p) / g.slotCost)); run('market.buy', { visitId: v.id, goodId: g.id, quantity: Math.max(1, Math.floor(R() * (max + 1))) + (R() < .05 ? 3 : 0), supplierChannel: g.originCity === city && Boolean(p.merchant.suppliers[g.id]) && R() < .8 }); }
      else if (r < .7 && own.length) { const lot = pick(own); run('market.sell', { visitId: v.id, lotId: lot.id, quantity: Math.max(1, Math.floor(R() * lot.quantity) + 1) }); }
      else if (r < .75 && own.length) run('market.sellAll', { visitId: v.id });
      else if (r < .85) run('market.provisions', { visitId: v.id, quantity: 1 + Math.floor(R() * 6) });
      else if (r < .9) run('newspaper.purchase', { visitId: v.id });
      else if (r < .95) { const c = p.commissions.pool.find(x => x.status === 'available'); if (c) run('commission.accept', { commissionId: c.commissionId }); }
      else { const c = p.commissions.active.find(x => ['accepted', 'in_transit', 'ready_to_turn_in'].includes(x.status)); if (c) run('commission.deliver', { commissionId: c.commissionId }); }
      continue; }
    const r = R(), trip = p.trip, active = p.commissions.active.filter(c => ['accepted', 'pending_pickup', 'in_transit', 'ready_to_turn_in'].includes(c.status));
    if (trip?.phase === 'summary') continue;
    if (R() < .25) { // directed behaviours
      const here = active.filter(c => c.deliveryCity === city && c.status !== 'pending_pickup');
      const deliverable = here.find(c => { try { return S.commissions.eligibleDelivery(p, c, S.core.context('sim')); } catch (_) { return false; } });
      if (deliverable) { const res = run('commission.deliver', { commissionId: deliverable.commissionId }); if (res) { cov('commission.deliver.' + deliverable.type + (deliverable.urgent ? '.urgent' : '') + (deliverable.handoffPhase !== null ? '.phase' : '')); continue; } }
      const missing = here.find(c => c.type !== 'delivery' && !S.commissions.cargoPlan(p, c).complete && S.inventory.unlocked(p, c.goodId) && (c.type !== 'procurement' || c.procurementCity === city));
      if (missing && phase !== 2) { const res = run('market.enter'); if (res) { const vv = p.market.visit; const plan = S.commissions.cargoPlan(p, missing); const res2 = run('market.buy', { visitId: vv.id, goodId: missing.goodId, quantity: plan.missing }); if (res2) cov('smart.buyForCommission'); continue; } }
      const lines = S.stories.snapshot(p, S.core.context('sim')); const ready = lines.find(l => l.status === 'active' && l.actionChoices.length) || lines.find(l => l.status === 'available' || l.status === 'waiting');
      if (ready) { if (ready.status === 'active') { const ch = pick(ready.actionChoices); const res = run('story.act', { lineId: ready.lineId, choiceId: ch.id }); if (res) { cov('story.act.' + ready.lineId + '.' + ready.progress.activeChapter.chapter); continue; } } else { const ch = pick(ready.startChoices); const res = run('story.begin', { lineId: ready.lineId, choiceId: ch.id }); if (res) { cov('story.begin.' + ready.lineId); continue; } } }
      if (city === 'changan' && !trip) { const m = S.merchant.snapshot(p); if (m.canFund && m.status !== 'open' && m.status !== 'preparing') { const part = ['premises', 'fixtures', 'workingCapital'].find(k => m.funding[k] < m.fundingTargets[k]); if (part) { const need = m.fundingTargets[part] - m.funding[part]; const res = run('merchant.fund', { part, amount: Math.min(need, Math.max(1, p.cash - 20)) }); if (res) { cov('merchant.fund'); continue; } } } }
      if (phase !== 2 && p.inventory.provisions < 8 && p.cash > 20) { const res = run('market.enter'); if (res) { const vv = p.market.visit; run('market.provisions', { visitId: vv.id, quantity: Math.min(10, Math.floor(p.cash / 4)) }); continue; } }
    }
    if (trip?.phase === 'return_tasks' && r < .35) { const view = S.trip.returnView(p); cov('return_tasks'); const pending = Object.entries(view.tasks).filter(([, s]) => s === 'pending'); if (pending.length && R() < .7) run('trip.resolveReturnTask', { task: pick(pending)[0], decision: R() < .5 ? 'deferred' : 'processed' }); else if (view.ready) { run('trip.finalize', { confirmOutstanding: true }); cov('finalize'); } else if (active.length && R() < .5) { const c = pick(active); run('commission.deliver', { commissionId: c.commissionId }); } continue; }
    if (phase === 2) { const opts = S.inn.snapshot(p), choices = []; if (opts.canStay) choices.push('inn.stay'); if (opts.canCamp) choices.push('inn.camp'); if (opts.canRestOutside) choices.push('inn.restOutside'); if (opts.canHome) choices.push('inn.home'); if (!choices.length) { record(stuck, 'NO_OVERNIGHT_OPTION', { seed, tick: p.world.tick, city, cash: p.cash, trip: trip?.phase }); break; } const type = pick(choices); cov(type); const res = run(type, {}); if (res && res.kind === 'eventOpened') cov('night.event.' + res.eventId); if (res && res.branch) cov('camp.' + res.branch); continue; }
    if (r < .22) run('market.enter');
    else if (r < .30) { const k = R(); if (k < .3) run('inn.talk'); else if (k < .5) run('inn.prepare'); else if (k < .8) run('inn.wait', { ticks: 1 + Math.floor(R() * 2) }); else { const c = active.find(x => x.handoffPhase !== null && !x.urgent && x.deliveryCity === city); if (c) run('inn.waitCommission', { commissionId: c.commissionId }); } }
    else if (r < .42) { const k = R(), snap = S.finance.snapshot(p); if (k < .25 && p.cash > 0) run('finance.deposit', { amount: 1 + Math.floor(R() * p.cash) }); else if (k < .4) { const dep = snap.deposits.find(x => x.cityId === city).balance; if (dep > 0) run('finance.withdraw', { amount: 1 + Math.floor(R() * dep) }); } else if (k < .6) run('finance.borrow', { amount: 1 + Math.floor(R() * Math.max(1, snap.availableCredit)) }); else if (k < .8) { const l = snap.loans[0]; if (l) run('finance.repay', { loanId: l.loanId, amount: Math.max(1, Math.min(p.cash, Math.floor(R() * (l.outstandingBalance + 1)))) }); } else if (k < .9 && p.cash > 1) run('finance.issueVoucher', { amount: 1 + Math.floor(R() * p.cash), source: 'cash', destinationCity: pick(['changan', 'dunhuang', 'khotan'].filter(c => c !== city)) }); else { const vc = snap.vouchers.find(x => x.destinationCity === city); if (vc) run('finance.redeemVoucher', { voucherId: vc.voucherId }); } }
    else if (r < .55) { const k = R(); if (k < .3) { const c = p.commissions.pool.find(x => x.status === 'available'); if (c) { const res = run('commission.accept', { commissionId: c.commissionId }); if (res) cov('commission.accept.' + c.type + (c.urgent ? '.urgent' : '')); } } else if (k < .4 && p.departureDraft) { const row = pick(p.departureDraft.pool); if (row) { const res = run('trip.draftSelect', { commissionId: row.commissionId, selected: R() < .8 }); if (res) cov('draft.select'); } } else if (k < .5) { const c = active.find(x => x.status === 'pending_pickup'); if (c) run('commission.pickup', { commissionId: c.commissionId }); } else if (k < .8) { const c = pick(active); if (c) { const res = run('commission.deliver', { commissionId: c.commissionId }); if (res) cov('commission.deliver.' + c.type); } } else if (k < .85) { const c = pick(active); if (c) run('commission.abandon', { commissionId: c.commissionId }); } else { const lines = S.stories.snapshot(p, S.core.context('sim')); const line = pick(lines); if (line.status === 'available' || line.status === 'waiting') { const ch = pick(line.startChoices); const res = run('story.begin', { lineId: line.lineId, choiceId: ch.id }); if (res) cov('story.begin.' + line.lineId); } else if (line.status === 'active' && line.actionChoices.length) { const ch = pick(line.actionChoices); const res = run('story.act', { lineId: line.lineId, choiceId: ch.id }); if (res) cov('story.act.' + line.lineId + '.' + (line.progress?.activeChapter?.chapter)); } } }
    else if (r < .72 && city === 'changan') { const m = S.merchant.snapshot(p), k = R();
      if (m.status !== 'open') { if (k < .6 && m.canFund) { const part = pick(['premises', 'fixtures', 'workingCapital']); const need = m.fundingTargets[part] - m.funding[part]; if (need > 0) { const res = run('merchant.fund', { part, amount: Math.max(1, Math.min(need, Math.floor(R() * (p.cash + 1)))) }); if (res) cov('merchant.fund'); } } else if (k < .9) { const res = run('TAVERN_START', { mode: R() < .7 ? 'FORMAL' : 'TRIAL' }); if (res) cov('tavern.start'); } }
      else { cov('merchant.open'); if (k < .1) run('merchant.buyCabinet', {}); else if (k < .3) { const lot = pick(p.inventory.lots.filter(l => l.ownership === 'playerOwned' && !l.nonMarketable && l.condition !== 'destroyed')); const cab = pick(m.cabinets); if (lot && cab) run('merchant.stock', { cabinetId: cab.cabinetId, lotId: lot.id, quantity: 1 + Math.floor(R() * lot.quantity) }); } else if (k < .4) { const cab = pick(m.cabinets); if (cab?.goodId) run('merchant.saleRule', { cabinetId: cab.cabinetId, mode: pick(['fixedPrice', 'marketMarkup', 'profitMargin']), value: pick([1, 20, 30, 0.05, 0.2, 0]) }); } else if (k < .5) { const cab = pick(m.cabinets); const lot = cab && pick(cab.lots); if (lot) run('merchant.unstock', { cabinetId: cab.cabinetId, lotId: lot.id, quantity: 1 + Math.floor(R() * lot.quantity) }); } else if (k < .58) run('merchant.hire', { staffId: pick(Object.keys(S.merchant.staff)) }); else if (k < .62) { const s = pick(m.staff); if (s) run('merchant.dismiss', { staffId: s.staffId }); } else if (k < .7) run('merchant.sit', {}); else if (k < .76) run('merchant.transfer', { direction: pick(['toBusiness', 'toCash']), amount: 1 + Math.floor(R() * 60) }); else if (k < .82) run('merchant.supplier', { goodId: pick(Object.keys(S.merchant.suppliers)), action: pick(['establish', 'deepen']) }); else if (k < .86) run('merchant.buyCamel', {}); else if (k < .9) run('merchant.buyProperty', { tier: pick(['small', 'medium', 'large']) }); else if (k < .94) { const pr = pick(m.properties); if (pr) run('merchant.propertyUse', { propertyId: pr.propertyId, use: pick(['home', 'vacant', 'rented']) }); } else if (k < .97) { const pr = pick(m.properties); if (pr) run(R() < .5 ? 'merchant.renovate' : 'merchant.setRenewal', { propertyId: pr.propertyId, autoRenew: R() < .5 }); } else run('merchant.upgrade', { amount: 1 + Math.floor(R() * 400) }); } }
    else if (r < .8) run('newspaper.purchase', {});
    else { const view = S.trip.departureView(p); if (view.canDepart) { if (!trip && !p.departureDraft && R() < .7) { const res = run('trip.begin'); if (res) cov('trip.begin'); continue; } const res = run('trip.depart', { acknowledgeSupplyWarning: true, confirmMissedPickup: true }); if (res) cov('depart.' + city); } }
  }
  for (const h of (p.events?.history || [])) cov('eventSeen.' + h.eventId);
  for (const rr of p.commissions.results) cov('commissionResult.' + rr.status + '.' + (rr.type || '?'));
  for (const [id, line] of Object.entries(p.stories.lines)) cov('storyLine.' + id + '.' + line.status + '.' + line.completedChapters.length);
  if (p.merchant.status === 'open') cov('merchantOpened'); if (p.trip?.graceIds?.length) cov('graceFrozen'); cov('cityRolls.' + Object.keys(p.events?.cityRollDays || {}).length);
  return { seed, tick: p.world.tick, cash: p.cash, rep: p.reputation.value, trips: p.tripHistory.length, merchant: p.merchant.status, stories: Object.keys(p.stories.lines).length, progress: p };
}
module.exports = { simulate };
if (require.main === module) {
  const SEEDS = Number(process.argv[2] || 40), STEPS = Number(process.argv[3] || 1500), OFFSET = Number(process.argv[4] || 0);
  const ctx = load(), S = ctx.Silk; const crashes = new Map(), validationBugs = new Map(), stuck = new Map(), coverage = {}, summaries = [];
  for (let i = 0; i < SEEDS; i++) { const seed = OFFSET + i + 1; try { const s = simulate(S, seed, STEPS, { crashes, validationBugs, stuck, coverage }); delete s.progress; summaries.push(s); } catch (e) { record(crashes, 'HARNESS | ' + sig(e), { stack: String(e.stack).split('\n').slice(0, 8).join('\n'), seed }); } }
  fs.mkdirSync(path.join(__dirname, 'results'), { recursive: true });
  const report = { engine: S.core.versions, seeds: SEEDS, steps: STEPS, offset: OFFSET, summaries, coverage, crashes: [...crashes.entries()], validationBugs: [...validationBugs.entries()], stuck: [...stuck.entries()] };
  fs.writeFileSync(path.join(__dirname, 'results', 'fuzz-' + OFFSET + '.json'), JSON.stringify(report, null, 1));
  console.log('runs:', summaries.length, 'maxRep:', Math.max(...summaries.map(s => s.rep)), 'maxTrips:', Math.max(...summaries.map(s => s.trips)), 'merchantOpen:', summaries.filter(s => s.merchant === 'open').length);
  console.log('CRASHES', crashes.size); for (const [k, v] of crashes) console.log(' x' + v.count, k, '\n   ', v.detail.stack, '\n    payload=' + v.detail.payload, 'seed=' + v.detail.seed, 'step=' + v.detail.step, 'recent=' + v.detail.recent);
  console.log('VALIDATION', validationBugs.size); for (const [k, v] of validationBugs) console.log(' x' + v.count, k, 'seed=' + v.detail.seed, 'step=' + v.detail.step, 'payload=' + v.detail.payload, 'recent=' + v.detail.recent);
  console.log('STUCK', stuck.size); for (const [k, v] of stuck) console.log(' x' + v.count, JSON.stringify(v.detail), '\n    errors:', k);
  process.exitCode = crashes.size || validationBugs.size || stuck.size ? 1 : 0;
}
