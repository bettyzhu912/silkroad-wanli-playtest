(function (S) {
  'use strict';
  const active = new Set(['accepted', 'pending_pickup', 'in_transit', 'ready_to_turn_in']);
  const trades = new Set(['market.buy', 'market.sell', 'market.sellAll', 'market.provisions', 'newspaper.purchase']);
  const daytime = new Set(['inn.talk', 'inn.prepare']);
  const overnight = new Set(['inn.stay', 'inn.camp', 'inn.restOutside', 'inn.home']);

  // Reads command duration only. Eligibility, costs, and the eventual commit remain in each domain.
  function actionTicks(p, type, payload = {}) {
    if (p.world.route) return 0;
    const phase = p.world.tick % 3;
    if (trades.has(type) || type === 'market.leave') {
      const v = p.market?.visit;
      if (!v || v.settled || v.city !== p.world.city || v.id !== payload.visitId) return 0;
      return type === 'market.leave' ? Number(v.hadActivity) : Number(!v.hadActivity);
    }
    if (type === 'inn.wait') {
      const n = payload.ticks ?? 1;
      return Number.isSafeInteger(n) && n > 0 && n <= 2 - phase ? n : 0;
    }
    if (type === 'inn.waitCommission') {
      if (phase === 2 || !S.commissions?.waitTarget) return 0;
      try { return Math.max(0, Math.min(S.commissions.waitTarget(p, payload.commissionId) - p.world.tick, 2 - phase)); }
      catch (error) { if (error instanceof S.util.DomainError) return 0; throw error; }
    }
    if (daytime.has(type)) return phase < 2 ? 1 : 0;
    if (overnight.has(type)) return phase === 2 ? 1 : 0;
    if (type === 'merchant.sit') return p.world.city === 'changan' && phase < 2 ? 1 : 0;
    if (type === 'TAVERN_START') return payload.mode === 'FORMAL' && p.world.city === 'changan' && phase < 2 ? 1 : 0;
    return 0;
  }

  // Q3 gives fixed base travel, not a maximum for future event delays. This shared
  // lower bound includes already-applied route changes and mandatory dusk rests.
  // Consumers must never relabel it as the still-unresolved maximum-normal estimate.
  function remainingRoute(p, atTick = p.world.tick) {
    if (!p.trip || p.trip.arrivedChanganTick !== null && p.trip.arrivedChanganTick !== undefined) {
      return { baseTicks: 0, requiredRestTicks: 0, minimumTicks: 0, normalMaxTicks: 0 };
    }
    const plan = p.trip.routePlan || S.trip?.plan;
    const index = p.trip.routeIndex;
    if (!Array.isArray(plan) || !Number.isSafeInteger(index) || index < 0 || index >= plan.length) return null;
    let baseTicks = 0, requiredRestTicks = 0, cursor = atTick;
    for (let i = index; i < plan.length; i++) {
      const travelingNow = i === index && Boolean(p.world.route);
      if (!travelingNow && cursor % 3 === 2) { cursor++; requiredRestTicks++; }
      const duration = travelingNow ? p.world.route.remainingTicks : plan[i].days * 3;
      if (!Number.isSafeInteger(duration) || duration < 0) return null;
      baseTicks += duration; cursor += duration;
    }
    return { baseTicks, requiredRestTicks, minimumTicks: baseTicks + requiredRestTicks, normalMaxTicks: null };
  }
  function durationText(n) { return n === 1 ? '一个时段' : n + '个时段'; }
  function check(p, type, payload = {}) {
    const elapsed = actionTicks(p, type, payload), trip = p.trip;
    if (!elapsed || !trip) return null;
    const endingGrace=S.trip?.graceAdvanceWarning?.(p,type,payload);
    if(endingGrace)return endingGrace;
    const now = p.world.tick, after = now + elapsed, lines = [];
    const candidates = (p.commissions?.active || []).filter(c => c.tripId === trip.id && active.has(c.status));
    const grace = new Set(trip.graceIds || []);
    const ordinary = candidates.filter(c => !grace.has(c.commissionId || c.id));
    const expiring = ordinary.filter(c => now <= c.deadlineTick && after > c.deadlineTick);
    if (expiring.length) lines.push('尚有普通委托将在商期结束后立即失效：' + expiring.map(c => c.title).join('、') + '。');
    const urgent = ordinary.filter(c => !expiring.includes(c) && c.urgent && c.urgentArrivalTick !== null && c.urgentArrivalTick === now);
    if (urgent.length) lines.push('继续后将错过加急委托的交接时段：' + urgent.map(c => c.title).join('、') + '。');

    const returned = trip.arrivedChanganTick !== null && trip.arrivedChanganTick !== undefined;
    if (!returned) {
      if (now > trip.deadlineTick) {
        const overdue = now - trip.deadlineTick, penalty = Math.abs(trip.overdueActualPenalty || 0);
        lines.push('本趟商期已逾期' + durationText(overdue) + '，已扣商誉' + penalty + '。仍可继续返程。');
      } else if (after > trip.deadlineTick) {
        lines.push('继续此操作后仍未返抵长安，本趟将记为逾期。');
      } else {
        const route = remainingRoute(p, after);
        if (route && after + route.minimumTicks > trip.deadlineTick) lines.push('即使后续没有额外延误，按剩余基础路程也已无法按期返抵长安。');
        else if (route && after + route.minimumTicks + 3 > trip.deadlineTick) lines.push('继续后返程时间将较为紧张，按剩余基础路程计算已不足一日安全余量，途中仍可能延误。');
      }
    }
    if (!lines.length) return null;
    const cost = trades.has(type) ? '本次交易后，离开市场将耗费一个时段。' : type === 'TAVERN_START' ? '正式诗令完成后将耗费一个时段。' : '本次操作的基础耗时为' + durationText(elapsed) + '。';
    return { title: '留意商期与委托', text: [cost, ...lines].join('\n') };
  }
  S.timeRisk = { actionTicks, remainingRoute, check };
})(globalThis.Silk = globalThis.Silk || {});
