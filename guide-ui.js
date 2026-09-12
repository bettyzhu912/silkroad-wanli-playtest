(function (S) {
  'use strict';
  // New-player guide overlay: the 长安 map and HUD stay visible, the current target is spotlit, everything else is lightly dimmed and
  // blocked, a short callout sits next to the target. Optional targets (背包, 行情放大镜) remain clickable; while any panel / result /
  // modal is open the overlay hides itself and comes back at the same step. Nothing here changes game state except through guide.*.
  const TARGETS = {
    'hud.money': ['.global-hud .money-status'], 'hud.time': ['.global-hud .time-status'], 'hud.reputation': ['.global-hud .reputation-status'], 'hud.inventory': ['.global-hud .hud-tool[data-panel="pack"]'],
    'map.marketInfoTrigger': ['.city-scene .city-hotspot[data-hotspot="inspect"]'], 'market.supplies_or_market_entry': ['.city-scene .city-hotspot[data-hotspot="market"]'], 'market.goods_or_market_entry': ['.city-scene .city-hotspot[data-hotspot="market"]'],
    'map.commission': ['.global-hud .hud-tool[data-panel="commission"]'], 'map.finance': ['.city-scene .city-hotspot[data-hotspot="guifang"]'], 'map.inn': ['.city-scene .city-hotspot[data-hotspot="inn"]'], 'map.livelihood': ['.city-scene .city-hotspot[data-hotspot="work"]'],
    // 商号: the real map entrance when the scene has it; otherwise the HUD 商号 tool marks the place for the tour only.
    'map.merchantHouseLocation': ['.city-scene .city-hotspot[data-hotspot="merchant_business"]', '.global-hud .hud-tool[data-panel="merchant_business"]'],
    'map.depart': ['.city-scene .city-hotspot[data-hotspot="depart"]'], 'map.more': ['.global-hud .hud-tool[data-panel="more"]']
  };
  const dom = { layer: null }; const local = { mode: null, stepId: null, retry: 0, raf: 0 };
  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = String(text); return e; }
  function stage() { return document.querySelector('#game-root .game-stage'); }
  function ensureLayer() { const st = stage(); if (!st) return null; if (dom.layer && dom.layer.isConnected) return dom.layer; dom.layer = el('div', 'guide-layer'); dom.layer.hidden = true; st.append(dom.layer); return dom.layer; }
  function progress() { return S.app && S.app.state && S.app.state.progress; }
  function target(step) { for (const sel of TARGETS[step.target] || []) { const e = document.querySelector(sel); if (e && e.getClientRects().length && !e.closest('[hidden]')) return e; } return null; }
  function hide() { if (dom.layer) { dom.layer.hidden = true; dom.layer.replaceChildren(); } local.mode = null; local.stepId = null; }
  function busy() { return Boolean(S.app && S.app.busy) || S.ui.getState().busy; }
  function act(type, payload) { if (busy()) return; void S.ui.dispatch(type, payload || {}); }
  function button(label, fn, cls) { const b = el('button', cls || 'ui-button', label); b.type = 'button'; b.addEventListener('click', () => { if (!b.disabled) fn(); }); return b; }
  function block(x, y, w, h, cls) { const b = el('div', 'guide-block' + (cls ? ' ' + cls : '')); b.style.left = x + 'px'; b.style.top = y + 'px'; b.style.width = Math.max(0, w) + 'px'; b.style.height = Math.max(0, h) + 'px'; return b; }
  function paragraphs(parent, copy) { for (const line of String(copy).split('\n')) parent.append(el('p', 'guide-copy', line)); }
  function centered(kind, build) {
    const layer = ensureLayer(); if (!layer) return; const st = stage(); const r = st.getBoundingClientRect();
    layer.replaceChildren(block(0, 0, r.width, r.height, 'guide-veil')); const card = el('section', 'guide-card guide-' + kind); card.setAttribute('role', 'dialog'); build(card); layer.append(card); layer.hidden = false;
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
  function showStep(v, force) {
    const layer = ensureLayer(); if (!layer) return; const step = v.current, st = stage(), t = target(step);
    if (!force && !layer.hidden && local.mode === 'step' && local.stepId === step.id && layer.querySelector('.guide-card')) return;   // same step already on screen: keep focus and animation
    if (!t) { // the scene may still be laying out (art load / first render): retry a few frames, then fall back to a centered callout
      if (local.retry < 30) { local.retry++; cancelAnimationFrame(local.raf); local.raf = requestAnimationFrame(() => render()); return; }
    }
    local.retry = 0;
    const R = st.getBoundingClientRect(), pad = 6;
    const tr = t ? t.getBoundingClientRect() : null;
    const spot = tr ? { x: tr.left - R.left - pad, y: tr.top - R.top - pad, w: tr.width + pad * 2, h: tr.height + pad * 2 } : { x: R.width / 2 - 40, y: R.height / 2 - 40, w: 80, h: 80 };
    layer.replaceChildren();
    // four dim blocks around the spotlight (they also swallow clicks); the spotlight itself stays open only for optional targets
    layer.append(block(0, 0, R.width, spot.y), block(0, spot.y + spot.h, R.width, R.height - spot.y - spot.h), block(0, spot.y, spot.x, spot.h), block(spot.x + spot.w, spot.y, R.width - spot.x - spot.w, spot.h));
    const ring = el('div', 'guide-spot' + (step.optional ? ' optional' : '')); ring.style.left = spot.x + 'px'; ring.style.top = spot.y + 'px'; ring.style.width = spot.w + 'px'; ring.style.height = spot.h + 'px'; layer.append(ring);
    if (!step.optional) { const cover = block(spot.x, spot.y, spot.w, spot.h, 'guide-cover'); layer.append(cover); }
    const card = el('section', 'guide-card guide-step'); card.setAttribute('role', 'dialog'); card.setAttribute('aria-label', '新手指引 ' + step.title); card.dataset.stepId = step.id;
    card.append(el('h3', '', step.title)); paragraphs(card, step.copy);
    const foot = el('div', 'guide-foot'); foot.append(el('span', 'guide-count', step.index + ' / ' + v.total), button(v.entry.skip, () => act('guide.skip'), 'text-button guide-skip'), button(v.entry.next, () => act('guide.next', { step: v.step }), 'ui-button guide-next')); card.append(foot);
    const arrow = el('i', 'guide-arrow'); card.append(arrow); layer.append(card); layer.hidden = false;
    // place the callout below the target when there is room, otherwise above; never over the target
    const cw = Math.min(320, R.width - 24); card.style.width = cw + 'px'; const ch = card.offsetHeight;
    const below = spot.y + spot.h + 14 + ch <= R.height - 8; const top = below ? spot.y + spot.h + 14 : Math.max(8, spot.y - 14 - ch);
    let left = spot.x + spot.w / 2 - cw / 2; left = Math.max(12, Math.min(R.width - cw - 12, left));
    card.style.left = left + 'px'; card.style.top = top + 'px'; card.classList.toggle('is-below', below); card.classList.toggle('is-above', !below);
    const ax = Math.max(16, Math.min(cw - 16, spot.x + spot.w / 2 - left)); arrow.style.left = ax + 'px';
    local.mode = 'step'; local.stepId = step.id;
    const next = card.querySelector('.guide-next'); if (next && document.activeElement !== next && !document.activeElement?.closest('.guide-card')) next.focus({ preventScroll: true });
  }
  function render(force) {
    const p = progress(); const layer = ensureLayer(); if (!p || !layer || !S.guide) { hide(); return; }
    const v = S.guide.view(p); const st = S.ui.getState();
    const covered = st.primary || st.secondary || st.blockingModalCount || Boolean(p.presentation.activeResult);
    if (!v.onMap || covered || v.status === 'done' || v.status === 'skipped') { hide(); return; }
    if (v.showEntry) { showEntry(v); return; }
    if (v.atFinish) { showFinish(v); return; }
    if (v.current) { showStep(v, force === true); return; }
    hide();
  }
  S.ui.onRender(() => render(false));
  window.addEventListener('resize', () => { if (dom.layer && !dom.layer.hidden) render(true); });
  S.guideUI = { render, test: { layer: () => dom.layer, mode: () => local.mode, stepId: () => local.stepId, target: id => { const step = S.guide.STEPS.find(s => s.id === id); return step ? target(step) : null; } } };
})(globalThis.Silk = globalThis.Silk || {});
