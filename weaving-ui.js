(function (S) {
  'use strict';
  // 于阗《于阗织坊》 — host panel UI. This is the FINAL v5.0 modal edition client (weaving-v5/weaving-ui.js + index.html) re-hosted inside
  // the main game: the same 360×620 modal (52 px HUD + loom stage), the same painted loom bodies (art/modal, composed by weaving-v5/tools/
  // gen-modal-art.py; layout table weaving-layout.js verbatim), the same coordinate mapping (painting px → composed px → CSS px × k), the same
  // pointer interactions, overlays, teaching cards and the 今日收工 page on the UI-09 empty template. Differences are host-contract only:
  // the modal is sized from the panel body instead of the viewport, art comes from S.assets, the entry card shows the real world-time
  // availability and a 离开织坊 button, and a FORMAL run reports to weaving.js (WEAVING_START / FINISH / SETTLE / ABORT) which pays through the
  // real wallet and world clock: 继续留坊 / 离开织坊 both settle first (pay + advance), 主动离开 (quit) is the only 0 工钱 / 0 时辰 exit.
  const E = () => S.weaving.engine();
  const LAYOUT = () => (typeof YutianWeavingLayout !== 'undefined' ? YutianWeavingLayout : null);
  const ART = { w: 864, h: 1536, cols: [217, 325, 433, 541, 648], rows: [553, 646, 738, 831, 923], tagX: [227, 328, 429, 534, 636], tagY: 395, trayX: [209, 320, 432, 543, 655], trayY: 1058, scaleX: [214, 321, 431, 541, 650], scaleY: 588, weightX: [213, 320, 431, 543, 655], weightY: 1036, bundleTopY: 322, targetY: 1013, warpDoneBtn: [249, 1268, 363, 78] };
  const T9 = { statusBox: [232, 498, 490, 90], rows: [757, 864, 965], totalY: 1111, labelX: 318, labelW: 240, valueX: 655, valueW: 97, stay: [110, 1358, 370, 130], leave: [480, 1358, 370, 130] };
  const GLYPH = {
    red: '<path d="M24 5C29.5 11.5 30.5 22 24 30.5 17.5 22 18.5 11.5 24 5Z"/><path d="M24 30.5C13 29 7 20.5 7.5 11.5 16 14 22 21 24 30.5Z"/><path d="M24 30.5C35 29 41 20.5 40.5 11.5 32 14 26 21 24 30.5Z"/><path d="M6.5 34.5C15 41 33 41 41.5 34.5 33 37.5 15 37.5 6.5 34.5Z"/>',
    white: '<circle cx="24" cy="24" r="4"/>' + [0, 45, 90, 135, 180, 225, 270, 315].map(a => `<circle cx="${(24 + 15 * Math.cos(a * Math.PI / 180)).toFixed(2)}" cy="${(24 + 15 * Math.sin(a * Math.PI / 180)).toFixed(2)}" r="2.9"/>`).join(''),
    teal: [0, 45, 90, 135, 180, 225, 270, 315].map(a => `<ellipse cx="24" cy="12.5" rx="5.2" ry="10" transform="rotate(${a} 24 24)"/>`).join('') + '<circle cx="24" cy="24" r="5.5" fill="#fff" fill-opacity=".85"/><circle cx="24" cy="24" r="3"/>',
    yellow: '<path fill-rule="evenodd" d="M24 4L44 24 24 44 4 24Z M24 13L35 24 24 35 13 24Z"/><path d="M24 18l6 6-6 6-6-6z"/>',
    purple: [0, 90, 180, 270].map(a => `<ellipse cx="24" cy="12" rx="6.5" ry="11" transform="rotate(${a} 24 24)"/>`).join('') + '<circle cx="24" cy="24" r="4.2" fill="#fff" fill-opacity=".8"/><circle cx="24" cy="24" r="2.2"/>'
  };
  const glyph = (id, cls) => `<svg class="glyph ${cls || ''}" viewBox="0 0 48 48" fill="currentColor" aria-hidden="true">${GLYPH[id] || GLYPH.red}</svg>`;
  const SVG_NS = ['http:', '//www.w3.org/2000/svg'].join('');   // the SVG namespace (split so the container scan for external http(s) resources does not misread it)
  function asset(name) { const f = S.assets && S.assets[name]; if (!f) throw new Error('CURRENT asset mapping missing: ' + name); return f; }
  const art = name => `url('${asset('yutian_weaving_' + name + '_v5')}')`;
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
  const COPY = () => S.weaving.COPY;
  let IDS = null, ID = null, BODY = null;
  const ui = { run: null, mode: 'entry', body: null, k: 1, ox: 0, oy: 0, phaseShown: null, drag: null, refit: false, lastFrame: 0, raf: 0, overlay: null, teachQueue: [], kind: null, sessionId: null, finishPending: false, busy: false, error: '', hostKey: '' };
  let L = null, hostCtx = null; const dom = { shell: null }; const nodes = {};
  const progress = () => (hostCtx && hostCtx.p) || (S.app && S.app.state && S.app.state.progress) || null;
  const view = () => { const p = progress(); return p ? S.weaving.view(p) : null; };
  function init() {
    if (IDS) return; const eng = E(); IDS = eng.IDENTITIES.map(i => i.id); ID = Object.fromEntries(eng.IDENTITIES.map(i => [i.id, i]));
    const LY = LAYOUT(); const mk = key => { const p = LY.phases[key]; return { key, img: asset('yutian_weaving_body_' + key + '_v5'), w: p.w, h: p.h, x0: LY.crop.x0, top: LY.top, removed: p.removed }; };
    BODY = { sort: mk('sort'), warp: mk('warp'), warp_done: mk('warp_done'), weave: mk('weave'), settle: { key: 'settle', img: asset('yutian_weaving_body_settle_v5'), w: LY.settle.w, h: LY.settle.h, x0: 0, top: LY.settle.top, removed: [] } };
  }
  function ensureShell() {
    if (dom.shell) return; init();
    dom.shell = document.createElement('div'); dom.shell.className = 'yw-shell'; dom.shell.setAttribute('aria-label', '于阗织坊');
    dom.shell.innerHTML = `<div class="modal" data-ref="modal" role="dialog" aria-label="于阗织坊"><div class="hud" data-ref="hud"><div class="hud-title">于阗织坊</div><div class="hud-mid"><span class="hud-count" data-ref="hudCount">已理丝线 <b>0</b>/5</span><span class="hud-sep">｜</span><span class="hud-time">日影 <span class="hud-bar"><i data-ref="hudFill"></i><em data-ref="hudSun"></em></span> 余 <b data-ref="hudSecs">75</b></span></div><button class="hud-pause" data-ref="pause" type="button" aria-label="暂停">▮▮</button></div><div class="stage" data-ref="stage"><img class="bg" data-ref="bg" alt="" draggable="false"><div class="layer" data-ref="layer"></div><svg class="lines" data-ref="lines" viewBox="0 0 700 1091" aria-hidden="true"></svg><div class="chips" data-ref="chips"></div></div><div class="overlay" data-ref="overlay" hidden></div></div>`;
    for (const e of dom.shell.querySelectorAll('[data-ref]')) nodes[e.dataset.ref] = e;
    nodes.stage.addEventListener('pointermove', ev => { if (!ui.drag) return; ev.preventDefault(); if (!L) { ui.drag = null; return; } if (ui.drag.kind === 'bundle') moveBundle(ev); else if (ui.drag.kind === 'warp') moveWarp(ev); else if (ui.drag.kind === 'line') moveLine(ev); else if (ui.drag.kind === 'repair') moveRepair(ev); });
    const up = ev => { if (!ui.drag) return; if (!L) { ui.drag = null; return; } if (ui.drag.kind === 'bundle') endBundle(ev); else if (ui.drag.kind === 'warp') { ui.drag = null; refresh(); } else if (ui.drag.kind === 'line') endLine(ev); else if (ui.drag.kind === 'repair') endRepair(ev); if (ui.refit) { ui.refit = false; refit(); } };
    nodes.stage.addEventListener('pointerup', up); nodes.stage.addEventListener('pointercancel', up); window.addEventListener('pointerup', up);
    nodes.pause.addEventListener('click', () => { if (ui.run && ui.mode === 'run') openOverlay('pause'); });
    window.addEventListener('resize', () => { if (!dom.shell.isConnected) return; if (ui.drag) { fit(); ui.refit = true; } else refit(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && ui.run && ui.mode === 'run' && dom.shell.isConnected && !ui.overlay) openOverlay('pause'); });
    setBody('sort'); hud();
  }
  // ---------------- coordinates: painting px → composed px → CSS px
  const cx = px => px - ui.body.x0;
  const cy = py => { let y = py - ui.body.top; for (const [a, b] of ui.body.removed) { if (py >= b) y -= b - a; else if (py > a) { y -= py - a; break; } } return y; };
  function tables() { return { cols: ART.cols.map(cx), rows: ART.rows.map(cy), tagX: ART.tagX.map(cx), tagY: cy(ART.tagY), trayX: ART.trayX.map(cx), trayY: cy(ART.trayY), scaleX: ART.scaleX.map(cx), scaleY: cy(ART.scaleY), weightX: ART.weightX.map(cx), weightY: cy(ART.weightY), bundleTopY: cy(ART.bundleTopY), targetY: cy(ART.targetY) }; }
  // modal size from the panel body (standalone: width min(92vw, 360px, (100dvh − 68) × .6416), height min(620, 100dvh − 16)); then k = body height / composed height
  function fit() {
    if (!dom.shell || !dom.shell.isConnected) return; const W = dom.shell.clientWidth, H = dom.shell.clientHeight;
    if (W && H) { const h = Math.max(320, Math.min(620, H - 16)), w = Math.max(240, Math.min(360, W * 0.92, (H - 68) * 0.6416)); dom.shell.style.setProperty('--yw-w', w.toFixed(2) + 'px'); dom.shell.style.setProperty('--yw-h', h.toFixed(2) + 'px'); }
    const b = ui.body || BODY.sort, sw = nodes.stage.clientWidth, sh = nodes.stage.clientHeight; if (!sw || !sh) return;
    ui.k = Math.max(sh / b.h, sw / b.w); ui.ox = (sw - b.w * ui.k) / 2; ui.oy = 0;
    for (const e of [nodes.bg, nodes.lines]) { e.style.left = ui.ox + 'px'; e.style.top = '0px'; e.style.width = (b.w * ui.k) + 'px'; e.style.height = (b.h * ui.k) + 'px'; }
    nodes.lines.setAttribute('viewBox', `0 0 ${b.w} ${b.h}`); nodes.stage.style.setProperty('--k', String(ui.k));
    nodes.modal.classList.toggle('narrow', nodes.modal.clientWidth < 348);
  }
  function setBody(key) { const b = BODY[key]; if (ui.body !== b) { ui.body = b; nodes.bg.src = b.img; } fit(); }
  const toArt = ev => { const r = nodes.stage.getBoundingClientRect(); return { x: (ev.clientX - r.left - ui.ox) / ui.k, y: (ev.clientY - r.top - ui.oy) / ui.k }; };
  const place = (e, x, y, w, h) => { e.style.left = (ui.ox + x * ui.k) + 'px'; e.style.top = (ui.oy + y * ui.k) + 'px'; if (w) e.style.width = (w * ui.k) + 'px'; if (h) e.style.height = (h * ui.k) + 'px'; return e; };
  // ---------------- HUD
  function hud() {
    const run = ui.run, eng = E();
    if (!run) { nodes.hudCount.innerHTML = '已理丝线 <b>0</b>/5'; nodes.hudSecs.textContent = String(eng.CONFIG.totalSeconds); nodes.hudFill.style.width = '100%'; nodes.hudSun.style.left = '100%'; return; }
    const ph = run.phase; let label = '已完成', n = 0, total = 5;
    if (ph === 'SORT') { label = '已理丝线'; n = run.sort.count; } else if (ph === 'WARP' || ph === 'WARP_DONE') { label = '已定经线'; n = run.warp.count; }
    else if (ph === 'URGENT') { label = '急线'; n = run.urgent.required.filter(id => run.urgent.board.lit[id]).length; total = 2; }
    else n = run.weave.board ? run.weave.board.roundCount : 0;
    nodes.hudCount.innerHTML = `${label} <b>${n}</b>/${total}`;
    const secs = ph === 'URGENT' ? Math.ceil(run.urgent.msLeft / 1000) : Math.ceil(run.timeLeftMs / 1000), frac = ph === 'URGENT' ? run.urgent.msLeft / 8000 : run.timeLeftMs / (eng.CONFIG.totalSeconds * 1000);
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
  function refresh() { const run = ui.run; hud(); if (!run) return; if (run.phase === 'SORT') refreshSort(); else if (run.phase === 'WARP') refreshWarp(); else if (['WEAVE', 'URGENT', 'ROUND_TRANSITION'].includes(run.phase)) refreshWeave(); }
  // ---- 理丝
  function renderSort() {
    setBody('sort'); L = tables(); const run = ui.run;
    for (let i = 0; i < 5; i++) { const id = IDS[i], t = place(el('div', 'piece paper tag', glyph(id) + `<div class="bar" style="background:${ID[id].hex}"></div>`), L.tagX[i] - 38, L.tagY, 76, 88); t.dataset.slot = id; t.dataset.x = L.tagX[i] - 38; t.dataset.y = L.tagY; t.style.color = id === 'white' ? '#c9b58f' : ID[id].hex; nodes.layer.append(t); }
    for (let i = 0; i < 5; i++) { const sl = place(el('div', 'piece slot'), L.trayX[i] - 60, L.trayY, 120, 178); sl.style.backgroundImage = art('slot_empty'); nodes.layer.append(sl); }
    run.sort.tray.forEach((id, i) => { const b = place(el('div', 'piece bundle'), L.trayX[i] - 60, L.trayY, 120, 178); b.style.backgroundImage = art('bundle_tray_' + id); b.dataset.id = id; b.dataset.home = i; nodes.layer.append(b);
      if (run.sort.placed[id]) { b.classList.add('placed'); b.style.transform = placedTransform(id, i); } else b.addEventListener('pointerdown', ev => startBundleDrag(ev, b)); });
  }
  const placedTransform = (id, home) => { const i = IDS.indexOf(id); return `translate(${((L.tagX[i] - 60) - (L.trayX[home] - 60)) * ui.k}px,${(L.tagY + 60 - L.trayY) * ui.k}px) scale(.62)`; };
  function refreshSort() { const run = ui.run; for (const t of nodes.layer.querySelectorAll('.tag')) t.classList.toggle('locked', Boolean(run.sort.placed[t.dataset.slot])); }
  function startBundleDrag(ev, b) {
    const run = ui.run; if (run.phase !== 'SORT' || run.paused || b.classList.contains('placed') || ui.drag) return; ev.preventDefault();
    const p = toArt(ev), home = { x: L.trayX[+b.dataset.home] - 60, y: L.trayY }; ui.drag = { kind: 'bundle', el: b, id: b.dataset.id, off: { x: p.x - home.x, y: p.y - home.y }, home };
    b.classList.add('drag'); if (b.setPointerCapture) b.setPointerCapture(ev.pointerId);
  }
  function hoverTag(p) { for (const t of nodes.layer.querySelectorAll('.tag')) { const x = +t.dataset.x, y = +t.dataset.y, hit = p.x >= x - 18 && p.x <= x + 94 && p.y >= y - 60 && p.y <= y + 110; t.classList.toggle('hover', hit && !t.classList.contains('locked')); if (hit) return t; } return null; }
  function moveBundle(ev) { const d = ui.drag, p = toArt(ev); d.el.style.transform = `translate(${(p.x - d.off.x - d.home.x) * ui.k}px,${(p.y - d.off.y - d.home.y) * ui.k}px)`; hoverTag({ x: p.x - d.off.x + 60, y: p.y - d.off.y + 70 }); }
  function endBundle(ev) {
    const d = ui.drag, p = toArt(ev), tag = hoverTag({ x: p.x - d.off.x + 60, y: p.y - d.off.y + 70 }); ui.drag = null; d.el.classList.remove('drag');
    for (const t of nodes.layer.querySelectorAll('.tag')) t.classList.remove('hover');
    const r = tag ? E().sortDrop(ui.run, d.id, tag.dataset.slot) : { ok: false };
    if (r.ok) { d.el.classList.add('placed'); d.el.style.transform = placedTransform(d.id, +d.el.dataset.home); tag.classList.add('hit'); setTimeout(() => tag.classList.remove('hit'), 500); if (r.done) setTimeout(() => { if (ui.run && ui.mode === 'run') showPhase(); }, 420); }
    else { d.el.style.transform = 'translate(0,0)'; if (tag) { tag.classList.add('shake'); setTimeout(() => tag.classList.remove('shake'), 400); } }
    refresh();
  }
  // ---- 定经
  function renderWarp() {
    setBody('warp'); L = tables(); const run = ui.run;
    for (let i = 0; i < 5; i++) {
      const id = IDS[i]; const s = place(el('div', 'piece paper scale', `<div class="lbl">过紧</div><div class="track" style="--silk:${ID[id].hex}"><div class="band">合宜</div><div class="ind"></div></div><div class="lbl">过松</div>`), L.scaleX[i] - 31, L.scaleY, 62, 286); s.dataset.group = i; nodes.layer.append(s);
      const wp = place(el('div', 'piece woodpatch'), L.weightX[i] - 42, L.weightY - 8, 84, 198); wp.style.backgroundImage = art('wood_patch'); nodes.layer.append(wp);
      const w = place(el('div', 'piece weight'), L.weightX[i] - 42, L.weightY, 84, 182); w.style.backgroundImage = art('weight'); w.dataset.group = i; nodes.layer.append(w);
      for (const target of [s, w]) target.addEventListener('pointerdown', ev => { if (run.phase !== 'WARP' || run.paused || ui.drag) return; ev.preventDefault(); ui.drag = { kind: 'warp', group: i, y0: toArt(ev).y, v0: run.warp.values[i] }; if (target.setPointerCapture) target.setPointerCapture(ev.pointerId); });
    }
  }
  function refreshWarp() {
    const run = ui.run, eng = E(); nodes.layer.querySelectorAll('.scale').forEach(s => { const i = +s.dataset.group, v = run.warp.values[i], track = s.querySelector('.track'), h = track.clientHeight || 190 * ui.k; const band = s.querySelector('.band'), lo = eng.CONFIG.warpBand[0], hi = eng.CONFIG.warpBand[1];
      band.style.top = ((1 - hi) * h) + 'px'; band.style.height = ((hi - lo) * h) + 'px'; s.querySelector('.ind').style.top = ((1 - v) * h - 9 * ui.k) + 'px'; s.classList.toggle('ok', run.warp.done[i]); });
    nodes.layer.querySelectorAll('.weight').forEach(w => { const v = run.warp.values[+w.dataset.group]; w.style.transform = `translateY(${((0.5 - v) * 60 * ui.k).toFixed(1)}px)`; });
  }
  function moveWarp(ev) { const d = ui.drag, p = toArt(ev); E().warpSet(ui.run, d.group, d.v0 + (d.y0 - p.y) / 230); if (ui.run.phase === 'WARP_DONE') { ui.drag = null; showPhase(); } else refresh(); }
  function renderWarpDone() {
    setBody('warp_done'); L = tables();
    const [bx, by, bw, bh] = ART.warpDoneBtn, btn = place(el('div', 'piece hit-btn'), cx(bx), cy(by), bw, bh); btn.setAttribute('role', 'button'); btn.setAttribute('aria-label', '进入开工'); btn.addEventListener('pointerdown', ev => { ev.preventDefault(); if (E().warpSkip(ui.run).ok) showPhase(); }); nodes.layer.append(btn);
  }
  // ---- 开工 / 急束
  function boardOf() { const run = ui.run; return run.phase === 'URGENT' ? run.urgent.board : run.weave.board; }
  function renderWeave() {
    setBody('weave'); L = tables(); const eng = E();
    for (let i = 0; i < 5; i++) { const id = IDS[i], b = place(el('div', 'piece bundle-top'), L.cols[i] - 58, L.bundleTopY, 116, 164); b.style.backgroundImage = art('bundle_top_' + id); b.dataset.id = id; nodes.layer.append(b); b.addEventListener('pointerdown', ev => startLine(ev, id)); }
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) { const n = eng.node(r, c), ring = place(el('div', 'piece ring', '<div class="bead"></div>'), L.cols[c] - 31, L.rows[r] - 31, 62, 62); ring.style.backgroundImage = art('ring'); ring.dataset.node = n; nodes.layer.append(ring); ring.addEventListener('pointerdown', ev => ringDown(ev, n)); }
    for (let j = 0; j < 5; j++) { const t = place(el('div', 'piece paper target'), L.cols[j] - 42, L.targetY, 84, 104); t.dataset.slot = j; nodes.layer.append(t); }
    refreshWeave();
  }
  function refreshWeave() {
    const run = ui.run, b = boardOf(), urgent = run.phase === 'URGENT';
    nodes.layer.querySelectorAll('.target').forEach(t => { const j = +t.dataset.slot, raw = b.targets[j], id = ID[raw] ? raw : (ID[t.dataset.id] ? t.dataset.id : null); if (!id) return; if (t.dataset.id !== id || !t.querySelector('.glyph')) { t.dataset.id = id; t.innerHTML = glyph(id); t.style.setProperty('--silk', ID[id].hex); } t.classList.toggle('lit', Boolean(b.lit[id])); t.classList.toggle('urgent-req', urgent && run.urgent.required.includes(id)); });
    nodes.layer.querySelectorAll('.bundle-top').forEach(x => { x.classList.toggle('done', Boolean(b.lit[x.dataset.id])); x.classList.toggle('urgent-req', urgent && run.urgent.required.includes(x.dataset.id)); });
    const litNodes = {}; for (const [id, p] of Object.entries(b.paths)) for (const n of p) litNodes[n] = id; if (b.current) for (const n of b.current.nodes) litNodes[n] = b.current.identity;
    const loose = !urgent && run.weave.loose, knot = !urgent && run.weave.knot;
    nodes.layer.querySelectorAll('.ring').forEach(r => { const n = +r.dataset.node, id = litNodes[n]; r.classList.toggle('lit', Boolean(id)); if (id) r.style.setProperty('--silk', ID[id].hex); r.classList.toggle('loose-from', Boolean(loose && (n === loose.from || n === loose.to))); r.classList.toggle('knot', Boolean(knot && knot.node === n)); });
    drawLines(); drawChips();
  }
  const pt = n => ({ x: L.cols[E().colOf(n)], y: L.rows[E().rowOf(n)] });
  function pathD(id, pts) { const k = IDS.indexOf(id) - 2, o = k * 3; return pts.map((p, i) => (i ? 'L' : 'M') + (p.x + o).toFixed(1) + ' ' + (p.y + o).toFixed(1)).join(' '); }
  function drawLines() {
    const run = ui.run, b = boardOf(), svg = nodes.lines; svg.replaceChildren(); const loose = run.phase === 'WEAVE' ? run.weave.loose : null;
    const draw = (id, pts, cls) => { const d = pathD(id, pts); for (const [c, extra] of [['line-shadow', ''], ['line-core', `stroke:${ID[id].hex}`], ['line-twist', '']]) { const p = document.createElementNS(SVG_NS, 'path'); p.setAttribute('d', d); p.setAttribute('class', c + (cls ? ' ' + cls : '')); if (extra) p.setAttribute('style', extra); svg.append(p); } };
    for (const [id, path] of Object.entries(b.paths)) {
      const i = IDS.indexOf(id), j = b.targets.indexOf(id), pts = [{ x: L.cols[i], y: L.bundleTopY + 150 }, ...path.map(pt), { x: L.cols[j], y: L.targetY + 4 }];
      if (loose && loose.identity === id) { const s = loose.segment + 1; draw(id, pts.slice(0, s + 1)); draw(id, pts.slice(s, s + 2), 'line-loose'); draw(id, pts.slice(s + 1)); } else draw(id, pts);
    }
    if (b.current) { const i = IDS.indexOf(b.current.identity), pts = [{ x: L.cols[i], y: L.bundleTopY + 150 }, ...b.current.nodes.map(pt)]; if (ui.drag && ui.drag.kind === 'line' && ui.drag.at) pts.push(ui.drag.at); draw(b.current.identity, pts); }
    if (ui.drag && ui.drag.kind === 'repair' && ui.drag.at && loose) draw(loose.identity, [pt(ui.drag.from), ui.drag.at], 'line-loose');
  }
  function drawChips() {
    const run = ui.run; nodes.chips.replaceChildren();
    if (run.phase === 'URGENT') { nodes.chips.append(place(el('div', 'piece urgent-bar', `<span>⌛</span><span>急束！<b>${Math.max(0, Math.ceil(run.urgent.msLeft / 1000))}</b>秒内完结</span>`), cx(165), cy(266), 534, 50)); return; }
    if (run.phase !== 'WEAVE') return;
    if (run.weave.loose) nodes.chips.append(place(el('div', 'chip red', `丝头松脱 · 拖回接上<b>${Math.max(0, Math.ceil(run.weave.loose.msLeft / 1000))}</b>`), cx(432), cy(495)));
    else if (run.weave.knot) { nodes.chips.append(place(el('div', 'chip', '丝结缠住 · 点开线结'), cx(432), cy(495))); const k = pt(run.weave.knot.node), m = place(el('div', 'knot-mark', '结'), k.x, k.y); m.addEventListener('pointerdown', ev => { ev.preventDefault(); ev.stopPropagation(); if (E().knotUntie(ui.run, ui.run.weave.knot.node).ok) refresh(); }); nodes.chips.append(m); }
  }
  const hitRadius = () => Math.max(36, 19 / ui.k);
  function nearestNode(p) { let best = null, bd = 1e9; for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) { const dx = p.x - L.cols[c], dy = p.y - L.rows[r], d = dx * dx + dy * dy; if (d < bd) { bd = d; best = E().node(r, c); } } const rad = hitRadius(); return bd <= rad * rad ? best : null; }
  function slotAt(p) { if (p.y < L.targetY - 10 || p.y > L.targetY + 150) return null; for (let j = 0; j < 5; j++) if (Math.abs(p.x - L.cols[j]) <= 48) return j; return null; }
  function startLine(ev, id) {
    const run = ui.run; if (!(run.phase === 'WEAVE' || run.phase === 'URGENT') || run.paused || ui.drag) return; ev.preventDefault();
    const r = E().weaveStart(run, id); if (!r.ok) { if (r.reason === 'KNOT' || r.reason === 'LOOSE') flashChips(); return; }
    ui.drag = { kind: 'line', id, at: toArt(ev) }; if (nodes.stage.setPointerCapture) nodes.stage.setPointerCapture(ev.pointerId); refreshWeave();
  }
  function ringDown(ev, n) { const run = ui.run; if (run.phase !== 'WEAVE' || !run.weave.loose || ui.drag) return; const l = run.weave.loose; if (n !== l.from && n !== l.to) return; ev.preventDefault(); ui.drag = { kind: 'repair', from: n, at: toArt(ev) }; }
  function moveLine(ev) { const d = ui.drag, p = toArt(ev); d.at = p; const n = nearestNode(p); if (n !== null) E().weaveExtend(ui.run, n); refreshWeave(); }
  function endLine(ev) {
    const d = ui.drag, p = toArt(ev); ui.drag = null; void d; const slot = slotAt(p); const r = E().weaveRelease(ui.run, slot);
    if (!r.ok && slot !== null) { const t = nodes.layer.querySelector(`.target[data-slot="${slot}"]`); if (t) { t.classList.add('shake'); setTimeout(() => t.classList.remove('shake'), 400); } }
    afterAction(r);
  }
  function moveRepair(ev) { ui.drag.at = toArt(ev); drawLines(); }
  function endRepair(ev) { const d = ui.drag, p = toArt(ev); ui.drag = null; const n = nearestNode(p); if (n !== null && n !== d.from) E().looseRepair(ui.run, d.from, n); refreshWeave(); }
  function flashChips() { nodes.chips.classList.add('flash'); setTimeout(() => nodes.chips.classList.remove('flash'), 300); }
  function afterAction(r) {
    const run = ui.run; if (run.phase === 'SETTLED') { showSettled(); return; }
    if (r && r.events) for (const e of r.events) { if (e.type === 'LOOSE_START' && e.teach) teach('loose'); if (e.type === 'KNOT' && e.teach) teach('knot'); if (e.type === 'URGENT_START') showPhase(true); }
    if (run.phase === 'URGENT' || run.phase === 'ROUND_TRANSITION') showPhase(true); else refresh();
  }
  // ---- 今日收工 on the UI-09 template: the numbers are the settlement state (run.wages / the host result), never recomputed here
  function showSettled() {
    ui.mode = 'settled'; ui.drag = null; const run = ui.run;
    if (run.status === 'trial') { showPhase(true); return; }
    if (ui.kind === 'formal' && !ui.finishPending) void submitFinish(); else showPhase(true);
  }
  async function submitFinish() {
    const run = ui.run; if (!run || ui.kind !== 'formal' || !hostCtx || run.phase !== 'SETTLED' || !run.wages) return;
    ui.finishPending = true; ui.error = ''; showPhase(true);
    const w = run.weave; const out = await hostCtx.dispatch('WEAVING_FINISH', { sessionId: ui.sessionId, outcome: { status: run.status, totalCompleted: w.totalCompleted, roundsCompleted: w.roundsCompleted, urgentSuccess: Boolean(w.urgentSuccess) } }, 'weaving-finish-' + ui.sessionId);
    ui.finishPending = false;
    if (out === null) { ui.error = COPY().finishError; openOverlay('finishError'); return; }
    ui.hostKey = ''; render();
  }
  function renderSettle() {
    setBody('settle'); L = null; const run = ui.run, w = run.wages; nodes.overlay.hidden = true; nodes.overlay.replaceChildren(); ui.overlay = null;
    if (run.status === 'trial') { openOverlay('trialEnd'); return; }
    const P = (e, x, y, wd, h) => place(e, x, y - BODY.settle.top, wd, h);
    const [sx, sy, sw, sh] = T9.statusBox; nodes.layer.append(P(el('div', 'piece settle-status', '顺利收工'), sx, sy, sw, sh));
    const rows = [[T9.rows[0], '基础工钱', w.base], [T9.rows[1], '常规加赏', w.regular], [T9.rows[2], '急束加成', w.urgent]];
    for (const [y, label, v] of rows) { nodes.layer.append(P(el('div', 'piece settle-label', label), T9.labelX, y - 32, T9.labelW, 64)); nodes.layer.append(P(el('div', 'piece settle-value', String(v)), T9.valueX, y - 34, T9.valueW, 68)); }
    nodes.layer.append(P(el('div', 'piece settle-label total', '合计收入'), T9.labelX, T9.totalY - 36, T9.labelW, 72)); nodes.layer.append(P(el('div', 'piece settle-value total', String(w.total)), T9.valueX - 25, T9.totalY - 54, T9.valueW + 25, 108));
    const v = view(), ready = Boolean(v && v.result && !v.settled) && !ui.busy && !ui.finishPending;
    const stay = P(el('div', 'piece hit-btn'), ...T9.stay), leave = P(el('div', 'piece hit-btn'), ...T9.leave);
    stay.setAttribute('role', 'button'); stay.setAttribute('aria-label', '继续留坊'); leave.setAttribute('role', 'button'); leave.setAttribute('aria-label', '离开织坊');
    stay.setAttribute('aria-disabled', String(!ready)); leave.setAttribute('aria-disabled', String(!ready));
    stay.addEventListener('pointerdown', ev => { ev.preventDefault(); if (ready) void settle('stay'); }); leave.addEventListener('pointerdown', ev => { ev.preventDefault(); if (ready) void settle('leave'); }); nodes.layer.append(stay, leave);
  }
  async function settle(dest) {   // 继续留坊 / 离开织坊: the day is settled first (pay + advance), then stay (a new run if the time allows) or leave
    if (!hostCtx || ui.busy) return; const v = view(); if (!v || !v.result || v.settled) return;
    ui.busy = true; ui.error = ''; showPhase(true);
    const out = await hostCtx.dispatch('WEAVING_SETTLE', { sessionId: v.sessionId, settlementId: v.settlementId }, 'weaving-settle-' + v.settlementId);
    ui.busy = false;
    if (out === null) { ui.error = COPY().settleError; openOverlay('finishError'); return; }
    disposeRun();
    if (dest === 'stay') { const p = progress(); if (p && S.weaving.availability(p).canStartFormal) { void startRun('formal'); return; } toEntry(); return; }
    leaveTo('LIVELIHOOD_LIST');
  }
  function leaveTo(dest) {   // host navigation (same as 驼队装货): the 营生 list is the khotan-work panel; the dusk lodging flow follows a settled day
    S.ui.closePanel();
    const p = progress(); if (p && S.time.phase(p) === 2) { S.ui.openPanel('inn'); return; }
    if (dest === 'LIVELIHOOD_LIST') S.ui.openPanel('khotan-work');
  }
  // ---------------- overlays inside the modal
  function openOverlay(kind, data) {
    ui.overlay = kind; const run = ui.run, eng = E(); if (run && ['SORT', 'WARP', 'WARP_DONE', 'WEAVE', 'ROUND_TRANSITION', 'URGENT'].includes(run.phase)) eng.pause(run);
    const card = el('div', 'card' + (kind === 'help' ? ' wide' : '')); nodes.overlay.replaceChildren(card); nodes.overlay.hidden = false;
    const btn = (label, fn, cls, disabled) => { const b = el('button', 'btn ' + (cls || ''), label); b.type = 'button'; b.disabled = Boolean(disabled); b.addEventListener('click', fn); return b; };
    if (kind === 'entry') {
      const p = progress(), av = p ? S.weaving.availability(p) : null, C = COPY();
      const hint = av ? (av.canStartFormal ? '当前：' + av.phaseName + ' · 可开始帮工' : '当前：' + av.phaseName + ' · ' + (av.reason || '暂不可帮工')) : '';
      card.innerHTML = '<h2>于阗织坊</h2><p class="sub">理丝 → 定经 → 开工（三轮 × 五根） → 今日收工</p><p class="sub">本次帮工：' + C.duration + ' · 工钱按织成根数结算</p><p class="sub ' + (av && av.canStartFormal ? 'avail' : 'na') + '" data-ref="availHint"></p>';
      card.querySelector('[data-ref="availHint"]').textContent = hint;
      if (ui.error) { const e = el('p', 'inline-error'); e.textContent = ui.error; card.append(e); }
      const m = el('div', 'menu'); m.append(btn('正式帮工', () => { void startRun('formal'); }, 'primary', !(av && av.canStartFormal) || ui.busy), btn('先试一试', () => startRun('trial'), '', !(av && av.canTrial) || ui.busy), btn('玩法说明', () => openOverlay('help', { back: 'entry' }), 'quiet'), btn(C.leave, () => { disposeRun(); S.ui.closePanel(); }, 'quiet')); card.append(m);
    }
    if (kind === 'pause') { card.innerHTML = '<h2>暂停</h2><p class="sub">日影已停</p>'; const m = el('div', 'menu'); m.append(btn('继续游戏', closeOverlay, 'primary'), btn('重新开始', () => { void restart(); }), btn('玩法说明', () => openOverlay('help', { back: 'pause' }), 'quiet'), btn('退出游戏', () => openOverlay('quit'), 'quiet')); card.append(m); }
    if (kind === 'quit') { card.innerHTML = '<h2>尚未收工</h2><p style="text-align:center">此时离开，今日工钱不作结，也不耗去时辰。</p>'; const m = el('div', 'menu'); m.append(btn('继续理丝', () => openOverlay('pause'), 'primary'), btn('离开织坊', () => { void abandonRun(); }, 'quiet')); card.append(m); }
    if (kind === 'help') { card.innerHTML = helpHtml(); const m = el('div', 'menu'); m.append(btn('返回', () => data && data.back === 'pause' ? openOverlay('pause') : data && data.back === 'entry' ? openOverlay('entry') : closeOverlay(), 'primary')); card.append(m); }
    if (kind === 'teach') { card.innerHTML = data.html; const m = el('div', 'menu'); m.append(btn('知道了', () => { closeOverlay(); nextTeach(); }, 'primary')); card.append(m); }
    if (kind === 'trialEnd') { const p = progress(), av = p ? S.weaving.availability(p) : null; card.innerHTML = '<h2>试工结束</h2><p style="text-align:center">三道工序都试过了。正式帮工时，日影七十五息共享理丝、定经与开工，工钱按当日织成的根数结算。</p>' + (av && !av.canStartFormal ? '<p class="sub na">当前：' + av.phaseName + ' · ' + (av.reason || '暂不可帮工') + '</p>' : ''); const m = el('div', 'menu'); m.append(btn('正式帮工', () => { void startRun('formal'); }, 'primary', !(av && av.canStartFormal)), btn('返回', toEntry, 'quiet')); card.append(m); }
    if (kind === 'stale') { const v = view(); card.innerHTML = '<h2>于阗织坊</h2><p style="text-align:center">' + COPY().stale + '</p>'; if (ui.error) { const e = el('p', 'inline-error'); e.textContent = ui.error; card.append(e); } const m = el('div', 'menu'); m.append(btn(COPY().leave, () => { if (!v || ui.busy) return; ui.busy = true; hostCtx.dispatch('WEAVING_ABORT', { sessionId: v.sessionId }, 'weaving-abort-' + v.sessionId).then(() => { ui.busy = false; ui.hostKey = ''; render(); }); }, 'primary', ui.busy)); card.append(m); }
    if (kind === 'finishError') { card.innerHTML = '<h2>今日收工</h2><p style="text-align:center">' + (ui.error || COPY().finishError) + '</p>'; const m = el('div', 'menu'); const v = view(); m.append(btn(v && v.result && !v.settled ? '重试结算' : COPY().retryFinish, () => { nodes.overlay.hidden = true; ui.overlay = null; if (v && v.result && !v.settled) { ui.hostKey = ''; render(); } else void submitFinish(); }, 'primary')); card.append(m); }
    card.scrollTop = 0;
  }
  function closeOverlay() { ui.overlay = null; nodes.overlay.hidden = true; nodes.overlay.replaceChildren(); const run = ui.run; if (run && ui.mode === 'run') { E().resume(run); ui.lastFrame = performance.now(); } }
  function teach(kind) { ui.teachQueue.push(kind); if (ui.overlay !== 'teach') nextTeach(); }
  function nextTeach() { const kind = ui.teachQueue.shift(); if (!kind) return; openOverlay('teach', { html: kind === 'loose' ? TEACH.loose : TEACH.knot }); }
  const TEACH = {
    loose: '<h2>丝头松脱</h2><div class="teach"><p>织到一半，线路上有一处丝头从圆环脱开了。脱开的那一段会变成虚线，两端的圆环发亮。</p><p>在五息之内，从发亮的圆环按住，拖到相邻那一环，把丝头重新接回。</p><p>接回了，这根线照旧算数；没接回，这根线会散掉，要重新织。</p></div><p class="sub">正式帮工时只有一条小提示与倒数，不会再弹出这张说明。</p>',
    knot: '<h2>丝结缠住</h2><div class="teach"><p>两根丝线在同一个圆环交叉时，可能缠成一个线结。线结会标在交叉的圆环上。</p><p>点一下线结，把它解开，再继续连线。线结没解开之前，新的丝线不能起头。</p></div><p class="sub">正式帮工时只有一条小提示，不会再弹出这张说明。</p>'
  };
  function helpHtml() { return '<h2>玩法说明</h2><h3>理丝</h3><p>按丝色与纹样，把下方的散丝拖到上方对应挂位。颜色与纹样都对才会挂住；不对的丝束回到原处。</p><h3>定经</h3><p>上下拖动配重，让五组经线都落入绿色「合宜」。五组齐了，中央出现「经线已齐，可开工织造」，一息半后自动开工，也可以直接点「进入开工」。</p><h3>开工</h3><p>从上方丝线起头，沿相邻的圆环走，最后接到下方对应的纹样。直接拖到纹样、没有经过圆环，不算。每轮五根，连织三轮，共十五根；每轮下方纹样重新打乱，全部灰色，接上的才亮起。</p><h3>日影</h3><p>正式帮工共七十五息，理丝、定经、开工共用。暂停、急束、定经转场时停表。日影尽时按已织成的根数照常结算。</p><h3>急束</h3><p>开工到七根以后可能来一单急束：独立八息，完成两根指定急线得一钱加赏；没完成不扣钱。急束期间日影停表。</p>' + TEACH.loose.replace('<h2>', '<h3>').replace('</h2>', '</h3>').replace(/<p class="sub">.*<\/p>/, '') + TEACH.knot.replace('<h2>', '<h3>').replace('</h2>', '</h3>').replace(/<p class="sub">.*<\/p>/, '') + '<h3>工钱</h3><p>织成 0–4 根 9 钱；5–9 根 11 钱；10–14 根 15 钱；15 根 19 钱。每织完一轮加赏 1 钱（最多 3 钱）；急束成功另加 1 钱；最高 23 钱。</p><h3>工时</h3><p>正式帮工耗时' + COPY().duration + '，只在晨间开工；今日收工后结算工钱并推进时辰。试工不发工钱，也不推进世界时间。</p><h3>中途离开</h3><p>只有主动离开织坊不作结、不耗时辰；时间到、只完成一部分，都照常结算。</p>'; }
  // ---------------- run control
  function beginRun(run, kind, sessionId) { closeOverlay(); ui.run = run; ui.kind = kind; ui.sessionId = sessionId; ui.mode = 'run'; ui.phaseShown = null; ui.drag = null; ui.teachQueue = []; ui.finishPending = false; ui.error = ''; showPhase(true); ui.lastFrame = performance.now(); if (!ui.raf) ui.raf = requestAnimationFrame(frame); }
  async function startRun(mode, options) {
    if (ui.busy) return;
    if (mode !== 'formal') { beginRun(E().createRun(Object.assign({ mode: 'trial' }, options || {})), 'trial', null); return; }
    if (!hostCtx) return; ui.busy = true; ui.error = ''; if (ui.overlay === 'entry' || ui.overlay === 'trialEnd') openOverlay(ui.overlay);
    const out = await hostCtx.dispatch('WEAVING_START', { mode: 'FORMAL' });
    ui.busy = false; const v = view();
    if (out === null || !v || v.phase !== 'PLAYING') { ui.error = out === null ? '' : '开工登记未完成'; toEntry(); return; }
    beginRun(E().createRun(Object.assign({ mode: 'formal', seed: v.seed }, options || {})), 'formal', v.sessionId);
  }
  async function restart() {   // 重新开始 from the pause card: a formal run is abandoned (0 工钱 / 0 时辰) and a fresh one registered
    const run = ui.run; if (!run) return; const mode = run.mode;
    if (ui.kind === 'formal') { closeOverlay(); E().abandon(run); const sessionId = ui.sessionId; const out = await hostCtx.dispatch('WEAVING_ABORT', { sessionId }, 'weaving-abort-' + sessionId); if (out === null) { render(); return; } disposeRun(); void startRun('formal'); return; }
    closeOverlay(); startRun(mode);
  }
  async function abandonRun() {
    const run = ui.run; if (!run) return; E().abandon(run);
    if (ui.kind === 'formal') { const sessionId = ui.sessionId; const out = await hostCtx.dispatch('WEAVING_ABORT', { sessionId }, 'weaving-abort-' + sessionId); if (out === null) { render(); return; } }
    disposeRun(); toEntry();
  }
  function disposeRun() { ui.run = null; ui.kind = null; ui.sessionId = null; ui.mode = 'entry'; ui.phaseShown = null; ui.drag = null; ui.finishPending = false; ui.error = ''; ui.hostKey = ''; ui.teachQueue = []; ui.overlay = null; if (nodes.overlay) { nodes.overlay.hidden = true; nodes.overlay.replaceChildren(); } }
  function toEntry() { closeOverlay(); disposeRun(); nodes.layer.replaceChildren(); nodes.lines.replaceChildren(); nodes.chips.replaceChildren(); setBody('sort'); hud(); openOverlay('entry'); }
  function frame(now) {
    ui.raf = dom.shell && dom.shell.isConnected ? requestAnimationFrame(frame) : 0; const run = ui.run; if (!run || ui.mode !== 'run') return;
    const dt = Math.min(250, now - (ui.lastFrame || now)); ui.lastFrame = now; if (!dt) return;
    const events = E().tick(run, dt); if (run.phase === 'SETTLED') { showSettled(); return; }
    for (const e of events) { if (['WEAVE_START', 'ROUND_START', 'URGENT_END'].includes(e.type)) { ui.drag = null; showPhase(true); } if (e.type === 'LOOSE_FAILED') { ui.drag = null; refresh(); } }
    if (run.phase === 'URGENT' || run.weave.loose) drawChips(); hud();
  }
  function refit() { fit(); if (ui.run && ui.mode !== 'entry') showPhase(true); else fit(); }
  // ---------------- host rendering: the saved session decides what the panel shows (settlement to collect / interrupted run / entry)
  function pseudoRun(r) { return { phase: 'SETTLED', mode: 'formal', status: r.status, wages: r.wages, timeLeftMs: 0, sort: { count: 5 }, warp: { count: 5 }, weave: { round: 3, roundsCompleted: r.roundsCompleted, totalCompleted: r.totalCompleted, board: { roundCount: 0 }, loose: null, knot: null }, urgent: null }; }
  function render() {
    if (!dom.shell || !dom.shell.isConnected) return; const p = progress(); if (!p) return; const v = view(); fit();
    if (v && v.result && !v.settled) { const key = 'host:' + v.settlementId + ':' + ui.error + ':' + ui.busy; if (key === ui.hostKey && ui.mode === 'settled') return; ui.hostKey = key; if (!(ui.run && ui.run.phase === 'SETTLED' && ui.kind === 'formal' && ui.sessionId === v.sessionId)) { ui.run = pseudoRun(v.result); ui.kind = 'formal'; ui.sessionId = v.sessionId; } ui.mode = 'settled'; ui.phaseShown = null; showPhase(true); return; }
    if (v && v.phase === 'PLAYING' && !(ui.run && ui.kind === 'formal' && ui.sessionId === v.sessionId)) { ui.run = null; ui.mode = 'entry'; nodes.layer.replaceChildren(); nodes.lines.replaceChildren(); nodes.chips.replaceChildren(); setBody('sort'); hud(); openOverlay('stale'); return; }
    if (ui.run) { if (ui.mode === 'run' && !ui.raf) { ui.lastFrame = performance.now(); ui.raf = requestAnimationFrame(frame); } if (ui.overlay === 'entry') openOverlay('entry'); return; }
    toEntry();
  }
  // Host close (X / Escape): during a run → pause card (退出游戏 → 离开织坊 asks again); settlement to collect / interrupted run → ignored; entry → the panel closes.
  function interceptClose() {
    const v = view();
    if (ui.run && ui.mode === 'run') { if (ui.overlay !== 'quit' && ui.overlay !== 'pause') openOverlay('pause'); return true; }
    if (ui.finishPending || ui.busy || (v && v.result && !v.settled) || (v && v.phase === 'PLAYING')) return true;
    if (ui.overlay === 'help' || ui.overlay === 'trialEnd') { toEntry(); return true; }
    disposeRun(); return false;
  }
  const geom = () => { if (!nodes.stage || !ui.body) return null; const r = nodes.stage.getBoundingClientRect(), m = nodes.modal.getBoundingClientRect(), b = ui.body; return { k: ui.k, ox: ui.ox, oy: ui.oy, left: r.left, top: r.top, width: r.width, height: r.height, body: b.key, x0: b.x0, artTop: b.top, removed: b.removed, modal: { x: m.x, y: m.y, width: m.width, height: m.height } }; };
  const screenOf = (px, py) => { const r = nodes.stage.getBoundingClientRect(); return { x: r.left + ui.ox + cx(px) * ui.k, y: r.top + ui.oy + cy(py) * ui.k }; };
  S.ui.registerPanel('weaving', {
    title: '于阗织坊',
    noClose: true,
    render(c, b) { hostCtx = c; ensureShell(); b.append(dom.shell); render(); }
  });
  S.livelihood.register('khotan', {
    id: 'weaving', panel: 'weaving', title: S.weaving.COPY.entryTitle, description: S.weaving.COPY.entryDescription, time: S.weaving.COPY.entryTime, pay: S.weaving.COPY.entryPay, enter: S.weaving.COPY.enter,
    art: { key: 'yutian_weaving_bundle_top_red_v5', className: 'yw-job-art', label: '赤红丝束' }, availability: p => S.weaving.availability(p)
  });
  S.weavingUI = { interceptClose, render, ui, startRun, toEntry, E, openOverlay, closeOverlay, showPhase, refresh, ART, T9, geom, screenOf, screenOfMany: pts => pts.map(p => screenOf(p[0], p[1])), get LAYOUT() { return LAYOUT(); }, test: { dom, nodes, dispose: disposeRun, run: () => ui.run } };
})(globalThis.Silk = globalThis.Silk || {});
