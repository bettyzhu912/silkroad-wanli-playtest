'use strict';
// SILKROAD_NEW_PLAYER_GUIDE_PATCH_v1.0 — real-browser acceptance (headless Chrome, 390×844 mobile emulation, real store) over
// 04_ACCEPTANCE_CHECKLIST: entry card with exactly 按指引开始 / 自行探索 on the first 长安 map, 自行探索 → free map with no hints, guided
// tour: 14 steps in order with the authority copy, every target located and spotlit, map visible (not a full-screen card), optional
// 背包 / 行情 clicks open the existing panels and return to the same step, market split into 补给 / 商品, 商号 introduced, no Tick,
// finish copy + only 开始行动, clean map afterwards (no overlay, no labels, no auto-open, no notices), reload mid-tour resumes,
// no replay on re-entry, old tutorial retired (no first-visit hints for market / 柜坊 / 委托 / 营生), 更多 → 玩法说明 still works.
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
const AUTH = ['铜钱', '时辰', '商誉', '背包', '查看行情', '补给', '商品', '委托', '柜坊', '客舍', '营生', '商号', '出发', '玩法说明'];
(async () => {
  const port = Number(flag('--port')) || 8190, srv = startServer(port, serveRoot); await sleep(500);
  const c = await launch({ port: Number(flag('--cdp')) || 9410, width: 390, height: 844, mobile: true });
  const ev = js => c.eval(js);
  const shot = async name => { const f = String(++shotIndex).padStart(2, '0') + '-' + name + '.png'; await c.screenshot(path.join(outDir, f)); return f; };
  const clickText = text => ev(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>!b.disabled&&b.offsetParent!==null&&b.textContent.trim()===${JSON.stringify(text)});if(!b)return false;b.click();return true})()`);
  const waitFor = async (js, ms = 8000, step = 100) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(js)) return true; await sleep(step); } return false; };
  const busyWait = () => waitFor('!Silk.app.busy', 8000, 50);
  const guide = () => ev('(()=>{const p=Silk.app.state.progress;const v=Silk.guide.view(p);const L=Silk.guideUI.test.layer();const card=L&&!L.hidden?L.querySelector(".guide-card"):null;return {status:v.status,step:v.step,atFinish:v.atFinish,current:v.current?v.current.id:null,visible:Boolean(L&&!L.hidden),mode:Silk.guideUI.test.mode(),title:card?(card.querySelector("h3")||{}).textContent||"":"",text:card?card.innerText.replace(/\\s+/g," "):"",buttons:card?[...card.querySelectorAll("button")].map(b=>b.textContent.trim()):[],blocks:L?L.querySelectorAll(".guide-block").length:0,spot:L&&L.querySelector(".guide-spot")?(()=>{const r=L.querySelector(".guide-spot").getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}})():null,panel:Silk.ui.getState().primary,secondary:Silk.ui.getState().secondary,notices:p.presentation.notices.length,tutorialNotices:p.presentation.notices.filter(n=>n.kind==="tutorial").length,cash:p.cash,tick:p.world.tick,journal:p.journal.length}})()');
  const targetRect = id => ev(`(()=>{const t=Silk.guideUI.test.target(${JSON.stringify(id)});if(!t)return null;const r=t.getBoundingClientRect();const at=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height),text:t.textContent.trim().slice(0,12),hit:at?(t.contains(at)?'target':(at.className||at.tagName)):'none'}})()`);
  const pointerClick = id => ev(`(()=>{const t=Silk.guideUI.test.target(${JSON.stringify(id)});if(!t)return 'none';const r=t.getBoundingClientRect();const at=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);if(!at)return 'none';if(t.contains(at)){at.click();return 'target'}return at.className||at.tagName})()`);
  const pageText = () => ev('document.body.innerText');
  const newGame = async () => { await ev('new Promise(r=>{const t=setInterval(()=>{if(window.Silk&&Silk.app&&Silk.app.state){clearInterval(t);r()}},100)})'); if (await ev('Boolean(Silk.app.state.progress)')) { await ev("Silk.ui.dispatch('game.reset')"); await busyWait(); await sleep(400); } await clickText('启程'); await ev('new Promise(r=>{const t=setInterval(()=>{const p=Silk.app.state.progress;if(p&&p.world){clearInterval(t);r()}},100)})'); await busyWait(); await sleep(500); };
  const realReload = async () => { await c.navigate('http://127.0.0.1:' + port + '/'); await sleep(1200); await ev('new Promise(r=>{const t=setInterval(()=>{if(window.Silk&&Silk.app&&Silk.app.state&&Silk.app.state.progress){clearInterval(t);r()}},100)})'); await waitFor('!Silk.app.busy', 10000); await sleep(500); };
  const errors = [];
  try {
    await c.navigate('http://127.0.0.1:' + port + '/'); await sleep(900);
    // ---------------- A. entry card on the first 长安 map; 自行探索
    await newGame(); let g = await guide();
    check('A first 长安 map shows the entry card with exactly 按指引开始 / 自行探索; map + HUD behind it', g.status === 'pending' && g.visible && g.mode === 'entry' && g.buttons.join('|') === '按指引开始|自行探索' && (await ev('!document.querySelector(".global-hud").hidden && !document.querySelector(".city-scene").hidden')), JSON.stringify({ status: g.status, buttons: g.buttons })); await shot('entry-card');
    check('A no old home-screen start choice, no tutorial notices, no preparation task', (await ev('!document.querySelector(".home-choice")')) && g.tutorialNotices === 0 && !/去市场看看/.test(await pageText()));
    await clickText('自行探索'); await busyWait(); await sleep(400); g = await guide();
    check('A 自行探索 → skipped: overlay gone, no panel opened, no notice, no recommendation', g.status === 'skipped' && !g.visible && !g.panel && !g.secondary && g.tutorialNotices === 0 && !/先去|去市场看看|推荐|下一步/.test(await pageText()), JSON.stringify(g)); await shot('explore-map');
    await ev(`document.querySelector('.city-hotspot[data-hotspot="market"]').click()`); await sleep(800); await busyWait(); g = await guide(); const marketText = await pageText();
    check('A first market entry after 自行探索: no tutorial hint (old first-visit teaching retired)', g.panel === 'market' && g.tutorialNotices === 0 && !/市场与行囊|价格因城市和世界日变化/.test(marketText), JSON.stringify({ panel: g.panel, tut: g.tutorialNotices }));
    await clickText('离开市场'); await busyWait(); await sleep(300); await ev(`(()=>{const p=Silk.app.state.progress;const ar=p.presentation.activeResult;if(ar)Silk.ui.dispatch('result.ack',{resultId:ar.id});})()`); await busyWait(); await sleep(200);
    for (const [hot, expectPanel, hint] of [['guifang', 'guifang', /这里可办理本地寄存/], ['work', 'work', /酒肆诗令》正式完成耗时/]]) { await ev(`(()=>{for(const s of document.querySelectorAll('section.paper-panel .close-button'))if(s.offsetParent!==null)s.click();})()`); await sleep(200); await ev(`document.querySelector('.city-hotspot[data-hotspot="${hot}"]').click()`); await sleep(400); g = await guide(); check('A first ' + hot + ' entry: panel opens, no tutorial hint', g.panel === expectPanel && g.tutorialNotices === 0 && !hint.test(await pageText()), JSON.stringify({ panel: g.panel })); }
    await ev(`(()=>{for(const s of document.querySelectorAll('section.paper-panel .close-button'))if(s.offsetParent!==null)s.click();})()`); await sleep(200); await ev(`document.querySelector('.hud-tool[data-panel="commission"]').click()`); await sleep(400); g = await guide(); check('A first 委托 entry: no tutorial hint', g.panel === 'commission' && g.tutorialNotices === 0 && !/捎货是把指定货物送到目的地/.test(await pageText()), JSON.stringify({ panel: g.panel }));
    await ev(`(()=>{for(const s of document.querySelectorAll('section.paper-panel .close-button'))if(s.offsetParent!==null)s.click();})()`); await sleep(200); await realReload(); g = await guide(); check('A reload after 自行探索: still no entry card (no replay)', g.status === 'skipped' && !g.visible);
    // ---------------- B. guided tour
    await newGame(); g = await guide(); check('B new game again → entry card', g.status === 'pending' && g.visible && g.mode === 'entry');
    await clickText('按指引开始'); await busyWait(); await sleep(400); g = await guide();
    check('B 按指引开始 → step 1 铜钱, spotlight on the HUD money', g.status === 'active' && g.step === 0 && g.current === 'hud_money' && g.title === '铜钱' && g.spot && g.spot.w > 20 && g.spot.h > 20, JSON.stringify({ title: g.title, spot: g.spot })); await shot('step-01-money');
    const seen = []; let tickBadFound = false, overlapBad = null;
    for (let i = 0; i < 14; i++) {
      g = await guide(); const stepDef = await ev(`Silk.guide.STEPS[${i}]`); const tr = await targetRect(stepDef.id);
      const copyOk = g.text.includes(stepDef.copy.split('\n')[0]) && g.title === stepDef.title && new RegExp('\\b' + (i + 1) + ' / 14\\b').test(g.text);
      const spotOk = tr && g.spot && Math.abs(g.spot.x - (tr.x - 6)) <= 2 && Math.abs(g.spot.y - (tr.y - 6)) <= 2 && tr.w > 0 && tr.h > 0;
      const cardRect = await ev('(()=>{const c=document.querySelector(".guide-card");const r=c.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})()');
      const overlap = tr && cardRect && !(cardRect.y >= tr.y + tr.h || cardRect.y + cardRect.h <= tr.y || cardRect.x >= tr.x + tr.w || cardRect.x + cardRect.w <= tr.x);
      const smallCard = cardRect && cardRect.h < 844 * .45 && cardRect.w <= 340;
      if (/tick/i.test(g.text)) tickBadFound = true; if (overlap && !overlapBad) overlapBad = stepDef.id;
      seen.push({ id: stepDef.id, title: g.title, copyOk, spotOk, target: tr && tr.text, overlap, smallCard, buttons: g.buttons.join('|') });
      if (i === 3) { // optional 背包: click the spotlit target → pack panel opens; close → same step
        const hitPack = await pointerClick('hud_inventory'); await sleep(400); let h = await guide(); const packOpen = hitPack === 'target' && h.panel === 'pack' && !h.visible; await shot('step-04-pack-open');
        await ev(`(()=>{for(const s of document.querySelectorAll('section.paper-panel .close-button'))if(s.offsetParent!==null)s.click();})()`); await sleep(400); h = await guide();
        check('B 背包 optional click: existing pack panel opens (overlay hidden), × returns to the same step 4', packOpen && !h.panel && h.visible && h.step === 3 && h.current === 'hud_inventory', JSON.stringify({ packOpen, after: { panel: h.panel, step: h.step } }));
      }
      if (i === 4) { // optional 行情: click the magnifier hotspot → inspect panel; close → same step
        const hitInfo = await pointerClick('market_info_trigger'); await sleep(500); let h = await guide(); const infoOpen = hitInfo === 'target' && h.panel === 'inspect' && !h.visible; await shot('step-05-inspect-open');
        await ev(`(()=>{for(const s of document.querySelectorAll('section.paper-panel .close-button'))if(s.offsetParent!==null)s.click();})()`); await sleep(400); h = await guide();
        check('B 行情 optional click: existing 商情 panel opens, × returns to step 5', infoOpen && !h.panel && h.visible && h.step === 4, JSON.stringify({ infoOpen, after: { panel: h.panel, step: h.step } }));
      }
      if (i === 5) { // non-optional market entry must stay blocked during the tour
        const before = await guide(); const hitMarket = await pointerClick('market_supplies'); await sleep(400); const after = await guide();
        check('B 市场 entry is only highlighted (a tap lands on the guide cover, nothing opens) during 补给 / 商品 steps', /guide-cover/.test(hitMarket) && !after.panel && after.step === before.step && !after.secondary, JSON.stringify({ hit: hitMarket, panel: after.panel }));
      }
      if (i === 5) await shot('step-06-supplies'); if (i === 6) await shot('step-07-goods'); if (i === 11) await shot('step-12-merchant'); if (i === 13) await shot('step-14-more');
      if (i === 7) { // double-click 下一步 must advance exactly one step
        await ev(`(()=>{const b=document.querySelector('.guide-card .guide-next');b.click();b.click();})()`); await busyWait(); await sleep(300); const h = await guide(); check('B double-click on 下一步 advances exactly one step (8 → 9)', h.step === 8, JSON.stringify({ step: h.step })); continue;
      }
      if (i === 9) { // reload in the middle: resumes at the same step
        await realReload(); const h = await guide(); check('B reload mid-tour resumes at the same step (客舍)', h.status === 'active' && h.step === 9 && h.visible && h.title === '客舍', JSON.stringify({ step: h.step, title: h.title }));
      }
      await clickText('下一步'); await busyWait(); await sleep(250);
    }
    check('B 14 steps in the authority order with the exact titles', seen.map(s => s.title).join('|') === AUTH.join('|'), seen.map(s => s.title).join('|'));
    check('B every step shows its authority copy and counter', seen.every(s => s.copyOk), JSON.stringify(seen.filter(s => !s.copyOk).map(s => s.id)));
    check('B every target located on screen and spotlit (HUD ×4, map hotspots, HUD tools)', seen.every(s => s.spotOk), JSON.stringify(seen.filter(s => !s.spotOk)));
    check('B callout never covers its target and stays small (map visible)', !overlapBad && seen.every(s => s.smallCard), JSON.stringify({ overlapBad }));
    check('B 补给 and 商品 are two separate steps on the market entrance', seen[5].title === '补给' && seen[6].title === '商品' && seen[5].target === seen[6].target);
    check('B 商号 introduced while not yet open, using the existing map entrance (no fake entrance)', seen[11].title === '商号' && /商号/.test(seen[11].target) && (await ev('Silk.app.state.progress.merchant.status!=="open"')));
    check('B no Tick anywhere in the tour text', !tickBadFound);
    check('B step cards offer 跳过导览 + 下一步 only', seen.every(s => s.buttons === '跳过导览|下一步'), seen[0].buttons);
    // ---------------- C. finish
    g = await guide(); check('C finish card: exact copy, only 开始行动', g.atFinish && g.mode === 'finish' && g.text.includes('本游戏的主要信息和玩法已经介绍完毕。接下来，就按自己的打算开始这趟商旅吧。') && g.buttons.join('|') === '开始行动', JSON.stringify({ buttons: g.buttons })); await shot('finish-card');
    await ev(`(()=>{const b=[...document.querySelectorAll('.guide-card button')].find(x=>x.textContent.trim()==='开始行动');b.click();b.click();})()`); await busyWait(); await sleep(500); g = await guide();
    const leftovers = await ev('(()=>({guide:document.querySelectorAll(".guide-layer:not([hidden]) *").length,labels:[...document.querySelectorAll(".city-scene .hotspot-label")].map(e=>e.textContent.trim()),extra:document.querySelectorAll(".city-scene .guide-spot, .city-scene .guide-block, .tutorial-label, .map-caption").length}))()');
    check('C 开始行动 → done; map free: no overlay / spotlight / arrows / temp 商号 marker, no panel auto-opened, no notice, no recommendation', g.status === 'done' && !g.visible && !g.panel && !g.secondary && g.notices === 0 && leftovers.guide === 0 && leftovers.extra === 0 && !/先去|去市场看看|推荐|建议你|下一步/.test(await pageText()), JSON.stringify({ g: { status: g.status, panel: g.panel, notices: g.notices }, leftovers })); await shot('after-finish-map');
    check('C hotspot labels unchanged (no persistent teaching labels)', leftovers.labels.join('|') === '营生|出发|柜坊|客舍|商号|商情|市场', leftovers.labels.join('|'));
    check('C nothing in gameplay changed during the tour (cash 200, tick 0, empty journal)', g.cash === 200 && g.tick === 0 && g.journal === 0, JSON.stringify({ cash: g.cash, tick: g.tick, journal: g.journal }));
    await realReload(); g = await guide(); check('C reload after finish: no replay', g.status === 'done' && !g.visible);
    await ev(`document.querySelector('.hud-tool[data-panel="more"]').click()`); await sleep(300); const helpClicked = await ev(`(()=>{const b=[...document.querySelectorAll('[data-panel-id="more"] button.menu-entry')].find(x=>x.textContent.includes('玩法说明'));if(!b)return false;b.click();return true})()`); await sleep(400); const help = await ev('(()=>{const s=document.querySelector(\'[data-panel-id="help"]\');return s?s.innerText.replace(/\\s+/g," "):""})()');
    check('C 更多 → 玩法说明 works and carries the rules (no tutorial toggle button)', helpClicked && /玩法说明/.test(help) && /第一次西行|市场/.test(help) && !/新手提示/.test(help), help.slice(0, 80)); await shot('help-panel');
    const consoleErrors = c.console.filter(m => m.type === 'error' || m.type === 'exception').map(m => m.text.slice(0, 160)); check('N no console errors', consoleErrors.length === 0, JSON.stringify(consoleErrors.slice(0, 3)));
  } catch (e) { errors.push(String(e && e.stack || e)); console.error(e); }
  await c.close(); srv.stop();
  const passed = checks.filter(x => x.ok).length;
  fs.writeFileSync(path.join(outDir, 'guide-run.json'), JSON.stringify({ label, passed, total: checks.length, checks, errors }, null, 2));
  console.log(`guide browser run [${label}]: ${passed}/${checks.length}` + (errors.length ? ' (script error)' : '') + ' → ' + outDir);
  process.exit(passed === checks.length && !errors.length ? 0 : 1);
})();
