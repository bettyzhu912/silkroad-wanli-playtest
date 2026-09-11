(function (S) {
  'use strict';
  const E = (...a) => S.util.ensure(...a), R = n => S.money.round(n);
  const staff = {
    manager_attract: { role: 'manager', fee: 60, wage: 18, effect: 'buyer', value: .10 },
    manager_bulk: { role: 'manager', fee: 70, wage: 20, effect: 'quantity', value: .35 },
    manager_repeat: { role: 'manager', fee: 80, wage: 22, effect: 'repeat', value: .50 },
    manager_rare: { role: 'manager', fee: 100, wage: 26, effect: 'rareBuyer', value: .15 },
    assistant_attract: { role: 'assistant', fee: 30, wage: 8, effect: 'buyer', value: .05 },
    assistant_stock: { role: 'assistant', fee: 35, wage: 9, effect: 'quantity', value: .20 },
    assistant_repeat: { role: 'assistant', fee: 40, wage: 10, effect: 'repeat', value: .25 }
  };
  const goods = {
    '纸张': { chance: .80, min: 1, max: 3 }, '干果': { chance: .80, min: 1, max: 3 }, '药材': { chance: .80, min: 1, max: 3 },
    '绢帛': { chance: .65, min: 1, max: 2 }, '河西毛织': { chance: .65, min: 1, max: 2 }, '于阗丝织': { chance: .65, min: 1, max: 2 }, '毛毡鞋': { chance: .65, min: 1, max: 2 }, '染料': { chance: .65, min: 1, max: 2 },
    '唐代陶瓷': { chance: .40, min: 1, max: 1, rare: true }, '漆器': { chance: .40, min: 1, max: 1, rare: true }, '于阗玉': { chance: .40, min: 1, max: 1, rare: true }, '精制玉器': { chance: .25, min: 1, max: 1, rare: true }
  };
  const suppliers = { '染料': { rep: 10, cost: 80, deepRep: 20, deepCost: 120, discount: .05, city: 'dunhuang' }, '漆器': { rep: 10, cost: 100, deepRep: 20, deepCost: 150, discount: .05, city: 'changan' }, '于阗玉': { rep: 20, cost: 200, deepRep: 40, deepCost: 300, discount: .03, city: 'khotan' }, '精制玉器': { rep: 40, cost: 350, city: 'khotan' } };
  const propertyTypes = { small: { cost: 220, renovate: 100, rent: 20, renovatedRent: 28 }, medium: { cost: 500, renovate: 250, rent: 50, renovatedRent: 72 }, large: { cost: 1000, renovate: 500, rent: 110, renovatedRent: 165 } };
  const scales = { lipu: { capacity: 4, assistants: 0 }, chengsi: { rep: 20, cost: 450, ticks: 9, capacity: 6, assistants: 1 }, xinghao: { rep: 40, cost: 900, ticks: 15, capacity: 8, assistants: 3 } };
  const fundingTargets = { premises: 180, fixtures: 70, workingCapital: 50 };
  function initial() { return { status: 'locked', scale: null, funding: { premises: 0, fixtures: 0, workingCapital: 0 }, prepareReadyTick: null, upgrade: null, businessBalance: 0, cabinetCapacity: 0, cabinets: [], staff: [], wageArrears: [], repeatCustomers: {}, sitDay: null, sitBonusUsedDay: null, suppliers: {}, properties: [], lastDailySettlementWorldDay: -1, ledger: [], returnSummaryCursor: 0 }; }
  const day = p => Math.floor(p.world.tick / 3);
  function local(p) { E(p.world.city === 'changan' && !p.world.route, 'LOCAL_ONLY', '请回长安后办理。'); }
  function open(p) { local(p); E(p.merchant.status === 'open', 'MERCHANT_CLOSED', '商号尚未开张。'); }
  function int(n) { E(Number.isSafeInteger(n) && n > 0, 'INVALID_AMOUNT', '请输入有效的正整数。'); return n; }
  function spend(p, n) { int(n); const m = p.merchant; E(m.businessBalance + p.cash >= n, 'INSUFFICIENT_FUNDS', '可用钱款不足。'); const business = Math.min(n, m.businessBalance); m.businessBalance -= business; p.cash -= n - business; return { businessSpent: business, cashSpent: n - business }; }
  function eligibility(p) {
    const completed = p.tripHistory.filter(t => t.status === 'completed');
    return { reputation: p.reputation.value >= 10, experience: completed.length >= 2, onTime: completed.some(t => t.onTimeReturn === true), credit: !p.finance.loans.some(l => l.status === 'overdue'), local: p.world.city === 'changan' && !p.world.route, unstarted: p.trip === null };
  }
  function eligible(p) { return Object.values(eligibility(p)).every(Boolean); }
  function updateEligibility(p) { if (p.merchant.status === 'locked' && eligible(p)) p.merchant.status = 'eligible'; }
  function note(p, type, data) { p.merchant.ledger.push({ id: S.util.id(p, 'merchant-entry'), tick: p.world.tick, worldDay: day(p), type, ...data }); }
  function cabinet(p, id) { const c = p.merchant.cabinets.find(c => c.cabinetId === id); E(c, 'CABINET_MISSING', '货柜不存在。'); return c; }
  function makeCabinet(p) { return { cabinetId: S.util.id(p, 'cabinet'), goodId: null, lots: [], saleRule: null, attentionFailures: 0, lastBuyerRollWorldDay: -1 }; }
  function fund(p, x) {
    local(p); updateEligibility(p); const m = p.merchant;
    E(eligible(p) && ['eligible', 'funding'].includes(m.status), 'INELIGIBLE', '暂未满足筹办条件。');
    E(Object.hasOwn(fundingTargets, x.part), 'INVALID_FUNDING', '筹办项目不存在。'); int(x.amount);
    E(m.funding[x.part] + x.amount <= fundingTargets[x.part], 'FUNDING_EXCESS', '投入超过本项所需金额。');
    const paid = spend(p, x.amount); m.funding[x.part] += x.amount; m.status = 'funding';
    if (Object.keys(fundingTargets).every(k => m.funding[k] === fundingTargets[k])) { m.status = 'preparing'; m.prepareReadyTick = p.world.tick + 6; }
    note(p, 'funding', { part: x.part, amount: x.amount }); return { type: 'merchantFunding', ...paid, funding: { ...m.funding }, status: m.status, readyTick: m.prepareReadyTick };
  }
  function upgrade(p, x) {
    open(p); const m = p.merchant; const target = m.scale === 'lipu' ? 'chengsi' : m.scale === 'chengsi' ? 'xinghao' : null;
    E(target && (!m.upgrade || m.upgrade.stage === target && m.upgrade.readyTick === null), 'UPGRADE_UNAVAILABLE', '当前不能继续扩建投入。');
    const s = scales[target]; E(p.reputation.value >= s.rep, 'REPUTATION_REQUIRED', '尚未达到本次扩建所需商誉。'); int(x.amount);
    const u = m.upgrade || { stage: target, funded: 0, readyTick: null }; E(u.funded + x.amount <= s.cost, 'FUNDING_EXCESS', '投入超过扩建所需金额。');
    const paid = spend(p, x.amount); u.funded += x.amount; if (u.funded === s.cost) u.readyTick = p.world.tick + s.ticks; m.upgrade = u;
    return { type: 'merchantUpgrade', ...paid, upgrade: { ...u } };
  }
  function advanceConstruction(p) {
    updateEligibility(p); const m = p.merchant;
    if (m.status === 'preparing' && p.world.tick >= m.prepareReadyTick) {
      m.status = 'open'; m.scale = 'lipu'; m.cabinetCapacity = 4; m.cabinets.push(makeCabinet(p), makeCabinet(p)); m.businessBalance += 50;
      note(p, 'opened', { workingCapital: 50 }); p.presentation.notices.push({ id: S.util.id(p, 'notice'), kind: 'merchant', type: 'merchantOpened', title: '商号已经开张', text: '立铺已备好两个空货柜，周转金50钱已记入商号账款。', localCity: 'changan', nonBlocking: true });
    }
    if (m.upgrade && m.upgrade.readyTick !== null && p.world.tick >= m.upgrade.readyTick) {
      m.scale = m.upgrade.stage; m.cabinetCapacity = scales[m.scale].capacity; m.upgrade = null; note(p, 'expanded', { scale: m.scale });
      p.presentation.notices.push({ id: S.util.id(p, 'notice'), kind: 'merchant', type: 'merchantExpanded', title: '商号扩建完成', text: '新的货柜与雇员名额已经开放。', localCity: 'changan', nonBlocking: true });
    }
  }
  function buyCabinet(p) { open(p); const m = p.merchant; E(m.cabinets.length < m.cabinetCapacity, 'CAPACITY_REACHED', '已达到当前货柜上限。'); const price = [50, 70, 100, 140, 200, 280][m.cabinets.length - 2]; const paid = spend(p, price); const c = makeCabinet(p); m.cabinets.push(c); return { type: 'buyCabinet', cabinetId: c.cabinetId, price, ...paid }; }
  function stock(p, x) {
    open(p); int(x.quantity); const c = cabinet(p, x.cabinetId), lot = p.inventory.lots.find(l => l.id === x.lotId);
    E(lot && lot.quantity >= x.quantity && lot.ownership === 'playerOwned' && !lot.nonMarketable && lot.condition !== 'destroyed', 'LOT_INELIGIBLE', '这些货物不能放入商号货柜。');
    E(Object.hasOwn(goods, lot.goodId), 'GOOD_UNKNOWN', '尚无该商品的正式经营配置。');
    E(!c.goodId || c.goodId === lot.goodId, 'CABINET_GOOD', '一个货柜只能经营一种商品。');
    E(!p.merchant.cabinets.some(other => other !== c && other.goodId === lot.goodId), 'DUPLICATE_CABINET_GOOD', '请放入现有货柜。');
    c.goodId = lot.goodId;
    const moved = { ...S.util.clone(lot), id: S.util.id(p, 'lot'), quantity: x.quantity, sourceLotId: lot.id };
    c.lots.push(moved); lot.quantity -= x.quantity; p.inventory.lots = p.inventory.lots.filter(l => l.quantity > 0);
    return { type: 'stockCabinet', cabinetId: c.cabinetId, goodId: c.goodId, quantity: x.quantity };
  }
  function unstock(p, x, ctx) {
    open(p); int(x.quantity); const c = cabinet(p, x.cabinetId), lot = c.lots.find(l => l.id === x.lotId);
    E(lot && lot.quantity >= x.quantity, 'LOT_UNAVAILABLE', '货柜中没有足够货物。');
    E(S.inventory.available(p) >= x.quantity * lot.slotCost, 'CARGO_FULL', '行囊空位不足。');
    p.inventory.lots.push({ ...S.util.clone(lot), id: S.util.id(p, 'lot'), quantity: x.quantity, sourceLotId: lot.id });
    lot.quantity -= x.quantity; c.lots = c.lots.filter(l => l.quantity > 0);
    // Empty cabinets retain their configured SKU and locked target until explicitly cleared.
    return { type: 'unstockCabinet', cabinetId: c.cabinetId, quantity: x.quantity };
  }
  function clearCabinet(p, x) { open(p); const c = cabinet(p, x.cabinetId); E(c.lots.length === 0, 'CABINET_NOT_EMPTY', '请先取出货物。'); c.goodId = null; c.saleRule = null; c.attentionFailures = 0; return { type: 'clearCabinet', cabinetId: c.cabinetId }; }
  function price(p, c, d, ctx) { E(typeof ctx?.marketPrice === 'function', 'MISSING_MARKET_AUTHORITY', '缺少正式市场价格数据。'); const n = ctx.marketPrice(p, 'changan', c.goodId, d); E(Number.isSafeInteger(n) && n > 0, 'INVALID_MARKET_PRICE', '市场价格记录无效。'); return n; }
  function saleRule(p, x, ctx) {
    open(p); const c = cabinet(p, x.cabinetId); E(c.goodId, 'EMPTY_CABINET', '请先选择货物。');
    E(['fixedPrice', 'marketMarkup', 'profitMargin'].includes(x.mode), 'INVALID_RULE', '请选择有效的出售条件。');
    let raw, weightedCost;
    if (x.mode === 'fixedPrice') raw = int(x.value);
    else {
      E(Number.isFinite(x.value) && x.value >= 0, 'INVALID_MARGIN', '请输入有效的非负比例。');
      if (x.mode === 'marketMarkup') raw = price(p, c, day(p), ctx) * (1 + x.value);
      else { const quantity = c.lots.reduce((n, l) => n + l.quantity, 0); E(quantity > 0, 'EMPTY_CABINET', '请先放入货物。'); weightedCost = c.lots.reduce((n, l) => n + l.quantity * l.acquisitionPrice, 0) / quantity; raw = weightedCost * (1 + x.value); }
    }
    const targetPrice = R(raw); int(targetPrice); c.saleRule = { mode: x.mode, targetPrice, configuredWorldDay: day(p), configuredWeightedAvgCost: weightedCost ?? null };
    return { type: 'saleRule', cabinetId: c.cabinetId, saleRule: { ...c.saleRule } };
  }
  function hire(p, x) {
    open(p); const m = p.merchant, cfg = staff[x.staffId]; E(cfg, 'STAFF_UNKNOWN', '该人员不在候选名册中。');
    E(!m.staff.some(s => s.staffId === x.staffId), 'STAFF_ALREADY_HIRED', '已经延请此人。');
    const roleCount = m.staff.filter(s => staff[s.staffId].role === cfg.role).length, max = cfg.role === 'manager' ? 1 : scales[m.scale].assistants;
    E(roleCount < max, 'STAFF_SLOTS_FULL', '当前人员名额已满。');
    const paid = spend(p, cfg.fee); const assignment = { assignmentId: S.util.id(p, 'staff'), staffId: x.staffId, nextPayrollDay: day(p) + 30 }; m.staff.push(assignment);
    return { type: 'hire', staffId: x.staffId, fee: cfg.fee, wage: cfg.wage, ...paid };
  }
  function dismiss(p, x) { open(p); E(p.merchant.staff.some(s => s.staffId === x.staffId), 'STAFF_NOT_HIRED', '此人未受雇。'); p.merchant.staff = p.merchant.staff.filter(s => s.staffId !== x.staffId); return { type: 'dismiss', staffId: x.staffId }; }
  function modifiers(p, good) {
    const m = p.merchant, grouped = { buyer: [], quantity: [], repeat: [] };
    for (const a of m.staff) {
      if (m.wageArrears.some(w => w.staffId === a.staffId && w.amount > 0)) continue;
      const cfg = staff[a.staffId]; if (cfg.effect === 'rareBuyer') { if (good.rare) grouped.buyer.push(cfg.value); } else grouped[cfg.effect].push(cfg.value);
    }
    const sum = list => list.sort((a, b) => b - a).reduce((n, v, i) => n + v * [1, .6, .35][i], 0);
    return Object.fromEntries(Object.entries(grouped).map(([k, v]) => [k, sum(v)]));
  }
  function sit(p, x, ctx) {
    open(p); E(p.world.tick % 3 !== 2, 'SIT_UNAVAILABLE', '请在长安的晨、午坐号经营。'); E(p.merchant.sitDay !== day(p), 'SIT_ALREADY_DONE', '今日已经坐号经营。');
    p.merchant.sitDay = day(p); ctx.advance(p, 1, 'merchant-sit'); return { type: 'sitShop', timeCost: 1, tick: p.world.tick };
  }
  function transfer(p, x) { open(p); int(x.amount); E(['toBusiness', 'toCash'].includes(x.direction), 'INVALID_TRANSFER', '请选择调取方向。'); if (x.direction === 'toBusiness') { E(p.cash >= x.amount, 'INSUFFICIENT_CASH', '随身现钱不足。'); p.cash -= x.amount; p.merchant.businessBalance += x.amount; } else { E(p.merchant.businessBalance >= x.amount, 'INSUFFICIENT_BUSINESS', '商号账款不足。'); p.merchant.businessBalance -= x.amount; p.cash += x.amount; } return { type: 'businessTransfer', direction: x.direction, amount: x.amount }; }
  function supplier(p, x) { open(p); const cfg = suppliers[x.goodId]; E(cfg, 'SUPPLIER_UNKNOWN', '没有对应供应往来。'); const existing = p.merchant.suppliers[x.goodId]; const deep = x.action === 'deepen'; E(deep || x.action === 'establish', 'INVALID_ACTION', '请选择建立或深化往来。'); E(deep ? existing?.stage === 'established' && cfg.deepCost : !existing, 'SUPPLIER_STAGE', '当前不能办理这项往来。'); E(p.reputation.value >= (deep ? cfg.deepRep : cfg.rep), 'REPUTATION_REQUIRED', '尚未达到所需商誉。'); const cost = deep ? cfg.deepCost : cfg.cost, paid = spend(p, cost); p.merchant.suppliers[x.goodId] = { stage: deep ? 'deepened' : 'established', discountRate: deep ? cfg.discount : 0, sourceCity: cfg.city }; return { type: 'supplier', goodId: x.goodId, cost, ...paid, relation: { ...p.merchant.suppliers[x.goodId] } }; }
  function buyCamel(p) { open(p); const count = p.inventory.camelCount; E(count >= 1 && count < 6, 'CAMEL_LIMIT', '当前最多可拥有六匹骆驼。'); const cost = [70, 110, 160, 230, 320][count - 1], paid = spend(p, cost); p.inventory.camelCount++; return { type: 'buyCamel', camelCount: count + 1, cargoCapacity: 6 + count * 2, cost, ...paid }; }
  function property(p, x) { const prop = p.merchant.properties.find(a => a.propertyId === x.propertyId); E(prop, 'PROPERTY_UNKNOWN', '院落不存在。'); return prop; }
  function buyProperty(p, x) { open(p); const m = p.merchant; E(m.properties.length < 3 && Object.hasOwn(propertyTypes, x.tier), 'PROPERTY_LIMIT', '院落种类无效或已达到持有上限。'); const cost = propertyTypes[x.tier].cost, paid = spend(p, cost); const prop = { propertyId: S.util.id(p, 'property'), tier: x.tier, renovated: false, use: 'vacant', rentStartDay: null, rentEndDay: null, autoRenew: true }; m.properties.push(prop); return { type: 'buyProperty', property: { ...prop }, askSetHome: m.properties.length === 1, cost, ...paid }; }
  function propertyUse(p, x) { open(p); const prop = property(p, x); E(['home', 'vacant', 'rented'].includes(x.use), 'INVALID_USE', '请选择有效用途。'); E(prop.use !== 'rented', 'RENT_ACTIVE', '请等本期租约结束后再改变用途。'); E(x.use !== prop.use, 'USE_UNCHANGED', '院落已经是此用途。'); if (x.use === 'home') E(!p.merchant.properties.some(a => a !== prop && a.use === 'home'), 'HOME_LIMIT', '最多只能有一处自住院落。'); prop.use = x.use; if (x.use === 'rented') { prop.rentStartDay = day(p); prop.rentEndDay = day(p) + 30; prop.autoRenew = true; } return { type: 'propertyUse', property: { ...prop } }; }
  function setRenewal(p, x) { open(p); const prop = property(p, x); E(prop.use === 'rented' && typeof x.autoRenew === 'boolean', 'INVALID_RENEWAL', '请为出租中的院落设置续租。'); prop.autoRenew = x.autoRenew; return { type: 'renewal', propertyId: prop.propertyId, autoRenew: prop.autoRenew }; }
  function renovate(p, x) { open(p); const prop = property(p, x); E(!prop.renovated, 'ALREADY_RENOVATED', '这处院落已经修缮。'); const cost = propertyTypes[prop.tier].renovate, paid = spend(p, cost); prop.renovated = true; return { type: 'renovate', propertyId: prop.propertyId, cost, ...paid }; }
  function daily(p, ctx) {
    const m = p.merchant, today = day(p); if (m.status !== 'open' || m.lastDailySettlementWorldDay >= today) return;
    for (const c of m.cabinets) {
      if (!c.goodId || !c.saleRule || !c.lots.length || c.lastBuyerRollWorldDay >= today) continue;
      const actualPrice = price(p, c, today, ctx); if (actualPrice < c.saleRule.targetPrice) continue;
      const sellable = c.lots.filter(l => l.condition !== 'destroyed' && S.market.sellUnitPrice(p, l, actualPrice, 'changan') >= c.saleRule.targetPrice);
      if (!sellable.length) continue;
      const cfg = goods[c.goodId], mod = modifiers(p, cfg), customer = m.repeatCustomers[c.goodId] || { progress: 0, formed: false };
      const attention = [0, .10, .20, .25][Math.min(3, c.attentionFailures)];
      const chance = Math.min(.95, cfg.chance + attention + mod.buyer + (customer.formed ? .05 : 0) + (m.sitDay === today ? .05 : 0));
      c.lastBuyerRollWorldDay = today;
      if (S.random.next(p) >= chance) { c.attentionFailures++; note(p, 'inquiry', { cabinetId: c.cabinetId, goodId: c.goodId, text: '有买家前来问价，今日尚未成交。' }); continue; }
      c.attentionFailures = 0;
      let quantity = cfg.min + Math.floor(S.random.next(p) * (cfg.max - cfg.min + 1));
      if (mod.quantity > 0 && S.random.next(p) < mod.quantity) quantity++;
      quantity = Math.min(quantity, sellable.reduce((n, l) => n + l.quantity, 0));
      let remaining = quantity, cost = 0, revenue = 0; const soldLots = [];
      for (const lot of sellable) { const n = Math.min(remaining, lot.quantity); if (!n) break; const unitPrice = S.market.sellUnitPrice(p, lot, actualPrice, 'changan'); soldLots.push({ ...S.util.clone(lot), quantity: n, unitPrice }); cost += n * lot.acquisitionPrice; revenue += n * unitPrice; lot.quantity -= n; remaining -= n; }
      c.lots = c.lots.filter(l => l.quantity > 0); m.businessBalance += revenue;
      let progress = 1; if (mod.repeat > 0 && S.random.next(p) < mod.repeat) progress++;
      if (m.sitDay === today && m.sitBonusUsedDay !== today) { progress++; m.sitBonusUsedDay = today; }
      customer.progress = Math.min(5, customer.progress + progress); const formedNow = !customer.formed && customer.progress === 5; if (formedNow) customer.formed = true; m.repeatCustomers[c.goodId] = customer;
      const identity = ['沙州来商', '于阗行商'][Math.floor(S.random.next(p) * 2)];
      const text = identity + '选购了' + quantity + '件' + c.goodId + '，收入' + revenue + '钱。';
      note(p, 'sale', { cabinetId: c.cabinetId, goodId: c.goodId, marketUnitPrice: actualPrice, quantity, revenue, cost, soldLots, formedNow, identity, text });
      if (formedNow) p.presentation.notices.push({ id: S.util.id(p, 'repeat-customer'), kind: 'merchant', type: 'repeatCustomer', title: '有了回头客', text: c.goodId + '已有熟客。', localCity: 'changan', nonBlocking: true });
    }
    const boundaryDay = today + 1;
    for (const a of m.staff) {
      while (a.nextPayrollDay <= boundaryDay) {
        const due = staff[a.staffId].wage, paid = Math.min(due, m.businessBalance); m.businessBalance -= paid;
        if (paid < due) m.wageArrears.push({ id: S.util.id(p, 'wage'), staffId: a.staffId, assignmentId: a.assignmentId, dueDay: a.nextPayrollDay, amount: due - paid });
        note(p, 'payroll', { staffId: a.staffId, due, paid, arrears: due - paid }); a.nextPayrollDay += 30;
      }
    }
    for (const prop of m.properties) {
      if (prop.use !== 'rented') continue;
      while (prop.rentEndDay <= boundaryDay) {
        const cfg = propertyTypes[prop.tier], rent = prop.renovated ? cfg.renovatedRent : cfg.rent; m.businessBalance += rent; note(p, 'rent', { propertyId: prop.propertyId, rent });
        if (prop.autoRenew) { prop.rentStartDay = prop.rentEndDay; prop.rentEndDay += 30; } else { prop.use = 'vacant'; prop.rentStartDay = null; prop.rentEndDay = null; break; }
      }
    }
    // Newly received rent can clear existing arrears in this same day-end transaction.
    for (const a of m.wageArrears) { if (a.amount && m.businessBalance >= a.amount) { m.businessBalance -= a.amount; note(p, 'arrearsPaid', { staffId: a.staffId, amount: a.amount }); a.amount = 0; } }
    m.wageArrears = m.wageArrears.filter(a => a.amount > 0); m.lastDailySettlementWorldDay = today;
  }
  function validate(p) {
    const m = p.merchant, integer = S.util.integer;
    E(m && ['locked', 'eligible', 'funding', 'preparing', 'open'].includes(m.status) && integer(m.businessBalance), 'INVALID_MERCHANT');
    E(Object.entries(fundingTargets).every(([k, target]) => integer(m.funding[k], 0, target)) && integer(m.lastDailySettlementWorldDay, -1, day(p)), 'INVALID_MERCHANT_FUNDING');
    E(Array.isArray(m.cabinets) && Array.isArray(m.staff) && Array.isArray(m.properties) && Array.isArray(m.wageArrears), 'INVALID_MERCHANT_STATE');
    if (m.status === 'open') E(Object.hasOwn(scales, m.scale) && m.cabinetCapacity === scales[m.scale].capacity && m.cabinets.length >= 2 && m.cabinets.length <= m.cabinetCapacity, 'INVALID_MERCHANT_CAPACITY');
    const lots = new Set(p.inventory.lots.map(l => l.id)), cabinets = new Set(), goodIds = new Set(), staffIds = new Set();
    for (const c of m.cabinets) {
      E(typeof c.cabinetId === 'string' && !cabinets.has(c.cabinetId), 'DUPLICATE_CABINET'); cabinets.add(c.cabinetId);
      E(c.goodId === null || Object.hasOwn(goods, c.goodId) && !goodIds.has(c.goodId), 'INVALID_CABINET_GOOD'); if (c.goodId) goodIds.add(c.goodId);
      E(integer(c.attentionFailures) && integer(c.lastBuyerRollWorldDay, -1, day(p)), 'INVALID_CABINET_STATE');
      if (c.saleRule) E(['fixedPrice', 'marketMarkup', 'profitMargin'].includes(c.saleRule.mode) && integer(c.saleRule.targetPrice, 1), 'INVALID_SALE_RULE');
      for (const l of c.lots) {
        E(typeof l.id === 'string' && !lots.has(l.id), 'DUPLICATE_LOT'); lots.add(l.id);
        E(l.goodId === c.goodId && l.ownership === 'playerOwned' && !l.nonMarketable && ['intact', 'damaged'].includes(l.condition), 'INVALID_CABINET_LOT');
        E(integer(l.quantity, 1) && integer(l.acquisitionPrice) && integer(l.slotCost, 1) && !Object.hasOwn(l, 'quality'), 'INVALID_CABINET_LOT');
      }
    }
    for (const a of m.staff) { E(Object.hasOwn(staff, a.staffId) && !staffIds.has(a.staffId) && integer(a.nextPayrollDay), 'INVALID_STAFF'); staffIds.add(a.staffId); }
    E(m.staff.filter(a => staff[a.staffId].role === 'manager').length <= 1 && m.staff.filter(a => staff[a.staffId].role === 'assistant').length <= (scales[m.scale]?.assistants || 0), 'INVALID_STAFF_SLOTS');
    for (const a of m.wageArrears) E(Object.hasOwn(staff, a.staffId) && typeof a.id === 'string' && integer(a.amount, 1), 'INVALID_WAGE_ARREARS');
    E(m.properties.length <= 3 && m.properties.filter(a => a.use === 'home').length <= 1 && new Set(m.properties.map(a => a.propertyId)).size === m.properties.length, 'INVALID_PROPERTIES');
    for (const a of m.properties) {
      E(Object.hasOwn(propertyTypes, a.tier) && typeof a.renovated === 'boolean' && ['vacant', 'home', 'rented'].includes(a.use), 'INVALID_PROPERTY');
      if (a.use === 'rented') E(integer(a.rentStartDay) && a.rentEndDay === a.rentStartDay + 30 && typeof a.autoRenew === 'boolean', 'INVALID_RENT_PERIOD');
    }
    for (const [good, customer] of Object.entries(m.repeatCustomers)) E(Object.hasOwn(goods, good) && integer(customer.progress, 0, 5) && customer.formed === (customer.progress === 5), 'INVALID_REPEAT_CUSTOMER');
    for (const [good, relation] of Object.entries(m.suppliers)) E(Object.hasOwn(suppliers, good) && ['established', 'deepened'].includes(relation.stage) && relation.sourceCity === suppliers[good].city && relation.discountRate === (relation.stage === 'deepened' ? suppliers[good].discount : 0), 'INVALID_SUPPLIER');
    return true;
  }
  function snapshot(p) { const m = p.merchant, nextStage = m.scale === 'lipu' ? 'chengsi' : m.scale === 'chengsi' ? 'xinghao' : null; return { ...S.util.clone(m), fundingTargets: { ...fundingTargets }, nextCabinetCost: m.status === 'open' && m.cabinets.length < m.cabinetCapacity ? [50, 70, 100, 140, 200, 280][m.cabinets.length - 2] : null, nextCamelCost: p.inventory.camelCount < 6 ? [70, 110, 160, 230, 320][p.inventory.camelCount - 1] : null, nextScale: nextStage ? { stage: nextStage, ...scales[nextStage] } : null, eligibility: eligibility(p), canFund: eligible(p), remote: p.world.city !== 'changan' || !!p.world.route, staffCandidates: Object.entries(staff).map(([id, s]) => ({ id, role: s.role, fee: s.fee, wage: s.wage })) }; }
  const reducers = { 'merchant.fund': fund, 'merchant.upgrade': upgrade, 'merchant.buyCabinet': buyCabinet, 'merchant.stock': stock, 'merchant.unstock': unstock, 'merchant.clearCabinet': clearCabinet, 'merchant.saleRule': saleRule, 'merchant.hire': hire, 'merchant.dismiss': dismiss, 'merchant.sit': sit, 'merchant.transfer': transfer, 'merchant.supplier': supplier, 'merchant.buyCamel': buyCamel, 'merchant.buyProperty': buyProperty, 'merchant.propertyUse': propertyUse, 'merchant.setRenewal': setRenewal, 'merchant.renovate': renovate };
  function reduce(p, command, ctx) { E(Object.hasOwn(reducers, command.type), 'UNKNOWN_COMMAND', '无法办理该事项。'); const before = { cash: p.cash, businessBalance: p.merchant.businessBalance, tick: p.world.tick }; const result = reducers[command.type](p, command.payload || {}, ctx); return { ...result, kind: result.type, before, after: { cash: p.cash, businessBalance: p.merchant.businessBalance, tick: p.world.tick } }; }
  S.merchant = { initial, validate, reduce, snapshot, eligibility, updateEligibility, advanceConstruction, daily, modifiers, staff, goods, suppliers, propertyTypes, scales };
  for (const [name, fn] of Object.entries(reducers)) S.commands.register(name, (p, x, ctx) => reduce(p, { type: name, payload: x }, ctx));
  S.time.register('merchant', { afterTick: advanceConstruction, dayEnd: daily });
})(globalThis.Silk = globalThis.Silk || {});
