'use strict';
// R32 livelihood integration — real-browser acceptance run (headless Chrome, mobile emulation) of 敦煌《缀纹成章》 and 于阗《于阗织坊》 inside the
// main game, through real clicks and real pointer drags (DevTools Input events): the 营生 lists (敦煌 two cards / 于阗 one card), the 360×620
// modals in the panel layer, READY availability by world phase, instructions, trial (no world effect), formal runs (settlement pays the wage
// through the real wallet and advances the world clock: 缀纹成章 +1 tick / 于阗织坊 +2 ticks), the dusk lodging flow, abort (0 钱 0 tick), reload
// recovery, 继续留坊, gating of other commands, viewport fit. Usage: node tests/browser/livelihood-run.js [label] [--root <dir>] [--port 8451] [--cdp 9701]
const fs = require('fs'), path = require('path');
const { launch, startServer, sleep } = require('../tools/cdp');
const root = path.join(__dirname, '..', '..');
const argv = process.argv.slice(2), flag = n => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const label = argv.find((a, i) => !a.startsWith('--') && (i === 0 || !argv[i - 1].startsWith('--'))) || 'livelihood';
const serveRoot = flag('--root') ? path.resolve(flag('--root')) : root;
const outDir = path.join(root, 'tests', 'results', 'evidence', 'livelihood-' + label); fs.rmSync(outDir, { recursive: true, force: true }); fs.mkdirSync(outDir, { recursive: true });
const checks = []; let shotIndex = 0;
const check = (name, ok, detail) => { checks.push({ name, ok: Boolean(ok), detail: detail === undefined ? '' : String(detail).slice(0, 400) }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  ' + String(detail).slice(0, 200) : '')); };
const ART = { cols: [217, 325, 433, 541, 648], rows: [553, 646, 738, 831, 923], tagX: [227, 328, 429, 534, 636], tagY: 395, trayX: [209, 320, 432, 543, 655], trayY: 1058, weightX: [213, 320, 431, 543, 655], weightY: 1036, bundleTopY: 322, targetY: 1013 };
const IDS = ['red', 'white', 'teal', 'yellow', 'purple'];
(async () => {
  const port = Number(flag('--port')) || 8451, srv = startServer(port, serveRoot); await sleep(500);
  const c = await launch({ port: Number(flag('--cdp')) || 9701, width: 390, height: 844, mobile: true });
  const shot = async name => { const f = String(++shotIndex).padStart(2, '0') + '-' + name + '.png'; await c.screenshot(path.join(outDir, f)); return f; };
  const ev = js => c.eval(js);
  const mouse = async (type, x, y) => c.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: type === 'mouseMoved' ? 0 : 1, pointerType: 'mouse' });
  const state = () => ev('(()=>{const p=Silk.app.state.progress;const s=p.work&&p.work.pattern,w=p.work&&p.work.weaving;return {cash:p.cash,tick:p.world.tick,phase:p.world.tick%3,city:p.world.city,pattern:s?{phase:s.phase,settled:s.settled,seed:s.seed,wage:s.result?s.result.totalWage:null,score:s.result?s.result.score:null}:null,weaving:w?{phase:w.phase,settled:w.settled,seed:w.seed,wage:w.result?w.result.totalWage:null,status:w.result?w.result.status:null}:null,journalP:p.journal.filter(r=>r.type==="pattern").length,journalW:p.journal.filter(r=>r.type==="weaving").length,primary:Silk.ui.getState().primary}})()');
  const clickText = text => ev(`(()=>{const top=['modal-panel','result-panel','secondary-panel','primary-panel'].map(k=>document.querySelector('section.'+k)).find(s=>s&&!s.hidden&&s.offsetParent!==null);const scope=top&&[...top.querySelectorAll('button')].some(b=>b.offsetParent!==null&&b.textContent.trim()===${JSON.stringify(text)})?top:document;const b=[...scope.querySelectorAll('button')].find(b=>!b.disabled&&b.offsetParent!==null&&b.textContent.trim()===${JSON.stringify(text)});if(!b)return false;b.click();return true})()`);
  const visibleText = () => ev('(()=>{const s=[...document.querySelectorAll("section.paper-panel")].filter(x=>!x.hidden&&x.offsetParent!==null).pop();return s?s.innerText.replace(/\\s+/g," ").slice(0,900):""})()');
  const modalText = () => ev('(()=>{const m=document.querySelector("section.modal-panel");return m&&!m.hidden&&m.offsetParent!==null?m.innerText.replace(/\\s+/g," "):""})()');
  const waitFor = async (js, ms = 8000, step = 100) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(js)) return true; await sleep(step); } return false; };
  const busyWait = () => waitFor('!Silk.app.busy', 8000, 50);
  const toCity = async city => { await ev(`new Promise((resolve,reject)=>{const env=structuredClone(Silk.app.state);const p=env.progress;p.world.route=null;p.world.city=${JSON.stringify(city)};if(p.trip){p.trip.routeIndex=${city === 'khotan' ? 2 : 1};p.trip.phase='in_city';p.trip.routeHistory=${JSON.stringify(city === 'khotan' ? ['changan', 'dunhuang', 'khotan'] : ['changan', 'dunhuang'])};}p.world.tick=Math.ceil(p.world.tick/3)*3+3;if(p.world.tick%3!==0)p.world.tick+=3-p.world.tick%3;p.inventory.provisions=Math.max(p.inventory.provisions,20);p.eventSession=null;p.events=p.events||{};p.events.mainDays=p.events.mainDays||{};p.events.cityRollDays=p.events.cityRollDays||{};p.events.pendingCityRoll=null;for(let d=Math.floor(p.world.tick/3);d<Math.floor(p.world.tick/3)+60;d++){for(const cc of ['changan','dunhuang','khotan'])p.events.cityRollDays[cc+':'+d]={key:cc+':'+d,city:cc,day:d,trigger:false,suppressed:true};p.events.mainDays[d]='suppressed';}p.presentation.activeResult=null;env.meta.revision+=1;env.pending=null;const req=indexedDB.open('silkroad-rebuild-v1',2);req.onerror=()=>reject(req.error);req.onsuccess=()=>{const db=req.result;const tx=db.transaction('state','readwrite');tx.objectStore('state').put(env,'current');tx.oncomplete=()=>{db.close();resolve(true)};tx.onerror=()=>reject(tx.error);};})`); await ev('Silk.app.reload()'); await sleep(400); await waitFor('window.Silk&&Silk.app&&Silk.app.state&&Silk.app.state.progress&&Silk.app.state.progress.world&&!Silk.app.busy', 8000); await sleep(300); };
  const closeAll = async () => { for (let i = 0; i < 3; i++) { await ev(`(()=>{for(const s of document.querySelectorAll('section.paper-panel .close-button'))if(s.offsetParent!==null)s.click();})()`); await sleep(150); } };
  const confirmRisk = async () => { for (let i = 0; i < 3; i++) { const m = await modalText(); if (/仍要继续/.test(m)) { await clickText('仍要继续'); await busyWait(); await sleep(200); } else break; } };
  const nextMorning = async city => { await closeAll(); await ev("Silk.ui.dispatch('inn.stay')"); await busyWait(); await sleep(250); for (let i = 0; i < 4; i++) { const acked = await ev(`(()=>{const p=Silk.app.state.progress;const ar=p.presentation.activeResult;if(ar){Silk.ui.dispatch('result.ack',{resultId:ar.id});return true}return false})()`); await busyWait(); await sleep(200); if (!acked) break; } await closeAll(); const st = await state(); if (st.phase !== 0 || st.city !== city) await toCity(city); };
  const openList = async () => { await closeAll(); await ev(`document.querySelector('.city-hotspot[data-hotspot="work"]').click()`); await sleep(350); };
  // ---- 缀纹成章 helpers (Silk.patternChainUI.test)
  const pcRun = () => ev('(()=>{const r=Silk.patternChainUI.test.run();if(!r)return null;return {phase:r.phase,mode:r.mode,score:r.score,strokesLeft:r.strokesLeft,timeLeftMs:r.timeLeftMs,path:r.path.length,valid:r.validStrokes,paused:r.paused,endedBy:r.endedBy,rep:r.representativeMotif,cancels:r.cancels,page:Silk.patternChainUI.test.page()}})()');
  const pcPage = () => ev('Silk.patternChainUI.test.page()');
  const findPath = len => ev(`(()=>{const r=Silk.patternChainUI.test.run();return Silk.patternChainUI.test.engine().findPath(r.board,6,7,${len})})()`);
  const center = i => ev(`Silk.patternChainUI.test.cellCenter(${i})`);
  async function dragPath(idx, release = 'board') {
    const pts = []; for (const i of idx) pts.push(await center(i));
    await mouse('mousePressed', pts[0].x, pts[0].y); await sleep(25);
    for (let k = 1; k < pts.length; k++) { const a = pts[k - 1], b = pts[k]; for (let s = 1; s <= 3; s++) { await mouse('mouseMoved', a.x + (b.x - a.x) * s / 3, a.y + (b.y - a.y) * s / 3); await sleep(12); } }
    let end = pts[pts.length - 1];
    if (release === 'cancel') { const cz = await ev('(()=>{const b=Silk.patternChainUI.test.cancelRect();return {x:b.left+b.width/2,y:b.top+b.height/2}})()'); for (let s = 1; s <= 4; s++) { await mouse('mouseMoved', end.x + (cz.x - end.x) * s / 4, end.y + (cz.y - end.y) * s / 4); await sleep(15); } end = cz; }
    await mouse('mouseReleased', end.x, end.y); await sleep(40);
  }
  const settleAnim = async () => { await waitFor('(()=>{const u=Silk.patternChainUI.test.ui;const r=u.run;return !u.animating && !(r&&r.resolving)})()', 4000, 60); await sleep(80); };
  async function playToEnd(prefer = 5, maxLoops = 14) { for (let k = 0; k < maxLoops; k++) { const st = await pcRun(); if (!st || st.phase !== 'PLAYING') return st; const p = (await findPath(prefer)) || (await findPath(3)); if (!p) throw new Error('no path on board'); await dragPath(p); await settleAnim(); } return pcRun(); }
  const enterPattern = async () => { await openList(); await clickText('进入纹坊'); await sleep(400); await waitFor('Silk.patternChainUI.test.page()==="ready"', 3000); };
  // ---- 于阗织坊 helpers (Silk.weavingUI — the same surface as the standalone YutianWeavingUI)
  let G = null; const syncG = async () => { G = await ev('Silk.weavingUI.geom()'); return G; };
  const SC = (ax, ay) => { let cy = ay - G.artTop; for (const [a, b] of G.removed) { if (ay >= b) cy -= b - a; else if (ay > a) { cy -= ay - a; break; } } return { x: G.left + G.ox + (ax - G.x0) * G.k, y: G.top + G.oy + cy * G.k }; };
  const wvRun = () => ev('(()=>{const r=Silk.weavingUI.ui.run;const u=Silk.weavingUI.ui;if(!r)return {phase:null,overlay:u.overlay,mode:u.mode,kind:u.kind};const b=r.phase==="URGENT"?r.urgent.board:(r.weave&&r.weave.board);return {phase:r.phase,paused:r.paused,round:r.weave?r.weave.round:null,total:r.weave?r.weave.totalCompleted:null,rounds:r.weave?r.weave.roundsCompleted:null,timeLeft:r.timeLeftMs,tray:r.sort?r.sort.tray:null,placed:r.sort?Object.keys(r.sort.placed).length:null,warp:r.warp?r.warp.values:null,targets:b?b.targets:null,lit:b?Object.keys(b.lit):null,knot:r.weave&&r.weave.knot?r.weave.knot.node:null,loose:r.weave&&r.weave.loose?{from:r.weave.loose.from,to:r.weave.loose.to}:null,urgent:r.urgent?{required:r.urgent.required,lit:Object.keys(r.urgent.board.lit)}:null,status:r.status,wages:r.wages,mode:u.mode,overlay:u.overlay,kind:u.kind,rmode:r.mode}})()');
  const waitRun = async (pred, ms = 6000, step = 60) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const r = await wvRun(); if (pred(r)) return r; await sleep(step); } return await wvRun(); };
  const drag = async (from, to, steps, dwell) => { await mouse('mousePressed', from.x, from.y); await sleep(dwell); for (let i = 1; i <= steps; i++) { await mouse('mouseMoved', from.x + (to.x - from.x) * i / steps, from.y + (to.y - from.y) * i / steps); if (dwell) await sleep(dwell / 2); } await mouse('mouseReleased', to.x, to.y); };
  const clickArt = async (ax, ay) => { await syncG(); const p = SC(ax, ay); await mouse('mousePressed', p.x, p.y); await sleep(30); await mouse('mouseReleased', p.x, p.y); };
  const T9 = { stay: [295, 1423], leave: [665, 1423] };
  const routeLine = async (id, targets) => { const i = IDS.indexOf(id), j = targets.indexOf(id); const pts = [SC(ART.cols[i], ART.bundleTopY + 82)]; for (let r = 0; r < 5; r++) pts.push(SC(ART.cols[i], ART.rows[r])); const step = j > i ? 1 : -1; for (let col = i + step; step > 0 ? col <= j : col >= j; col += step) pts.push(SC(ART.cols[col], ART.rows[4])); pts.push(SC(ART.cols[j], ART.targetY + 52));
    await mouse('mousePressed', pts[0].x, pts[0].y); await sleep(20); for (let k = 1; k < pts.length; k++) { const a = pts[k - 1], b = pts[k]; for (let s = 1; s <= 3; s++) await mouse('mouseMoved', a.x + (b.x - a.x) * s / 3, a.y + (b.y - a.y) * s / 3); await sleep(14); } await mouse('mouseReleased', pts[pts.length - 1].x, pts[pts.length - 1].y); };
  const clearFaults = async () => { for (let g = 0; g < 8; g++) { const ov = await ev('Silk.weavingUI.ui.overlay'); if (ov === 'teach') { await clickText('知道了'); await sleep(150); continue; } const r = await wvRun(); if (r.phase !== 'WEAVE') return r; await syncG();
    if (r.knot !== null) { const n = r.knot, p = SC(ART.cols[n % 5], ART.rows[Math.floor(n / 5)]); await mouse('mousePressed', p.x, p.y); await sleep(20); await mouse('mouseReleased', p.x, p.y); await sleep(80); continue; }
    if (r.loose) { const a = SC(ART.cols[r.loose.from % 5], ART.rows[Math.floor(r.loose.from / 5)]), b = SC(ART.cols[r.loose.to % 5], ART.rows[Math.floor(r.loose.to / 5)]); await drag(a, b, 4, 20); await sleep(80); continue; }
    return r; } return await wvRun(); };
  const weaveBoard = async (onLine) => { for (let g = 0; g < 12; g++) { const r = await clearFaults(); if (!['WEAVE', 'URGENT'].includes(r.phase)) return r; await syncG();
    const pending = r.phase === 'URGENT' ? IDS.filter(x => r.urgent.required.includes(x) && !r.urgent.lit.includes(x)) : IDS.filter(x => !r.lit.includes(x)); if (!pending.length) return r;
    await routeLine(pending[0], r.targets); await sleep(90); const r2 = await wvRun(); if (onLine) { const stop = await onLine(r2); if (stop) return r2; }
    if (r2.phase === 'ROUND_TRANSITION') return await waitRun(x => x.phase !== 'ROUND_TRANSITION', 3000); if (r2.phase === 'SETTLED') return r2; } return await wvRun(); };
  const sortAll = async () => { for (let i = 0; i < 5; i++) { const r = await wvRun(); const id = r.tray[i], t = IDS.indexOf(id); await drag(SC(ART.trayX[i], ART.trayY + 89), SC(ART.tagX[t], ART.tagY + 40), 6, 20); await sleep(120); } };
  const warpAll = async () => { await ev('new Promise(res=>{const t0=Date.now();const t=setInterval(()=>{if(document.querySelectorAll(".yw-shell .weight").length===5||Date.now()-t0>3000){clearInterval(t);res()}},40)})'); await syncG(); for (let i = 0; i < 5; i++) { const r = await wvRun(); const v0 = r.warp[i]; await drag(SC(ART.weightX[i], ART.weightY + 90), SC(ART.weightX[i], ART.weightY + 90 + (v0 - 0.5) * 230), 8, 15); await sleep(100); } };
  const playWeaving = async ({ onLine } = {}) => { // real input from 理丝 to 今日收工 (or until onLine returns true)
    await syncG(); await sortAll(); let r = await waitRun(x => x.phase === 'WARP', 3000); if (r.phase !== 'WARP') return r; await warpAll(); r = await waitRun(x => x.phase === 'WARP_DONE' || x.phase === 'WEAVE', 3000); if (r.phase === 'WARP_DONE') { await clickArt(430, 1307); r = await waitRun(x => x.phase === 'WEAVE', 3000); }
    let guard = 0; while (guard++ < 10) { r = await wvRun(); if (!['WEAVE', 'URGENT', 'ROUND_TRANSITION'].includes(r.phase)) break; if (r.phase === 'ROUND_TRANSITION') { r = await waitRun(x => x.phase !== 'ROUND_TRANSITION', 3000); continue; } if (r.phase === 'URGENT') { r = await weaveBoard(onLine); await waitRun(x => x.phase !== 'URGENT', 9000); continue; } r = await weaveBoard(onLine); if (r.phase === 'SETTLED' || (onLine && r.__stop)) break; }
    return await wvRun(); };
  const enterWeaving = async () => { await openList(); await clickText('进入织坊'); await sleep(450); await waitFor('Silk.weavingUI.ui.overlay==="entry"', 3000); };
  const settlePage = () => ev('(()=>{const q=s=>[...document.querySelectorAll(".yw-shell "+s)];const cs=e=>getComputedStyle(e);const st=q(".settle-status")[0];const vals=q(".settle-value:not(.total)").map(e=>e.textContent);const tot=q(".settle-value.total")[0];return {status:st?st.textContent:null,labels:q(".settle-label").map(e=>e.textContent).join("/"),vals:vals.join("/"),total:tot?tot.textContent:null,buttons:q(".hit-btn").map(b=>b.getAttribute("aria-label")+":"+b.getAttribute("aria-disabled")).join("/"),bg:(document.querySelector(".yw-shell .bg").getAttribute("src")||"").replace(/^.*\\//,""),hud:document.querySelector(".yw-shell .hud").innerText.replace(/\\s+/g," ")}})()');
  const errors = [];
  try {
    await c.navigate('http://127.0.0.1:' + port + '/'); await sleep(900);
    await ev('new Promise(r=>{const t=setInterval(()=>{if(window.Silk&&Silk.app&&Silk.app.state){clearInterval(t);r()}},100)})');
    await clickText('启程'); await sleep(250); await clickText('自行探索'); await ev('new Promise(r=>{const t=setInterval(()=>{const p=Silk.app.state.progress;if(p&&p.world){clearInterval(t);r()}},100)})'); await sleep(400);
    await ev("Silk.ui.dispatch('trip.begin')"); await busyWait(); await ev("Silk.ui.dispatch('trip.depart',{acknowledgeSupplyWarning:true})"); await busyWait(); await sleep(200);
    await toCity('dunhuang');
    let st = await state(); check('boot: 敦煌 · 晨 · no livelihood session', st.city === 'dunhuang' && st.phase === 0 && !st.pattern && !st.weaving, JSON.stringify(st));
    // ================= 敦煌 营生 list =================
    await openList(); let text = await visibleText();
    check('A 敦煌 营生列表：两张卡（驼队装货 · 进入货栈 / 缀纹成章 · 进入纹坊），耗时 一日 / 半日', /驼队装货/.test(text) && /进入货栈/.test(text) && /缀纹成章/.test(text) && /进入纹坊/.test(text) && /耗时：一日/.test(text) && /耗时：半日/.test(text) && (await ev('document.querySelectorAll("[data-job]").length')) === 2, text.slice(0, 200)); await shot('dunhuang-list');
    const hotspotsAvail = await ev('[...document.querySelectorAll(".city-hotspot")].map(h=>h.dataset.hotspot+":"+h.dataset.availability).join(",")'); check('A 敦煌 all hotspots available (no 敬请期待 entry)', !/unavailable/.test(hotspotsAvail), hotspotsAvail);
    // ================= 缀纹成章 READY =================
    await clickText('进入纹坊'); await sleep(450); st = await state();
    const ready = await ev('(()=>{const s=Silk.patternChainUI.test;const m=s.modalRect();const panel=document.querySelector("[data-panel-id=\\"pattern-chain\\"]");const hdr=panel.querySelector(".panel-header");const bd=document.querySelector(".primary-layer .panel-backdrop");return {page:s.page(),w:+m.width.toFixed(1),h:+m.height.toFixed(1),inView:m.left>=0&&m.right<=innerWidth&&m.top>=0&&m.bottom<=innerHeight,hdrHidden:!hdr||getComputedStyle(hdr).display==="none",backdrop:getComputedStyle(bd).backgroundColor,hint:s.node("timeHintText").textContent,formal:!document.querySelector(".pc-shell [data-op=formal]").disabled,trial:!document.querySelector(".pc-shell [data-op=trial]").disabled,noScroll:document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight,title:document.querySelector(".pc-shell .title").textContent}})()');
    check('B 进入纹坊 → 主游戏面板 pattern-chain 内 360×620 modal（390×844），无面板标题栏、深色遮罩、无页面滚动', st.primary === 'pattern-chain' && ready.page === 'ready' && ready.w === 360 && ready.h === 620 && ready.inView && ready.hdrHidden && ready.noScroll && ready.title === '缀纹成章', JSON.stringify(ready));
    check('B READY 时辰提示读真实世界时间：当前：晨 · 可开始帮工，开始帮工 / 试玩可用', ready.hint === '当前：晨 · 可开始帮工' && ready.formal && ready.trial, ready.hint); await shot('pc-ready');
    await ev("(()=>{Silk.app.state.progress.world.tick+=2;Silk.ui.render(Silk.app.state);})()"); await sleep(200);
    let dusk = await ev('(()=>{const s=Silk.patternChainUI.test;return {hint:s.node("timeHintText").textContent,formal:!document.querySelector(".pc-shell [data-op=formal]").disabled,trial:!document.querySelector(".pc-shell [data-op=trial]").disabled,na:s.node("timeHint").classList.contains("na")}})()');
    check('B 暮: 当前：暮 · 今日不可帮工，开始帮工禁用（提示变灰），试玩可用', dusk.hint === '当前：暮 · 今日不可帮工' && !dusk.formal && dusk.trial && dusk.na, JSON.stringify(dusk)); await shot('pc-ready-dusk');
    await ev("(()=>{Silk.app.state.progress.world.tick-=1;Silk.ui.render(Silk.app.state);})()"); await sleep(200);
    dusk = await ev('(()=>{const s=Silk.patternChainUI.test;return {hint:s.node("timeHintText").textContent,formal:!document.querySelector(".pc-shell [data-op=formal]").disabled}})()');
    check('B 午: 当前：午 · 可开始帮工（HALF_DAY 午可开工）', dusk.hint === '当前：午 · 可开始帮工' && dusk.formal, JSON.stringify(dusk));
    await ev("(()=>{Silk.app.state.progress.world.tick-=1;Silk.ui.render(Silk.app.state);})()"); await sleep(200);
    // ---- instructions
    await ev('document.querySelector(".pc-shell [data-op=howto]").click()'); await sleep(200); check('C 玩法说明 → HOW_TO_PLAY（七种纹样图例，无 宝相花）', (await pcPage()) === 'howto' && (await ev('document.querySelectorAll(".pc-shell .legend div").length')) === 7 && !(await ev('document.querySelector(".pc-shell .modal").innerText.includes("宝相花")'))); await shot('pc-howto');
    await clickText('返回'); await sleep(200); check('C 返回 → READY', (await pcPage()) === 'ready');
    // ---- trial
    const cash0 = (await state()).cash, tick0 = (await state()).tick;
    await clickText('试玩'); await sleep(350); let r = await pcRun();
    check('D 试玩 → GAMEPLAY TRIAL（60 s / 10 笔 / 42 格），无主游戏会话', r && r.mode === 'TRIAL' && r.phase === 'PLAYING' && r.strokesLeft === 10 && (await ev('document.querySelectorAll(".pc-shell .tile").length')) === 42 && !(await state()).pattern, JSON.stringify(r)); await shot('pc-trial-board');
    let p3 = await findPath(3); await dragPath(p3, 'cancel'); r = await pcRun(); check('D 拖到取消区松手：取消、不扣笔', r.cancels === 1 && r.strokesLeft === 10 && r.score === 0);
    p3 = await findPath(3); await dragPath(p3); await settleAnim(); r = await pcRun(); check('D 真实拖动 3 连：+3 分、笔数 −1、棋盘补满 42', r.score === 3 && r.strokesLeft === 9 && (await ev('document.querySelectorAll(".pc-shell .tile").length')) === 42, JSON.stringify({ score: r.score, left: r.strokesLeft }));
    await ev('document.querySelector(".pc-shell [data-op=abort]").click()'); await sleep(250); let m = await modalText(); const tPaused = (await pcRun()).timeLeftMs; await sleep(600); const tPaused2 = (await pcRun()).timeLeftMs;
    check('D 局中 × → 主游戏 modal「中止本次试玩？」，引擎计时暂停', /中止本次试玩/.test(m) && /继续试玩/.test(m) && tPaused === tPaused2 && (await pcRun()).paused, JSON.stringify({ m: m.slice(0, 60), tPaused, tPaused2 })); await shot('pc-abort-modal');
    await clickText('继续试玩'); await sleep(400); r = await pcRun(); check('D 继续试玩 → 恢复计时', !r.paused && r.timeLeftMs < tPaused2 && r.phase === 'PLAYING');
    r = await playToEnd(5); check('D 试玩打到结束（STROKES）', r.phase === 'ENDED' && r.endedBy === 'STROKES' && r.valid === 10, JSON.stringify({ endedBy: r.endedBy, valid: r.valid, score: r.score }));
    await waitFor('Silk.patternChainUI.test.page()==="settle"', 4000); await sleep(1200); await shot('pc-trial-settle-mid');
    const rows = await ev('[...document.querySelectorAll(".pc-shell .stats li")].map(li=>li.querySelector(".lbl").textContent+"="+li.querySelector(".val").textContent)');
    const btns = await ev('[...document.querySelectorAll(".pc-shell .settle-buttons button")].map(b=>b.textContent).join("|")');
    check('D 试玩结算：总得分 / 最长连缀 / 有效落笔数 / 生成万能图样次数 / 收益=试玩模式 · 不获得实际收益；按钮 再试一次 | 退出试玩', rows.length === 5 && rows[0] === '总得分=' + r.score && rows[4] === '收益=试玩模式 · 不获得实际收益' && btns === '再试一次|退出试玩', JSON.stringify(rows));
    check('D 试玩结算：代表纹样 = 引擎四级规则，动态成章后落到真实 fullAsset', await waitFor('(()=>{const im=Silk.patternChainUI.test.node("revealFullImg");return !im.hidden&&/DPC_FULL_/.test(im.getAttribute("src")||"")})()', 7000) && r.rep === (await ev('Silk.patternChainUI.test.node("revealFullImg").dataset.motif')), r.rep); await shot('pc-trial-settle-final');
    st = await state(); check('D 试玩不改变世界：钱 / 时段不变，无会话', st.cash === cash0 && st.tick === tick0 && !st.pattern, JSON.stringify(st));
    await clickText('退出试玩'); await sleep(250); check('D 退出试玩 → READY', (await pcPage()) === 'ready');
    // ---- formal 晨
    await clickText('开始帮工'); await sleep(300); await confirmRisk(); await waitFor('(()=>{const r=Silk.patternChainUI.test.run();return r&&r.mode==="FORMAL"&&r.phase==="PLAYING"})()', 8000); await sleep(200); st = await state(); r = await pcRun();
    check('E 开始帮工（晨）→ 主游戏会话 PLAYING（seed 由主游戏 RNG 决定）、界面 GAMEPLAY FORMAL、HUD 标 正式 · 半日工', st.pattern && st.pattern.phase === 'PLAYING' && Number.isInteger(st.pattern.seed) && r.mode === 'FORMAL' && (await ev('Silk.patternChainUI.test.node("hudMode").textContent')) === '正式 · 半日工', JSON.stringify({ st: st.pattern, r: r && r.mode }));
    const seedBoard = await ev('(()=>{const r=Silk.patternChainUI.test.run();const p=Silk.app.state.progress.work.pattern;const b=Silk.patternChainUI.test.engine().createRun({mode:"FORMAL",seed:p.seed}).board.map(c=>c.motif).join();return b===r.board.map(c=>c.motif).join()})()'); check('E 局内棋盘 = 引擎从会话 seed 重建的棋盘（可从存档复现）', seedBoard);
    const gated = await ev("(async()=>{try{await Silk.ui.dispatch('market.enter');}catch(e){}return Silk.app.state.progress.market.visit?'entered':'blocked'})()"); await sleep(100); await ev("(()=>{const e=document.querySelector('section.modal-panel');if(e&&!e.hidden){const b=[...e.querySelectorAll('button')].find(x=>x.offsetParent!==null);if(b)b.click();}})()");
    check('E 帮工期间其他命令被拦截（MINIGAME_ACTIVE）', gated === 'blocked', gated);
    r = await playToEnd(5); check('E 正式局打到结束', r.phase === 'ENDED', JSON.stringify({ endedBy: r.endedBy, score: r.score, valid: r.valid }));
    const finished = await waitFor('(()=>{const p=Silk.app.state.progress;const s=p.work&&p.work.pattern;return s&&s.phase==="FINISHED"&&s.result&&!s.settled})()', 8000); await sleep(400); st = await state();
    const expectWage = await ev(`Silk.patternChain.payout({validStrokes:${r.valid},score:${r.score}}).cash`);
    check('E 收工记录写入主游戏（PATTERN_FINISH）：分数 / 工钱 = TEMP 映射，尚未结算、钱未变', finished && st.pattern.score === r.score && st.pattern.wage === expectWage && st.pattern.settled === false && st.cash === cash0, JSON.stringify(st.pattern));
    await waitFor('(()=>{const im=Silk.patternChainUI.test.node("revealFullImg");return !im.hidden})()', 7000);
    const frows = await ev('[...document.querySelectorAll(".pc-shell .stats li")].map(li=>li.querySelector(".lbl").textContent+"="+li.querySelector(".val").textContent)'); const fbtn = await ev('[...document.querySelectorAll(".pc-shell .settle-buttons button")].map(b=>b.textContent+":"+b.disabled).join("|")');
    check('E 正式结算页：所得工钱 = ' + expectWage + ' 钱（基础 5 + 额外，单行），唯一按钮 结束帮工', frows[4] === '所得工钱=' + expectWage + ' 钱（5+' + (expectWage - 5) + '）' && fbtn === '结束帮工:false', JSON.stringify({ frows, fbtn })); await shot('pc-formal-settle');
    const xIgnored = await ev('(()=>{Silk.ui.closePanel();return Silk.ui.getState().primary})()'); check('E 结算未完成时宿主关闭被忽略（面板仍是 pattern-chain）', xIgnored === 'pattern-chain', xIgnored);
    await clickText('结束帮工'); await busyWait(); await sleep(500); st = await state(); text = await visibleText();
    check('E 结束帮工 → 结算一次：钱 +' + expectWage + '、+1 时段落在午、journal 1 条，回到营生列表', st.cash === cash0 + expectWage && st.phase === 1 && st.pattern.settled === true && st.journalP === 1 && /进入纹坊/.test(text), JSON.stringify(st)); await shot('pc-after-settle-list');
    const hud = await ev('document.body.innerText.includes(String(Silk.app.state.progress.cash))'); check('E HUD 显示新的钱数', hud);
    // ---- formal 午 → 暮 → inn
    const cash1 = st.cash; await clickText('进入纹坊'); await sleep(400); await clickText('开始帮工'); await sleep(300); await confirmRisk(); await waitFor('(()=>{const r=Silk.patternChainUI.test.run();return r&&r.mode==="FORMAL"&&r.phase==="PLAYING"})()', 8000);
    r = await playToEnd(5); await waitFor('(()=>{const p=Silk.app.state.progress;const s=p.work&&p.work.pattern;return s&&s.phase==="FINISHED"})()', 8000); await sleep(300); st = await state(); const wage2 = st.pattern.wage;
    await waitFor('(()=>{const b=[...document.querySelectorAll(".pc-shell .settle-buttons button")].find(x=>x.textContent==="结束帮工");return b&&!b.disabled})()', 6000); await clickText('结束帮工'); await busyWait(); await sleep(500); st = await state(); text = await visibleText();
    check('F 午间开工 → 结束帮工 → 暮，钱 +' + wage2 + '，进入客舍住宿流程', st.cash === cash1 + wage2 && st.phase === 2 && /客舍|住宿|歇息/.test(text), JSON.stringify({ st, text: text.slice(0, 60) })); await shot('pc-after-noon-inn');
    // ---- abort formal via ×
    await nextMorning('dunhuang'); st = await state(); const cash2 = st.cash;
    await enterPattern(); await clickText('开始帮工'); await sleep(300); await confirmRisk(); await waitFor('(()=>{const r=Silk.patternChainUI.test.run();return r&&r.mode==="FORMAL"&&r.phase==="PLAYING"})()', 8000); await sleep(150);
    p3 = await findPath(3); await dragPath(p3); await settleAnim();
    await ev('Silk.ui.closePanel()'); await sleep(250); m = await modalText(); check('G 宿主关闭（Escape / X）→ 主游戏 modal「中止本次帮工？」', /中止本次帮工/.test(m) && /继续帮工/.test(m), m.slice(0, 80));
    await clickText('继续帮工'); await sleep(250); r = await pcRun(); check('G 继续帮工 → 回到局内，进度保留', r.phase === 'PLAYING' && r.valid === 1);
    await ev('document.querySelector(".pc-shell [data-op=abort]").click()'); await sleep(250); await clickText('中止'); await busyWait(); await sleep(500); st = await state(); text = await visibleText();
    check('G 中止 → 会话 ABORTED，不付钱不耗时，回到营生列表', st.pattern && st.pattern.phase === 'ABORTED' && st.cash === cash2 && st.phase === 0 && /进入纹坊/.test(text), JSON.stringify(st)); await shot('pc-after-abort');
    // ---- reload during a formal run
    await clickText('进入纹坊'); await sleep(400); await clickText('开始帮工'); await sleep(300); await confirmRisk(); await waitFor('(()=>{const r=Silk.patternChainUI.test.run();return r&&r.mode==="FORMAL"&&r.phase==="PLAYING"})()', 8000); await sleep(150);
    await c.navigate('http://127.0.0.1:' + port + '/'); await sleep(1200); await ev('new Promise(r=>{const t=setInterval(()=>{if(window.Silk&&Silk.app&&Silk.app.state&&Silk.app.state.progress){clearInterval(t);r()}},100)})'); await waitFor('!Silk.app.busy', 10000); await sleep(500); st = await state(); text = await visibleText();
    check('H 重载：进行中的正式帮工恢复为「这次帮工已经中断」页 + 离开纹坊（面板被锁定）', st.pattern && st.pattern.phase === 'PLAYING' && st.primary === 'pattern-chain' && (await pcPage()) === 'stale' && /这次帮工已经中断/.test(text), JSON.stringify({ st: st.pattern, page: await pcPage() })); await shot('pc-stale');
    await clickText('离开纹坊'); await busyWait(); await sleep(400); st = await state();
    check('H 离开纹坊 → 中止恢复（不计时、不付钱）', st.pattern.phase === 'ABORTED' && st.cash === cash2 && st.phase === 0, JSON.stringify(st));
    // ---- zero-clear timeout of a formal run
    await enterPattern(); await clickText('开始帮工'); await sleep(300); await confirmRisk(); await waitFor('(()=>{const r=Silk.patternChainUI.test.run();return r&&r.mode==="FORMAL"&&r.phase==="PLAYING"})()', 8000); await sleep(150);
    await ev('Silk.patternChainUI.test.engine().tick(Silk.patternChainUI.test.run(),59500);true'); await waitFor('(()=>{const p=Silk.app.state.progress;const s=p.work&&p.work.pattern;return s&&s.phase==="FINISHED"})()', 8000); await sleep(400); st = await state();
    const zrows = await ev('[...document.querySelectorAll(".pc-shell .stats li")].map(li=>li.querySelector(".lbl").textContent+"="+li.querySelector(".val").textContent)');
    check('I 零有效落笔的超时局：尚无纹样、所得工钱 0 钱（未有效落笔）', st.pattern.wage === 0 && (await ev('Silk.patternChainUI.test.node("motifName").textContent')) === '尚无纹样' && zrows[4] === '所得工钱=0 钱（未有效落笔）', JSON.stringify(zrows)); await shot('pc-zero-clear');
    await clickText('结束帮工'); await busyWait(); await sleep(400); st = await state(); check('I 结束帮工：0 钱、仍耗半日（午）', st.cash === cash2 && st.phase === 1 && st.pattern.settled, JSON.stringify(st));
    // ---- viewport 375×667
    await c.send('Emulation.setDeviceMetricsOverride', { width: 375, height: 667, deviceScaleFactor: 2, mobile: true, screenWidth: 375, screenHeight: 667 }); await sleep(300); await enterPattern(); await sleep(300);
    const small = await ev('(()=>{const s=Silk.patternChainUI.test;const m=s.modalRect();const panel=document.querySelector("[data-panel-id=\\"pattern-chain\\"]").getBoundingClientRect();return {w:+m.width.toFixed(1),h:+m.height.toFixed(1),inPanel:m.left>=panel.left-.5&&m.right<=panel.right+.5&&m.top>=panel.top-.5&&m.bottom<=panel.bottom+.5,inView:m.top>=0&&m.bottom<=innerHeight,noScroll:document.documentElement.scrollHeight<=innerHeight,ratio:+(m.height/m.width).toFixed(3)}})()');
    check('J 375×667：modal 等比缩小（' + small.w + '×' + small.h + '）在面板与视口内，无滚动', small.inPanel && small.inView && small.noScroll && small.ratio > 1.7 && small.ratio < 1.73 && small.h < 620, JSON.stringify(small)); await shot('pc-ready-375x667');
    await clickText('试玩'); await sleep(300); p3 = await findPath(3); await dragPath(p3); await settleAnim(); r = await pcRun(); check('J 375×667 真实拖动仍可提交', r.score >= 3, JSON.stringify({ score: r.score }));
    await ev('document.querySelector(".pc-shell [data-op=abort]").click()'); await sleep(200); await clickText('中止'); await sleep(400);
    await c.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true, screenWidth: 390, screenHeight: 844 }); await sleep(300);
    // ================= 于阗 营生 =================
    await toCity('khotan'); st = await state(); check('K 于阗 · 晨', st.city === 'khotan' && st.phase === 0, JSON.stringify(st));
    await openList(); text = await visibleText();
    check('K 于阗 营生列表：一张卡（于阗织坊 · 耗时：一日 · 进入织坊），hotspot 可用', /于阗织坊/.test(text) && /进入织坊/.test(text) && /耗时：一日/.test(text) && (await ev('document.querySelectorAll("[data-job]").length')) === 1 && (await ev('document.querySelector(".city-hotspot[data-hotspot=work]").dataset.availability')) === 'available', text.slice(0, 160)); await shot('khotan-list');
    await clickText('进入织坊'); await sleep(450); st = await state();
    const wentry = await ev('(()=>{const g=Silk.weavingUI.geom();const panel=document.querySelector("[data-panel-id=\\"weaving\\"]");const hdr=panel.querySelector(".panel-header");const card=document.querySelector(".yw-shell .card");return {overlay:Silk.weavingUI.ui.overlay,w:+g.modal.width.toFixed(1),h:+g.modal.height.toFixed(1),inView:g.modal.x>=0&&g.modal.x+g.modal.width<=innerWidth&&g.modal.y>=0&&g.modal.y+g.modal.height<=innerHeight,hdrHidden:!hdr||getComputedStyle(hdr).display==="none",text:card?card.innerText.replace(/\\s+/g," "):"",buttons:[...document.querySelectorAll(".yw-shell .card .btn")].map(b=>b.textContent+":"+b.disabled).join("|"),hud:document.querySelector(".yw-shell .hud").innerText.replace(/\\s+/g," "),noScroll:document.documentElement.scrollHeight<=innerHeight}})()');
    check('K 进入织坊 → 面板 weaving 内 360×620 modal（HUD 52 px 在窗内），入口卡：当前：晨 · 可开始帮工 / 本次帮工：一日，正式帮工 | 先试一试 | 玩法说明 | 离开织坊', st.primary === 'weaving' && wentry.overlay === 'entry' && Math.abs(wentry.w - Math.min(360, 0.92 * 390)) < 1 && wentry.h === 620 && wentry.inView && wentry.hdrHidden && wentry.noScroll && /当前：晨 · 可开始帮工/.test(wentry.text) && /本次帮工：一日/.test(wentry.text) && wentry.buttons === '正式帮工:false|先试一试:false|玩法说明:false|离开织坊:false' && /于阗织坊/.test(wentry.hud), JSON.stringify(wentry)); await shot('yw-entry');
    await ev("(()=>{Silk.app.state.progress.world.tick+=1;Silk.ui.render(Silk.app.state);})()"); await sleep(250);
    const wnoon = await ev('(()=>{const card=document.querySelector(".yw-shell .card");return {text:card.innerText.replace(/\\s+/g," "),formal:document.querySelector(".yw-shell .card .btn").disabled}})()');
    check('K 午: 入口卡 今日时间不足、正式帮工禁用（FULL_DAY 只在晨开工）', /当前：午 · 今日时间不足/.test(wnoon.text) && wnoon.formal, JSON.stringify(wnoon)); await shot('yw-entry-noon');
    await ev("(()=>{Silk.app.state.progress.world.tick-=1;Silk.ui.render(Silk.app.state);})()"); await sleep(250);
    await clickText('玩法说明'); await sleep(200); check('L 玩法说明卡（含工时一日）', (await ev('Silk.weavingUI.ui.overlay')) === 'help' && /耗时一日/.test(await ev('document.querySelector(".yw-shell .card").innerText'))); await clickText('返回'); await sleep(200); check('L 返回 → 入口卡', (await ev('Silk.weavingUI.ui.overlay')) === 'entry');
    // ---- trial (1 round, no timer)
    const kcash0 = (await state()).cash, ktick0 = (await state()).tick;
    await clickText('先试一试'); await sleep(350); let w = await wvRun(); check('L 先试一试 → 理丝（trial，日影 —），无主游戏会话', w.phase === 'SORT' && w.rmode === 'trial' && !(await state()).weaving && (await ev('document.querySelector(".yw-shell [data-ref=hudSecs]").textContent')) === '—', JSON.stringify({ phase: w.phase, mode: w.rmode })); await shot('yw-trial-sort');
    await syncG(); await sortAll(); w = await waitRun(x => x.phase === 'WARP', 3000); check('L 真实拖动理丝 5 束 → 定经', w.phase === 'WARP', JSON.stringify({ phase: w.phase, placed: w.placed })); await shot('yw-trial-warp');
    await warpAll(); w = await waitRun(x => x.phase === 'WARP_DONE' || x.phase === 'WEAVE', 3000); if (w.phase === 'WARP_DONE') { await clickArt(430, 1307); w = await waitRun(x => x.phase === 'WEAVE', 3000); } check('L 真实拖动定经 5 组 → 开工', w.phase === 'WEAVE' && w.round === 1, w.phase); await shot('yw-trial-weave');
    w = await weaveBoard(); w = await waitRun(x => x.phase === 'SETTLED', 5000); check('L 试工一轮五根 → 试工结束卡（status trial）', w.phase === 'SETTLED' && w.status === 'trial' && (await ev('Silk.weavingUI.ui.overlay')) === 'trialEnd', JSON.stringify({ phase: w.phase, status: w.status, total: w.total })); await shot('yw-trial-end');
    st = await state(); check('L 试工不改变世界：钱 / 时段不变，无会话', st.cash === kcash0 && st.tick === ktick0 && !st.weaving, JSON.stringify(st));
    await clickText('返回'); await sleep(250); check('L 返回 → 入口卡', (await ev('Silk.weavingUI.ui.overlay')) === 'entry');
    // ---- formal: full run with real input → 今日收工 → 离开织坊
    await clickText('正式帮工'); await sleep(300); await confirmRisk(); await waitFor('(()=>{const r=Silk.weavingUI.ui.run;return r&&r.mode==="formal"&&Silk.weavingUI.ui.kind==="formal"})()', 8000); await sleep(200); st = await state(); w = await wvRun();
    check('M 正式帮工（晨）→ 主游戏会话 PLAYING（seed 由主游戏 RNG 决定），局内 formal 75 s', st.weaving && st.weaving.phase === 'PLAYING' && Number.isInteger(st.weaving.seed) && w.rmode === 'formal' && w.timeLeft <= 75000 && w.timeLeft > 60000, JSON.stringify({ st: st.weaving, t: w.timeLeft }));
    const seedSame = await ev('(()=>{const r=Silk.weavingUI.ui.run;const p=Silk.app.state.progress.work.weaving;const b=Silk.weavingUI.E().createRun({mode:"formal",seed:p.seed});return b.sort.tray.join()===r.sort.tray.join()&&b.weave.board.targets.join()===r.weave.board.targets.join()})()'); check('M 局内托盘 / 目标顺序 = 引擎从会话 seed 重建', seedSame);
    const kgated = await ev("(async()=>{try{await Silk.ui.dispatch('market.enter');}catch(e){}return Silk.app.state.progress.market.visit?'entered':'blocked'})()"); await sleep(100); await ev("(()=>{const e=document.querySelector('section.modal-panel');if(e&&!e.hidden){const b=[...e.querySelectorAll('button')].find(x=>x.offsetParent!==null);if(b)b.click();}})()"); check('M 帮工期间其他命令被拦截（MINIGAME_ACTIVE）', kgated === 'blocked', kgated);
    await ev('Silk.ui.closePanel()'); await sleep(250); check('M 宿主关闭（Escape / X）→ 暂停卡（日影已停），面板仍是 weaving', (await ev('Silk.weavingUI.ui.overlay')) === 'pause' && (await wvRun()).paused && (await state()).primary === 'weaving'); await shot('yw-pause'); await clickText('继续游戏'); await sleep(200);
    w = await playWeaving(); w = await waitRun(x => x.phase === 'SETTLED', 6000);
    check('M 真实输入织完三轮十五根 → 今日收工（complete）', w.phase === 'SETTLED' && w.status === 'complete' && w.total === 15, JSON.stringify({ phase: w.phase, status: w.status, total: w.total, wages: w.wages }));
    const wfinished = await waitFor('(()=>{const p=Silk.app.state.progress;const s=p.work&&p.work.weaving;return s&&s.phase==="FINISHED"&&s.result&&!s.settled})()', 8000); await sleep(500); st = await state();
    check('M 收工记录写入主游戏（WEAVING_FINISH）：工钱由主游戏按冻结档位重算 = 引擎 wages，尚未结算、钱未变', wfinished && st.weaving.wage === w.wages.total && st.weaving.status === 'complete' && st.cash === kcash0, JSON.stringify(st.weaving));
    let sp = await settlePage();
    check('M 今日收工页（UI-09 模板）：顺利收工，基础工钱 / 常规加赏 / 急束加成 / 合计收入 = ' + JSON.stringify(w.wages) + '，画好的 继续留坊 / 离开织坊 可点', sp.status === '顺利收工' && sp.labels === '基础工钱/常规加赏/急束加成/合计收入' && sp.vals === [w.wages.base, w.wages.regular, w.wages.urgent].join('/') && sp.total === String(w.wages.total) && sp.buttons === '继续留坊:false/离开织坊:false' && /body_settle/.test(sp.bg), JSON.stringify(sp)); await shot('yw-settle-complete');
    const kIgnored = await ev('(()=>{Silk.ui.closePanel();return Silk.ui.getState().primary})()'); check('M 结算未完成时宿主关闭被忽略', kIgnored === 'weaving', kIgnored);
    await clickArt(...T9.leave); await busyWait(); await sleep(600); st = await state(); text = await visibleText();
    check('M 离开织坊 → 结算一次：钱 +' + w.wages.total + '、+2 时段落在暮、journal 1 条 → 客舍住宿流程', st.cash === kcash0 + w.wages.total && st.phase === 2 && st.weaving.settled === true && st.journalW === 1 && /客舍|住宿|歇息/.test(text), JSON.stringify({ st, text: text.slice(0, 60) })); await shot('yw-after-leave-inn');
    // ---- timeout after a few lines → 继续留坊 at dusk (settle, then the entry card: no new formal run today)
    await nextMorning('khotan'); st = await state(); const kcash1 = st.cash;
    await enterWeaving(); await clickText('正式帮工'); await sleep(300); await confirmRisk(); await waitFor('(()=>{const r=Silk.weavingUI.ui.run;return r&&r.mode==="formal"&&Silk.weavingUI.ui.kind==="formal"})()', 8000); await sleep(200);
    let linesDone = 0; w = await playWeaving({ onLine: async r2 => { linesDone++; if (linesDone === 4 && r2.phase === 'WEAVE') { await ev('Silk.weavingUI.ui.run.timeLeftMs=400'); return true; } return false; } });
    w = await waitRun(x => x.phase === 'SETTLED', 6000); await waitFor('(()=>{const p=Silk.app.state.progress;const s=p.work&&p.work.weaving;return s&&s.phase==="FINISHED"})()', 8000); await sleep(500); st = await state(); sp = await settlePage();
    check('N 日影耗尽（timeout, ' + w.total + ' 根）：顺利收工（不显示结束原因），合计 = 引擎工钱 = 主游戏工钱', w.status === 'timeout' && sp.status === '顺利收工' && sp.total === String(w.wages.total) && st.weaving.wage === w.wages.total, JSON.stringify({ wages: w.wages, host: st.weaving })); await shot('yw-settle-timeout');
    await clickArt(...T9.stay); await busyWait(); await sleep(600); st = await state();
    const stayCard = await ev('(()=>{const card=document.querySelector(".yw-shell .card");return {overlay:Silk.weavingUI.ui.overlay,text:card?card.innerText.replace(/\\s+/g," "):"",formal:card?card.querySelector(".btn").disabled:null}})()');
    check('N 继续留坊 → 先结算（钱 +' + w.wages.total + '、落在暮），暮时不能再开新局 → 入口卡：今日时间不足、正式帮工禁用', st.cash === kcash1 + w.wages.total && st.phase === 2 && st.weaving.settled && stayCard.overlay === 'entry' && /今日时间不足/.test(stayCard.text) && stayCard.formal === true, JSON.stringify({ st, stayCard })); await shot('yw-stay-dusk');
    await clickText('离开织坊'); await sleep(300); check('N 入口卡 离开织坊 → 面板关闭', (await state()).primary === null || (await state()).primary !== 'weaving');
    // ---- abort via pause → 退出游戏 → 离开织坊
    await nextMorning('khotan'); st = await state(); const kcash2 = st.cash;
    await enterWeaving(); await clickText('正式帮工'); await sleep(300); await confirmRisk(); await waitFor('(()=>{const r=Silk.weavingUI.ui.run;return r&&r.mode==="formal"&&Silk.weavingUI.ui.kind==="formal"})()', 8000); await sleep(200); await syncG();
    { const r0 = await wvRun(); const id = r0.tray[0], t = IDS.indexOf(id); await drag(SC(ART.trayX[0], ART.trayY + 89), SC(ART.tagX[t], ART.tagY + 40), 6, 20); await sleep(150); }
    await ev('document.querySelector(".yw-shell [data-ref=pause]").click()'); await sleep(200); await clickText('退出游戏'); await sleep(200); check('O 暂停 → 退出游戏 → 尚未收工确认卡', (await ev('Silk.weavingUI.ui.overlay')) === 'quit' && /不耗去时辰/.test(await ev('document.querySelector(".yw-shell .card").innerText'))); await shot('yw-quit-confirm');
    await clickText('离开织坊'); await busyWait(); await sleep(400); st = await state();
    check('O 主动离开 → 会话 ABORTED（0 钱 0 时辰），回到入口卡', st.weaving && st.weaving.phase === 'ABORTED' && st.cash === kcash2 && st.phase === 0 && (await ev('Silk.weavingUI.ui.overlay')) === 'entry', JSON.stringify(st));
    // ---- reload during a formal run
    await clickText('正式帮工'); await sleep(300); await confirmRisk(); await waitFor('(()=>{const r=Silk.weavingUI.ui.run;return r&&r.mode==="formal"&&Silk.weavingUI.ui.kind==="formal"})()', 8000); await sleep(200);
    await c.navigate('http://127.0.0.1:' + port + '/'); await sleep(1200); await ev('new Promise(r=>{const t=setInterval(()=>{if(window.Silk&&Silk.app&&Silk.app.state&&Silk.app.state.progress){clearInterval(t);r()}},100)})'); await waitFor('!Silk.app.busy', 10000); await sleep(500); st = await state();
    check('P 重载：进行中的正式帮工恢复为「这次帮工已经中断」卡（面板锁定）', st.weaving && st.weaving.phase === 'PLAYING' && st.primary === 'weaving' && (await ev('Silk.weavingUI.ui.overlay')) === 'stale', JSON.stringify({ st: st.weaving, overlay: await ev('Silk.weavingUI.ui.overlay') })); await shot('yw-stale');
    await clickText('离开织坊'); await busyWait(); await sleep(400); st = await state(); check('P 离开织坊 → 中止恢复（不计时、不付钱）', st.weaving.phase === 'ABORTED' && st.cash === kcash2 && st.phase === 0, JSON.stringify(st));
    // ---- viewport 375×667
    await c.send('Emulation.setDeviceMetricsOverride', { width: 375, height: 667, deviceScaleFactor: 2, mobile: true, screenWidth: 375, screenHeight: 667 }); await sleep(300); await ev('Silk.ui.closePanel()'); await sleep(200); await enterWeaving(); await sleep(300);
    const ksmall = await ev('(()=>{const g=Silk.weavingUI.geom();const panel=document.querySelector("[data-panel-id=\\"weaving\\"]").getBoundingClientRect();const m=g.modal;return {w:+m.width.toFixed(1),h:+m.height.toFixed(1),inPanel:m.x>=panel.left-.5&&m.x+m.width<=panel.right+.5&&m.y>=panel.top-.5&&m.y+m.height<=panel.bottom+.5,noScroll:document.documentElement.scrollHeight<=innerHeight,hudH:document.querySelector(".yw-shell .hud").getBoundingClientRect().height}})()');
    check('Q 375×667：织坊 modal 缩小（' + ksmall.w + '×' + ksmall.h + '）在面板内，HUD 52 px，无滚动', ksmall.inPanel && ksmall.noScroll && ksmall.h < 620 && ksmall.w <= 360 && Math.round(ksmall.hudH) === 52, JSON.stringify(ksmall)); await shot('yw-entry-375x667');
    await c.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true, screenWidth: 390, screenHeight: 844 }); await sleep(200); await ev('Silk.ui.closePanel()'); await sleep(200); await shot('khotan-city-after');
    const consoleErrors = (c.console || []).filter(e => /error|exception/i.test(e.type || '')); check('Z 无控制台错误', consoleErrors.length === 0, JSON.stringify(consoleErrors.slice(0, 3)));
    const bad = (c.network || []).filter(n => n.status !== 200 && n.status !== 304); check('Z 所有请求 200', bad.length === 0, JSON.stringify(bad.slice(0, 5)));
  } catch (e) { errors.push(String(e && e.stack || e)); console.error(e); try { await shot('error'); } catch (_) { /* ignore */ } }
  await c.close(); srv.stop();
  const passed = checks.filter(x => x.ok).length;
  fs.writeFileSync(path.join(outDir, 'livelihood-run.json'), JSON.stringify({ label, serveRoot, passed, total: checks.length, checks, errors, generatedAt: new Date().toISOString() }, null, 2));
  console.log(`livelihood browser run [${label}]: ${passed}/${checks.length}` + (errors.length ? ' (script error)' : '') + ' → ' + outDir);
  process.exit(passed === checks.length && !errors.length ? 0 : 1);
})();
