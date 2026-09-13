'use strict';
// 于阗织坊 360×620 modal QA (YUTIAN_MODAL_AUTHORITY_CONFLICT_RESOLUTION_FINAL_v1.1): real mouse input through the Chrome DevTools protocol on
// the stand-alone page weaving-v5/. For every viewport in --sizes (default the six phone widths of the spec) it drives a fixed-seed formal run
// through 理丝 → 定经 → 经线已齐 → 开工 (empty, four lines, 急束) → 今日收工 (timeout and complete) and checks the modal contract:
// ~360×620 window over the visible mock host (no full-screen page), no transform: scale() fitting, no page / modal scrolling, every live
// piece inside the modal body, touch targets (pause ≥ 44, ring hit ≥ 36, bundles / weights / plaques), the UI-09 settlement (transparent text
// only, no card / stats line / 获得手艺, values = engine wages, status is not a button, template + both painted buttons present).
// Screenshots per size and phase go to tests/results/evidence/weaving-v5-modal-<label>/.
// Usage: node tests/browser/weaving-v5-modal-qa.js [label] [--root <dir>] [--sizes 360x740,375x812,...] [--port <http>] [--cdp <port>]
const fs = require('fs'), path = require('path');
const { launch, startServer, sleep } = require('../tools/cdp');
const root = path.join(__dirname, '..', '..');
const argv = process.argv.slice(2), flag = n => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const label = argv.find((a, i) => !a.startsWith('--') && (i === 0 || !argv[i - 1].startsWith('--'))) || 'source';
const serveRoot = flag('--root') ? path.resolve(flag('--root')) : root;
const SIZES = (flag('--sizes') || '360x740,375x812,390x844,393x852,412x915,430x932').split(',').map(s => s.split('x').map(Number));
const outDir = path.join(root, 'tests', 'results', 'evidence', 'weaving-v5-modal-' + label); fs.rmSync(outDir, { recursive: true, force: true }); fs.mkdirSync(outDir, { recursive: true });
const ART = { cols: [217, 325, 433, 541, 648], rows: [553, 646, 738, 831, 923], tagX: [227, 328, 429, 534, 636], tagY: 395, trayX: [209, 320, 432, 543, 655], trayY: 1058, weightX: [213, 320, 431, 543, 655], weightY: 1036, bundleTopY: 322, targetY: 1013 };
const T9 = { stay: [295, 1423], leave: [665, 1423] };
const IDS = ['red', 'white', 'teal', 'yellow', 'purple'];
const checks = []; const check = (name, ok, detail) => { checks.push({ name, ok: Boolean(ok), detail: detail === undefined ? '' : String(detail).slice(0, 600) }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  ' + String(detail).slice(0, 220) : '')); };
(async () => {
  const port = Number(flag('--port')) || 8393, srv = startServer(port, serveRoot); await sleep(500);
  const summary = {};
  for (const [W, H] of SIZES) {
    const tag = W + 'x' + H; const c = await launch({ port: Number(flag('--cdp')) || 9671, width: W, height: H, mobile: true });
    const ev = js => c.eval(js);
    const mouse = async (type, x, y) => c.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: type === 'mouseMoved' ? 0 : 1, pointerType: 'mouse' });
    const S = async pts => ev('YutianWeavingUI.screenOfMany(' + JSON.stringify(pts) + ')');
    const run = () => ev('(()=>{const r=YutianWeavingUI.ui.run;if(!r)return null;const b=r.phase==="URGENT"?r.urgent.board:r.weave.board;return {phase:r.phase,paused:r.paused,round:r.weave.round,total:r.weave.totalCompleted,rounds:r.weave.roundsCompleted,timeLeft:r.timeLeftMs,tray:r.sort.tray,placed:Object.keys(r.sort.placed).length,warp:r.warp.values,targets:b?b.targets:null,lit:b?Object.keys(b.lit):null,knot:r.weave.knot?r.weave.knot.node:null,loose:r.weave.loose?{from:r.weave.loose.from,to:r.weave.loose.to}:null,urgent:r.urgent?{required:r.urgent.required,lit:Object.keys(r.urgent.board.lit)}:null,status:r.status,wages:r.wages,overlay:YutianWeavingUI.ui.overlay,mode:YutianWeavingUI.ui.mode}})()');
    const waitFor = async (pred, ms = 6000, step = 60) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const r = await run(); if (pred(r)) return r; await sleep(step); } return await run(); };
    const drag = async (from, to, steps, dwell) => { await mouse('mousePressed', from.x, from.y); await sleep(dwell); for (let i = 1; i <= steps; i++) { await mouse('mouseMoved', from.x + (to.x - from.x) * i / steps, from.y + (to.y - from.y) * i / steps); if (dwell) await sleep(dwell / 2); } await mouse('mouseReleased', to.x, to.y); };
    const clickArt = async (ax, ay) => { const [p] = await S([[ax, ay]]); await mouse('mousePressed', p.x, p.y); await sleep(30); await mouse('mouseReleased', p.x, p.y); };
    const shot = name => c.screenshot(path.join(outDir, tag + '-' + name + '.png'));
    // modal contract: geometry, no scaling, no scrolling, pieces inside the body, touch targets
    const contract = () => ev(`(()=>{const q=s=>[...document.querySelectorAll(s)];const m=document.getElementById('modal').getBoundingClientRect(),st=document.getElementById('stage').getBoundingClientRect(),hud=document.getElementById('hud').getBoundingClientRect(),pause=document.getElementById('pause').getBoundingClientRect();
      const tr=e=>getComputedStyle(e).transform;const scaled=['modal','stage','bg','layer','lines','app'].map(id=>document.getElementById(id)).filter(Boolean).map(e=>tr(e)).filter(t=>t!=='none'&&!/^matrix\\(1, 0, 0, 1,/.test(t));
      const se=document.scrollingElement;const inside=r=>r.left>=st.left-0.6&&r.right<=st.right+0.6&&r.top>=st.top-0.6&&r.bottom<=st.bottom+0.6;
      const pieces=q('.bundle,.tag,.scale,.weight,.ring,.target,.bundle-top,.hit-btn,.settle-status,.settle-label,.settle-value').map(e=>({cls:e.className,r:e.getBoundingClientRect()}));const out=pieces.filter(p=>!inside(p.r)).map(p=>p.cls+' '+JSON.stringify([Math.round(p.r.left),Math.round(p.r.top),Math.round(p.r.right),Math.round(p.r.bottom)]));
      const sz=(sel)=>q(sel).map(e=>{const r=e.getBoundingClientRect();return [Math.round(r.width*10)/10,Math.round(r.height*10)/10]});const hostBg=document.querySelector('.host-bg');const hb=hostBg?hostBg.getBoundingClientRect():null;
      const g=YutianWeavingUI.geom();const hit=Math.max(36,19/g.k)*2*g.k;
      return {vw:innerWidth,vh:innerHeight,modal:[m.left,m.top,m.width,m.height].map(v=>Math.round(v*10)/10),stage:[st.width,st.height].map(v=>Math.round(v*10)/10),hud:Math.round(hud.height),pause:[Math.round(pause.width),Math.round(pause.height)],scaled,pageScroll:[se.scrollWidth,se.scrollHeight,se.clientWidth,se.clientHeight],modalScroll:[document.getElementById('modal').scrollHeight,document.getElementById('modal').clientHeight,document.getElementById('stage').scrollHeight,document.getElementById('stage').clientHeight],outside:out,pieces:pieces.length,k:g.k,ringHitPx:Math.round(hit*10)/10,ring:sz('.ring')[0]||null,bundle:sz('.bundle')[0]||null,weight:sz('.weight')[0]||null,scale:sz('.scale')[0]||null,target:sz('.target')[0]||null,bundleTop:sz('.bundle-top')[0]||null,hostVisible:!!hb&&hb.width>=innerWidth-1&&hb.height>=innerHeight-1&&getComputedStyle(hostBg).visibility==='visible',bg:document.getElementById('bg').getAttribute('src'),bgRect:(()=>{const r=document.getElementById('bg').getBoundingClientRect();return [Math.round(r.left-st.left),Math.round(r.top-st.top),Math.round(r.width),Math.round(r.height)]})()}})()`);
    const expectW = Math.min(0.92 * W, 360), expectH = Math.min(620, H - 16);
    const assertContract = (phase, k) => {
      check(`${tag} ${phase}: modal ≈ ${expectW.toFixed(1)}×${expectH} centred over the visible host (not a full-screen page)`, Math.abs(k.modal[2] - expectW) < 1 && Math.abs(k.modal[3] - expectH) < 1 && Math.abs(k.modal[0] * 2 + k.modal[2] - W) < 2 && Math.abs(k.modal[1] * 2 + k.modal[3] - H) < 2 && k.hostVisible, JSON.stringify({ modal: k.modal, host: k.hostVisible }));
      check(`${tag} ${phase}: no transform: scale() fitting; no page or modal scrolling`, k.scaled.length === 0 && k.pageScroll[0] <= k.pageScroll[2] && k.pageScroll[1] <= k.pageScroll[3] && k.modalScroll[0] <= k.modalScroll[1] && k.modalScroll[2] <= k.modalScroll[3], JSON.stringify({ scaled: k.scaled, page: k.pageScroll, modal: k.modalScroll }));
      check(`${tag} ${phase}: every live piece inside the modal body (${k.pieces} pieces), HUD 52 px, pause ${k.pause.join('×')} ≥ 44`, k.outside.length === 0 && k.pieces > 0 && k.hud === 52 && k.pause[0] >= 44 && k.pause[1] >= 44, JSON.stringify({ outside: k.outside.slice(0, 4), stage: k.stage, bg: k.bgRect }));
    };
    try {
      await c.navigate('http://127.0.0.1:' + port + '/weaving-v5/'); await sleep(800); await ev('new Promise(r=>{const t=setInterval(()=>{if(window.YutianWeavingUI){clearInterval(t);r()}},50)})'); await sleep(300);
      await shot('00-entry');
      const seed = Number(flag('--seed')) || 20260913;
      await ev(`YutianWeavingUI.startRun('formal',{seed:${seed},forceUrgent:true})`); await sleep(400);
      let k = await contract(); assertContract('理丝 UI-01', k); await shot('01-sort-ui01');
      check(`${tag} 理丝: bundle ${k.bundle && k.bundle.join('×')} ≥ 44 wide, tag plaques and tray inside`, k.bundle && k.bundle[0] >= 44 && k.bundle[1] >= 44, JSON.stringify(k.bundle));
      let r = await run();
      for (let i = 0; i < 5; i++) { r = await run(); const id = r.tray[i], t = IDS.indexOf(id); const [a, b] = await S([[ART.trayX[i], ART.trayY + 89], [ART.tagX[t], ART.tagY + 40]]); if (i === 0) { await mouse('mousePressed', a.x, a.y); await sleep(30); await mouse('mouseMoved', (a.x + b.x) / 2, (a.y + b.y) / 2); await sleep(120); await shot('02-sort-drag-ui02'); await mouse('mouseMoved', b.x, b.y); await sleep(30); await mouse('mouseReleased', b.x, b.y); } else await drag(a, b, 6, 20); await sleep(120); }
      r = await waitFor(x => x.phase === 'WARP', 3000); check(`${tag} 理丝 → 定经 by real drags`, r.phase === 'WARP', r.phase);
      await ev('new Promise(res=>{const t0=Date.now();const t=setInterval(()=>{if(document.querySelectorAll(".weight").length===5||Date.now()-t0>3000){clearInterval(t);res()}},40)})'); await sleep(250);
      k = await contract(); assertContract('定经 UI-03', k); await shot('03-warp-ui03');
      check(`${tag} 定经: five tension scales ${k.scale && k.scale.join('×')} + weights ${k.weight && k.weight.join('×')} fully visible, no scrolling`, k.scale && k.weight && k.scale[1] >= 120 && k.weight[1] >= 80, JSON.stringify({ scale: k.scale, weight: k.weight }));
      for (let i = 0; i < 5; i++) { r = await run(); const v0 = r.warp[i]; const [a] = await S([[ART.weightX[i], ART.weightY + 90]]); const g = await ev('YutianWeavingUI.geom()'); await drag(a, { x: a.x, y: a.y + (v0 - 0.5) * 230 * g.k }, 8, 15); await sleep(100); }
      r = await waitFor(x => x.phase === 'WARP_DONE' || x.phase === 'WEAVE', 3000); check(`${tag} 定经 → 经线已齐`, r.phase === 'WARP_DONE' || r.phase === 'WEAVE', r.phase);
      if (r.phase === 'WARP_DONE') { await sleep(250); k = await contract(); assertContract('经线已齐 UI-04', k); await shot('04-warp-done-ui04'); await clickArt(430, 1307); r = await waitFor(x => x.phase === 'WEAVE', 3000); }
      check(`${tag} 进入开工 (painted button)`, r.phase === 'WEAVE' && r.round === 1, r.phase);
      await sleep(250); k = await contract(); assertContract('开工 UI-05', k); await shot('05-weave-empty-ui05');
      check(`${tag} 开工: 5 bundles + 25 rings + 5 targets on one screen; ring ${k.ring && k.ring.join('×')} hit ${k.ringHitPx} px ≥ 36; target ${k.target && k.target.join('×')}`, k.ring && k.target && k.bundleTop && k.ringHitPx >= 36 && k.target[0] >= 40 && k.bundleTop[0] >= 44, JSON.stringify({ ring: k.ring, hit: k.ringHitPx, target: k.target, bundleTop: k.bundleTop }));
      const routeLine = async (id, targets) => { const i = IDS.indexOf(id), j = targets.indexOf(id); const art = [[ART.cols[i], ART.bundleTopY + 82]]; for (let rr = 0; rr < 5; rr++) art.push([ART.cols[i], ART.rows[rr]]); const step = j > i ? 1 : -1; for (let col = i + step; step > 0 ? col <= j : col >= j; col += step) art.push([ART.cols[col], ART.rows[4]]); art.push([ART.cols[j], ART.targetY + 52]); const pts = await S(art);
        await mouse('mousePressed', pts[0].x, pts[0].y); await sleep(25); for (let q = 1; q < pts.length; q++) { const a = pts[q - 1], b = pts[q]; for (let s = 1; s <= 3; s++) await mouse('mouseMoved', a.x + (b.x - a.x) * s / 3, a.y + (b.y - a.y) * s / 3); await sleep(18); } await mouse('mouseReleased', pts[pts.length - 1].x, pts[pts.length - 1].y); };
      const clearFaults = async () => { for (let guard = 0; guard < 6; guard++) { const s = await run(); if (s.phase !== 'WEAVE') return s; if (s.knot !== null) { const n = s.knot; const [p] = await S([[ART.cols[n % 5], ART.rows[Math.floor(n / 5)]]]); await mouse('mousePressed', p.x, p.y); await sleep(20); await mouse('mouseReleased', p.x, p.y); await sleep(80); continue; } if (s.loose) { const [a, b] = await S([[ART.cols[s.loose.from % 5], ART.rows[Math.floor(s.loose.from / 5)]], [ART.cols[s.loose.to % 5], ART.rows[Math.floor(s.loose.to / 5)]]]); await drag(a, b, 4, 20); await sleep(80); continue; } return s; } return await run(); };
      const weaveBoard = async () => { for (let guard = 0; guard < 12; guard++) { let s = await clearFaults(); if (!['WEAVE', 'URGENT'].includes(s.phase)) return s; const pending = s.phase === 'URGENT' ? IDS.filter(x => s.urgent.required.includes(x) && !s.urgent.lit.includes(x)) : IDS.filter(x => !s.lit.includes(x)); if (!pending.length) return s; await routeLine(pending[0], s.targets); await sleep(90); const s2 = await run(); if (s2.phase === 'ROUND_TRANSITION') return await waitFor(x => x.phase !== 'ROUND_TRANSITION', 3000); if (s2.phase !== s.phase) return s2; } return await run(); }; // returns whenever the phase moves on (round end, 急束 start / end, settlement)
      for (const id of ['red', 'white', 'teal', 'yellow']) { r = await clearFaults(); await routeLine(id, r.targets); await sleep(120); }
      r = await clearFaults(); await sleep(150); k = await contract(); assertContract('开工·连线 UI-06', k); await shot('06-weave-lit-ui06');
      check(`${tag} 开工: four real-drag lines lit (${r.lit.join(',')})`, r.lit.length === 4, JSON.stringify(r.targets));
      // finish round 1 and round 2 until the 急束 challenge (forced) appears
      let urgentShot = false, guard = 0;
      while (guard++ < 10) { r = await run(); if (r.phase === 'SETTLED') break; if (r.phase === 'ROUND_TRANSITION') { r = await waitFor(x => x.phase !== 'ROUND_TRANSITION', 3000); continue; }
        if (r.phase === 'URGENT') { if (!urgentShot) { urgentShot = true; await sleep(150); k = await contract(); assertContract('急束 UI-07', k); await shot('07-urgent-ui07'); const bar = await ev('(()=>{const b=document.querySelector(".urgent-bar");if(!b)return null;const r=b.getBoundingClientRect();return {text:b.textContent,w:Math.round(r.width),h:Math.round(r.height)}})()'); check(`${tag} 急束 inside the same modal (red bar ${bar && bar.text})`, bar && /急束/.test(bar.text), JSON.stringify(bar)); }
          r = await weaveBoard(); await waitFor(x => x.phase !== 'URGENT', 9000); continue; }
        if (r.phase !== 'WEAVE') { r = await waitFor(x => ['WEAVE', 'SETTLED'].includes(x.phase), 3000); if (r.phase === 'SETTLED') break; }
        r = await weaveBoard(); if (urgentShot && r.phase === 'WEAVE' && r.round >= 2) break; }
      check(`${tag} 急束 challenge seen and woven in the modal`, urgentShot, JSON.stringify({ phase: r.phase, round: r.round }));
      // timeout settlement (日影耗尽) → UI-09 template with dynamic values
      r = await run(); if (r.phase === 'ROUND_TRANSITION') r = await waitFor(x => x.phase !== 'ROUND_TRANSITION', 3000); const before = await run(); await ev('YutianWeavingUI.ui.run.timeLeftMs=400'); r = await waitFor(x => x.phase === 'SETTLED', 4000); await sleep(350);
      check(`${tag} 日影耗尽 settles the partial run (${r.total} lines, ${r.rounds} rounds)`, r.status === 'timeout' && r.total === before.total && r.total < 15, JSON.stringify({ status: r.status, total: r.total, rounds: r.rounds }));
      const settle = () => ev(`(()=>{const q=s=>[...document.querySelectorAll(s)];const cs=e=>getComputedStyle(e);const dyn=q('.settle-status,.settle-label,.settle-value');const bad=dyn.filter(e=>{const s=cs(e);return !(s.backgroundColor==='rgba(0, 0, 0, 0)'||s.backgroundColor==='transparent')||s.boxShadow!=='none'||s.borderStyle!=='none'||s.backgroundImage!=='none'}).map(e=>e.className);const st=q('.settle-status')[0];const txt=document.getElementById('modal').innerText;const fs=e=>e?parseFloat(cs(e).fontSize):0;const white=q('#stage *').filter(e=>{const s=cs(e);return (s.backgroundColor.startsWith('rgb(255, 255, 255')||s.backgroundColor.startsWith('rgb(2')&&e.className.indexOf('settle')>=0)&&e.offsetWidth>0}).map(e=>e.className);
      return {status:st?st.textContent:null,statusTag:st?st.tagName:null,statusRole:st?st.getAttribute('role'):null,labels:q('.settle-label').map(e=>e.textContent),values:q('.settle-value:not(.total)').map(e=>e.textContent),total:(q('.settle-value.total')[0]||{}).textContent,totalFont:fs(q('.settle-value.total')[0]),valueFont:fs(q('.settle-value:not(.total)')[0]),statusFont:fs(st),labelFont:fs(q('.settle-label')[0]),nonTransparent:bad,whiteBoxes:white,hasStats:/本次织成|完成\\s*\\d\\s*轮/.test(txt),hasCraft:/获得手艺/.test(txt),bg:document.getElementById('bg').getAttribute('src'),buttons:q('.hit-btn').map(b=>b.getAttribute('aria-label')),hud:document.getElementById('hud').hidden,hudText:document.getElementById('hud').innerText.replace(/\\s+/g,' ')}})()`);
      let s = await settle(); const w = r.wages; const engine = await ev('JSON.stringify(YutianWeavingUI.E.wagesFor(YutianWeavingUI.ui.run))');
      k = await contract(); assertContract('今日收工·日影耗尽 UI-09', k); await shot('08-settle-timeout-ui09');
      check(`${tag} 今日收工 (timeout): UI-09 template, transparent dynamic text only, values ${s.values.join('/')} = engine ${w.base}/${w.regular}/${w.urgent}, total ${s.total}, no stats line, no 获得手艺, status not a button`, s.bg === 'art/modal/body_settle.webp' && s.nonTransparent.length === 0 && s.whiteBoxes.length === 0 && s.status === '顺利收工' && s.statusTag === 'DIV' && !s.statusRole && s.labels.join('/') === '基础工钱/常规加赏/急束加成/合计收入' && s.values.join('/') === [w.base, w.regular, w.urgent].join('/') && s.total === String(w.total) && JSON.parse(engine).total === w.total && !s.hasStats && !s.hasCraft && s.totalFont > s.valueFont && s.totalFont > s.statusFont && s.buttons.join('/') === '继续留坊/离开织坊' && s.hud === false, JSON.stringify(s));
      // 继续留坊 (painted button) → a new run; finish it completely → complete settlement
      await clickArt(...T9.stay); await sleep(300); r = await run(); check(`${tag} 继续留坊 painted button → new formal run in 理丝`, r && r.phase === 'SORT' && r.placed === 0, JSON.stringify({ phase: r && r.phase }));
      await ev(`YutianWeavingUI.startRun('formal',{seed:${seed + 7},forceUrgent:false})`); await sleep(250);
      for (let i = 0; i < 5; i++) { r = await run(); const id = r.tray[i], t = IDS.indexOf(id); const [a, b] = await S([[ART.trayX[i], ART.trayY + 89], [ART.tagX[t], ART.tagY + 40]]); await drag(a, b, 6, 0); await sleep(70); }
      r = await waitFor(x => x.phase === 'WARP', 3000); await ev('new Promise(res=>{const t0=Date.now();const t=setInterval(()=>{if(document.querySelectorAll(".weight").length===5||Date.now()-t0>3000){clearInterval(t);res()}},40)})');
      for (let i = 0; i < 5; i++) { r = await run(); const v0 = r.warp[i]; const [a] = await S([[ART.weightX[i], ART.weightY + 90]]); const g = await ev('YutianWeavingUI.geom()'); await drag(a, { x: a.x, y: a.y + (v0 - 0.5) * 230 * g.k }, 8, 0); await sleep(60); }
      r = await waitFor(x => x.phase === 'WARP_DONE' || x.phase === 'WEAVE', 3000); if (r.phase === 'WARP_DONE') { await clickArt(430, 1307); r = await waitFor(x => x.phase === 'WEAVE', 3000); }
      guard = 0; while (guard++ < 8) { r = await run(); if (r.phase === 'SETTLED') break; if (r.phase === 'ROUND_TRANSITION') { r = await waitFor(x => x.phase !== 'ROUND_TRANSITION', 3000); continue; } if (r.phase === 'URGENT') { r = await weaveBoard(); await waitFor(x => x.phase !== 'URGENT', 9000); continue; } r = await weaveBoard(); }
      r = await waitFor(x => x.phase === 'SETTLED', 4000); await sleep(350); s = await settle(); const w2 = r.wages;
      k = await contract(); assertContract('今日收工·织满 UI-08', k); await shot('09-settle-complete-ui08');
      check(`${tag} 今日收工 (complete 15/15): values ${s.values.join('/')} = ${w2.base}/${w2.regular}/${w2.urgent}, total ${s.total}, HUD frozen "${s.hudText}"`, r.status === 'complete' && r.total === 15 && s.values.join('/') === [w2.base, w2.regular, w2.urgent].join('/') && s.total === String(w2.total) && !s.hasStats && !s.hasCraft && s.nonTransparent.length === 0 && /已完成 5\/5/.test(s.hudText), JSON.stringify({ wages: w2, hud: s.hudText }));
      await clickArt(...T9.leave); await sleep(300); r = await run(); const entry = await ev('YutianWeavingUI.ui.overlay'); check(`${tag} 离开织坊 painted button → entry`, r === null && entry === 'entry', JSON.stringify({ run: r, overlay: entry }));
      await ev("YutianWeavingUI.openOverlay('help',{back:'entry'})"); await sleep(200); const help = await ev('(()=>{const c=document.querySelector(".card");const r=c.getBoundingClientRect(),m=document.getElementById("modal").getBoundingClientRect();return {inside:r.left>=m.left&&r.right<=m.right&&r.top>=m.top&&r.bottom<=m.bottom,scroll:c.scrollHeight>c.clientHeight}})()'); check(`${tag} help card stays inside the modal (scrolls internally)`, help.inside, JSON.stringify(help)); await shot('10-help');
      await ev("YutianWeavingUI.openOverlay('entry')");
      const errs = c.console.filter(m => m.type === 'error' || m.type === 'exception').map(m => m.text.slice(0, 160)), non200 = c.network.filter(n => n.status !== 200 && n.status !== 304).map(n => n.url + ' ' + n.status);
      check(`${tag} no console errors, no failed requests`, errs.length === 0 && non200.length === 0, JSON.stringify({ errs: errs.slice(0, 3), non200: non200.slice(0, 3) }));
      summary[tag] = { modal: k.modal, k: k.k, ring: k.ring, ringHit: k.ringHitPx, bundle: k.bundle, weight: k.weight, target: k.target };
    } catch (e) { check(tag + ' script error', false, String(e && e.stack || e)); }
    await c.close();
  }
  srv.stop();
  fs.writeFileSync(path.join(outDir, 'modal-qa.json'), JSON.stringify({ label, serveRoot, sizes: SIZES, summary, checks, generatedAt: new Date().toISOString() }, null, 2));
  const failed = checks.filter(x => !x.ok);
  console.log('\n' + (checks.length - failed.length) + '/' + checks.length + ' checks passed' + (failed.length ? ' — FAILED: ' + failed.slice(0, 8).map(f => f.name).join(' | ') : ''));
  process.exit(failed.length ? 1 : 0);
})();
