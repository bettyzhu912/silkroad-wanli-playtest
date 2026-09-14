'use strict';
// Real-browser (headless Chrome, real IndexedDB SaveStore, real UI handlers) full run of a NEW save:
// 长安 → 敦煌 → 于阗 → 敦煌 → 长安, first-trip return tasks, summary, reload/idempotency checks, screenshots as evidence.
// Usage: node tests/browser/rc3-browser-run.js [desktop|mobile]
const fs = require('fs'), path = require('path');
const { launch, startServer, sleep } = require('../tools/cdp');
const root = path.join(__dirname, '..', '..');
const mode = process.argv[2] || 'desktop', mobile = mode === 'mobile';
const portOffset = Number(process.env.SILK_PORT_OFFSET || 0); const port = (mobile ? 8139 : 8138) + portOffset, cdpPort = (mobile ? 9334 : 9333) + portOffset, url = 'http://127.0.0.1:' + port + '/';
// SILK_SERVE_ROOT serves a build output instead of the repo (e.g. the mini-tool stage); SILK_LEGACY_RUNTIME=1 removes post-Chrome-61 runtime APIs before any page script runs; SILK_EVIDENCE_LABEL names the evidence folder.
const serveRoot = process.env.SILK_SERVE_ROOT ? path.resolve(process.env.SILK_SERVE_ROOT) : root, legacyRuntime = process.env.SILK_LEGACY_RUNTIME === '1';
const outDir = path.join(root, 'tests', 'results', 'evidence', mode + (process.env.SILK_EVIDENCE_LABEL ? '-' + process.env.SILK_EVIDENCE_LABEL : '')); fs.rmSync(outDir, { recursive: true, force: true }); fs.mkdirSync(outDir, { recursive: true });
const LEGACY_SCRIPT = `(function(){try{delete window.globalThis}catch(e){}try{delete Object.hasOwn;delete Object.fromEntries;delete Array.prototype.at;delete String.prototype.at;delete Array.prototype.flat;delete Array.prototype.flatMap;delete window.queueMicrotask;delete window.structuredClone;delete Element.prototype.replaceChildren;delete Document.prototype.replaceChildren;delete DocumentFragment.prototype.replaceChildren}catch(e){}window.__silkLegacyRuntime=true})();`;
const checks = [], shots = [], timeline = []; let shotIndex = 0;
function check(name, ok, detail) { checks.push({ name, ok: Boolean(ok), detail }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  ' + JSON.stringify(detail).slice(0, 220) : '')); }
const STATE = `(() => { try { const s = Silk.app.state, p = s.progress; if (!p || !p.world) return { noProgress: true, gen: s.meta.generation, rev: s.meta.revision };
  const phaseNames = ['晨','午','暮'];
  return { tick: p.world.tick, day: Math.floor(p.world.tick / 3), phase: phaseNames[p.world.tick % 3], city: p.world.city, route: p.world.route ? { to: p.world.route.to, remainingTicks: p.world.route.remainingTicks } : null,
    cash: p.cash, rep: p.reputation.value, turnover: p.reputation.turnover, provisions: p.inventory.provisions,
    trip: p.trip ? { id: p.trip.id, phase: p.trip.phase, routeIndex: p.trip.routeIndex, returnStatus: p.trip.returnStatus, arrivedChanganTick: p.trip.arrivedChanganTick, startedAt: p.trip.startedAt, deadlineTick: p.trip.deadlineTick, hasSummary: Boolean(p.trip.summary) } : null,
    draft: p.departureDraft ? { id: p.departureDraft.id } : null,
    lots: p.inventory.lots.map(l => ({ good: l.goodId, qty: l.quantity, from: l.acquisitionCity, left: l.hasLeftAcquisitionCity, pending: Boolean(l.purchaseTurnoverPending) })),
    pendingTurnoverLots: (() => { const t = p.market.purchaseTurnoverLots || {}; const arr = Array.isArray(t) ? t : Object.values(t); return arr.filter(x => x && (x.status === 'pending' || x.status === undefined)).length; })(),
    visitOpen: Boolean(p.market.visit && !p.market.visit.settled), visitId: p.market.visit && !p.market.visit.settled ? p.market.visit.id : null,
    commissions: { board: (p.commissions.board || []).length, boardTarget: p.commissions.boardTarget, active: p.commissions.active.map(x => [x.commissionId, x.status, x.urgent ? 'urgent' : '', x.urgentWindow ? x.urgentWindow.deadlineTick : null]), history: (p.commissions.history || []).length, results: p.commissions.results.length },
    cityRolls: Object.values((p.events && p.events.cityRollDays) || {}).map(r => r.city + '@' + r.day + ':' + (r.trigger ? r.eventId : 'no') + (r.innNight ? ':inn' : '')), pendingCityRoll: p.events && p.events.pendingCityRoll ? p.events.pendingCityRoll.key : null,
    event: p.eventSession && p.eventSession.status !== 'ACKNOWLEDGED' ? p.eventSession.status + ':' + p.eventSession.eventId : null, eventAcked: Boolean(p.eventSession && p.eventSession.status === 'ACKNOWLEDGED'), activeResult: p.presentation.activeResult ? { id: p.presentation.activeResult.id, kind: p.presentation.activeResult.kind } : null,
    routeGame: p.work && p.work.routeGame ? { id: p.work.routeGame.id, result: p.work.routeGame.result ? p.work.routeGame.result.completionStatus + '/' + (p.work.routeGame.result.settledAs || p.work.routeGame.result.tier) + (p.work.routeGame.result.worldEffectsCommitted ? '/committed' : '') : null } : null,
    tripHistory: p.tripHistory.length, journal: (p.journal || []).length, lodgingEntries: (p.journal || []).filter(j => j.action === 'inn.stay').length,
    gen: s.meta.generation, rev: s.meta.revision, timeLabel: (document.querySelector('.hud-time, [aria-label*="时间"]') || {}).innerText || null }; } catch (e) { return { noProgress: true, error: e.message }; } })()`;
(async () => {
  const srv = startServer(port, serveRoot); await sleep(500);
  const c = await launch({ port: cdpPort, width: mobile ? 375 : 1280, height: mobile ? 812 : 900, mobile });
  if (legacyRuntime) await c.send('Page.addScriptToEvaluateOnNewDocument', { source: LEGACY_SCRIPT });
  const st = () => c.eval(STATE);
  const shot = async name => { const f = String(++shotIndex).padStart(2, '0') + '-' + name + '.png'; await c.screenshot(path.join(outDir, f)); shots.push(f); return f; };
  const note = async (label, extra) => { const s = await st(); timeline.push({ label, ...(extra || {}), state: s }); return s; };
  const dispatch = (type, payload = {}, sourceId) => c.eval(`Silk.app.dispatch(${JSON.stringify(type)},${JSON.stringify(payload)}${sourceId ? ',' + JSON.stringify(sourceId) : ''}).then(r=>({ok:true,replayed:r.replayed,kind:r.result&&r.result.kind,result:r.result}),e=>({ok:false,code:e.code,message:e.message}))`);
  const pageText = () => c.eval(`document.getElementById('game-root').innerText`);
  const vid = () => c.eval(`(()=>{const v=Silk.app.state.progress.market.visit;return v&&!v.settled?v.id:null})()`);
  const panelText = cls => c.eval(`(()=>{const s=[...document.querySelectorAll('section.paper-panel.${cls}')].find(x=>!x.hidden);return s?s.innerText:null})()`);
  // click a visible, enabled button whose text starts with `text`; scope = topmost visible panel class or 'page'
  const click = async (text, opts = {}) => { if (opts.scope === 'page') await ensureScene(); return clickRaw(text, opts); };
  const clickRaw = (text, opts = {}) => c.eval(`(()=>{const order=${JSON.stringify(opts.scope ? [opts.scope] : ['modal-panel', 'result-panel', 'secondary-panel', 'primary-panel'])};let scope=null;for(const cls of order){const s=[...document.querySelectorAll('section.paper-panel.'+cls)].find(x=>!x.hidden&&x.offsetParent!==null);if(s){scope=s;break}}
    const rootEl=${JSON.stringify(opts.scope) === '"page"' ? 'document' : '(scope||document)'};const btns=[...rootEl.querySelectorAll('button')].filter(b=>!b.disabled&&b.offsetParent!==null&&b.textContent.trim().startsWith(${JSON.stringify(text)}));if(!btns.length)return 'NOT_FOUND';btns[${opts.last ? 'btns.length-1' : opts.index || 0}].click();return 'ok:'+btns.length+':'+(scope?scope.className:'page')})()`);
  // mobile layout hides the city scene behind full-screen panels: close acknowledged panels / notices before using a scene hotspot
  const sceneStep = () => c.eval(`(()=>{const notice=document.querySelector('[aria-live="polite"]');if(notice&&notice.offsetParent!==null){const nb=[...notice.querySelectorAll('button')].filter(b=>!b.disabled&&b.offsetParent!==null);if(nb.length){nb[nb.length-1].click();return 'notice:'+nb[nb.length-1].textContent.trim()}}
    const secs=[...document.querySelectorAll('section.paper-panel.secondary-panel, section.paper-panel.primary-panel')].filter(x=>!x.hidden&&x.offsetParent!==null);if(!secs.length)return 'none';const s=secs[secs.length-1];const close=s.querySelector('button[aria-label="关闭"]');if(close&&close.offsetParent!==null){close.click();return 'close:'+s.className}
    const fb=[...s.querySelectorAll('button')].filter(b=>!b.disabled&&b.offsetParent!==null&&/^(继续|离开客舍|返回|离开柜坊|开始新的一日|离开市场)/.test(b.textContent.trim()));if(fb.length){fb[fb.length-1].click();return 'footer:'+fb[fb.length-1].textContent.trim()}return 'stuck:'+s.className})()`);
  const ensureScene = async () => { const acted = []; for (let i = 0; i < 6; i++) { const r = await sceneStep(); if (r === 'none' || r.startsWith('stuck')) { if (r.startsWith('stuck')) acted.push(r); break; } acted.push(r); await sleep(250); await waitIdle(); } if (acted.length) timeline.push({ label: 'ensureScene', acted }); return acted; };
  const clickLastIn = cls => c.eval(`(()=>{const s=[...document.querySelectorAll('section.paper-panel.${cls}')].find(x=>!x.hidden&&x.offsetParent!==null);if(!s)return 'NO_PANEL';const btns=[...s.querySelectorAll('button')].filter(b=>!b.disabled&&b.offsetParent!==null);if(!btns.length)return 'NO_BUTTON';const b=btns[btns.length-1];const t=b.textContent.trim();b.click();return 'ok:'+t})()`);
  const closePrimary = () => c.eval(`(()=>{const s=[...document.querySelectorAll('section.paper-panel.primary-panel')].find(x=>!x.hidden);const b=s&&s.querySelector('button[aria-label="关闭"]');if(!b)return 'NO_CLOSE';b.click();return 'ok'})()`);
  const overflow = () => c.eval(`document.documentElement.scrollWidth - window.innerWidth`);
  async function waitIdle() { for (let i = 0; i < 40; i++) { const busy = await c.eval('Silk.app.busy'); if (!busy) return; await sleep(100); } }
  // generic driver: acknowledge results, answer events (first enabled choice / skip skill games), until the predicate holds
  // 市场交易页: with trades in the visit, 离开市场 opens MARKET_EXIT_CONFIRM (0 tick); 确认离市 closes the visit and advances once.
  async function leaveMarket() { const r = await click('离开市场'); await sleep(300); const confirm = await c.eval(`(()=>{const s=document.querySelector('[data-panel-id="market-exit-confirm"]');return Boolean(s&&s.offsetParent!==null)})()`); if (confirm) { timeline.push({ label: 'market-exit-confirm' }); await click('确认离市'); } return r; }
  async function settle(pred, { max = 400, label = '' } = {}) {
    for (let i = 0; i < max; i++) {
      await waitIdle(); const s = await st();
      if (await pred(s)) return s;
      if (s.activeResult) { let r = await clickLastIn('result-panel'); if (!r.startsWith('ok')) r = await c.eval(`(()=>{const box=[...document.querySelectorAll('[data-panel-id="result"]')].find(x=>x.offsetParent!==null);if(!box)return 'NO_CONTAINED';const btns=[...box.querySelectorAll('button')].filter(b=>!b.disabled&&b.offsetParent!==null);if(!btns.length)return 'NO_BUTTON';const b=btns[btns.length-1];const t=b.textContent.trim();b.click();return 'ok:'+t})()`);
        if (!r.startsWith('ok')) { const rid = s.activeResult.id; const d = await dispatch('result.ack', { resultId: rid }); r = 'dispatch-ack:' + JSON.stringify(d).slice(0, 80); }
        if (r.startsWith('ok') || r.startsWith('dispatch-ack')) { timeline.push({ label: 'ack:' + s.activeResult.kind, button: r }); await sleep(150); continue; } }
      if (s.event && s.event.startsWith('AWAITING_CHOICE')) {
        if (!s.route && !shots.some(x => x.includes('city-event'))) await shot('city-event-' + s.city); else if (s.route && !shots.some(x => x.includes('route-event'))) await shot('route-event');
        const prot = await c.eval(`(()=>{const s=[...document.querySelectorAll('section.paper-panel')].find(x=>!x.hidden&&x.innerText.includes('商路见闻'));if(!s)return 'NO_PANEL';const grp=s.querySelector('.route-event-choices');const btns=[...s.querySelectorAll('button')].filter(b=>!b.disabled&&b.offsetParent!==null&&!(grp&&grp.contains(b))&&!['开始','跳过','继续'].includes(b.textContent.trim())&&b.closest('footer')===null);if(!btns.length)return 'NONE';btns[0].click();return 'protection:'+btns[0].textContent.trim()})()`);
        if (prot.startsWith('protection')) { timeline.push({ label: prot }); await sleep(150); continue; }
        const r = await c.eval(`(()=>{const grp=[...document.querySelectorAll('.route-event-choices')].find(g=>g.offsetParent!==null);if(!grp)return 'NO_GROUP';const b=[...grp.querySelectorAll('button')].find(x=>!x.disabled);if(!b)return 'NO_ENABLED';const t=b.textContent.trim();b.click();return 'choice:'+t})()`);
        timeline.push({ label: r, event: s.event }); await sleep(200); continue;
      }
      if (s.event && s.event.startsWith('AWAITING_SKILL')) {
        if (s.routeGame && s.routeGame.result && !s.routeGame.result.includes('committed')) { const r = await click('继续'); if (!r.startsWith('ok')) { const d = await dispatch('EVENT_RM_RESOLVE', { eventSessionId: await c.eval('Silk.app.state.progress.eventSession.id'), rmSessionId: s.routeGame.id }); timeline.push({ label: 'rm-resolve-fallback', d }); } await sleep(200); continue; }
        const prot = await c.eval(`(()=>{const s=[...document.querySelectorAll('section.paper-panel')].find(x=>!x.hidden&&x.innerText.includes('商路见闻'));if(!s)return 'NO_PANEL';const btns=[...s.querySelectorAll('button')].filter(b=>!b.disabled&&b.offsetParent!==null&&!['开始','跳过','继续'].includes(b.textContent.trim())&&b.closest('footer')===null);if(!btns.length)return 'NONE';btns[0].click();return 'protection:'+btns[0].textContent.trim()})()`);
        if (prot.startsWith('protection')) { timeline.push({ label: prot }); await sleep(150); continue; }
        if (!shots.some(x => x.includes('route-minigame'))) await shot('route-minigame-skip');
        const r = await click('跳过'); if (r.startsWith('ok')) { await sleep(150); const m = await click('确认跳过', { scope: 'modal-panel' }); timeline.push({ label: 'skip-minigame:' + s.event, r, m }); await sleep(300); continue; }
      }
      if (s.route) { await sleep(400); continue; } // journey timer runs on its own (1.1s per tick)
      await sleep(250);
    }
    throw new Error('settle timeout ' + label + ' ' + JSON.stringify(await st()).slice(0, 300));
  }
  const waitFor = async (pred, ms = 20000, label = '') => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const s = await st(); if (await pred(s)) return s; await sleep(150); }
    const diag = await c.eval(`(()=>{const secs=[...document.querySelectorAll('section.paper-panel')].filter(x=>!x.hidden&&x.offsetParent!==null).map(x=>x.className+': '+x.innerText.slice(0,200).split(String.fromCharCode(10)).join(' / '));const btns=[...document.querySelectorAll('button')].filter(b=>b.offsetParent!==null).map(b=>(b.disabled?'[x]':'')+b.textContent.trim()).slice(0,40);return {secs,btns}})()`);
    try { await shot('timeout-' + (label || 'wait')); } catch (_) { } throw new Error('waitFor timeout ' + label + ' state=' + JSON.stringify(await st()).slice(0, 400) + ' diag=' + JSON.stringify(diag).slice(0, 900)); };
  const reload = async () => { await c.navigate(url); await waitFor(s => !s.noProgress || s.gen !== undefined).catch(() => { }); await sleep(600); await waitIdle(); return st(); };
  try {
    // ---------- 0. fresh load ----------
    await c.navigate(url); await sleep(1200);
    await c.eval('new Promise(r=>{const t=setInterval(()=>{if(window.Silk&&Silk.app&&Silk.app.state){clearInterval(t);r()}},100)})');
    let s = await st(); check('fresh profile has no progress (new save)', s.noProgress === true, s); await shot('home');
    const rt = await c.eval(`({ legacy: !!window.__silkLegacyRuntime, globalThisIsWindow: typeof globalThis !== 'undefined' && globalThis === window, structuredCloneNative: typeof structuredClone === 'function' && /native code/.test(String(structuredClone)), hasOwnNative: typeof Object.hasOwn === 'function' && /native code/.test(String(Object.hasOwn)), htmlClasses: document.documentElement.className, scripts: [...document.scripts].map(x => x.getAttribute('src')).slice(0, 3), served: location.href })`); check('runtime facts (' + (legacyRuntime ? 'simulated Chrome 61 runtime' : 'native runtime') + ')', legacyRuntime ? rt.legacy && rt.globalThisIsWindow && !rt.structuredCloneNative && !rt.hasOwnNative && rt.scripts[0] === 'compat.js' : rt.globalThisIsWindow, rt);
    check('home: no horizontal overflow', (await overflow()) <= 0, await overflow());
    // ---------- 1. new game ----------
    await click('启程', { scope: 'page' }); await sleep(400); await shot('start-choice'); await click('自行探索', { scope: 'page' }); await waitFor(x => !x.noProgress);
    s = await note('new-game'); check('new game: 长安 晨 tick0 cash200 rep0 未启程', s.tick === 0 && s.city === 'changan' && s.cash === 200 && s.rep === 0 && !s.trip && !s.draft, s); await shot('changan-new-game');
    const startCash = s.cash;
    // ---------- 2. market purchase in 长安 (turnover must stay pending, BUG-07) ----------
    await click('市场', { scope: 'page' }); await waitFor(x => x.visitOpen); await sleep(300); await shot('market-changan');
    const plan = await c.eval(`(()=>{const p=Silk.app.state.progress,city=p.world.city;const goods=Silk.inventory.goods.filter(g=>g.originCity===city&&Silk.inventory.unlocked(p,g.id));const g=goods[0];const unit=Silk.pricing.quote(p,city,g.id);const qty=Math.max(1,Math.min(Math.floor(p.cash*0.45/unit),Math.floor(Silk.inventory.available(p)/g.slotCost)));return {goodId:g.id,unit,qty}})()`);
    let r = await dispatch('market.buy', { visitId: await vid(), goodId: plan.goodId, quantity: plan.qty }); check('market.buy accepted', r.ok, { plan, r: r.ok ? r.kind : r });
    s = await settle(x => !x.activeResult, { label: 'after buy' });
    r = await dispatch('market.provisions', { visitId: await vid(), quantity: 8 }); check('market.provisions accepted', r.ok, r.ok ? r.kind : r); s = await settle(x => !x.activeResult);
    r = await dispatch('newspaper.purchase', { visitId: await vid() }); const tickBeforeNews = s.tick; s = await settle(x => !x.activeResult); check('newspaper inside market costs 0 tick (BUG-11)', r.ok && s.tick === tickBeforeNews, { r: r.ok ? r.kind : r, tick: s.tick });
    await shot('market-after-buy');
    await leaveMarket(); s = await settle(x => !x.visitOpen && !x.activeResult && !x.event, { label: 'leave market' });
    check('purchase turnover pending, reputation unchanged (BUG-07)', s.lots.every(l => l.pending && l.left === false) && s.rep === 0 && s.turnover === 0 && s.pendingTurnoverLots >= 1, { lots: s.lots, pending: s.pendingTurnoverLots, rep: s.rep, turnover: s.turnover });
    const afterBuy = await note('after-market');
    // ---------- 3. reload: state identical, no double money ----------
    s = await reload(); check('reload after market: identical cash/tick/lots/revision', s.cash === afterBuy.cash && s.tick === afterBuy.tick && JSON.stringify(s.lots) === JSON.stringify(afterBuy.lots) && s.rev === afterBuy.rev, { before: [afterBuy.cash, afterBuy.tick, afterBuy.rev], after: [s.cash, s.tick, s.rev] });
    async function sleepIfDusk(label) { s = await settle(x => !x.activeResult && !x.event && !x.visitOpen, { label: 'settle ' + label }); if (s.phase !== '暮') return s; await click('客舍', { scope: 'page' }); await sleep(300); await shot('inn-dusk-' + label); const dayBefore = s.day; await click('留宿客舍'); s = await settle(x => x.day > dayBefore && !x.activeResult && !x.event, { label: 'night ' + label }); timeline.push({ label: 'slept:' + label, tick: s.tick }); if (s.phase === '暮') return sleepIfDusk(label + '-again'); return s; }
    // ---------- 4. departure preparation (BUG-08; COMMISSION v3.0: no commission draft — at most one hint line) ----------
    s = await sleepIfDusk('changan-before-prepare'); const beforePrepare = await st();
    await click('出发', { scope: 'page' }); await sleep(300); await shot('depart-panel'); const dr0 = await click('敦煌'); timeline.push({ label: 'click 敦煌', dr0 }); await sleep(600); await waitIdle();
    s = await note('prepare-opened'); const prepText = await panelText('primary-panel');
    check('确认出发 only opens the 开始行程 preparation: trip null, tick unchanged, no commission list / 选定 button', s.trip === null && s.tick === beforePrepare.tick && /开始行程/.test(prepText || '') && !/出发前委托|选定|承接/.test(prepText || ''), { tick: s.tick, text: (prepText || '').slice(0, 120) });
    check('preparation page: one commission hint line exactly when something is acceptable', ((prepText || '').match(/有委托可接/g) || []).length === (s.rep >= 5 && s.commissions.board > 0 ? 1 : 0), { rep: s.rep, board: s.commissions.board });
    await shot('departure-prepare-panel');
    await closePrimary(); await sleep(200);
    // spend time in the city after preparing: the trip clock must not run (BUG-08)
    await click('客舍', { scope: 'page' }); await sleep(300); await click('候时1个时段'); s = await settle(x => !x.activeResult && !x.event, { label: 'wait in inn' }); await click('离开客舍').catch(() => { });
    s = await note('after-wait'); const hud = await pageText();
    check('after waiting: still 未启程, trip null', s.trip === null && s.tick >= beforePrepare.tick + 1 && /未启程/.test(hud), { tick: [beforePrepare.tick, s.tick], trip: s.trip });
    if (s.phase === '暮') { await click('客舍', { scope: 'page' }); await sleep(300); await shot('inn-dusk-changan-before-start'); const dayBeforeNight = s.day; await click('留宿客舍'); s = await settle(x => x.day > dayBeforeNight && !x.activeResult && !x.event, { label: 'night in changan before start' }); s = await note('morning-before-start');
      check('a night in 长安 before starting: still 未启程, no trip clock', s.trip === null && /未启程/.test(await pageText()), { tick: s.tick, rolls: s.cityRolls }); }
    s = await reload(); check('reload: trip still null, no draft state', s.trip === null && s.draft === null, { trip: s.trip, draft: s.draft });
    // ---------- 5. start the trip from the preparation page ----------
    s = await sleepIfDusk('changan-before-start');
    await click('出发', { scope: 'page' }); await sleep(300); await click('敦煌'); await sleep(500); await waitIdle(); await shot('prepare-panel-before-start');
    await click('开始行程'); await sleep(300); await shot('start-trip-confirm-modal'); const modalText = await panelText('modal-panel');
    check('start modal mentions 22-day period starting on 开始行程', /22日商期/.test(modalText || ''), modalText);
    const before = await st(); await click('开始行程', { scope: 'modal-panel' }); s = await waitFor(x => x.trip && x.route);
    s = await note('trip-started');
    check('开始行程 starts trip + route at the same tick, board / active untouched', s.trip && s.route && s.trip.startedAt === before.tick && s.draft === null && s.trip.deadlineTick === before.tick + 66 && s.commissions.board === before.commissions.board && JSON.stringify(s.commissions.active) === JSON.stringify(before.commissions.active), { startedAt: s.trip && s.trip.startedAt, tick: before.tick, deadline: s.trip && s.trip.deadlineTick, board: [before.commissions.board, s.commissions.board] });
    check('cargo leaving 长安 confirms purchase turnover (BUG-07)', s.lots.every(l => l.left === true && !l.pending) && s.turnover > 0, { lots: s.lots, turnover: s.turnover, rep: s.rep });
    await shot('journey-start');
    // ---------- 6. journey to 敦煌 (auto timer, events answered by UI) ----------
    s = await settle(x => !x.route && x.city === 'dunhuang' && !x.activeResult && !x.event, { label: 'to dunhuang' }); s = await note('arrived-dunhuang-outbound'); await shot('dunhuang-arrival');
    check('arrived 敦煌 (去程) routeIndex 1', s.trip.routeIndex === 1 && s.city === 'dunhuang', { tick: s.tick, phase: s.phase, rep: s.rep });
    // sell transported goods, buy local goods
    async function trade(cityLabel) {
      await click('市场', { scope: 'page' }); s = await waitFor(x => x.visitOpen); await sleep(200); await shot('market-' + cityLabel);
      const repBefore = s.rep, turnoverBefore = s.turnover;
      if (s.lots.length) { r = await dispatch('market.sellAll', { visitId: await vid() }); s = await settle(x => !x.activeResult); check('sellAll in ' + cityLabel + ' accepted; transported goods count toward reputation turnover', r.ok && (s.rep > repBefore || s.turnover > turnoverBefore), { r: r.ok ? r.kind : r, turnover: [turnoverBefore, s.turnover], rep: [repBefore, s.rep] }); }
      const plan2 = await c.eval(`(()=>{const p=Silk.app.state.progress,city=p.world.city;const goods=Silk.inventory.goods.filter(g=>g.originCity===city&&Silk.inventory.unlocked(p,g.id));if(!goods.length)return null;const g=goods[0];const unit=Silk.pricing.quote(p,city,g.id);const qty=Math.max(1,Math.min(Math.floor(p.cash*0.5/unit),Math.floor(Silk.inventory.available(p)/g.slotCost)));return {goodId:g.id,unit,qty}})()`);
      if (plan2 && plan2.qty > 0) { r = await dispatch('market.buy', { visitId: await vid(), goodId: plan2.goodId, quantity: plan2.qty }); s = await settle(x => !x.activeResult); check('buy in ' + cityLabel, r.ok, { plan2, r: r.ok ? r.kind : r }); }
      if (s.provisions < 6) { r = await dispatch('market.provisions', { visitId: await vid(), quantity: 6 }); s = await settle(x => !x.activeResult); }
      await leaveMarket(); s = await settle(x => !x.visitOpen && !x.activeResult && !x.event, { label: 'leave ' + cityLabel });
      return s;
    }
    async function toDuskAndStay(cityLabel) {
      while ((await st()).phase !== '暮') { await click('客舍', { scope: 'page' }); await sleep(200); const cr = await click('候时1个时段'); if (!cr.startsWith('ok')) { await dispatch('inn.wait', { ticks: 1 }); } s = await settle(x => !x.activeResult && !x.event); await click('离开客舍').catch(() => { }); await sleep(100); }
      await click('客舍', { scope: 'page' }); await sleep(300); await shot('inn-dusk-' + cityLabel);
      const b0 = await st(), cashBefore = b0.cash, journalBefore = b0.journal, lodgingBefore = b0.lodgingEntries, rollsBefore = b0.cityRolls.length;
      await click('留宿客舍'); s = await settle(x => x.day > b0.day && !x.activeResult && !x.event, { label: 'inn night ' + cityLabel });
      const stayRes = timeline.filter(t => t.label && t.label.startsWith('ack:')).slice(-3).map(t => t.label);
      check('inn night in ' + cityLabel + ': next day, lodging journaled exactly once, city roll persisted', s.day === b0.day + 1 && s.lodgingEntries === lodgingBefore + 1 && s.cityRolls.length >= rollsBefore, { cash: [cashBefore, s.cash], journal: [journalBefore, s.journal], rolls: s.cityRolls.slice(-3), acks: stayRes });
      await shot('morning-' + cityLabel);
      return s;
    }
    async function cityStop(label, extra) { if ((await st()).phase === '暮') { s = await toDuskAndStay(label); if (extra) await extra(); s = await trade(label); } else { s = await trade(label); if (extra) await extra(); s = await toDuskAndStay(label); } return s; }
    s = await cityStop('dunhuang-outbound', async () => { await click('委托', { scope: 'page' }); await sleep(300); await shot('commissions-dunhuang'); const commText = await panelText('primary-panel'); await closePrimary(); check('commission panel renders v3.0 groups (进行中 / 可接委托; no 本商期委托 / 出发前 / 二选一 wording)', commText && /可接委托/.test(commText) && !/二选一|本商期委托|出发前|选定/.test(commText), (commText || '').slice(0, 160)); });
    // ---------- 7. 敦煌 → 于阗 ----------
    async function departTo(cityName, label) { s = await sleepIfDusk('before-' + label); const o = await click('出发', { scope: 'page' }); await sleep(300); let dr = await click(cityName); if (!dr.startsWith('ok')) { const diag = await c.eval(`(()=>{const secs=[...document.querySelectorAll('section.paper-panel')].filter(x=>!x.hidden&&x.offsetParent!==null).map(x=>x.className+': '+x.innerText.slice(0,160).split(String.fromCharCode(10)).join(' / '));const btns=[...document.querySelectorAll('button')].filter(b=>b.offsetParent!==null).map(b=>(b.disabled?'[x]':'')+b.textContent.trim()).slice(0,40);return {secs,btns}})()`); timeline.push({ label: 'depart-diag', o, dr, diag }); await shot('depart-diag-' + label); }
      check('depart button ' + cityName + ' available', dr.startsWith('ok'), { o, dr }); await sleep(300); await shot('depart-confirm-' + label); await clickLastIn('modal-panel'); s = await waitFor(x => x.route, 20000, 'route-' + label); }
    await departTo('于阗', 'to-khotan'); s = await settle(x => !x.route && x.city === 'khotan' && !x.activeResult && !x.event, { label: 'to khotan' }); s = await note('arrived-khotan'); await shot('khotan-arrival');
    check('arrived 于阗 routeIndex 2', s.trip.routeIndex === 2, { tick: s.tick, phase: s.phase });
    s = await cityStop('khotan');
    // ---------- 8. 于阗 → 敦煌 (返程) ----------
    await departTo('敦煌', 'to-dunhuang-return'); s = await settle(x => !x.route && x.city === 'dunhuang' && x.trip && x.trip.routeIndex === 3 && !x.activeResult && !x.event, { label: 'to dunhuang return' }); s = await note('arrived-dunhuang-return'); await shot('dunhuang-return-arrival');
    check('arrived 敦煌 (返程) routeIndex 3', s.trip.routeIndex === 3, { tick: s.tick, phase: s.phase });
    s = await cityStop('dunhuang-return');
    // ---------- 9. 敦煌 → 长安 ----------
    await departTo('长安', 'to-changan'); s = await settle(x => !x.route && x.city === 'changan' && x.trip && x.trip.routeIndex === 4 && !x.activeResult && !x.event, { label: 'to changan' }); s = await note('arrived-changan'); await shot('changan-arrival');
    check('arrived 长安: trip phase return_tasks or dusk-pending-rest, returnStatus set', ['return_tasks', 'returned_at_dusk_pending_rest'].includes(s.trip.phase) && s.trip.returnStatus !== null, { phase: s.phase, tripPhase: s.trip.phase, returnStatus: s.trip.returnStatus, tick: s.tick, deadline: s.trip.deadlineTick, grace: s.trip.graceIds });
    if (s.trip.phase === 'returned_at_dusk_pending_rest') { await click('出发', { scope: 'page' }); await sleep(300); await shot('changan-dusk-arrival-panel'); await click('安排歇息'); await sleep(300); await click('留宿客舍'); s = await settle(x => x.trip && x.trip.phase === 'return_tasks' && !x.activeResult && !x.event, { label: 'dusk rest' }); s = await sleepIfDusk('changan-return-tasks'); check('dusk arrival: rest first, then return tasks next morning', s.trip.phase === 'return_tasks', s.trip); }
    // ---------- 10. first-trip return tasks ----------
    s = await settle(x => !x.activeResult && !x.event && !x.visitOpen, { label: 'before return tasks' }); await click('出发', { scope: 'page' }); await sleep(300); await shot('trip-panel-returned'); await click('处理返程事务'); await sleep(300); await shot('return-tasks');
    const rtText = await panelText('secondary-panel'); check('return tasks panel lists 市场/商号 tasks only (commissions are not a return task any more)', /返程事务|市场|商号/.test(rtText || '') && !/返程委托|暂不处理委托/.test(rtText || ''), (rtText || '').slice(0, 200));
    const view = await c.eval(`Silk.trip.returnView(Silk.app.state.progress)`); timeline.push({ label: 'returnView', view });
    if (view.tasks.market === 'pending') { await click('前往市场'); s = await waitFor(x => x.visitOpen); if (s.lots.length) { r = await dispatch('market.sellAll', { visitId: await vid() }); s = await settle(x => !x.activeResult); } await leaveMarket(); s = await settle(x => !x.visitOpen && !x.activeResult && !x.event, { label: 'return market' }); await click('出发', { scope: 'page' }); await sleep(200); await click('处理返程事务'); await sleep(200); }
    for (const task of ['merchant']) { const v2 = await c.eval(`Silk.trip.returnView(Silk.app.state.progress)`); if (v2.tasks[task] === 'pending') { const lbl = '暂不处理商号'; const cr = await click(lbl); s = await settle(x => !x.activeResult && !x.event); timeline.push({ label: 'resolve:' + task, cr }); } }
    const v3 = await c.eval(`Silk.trip.returnView(Silk.app.state.progress)`); check('return tasks ready after processing', v3.ready === true, v3); await shot('return-tasks-ready');
    // ---------- 11. finalize → summary → reload → ack ----------
    s = await settle(x => !x.activeResult && !x.event && !x.visitOpen, { label: 'before finalize' }); await click('出发', { scope: 'page' }); await sleep(200); await click('处理返程事务'); await sleep(200); await click('结束本次商旅'); await sleep(300); const mt = await panelText('modal-panel'); if (mt && /未处理的委托/.test(mt)) await click('仍要结束', { scope: 'modal-panel' });
    s = await waitFor(x => x.activeResult && x.activeResult.kind === 'tripSummary'); s = await note('summary-shown'); await shot('trip-summary');
    const summaryText = await panelText('result-panel'); check('summary shown once, trip phase summary', s.trip.phase === 'summary' && s.trip.hasSummary && /总结|利润|商誉/.test(summaryText || ''), { tripPhase: s.trip.phase, rev: s.rev, cash: s.cash, rep: s.rep });
    const pre = s; s = await reload(); await shot('trip-summary-after-reload'); const summaryText2 = await panelText('result-panel');
    check('reload keeps the same summary (no double reward)', s.activeResult && s.activeResult.kind === 'tripSummary' && s.cash === pre.cash && s.rep === pre.rep && s.rev === pre.rev && summaryText2 === summaryText, { cash: [pre.cash, s.cash], rep: [pre.rep, s.rep], rev: [pre.rev, s.rev], sameText: summaryText2 === summaryText });
    const ackBtn = await clickLastIn('result-panel'); s = await settle(x => !x.activeResult && !x.trip, { label: 'ack summary' }); s = await note('after-summary-ack', { ackBtn });
    check('summary ack closes the trip: trip null, tripHistory 1, no terminal row in active (BUG-14), board kept (COMMISSION v3.0)', s.trip === null && s.tripHistory === 1 && s.commissions.active.every(a => !['completed', 'failed', 'cancelled', 'expired', 'abandoned'].includes(a[1])) && s.commissions.board === pre.commissions.board, { ackBtn, tripHistory: s.tripHistory, active: s.commissions.active, history: s.commissions.history, board: [pre.commissions.board, s.commissions.board] });
    await shot('changan-after-trip');
    const post = s; s = await reload(); check('reload after trip end: no double money/reputation/trip', s.cash === post.cash && s.rep === post.rep && s.tripHistory === 1 && s.trip === null && s.rev === post.rev, { cash: [post.cash, s.cash], rep: [post.rep, s.rep], rev: [post.rev, s.rev] });
    // ---------- 12. idempotency: same sourceId twice, and concurrent double dispatch ----------
    s = await settle(x => !x.activeResult && !x.event && !x.visitOpen, { label: 'before idempotency' }); const t0 = s.tick; const idemCmd = s.phase === '暮' ? ['inn.stay', {}] : ['inn.wait', { ticks: 1 }]; const a1 = await dispatch(idemCmd[0], idemCmd[1], 'idem-rc3-1'); const tickA1 = (await st()).tick; s = await settle(x => !x.activeResult && !x.event); const a2 = await dispatch(idemCmd[0], idemCmd[1], 'idem-rc3-1'); const tickA2 = (await st()).tick; s = await settle(x => !x.activeResult && !x.event);
    check('replayed sourceId is not applied twice', a1.ok && a2.ok && a2.replayed === true && tickA1 === t0 + (idemCmd[0] === 'inn.stay' ? (3 - t0 % 3) : 1) && tickA2 === tickA1, { cmd: idemCmd[0], a1: a1.kind, a2: [a2.kind, a2.replayed], tick: [t0, tickA1, tickA2] });
    s = await settle(x => !x.activeResult && !x.event && !x.visitOpen, { label: 'before double-click' }); const t1 = s.tick; const dbl = s.phase === '暮' ? "Silk.app.dispatch('inn.stay',{})" : "Silk.app.dispatch('inn.wait',{ticks:1})"; const both = await c.eval(`Promise.all([${dbl},${dbl}]).then(r=>r.map(x=>x.replayed),e=>'ERR:'+e.code)`); const tickBoth = (await st()).tick; s = await settle(x => !x.activeResult && !x.event);
    check('double-click (concurrent same command) applies once', tickBoth === t1 + (dbl.includes('inn.stay') ? (3 - t1 % 3) : 1), { both, tick: [t1, tickBoth] });
    // ---------- 13. UI regression spots ----------
    await click('更多', { scope: 'page' }); await sleep(300); await shot('more-panel'); const moreText = await panelText('primary-panel'); await closePrimary();
    await click('柜坊', { scope: 'page' }); await sleep(300); await shot('guifang'); await closePrimary();
    check(mode + ': no horizontal overflow at end', (await overflow()) <= 0, await overflow());
    const errors = c.console.filter(m => m.type === 'error' || m.type === 'exception'), warns = c.console.filter(m => m.type === 'warning' || m.type === 'warn');
    // R34: a media (BGM) fetch that the browser aborts because the page navigates away mid-download (net::ERR_ABORTED, type Media) is not a failed resource
    const bad = c.network.filter(n => n.status !== 200 && n.status !== 304 && n.status !== 206 && !(n.status === 'FAILED' && n.type === 'Media' && n.error === 'net::ERR_ABORTED'));
    check('no console errors/exceptions', errors.length === 0, errors.slice(0, 5)); check('no failed/404 resource requests', bad.length === 0, bad.slice(0, 5));
    check('static server logged no 404', !/404/.test(srv.log), srv.log.split('\n').filter(l => /404/.test(l)).slice(0, 5));
    const final = await note('final');
    fs.writeFileSync(path.join(outDir, 'browser-run-' + mode + '.json'), JSON.stringify({ mode, serveRoot, legacyRuntime, url, viewport: mobile ? '375x812 (touch, DPR2)' : '1280x900', engine: await c.eval('Silk.core.versions'), checks, shots, timeline, console: c.console, warnings: warns.length, network: { total: c.network.length, non200: bad.length, byType: c.network.reduce((m, n) => { m[n.type] = (m[n.type] || 0) + 1; return m; }, {}) }, final }, null, 1));
  } catch (e) { check('run completed without harness error', false, String(e.stack || e).slice(0, 600)); console.log('timeline tail:', JSON.stringify(timeline.slice(-8)).slice(0, 1500)); try { await shot('failure'); } catch (_) { } fs.writeFileSync(path.join(outDir, 'browser-run-' + mode + '.json'), JSON.stringify({ mode, checks, shots, timeline, console: c.console, error: String(e.stack || e) }, null, 1)); }
  finally { await c.close(); srv.stop(); }
  const passed = checks.filter(x => x.ok).length; console.log('browser-run ' + mode + ': ' + passed + '/' + checks.length + ' checks, ' + shots.length + ' screenshots → ' + outDir); process.exitCode = passed === checks.length ? 0 : 1;
})().catch(e => { console.error(e); process.exit(1); });
