/* 于阗织坊 FINAL v5.0 — screen layer. The eight reference paintings are the UI: each phase shows its painting at 864×1536 art px and only the live parts
   (hanger tags, silk bundles, tension scales, rings, threads, target plaques, the red urgent bar, settlement values, HUD) are laid on top at the painted positions. */
(function () {
  'use strict';
  const E = window.YutianWeavingEngine, IDS = E.IDENTITIES.map(i => i.id), ID = Object.fromEntries(E.IDENTITIES.map(i => [i.id, i]));
  const ART = { w: 864, h: 1536, cols: [217, 325, 433, 541, 648], rows: [553, 646, 738, 831, 923], tagX: [227, 328, 429, 534, 636], tagY: 395, trayX: [209, 320, 432, 543, 655], trayY: 1058, scaleX: [214, 321, 431, 541, 650], scaleY: 588, weightX: [213, 320, 431, 543, 655], weightY: 1036, bundleTopY: 322, targetY: 1013 };
  const GLYPH = {
    red: '<path d="M24 5C29.5 11.5 30.5 22 24 30.5 17.5 22 18.5 11.5 24 5Z"/><path d="M24 30.5C13 29 7 20.5 7.5 11.5 16 14 22 21 24 30.5Z"/><path d="M24 30.5C35 29 41 20.5 40.5 11.5 32 14 26 21 24 30.5Z"/><path d="M6.5 34.5C15 41 33 41 41.5 34.5 33 37.5 15 37.5 6.5 34.5Z"/>',
    white: '<circle cx="24" cy="24" r="4"/>' + [0, 45, 90, 135, 180, 225, 270, 315].map(a => `<circle cx="${(24 + 15 * Math.cos(a * Math.PI / 180)).toFixed(2)}" cy="${(24 + 15 * Math.sin(a * Math.PI / 180)).toFixed(2)}" r="2.9"/>`).join(''),
    teal: [0, 45, 90, 135, 180, 225, 270, 315].map(a => `<ellipse cx="24" cy="12.5" rx="5.2" ry="10" transform="rotate(${a} 24 24)"/>`).join('') + '<circle cx="24" cy="24" r="5.5" fill="#fff" fill-opacity=".85"/><circle cx="24" cy="24" r="3"/>',
    yellow: '<path fill-rule="evenodd" d="M24 4L44 24 24 44 4 24Z M24 13L35 24 24 35 13 24Z"/><path d="M24 18l6 6-6 6-6-6z"/>',
    purple: [0, 90, 180, 270].map(a => `<ellipse cx="24" cy="12" rx="6.5" ry="11" transform="rotate(${a} 24 24)"/>`).join('') + '<circle cx="24" cy="24" r="4.2" fill="#fff" fill-opacity=".8"/><circle cx="24" cy="24" r="2.2"/>'
  };
  const glyph = (id, cls) => `<svg class="glyph ${cls || ''}" viewBox="0 0 48 48" fill="currentColor" aria-hidden="true">${GLYPH[id]}</svg>`;
  const $ = id => document.getElementById(id), el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
  const nodes = { app: $('app'), stage: $('stage'), bg: $('bg'), layer: $('layer'), lines: $('lines'), chips: $('chips'), hud: $('hud'), hudCount: $('hud-count'), hudFill: $('hud-fill'), hudSun: $('hud-sun'), hudSecs: $('hud-secs'), pause: $('pause'), overlay: $('overlay') };
  const ui = { run: null, mode: 'entry', scale: 1, left: 0, top: 0, phaseShown: null, drag: null, lastFrame: 0, raf: 0, overlay: null, teachQueue: [], seenTeach: {} };
  // ---------------- stage fit: always scale by height (the paintings are 9:16, phones are taller: the market sides may crop, the loom never does)
  function fit() { const vw = window.innerWidth, vh = window.innerHeight; ui.scale = vh / ART.h; const w = ART.w * ui.scale; ui.left = (vw - w) / 2; ui.top = 0; nodes.stage.style.transform = `translate(${ui.left}px,${ui.top}px) scale(${ui.scale})`; }
  const toArt = ev => ({ x: (ev.clientX - ui.left) / ui.scale, y: (ev.clientY - ui.top) / ui.scale });
  const place = (e, x, y, w, h) => { e.style.left = x + 'px'; e.style.top = y + 'px'; if (w) e.style.width = w + 'px'; if (h) e.style.height = h + 'px'; return e; };
  // ---------------- HUD
  function hud() {
    const run = ui.run; if (!run || ['SETTLED', 'ABANDONED'].includes(run.phase) && ui.mode !== 'settled') { nodes.hud.hidden = true; return; }
    nodes.hud.hidden = false;
    const ph = run.phase; let label = '已完成', n = 0, total = 5;
    if (ph === 'SORT') { label = '已理丝线'; n = run.sort.count; } else if (ph === 'WARP' || ph === 'WARP_DONE') { label = '已定经线'; n = run.warp.count; }
    else if (ph === 'URGENT') { label = '急线'; n = run.urgent.required.filter(id => run.urgent.board.lit[id]).length; total = 2; }
    else n = run.weave.board.roundCount;
    nodes.hudCount.innerHTML = `${label} <b>${n}</b>/${total}`;
    const secs = ph === 'URGENT' ? Math.ceil(run.urgent.msLeft / 1000) : Math.ceil(run.timeLeftMs / 1000), frac = ph === 'URGENT' ? run.urgent.msLeft / 8000 : run.timeLeftMs / (E.CONFIG.totalSeconds * 1000);
    nodes.hudSecs.textContent = run.mode === 'trial' ? '—' : String(Math.max(0, secs)); nodes.hudFill.style.width = (run.mode === 'trial' ? 100 : Math.max(0, frac) * 100) + '%'; nodes.hudSun.style.left = (run.mode === 'trial' ? 100 : Math.max(0, frac) * 100) + '%';
  }
  // ---------------- phases
  function showPhase(force) {
    const run = ui.run, key = run.phase + (run.phase === 'WEAVE' ? ':' + run.weave.round : '');
    if (!force && ui.phaseShown === key) { refresh(); return; }
    ui.phaseShown = key; nodes.layer.replaceChildren(); nodes.lines.replaceChildren(); nodes.chips.replaceChildren();
    if (run.phase === 'SORT') renderSort(); else if (run.phase === 'WARP') renderWarp(); else if (run.phase === 'WARP_DONE') renderWarpDone(); else if (run.phase === 'WEAVE' || run.phase === 'URGENT' || run.phase === 'ROUND_TRANSITION') renderWeave(); else if (run.phase === 'SETTLED') renderSettle();
    refresh();
  }
  function refresh() { const run = ui.run; hud(); if (run.phase === 'SORT') refreshSort(); else if (run.phase === 'WARP') refreshWarp(); else if (['WEAVE', 'URGENT', 'ROUND_TRANSITION'].includes(run.phase)) refreshWeave(); }
  // ---- 理丝 (UI-01 / UI-02)
  function renderSort() {
    nodes.bg.src = 'art/bg_sort.jpg'; const run = ui.run;
    for (let i = 0; i < 5; i++) { const id = IDS[i], t = place(el('div', 'piece paper tag', glyph(id) + `<div class="bar" style="background:${ID[id].hex}"></div>`), ART.tagX[i] - 38, ART.tagY, 76, 88); t.dataset.slot = id; t.style.color = id === 'white' ? '#c9b58f' : ID[id].hex; nodes.layer.append(t); }
    for (let i = 0; i < 5; i++) { const sl = place(el('div', 'piece slot'), ART.trayX[i] - 60, ART.trayY, 120, 178); sl.style.backgroundImage = 'url(art/slot_empty.png)'; nodes.layer.append(sl); }
    run.sort.tray.forEach((id, i) => { const b = place(el('div', 'piece bundle'), ART.trayX[i] - 60, ART.trayY, 120, 178); b.style.backgroundImage = `url(art/bundle_tray_${id}.png)`; b.dataset.id = id; b.dataset.home = i; nodes.layer.append(b); b.addEventListener('pointerdown', ev => startBundleDrag(ev, b)); });
  }
  function refreshSort() { const run = ui.run; for (const t of nodes.layer.querySelectorAll('.tag')) t.classList.toggle('locked', Boolean(run.sort.placed[t.dataset.slot])); }
  function startBundleDrag(ev, b) {
    const run = ui.run; if (run.phase !== 'SORT' || run.paused || b.classList.contains('placed') || ui.drag) return; ev.preventDefault();
    const p = toArt(ev), home = { x: ART.trayX[+b.dataset.home] - 60, y: ART.trayY }; ui.drag = { kind: 'bundle', el: b, id: b.dataset.id, off: { x: p.x - home.x, y: p.y - home.y }, home };
    b.classList.add('drag'); b.setPointerCapture && b.setPointerCapture(ev.pointerId);
  }
  function hoverTag(p) { for (const t of nodes.layer.querySelectorAll('.tag')) { const x = parseFloat(t.style.left), y = parseFloat(t.style.top), hit = p.x >= x - 18 && p.x <= x + 94 && p.y >= y - 60 && p.y <= y + 110; t.classList.toggle('hover', hit && !t.classList.contains('locked')); if (hit) return t; } return null; }
  function moveBundle(ev) { const d = ui.drag, p = toArt(ev); d.el.style.transform = `translate(${p.x - d.off.x - d.home.x}px,${p.y - d.off.y - d.home.y}px)`; hoverTag({ x: p.x - d.off.x + 60, y: p.y - d.off.y + 70 }); }
  function endBundle(ev) {
    const d = ui.drag, p = toArt(ev), tag = hoverTag({ x: p.x - d.off.x + 60, y: p.y - d.off.y + 70 }); ui.drag = null; d.el.classList.remove('drag');
    for (const t of nodes.layer.querySelectorAll('.tag')) t.classList.remove('hover');
    const r = tag ? E.sortDrop(ui.run, d.id, tag.dataset.slot) : { ok: false };
    if (r.ok) { const i = IDS.indexOf(d.id); d.el.classList.add('placed'); d.el.style.transform = `translate(${ART.tagX[i] - 60 - d.home.x}px,${ART.tagY + 60 - d.home.y}px) scale(.62)`; tag.classList.add('hit'); setTimeout(() => tag.classList.remove('hit'), 500); if (r.done) setTimeout(() => showPhase(), 420); }
    else { d.el.style.transform = 'translate(0,0)'; if (tag) { tag.classList.add('shake'); setTimeout(() => tag.classList.remove('shake'), 400); } }
    refresh();
  }
  // ---- 定经 (UI-03 / UI-04)
  function renderWarp() {
    nodes.bg.src = 'art/bg_warp.jpg'; const run = ui.run;
    for (let i = 0; i < 5; i++) {
      const id = IDS[i]; const s = place(el('div', 'piece paper scale', `<div class="lbl">过紧</div><div class="track" style="--silk:${ID[id].hex}"><div class="band">合宜</div><div class="ind"></div></div><div class="lbl">过松</div>`), ART.scaleX[i] - 31, ART.scaleY, 62, 286); s.dataset.group = i; nodes.layer.append(s);
      const wp = place(el('div', 'piece woodpatch'), ART.weightX[i] - 42, ART.weightY - 8, 84, 198); wp.style.backgroundImage = 'url(art/wood_patch.png)'; nodes.layer.append(wp);
      const w = place(el('div', 'piece weight'), ART.weightX[i] - 42, ART.weightY, 84, 182); w.style.backgroundImage = 'url(art/weight.png)'; w.dataset.group = i; nodes.layer.append(w);
      for (const target of [s, w]) target.addEventListener('pointerdown', ev => { if (run.phase !== 'WARP' || run.paused || ui.drag) return; ev.preventDefault(); ui.drag = { kind: 'warp', group: i, y0: toArt(ev).y, v0: run.warp.values[i] }; target.setPointerCapture && target.setPointerCapture(ev.pointerId); });
    }
  }
  function refreshWarp() {
    const run = ui.run; nodes.layer.querySelectorAll('.scale').forEach(s => { const i = +s.dataset.group, v = run.warp.values[i], track = s.querySelector('.track'), h = track.clientHeight || 190; const band = s.querySelector('.band'), lo = E.CONFIG.warpBand[0], hi = E.CONFIG.warpBand[1];
      band.style.top = ((1 - hi) * h) + 'px'; band.style.height = ((hi - lo) * h) + 'px'; s.querySelector('.ind').style.top = ((1 - v) * h - 9) + 'px'; s.classList.toggle('ok', run.warp.done[i]); });
    nodes.layer.querySelectorAll('.weight').forEach(w => { const v = run.warp.values[+w.dataset.group]; w.style.transform = `translateY(${((0.5 - v) * 60).toFixed(1)}px)`; });
  }
  function moveWarp(ev) { const d = ui.drag, p = toArt(ev); E.warpSet(ui.run, d.group, d.v0 + (d.y0 - p.y) / 230); if (ui.run.phase === 'WARP_DONE') { ui.drag = null; showPhase(); } else refresh(); }
  function renderWarpDone() {
    nodes.bg.src = 'art/bg_warp_done.jpg';
    const btn = place(el('div', 'piece hit-btn'), 249, 1275, 363, 78); btn.setAttribute('role', 'button'); btn.setAttribute('aria-label', '进入开工'); btn.addEventListener('pointerdown', ev => { ev.preventDefault(); if (E.warpSkip(ui.run).ok) showPhase(); }); nodes.layer.append(btn);
  }
  // ---- 开工 / 急束 (UI-05 / UI-06 / UI-07)
  function boardOf() { const run = ui.run; return run.phase === 'URGENT' ? run.urgent.board : run.weave.board; }
  function renderWeave() {
    nodes.bg.src = 'art/bg_weave.jpg'; const run = ui.run;
    for (let i = 0; i < 5; i++) { const id = IDS[i], b = place(el('div', 'piece bundle-top'), ART.cols[i] - 58, ART.bundleTopY, 116, 164); b.style.backgroundImage = `url(art/bundle_top_${id}.png)`; b.dataset.id = id; nodes.layer.append(b); b.addEventListener('pointerdown', ev => startLine(ev, id)); }
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) { const n = E.node(r, c), ring = place(el('div', 'piece ring', '<div class="bead"></div>'), ART.cols[c] - 31, ART.rows[r] - 31, 62, 62); ring.style.backgroundImage = 'url(art/ring.png)'; ring.dataset.node = n; nodes.layer.append(ring); ring.addEventListener('pointerdown', ev => ringDown(ev, n)); }
    for (let j = 0; j < 5; j++) { const t = place(el('div', 'piece paper target'), ART.cols[j] - 42, ART.targetY, 84, 104); t.dataset.slot = j; nodes.layer.append(t); }
    refreshWeave();
  }
  function refreshWeave() {
    const run = ui.run, b = boardOf(), urgent = run.phase === 'URGENT';
    nodes.layer.querySelectorAll('.target').forEach(t => { const j = +t.dataset.slot, id = b.targets[j]; if (t.dataset.id !== id) { t.dataset.id = id; t.innerHTML = glyph(id); t.style.setProperty('--silk', ID[id].hex); } t.classList.toggle('lit', Boolean(b.lit[id])); t.classList.toggle('urgent-req', urgent && run.urgent.required.includes(id)); });
    nodes.layer.querySelectorAll('.bundle-top').forEach(x => { x.classList.toggle('done', Boolean(b.lit[x.dataset.id])); x.classList.toggle('urgent-req', urgent && run.urgent.required.includes(x.dataset.id)); });
    const litNodes = {}; for (const [id, p] of Object.entries(b.paths)) for (const n of p) litNodes[n] = id; if (b.current) for (const n of b.current.nodes) litNodes[n] = b.current.identity;
    const loose = !urgent && run.weave.loose, knot = !urgent && run.weave.knot;
    nodes.layer.querySelectorAll('.ring').forEach(r => { const n = +r.dataset.node, id = litNodes[n]; r.classList.toggle('lit', Boolean(id)); if (id) r.style.setProperty('--silk', ID[id].hex); r.classList.toggle('loose-from', Boolean(loose && (n === loose.from || n === loose.to))); r.classList.toggle('knot', Boolean(knot && knot.node === n)); });
    drawLines(); drawChips();
  }
  const pt = n => ({ x: ART.cols[E.colOf(n)], y: ART.rows[E.rowOf(n)] });
  function pathD(id, pts) { const k = IDS.indexOf(id) - 2, o = k * 3; return pts.map((p, i) => (i ? 'L' : 'M') + (p.x + o).toFixed(1) + ' ' + (p.y + o).toFixed(1)).join(' '); }
  function drawLines() {
    const run = ui.run, b = boardOf(), svg = nodes.lines; svg.replaceChildren(); const loose = run.phase === 'WEAVE' ? run.weave.loose : null;
    const draw = (id, pts, cls) => { const d = pathD(id, pts); for (const [c, extra] of [['line-shadow', ''], ['line-core', `stroke:${ID[id].hex}`], ['line-twist', '']]) { const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', d); p.setAttribute('class', c + (cls ? ' ' + cls : '')); if (extra) p.setAttribute('style', extra); svg.append(p); } };
    for (const [id, path] of Object.entries(b.paths)) {
      const i = IDS.indexOf(id), j = b.targets.indexOf(id), pts = [{ x: ART.cols[i], y: ART.bundleTopY + 150 }, ...path.map(pt), { x: ART.cols[j], y: ART.targetY + 4 }];
      if (loose && loose.identity === id) { const s = loose.segment + 1; draw(id, pts.slice(0, s + 1)); draw(id, pts.slice(s, s + 2), 'line-loose'); draw(id, pts.slice(s + 1)); } else draw(id, pts);
    }
    if (b.current) { const i = IDS.indexOf(b.current.identity), pts = [{ x: ART.cols[i], y: ART.bundleTopY + 150 }, ...b.current.nodes.map(pt)]; if (ui.drag && ui.drag.kind === 'line' && ui.drag.at) pts.push(ui.drag.at); draw(b.current.identity, pts); }
    if (ui.drag && ui.drag.kind === 'repair' && ui.drag.at && loose) draw(loose.identity, [pt(ui.drag.from), ui.drag.at], 'line-loose');
  }
  function drawChips() {
    const run = ui.run; nodes.chips.replaceChildren();
    if (run.phase === 'URGENT') { nodes.chips.append(place(el('div', 'piece urgent-bar', `<span>⌛</span><span>急束！<b>${Math.max(0, Math.ceil(run.urgent.msLeft / 1000))}</b>秒内完结</span>`), 165, 266, 534, 50)); return; }
    if (run.phase !== 'WEAVE') return;
    if (run.weave.loose) nodes.chips.append(el('div', 'chip red', `丝头松脱 · 拖回接上<b>${Math.max(0, Math.ceil(run.weave.loose.msLeft / 1000))}</b>`));
    else if (run.weave.knot) { nodes.chips.append(el('div', 'chip', '丝结缠住 · 点开线结')); const k = pt(run.weave.knot.node), m = place(el('div', 'knot-mark', '结'), k.x, k.y); m.addEventListener('pointerdown', ev => { ev.preventDefault(); ev.stopPropagation(); if (E.knotUntie(ui.run, ui.run.weave.knot.node).ok) refresh(); }); nodes.chips.append(m); }
  }
  function nearestNode(p) { let best = null, bd = 1e9; for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) { const dx = p.x - ART.cols[c], dy = p.y - ART.rows[r], d = dx * dx + dy * dy; if (d < bd) { bd = d; best = E.node(r, c); } } return bd <= 36 * 36 ? best : null; }
  function slotAt(p) { if (p.y < ART.targetY - 10 || p.y > ART.targetY + 150) return null; for (let j = 0; j < 5; j++) if (Math.abs(p.x - ART.cols[j]) <= 48) return j; return null; }
  function startLine(ev, id) {
    const run = ui.run; if (!(run.phase === 'WEAVE' || run.phase === 'URGENT') || run.paused || ui.drag) return; ev.preventDefault();
    const r = E.weaveStart(run, id); if (!r.ok) { if (r.reason === 'KNOT' || r.reason === 'LOOSE') flashChips(); return; }
    ui.drag = { kind: 'line', id, at: toArt(ev) }; nodes.stage.setPointerCapture && nodes.stage.setPointerCapture(ev.pointerId); refreshWeave();
  }
  function ringDown(ev, n) { // repairing a loose thread starts from one of its two rings
    const run = ui.run; if (run.phase !== 'WEAVE' || !run.weave.loose || ui.drag) return; const l = run.weave.loose; if (n !== l.from && n !== l.to) return; ev.preventDefault(); ui.drag = { kind: 'repair', from: n, at: toArt(ev) };
  }
  function moveLine(ev) { const d = ui.drag, p = toArt(ev); d.at = p; const n = nearestNode(p); if (n !== null) E.weaveExtend(ui.run, n); refreshWeave(); }
  function endLine(ev) {
    const d = ui.drag, p = toArt(ev); ui.drag = null; const slot = slotAt(p); const r = E.weaveRelease(ui.run, slot);
    if (!r.ok && slot !== null) { const t = nodes.layer.querySelector(`.target[data-slot="${slot}"]`); if (t) { t.classList.add('shake'); setTimeout(() => t.classList.remove('shake'), 400); } }
    afterAction(r);
  }
  function moveRepair(ev) { ui.drag.at = toArt(ev); drawLines(); }
  function endRepair(ev) { const d = ui.drag, p = toArt(ev); ui.drag = null; const n = nearestNode(p); if (n !== null && n !== d.from) E.looseRepair(ui.run, d.from, n); refreshWeave(); }
  function flashChips() { nodes.chips.classList.add('flash'); setTimeout(() => nodes.chips.classList.remove('flash'), 300); }
  function afterAction(r) {
    const run = ui.run; if (run.phase === 'SETTLED') { showSettled(); return; }
    if (r && r.events) for (const e of r.events) { if (e.type === 'LOOSE_START' && e.teach) teach('loose'); if (e.type === 'KNOT' && e.teach) teach('knot'); if (e.type === 'URGENT_START') showPhase(true); }
    if (run.phase === 'URGENT' || run.phase === 'ROUND_TRANSITION') showPhase(true); else refresh();
  }
  // ---- 今日收工 (UI-08)
  function showSettled() { ui.mode = 'settled'; showPhase(true); }
  function renderSettle() {
    nodes.bg.src = 'art/bg_settle.jpg'; const run = ui.run, w = run.wages; nodes.hud.hidden = true;
    if (run.status === 'trial') { openOverlay('trialEnd'); return; }
    // PATCH A (hotfix v1.0): the main plaque states the work result; the end reason (日影已尽) is secondary text; 合计收入 carries the highest weight; the woven count is a light line under the income block and the painted closing line (巧手织锦绣，汗水换金银) stays visible. Values are the settlement state, never recomputed.
    nodes.layer.append(place(el('div', 'piece paper settle-status', '顺利收工'), 236, 400, 392, 66));
    const rows = [[603, '基础工钱', w.base], [686, '常规加赏', w.regular], [766, '急束加成', w.urgent]];
    for (const [y, label, v] of rows) { nodes.layer.append(place(el('div', 'piece settle-label', label), 300, y - 22, 150, 44)); nodes.layer.append(place(el('div', 'piece settle-value', String(v)), 576, y - 26, 100, 52)); }
    nodes.layer.append(place(el('div', 'piece settle-value total', String(w.total)), 556, 855 - 34, 130, 68));
    nodes.layer.append(place(el('div', 'piece settle-stats', (run.status === 'timeout' ? '日影已尽 · ' : '') + `本次织成 ${w.totalCompleted} / 15 根 · 完成 ${w.roundsCompleted} 轮`), 214, 908, 436, 38));
    const stay = place(el('div', 'piece hit-btn'), 164, 1087, 244, 88), leave = place(el('div', 'piece hit-btn'), 460, 1087, 241, 88);
    stay.setAttribute('role', 'button'); stay.setAttribute('aria-label', '继续留坊'); leave.setAttribute('role', 'button'); leave.setAttribute('aria-label', '离开织坊');
    stay.addEventListener('pointerdown', ev => { ev.preventDefault(); startRun('formal'); }); leave.addEventListener('pointerdown', ev => { ev.preventDefault(); toEntry(); }); nodes.layer.append(stay, leave);
  }
  // ---------------- overlays: entry / pause / help / confirm / teaching cards
  function openOverlay(kind, data) {
    ui.overlay = kind; const run = ui.run; if (run && ['SORT', 'WARP', 'WARP_DONE', 'WEAVE', 'ROUND_TRANSITION', 'URGENT'].includes(run.phase)) E.pause(run);
    const card = el('div', 'card' + (kind === 'help' ? ' wide' : '')); nodes.overlay.replaceChildren(card); nodes.overlay.hidden = false;
    const btn = (label, fn, cls) => { const b = el('button', 'btn ' + (cls || ''), label); b.type = 'button'; b.addEventListener('click', fn); return b; };
    if (kind === 'entry') { card.innerHTML = '<h2>于阗织坊</h2><p class="sub">帮工试玩 · FINAL v5.0 · 未接入主游戏</p><p class="sub">理丝 → 定经 → 开工（三轮 × 五根） → 今日收工</p>'; const m = el('div', 'menu'); m.append(btn('正式帮工', () => startRun('formal'), 'primary'), btn('先试一试', () => startRun('trial')), btn('玩法说明', () => openOverlay('help', { back: 'entry' }), 'quiet')); card.append(m); }
    if (kind === 'pause') { card.innerHTML = '<h2>暂停</h2><p class="sub">日影已停</p>'; const m = el('div', 'menu'); m.append(btn('继续游戏', closeOverlay, 'primary'), btn('重新开始', () => { closeOverlay(); startRun(ui.run.mode); }), btn('玩法说明', () => openOverlay('help', { back: 'pause' }), 'quiet'), btn('退出游戏', () => openOverlay('quit'), 'quiet')); card.append(m); }
    if (kind === 'quit') { card.innerHTML = '<h2>尚未收工</h2><p style="text-align:center">此时离开，今日工钱不作结，也不耗去时辰。</p>'; const m = el('div', 'menu'); m.append(btn('继续理丝', () => openOverlay('pause'), 'primary'), btn('离开织坊', () => { E.abandon(ui.run); toEntry(); }, 'quiet')); card.append(m); }
    if (kind === 'help') { card.innerHTML = helpHtml(); const m = el('div', 'menu'); m.append(btn('返回', () => data && data.back === 'pause' ? openOverlay('pause') : data && data.back === 'entry' ? openOverlay('entry') : closeOverlay(), 'primary')); card.append(m); }
    if (kind === 'teach') { card.innerHTML = data.html; const m = el('div', 'menu'); m.append(btn('知道了', () => { closeOverlay(); nextTeach(); }, 'primary')); card.append(m); }
    if (kind === 'trialEnd') { card.innerHTML = '<h2>试工结束</h2><p style="text-align:center">三道工序都试过了。正式帮工时，日影七十五息共享理丝、定经与开工，工钱按当日织成的根数结算。</p>'; const m = el('div', 'menu'); m.append(btn('正式帮工', () => startRun('formal'), 'primary'), btn('返回', toEntry, 'quiet')); card.append(m); }
    card.querySelector('h2, p')?.focus?.();
  }
  function closeOverlay() { ui.overlay = null; nodes.overlay.hidden = true; nodes.overlay.replaceChildren(); const run = ui.run; if (run) { E.resume(run); ui.lastFrame = performance.now(); } }
  function teach(kind) { ui.teachQueue.push(kind); if (ui.overlay !== 'teach') nextTeach(); }
  function nextTeach() { const kind = ui.teachQueue.shift(); if (!kind) return; openOverlay('teach', { html: kind === 'loose' ? TEACH.loose : TEACH.knot }); }
  const TEACH = {
    loose: '<h2>丝头松脱</h2><div class="teach"><p>织到一半，线路上有一处丝头从圆环脱开了。脱开的那一段会变成虚线，两端的圆环发亮。</p><p>在五息之内，从发亮的圆环按住，拖到相邻那一环，把丝头重新接回。</p><p>接回了，这根线照旧算数；没接回，这根线会散掉，要重新织。</p></div><p class="sub">正式帮工时只有一条小提示与倒数，不会再弹出这张说明。</p>',
    knot: '<h2>丝结缠住</h2><div class="teach"><p>两根丝线在同一个圆环交叉时，可能缠成一个线结。线结会标在交叉的圆环上。</p><p>点一下线结，把它解开，再继续连线。线结没解开之前，新的丝线不能起头。</p></div><p class="sub">正式帮工时只有一条小提示，不会再弹出这张说明。</p>'
  };
  function helpHtml() { return '<h2>玩法说明</h2><h3>理丝</h3><p>按丝色与纹样，把下方的散丝拖到上方对应挂位。颜色与纹样都对才会挂住；不对的丝束回到原处。</p><h3>定经</h3><p>上下拖动配重，让五组经线都落入绿色「合宜」。五组齐了，中央出现「经线已齐，可开工织造」，一息半后自动开工，也可以直接点「进入开工」。</p><h3>开工</h3><p>从上方丝线起头，沿相邻的圆环走，最后接到下方对应的纹样。直接拖到纹样、没有经过圆环，不算。每轮五根，连织三轮，共十五根；每轮下方纹样重新打乱，全部灰色，接上的才亮起。</p><h3>日影</h3><p>正式帮工共七十五息，理丝、定经、开工共用。暂停、急束、定经转场时停表。日影尽时按已织成的根数照常结算。</p><h3>急束</h3><p>开工到七根以后可能来一单急束：独立八息，完成两根指定急线得一钱加赏；没完成不扣钱。急束期间日影停表。</p>' + TEACH.loose.replace('<h2>', '<h3>').replace('</h2>', '</h3>').replace(/<p class="sub">.*<\/p>/, '') + TEACH.knot.replace('<h2>', '<h3>').replace('</h2>', '</h3>').replace(/<p class="sub">.*<\/p>/, '') + '<h3>工钱</h3><p>织成 0–4 根 9 钱；5–9 根 11 钱；10–14 根 15 钱；15 根 19 钱。每织完一轮加赏 1 钱（最多 3 钱）；急束成功另加 1 钱；最高 23 钱。</p><h3>中途离开</h3><p>只有主动离开织坊不作结、不耗时辰；时间到、只完成一部分，都照常结算。</p>'; }
  // ---------------- run control
  function startRun(mode, options) { closeOverlay(); ui.run = E.createRun(Object.assign({ mode }, options || {})); ui.mode = 'run'; ui.phaseShown = null; ui.drag = null; ui.teachQueue = []; nodes.hud.hidden = false; showPhase(true); ui.lastFrame = performance.now(); }
  function toEntry() { closeOverlay(); ui.run = null; ui.mode = 'entry'; ui.phaseShown = null; nodes.layer.replaceChildren(); nodes.lines.replaceChildren(); nodes.chips.replaceChildren(); nodes.bg.src = 'art/bg_sort.jpg'; nodes.hud.hidden = true; openOverlay('entry'); }
  function frame(now) {
    ui.raf = requestAnimationFrame(frame); const run = ui.run; if (!run || ui.mode !== 'run') return;
    const dt = Math.min(250, now - (ui.lastFrame || now)); ui.lastFrame = now; if (!dt) return;
    const events = E.tick(run, dt); if (run.phase === 'SETTLED') { showSettled(); return; }
    for (const e of events) { if (['WEAVE_START', 'ROUND_START', 'URGENT_END'].includes(e.type)) { ui.drag = null; showPhase(true); } if (e.type === 'LOOSE_FAILED') { ui.drag = null; refresh(); } }
    if (run.phase === 'URGENT' || run.weave.loose) drawChips(); hud();
  }
  // ---------------- input plumbing
  nodes.stage.addEventListener('pointermove', ev => { if (!ui.drag) return; ev.preventDefault(); if (ui.drag.kind === 'bundle') moveBundle(ev); else if (ui.drag.kind === 'warp') moveWarp(ev); else if (ui.drag.kind === 'line') moveLine(ev); else if (ui.drag.kind === 'repair') moveRepair(ev); });
  const up = ev => { if (!ui.drag) return; if (ui.drag.kind === 'bundle') endBundle(ev); else if (ui.drag.kind === 'warp') { ui.drag = null; refresh(); } else if (ui.drag.kind === 'line') endLine(ev); else if (ui.drag.kind === 'repair') endRepair(ev); };
  nodes.stage.addEventListener('pointerup', up); nodes.stage.addEventListener('pointercancel', up); window.addEventListener('pointerup', up);
  nodes.pause.addEventListener('click', () => { if (ui.run && ui.mode === 'run') openOverlay('pause'); });
  window.addEventListener('resize', () => { fit(); refresh(); });
  window.addEventListener('keydown', ev => { if (ev.key === 'Escape' && ui.run && ui.mode === 'run' && !ui.overlay) openOverlay('pause'); });
  fit(); nodes.bg.src = 'art/bg_sort.jpg'; openOverlay('entry'); ui.raf = requestAnimationFrame(frame);
  window.YutianWeavingUI = { ui, startRun, toEntry, E, openOverlay, closeOverlay, showPhase, refresh };
})();
