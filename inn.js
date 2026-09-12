(function (S) {
  'use strict';
  const E = S.util.ensure, data = () => globalThis.SilkData.inn, day = p => S.time.day(p), phase = p => S.time.phase(p);
  const cityCodes = { changan: 'CA', dunhuang: 'DH', khotan: 'YT' };
  const actionCosts = Object.freeze({ wait: { cash: 1, ticks: 1 }, talk: { cash: 2, ticks: 1 }, prepare: { cash: 0, ticks: 1 }, stay: { cash: 5, ticks: 1 }, camp: { cash: 0, ticks: 1 }, restOutside: { cash: 0, ticks: 1 }, home: { cash: 0, ticks: 1 } });
  function initial() { return { daily: {}, recentTalks: { changan: [], dunhuang: [], khotan: [] }, chains: {}, prepared: false, preparedLegKey: null, visits: { changan: 'initial-changan' }, lastStoryDay: -1 }; }
  function local(p) { E(!p.world.route, 'CITY_REQUIRED', '请抵达城市后进入客舍。'); }
  function daytime(p) { local(p); E(phase(p) !== 2, 'INN_DAYTIME_ONLY', '暮时请先选择过夜。'); }
  function spend(p, amount) { E(p.cash >= amount, 'INSUFFICIENT_CASH', '随身现钱不足。'); p.cash -= amount; }
  function before(p) { return { tick: p.world.tick, cash: p.cash, provisions: p.inventory.provisions }; }
  function feedback(p, b, action, title, text, extra = {}) {
    const overnightAction = ['stay', 'camp', 'restOutside', 'home'].includes(action), cost = action === 'wait' || action === 'waitCommission' ? p.world.tick - b.tick : actionCosts[action]?.cash || 0;
    return { action, title, text, before: b, after: { tick: p.world.tick, cash: p.cash, provisions: p.inventory.provisions }, cashDelta: p.cash - b.cash, provisionsDelta: p.inventory.provisions - b.provisions, elapsed: p.world.tick - b.tick, dateLabel: S.time.format(p.world.tick), phase: phase(p), actionCost: cost, lodgingCost: overnightAction ? cost : null, continueLabel: overnightAction ? '开始新的一日' : '继续', ...extra, kind: 'innFeedback' };
  }
  function wait(p, x, ctx) {
    daytime(p); const ticks = x.ticks ?? 1; E(S.util.integer(ticks, 1, 2 - phase(p)), 'WAIT_CROSSES_DUSK', '快捷候时最多到当日暮时。');
    const b = before(p); spend(p, ticks); ctx.advance(p, ticks, 'inn-wait');
    return feedback(p, b, 'wait', '歇脚候时', '你在客舍里歇了一阵。外面的光影渐渐移动，又过去了一个时段。');
  }
  function waitCommission(p, x, ctx) {
    daytime(p); E(S.commissions?.waitTarget, 'COMMISSION_UNAVAILABLE', '委托时辰尚未接入。');
    const target = S.commissions.waitTarget(p, x.commissionId); E(target > p.world.tick, 'NO_WAIT_REQUIRED', '当前无需候时。');
    const ticks = Math.min(target - p.world.tick, 2 - phase(p)); const b = before(p); spend(p, ticks); ctx.advance(p, ticks, 'inn-wait-commission');
    const reachedHandoff = p.world.tick === target;
    return feedback(p, b, 'waitCommission', '等候至委托时辰', reachedHandoff ? '你在客舍里等到约定的时辰。' : '你在客舍候到暮时，约定的交接时辰尚在次日。', { commissionId: x.commissionId, reachedHandoff });
  }
  function prepare(p, x, ctx) {
    daytime(p); E(p.trip && p.trip.routeIndex < 4, 'NO_NEXT_TRIP_LEG', '只有商旅途中下一路段前可以整理行装。');
    const key = p.trip.id + ':' + p.trip.routeIndex; E(!p.inn.prepared && p.inn.preparedLegKey !== key, 'ALREADY_PREPARED', '行装已整备。');
    const b = before(p); p.inn.prepared = true; p.inn.preparedLegKey = key;if(p.world.city==='dunhuang')p.stories.hasDunhuangPackingExperience=true; ctx.advance(p, 1, 'inn-prepare');
    return feedback(p, b, 'prepare', '整理行装', '你重新检查了驮具，把松动的货包扎紧，又调整了一遍装载位置。', { prepared: true, explanation: '下一段旅途中，因装载松动导致的货损风险有所降低。' });
  }
  function arrived(p) { p.inn.prepared = false; p.inn.visits[p.world.city] = (p.trip?.id || 'local') + ':' + (p.trip?.routeIndex ?? 0) + ':' + p.world.tick; }
  function facts(p, ctx, kind, lineId, city = p.world.city) {
    const provider=ctx?.innFacts||S.observations?.innFacts;if(typeof provider!=='function')return [];
    const rows = provider(p, { city, kind, lineId }); E(Array.isArray(rows), 'INVALID_INN_FACTS');
    return rows.filter(r => r && typeof r.id === 'string' && typeof r.text === 'string' && r.text.trim() && r.valid === true && (!r.city || r.city === city));
  }
  function factKind(line) { return /ROUTE/.test(line.resultType) ? 'route' : 'market'; }
  function lineFacts(p, line, ctx) { return facts(p, ctx, factKind(line), line.id); }
  function needsFacts(line) { return ['MARKET_OBSERVATION', 'ROUTE_OBSERVATION', 'DYNAMIC_MARKET', 'DYNAMIC_ROUTE'].includes(line.resultType); }
  function eligibleTalks(p, ctx) { return data().talkPools[p.world.city].lines.filter(l => !needsFacts(l) || lineFacts(p, l, ctx).length > 0); }
  function pickTalk(p, ctx) {
    const pool = data().talkPools[p.world.city], eligible = eligibleTalks(p, ctx), recent = p.inn.recentTalks[p.world.city];
    const topics = Object.entries(pool.topicWeights).map(([topic, weight]) => ({ topic, weight, all: eligible.filter(l => l.topic === topic) })).filter(t => t.all.length);
    E(topics.length, 'NO_INN_CONTENT', '客舍闲谈内容暂不可用。'); const selected = S.random.pick(p, topics, t => t.weight);
    const distinct = selected.all.filter(l => !recent.includes(l.id)), line = S.random.pick(p, distinct.length ? distinct : selected.all);
    return { line, fact: needsFacts(line) ? S.random.pick(p, lineFacts(p, line, ctx),x=>x.weight??1) : null };
  }
  function returns(p) { return p.tripHistory.filter(t => t.status === 'completed').length + (p.trip?.arrivedChanganTick != null ? 1 : 0); }
  function chainCandidate(p, ordinary, ctx, action) {
    if (p.inn.lastStoryDay === day(p)) return null;
    const city = p.world.city, state = p.inn.chains[city] || { step: 0 }, next = state.step + 1;
    if (next > 4) return null;
    const visit = p.inn.visits[city], completed = returns(p), node = data().storyNodes.find(n => n.id === cityCodes[city] + '_INN_CHAIN_0' + next);
    let eligible = false;
    if (city === 'changan') {
      eligible = next === 1 ? action === 'talk' && Boolean(p.reputation.firstVisits.dunhuang) : next === 2 ? action === 'talk' && completed > state.returnsAtStep : next === 3 ? completed > state.returnsAtStep : completed >= 2;
    } else if (city === 'dunhuang') {
      eligible = next === 1 ? action === 'talk' && ['DH_TALK_07', 'DH_TALK_08'].includes(ordinary?.id) : next === 2 ? day(p) > state.dayAtStep : next === 3 ? visit !== state.visitAtStep || p.trip?.id !== state.tripAtStep : action === 'talk';
    } else {
      eligible = next === 1 ? action === 'talk' && ordinary?.topic === '玉料/玉商' : next === 2 ? visit !== state.visitAtStep : next === 3 ? completed >= 1 && visit !== state.firstVisit : p.reputation.value >= 20;
    }
    if (!eligible) return null;
    const requires = ['CA_INN_CHAIN_04', 'DH_INN_CHAIN_04'].includes(node.id), dynamic = facts(p, ctx, city === 'dunhuang' ? 'route' : 'market', node.id);
    if (requires && !dynamic.length) return null;
    return { node, fact: dynamic.length ? S.random.pick(p, dynamic) : null };
  }
  function applyChain(p, chosen) {
    const { node, fact } = chosen, city = p.world.city;
    p.inn.chains[city] = { firstVisit: p.inn.chains[city]?.firstVisit || p.inn.visits[city], step: Number(node.id.slice(-1)), dayAtStep: day(p), visitAtStep: p.inn.visits[city], returnsAtStep: returns(p), tripAtStep: p.trip?.id || null };
    p.inn.lastStoryDay = day(p); p.collectionFlags[node.id] = true;
    if (node.id === 'DH_INN_CHAIN_01') p.collectionFlags.han_tibetan_phrasebook = true;
    if (node.id === 'YT_INN_CHAIN_04') p.collectionFlags.supplierStoryClue = true;
    const text = node.displayText + (fact ? '\n\n' + fact.text : '');
    const entry = { id: S.util.id(p, 'observation'), source: 'innStory', sourceId: node.id, city, tick: p.world.tick, text, factId: fact?.id || null };
    p.messages.observations.push(entry); return { text, contentId: node.id, recordLabel: node.playerFeedback.split('｜')[0], story: true, factId: fact?.id || null };
  }
  function talk(p, x, ctx) {
    daytime(p); const city = p.world.city, key = city + ':' + day(p); E(!p.inn.daily[key]?.talk, 'TALK_ALREADY_USED', '今日已听过闲谈。'); E(p.cash >= 2, 'INSUFFICIENT_CASH', '随身现钱不足。');
    const b = before(p), picked = pickTalk(p, ctx), chain = chainCandidate(p, picked.line, ctx, 'talk'); let result;
    if (chain) result = applyChain(p, chain);
    else {
      const l = picked.line, text = picked.fact ? (l.resultType.startsWith('DYNAMIC_')?l.text+'\n\n':'')+picked.fact.text : l.text;
      p.inn.recentTalks[city] = [...p.inn.recentTalks[city], l.id].slice(-3);
      if (['LORE_FLAG', 'CLUE'].includes(l.resultType)) p.collectionFlags[l.id] = true;
      if (l.id === 'DH_TALK_07') p.collectionFlags.han_tibetan_phrasebook = true;
      if (l.id === 'DH_TALK_18') p.collectionFlags.mogao_traveler_scene = true;
      if (['YT_TALK_08', 'YT_TALK_17'].includes(l.id)) p.collectionFlags.buddhist_oasis = true;
      p.messages.observations.push({ id: S.util.id(p, 'observation'), source: 'innTalk', sourceId: l.id, city, tick: p.world.tick, text, factId: picked.fact?.id || null });
      result = { text, contentId: l.id, recordLabel: l.feedbackLabel, story: false, factId: picked.fact?.id || null };
    }
    spend(p, 2); p.inn.daily[key] = { ...p.inn.daily[key], talk: true }; ctx.advance(p, 1, 'inn-talk');
    return feedback(p, b, 'talk', '听商旅闲谈', result.text, result);
  }
  function campWeights(p) { const cargo = p.inn.prepared ? 12 : 15, money = p.cash >= 20 ? 10 : 0; return [{ id: 'safe', weight: 100 - cargo - money - 10 }, { id: 'cargo', weight: cargo }, { id: 'money', weight: money }, { id: 'ordinary', weight: 10 }]; }
  function ordinaryCamp(p, ctx) {
    E(S.events?.campPool && S.events?.resolveCamp, 'MISSING_CAMP_RESOLVER', '普通露宿事件尚未接入。');
    const event = S.random.pick(p, S.events.campPool(p.world.city), e => e.weight);
    const nightId = (p.trip?.id || 'local') + ':' + p.world.city + ':' + day(p);
    const result = S.events.resolveCamp(p, event.eventId, nightId, ctx);
    const info=result.effects.filter(e=>e.type==='info').map(e=>e.actualInfoText);
    return { ...result, branch: 'ordinary', text: [result.resultText,...info].join('\n\n'),...(info.length?{recordLabel:'消息 · 市面所见'}:{}) };
  }
  function cargoNight(p) {
    const candidates = S.events.selectLots(p, 'eligibleCargo');
    if (!candidates.length) return { branch: 'cargo', text: '清晨检查行装时，没有可受损的货物。', effects: [] };
    const lot = S.random.pick(p, candidates, row => row.quantity), changed = S.inventory.damage(p, lot.id, 'moisture', { quantity: 1 });
    return { branch: 'cargo', text: '夜露侵货。清晨检查时，你发现一件货物受了些潮损。', effects: [{ type: 'cargo_damage', lotId: changed.id, goodId: changed.goodId, quantity: 1, condition: changed.condition, ownership: changed.ownership }] };
  }
  function localRestOptions(p) {
    const graceDeadline = S.trip?.graceDeadline?.(p) ?? p.trip?.graceDeadlineTick;
    const hasHome = p.merchant.properties.some(a => a.use === 'home'), inChangan = !p.world.route && p.world.city === 'changan', pendingReturn = p.trip?.phase === 'returned_at_dusk_pending_rest'||p.trip?.phase==='return_tasks'&&p.trip.arrivedChanganTick!=null&&S.util.integer(graceDeadline)&&p.world.tick<=graceDeadline;
    return { hasHome, canHome: inChangan && phase(p) === 2 && hasHome && (!p.trip || pendingReturn), canRestOutside: inChangan && phase(p) === 2 && !hasHome && !p.trip };
  }
  function overnight(p, x, ctx, action) {
    local(p); E(phase(p) === 2, 'NIGHT_ONLY', '请在暮时选择过夜。'); const b = before(p); let result;
    if (action === 'stay') {
      E(p.cash >= 5, 'INSUFFICIENT_CASH', '随身现钱不足。');
      spend(p, 5);
      // The approved no-event stay is a complete normal path (-5, dusk→morning).
      // An optional selected night event must not be a prerequisite for lodging.
      const external = typeof ctx.innNight === 'function' ? ctx.innNight(p) : null;
      if(external?.kind==='eventOpened'){
        ctx.advance(p,1,'inn-stay');
        p.eventSession.node.nightSnapshot={action:'stay',before:b,after:before(p),baseElapsed:1,actionCost:5,lodgingCost:5,finalized:false};
        return external;
      }
      if (external) result = external;
      else { const chain = chainCandidate(p, null, ctx, 'stay'); result = chain ? { ...applyChain(p, chain), branch: 'story' } : { branch: 'safe', text: '你在客舍安稳歇了一夜。天亮后，城中又渐渐热闹起来。' }; }
    } else if (action === 'camp') {
      E(p.trip, 'LOCAL_REST_REQUIRED', '未启程时请选择寻处暂歇或回院歇息。'); const branch = S.random.pick(p, campWeights(p), r => r.weight).id;
      if (branch === 'ordinary') result = ordinaryCamp(p, ctx);
      else if (branch === 'safe') result = { branch, text: '一夜无事。你在商队旁将就了一晚，天亮后继续赶路。' };
      else if (branch === 'cargo') result = cargoNight(p);
      else {
        E(S.events?.open && S.events?.eligibility, 'MISSING_CAMP_RESOLVER', '夜间钱财事件尚未接入。');
        const nightId = p.trip.id + ':' + p.world.city + ':' + day(p), node = { kind: 'overnight', nightId, soleNightOutcome: true, lodgingContext: 'camp', lodgingSettled: true, tags: [] };
        if(!S.events.eligibility(p,'M03',node).eligible){
          // The cash/loss-count protection removes the risk; it cannot block a free night.
          ctx.advance(p,1,'inn-camp');return feedback(p,b,'camp','风餐露宿','一夜无事。你在商队旁将就了一晚，天亮后继续赶路。',{branch:'safe',riskFiltered:true,operationCashDelta:0});
        }
        ctx.advance(p, 1, 'inn-camp'); node.nightSnapshot = { action: 'camp', before: b, after: before(p), baseElapsed: 1, actionCost: 0, lodgingCost: 0, finalized: false };
        return S.events.open(p, 'M03', node);
      }
    } else {
      const options = localRestOptions(p);
      if (action === 'home') { E(options.hasHome, 'INVALID_RESIDENCE', '尚无自住院落。'); E(options.canHome, 'LOCAL_REST_ONLY', '请在长安未启程或暮时返抵后回院歇息。'); }
      else E(options.canRestOutside, 'LOCAL_REST_ONLY', '寻处暂歇只供无自住院落的长安未启程经营期使用。');
      result = { branch: 'safe', text: action === 'home' ? '你回到自住院落歇息。天亮后，又是新的一日。' : '你在长安寻了一处暂歇，待到天明。' };
    }
    const operationCashDelta = p.cash - b.cash;
    ctx.advance(p, 1, 'inn-' + action); return feedback(p, b, action, { stay: '留宿客舍', camp: '风餐露宿', restOutside: '寻处暂歇', home: '回院歇息' }[action], result.text, { ...result, operationCashDelta });
  }
  function afterEventAcknowledged(p, current) {
    if (!current?.eventSessionId) return null;
    const session = p.eventSession, night = session?.node?.nightSnapshot;
    if (session?.id !== current.eventSessionId || !night || night.finalized) return null;
    E(session.status === 'ACKNOWLEDGED', 'NIGHT_EVENT_UNACKNOWLEDGED');
    const event = session.result;
    // The night card reports the committed settlement: lodging and the event deltas were applied in sequence on the same state (before − lodging + event = now).
    const result = feedback(p, S.util.clone(night.before), night.action, night.action === 'stay' ? '留宿客舍' : '风餐露宿', event.resultText, { branch: 'money', nightId: session.node.nightId, eventId: session.eventId, occurrenceId: session.occurrenceId || session.id, settlementId: session.settlementId || null, effects: S.util.clone(event.effects), eventCashDelta: event.cashDelta ?? 0, actionCost: night.actionCost, lodgingCost: night.lodgingCost });
    night.finalized = true; night.feedback = S.util.clone(result);
    return result;
  }
  function snapshot(p) { const currentDay = day(p), waiting = 2 - phase(p), travel = Boolean(p.trip); return { city: p.world.city, daytime: phase(p) !== 2, cash: p.cash, prepared: p.inn.prepared, talkUsed: Boolean(p.inn.daily[p.world.city + ':' + currentDay]?.talk), canPrepare: travel && p.trip.routeIndex < 4 && !p.inn.prepared && phase(p) !== 2, maxWaitTicks: waiting, canStay: phase(p) === 2 && p.cash >= 5, canCamp: phase(p) === 2 && travel, ...localRestOptions(p), waitAlternatives: waiting >= 2 ? ['市场', ...(p.world.city === 'changan' ? ['营生'] : []), ...(travel && !p.inn.prepared ? ['整理行装'] : [])] : [], actionCosts: S.util.clone(actionCosts), ambientLines: [...data().ambientLines[p.world.city]] }; }
  const reducers = { 'inn.wait': wait, 'inn.waitCommission': waitCommission, 'inn.prepare': prepare, 'inn.talk': talk, 'inn.stay': (p, x, ctx) => overnight(p, x, ctx, 'stay'), 'inn.camp': (p, x, ctx) => overnight(p, x, ctx, 'camp'), 'inn.restOutside': (p, x, ctx) => overnight(p, x, ctx, 'restOutside'), 'inn.home': (p, x, ctx) => overnight(p, x, ctx, 'home') };
  // RC3 BUG-04: the lodging/action cost is journaled from the real cash change once, whether or not a night event opened.
  function reduce(p, command, ctx) { E(Object.hasOwn(reducers, command.type), 'UNKNOWN_COMMAND'); const tickBefore = p.world.tick, cashBefore = p.cash; const result = reducers[command.type](p, command.payload || {}, ctx); const delta = p.cash - cashBefore; p.journal.push({ type: command.type === 'inn.talk' ? 'innTalk' : ['inn.wait', 'inn.waitCommission'].includes(command.type) ? 'innWait' : command.type === 'inn.camp' && result.kind !== 'eventOpened' ? 'event' : 'inn', action: command.type, amount: delta, tick: tickBefore, tripId: p.trip?.id || null }); return result; }
  S.inn = { initial, reduce, arrived, snapshot, eligibleTalks, campWeights, ordinaryCamp, chainCandidate, afterEventAcknowledged };
  for (const type of Object.keys(reducers)) S.commands.register(type, (p, x, ctx) => reduce(p, { type, payload: x }, ctx));
})(globalThis.Silk = globalThis.Silk || {});
