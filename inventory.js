(function (S) {
  'use strict';
  const { ensure, integer, clone } = S.util;
  const goods = [
    ['绢帛', 'changan'], ['纸张', 'changan'], ['唐代陶瓷', 'changan'], ['漆器', 'changan', true],
    ['河西毛织', 'dunhuang'], ['干果', 'dunhuang'], ['药材', 'dunhuang'], ['染料', 'dunhuang', true],
    ['于阗丝织', 'khotan'], ['于阗玉', 'khotan', true], ['精制玉器', 'khotan', true], ['毛毡鞋', 'khotan']
  ].map(([id, originCity, advanced]) => Object.freeze({ id, name: id, originCity, advanced: Boolean(advanced), slotCost: id === '唐代陶瓷' ? 2 : 1, fragile: id === '唐代陶瓷' }));
  function good(id) { const row = goods.find(g => g.id === id); ensure(row, 'UNKNOWN_GOOD', '该货物不在当前商品清单中'); return row; }
  function capacity(p) { return 6 + (p.inventory.camelCount - 1) * 2; }
  function used(p) { return (p.inventory.provisions > 0 ? 1 : 0) + p.inventory.lots.filter(l => l.condition !== 'destroyed').reduce((n, l) => n + (l.slotCost || good(l.goodId).slotCost) * l.quantity, 0); }
  function available(p) { return capacity(p) - used(p); }
  function unlocked(p, id) {
    const row = good(id); if (!row.advanced) return true;
    const rel = p.merchant?.suppliers?.[id] || p.merchant?.supplyRelations?.[id];
    return Boolean(rel && (rel.established || rel.level >= 1 || rel.status === 'established' || rel.status === 'deepened' || ['established', 'deepened'].includes(rel.stage)));
  }
  function add(p, input) {
    const item = input.nonMarketable ? { slotCost: input.slotCost, fragile: Boolean(input.fragile) } : good(input.goodId);
    ensure(integer(input.quantity, 1) && integer(input.acquisitionPrice), 'INVALID_LOT');
    const slotCost = input.slotCost || item.slotCost; ensure(integer(slotCost, 1), 'INVALID_SLOT_COST');
    ensure(input.quantity * slotCost <= available(p), 'CAPACITY_EXCEEDED', '行囊货位不足');
    ensure(['playerOwned', 'commissionOwned', 'storyOwned'].includes(input.ownership || 'playerOwned'), 'INVALID_OWNERSHIP');
    const lot = {
      ...clone(input), id: S.util.id(p, 'lot'), slotCost, fragile: item.fragile,
      ownership: input.ownership || 'playerOwned', condition: input.condition || 'intact',
      acquisitionCity: input.acquisitionCity || p.world.city, acquisitionWorldDay: input.acquisitionWorldDay ?? S.time.day(p), acquisitionTripId: input.acquisitionTripId ?? p.trip?.id ?? null,
      nonMarketable: Boolean(input.nonMarketable), hasTransportedToOtherCity: Boolean(input.hasTransportedToOtherCity)
    };
    ensure(!Object.hasOwn(lot, 'quality'), 'DELETED_QUALITY');
    p.inventory.lots.push(lot); return lot;
  }
  function take(p, id, quantity) {
    const lot = p.inventory.lots.find(l => l.id === id); ensure(lot && integer(quantity, 1, lot.quantity), 'LOT_UNAVAILABLE', '这批货物或数量已经改变');
    const detached = { ...clone(lot), quantity };
    lot.quantity -= quantity;
    if (!lot.quantity) p.inventory.lots = p.inventory.lots.filter(l => l.id !== id);
    else detached.id = S.util.id(p, 'lot');
    return detached;
  }
  function damage(p, id, tag, options = {}) {
    if(S.stories?.damage){const result=S.stories.damage(p,id,tag,options);if(result!==null&&result!==undefined)return result;}
    const original = p.inventory.lots.find(l => l.id === id);
    ensure(original && original.condition !== 'destroyed', 'LOT_UNAVAILABLE');
    const amount = options.quantity ?? 1;
    const detached = take(p, id, amount);
    const physical = ['impact', 'crush', 'drop', 'roughHandling'].includes(tag);
    const upgraded = physical && detached.fragile && !options.protected && S.random.next(p) < .35;
    detached.condition = options.destroy || upgraded ? 'destroyed' : 'damaged';
    detached.damageHistory = [...(detached.damageHistory || []), { tag, tick: p.world.tick, condition: detached.condition }];
    p.inventory.lots.push(detached);
    return clone(detached);
  }
  function transported(p, city) { for (const lot of p.inventory.lots) if (lot.acquisitionCity !== city) lot.hasTransportedToOtherCity = true; }
  function lose(p,id,quantity=1,options={}){if(S.stories?.lose){const result=S.stories.lose(p,id,{...options,quantity});if(result!==null&&result!==undefined)return result;}return take(p,id,quantity);}
  S.inventory = { goods, good, capacity, used, available, unlocked, add, take, damage, lose, transported };
})(globalThis.Silk = globalThis.Silk || {});
