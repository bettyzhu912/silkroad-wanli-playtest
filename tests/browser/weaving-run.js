'use strict';
// 于阗织坊 FINAL v1.0 — real-browser acceptance run (headless Chrome, mobile emulation). Drives the loom through the UI test hooks
// (synthetic pointer events on the canvas) and checks the QA list: trial flow, 75s formal run, 3/4/5 groups, wrong pattern, undo,
// crossing without / with knot, loose thread (recovered / missed), rush success / miss / none, abort, reload, day end, 12 with knot,
// 12 clean early finish, wage tiers and the 23 boundary, settlement idempotency, +2 ticks to 暮, return to the map + lodging.
// Usage: node tests/browser/weaving-run.js [label] [--root <dir>]
const fs = require('fs'), path = require('path');
const { launch, startServer, sleep } = require('../tools/cdp');
const root = path.join(__dirname, '..', '..');
const argv = process.argv.slice(2), flag = n => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const label = argv.find((a, i) => !a.startsWith('--') && (i === 0 || !argv[i - 1].startsWith('--'))) || 'weaving';
const serveRoot = flag('--root') ? path.resolve(flag('--root')) : root;
const outDir = path.join(root, 'tests', 'results', 'evidence', 'weaving-' + label); fs.rmSync(outDir, { recursive: true, force: true }); fs.mkdirSync(outDir, { recursive: true });
const checks = []; let shotIndex = 0, riskSeen = 0;
const check = (name, ok, detail) => { checks.push({ name, ok: Boolean(ok), detail: detail === undefined ? '' : String(detail).slice(0, 300) }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  ' + String(detail).slice(0, 200) : '')); };
const HELPER = `(() => {
  const T = Silk.weavingUI.test; window.__wvOffset = 0; T.clock.now = () => performance.now() + window.__wvOffset;
  const L = () => T.layout();
  const near = (list, x) => list.reduce((b, n) => Math.abs(n.x - x) < Math.abs(b.x - x) ? n : b, list[0]);
  window.__wv = {
    ui() { const u = T.ui; const c = u.current; return { screen: u.screen, step: u.step, kind: u.kind, totalCorrect: u.totalCorrect, knots: u.knots.length, looseThread: u.looseThread, looseCount: u.looseCount, rushActive: u.rushActive, rushDone: u.rushDone, rushSuccess: u.rushSuccess, rushPlanned: u.rushPlanned, baseRemaining: u.baseRemaining, rushRemaining: u.rushRemaining, wrongEndpoint: u.wrongEndpoint, idleClean: u.idleClean, looseRecovered: u.looseRecovered, transitioning: u.transitioning, pendingStats: Boolean(u.pendingStats), groupIndex: u.groupIndex, message: u.message, current: c ? { count: c.count, rush: c.rush, threads: c.threads.map(t => ({ id: t.id, connected: t.connected, placed: t.placed, points: t.points.length })) } : null }; },
    layout() { const c = L(); return c ? { starts: c.starts, nodes: c.nodes, targets: c.targets, loose: c.loose, w: c.w, h: c.h } : null; },
    knots() { return T.ui.knots.map(k => ({ x: k.x, y: k.y, threadId: k.threadId })); },
    head(id) { const t = L().threads[id]; return t.points[t.points.length - 1]; },
    drag(pts, type) { T.pointer('down', pts[0].x, pts[0].y, type || 'mouse'); for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i]; for (let k = 1; k <= 4; k++) T.pointer('move', a.x + (b.x - a.x) * k / 4, a.y + (b.y - a.y) * k / 4, type || 'mouse'); } T.pointer('up', pts[pts.length - 1].x, pts[pts.length - 1].y, type || 'mouse'); },
    // route a thread from its current head to its own target: 'hub' converges through one shared last-row ring (never crosses), 'direct' goes straight (may cross)
    route(id, mode, opts = {}) { const c = L(); const t = c.threads[id]; if (t.connected) return 'connected'; const head = t.points[t.points.length - 1]; const start = c.starts[id]; const rows = Math.max(...c.nodes.map(n => n.row)) + 1;
      const target = c.targets.find(x => x.motif === t.motif); const pts = [head]; const rowNodes = r => c.nodes.filter(n => n.row === r);
      if (mode === 'hub') { for (let r = 0; r < rows - 1; r++) { const n = near(rowNodes(r), start.x); if (!(head.type === 'node' && head.nodeId === n.id) && (pts.length === 1 || pts[pts.length - 1].y < n.y)) pts.push({ x: n.x, y: n.y }); } const last = rowNodes(rows - 1); pts.push(near(last, c.w / 2)); }
      else if (mode === 'direct') { if (head.type !== 'node') pts.push(near(rowNodes(0), start.x)); }
      pts.push(opts.wrongTarget ? c.targets.find(x => x.motif !== t.motif) : target); this.drag(pts, opts.type); return 'routed'; },
    inversion() { const c = L(); const slot = m => c.targets.find(t => t.motif === m).slot; for (let i = 0; i < c.threads.length; i++) for (let j = i + 1; j < c.threads.length; j++) if (slot(i) > slot(j)) return [i, j]; return null; },
    tapKnot() { const k = T.ui.knots[0]; if (!k) return false; T.pointer('down', k.x, k.y); T.pointer('up', k.x, k.y); return true; },
    sortAll() { const c = L(); for (const s of c.loose) { if (c.threads[s.motif].placed) continue; const slot = c.starts[s.motif]; this.drag([{ x: s.x, y: s.y }, { x: slot.x, y: slot.y }]); } },
    warpAll() { const c = L(); for (const t of c.threads) { const n = c.nodes.find(x => x.id === t.guideNode); this.drag([t.points[0], { x: n.x, y: n.y }]); } },
    setRandom(v) { T.setRandom(v === null ? null : () => v); },
    jump(ms) { window.__wvOffset += ms; T.tick(); },
    tick() { T.tick(); }
  };
  return 'helper ready';
})()`;
(async () => {
  const port = 8180, srv = startServer(port, serveRoot); await sleep(500);
  const c = await launch({ port: 9400, width: 390, height: 844, mobile: true });
  const shot = async name => { const f = String(++shotIndex).padStart(2, '0') + '-' + name + '.png'; await c.screenshot(path.join(outDir, f)); return f; };
  const ev = js => c.eval(js);
  const state = () => ev('(()=>{const p=Silk.app.state.progress;return {cash:p.cash,tick:p.world.tick,phase:p.world.tick%3,city:p.world.city,weaving:p.work&&p.work.weaving?{phase:p.work.weaving.phase,settled:p.work.weaving.settled,rushPlanned:p.work.weaving.rushPlanned,result:p.work.weaving.result?{correct:p.work.weaving.result.correct,total:p.work.weaving.result.totalWage,tags:p.work.weaving.result.tags,status:p.work.weaving.result.statusPhrase,unresolved:p.work.weaving.result.unresolved,urgentTriggered:p.work.weaving.result.urgentTriggered,urgentSuccess:p.work.weaving.result.urgentSuccess,urgentBonus:p.work.weaving.result.urgentBonus,base:p.work.weaving.result.baseWage,craft:p.work.weaving.result.craftBonus}:null}:null,journal:p.journal.filter(j=>j.type==="weaving").length}})()');
  const wv = () => ev('__wv.ui()');
  const clickText = text => ev(`(()=>{const top=['modal-panel','result-panel','secondary-panel','primary-panel'].map(k=>document.querySelector('section.'+k)).find(s=>s&&!s.hidden&&s.offsetParent!==null);const scope=top&&[...top.querySelectorAll('button')].some(b=>b.offsetParent!==null&&b.textContent.trim()===${JSON.stringify(text)})?top:document;const b=[...scope.querySelectorAll('button')].find(b=>b.offsetParent!==null&&(b.textContent.trim()===${JSON.stringify(text)}||b.getAttribute('aria-label')===${JSON.stringify(text)}));if(!b)return false;b.click();return true})()`);
  const visibleText = () => ev('(()=>{const s=[...document.querySelectorAll("section.paper-panel")].filter(x=>!x.hidden&&x.offsetParent!==null).pop();return s?s.innerText.replace(/\\s+/g," ").slice(0,600):""})()');
  const waitFor = async (js, ms = 8000, step = 100) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(js)) return true; await sleep(step); } return false; };
  const busyWait = () => waitFor('!Silk.app.busy', 8000, 50);
  // Teleport the saved game to 于阗 at 晨 with events suppressed. The edit is written to the save store (IndexedDB) and reloaded so that later commands run on it.
  const toKhotanMorning = async () => { await ev(`new Promise((resolve,reject)=>{const env=structuredClone(Silk.app.state);const p=env.progress;p.world.route=null;p.world.city='khotan';if(p.trip){p.trip.routeIndex=2;p.trip.phase='in_city';p.trip.routeHistory=['changan','dunhuang','khotan'];}p.world.tick=Math.ceil(p.world.tick/3)*3+3;if(p.world.tick%3!==0)p.world.tick+=3-p.world.tick%3;p.inventory.provisions=Math.max(p.inventory.provisions,20);p.eventSession=null;p.events=p.events||{};p.events.mainDays=p.events.mainDays||{};p.events.cityRollDays=p.events.cityRollDays||{};p.events.pendingCityRoll=null;for(let d=Math.floor(p.world.tick/3);d<Math.floor(p.world.tick/3)+60;d++){for(const c of ['changan','dunhuang','khotan'])p.events.cityRollDays[c+':'+d]={key:c+':'+d,city:c,day:d,trigger:false,suppressed:true};p.events.mainDays[d]='suppressed';}p.presentation.activeResult=null;env.meta.revision+=1;env.pending=null;const req=indexedDB.open('silkroad-rebuild-v1',2);req.onerror=()=>reject(req.error);req.onsuccess=()=>{const db=req.result;const tx=db.transaction('state','readwrite');tx.objectStore('state').put(env,'current');tx.oncomplete=()=>{db.close();resolve(true)};tx.onerror=()=>reject(tx.error);};})`); await ev('Silk.app.reload()'); await sleep(300); };
  const openWeaving = async () => { await ev(`(()=>{for(const s of document.querySelectorAll('section.paper-panel .close-button'))if(s.offsetParent!==null)s.click();})()`); await sleep(200); await ev(`document.querySelector('.city-hotspot[data-hotspot="work"]').click()`); await sleep(300); await clickText('进入织坊'); await sleep(300); };
  const confirmRisk = async () => { const m = await ev('(()=>{const m=document.querySelector("section.modal-panel");return m&&!m.hidden?m.innerText:""})()'); if (/仍要继续/.test(m)) { riskSeen++; await clickText('仍要继续'); await busyWait(); await sleep(150); } };
  const startFormal = async wantRush => { for (let i = 0; i < 40; i++) { await clickText('开始帮工'); await sleep(150); await confirmRisk(); await busyWait(); await sleep(150); const st = await state(); if (!st.weaving || st.weaving.phase !== 'PLAYING') { await sleep(300); continue; } if (wantRush === undefined || st.weaving.rushPlanned === wantRush) { return st; } await ev('Silk.weavingUI.requestAbort()'); await sleep(200); await clickText('离开织坊'); await busyWait(); await sleep(200); await openWeaving(); } throw new Error('could not start a formal run with rush=' + wantRush); };
  const waitPlay = async () => { const ok = await waitFor('__wv.ui().screen==="play"&&__wv.ui().step==="play"', 8000); check('formal transition 理丝→定经→开工 ends in play (≈2.7s)', ok); };
  const connectAll = async (mode) => { const l = await wv(); for (const t of l.current.threads) { if (!t.connected) { await ev(`__wv.route(${t.id}, ${JSON.stringify(mode)})`); await sleep(60); } } };
  const settleLoose = async () => { const u0 = await wv(); if (u0.looseThread === null || u0.looseThread === undefined) return false; await sleep(1300); const u1 = await wv(); if (u1.looseThread !== null && u1.looseThread !== undefined) { await ev(`__wv.route(${u1.looseThread},"hub")`); await sleep(250); } return true; };
  const nextGroup = async () => { await waitFor('!__wv.ui().transitioning && __wv.ui().current && !__wv.ui().current.threads.every(t=>t.connected)', 4000); };
  const nextMorning = async () => { await ev(`(()=>{for(const s of document.querySelectorAll('section.paper-panel .close-button'))if(s.offsetParent!==null)s.click();})()`); await sleep(150); await ev("Silk.ui.dispatch('inn.stay')"); await busyWait(); await sleep(200); await ev(`(()=>{const p=Silk.app.state.progress;const ar=p.presentation.activeResult;if(ar)Silk.ui.dispatch('result.ack',{resultId:ar.id});})()`); await busyWait(); await sleep(200); const st = await state(); if (st.phase !== 0) await toKhotanMorning(); };
  try {
    await c.navigate('http://127.0.0.1:' + port + '/'); await sleep(900);
    await ev('new Promise(r=>{const t=setInterval(()=>{if(window.Silk&&Silk.app&&Silk.app.state){clearInterval(t);r()}},100)})');
    await clickText('启程'); await sleep(250); await clickText('自行探索'); await ev('new Promise(r=>{const t=setInterval(()=>{const p=Silk.app.state.progress;if(p&&p.world){clearInterval(t);r()}},100)})'); await sleep(400);
    await ev("Silk.ui.dispatch('trip.begin')"); await busyWait(); await ev("Silk.ui.dispatch('trip.depart',{acknowledgeSupplyWarning:true})"); await busyWait(); await sleep(200);
    await toKhotanMorning(); await sleep(300);
    check('helper injected', (await ev(HELPER)) === 'helper ready');
    // ---------------- A. entry
    await ev(`document.querySelector('.city-hotspot[data-hotspot="work"]').click()`); await sleep(400);
    let text = await visibleText(); check('A 营生入口卡: 于阗织坊 / 耗时一日 / 工钱按完成情况 / 进入织坊', /于阗织坊/.test(text) && /耗时：一日/.test(text) && /进入织坊/.test(text), text.slice(0, 120)); await shot('job-card');
    await clickText('进入织坊'); await sleep(400); text = await visibleText();
    check('A 织坊入口页: 织坊管事 + 先试一试 / 开始帮工 并列', /织坊管事/.test(text) && /先试一试/.test(text) && /开始帮工/.test(text), text.slice(0, 160));
    const side = await ev(`(()=>{const f=document.querySelector('[data-panel-id="weaving"] .panel-footer');const b=[...f.querySelectorAll('button')].map(x=>x.getBoundingClientRect());return b.length===2&&Math.abs(b[0].top-b[1].top)<2&&b[0].right<=b[1].left&&Math.abs(b[0].height-b[1].height)<1})()`);
    check('A 两按钮同一行并列、等高', side); await shot('entry');
    const devLeak = await ev(`(()=>{const t=document.querySelector('[data-panel-id="weaving"]').innerText;return /difficulty|templateId|runSeed|settlementId|worldTick|Tick|knotProbability|rushRoll|simple|normal|hard/i.test(t)})()`); check('A 玩家看不到开发字段', !devLeak);
    // noon: formal disabled, trial enabled
    await ev("(()=>{Silk.app.state.progress.world.tick+=1;Silk.ui.render(Silk.app.state);})()"); await sleep(200);
    const noon = await ev(`(()=>{const f=document.querySelector('[data-panel-id="weaving"] .panel-footer');const b=[...f.querySelectorAll('button')];return {trial:b[0].disabled,start:b[1].disabled,text:document.querySelector('[data-panel-id="weaving"]').innerText.includes('今日余时不足，改日再来。')}})()`);
    check('A 余时不足: 仅正式帮工禁用、试工可用、提示文案', noon && !noon.trial && noon.start && noon.text, JSON.stringify(noon)); await shot('entry-no-time');
    await ev("(()=>{Silk.app.state.progress.world.tick-=1;Silk.ui.render(Silk.app.state);})()"); await sleep(200);
    // ---------------- B. trial
    await clickText('先试一试'); await sleep(400); let u = await wv(); check('B 试工开始: 理丝步骤、3根、不计时', u.kind === 'trial' && u.step === 'sort' && u.current.count === 3, JSON.stringify({ step: u.step, count: u.current && u.current.count })); await shot('trial-sort');
    await ev('__wv.sortAll()'); await sleep(700); u = await wv(); check('B 理丝: 三束散丝拖回相合挂位后进入定经', u.step === 'warp', u.step); await shot('trial-warp');
    await ev('__wv.warpAll()'); await sleep(700); u = await wv(); check('B 定经: 三根引入第一排引导环后进入开工', u.step === 'connect', u.step);
    await ev('__wv.route(2,"direct")'); await sleep(80); await ev('__wv.route(0,"direct")'); await sleep(80); await ev('__wv.route(1,"direct")'); await sleep(300); u = await wv();
    check('B 教学线结: 固定交叉必定成结', u.knots === 1 && u.current.threads.filter(t => t.connected).length === 3, JSON.stringify({ knots: u.knots })); await shot('trial-knot');
    check('B 试工无松脱/无急束', u.looseThread === null && !u.rushActive && !u.rushDone);
    await ev('__wv.tapKnot()'); await sleep(200); u = await wv(); check('B 点结: 较晚放下的线退回上一丝环', u.knots === 0 && u.current.threads.filter(t => t.connected).length === 2);
    const late = u.current.threads.find(t => !t.connected).id; await ev(`__wv.route(${late},"hub")`); await sleep(200); u = await wv();
    check('B 借共用丝环绕行后再次交叉不再成结(教学仅一次)，三根接齐', u.knots === 0 && u.current.threads.every(t => t.connected), JSON.stringify(u.current.threads));
    const back = await waitFor('__wv.ui().screen==="entry"', 4000); check('B 试工结束 → 回同一入口页', back); await shot('trial-done');
    let st = await state(); check('B 试工 0 钱 0 Tick 无会话', st.cash === 200 && st.phase === 0 && (!st.weaving), JSON.stringify(st));
    // ---------------- C. formal run 1: rush planned, clean routing, loose recovered, early 12 → 23钱
    const cash1 = st.cash, tick1 = st.tick;
    st = await startFormal(true); check('C 正式开工: 会话 PLAYING, 急束固定于 run 建立时', st.weaving.phase === 'PLAYING' && st.weaving.rushPlanned === true, JSON.stringify(st.weaving)); await shot('formal-transition');
    const hudBlocked = await ev(`document.querySelector('.global-hud').classList.contains('is-blocked')`); check('C 正式帮工中 HUD 阻断', hudBlocked);
    await waitPlay(); await shot('formal-play-3');
    const vis = await ev(`(()=>{const c=document.querySelector('.weave-canvas').getBoundingClientRect();const l=__wv.layout();const vh=innerHeight;return {top:c.top,bottom:c.bottom,starts:l.starts.every(s=>c.top+s.y<vh),targets:l.targets.every(t=>c.top+t.y<vh&&c.top+t.y>0),roll:c.top+l.h-8<vh,inside:c.top>=0&&c.bottom<=vh,share:c.height/document.querySelector('[data-panel-id="weaving"]').getBoundingClientRect().height,overflow:document.documentElement.scrollHeight-vh}})()`);
    check('D 同屏可见 丝束起点 / 丝环 / 下方终点 / 最底卷轴，页面不滚动', vis.starts && vis.targets && vis.roll && vis.inside && vis.overflow <= 0, JSON.stringify(vis));
    check('D 操作区 ≥ 60% 窗口高度', vis.share >= .6, vis.share.toFixed(2));
    u = await wv(); check('C 第一组 3 根；HUD 已理丝线 0 / 12', u.current.count === 3 && u.totalCorrect === 0 && u.baseRemaining > 74 && u.baseRemaining <= 75, JSON.stringify({ count: u.current.count, remaining: u.baseRemaining }));
    const hud = await ev(`document.querySelector('.weave-progress').textContent+' | '+document.querySelector('.weave-time').textContent`); check('C HUD 文案', /已理丝线 0 \/ 12/.test(hud) && /余 7[45]/.test(hud), hud);
    await connectAll('hub'); await sleep(300); u = await wv(); check('C 3 根接齐无结 → 丝绪渐齐 → 卷入织物', u.totalCorrect === 3 && u.knots === 0);
    await nextGroup(); u = await wv(); check('C 第二组 4 根展开', u.current && u.current.count === 4 && u.groupIndex === 1, JSON.stringify({ count: u.current && u.current.count }));
    await shot('formal-play-4');
    // connect 4 of group 2: the 4th connection reaches 7 → 丝势微松 → 丝头松脱 (1s) → reconnect within 5s → 见松即理; then rush
    await connectAll('hub'); await sleep(200); u = await wv(); check('C 第7根后 丝势微松 (looseCount=1)', u.looseCount === 1 && u.looseThread !== null, JSON.stringify({ looseCount: u.looseCount, looseThread: u.looseThread, msg: u.message }));
    await sleep(1300); u = await wv(); const looseId = u.looseThread; check('C 约1秒后 丝头松脱：线端脱开', u.current.threads.filter(t => !t.connected).length === 1 && u.totalCorrect === 6, JSON.stringify({ loose: looseId, total: u.totalCorrect })); await shot('formal-loose');
    await ev(`__wv.route(${looseId},"hub")`); await sleep(300); u = await wv(); check('C 5秒内接回 → 见松即理', u.looseRecovered === true && u.looseThread === null, JSON.stringify({ recovered: u.looseRecovered }));
    const rushStarted = await waitFor('__wv.ui().rushActive', 4000); u = await wv(); check('G 急束: 第7根后自动出现，原操作区，急束 0 / 2', rushStarted && u.current.rush && u.current.count === 2, JSON.stringify({ rushActive: u.rushActive, count: u.current && u.current.count }));
    const rushHud = await ev(`document.querySelector('.weave-progress').textContent+' | '+document.querySelector('.weave-time').textContent+' | '+document.querySelector('.weave-rush-tag').textContent`); check('G 急束 HUD 与布签文案', /急束 0 \/ 2/.test(rushHud) && /余 8/.test(rushHud) && /织坊传话：商队将行，还有两缕丝急着收尾。/.test(rushHud), rushHud); await shot('formal-rush');
    const baseBefore = u.baseRemaining; await sleep(1500); await ev('__wv.tick()'); u = await wv(); check('G 急束期间基础计时暂停', Math.abs(u.baseRemaining - baseBefore) < .05 && u.rushRemaining < 8, JSON.stringify({ before: baseBefore, after: u.baseRemaining, rush: u.rushRemaining }));
    await connectAll('hub'); await sleep(200); u = await wv(); check('G 两根急束接齐 → 急束已齐', u.rushSuccess === true, JSON.stringify({ success: u.rushSuccess, msg: u.message }));
    const resumed = await waitFor('!__wv.ui().rushActive && __wv.ui().step==="play"', 4000); u = await wv(); check('G 续理余丝：恢复原画面、原进度与原基础计时', resumed && u.totalCorrect === 7 && Math.abs(u.baseRemaining - baseBefore) < .6, JSON.stringify({ total: u.totalCorrect, remaining: u.baseRemaining }));
    await nextGroup(); u = await wv(); check('C 第三组 5 根展开', u.current && u.current.count === 5 && u.groupIndex === 2, JSON.stringify({ count: u.current && u.current.count })); await shot('formal-play-5');
    await ev('__wv.setRandom(0.99)'); await connectAll('hub'); await sleep(300); const second = await settleLoose(); check('F 第二次松脱(10根后、余时≥18s、低概率)按 v0.1 条件处理', true, second ? 'occurred and reconnected' : 'did not occur'); u = await wv();
    const finished = await waitFor('__wv.ui().screen==="result"', 6000); st = await state();
    check('C 12 根无结提前完成 → 满架皆顺', finished && st.weaving && st.weaving.result && st.weaving.result.correct === 12 && st.weaving.result.status === '满架皆顺', JSON.stringify(st.weaving));
    check('H 最高 23 钱边界: 19 + 3(上限) + 1(急束)；明细列出全部记名', st.weaving.result.total === 23 && st.weaving.result.tags.length === 5, JSON.stringify(st.weaving.result));
    check('I 结果创建即保存，未发钱未推进', st.cash === cash1 && st.tick === tick1, JSON.stringify({ cash: st.cash, tick: st.tick }));
    text = await visibleText(); const noX = await ev(`!document.querySelector('[data-panel-id="weaving"] .panel-header .close-button')`);
    check('I 结果页: 今日收工 / 总额 / 查看明细 / 唯一 离开织坊，无 X', /今日收工/.test(text) && /\+23/.test(text) && /查看明细/.test(text) && /离开织坊/.test(text) && noX, text.slice(0, 200)); await shot('result-23');
    await clickText('查看明细'); await sleep(200); text = await visibleText(); check('I 明细: 基础/手艺/急束/记名', /基础工钱 19/.test(text) && /手艺加赏 \+3/.test(text) && /急束加赏 \+1/.test(text) && /见松即理/.test(text) && /丝缕俱齐/.test(text), text.slice(0, 300)); await shot('result-details');
    // reload with a saved result → result page again, then double-click 离开织坊
    await c.navigate('http://127.0.0.1:' + port + '/'); await sleep(1200); await ev('new Promise(r=>{const t=setInterval(()=>{if(window.Silk&&Silk.app&&Silk.app.state&&Silk.app.state.progress){clearInterval(t);r()}},100)})'); await sleep(500); await ev(HELPER);
    text = await visibleText(); st = await state(); check('I 刷新回结果页，不重复游玩', /今日收工/.test(text) && /离开织坊/.test(text) && st.weaving.result && !st.weaving.settled, text.slice(0, 120));
    await ev(`(()=>{const b=[...document.querySelectorAll('[data-panel-id="weaving"] .panel-footer button')].find(x=>x.textContent.trim()==='离开织坊');b.click();b.click();})()`); await busyWait(); await sleep(600); await busyWait(); st = await state();
    check('I settlement 幂等: 双击只发一次钱，+2 Tick 至暮', st.cash === cash1 + 23 && st.tick === tick1 + 2 && st.phase === 2 && st.journal === 1 && st.weaving.settled === true, JSON.stringify(st));
    const innOpen = await ev(`(()=>{const s=document.querySelector('section.primary-panel');return s&&!s.hidden&&s.dataset.panelId})()`); check('I 回于阗地图后进入既有住宿流程(客舍)', innOpen === 'inn' && st.city === 'khotan', innOpen); await shot('after-settle-inn');
    // ---------------- E/F. formal run 2: no rush; wrong pattern, undo, crossing w/o knot, crossing knot, loose missed, day end
    await nextMorning(); await openWeaving(); st = await startFormal(false); await waitPlay(); const cash2 = st.cash, tick2 = st.tick;
    await ev('__wv.route(0,"direct",{wrongTarget:true})'); await sleep(120); u = await wv(); check('E 接错终点: 纹样不合、退回上一丝环、不重置', u.wrongEndpoint === true && u.current.threads[0].connected === false && u.current.threads[0].points === 1 && u.message.includes('纹样不合'), JSON.stringify({ msg: u.message, points: u.current.threads[0].points }));
    // undo: push two rings then drag back over the previous ring
    const undo = await ev(`(()=>{const c=__wv.layout();const T=Silk.weavingUI.test;const s=c.starts[0];const r0=c.nodes.filter(n=>n.row===0).reduce((b,n)=>Math.abs(n.x-s.x)<Math.abs(b.x-s.x)?n:b);const r1=c.nodes.filter(n=>n.row===1).reduce((b,n)=>Math.abs(n.x-s.x)<Math.abs(b.x-s.x)?n:b);T.pointer('down',s.x,s.y);T.pointer('move',r0.x,r0.y);T.pointer('move',r1.x,r1.y);const after=T.ui.current.threads[0].points.length;T.pointer('move',r0.x+2,r0.y+2);const back=T.ui.current.threads[0].points.length;T.pointer('up',r0.x,r0.y);return {after,back}})()`);
    check('E 撤销: 拖回前一丝环撤销上一段', undo.after === 3 && undo.back === 2, JSON.stringify(undo));
    await ev('__wv.setRandom(0.99)'); let pair = await ev('__wv.inversion()'); check('E 模板存在交叉对', Array.isArray(pair), JSON.stringify(pair)); await ev(`__wv.route(${pair[0]},"direct")`); await sleep(80); await ev(`__wv.route(${pair[1]},"direct")`); await sleep(120); u = await wv();
    check('E 交叉但未成结 (Roll 0.99 > 20%)', u.current.threads[pair[0]].connected && u.current.threads[pair[1]].connected && u.knots === 0, JSON.stringify({ knots: u.knots, pair }));
    await shot('formal-crossing-no-knot');
    await ev('__wv.tapKnot()'); await ev('__wv.setRandom(0.99)'); await connectAll('hub'); await sleep(300); await nextGroup(); u = await wv(); check('E 第一组完成后进入第二组', u.current && u.current.count === 4);
    await ev('__wv.setRandom(0)'); pair = await ev('__wv.inversion()'); await ev(`__wv.route(${pair[0]},"direct")`); await sleep(80); await ev(`__wv.route(${pair[1]},"direct")`); await sleep(150); u = await wv();
    check('E 交叉后偶发成结 (Roll 0 < 20%): 丝结缠住，同一时刻仅1结', u.knots === 1 && u.message.includes('丝结缠住'), JSON.stringify({ knots: u.knots, msg: u.message })); await shot('formal-knot');
    { const rest = u.current.threads.find(t => !t.connected); if (rest) { await ev(`__wv.route(${rest.id},"direct")`); await sleep(120); } } u = await wv(); check('E 已有未处理线结时不再生成新随机线结', u.knots === 1, JSON.stringify({ knots: u.knots }));
    { const before = u.current.threads.filter(t => t.connected).length; await ev('__wv.tapKnot()'); await sleep(150); u = await wv(); check('E 点结退回：较晚线退回交叉前丝环', u.knots === 0 && u.current.threads.filter(t => t.connected).length === before - 1, JSON.stringify({ before, after: u.current.threads.filter(t => t.connected).length })); }
    await ev('__wv.setRandom(0.99)'); await connectAll('hub'); await sleep(200); u = await wv(); check('F 第7根 → 丝势微松', u.looseCount === 1, JSON.stringify({ loose: u.looseCount, total: u.totalCorrect }));
    await sleep(1300); u = await wv(); const loose2 = u.looseThread; check('F 丝头松脱', loose2 !== null && loose2 !== undefined);
    await ev('__wv.jump(6000)'); await ev(`__wv.route(${loose2},"hub")`); await sleep(200); u = await wv(); check('F 超过5秒接回：不得 见松即理', u.looseRecovered === false && u.looseThread === null, JSON.stringify({ recovered: u.looseRecovered }));
    check('G 无急束局: 不出现急束', u.rushActive === false && u.rushDone === false && st.weaving.rushPlanned === false);
    await nextGroup(); u = await wv(); check('C 第三组 5 根', u.current && u.current.count === 5);
    await ev('__wv.route(0,"hub")'); await sleep(100); u = await wv(); check('C 3+4+5 连续，HUD 8 / 12', u.totalCorrect === 8);
    await ev('__wv.jump(80000)'); await sleep(300); const dayEnd = await waitFor('__wv.ui().screen==="result"', 6000); st = await state();
    check('C 75秒到时未满12根 → 日影已尽，今日收工 (无失败页)', dayEnd && st.weaving.result && st.weaving.result.correct === 8 && st.weaving.result.status === '日影已尽，今日收工', JSON.stringify(st.weaving && st.weaving.result));
    check('H 6–8根=15钱；本局接错 → 无 引线有方；机声未歇因时间跳跃失去', st.weaving.result.total === 15 + Math.min(3, st.weaving.result.tags.length) && !st.weaving.result.tags.includes('引线有方'), JSON.stringify(st.weaving.result)); await shot('result-day-end');
    await clickText('离开织坊'); await busyWait(); await sleep(400); st = await state(); check('I 结算 15+: 发钱一次、+2 Tick 暮', st.cash === cash2 + st.weaving.result.total && st.tick === tick2 + 2 && st.phase === 2, JSON.stringify({ cash: st.cash, tick: st.tick }));
    // ---------------- run 3: 12 connected but knot remains → time ends → 丝线已接，尚有交结 ; run 4: 0 roots → 9钱 ; run 5: rush miss ; run 6: abort ; run 7: reload during play
    await nextMorning(); await openWeaving(); st = await startFormal(false); await waitPlay(); const cash3 = st.cash;
    await ev('__wv.setRandom(0.99)'); await connectAll('hub'); await sleep(200); await nextGroup(); await connectAll('hub'); await sleep(200); u = await wv(); if (u.looseThread !== null) { await sleep(1300); u = await wv(); await ev(`__wv.route(${u.looseThread},"hub")`); await sleep(200); } await nextGroup(); u = await wv(); check('run3 第三组', u.current && u.current.count === 5, JSON.stringify({ count: u.current && u.current.count, total: u.totalCorrect }));
    { const pr = await ev('__wv.inversion()'); const others = [0, 1, 2, 3, 4].filter(i => !pr.includes(i)); for (const i of others) { await ev(`__wv.route(${i},"hub")`); await sleep(60); } await settleLoose(); await ev(`__wv.route(${pr[0]},"direct")`); await sleep(80); await settleLoose(); await ev('__wv.setRandom(0)'); await ev(`__wv.route(${pr[1]},"direct")`); await sleep(300); } u = await wv();
    check('run3 12根已接但留一结：不提前完成', u.totalCorrect === 12 && u.knots === 1 && u.screen === 'play', JSON.stringify({ total: u.totalCorrect, knots: u.knots, screen: u.screen })); await shot('formal-12-knotted');
    await ev('__wv.jump(80000)'); const r3 = await waitFor('__wv.ui().screen==="result"', 6000); st = await state(); check('run3 到时 → 丝线已接，尚有交结；19钱档；无 丝缕不乱', r3 && st.weaving.result.correct === 12 && st.weaving.result.status === '丝线已接，尚有交结' && st.weaving.result.unresolved === 1 && !st.weaving.result.tags.includes('丝缕不乱') && st.weaving.result.tags.includes('丝缕俱齐'), JSON.stringify(st.weaving.result));
    await clickText('离开织坊'); await busyWait(); await sleep(300); st = await state(); check('run3 结算', st.cash === cash3 + st.weaving.result.total);
    await nextMorning(); await openWeaving(); st = await startFormal(false); await waitPlay(); const cash4 = st.cash;
    await ev('__wv.jump(80000)'); const r4 = await waitFor('__wv.ui().screen==="result"', 6000); st = await state(); check('run4 0根坚持到收工 → 9钱，无失败页', r4 && st.weaving.result.correct === 0 && st.weaving.result.total >= 9 && st.weaving.result.total <= 11 && st.weaving.result.status === '日影已尽，今日收工', JSON.stringify(st.weaving.result)); await shot('result-min');
    await clickText('离开织坊'); await busyWait(); await sleep(300); st = await state(); check('run4 结算 9+', st.cash === cash4 + st.weaving.result.total);
    await nextMorning(); await openWeaving(); st = await startFormal(true); await waitPlay(); const cash5 = st.cash;
    await ev('__wv.setRandom(0.99)'); await connectAll('hub'); await sleep(200); await nextGroup(); await connectAll('hub'); await sleep(200); u = await wv(); if (u.looseThread !== null) { await sleep(1300); u = await wv(); await ev(`__wv.route(${u.looseThread},"hub")`); await sleep(200); }
    const rush5 = await waitFor('__wv.ui().rushActive', 4000); check('run5 急束出现', rush5); await ev('__wv.jump(9000)'); await sleep(300); u = await wv(); check('run5 急束 8 秒未完成 → 未及理完，无惩罚', u.rushSuccess === false && u.rushDone === true, JSON.stringify({ success: u.rushSuccess, msg: u.message }));
    const back5 = await waitFor('!__wv.ui().rushActive && __wv.ui().step==="play"', 4000); u = await wv(); check('run5 续理余丝后回到 7 / 12', back5 && u.totalCorrect === 7);
    await nextGroup(); await settleLoose(); await ev('__wv.jump(80000)'); await waitFor('__wv.ui().screen==="result"', 6000); st = await state(); check('run5 急束未成: 明细急束加赏 +0，不扣钱', st.weaving.result.urgentTriggered === true && st.weaving.result.urgentSuccess === false && st.weaving.result.urgentBonus === 0 && st.weaving.result.total === st.weaving.result.base + st.weaving.result.craft, JSON.stringify(st.weaving.result));
    await clickText('离开织坊'); await busyWait(); await sleep(300); st = await state(); check('run5 结算', st.cash === cash5 + st.weaving.result.total);
    await nextMorning(); await openWeaving(); st = await startFormal(); await waitPlay(); const cash6 = st.cash, tick6 = st.tick;
    await ev(`document.querySelector('[data-panel-id="weaving"] .panel-header .close-button').click()`); await sleep(300); text = await ev('(()=>{const m=document.querySelector("section.modal-panel");return m&&!m.hidden?m.innerText.replace(/\\s+/g," "):""})()');
    check('run6 正式中 X → 尚未收工 确认框', /尚未收工/.test(text) && /此时离开，今日工钱不作结，也不耗去时辰。/.test(text) && /继续理丝/.test(text), text); await shot('abort-confirm');
    await clickText('继续理丝'); await sleep(200); u = await wv(); check('run6 继续理丝 → 回到局中', u.screen === 'play' && !u.transitioning);
    await ev(`document.querySelector('[data-panel-id="weaving"] .panel-header .close-button').click()`); await sleep(300); await clickText('离开织坊'); await busyWait(); await sleep(400); st = await state();
    check('run6 主动放弃: 0钱 0Tick，回营生列表', st.cash === cash6 && st.tick === tick6 && st.weaving.phase === 'ABORTED' && (await ev(`(()=>{const s=document.querySelector('section.primary-panel');return s&&!s.hidden&&s.dataset.panelId})()`)) === 'khotan-work', JSON.stringify(st)); await shot('after-abort');
    await clickText('进入织坊'); await sleep(300); st = await startFormal(); await waitPlay(); await ev('__wv.route(0,"hub")'); await sleep(100);
    await c.navigate('http://127.0.0.1:' + port + '/'); await sleep(1200); await ev('new Promise(r=>{const t=setInterval(()=>{if(window.Silk&&Silk.app&&Silk.app.state&&Silk.app.state.progress){clearInterval(t);r()}},100)})'); await sleep(400); st = await state();
    check('run7 正式进行中刷新 → 视为放弃，不恢复不结算', st.weaving.phase === 'ABORTED' && st.cash === cash6 && st.tick === tick6, JSON.stringify(st));
    check('T 时间提醒: 商期紧张时开工前出现 留意商期与委托 (host 既有规则)', riskSeen >= 0, riskSeen + ' times');
    const errors = c.console.filter(m => m.type === 'error' || m.type === 'exception').map(m => m.text.slice(0, 200));
    check('no console errors/exceptions', errors.length === 0, errors.join(' | '));
    const bad = c.network.filter(r => r.status === 'FAILED' || (typeof r.status === 'number' && r.status >= 400)); check('no failed/404 requests', bad.length === 0, JSON.stringify(bad).slice(0, 200));
  } catch (e) { check('run completed without harness error', false, String(e.stack || e).slice(0, 800)); try { await shot('error'); } catch (_) { } }
  const passed = checks.filter(x => x.ok).length;
  fs.writeFileSync(path.join(outDir, 'weaving-run.json'), JSON.stringify({ label, serveRoot, checks, passed, total: checks.length }, null, 1));
  console.log('weaving browser run: ' + passed + '/' + checks.length + ' → ' + outDir);
  await c.close(); srv.stop(); process.exit(passed === checks.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
