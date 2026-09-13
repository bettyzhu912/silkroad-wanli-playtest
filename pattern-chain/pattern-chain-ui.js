/*
 * 《缀纹成章》standalone UI — READY / HOW_TO_PLAY / GAMEPLAY / SETTLEMENT，输入、动画、mock host 绑定。
 * 玩法规则全部由 pattern-chain-engine.js 执行；本文件只做呈现与输入映射。
 */
(function (root) {
  'use strict';
  const E = root.PatternChainEngine, H = root.PatternChainHost, R = root.PatternChainReveal;
  const VERSION = 'ZHUWEN_CHENGZHANG standalone v0.1 (2026-09-13)';
  const NAMES = { LOTUS: '八瓣莲花', DRAGON: '双龙莲花', THREE_HARES: '三兔共耳', POMEGRANATE_SCROLL: '石榴卷草', PEARL_CHAIN: '连珠纹', DIAMOND_PATTERN: '菱形连续纹', BAOXIANGHUA_WILDCARD: '万能图样' };
  const RT = 'assets/runtime/';
  const UNIT = { LOTUS: RT + 'DPC_01_LOTUS_PETAL_C217_v01.rt192.webp', DRAGON: RT + 'DPC_02_DRAGON_C392_v01.rt192.webp', THREE_HARES: RT + 'DPC_03_THREE_HARES_RABBIT_C407_v01.rt192.webp', POMEGRANATE_SCROLL: RT + 'DPC_04_POMEGRANATE_SCROLL_C148_v01.rt192.webp', PEARL_CHAIN: RT + 'DPC_05_PEARL_CHAIN_C334_v01.rt192.webp', DIAMOND_PATTERN: RT + 'DPC_06_DIAMOND_PATTERN_C079_v01.rt192.webp', BAOXIANGHUA_WILDCARD: RT + 'DPC_07_BAOXIANGHUA_WILDCARD_v01.rt192.webp' };
  const FULL = { LOTUS: RT + 'DPC_FULL_01_LOTUS_ROSETTE_C217_v01.rt640.webp', DRAGON: RT + 'DPC_FULL_02_DOUBLE_DRAGON_C392_v01.rt640.webp', THREE_HARES: RT + 'DPC_FULL_03_THREE_HARES_ROUNDEL_C407_v01.rt640.webp', POMEGRANATE_SCROLL: RT + 'DPC_FULL_04_POMEGRANATE_SCROLL_BAND_C148_v01.rt640.webp', PEARL_CHAIN: RT + 'DPC_FULL_05_PEARL_CHAIN_BAND_C334_v01.rt640.webp', DIAMOND_PATTERN: RT + 'DPC_FULL_06_DIAMOND_REPEAT_C079_v01.rt640.webp' };
  const STRUCTURE = { LOTUS: 'RADIAL_ROSETTE', DRAGON: 'BILATERAL_SYMMETRY', THREE_HARES: 'ROTATIONAL_SHARED_EAR_ROUNDEL', POMEGRANATE_SCROLL: 'S_SCROLL_CONTINUOUS_BAND', PEARL_CHAIN: 'SQUARE_BORDER_CONTINUOUS', DIAMOND_PATTERN: 'TESSELLATED_REPEAT' };
  // 显示层每纹样缩放（tile 画布留白差异大；不改资产，只调显示）
  const TILE_SCALE = { LOTUS: 1.0, DRAGON: 0.92, THREE_HARES: 0.86, POMEGRANATE_SCROLL: 0.86, PEARL_CHAIN: 1.18, DIAMOND_PATTERN: 1.02, BAOXIANGHUA_WILDCARD: 0.84 };
  const PATH_COLOR = { LOTUS: '#b0553a', DRAGON: '#2f6f6a', THREE_HARES: '#3b3a3a', POMEGRANATE_SCROLL: '#5f9a6d', PEARL_CHAIN: '#2e5a9c', DIAMOND_PATTERN: '#5a4634', WILD: '#b58a3c' };
  // 棋盘背景 DPC_BOARD_BG_SILK_v01 有效矩形 (53,17)–(1108,1326) 内 6×7 圆槽中心（相对坐标，来自图像测量）
  const GRID = { cols: [0.1316, 0.2775, 0.4252, 0.5725, 0.7206, 0.8665], rows: [0.1458, 0.2618, 0.3771, 0.4939, 0.6099, 0.7267, 0.8427], vb: [1056, 1310] };
  const $ = id => document.getElementById(id);
  const n = {}; const ui = { page: null, run: null, seedBase: null, runCount: 0, tiles: new Map(), raf: 0, last: 0, drag: null, animating: false, animToken: 0, reveal: null, fixture: false, recorded: false, toastTimer: 0 };

  function fit() {
    const vw = root.innerWidth, vh = root.innerHeight; let mw = Math.min(360, vw - 30); if (mw * 620 / 360 > vh - 24) mw = (vh - 24) * 360 / 620;
    document.documentElement.style.setProperty('--mw', Math.max(280, Math.round(mw * 100) / 100) + 'px');
  }
  function showPage(name) { for (const p of n.modal.querySelectorAll('.page')) p.hidden = p.id !== 'page-' + name; ui.page = name; }
  function toast(text, ms = 2600) { n.toast.textContent = text; n.toast.hidden = false; clearTimeout(ui.toastTimer); ui.toastTimer = setTimeout(() => { n.toast.hidden = true; }, ms); }
  function cityHud() { n.cityTime.textContent = H.timeLabel(); n.cityCash.textContent = H.state.cash + ' 钱'; }

  // ---------- READY / HOW_TO_PLAY ----------
  function showReady() {
    const ph = H.phase(), ok = H.canStartFormal();
    n.timeHintText.textContent = '当前：' + H.phaseName() + (ok ? ' · 可开始帮工' : ' · 今日不可帮工');
    n.timeHint.classList.toggle('na', !ok); n.btnFormal.disabled = !ok; n.btnFormal.title = ok ? '' : '暮时不可开始正式帮工';
    cityHud(); showPage('ready');
  }
  function buildLegend() {
    n.legend.innerHTML = '';
    for (const m of E.MOTIFS.concat([E.WILDCARD])) { const d = document.createElement('div'); const img = new Image(); img.src = UNIT[m]; img.alt = NAMES[m]; d.append(img, document.createTextNode(NAMES[m])); n.legend.append(d); }
  }
  function openModal() { n.modal.hidden = false; n.entry.hidden = true; }
  function closeModal() { n.modal.hidden = true; n.entry.hidden = false; cityHud(); }

  // ---------- GAMEPLAY ----------
  function nextSeed() { ui.runCount++; return ui.seedBase !== null ? ui.seedBase + ui.runCount - 1 : ((Date.now() & 0x7fffffff) ^ Math.floor(Math.random() * 1e9)) >>> 0; }
  function startRun(mode) {
    stopLoop(); if (ui.reveal) { ui.reveal.cancel(); ui.reveal = null; }
    const run = E.createRun({ mode, seed: nextSeed(), now: performance.now() }); ui.run = run; ui.recorded = false; ui.fixture = false; ui.animating = false; ui.drag = null;
    n.hudMode.textContent = mode === 'TRIAL' ? '试玩' : '正式 · 半日工';
    n.activeMotifs.innerHTML = '';
    for (const m of run.activeMotifs) { const s = document.createElement('span'); const img = new Image(); img.src = UNIT[m]; img.alt = ''; s.append(img, document.createTextNode(NAMES[m])); n.activeMotifs.append(s); }
    renderBoard(run); clearPathVisual(); n.cancelZone.classList.remove('armed', 'hot'); n.notice.hidden = true; updateHud();
    showPage('game'); ui.last = performance.now(); ui.raf = requestAnimationFrame(loop);
  }
  function loop(ts) {
    const run = ui.run; if (!run || run.phase !== 'PLAYING') { ui.raf = 0; return; }
    const dt = Math.min(250, ts - ui.last); ui.last = ts; // 隐藏 / 卡顿时不让时间跳跃（TEMP_DEV_DECISION）
    const r = E.tick(run, dt); updateHud();
    if (r.ended) { onEnded(); return; }
    if (run.timeLeftMs <= 0 && run.path.length === 0 && !run.resolving && run.phase === 'PLAYING') { /* unreachable: tick ends */ }
    if (run.timeoutDuringDrag && ui.drag) { endDragVisual(); }
    ui.raf = requestAnimationFrame(loop);
  }
  function stopLoop() { if (ui.raf) cancelAnimationFrame(ui.raf); ui.raf = 0; }
  function updateHud() {
    const run = ui.run; if (!run) return;
    const secs = Math.ceil(run.timeLeftMs / 1000); n.hudTime.textContent = secs; n.hudFill.style.width = (100 * run.timeLeftMs / run.timerMs).toFixed(1) + '%';
    n.hudBar.classList.toggle('low', run.timeLeftMs <= 10000); n.hudStrokes.textContent = run.strokesLeft; n.hudScore.textContent = run.score;
  }
  function tileStyle(el, index) { el.style.left = (GRID.cols[index % run().cols] * 100) + '%'; el.style.top = (GRID.rows[Math.floor(index / run().cols)] * 100) + '%'; }
  const run = () => ui.run;
  function makeTile(cell, index) {
    const el = document.createElement('div'); el.className = 'tile'; el.dataset.id = cell.id; el.dataset.motif = cell.motif; el.dataset.index = index;
    const inner = document.createElement('div'); inner.className = 'tile-inner'; inner.style.setProperty('--s', TILE_SCALE[cell.motif] || 1);
    const img = new Image(); img.src = UNIT[cell.motif]; img.alt = NAMES[cell.motif]; img.draggable = false; const ring = document.createElement('i'); ring.className = 'ring';
    inner.append(ring, img); el.append(inner); tileStyle(el, index); return el;
  }
  function renderBoard(r) { n.tiles.innerHTML = ''; n.tiles.classList.remove('shuffling'); ui.tiles.clear(); r.board.forEach((cell, i) => { if (!cell) return; const el = makeTile(cell, i); ui.tiles.set(cell.id, el); n.tiles.append(el); }); }
  function cellCenterViewport(i) { const rect = n.boardWrap.getBoundingClientRect(); return { x: rect.left + GRID.cols[i % 6] * rect.width, y: rect.top + GRID.rows[Math.floor(i / 6)] * rect.height }; }
  function hitCell(clientX, clientY) {
    const rect = n.boardWrap.getBoundingClientRect(); const px = (clientX - rect.left), py = (clientY - rect.top);
    const pitch = (GRID.cols[1] - GRID.cols[0]) * rect.width; let best = -1, bd = Infinity;
    for (let r = 0; r < 7; r++) for (let c = 0; c < 6; c++) { const dx = px - GRID.cols[c] * rect.width, dy = py - GRID.rows[r] * rect.height; const d = Math.hypot(dx, dy); if (d < bd) { bd = d; best = r * 6 + c; } }
    return bd <= pitch * 0.46 ? best : -1;
  }
  const inRect = (x, y, rect, m = 0) => x >= rect.left - m && x <= rect.right + m && y >= rect.top - m && y <= rect.bottom + m;
  function renderPath() {
    const r = ui.run; const pts = r.path.map(i => (GRID.cols[i % 6] * GRID.vb[0]).toFixed(1) + ',' + (GRID.rows[Math.floor(i / 6)] * GRID.vb[1]).toFixed(1));
    n.pathLine.setAttribute('points', pts.join(' ')); n.pathLayer.style.setProperty('--path', r.lockedMotif ? PATH_COLOR[r.lockedMotif] : PATH_COLOR.WILD);
    for (const el of ui.tiles.values()) el.classList.remove('sel', 'head');
    r.path.forEach((i, k) => { const cell = r.board[i]; const el = cell && ui.tiles.get(cell.id); if (el) { el.classList.add('sel'); if (k === r.path.length - 1) el.classList.add('head'); } });
    const pv = E.preview(r);
    if (pv.wildcard) { const i = r.path[r.path.length - 1]; n.badge.style.left = (GRID.cols[i % 6] * 100) + '%'; n.badge.style.top = (GRID.rows[Math.floor(i / 6)] * 100 - 4) + '%'; n.badge.hidden = false; } else n.badge.hidden = true;
  }
  function clearPathVisual() { n.pathLine.setAttribute('points', ''); n.pathLayer.classList.remove('pulse', 'bad'); n.badge.hidden = true; for (const el of ui.tiles.values()) el.classList.remove('sel', 'head'); }
  function endDragVisual() { ui.drag = null; n.cancelZone.classList.remove('armed', 'hot'); clearPathVisual(); }
  function onPointerDown(ev) {
    const r = ui.run; if (!r || r.phase !== 'PLAYING' || r.paused || r.resolving || ui.animating || ui.drag) return;
    const i = hitCell(ev.clientX, ev.clientY); if (i < 0) return;
    const res = E.pathStart(r, i); if (!res.ok) return;
    ui.drag = { id: ev.pointerId, inCancel: false }; try { n.boardWrap.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
    n.cancelZone.classList.add('armed'); renderPath(); ev.preventDefault();
  }
  function onPointerMove(ev) {
    const r = ui.run, d = ui.drag; if (!d || ev.pointerId !== d.id || !r || r.phase !== 'PLAYING') return;
    const inCancel = inRect(ev.clientX, ev.clientY, n.cancelZone.getBoundingClientRect()); if (inCancel !== d.inCancel) { d.inCancel = inCancel; n.cancelZone.classList.toggle('hot', inCancel); }
    if (inCancel) return;
    const i = hitCell(ev.clientX, ev.clientY); if (i < 0 || i === r.path[r.path.length - 1]) return;
    const res = E.pathExtend(r, i);
    if (res.action === 'added' || res.action === 'backtracked') { renderPath(); if (res.action === 'added' && res.preview.length === 5) { n.pathLayer.classList.remove('pulse'); void n.pathLayer.offsetWidth; n.pathLayer.classList.add('pulse'); } }
  }
  function onPointerUp(ev) {
    const r = ui.run, d = ui.drag; if (!d || ev.pointerId !== d.id) return;
    const zone = ev.type === 'pointercancel' ? 'outside' : d.inCancel ? 'cancel' : inRect(ev.clientX, ev.clientY, n.boardWrap.getBoundingClientRect(), 14) ? 'board' : 'outside';
    ui.drag = null; n.cancelZone.classList.remove('armed', 'hot');
    if (!r || r.phase !== 'PLAYING') { clearPathVisual(); return; }
    const res = E.pathRelease(r, { zone });
    if (res.result === 'committed') { clearPathVisual(); animateDiff(res.diff); }
    else if (res.result === 'invalid' && res.reason !== 'OUTSIDE_RELEASE' && r.path.length === 0) { n.pathLayer.classList.add('bad'); setTimeout(clearPathVisual, 140); }
    else clearPathVisual();
    updateHud();
  }
  function animateDiff(diff) {
    const r = ui.run, token = ++ui.animToken; ui.animating = true; updateHud();
    const pitchY = GRID.rows[1] - GRID.rows[0];
    for (const c of diff.removed) { const el = ui.tiles.get(c.id); if (el) el.classList.add('removing'); }
    setTimeout(() => {
      if (token !== ui.animToken) return;
      for (const c of diff.removed) { const el = ui.tiles.get(c.id); if (el) { el.remove(); ui.tiles.delete(c.id); } }
      if (diff.spawn) { const el = makeTile({ id: diff.spawn.id, motif: diff.spawn.motif }, diff.spawn.index); el.classList.add('spawn'); ui.tiles.set(diff.spawn.id, el); n.tiles.append(el); }
      for (const m of diff.moves) { const el = ui.tiles.get(m.id); if (el) { el.dataset.index = m.to; el.style.top = (GRID.rows[Math.floor(m.to / 6)] * 100) + '%'; } }
      for (const f of diff.refills) { const el = makeTile({ id: f.id, motif: f.motif }, f.index); el.style.top = ((GRID.rows[Math.floor(f.index / 6)] - pitchY * f.dropRows) * 100) + '%'; ui.tiles.set(f.id, el); n.tiles.append(el); }
      void n.tiles.offsetWidth; for (const f of diff.refills) { const el = ui.tiles.get(f.id); if (el) el.style.top = (GRID.rows[Math.floor(f.index / 6)] * 100) + '%'; }
      const settleMs = diff.moves.length || diff.refills.length ? 300 : 60;
      setTimeout(() => {
        if (token !== ui.animToken) return;
        if (diff.shuffled) {
          n.tiles.classList.add('shuffling'); n.notice.hidden = false;
          setTimeout(() => { if (token !== ui.animToken) return; renderBoard(r); setTimeout(() => { n.notice.hidden = true; }, 900); finishResolve(); }, 320);
        } else finishResolve();
      }, settleMs);
    }, 170);
  }
  function finishResolve() { ui.animating = false; const r = ui.run; if (!r) return; const res = E.resolveDone(r); updateHud(); if (res.ended) onEnded(); }
  function onEnded() { stopLoop(); const r = ui.run; if (!r || r.phase !== 'ENDED') return; endDragVisual(); setTimeout(() => { if (ui.run === r && r.phase === 'ENDED') showSettlement(r.result, r.mode); }, 420); }

  // ---------- SETTLEMENT ----------
  const ICONS = {
    score: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M8 12h8M12 8v8"/></svg>',
    chain: '<svg viewBox="0 0 24 24"><path d="M10 14a4 4 0 0 1 0-5.6l2-2a4 4 0 0 1 5.6 5.6l-1 1"/><path d="M14 10a4 4 0 0 1 0 5.6l-2 2a4 4 0 0 1-5.6-5.6l1-1"/></svg>',
    brush: '<svg viewBox="0 0 24 24"><path d="M4 20c2-1 3-3 3-5 3 0 4 1 4 3 0 2-3 3-7 2z"/><path d="M9 13l8-9 3 3-9 8z"/></svg>',
    star: '<svg viewBox="0 0 24 24"><path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/></svg>',
    coin: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><rect x="9.5" y="9.5" width="5" height="5"/></svg>'
  };
  function statRow(icon, label, value, muted) { const li = document.createElement('li'); li.innerHTML = '<span class="ic">' + ICONS[icon] + '</span><span class="lbl"></span><span class="val' + (muted ? ' muted' : '') + '"></span>'; li.querySelector('.lbl').textContent = label; li.querySelector('.val').textContent = value; return li; }
  function showSettlement(result, mode, { fixture = false } = {}) {
    const rep = result.secondaryMetrics.representativeMotif, pm = result.primaryMetrics;
    if (!fixture && !ui.recorded) { ui.recorded = true; if (mode === 'TRIAL') H.recordTrial(result); }
    n.fixtureTag.hidden = !fixture;
    n.motifName.textContent = rep ? NAMES[rep] : '尚无纹样';
    n.revealRow.classList.remove('unit', 'arrow', 'none'); n.revealFullImg.hidden = true; n.revealFullImg.removeAttribute('src'); n.revealUnitImg.removeAttribute('src');
    const old = n.revealRow.querySelector('.reveal-none'); if (old) old.remove();
    n.revealRow.querySelectorAll('.reveal-unit,.reveal-mid,.reveal-full').forEach(el => { el.hidden = !rep; });
    if (ui.reveal) { ui.reveal.cancel(); ui.reveal = null; }
    if (rep) {
      n.settleCopy.textContent = '你本轮最常连缀的纹样，已渐次成章。';
      n.revealUnitImg.src = UNIT[rep]; n.revealUnitImg.dataset.motif = rep; n.revealFullImg.dataset.motif = rep; n.revealFullImg.dataset.structure = STRUCTURE[rep];
      const ctx = n.revealCanvas.getContext('2d'); ctx && ctx.clearRect(0, 0, n.revealCanvas.width, n.revealCanvas.height);
      setTimeout(() => n.revealRow.classList.add('unit'), 80);                       // 1. 先显示最小单元
      setTimeout(() => n.revealRow.classList.add('arrow'), 520);                      // 2. 过程
      setTimeout(() => {                                                              // 3. 按 structureType 动态生成 → 4. 真实 fullAsset 稳定
        if (ui.page !== 'settle') return;
        ui.reveal = R.play(n.revealCanvas, { structureType: STRUCTURE[rep], unitSrc: UNIT[rep], fullSrc: FULL[rep], duration: 2400, onDone: () => { n.revealFullImg.src = FULL[rep]; n.revealFullImg.hidden = false; n.revealRow.classList.add('done'); } });
      }, 900);
    } else { // 零有效清除局（TEMP_DEV_DECISION：不虚构代表纹样）
      n.settleCopy.textContent = '本轮未连缀出纹样，未有图样可成章。'; n.revealRow.classList.add('none');
      const p = document.createElement('p'); p.className = 'reveal-none'; p.textContent = '（未产生有效落笔）'; n.revealRow.append(p);
    }
    n.stats.innerHTML = '';
    n.stats.append(statRow('score', '总得分', pm.score), statRow('chain', '最长连缀', pm.longestChain), statRow('brush', '有效落笔数', pm.validStrokes), statRow('star', '生成万能图样次数', pm.wildcardsGenerated));
    if (mode === 'TRIAL') n.stats.append(statRow('coin', '收益', '试玩模式 · 不获得实际收益', true));
    else n.stats.append(statRow('coin', '所得', '待结算', false)); // C3：score → cash mapping 未冻结，不得编造数字
    n.settleButtons.innerHTML = '';
    if (mode === 'TRIAL') {
      const again = button('再试一次', 'btn btn-teal small', () => startRun('TRIAL')); const quit = button('退出试玩', 'btn btn-secondary small', () => { if (ui.reveal) ui.reveal.cancel(); showReady(); });
      again.id = 'btn-again'; quit.id = 'btn-quit'; n.settleButtons.append(again, quit);
    } else {
      const fin = button('结束帮工', 'btn btn-teal', () => { // 提交正式结果 → 写记录（cash 待结算）→ advanceTime(1) → 返回城市
        if (fixture) { showReady(); return; }
        const rec = H.commitFormal(result); if (ui.reveal) ui.reveal.cancel(); closeModal(); showReady();
        toast('帮工记录已写入（模拟）· 世界时间 +1 → ' + H.timeLabel() + ' · 所得待结算'); renderDebug(); void rec;
      }); fin.id = 'btn-finish'; n.settleButtons.append(fin);
    }
    showPage('settle');
  }
  function button(label, cls, fn) { const b = document.createElement('button'); b.type = 'button'; b.className = cls; b.textContent = label; b.addEventListener('click', fn); return b; }

  // ---------- abort ----------
  function openAbortDialog() {
    const r = ui.run; if (!r || r.phase !== 'PLAYING') return; E.pause(r); endDragVisual();
    n.dialogText.textContent = r.mode === 'TRIAL' ? '中止本次试玩？本局不会保留任何结果。' : '中止本次帮工？本局不计收益，不推进时间，不写入记录。';
    n.dialogCancel.textContent = r.mode === 'TRIAL' ? '继续试玩' : '继续帮工'; n.dialog.hidden = false;
  }
  function dialogCancel() { n.dialog.hidden = true; const r = ui.run; if (r && r.phase === 'PLAYING') { ui.last = performance.now(); E.resume(r); } }
  function dialogOk() {
    n.dialog.hidden = true; const r = ui.run; if (!r) return; const res = E.abort(r); H.recordAbort(res); stopLoop(); ui.animToken++; ui.animating = false; endDragVisual();
    closeModal(); showReady(); toast(r.mode === 'TRIAL' ? '已退出试玩' : '已中止：不计收益，不推进时间，不写入记录'); renderDebug();
  }

  // ---------- debug (mock host) ----------
  function renderDebug() {
    const s = H.state; const d = n.debug; d.innerHTML = '';
    const info = document.createElement('span'); info.innerHTML = '<b>' + H.kind + '</b> · 世界时间 <b>' + H.timeLabel() + '</b>（tick ' + s.tick + '）· 现金 <b>' + s.cash + ' 钱</b>（不变）· 正式记录 <b>' + s.records.length + '</b> 条 · 试玩 ' + s.trials + ' 次 · 中止 ' + s.aborted + ' 次';
    d.append(info);
    for (let i = 0; i < 3; i++) d.append(button('设为' + H.phases[i], '', () => { H.setPhase(i); renderDebug(); cityHud(); if (ui.page === 'ready') showReady(); }));
    d.append(button('推进 1 tick', '', () => { H.advanceTime(1); renderDebug(); cityHud(); if (ui.page === 'ready') showReady(); }));
    d.append(button('重置模拟', '', () => { H.reset(); renderDebug(); cityHud(); if (ui.page === 'ready') showReady(); }));
    const pre = document.createElement('pre'); pre.textContent = s.lastResult ? JSON.stringify({ lastRecord: s.lastRecord && { tickBefore: s.lastRecord.tickBefore, tickAfter: s.lastRecord.tickAfter, cash: s.lastRecord.cash, cashNote: s.lastRecord.cashNote }, lastResult: Object.assign({}, s.lastResult, { strokes: '(' + s.lastResult.strokes.length + ' strokes)' , policies: undefined }) }, null, 1) : '（尚无对局结果）'; d.append(pre);
  }

  // ---------- fixture (调试入口：六种 reveal 逐一检查；非正式随机池) ----------
  function settleFixture(motif, mode = 'TRIAL') {
    if (!E.MOTIFS.includes(motif)) throw new Error('unknown motif ' + motif);
    stopLoop(); const run = E.createRun({ mode, seed: 1 }); run.stats[motif].clearedCount = 9; run.stats[motif].maxChainLength = 5; run.stats[motif].scoreContribution = 16; run.score = 16; run.validStrokes = 3; run.longestChain = 5; E.tick(run, 60000);
    ui.run = run; ui.fixture = true; showSettlement(run.result, mode, { fixture: true }); return run.result;
  }

  function init() {
    Object.assign(n, { modal: $('modal'), entry: $('entry'), toast: $('toast'), cityTime: $('city-time'), cityCash: $('city-cash'), timeHint: $('time-hint'), timeHintText: $('time-hint-text'), btnFormal: $('btn-formal'), btnTrial: $('btn-trial'), btnHowto: $('btn-howto'), legend: $('howto-legend'),
      hudTime: $('hud-time'), hudFill: $('hud-fill'), hudBar: $('hud-bar'), hudStrokes: $('hud-strokes'), hudScore: $('hud-score'), hudMode: $('hud-mode'), boardWrap: $('board-wrap'), tiles: $('tiles'), pathLayer: $('path-layer'), pathLine: $('path-line'), badge: $('preview-badge'), notice: $('board-notice'), cancelZone: $('cancel-zone'), activeMotifs: $('active-motifs'),
      motifName: $('settle-motif-name'), revealRow: $('reveal-row'), revealUnitImg: $('reveal-unit-img'), revealCanvas: $('reveal-canvas'), revealFullImg: $('reveal-full-img'), settleCopy: $('settle-copy'), stats: $('settle-stats'), settleButtons: $('settle-buttons'), fixtureTag: $('fixture-tag'),
      dialog: $('dialog'), dialogText: $('dialog-text'), dialogCancel: $('dialog-cancel'), dialogOk: $('dialog-ok'), debug: $('debug'), debugToggle: $('debug-toggle') });
    fit(); root.addEventListener('resize', fit); buildLegend();
    const q = new URLSearchParams(location.search);
    if (q.has('seed')) ui.seedBase = Number(q.get('seed')) >>> 0;
    if (q.has('phase')) H.setPhase(Number(q.get('phase')));
    $('ready-close').addEventListener('click', () => closeModal());
    $('btn-entry').addEventListener('click', () => { openModal(); showReady(); });
    n.btnFormal.addEventListener('click', () => { if (H.canStartFormal()) startRun('FORMAL'); else toast('当前：暮 · 今日不可帮工'); });
    n.btnTrial.addEventListener('click', () => startRun('TRIAL'));
    n.btnHowto.addEventListener('click', () => showPage('howto'));
    $('howto-close').addEventListener('click', showReady); $('btn-howto-back').addEventListener('click', showReady);
    $('game-close').addEventListener('click', openAbortDialog); n.dialogCancel.addEventListener('click', dialogCancel); n.dialogOk.addEventListener('click', dialogOk);
    n.boardWrap.addEventListener('pointerdown', onPointerDown); n.boardWrap.addEventListener('pointermove', onPointerMove); n.boardWrap.addEventListener('pointerup', onPointerUp); n.boardWrap.addEventListener('pointercancel', onPointerUp);
    n.boardWrap.addEventListener('contextmenu', e => e.preventDefault());
    document.addEventListener('visibilitychange', () => { const r = ui.run; if (!r || r.phase !== 'PLAYING') return; if (document.hidden) { E.pause(r); endDragVisual(); } else if (n.dialog.hidden) { ui.last = performance.now(); E.resume(r); } });
    n.debugToggle.addEventListener('click', () => { n.debug.hidden = !n.debug.hidden; if (!n.debug.hidden) renderDebug(); });
    cityHud(); renderDebug();
    if (q.has('reveal')) { openModal(); settleFixture(q.get('reveal'), q.get('mode') === 'FORMAL' ? 'FORMAL' : 'TRIAL'); } else { openModal(); showReady(); }
  }
  root.PatternChain = { version: VERSION, engine: E, host: H, reveal: R, NAMES, UNIT, FULL, STRUCTURE, TILE_SCALE, GRID,
    ui: { get state() { return ui; }, get run() { return ui.run; }, get page() { return ui.page; }, cellCenter: cellCenterViewport, boardRect: () => n.boardWrap.getBoundingClientRect(), cancelRect: () => n.cancelZone.getBoundingClientRect(), start: startRun, showReady, settleFixture, closeModal, openModal } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(window);
