'use strict';
// 商路奇缘 FINAL v1.0 — runtime acceptance in headless Chrome (390×844 mobile emulation, 06_QA sections A / B / J + idempotency).
// A save built with the engine is written into the page's IndexedDB (an older balanceVersion, so the load path also migrates it), then the page is reloaded.
// Usage: node tests/browser/qiyuan-run.js [label] [--root <dir>] [--port <http>] [--cdp <chrome port>]
const fs = require('fs'), path = require('path');
const { launch, startServer, sleep } = require('../tools/cdp');
const { load, driver } = require('../harness');
const root = path.join(__dirname, '..', '..');
const argv = process.argv.slice(2), flag = n => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const label = argv.find((a, i) => !a.startsWith('--') && (i === 0 || !argv[i - 1].startsWith('--'))) || 'qiyuan';
const serveRoot = flag('--root') ? path.resolve(flag('--root')) : root;
const outDir = path.join(root, 'tests', 'results', 'evidence', 'qiyuan-' + label); fs.rmSync(outDir, { recursive: true, force: true }); fs.mkdirSync(outDir, { recursive: true });
const checks = []; let shotIndex = 0;
const check = (name, ok, detail) => { checks.push({ name, ok: Boolean(ok), detail: detail === undefined ? '' : String(detail).slice(0, 400) }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  ' + String(detail).slice(0, 220) : '')); };
// ---- build the save with the engine served from the same root: QY01 completed (new rule), QY03 completed in the old 4-chapter shape, QY02 open at chapter 4 (offer), player in 于阗 on a trip
function buildSave() {
  const S = load({ root: serveRoot }).Silk;
  const d = driver(S, 901); d.p.cash = 400; d.p.inventory.provisions = 30; d.p.inventory.camelCount = 3; d.p.reputation.value = 30; d.p.reputation.firstVisits = { dunhuang: true, khotan: true }; d.quietCity(120); d.quietRoute(120);
  const jumpTo = (city, i) => { d.p.world.route = null; d.p.world.city = city; d.p.trip.routeIndex = i; d.p.trip.phase = 'in_city'; d.p.trip.routeHistory = ['changan', 'dunhuang', 'khotan', 'dunhuang', 'changan'].slice(0, i + 1); };
  const free = id => { d.p.stories.lastNewChapterTrip = null; if (d.p.stories.lines[id]) d.p.stories.lines[id].lastCompletedTrip = 'earlier'; };
  const begin = (id, c = 'continue') => { free(id); d.run('story.begin', { lineId: id, choiceId: c }); d.ack(); };
  const act = (id, c = 'continue') => { d.run('story.act', { lineId: id, choiceId: c }); d.ack(); };
  begin('QY01', 'reinforce'); d.run('trip.begin'); d.run('trip.depart', { acknowledgeSupplyWarning: true }); jumpTo('dunhuang', 1); act('QY01'); begin('QY01'); jumpTo('khotan', 2); act('QY01', 'truthful'); begin('QY01'); jumpTo('dunhuang', 3);
  S.inventory.add(d.p, { goodId: '于阗丝织', quantity: 1, acquisitionPrice: 30, acquisitionCity: 'khotan', hasLeftAcquisitionCity: true }); act('QY01'); begin('QY01'); act('QY01', 'report');
  d.p.stories.lines.QY03 = { lineId: 'QY03', status: 'closed', completed: true, completedChapters: ['QY03_1', 'QY03_2', 'QY03_3', 'QY03_4'], activeChapter: null, flags: { boxChoice: 'return', ending: 'return' }, lastCompletedTrip: 'earlier' };
  d.p.stories.history.push({ kind: 'storyChapterCompleted', lineId: 'QY03', chapterId: 'QY03_4', actualCash: 15, actualReputation: 3, choiceId: 'continue' });
  d.p.merchant.suppliers['于阗玉'] = { stage: 'established', discountRate: 0, sourceCity: 'khotan' };
  jumpTo('khotan', 2); begin('QY02'); jumpTo('dunhuang', 3); act('QY02'); begin('QY02'); act('QY02', 'honest'); jumpTo('changan', 4); begin('QY02'); act('QY02', 'full'); jumpTo('khotan', 2); begin('QY02');
  const a = d.p.stories.lines.QY02.activeChapter; a.specialRoll = .05; a.specialAvailable = true; act('QY02'); // 归还试料 → main route paid, offer open
  const env = JSON.parse(JSON.stringify(d.envelope())); env.meta = { ...S.core.versions, balanceVersion: '2026-09-13-weighted-avg-cost', generation: 0, revision: 12 }; env.preferences = { tutorialEnabled: false, soundEnabled: true }; env.ledger = {}; env.pending = null; env.results = {}; env.progress.presentation.tutorialEnabled = false; env.progress.presentation.notices = []; // milestone notices raised while building the fixture are not part of this test
  S.core.validate(env); return { env, cash: env.progress.cash, rep: env.progress.reputation.value, tick: env.progress.world.tick };
}
(async () => {
  const port = Number(flag('--port')) || 8310, srv = startServer(port, serveRoot); await sleep(500);
  const c = await launch({ port: Number(flag('--cdp')) || 9851, width: 390, height: 844, mobile: true });
  const ev = js => c.eval(js);
  const shot = async name => { const f = String(++shotIndex).padStart(2, '0') + '-' + name + '.png'; await c.screenshot(path.join(outDir, f)); return f; };
  const waitFor = async (js, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(js)) return true; await sleep(80); } return false; };
  const busyWait = () => waitFor('window.Silk&&Silk.app&&!Silk.app.busy', 8000);
  const vis = `(e=>e&&e.offsetParent!==null)`;
  const clickBtn = (scope, text) => ev(`(()=>{const s=document.querySelector(${JSON.stringify(scope)})||document;const b=[...s.querySelectorAll('button')].find(b=>!b.disabled&&b.offsetParent!==null&&b.textContent.trim()===${JSON.stringify(text)});if(!b)return false;b.click();return true})()`);
  const st = () => ev('(()=>{const p=Silk.app.state.progress;return {tick:p.world.tick,cash:p.cash,rep:p.reputation.value,rev:Silk.app.state.meta.revision,city:p.world.city,lines:Object.fromEntries(Object.entries(p.stories.lines).map(([k,v])=>[k,v.status+":"+v.completedChapters.length+":"+(v.activeChapter?v.activeChapter.phase:"-")])),qy01:JSON.stringify(p.stories.lines.QY01),story:p.inventory.lots.filter(l=>l.ownership==="storyOwned").length}})()');
  const D = '[data-panel-id="story-detail"]', L = '[data-panel-id="story-lines"]';
  const detail = () => ev(`(()=>{const p=document.querySelector('${D}');if(!p||p.offsetParent===null)return null;const r=e=>{const b=e.getBoundingClientRect();return {x:+b.x.toFixed(1),y:+b.y.toFixed(1),w:+b.width.toFixed(1),h:+b.height.toFixed(1)}};const box=p.querySelector('.story-finale');const entries=[...p.querySelectorAll('.story-finale-entries button')].map(b=>({t:b.textContent.trim(),...r(b),pressed:b.getAttribute('aria-pressed')}));const body=p.querySelector('.story-finale-body');const bodyBox=p.querySelector('.panel-body');return {title:p.querySelector('h2')?.textContent,view:box?box.dataset.view:null,eyebrow:p.querySelector('.story-finale-eyebrow')?.textContent||null,h3:p.querySelector('.story-finale h3')?.textContent||p.querySelector('h3')?.textContent||null,subtitle:p.querySelector('.story-finale-subtitle')?.textContent||null,entries,hasBody:Boolean(body),detailTitle:p.querySelector('.story-finale-detail-title')?.textContent||null,bodyText:body?body.innerText:'',paras:body?body.querySelectorAll('p').length:0,rows:body?[...body.querySelectorAll('.info-row')].map(x=>x.textContent.trim()):[],buttons:[...p.querySelectorAll('button')].filter(b=>b.offsetParent!==null).map(b=>b.textContent.trim()),footer:[...p.querySelectorAll('.panel-footer button')].map(b=>({t:b.textContent.trim(),...r(b)})),bodyOverflow:bodyBox?getComputedStyle(bodyBox).overflowY:null,bodyScrollable:bodyBox?bodyBox.scrollHeight>bodyBox.clientHeight:false,inViewport:[...p.querySelectorAll('button')].filter(b=>b.offsetParent!==null).every(b=>{const q=b.getBoundingClientRect();return q.left>=0&&q.right<=innerWidth&&q.width>0}),text:p.innerText}})()`);
  const cards = () => ev(`(()=>{const p=document.querySelector('${L}');if(!p||p.offsetParent===null)return null;return {title:p.querySelector('h2')?.textContent,cards:[...p.querySelectorAll('.story-card')].map(k=>({id:k.dataset.lineId,status:k.dataset.status,name:k.querySelector('h3').textContent,statusText:k.querySelector('.story-status')?.textContent,button:k.querySelector('button')?.textContent.trim(),h:k.getBoundingClientRect().height})),text:p.innerText}})()`);
  try {
    const save = buildSave();
    await c.navigate('http://127.0.0.1:' + port + '/'); await sleep(900); await ev('new Promise(r=>{const t=setInterval(()=>{if(window.Silk&&Silk.app&&Silk.app.state){clearInterval(t);r()}},100)})');
    await ev(`new Promise((res,rej)=>{const q=indexedDB.open('silkroad-rebuild-v1',2);q.onsuccess=()=>{const db=q.result;const tx=db.transaction('state','readwrite');tx.objectStore('state').put(${JSON.stringify(save.env)},'current');tx.oncomplete=()=>{db.close();res(true)};tx.onerror=()=>rej(tx.error)};q.onerror=()=>rej(q.error)})`);
    await c.navigate('http://127.0.0.1:' + port + '/'); await sleep(1200); await ev('new Promise(r=>{const t=setInterval(()=>{if(window.Silk&&Silk.app&&Silk.app.state&&Silk.app.state.progress){clearInterval(t);r()}},100)})'); await busyWait(); await sleep(400);
    let s = await st(); const base = { tick: s.tick, cash: s.cash, rep: s.rep, rev: s.rev, qy01: s.qy01 };
    check('setup: injected save loaded and upgraded on load (QY01 completed, QY03 legacy folded to 5 chapters, QY02 at the chapter-4 offer); money / 商誉 untouched by the migration', s.cash === save.cash && s.rep === save.rep && s.tick === save.tick && s.lines.QY01 === 'closed:5:-' && s.lines.QY03 === 'closed:5:-' && s.lines.QY02 === 'active:3:offer' && s.city === 'khotan', JSON.stringify({ lines: s.lines, cash: [save.cash, s.cash] }));
    // ---------------- A. entry: 委托 → 商路奇缘 → six cards
    await ev(`document.querySelector('.hud-tool[data-panel="commission"]').click()`); await sleep(600); await busyWait();
    const commissionText = await ev(`(()=>{const p=document.querySelector('[data-panel-id="commission"]');return p?p.innerText:''})()`);
    check('委托 panel has the 商路奇缘 entry (no 丝路奇缘 / 商路起源 / 思路起源 anywhere on it)', /商路奇缘/.test(commissionText) && !/丝路奇缘|商路起源|思路起源/.test(commissionText), commissionText.slice(-120));
    await clickBtn('[data-panel-id="commission"]', '商路奇缘'); await sleep(400); let k = await cards();
    check('商路奇缘 page: title 商路奇缘, six permanent cards QY01–QY06 with the final names', k && k.title === '商路奇缘' && k.cards.map(x => x.id).join() === 'QY01,QY02,QY03,QY04,QY05,QY06' && k.cards.map(x => x.name).join('|') === '一卷西行经|玉料两价|风沙旧箱|织坊东行|河西药帖|三路归一' && !/丝路奇缘|商路起源|思路起源/.test(k.text), JSON.stringify(k && k.cards.map(x => [x.id, x.status])));
    check('card states: QY01 / QY03 已完成 · 回看此缘 (completed cards stay listed), QY02 进行中 · 回到玉市 · 继续, QY04 / QY05 / QY06 尚未开启 or 可以开启', k.cards[0].status === 'completed' && k.cards[0].button === '回看此缘' && k.cards[2].status === 'completed' && k.cards[1].status === 'active' && /回到玉市/.test(k.cards[1].statusText) && k.cards[1].button === '继续' && ['locked', 'available'].every(v => true) && ['QY04', 'QY05', 'QY06'].every(id => ['locked', 'available'].includes(k.cards.find(x => x.id === id).status)), JSON.stringify(k.cards.map(x => [x.id, x.status, x.statusText, x.button])));
    await shot('six-cards');
    // ---------------- B. completed card → finale directory card
    await ev(`document.querySelector('${L} .story-card[data-line-id="QY01"]').click()`); await sleep(400); let v = await detail();
    const stacked = e => e.length === 3 && e.every(b => b.h >= 44) && Math.max(...e.map(b => b.x)) - Math.min(...e.map(b => b.x)) <= 1 && Math.max(...e.map(b => b.w)) - Math.min(...e.map(b => b.w)) <= 1 && e[0].y < e[1].y && e[1].y < e[2].y && e[1].y >= e[0].y + e[0].h - 1 && e[2].y >= e[1].y + e[1].h - 1;
    check('tapping the completed card opens the finale directory: 商路奇缘·终章 / 一卷西行经 / 一卷成形, no chapter replay, no default text', v && v.view === 'directory' && v.eyebrow === '商路奇缘·终章' && v.h3 === '一卷西行经' && v.subtitle === '一卷成形' && !v.hasBody && !/纸束西行|敦煌回话/.test(v.text.replace(/一路所记|此缘所得|卷外余话/g, '')), JSON.stringify(v && { view: v.view, eyebrow: v.eyebrow, h3: v.h3, sub: v.subtitle, body: v.hasBody }));
    check('three same-tier entries 一路所记 / 此缘所得 / 卷外余话 stacked vertically, equal width, ≥44 px, none selected', v && v.entries.map(b => b.t).join('|') === '一路所记|此缘所得|卷外余话' && stacked(v.entries) && v.entries.every(b => b.pressed === 'false'), JSON.stringify(v && v.entries));
    check('dedicated close button 收起经卷 at the bottom; every control inside the 390 px viewport', v && v.footer.some(b => b.t === '收起经卷') && v.inViewport, JSON.stringify(v && v.footer));
    await shot('finale-directory');
    await clickBtn(D, '一路所记'); await sleep(300); v = await detail();
    check('一路所记: small detail title, five chapter lines (一｜…五｜), 返回终章 present, long text scrolls inside the panel body only', v && v.view === 'recap' && v.detailTitle === '一路所记' && v.paras === 5 && /一｜纸束西行/.test(v.bodyText) && /五｜一卷成形/.test(v.bodyText) && v.buttons.includes('返回终章') && v.bodyOverflow === 'auto', JSON.stringify(v && { paras: v.paras, overflow: v.bodyOverflow }));
    await shot('finale-recap');
    await clickBtn(D, '返回终章'); await sleep(300); v = await detail(); check('返回终章 → directory again with no selection and no text', v && v.view === 'directory' && !v.hasBody && v.entries.every(b => b.pressed === 'false'), JSON.stringify(v && v.view));
    await clickBtn(D, '此缘所得'); await sleep(300); v = await detail();
    check('此缘所得: settled rows only (材料款返还 / 制帙酬劳 / 奇缘所得合计 / 商誉合计 / 沿途交付), fixed footer 此缘所得均已在沿途结清。, no 领取 button', v && v.view === 'gains' && v.rows.some(r => /材料款返还/.test(r)) && v.rows.some(r => /制帙酬劳/.test(r)) && v.rows.some(r => /奇缘所得合计/.test(r)) && v.rows.some(r => /商誉合计/.test(r)) && /此缘所得均已在沿途结清。/.test(v.bodyText) && !v.buttons.some(b => /领取/.test(b)), JSON.stringify(v && v.rows.slice(0, 6)));
    await shot('finale-gains');
    await clickBtn(D, '返回终章'); await sleep(250); await clickBtn(D, '卷外余话'); await sleep(300); v = await detail();
    check('卷外余话: history text only here (经卷包帙), 返回终章', v && v.view === 'notes' && /经卷包帙/.test(v.bodyText) && v.buttons.includes('返回终章'), JSON.stringify(v && v.bodyText.slice(0, 60)));
    await clickBtn(D, '返回终章'); await sleep(250); await clickBtn(D, '收起经卷'); await sleep(400); k = await cards(); v = await detail();
    check('收起经卷 closes only the viewing layer → back to the six-card list, QY01 still listed as 已完成', k && !v && k.cards[0].status === 'completed', JSON.stringify(k && k.cards[0]));
    await ev(`document.querySelector('${L} .story-card[data-line-id="QY01"]').click()`); await sleep(400); v = await detail();
    check('re-viewing the completed card shows the three-entry directory first again (no remembered selection, no replay)', v && v.view === 'directory' && !v.hasBody, JSON.stringify(v && v.view));
    await clickBtn(D, '收起经卷'); await sleep(300);
    await ev(`document.querySelector('${L} .story-card[data-line-id="QY03"]').click()`); await sleep(400); v = await detail();
    check('legacy 4-chapter QY03 (folded on load): directory 风沙旧箱 / 旧箱归处 / 合上旧账 and a 一路所记 with five lines', v && v.view === 'directory' && v.h3 === '风沙旧箱' && v.subtitle === '旧箱归处' && v.footer.some(b => b.t === '合上旧账'), JSON.stringify(v && { h3: v.h3, sub: v.subtitle, footer: v.footer.map(b => b.t) }));
    await clickBtn(D, '一路所记'); await sleep(250); v = await detail(); check('QY03 recap: five lines, the 原封送回 route reflected', v && v.paras === 5 && /原封/.test(v.bodyText), v && v.bodyText.slice(0, 120)); await clickBtn(D, '返回终章'); await sleep(200); await clickBtn(D, '合上旧账'); await sleep(300);
    s = await st(); check('viewing / switching / returning / closing / re-viewing: 0 Tick, money, 商誉, save revision and the line record all unchanged', s.tick === base.tick && s.cash === base.cash && s.rep === base.rep && s.rev === base.rev && s.qy01 === base.qy01, JSON.stringify({ base: [base.tick, base.cash, base.rep, base.rev], now: [s.tick, s.cash, s.rep, s.rev] }));
    // ---------------- reload: completed card survives, still read-only
    await c.navigate('http://127.0.0.1:' + port + '/'); await sleep(1200); await ev('new Promise(r=>{const t=setInterval(()=>{if(window.Silk&&Silk.app&&Silk.app.state&&Silk.app.state.progress){clearInterval(t);r()}},100)})'); await busyWait(); await sleep(300);
    s = await st(); await ev(`document.querySelector('.hud-tool[data-panel="commission"]').click()`); await sleep(500); await busyWait(); await clickBtn('[data-panel-id="commission"]', '商路奇缘'); await sleep(400); k = await cards();
    await ev(`document.querySelector('${L} .story-card[data-line-id="QY01"]').click()`); await sleep(400); v = await detail();
    check('after a page reload: revision unchanged, QY01 still 已完成 and its directory opens the same way (nothing re-settled)', s.rev === base.rev && s.cash === base.cash && k.cards[0].status === 'completed' && v && v.view === 'directory' && !v.hasBody, JSON.stringify({ rev: [base.rev, s.rev], cash: [base.cash, s.cash] }));
    await clickBtn(D, '收起经卷'); await sleep(300);
    // ---------------- active card → current chapter; idempotent double tap on a settling action
    await ev(`document.querySelector('${L} .story-card[data-line-id="QY02"]').click()`); await sleep(400); v = await detail();
    check('tapping the in-progress card opens the current chapter (回到玉市) with the offer copy and its two buttons 接下代售 / 暂且不接 (no internal fields, probabilities or flags)', v && /回到玉市/.test(v.text) && /还有一块/.test(v.text) && v.buttons.includes('接下代售') && v.buttons.includes('暂且不接') && !/specialRoll|probability|flag|0\.8|80%/.test(v.text), JSON.stringify(v && { buttons: v.buttons }));
    await shot('active-chapter-offer');
    const before = await st(); await clickBtn(D, '暂且不接'); await busyWait(); await sleep(400); s = await st();
    check('暂且不接: chapter kept, 0 Tick, nothing changes but the save revision of the deferral itself', s.tick === before.tick && s.cash === before.cash && s.lines.QY02 === 'active:3:offer', JSON.stringify(s.lines.QY02));
    await ev(`document.querySelector('${L} .story-card[data-line-id="QY02"]')?.click()`); await sleep(300); v = await detail(); if (!v || !v.buttons.includes('接下代售')) { await ev(`document.querySelector('${L} .story-card[data-line-id="QY02"]').click()`); await sleep(400); }
    await ev(`(()=>{const b=[...document.querySelectorAll('${D} button')].find(b=>b.textContent.trim()==='接下代售');b.click();b.click();b.click();return true})()`); await busyWait(); await sleep(600); s = await st();
    check('triple-click on 接下代售 generates exactly one 贵重重托 lot and moves the chapter to delivery once', s.story === 1 && s.lines.QY02 === 'active:3:delivery', JSON.stringify({ story: s.story, line: s.lines.QY02 }));
    await ev(`(()=>{const p=Silk.app.state.progress;const ar=p.presentation.activeResult;if(ar)Silk.ui.dispatch('result.ack',{resultId:ar.id});})()`); await busyWait(); await sleep(300);
    const errs = c.console.filter(m => m.type === 'error' || m.type === 'exception').map(m => m.text.slice(0, 160)); check('no console errors', errs.length === 0, JSON.stringify(errs.slice(0, 3)));
  } catch (e) { check('script error', false, String(e && e.stack || e).slice(0, 400)); }
  await c.close(); srv.stop();
  const passed = checks.filter(x => x.ok).length;
  fs.writeFileSync(path.join(outDir, 'qiyuan-run.json'), JSON.stringify({ label, passed, total: checks.length, checks }, null, 2));
  console.log(`商路奇缘 browser run [${label}]: ${passed}/${checks.length} → ` + outDir);
  process.exit(passed === checks.length ? 0 : 1);
})();
