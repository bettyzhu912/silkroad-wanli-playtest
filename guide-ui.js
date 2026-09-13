(function (S) {
  'use strict';
  // NEW_PLAYER_GUIDE_CLARITY_REPLACEMENT_v1.1 overlay (replaces the v1.0 overlay in place — same layer, mask, spotlight and state mechanism).
  // Map mode: the 长安 map and HUD stay visible, the current target is spotlit, everything else is lightly dimmed and blocked. HUD items show
  // a callout with 下一步. Must-enter items leave the spotlit real entrance clickable (plus a 进入看看 button that opens the same real page) and
  // have no 下一步: the tour continues only after the player has been inside. In-page mode: the real page is open and fully usable; the layer
  // carries only a compact callout (and, on the 出发 page, a hold over 【开始行程】 so the tour never sends anyone on the road); closing the
  // page hands the tour to the next item. Nothing here changes game state except through guide.* commands.
  const TARGETS = {
    'hud.money': ['.global-hud .money-status'], 'hud.time': ['.global-hud .time-status'], 'hud.reputation': ['.global-hud .reputation-status'],
    'hud.pack': ['.global-hud .hud-tool[data-panel="pack"]'], 'hud.commission': ['.global-hud .hud-tool[data-panel="commission"]'], 'hud.message': ['.global-hud .hud-tool[data-panel="message"]'], 'hud.more': ['.global-hud .hud-tool[data-panel="more"]'],
    'map.inspect': ['.city-scene .city-hotspot[data-hotspot="inspect"]'], 'map.market': ['.city-scene .city-hotspot[data-hotspot="market"]'], 'map.guifang': ['.city-scene .city-hotspot[data-hotspot="guifang"]'], 'map.inn': ['.city-scene .city-hotspot[data-hotspot="inn"]'], 'map.work': ['.city-scene .city-hotspot[data-hotspot="work"]'],
    'map.merchant': ['.city-scene .city-hotspot[data-hotspot="merchant_business"]', '.global-hud .hud-tool[data-panel="merchant_business"]'], 'map.depart': ['.city-scene .city-hotspot[data-hotspot="depart"]']
  };
  const byText = (scope, text) => [...document.querySelectorAll(scope + ' button')].find(b => b.textContent.trim().startsWith(text) && b.getClientRects().length) || null;
  const INSIDE = {   // rings inside the open real page (never blocking)
    'message.archive': () => byText('[data-panel-id="message"]', '历期商报'),
    'market.provisions': () => document.querySelector('[data-panel-id="market"] .provisions-product'),
    'market.goods': () => document.querySelector('[data-panel-id="market"] .market-product:not(.provisions-product)'),
    'more.help': () => [...document.querySelectorAll('[data-panel-id="more"] .menu-entry')].find(b => b.textContent.includes('玩法说明')) || null
  };
  const HOLD = { 'departure.start': () => byText('[data-panel-id="departure"] .panel-footer', '开始行程') };
  const dom = { layer: null }; const local = { mode: null, key: null, retry: 0, raf: 0, transition: null };
  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = String(text); return e; }
  function stage() { return document.querySelector('#game-root .game-stage'); }
  function ensureLayer() { const st = stage(); if (!st) return null; if (dom.layer && dom.layer.isConnected) return dom.layer; dom.layer = el('div', 'guide-layer'); dom.layer.hidden = true; st.append(dom.layer); return dom.layer; }
  function progress() { return S.app && S.app.state && S.app.state.progress; }
  function visible(e) { return Boolean(e && e.getClientRects().length && !e.closest('[hidden]')); }
  function target(step) { for (const sel of TARGETS[step.target] || []) { const e = document.querySelector(sel); if (visible(e)) return e; } return null; }
  function hide() { if (dom.layer) { dom.layer.hidden = true; dom.layer.classList.remove('guide-inside'); dom.layer.replaceChildren(); } local.mode = null; local.key = null; }
  function busy() { return Boolean(S.app && S.app.busy) || S.ui.getState().busy; }
  function act(type, payload) { if (busy()) return; void S.ui.dispatch(type, payload || {}); }
  // state transitions observed from the page state (real page opened / closed); one at a time, never while a command runs
  // Deferred to the next task so a page's own opening command (e.g. market.enter issued by openPanel) always goes first; if the app is
  // busy at that moment the render that follows the busy command calls transition() again.
  function transition(type, step) { if (local.transition || busy()) return; local.transition = type; setTimeout(() => { if (busy()) { local.transition = null; return; } Promise.resolve(S.ui.dispatch(type, { step })).catch(() => { }).then(() => { local.transition = null; }); }, 0); }
  function button(label, fn, cls) { const b = el('button', cls || 'ui-button', label); b.type = 'button'; b.addEventListener('click', () => { if (!b.disabled) fn(); }); return b; }
  function block(x, y, w, h, cls) { const b = el('div', 'guide-block' + (cls ? ' ' + cls : '')); b.style.left = x + 'px'; b.style.top = y + 'px'; b.style.width = Math.max(0, w) + 'px'; b.style.height = Math.max(0, h) + 'px'; return b; }
  function ring(x, y, w, h, cls) { const r = el('div', 'guide-spot' + (cls ? ' ' + cls : '')); r.style.left = x + 'px'; r.style.top = y + 'px'; r.style.width = w + 'px'; r.style.height = h + 'px'; return r; }
  function paragraphs(parent, copy) { for (const line of String(copy).split('\n')) parent.append(el('p', 'guide-copy', line)); }
  function rel(e) { const R = stage().getBoundingClientRect(), r = e.getBoundingClientRect(); return { x: r.left - R.left, y: r.top - R.top, w: r.width, h: r.height }; }
  function centered(kind, build) {
    const layer = ensureLayer(); if (!layer) return; const R = stage().getBoundingClientRect();
    layer.classList.remove('guide-inside'); layer.replaceChildren(block(0, 0, R.width, R.height, 'guide-veil')); const card = el('section', 'guide-card guide-' + kind); card.setAttribute('role', 'dialog'); build(card); layer.append(card); layer.hidden = false;
  }
  function showEntry(v) {
    if (local.mode === 'entry' && !dom.layer.hidden) return;
    centered('entry', card => { card.setAttribute('aria-label', '选择开局方式'); card.append(el('h3', '', v.entry.title)); const actions = el('div', 'guide-actions'); actions.append(button(v.entry.start, () => act('guide.start')), button(v.entry.explore, () => act('guide.skip'), 'ui-button secondary-button')); card.append(actions); });
    local.mode = 'entry';
  }
  function showFinish(v) {
    if (local.mode === 'finish' && !dom.layer.hidden) return;
    centered('finish', card => { card.setAttribute('aria-label', '新手指引结束'); paragraphs(card, v.finish.copy); const actions = el('div', 'guide-actions'); actions.append(button(v.finish.button, () => act('guide.finish'))); card.append(actions); });
    local.mode = 'finish';
  }
  function openReal(step) { const id = step.panels[0]; if (busy()) return; S.ui.openPanel(id); }
  // map mode: spotlight + callout next to the target. enter = the spotlight stays open (the real entrance is clickable), no 下一步.
  function showStep(v, step, force) {
    const layer = ensureLayer(); if (!layer) return; const key = 'map:' + step.id + ':' + v.phase;
    if (!force && !layer.hidden && local.mode === 'map' && local.key === key && layer.querySelector('.guide-card')) return;
    const t = target(step);
    if (!t) { if (local.retry < 30) { local.retry++; cancelAnimationFrame(local.raf); local.raf = requestAnimationFrame(() => render()); return; } }
    local.retry = 0;
    const R = stage().getBoundingClientRect(), pad = 6, tr = t ? rel(t) : null;
    const spot = tr ? { x: tr.x - pad, y: tr.y - pad, w: tr.w + pad * 2, h: tr.h + pad * 2 } : { x: R.width / 2 - 40, y: R.height / 2 - 40, w: 80, h: 80 };
    const enter = step.kind === 'enter' && v.phase === 'intro';
    layer.classList.remove('guide-inside'); layer.replaceChildren();
    layer.append(block(0, 0, R.width, spot.y), block(0, spot.y + spot.h, R.width, R.height - spot.y - spot.h), block(0, spot.y, spot.x, spot.h), block(spot.x + spot.w, spot.y, R.width - spot.x - spot.w, spot.h));
    layer.append(ring(spot.x, spot.y, spot.w, spot.h, enter ? 'optional' : ''));
    if (!enter) layer.append(block(spot.x, spot.y, spot.w, spot.h, 'guide-cover'));   // HUD items / the map-side 商品 note: the target is only shown
    const card = el('section', 'guide-card guide-step'); card.setAttribute('role', 'dialog'); card.setAttribute('aria-label', '新手指引 ' + step.title); card.dataset.stepId = step.id; card.dataset.phase = v.phase;
    card.append(el('h3', '', step.title)); paragraphs(card, step.copy);
    if (enter) card.append(el('p', 'guide-copy guide-hint', v.text.enterHint(step.entrance)));
    if (v.phase === 'info') card.append(el('p', 'guide-copy guide-hint', v.text.infoHint));
    const foot = el('div', 'guide-foot'); foot.append(el('span', 'guide-count', step.index + ' / ' + v.total), button(v.entry.skip, () => act('guide.skip'), 'text-button guide-skip'));
    if (enter) foot.append(button(v.entry.enter, () => openReal(step), 'ui-button guide-enter')); else foot.append(button(v.entry.next, () => act('guide.next', { step: v.step }), 'ui-button guide-next'));
    card.append(foot);
    const arrow = el('i', 'guide-arrow'); card.append(arrow); layer.append(card); layer.hidden = false;
    const cw = Math.min(320, R.width - 24); card.style.width = cw + 'px'; const ch = card.offsetHeight;
    const below = spot.y + spot.h + 14 + ch <= R.height - 8; const top = below ? spot.y + spot.h + 14 : Math.max(8, spot.y - 14 - ch);
    let left = spot.x + spot.w / 2 - cw / 2; left = Math.max(12, Math.min(R.width - cw - 12, left));
    card.style.left = left + 'px'; card.style.top = top + 'px'; card.classList.toggle('is-below', below); card.classList.toggle('is-above', !below);
    const ax = Math.max(16, Math.min(cw - 16, spot.x + spot.w / 2 - left)); arrow.style.left = ax + 'px';
    local.mode = 'map'; local.key = key;
    const focus = card.querySelector('.guide-next, .guide-enter'); if (focus && !document.activeElement?.closest('.guide-card')) focus.focus({ preventScroll: true });
  }
  // in-page mode: the real page is open and stays usable; only a compact callout (+ an optional ring on the thing being named, + the 出发 hold).
  function showInside(v, step, primary, force) {
    const layer = ensureLayer(); if (!layer) return; const key = 'inside:' + step.id + ':' + primary;
    const R = stage().getBoundingClientRect();
    if (force || layer.hidden || local.mode !== 'inside' || local.key !== key || !layer.querySelector('.guide-card')) {
      layer.classList.add('guide-inside'); layer.replaceChildren();
      const card = el('section', 'guide-card guide-inside-card'); card.setAttribute('role', 'status'); card.dataset.stepId = step.id; card.dataset.phase = 'inside'; card.dataset.panel = primary;
      card.append(el('h3', '', step.title)); if (step.insideCopy) paragraphs(card, step.copy); paragraphs(card, step.inside);
      const foot = el('div', 'guide-foot'); foot.append(el('span', 'guide-count', step.index + ' / ' + v.total), button(v.entry.skip, () => act('guide.skip'), 'text-button guide-skip'));
      if (step.insideNext) foot.append(button(v.entry.next, () => act('guide.next', { step: v.step }), 'ui-button guide-next'));
      card.append(foot); layer.append(card); layer.hidden = false; local.mode = 'inside'; local.key = key;
    }
    // (re)position on every render: the page may re-render or scroll underneath
    for (const e of layer.querySelectorAll('.guide-spot, .guide-block')) e.remove();
    const card = layer.querySelector('.guide-card'); const cw = Math.min(360, R.width - 24); card.style.width = cw + 'px'; card.style.left = Math.max(12, (R.width - cw) / 2) + 'px';
    const footer = document.querySelector('section.paper-panel.primary-panel:not([hidden]) .panel-footer'); const fr = footer && visible(footer) ? rel(footer) : null;
    const limit = fr && fr.h > 0 ? fr.y - 8 : R.height - 12; card.style.top = Math.max(8, limit - card.offsetHeight) + 'px';
    const named = step.insideTarget && INSIDE[step.insideTarget] ? INSIDE[step.insideTarget]() : null;
    if (visible(named)) { const r = rel(named); layer.append(ring(r.x - 4, r.y - 4, r.w + 8, r.h + 8, 'optional')); }
    const hold = step.hold && HOLD[step.hold] ? HOLD[step.hold]() : null;
    if (visible(hold)) { const r = rel(hold); const b = block(r.x - 4, r.y - 4, r.w + 8, r.h + 8, 'guide-hold'); b.setAttribute('title', v.text.holdHint); b.append(el('span', 'guide-hold-label', v.text.holdHint)); layer.append(b); }
  }
  function render(force) {
    const p = progress(); const layer = ensureLayer(); if (!p || !layer || !S.guide) { hide(); return; }
    const v = S.guide.view(p), st = S.ui.getState();
    const result = Boolean(p.presentation.activeResult), modal = st.blockingModalCount > 0, primary = st.primary || null, secondary = st.secondary || null, covered = Boolean(primary || secondary || result || modal);
    if (!v.onMap || v.status === 'done' || v.status === 'skipped') { hide(); return; }
    if (v.showEntry) { if (covered) hide(); else showEntry(v); return; }
    if (v.atFinish) { if (covered) hide(); else showFinish(v); return; }
    const step = v.current; if (!step) { hide(); return; }
    if (step.kind === 'enter' && v.phase !== 'info') {
      const inExpected = Boolean(primary) && step.panels.includes(primary);
      if (v.phase === 'intro') { if (inExpected) { transition('guide.entered', v.step); hide(); return; } if (covered) { hide(); return; } showStep(v, step, force === true); return; }
      if (!primary && !result && !modal) { transition('guide.returned', v.step); hide(); return; }   // the real page was closed → next item
      if (inExpected && !secondary && !result && !modal) { showInside(v, step, primary, force === true); return; }
      hide(); return;   // a secondary page, a result or a modal is on top: the callout waits
    }
    if (covered) { hide(); return; }
    showStep(v, step, force === true);
  }
  S.ui.onRender(() => render(false));
  window.addEventListener('resize', () => { if (dom.layer && !dom.layer.hidden) render(true); });
  S.guideUI = { render, test: { layer: () => dom.layer, mode: () => local.mode, key: () => local.key, target: id => { const step = S.guide.STEPS.find(s => s.id === id); return step ? target(step) : null; }, inside: id => INSIDE[id] ? INSIDE[id]() : null, hold: id => HOLD[id] ? HOLD[id]() : null } };
})(globalThis.Silk = globalThis.Silk || {});
