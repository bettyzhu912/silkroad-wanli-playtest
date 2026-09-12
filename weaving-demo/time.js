(function (S) {
  'use strict';
  const { ensure, integer } = S.util;
  const hooks = new Map();
  S.time = {
    register(name, hook) { ensure(!hooks.has(name), 'DUPLICATE_TIME_HOOK'); hooks.set(name, hook); },
    day(p) { return Math.floor(p.world.tick / 3); },
    phase(p) { return p.world.tick % 3; },
    format(tick) {
      const dayOffset = Math.floor(tick / 3);
      const phase = ['晨', '午', '暮'][tick % 3];
      // Engineering preview uses the known epoch and elapsed days. No invented lunar month length.
      return dayOffset === 0 ? '贞元十六年三月十一日·' + phase : '三月十一日起第' + (dayOffset + 1) + '日·' + phase;
    },
    describe(p) {
      const trip=p.trip,remaining=trip?trip.deadlineTick-p.world.tick:null,returned=trip&&trip.arrivedChanganTick!==null&&trip.arrivedChanganTick!==undefined;
      const duration=n=>Math.floor(n/3)+'日'+n%3+'个时段';
      const remainingLabel=!trip?'未启程':returned?(trip.returnStatus==='on_time'?'已按期返抵长安':'已逾期返抵长安'):remaining<0?'已逾期'+duration(-remaining):'商期尚余'+duration(remaining);
      return { yearLabel: '贞元十六年', dateLabel: S.time.format(p.world.tick).replace('贞元十六年', '').split('·')[0], phaseLabel: ['晨', '午', '暮'][p.world.tick % 3], tripLabel: trip ? '商旅第' + (Math.floor((p.world.tick - trip.startedAt) / 3) + 1) + '日 / 22日' : '未启程',remainingLabel,deadlineLabel:trip?S.time.format(trip.deadlineTick):null };
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
