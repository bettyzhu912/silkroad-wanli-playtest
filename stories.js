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
  // 商路奇缘 FINAL v1.0 (2026-09-13): every player-visible word comes from S.content.storyCopy (03_QY01-QY06_PLAYER_COPY); internal ids QY01–QY06 never change.
  const copy = () => (S.content && S.content.storyCopy) || {}, copyOf = id => copy()[id] || {}, chapterCopy = (id, n) => (copyOf(id).chapters || {})[String(n)] || {};
  function label(id, n, choiceId, fallback) { return (chapterCopy(id, n).choices || {})[choiceId] || fallback; }
  function resultText(id, n, key, fallback) { return (chapterCopy(id, n).results || {})[key] || fallback || '这段经历已记入商旅账册。'; }
  function displayName(id) { return copyOf(id).name || definition(id).name; }
  const lastGameplayChapter = id => definition(id).chapters.length - 1; // the fifth chapter is the finale: summary only, never a settlement
  function progress(p, id) { return p.stories?.lines[id] || null; }
  function cargo(p, id) { return p.inventory.lots.filter(l => l.ownership === 'storyOwned' && l.storyLineId === id); }
  function units(lot) { return lot.storyUnits || Array.from({ length: lot.sampleQuantity || lot.quantity }, () => ({ goodId: lot.sampleGoodId || lot.goodId, condition: lot.condition })); }
  function allUnits(p, id) { return cargo(p, id).flatMap(units); }
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
    if (id === 'QY01' && chapter === 1) return [{ id: 'normal', text: label(id, 1, 'normal', '照常包好'), cashCost: 0 }, { id: 'reinforce', text: label(id, 1, 'reinforce', '添钱加固'), cashCost: 3 }];
    if (id === 'QY03' && chapter === 1) return [{ id: 'carry', text: label(id, 1, 'carry', '直接带走'), cashCost: 0 }, { id: 'repack', text: label(id, 1, 'repack', '重新包裹'), cashCost: 2 }];
    if (id === 'QY04' && chapter === 1) return [{ id: 'safe', text: label(id, 1, 'safe', '分开包好'), cargoSlots: 2 }, { id: 'compressed', text: label(id, 1, 'compressed', '合并压装'), cargoSlots: 1 }];
    if (chapter === 1) return [{ id: 'continue', text: label(id, 1, 'continue', '继续这段奇缘'), cashCost: 0 }];
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
  // RC3 BUG-03: the initial QY01 纸样 / QY02 试料 is at worst "damaged" and always settles (intact or degraded reward).
  function sampleCondition(p, id) { const rows = allUnits(p, id); E(rows.length, 'STORY_CARGO_REQUIRED', '这批剧情货物尚未齐备。'); return rows.some(u => u.condition !== 'intact') ? 'damaged' : 'intact'; }
  function qy05Route(f) { return f.pricePreference === 'stable' ? 'stable' : f.QY05_EXAGGERATED === true ? 'highExaggerate' : 'highTruthful'; }
  function chapterIntro(id, chapter, line) {
    const cp = chapterCopy(id, chapter.chapter); let intro = cp.intro;
    if (intro && typeof intro === 'object') intro = intro[qy05Route(line?.flags || {})] || Object.values(intro)[0];
    return intro || chapter.title;
  }
  function displayChapter(chapter, line) { return chapter ? { chapterId: chapter.id, number: chapter.chapter, title: chapter.title, location: chapter.location, text: chapterIntro(chapter.lineId, chapter, line) } : null; }
  function openResult(id, chapter, extra = {}, line = null) { return { kind: 'storyChapterOpened', lineId: id, chapterId: chapter.id, title: displayName(id) + ' · ' + chapter.title, text: displayChapter(chapter, line).text, actualCash: 0, actualReputation: 0, elapsed: 0, ...extra }; }
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
    // FINAL v1.0: the fifth chapter is the finale (summary only) and is entered automatically by the last settlement; only a legacy save that still owes its old chapter-5 settlement may begin it.
    E(next <= lastGameplayChapter(d.id) || old?.flags.legacyFinalChapter === true, 'STORY_COMPLETE', '这条奇缘已经结束。');
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
    if (d.id === 'QY01' && next === 1) { additions.push(addCargo(p, d.id, next, '西行纸样', '纸张', 1, 1, { storyCargoKind: 'QY01_SAMPLE', storyMaxCondition: 'damaged' })); line.flags.qy01_reinforced = choice.id === 'reinforce'; line.flags.qy01_protectionCharges = choice.id === 'reinforce' ? 1 : 0; }
    if (d.id === 'QY02' && next === 1) additions.push(addCargo(p, d.id, next, '玉料试料', '于阗玉', 1, 1, { valuable: true, storyCargoKind: 'QY02_TRIAL', storyMaxCondition: 'damaged' }));
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
    // QY01 chapter 3: the 于阗丝织 reference purchase cost is locked when the chapter is generated and refunded on delivery (never re-read later).
    if (d.id === 'QY01' && next === 3) { active.referenceUnitPrice = S.market.quote(p, 'khotan', '于阗丝织'); active.referenceCost = active.referenceUnitPrice; }
    p.cash -= choice.cashCost || 0; line.activeChapter = active; line.status = 'active'; state(p).lines[d.id] = line; state(p).lastNewChapterTrip = budgetKey(p);
    if (!city) finalVisit(p, line);
    if (cargo(p, d.id).length) state(p).activeCargoChapter = chapter.id;
    if (choice.cashCost) { p.journal.push({ type: 'story', lineId: d.id, chapterId: chapter.id, tripId: p.trip?.id || null, amount: -choice.cashCost, tick: p.world.tick }); state(p).history.push({ kind: 'storyChapterOpened', lineId: d.id, chapterId: chapter.id, title: chapter.title, choiceId: choice.id, actualCash: -choice.cashCost, actualReputation: 0, lines: [{ label: choice.text, amount: -choice.cashCost }], tick: p.world.tick, tripId: p.trip?.id || null }); }
    return openResult(d.id, chapter, { cargoAdded: additions, actualCash: -(choice.cashCost || 0) }, line);
  }
  function largeOrderEligible(p) {
    if (!p.trip || S.inventory.capacity(p) - Number(p.inventory.provisions > 0) < 4) return false;
    const remainingBase = (p.world.route?.remainingTicks || 0) + [9, 12, 12, 9].slice(p.world.route ? p.trip.routeIndex + 1 : p.trip.routeIndex).reduce((a, n) => a + n, 0);
    return p.trip.deadlineTick - p.world.tick >= remainingBase + 3;
  }
  function actionChoices(p, id) {
    const line = progress(p, id); if (!line?.activeChapter) return [];
    const n = line.activeChapter.chapter, f = line.flags, ph = line.activeChapter.phase, L = (c, fb) => label(id, n, c, fb);
    if (id === 'QY01' && n === 2) return [{ id: 'truthful', text: L('truthful', '照实转述') }, { id: 'exaggerate', text: L('exaggerate', '夸大紧缺') }];
    if (id === 'QY01' && n === 3) return [{ id: 'continue', text: L('continue', '交付于阗丝织一匹') }];
    if (id === 'QY01' && n === 4) return f.qy01_exaggerated ? [{ id: 'admit', text: L('admit', '坦白说明') }, { id: 'insist', text: L('insist', '坚持说法') }] : [{ id: 'report', text: L('report', '照实回话') }];
    if (id === 'QY02' && n === 2) return [{ id: 'honest', text: L('honest', '照实说明') }, { id: 'conceal', text: L('conceal', '含糊带过') }];
    if (id === 'QY02' && n === 3) return [{ id: 'full', text: L('full', '带回完整评语') }, { id: 'favorable', text: L('favorable', '只带最高报价') }];
    if (id === 'QY02' && n === 4 && ph === 'offer') return [{ id: 'accept', text: L('accept', '接下代售') }, { id: 'defer', text: L('defer', '暂且不接') }];
    if (id === 'QY02' && n === 4 && ph === 'delivery') return [{ id: 'continue', text: L('deliver', '在长安交付') }];
    if (id === 'QY02' && n === 4) return [{ id: 'continue', text: L('continue', '归还试料') }];
    if (id === 'QY03' && n === 3) return [{ id: 'open', text: L('open', '当面开箱') }, { id: 'return', text: L('return', '原封送回敦煌') }];
    if (id === 'QY04' && n === 2) return [{ id: 'small', text: L('small', '接下小单') }, ...(largeOrderEligible(p) ? [{ id: 'large', text: L('large', '接下大单') }] : [])];
    if (id === 'QY04' && n === 3) return [{ id: 'sell', text: L('sell', '按今日价格卖出') }, { id: 'observe', text: L('observe', '只问行情，不卖样品') }];
    if (id === 'QY04' && n === 4) return [{ id: 'continue', text: ph === 'delivery' ? L('deliver', '在长安交付') : L('continue', '接下正式货') }];
    if (id === 'QY05' && n === 2) return ph === 'highDisclosure' ? [{ id: 'highTruthful', text: L('highTruthful', '说明只能少量成交') }, { id: 'highExaggerate', text: L('highExaggerate', '只报高价') }] : [{ id: 'stable', text: L('stable', '带回稳妥的长期价') }, { id: 'high', text: L('high', '带回更高的少量价') }];
    if (id === 'QY06' && n === 1) return Object.entries(directionGoods).flatMap(([branch, goods]) => goods.map(goodId => ({ id: branch + ':' + goodId, branch, goodId, text: L(branch, ({ steady: '稳妥货', value: '贵重货', urgent: '急用货' })[branch]) + ' · ' + goodId + ' × ' + quantities[branch] })));
    if (id === 'QY06' && n === 2 && !f.originalGoodId) return (directionGoods[f.branch] || []).map(goodId => ({ id: 'product:' + goodId, text: goodId }));
    if (id === 'QY06' && n === 2) return [{ id: 'prepare', text: L(f.branch + ':prepare', { steady: '重新配载', value: '支付3钱加固', urgent: '支付5钱赶程' }[f.branch]) }, { id: 'normal', text: L(f.branch + ':normal', { steady: '保持普通装载', value: '暂不加固', urgent: '照常行路' }[f.branch]) }];
    if (id === 'QY06' && n === 3) return [{ id: 'keep', text: L('keep', '坚持原货') }, { id: 'switch', text: L('switch', '改换货物') }];
    if (id === 'QY06' && n === 4) return [{ id: 'continue', text: ph === 'delivery' ? L('deliver', '在长安交付') : L('continue', '验货结算') }];
    return [{ id: 'continue', text: '照约办理' }];
  }
  function complete(p, line, choice, cash, rep, extra = {}) {
    const active = line.activeChapter, id = line.lineId, n = active.chapter, chapter = definition(id).chapters[n - 1], beforeRep = p.reputation.value;
    p.cash += cash; if (rep) S.reputation.change(p, rep, { type: 'story', lineId: id, chapterId: active.chapterId, tripId: p.trip?.id || null });
    line.completedChapters.push(active.chapterId); line.activeChapter = null; line.lastCompletedTrip = budgetKey(p); line.status = 'waiting';
    const result = { kind: 'storyChapterCompleted', lineId: id, chapterId: active.chapterId, title: chapter.title, text: '这段经历已记入商旅账册。', choiceId: choice.id, chosenText: choice.text, actualCash: cash, actualReputation: p.reputation.value - beforeRep, flags: clone(line.flags), tick: p.world.tick, tripId: p.trip?.id || null, elapsed: 0, ...clone(extra) };
    state(p).history.push(clone(result)); p.journal.push({ type: 'story', lineId: id, chapterId: active.chapterId, tripId: p.trip?.id || null, amount: cash, reputation: result.actualReputation, tick: p.world.tick });
    // FINAL v1.0: the last gameplay chapter's settlement closes the line; the finale chapter is recorded with nothing to pay and the immutable result snapshot is written now.
    if (line.completedChapters.length >= lastGameplayChapter(id)) { finalize(p, line); result.finale = true; result.finaleSubtitle = copyOf(id).subtitle || definition(id).chapters[definition(id).chapters.length - 1].title; }
    return result;
  }
  // A settlement stage inside a chapter that stays open (QY02 主路线 / QY04 于阗接单 / QY06 敦煌验货): paid once, keyed by chainId + chapterId + stageId; a repeat call is refused.
  function settleStage(p, line, stageId, cash, rep, extra = {}) {
    const active = line.activeChapter, id = line.lineId, chapter = definition(id).chapters[active.chapter - 1], beforeRep = p.reputation.value;
    active.stages ||= {}; E(!active.stages[stageId], 'STORY_STAGE_SETTLED', '这一段已经结清。');
    p.cash += cash; if (rep) S.reputation.change(p, rep, { type: 'story', lineId: id, chapterId: active.chapterId, stageId, tripId: p.trip?.id || null });
    const result = { kind: 'storyStageSettled', lineId: id, chapterId: active.chapterId, stageId, title: chapter.title, text: '这段经历已记入商旅账册。', actualCash: cash, actualReputation: p.reputation.value - beforeRep, tick: p.world.tick, tripId: p.trip?.id || null, elapsed: 0, ...clone(extra) };
    active.stages[stageId] = { cash, reputation: result.actualReputation, tick: p.world.tick, lines: clone(extra.lines || []) };
    state(p).history.push(clone(result)); p.journal.push({ type: 'story', lineId: id, chapterId: active.chapterId, stageId, tripId: p.trip?.id || null, amount: cash, reputation: result.actualReputation, tick: p.world.tick }); return result;
  }
  function finalize(p, line) {
    const id = line.lineId, d = definition(id), last = d.chapters[d.chapters.length - 1];
    if (!line.completedChapters.includes(last.id)) line.completedChapters.push(last.id);
    line.activeChapter = null; line.status = 'closed'; line.completed = true; line.completedWorldDay = S.time.day(p); line.completedTick = p.world.tick; delete line.flags.legacyFinalChapter;
    state(p).history.push({ kind: 'storyFinale', lineId: id, chapterId: last.id, title: last.title, actualCash: 0, actualReputation: 0, elapsed: 0, tick: p.world.tick, tripId: p.trip?.id || null });
    line.finalSnapshot = buildSnapshot(p, line);
  }
  const chapterLabel = (n, title) => ['一', '二', '三', '四', '五'][n - 1] + '｜' + title;
  function recapKey(id, n, line, entries) {
    const f = line.flags, choiceOf = () => entries.find(e => e.kind === 'storyChapterCompleted')?.choiceId;
    if (id === 'QY01') return n === 2 ? (f.qy01_exaggerated ? 'exaggerate' : 'truthful') : n === 4 ? choiceOf() : null;
    if (id === 'QY02') return n === 2 ? f.branch : n === 3 ? f.qy02_report : n === 4 ? f.ending : null;
    if (id === 'QY03') return n === 2 ? (f.boxIncident?.outcome || 'intact_no_incident') : n === 3 ? f.boxChoice : null;
    if (id === 'QY04') return n === 1 ? f.packing : n === 2 ? (f.orderSize === 4 ? 'large' : 'small') : n === 3 ? f.sampleDecision : n === 4 ? f.orderType : null;
    if (id === 'QY05') return n === 3 ? String(entries.find(e => e.quantity)?.quantity || '') : n === 2 || n === 4 ? qy05Route(f) : null;
    if (id === 'QY06') return n === 1 ? f.branch : n === 2 ? f.branch + ':' + (f.preparation ? 'prepare' : 'normal') : n === 3 ? (f.switched ? 'switch' : 'keep') : n === 4 ? (f.finalDamaged ? 'damaged' : 'intact') : null;
    return null;
  }
  function fill(text, line) { return String(text).replace('{good}', line.flags.orderGoodId || line.flags.originalGoodId || '').replace('{quantity}', String(quantities[line.flags.branch] || '')); }
  // Immutable result snapshot (05 §5): built from the saved chapter history and flags only — no roll, no recomputation of rewards.
  function buildSnapshot(p, line) {
    const id = line.lineId, d = definition(id), cp = copyOf(id), hist = state(p).history.filter(h => h.lineId === id);
    const chapters = d.chapters.map((ch, i) => {
      const n = i + 1, entries = hist.filter(h => h.chapterId === ch.id), cash = entries.reduce((s, e) => s + (e.actualCash || 0), 0), rep = entries.reduce((s, e) => s + (e.actualReputation || 0), 0);
      const r = (cp.recap || {})[String(n)], key = recapKey(id, n, line, entries); let text = typeof r === 'string' ? r : r ? r[key] || '' : '';
      if (id === 'QY06' && n === 4 && line.flags.actuallyProtected && r?.protected) text = (text ? text + ' ' : '') + r.protected;
      if (id === 'QY02' && n === 4 && line.flags.specialResult && (cp.recap || {}).special?.[line.flags.specialResult]) text = (text ? text + ' ' : '') + cp.recap.special[line.flags.specialResult];
      return { n, chapterId: ch.id, title: ch.title, label: chapterLabel(n, ch.title), cash, rep, text: text ? fill(text, line) : '' };
    });
    const cashRows = [], repRows = [], cargoRows = [];
    for (const e of hist) {
      const ch = d.chapters.find(c => c.id === e.chapterId), prefix = ch ? chapterLabel(ch.chapter, ch.title) + ' · ' : '';
      if (Array.isArray(e.lines) && e.lines.length) for (const l of e.lines) { if (l.amount) cashRows.push({ label: prefix + l.label, amount: l.amount }); }
      else if (e.actualCash) cashRows.push({ label: prefix + (e.actualCash > 0 ? '沿途所得' : '沿途支出'), amount: e.actualCash });
      if (e.actualReputation) repRows.push({ label: prefix + '商誉', delta: e.actualReputation });
      for (const lot of e.cargoAdded || []) cargoRows.push('取得 ' + (lot.storyLabel || lot.goodId) + ' × ' + (lot.storyUnits?.length || lot.quantity));
      for (const lot of e.consumedCargo || []) { const u = units(lot), damaged = u.filter(x => x.condition !== 'intact').length; cargoRows.push((id === 'QY02' && lot.storyCargoKind === 'QY02_TRIAL' ? '归还 ' : '交出 ') + (lot.storyLabel || lot.goodId) + ' × ' + u.length + (damaged ? '（' + damaged + '件受损）' : '（完好）')); }
    }
    if (line.flags.voucher) cargoRows.push('取得 旧货票' + (line.flags.voucherReturned ? ' · 已在敦煌交出' : ''));
    if (line.flags.boxChoice === 'return') cargoRows.push('旧木箱 原封送回敦煌');
    return { lineId: id, name: displayName(id), subtitle: cp.subtitle || d.chapters[d.chapters.length - 1].title, closeLabel: cp.closeLabel || '收起', chapters, cashRows, netCash: cashRows.reduce((n, r) => n + r.amount, 0), repRows, repTotal: repRows.reduce((n, r) => n + r.delta, 0), cargoRows, completedWorldDay: line.completedWorldDay ?? S.time.day(p), completedTick: line.completedTick ?? p.world.tick, notes: cp.notes || '' };
  }
  function ownedPlan(p, goodId, quantity) {
    let left = quantity; const rows = [];
    for (const lot of p.inventory.lots) if (lot.goodId === goodId && lot.ownership === 'playerOwned' && !lot.nonMarketable && lot.condition === 'intact' && left > 0) { const n = Math.min(left, lot.quantity); rows.push({ id: lot.id, quantity: n }); left -= n; }
    E(left === 0, 'STORY_GOODS_REQUIRED', '还需准备足量、完好的自有' + goodId + '。'); return rows;
  }
  function act(p, x) {
    const line = progress(p, x.lineId); E(line?.activeChapter && line.status === 'active', 'STORY_NOT_ACTIVE'); const active = line.activeChapter, n = active.chapter, id = line.lineId, f = line.flags;
    const choice = actionChoices(p, id).find(c => c.id === (x.choiceId || 'continue')); E(choice, 'STORY_CHOICE');
    const R = (key, fb) => resultText(id, n, key, fb), chapter = definition(id).chapters[n - 1];
    let cash = 0, rep = 0, consumed = [], extra = {};
    if (id === 'QY01') {
      if (n === 1) { location(p, 'dunhuang'); const sample = sampleCondition(p, id); cash = sample === 'intact' ? 8 : 4; rep = 1; extra.sampleCondition = sample; consumed = removeCargo(p, id); extra.text = R('delivered'); extra.lines = [{ label: '交付酬劳', amount: cash }]; }
      if (n === 2) { location(p, 'khotan'); f.qy01_exaggerated = choice.id === 'exaggerate'; if (f.qy01_exaggerated) { cash = 4; extra.lines = [{ label: '额外酬劳', amount: 4 }]; } else rep = 1; extra.text = R(choice.id); }
      if (n === 3) {
        location(p, 'dunhuang'); const plan = ownedPlan(p, '于阗丝织', 1); consumed = plan.map(l => S.inventory.take(p, l.id, l.quantity));
        // FINAL v1.0: locked reference purchase cost refunded + 10 钱 酬劳 + 1 商誉 (replaces the old flat +10).
        if (!S.util.integer(active.referenceCost)) { active.referenceUnitPrice = S.market.quote(p, 'khotan', '于阗丝织'); active.referenceCost = active.referenceUnitPrice; }
        cash = active.referenceCost + 10; rep = 1; extra.referenceCost = active.referenceCost; extra.storyReward = 10; extra.lines = [{ label: '材料款返还', amount: active.referenceCost }, { label: '制帙酬劳', amount: 10 }]; extra.text = R('delivered');
      }
      if (n === 4) { location(p, 'dunhuang'); E(p.trip?.routeIndex === 3, 'STORY_RETURN_VISIT_REQUIRED'); if (choice.id === 'admit') { cash = 4; f.qy01_admitted = true; } else if (choice.id === 'insist') cash = 8; else { cash = 8; rep = 2; } f.ending = f.qy01_exaggerated ? 'exaggerated' : 'truthful'; extra.lines = [{ label: '回话酬劳', amount: cash }]; extra.text = R(choice.id); }
      if (n === 5) { E(f.legacyFinalChapter === true, 'STORY_COMPLETE'); location(p, 'changan'); extra.text = '这段经历已记入商旅账册。'; }
    } else if (id === 'QY02') {
      if (n <= 3) { location(p, n === 3 ? 'changan' : 'dunhuang'); extra.sampleCondition = sampleCondition(p, id); }
      if (n === 1) { cash = extra.sampleCondition === 'intact' ? 6 : 3; rep = 1; extra.lines = [{ label: '价帖酬劳', amount: cash }]; extra.text = R(extra.sampleCondition); }
      if (n === 2) { f.branch = choice.id; if (choice.id === 'conceal') { cash = 6; extra.lines = [{ label: '牙人另付', amount: 6 }]; } extra.text = R(choice.id); }
      if (n === 3) { f.qy02_report = choice.id; if (choice.id === 'full') rep = 2; else { cash = 8; extra.lines = [{ label: '只报高价所得', amount: 8 }]; } extra.text = R(choice.id); }
      if (n === 4 && f.legacyFinalChapter !== true) {
        if (active.phase === 'delivery') {
          // special cargo delivery in 长安: settled once, then the chapter closes and the finale opens
          location(p, 'changan'); const u = requireCargo(p, id, 1)[0]; cash = u.condition === 'intact' ? 16 : u.condition === 'damaged' ? 8 : 0; rep = u.condition === 'destroyed' ? 0 : 2; extra.cargoCondition = u.condition; f.specialResult = u.condition; consumed = removeCargo(p, id);
          extra.lines = [{ label: '代售交付', amount: cash }]; extra.text = R(u.condition === 'intact' ? 'deliveredIntact' : u.condition === 'damaged' ? 'deliveredDamaged' : 'deliveredDestroyed');
        } else if (active.phase === 'offer') {
          location(p, 'khotan');
          if (choice.id === 'defer') { active.deferredTick = p.world.tick; return { kind: 'storyDeferred', lineId: id, chapterId: active.chapterId, modal: false }; }
          cargoCheck(p, id, 1); const lot = addCargo(p, id, n, '贵重重托', '于阗玉', 1, 1, { valuable: true, storyCargoKind: 'QY02_SPECIAL_CARGO' }); active.phase = 'delivery'; active.acceptedTick = p.world.tick; f.knownDestination = 'changan';
          state(p).history.push({ kind: 'storyChapterOpened', lineId: id, chapterId: active.chapterId, title: chapter.title, choiceId: 'accept', actualCash: 0, actualReputation: 0, cargoAdded: [clone(lot)], tick: p.world.tick, tripId: p.trip?.id || null });
          return openResult(id, chapter, { text: R('accepted'), cargoAdded: [lot] }, line);
        } else {
          // 归还试料: the trial sample leaves the inventory here (kept through 敦煌 and 长安); the main route settles at once
          location(p, 'khotan'); requireCargo(p, id, 1); consumed = removeCargo(p, id);
          const honest = f.branch === 'honest' && f.qy02_report === 'full'; f.ending = honest ? 'honest' : 'profit'; const mainCash = honest ? 18 : 28, mainRep = honest ? 4 : 2;
          const lines = [{ label: '主路线结清', amount: mainCash }], text = R(f.ending);
          if (active.specialAvailable) { const stage = settleStage(p, line, 'main_route', mainCash, mainRep, { lines, text: text + '\n\n' + R('offer'), consumedCargo: consumed, offer: true }); active.phase = 'offer'; return stage; }
          cash = mainCash; rep = mainRep; extra.lines = lines; extra.text = text; extra.consumedCargo = consumed;
        }
      }
      if (n === 4 && f.legacyFinalChapter === true) {
        // legacy save (chapter 4 settled under the old rules): the old branch stays as it was, chapter 5 pays the still-owed main route
        if (active.phase === 'delivery') { location(p, 'changan'); const u = requireCargo(p, id, 1)[0]; cash = u.condition === 'intact' ? 16 : u.condition === 'damaged' ? 8 : 0; rep = u.condition === 'destroyed' ? 0 : 2; extra.cargoCondition = u.condition; f.specialResult = u.condition; consumed = removeCargo(p, id); extra.lines = [{ label: '代售交付', amount: cash }]; }
        else { location(p, 'khotan'); const old = cargo(p, id); cargoCheck(p, id, active.specialAvailable ? 1 : 0, old); if (active.specialAvailable) { consumed = removeCargo(p, id); const lot = addCargo(p, id, n, '贵重重托', '于阗玉', 1, 1, { valuable: true, storyCargoKind: 'QY02_SPECIAL_CARGO' }); active.phase = 'delivery'; active.acceptedTick = p.world.tick; return openResult(id, chapter, { text: R('accepted'), cargoAdded: [lot], consumedCargo: consumed }, line); } consumed = removeCargo(p, id); }
      }
      if (n === 5) { E(f.legacyFinalChapter === true, 'STORY_COMPLETE'); E(['changan', 'dunhuang'].includes(p.world.city) && !p.world.route, 'STORY_WRONG_CITY'); if (f.finalVisit) location(p, f.finalVisit.city); const honest = f.branch === 'honest' && f.qy02_report === 'full'; cash = honest ? 18 : 28; rep = honest ? 4 : 2; f.ending = honest ? 'honest' : 'profit'; extra.lines = [{ label: '主路线结清', amount: cash }]; extra.text = resultText(id, 4, f.ending); }
    } else if (id === 'QY03') {
      if (n === 1) { location(p, 'dunhuang'); requireCargo(p, id, 1); extra.text = R('accepted'); }
      if (n === 3) {
        location(p, 'khotan'); const u = requireCargo(p, id, 1)[0]; f.boxChoice = choice.id; f.boxCondition = u.condition; extra.text = R(choice.id);
        // three real outcomes: opened (intact or damaged) → the box stays in 于阗 and the player carries the 旧货票 voucher back; returned unopened → no voucher, the whole box travels on
        if (choice.id === 'open') { consumed = removeCargo(p, id); f.voucher = { obtained: true, boxCondition: u.condition, tick: p.world.tick }; extra.voucher = clone(f.voucher); } else f.knownDestination = 'dunhuang';
      }
      if (n === 4) { location(p, 'dunhuang'); if (f.boxChoice === 'return') consumed = removeCargo(p, id); else if (f.voucher) f.voucherReturned = true; const intact = f.boxChoice === 'return' || f.boxCondition === 'intact'; cash = intact ? 15 : 10; rep = intact ? 3 : 1; f.ending = f.boxChoice; extra.lines = [{ label: '旧账结清', amount: cash }]; extra.text = R('settled'); }
    } else if (id === 'QY04') {
      if (n === 1) { location(p, 'dunhuang'); requireCargo(p, id, 2); cash = 10; rep = 1; f.knownDestination = 'changan'; extra.lines = [{ label: '试样酬劳', amount: 10 }]; extra.text = R('delivered'); }
      if (n === 2) { location(p, 'dunhuang'); f.orderSize = choice.id === 'small' ? 2 : 4; extra.text = R(choice.id); }
      if (n === 3) {
        location(p, 'changan'); const rows = requireCargo(p, id, 2), price = S.market.quote(p, 'changan', '于阗丝织'); f.sampleDecision = choice.id; f.sampleQuote = { price, day: S.time.day(p), states: rows.map(u => u.condition) };
        if (choice.id === 'sell') { cash = rows.reduce((n, u) => n + (u.condition === 'intact' ? price : Math.ceil(price * .7)), 0); f.sampleQuote.total = cash; consumed = removeCargo(p, id); extra.lines = [{ label: '样品售出', amount: cash }]; extra.text = R('sold'); }
        else { const key = price >= 50 ? 'high' : price >= 43 ? 'steady' : 'low', obsId = { high: 'QY04-OBS-01', steady: 'QY04-OBS-02', low: 'QY04-OBS-03' }[key], text = R(key); p.messages.observations.push({ id: S.util.id(p, 'observation'), source: 'story', sourceId: obsId, lineId: id, city: 'changan', tick: p.world.tick, text }); extra.observationId = obsId; extra.text = text; f.observationKey = key; }
        extra.lockedQuote = clone(f.sampleQuote);
      }
      if (n === 4 && f.legacyFinalChapter !== true && active.phase === 'delivery') {
        location(p, 'changan'); const rows = requireCargo(p, id, f.orderSize), damaged = rows.filter(u => u.condition === 'damaged').length;
        E(rows.every(u => u.condition !== 'destroyed'), 'STORY_CARGO_CONDITION'); const reward = damaged ? f.orderSize === 2 ? [0, 18, 14][damaged] : [0, 20, 18, 16, 14][damaged] : f.orderSize === 2 ? 22 : 32;
        cash = (f.procurementPrincipal || 0) + reward; rep = damaged ? 2 : 4; extra.storyReward = reward; extra.returnedPrincipal = f.procurementPrincipal || 0; extra.damagedUnits = damaged; consumed = removeCargo(p, id); f.ending = f.orderType; f.finalDamaged = damaged;
        extra.lines = [...(f.procurementPrincipal ? [{ label: '采买本金返还', amount: f.procurementPrincipal }] : []), { label: '订单酬劳', amount: reward }]; extra.text = R('delivered');
      } else if (n === 4) {
        location(p, 'khotan'); const quantity = f.orderSize, old = cargo(p, id), purchasing = f.sampleDecision === 'sell'; E([2, 4].includes(quantity), 'STORY_ORDER_SIZE');
        const price = purchasing ? S.market.quote(p, 'khotan', '于阗丝织') : 0, cost = price * quantity; E(p.cash >= cost, 'INSUFFICIENT_CASH', '现钱不足，整批订单暂未接受。'); cargoCheck(p, id, quantity, old);
        consumed = removeCargo(p, id); const lot = addCargo(p, id, n, '织坊正式订单', '于阗丝织', quantity, quantity, { storyCargoKind: 'QY04_ORDER', storyMaxCondition: 'damaged', storyPacking: 'individual' });
        f.procurementPrincipal = cost; f.orderType = purchasing ? 'procurement' : 'supplied'; f.orderPrice = { price, day: S.time.day(p) }; f.knownDestination = 'changan';
        if (f.legacyFinalChapter === true) { cash = -cost; extra.cargoAdded = [lot]; extra.consumedCargo = consumed; extra.lines = cost ? [{ label: '采买本金支出', amount: -cost }] : []; extra.text = R(f.orderType); }
        else { const stage = settleStage(p, line, 'khotan_order', -cost, 0, { lines: cost ? [{ label: '采买本金支出', amount: -cost }] : [], text: R(f.orderType), cargoAdded: [clone(lot)], consumedCargo: consumed }); active.phase = 'delivery'; return stage; }
      }
      if (n === 5) { E(f.legacyFinalChapter === true, 'STORY_COMPLETE'); location(p, 'changan'); const rows = requireCargo(p, id, f.orderSize), damaged = rows.filter(u => u.condition === 'damaged').length;
        E(rows.every(u => u.condition !== 'destroyed'), 'STORY_CARGO_CONDITION'); const reward = damaged ? f.orderSize === 2 ? [0, 18, 14][damaged] : [0, 20, 18, 16, 14][damaged] : f.orderSize === 2 ? 22 : 32;
        cash = (f.procurementPrincipal || 0) + reward; rep = damaged ? 2 : 4; extra.storyReward = reward; extra.returnedPrincipal = f.procurementPrincipal || 0; consumed = removeCargo(p, id); f.ending = f.orderType; f.finalDamaged = damaged; extra.lines = [...(f.procurementPrincipal ? [{ label: '采买本金返还', amount: f.procurementPrincipal }] : []), { label: '订单酬劳', amount: reward }]; extra.text = resultText(id, 4, 'delivered');
      }
    } else if (id === 'QY05') {
      if (n === 1) { location(p, 'changan'); E(p.market.visit && p.market.visit.city === 'changan' && p.market.visit.enteredTick >= active.begunTick, 'STORY_MARKET_VISIT_REQUIRED', '请先查看长安市场，再回报所见。'); extra.text = R('reported'); }
      if (n === 2) {
        location(p, 'changan'); if (choice.id === 'high') { active.phase = 'highDisclosure'; return openResult(id, chapter, { text: '这份高价只收少量药材。你准备怎样向药商说明？' }, line); }
        f.pricePreference = choice.id === 'stable' ? 'stable' : 'high'; f.QY05_PRICE_MODE = f.pricePreference.toUpperCase(); f.QY05_EXAGGERATED = choice.id === 'highExaggerate'; cash = 4; extra.lines = [{ label: '询价酬劳', amount: 4 }]; extra.text = R(choice.id);
      }
      if (n === 3) { location(p, 'dunhuang'); const plan = ownedPlan(p, '药材', active.quantity); consumed = plan.map(l => S.inventory.take(p, l.id, l.quantity)); cash = active.referenceCost + active.storyReward; rep = 2; const base = 10 + 2 * (active.quantity - 1), bonus = active.storyReward - base; extra.referenceCost = active.referenceCost; extra.referenceUnitPrice = active.referenceUnitPrice; extra.storyReward = active.storyReward; extra.quantity = active.quantity; extra.lines = [{ label: '药材款', amount: active.referenceCost }, { label: '跑商酬劳', amount: base }, ...(bonus > 0 ? [{ label: '临时添酬', amount: bonus }] : [])]; extra.text = R('delivered'); }
      if (n === 4) { E(['changan', 'dunhuang'].includes(p.world.city) && !p.world.route, 'STORY_WRONG_CITY'); if (f.finalVisit) location(p, f.finalVisit.city); const route = qy05Route(f); cash = route === 'stable' ? 14 : route === 'highExaggerate' ? 10 : 18; rep = route === 'stable' ? 3 : route === 'highExaggerate' ? 1 : 2; f.ending = route === 'stable' ? 'stable' : route === 'highExaggerate' ? 'exaggerated' : 'highTruthful'; extra.lines = [{ label: '货目改写结清', amount: cash }]; extra.text = R(route); }
    } else if (id === 'QY06') {
      if (n === 1) { location(p, 'changan'); [f.branch, f.originalGoodId] = choice.id.split(':'); extra.text = R('chosen'); }
      if (n === 2) { location(p, 'dunhuang'); E(p.trip?.routeIndex === 1, 'STORY_OUTBOUND_REQUIRED'); if (choice.id.startsWith('product:')) { f.originalGoodId = choice.id.slice(8); active.phase = 'active'; return openResult(id, chapter, { text: '已选定' + f.originalGoodId + '。现在可以安排本段准备。' }, line); } const prepared = choice.id === 'prepare', cost = prepared ? ({ steady: 0, value: 3, urgent: 5 })[f.branch] : 0; E(p.cash >= cost, 'INSUFFICIENT_CASH'); cash = -cost; f.preparation = prepared; f.preparationKind = prepared ? f.branch : null; if (prepared && f.branch === 'urgent') f.expeditePending = true; if (cost) extra.lines = [{ label: f.branch === 'value' ? '加固支出' : '赶程支出', amount: -cost }]; extra.text = R(prepared ? 'prepared' : 'normal'); }
      if (n === 3) { location(p, 'khotan'); const quantity = quantities[f.branch], slots = f.branch === 'steady' && f.preparation ? 3 : quantity; cargoCheck(p, id, slots); const goodId = choice.id === 'keep' ? f.originalGoodId : directionGoods[f.branch].find(g => g !== f.originalGoodId);
        const lot = addCargo(p, id, n, '三路归一正式订单', goodId, quantity, slots, { storyCargoKind: 'QY06_ORDER', storyMaxCondition: 'damaged', storyPacking: f.branch === 'steady' && f.preparation ? 'pairedFirstTwo' : 'individual' }); f.switched = choice.id === 'switch'; f.orderGoodId = goodId; f.orderQuantity = quantity; f.orderLotId = lot.id; f.knownDestination = 'changan'; if (f.branch === 'value' && f.preparation) f.protectionAvailable = true; extra.cargoAdded = [lot]; extra.text = R(choice.id); }
      if (n === 4 && f.legacyFinalChapter !== true && active.phase === 'delivery') {
        location(p, 'changan'); const rows = requireCargo(p, id, f.orderQuantity), damaged = rows.filter(u => u.condition === 'damaged').length, base = (f.switched ? 30 : 40) + (f.preparation ? 5 : 0), deduction = damaged * ({ steady: 4, value: 8, urgent: 5 })[f.branch];
        cash = Math.max(20, base - deduction); rep = 5; consumed = removeCargo(p, id); f.ending = (f.switched ? 'switched' : 'kept') + (f.preparation ? '_prepared' : '_ordinary'); f.finalDamaged = damaged;
        extra.lines = [{ label: '路线基础酬劳', amount: base }, ...(deduction ? [{ label: '货损扣减', amount: -deduction }] : []), ...(base - deduction < 20 ? [{ label: '最低到账补足', amount: 20 - (base - deduction) }] : [])]; extra.text = R('delivered');
      } else if (n === 4) {
        location(p, 'dunhuang'); E(p.trip?.routeIndex === 3, 'STORY_RETURN_VISIT_REQUIRED'); const rows = requireCargo(p, id, f.orderQuantity), base = f.switched ? 8 : 12, bonus = f.actuallyProtected ? 3 : 0, cut = rows.some(u => u.condition === 'damaged') ? 2 : 0, stageCash = Math.max(8, Math.min(15, base + bonus - cut));
        const lines = [{ label: f.switched ? '换货基础酬劳' : '坚持原货基础酬劳', amount: base }, ...(bonus ? [{ label: '途中实际护货加酬', amount: bonus }] : []), ...(cut ? [{ label: '受损扣减', amount: -cut }] : [])];
        if (f.legacyFinalChapter === true) { cash = stageCash; extra.lines = lines; extra.text = R('inspected'); }
        else { const stage = settleStage(p, line, 'dunhuang_stage', stageCash, 0, { lines, text: R('inspected') }); active.phase = 'delivery'; return stage; }
      }
      if (n === 5) { E(f.legacyFinalChapter === true, 'STORY_COMPLETE'); location(p, 'changan'); const rows = requireCargo(p, id, f.orderQuantity), damaged = rows.filter(u => u.condition === 'damaged').length, base = (f.switched ? 30 : 40) + (f.preparation ? 5 : 0), deduction = damaged * ({ steady: 4, value: 8, urgent: 5 })[f.branch]; cash = Math.max(20, base - deduction); rep = 5; consumed = removeCargo(p, id); f.ending = (f.switched ? 'switched' : 'kept') + (f.preparation ? '_prepared' : '_ordinary'); f.finalDamaged = damaged; extra.lines = [{ label: '路线基础酬劳', amount: base }, ...(deduction ? [{ label: '货损扣减', amount: -deduction }] : [])]; extra.text = resultText(id, 4, 'delivered'); }
    }
    return complete(p, line, choice, cash, rep, { consumedCargo: consumed, ...extra });
  }
  function boxIncidentComplete(p, outcome, details = {}) {
    const line = progress(p, 'QY03'); if (!line || line.completedChapters.includes('QY03_2')) return;
    E(line.completedChapters.includes('QY03_1'), 'STORY_BOX_NOT_ACCEPTED');
    line.flags.boxIncident = { outcome, tick: p.world.tick, trip: budgetKey(p), ...clone(details) }; line.completedChapters.push('QY03_2');
    state(p).history.push({ kind: 'storyAttachedChapter', lineId: 'QY03', chapterId: 'QY03_2', title: definition('QY03').chapters[1].title, text: resultText('QY03', 2, outcome, displayChapter(definition('QY03').chapters[1], line).text), actualCash: 0, actualReputation: 0, elapsed: 0, outcome, ...clone(details) });
  }
  function damageChoices(p) {
    const line = progress(p, 'QY03');
    if (!line || !line.completedChapters.includes('QY03_1') || line.completedChapters.includes('QY03_2') || p.world.route?.from !== 'dunhuang' || p.world.route?.to !== 'khotan' || !cargo(p, 'QY03').length) return [];
    return [{ id: 'protect', text: label('QY03', 2, 'protect', '先护住旧箱'), lineId: 'QY03', chapterId: 'QY03_2', chapterText: displayChapter(definition('QY03').chapters[1], line).text }, ...(p.stories.hasDunhuangPackingExperience ? [{ id: 'packingExperience', text: label('QY03', 2, 'packingExperience', '照货栈教过的办法收紧'), lineId: 'QY03', chapterId: 'QY03_2' }] : [])];
  }
  function recordProtectionChoice(p, choiceId, eventSessionId) {
    const line = progress(p, 'QY03'); E(line && damageChoices(p).some(c => c.id === choiceId), 'STORY_CHOICE');
    line.flags.boxCompatibleEvent = { eventSessionId, choiceId, tick: p.world.tick, chapterTextShown: true };
  }
  function damage(p, id, tag, options = {}) {
    const lot = p.inventory.lots.find(l => l.id === id); if (lot?.ownership !== 'storyOwned' || !lot.storyLineId) return null;
    const line = progress(p, lot.storyLineId); E(line, 'STORY_STATE_REQUIRED');
    const damageId = options.incidentId || p.eventSession?.id || 'damage:' + tag + ':' + p.world.tick;
    lot.storyDamageResults ||= {}; if (lot.storyDamageResults[damageId]) return clone(lot.storyDamageResults[damageId]);
    const compatible = ['impact', 'crush', 'drop', 'roughHandling', 'moisture'].includes(tag);
    // RC3 BUG-03: 加固包扎 grants exactly one 100% protection against the first compatible damage or loss hit; nothing transfers.
    if (lot.storyCargoKind === 'QY01_SAMPLE' && (compatible || tag === 'loss') && (line.flags.qy01_protectionCharges || 0) > 0) {
      line.flags.qy01_protectionCharges -= 1; line.flags.qy01_protectionUsed = { tag, tick: p.world.tick, incidentId: damageId };
      const r = { ...clone(lot), storyProtected: true, protectedQuantity: 1, damageQuantity: 0 }; delete r.storyDamageResults; lot.storyDamageResults[damageId] = clone(r); return r;
    }
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
  // Where the player has to be next: the active chapter's action city (chapter-4 phases included) or the next chapter's beginning.
  function nextCityFor(p, line) {
    const id = line.lineId, f = line.flags, a = line.activeChapter;
    if (a) { const ph = a.phase, n = a.chapter; const map = { QY01: { 1: 'dunhuang', 2: 'khotan', 3: 'dunhuang', 4: 'dunhuang', 5: 'changan' }, QY02: { 1: 'dunhuang', 2: 'dunhuang', 3: 'changan', 4: ph === 'delivery' ? 'changan' : 'khotan', 5: f.finalVisit?.city || null }, QY03: { 1: 'dunhuang', 3: 'khotan', 4: 'dunhuang' }, QY04: { 1: 'dunhuang', 2: 'dunhuang', 3: 'changan', 4: ph === 'delivery' ? 'changan' : 'khotan', 5: 'changan' }, QY05: { 1: 'changan', 2: 'changan', 3: 'dunhuang', 4: f.finalVisit?.city || null }, QY06: { 1: 'changan', 2: 'dunhuang', 3: 'khotan', 4: ph === 'delivery' ? 'changan' : 'dunhuang', 5: 'changan' } }; return map[id]?.[n] ?? null; }
    if (line.status === 'closed') return null;
    const next = line.completedChapters.length + 1; return beginnings[id][next - 1] || f.finalVisit?.city || f.knownDestination || null;
  }
  function knownClues(p) { return Object.values(p.stories?.lines || {}).filter(l => l.status !== 'closed').flatMap(l => { const city = nextCityFor(p, l); return city ? [{ lineId: l.lineId, title: displayName(l.lineId), city }] : []; }); }
  function neededGoods(p, line) {
    const a = line.activeChapter; if (!a) return null; let need = null;
    if (line.lineId === 'QY01' && a.chapter === 3) need = { goodId: '于阗丝织', quantity: 1 };
    if (line.lineId === 'QY05' && a.chapter === 3) need = { goodId: '药材', quantity: a.quantity };
    if (!need) return null;
    need.held = p.inventory.lots.filter(l => l.goodId === need.goodId && l.ownership === 'playerOwned' && !l.nonMarketable && l.condition === 'intact').reduce((n, l) => n + l.quantity, 0); return need;
  }
  function finaleOf(p, line) {
    if (!line || line.status !== 'closed') return null;
    const snap = line.finalSnapshot || buildSnapshot(p, line), cp = copy();
    return { eyebrow: cp.finaleEyebrow || '商路奇缘·终章', name: snap.name, subtitle: snap.subtitle, closeLabel: snap.closeLabel, backLabel: cp.backLabel || '返回终章', entries: cp.entries || { recap: '一路所记', gains: '此缘所得', notes: '卷外余话' },
      recap: snap.chapters.map(ch => ({ n: ch.n, label: ch.label, text: ch.text })), gains: { cashRows: clone(snap.cashRows), netCash: snap.netCash, repRows: clone(snap.repRows), repTotal: snap.repTotal, cargoRows: clone(snap.cargoRows), footer: cp.gainsFooter || '此缘所得均已在沿途结清。' }, notes: snap.notes, completedWorldDay: snap.completedWorldDay };
  }
  // Read model for the six permanent cards (04 §2): every line is listed from the definition table and merged with the saved state.
  function snapshot(p, ctx) { return data().map(d => {
    const line = progress(p, d.id), next = line ? line.completedChapters.length + 1 : 1, chapter = d.chapters[Math.min((line?.activeChapter?.chapter || next), d.chapters.length) - 1];
    const status = line?.status || (trigger(p, d.id, ctx) ? 'available' : 'locked'), need = line ? neededGoods(p, line) : null, nextCity = line ? nextCityFor(p, line) : null;
    const displayStatus = status === 'closed' ? 'completed' : status === 'waiting' ? 'waitingLocation' : status === 'active' && need && need.held < need.quantity ? 'waitingGoods' : status;
    return { lineId: d.id, name: displayName(d.id), sourceName: d.name, subtitle: copyOf(d.id).subtitle || d.chapters[d.chapters.length - 1].title, closeLabel: copyOf(d.id).closeLabel || '收起', triggerText: d.triggerText, status, displayStatus, nextCity, neededGoods: need,
      chapter: displayChapter(chapter, line), progress: line ? clone(line) : null, startChoices: startChoices(d.id, next), actionChoices: actionChoices(p, d.id), executionMissing: null,
      cargo: cargo(p, d.id).map(l => ({ id: l.id, label: l.storyLabel || l.goodId, quantity: units(l).length, slots: l.slotCost, states: units(l).map(u => u.condition) })),
      vouchers: line?.flags.voucher && !line.flags.voucherReturned ? [{ label: '旧货票', text: '带回敦煌' }] : [],
      offer: line?.activeChapter?.phase === 'offer' ? resultText(d.id, 4, 'offer') : null, finale: finaleOf(p, line) }; }); }
  function validate(p) {
    const st = p.stories; E(st && typeof st.lines === 'object' && Array.isArray(st.history), 'INVALID_STORIES');
    const cargoLines = new Set();
    for (const lot of p.inventory.lots.filter(l => l.ownership === 'storyOwned')) { E(lot.nonMarketable === true && progress(p, lot.storyLineId), 'INVALID_STORY_CARGO'); cargoLines.add(lot.storyLineId); if (lot.storyUnits) E(lot.quantity === 1 && lot.storyUnits.length > 0 && lot.storyUnits.every(u => ['intact', 'damaged', 'destroyed'].includes(u.condition)), 'INVALID_STORY_UNITS'); }
    E(cargoLines.size <= 1, 'STORY_CARGO_LIMIT');
    for (const [id, line] of Object.entries(st.lines)) {
      const d = definition(id); E(line.lineId === id && Array.isArray(line.completedChapters) && new Set(line.completedChapters).size === line.completedChapters.length && line.completedChapters.every((v, i) => v === d.chapters[i]?.id), 'INVALID_STORY_PROGRESS'); E(['active', 'waiting', 'closed'].includes(line.status) && line.flags && typeof line.flags === 'object', 'INVALID_STORY_STATUS');
      if (line.activeChapter) E(line.status === 'active' && line.activeChapter.chapter === line.completedChapters.length + 1 && line.activeChapter.chapterId === d.chapters[line.completedChapters.length]?.id && S.util.integer(line.activeChapter.begunTick), 'INVALID_STORY_CHAPTER');
      if (line.status === 'closed') E(line.completedChapters.length >= lastGameplayChapter(id) && line.completed === true && !cargo(p, id).length, 'INVALID_STORY_ENDING');
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
    // RC3 BUG-03 legacy repair: destroyed / missing initial samples become the single "damaged" logical sample the chapter waits for.
    for (const [id, kind, label, goodId] of [['QY01', 'QY01_SAMPLE', '西行纸样', '纸张'], ['QY02', 'QY02_TRIAL', '玉料试料', '于阗玉']]) {
      const line = progress(p, id); if (!line) continue;
      if (id === 'QY01' && line.flags.qy01_protectionCharges === undefined) line.flags.qy01_protectionCharges = line.flags.qy01_reinforced ? 1 : 0;
      // FINAL v1.0: once the trial has been returned in 于阗 (chapter 4 main route settled, offer / delivery phase) no sample is expected any more.
      const a = line.activeChapter, expected = id === 'QY01' ? a?.chapter === 1 : line.completedChapters.length < 4 && (a ? a.chapter <= 4 && !['delivery', 'offer'].includes(a.phase) && !a.stages?.main_route : line.completedChapters.length >= 1);
      const lots = cargo(p, id).filter(l => l.storyCargoKind === kind || (id === 'QY01' && !l.storyCargoKind) || (id === 'QY02' && !l.storyCargoKind));
      for (const lot of lots) {
        lot.storyCargoKind ||= kind; lot.storyMaxCondition = 'damaged';
        if (lot.storyUnits.some(u => u.condition === 'destroyed') || lot.condition === 'destroyed') { for (const u of lot.storyUnits) if (u.condition === 'destroyed') u.condition = 'damaged'; lot.condition = 'damaged'; lot.restoredByRc3 = true; }
      }
      if (expected && !lots.length) {
        const blocked = p.inventory.lots.some(l => l.ownership === 'storyOwned' && l.storyLineId !== id) || S.inventory.available(p) < 1;
        if (blocked) line.flags.sampleRestorePending = true;
        else { S.inventory.add(p, { goodId, storyLabel: label, quantity: 1, acquisitionPrice: 0, slotCost: 1, fragile: false, ownership: 'storyOwned', nonMarketable: true, condition: 'damaged', storyLineId: id, storyChapterId: id + '_1', storyCargoKind: kind, storyMaxCondition: 'damaged', restoredByRc3: true, storyUnits: [{ goodId, condition: 'damaged' }], ...(id === 'QY02' ? { valuable: true } : {}) }); line.flags.sampleRestorePending = false; }
      }
    }
    // ---- 商路奇缘 FINAL v1.0 (read-only fold, idempotent): completed lines gain the finale chapter + result snapshot; old-rule lines standing at the former chapter 5 keep
    //      exactly the settlement they are still owed (QY02 主路线 / QY04 长安交付 / QY06 长安结算 — the same amounts the new chapter 4 pays) and QY01's abolished chapter-5 reward table pays nothing.
    for (const [id, line] of Object.entries(st.lines)) {
      const d = definition(id), lastId = d.chapters[d.chapters.length - 1].id;
      if (line.status === 'closed') { if (!line.completedChapters.includes(lastId)) line.completedChapters.push(lastId); line.completed = true; if (!line.finalSnapshot) line.finalSnapshot = buildSnapshot(p, line); continue; }
      if (line.completedChapters.length === lastGameplayChapter(id) && line.flags.legacyFinalChapter !== true) {
        if (id === 'QY01') { line.activeChapter = null; finalize(p, line); }
        else if (['QY02', 'QY04', 'QY06'].includes(id)) line.flags.legacyFinalChapter = true;
      }
      if (id === 'QY01' && line.activeChapter?.chapter === 3 && !S.util.integer(line.activeChapter.referenceCost)) { line.activeChapter.referenceUnitPrice = S.market.quote(p, 'khotan', '于阗丝织'); line.activeChapter.referenceCost = line.activeChapter.referenceUnitPrice; }
    }
    return true;
  }
  S.stories = { initial, onTripStart, onDepart, arrived, trigger, begin, act, snapshot, actionChoices, startChoices, knownClues, nextCityFor, largeOrderEligible, cargo, units, damage, lose, damageChoices, recordProtectionChoice, buildSnapshot, finaleOf, displayName, validate, migrate, gaps: {} };
  S.commands.register('story.begin', begin); S.commands.register('story.act', act); S.commands.register('story.ignore', () => ({ kind: 'storyIgnored', modal: false }));
})(globalThis.Silk = globalThis.Silk || {});
