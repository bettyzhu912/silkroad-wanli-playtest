(function (S) {
  'use strict';
  // 敦煌《缀纹成章》 — host panel UI. This is the standalone v0.1 client (pattern-chain/pattern-chain-ui.js + index.html) re-hosted inside
  // the main game: the same 360×620 modal with the same four pages (READY / HOW_TO_PLAY / GAMEPLAY / SETTLEMENT), the same drag-to-chain
  // input, animations and the structure-specific cultural reveal (pattern-chain-reveal.js, verbatim). Differences are host-contract only:
  // the modal sits in the primary panel layer, art comes from S.assets, the READY time hint reads the real world time, abort confirmation
  // uses the host modal, and a FORMAL run reports to pattern-chain.js (PATTERN_START / FINISH / SETTLE / ABORT) which pays through the
  // real wallet and world clock; the settlement's 所得 row shows the settled wage instead of the standalone's 待结算 placeholder.
  const E = () => S.patternChain.engine();
  const NAMES = { LOTUS: '八瓣莲花', DRAGON: '双龙莲花', THREE_HARES: '三兔共耳', POMEGRANATE_SCROLL: '石榴卷草', PEARL_CHAIN: '连珠纹', DIAMOND_PATTERN: '菱形连续纹', BAOXIANGHUA_WILDCARD: '万能图样' };
  const UNIT_KEY = { LOTUS: 'DPC_01_LOTUS_PETAL_C217_v01', DRAGON: 'DPC_02_DRAGON_C392_v01', THREE_HARES: 'DPC_03_THREE_HARES_RABBIT_C407_v01', POMEGRANATE_SCROLL: 'DPC_04_POMEGRANATE_SCROLL_C148_v01', PEARL_CHAIN: 'DPC_05_PEARL_CHAIN_C334_v01', DIAMOND_PATTERN: 'DPC_06_DIAMOND_PATTERN_C079_v01', BAOXIANGHUA_WILDCARD: 'DPC_07_BAOXIANGHUA_WILDCARD_v01' };
  const FULL_KEY = { LOTUS: 'DPC_FULL_01_LOTUS_ROSETTE_C217_v01', DRAGON: 'DPC_FULL_02_DOUBLE_DRAGON_C392_v01', THREE_HARES: 'DPC_FULL_03_THREE_HARES_ROUNDEL_C407_v01', POMEGRANATE_SCROLL: 'DPC_FULL_04_POMEGRANATE_SCROLL_BAND_C148_v01', PEARL_CHAIN: 'DPC_FULL_05_PEARL_CHAIN_BAND_C334_v01', DIAMOND_PATTERN: 'DPC_FULL_06_DIAMOND_REPEAT_C079_v01' };
  const STRUCTURE = { LOTUS: 'RADIAL_ROSETTE', DRAGON: 'BILATERAL_SYMMETRY', THREE_HARES: 'ROTATIONAL_SHARED_EAR_ROUNDEL', POMEGRANATE_SCROLL: 'S_SCROLL_CONTINUOUS_BAND', PEARL_CHAIN: 'SQUARE_BORDER_CONTINUOUS', DIAMOND_PATTERN: 'TESSELLATED_REPEAT' };
  const TILE_SCALE = { LOTUS: 1.0, DRAGON: 0.92, THREE_HARES: 0.86, POMEGRANATE_SCROLL: 0.86, PEARL_CHAIN: 1.18, DIAMOND_PATTERN: 1.02, BAOXIANGHUA_WILDCARD: 0.84 };
  const PATH_COLOR = { LOTUS: '#b0553a', DRAGON: '#2f6f6a', THREE_HARES: '#3b3a3a', POMEGRANATE_SCROLL: '#5f9a6d', PEARL_CHAIN: '#2e5a9c', DIAMOND_PATTERN: '#5a4634', WILD: '#b58a3c' };
  const GRID = { cols: [0.1316, 0.2775, 0.4252, 0.5725, 0.7206, 0.8665], rows: [0.1458, 0.2618, 0.3771, 0.4939, 0.6099, 0.7267, 0.8427], vb: [1056, 1310] };
  const ICONS = {
    score: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M8 12h8M12 8v8"/></svg>', chain: '<svg viewBox="0 0 24 24"><path d="M10 14a4 4 0 0 1 0-5.6l2-2a4 4 0 0 1 5.6 5.6l-1 1"/><path d="M14 10a4 4 0 0 1 0 5.6l-2 2a4 4 0 0 1-5.6-5.6l1-1"/></svg>',
    brush: '<svg viewBox="0 0 24 24"><path d="M4 20c2-1 3-3 3-5 3 0 4 1 4 3 0 2-3 3-7 2z"/><path d="M9 13l8-9 3 3-9 8z"/></svg>', star: '<svg viewBox="0 0 24 24"><path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/></svg>', coin: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><rect x="9.5" y="9.5" width="5" height="5"/></svg>'
  };
  function asset(name) { const f = S.assets && S.assets[name]; if (!f) throw new Error('CURRENT asset mapping missing: ' + name); return f; }
  const UNIT = m => asset(UNIT_KEY[m]), FULL = m => asset(FULL_KEY[m]);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const COPY = () => S.patternChain.COPY;
  const ui = { page: null, run: null, kind: null, sessionId: null, tiles: new Map(), raf: 0, last: 0, drag: null, animating: false, animToken: 0, reveal: null, finishPending: false, busy: false, error: '', toastTimer: 0, hostKey: '' };
  let hostCtx = null; const dom = { shell: null }; const n = {};
  const progress = () => (hostCtx && hostCtx.p) || (S.app && S.app.state && S.app.state.progress) || null;
  const view = () => { const p = progress(); return p ? S.patternChain.view(p) : null; };
  const run = () => ui.run;
  function template() {
    const bg = asset('DPC_READY_BG_v01'), board = asset('DPC_BOARD_BG_SILK_v01'), wild = asset('DPC_07_BAOXIANGHUA_WILDCARD_v01');
    return `<div class="modal" data-ref="modal" role="dialog" aria-label="缀纹成章">
<section class="page page-ready" data-page="ready"><img class="page-bg" src="${bg}" alt="" draggable="false"><button class="close" data-op="close" type="button" aria-label="关闭">×</button>
<div class="ready-body"><h1 class="title">缀纹成章</h1><div class="title-ornament" aria-hidden="true"><i></i><b></b><i></i></div><p class="subtitle">连缀纹样，观其成章。</p>
<p class="intro">在限定时间与笔数内，拖动连起相同纹样。<br>连得越长，得分越高；长链还能生成万能图样。<br>一局结束后，你本轮连缀最多的纹样将逐步展开为完整敦煌图样。</p>
<div class="time-hint" data-ref="timeHint"><span class="sun" aria-hidden="true"></span><span data-ref="timeHintText">当前：晨 · 可开始帮工</span></div>
<button class="btn btn-primary" data-op="formal" type="button">开始帮工</button><button class="btn btn-secondary" data-op="trial" type="button">试玩</button>
<p class="trial-note">完整体验玩法与结算，不消耗时间，也不获得实际收益。</p><button class="btn btn-text" data-op="howto" type="button">玩法说明 <span class="chev">›</span></button><p class="inline-error" data-ref="readyError" hidden></p></div></section>
<section class="page page-howto" data-page="howto" hidden><img class="page-bg" src="${bg}" alt="" draggable="false"><button class="close" data-op="ready" type="button" aria-label="返回">×</button>
<div class="howto-body"><h2 class="title2">玩法说明</h2><ol class="howto-list"><li>拖动连接相邻的相同纹样，3 个及以上即可完成一笔。</li><li>可沿八个方向连接，也可以在拖动过程中逐格回退。</li><li>万能图样可代替任意普通纹样；一笔连到 8 个及以上时，会生成 1 个万能图样。</li><li>在有限时间与有效笔数内规划更长的路径，获得更高分。</li><li>结算时，你本轮连缀最多的纹样会从单一图样逐步组合成完整纹样。</li></ol>
<div class="legend" data-ref="legend"></div><button class="btn btn-secondary" data-op="ready" type="button">返回</button></div></section>
<section class="page page-game" data-page="game" hidden><div class="game-hud"><div class="hud-item"><span class="hud-label">余时</span><b data-ref="hudTime">60</b><span class="hud-unit">秒</span></div><div class="hud-bar" data-ref="hudBar"><i data-ref="hudFill"></i></div><div class="hud-item"><span class="hud-label">余笔</span><b data-ref="hudStrokes">10</b></div><div class="hud-item"><span class="hud-label">得分</span><b data-ref="hudScore">0</b></div><span class="hud-mode" data-ref="hudMode">试玩</span><button class="close close-game" data-op="abort" type="button" aria-label="中止">×</button></div>
<div class="board-wrap" data-ref="boardWrap"><div class="board-bg-clip"><img class="board-bg" src="${board}" alt="" draggable="false"></div><div class="tiles" data-ref="tiles"></div><svg class="path-layer" data-ref="pathLayer" viewBox="0 0 1056 1310" preserveAspectRatio="none" aria-hidden="true"><polyline data-ref="pathLine" points=""></polyline></svg>
<div class="preview-badge" data-ref="badge" hidden><img src="${wild}" alt=""><span>将生成万能图样</span></div><div class="board-notice" data-ref="notice" hidden>无可连之路 · 已重排</div></div>
<div class="cancel-zone" data-ref="cancelZone">拖到这里取消本笔</div><div class="active-motifs" data-ref="activeMotifs"></div></section>
<section class="page page-settle" data-page="settle" hidden><img class="page-bg" src="${bg}" alt="" draggable="false"><div class="settle-body"><h2 class="title settle-title">帮工完成</h2><p class="settle-sub">本轮连缀最多的纹样</p>
<div class="motif-plaque"><span class="plaque-orn" aria-hidden="true"></span><span data-ref="motifName">—</span><span class="plaque-orn r" aria-hidden="true"></span></div>
<div class="reveal-row" data-ref="revealRow"><div class="reveal-unit"><img data-ref="revealUnitImg" alt="最小单元" draggable="false"></div><div class="reveal-mid"><svg class="reveal-arrow" viewBox="0 0 60 24" aria-hidden="true"><path class="arrow-line" d="M3 12 C 18 3, 36 21, 55 12"/><path class="arrow-head" d="M48 6 L56 12 L48 18"/></svg></div><div class="reveal-full"><canvas data-ref="revealCanvas" aria-hidden="true"></canvas><img data-ref="revealFullImg" alt="完整图样" draggable="false" hidden></div></div>
<p class="settle-copy" data-ref="settleCopy">你本轮最常连缀的纹样，已渐次成章。</p><div class="divider" aria-hidden="true"><i></i><span class="flower"></span><i></i></div><ul class="stats" data-ref="stats"></ul><div class="settle-buttons" data-ref="settleButtons"></div><p class="inline-error" data-ref="settleError" hidden></p></div></section>
<section class="page page-stale" data-page="stale" hidden><img class="page-bg" src="${bg}" alt="" draggable="false"><div class="stale-body"><h2 class="title2">缀纹成章</h2><p data-ref="staleText"></p><button class="btn btn-secondary" data-op="abort-stale" type="button">离开纹坊</button></div></section>
</div><div class="toast" data-ref="toast" hidden></div>`;
  }
  function ensureShell() {
    if (dom.shell) return;
    dom.shell = document.createElement('div'); dom.shell.className = 'pc-shell'; dom.shell.setAttribute('aria-label', '缀纹成章'); dom.shell.innerHTML = template();
    for (const el of dom.shell.querySelectorAll('[data-ref]')) n[el.dataset.ref] = el;
    buildLegend();
    dom.shell.addEventListener('click', onClick);
    n.boardWrap.addEventListener('pointerdown', onPointerDown); n.boardWrap.addEventListener('pointermove', onPointerMove); n.boardWrap.addEventListener('pointerup', onPointerUp); n.boardWrap.addEventListener('pointercancel', onPointerUp);
    n.boardWrap.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('resize', () => { if (dom.shell && dom.shell.isConnected) fit(); });
    document.addEventListener('visibilitychange', () => { const r = ui.run; if (!r || r.phase !== 'PLAYING' || !dom.shell.isConnected) return; if (document.hidden) { E().pause(r); endDragVisual(); } else if (!(S.ui.getState().blockingModalCount)) { ui.last = performance.now(); E().resume(r); } });
  }
  // the 360×620 modal is fitted to the panel body (the standalone fitted it to the viewport)
  function fit() {
    if (!dom.shell || !dom.shell.isConnected) return; const W = dom.shell.clientWidth, H = dom.shell.clientHeight; if (!W || !H) return;
    let mw = Math.min(360, W - 16); if (mw * 620 / 360 > H - 8) mw = (H - 8) * 360 / 620;
    dom.shell.style.setProperty('--mw', Math.max(240, Math.round(mw * 100) / 100) + 'px');
  }
  function showPage(name) { for (const p of n.modal.querySelectorAll('.page')) p.hidden = p.dataset.page !== name; ui.page = name; }
  function toast(text, ms = 2600) { n.toast.textContent = text; n.toast.hidden = false; clearTimeout(ui.toastTimer); ui.toastTimer = setTimeout(() => { n.toast.hidden = true; }, ms); }
  function buildLegend() { n.legend.innerHTML = ''; for (const m of E().MOTIFS.concat([E().WILDCARD])) { const d = document.createElement('div'); const img = new Image(); img.src = UNIT(m); img.alt = NAMES[m]; d.append(img, document.createTextNode(NAMES[m])); n.legend.append(d); } }
  // ---------- READY ----------
  function showReady() {
    const p = progress(); if (!p) return; const av = S.patternChain.availability(p);
    const ok = av.canStartFormal && !ui.busy;
    n.timeHintText.textContent = '当前：' + av.phaseName + (av.canStartFormal ? ' · 可开始帮工' : av.inDunhuang && !av.enoughTime ? ' · 今日不可帮工' : ' · ' + (av.reason || '暂不可帮工'));
    n.timeHint.classList.toggle('na', !av.canStartFormal);
    const f = dom.shell.querySelector('[data-op="formal"]'), t = dom.shell.querySelector('[data-op="trial"]');
    f.disabled = !ok; f.title = av.canStartFormal ? '' : (av.reason || ''); t.disabled = !av.canTrial || ui.busy;
    n.readyError.textContent = ui.error; n.readyError.hidden = !ui.error;
    showPage('ready');
  }
  // ---------- GAMEPLAY ----------
  function beginRun(r, kind, sessionId) {
    stopLoop(); if (ui.reveal) { ui.reveal.cancel(); ui.reveal = null; }
    ui.run = r; ui.kind = kind; ui.sessionId = sessionId; ui.animating = false; ui.drag = null; ui.finishPending = false; ui.error = ''; ui.endedRun = null;
    n.hudMode.textContent = kind === 'trial' ? '试玩' : '正式 · ' + COPY().duration + '工';
    n.activeMotifs.innerHTML = '';
    for (const m of r.activeMotifs) { const s = document.createElement('span'); const img = new Image(); img.src = UNIT(m); img.alt = ''; s.append(img, document.createTextNode(NAMES[m])); n.activeMotifs.append(s); }
    renderBoard(r); clearPathVisual(); n.cancelZone.classList.remove('armed', 'hot'); n.notice.hidden = true; updateHud();
    showPage('game'); ui.last = performance.now(); ui.raf = requestAnimationFrame(loop);
  }
  function startTrial() { if (ui.busy) return; const seed = ((Date.now() & 0x7fffffff) ^ Math.floor(Math.random() * 1e9)) >>> 0; beginRun(E().createRun({ mode: 'TRIAL', seed, now: performance.now() }), 'trial', null); }
  async function startFormal() {
    if (ui.busy || !hostCtx) return;
    ui.busy = true; ui.error = ''; showReady();
    const out = await hostCtx.dispatch('PATTERN_START', { mode: 'FORMAL' });
    ui.busy = false;
    const v = view();
    if (out === null || !v || v.phase !== 'PLAYING') { ui.error = out === null ? '' : '开工登记未完成'; showReady(); return; }
    beginRun(E().createRun({ mode: 'FORMAL', seed: v.seed, now: performance.now(), jobId: v.sessionId }), 'formal', v.sessionId);
  }
  function loop(ts) {
    const r = ui.run; if (!r) { ui.raf = 0; return; }
    if (r.phase !== 'PLAYING') { ui.raf = 0; if (r.phase === 'ENDED') onEnded(); return; }   // the run may also end outside the loop (engine driven by a test / a resolve callback)
    const dt = Math.min(250, ts - ui.last); ui.last = ts;
    const res = E().tick(r, dt); updateHud();
    if (res.ended) { onEnded(); return; }
    if (r.timeoutDuringDrag && ui.drag) endDragVisual();
    ui.raf = requestAnimationFrame(loop);
  }
  function stopLoop() { if (ui.raf) cancelAnimationFrame(ui.raf); ui.raf = 0; }
  function updateHud() {
    const r = ui.run; if (!r) return;
    n.hudTime.textContent = Math.ceil(r.timeLeftMs / 1000); n.hudFill.style.width = (100 * r.timeLeftMs / r.timerMs).toFixed(1) + '%';
    n.hudBar.classList.toggle('low', r.timeLeftMs <= 10000); n.hudStrokes.textContent = r.strokesLeft; n.hudScore.textContent = r.score;
  }
  function tileStyle(el, index) { el.style.left = (GRID.cols[index % run().cols] * 100) + '%'; el.style.top = (GRID.rows[Math.floor(index / run().cols)] * 100) + '%'; }
  function makeTile(cell, index) {
    const el = document.createElement('div'); el.className = 'tile'; el.dataset.id = cell.id; el.dataset.motif = cell.motif; el.dataset.index = index;
    const inner = document.createElement('div'); inner.className = 'tile-inner'; inner.style.setProperty('--s', TILE_SCALE[cell.motif] || 1);
    const img = new Image(); img.src = UNIT(cell.motif); img.alt = NAMES[cell.motif]; img.draggable = false; const ring = document.createElement('i'); ring.className = 'ring';
    inner.append(ring, img); el.append(inner); tileStyle(el, index); return el;
  }
  function renderBoard(r) { n.tiles.innerHTML = ''; n.tiles.classList.remove('shuffling'); ui.tiles.clear(); r.board.forEach((cell, i) => { if (!cell) return; const el = makeTile(cell, i); ui.tiles.set(cell.id, el); n.tiles.append(el); }); }
  function cellCenterViewport(i) { const rect = n.boardWrap.getBoundingClientRect(); return { x: rect.left + GRID.cols[i % 6] * rect.width, y: rect.top + GRID.rows[Math.floor(i / 6)] * rect.height }; }
  function hitCell(clientX, clientY) {
    const rect = n.boardWrap.getBoundingClientRect(); const px = clientX - rect.left, py = clientY - rect.top;
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
    const pv = E().preview(r);
    if (pv.wildcard) { const i = r.path[r.path.length - 1]; n.badge.style.left = (GRID.cols[i % 6] * 100) + '%'; n.badge.style.top = (GRID.rows[Math.floor(i / 6)] * 100 - 4) + '%'; n.badge.hidden = false; } else n.badge.hidden = true;
  }
  function clearPathVisual() { n.pathLine.setAttribute('points', ''); n.pathLayer.classList.remove('pulse', 'bad'); n.badge.hidden = true; for (const el of ui.tiles.values()) el.classList.remove('sel', 'head'); }
  function endDragVisual() { ui.drag = null; n.cancelZone.classList.remove('armed', 'hot'); clearPathVisual(); }
  function onPointerDown(ev) {
    const r = ui.run; if (!r || r.phase !== 'PLAYING' || r.paused || r.resolving || ui.animating || ui.drag) return;
    const i = hitCell(ev.clientX, ev.clientY); if (i < 0) return;
    const res = E().pathStart(r, i); if (!res.ok) return;
    ui.drag = { id: ev.pointerId, inCancel: false }; try { n.boardWrap.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
    n.cancelZone.classList.add('armed'); renderPath(); ev.preventDefault();
  }
  function onPointerMove(ev) {
    const r = ui.run, d = ui.drag; if (!d || ev.pointerId !== d.id || !r || r.phase !== 'PLAYING') return;
    const inCancel = inRect(ev.clientX, ev.clientY, n.cancelZone.getBoundingClientRect()); if (inCancel !== d.inCancel) { d.inCancel = inCancel; n.cancelZone.classList.toggle('hot', inCancel); }
    if (inCancel) return;
    const i = hitCell(ev.clientX, ev.clientY); if (i < 0 || i === r.path[r.path.length - 1]) return;
    const res = E().pathExtend(r, i);
    if (res.action === 'added' || res.action === 'backtracked') { renderPath(); if (res.action === 'added' && res.preview.length === 5) { n.pathLayer.classList.remove('pulse'); void n.pathLayer.offsetWidth; n.pathLayer.classList.add('pulse'); } }
  }
  function onPointerUp(ev) {
    const r = ui.run, d = ui.drag; if (!d || ev.pointerId !== d.id) return;
    const zone = ev.type === 'pointercancel' ? 'outside' : d.inCancel ? 'cancel' : inRect(ev.clientX, ev.clientY, n.boardWrap.getBoundingClientRect(), 14) ? 'board' : 'outside';
    ui.drag = null; n.cancelZone.classList.remove('armed', 'hot');
    if (!r || r.phase !== 'PLAYING') { clearPathVisual(); return; }
    const res = E().pathRelease(r, { zone });
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
        if (diff.shuffled) { n.tiles.classList.add('shuffling'); n.notice.hidden = false; setTimeout(() => { if (token !== ui.animToken) return; renderBoard(r); setTimeout(() => { n.notice.hidden = true; }, 900); finishResolve(); }, 320); }
        else finishResolve();
      }, settleMs);
    }, 170);
  }
  function finishResolve() { ui.animating = false; const r = ui.run; if (!r) return; const res = E().resolveDone(r); updateHud(); if (res.ended) onEnded(); }
  function onEnded() {
    stopLoop(); const r = ui.run; if (!r || r.phase !== 'ENDED' || ui.endedRun === r) return; ui.endedRun = r; endDragVisual();
    setTimeout(() => { if (ui.run !== r || r.phase !== 'ENDED') return; if (ui.kind === 'formal') void submitFinish(); else showSettlement(metrics(r.result), 'trial'); }, 420);
  }
  const metrics = res => ({ score: res.primaryMetrics.score, longestChain: res.primaryMetrics.longestChain, validStrokes: res.primaryMetrics.validStrokes, wildcardsGenerated: res.primaryMetrics.wildcardsGenerated, representativeMotif: res.secondaryMetrics.representativeMotif });
  async function submitFinish() {
    const r = ui.run; if (!r || ui.kind !== 'formal' || !hostCtx || !r.result || ui.finishPending) return;
    ui.finishPending = true; ui.error = ''; showSettlement(metrics(r.result), 'formal', { pending: true });
    const m = metrics(r.result);
    const out = await hostCtx.dispatch('PATTERN_FINISH', { sessionId: ui.sessionId, outcome: { endedBy: r.endedBy, score: m.score, validStrokes: m.validStrokes, longestChain: m.longestChain, wildcardsGenerated: m.wildcardsGenerated, representativeMotif: m.representativeMotif, elapsedMs: Math.max(0, Math.min(r.timerMs + 5000, Math.round(r.elapsedMs))) } }, 'pattern-finish-' + ui.sessionId);
    ui.finishPending = false;
    if (out === null) { ui.error = COPY().finishError; showSettlement(m, 'formal', { pending: false, retry: true }); return; }
    ui.hostKey = ''; render();
  }
  // ---------- SETTLEMENT ----------
  function statRow(icon, label, value, muted) { const li = document.createElement('li'); li.innerHTML = '<span class="ic">' + ICONS[icon] + '</span><span class="lbl"></span><span class="val' + (muted ? ' muted' : '') + '"></span>'; li.querySelector('.lbl').textContent = label; li.querySelector('.val').textContent = value; return li; }
  function button(label, cls, fn, opts = {}) { const b = document.createElement('button'); b.type = 'button'; b.className = cls; b.textContent = label; if (opts.op) b.dataset.op = opts.op; b.disabled = Boolean(opts.disabled); if (fn) b.addEventListener('click', fn); return b; }
  // data = metrics; mode 'trial' | 'formal'; formal options: pending (记账中), retry (finish failed), host (settled result: totalWage / baseWage / extraWage)
  function showSettlement(data, mode, opt = {}) {
    const rep = data.representativeMotif;
    n.motifName.textContent = rep ? NAMES[rep] : '尚无纹样';
    const rebuild = ui.page !== 'settle' || n.revealFullImg.dataset.motif !== (rep || '');
    if (rebuild) {
      n.revealRow.classList.remove('unit', 'arrow', 'none', 'done'); n.revealFullImg.hidden = true; n.revealFullImg.removeAttribute('src'); n.revealUnitImg.removeAttribute('src');
      const old = n.revealRow.querySelector('.reveal-none'); if (old) old.remove();
      n.revealRow.querySelectorAll('.reveal-unit,.reveal-mid,.reveal-full').forEach(el => { el.hidden = !rep; });
      if (ui.reveal) { ui.reveal.cancel(); ui.reveal = null; }
      n.revealFullImg.dataset.motif = rep || '';
      if (rep) {
        n.settleCopy.textContent = '你本轮最常连缀的纹样，已渐次成章。';
        n.revealUnitImg.src = UNIT(rep); n.revealUnitImg.dataset.motif = rep; n.revealFullImg.dataset.structure = STRUCTURE[rep];
        const ctx = n.revealCanvas.getContext('2d'); if (ctx) ctx.clearRect(0, 0, n.revealCanvas.width, n.revealCanvas.height);
        setTimeout(() => n.revealRow.classList.add('unit'), 80);
        setTimeout(() => n.revealRow.classList.add('arrow'), 520);
        setTimeout(() => {
          if (ui.page !== 'settle' || n.revealFullImg.dataset.motif !== rep) return;
          const R = typeof PatternChainReveal !== 'undefined' ? PatternChainReveal : null;
          const done = () => { n.revealFullImg.src = FULL(rep); n.revealFullImg.hidden = false; n.revealRow.classList.add('done'); };
          if (R) ui.reveal = R.play(n.revealCanvas, { structureType: STRUCTURE[rep], unitSrc: UNIT(rep), fullSrc: FULL(rep), duration: 2400, onDone: done }); else done();
        }, 900);
      } else { n.settleCopy.textContent = '本轮未连缀出纹样，未有图样可成章。'; n.revealRow.classList.add('none'); const p = document.createElement('p'); p.className = 'reveal-none'; p.textContent = '（未产生有效落笔）'; n.revealRow.append(p); }
    }
    n.stats.innerHTML = '';
    n.stats.append(statRow('score', '总得分', data.score), statRow('chain', '最长连缀', data.longestChain), statRow('brush', '有效落笔数', data.validStrokes), statRow('star', '生成万能图样次数', data.wildcardsGenerated));
    if (mode === 'trial') n.stats.append(statRow('coin', '收益', '试玩模式 · 不获得实际收益', true));
    else if (opt.host) n.stats.append(statRow('coin', '所得工钱', opt.host.totalWage + ' 钱' + (opt.host.totalWage ? '（基础 ' + opt.host.baseWage + ' + 额外 ' + opt.host.extraWage + '）' : '（未有效落笔）'), false));
    else n.stats.append(statRow('coin', '所得工钱', opt.pending ? '正在记账…' : '待记账', true));
    n.settleButtons.innerHTML = '';
    if (mode === 'trial') n.settleButtons.append(button('再试一次', 'btn btn-teal small', null, { op: 'trial-again' }), button('退出试玩', 'btn btn-secondary small', null, { op: 'trial-quit' }));
    else if (opt.retry) n.settleButtons.append(button(COPY().retryFinish, 'btn btn-teal', null, { op: 'retry-finish' }));
    else n.settleButtons.append(button(COPY().finishWork, 'btn btn-teal', null, { op: 'settle', disabled: !opt.host || ui.busy }));
    n.settleError.textContent = ui.error; n.settleError.hidden = !ui.error;
    showPage('settle');
  }
  function showHostSettlement(v) {
    const r = v.result; const key = 'host:' + v.settlementId + ':' + ui.error + ':' + ui.busy;
    if (key === ui.hostKey && ui.page === 'settle') return; ui.hostKey = key;
    showSettlement({ score: r.score, longestChain: r.longestChain, validStrokes: r.validStrokes, wildcardsGenerated: r.wildcardsGenerated, representativeMotif: r.representativeMotif }, 'formal', { host: r });
  }
  async function settle() {
    if (!hostCtx || ui.busy) return; const v = view(); if (!v || !v.result || v.settled) return;
    ui.busy = true; ui.error = ''; ui.hostKey = ''; showHostSettlement(v);
    const out = await hostCtx.dispatch('PATTERN_SETTLE', { sessionId: v.sessionId, settlementId: v.settlementId }, 'pattern-settle-' + v.settlementId);
    ui.busy = false;
    if (out === null) { ui.hostKey = ''; render(); return; }
    disposeRun(); leaveTo('LIVELIHOOD_LIST');
  }
  function leaveTo(dest) {   // host navigation (same as 驼队装货): the 营生 list is the dunhuang-work panel; the dusk lodging flow follows a settled day
    S.ui.closePanel();
    const p = progress(); if (p && S.time.phase(p) === 2) { S.ui.openPanel('inn'); return; }
    if (dest === 'LIVELIHOOD_LIST') S.ui.openPanel('dunhuang-work');
  }
  function disposeRun() { stopLoop(); if (ui.reveal) { ui.reveal.cancel(); ui.reveal = null; } ui.animToken++; ui.animating = false; ui.run = null; ui.kind = null; ui.sessionId = null; ui.drag = null; ui.finishPending = false; ui.error = ''; ui.hostKey = ''; if (n.tiles) n.tiles.innerHTML = ''; ui.tiles.clear(); }
  // ---------- abort (host modal; the engine clock is paused while the question is open) ----------
  function requestAbort() {
    const r = ui.run; if (!r || r.phase !== 'PLAYING' || !hostCtx) return;
    E().pause(r); endDragVisual(); const formal = ui.kind === 'formal', sessionId = ui.sessionId;
    hostCtx.showModal({ title: formal ? COPY().abortTitle : '中止本次试玩？', body: formal ? COPY().abortBody : COPY().abortTrialBody, actions: [
      { label: formal ? COPY().abortContinue : COPY().abortContinueTrial, run: () => { hostCtx.dismissModal(); if (ui.run === r && r.phase === 'PLAYING') { ui.last = performance.now(); E().resume(r); if (!ui.raf) ui.raf = requestAnimationFrame(loop); } } },
      { label: COPY().abortLeave, danger: true, run: async () => {
        hostCtx.dismissModal(); if (ui.run !== r) return; E().abort(r);
        if (formal) { const out = await hostCtx.dispatch('PATTERN_ABORT', { sessionId }, 'pattern-abort-' + sessionId); if (out === null) { render(); return; } }
        disposeRun(); toast(formal ? '已中止：不计收益，不推进时间，不写入记录' : '已退出试玩'); S.ui.closePanel(); S.ui.openPanel('dunhuang-work');
      } }
    ] });
  }
  // Host close (X / Escape): during a run → abort confirmation; instructions → READY; settlement of a formal run → ignored; READY / trial settlement → the panel closes.
  function interceptClose() {
    const v = view();
    if (ui.run && ui.run.phase === 'PLAYING') { requestAbort(); return true; }
    if (ui.page === 'howto') { showReady(); return true; }
    if (ui.finishPending || (v && v.result && !v.settled) || (v && v.phase === 'PLAYING')) return true;
    disposeRun(); return false;
  }
  function onClick(e) {
    const b = e.target.closest('button[data-op]'); if (!b || b.disabled || !dom.shell.contains(b)) return;
    const op = b.dataset.op;
    if (op === 'close') { if (!interceptClose()) S.ui.closePanel(); return; }
    if (op === 'ready') { showReady(); return; }
    if (op === 'howto') { showPage('howto'); return; }
    if (op === 'formal') { void startFormal(); return; }
    if (op === 'trial' || op === 'trial-again') { startTrial(); return; }
    if (op === 'trial-quit') { disposeRun(); showReady(); return; }
    if (op === 'abort') { requestAbort(); return; }
    if (op === 'retry-finish') { void submitFinish(); return; }
    if (op === 'settle') { void settle(); return; }
    if (op === 'abort-stale') { const v = view(); if (!v || ui.busy) return; ui.busy = true; hostCtx.dispatch('PATTERN_ABORT', { sessionId: v.sessionId }, 'pattern-abort-' + v.sessionId).then(() => { ui.busy = false; ui.hostKey = ''; render(); }); }
  }
  function render() {
    if (!dom.shell || !dom.shell.isConnected) return;
    const p = progress(); if (!p) return; const v = view();
    fit();
    if (v && v.result && !v.settled) { stopLoop(); showHostSettlement(v); return; }
    if (v && v.phase === 'PLAYING' && !(ui.run && ui.kind === 'formal' && ui.sessionId === v.sessionId)) { stopLoop(); n.staleText.textContent = COPY().stale; showPage('stale'); return; }
    if (ui.run) return;   // a trial run / trial settlement stays as it is
    if (ui.page !== 'howto') showReady();
  }
  S.ui.registerPanel('pattern-chain', {
    title: '缀纹成章',
    noClose: true,
    render(c, b) { hostCtx = c; ensureShell(); b.append(dom.shell); render(); }
  });
  S.livelihood.register('dunhuang', {
    id: 'pattern-chain', panel: 'pattern-chain', title: S.patternChain.COPY.entryTitle, description: S.patternChain.COPY.entryDescription, time: S.patternChain.COPY.entryTime, pay: S.patternChain.COPY.entryPay, enter: S.patternChain.COPY.enter,
    art: { key: 'DPC_FULL_01_LOTUS_ROSETTE_C217_v01', className: 'pc-job-art', label: '八瓣莲花纹样' }, availability: p => S.patternChain.availability(p)
  });
  S.patternChainUI = { interceptClose, requestAbort, render, NAMES, STRUCTURE, GRID, UNIT, FULL, test: { ui, dom, run: () => ui.run, page: () => ui.page, cellCenter: cellCenterViewport, boardRect: () => n.boardWrap.getBoundingClientRect(), cancelRect: () => n.cancelZone.getBoundingClientRect(), modalRect: () => n.modal.getBoundingClientRect(), node: k => n[k], engine: E, dispose: disposeRun } };
})(globalThis.Silk = globalThis.Silk || {});
