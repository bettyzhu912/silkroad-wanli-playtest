(function (S) {
  'use strict';
  const E = S.util.ensure, clone = S.util.clone, data = () => globalThis.SilkData.commissions.stories;
  const directionGoods = { steady: ['纸张', '干果'], value: ['于阗玉', '漆器'], urgent: ['药材', '染料'] };
  const quantities = { steady: 4, value: 2, urgent: 3 };
  const beginnings = { QY01: ['changan', 'dunhuang', 'khotan', 'dunhuang', 'changan'], QY02: ['khotan', 'dunhuang', 'changan', 'khotan', null], QY03: ['dunhuang', null, 'khotan', 'dunhuang'], QY04: ['khotan', 'dunhuang', 'changan', 'khotan', 'changan'], QY05: ['dunhuang', 'changan', 'dunhuang', null], QY06: ['changan', 'dunhuang', 'khotan', 'dunhuang', 'changan'] };
  function initial() { return { lines: {}, lastNewChapterTrip: null, activeCargoChapter: null, history: [], hasDunhuangPackingExperience: false }; }
  function state(p) { p.stories ||= initial(); p.stories.history ||= []; return p.stories; }
  function budgetKey(p) { return p.trip?.id || 'next:' + p.tripHistory.length; }
  function definition(id) { const d = data().find(d => d.id === id); E(d, 'STORY_UNKNOWN'); return d; }
  function displayName(id) { return id === 'QY06' ? '三路归一' : definition(id).name; }
  function progress(p, id) { return p.stories?.lines[id] || null; }
  function cargo(p, id) { return p.inventory.lots.filter(l => l.ownership === 'storyOwned' && l.storyLineId === id); }
  function units(lot) { return lot.storyUnits || Array.from({ length: lot.sampleQuantity || lot.quantity }, () => ({ goodId: lot.sampleGoodId || lot.goodId, condition: lot.condition })); }
  function allUnits(p, id) { return cargo(p, id).flatMap(units); }
  function missing(key) { throw new S.util.DomainError('MISSING_STORY_AUTHORITY', '该货物处理尚缺已确认规则：' + key, { authorityKey: key }); }
  function location(p, city) { E(!p.world.route && p.world.city === city, 'STORY_WRONG_CITY', '请到指定城市继续。'); }
  function priorDamageExperience(p) {
    const prior = p.tripHistory.at(-1); if (!prior) return false;
    return (p.events?.history || []).some(h => h.tripKey === prior.id && ['M02', 'R01', 'R02', 'R06', 'R07', 'R08', 'R09', 'R15', 'R16', 'RM-01', 'RM-05'].includes(h.eventId));
  }
  function trigger(p, id, ctx) {
    if (progress(p, id)) return true;
    const rep = p.reputation.value, city = p.world.city;
    switch (id) {
      case 'QY01': return rep >= 10 && city === 'changan' && Boolean(p.reputation.firstVisits.dunhuang);
      case 'QY02': return rep >= 20 && city === 'khotan' && S.inventory.unlocked(p, '于阗玉');
      case 'QY03': return rep >= 10 && city === 'dunhuang' && p.trip?.routeIndex === 1 && (priorDamageExperience(p) || ctx?.storyHistoryEligible?.(p, id) === true);
      case 'QY04': return rep >= 20 && city === 'khotan' && p.commissions.results.some(r => r.status === 'completed' && r.goodId === '于阗丝织');
      case 'QY05': return rep >= 10 && city === 'dunhuang' && p.commissions.results.some(r => r.status === 'completed' && ['药材', '干果'].includes(r.goodId));
      case 'QY06': return rep >= 40 && city === 'changan' && Object.values(p.stories?.lines || {}).filter(l => l.status === 'closed' && l.completed).length >= 3;
      default: return false;
    }
  }
  function startChoices(id, chapter) {
    if (id === 'QY01' && chapter === 1) return [{ id: 'normal', text: '普通包扎', cashCost: 0 }, { id: 'reinforce', text: '加固包扎', cashCost: 3 }];
    if (id === 'QY03' && chapter === 1) return [{ id: 'carry', text: '直接带走', cashCost: 0 }, { id: 'repack', text: '重新加固', cashCost: 2 }];
    if (id === 'QY04' && chapter === 1) return [{ id: 'safe', text: '稳妥包装', cargoSlots: 2 }, { id: 'compressed', text: '合并压装', cargoSlots: 1 }];
    return [{ id: 'continue', text: '继续这段奇缘', cashCost: 0 }];
  }
  function cargoCheck(p, id, slots, removing = []) {
    E(!p.inventory.lots.some(l => l.ownership === 'storyOwned' && l.storyLineId !== id), 'STORY_CARGO_LIMIT', '请先处理当前携带特殊货物的奇缘。');
    const freed = removing.filter(l => l.condition !== 'destroyed').reduce((n, l) => n + l.quantity * l.slotCost, 0);
    E(S.inventory.available(p) + freed >= slots, 'CAPACITY_EXCEEDED', '行囊货位不足，请腾出足够货位后再来。');
  }
  function addCargo(p, id, chapter, label, goodId, quantity, slots, details = {}) {
    cargoCheck(p, id, slots);
    const item = S.inventory.add(p, { goodId, storyLabel: label, quantity: 1, acquisitionPrice: 0, slotCost: slots, fragile: false, ownership: 'storyOwned', nonMarketable: true, storyLineId: id, storyChapterId: id + '_' + chapter, storyUnits: Array.from({ length: quantity }, () => ({ goodId, condition: 'intact' })), ...details });
    state(p).activeCargoChapter = id + '_' + chapter; return clone(item);
  }
  function removeCargo(p, id) { const removed = cargo(p, id).map(l => S.inventory.take(p, l.id, l.quantity)); if (!p.inventory.lots.some(l => l.ownership === 'storyOwned')) state(p).activeCargoChapter = null; return removed; }
  function requireCargo(p, id, quantity) { const rows = allUnits(p, id); E(rows.length === quantity, 'STORY_CARGO_REQUIRED', '这批剧情货物尚未齐备。'); return rows; }
  function intactInitial(p, id) { const rows = allUnits(p, id); E(rows.length, 'STORY_CARGO_REQUIRED'); if (rows.some(u => u.condition !== 'intact')) missing(id + '初始唯一纸样／试料的受损补救结果'); }
  function displayChapter(chapter) { return chapter ? { chapterId: chapter.id, number: chapter.chapter, title: chapter.title, location: chapter.location, text: chapter.text.replace(/storyOwned\s*/g, '') } : null; }
  function openResult(id, chapter, extra = {}) { return { kind: 'storyChapterOpened', lineId: id, chapterId: chapter.id, title: displayName(id) + ' · ' + chapter.title, text: displayChapter(chapter).text, actualCash: 0, actualReputation: 0, elapsed: 0, ...extra }; }
  function finalVisit(p, line) {
    const n = line.completedChapters.length + 1;
    if (!((line.lineId === 'QY02' && n === 5) || (line.lineId === 'QY05' && n === 4)) || line.flags.finalVisit || line.lastCompletedTrip === budgetKey(p) || !['changan', 'dunhuang'].includes(p.world.city)) return;
    if (state(p).lastNewChapterTrip === budgetKey(p)) return;
    line.flags.finalVisit = { city: p.world.city, tick: p.world.tick, trip: budgetKey(p) };
  }
  function onTripStart(p) {
    if (state(p).lastNewChapterTrip === 'next:' + p.tripHistory.length) state(p).lastNewChapterTrip = p.trip.id;
    for (const line of Object.values(state(p).lines)) finalVisit(p, line);
  }
  function begin(p, x, ctx) {
    E(!p.world.route, 'CITY_REQUIRED', '请在对应城市继续这段奇缘。'); const d = definition(x.lineId), old = progress(p, d.id), next = old ? old.completedChapters.length + 1 : 1;
    E(!old || old.status !== 'closed' && !old.activeChapter, 'STORY_ALREADY_ACTIVE', '此章已经开始，或这条奇缘已经结束。'); E(trigger(p, d.id, ctx), 'STORY_LOCKED', '尚未满足这段奇缘的条件。');
    E(!(d.id === 'QY03' && next === 2), 'STORY_ROUTE_STEP_PENDING', '请带着旧箱继续敦煌到于阗的行程，途中或抵达时会继续处理。');
    E(state(p).lastNewChapterTrip !== budgetKey(p), 'STORY_TRIP_LIMIT', '本商期已经出现过一个新章节。');
    const line = old || { lineId: d.id, status: 'active', flags: {}, completedChapters: [], activeChapter: null };
    const city = beginnings[d.id][next - 1];
    if (city) location(p, city); else { E(['changan', 'dunhuang'].includes(p.world.city), 'STORY_WRONG_CITY'); E(line.lastCompletedTrip !== budgetKey(p), 'STORY_NEXT_TRIP_REQUIRED'); if (line.flags.finalVisit) location(p, line.flags.finalVisit.city); }
    if ((d.id === 'QY01' && next === 4 || d.id === 'QY06' && next === 4)) E(p.trip?.routeIndex === 3, 'STORY_RETURN_VISIT_REQUIRED', '请在返程抵达敦煌时继续。');
    if (d.id === 'QY06' && next === 2) E(p.trip?.routeIndex === 1, 'STORY_OUTBOUND_REQUIRED', '请在敦煌去程出发前办理。');
    if (['QY02', 'QY04'].includes(d.id) && next === 4) E(line.lastCompletedTrip !== budgetKey(p), 'STORY_NEXT_TRIP_REQUIRED');
    const choice = startChoices(d.id, next).find(c => c.id === (x.choiceId || 'continue')); E(choice, 'STORY_CHOICE', '请选择本章已有的选项。');
    E(p.cash >= (choice.cashCost || 0), 'INSUFFICIENT_CASH', '随身现钱不足。');
    const slots = next === 1 ? ({ QY01: 1, QY02: 1, QY03: 1, QY04: choice.id === 'safe' ? 2 : 1 })[d.id] || 0 : 0;
    if (slots) cargoCheck(p, d.id, slots);
    const chapter = d.chapters[next - 1]; E(chapter, 'STORY_COMPLETE');
    const active = { chapter: next, chapterId: chapter.id, begunTick: p.world.tick, begunTrip: budgetKey(p), beginChoice: choice.id, phase: 'active' }, additions = [];
    if (d.id === 'QY01' && next === 1) { additions.push(addCargo(p, d.id, next, '西行纸样', '纸张', 1, 1)); line.flags.qy01_reinforced = choice.id === 'reinforce'; }
    if (d.id === 'QY02' && next === 1) additions.push(addCargo(p, d.id, next, '玉料试料', '于阗玉', 1, 1, { valuable: true, storyCargoKind: 'QY02_TRIAL' }));
    if (d.id === 'QY03' && next === 1) { additions.push(addCargo(p, d.id, next, '旧木匣', '旧木匣', 1, 1, { storyMaxCondition: 'damaged' })); line.flags.qy03_repacked = choice.id === 'repack'; }
    if (d.id === 'QY04' && next === 1) { additions.push(addCargo(p, d.id, next, '于阗丝织样品', '于阗丝织', 2, slots, { storyCargoKind: 'QY04_SAMPLES', storyPacking: choice.id, storyMaxCondition: 'damaged' })); line.flags.packing = choice.id; }
    if (d.id === 'QY02' && next === 4) {
      const score = Number(line.flags.branch === 'honest') + Number(line.flags.qy02_report === 'full');
      active.specialProbability = [.20, .50, .80][score]; active.specialRoll = S.random.next(p); active.specialAvailable = active.specialRoll < active.specialProbability;
    }
    if (d.id === 'QY05' && next === 3) {
      active.quantity = line.flags.pricePreference === 'stable' ? 2 : line.flags.QY05_EXAGGERATED === true ? 3 : 1;
      active.referenceUnitPrice = S.market.quote(p, 'dunhuang', '药材'); active.referenceCost = active.referenceUnitPrice * active.quantity;
      active.supplyTight = Boolean(S.newspapers?.activeEvents(p, 'dunhuang').some(e => e.pressures.some(v => v.goodId === '药材' && v.pressureType === 'supply_down')));
      active.storyReward = Math.min(16, 10 + 2 * (active.quantity - 1) + (active.supplyTight ? 2 : 0));
    }
    if (d.id === 'QY06' && next === 2 && !line.flags.originalGoodId) active.phase = 'selectProduct';
    p.cash -= choice.cashCost || 0; line.activeChapter = active; line.status = 'active'; state(p).lines[d.id] = line; state(p).lastNewChapterTrip = budgetKey(p);
    if (!city) finalVisit(p, line);
    if (cargo(p, d.id).length) state(p).activeCargoChapter = chapter.id;
    if (choice.cashCost) p.journal.push({ type: 'story', lineId: d.id, chapterId: chapter.id, tripId: p.trip?.id || null, amount: -choice.cashCost, tick: p.world.tick });
    return openResult(d.id, chapter, { cargoAdded: additions, actualCash: -(choice.cashCost || 0) });
  }
  function largeOrderEligible(p) {
    if (!p.trip || S.inventory.capacity(p) - Number(p.inventory.provisions > 0) < 4) return false;
    const remainingBase = (p.world.route?.remainingTicks || 0) + [9, 12, 12, 9].slice(p.world.route ? p.trip.routeIndex + 1 : p.trip.routeIndex).reduce((a, n) => a + n, 0);
    return p.trip.deadlineTick - p.world.tick >= remainingBase + 3;
  }
  function actionChoices(p, id) {
    const line = progress(p, id); if (!line?.activeChapter) return [];
    const n = line.activeChapter.chapter, f = line.flags;
    if (id === 'QY01' && n === 2) return [{ id: 'truthful', text: '照实转述' }, { id: 'exaggerate', text: '夸大长安纸的紧缺' }];
    if (id === 'QY01' && n === 4) return f.qy01_exaggerated ? [{ id: 'admit', text: '坦白说明' }, { id: 'insist', text: '坚持说法' }] : [{ id: 'report', text: '照实回话' }];
    if (id === 'QY02' && n === 2) return [{ id: 'honest', text: '照实说明' }, { id: 'conceal', text: '含糊带过' }];
    if (id === 'QY02' && n === 3) return [{ id: 'full', text: '带回完整评价' }, { id: 'favorable', text: '只带最有利的报价' }];
    if (id === 'QY02' && n === 4 && line.activeChapter.specialAvailable && line.activeChapter.phase !== 'delivery') return [{ id: 'accept', text: '接受贵重重托 · 1货位' }];
    if (id === 'QY03' && n === 3) return [{ id: 'open', text: '开箱验货' }, { id: 'return', text: '原封送回敦煌' }];
    if (id === 'QY04' && n === 2) return [{ id: 'small', text: '小单两件' }, ...(largeOrderEligible(p) ? [{ id: 'large', text: '大单四件' }] : [])];
    if (id === 'QY04' && n === 3) return [{ id: 'sell', text: '立即按当前报价成交' }, { id: 'observe', text: '只报行情，不成交' }];
    if (id === 'QY05' && n === 2) return line.activeChapter.phase === 'highDisclosure' ? [{ id: 'highTruthful', text: '如实说明数量限制' }, { id: 'highExaggerate', text: '只报高价，不说明限量' }] : [{ id: 'high', text: '高价但少量' }, { id: 'stable', text: '较稳的长期价' }];
    if (id === 'QY06' && n === 1) return Object.entries(directionGoods).flatMap(([branch, goods]) => goods.map(goodId => ({ id: branch + ':' + goodId, text: ({ steady: '稳妥货', value: '贵重货', urgent: '急用货' })[branch] + ' · ' + goodId + ' × ' + quantities[branch] })));
    if (id === 'QY06' && n === 2 && !f.originalGoodId) return (directionGoods[f.branch] || []).map(goodId => ({ id: 'product:' + goodId, text: '选定货物 · ' + goodId }));
    if (id === 'QY06' && n === 2) return [{ id: 'prepare', text: { steady: '免费重新配载 · 4件占3格', value: '加固贵重货 · 3钱', urgent: '加急准备 · 5钱' }[f.branch] }, { id: 'normal', text: '保持普通准备' }];
    if (id === 'QY06' && n === 3) return [{ id: 'keep', text: '坚持原商品 · ' + f.originalGoodId }, { id: 'switch', text: '改用同方向另一商品 · ' + directionGoods[f.branch]?.find(g => g !== f.originalGoodId) }];
    return [{ id: 'continue', text: id === 'QY02' && n === 4 && line.activeChapter.phase === 'delivery' ? '在长安交付贵重重托' : '照约办理' }];
  }
  function complete(p, line, choice, cash, rep, extra = {}) {
    const active = line.activeChapter, id = line.lineId, n = active.chapter, chapter = definition(id).chapters[n - 1], beforeRep = p.reputation.value;
    p.cash += cash; if (rep) S.reputation.change(p, rep, { type: 'story', lineId: id, chapterId: active.chapterId, tripId: p.trip?.id || null });
    line.completedChapters.push(active.chapterId); line.activeChapter = null; line.lastCompletedTrip = budgetKey(p); line.status = n === definition(id).chapters.length ? 'closed' : 'waiting';
    if (line.status === 'closed') { line.completed = true; line.completedWorldDay = S.time.day(p); }
    const result = { kind: 'storyChapterCompleted', lineId: id, chapterId: active.chapterId, title: chapter.title, text: '这段经历已记入商旅账册。', choiceId: choice.id, chosenText: choice.text, actualCash: cash, actualReputation: p.reputation.value - beforeRep, flags: clone(line.flags), tick: p.world.tick, tripId: p.trip?.id || null, elapsed: 0, ...clone(extra) };
    state(p).history.push(clone(result)); p.journal.push({ type: 'story', lineId: id, chapterId: active.chapterId, tripId: p.trip?.id || null, amount: cash, reputation: result.actualReputation, tick: p.world.tick }); return result;
  }
  function ownedPlan(p, goodId, quantity) {
    let left = quantity; const rows = [];
    for (const lot of p.inventory.lots) if (lot.goodId === goodId && lot.ownership === 'playerOwned' && !lot.nonMarketable && lot.condition === 'intact' && left > 0) { const n = Math.min(left, lot.quantity); rows.push({ id: lot.id, quantity: n }); left -= n; }
    E(left === 0, 'STORY_GOODS_REQUIRED', '还需准备足量、完好的自有' + goodId + '。'); return rows;
  }
  function act(p, x) {
    const line = progress(p, x.lineId); E(line?.activeChapter && line.status === 'active', 'STORY_NOT_ACTIVE'); const active = line.activeChapter, n = active.chapter, id = line.lineId, f = line.flags;
    const choice = actionChoices(p, id).find(c => c.id === (x.choiceId || 'continue')); E(choice, 'STORY_CHOICE');
    let cash = 0, rep = 0, consumed = [], extra = {};
    if (id === 'QY01') {
      if (n === 1) { location(p, 'dunhuang'); intactInitial(p, id); cash = 8; rep = 1; consumed = removeCargo(p, id); }
      if (n === 2) { location(p, 'khotan'); f.qy01_exaggerated = choice.id === 'exaggerate'; if (f.qy01_exaggerated) cash = 4; else rep = 1; }
      if (n === 3) { location(p, 'dunhuang'); const plan = ownedPlan(p, '于阗丝织', 1); consumed = plan.map(l => S.inventory.take(p, l.id, l.quantity)); cash = 10; rep = 1; }
      if (n === 4) { location(p, 'dunhuang'); E(p.trip?.routeIndex === 3, 'STORY_RETURN_VISIT_REQUIRED'); if (choice.id === 'admit') { cash = 4; f.qy01_admitted = true; } else if (choice.id === 'insist') cash = 8; else { cash = 8; rep = 2; } }
      if (n === 5) { location(p, 'changan'); cash = (f.qy01_exaggerated ? 12 : 16) + (f.qy01_reinforced ? 2 : 0); rep = f.qy01_exaggerated ? 2 : 3; f.ending = f.qy01_exaggerated ? 'exaggerated' : 'truthful'; }
    } else if (id === 'QY02') {
      if (n <= 3) { location(p, n === 3 ? 'changan' : 'dunhuang'); intactInitial(p, id); }
      if (n === 1) { cash = 6; rep = 1; }
      if (n === 2) { f.branch = choice.id; if (choice.id === 'conceal') cash = 6; }
      if (n === 3) { f.qy02_report = choice.id; if (choice.id === 'full') rep = 2; else cash = 8; }
      if (n === 4) {
        if (active.phase === 'delivery') { location(p, 'changan'); const u = requireCargo(p, id, 1)[0]; cash = u.condition === 'intact' ? 16 : u.condition === 'damaged' ? 8 : 0; rep = u.condition === 'destroyed' ? 0 : 2; extra.cargoCondition = u.condition; consumed = removeCargo(p, id); }
        else {
          location(p, 'khotan'); const old = cargo(p, id); cargoCheck(p, id, active.specialAvailable ? 1 : 0, old);
          if (active.specialAvailable) { consumed = removeCargo(p, id); const lot = addCargo(p, id, n, '贵重重托', '于阗玉', 1, 1, { valuable: true, storyCargoKind: 'QY02_SPECIAL_CARGO' }); active.phase = 'delivery'; active.acceptedTick = p.world.tick; return openResult(id, definition(id).chapters[n - 1], { text: '贵重重托已经收入行囊，请带到长安交付。', cargoAdded: [lot], consumedCargo: consumed }); }
          consumed = removeCargo(p, id); extra.text = '玉料商听完你的回报，这次没有另托货物。此前的经历会留到下一次相逢。';
        }
      }
      if (n === 5) { E(['changan', 'dunhuang'].includes(p.world.city) && !p.world.route, 'STORY_WRONG_CITY'); if (f.finalVisit) location(p, f.finalVisit.city); const honest = f.branch === 'honest' && f.qy02_report === 'full'; cash = honest ? 18 : 28; rep = honest ? 4 : 2; f.ending = honest ? 'honest' : 'profit'; }
    } else if (id === 'QY03') {
      if (n === 1) { location(p, 'dunhuang'); requireCargo(p, id, 1); }
      if (n === 3) { location(p, 'khotan'); const u = requireCargo(p, id, 1)[0]; f.boxChoice = choice.id; f.boxCondition = u.condition; if (choice.id === 'open') consumed = removeCargo(p, id); else f.knownDestination = 'dunhuang'; }
      if (n === 4) { location(p, 'dunhuang'); if (f.boxChoice === 'return') consumed = removeCargo(p, id); const intact = f.boxChoice === 'return' || f.boxCondition === 'intact'; cash = intact ? 15 : 10; rep = intact ? 3 : 1; f.ending = f.boxChoice; }
    } else if (id === 'QY04') {
      if (n === 1) { location(p, 'dunhuang'); requireCargo(p, id, 2); cash = 10; rep = 1; f.knownDestination = 'changan'; }
      if (n === 2) { location(p, 'dunhuang'); f.orderSize = choice.id === 'small' ? 2 : 4; }
      if (n === 3) {
        location(p, 'changan'); const rows = requireCargo(p, id, 2), price = S.market.quote(p, 'changan', '于阗丝织'); f.sampleDecision = choice.id; f.sampleQuote = { price, day: S.time.day(p), states: rows.map(u => u.condition) };
        if (choice.id === 'sell') { cash = rows.reduce((n, u) => n + (u.condition === 'intact' ? price : Math.ceil(price * .7)), 0); f.sampleQuote.total = cash; consumed = removeCargo(p, id); }
        else { const obsId = price >= 50 ? 'QY04-OBS-01' : price >= 43 ? 'QY04-OBS-02' : 'QY04-OBS-03', text = price >= 50 ? '长安今日的于阗丝织报价高于平常。' : price >= 43 ? '长安今日的于阗丝织报价大致平稳。' : '长安今日的于阗丝织报价偏低。'; p.messages.observations.push({ id: S.util.id(p, 'observation'), source: 'story', sourceId: obsId, lineId: id, city: 'changan', tick: p.world.tick, text }); extra.observationId = obsId; extra.text = text; }
        extra.lockedQuote = clone(f.sampleQuote);
      }
      if (n === 4) {
        location(p, 'khotan'); const quantity = f.orderSize, old = cargo(p, id), purchasing = f.sampleDecision === 'sell'; E([2, 4].includes(quantity), 'STORY_ORDER_SIZE');
        const price = purchasing ? S.market.quote(p, 'khotan', '于阗丝织') : 0, cost = price * quantity; E(p.cash >= cost, 'INSUFFICIENT_CASH', '现钱不足，整批订单暂未接受。'); cargoCheck(p, id, quantity, old);
        consumed = removeCargo(p, id); const lot = addCargo(p, id, n, '织坊正式订单', '于阗丝织', quantity, quantity, { storyCargoKind: 'QY04_ORDER', storyMaxCondition: 'damaged', storyPacking: 'individual' });
        cash = -cost; f.procurementPrincipal = cost; f.orderType = purchasing ? 'procurement' : 'supplied'; f.orderPrice = { price, day: S.time.day(p) }; f.knownDestination = 'changan'; extra.cargoAdded = [lot];
      }
      if (n === 5) { location(p, 'changan'); const rows = requireCargo(p, id, f.orderSize), damaged = rows.filter(u => u.condition === 'damaged').length;
        E(rows.every(u => u.condition !== 'destroyed'), 'STORY_CARGO_CONDITION'); const reward = damaged ? f.orderSize === 2 ? [0, 18, 14][damaged] : [0, 20, 18, 16, 14][damaged] : f.orderSize === 2 ? 22 : 32;
        cash = (f.procurementPrincipal || 0) + reward; rep = damaged ? 2 : 4; extra.storyReward = reward; extra.returnedPrincipal = f.procurementPrincipal || 0; consumed = removeCargo(p, id); f.ending = f.orderType;
      }
    } else if (id === 'QY05') {
      if (n === 1) { location(p, 'changan'); E(p.market.visit && p.market.visit.city === 'changan' && p.market.visit.enteredTick >= active.begunTick, 'STORY_MARKET_VISIT_REQUIRED', '请先查看长安市场，再回报所见。'); }
      if (n === 2) {
        location(p, 'changan'); if (choice.id === 'high') { active.phase = 'highDisclosure'; return openResult(id, definition(id).chapters[n - 1], { text: '这份高价只收少量药材。你准备怎样向药商说明？' }); }
        f.pricePreference = choice.id === 'stable' ? 'stable' : 'high'; f.QY05_PRICE_MODE = f.pricePreference.toUpperCase(); f.QY05_EXAGGERATED = choice.id === 'highExaggerate'; cash = 4;
      }
      if (n === 3) { location(p, 'dunhuang'); const plan = ownedPlan(p, '药材', active.quantity); consumed = plan.map(l => S.inventory.take(p, l.id, l.quantity)); cash = active.referenceCost + active.storyReward; rep = 2; extra.referenceCost = active.referenceCost; extra.referenceUnitPrice = active.referenceUnitPrice; extra.storyReward = active.storyReward; extra.quantity = active.quantity; }
      if (n === 4) { E(['changan', 'dunhuang'].includes(p.world.city) && !p.world.route, 'STORY_WRONG_CITY'); if (f.finalVisit) location(p, f.finalVisit.city); const stable = f.pricePreference === 'stable', exaggerated = f.QY05_EXAGGERATED === true; cash = stable ? 14 : exaggerated ? 10 : 18; rep = stable ? 3 : exaggerated ? 1 : 2; f.ending = stable ? 'stable' : exaggerated ? 'exaggerated' : 'highTruthful'; }
    } else if (id === 'QY06') {
      if (n === 1) { location(p, 'changan'); [f.branch, f.originalGoodId] = choice.id.split(':'); }
      if (n === 2) { location(p, 'dunhuang'); E(p.trip?.routeIndex === 1, 'STORY_OUTBOUND_REQUIRED'); if (choice.id.startsWith('product:')) { f.originalGoodId = choice.id.slice(8); active.phase = 'active'; return openResult(id, definition(id).chapters[n - 1], { text: '已选定' + f.originalGoodId + '。现在可以安排本段准备。' }); } const prepared = choice.id === 'prepare', cost = prepared ? ({ steady: 0, value: 3, urgent: 5 })[f.branch] : 0; E(p.cash >= cost, 'INSUFFICIENT_CASH'); cash = -cost; f.preparation = prepared; f.preparationKind = prepared ? f.branch : null; if (prepared && f.branch === 'urgent') f.expeditePending = true; }
      if (n === 3) { location(p, 'khotan'); const quantity = quantities[f.branch], slots = f.branch === 'steady' && f.preparation ? 3 : quantity; cargoCheck(p, id, slots); const goodId = choice.id === 'keep' ? f.originalGoodId : directionGoods[f.branch].find(g => g !== f.originalGoodId);
        const lot = addCargo(p, id, n, '三路归一正式订单', goodId, quantity, slots, { storyCargoKind: 'QY06_ORDER', storyMaxCondition: 'damaged', storyPacking: f.branch === 'steady' && f.preparation ? 'pairedFirstTwo' : 'individual' }); f.switched = choice.id === 'switch'; f.orderGoodId = goodId; f.orderQuantity = quantity; f.orderLotId = lot.id; f.knownDestination = 'changan'; if (f.branch === 'value' && f.preparation) f.protectionAvailable = true; extra.cargoAdded = [lot]; }
      if (n === 4) { location(p, 'dunhuang'); E(p.trip?.routeIndex === 3, 'STORY_RETURN_VISIT_REQUIRED'); const rows = requireCargo(p, id, f.orderQuantity); cash = Math.max(8, Math.min(15, (f.switched ? 8 : 12) + (f.actuallyProtected ? 3 : 0) - (rows.some(u => u.condition === 'damaged') ? 2 : 0))); }
      if (n === 5) { location(p, 'changan'); const rows = requireCargo(p, id, f.orderQuantity), damaged = rows.filter(u => u.condition === 'damaged').length; cash = Math.max(20, (f.switched ? 30 : 40) + (f.preparation ? 5 : 0) - damaged * ({ steady: 4, value: 8, urgent: 5 })[f.branch]); rep = 5; consumed = removeCargo(p, id); f.ending = (f.switched ? 'switched' : 'kept') + (f.preparation ? '_prepared' : '_ordinary'); }
    }
    return complete(p, line, choice, cash, rep, { consumedCargo: consumed, ...extra });
  }
  function boxIncidentComplete(p, outcome, details = {}) {
    const line = progress(p, 'QY03'); if (!line || line.completedChapters.includes('QY03_2')) return;
    E(line.completedChapters.includes('QY03_1'), 'STORY_BOX_NOT_ACCEPTED');
    line.flags.boxIncident = { outcome, tick: p.world.tick, trip: budgetKey(p), ...clone(details) }; line.completedChapters.push('QY03_2');
    state(p).history.push({ kind: 'storyAttachedChapter', lineId: 'QY03', chapterId: 'QY03_2', title: definition('QY03').chapters[1].title, text: displayChapter(definition('QY03').chapters[1]).text, actualCash: 0, actualReputation: 0, elapsed: 0, outcome, ...clone(details) });
  }
  function damageChoices(p) {
    const line = progress(p, 'QY03');
    if (!line || !line.completedChapters.includes('QY03_1') || line.completedChapters.includes('QY03_2') || p.world.route?.from !== 'dunhuang' || p.world.route?.to !== 'khotan' || !cargo(p, 'QY03').length) return [];
    return [{ id: 'protect', text: '优先护住旧箱', lineId: 'QY03', chapterId: 'QY03_2', chapterText: displayChapter(definition('QY03').chapters[1]).text }, ...(p.stories.hasDunhuangPackingExperience ? [{ id: 'packingExperience', text: '凭敦煌整理行装的经验护箱', lineId: 'QY03', chapterId: 'QY03_2' }] : [])];
  }
  function recordProtectionChoice(p, choiceId, eventSessionId) {
    const line = progress(p, 'QY03'); E(line && damageChoices(p).some(c => c.id === choiceId), 'STORY_CHOICE');
    line.flags.boxCompatibleEvent = { eventSessionId, choiceId, tick: p.world.tick, chapterTextShown: true };
  }
  function damage(p, id, tag, options = {}) {
    const lot = p.inventory.lots.find(l => l.id === id); if (lot?.ownership !== 'storyOwned' || !lot.storyLineId) return null;
    const line = progress(p, lot.storyLineId); E(line, 'STORY_STATE_REQUIRED');
    if (lot.storyLineId === 'QY01' && line.flags.qy01_reinforced) missing('QY01加固的保护次数、成功率和兼容货损类型');
    const damageId = options.incidentId || p.eventSession?.id || 'damage:' + tag + ':' + p.world.tick;
    lot.storyDamageResults ||= {}; if (lot.storyDamageResults[damageId]) return clone(lot.storyDamageResults[damageId]);
    const compatible = ['impact', 'crush', 'drop', 'roughHandling', 'moisture'].includes(tag);
    if (compatible && lot.storyLineId === 'QY03' && damageChoices(p).length) {
      const selected = options.storyProtectionChoice || p.eventSession?.node?.storyProtectionChoice;
      E(['protect', 'packingExperience'].includes(selected), 'STORY_PROTECTION_CHOICE_REQUIRED', '请先选择如何护住旧箱。');
      E(selected !== 'packingExperience' || p.stories.hasDunhuangPackingExperience, 'STORY_CHOICE');
      const rate = p.stories.hasDunhuangPackingExperience ? line.flags.qy03_repacked ? .95 : .85 : line.flags.qy03_repacked ? .75 : .60;
      const roll = S.random.next(p), protectedCargo = roll < rate; boxIncidentComplete(p, protectedCargo ? 'intact' : 'damaged', { rate, roll, choice: selected, incidentId: damageId });
      if (protectedCargo) { const r = { ...clone(lot), storyProtected: true, protectedQuantity: 1, damageQuantity: 0 }; delete r.storyDamageResults; lot.storyDamageResults[damageId] = clone(r); return r; }
    }
    if (compatible && lot.storyCargoKind === 'QY06_ORDER' && line.flags.protectionAvailable) { line.flags.protectionAvailable = false; line.flags.actuallyProtected = true; const r = { ...clone(lot), storyProtected: true, protectedQuantity: units(lot).length, damageQuantity: 0 }; delete r.storyDamageResults; lot.storyDamageResults[damageId] = clone(r); return r; }
    const eventKey = options.sessionId || p.eventSession?.id || damageId;
    if (lot.storyCargoKind === 'QY04_SAMPLES' && lot.storyPacking === 'safe' && lot.storyDamageEventUnits?.[eventKey]) { const r = { ...clone(lot), storyProtected: false, damageQuantity: 0, affectedUnits: [] }; delete r.storyDamageResults; lot.storyDamageResults[damageId] = clone(r); return r; }
    lot.storyUnits ||= units(lot); const eligible = lot.storyUnits.map((u, i) => ({ u, i })).filter(v => v.u.condition !== 'destroyed'); E(eligible.length, 'LOT_UNAVAILABLE');
    const chosen = options.storyUnitIndex === undefined ? eligible[Math.floor(S.random.next(p) * eligible.length)].i : options.storyUnitIndex; E(Number.isInteger(chosen) && lot.storyUnits[chosen], 'STORY_UNIT');
    const affected = lot.storyPacking === 'compressed' ? [0, 1] : lot.storyPacking === 'pairedFirstTwo' && chosen < 2 ? [0, 1] : [chosen];
    const condition = options.destroy && lot.storyMaxCondition !== 'damaged' ? 'destroyed' : 'damaged';
    for (const i of affected) lot.storyUnits[i].condition = condition;
    if (lot.storyCargoKind === 'QY04_SAMPLES') { lot.storyDamageEventUnits ||= {}; lot.storyDamageEventUnits[eventKey] = affected.length; }
    lot.condition = lot.storyUnits.every(u => u.condition === 'destroyed') ? 'destroyed' : lot.storyUnits.some(u => u.condition !== 'intact') ? 'damaged' : 'intact';
    lot.damageHistory = [...(lot.damageHistory || []), { tag, tick: p.world.tick, condition, incidentId: damageId, affectedUnits: affected }];
    const result = { ...clone(lot), damageQuantity: affected.length, affectedUnits: affected, storyProtected: false }; delete result.storyDamageResults; lot.storyDamageResults[damageId] = clone(result); return result;
  }
  function lose(p, id, options = {}) { const lot = p.inventory.lots.find(l => l.id === id); if (lot?.ownership !== 'storyOwned') return null; return damage(p, id, options.tag || 'loss', { ...options, destroy: true, incidentId: options.incidentId || options.eventId }); }
  function onDepart(p) {
    const line = progress(p, 'QY06'), route = p.world.route;
    if (line?.flags.expeditePending && route?.from === 'dunhuang' && route.to === 'khotan') { const before = route.remainingTicks; route.remainingTicks = Math.max(1, before - 1); line.flags.expeditePending = false; line.flags.expediteApplied = { routeId: route.id, before, after: route.remainingTicks, tick: p.world.tick }; }
  }
  function arrived(p) {
    const box = progress(p, 'QY03');
    if (p.world.city === 'khotan' && box?.completedChapters.includes('QY03_1') && !box.completedChapters.includes('QY03_2')) boxIncidentComplete(p, allUnits(p, 'QY03').some(u => u.condition !== 'intact') ? 'damaged' : box.flags.boxCompatibleEvent ? 'intact' : 'intact_no_incident');
    for (const line of Object.values(state(p).lines)) finalVisit(p, line);
  }
  function knownClues(p) { return Object.values(p.stories?.lines || {}).filter(l => l.status !== 'closed').flatMap(l => {
    const n = l.activeChapter?.chapter;
    let city = l.flags.knownDestination;
    if (n) city = ({ QY01: { 1: 'dunhuang', 2: 'khotan', 3: 'dunhuang' }, QY02: { 1: 'dunhuang', 4: l.activeChapter.phase === 'delivery' ? 'changan' : 'khotan' }, QY03: { 1: 'khotan' }, QY04: { 1: 'dunhuang' }, QY05: { 1: 'changan' } })[l.lineId]?.[n] || beginnings[l.lineId][n - 1] || l.flags.finalVisit?.city;
    return city ? [{ lineId: l.lineId, title: displayName(l.lineId), city }] : [];
  }); }
  function snapshot(p, ctx) { return data().map(d => { const line = progress(p, d.id), next = line ? line.completedChapters.length + 1 : 1, chapter = d.chapters[(line?.activeChapter?.chapter || next) - 1]; return { lineId: d.id, name: displayName(d.id), sourceName: d.name, triggerText: d.triggerText, status: line?.status || (trigger(p, d.id, ctx) ? 'available' : 'locked'), chapter: displayChapter(chapter), progress: line ? clone(line) : null, startChoices: startChoices(d.id, next), actionChoices: actionChoices(p, d.id), executionMissing: null, cargo: cargo(p, d.id).map(l => ({ id: l.id, label: l.storyLabel || l.goodId, quantity: units(l).length, slots: l.slotCost, states: units(l).map(u => u.condition) })) }; }); }
  function validate(p) {
    const st = p.stories; E(st && typeof st.lines === 'object' && Array.isArray(st.history), 'INVALID_STORIES');
    const cargoLines = new Set();
    for (const lot of p.inventory.lots.filter(l => l.ownership === 'storyOwned')) { E(lot.nonMarketable === true && progress(p, lot.storyLineId), 'INVALID_STORY_CARGO'); cargoLines.add(lot.storyLineId); if (lot.storyUnits) E(lot.quantity === 1 && lot.storyUnits.length > 0 && lot.storyUnits.every(u => ['intact', 'damaged', 'destroyed'].includes(u.condition)), 'INVALID_STORY_UNITS'); }
    E(cargoLines.size <= 1, 'STORY_CARGO_LIMIT');
    for (const [id, line] of Object.entries(st.lines)) {
      const d = definition(id); E(line.lineId === id && Array.isArray(line.completedChapters) && new Set(line.completedChapters).size === line.completedChapters.length && line.completedChapters.every((v, i) => v === d.chapters[i]?.id), 'INVALID_STORY_PROGRESS'); E(['active', 'waiting', 'closed'].includes(line.status) && line.flags && typeof line.flags === 'object', 'INVALID_STORY_STATUS');
      if (line.activeChapter) E(line.status === 'active' && line.activeChapter.chapter === line.completedChapters.length + 1 && line.activeChapter.chapterId === d.chapters[line.completedChapters.length]?.id && S.util.integer(line.activeChapter.begunTick), 'INVALID_STORY_CHAPTER');
      if (line.status === 'closed') E(line.completedChapters.length === d.chapters.length && line.completed === true && !cargo(p, id).length, 'INVALID_STORY_ENDING');
      if (line.flags.orderSize !== undefined) E([2, 4].includes(line.flags.orderSize), 'INVALID_STORY_ORDER');
      const a = line.activeChapter; if (a?.specialProbability !== undefined) E([.2, .5, .8].includes(a.specialProbability) && Number.isFinite(a.specialRoll) && a.specialRoll >= 0 && a.specialRoll < 1 && a.specialAvailable === (a.specialRoll < a.specialProbability), 'INVALID_STORY_ROLL');
    }
    return true;
  }
  function migrate(p) {
    const st = state(p); st.hasDunhuangPackingExperience = st.hasDunhuangPackingExperience === true;
    for (const lot of p.inventory.lots.filter(l => l.ownership === 'storyOwned')) {
      if (lot.storyUnits) continue;
      const id = lot.storyLineId, quantity = lot.sampleQuantity || lot.quantity, goodId = lot.sampleGoodId || (id === 'QY02' ? '于阗玉' : id === 'QY01' ? '纸张' : lot.goodId);
      lot.storyLabel ||= lot.goodId; lot.storyUnits = Array.from({ length: quantity }, () => ({ goodId, condition: lot.condition }));
      lot.slotCost *= lot.quantity; lot.quantity = 1; lot.goodId = goodId;
      if (id === 'QY02') lot.storyCargoKind ||= 'QY02_TRIAL';
      if (id === 'QY03') lot.storyMaxCondition = 'damaged';
      if (id === 'QY04') { lot.storyCargoKind ||= 'QY04_SAMPLES'; lot.storyMaxCondition = 'damaged'; lot.storyPacking ||= progress(p, id)?.flags.packing || 'safe'; }
    }
    return true;
  }
  S.stories = { initial, onTripStart, onDepart, arrived, trigger, begin, act, snapshot, actionChoices, startChoices, knownClues, largeOrderEligible, cargo, units, damage, lose, damageChoices, recordProtectionChoice, validate, migrate, gaps: {} };
  S.commands.register('story.begin', begin); S.commands.register('story.act', act); S.commands.register('story.ignore', () => ({ kind: 'storyIgnored', modal: false }));
})(globalThis.Silk = globalThis.Silk || {});
