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
  // ---- WEIGHTED_AVERAGE_INVENTORY_COST_PATCH v1.0 (2026-09-13) ----
  // One cost per productId: every lot of the same good that the player owns (carried or in a 商号 cabinet; marketable, not destroyed)
  // carries the same integer `avgCost` = the product's single 持仓均价. Lots stay only as provenance records (city / day / turnover /
  // condition / actual purchase price for the existing supplier-discount resale cap); they are never a cost basis again.
  // On every acquisition: avg = roundMoney((oldQty × oldAvg + newQty × newUnitCost) / (oldQty + newQty)) with the game's global
  // S.money.round (fraction > .5 rounds up, ≤ .5 down); the integer is written to every pool lot at once and nothing else is kept —
  // no exact / hidden average anywhere. Partial removals (sale, delivery, loss, damage) leave avgCost untouched; when the last unit
  // goes the value is gone with the lots (nothing stored), and the next purchase from zero starts at its own integer unit price.
  function poolable(lot) { return lot.ownership === 'playerOwned' && !lot.nonMarketable && lot.condition !== 'destroyed' && lot.quantity > 0 && typeof lot.goodId === 'string'; }
  function costPool(p, goodId) { return [...p.inventory.lots, ...(p.merchant?.cabinets || []).flatMap(c => c.lots)].filter(l => l.goodId === goodId && poolable(l)); }
  function avgCost(p, goodId) { const pool = costPool(p, goodId); return pool.length ? pool[0].avgCost : null; }
  function mergeCost(p, lot) {
    const others = costPool(p, lot.goodId).filter(l => l !== lot), oldQty = others.reduce((n, l) => n + l.quantity, 0);
    let avg = lot.acquisitionPrice;
    if (oldQty > 0) {
      const oldAvg = others[0].avgCost; ensure(integer(oldAvg) && others.every(l => l.avgCost === oldAvg), 'INVALID_COST_BASIS');
      avg = S.money.round((oldQty * oldAvg + lot.quantity * lot.acquisitionPrice) / (oldQty + lot.quantity));
    }
    for (const l of [lot, ...others]) l.avgCost = avg;
    return avg;
  }
  // Save compatibility (one-time fold, idempotent): lots saved before this rule carry only their batch price; the batches of one good are
  // folded once into a single integer avgCost by the same formula, after which the batch prices are never read as cost again.
  function migrateCost(p) {
    const lots = [...p.inventory.lots, ...(p.merchant?.cabinets || []).flatMap(c => c.lots)].filter(poolable), byGood = new Map();
    for (const l of lots) byGood.set(l.goodId, [...(byGood.get(l.goodId) || []), l]);
    for (const pool of byGood.values()) {
      if (pool.every(l => integer(l.avgCost) && l.avgCost === pool[0].avgCost)) continue;
      const basis = l => integer(l.avgCost) ? l.avgCost : l.acquisitionPrice, quantity = pool.reduce((n, l) => n + l.quantity, 0);
      const avg = S.money.round(pool.reduce((n, l) => n + l.quantity * basis(l), 0) / quantity);
      for (const l of pool) l.avgCost = avg;
    }
  }
  function validateCost(p) {
    const seen = new Map();
    for (const l of [...p.inventory.lots, ...(p.merchant?.cabinets || []).flatMap(c => c.lots)]) {
      if (!poolable(l)) continue;
      ensure(integer(l.avgCost), 'INVALID_COST_BASIS');
      if (seen.has(l.goodId)) ensure(seen.get(l.goodId) === l.avgCost, 'INVALID_COST_BASIS'); else seen.set(l.goodId, l.avgCost);
    }
    return true;
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
      nonMarketable: Boolean(input.nonMarketable), hasTransportedToOtherCity: Boolean(input.hasTransportedToOtherCity),
      // RC3 BUG-06/07: transport provenance. Set once the lot has really left its purchase city.
      hasLeftAcquisitionCity: Boolean(input.hasLeftAcquisitionCity)
    };
    ensure(!Object.hasOwn(lot, 'quality'), 'DELETED_QUALITY');
    p.inventory.lots.push(lot); if (poolable(lot)) mergeCost(p, lot); return lot;
  }
  // A lot qualifies as transported cargo for the city it is judged in when it was bought elsewhere or has left its purchase city.
  function transportQualified(lot, city) { return lot.acquisitionCity !== city || lot.hasLeftAcquisitionCity === true; }
  function departed(p, from) { for (const lot of p.inventory.lots) if (lot.acquisitionCity === from) lot.hasLeftAcquisitionCity = true; }
  function migrate(p) {
    const held = [...p.inventory.lots.map(l => ({ lot: l, city: p.world.city, travelling: Boolean(p.world.route) })), ...(p.merchant?.cabinets || []).flatMap(c => c.lots.map(l => ({ lot: l, city: 'changan', travelling: false })))];
    for (const { lot, city, travelling } of held) {
      if (typeof lot.hasLeftAcquisitionCity === 'boolean') continue;
      // RC2 saves cannot prove provenance: only cargo already away from its purchase city (or on the road) is qualified.
      lot.hasLeftAcquisitionCity = Boolean(lot.hasTransportedToOtherCity) || (travelling && lot.acquisitionCity === city) || lot.acquisitionCity !== city;
    }
  }
  function take(p, id, quantity) {
    const lot = p.inventory.lots.find(l => l.id === id); ensure(lot && integer(quantity, 1, lot.quantity), 'LOT_UNAVAILABLE', '这批货物或数量已经改变');
    // COMMISSION v3.0: an intact, marketable, player-owned unit leaving the caravan can never count as brought-in cargo again.
    if (S.commissions?.cargoRemoved) S.commissions.cargoRemoved(p, lot, quantity);
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
  function transported(p, city) { for (const lot of p.inventory.lots) if (lot.acquisitionCity !== city) { lot.hasTransportedToOtherCity = true; lot.hasLeftAcquisitionCity = true; } }
  function lose(p,id,quantity=1,options={}){if(S.stories?.lose){const result=S.stories.lose(p,id,{...options,quantity});if(result!==null&&result!==undefined)return result;}return take(p,id,quantity);}
  S.inventory = { goods, good, capacity, used, available, unlocked, add, take, damage, lose, transported, transportQualified, departed, migrate, costPool, avgCost, migrateCost, validateCost };
})(globalThis.Silk = globalThis.Silk || {});
