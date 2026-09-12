(function (S) {
  'use strict';
  // 于阗织坊 UI — the loom (canvas) plus entry / trial teaching / formal transition / rush / result screens inside the host panel.
  // Live play is UI-local; the engine (weaving.js) owns the run record and the settlement. Player-facing copy comes from S.weaving.COPY.
  const COLORS = ['#c9583f', '#3f8a72', '#c98a2a', '#3d7f95', '#8c5d99'];
  const MOTIFS = ['莲瓣', '联珠', '团花', '菱格', '斜纹'];
  const GROUPS = [3, 4, 5];
  const COPY = S.weaving.COPY, RULES = S.weaving.RULES, TEMPLATES = S.weaving.TEMPLATES;
  let hostCtx = null, panelBody = null;
  const clock = { now: () => performance.now() };
  let random = Math.random;
  const timers = new Set();
  function later(ms, fn) { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); return id; }
  function clearLater() { for (const id of timers) clearTimeout(id); timers.clear(); }
  const el = (tag, className, text) => { const e = document.createElement(tag); if (className) e.className = className; if (text !== undefined) e.textContent = String(text); return e; };

  // ------------------------------------------------------------------ live state
  const ui = {
    screen: 'entry', kind: null, sessionId: null, step: null, groupIndex: 0, totalCorrect: 0, current: null, knots: [],
    dragging: null, pointerId: null, pointerType: 'mouse', transitioning: false, paused: false,
    baseRemaining: 0, rushRemaining: 0, timerId: null, lastTick: 0, lastActionAt: 0, idleClean: true, wrongEndpoint: false,
    looseCount: 0, looseThread: null, looseDeadline: 0, looseNoNewKnot: true, looseRecovered: false,
    rushPlanned: false, rushDone: false, rushSuccess: false, rushActive: false, baseSnapshot: null, tutorialKnotUsed: false,
    routePlan: null, message: '', messageTimer: null, pendingStats: null, error: '', detailsOpen: false
  };
  const dom = {};

  function resetRun(kind) {
    clearLater(); clearInterval(ui.timerId);
    Object.assign(ui, { kind, step: null, groupIndex: 0, totalCorrect: 0, current: null, knots: [], dragging: null, pointerId: null, transitioning: false, paused: false,
      baseRemaining: RULES.baseSeconds, rushRemaining: RULES.rushSeconds, timerId: null, lastTick: 0, lastActionAt: clock.now(), idleClean: true, wrongEndpoint: false,
      looseCount: 0, looseThread: null, looseDeadline: 0, looseNoNewKnot: true, looseRecovered: false, rushDone: false, rushSuccess: false, rushActive: false,
      baseSnapshot: null, tutorialKnotUsed: false, message: '', pendingStats: null, error: '', detailsOpen: false });
  }

  // ------------------------------------------------------------------ geometry
  function layout() {
    const c = ui.current; if (!c || !dom.canvas) return;
    const w = dom.canvas.clientWidth, h = dom.canvas.clientHeight;
    const padX = Math.max(30, w * .1), headY = 70, rollH = 30, tileH = 54, targetY = h - rollH - tileH / 2 - 2;
    c.w = w; c.h = h; c.rollY = h - rollH; c.tileTop = h - rollH - tileH;
    const spread = (count, y) => Array.from({ length: count }, (_, i) => ({ x: padX + (w - padX * 2) * (count === 1 ? .5 : i / (count - 1)), y }));
    c.starts = spread(c.count, headY).map((q, i) => ({ ...q, id: i }));
    const targetCount = c.order.length;
    c.targets = spread(targetCount, targetY).map((q, slot) => ({ ...q, motif: c.order[slot], slot }));
    const rows = c.count >= 5 ? 5 : c.count === 4 ? 4 : 3, cols = c.count + 1, top = headY + 44, bottom = targetY - 48;
    c.nodes = [];
    for (let row = 0; row < rows; row++) {
      const y = top + (bottom - top) * (row / Math.max(1, rows - 1));
      for (let col = 0; col < cols; col++) {
        const stagger = row % 2 ? (w - padX * 2) / (cols * 2) : 0;
        let x = padX + (w - padX * 2) * (col / Math.max(1, cols - 1)) + stagger;
        x = Math.min(w - padX * .6, x);
        c.nodes.push({ x, y, id: row + '-' + col, row, col });
      }
    }
    c.threads.forEach(t => {
      const start = c.starts[t.id];
      if (!t.points.length) t.points = [{ x: start.x, y: start.y, type: 'start' }];
      else { const dx = start.x - t.points[0].x, dy = start.y - t.points[0].y; t.points = t.points.map(q => ({ ...q, x: q.x + dx, y: q.y + dy })); }
    });
    if (c.loose) c.loose.forEach(s => { s.x = Math.min(w - 40, Math.max(40, s.fx * w)); s.y = Math.min(bottom, Math.max(top, s.fy * (bottom - top) + top)); });
  }
  function resizeCanvas() {
    if (!dom.canvas) return;
    const rect = dom.canvas.getBoundingClientRect(), ratio = Math.min(window.devicePixelRatio || 1, 2);
    dom.canvas.width = Math.max(1, Math.round(rect.width * ratio)); dom.canvas.height = Math.max(1, Math.round(rect.height * ratio));
    dom.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
  function nearest(list, p, radius) { let best = null, d = radius; for (const item of list) { const n = Math.hypot(item.x - p.x, item.y - p.y); if (n < d) { best = item; d = n; } } return best; }

  // ------------------------------------------------------------------ drawing
  function drawMotif(ctx, motif, x, y, r, color, filled) {
    ctx.save(); ctx.translate(x, y); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1.6; ctx.lineJoin = 'round';
    if (motif === 0) { for (let i = 0; i < 3; i++) { ctx.beginPath(); const a = -Math.PI / 2 + (i - 1) * .75; ctx.moveTo(0, r * .55); ctx.quadraticCurveTo(Math.cos(a - .55) * r * 1.1, Math.sin(a - .55) * r * 1.1, Math.cos(a) * r, Math.sin(a) * r); ctx.quadraticCurveTo(Math.cos(a + .55) * r * 1.1, Math.sin(a + .55) * r * 1.1, 0, r * .55); ctx.closePath(); if (filled) ctx.fill(); else ctx.stroke(); } }
    else if (motif === 1) { for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; ctx.beginPath(); ctx.arc(Math.cos(a) * r * .78, Math.sin(a) * r * .78, r * .2, 0, Math.PI * 2); if (filled) ctx.fill(); else ctx.stroke(); } ctx.beginPath(); ctx.arc(0, 0, r * .28, 0, Math.PI * 2); if (filled) ctx.fill(); else ctx.stroke(); }
    else if (motif === 2) { for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; ctx.beginPath(); ctx.ellipse(Math.cos(a) * r * .55, Math.sin(a) * r * .55, r * .42, r * .22, a, 0, Math.PI * 2); if (filled) ctx.fill(); else ctx.stroke(); } ctx.beginPath(); ctx.arc(0, 0, r * .22, 0, Math.PI * 2); if (filled) ctx.fill(); else ctx.stroke(); }
    else if (motif === 3) { ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(r, 0); ctx.lineTo(0, r); ctx.lineTo(-r, 0); ctx.closePath(); if (filled) ctx.fill(); else ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, -r * .45); ctx.lineTo(r * .45, 0); ctx.lineTo(0, r * .45); ctx.lineTo(-r * .45, 0); ctx.closePath(); if (filled) { ctx.fillStyle = '#fff6df'; ctx.fill(); } else ctx.stroke(); }
    else { ctx.lineWidth = filled ? 2.4 : 1.6; for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(-r + i * r * .45, r); ctx.lineTo(r * .1 + i * r * .45, -r); ctx.stroke(); } }
    ctx.restore();
  }
  function drawSkein(ctx, q, motif, active, top = 6) {
    const color = COLORS[motif], y0 = top;
    ctx.save();
    ctx.strokeStyle = '#8a5a34'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(q.x, y0); ctx.lineTo(q.x, y0 + 8); ctx.stroke();  // hook
    ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.lineCap = 'round';
    for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(q.x + i * 2.2, y0 + 8); ctx.quadraticCurveTo(q.x + i * 3.4, y0 + 24, q.x + i * 2.6, y0 + 38); ctx.stroke(); }
    ctx.fillStyle = '#f3dfb4'; ctx.strokeStyle = '#a97b47'; ctx.lineWidth = 1; ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(q.x - 12, y0 + 34, 24, 22, 3); else ctx.rect(q.x - 12, y0 + 34, 24, 22); ctx.fill(); ctx.stroke();
    drawMotif(ctx, motif, q.x, y0 + 45, 7, color, true);
    if (active) { ctx.beginPath(); ctx.arc(q.x, q.y, 9, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill(); ctx.strokeStyle = '#fff3d8'; ctx.lineWidth = 2; ctx.stroke(); }
    ctx.restore();
  }
  function drawTile(ctx, t, highlight) {
    const color = COLORS[t.motif];
    ctx.save();
    ctx.fillStyle = highlight ? '#fff0c8' : '#fbefd6'; ctx.strokeStyle = highlight ? color : '#b48a55'; ctx.lineWidth = highlight ? 2 : 1;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(t.x - 21, t.y - 22, 42, 44, 4) : ctx.rect(t.x - 21, t.y - 22, 42, 44); ctx.fill(); ctx.stroke();
    drawMotif(ctx, t.motif, t.x, t.y - 4, 9, color, false);
    ctx.fillStyle = '#6e4a34'; ctx.font = '10px Georgia, "Songti SC", "STSong", serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(MOTIFS[t.motif], t.x, t.y + 14);
    ctx.restore();
  }
  function drawRing(ctx, n, lit) {
    ctx.save(); ctx.beginPath(); ctx.arc(n.x, n.y, 5.5, 0, Math.PI * 2); ctx.fillStyle = lit ? '#ffe39a' : '#f3d8a2'; ctx.fill(); ctx.strokeStyle = lit ? '#c8752f' : '#a8683d'; ctx.lineWidth = lit ? 2.4 : 1.8; ctx.stroke();
    if (lit) { ctx.beginPath(); ctx.arc(n.x, n.y, 10, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(200,117,47,.45)'; ctx.lineWidth = 1; ctx.stroke(); }
    ctx.restore();
  }
  function drawThread(ctx, t, loose) {
    if (t.points.length < 2) return;
    ctx.save(); ctx.strokeStyle = COLORS[t.motif]; ctx.lineWidth = 5.5; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.shadowColor = 'rgba(75,39,25,.18)'; ctx.shadowBlur = 2;
    ctx.beginPath(); ctx.moveTo(t.points[0].x, t.points[0].y); for (let i = 1; i < t.points.length; i++) ctx.lineTo(t.points[i].x, t.points[i].y); ctx.stroke();
    const end = t.points[t.points.length - 1];
    if (!t.connected) { ctx.beginPath(); ctx.arc(end.x, end.y, loose ? 9 : 7, 0, Math.PI * 2); ctx.fillStyle = COLORS[t.motif]; ctx.fill(); ctx.strokeStyle = loose ? '#ffe9b0' : '#fff3d8'; ctx.lineWidth = loose ? 3 : 2; ctx.stroke(); }
    ctx.restore();
  }
  function drawKnot(ctx, k) {
    ctx.save(); ctx.translate(k.x, k.y); ctx.fillStyle = '#9d4938'; ctx.strokeStyle = '#fff0c7'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#ffe0b8'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(-3, 0, 4, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.arc(3, 0, 4, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  function drawRoll(ctx, c) {
    const w = c.w, y = c.rollY, progress = ui.kind === 'formal' ? Math.min(1, ui.totalCorrect / 12) : ui.kind === 'trial' ? Math.min(1, ui.totalCorrect / 3) : 0;
    ctx.save();
    ctx.fillStyle = '#b9764a'; ctx.fillRect(14, y + 4, w - 28, 20); ctx.fillStyle = '#7c4a2e'; ctx.fillRect(14, y + 20, w - 28, 6);
    ctx.fillStyle = '#e8d3a5'; ctx.fillRect(18, y + 7, w - 36, 12);
    if (progress > 0) { const pw = (w - 36) * progress; ctx.save(); ctx.beginPath(); ctx.rect(18, y + 7, pw, 12); ctx.clip(); for (let x = 18; x < 18 + pw; x += 10) { ctx.fillStyle = COLORS[Math.floor(x / 10) % 5]; ctx.fillRect(x, y + 7, 6, 12); } ctx.restore(); }
    ctx.strokeStyle = '#8a5a34'; ctx.lineWidth = 1; ctx.strokeRect(14.5, y + 4.5, w - 29, 21);
    ctx.fillStyle = '#c69b62'; ctx.beginPath(); ctx.arc(14, y + 14, 8, 0, Math.PI * 2); ctx.arc(w - 14, y + 14, 8, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  function draw() {
    const c = ui.current, ctx = dom.ctx; if (!c || !ctx) return;
    const w = c.w, h = c.h; ctx.clearRect(0, 0, w, h);
    ctx.save(); ctx.strokeStyle = 'rgba(157,98,54,.09)'; ctx.lineWidth = 1; for (let x = 24; x < w; x += 14) { ctx.beginPath(); ctx.moveTo(x, 12); ctx.lineTo(x, c.rollY - 2); ctx.stroke(); } ctx.restore();
    ctx.save(); ctx.strokeStyle = '#a06b3c'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(10, 6); ctx.lineTo(w - 10, 6); ctx.stroke(); ctx.restore();   // top rod
    const warpOnly = ui.step === 'warp', lit = warpOnly ? new Set(c.threads.map(t => t.guideNode)) : null;
    if (ui.step !== 'sort') for (const n of c.nodes) { if (ui.step === 'warp' && n.row > 0) continue; drawRing(ctx, n, lit && lit.has(n.id)); }
    c.threads.forEach(t => drawThread(ctx, t, ui.looseThread === t.id));
    if (ui.dragging && ui.dragging.thread && ui.pointerPos) { const t = ui.dragging.thread, end = t.points[t.points.length - 1]; ctx.save(); ctx.setLineDash([4, 5]); ctx.strokeStyle = COLORS[t.motif]; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(end.x, end.y); ctx.lineTo(ui.pointerPos.x, ui.pointerPos.y); ctx.stroke(); ctx.restore(); }
    if (ui.step === 'sort') {
      c.starts.forEach((q, i) => { const placed = c.threads[i].placed; if (placed) drawSkein(ctx, q, i, false); else { ctx.save(); ctx.setLineDash([3, 3]); ctx.strokeStyle = '#b48a55'; ctx.lineWidth = 1; ctx.strokeRect(q.x - 12, 40, 24, 22); ctx.setLineDash([]); drawMotif(ctx, i, q.x, 51, 7, '#b48a55', false); ctx.restore(); } });
      for (const s of c.loose) if (!c.threads[s.motif].placed) drawSkein(ctx, { x: s.x, y: s.y }, s.motif, false, s.y - 30);   // loose skeins lie in the middle of the loom until sorted
    } else c.starts.forEach((q, i) => drawSkein(ctx, q, i, !c.threads[i].connected && c.threads[i].points.length === 1));
    if (['connect', 'play', 'rush'].includes(ui.step)) c.targets.forEach(t => drawTile(ctx, t, false));
    ui.knots.forEach(k => drawKnot(ctx, k));
    drawRoll(ctx, c);
    if (ui.rushActive) { ctx.save(); ctx.fillStyle = 'rgba(96,58,32,.14)'; ctx.fillRect(0, 0, w, h); ctx.restore(); }
  }

  // ------------------------------------------------------------------ groups
  function prepareGroup(count, order, options = {}) {
    ui.current = { count, order, isTrial: options.trial || false, rush: options.rush || false, threads: Array.from({ length: count }, (_, id) => ({ id, motif: id, points: [], connected: false, placed: !options.sort })), loose: null };
    if (options.sort) { const fx = [.22, .5, .78].sort(() => random() - .5); ui.current.loose = Array.from({ length: count }, (_, i) => ({ motif: i, fx: fx[i] || .5, fy: .35 + (i % 2) * .25, x: 0, y: 0 })); }
    ui.knots = []; ui.dragging = null; ui.transitioning = false;
    resizeCanvas(); layout();
    if (ui.step === 'warp' || options.guide) ui.current.threads.forEach(t => { const row0 = ui.current.nodes.filter(n => n.row === 0); t.guideNode = nearest(row0, ui.current.starts[t.id], 9999).id; });
    draw(); updateHud();
  }
  function completedBeforeCurrent() { return GROUPS.slice(0, ui.groupIndex).reduce((a, b) => a + b, 0); }
  function templateFor(count) { const idx = ui.routePlan && ui.routePlan[count]; return TEMPLATES[count][Number.isInteger(idx) ? idx : 0]; }

  // ------------------------------------------------------------------ messages / hud
  function showMessage(text, ms = 1500) {
    clearTimeout(ui.messageTimer); ui.message = text; if (dom.message) { dom.message.textContent = text; dom.message.classList.toggle('is-visible', Boolean(text)); }
    ui.messageTimer = setTimeout(() => { ui.message = ''; if (dom.message) { dom.message.textContent = ''; dom.message.classList.remove('is-visible'); } }, ms);
  }
  function updateHud() {
    if (!dom.progress) return;
    const c = ui.current;
    if (ui.rushActive && c && c.rush) dom.progress.textContent = COPY.rushProgressFormat.replace('{connected}', c.threads.filter(t => t.connected).length);
    else if (ui.kind === 'trial') dom.progress.textContent = ui.step === 'sort' ? '理丝' : ui.step === 'warp' ? '定经' : '开工 · ' + (c ? c.threads.filter(t => t.connected).length : 0) + ' / 3';
    else dom.progress.textContent = COPY.progressFormat.replace('{connected}', ui.totalCorrect);
    updateClock();
  }
  function updateClock() {
    if (!dom.timeLeft) return;
    const rush = ui.rushActive, remain = Math.max(0, rush ? ui.rushRemaining : ui.baseRemaining), total = rush ? RULES.rushSeconds : RULES.baseSeconds;
    dom.timeLeft.textContent = COPY.remainingFormat.replace('{seconds}', Math.ceil(remain));
    dom.sunFill.style.width = (remain / total * 100) + '%';
    dom.clock.classList.toggle('is-low', !rush && remain <= 10); dom.clock.classList.toggle('is-rush', rush);
    dom.sunLabel.textContent = rush ? '急束' : COPY.sun;
  }

  // ------------------------------------------------------------------ pointer input
  function capture(event) { try { if (dom.canvas.setPointerCapture) dom.canvas.setPointerCapture(event.pointerId); } catch (_) { /* synthetic pointer */ } }
  function pointerPoint(event) { const r = dom.canvas.getBoundingClientRect(); return { x: event.clientX - r.left, y: event.clientY - r.top - (event.pointerType === 'touch' ? 18 : 0) }; }
  function onPointerDown(event) {
    if (!ui.current || ui.transitioning || !['sort', 'warp', 'connect', 'play', 'rush'].includes(ui.step)) return;
    const p = pointerPoint(event), c = ui.current;
    if (ui.step === 'sort') {
      const skein = nearest(c.loose.filter(s => !c.threads[s.motif].placed), p, 30);
      if (!skein) return;
      ui.dragging = { skein }; ui.pointerId = event.pointerId; capture(event); event.preventDefault(); return;
    }
    const knot = nearest(ui.knots, p, 22);
    if (knot) { untangle(knot); return; }
    let thread = null;
    for (const t of c.threads) { if (t.connected) continue; const end = t.points[t.points.length - 1]; if (Math.hypot(end.x - p.x, end.y - p.y) < 24) { thread = t; break; } }
    if (!thread) return;
    ui.dragging = { thread }; ui.pointerId = event.pointerId; ui.lastActionAt = clock.now();
    capture(event); event.preventDefault();
    if (dom.hint) dom.hint.classList.add('is-hidden');
  }
  function onPointerMove(event) {
    if (!ui.dragging || event.pointerId !== ui.pointerId) return;
    const p = pointerPoint(event), c = ui.current;
    if (ui.dragging.skein) { ui.dragging.skein.x = p.x; ui.dragging.skein.y = p.y; draw(); event.preventDefault(); return; }
    const t = ui.dragging.thread, prev = t.points[t.points.length - 2]; ui.pointerPos = p;
    if (prev && Math.hypot(prev.x - p.x, prev.y - p.y) < 18) { t.points.pop(); ui.lastActionAt = clock.now(); draw(); return; }   // drag back = undo one segment
    if (ui.step === 'warp') { draw(); event.preventDefault(); return; }
    const node = nearest(c.nodes, p, 20);
    if (node) { const last = t.points[t.points.length - 1]; if (Math.hypot(last.x - node.x, last.y - node.y) > 4 && !(last.type === 'node' && last.nodeId === node.id)) { t.points.push({ x: node.x, y: node.y, type: 'node', nodeId: node.id }); ui.lastActionAt = clock.now(); draw(); } }
    event.preventDefault();
  }
  function onPointerUp(event) {
    if (!ui.dragging || event.pointerId !== ui.pointerId) return;
    const p = pointerPoint(event), c = ui.current;
    if (ui.dragging.skein) {
      const s = ui.dragging.skein, slot = nearest(c.starts.filter(q => !c.threads[q.id].placed), p, 30);
      if (slot && slot.id === s.motif) { c.threads[s.motif].placed = true; showMessage('丝束归位', 700); if (c.threads.every(t => t.placed)) later(500, trialWarp); }
      else if (slot) showMessage('颜色与纹样不合，另寻挂位', 1300);
      ui.dragging = null; ui.pointerId = null; draw(); return;
    }
    const t = ui.dragging.thread;
    if (ui.step === 'warp') {
      const node = nearest(c.nodes.filter(n => n.row === 0), p, 22);
      if (node && node.id === t.guideNode) { t.points = [t.points[0], { x: node.x, y: node.y, type: 'node', nodeId: node.id }]; t.warped = true; showMessage('已入引导环', 700); if (c.threads.every(x => x.warped)) later(500, trialConnect); }
      else if (node) showMessage('请引入正下方亮起的丝环', 1300);
      ui.dragging = null; ui.pointerId = null; draw(); return;
    }
    const target = nearest(c.targets, p, 30);
    if (target) {
      if (target.motif === t.motif) { t.points.push({ x: target.x, y: target.y, type: 'target' }); t.connected = true; ui.dragging = null; ui.pointerId = null; ui.lastActionAt = clock.now(); afterConnect(t); draw(); return; }
      ui.wrongEndpoint = true; showMessage(COPY.wrongPattern, 1300); if (t.points.length > 1) t.points.pop();
    }
    ui.dragging = null; ui.pointerId = null; ui.pointerPos = null; ui.lastActionAt = clock.now(); draw();
  }
  function afterConnect(t) {
    const c = ui.current, others = c.threads.filter(x => x !== t).map(x => x.points);
    const crossings = S.weaving.crossings(t.points, others);
    let knotted = false;
    if (crossings.length) {
      if (ui.kind === 'trial') { if (!ui.tutorialKnotUsed) { ui.tutorialKnotUsed = true; knotted = true; } }
      else if (!ui.knots.length && ui.looseThread === null && !ui.transitioning && !ui.rushActive) knotted = random() < S.weaving.knotProbability(crossings.length);   // one roll per completion, never re-rolled
      else if (ui.rushActive && !ui.knots.length) knotted = random() < S.weaving.knotProbability(crossings.length);
    }
    if (knotted) { const hit = crossings[0]; ui.knots.push({ x: hit.x, y: hit.y, threadId: t.id, segmentIndex: hit.segmentIndex }); ui.looseNoNewKnot = false; showMessage(COPY.knot + ' · 点结处退回重理', 2200); }
    else showMessage('纹样相合', 700);
    onConnected(t);
  }
  function untangle(knot) {
    const t = ui.current.threads.find(x => x.id === knot.threadId); if (!t) return;
    t.points = t.points.slice(0, Math.max(1, knot.segmentIndex)); t.connected = false;
    ui.knots = ui.knots.filter(k => k.threadId !== t.id); ui.dragging = null; ui.lastActionAt = clock.now();
    showMessage(ui.kind === 'trial' ? '丝头已退回。两线在同一丝环相会不算交结，可借环绕行' : '丝头已退回，重新引线', ui.kind === 'trial' ? 2600 : 1200);
    if (ui.kind === 'formal') ui.totalCorrect = countFormal();
    draw(); updateHud();
  }
  function countFormal() { const c = ui.current; return ui.rushActive ? ui.totalCorrect : Math.min(12, completedBeforeCurrent() + c.threads.filter(t => t.connected).length); }
  function onConnected(thread) {
    const c = ui.current;
    if (ui.looseThread === thread.id) { if (clock.now() <= ui.looseDeadline && ui.looseNoNewKnot) { ui.looseRecovered = true; showMessage(COPY.looseSkill, 1200); } ui.looseThread = null; ui.looseDeadline = 0; }
    if (ui.rushActive && c.rush) { updateHud(); if (c.threads.every(t => t.connected) && ui.knots.length === 0) finishRush(true); return; }
    if (ui.kind === 'formal') ui.totalCorrect = countFormal(); else ui.totalCorrect = c.threads.filter(t => t.connected).length;
    updateHud();
    if (ui.kind === 'formal') {
      const milestone = COPY.milestones[ui.totalCorrect]; if (milestone && !ui.knots.length) showMessage(milestone, 900);
      if (ui.totalCorrect >= RULES.looseAfter && ui.looseCount === 0 && !ui.knots.some(k => k.threadId === thread.id)) { triggerLoose(thread); return; }
      if (ui.totalCorrect >= RULES.rushAfter && ui.rushPlanned && !ui.rushDone) { startRush(); return; }
      if (ui.totalCorrect >= RULES.secondLoose.after && ui.looseCount === 1 && ui.looseThread === null && ui.knots.length === 0 && ui.baseRemaining >= RULES.secondLoose.minRemainingSeconds && random() < RULES.secondLoose.probability) { triggerLoose(thread); return; }
    }
    maybeCompleteGroup();
  }
  function triggerLoose(thread) {
    ui.looseCount++; ui.looseThread = thread.id; ui.looseNoNewKnot = true;
    showMessage(COPY.looseWarn, 1000);
    later(RULES.looseWarnSeconds * 1000, () => {
      if (ui.step !== 'play' || !ui.current || ui.rushActive) { ui.looseThread = null; maybeCompleteGroup(); return; }
      thread.connected = false; if (thread.points[thread.points.length - 1] && thread.points[thread.points.length - 1].type === 'target') thread.points.pop();
      ui.looseDeadline = clock.now() + RULES.looseRecoverySeconds * 1000; ui.totalCorrect = countFormal(); showMessage(COPY.loose, 1500); draw(); updateHud();
    });
  }
  function startRush() {
    ui.rushDone = true; ui.transitioning = true; ui.baseSnapshot = { current: ui.current, knots: ui.knots, groupIndex: ui.groupIndex, totalCorrect: ui.totalCorrect };
    if (dom.rushTag) { dom.rushTag.textContent = COPY.rushMessage; dom.rushTag.hidden = false; }
    later(1200, () => {
      ui.rushActive = true; ui.rushRemaining = RULES.rushSeconds; ui.step = 'rush';
      prepareGroup(2, [1, 0], { rush: true }); ui.lastActionAt = clock.now(); ui.lastTick = clock.now(); updateHud(); draw();
    });
  }
  function finishRush(success) {
    if (!ui.rushActive) return;
    ui.rushSuccess = success; ui.transitioning = true; showMessage(success ? COPY.rushSuccess : COPY.rushMiss, 1000);
    later(1000, () => {
      const snap = ui.baseSnapshot; ui.rushActive = false; ui.step = 'play'; ui.current = snap.current; ui.knots = snap.knots; ui.groupIndex = snap.groupIndex; ui.totalCorrect = snap.totalCorrect; ui.baseSnapshot = null; ui.transitioning = false;
      if (dom.rushTag) dom.rushTag.hidden = true;
      resizeCanvas(); layout(); showMessage(COPY.resume, 900); ui.lastTick = clock.now(); ui.lastActionAt = clock.now(); updateHud(); draw(); maybeCompleteGroup();
    });
  }
  function maybeCompleteGroup() {
    const c = ui.current; if (!c || ui.rushActive || ui.looseThread !== null || ui.transitioning) return;
    if (!c.threads.every(t => t.connected) || ui.knots.length) return;
    ui.transitioning = true;
    if (ui.kind === 'trial') { later(500, finishTrial); return; }
    if (ui.totalCorrect >= 12) { later(700, () => finishFormal('ALL_CLEAN')); return; }
    later(850, () => { ui.groupIndex++; const count = GROUPS[ui.groupIndex]; ui.transitioning = false; prepareGroup(count, templateFor(count)); ui.lastActionAt = clock.now(); });
  }

  // ------------------------------------------------------------------ trial (teaching)
  function beginTrial() {
    resetRun('trial'); ui.screen = 'play'; ui.step = 'sort';
    render(); prepareGroup(3, TEMPLATES[3][0], { trial: true, sort: true });
    showHint('理丝：把散丝拖回颜色与纹样相合的挂位');
  }
  function trialWarp() { ui.step = 'warp'; ui.current.threads.forEach(t => { t.points = [t.points[0]]; }); const row0 = ui.current.nodes.filter(n => n.row === 0); ui.current.threads.forEach(t => { t.guideNode = nearest(row0, ui.current.starts[t.id], 9999).id; }); showHint('定经：按住丝头，引入正下方亮起的丝环'); draw(); updateHud(); }
  function trialConnect() { ui.step = 'connect'; showHint('开工：顺着丝环，把每根丝接到相合的纹样'); draw(); updateHud(); }
  function finishTrial() { showMessage(COPY.trialDone, 1200); later(900, () => { resetRun(null); ui.screen = 'entry'; render(); }); }
  function showHint(text) { if (!dom.hint) return; dom.hint.textContent = text; dom.hint.classList.remove('is-hidden'); }

  // ------------------------------------------------------------------ formal
  function beginFormal(view) {
    resetRun('formal'); ui.sessionId = view.sessionId; ui.rushPlanned = Boolean(view.rushPlanned); ui.routePlan = view.routePlan; ui.screen = 'transition'; ui.step = 'transition';
    render();
    const words = COPY.transition; let i = 0;
    const show = () => { if (dom.transition) { dom.transition.textContent = words[i]; dom.transition.dataset.step = String(i); } };
    show();
    const tickWord = () => { i++; if (i < words.length) { show(); later(900, tickWord); } else later(700, () => { ui.screen = 'play'; ui.step = 'play'; render(); prepareGroup(3, templateFor(3)); showHint('按住丝头，引过丝环，接到相合纹样'); startTimer(); }); };
    later(900, tickWord);
  }
  function startTimer() {
    clearInterval(ui.timerId); ui.lastTick = clock.now(); ui.lastActionAt = clock.now(); updateClock();
    ui.timerId = setInterval(tickTimer, 100);
  }
  function tickTimer() {
    if (ui.kind !== 'formal' || ui.step === 'result' || ui.pendingStats) return;
    const now = clock.now();
    if (ui.paused || document.hidden || ui.transitioning) { ui.lastTick = now; return; }
    const delta = (now - ui.lastTick) / 1000; ui.lastTick = now;
    if (!ui.dragging && now - ui.lastActionAt > RULES.idleLimitSeconds * 1000) ui.idleClean = false;
    if (ui.rushActive) { ui.rushRemaining -= delta; if (ui.rushRemaining <= 0) { ui.rushRemaining = 0; finishRush(false); } }
    else { ui.baseRemaining -= delta; if (ui.baseRemaining <= 0) { ui.baseRemaining = 0; finishFormal('DAY_END'); } }
    updateClock();
  }
  function finishFormal(reason) {
    if (ui.kind !== 'formal' || ui.pendingStats || ui.step === 'result') return;
    clearInterval(ui.timerId); clearLater(); ui.transitioning = true;
    const c = ui.current, currentConnected = ui.rushActive ? 0 : c.threads.filter(t => t.connected).length;
    const correct = Math.min(12, Math.max(ui.totalCorrect, completedBeforeCurrent() + currentConnected));
    const stats = { reason, correct, unresolved: ui.knots.length, wrongEndpoint: ui.wrongEndpoint, idleClean: ui.idleClean, looseRecovered: ui.looseRecovered, urgentTriggered: ui.rushDone, urgentSuccess: ui.rushSuccess };
    ui.pendingStats = stats; ui.step = 'result';
    void submitFinish();
  }
  async function submitFinish() {
    if (!hostCtx || !ui.pendingStats) return;
    ui.error = '';
    const out = await hostCtx.dispatch('WEAVE_FINISH', { sessionId: ui.sessionId, stats: ui.pendingStats }, 'weaving-finish-' + ui.sessionId);
    if (out === null) { ui.error = '收工记录尚未保存，请重试。'; render(); return; }
    ui.pendingStats = null; ui.screen = 'result'; render();
  }
  async function settle() {
    const v = S.weaving.view(hostCtx.p); if (!v || !v.result || v.settled) return;
    const out = await hostCtx.dispatch('WEAVE_SETTLE', { sessionId: v.sessionId, settlementId: v.settlementId }, 'weaving-settle-' + v.settlementId);
    if (out === null) return;
    resetRun(null); ui.screen = 'entry';
    S.ui.closePanel(); if (S.time.phase(S.app.state.progress) === 2) S.ui.openPanel('inn');   // host lodging flow at dusk
  }
  function requestAbort() {
    ui.paused = true;
    hostCtx.showModal({ title: COPY.abortTitle, body: COPY.abortBody, actions: [
      { label: COPY.abortContinue, run: () => { ui.paused = false; ui.lastTick = clock.now(); hostCtx.dismissModal(); } },
      { label: COPY.abortLeave, danger: true, run: async () => { hostCtx.dismissModal(); const out = await hostCtx.dispatch('WEAVE_ABORT', { sessionId: ui.sessionId }, 'weaving-abort-' + ui.sessionId); if (out === null) { ui.paused = false; ui.lastTick = clock.now(); return; } resetRun(null); ui.screen = 'entry'; S.ui.closePanel(); S.ui.openPanel('khotan-work'); } }
    ] });
  }
  // Host close button (X): entry -> close panel; trial -> back to the entry page; formal -> abort confirmation.
  function interceptClose() {
    if (ui.kind === 'trial') { resetRun(null); ui.screen = 'entry'; render(); return true; }
    if (ui.kind === 'formal' && ui.step !== 'result') { requestAbort(); return true; }
    return false;
  }

  // ------------------------------------------------------------------ rendering (host panel)
  function ensureShell() {
    if (dom.shell) return;
    dom.shell = el('div', 'weave-shell');
    dom.entry = el('div', 'weave-entry');
    dom.transition = el('div', 'weave-transition'); dom.transition.setAttribute('role', 'status');
    dom.play = el('div', 'weave-play');
    const hud = el('div', 'weave-hud'); dom.progress = el('span', 'weave-progress'); dom.clock = el('span', 'weave-clock'); dom.sunLabel = el('span', 'weave-sun-label', COPY.sun);
    const track = el('span', 'weave-sun-track'); dom.sunFill = el('i'); track.append(dom.sunFill); dom.timeLeft = el('span', 'weave-time');
    dom.clock.append(dom.sunLabel, track, dom.timeLeft); hud.append(dom.progress, dom.clock);
    dom.rushTag = el('div', 'weave-rush-tag'); dom.rushTag.hidden = true;
    dom.message = el('div', 'weave-message'); dom.message.setAttribute('aria-live', 'polite');
    const loom = el('div', 'weave-loom'); dom.canvas = el('canvas', 'weave-canvas'); dom.canvas.setAttribute('aria-label', '连丝操作区'); dom.ctx = dom.canvas.getContext('2d');
    dom.hint = el('div', 'weave-hint is-hidden'); loom.append(dom.canvas, dom.hint);
    dom.canvas.addEventListener('pointerdown', onPointerDown); dom.canvas.addEventListener('pointermove', onPointerMove); dom.canvas.addEventListener('pointerup', onPointerUp); dom.canvas.addEventListener('pointercancel', onPointerUp);
    dom.play.append(hud, dom.rushTag, dom.message, loom);
    dom.result = el('div', 'weave-result');
    dom.shell.append(dom.entry, dom.transition, dom.play, dom.result);
  }
  function renderEntry(c) {
    const avail = S.weaving.availability(c.p);
    dom.entry.replaceChildren();
    const card = el('div', 'weave-manager'); card.append(el('p', 'weave-speaker', COPY.managerLabel), el('p', 'weave-line', COPY.managerLine)); dom.entry.append(card);
    const loomArt = el('div', 'weave-still'); for (let i = 0; i < 5; i++) { const s = el('i'); s.style.background = COLORS[i]; loomArt.append(s); } dom.entry.append(loomArt);
    dom.entry.append(el('p', 'weave-note', COPY.startDuration));
    if (!avail.enoughTime) dom.entry.append(el('p', 'weave-availability', COPY.noTime));
  }
  function renderResult(c, v) {
    const r = v.result; dom.result.replaceChildren();
    dom.result.append(el('p', 'weave-result-kicker', r.title), el('p', 'weave-result-status', r.statusPhrase));
    const wage = el('p', 'weave-wage'); wage.append(el('strong', '', '+' + r.totalWage), el('span', '', '钱')); dom.result.append(wage);
    dom.result.append(el('p', 'weave-summary', r.summary));
    const toggle = el('button', 'weave-detail-toggle', ui.detailsOpen ? '收起明细' : COPY.details); toggle.type = 'button'; toggle.setAttribute('aria-expanded', String(ui.detailsOpen));
    toggle.addEventListener('click', () => { ui.detailsOpen = !ui.detailsOpen; renderResult(c, v); });
    dom.result.append(toggle);
    if (ui.detailsOpen) {
      const box = el('div', 'weave-detail');
      const line = (k, val) => { const p = el('p'); p.append(el('span', '', k), el('strong', '', val)); box.append(p); };
      line('基础工钱', r.baseWage + ' 钱'); line('手艺加赏', '+' + r.craftBonus + ' 钱'); if (r.urgentTriggered) line('急束加赏', '+' + r.urgentBonus + ' 钱'); line('合计', r.totalWage + ' 钱');
      if (r.tags.length) { const ul = el('ul', 'weave-tags'); for (const t of r.tags) ul.append(el('li', '', t)); box.append(el('p', 'weave-tags-title', '手艺记名'), ul); } else box.append(el('p', 'weave-tags-title', '今日未得手艺记名'));
      dom.result.append(box);
    }
    if (ui.error) dom.result.append(el('p', 'inline-error', ui.error));
  }
  function render() { if (hostCtx && S.app && S.app.state) S.ui.render(S.app.state); }
  S.ui.registerPanel('khotan-work', {
    title: '营生',
    render(c, b) {
      const card = el('section', 'weave-job-card');
      card.append(el('h3', '', COPY.entryTitle), el('p', 'weave-job-desc', COPY.entryDescription));
      const meta = el('div', 'weave-job-meta'); meta.append(el('span', '', COPY.entryTime), el('span', '', COPY.entryPay)); card.append(meta);
      const art = el('div', 'weave-job-art'); for (let i = 0; i < 5; i++) { const s = el('i'); s.style.background = COLORS[i]; art.append(s); } card.append(art);
      card.append(c.button(COPY.enter, () => c.openPanel('weaving')));
      b.append(card);
    }
  });
  S.ui.registerPanel('weaving', {
    title: COPY.entryTitle,
    noClose(c) { const v = S.weaving.view(c.p); return Boolean(v && v.result && !v.settled) || ui.screen === 'transition' || Boolean(ui.pendingStats); },
    render(c, b) {
      hostCtx = c; panelBody = b; ensureShell();
      const v = S.weaving.view(c.p);
      let screen = ui.screen;
      if (v && v.result && !v.settled) screen = 'result';
      else if (v && v.phase === 'PLAYING' && ui.kind === 'formal' && ui.sessionId === v.sessionId) screen = ui.screen;
      else if (v && v.phase === 'PLAYING') screen = 'stale';
      else if (ui.kind === 'formal' && ui.step !== 'result') { resetRun(null); ui.screen = 'entry'; screen = 'entry'; }
      b.append(dom.shell);
      b.parentElement.classList.toggle('is-weaving-play', screen === 'play' || screen === 'transition');
      dom.entry.hidden = screen !== 'entry'; dom.transition.hidden = screen !== 'transition'; dom.play.hidden = screen !== 'play'; dom.result.hidden = screen !== 'result';
      if (screen === 'entry') renderEntry(c);
      if (screen === 'result') renderResult(c, v);
      if (screen === 'stale') { dom.entry.hidden = false; dom.entry.replaceChildren(el('p', 'weave-availability', '这一架活计已经中断。')); }
      if (screen === 'play' && ui.current) { later(0, () => { resizeCanvas(); layout(); draw(); updateHud(); }); }
      if (ui.error && screen !== 'result') b.append(el('p', 'inline-error', ui.error));
    },
    footer(c, f) {
      const v = S.weaving.view(c.p);
      if (v && v.result && !v.settled) { f.append(c.button(COPY.leave, settle)); return; }
      if (ui.pendingStats) { f.append(c.button('重试收工', () => void submitFinish())); return; }
      if (v && v.phase === 'PLAYING' && !(ui.kind === 'formal' && ui.sessionId === v.sessionId)) { f.append(c.button(COPY.leave, async () => { const out = await c.dispatch('WEAVE_ABORT', { sessionId: v.sessionId }); if (out !== null) { resetRun(null); ui.screen = 'entry'; render(); } })); return; }
      if (ui.screen !== 'entry' || (v && v.phase === 'PLAYING')) return;
      const avail = S.weaving.availability(c.p);
      f.append(c.button(COPY.trial, beginTrial, { className: 'ui-button secondary-button', disabled: !avail.canTrial }));
      f.append(c.button(COPY.start, async () => { const out = await c.dispatch('WEAVE_START', { mode: 'FORMAL' }); if (out === null) return; const started = S.weaving.view(S.app.state.progress); if (started && started.phase === 'PLAYING') beginFormal(started); }, { disabled: !avail.canStartFormal }));
    }
  });
  document.addEventListener('visibilitychange', () => { if (ui.kind === 'formal' && ui.step === 'play') { ui.lastTick = clock.now(); if (!document.hidden) showMessage(COPY.resume, 700); } });
  window.addEventListener('resize', () => { if (ui.current && dom.canvas && !dom.play.hidden) { resizeCanvas(); layout(); draw(); } });
  S.weavingUI = { interceptClose, requestAbort, test: { ui, dom, clock, layout: () => ui.current, setRandom(fn) { random = fn || Math.random; }, tick: tickTimer, beginTrial, beginFormal, finishFormal, redraw: () => { resizeCanvas(); layout(); draw(); },
    pointer(kind, x, y, pointerType = 'mouse') { const r = dom.canvas.getBoundingClientRect(); const ev = { clientX: r.left + x, clientY: r.top + y + (pointerType === 'touch' ? 18 : 0), pointerId: 1, pointerType, preventDefault() {} }; if (kind === 'down') onPointerDown(ev); else if (kind === 'move') onPointerMove(ev); else onPointerUp(ev); } } };
})(globalThis.Silk = globalThis.Silk || {});
