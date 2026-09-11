(function (S) {
  'use strict';
  const thresholds = [5, 10, 20, 40];
  const descriptions={5:'开放普通委托，同时最多1项。',10:'染料、漆器获得货源接触资格；委托上限2项，柜坊授信400钱；达到商号筹办的商誉条件。',20:'于阗玉获得接触资格；可深化染料、漆器往来，可扩建成肆；委托上限3项，授信700钱。',40:'精制玉器获得接触资格；可深化于阗玉往来，可扩建兴号；委托上限4项，授信1000钱。'};
  function milestone(p) {
    for (const level of thresholds) {
      if (p.reputation.value >= level && !p.reputation.milestones[level]) {
        p.reputation.milestones[level] = true;
        let notice=p.presentation.notices.find(n=>n.milestoneGroup==='reputation');
        if(!notice){notice={id:S.util.id(p,'reputation-milestone'),kind:'major',milestoneGroup:'reputation',levels:[],title:'商誉渐著',text:''};p.presentation.notices.push(notice);}
        notice.levels.push(level);notice.text=notice.levels.map(n=>'商誉达到'+n+'：'+descriptions[n]).join('\n');
      }
    }
  }
  S.reputation = {
    tier(value) { return value >= 40 ? 3 : value >= 20 ? 2 : value >= 10 ? 1 : 0; },
    change(p, delta, source) {
      S.util.ensure(Number.isSafeInteger(delta), 'INVALID_REPUTATION');
      const before = p.reputation.value; p.reputation.value = Math.max(0, before + delta);
      milestone(p);
      const row = { type: 'reputation', source, requested: delta, actual: p.reputation.value - before, before, after: p.reputation.value, tick: p.world.tick, tripId: p.trip?.id || null };
      p.journal.push(row); return row;
    },
    addTurnover(p, amount, source) {
      S.util.ensure(S.util.integer(amount), 'INVALID_TURNOVER'); p.reputation.turnover += amount;
      const before = p.reputation.value;
      while (true) {
        const threshold = [20, 50, 100, 160][S.reputation.tier(p.reputation.value)];
        if (p.reputation.turnover < threshold) break;
        p.reputation.turnover -= threshold; S.reputation.change(p, 1, source);
      }
      return { amount, gained: p.reputation.value - before, remainder: p.reputation.turnover };
    }
  };
})(globalThis.Silk = globalThis.Silk || {});
