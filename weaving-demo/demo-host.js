(function (S) {
  'use strict';
  // Stand-alone demo host for 于阗织坊. Implements the small host surface that weaving-ui.js expects from the main game
  // (S.ui panels / dispatch / modals / S.app.state) over an in-memory progress saved to localStorage, so the very same
  // weaving.js + weaving-ui.js + weaving.css can be played and reviewed before they are wired into the real game.
  // Everything in this file is demo scaffolding; none of it ships with the main game.
  const STORAGE_KEY = 'yutian-weaving-demo-v1';
  const panels = new Map();
  const ui = { primary: null, modals: [], busy: false, error: '' };
  const nodes = {};
  const processed = new Map();
  let state = null;
  const el = (tag, className, text) => { const e = document.createElement(tag); if (className) e.className = className; if (text !== undefined) e.textContent = String(text); return e; };
  function button(label, fn, options = {}) {
    const b = el('button', options.className || 'ui-button', label); b.type = 'button'; b.disabled = Boolean(options.disabled) || ui.busy; if (!options.disabled) b.dataset.busyDisabled = 'true';
    if (options.label) b.setAttribute('aria-label', options.label);
    b.addEventListener('click', () => { if (b.isConnected && !b.disabled && !ui.busy) fn(); });
    return b;
  }
  function row(label, value, parent) { const e = el('div', 'info-row'); e.append(el('span', 'row-label', label), el('span', 'row-value', value)); if (parent) parent.append(e); return e; }
  function paragraph(parent, text, className) { parent.append(el('p', className || '', text)); }
  function formatMoney(value) { return Number.isSafeInteger(value) ? value.toLocaleString('zh-CN') + '钱' : '—'; }
  function fresh() {
    const p = S.core.initialProgress('explore', (Date.now() & 0x7fffffff) || 1);
    p.world.city = 'khotan'; p.world.tick = 3; p.cash = 200;
    return { meta: { revision: 0 }, progress: p };
  }
  function load() { try { const raw = localStorage.getItem(STORAGE_KEY); const parsed = raw ? JSON.parse(raw) : null; return parsed && parsed.progress && parsed.progress.world ? parsed : null; } catch (_) { return null; } }
  function save() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) { /* demo only */ } }
  const p = () => state.progress;
  async function dispatch(type, payload = {}, sourceId) {
    if (ui.busy) return null;
    const id = sourceId || ('demo-' + type + '-' + S.util.stable(payload) + '-' + state.meta.revision);
    if (processed.has(id)) return processed.get(id);   // same action id replayed (double click) → same outcome, no second effect
    ui.busy = true; renderControls();
    try {
      const draft = S.util.clone(p());
      const result = S.commands.run(draft, { type, payload }, S.core.context(id)) || { modal: false };
      state.progress = draft; state.meta.revision++; S.app.state = state; processed.set(id, result); save(); ui.error = '';
      await Promise.resolve();
      return result;
    } catch (error) {
      ui.error = error && error.message && /[㐀-鿿]/.test(error.message) ? error.message : '操作尚未完成，请重试。';
      return null;
    } finally { ui.busy = false; render(); }
  }
  function context() { return { S, state, p: p(), app: S.app, el, button, row, paragraph, formatMoney, openPanel, openSecondary: openPanel, closePanel, closeSecondary: closePanel, dispatch, showModal, dismissModal }; }
  // Only the weaving panels exist in the demo; main-game panels the minigame hands over to (e.g. the 客舍 at dusk) are represented by the demo bar instead.
  function openPanel(id, data = {}) { if (ui.busy || ui.modals.length) return; if (!panels.has(id)) { ui.primary = null; render(); return; } ui.primary = { id, data }; ui.error = ''; render(); }
  function closePanel() {
    if (ui.busy) return;
    if (ui.primary && ui.primary.id === 'weaving' && S.weavingUI && S.weavingUI.interceptClose && S.weavingUI.interceptClose()) return;
    if (S.weaving.isActive(p())) return;
    ui.primary = null; ui.error = ''; render();
  }
  function showModal(spec) { ui.modals.push(spec); render(); }
  function dismissModal() { if (ui.busy) return; ui.modals.shift(); render(); }
  function registerPanel(id, spec) { panels.set(id, spec); }
  function phaseLabel() { return ['晨', '午', '暮'][p().world.tick % 3]; }
  function renderHud() {
    nodes.hudTop.replaceChildren();
    const money = el('div', 'hud-status money-status'); money.append(el('span', 'status-value', p().cash.toLocaleString('zh-CN') + ' 钱')); 
    const rep = el('div', 'hud-status reputation-status'); rep.append(el('span', 'status-value', '于阗'));
    const time = el('div', 'hud-status time-status'); const text = el('span', 'date-lines'); text.append(el('span', '', '试玩演示'), el('span', '', '第' + (Math.floor(p().world.tick / 3) + 1) + '日 · ' + phaseLabel()), el('span', 'trip-line', '未接入主游戏')); time.append(text);
    nodes.hudTop.append(money, rep, time);
  }
  function renderPanels() {
    if (S.weaving.isActive(p())) ui.primary = { id: 'weaving', data: {} };
    nodes.primary.hidden = !ui.primary;
    if (!ui.primary) return;
    const spec = panels.get(ui.primary.id), c = context(), parts = nodes.primaryParts;
    if (!spec) { ui.primary = null; nodes.primary.hidden = true; return; }
    parts.box.dataset.panelId = ui.primary.id;
    parts.header.replaceChildren(); parts.body.replaceChildren(); parts.footer.replaceChildren();
    parts.header.append(el('h2', '', (typeof spec.title === 'function' ? spec.title(c) : spec.title) || ui.primary.id));
    const noClose = typeof spec.noClose === 'function' ? spec.noClose(c, ui.primary.data) : Boolean(spec.noClose);
    if (!noClose) { const x = button('', closePanel, { className: 'close-button', label: '关闭' }); const img = el('img', 'ui-icon'); img.src = 'global_icon_close_v01.png'; img.alt = ''; x.append(img); parts.header.append(x); }
    spec.render(c, parts.body, ui.primary.data);
    if (spec.footer) spec.footer(c, parts.footer, ui.primary.data);
    if (ui.error) paragraph(parts.body, ui.error, 'inline-error');
    parts.footer.hidden = !parts.footer.childNodes.length;
  }
  function renderModals() {
    const current = ui.modals[0]; nodes.modal.hidden = !current; if (!current) return;
    const parts = nodes.modalParts; parts.header.replaceChildren(el('h2', '', current.title)); parts.body.replaceChildren(); parts.footer.replaceChildren();
    paragraph(parts.body, current.body);
    for (const a of current.actions || []) parts.footer.append(button(a.label, a.run, { className: 'ui-button' + (a.danger ? ' danger-button' : '') }));
  }
  function renderDemoBar() {
    nodes.bar.replaceChildren();
    const dusk = p().world.tick % 3 === 2 && !S.weaving.isActive(p());
    nodes.bar.append(el('span', 'demo-note', dusk ? '天色已暮，今日的活计已经结束。正式版此处进入客舍住宿流程。' : '试玩演示 · 单独运行的于阗织坊（与将来接入主游戏的是同一套代码）'));
    const actions = el('span', 'demo-actions');
    if (dusk) actions.append(button('歇息至次日晨', () => { S.time.advance(p(), 1, { reason: 'demo-rest' }); state.meta.revision++; save(); render(); }, { className: 'ui-button' }));
    else if (!ui.primary && !S.weaving.isActive(p())) actions.append(button('营生', () => openPanel('khotan-work'), { className: 'ui-button' }));
    actions.append(button('重置演示', () => { if (S.weaving.isActive(p())) return; state = fresh(); S.app.state = state; processed.clear(); save(); ui.primary = null; render(); }, { className: 'ui-button secondary-button' }));
    nodes.bar.append(actions);
    nodes.bar.classList.toggle('is-dusk', dusk);
  }
  function renderControls() { nodes.root.classList.toggle('is-pending', ui.busy); nodes.root.querySelectorAll('button[data-busy-disabled]').forEach(b => { b.disabled = ui.busy; }); }
  function render() { if (!nodes.root) return; S.app.state = state; renderHud(); renderPanels(); renderModals(); renderDemoBar(); renderControls(); }
  function makePanel(kind) {
    const layer = el('section', 'panel-layer ' + kind + '-layer'); layer.hidden = true;
    const backdrop = el('div', 'panel-backdrop'); backdrop.setAttribute('aria-hidden', 'true'); layer.append(backdrop);
    const box = el('section', 'paper-panel ' + kind + '-panel'); box.setAttribute('role', 'dialog');
    const header = el('header', 'panel-header'), body = el('div', 'panel-body'), footer = el('footer', 'panel-footer'); box.append(header, body, footer); layer.append(box);
    return { layer, box, header, body, footer };
  }
  function viewport() { const vv = window.visualViewport; const h = vv ? vv.height : window.innerHeight; document.documentElement.style.setProperty('--viewport-height', h + 'px'); nodes.root && nodes.root.style.setProperty('--art-scale', String(Math.max(.3, (nodes.root.clientWidth - 24) / 768))); }
  function boot() {
    state = load() || fresh();
    if (p().work && p().work.weaving && p().work.weaving.phase === 'PLAYING' && !p().work.weaving.result) {   // same rule as the main game: an interrupted formal run is abandoned on reload
      const draft = S.util.clone(p()); S.commands.run(draft, { type: 'WEAVE_ABORT', payload: { sessionId: draft.work.weaving.id } }, S.core.context('demo-recovery-' + state.meta.revision)); state.progress = draft; state.meta.revision++; save();
    }
    S.app.state = state;
    nodes.root = document.getElementById('game-root'); nodes.root.replaceChildren();
    const stage = el('div', 'game-stage');
    const scene = el('section', 'city-scene demo-scene'); const bg = el('img', 'city-background'); bg.src = 'B7_city_khotan_bg_v01_20x9.webp'; bg.alt = '于阗城市景观'; bg.draggable = false; scene.append(bg);
    nodes.hud = el('header', 'global-hud'); nodes.hudTop = el('div', 'hud-top'); nodes.hud.append(nodes.hudTop);
    nodes.primaryParts = makePanel('primary'); nodes.primary = nodes.primaryParts.layer;
    nodes.modalParts = makePanel('modal'); nodes.modal = nodes.modalParts.layer;
    nodes.bar = el('div', 'demo-bar');
    stage.append(scene, nodes.hud, nodes.primary, nodes.modal, nodes.bar); nodes.root.append(stage);
    window.addEventListener('resize', viewport); viewport();
    if (!ui.primary && !S.weaving.isActive(p()) && p().world.tick % 3 !== 2) ui.primary = { id: 'khotan-work', data: {} };
    render();
  }
  S.ui = { registerPanel, render, openPanel, openSecondary: openPanel, closePanel, closeSecondary: closePanel, showModal, dismissModal, dispatch, getState: () => ui, registerMenu: registerPanel, registerResult() {}, mount: boot };
  S.app = { state: null, dispatch, get busy() { return ui.busy; } };
  document.addEventListener('DOMContentLoaded', boot);
})(globalThis.Silk = globalThis.Silk || {});
