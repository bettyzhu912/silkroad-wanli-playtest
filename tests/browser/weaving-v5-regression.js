'use strict';
// 于阗织坊 FINAL v5.0 hotfix regression (PATCH A / PATCH B) — real mouse input through the Chrome DevTools protocol on the stand-alone
// page weaving-v5/. Each run: 正式帮工 → 理丝 (drag every bundle to its tag) → 定经 (drag every weight into 合宜) → 进入开工 → three rounds of
// five routed lines (knots untied, loose threads repaired, the 急束 challenge woven on its own board) → 今日收工. Scenario flags per run:
// fast (no pauses between moves), pauseAt (pause / resume after that line), timeoutAt (the sun runs out after that line), viaStay (the next run
// starts from 继续留坊), forceUrgent. After every finished line, every round start, every 急束 end and every resume, each lit target plaque is
// clipped from a screenshot and its glyph ink measured: a lit plaque whose ink fraction is below the blank threshold is a FAIL. Settlement values
// are compared with the engine's wagesFor() and the page's rendered text. Writes evidence (JSON + per-run screenshots) under tests/results/evidence/.
// Usage: node tests/browser/weaving-v5-regression.js [label] [--root <dir>] [--runs 20] [--port <http>] [--cdp <port>] [--width 390] [--height 844]
const fs = require('fs'), path = require('path');
const { launch, startServer, sleep } = require('../tools/cdp');
const root = path.join(__dirname, '..', '..');
const argv = process.argv.slice(2), flag = n => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const label = argv.find((a, i) => !a.startsWith('--') && (i === 0 || !argv[i - 1].startsWith('--'))) || 'weaving-v5';
const serveRoot = flag('--root') ? path.resolve(flag('--root')) : root;
const RUNS = Number(flag('--runs')) || 20, W = Number(flag('--width')) || 390, H = Number(flag('--height')) || 844;
const outDir = path.join(root, 'tests', 'results', 'evidence', 'weaving-v5-' + label); fs.rmSync(outDir, { recursive: true, force: true }); fs.mkdirSync(outDir, { recursive: true });
const ART = { w: 864, h: 1536, cols: [217, 325, 433, 541, 648], rows: [553, 646, 738, 831, 923], tagX: [227, 328, 429, 534, 636], tagY: 395, trayX: [209, 320, 432, 543, 655], trayY: 1058, weightX: [213, 320, 431, 543, 655], weightY: 1036, bundleTopY: 322, targetY: 1013 };
const IDS = ['red', 'white', 'teal', 'yellow', 'purple'];
const checks = []; const check = (name, ok, detail) => { checks.push({ name, ok: Boolean(ok), detail: detail === undefined ? '' : String(detail).slice(0, 500) }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  ' + String(detail).slice(0, 200) : '')); };
const PNG = require('zlib');
// ---- minimal PNG reader (8-bit RGB / RGBA, non-interlaced) for plaque ink measurement
function decodePNG(buf) {
  let pos = 8; const chunks = []; let w = 0, h = 0, ct = 0;
  while (pos < buf.length) { const len = buf.readUInt32BE(pos), type = buf.toString('ascii', pos + 4, pos + 8), data = buf.subarray(pos + 8, pos + 8 + len); if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ct = data[9]; } if (type === 'IDAT') chunks.push(data); pos += 12 + len; }
  const bpp = ct === 6 ? 4 : 3, raw = PNG.inflateSync(Buffer.concat(chunks)), stride = w * bpp, out = Buffer.alloc(w * h * bpp); let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) { const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), cur = Buffer.alloc(stride);
    for (let i = 0; i < stride; i++) { const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0; let v = line[i]; if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1; else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; } cur[i] = v & 255; }
    cur.copy(out, y * stride); prev = cur; }
  return { w, h, bpp, data: out };
}
function inkFraction(img, rect) { // fraction of pixels in rect that are not parchment (glyph ink: dark or saturated)
  let ink = 0, n = 0; const x0 = Math.max(0, Math.round(rect.x)), y0 = Math.max(0, Math.round(rect.y)), x1 = Math.min(img.w, Math.round(rect.x + rect.w)), y1 = Math.min(img.h, Math.round(rect.y + rect.h));
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * img.w + x) * img.bpp, r = img.data[i], g = img.data[i + 1], b = img.data[i + 2]; const lum = (r * 299 + g * 587 + b * 114) / 1000, mx = Math.max(r, g, b), mn = Math.min(r, g, b), sat = mx ? (mx - mn) / mx : 0; n++; if (lum < 200 || sat > .28) ink++; }
  return n ? ink / n : 0;
}
(async () => {
  const port = Number(flag('--port')) || 8391, srv = startServer(port, serveRoot); await sleep(500);
  const c = await launch({ port: Number(flag('--cdp')) || 9663, width: W, height: H, mobile: true });
  const ev = js => c.eval(js);
  const mouse = async (type, x, y, extra = {}) => c.send('Input.dispatchMouseEvent', Object.assign({ type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: type === 'mouseMoved' ? 0 : 1, pointerType: 'mouse' }, extra));
  const geom = async () => ev('(()=>{const u=YutianWeavingUI.ui;return {scale:u.scale,left:u.left,top:u.top}})()');
  let G = null; const S = (ax, ay) => ({ x: ax * G.scale + G.left, y: ay * G.scale + G.top });
  const run = () => ev('(()=>{const r=YutianWeavingUI.ui.run;if(!r)return null;const b=r.phase==="URGENT"?r.urgent.board:r.weave.board;return {phase:r.phase,paused:r.paused,round:r.weave.round,total:r.weave.totalCompleted,rounds:r.weave.roundsCompleted,timeLeft:r.timeLeftMs,tray:r.sort.tray,placed:Object.keys(r.sort.placed).length,warp:r.warp.values,warpDone:r.warp.done,targets:b?b.targets:null,lit:b?Object.keys(b.lit):null,knot:r.weave.knot?r.weave.knot.node:null,loose:r.weave.loose?{from:r.weave.loose.from,to:r.weave.loose.to}:null,urgent:r.urgent?{required:r.urgent.required,lit:Object.keys(r.urgent.board.lit),msLeft:r.urgent.msLeft}:null,status:r.status,wages:r.wages,overlay:YutianWeavingUI.ui.overlay,mode:YutianWeavingUI.ui.mode}})()');
  const waitFor = async (pred, ms = 6000, step = 60) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const r = await run(); if (pred(r)) return r; await sleep(step); } return await run(); };
  const drag = async (from, to, steps, dwell) => { await mouse('mousePressed', from.x, from.y); await sleep(dwell); for (let i = 1; i <= steps; i++) { await mouse('mouseMoved', from.x + (to.x - from.x) * i / steps, from.y + (to.y - from.y) * i / steps); if (dwell) await sleep(dwell / 2); } await mouse('mouseReleased', to.x, to.y); };
  const clickArt = async (ax, ay) => { const p = S(ax, ay); await mouse('mousePressed', p.x, p.y); await sleep(30); await mouse('mouseReleased', p.x, p.y); };
  const clickText = text => ev(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>!b.disabled&&b.offsetParent!==null&&b.textContent.trim()===${JSON.stringify(text)});if(!b)return false;b.click();return true})()`);
  const plaques = () => ev('[...document.querySelectorAll(".target")].map(t=>{const r=t.getBoundingClientRect();const g=t.querySelector(".glyph");const gr=g?g.getBoundingClientRect():null;const cs=getComputedStyle(t);return {slot:t.dataset.slot,id:t.dataset.id,lit:t.classList.contains("lit"),rect:{x:r.x,y:r.y,w:r.width,h:r.height},glyph:gr?{x:gr.x,y:gr.y,w:gr.width,h:gr.height,color:getComputedStyle(g).color}:null,vis:cs.visibility,op:cs.opacity,disp:cs.display}})');
  const stats = { plaqueChecks: 0, blank: 0, minInk: {}, byId: {}, lines: 0, knots: 0, loose: 0, urgent: 0, pauses: 0 };
  let shotIndex = 0;
  const verifyLit = async (tag, keep) => { // screenshot + ink per lit plaque
    const ps = await plaques(); const lit = ps.filter(p => p.lit); if (!lit.length) return { lit: 0 };
    const file = path.join(outDir, 'tmp-shot.png'); await c.screenshot(file); const img = decodePNG(fs.readFileSync(file)); const dpr = img.w / W; let worst = null;
    for (const p of lit) {
      const ok = p.id && IDS.includes(p.id) && p.glyph && p.glyph.w > 10 && p.glyph.h > 10 && p.vis === 'visible' && p.op !== '0' && p.disp !== 'none';
      const frac = ok ? inkFraction(img, { x: p.glyph.x * dpr, y: p.glyph.y * dpr, w: p.glyph.w * dpr, h: p.glyph.h * dpr }) : 0;
      stats.plaqueChecks++; stats.minInk[p.id] = Math.min(stats.minInk[p.id] ?? 1, frac); stats.byId[p.id] = (stats.byId[p.id] || 0) + 1;
      if (!ok || frac < 0.03) { stats.blank++; const bad = path.join(outDir, `BLANK-${tag.replace(/[^\w\u4e00-\u9fff-]+/g, '_')}-${p.id}-${shotIndex++}.png`); fs.copyFileSync(file, bad); check(`${tag}: lit plaque ${p.id} slot ${p.slot} rendered blank (ink ${frac.toFixed(3)})`, false, JSON.stringify(p)); }
      if (!worst || frac < worst.frac) worst = { id: p.id, frac };
    }
    if (keep) fs.copyFileSync(file, path.join(outDir, keep + '.png'));
    return { lit: lit.length, worst };
  };
  const routeLine = async (id, targets, fast) => { // one real drag: bundle → column rings → along the bottom row → matching target
    const i = IDS.indexOf(id), j = targets.indexOf(id); const pts = [S(ART.cols[i], ART.bundleTopY + 82)]; for (let r = 0; r < 5; r++) pts.push(S(ART.cols[i], ART.rows[r])); const step = j > i ? 1 : -1; for (let col = i + step; step > 0 ? col <= j : col >= j; col += step) pts.push(S(ART.cols[col], ART.rows[4])); pts.push(S(ART.cols[j], ART.targetY + 52));
    await mouse('mousePressed', pts[0].x, pts[0].y); if (!fast) await sleep(25);
    for (let k = 1; k < pts.length; k++) { const a = pts[k - 1], b = pts[k]; for (let s = 1; s <= 3; s++) await mouse('mouseMoved', a.x + (b.x - a.x) * s / 3, a.y + (b.y - a.y) * s / 3); if (!fast) await sleep(18); }
    await mouse('mouseReleased', pts[pts.length - 1].x, pts[pts.length - 1].y);
  };
  const clearFaults = async (tag) => { // knot: click the mark; loose: drag from → to (both real input); returns after the board is free
    for (let guard = 0; guard < 6; guard++) { const r = await run(); if (r.phase !== 'WEAVE') return r;
      if (r.knot !== null) { stats.knots++; const n = r.knot, p = S(ART.cols[n % 5], ART.rows[Math.floor(n / 5)]); await mouse('mousePressed', p.x, p.y); await sleep(20); await mouse('mouseReleased', p.x, p.y); await sleep(80); const r2 = await run(); if (r2.knot !== null) { await ev('YutianWeavingUI.E.knotUntie(YutianWeavingUI.ui.run);YutianWeavingUI.refresh()'); check(tag + ' knot untied by real click', false, 'fallback to engine call'); } continue; }
      if (r.loose) { stats.loose++; const a = S(ART.cols[r.loose.from % 5], ART.rows[Math.floor(r.loose.from / 5)]), b = S(ART.cols[r.loose.to % 5], ART.rows[Math.floor(r.loose.to / 5)]); await drag(a, b, 4, 20); await sleep(80); const r2 = await run(); if (r2.loose) { await ev('const R=YutianWeavingUI.ui.run;YutianWeavingUI.E.looseRepair(R,R.weave.loose.from,R.weave.loose.to);YutianWeavingUI.refresh()'); check(tag + ' loose thread repaired by real drag', false, 'fallback to engine call'); } continue; }
      return r; }
    return await run();
  };
  const weaveBoard = async (tag, fast, opts) => { // finishes the current board (round or urgent); returns when the phase moves on
    for (let guard = 0; guard < 12; guard++) {
      let r = await clearFaults(tag); if (!['WEAVE', 'URGENT'].includes(r.phase)) return r;
      const order = opts.order || IDS; const pending = r.phase === 'URGENT' ? order.filter(x => r.urgent.required.includes(x) && !r.urgent.lit.includes(x)) : order.filter(x => !r.lit.includes(x)); if (!pending.length) return r;
      const id = pending[0]; await routeLine(id, r.targets, fast); await sleep(fast ? 40 : 90);
      const r2 = await run(); const litNow = r2.phase === 'URGENT' ? (r2.urgent ? r2.urgent.lit : []) : r2.lit;
      if (r2.phase === r.phase && !litNow.includes(id) && !(r2.phase === 'WEAVE' && r.phase === 'URGENT')) { check(tag + ' line ' + id + ' accepted', false, JSON.stringify({ before: r.lit, after: r2.lit, knot: r2.knot, loose: r2.loose })); continue; }
      stats.lines++; if (opts.onLine) await opts.onLine(id, r2);
      if (r2.phase === 'WEAVE' || r2.phase === 'URGENT') await verifyLit(tag + '/line-' + id);
      if (r2.phase === 'ROUND_TRANSITION') { await verifyLit(tag + '/round-end'); const r3 = await waitFor(x => x.phase === 'WEAVE' && x.round === r2.round + 1, 3000); check(tag + ' round ' + r2.round + ' → ' + r3.round + ' transition (new targets, plaques unlit, none blank)', r3.phase === 'WEAVE' && r3.round === r2.round + 1 && r3.lit.length === 0 && r3.targets.length === 5, JSON.stringify({ round: r3.round, targets: r3.targets })); return r3; }
      if (r2.phase === 'SETTLED') return r2;
    }
    return await run();
  };
  try {
    await c.navigate('http://127.0.0.1:' + port + '/weaving-v5/'); await sleep(800); await ev('new Promise(r=>{const t=setInterval(()=>{if(window.YutianWeavingUI){clearInterval(t);r()}},50)})'); G = await geom();
    if (flag('--shots')) { // UI-regression shots: fixed seed, no 急束, named pages (identical boards on every tree that keeps the engine)
      const seed = Number(flag('--seed')) || 20260913, shot = name => c.screenshot(path.join(outDir, name + '.png'));
      await ev(`YutianWeavingUI.startRun('formal',{seed:${seed},forceUrgent:false})`); await sleep(400); await shot('01-sort');
      let r = await run(); for (let i = 0; i < 5; i++) { r = await run(); const id = r.tray[i], t = IDS.indexOf(id); await drag(S(ART.trayX[i], ART.trayY + 89), S(ART.tagX[t], ART.tagY + 40), 6, 20); await sleep(120); }
      r = await waitFor(x => x.phase === 'WARP', 3000); await ev('new Promise(res=>{const t0=Date.now();const t=setInterval(()=>{if(document.querySelectorAll(".weight").length===5||Date.now()-t0>3000){clearInterval(t);res()}},40)})'); await sleep(200); await shot('02-warp');
      for (let i = 0; i < 5; i++) { r = await run(); const v0 = r.warp[i]; await drag(S(ART.weightX[i], ART.weightY + 90), S(ART.weightX[i], ART.weightY + 90 + (v0 - 0.5) * 230), 8, 15); await sleep(100); }
      r = await waitFor(x => x.phase === 'WARP_DONE' || x.phase === 'WEAVE', 3000); if (r.phase === 'WARP_DONE') { await sleep(300); await shot('03-warp-done'); await clickArt(430, 1314); r = await waitFor(x => x.phase === 'WEAVE', 3000); }
      await sleep(200); await shot('04-weave-empty');
      for (const id of ['red', 'white', 'teal', 'yellow']) { r = await clearFaults('shots'); await routeLine(id, r.targets, false); await sleep(120); }
      r = await clearFaults('shots'); await sleep(150); await shot('05-weave-lit'); check('shots: four lines lit on the fixed-seed board (' + r.lit.join(',') + ')', r.lit.length === 4, JSON.stringify(r.targets));
      await ev('YutianWeavingUI.ui.run.timeLeftMs=400'); r = await waitFor(x => x.phase === 'SETTLED', 4000); await sleep(300); await shot('06-settle-timeout'); check('shots: 日影耗尽 settlement (' + r.total + ' lines)', r.status === 'timeout', JSON.stringify(r.wages));
      await clickArt(286, 1131); await sleep(300); await ev(`YutianWeavingUI.startRun('formal',{seed:${seed + 1},forceUrgent:false})`); await sleep(300);
      for (let i = 0; i < 5; i++) { r = await run(); const id = r.tray[i], t = IDS.indexOf(id); await drag(S(ART.trayX[i], ART.trayY + 89), S(ART.tagX[t], ART.tagY + 40), 6, 20); await sleep(120); }
      r = await waitFor(x => x.phase === 'WARP', 3000); await ev('new Promise(res=>{const t0=Date.now();const t=setInterval(()=>{if(document.querySelectorAll(".weight").length===5||Date.now()-t0>3000){clearInterval(t);res()}},40)})');
      for (let i = 0; i < 5; i++) { r = await run(); const v0 = r.warp[i]; await drag(S(ART.weightX[i], ART.weightY + 90), S(ART.weightX[i], ART.weightY + 90 + (v0 - 0.5) * 230), 8, 15); await sleep(100); }
      r = await waitFor(x => x.phase === 'WARP_DONE' || x.phase === 'WEAVE', 3000); if (r.phase === 'WARP_DONE') { await clickArt(430, 1314); r = await waitFor(x => x.phase === 'WEAVE', 3000); }
      let guard = 0; while (guard++ < 8) { r = await run(); if (r.phase === 'SETTLED') break; if (r.phase === 'ROUND_TRANSITION') { r = await waitFor(x => x.phase !== 'ROUND_TRANSITION', 3000); continue; } if (r.phase === 'URGENT') { r = await weaveBoard('shots/urgent', false, {}); await waitFor(x => x.phase !== 'URGENT', 9000); continue; } r = await weaveBoard('shots', false, {}); }
      r = await waitFor(x => x.phase === 'SETTLED', 4000); await sleep(300); await shot('07-settle-complete'); check('shots: complete settlement (' + r.total + ' lines, ' + r.rounds + ' rounds)', r.status === 'complete' && r.total === 15, JSON.stringify(r.wages));
      await ev('document.getElementById("pause")&&YutianWeavingUI.ui.run&&0'); const errs = c.console.filter(m => m.type === 'error' || m.type === 'exception').map(m => m.text.slice(0, 160)); check('shots: no console errors', errs.length === 0, JSON.stringify(errs.slice(0, 3)));
      fs.writeFileSync(path.join(outDir, 'shots.json'), JSON.stringify({ label, serveRoot, viewport: [W, H], seed, checks }, null, 2)); await c.close(); srv.stop(); const bad = checks.filter(x => !x.ok); console.log('\n' + (checks.length - bad.length) + '/' + checks.length + ' shot checks passed'); process.exit(bad.length ? 1 : 0);
    }
    const results = [];
    for (let k = 1; k <= RUNS; k++) {
      const order = IDS.slice(k % 5).concat(IDS.slice(0, k % 5)); const tag = 'run ' + k, fast = k % 4 === 0, pauseAt = 4, timeoutAt = (k === 7 || k === 14) ? 6 : null, viaStay = k > 1 && k % 2 === 0, forceUrgent = k % 3 === 0;
      const prev = await run();
      if (viaStay && prev && prev.phase === 'SETTLED') { await clickArt(286, 1131); } // 继续留坊 → a new formal run
      else { if (prev && prev.phase === 'SETTLED') await clickArt(580, 1131); await sleep(150); await ev(`YutianWeavingUI.startRun('formal',{forceUrgent:${forceUrgent}})`); }
      await sleep(250); let r = await run(); check(tag + ' starts in 理丝 (' + (viaStay ? 'via 继续留坊' : 'fresh') + ')', r && r.phase === 'SORT' && r.placed === 0, JSON.stringify({ phase: r && r.phase }));
      // 理丝: drag each tray bundle to the tag of its identity
      for (let i = 0; i < 5; i++) { r = await run(); const id = r.tray[i], t = IDS.indexOf(id); await drag(S(ART.trayX[i], ART.trayY + 89), S(ART.tagX[t], ART.tagY + 40), 6, fast ? 0 : 20); await sleep(fast ? 60 : 120); }
      r = await waitFor(x => x.phase === 'WARP', 3000); await ev('new Promise(res=>{const t0=Date.now();const t=setInterval(()=>{if(document.querySelectorAll(".weight").length===5||Date.now()-t0>3000){clearInterval(t);res()}},40)})'); check(tag + ' 理丝 done by real drags → 定经', r.phase === 'WARP', JSON.stringify({ phase: r.phase, placed: r.placed }));
      // 定经: drag each weight so its value lands at 0.5 (inside 合宜)
      for (let i = 0; i < 5; i++) { r = await run(); const v0 = r.warp[i], from = S(ART.weightX[i], ART.weightY + 90), to = S(ART.weightX[i], ART.weightY + 90 + (v0 - 0.5) * 230); await drag(from, to, 8, fast ? 0 : 15); await sleep(fast ? 50 : 100); }
      r = await waitFor(x => x.phase === 'WARP_DONE' || x.phase === 'WEAVE', 3000); check(tag + ' 定经 done by real drags → 经线已齐', r.phase === 'WARP_DONE' || r.phase === 'WEAVE', JSON.stringify({ phase: r.phase, done: r.warpDone }));
      if (r.phase === 'WARP_DONE') { await clickArt(430, 1314); r = await waitFor(x => x.phase === 'WEAVE', 3000); }
      check(tag + ' 开工 round 1', r.phase === 'WEAVE' && r.round === 1, r.phase);
      let paused = false, forcedTimeout = false, urgentSeen = false, linesDone = 0;
      const onLine = async (id, st) => {
        linesDone++;
        if (st.phase === 'URGENT' || (st.urgent && !urgentSeen)) { urgentSeen = true; stats.urgent++; }
        if (!paused && linesDone === pauseAt && st.phase === 'WEAVE') { paused = true; stats.pauses++; await ev('document.getElementById("pause").click()'); await sleep(200); const p1 = await run(); await clickText('继续游戏'); await sleep(200); const p2 = await run(); check(tag + ' pause / resume keeps the lit plaques (' + st.lit.length + ')', p1.paused === true && p1.overlay === 'pause' && p2.paused === false && p2.lit.length === st.lit.length, JSON.stringify({ litBefore: st.lit, litAfter: p2.lit })); await verifyLit(tag + '/resume'); }
        if (timeoutAt !== null && !forcedTimeout && linesDone === timeoutAt && st.phase === 'WEAVE') { forcedTimeout = true; await ev('YutianWeavingUI.ui.run.timeLeftMs=400'); }
      };
      let guard = 0; while (guard++ < 8) { r = await run(); if (r.phase === 'SETTLED') break; if (r.phase === 'ROUND_TRANSITION') { r = await waitFor(x => x.phase !== 'ROUND_TRANSITION', 3000); continue; }
        if (r.phase === 'URGENT') { const u0 = r.urgent; r = await weaveBoard(tag + '/urgent', fast, { onLine, order }); const after = await waitFor(x => x.phase !== 'URGENT', 9000); check(tag + ' 急束 challenge (' + u0.required.join('+') + ') woven on its own board, round board restored', after.phase === 'WEAVE' && after.lit.length >= 0, JSON.stringify({ phase: after.phase, lit: after.lit })); await verifyLit(tag + '/urgent-end'); continue; }
        if (r.phase !== 'WEAVE') { r = await waitFor(x => ['WEAVE', 'SETTLED'].includes(x.phase), 3000); if (r.phase === 'SETTLED') break; }
        r = await weaveBoard(tag, fast, { onLine, order }); }
      r = await waitFor(x => x.phase === 'SETTLED', 4000);
      const expectStatus = timeoutAt !== null ? 'timeout' : 'complete';
      check(tag + ' settled: ' + r.status + ' (' + r.total + ' lines, ' + r.rounds + ' rounds, urgent ' + (urgentSeen ? 'yes' : 'no') + ')', r.phase === 'SETTLED' && r.status === expectStatus, JSON.stringify(r.wages));
      // settlement page: rendered values = engine values; hierarchy elements present
      const page = await ev('(()=>{const q=s=>[...document.querySelectorAll(s)];const st=q(".settle-status")[0],vals=q(".settle-value:not(.total)").map(e=>e.textContent),tot=q(".settle-value.total")[0],stats=q(".settle-stats")[0],labels=q(".settle-label").map(e=>e.textContent);const fs=e=>e?parseFloat(getComputedStyle(e).fontSize):0;return {status:st?st.textContent:null,statusFont:fs(st),labels,vals,total:tot?tot.textContent:null,totalFont:fs(tot),valueFont:fs(q(".settle-value:not(.total)")[0]),stats:stats?stats.textContent:null,statsFont:fs(stats),hud:document.getElementById("hud").hidden,bg:document.getElementById("bg").getAttribute("src"),buttons:q(".hit-btn").map(b=>b.getAttribute("aria-label"))}})()');
      if (!r.wages) { check(tag + ' 今日收工 reached', false, JSON.stringify({ phase: r.phase })); results.push({ run: k, status: r.status, failed: true }); await ev("YutianWeavingUI.toEntry()"); await sleep(200); continue; }
      const w = r.wages; const engine = await ev('JSON.stringify(YutianWeavingUI.E.wagesFor(YutianWeavingUI.ui.run))');
      check(tag + ' 今日收工: status plaque 顺利收工 (end reason secondary), values = engine wages ' + w.base + '/' + w.regular + '/' + w.urgent + ' = ' + w.total + ', total dominant, stats line secondary', page.status === '顺利收工' && page.labels.join('/') === '基础工钱/常规加赏/急束加成' && page.vals.join('/') === [w.base, w.regular, w.urgent].join('/') && page.total === String(w.total) && JSON.parse(engine).total === w.total && page.totalFont > page.valueFont && page.totalFont > page.statusFont && page.statsFont < page.valueFont && page.stats.includes(`本次织成 ${w.totalCompleted} / 15 根 · 完成 ${w.roundsCompleted} 轮`) && (r.status !== 'timeout' || page.stats.startsWith('日影已尽')) && page.hud === false && page.bg === 'art/bg_settle.jpg' && page.buttons.join('/') === '继续留坊/离开织坊', JSON.stringify(page));
      if (k === 1 || k === 7 || k === 3) await c.screenshot(path.join(outDir, `settle-run${k}-${r.status}.png`));
      results.push({ run: k, status: r.status, lines: r.total, rounds: r.rounds, wages: w, urgent: urgentSeen, fast, viaStay, paused });
      console.log('run ' + k + ' ' + JSON.stringify({ status: r.status, total: r.total, rounds: r.rounds, total钱: w.total, urgent: urgentSeen }));
    }
    const errs = c.console.filter(m => m.type === 'error' || m.type === 'exception').map(m => m.text.slice(0, 160));
    check('no console errors across ' + RUNS + ' runs', errs.length === 0, JSON.stringify(errs.slice(0, 3)));
    check('lit plaques never blank: ' + stats.plaqueChecks + ' lit-plaque clips checked, 0 blank', stats.plaqueChecks > 0 && stats.blank === 0, JSON.stringify({ ...stats, minInk: Object.fromEntries(Object.entries(stats.minInk).map(([k, v]) => [k, +v.toFixed(3)])) }));
    fs.writeFileSync(path.join(outDir, 'regression.json'), JSON.stringify({ label, serveRoot, viewport: [W, H], runs: results, stats, checks, generatedAt: new Date().toISOString() }, null, 2));
    try { fs.unlinkSync(path.join(outDir, 'tmp-shot.png')); } catch (_) { }
  } catch (e) { check('script error', false, String(e && e.stack || e)); }
  await c.close(); srv.stop();
  const failed = checks.filter(x => !x.ok);
  console.log('\n' + (checks.length - failed.length) + '/' + checks.length + ' checks passed' + (failed.length ? ' — FAILED: ' + failed.slice(0, 8).map(f => f.name).join(' | ') : ''));
  process.exit(failed.length ? 1 : 0);
})();
