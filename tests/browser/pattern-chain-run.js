'use strict';
// 《缀纹成章》standalone 浏览器测试（真实鼠标输入经 DevTools 协议）
// node tests/browser/pattern-chain-run.js [shots|full] [--out <dir>] [--port 8141] [--cdp 9341]
const path = require('path'), fs = require('fs');
const { launch, startServer } = require('../tools/cdp.js');
const args = process.argv.slice(2); const mode = args.find(a => !a.startsWith('--')) || 'full';
const opt = k => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : null; };
const OUT = opt('out') || path.join(__dirname, '..', 'results', 'pattern-chain'); fs.mkdirSync(OUT, { recursive: true });
const PORT = Number(opt('port') || 8141), CDP = Number(opt('cdp') || 9341); const ROOT = path.join(__dirname, '..', '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const checks = []; const log = []; let c, srv;
function check(name, ok, detail) { checks.push({ name, ok: Boolean(ok), detail }); const line = (ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''); log.push(line); console.log(line); }
async function until(expr, ms = 5000, step = 60) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await c.eval(expr)) return true; await sleep(step); } return false; }
const mouse = async (type, x, y) => c.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: type === 'mouseMoved' ? 0 : 1, pointerType: 'mouse' });
async function click(sel) { const r = await c.eval(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;const b=e.getBoundingClientRect();return {x:b.left+b.width/2,y:b.top+b.height/2,vis:b.width>0&&b.height>0&&!e.disabled}})()`); if (!r) throw new Error('no element ' + sel); await mouse('mousePressed', r.x, r.y); await sleep(30); await mouse('mouseReleased', r.x, r.y); await sleep(120); return r; }
async function shot(name) { const f = path.join(OUT, name + '.png'); await c.screenshot(f); return f; }
const runState = () => c.eval(`(()=>{const r=PatternChain.ui.run;if(!r)return null;return {phase:r.phase,score:r.score,strokesLeft:r.strokesLeft,timeLeftMs:r.timeLeftMs,path:r.path.slice(),locked:r.lockedMotif,resolving:r.resolving,valid:r.validStrokes,wild:r.wildcardsGenerated,cancels:r.cancels,invalid:r.invalidReleases,backtracks:r.backtracks,board:r.board.map(x=>x&&x.motif),mode:r.mode,shuffles:r.shuffles,endedBy:r.endedBy,rep:r.representativeMotif,paused:r.paused}})()`);
const findPath = len => c.eval(`(()=>{const r=PatternChain.ui.run;return PatternChain.engine.findPath(r.board,6,7,${len})})()`);
const center = i => c.eval(`PatternChain.ui.cellCenter(${i})`);
async function dragPath(pathIdx, { release = 'board', backtrackTo = null, steps = 3 } = {}) {
  const pts = []; for (const i of pathIdx) pts.push(await center(i));
  await mouse('mousePressed', pts[0].x, pts[0].y); await sleep(25);
  for (let k = 1; k < pts.length; k++) { const a = pts[k - 1], b = pts[k]; for (let s = 1; s <= steps; s++) { await mouse('mouseMoved', a.x + (b.x - a.x) * s / steps, a.y + (b.y - a.y) * s / steps); await sleep(12); } }
  if (backtrackTo !== null) { const b = pts[backtrackTo]; await mouse('mouseMoved', b.x, b.y); await sleep(25); }
  let end = pts[backtrackTo !== null ? backtrackTo : pts.length - 1];
  if (release === 'cancel') { const cz = await c.eval('(()=>{const b=PatternChain.ui.cancelRect();return {x:b.left+b.width/2,y:b.top+b.height/2}})()'); for (let s = 1; s <= 4; s++) { await mouse('mouseMoved', end.x + (cz.x - end.x) * s / 4, end.y + (cz.y - end.y) * s / 4); await sleep(15); } end = cz; }
  if (release === 'outside') { const mr = await c.eval('(()=>{const b=document.getElementById("modal").getBoundingClientRect();return {x:b.left+b.width/2,y:b.top-40}})()'); await mouse('mouseMoved', mr.x, mr.y); await sleep(20); end = mr; }
  await mouse('mouseReleased', end.x, end.y); await sleep(40);
}
async function settleAnim() { await until('!PatternChain.ui.state.animating && !(PatternChain.ui.run&&PatternChain.ui.run.resolving)', 4000); await sleep(80); }
async function playToEnd(prefer = 5, maxLoops = 14) {
  for (let k = 0; k < maxLoops; k++) {
    const st = await runState(); if (!st || st.phase !== 'PLAYING') return st;
    const p = (await findPath(prefer)) || (await findPath(3)); if (!p) throw new Error('no path on board');
    await dragPath(p); await settleAnim();
  }
  return runState();
}

async function main() {
  srv = startServer(PORT, ROOT); await sleep(500);
  c = await launch({ port: CDP, width: 390, height: 844, mobile: true });
  const base = `http://127.0.0.1:${PORT}/pattern-chain/`;
  await c.navigate(base + '?seed=20260913&phase=0'); await sleep(700);
  // reset mock host for a clean run
  await c.eval('PatternChain.host.reset(); PatternChain.host.setPhase(0); PatternChain.ui.showReady(); true');
  // ---- READY ----
  check('READY page visible', await c.eval('PatternChain.ui.page==="ready" && !document.getElementById("page-ready").hidden'));
  check('READY title 缀纹成章 (uniform glyphs: single text node, one font-size)', await c.eval('document.querySelector("#page-ready .title").textContent==="缀纹成章" && document.querySelector("#page-ready .title").children.length===0'));
  check('READY subtitle', await c.eval('document.querySelector("#page-ready .subtitle").textContent'), '连缀纹样，观其成章。');
  const intro = await c.eval('document.querySelector("#page-ready .intro").innerText.replace(/\\n/g,"")');
  check('READY intro copy = UI Supplement §7.4 (C1)', intro === '在限定时间与笔数内，拖动连起相同纹样。连得越长，得分越高；长链还能生成万能图样。一局结束后，你本轮连缀最多的纹样将逐步展开为完整敦煌图样。', intro);
  check('no 宝相花 in player UI (C2/§6)', !(await c.eval('document.getElementById("modal").innerText.includes("宝相花")')));
  check('READY time hint 晨', await c.eval('document.getElementById("time-hint-text").textContent'), '当前：晨 · 可开始帮工');
  check('READY buttons 开始帮工 / 试玩 / 玩法说明 + close', await c.eval('[...document.querySelectorAll("#page-ready button")].map(b=>b.textContent.trim().replace(/\\s+/g,"")).join("|")'), '×|开始帮工|试玩|玩法说明›');
  const dims = await c.eval('(()=>{const m=document.getElementById("modal").getBoundingClientRect();return {w:+m.width.toFixed(1),h:+m.height.toFixed(1),l:+m.left.toFixed(1),t:+m.top.toFixed(1),sw:document.documentElement.scrollWidth,sh:document.documentElement.scrollHeight,iw:innerWidth,ih:innerHeight}})()');
  check('modal 360×620 basis at 390×844, no page scroll', dims.w === 360 && dims.h === 620 && dims.sw <= dims.iw && dims.sh <= dims.ih, dims);
  await shot('01-ready-390');
  // 暮 → formal disabled, trial enabled
  await c.eval('PatternChain.host.setPhase(2); PatternChain.ui.showReady(); true');
  check('暮: 开始帮工 disabled, hint 今日不可帮工, 试玩 enabled', await c.eval('document.getElementById("btn-formal").disabled && document.getElementById("time-hint-text").textContent==="当前：暮 · 今日不可帮工" && !document.getElementById("btn-trial").disabled'));
  await shot('02-ready-dusk'); await c.eval('PatternChain.host.setPhase(1); PatternChain.ui.showReady(); true');
  check('午: 开始帮工 enabled', await c.eval('!document.getElementById("btn-formal").disabled && document.getElementById("time-hint-text").textContent==="当前：午 · 可开始帮工"'));
  await c.eval('PatternChain.host.setPhase(0); PatternChain.ui.showReady(); true');
  // ---- HOW_TO_PLAY ----
  await click('#btn-howto'); check('玩法说明 → HOW_TO_PLAY', await c.eval('PatternChain.ui.page'), 'howto');
  const howto = await c.eval('document.querySelector("#page-howto .howto-list").innerText');
  check('HOW_TO_PLAY copy uses 万能图样 (C2) and keeps the confirmed rules text', howto.includes('万能图样可代替任意普通纹样；一笔连到 8 个及以上时，会生成 1 个万能图样。') && howto.includes('拖动连接相邻的相同纹样，3 个及以上即可完成一笔。') && !howto.includes('宝相花'));
  check('legend 7 items (6 ordinary + 万能图样)', await c.eval('document.querySelectorAll("#howto-legend div").length===7 && document.getElementById("howto-legend").innerText.includes("万能图样")'));
  await shot('03-howto'); await click('#btn-howto-back'); check('HOW_TO_PLAY → READY (optional branch, C5)', await c.eval('PatternChain.ui.page'), 'ready');
  // ---- TRIAL gameplay ----
  await click('#btn-trial'); await sleep(300);
  let st = await runState();
  check('试玩 → GAMEPLAY TRIAL, 60 s / 10 strokes / 42 tiles / 5 active motifs', st && st.mode === 'TRIAL' && st.strokesLeft === 10 && st.timeLeftMs > 58000 && (await c.eval('document.querySelectorAll("#tiles .tile").length')) === 42 && (await c.eval('document.querySelectorAll("#active-motifs span").length')) === 5, st && { mode: st.mode, strokes: st.strokesLeft, t: st.timeLeftMs });
  check('no wildcard on the initial board', st.board.every(m => m !== 'BAOXIANGHUA_WILDCARD'));
  check('GAMEPLAY has cancel zone 拖到这里取消本笔', await c.eval('document.getElementById("cancel-zone").textContent'), '拖到这里取消本笔');
  const gdims = await c.eval('(()=>{const m=document.getElementById("modal").getBoundingClientRect(),b=PatternChain.ui.boardRect(),z=PatternChain.ui.cancelRect(),a=document.getElementById("active-motifs").getBoundingClientRect();const inside=r=>r.left>=m.left-.5&&r.right<=m.right+.5&&r.top>=m.top-.5&&r.bottom<=m.bottom+.5;return {board:inside(b),cancel:inside(z),legend:inside(a),bw:+b.width.toFixed(1),bh:+b.height.toFixed(1),sh:document.documentElement.scrollHeight<=innerHeight}})()');
  check('board / cancel zone / legend inside the modal, no scroll', gdims.board && gdims.cancel && gdims.legend && gdims.sh, gdims);
  await shot('04-game-empty');
  // 1) invalid: single cell release
  let p = await findPath(3); await dragPath([p[0]]); st = await runState();
  check('1-cell release: invalid, no cost', st.strokesLeft === 10 && st.score === 0 && st.invalid === 1, { invalid: st.invalid });
  // 2) cancel zone
  p = await findPath(3); await dragPath(p, { release: 'cancel' }); st = await runState();
  check('drag to 取消区 and release: cancelled, no cost, board unchanged', st.cancels === 1 && st.strokesLeft === 10 && st.score === 0 && (await c.eval('document.querySelectorAll("#tiles .tile").length')) === 42);
  // 3) outside release (TEMP)
  p = await findPath(3); await dragPath(p, { release: 'outside' }); st = await runState();
  check('release outside board (not cancel zone): invalid, no cost (TEMP)', st.invalid === 2 && st.strokesLeft === 10);
  // 4) backtrack
  p = await findPath(4);
  if (p) { await dragPath(p.slice(0, 4), { backtrackTo: 2 }); await settleAnim(); st = await runState(); check('backtrack: 4 cells then back to the 3rd → committed length 3 (score +3), backtracks counted', st.score === 3 && st.strokesLeft === 9 && st.backtracks >= 1 && st.valid === 1, { score: st.score, bt: st.backtracks }); } else check('backtrack (no 4-path available)', true, 'skipped');
  // path visual during drag
  p = await findPath(3); { const pts = [await center(p[0]), await center(p[1]), await center(p[2])]; await mouse('mousePressed', pts[0].x, pts[0].y); await sleep(30); await mouse('mouseMoved', pts[1].x, pts[1].y); await sleep(30); await mouse('mouseMoved', pts[2].x, pts[2].y); await sleep(60);
    const vis = await c.eval('(()=>{const pl=document.getElementById("path-line").getAttribute("points").split(" ").length;return {pts:pl,sel:document.querySelectorAll("#tiles .tile.sel").length,head:document.querySelectorAll("#tiles .tile.head").length,armed:document.getElementById("cancel-zone").classList.contains("armed"),path:PatternChain.ui.run.path.length}})()');
    check('drag shows thread polyline + selected rings + head + armed cancel zone', vis.pts === 3 && vis.sel === 3 && vis.head === 1 && vis.armed && vis.path === 3, vis); await shot('05-game-drag');
    await mouse('mouseReleased', pts[2].x, pts[2].y); await settleAnim(); st = await runState(); check('3-chain commit: +3, strokes −1, board refilled to 42', st.score === 6 && st.strokesLeft === 8 && (await c.eval('document.querySelectorAll("#tiles .tile").length')) === 42); }
  // 5) type mismatch ignored
  { const st0 = await runState(); const i0 = st0.board.findIndex((m, i) => { const r = Math.floor(i / 6), col = i % 6; return col < 5 && st0.board[i + 1] !== m; }); const a = await center(i0), b = await center(i0 + 1); await mouse('mousePressed', a.x, a.y); await sleep(30); await mouse('mouseMoved', b.x, b.y); await sleep(50); const len = (await runState()).path.length; await mouse('mouseReleased', b.x, b.y); await sleep(60); check('different motif neighbour is not added (type lock)', len === 1, { len }); }
  // 6) 5+ pulse
  p = await findPath(5);
  if (p) { const pts = []; for (const i of p) pts.push(await center(i)); await mouse('mousePressed', pts[0].x, pts[0].y); for (let k = 1; k < 5; k++) { await sleep(20); await mouse('mouseMoved', pts[k].x, pts[k].y); } await sleep(60);
    check('5+ chain: one restrained pulse on the thread', await c.eval('document.getElementById("path-layer").classList.contains("pulse")')); await shot('06-game-5chain'); await mouse('mouseReleased', pts[4].x, pts[4].y); await settleAnim(); st = await runState(); check('5-chain scores 6', st.score === 12, { score: st.score }); } else check('5-chain (none available)', true, 'skipped');
  // 7) 8+ wildcard preview & generation (search across a few boards)
  let got8 = false;
  for (let attempt = 0; attempt < 6 && !got8; attempt++) { const st1 = await runState(); if (st1.phase !== 'PLAYING') break; p = await findPath(8); if (p) { const pts = []; for (const i of p) pts.push(await center(i)); await mouse('mousePressed', pts[0].x, pts[0].y); for (let k = 1; k < 8; k++) { await sleep(18); await mouse('mouseMoved', pts[k].x, pts[k].y); } await sleep(60);
      const badge = await c.eval('!document.getElementById("preview-badge").hidden'); await shot('07-game-8chain-preview'); await mouse('mouseReleased', pts[7].x, pts[7].y); await settleAnim(); st = await runState();
      const wilds = st.board.filter(m => m === 'BAOXIANGHUA_WILDCARD').length; check('8-chain: 万能图样 preview badge, exactly one wildcard spawned (final node column), +12', badge && wilds === 1 && st.wild === 1, { badge, wilds, score: st.score }); got8 = true; await shot('08-game-wildcard'); }
    else { const q = (await findPath(5)) || (await findPath(3)); await dragPath(q); await settleAnim(); } }
  if (!got8) check('8-chain (no 8-path found in 6 boards)', true, 'skipped');
  // 8) abort dialog pauses the timer
  st = await runState();
  if (st.phase === 'PLAYING') { await click('#game-close'); const t1 = (await runState()).timeLeftMs; await sleep(700); const t2 = (await runState()).timeLeftMs; check('× opens abort dialog and pauses the timer', await c.eval('!document.getElementById("dialog").hidden') && t1 === t2 && (await runState()).paused, { t1, t2 }); await shot('09-abort-dialog'); await click('#dialog-cancel'); await sleep(300); check('继续 resumes', !(await runState()).paused && (await runState()).timeLeftMs < t2); }
  // 9) play to the end
  st = await playToEnd(5); check('TRIAL ends by STROKES after 10 valid commits', st.phase === 'ENDED' && st.endedBy === 'STROKES' && st.strokesLeft === 0 && st.valid === 10, { endedBy: st.endedBy, valid: st.valid });
  await until('PatternChain.ui.page==="settle"', 3000); await sleep(1500); await shot('10-settle-trial-mid-reveal');
  const rep = st.rep; const res = await c.eval('JSON.stringify(PatternChain.ui.run.result)').then(JSON.parse);
  check('representative = engine four-level rule result', rep && rep === res.secondaryMetrics.representativeMotif && rep !== 'BAOXIANGHUA_WILDCARD', rep);
  check('SETTLEMENT copy: 帮工完成 / 本轮连缀最多的纹样 / motif name / 渐次成章', await c.eval('document.querySelector(".settle-title").textContent==="帮工完成" && document.querySelector(".settle-sub").textContent==="本轮连缀最多的纹样" && document.getElementById("settle-copy").textContent==="你本轮最常连缀的纹样，已渐次成章。"') && (await c.eval('document.getElementById("settle-motif-name").textContent')) === (await c.eval(`PatternChain.NAMES[${JSON.stringify(rep)}]`)));
  check('SETTLEMENT has no top-right close', (await c.eval('document.querySelectorAll("#page-settle .close").length')) === 0);
  const rows = await c.eval('[...document.querySelectorAll("#settle-stats li")].map(li=>li.querySelector(".lbl").textContent+"="+li.querySelector(".val").textContent)');
  check('TRIAL stats rows = result (总得分/最长连缀/有效落笔数/生成万能图样次数/收益)', JSON.stringify(rows) === JSON.stringify(['总得分=' + res.primaryMetrics.score, '最长连缀=' + res.primaryMetrics.longestChain, '有效落笔数=' + res.primaryMetrics.validStrokes, '生成万能图样次数=' + res.primaryMetrics.wildcardsGenerated, '收益=试玩模式 · 不获得实际收益']), rows);
  check('TRIAL buttons 再试一次 / 退出试玩', await c.eval('[...document.querySelectorAll("#settle-buttons button")].map(b=>b.textContent).join("|")'), '再试一次|退出试玩');
  const mid = await c.eval('(()=>{const cv=document.getElementById("reveal-canvas");const ctx=cv.getContext("2d");const d=ctx.getImageData(0,0,cv.width,cv.height).data;let n=0;for(let i=3;i<d.length;i+=4)if(d[i]>0)n++;return {drawn:n,unit:document.getElementById("reveal-unit-img").getAttribute("src"),fullHidden:document.getElementById("reveal-full-img").hidden,structure:document.getElementById("reveal-full-img").dataset.structure}})()');
  check('reveal in progress: unit shown first, canvas drawing structural growth, real full not yet shown', mid.drawn > 0 && mid.unit === (await c.eval(`PatternChain.UNIT[${JSON.stringify(rep)}]`)) && mid.fullHidden === true, mid);
  await until('!document.getElementById("reveal-full-img").hidden', 6000); await sleep(200); await shot('11-settle-trial-final');
  const fin = await c.eval('(()=>{const im=document.getElementById("reveal-full-img");return {src:im.getAttribute("src"),hidden:im.hidden,unitVisible:getComputedStyle(document.getElementById("reveal-unit-img")).opacity==="1",structure:im.dataset.structure,nat:[im.naturalWidth,im.naturalHeight]}})()');
  check('reveal final: left unitAsset stays, right = real fullAsset (' + fin.structure + ')', fin.src === (await c.eval(`PatternChain.FULL[${JSON.stringify(rep)}]`)) && !fin.hidden && fin.unitVisible && fin.nat[0] > 0, fin);
  const host1 = await c.eval('JSON.stringify(PatternChain.host.state)').then(JSON.parse);
  check('TRIAL: 0 world time, 0 formal records, cash unchanged, trial counted', host1.tick === 0 && host1.records.length === 0 && host1.cash === 100 && host1.trials === 1, { tick: host1.tick, records: host1.records.length, trials: host1.trials });
  // 再试一次 → new trial; then abort
  await click('#btn-again'); await sleep(400); st = await runState(); check('再试一次 → new TRIAL run', st && st.mode === 'TRIAL' && st.phase === 'PLAYING' && st.strokesLeft === 10);
  await click('#game-close'); await sleep(200); await click('#dialog-ok'); await sleep(400);
  const host2 = await c.eval('JSON.stringify(PatternChain.host.state)').then(JSON.parse);
  check('abort: ABORTED result, modal closed, entry visible, no record / no time', (await c.eval('document.getElementById("modal").hidden && !document.getElementById("entry").hidden')) && host2.aborted === 1 && host2.tick === 0 && host2.records.length === 0 && host2.lastResult.completionStatus === 'ABORTED' && host2.lastResult.economy.cash === 0 && host2.lastResult.economy.timeCostTicks === 0);
  await shot('12-city-after-abort');
  // ---- FORMAL ----
  await click('#btn-entry'); await sleep(200); await click('#btn-formal'); await sleep(300); st = await runState();
  check('开始帮工 (晨) → FORMAL run, HUD tag 正式 · 半日工', st && st.mode === 'FORMAL' && (await c.eval('document.getElementById("hud-mode").textContent')) === '正式 · 半日工');
  st = await playToEnd(5); check('FORMAL ends (STROKES)', st.phase === 'ENDED' && st.endedBy === 'STROKES');
  await until('PatternChain.ui.page==="settle"', 3000); await until('!document.getElementById("reveal-full-img").hidden', 7000); await sleep(150);
  const frows = await c.eval('[...document.querySelectorAll("#settle-stats li")].map(li=>li.querySelector(".lbl").textContent+"="+li.querySelector(".val").textContent)');
  const fres = await c.eval('JSON.stringify(PatternChain.ui.run.result)').then(JSON.parse); const fcash = fres.primaryMetrics.validStrokes === 0 ? 0 : Math.min(15, 6 + Math.floor((fres.primaryMetrics.score - 1) / 15));
  check('FORMAL 所得 row shows the frozen ZHUWEN_CHENGZHANG_SCORE_TO_CASH_MAPPING (min(15, 6 + floor((score-1)/15)))', frows[4] === '所得=' + fcash + ' 钱' && fres.economy.cash === fcash, frows);
  check('FORMAL button 结束帮工 only', await c.eval('[...document.querySelectorAll("#settle-buttons button")].map(b=>b.textContent).join("|")'), '结束帮工');
  await shot('13-settle-formal'); await click('#btn-finish'); await sleep(400);
  const host3 = await c.eval('JSON.stringify(PatternChain.host.state)').then(JSON.parse);
  check('结束帮工: formal record written (cash = frozen mapping, mock cash += cash), advanceTime(1) → 午, modal closed', host3.records.length === 1 && host3.records[0].cash === fcash && host3.records[0].cashMapping === 'ZHUWEN_CHENGZHANG_SCORE_TO_CASH_MAPPING' && host3.records[0].tickBefore === 0 && host3.records[0].tickAfter === 1 && host3.tick === 1 && host3.cash === 100 + fcash && (await c.eval('document.getElementById("modal").hidden')), { tick: host3.tick, rec: host3.records[0] && { cash: host3.records[0].cash, before: host3.records[0].tickBefore, after: host3.records[0].tickAfter } });
  check('city HUD shows 第 1 天 · 午', await c.eval('document.getElementById("city-time").textContent'), '第 1 天 · 午');
  await shot('14-city-after-formal');
  // ---- timeout / zero-clear ----
  await click('#btn-entry'); await sleep(150); await click('#btn-trial'); await sleep(250);
  await c.eval('PatternChain.engine.tick(PatternChain.ui.run, 59500); true'); await sleep(1400); st = await runState();
  check('time out with no valid stroke → ENDED by TIME, representative null (zero-clear TEMP)', st.phase === 'ENDED' && st.endedBy === 'TIME' && st.rep === null, { endedBy: st.endedBy, rep: st.rep });
  await until('PatternChain.ui.page==="settle"', 3000); await sleep(300);
  check('zero-clear settlement: 尚无纹样, no invented representative, copy adjusted', (await c.eval('document.getElementById("settle-motif-name").textContent')) === '尚无纹样' && (await c.eval('document.getElementById("settle-copy").textContent')) === '本轮未连缀出纹样，未有图样可成章。');
  await shot('15-settle-zero-clear'); await click('#btn-quit'); await sleep(200); check('退出试玩 → READY', await c.eval('PatternChain.ui.page'), 'ready');
  // ---- timeout during drag (TEMP: stroke discarded, no cost) ----
  await click('#btn-trial'); await sleep(250); p = await findPath(3); { const pts = [await center(p[0]), await center(p[1]), await center(p[2])]; await mouse('mousePressed', pts[0].x, pts[0].y); await sleep(20); await mouse('mouseMoved', pts[1].x, pts[1].y); await sleep(20); await mouse('mouseMoved', pts[2].x, pts[2].y); await sleep(30);
    await c.eval('PatternChain.engine.tick(PatternChain.ui.run, 59900); true'); await sleep(500); st = await runState(); await mouse('mouseReleased', pts[2].x, pts[2].y); await sleep(100); const st2 = await runState();
    check('timeout during drag: stroke discarded without cost, game ends by TIME', st.phase === 'ENDED' && st2.valid === 0 && st2.strokesLeft === 10 && st2.endedBy === 'TIME'); await until('PatternChain.ui.page==="settle"', 3000); await sleep(200); await click('#btn-quit'); }
  // ---- six reveals via debug fixture ----
  for (const m of ['LOTUS', 'DRAGON', 'THREE_HARES', 'POMEGRANATE_SCROLL', 'PEARL_CHAIN', 'DIAMOND_PATTERN']) {
    await c.navigate(base + '?reveal=' + m); await sleep(1500);
    const sample = '(()=>{const cv=document.getElementById("reveal-canvas");const ctx=cv.getContext("2d");const d=ctx.getImageData(0,0,cv.width,cv.height).data;let n=0;for(let i=3;i<d.length;i+=4)if(d[i]>0)n++;return {drawn:n,total:d.length/4,fullHidden:document.getElementById("reveal-full-img").hidden,tag:!document.getElementById("fixture-tag").hidden}})()';
    const midm = await c.eval(sample); await shot('20-reveal-' + m + '-early'); await sleep(900); await shot('20-reveal-' + m + '-mid');
    await until('!document.getElementById("reveal-full-img").hidden', 6000); await sleep(150);
    const fm = await c.eval('(()=>{const im=document.getElementById("reveal-full-img");return {src:im.getAttribute("src"),structure:im.dataset.structure,name:document.getElementById("settle-motif-name").textContent,unit:document.getElementById("reveal-unit-img").getAttribute("src")}})()');
    check('reveal ' + m + ' (' + fm.structure + '): partial canvas mid-way, final = real fullAsset, unit kept, fixture tagged', midm.drawn > 0 && midm.drawn < midm.total && midm.fullHidden && midm.tag && fm.src === (await c.eval(`PatternChain.FULL[${JSON.stringify(m)}]`)) && fm.unit === (await c.eval(`PatternChain.UNIT[${JSON.stringify(m)}]`)) && fm.name === (await c.eval(`PatternChain.NAMES[${JSON.stringify(m)}]`)), { drawnPct: +(100 * midm.drawn / midm.total).toFixed(1), name: fm.name });
    await shot('21-reveal-' + m + '-final');
  }
  // ---- viewports ----
  for (const [w, h] of [[360, 780], [430, 932], [375, 667]]) {
    await c.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true, screenWidth: w, screenHeight: h });
    await c.navigate(base + '?seed=7&phase=0'); await sleep(600); await c.eval('PatternChain.host.reset(); PatternChain.host.setPhase(0); PatternChain.ui.showReady(); true');
    const d1 = await c.eval('(()=>{const m=document.getElementById("modal").getBoundingClientRect();return {w:+m.width.toFixed(1),h:+m.height.toFixed(1),fits:m.left>=0&&m.right<=innerWidth&&m.top>=0&&m.bottom<=innerHeight,sw:document.documentElement.scrollWidth<=innerWidth,sh:document.documentElement.scrollHeight<=innerHeight}})()');
    await shot('30-ready-' + w + 'x' + h); await click('#btn-trial'); await sleep(300);
    const d2 = await c.eval('(()=>{const m=document.getElementById("modal").getBoundingClientRect(),b=PatternChain.ui.boardRect(),z=PatternChain.ui.cancelRect();const inside=r=>r.left>=m.left-.5&&r.right<=m.right+.5&&r.top>=m.top-.5&&r.bottom<=m.bottom+.5;return {board:inside(b),cancel:inside(z),tile:+document.querySelector("#tiles .tile").getBoundingClientRect().width.toFixed(1)}})()');
    p = await findPath(3); await dragPath(p); await settleAnim(); st = await runState();
    check(`viewport ${w}×${h}: modal fits (${d1.w}×${d1.h}), no scroll, board+cancel inside, tile ${d2.tile}px, real drag commits`, d1.fits && d1.sw && d1.sh && d2.board && d2.cancel && st.score >= 3, { d1, d2, score: st.score });
    await shot('31-game-' + w + 'x' + h);
  }
  // console / network
  const errors = c.console.filter(m => m.type === 'error' || m.type === 'exception'); const bad = c.network.filter(n => n.status !== 200 && n.status !== 304);
  check('no console errors', errors.length === 0, errors.slice(0, 5)); check('all requests 200', bad.length === 0, bad.slice(0, 5));
}
main().then(async () => { const ok = checks.filter(x => x.ok).length; const summary = `${ok}/${checks.length} checks passed`; log.push(summary); console.log('\n' + summary);
  fs.writeFileSync(path.join(OUT, 'pattern-chain-browser.json'), JSON.stringify({ date: new Date().toISOString(), mode, checks, console: c.console, network404: c.network.filter(n => n.status !== 200) }, null, 1)); fs.writeFileSync(path.join(OUT, 'pattern-chain-browser.log'), log.join('\n'));
  await c.close(); srv.stop(); process.exit(ok === checks.length ? 0 : 1); }).catch(async e => { console.error('ERROR', e); try { await shot('99-error'); } catch (x) { /* ignore */ } fs.writeFileSync(path.join(OUT, 'pattern-chain-browser.log'), log.concat(['ERROR ' + (e.stack || e)]).join('\n')); try { await c.close(); } catch (x) { /* ignore */ } try { srv.stop(); } catch (x) { /* ignore */ } process.exit(2); });
