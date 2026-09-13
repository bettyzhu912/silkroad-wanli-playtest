'use strict';
// COMMISSION_SYSTEM_MASTER_PATCH v3.0 — real-UI acceptance in headless Chrome (390×844 mobile emulation, real IndexedDB SaveStore, real handlers).
// Phase A: an old-version save (商誉21, old-shape commissions, no board) is written into the page's IndexedDB → the load path migrates it →
//          顶部【委托】shows 0 / 3 and 7 candidates; a candidate is accepted from the detail page; the 开始行程 page shows only the hint line.
// Phase B: a current save at 于阗 with a 精制玉器 ×3 求货 accepted in 敦煌 (arrival 1) and 3 units bought here → 0 / 3 with the reason and a
//          disabled button; the real journey 于阗 → 敦煌 is played in the UI → 3 / 3 · 已齐备, the button is enabled and the delivery settles.
// Usage: node tests/browser/commission-v3-run.js [label] [--root <dir>] [--port <http>] [--cdp <chrome port>]
const fs = require('fs'), path = require('path');
const { launch, startServer, sleep } = require('../tools/cdp');
const { load, driver } = require('../harness');
const root = path.join(__dirname, '..', '..');
const argv = process.argv.slice(2), flag = n => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const label = argv.find((a, i) => !a.startsWith('--') && (i === 0 || !argv[i - 1].startsWith('--'))) || 'commission-v3';
const serveRoot = flag('--root') ? path.resolve(flag('--root')) : root;
const outDir = path.join(root, 'tests', 'results', 'evidence', label); fs.rmSync(outDir, { recursive: true, force: true }); fs.mkdirSync(outDir, { recursive: true });
const checks = []; let shotIndex = 0;
const check = (name, ok, detail) => { checks.push({ name, ok: Boolean(ok), detail: detail === undefined ? '' : String(detail).slice(0, 500) }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  ' + String(detail).slice(0, 220) : '')); };
const S = load({ root: serveRoot }).Silk;
function envelopeOf(d, balanceVersion) { const env = JSON.parse(JSON.stringify(d.envelope())); env.meta = { ...S.core.versions, ...(balanceVersion ? { balanceVersion } : {}), generation: 0, revision: 5 }; env.preferences = { tutorialEnabled: false, soundEnabled: true }; env.ledger = {}; env.pending = null; env.results = {}; env.progress.presentation.tutorialEnabled = false; env.progress.presentation.notices = []; env.progress.presentation.guide = { status: 'done' }; return env; }
// Phase A save: 商誉 21 at 长安, no trip, the pre-v3 commission shape (pool / starterGenerated / poolTripId), no arrival tracking, departureDraft null.
function buildOldSave() {
  const d = driver(S, 951); d.p.cash = 500; d.p.inventory.provisions = 20; d.p.reputation.value = 21; d.quietCity(120); d.quietRoute(120);
  const env = envelopeOf(d, '2026-09-13-qiyuan-final'); const p = env.progress;
  p.commissions = { pool: [], active: [], results: [], history: [], starterGenerated: false, poolTripId: null, generatedReputation: null, templateHistory: [] }; delete p.world.arrivalSequence; delete p.world.currentArrival; p.departureDraft = null;
  return env;
}
// Phase B save: the CASE 06 situation right before the return leg — accepted in 敦煌 (arrival 1), 3 精制玉器 bought in 于阗 (arrival 2).
function buildCase06Save() {
  const d = driver(S, 952); d.p.cash = 3000; d.p.inventory.provisions = 40; d.p.reputation.value = 21; d.quietCity(200); d.quietRoute(200); d.p.merchant.suppliers['精制玉器'] = { stage: 'established', discountRate: 0, sourceCity: 'khotan' };
  d.run('trip.begin'); d.run('trip.depart', { acknowledgeSupplyWarning: true }); d.journeyToArrival();
  d.p.commissions.board.push({ commissionId: 'c-jade', templateId: 'DH-E-W01', title: '求货 · 精制玉器', text: '敦煌有客商愿高价收三件精制玉器，验货严格。', originalAttributesText: '贵重+稀有', type: 'wanted', scale: 'entrusted', goodId: '精制玉器', quantity: 3, requiredSlots: 3, sourceCity: 'dunhuang', pickupCity: null, procurementCity: null, deliveryCity: 'dunhuang', segmentCount: 0, urgent: false, handoffPhase: null, valuable: true, fragile: false, rare: true, longHaul: false, replaceable: true, rewardCash: 900, referencePrice: 250, rewardRate: .2, reputationReward: 3, status: 'available', urgentArrivalTick: null, urgentWindow: null, postedTick: d.p.world.tick });
  d.run('commission.accept', { commissionId: 'c-jade' }); d.ack();
  while (S.time.phase(d.p) === 2) d.overnight('camp'); d.run('trip.depart', { acknowledgeSupplyWarning: true }); d.journeyToArrival();
  while (S.time.phase(d.p) === 2) d.overnight('stay'); d.run('market.enter'); const v = d.p.market.visit; d.run('market.buy', { visitId: v.id, goodId: '精制玉器', quantity: 3 }); d.ack(); d.run('market.leave', { visitId: v.id }); d.ack(); d.resolveEvent(); d.ack();
  while (S.time.phase(d.p) === 2) d.overnight('stay');
  const env = envelopeOf(d); S.core.validate(env); return env;
}
(async () => {
  const port = Number(flag('--port')) || 8320, srv = startServer(port, serveRoot); await sleep(500);
  const c = await launch({ port: Number(flag('--cdp')) || 9861, width: 390, height: 844, mobile: true });
  const ev = js => c.eval(js), url = 'http://127.0.0.1:' + port + '/';
  const shot = async name => { const f = String(++shotIndex).padStart(2, '0') + '-' + name + '.png'; await c.screenshot(path.join(outDir, f)); return f; };
  const waitFor = async (js, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(js)) return true; await sleep(80); } return false; };
  const busyWait = () => waitFor('window.Silk&&Silk.app&&!Silk.app.busy', 8000);
  const clickBtn = (scope, text, exact = true) => ev(`(()=>{const s=document.querySelector(${JSON.stringify(scope)})||document;const b=[...s.querySelectorAll('button')].find(b=>!b.disabled&&b.offsetParent!==null&&(${exact}?b.textContent.trim()===${JSON.stringify(text)}:b.textContent.trim().startsWith(${JSON.stringify(text)})));if(!b)return false;b.click();return true})()`);
  const hud = id => ev(`(()=>{const b=document.querySelector('.hud-tool[data-panel="${id}"]');if(!b)return false;b.click();return true})()`);
  const hotspot = id => ev(`(()=>{const h=document.querySelector('.city-scene .city-hotspot[data-hotspot="${id}"]');if(!h)return false;h.click();return true})()`);
  const panelText = id => ev(`(()=>{const p=document.querySelector('[data-panel-id="${id}"]');return p&&p.offsetParent!==null?p.innerText:null})()`);
  const closePanel = id => ev(`(()=>{const p=document.querySelector('[data-panel-id="${id}"]');const b=p&&p.querySelector('button[aria-label="关闭"]');if(!b)return false;b.click();return true})()`);
  const closeAll = async () => { for (let i = 0; i < 6; i++) { const r = await ev(`(()=>{const secs=[...document.querySelectorAll('section.paper-panel')].filter(x=>!x.hidden&&x.offsetParent!==null);if(!secs.length)return false;const s=secs[secs.length-1];const close=s.querySelector('button[aria-label="关闭"]');if(close&&close.offsetParent!==null){close.click();return true}const fb=[...s.querySelectorAll('button')].filter(b=>!b.disabled&&b.offsetParent!==null&&/^(继续|离开客舍|返回|离开市场|知道了)/.test(b.textContent.trim()));if(fb.length){fb[fb.length-1].click();return true}return false})()`); if (!r) break; await sleep(200); } };
  const st = () => ev(`(()=>{const p=Silk.app.state.progress;const s=Silk.commissions.snapshot(p);return {tick:p.world.tick,phase:p.world.tick%3,city:p.world.city,route:Boolean(p.world.route),cash:p.cash,rep:p.reputation.value,rev:Silk.app.state.meta.revision,trip:p.trip?p.trip.phase:null,board:s.board.length,capacity:s.capacity,activeCount:s.activeCount,active:s.active.map(a=>({id:a.commissionId,status:a.status,good:a.goodId,deadline:a.deadlineWorldTick,seq:a.acceptedAtArrivalSequence,delivery:{ok:a.delivery.ok,code:a.delivery.code,have:a.delivery.have,need:a.delivery.need}})),arrival:p.world.currentArrival,seqNow:p.world.arrivalSequence,history:p.commissions.history.map(h=>[h.commissionId,h.status]),results:p.commissions.results.length,activeResult:p.presentation.activeResult?p.presentation.activeResult.kind:null,event:p.eventSession&&p.eventSession.status!=='ACKNOWLEDGED'?p.eventSession.status+':'+p.eventSession.eventId:null,migrated:p.commissions.boardMigrated||null,balance:Silk.app.state.meta.balanceVersion}})()`);
  const inject = async env => { await c.navigate(url); await sleep(900); await ev('new Promise(r=>{const t=setInterval(()=>{if(window.Silk&&Silk.app&&Silk.app.state){clearInterval(t);r()}},100)})');
    await ev(`new Promise((res,rej)=>{const q=indexedDB.open('silkroad-rebuild-v1',2);q.onsuccess=()=>{const db=q.result;const tx=db.transaction('state','readwrite');tx.objectStore('state').put(${JSON.stringify(env)},'current');tx.oncomplete=()=>{db.close();res(true)};tx.onerror=()=>rej(tx.error)};q.onerror=()=>rej(q.error)})`);
    await c.navigate(url); await sleep(1200); await ev('new Promise(r=>{const t=setInterval(()=>{if(window.Silk&&Silk.app&&Silk.app.state&&Silk.app.state.progress){clearInterval(t);r()}},100)})'); await busyWait(); await sleep(400); return st(); };
  // generic driver for the journey: acknowledge results, answer events with the first enabled choice, wait for the route timer
  async function settle(pred, max = 300) { for (let i = 0; i < max; i++) { await busyWait(); const s = await st(); if (pred(s)) return s;
      if (s.activeResult) { const r = await ev(`(()=>{const box=[...document.querySelectorAll('section.paper-panel.result-panel, [data-panel-id="result"]')].find(x=>x.offsetParent!==null);if(!box)return false;const btns=[...box.querySelectorAll('button')].filter(b=>!b.disabled&&b.offsetParent!==null);if(!btns.length)return false;btns[btns.length-1].click();return true})()`); if (!r) await ev(`Silk.app.dispatch('result.ack',{resultId:Silk.app.state.progress.presentation.activeResult.id}).catch(()=>null)`); await sleep(200); continue; }
      if (s.event && s.event.startsWith('AWAITING_CHOICE')) { await ev(`(()=>{const grp=[...document.querySelectorAll('.route-event-choices')].find(g=>g.offsetParent!==null);const b=grp&&[...grp.querySelectorAll('button')].find(x=>!x.disabled);if(b)b.click();return Boolean(b)})()`); await sleep(250); continue; }
      if (s.event && s.event.startsWith('AWAITING_SKILL')) { await clickBtn('body', '跳过'); await sleep(200); await clickBtn('section.paper-panel.modal-panel', '确认跳过'); await sleep(300); continue; }
      await sleep(s.route ? 400 : 250); }
    throw new Error('settle timeout ' + JSON.stringify(await st()).slice(0, 300)); }
  try {
    // ================= Phase A: old save → migrated board; accept from 顶部【委托】; departure page hint =================
    let s = await inject(buildOldSave());
    check('A0 old save (商誉21, old commission shape) loads and is migrated on load: balanceVersion current, board 7, 0 / 3, no trip, arrival sequence 0', s.balance === S.core.versions.balanceVersion && s.board === 7 && s.capacity === 3 && s.activeCount === 0 && s.trip === null && s.seqNow === 0 && s.migrated && s.migrated.added === 7, JSON.stringify({ balance: s.balance, board: s.board, cap: s.capacity, migrated: s.migrated }));
    await shot('A-city-after-migration');
    await hud('commission'); await sleep(500); await busyWait(); let text = await panelText('commission');
    const cards = await ev(`(()=>{const p=document.querySelector('[data-panel-id="commission"]');return {groups:[...p.querySelectorAll('[data-commission-group]')].map(g=>[g.dataset.commissionGroup,g.querySelectorAll('[data-commission-id]').length]),text:p.innerText}})()`);
    check('A1 顶部【委托】: 同时进行 0 / 3, 可接委托 lists the 7 migrated candidates, no 出发前 / 本商期 / 选定 wording', /同时进行\s*0 \/ 3/.test(text) && cards.groups.some(g => g[0] === 'board' && g[1] === 7) && !/出发前|本商期委托|选定|到达.*后可承接/.test(text), JSON.stringify(cards.groups) + ' ' + text.slice(0, 80));
    await shot('A-commission-board-7');
    await ev(`(()=>{const card=document.querySelector('[data-panel-id="commission"] [data-commission-group="board"] [data-commission-id]');const b=[...card.querySelectorAll('button')].find(x=>x.textContent.trim()==='查看委托');b.click()})()`); await sleep(500); await busyWait();
    text = await panelText('commission-detail'); check('A2 detail page of a candidate: 承接委托 available (any city, no posting-stop text), note 接取后 30 日内完成 (§6.4)', /承接委托/.test(text) && /接取后 30 日内完成/.test(text) && !/到达.*后可承接|本期已无法承接|30个世界日/.test(text), text.slice(0, 160));
    await shot('A-candidate-detail');
    const beforeAccept = await st(); const ok = await clickBtn('[data-panel-id="commission-detail"]', '承接委托'); await sleep(600); await busyWait(); s = await settle(x => !x.activeResult);
    check('A3 accept from the detail page: 1 / 3, board 6, deadline = accepted + 90, commission stays in the same 长安 (no trip needed)', ok && s.activeCount === 1 && s.board === 6 && s.trip === null && s.active[0].deadline === beforeAccept.tick + 90 && s.active[0].seq === 0, JSON.stringify(s.active));
    await closeAll(); await hud('commission'); await sleep(500); await busyWait(); await shot('A-commission-after-accept'); await closeAll();
    await hotspot('depart'); await sleep(400); await busyWait(); await shot('A-depart-panel'); await clickBtn('[data-panel-id="trip"]', '敦煌'); await sleep(700); await busyWait();
    text = await panelText('departure'); s = await st();
    check('A4 【开始行程】page: only the one hint line "有委托可接，可在顶部【委托】中查看。", no candidate list / 选定 / accept button; trip still null (0 tick)', text && /开始行程/.test(text) && (text.match(/有委托可接，可在顶部【委托】中查看。/g) || []).length === 1 && !/出发前委托|选定|承接委托|查看委托/.test(text) && s.trip === null && s.tick === beforeAccept.tick, (text || '').slice(0, 200));
    await shot('A-departure-hint'); await closeAll();
    s = await st(); const rev = s.rev; await c.navigate(url); await sleep(1000); await busyWait(); s = await st();
    check('A5 reload on the same day: same 6 candidates + 1 active, no second roll', s.board === 6 && s.activeCount === 1 && s.rev === rev, JSON.stringify([s.board, s.activeCount, s.rev, rev]));
    // ================= Phase B: CASE 06 in the real UI =================
    s = await inject(buildCase06Save());
    check('B0 CASE 06 save loads at 于阗 (arrival 2) with the 精制玉器 ×3 commission accepted in 敦煌 (arrival 1) and 3 units bought here', s.city === 'khotan' && s.seqNow === 2 && s.active.length === 1 && s.active[0].seq === 1 && s.active[0].good === '精制玉器', JSON.stringify(s.active));
    await hud('commission'); await sleep(500); await busyWait(); await ev(`(()=>{const card=document.querySelector('[data-panel-id="commission"] [data-commission-group="active"] [data-commission-id]');const b=[...card.querySelectorAll('button')].find(x=>x.textContent.trim()==='查看委托');b.click()})()`); await sleep(500); await busyWait();
    text = await panelText('commission-detail'); const btnKhotan = await ev(`(()=>{const p=document.querySelector('[data-panel-id="commission-detail"]');const b=[...p.querySelectorAll('button')].find(x=>x.textContent.trim()==='交付委托');return b?{disabled:b.getAttribute('aria-disabled')==='true'||b.disabled,cls:b.className}:null})()`);
    check('B1 in 于阗: 货物准备 0 / 3 (wrong city) and the 交付委托 button is unavailable — card text and button agree', /货物准备\s*0 \/ 3/.test(text) && btnKhotan && btnKhotan.disabled && /请前往敦煌交付/.test(text), JSON.stringify(btnKhotan) + ' ' + (text.match(/货物准备[^\n]*/) || [''])[0]);
    await shot('B-khotan-detail-0-of-3'); await closeAll();
    // play the return leg 于阗 → 敦煌 in the UI
    s = await st(); if (s.phase === 2) { await hotspot('inn'); await sleep(400); await clickBtn('[data-panel-id="inn"]', '留宿客舍', false); s = await settle(x => x.phase === 0 && !x.activeResult && !x.event); await closeAll(); }
    await hotspot('depart'); await sleep(400); await busyWait(); const dep = await clickBtn('[data-panel-id="trip"]', '敦煌'); await sleep(500); await busyWait(); await ev(`(()=>{const m=[...document.querySelectorAll('section.paper-panel.modal-panel')].find(x=>!x.hidden&&x.offsetParent!==null);const btns=m?[...m.querySelectorAll('button')].filter(b=>!b.disabled&&b.offsetParent!==null):[];if(btns.length)btns[btns.length-1].click();return btns.length})()`);
    s = await settle(x => x.route || x.city === 'dunhuang'); check('B2 departed 于阗 → 敦煌 in the UI', dep && (s.route || s.city === 'dunhuang'), JSON.stringify({ route: s.route, city: s.city }));
    await shot('B-journey'); s = await settle(x => !x.route && x.city === 'dunhuang' && !x.activeResult && !x.event, 600);
    check('B3 arrived 敦煌 = arrival 3 > accepted at 1; eligibleCargoCounts 精制玉器 = 3; the domain result is ok 3 / 3', s.seqNow === 3 && s.arrival && s.arrival.city === 'dunhuang' && s.arrival.eligibleCargoCounts['精制玉器'] === 3 && s.active[0].delivery.ok === true && s.active[0].delivery.have === 3, JSON.stringify({ seq: s.seqNow, arrival: s.arrival, delivery: s.active[0].delivery }));
    await closeAll(); await hud('commission'); await sleep(500); await busyWait(); text = await panelText('commission');
    check('B4 顶部【委托】card shows 货物准备 3 / 3 · 已齐备', /货物准备\s*3 \/ 3 · 已齐备/.test(text || ''), (text || '').match(/货物准备[^\n]*/));
    await shot('B-dunhuang-commission-3-of-3');
    await ev(`(()=>{const card=document.querySelector('[data-panel-id="commission"] [data-commission-group="active"] [data-commission-id]');const b=[...card.querySelectorAll('button')].find(x=>x.textContent.trim()==='查看委托');b.click()})()`); await sleep(500); await busyWait();
    text = await panelText('commission-detail'); const btnDunhuang = await ev(`(()=>{const p=document.querySelector('[data-panel-id="commission-detail"]');const b=[...p.querySelectorAll('button')].find(x=>x.textContent.trim()==='交付委托');return b?{disabled:b.getAttribute('aria-disabled')==='true'||b.disabled,cls:b.className}:null})()`);
    check('B5 detail page in 敦煌: 3 / 3 · 已齐备 and the 交付委托 button is enabled (same result as the card and the domain)', /货物准备\s*3 \/ 3 · 已齐备/.test(text) && btnDunhuang && !btnDunhuang.disabled, JSON.stringify(btnDunhuang));
    await shot('B-dunhuang-detail-enabled');
    const cashBefore = s.cash, repBefore = s.rep; const clicked = await clickBtn('[data-panel-id="commission-detail"]', '交付委托'); await sleep(700); await busyWait(); s = await st();
    check('B6 delivery settles: result commissionDelivered, cash +900, 商誉 +3, 3 units removed, eligible count 0, commission completed in history', clicked && s.activeResult === 'commissionDelivered' && s.cash === cashBefore + 900 && s.rep === repBefore + 3 && s.arrival.eligibleCargoCounts['精制玉器'] === 0 && s.activeCount === 0 && s.history.some(h => h[0] === 'c-jade' && h[1] === 'completed'), JSON.stringify({ cash: [cashBefore, s.cash], rep: [repBefore, s.rep], history: s.history, result: s.activeResult }));
    await shot('B-delivered-result');
    s = await settle(x => !x.activeResult); const revB = s.rev; await c.navigate(url); await sleep(1000); await busyWait(); s = await st();
    check('B7 reload after delivery: no double reward, commission stays completed', s.cash === cashBefore + 900 && s.rep === repBefore + 3 && s.activeCount === 0 && s.rev === revB, JSON.stringify([s.cash, s.rep, s.rev]));
  } catch (e) { check('run completed without exception', false, e.stack || String(e)); try { await shot('exception'); } catch (_) { } }
  finally {
    const passed = checks.filter(x => x.ok).length;
    fs.writeFileSync(path.join(outDir, 'checks.json'), JSON.stringify({ engine: S.core.versions, run: new Date().toISOString(), passed, total: checks.length, checks }, null, 1));
    console.log('commission v3.0 browser: ' + passed + '/' + checks.length + ' → ' + outDir);
    try { await c.close(); } catch (_) { } try { srv.stop(); } catch (_) { }
    process.exit(passed === checks.length ? 0 : 1);
  }
})();
