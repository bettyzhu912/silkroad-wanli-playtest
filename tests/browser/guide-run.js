'use strict';
// NEW_PLAYER_GUIDE_CLARITY_REPLACEMENT_v1.1 — real-browser acceptance (headless Chrome, 390×844 mobile emulation, real store, real pages).
// A. entry card on the first 长安 map; 自行探索 → free map, no legacy first-use hints on the real pages, no replay after reload.
// B. guided tour: 3 HUD callouts, then every must-enter item: the spotlit real entrance is clicked, the real page opens (real state, real
//    time), the in-page callout is shown, the page is closed by its own control and the next item follows; 补给 → 下一步 → 商品 inside ONE
//    market visit (leaving without a trade = 0 tick); 消息 rings 历史商报 (Round 28 sub-tab); 出发 shows the real 出发 / 开始行程 pages with 开始行程 held;
//    更多 rings 玩法说明; a reload in the middle resumes; a double click advances once; finish card → 开始行动 → clean map, no v1.0 text anywhere.
// C. replacement: a save carrying the v1.0 state (mid-tour) shows only v1.1 (restarted once); a v1.0 skipped save never replays.
// Usage: node tests/browser/guide-run.js [label] [--root <dir>] [--port <http>] [--cdp <chrome port>]
const fs = require('fs'), path = require('path');
const { launch, startServer, sleep } = require('../tools/cdp');
const root = path.join(__dirname, '..', '..');
const argv = process.argv.slice(2), flag = n => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const label = argv.find((a, i) => !a.startsWith('--') && (i === 0 || !argv[i - 1].startsWith('--'))) || 'guide';
const serveRoot = flag('--root') ? path.resolve(flag('--root')) : root;
const outDir = path.join(root, 'tests', 'results', 'evidence', 'guide-' + label); fs.rmSync(outDir, { recursive: true, force: true }); fs.mkdirSync(outDir, { recursive: true });
const checks = []; let shotIndex = 0;
const check = (name, ok, detail) => { checks.push({ name, ok: Boolean(ok), detail: detail === undefined ? '' : String(detail).slice(0, 300) }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  ' + String(detail).slice(0, 200) : '')); };
const AUTH = ['铜钱', '时辰', '商誉', '行囊', '委托', '消息', '商情', '补给', '商品', '柜坊', '客舍', '营生', '商号', '出发', '玩法说明'];
const V10_TEXT = /这是你当前可以使用的钱财|暮后便将迎来新的一日|点击地图上的放大镜|商号需要满足一定条件后才会开放|本游戏的主要信息和玩法已经介绍完毕/;
(async () => {
  const port = Number(flag('--port')) || 8190, srv = startServer(port, serveRoot); await sleep(500);
  const c = await launch({ port: Number(flag('--cdp')) || 9410, width: 390, height: 844, mobile: true });
  const ev = js => c.eval(js), url = 'http://127.0.0.1:' + port + '/';
  const shot = async name => { const f = String(++shotIndex).padStart(2, '0') + '-' + name + '.png'; await c.screenshot(path.join(outDir, f)); return f; };
  const clickText = (text, scope) => ev(`(()=>{const s=${scope ? 'document.querySelector(' + JSON.stringify(scope) + ')' : 'document'};if(!s)return false;const b=[...s.querySelectorAll('button')].find(b=>!b.disabled&&b.offsetParent!==null&&b.textContent.trim()===${JSON.stringify(text)});if(!b)return false;b.click();return true})()`);
  const waitFor = async (js, ms = 8000, step = 100) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(js)) return true; await sleep(step); } return false; };
  const busyWait = () => waitFor('!Silk.app.busy', 8000, 50);
  const settle = async () => { await busyWait(); await sleep(250); await busyWait(); };
  const guide = () => ev('(()=>{const p=Silk.app.state.progress;const v=Silk.guide.view(p);const L=Silk.guideUI.test.layer();const card=L&&!L.hidden?L.querySelector(".guide-card"):null;const st=Silk.ui.getState();return {status:v.status,step:v.step,phase:v.phase,atFinish:v.atFinish,current:v.current?v.current.id:null,visible:Boolean(L&&!L.hidden),mode:Silk.guideUI.test.mode(),title:card?(card.querySelector("h3")||{}).textContent||"":"",text:card?card.innerText:"",buttons:card?[...card.querySelectorAll("button")].map(b=>b.textContent.trim()):[],spot:(()=>{const s=L&&!L.hidden?L.querySelector(".guide-spot"):null;if(!s)return null;const r=s.getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}})(),rings:L&&!L.hidden?L.querySelectorAll(".guide-spot").length:0,holds:L&&!L.hidden?L.querySelectorAll(".guide-hold").length:0,inside:Boolean(L&&L.classList.contains("guide-inside")),panel:st.primary||null,secondary:st.secondary||null,result:p.presentation.activeResult?p.presentation.activeResult.kind:null,notices:p.presentation.notices.length,tutorialNotices:p.presentation.notices.filter(n=>n.kind==="tutorial").length,cash:p.cash,tick:p.world.tick,journal:p.journal.length,visit:Boolean(p.market.visit&&!p.market.visit.settled),trip:Boolean(p.trip),version:(p.presentation.guide||{}).version||null}})()');
  const targetRect = id => ev(`(()=>{const t=Silk.guideUI.test.target(${JSON.stringify(id)});if(!t)return null;const r=t.getBoundingClientRect();const at=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height),text:t.textContent.trim().slice(0,12),hit:at?(t.contains(at)?'target':(at.className||at.tagName)):'none'}})()`);
  const pointerClick = id => ev(`(()=>{const t=Silk.guideUI.test.target(${JSON.stringify(id)});if(!t)return 'none';const r=t.getBoundingClientRect();const at=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);if(!at)return 'none';if(t.contains(at)){at.click();return 'target'}return at.className||at.tagName})()`);
  const closeTop = () => ev(`(()=>{const secs=[...document.querySelectorAll('section.paper-panel')].filter(x=>!x.hidden&&x.offsetParent!==null);if(!secs.length)return 'none';const s=secs[secs.length-1];const close=s.querySelector('.panel-header .close-button');if(close&&close.offsetParent!==null){close.click();return 'close:'+s.dataset.panelId}const fb=[...s.querySelectorAll('.panel-footer button')].filter(b=>!b.disabled&&b.offsetParent!==null&&/^(离开客舍|离开市场|离开商号|返回)/.test(b.textContent.trim()));if(fb.length){fb[0].click();return 'footer:'+fb[0].textContent.trim()}return 'stuck:'+s.dataset.panelId})()`);
  const ackResult = async () => { for (let i = 0; i < 4; i++) { const r = await ev(`(()=>{const p=Silk.app.state.progress;if(!p.presentation.activeResult)return false;const box=[...document.querySelectorAll('section.paper-panel.result-panel, [data-panel-id="result"]')].find(x=>x.offsetParent!==null);const btns=box?[...box.querySelectorAll('button')].filter(b=>!b.disabled&&b.offsetParent!==null):[];if(btns.length){btns[btns.length-1].click();return true}Silk.ui.dispatch('result.ack',{resultId:p.presentation.activeResult.id});return true})()`); if (!r) return; await settle(); } };
  const pageText = () => ev('document.body.innerText');
  const newGame = async () => { await ev('new Promise(r=>{const t=setInterval(()=>{if(window.Silk&&Silk.app&&Silk.app.state){clearInterval(t);r()}},100)})'); if (await ev('Boolean(Silk.app.state.progress)')) { await ev("Silk.ui.dispatch('game.reset')"); await busyWait(); await sleep(400); } await clickText('启程'); await ev('new Promise(r=>{const t=setInterval(()=>{const p=Silk.app.state.progress;if(p&&p.world){clearInterval(t);r()}},100)})'); await settle(); await sleep(300); };
  const realReload = async () => { await c.navigate(url); await sleep(1200); await ev('new Promise(r=>{const t=setInterval(()=>{if(window.Silk&&Silk.app&&Silk.app.state&&Silk.app.state.progress){clearInterval(t);r()}},100)})'); await waitFor('!Silk.app.busy', 10000); await sleep(500); };
  const injectGuideState = async g => { await ev(`new Promise((res,rej)=>{const q=indexedDB.open('silkroad-rebuild-v1',2);q.onsuccess=()=>{const db=q.result;const tx=db.transaction('state','readwrite');const st=tx.objectStore('state');const get=st.get('current');get.onsuccess=()=>{const env=get.result;env.progress.presentation.guide=${JSON.stringify(g)};env.meta.revision++;st.put(env,'current');};tx.oncomplete=()=>{db.close();res(true)};tx.onerror=()=>rej(tx.error)};q.onerror=()=>rej(q.error)})`); await realReload(); };
  const errors = [];
  try {
    await c.navigate(url); await sleep(900);
    // ---------------- A. entry card; 自行探索; no legacy hints on real pages
    await newGame(); let g = await guide();
    check('A first 长安 map shows the entry card with exactly 按指引开始 / 自行探索; map + HUD behind it', g.status === 'pending' && g.visible && g.mode === 'entry' && g.buttons.join('|') === '按指引开始|自行探索' && (await ev('!document.querySelector(".global-hud").hidden && !document.querySelector(".city-scene").hidden')), JSON.stringify({ status: g.status, buttons: g.buttons })); await shot('entry-card');
    check('A no old home-screen start choice, no tutorial notices, no preparation task', (await ev('!document.querySelector(".home-choice")')) && g.tutorialNotices === 0 && !/去市场看看/.test(await pageText()));
    await clickText('自行探索'); await settle(); g = await guide();
    check('A 自行探索 → skipped: overlay gone, no panel opened, no notice, no recommendation', g.status === 'skipped' && !g.visible && !g.panel && !g.secondary && g.tutorialNotices === 0 && !/先去|去市场看看|推荐|下一步/.test(await pageText()), JSON.stringify({ status: g.status, visible: g.visible })); await shot('explore-map');
    for (const [open, panel, legacy] of [[`document.querySelector('.city-hotspot[data-hotspot="market"]').click()`, 'market', /市场与行囊|价格因城市和世界日变化/], [`document.querySelector('.city-hotspot[data-hotspot="guifang"]').click()`, 'guifang', /这里可办理本地寄存/], [`document.querySelector('.city-hotspot[data-hotspot="work"]').click()`, 'work', /酒肆诗令》正式完成耗时/], [`document.querySelector('.hud-tool[data-panel="commission"]').click()`, 'commission', /捎货是把指定/], [`document.querySelector('.hud-tool[data-panel="merchant_business"]').click()`, 'merchant_business', /商号教学|首次商号/]]) {
      await ev(open); await settle(); g = await guide(); const t = await pageText(); check('A first ' + panel + ' entry after 自行探索: real page, no legacy first-use hint, no guide overlay', g.panel === panel && g.tutorialNotices === 0 && !g.visible && !legacy.test(t), JSON.stringify({ panel: g.panel, tut: g.tutorialNotices }));
      await closeTop(); await settle(); await ackResult();
    }
    await realReload(); g = await guide(); check('A reload after 自行探索: still no entry card (no replay)', g.status === 'skipped' && !g.visible);
    // ---------------- B. guided tour
    await newGame(); g = await guide(); check('B new game again → entry card', g.status === 'pending' && g.visible && g.mode === 'entry');
    await clickText('按指引开始'); await settle(); g = await guide();
    check('B 按指引开始 → item 1 铜钱, spotlight on the HUD money, 下一步 + 跳过导览', g.status === 'active' && g.step === 0 && g.current === 'hud_money' && g.title === '铜钱' && g.spot && g.spot.w > 20 && g.buttons.join('|') === '跳过导览|下一步', JSON.stringify({ title: g.title, buttons: g.buttons })); await shot('item-01-money');
    const seen = []; let tickBad = false, overlapBad = null, v10Bad = false;
    const tick0 = (await guide()).tick, cash0 = (await guide()).cash;
    for (let i = 0; i < 15; i++) {
      g = await guide(); const def = await ev(`Silk.guide.STEPS[${i}]`); const tr = await targetRect(def.id);
      const copyOk = g.title === def.title && g.text.includes(def.copy.split('\n')[0]) && new RegExp('\\b' + (i + 1) + ' / 15\\b').test(g.text);
      const spotOk = tr && g.spot && Math.abs(g.spot.x - (tr.x - 6)) <= 2 && Math.abs(g.spot.y - (tr.y - 6)) <= 2 && tr.w > 0 && tr.h > 0;
      const cardRect = await ev('(()=>{const c=document.querySelector(".guide-card");if(!c)return null;const r=c.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})()');
      const overlap = tr && cardRect && !(cardRect.y >= tr.y + tr.h || cardRect.y + cardRect.h <= tr.y || cardRect.x >= tr.x + tr.w || cardRect.x + cardRect.w <= tr.x);
      if (/tick/i.test(g.text)) tickBad = true; if (V10_TEXT.test(g.text)) v10Bad = true; if (overlap && !overlapBad) overlapBad = def.id;
      const row = { id: def.id, title: g.title, copyOk, spotOk, overlap, buttons: g.buttons.join('|'), phase: g.phase }; seen.push(row);
      if (def.kind === 'hud') {
        if (i === 1) { await ev(`(()=>{const b=document.querySelector('.guide-card .guide-next');b.click();b.click();})()`); await settle(); const h = await guide(); check('B double-click on 下一步 advances exactly one item (2 → 3)', h.step === 2, JSON.stringify({ step: h.step })); continue; }
        await clickText('下一步'); await settle(); continue;
      }
      // must-enter item: the spotlit real entrance is clickable → the real page opens → in-page callout
      row.enterButtons = g.buttons.join('|');
      if (i === 3) await shot('item-04-pack-map');
      const hit = await pointerClick(def.id); await settle(); let h = await guide();
      row.hit = hit; row.opened = h.panel; row.insideVisible = h.visible && h.inside && h.mode === 'inside'; row.insideTitle = h.title;
      if (i === 3) await shot('item-04-pack-inside'); if (i === 4) await shot('item-05-commission-inside'); if (i === 5) { row.rings = h.rings; await shot('item-06-message-inside'); } if (i === 6) await shot('item-07-inspect-inside');
      if (def.id === 'market_supplies') {
        row.rings = h.rings; await shot('item-08-supplies-inside');
        check('B 市场: one real entry (real visit, 0 tick without a trade), 补给 callout inside with a ring on the provisions card and 下一步', h.panel === 'market' && h.visit && h.inside && h.current === 'market_supplies' && h.phase === 'inside' && h.rings === 1 && h.buttons.join('|') === '跳过导览|下一步' && h.tick === tick0, JSON.stringify({ panel: h.panel, visit: h.visit, rings: h.rings, buttons: h.buttons, tick: h.tick }));
        await clickText('下一步', '.guide-layer'); await settle(); h = await guide(); await shot('item-09-goods-inside');
        check('B 商品 continues inside the SAME market visit (no second entry): copy shown, ring on a goods card, no 下一步 (leaving continues)', h.panel === 'market' && h.visit && h.current === 'market_goods' && h.phase === 'inside' && h.text.includes('普通商品也在市场买卖') && h.rings === 1 && h.buttons.join('|') === '跳过导览' && h.tick === tick0, JSON.stringify({ current: h.current, phase: h.phase, rings: h.rings, buttons: h.buttons }));
        seen.push({ id: 'market_goods', title: h.title, copyOk: h.title === '商品' && /2 \/ 15|9 \/ 15/.test(h.text) && h.text.includes('普通商品也在市场买卖'), spotOk: true, overlap: false, buttons: h.buttons.join('|'), phase: 'inside', sameVisit: true });
        await clickText('离开市场'); await settle(); await ackResult(); h = await guide();
        check('B 离开市场 without a trade: visit closed, still 晨 of day 1 (0 tick), tour continues with 柜坊 on the map', !h.visit && h.tick === tick0 && h.current === 'guifang' && h.phase === 'intro' && h.visible && h.mode === 'map', JSON.stringify({ tick: h.tick, current: h.current, phase: h.phase }));
        i = 8; continue;   // the loop's next iteration is item 10 柜坊 (index 9)
      }
      if (def.id === 'depart') {
        check('B 出发: the real 出发 page opens (destination choice, real 粮草), in-page callout', h.panel === 'trip' && h.inside && h.current === 'depart' && h.phase === 'inside' && !h.trip, JSON.stringify({ panel: h.panel, trip: h.trip })); await shot('item-14-depart-page');
        await clickText('敦煌', '[data-panel-id="trip"]'); await settle(); h = await guide();
        const holdHit = await ev(`(()=>{const b=Silk.guideUI.test.hold('departure.start');if(!b)return 'no-button';const r=b.getBoundingClientRect();const at=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return at&&at.closest('.guide-hold')?'held':(at?at.className:'none')})()`);
        check('B 出发 → 敦煌: the real 开始行程 preparation page (0 tick, no trip), 【开始行程】 is held by the tour — nothing departs', h.panel === 'departure' && h.inside && !h.trip && h.tick === tick0 && h.holds === 1 && holdHit === 'held', JSON.stringify({ panel: h.panel, holds: h.holds, holdHit, trip: h.trip })); await shot('item-14-departure-held');
      }
      if (def.id === 'more_help') {
        check('B 更多: real page, ring on the 玩法说明 entry', h.panel === 'more' && h.inside && h.rings === 1, JSON.stringify({ panel: h.panel, rings: h.rings })); await shot('item-15-more-inside');
        const helpOpened = await ev(`(()=>{const b=[...document.querySelectorAll('[data-panel-id="more"] button.menu-entry')].find(x=>x.textContent.includes('玩法说明'));if(!b)return false;b.click();return true})()`); await settle(); const hh = await guide(); const helpText = await ev('(()=>{const s=document.querySelector(\'[data-panel-id="help"]\');return s?s.innerText:""})()');
        check('B 玩法说明 opens as the real help page (callout waits underneath), carries the rules', helpOpened && hh.secondary === 'help' && /玩法说明/.test(helpText) && /市场/.test(helpText) && !hh.visible, JSON.stringify({ secondary: hh.secondary, visible: hh.visible })); await shot('item-15-help-page');
        await closeTop(); await settle(); h = await guide(); check('B back from 玩法说明: the in-page callout is back on 更多 (same item)', h.panel === 'more' && h.current === 'more_help' && h.phase === 'inside' && h.visible, JSON.stringify({ panel: h.panel, current: h.current }));
      }
      if (i === 9) { await realReload(); h = await guide(); check('B reload while inside 柜坊: the tour resumes with the next item on the map (no replay, no v1.0 text)', h.status === 'active' && h.current === 'inn' && h.phase === 'intro' && h.visible && !V10_TEXT.test(h.text), JSON.stringify({ current: h.current, phase: h.phase })); continue; }
      if (def.id === 'inn') { await shot('item-11-inn-inside'); }
      if (def.id === 'merchant') { await shot('item-13-merchant-inside'); }
      const closed = await closeTop(); await settle(); await ackResult(); h = await guide(); row.closed = closed; row.after = h.current;
      const expectNext = i + 1 < 15 ? (await ev(`Silk.guide.STEPS[${i + 1}].id`)) : null;
      check('B ' + def.title + ': real page opened by the player (' + row.opened + '), in-page callout shown, closing the page continues with the next item', row.hit === 'target' && row.opened === def.panels[0] && row.insideVisible && row.insideTitle === def.title && (expectNext ? h.current === expectNext && h.phase === 'intro' : h.atFinish), JSON.stringify({ hit: row.hit, opened: row.opened, inside: row.insideVisible, closed, after: h.current, atFinish: h.atFinish }));
    }
    check('B 15 items in the fixed order with the exact titles', seen.map(s => s.title).join('|') === AUTH.join('|'), seen.map(s => s.title).join('|'));
    check('B every item shows its authority copy and counter', seen.every(s => s.copyOk), JSON.stringify(seen.filter(s => !s.copyOk).map(s => s.id)));
    check('B every map target located on screen and spotlit (HUD ×3, HUD tools, map hotspots)', seen.filter(s => !s.sameVisit).every(s => s.spotOk), JSON.stringify(seen.filter(s => !s.spotOk && !s.sameVisit)));
    check('B callout never covers its target', !overlapBad, JSON.stringify({ overlapBad }));
    check('B must-enter cards offer 跳过导览 + 进入看看 (no 下一步); HUD cards 跳过导览 + 下一步', seen.filter(s => s.enterButtons).every(s => s.enterButtons === '跳过导览|进入看看') && seen.slice(0, 3).every(s => s.buttons === '跳过导览|下一步'), JSON.stringify(seen.map(s => s.buttons)));
    check('B no Tick anywhere in the tour text', !tickBad); check('B no v1.0 copy anywhere in the tour', !v10Bad);
    // ---------------- C. finish
    g = await guide(); check('C finish card: exact copy, only 开始行动', g.atFinish && g.mode === 'finish' && g.text.includes('本游戏的主要信息和功能入口已经介绍完毕。之后如果有不确定的规则，可以随时查看对应页面，或从【更多 → 玩法说明】重新查找。') && g.text.includes('接下来，就按自己的打算开始这趟商旅吧。') && g.buttons.join('|') === '开始行动', JSON.stringify({ buttons: g.buttons })); await shot('finish-card');
    await ev(`(()=>{const b=[...document.querySelectorAll('.guide-card button')].find(x=>x.textContent.trim()==='开始行动');b.click();b.click();})()`); await settle(); g = await guide();
    const leftovers = await ev('(()=>({guide:document.querySelectorAll(".guide-layer:not([hidden]) *").length,labels:[...document.querySelectorAll(".city-scene .hotspot-label")].map(e=>e.textContent.trim()),extra:document.querySelectorAll(".city-scene .guide-spot, .city-scene .guide-block, .tutorial-label, .map-caption").length}))()');
    check('C 开始行动 → done; map free: no overlay / spotlight / hold, no panel auto-opened, no notice, no recommendation, no standing subtitle', g.status === 'done' && !g.visible && !g.panel && !g.secondary && g.notices === 0 && leftovers.guide === 0 && leftovers.extra === 0 && !/先去|去市场看看|推荐|建议你|下一步/.test(await pageText()), JSON.stringify({ status: g.status, panel: g.panel, notices: g.notices, leftovers })); await shot('after-finish-map');
    check('C hotspot labels unchanged (no persistent teaching labels)', leftovers.labels.join('|') === '营生|出发|柜坊|客舍|商号|商情|市场', leftovers.labels.join('|'));
    check('C the tour itself changed nothing in gameplay (cash / world time as at the start, no trip, no visit)', g.cash === cash0 && g.tick === tick0 && !g.trip && !g.visit, JSON.stringify({ cash: [cash0, g.cash], tick: [tick0, g.tick] }));
    await realReload(); g = await guide(); check('C reload after finish: no replay, version v1.1 persisted', g.status === 'done' && !g.visible && g.version === 'NEW_PLAYER_GUIDE_CLARITY_REPLACEMENT_v1.1', g.version);
    // ---------------- D. replacement of an existing v1.0 state
    await injectGuideState({ version: 'NEW_PLAYER_GUIDE_AUTHORITY_v1.0', status: 'active', step: 7, startedTick: 0, endedTick: null }); g = await guide();
    check('D a save mid-way through the v1.0 tour loads as v1.1 item 1 (restarted once, v1.1 copy only, no v1.0 text, single overlay)', g.status === 'active' && g.step === 0 && g.current === 'hud_money' && g.visible && g.text.includes('这里显示你当前随身可用的钱财') && !V10_TEXT.test(g.text) && (await ev('document.querySelectorAll(".guide-layer").length')) === 1, JSON.stringify({ step: g.step, title: g.title })); await shot('v10-active-replaced');
    await clickText('下一步'); await settle(); g = await guide(); check('D after the first v1.1 action the saved state is v1.1 (v1.0 marked replaced)', g.version === 'NEW_PLAYER_GUIDE_CLARITY_REPLACEMENT_v1.1' && g.step === 1, g.version);
    await injectGuideState({ version: 'NEW_PLAYER_GUIDE_AUTHORITY_v1.0', status: 'skipped', step: 0, startedTick: null, endedTick: 0 }); g = await guide();
    check('D a v1.0 skipped save never replays (no entry card, no overlay)', g.status === 'skipped' && !g.visible, JSON.stringify({ status: g.status, visible: g.visible }));
    await injectGuideState({ version: 'NEW_PLAYER_GUIDE_AUTHORITY_v1.0', status: 'done', step: 14, startedTick: 0, endedTick: 5 }); g = await guide();
    check('D a v1.0 done save never replays', g.status === 'done' && !g.visible, JSON.stringify({ status: g.status }));
    const consoleErrors = c.console.filter(m => m.type === 'error' || m.type === 'exception').map(m => m.text.slice(0, 160)); check('N no console errors', consoleErrors.length === 0, JSON.stringify(consoleErrors.slice(0, 3)));
  } catch (e) { errors.push(String(e && e.stack || e)); console.error(e); try { await shot('exception'); } catch (_) { } }
  await c.close(); srv.stop();
  const passed = checks.filter(x => x.ok).length;
  fs.writeFileSync(path.join(outDir, 'guide-run.json'), JSON.stringify({ label, passed, total: checks.length, checks, errors }, null, 2));
  console.log(`guide browser run [${label}]: ${passed}/${checks.length}` + (errors.length ? ' (script error)' : '') + ' → ' + outDir);
  process.exit(passed === checks.length && !errors.length ? 0 : 1);
})();
