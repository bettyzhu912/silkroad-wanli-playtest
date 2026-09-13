(function (S) {
  'use strict';
  const { ensure, integer } = S.util;
  const hooks = new Map();
  const DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  function numeral(n) { ensure(integer(n, 0, 99), 'INVALID_NUMERAL'); if (n < 10) return DIGITS[n]; const tens = Math.floor(n / 10), ones = n % 10; return (tens === 1 ? '' : DIGITS[tens]) + '十' + (ones ? DIGITS[ones] : ''); }
  S.time = {
    register(name, hook) { ensure(!hooks.has(name), 'DUPLICATE_TIME_HOOK'); hooks.set(name, hook); },
    day(p) { return Math.floor(p.world.tick / 3); },
    phase(p) { return p.world.tick % 3; },
    // Calendar (design decision 2026-09-13): the game uses a simplified calendar — every month has 30 days, twelve months make a
    // year — counted from the epoch 贞元十六年三月十一日 (world day 1). Historical 贞元十六年 had 29/30-day months (354 days); the
    // fixed 30-day month keeps dates readable and makes the year rollover trivial. Presentation only: ticks and rules are unchanged.
    calendar(tick) {
      ensure(integer(tick, 0), 'INVALID_TICK', '时间无效');
      const dayOffset = Math.floor(tick / 3), phaseIndex = tick % 3, phase = ['晨', '午', '暮'][phaseIndex];
      const total = (3 - 1) * 30 + (11 - 1) + dayOffset;                     // day index in 贞元十六年 (0-based) plus elapsed days
      const year = 16 + Math.floor(total / 360), rem = total % 360, month = Math.floor(rem / 30) + 1, day = rem % 30 + 1;
      const yearLabel = '贞元' + numeral(year) + '年', monthLabel = month === 1 ? '正月' : numeral(month) + '月', dayLabel = numeral(day) + '日';
      return { worldDay: dayOffset + 1, year, month, day, phase: phaseIndex, phaseLabel: phase, yearLabel, monthLabel, dayLabel, dateLabel: monthLabel + dayLabel, label: yearLabel + monthLabel + dayLabel + '·' + phase };
    },
    format(tick) { return S.time.calendar(tick).label; },
    describe(p) {
      const trip=p.trip,remaining=trip?trip.deadlineTick-p.world.tick:null,returned=trip&&trip.arrivedChanganTick!==null&&trip.arrivedChanganTick!==undefined;
      const duration=n=>Math.floor(n/3)+'日'+n%3+'个时段';
      const remainingLabel=!trip?'未启程':returned?(trip.returnStatus==='on_time'?'已按期返抵长安':'已逾期返抵长安'):remaining<0?'已逾期'+duration(-remaining):'商期尚余'+duration(remaining);
      const tripDay = trip ? Math.floor((p.world.tick - trip.startedAt) / 3) + 1 : null, cal = S.time.calendar(p.world.tick);
      return { yearLabel: cal.yearLabel, dateLabel: cal.dateLabel, phaseLabel: cal.phaseLabel, worldDay: cal.worldDay, tripLabel: trip ? '商旅第' + tripDay + '日 / 22日' : '未启程', tripDay, tripTotal: 22, remainingLabel,deadlineLabel:trip?S.time.format(trip.deadlineTick):null };
    },
    advance(p, count, context = {}) {
      ensure(integer(count, 0, 100000), 'INVALID_TIME', '耗时无效');
      const before = p.world.tick;
      for (let n = 0; n < count; n++) {
        for (const h of hooks.values()) if (h.beforeTick) h.beforeTick(p, context);
        if (p.world.tick % 3 === 2) for (const h of hooks.values()) if (h.dayEnd) h.dayEnd(p, context);
        p.world.tick++;
        for (const h of hooks.values()) if (h.afterTick) h.afterTick(p, context);
        if (p.world.tick % 3 === 0) for (const h of hooks.values()) if (h.dayStart) h.dayStart(p, context);
      }
      return { before, after: p.world.tick, elapsed: count };
    }
  };
})(globalThis.Silk = globalThis.Silk || {});
