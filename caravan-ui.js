(function (S) {
  'use strict';
  // 敦煌《驼队装货》 — host panel UI. This is the standalone archive v1.0 client (caravan-demo/app.js) re-hosted inside the main game:
  // the same screens (待发 / 玩法说明 / 装货 / 结算), the same tap-to-load interaction, balance bar, saddlebags and copy. Differences are
  // host-contract only: the panel header carries the title and the close button, the engine runs in-page (S.caravanEngine) instead
  // of a worker, art comes from S.assets, abort confirmation uses the host modal, and a FORMAL run reports to caravan.js
  // (CARAVAN_START / FINISH / SETTLE / ABORT) which pays through the real wallet and world clock. Trial runs never leave this file.
  const tier = { RICH: '出色', NORMAL: '合格', MODEST: '完成' };
  const ICONS = { silk: 'goods_changan_juanbo_v01', paper: 'goods_changan_zhizhang_v01', ceramics: 'goods_changan_tang_ceramics_v01', lacquerware: 'goods_changan_lacquerware_v01', hexi_wool: 'goods_dunhuang_heximaozhi_v01', dried_fruit: 'goods_dunhuang_ganguo_v01', medicinal_herbs: 'goods_dunhuang_yaocai_v01', dye: 'goods_dunhuang_ranliao_v01', khotan_silk: 'goods_khotan_sizhi_v01', khotan_jade: 'goods_khotan_yutianyu_v01', fine_jade: 'goods_khotan_jingzhi_yuqi_v01', felt_shoes: 'goods_khotan_maozhanxue_v01', silverware: 'caravan_placeholder_silverware_v0', turquoise: 'caravan_placeholder_turquoise_v0', pepper: 'caravan_placeholder_pepper_v0' };
  const SECONDS = 75;
  function asset(name) { const f = S.assets && S.assets[name]; if (!f) throw new Error('CURRENT asset mapping missing: ' + name); return f; }
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const art = kind => { const key = ICONS[kind]; if (!key) throw new Error('caravan cargo icon missing: ' + kind); return `<img class="glyph" src="${asset(key)}" alt="" draggable="false">`; };
  const ui = { game: null, kind: null, sessionId: null, data: null, selected: null, contextHint: '', hintUntil: 0, firstPop: false, popShown: false, beadLeft: 50, lastKey: '', prevState: '', prevBatch: 0, trialIndex: null, prepared: false, preparing: false, error: '', errorUntil: 0, finishPending: false, pollId: null, busy: false };
  let hostCtx = null; const dom = { shell: null };
  const progress = () => (hostCtx && hostCtx.p) || (S.app && S.app.state && S.app.state.progress) || null;
  const COPY = () => S.caravan.COPY;
  function newGame() { const g = new S.caravanEngine.Game(); g.outer = { state: null, apply() {} }; return g; }   // the host wallet / clock replace the P1 mock outer world
  function disposeGame() { stopPolling(); ui.game = null; ui.kind = null; ui.sessionId = null; ui.data = null; ui.selected = null; ui.prepared = false; ui.preparing = false; ui.finishPending = false; ui.lastKey = ''; ui.error = ''; ui.busy = false; }
  function startPolling() { stopPolling(); ui.pollId = setInterval(poll, 120); }
  function stopPolling() { if (ui.pollId) { clearInterval(ui.pollId); ui.pollId = null; } }
  function showError(msg) { ui.error = msg; ui.errorUntil = Date.now() + 3500; ui.lastKey = ''; render(); }
  function hint(text, ms = 1700) { ui.contextHint = text; ui.hintUntil = Date.now() + ms; ui.lastKey = ''; render(); }
  function shake(side) { const el = dom.shell && dom.shell.querySelector('.bag.' + side); if (!el) return; el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); setTimeout(() => el.classList.remove('shake'), 450); }
  function action(op, extra = {}) { if (!ui.game) return; try { ui.data = ui.game.action({ op, ...extra }); ui.lastKey = ''; render(); } catch (e) { showError(e.message || String(e)); } }
  function putInto(side) { if (!ui.selected || ui.selected.side !== 'waiting' || !ui.data || ui.data.state !== 'GAMEPLAY') return; if (ui.data[side].length === 4) { hint('这只驼袋已满'); shake(side); return; } const id = ui.selected.id; ui.selected = null; ui.firstPop = false; action('insert', { id, side }); }
  function context() { const d = ui.data; if (Date.now() < ui.hintUntil) return ui.contextHint; if (!ui.selected) return '选中货物，点驼袋放入；点袋中最上面的货物可取出'; const c = d.cargo[ui.selected.id]; return c ? `${c.name}｜${c.weightLabel} · ${c.attributes.join(' · ')}` : ''; }
  function bag(side) {
    const d = ui.data, a = d[side], lock = d.state !== 'GAMEPLAY', full = a.length === 4, target = !lock && ui.selected && ui.selected.side === 'waiting'; const pop = ui.firstPop ? ' pop' : '';
    const act = target ? `<button class="action${pop}${full ? ' full' : ''}" data-insert="${side}" ${full ? 'disabled' : ''}>${full ? '已满' : '放入 ↓'}</button>` : '';
    return `<div class="bag ${side}${target ? ' target' : ''}${full ? ' is-full' : ''}" data-bag="${side}" role="group" aria-label="${side === 'left' ? '左侧驼袋' : '右侧驼袋'}，${a.length}/4 件"><img class="bag-art" src="${asset('caravan_saddlebag_v0')}" alt="" draggable="false">${act}<div class="bag-stack">${[0, 1, 2, 3].map(i => `<i class="slot l${i}" aria-hidden="true"></i>`).join('')}${a.map((id, i) => { const c = d.cargo[id], top = i === a.length - 1; return `<button class="bag-item l${i} ${top ? 'top' : 'lower'}" style="z-index:${i + 2}" data-id="${id}" data-side="${side}" aria-label="${esc(c.name)}${top ? '，顶层，点击取出' : '，下层'}" ${lock ? 'disabled' : ''}>${art(c.kind)}${d.warnings.includes(id) ? '<b class="warn" aria-label="有问题">!</b>' : ''}</button>`; }).join('')}</div></div>`;
  }
  function camel(label, rise) { return `<div class="camel" role="img" aria-label="${label}" style="background-image:url('${asset('caravan_camel_v0')}')"></div>`; }
  function game() {
    const d = ui.data, lock = d.state !== 'GAMEPLAY', rise = ['EVALUATING', 'FEEDBACK'].includes(d.state), msg = d.state === 'EVALUATING' ? '骆驼起身试载…' : d.state === 'FEEDBACK' ? (d.feedback === 'PASS' ? '装好了 · ' + tier[d.lastTier] : '还不够稳，再调一调') : d.state === 'TRANSITION' ? '下一匹骆驼来了' : d.state === 'TIMEOUT' ? '时辰到了' : '';
    return `<header class="head"><span class="batch">${d.mode === 'TRIAL' ? '试玩 · ' : ''}第${d.batch}批</span><span class="timer" aria-label="剩余时间"></span></header><section class="game"><div class="balance-wrap"><div class="balance-track" aria-label="装驮平衡"><i class="bead" style="left:${ui.beadLeft}%"></i></div><div class="context" role="status">${esc(context())}</div></div><div class="stage ${rise ? 'rise' : ''} ${d.feedback === 'NOT_PASS' && d.state === 'FEEDBACK' ? 'wobble' : ''} ${d.state === 'TRANSITION' ? 'fade' : ''}">${msg ? `<div class="feedback" role="status">${msg}</div>` : ''}<div class="rig">${camel(rise ? '起身试载的骆驼' : '卧姿骆驼')}<i class="ground" aria-hidden="true"></i>${bag('left')}${bag('right')}</div></div><div class="waiting ${d.slots.length === 4 ? 'one-row' : ''}">${d.slots.map(id => { const c = d.cargo[id]; return `<button class="cargo ${d.waiting.includes(id) ? '' : 'absent'} ${ui.selected && ui.selected.id === id ? 'selected' : ''}" data-id="${id}" data-side="waiting" ${lock || !d.waiting.includes(id) ? 'disabled' : ''} aria-label="${esc(c.name + '，' + c.weightLabel + '，' + c.attributes.join('、'))}">${art(c.kind)}<span class="name">${esc(c.name)}</span><span class="meta">${c.weightLabel} · ${c.attributes[0]}</span></button>`; }).join('')}${d.canSubmit ? '<button class="primary submit" data-op="submit">确认装好</button>' : ''}</div></section>`;
  }
  function ready() {
    const p = progress(), av = S.caravan.availability(p);
    return `<section class="ready"><div class="emblem">${camel('骆驼')}</div><h2>驼队待发</h2><p>替货栈将货物稳妥装上驼背。<br>左右装匀，货物放稳，可多得工钱。</p>${av.formalVisible ? `<button class="primary" data-mode="FORMAL" ${av.canStartFormal && !ui.preparing && !ui.busy ? '' : 'disabled'}>开始装货</button>` : ''}<button class="secondary" data-mode="TRIAL" ${av.canTrial && ui.prepared && !ui.preparing && !ui.busy ? '' : 'disabled'}>试玩</button><button class="text-button" data-op="how">玩法说明 ⓘ</button><div class="status">${ui.preparing ? '正在备货…' : esc(av.reason || (av.canStartFormal ? COPY().startDuration : ''))}</div></section>`;
  }
  function how() { return `<section class="how"><div><h2>怎么玩</h2><p>选中货物，再点驼袋放入；点袋中最上面的货物可取出。<br>每只驼袋最多装 4 件，两袋共 8 件。<br>后放的货会叠在上面，只能从最上层取出。</p></div><div><h2>怎么装得稳</h2><p>两边尽量装匀。<br>重货放低些更稳。<br>怕压的货不要垫在重货下面。<br>易损的货尽量别让重货压在上面。</p></div><div><h2>试玩</h2><p>试玩可以完整体验三批装货。<br>不消耗时间，也不会获得实际工钱。</p></div><button class="primary" data-op="ready">知道了</button></section>`; }
  function tiersRow(tiers) { return `<div class="tiers">${[0, 1, 2].map(i => `<span>第${i + 1}批<br><b>${tier[tiers[i]] || '未完成'}</b></span>`).join('')}</div>`; }
  function trialSettlement() {
    const d = ui.data, r = d.settlement, formalPending = ui.kind === 'formal';
    return `<section class="settlement"><h2>${r.completed === 3 ? '驼队装货完成' : '驼队装货结束'}</h2>${tiersRow(r.tiers)}${r.completed ? `<div class="payrow"><span>基础工钱</span><b>${r.base} 钱</b></div><div class="payrow"><span>额外工钱</span><b>${r.extra} 钱</b></div>` : '<p>未完成有效装驮</p>'}<div class="payrow total"><span>${formalPending ? '今日所得' : '模拟所得'}</span><span>${r.cash} 钱</span></div>${formalPending ? (ui.error ? `<p class="inline-error">${esc(ui.error)}</p><div class="outlets"><button class="primary" data-op="retry-finish">${COPY().retryFinish}</button></div>` : '<p>正在记账…</p>') : `<p>试玩不消耗时间，也不会获得实际工钱。</p><div class="outlets"><button class="primary" data-dest="LIVELIHOOD_LIST">返回营生</button><button class="secondary" data-dest="CITY">退出营生</button></div>`}</section>`;
  }
  function hostSettlement(v) {
    const r = v.result;
    return `<section class="settlement"><h2>${esc(r.title)}</h2>${tiersRow(r.tiers)}${r.completed ? `<div class="payrow"><span>基础工钱</span><b>${r.baseWage} 钱</b></div><div class="payrow"><span>额外工钱</span><b>${r.extraWage} 钱</b></div>` : '<p>未完成有效装驮</p>'}<div class="payrow total"><span>今日所得</span><span>${r.totalWage} 钱</span></div>${ui.error ? `<p class="inline-error">${esc(ui.error)}</p>` : ''}<div class="outlets"><button class="primary" data-settle="LIVELIHOOD_LIST" ${ui.busy ? 'disabled' : ''}>${COPY().backToWork}</button><button class="secondary" data-settle="CITY" ${ui.busy ? 'disabled' : ''}>${COPY().exitWork}</button></div></section>`;
  }
  function stale(v) { return `<section class="ready"><div class="emblem">${camel('骆驼')}</div><h2>驼队待发</h2><p>${esc(COPY().stale)}</p><button class="primary" data-abort-stale="${esc(v.sessionId)}">${COPY().leave}</button></section>`; }
  function fitRig() { const stage = dom.shell.querySelector('.stage'), rig = dom.shell.querySelector('.rig'); if (!stage || !rig) return; const w = stage.clientWidth, h = stage.clientHeight - 8; const rh = Math.max(190, Math.min(h, w * .72, 330)); rig.style.height = rh + 'px'; rig.style.width = Math.min(w, rh / .72) + 'px'; }
  function render() {
    if (!dom.shell) return;
    const p = progress(); if (!p) return;
    const v = S.caravan.view(p);
    if (v && v.result && !v.settled) { stopPolling(); const key = 'host:' + v.settlementId + ':' + ui.error + ':' + ui.busy; if (key !== ui.lastKey) { ui.lastKey = key; dom.shell.innerHTML = hostSettlement(v); } return; }
    if (v && v.phase === 'PLAYING' && !(ui.game && ui.kind === 'formal' && ui.sessionId === v.sessionId)) { stopPolling(); const key = 'stale:' + v.sessionId; if (key !== ui.lastKey) { ui.lastKey = key; dom.shell.innerHTML = stale(v); } return; }
    if (!ui.game) { ui.game = newGame(); ui.data = ui.game.snapshot(); ui.lastKey = ''; prepareTrialSoon(); }
    const d = ui.data, state = d.state;
    if (d.batch !== ui.prevBatch || (!['GAMEPLAY', 'ABORT_CONFIRM'].includes(state) && state !== ui.prevState)) ui.selected = null;
    ui.prevBatch = d.batch;
    const av = state === 'READY' ? S.caravan.availability(p) : null;
    const key = JSON.stringify({ ...d, remaining: 0, debug: undefined, selected: ui.selected, contextHint: Date.now() < ui.hintUntil ? ui.contextHint : '', error: Date.now() < ui.errorUntil ? ui.error : '', av, preparing: ui.preparing, prepared: ui.prepared, busy: ui.busy, kind: ui.kind, finishPending: ui.finishPending });
    if (key !== ui.lastKey) {
      ui.lastKey = key;
      if (state === 'READY') dom.shell.innerHTML = ready();
      else if (state === 'HOW_TO_PLAY') dom.shell.innerHTML = how();
      else if (['GAMEPLAY', 'EVALUATING', 'FEEDBACK', 'TRANSITION', 'TIMEOUT', 'ABORT_CONFIRM'].includes(state)) dom.shell.innerHTML = game();
      else if (state === 'SETTLEMENT') dom.shell.innerHTML = trialSettlement();
      else dom.shell.innerHTML = ready();
      if (Date.now() < ui.errorUntil && ui.error && state !== 'SETTLEMENT') { const e = document.createElement('p'); e.className = 'inline-error'; e.textContent = ui.error; dom.shell.append(e); }
      if (state !== ui.prevState) { const b = dom.shell.querySelector('button:not([disabled])'); if (b) b.focus({ preventScroll: true }); }
    }
    fitRig();
    const timer = dom.shell.querySelector('.timer'); if (timer) { timer.textContent = `${Math.ceil(d.remaining)}s`; timer.className = 'timer' + (d.remaining <= 5 ? ' urgent' : d.remaining <= 15 ? ' low' : ''); }
    const bead = dom.shell.querySelector('.bead'); if (bead) { const b = d.balance, r = b.ratio; let offset = r === null ? 0 : r >= .85 ? (1 - r) / .15 * 15 : r >= .8 ? 15 + (.85 - r) / .05 * 15 : 30 + (.8 - r) / .8 * 18; const next = Math.round(Math.min(95.5, Math.max(4.5, 50 + b.direction * offset)) * 10) / 10; if (next !== ui.beadLeft) { bead.style.transitionDuration = `${Math.min(.7, .2 + Math.abs(next - ui.beadLeft) * .012).toFixed(2)}s, .25s`; bead.style.left = `${next}%`; ui.beadLeft = next; } bead.classList.toggle('empty', r === null); bead.dataset.band = b.band; }
    ui.prevState = state;
  }
  function poll() {
    if (!ui.game || !dom.shell || !dom.shell.isConnected) { if (ui.game && ui.kind === 'trial' && dom.shell && !dom.shell.isConnected) disposeGame(); return; }
    try { ui.data = ui.game.snapshot(); } catch (e) { showError(e.message); return; }
    if (ui.kind === 'formal' && ui.data.state === 'SETTLEMENT' && !ui.finishPending && !ui.error) void submitFinish();
    render();
  }
  function prepareTrialSoon() {
    ui.trialIndex = Math.floor(Math.random() * 500); ui.prepared = false; ui.preparing = true;
    setTimeout(() => { if (!ui.game) return; try { ui.game.prepare(ui.trialIndex); ui.prepared = Boolean(ui.game.prepared[ui.trialIndex]); } catch (e) { ui.prepared = false; } ui.preparing = false; ui.lastKey = ''; render(); }, 30);
  }
  function startTrial() {
    if (!ui.game || ui.busy) return; ui.popShown = false; ui.firstPop = false; ui.beadLeft = 50; ui.kind = 'trial'; ui.sessionId = null;
    action('start', { mode: 'TRIAL', seconds: SECONDS, index: ui.trialIndex }); startPolling();
  }
  async function startFormal() {
    if (!ui.game || ui.busy || !hostCtx) return;
    ui.busy = true; ui.lastKey = ''; render();
    const out = await hostCtx.dispatch('CARAVAN_START', { mode: 'FORMAL' });
    ui.busy = false;
    if (out === null) { ui.lastKey = ''; render(); return; }
    const v = S.caravan.view(progress()); if (!v || v.phase !== 'PLAYING') { ui.lastKey = ''; render(); return; }
    ui.preparing = true; ui.lastKey = ''; render();
    setTimeout(() => {
      if (!ui.game) return;
      try {
        ui.game.prepare(v.groupIndex); if (!ui.game.prepared[v.groupIndex]) throw new Error(ui.game.errors[v.groupIndex] || '题目尚未准备完成');
        ui.kind = 'formal'; ui.sessionId = v.sessionId; ui.popShown = false; ui.firstPop = false; ui.beadLeft = 50; ui.finishPending = false; ui.error = '';
        ui.data = ui.game.action({ op: 'start', mode: 'FORMAL', seconds: SECONDS, index: v.groupIndex }); startPolling();
      } catch (e) { showError(e.message || String(e)); ui.kind = null; ui.sessionId = null; void hostCtx.dispatch('CARAVAN_ABORT', { sessionId: v.sessionId }, 'caravan-abort-' + v.sessionId); }
      finally { ui.preparing = false; ui.lastKey = ''; render(); }
    }, 30);
  }
  async function submitFinish() {
    if (!ui.game || ui.kind !== 'formal' || !hostCtx) return;
    const s = ui.game.session, r = s && s.result; if (!r) return;
    ui.finishPending = true; ui.error = ''; ui.lastKey = ''; render();
    const outcome = { reason: r.p0TerminationReason, tiers: s.results.map(x => x.performanceTier), elapsedSeconds: Math.min(SECONDS, Math.max(0, r.durationData.elapsedSeconds)), remainingSeconds: Math.min(SECONDS, Math.max(0, r.durationData.remainingSeconds)) };
    const out = await hostCtx.dispatch('CARAVAN_FINISH', { sessionId: ui.sessionId, outcome }, 'caravan-finish-' + ui.sessionId);
    ui.finishPending = false;
    if (out === null) { ui.error = COPY().finishError; ui.lastKey = ''; render(); return; }
    disposeGame(); ui.lastKey = ''; render();
  }
  async function settle(dest) {
    if (!hostCtx || ui.busy) return; const v = S.caravan.view(progress()); if (!v || !v.result || v.settled) return;
    ui.busy = true; ui.error = ''; ui.lastKey = ''; render();
    const out = await hostCtx.dispatch('CARAVAN_SETTLE', { sessionId: v.sessionId, settlementId: v.settlementId }, 'caravan-settle-' + v.settlementId);
    ui.busy = false;
    if (out === null) { ui.lastKey = ''; render(); return; }
    disposeGame(); leaveTo(dest);
  }
  function leaveTo(dest) {   // host navigation: the 营生 list is the dunhuang-work panel, the city is the scene; the dusk lodging flow follows a formal day
    S.ui.closePanel();
    const p = progress(); if (p && S.time.phase(p) === 2) { S.ui.openPanel('inn'); return; }
    if (dest === 'LIVELIHOOD_LIST') S.ui.openPanel('dunhuang-work');
  }
  function requestAbort() {
    if (!ui.game || !ui.data || ui.data.state !== 'GAMEPLAY' || !hostCtx) return;
    action('abort');   // engine → ABORT_CONFIRM; the clock does not run while the question is open
    hostCtx.showModal({ title: COPY().abortTitle, body: COPY().abortBody, actions: [
      { label: COPY().abortContinue, run: () => { hostCtx.dismissModal(); action('cancel_abort'); } },
      { label: COPY().abortLeave, danger: true, run: async () => {
        hostCtx.dismissModal(); const sessionId = ui.sessionId, formal = ui.kind === 'formal'; action('confirm_abort');
        if (formal) { const out = await hostCtx.dispatch('CARAVAN_ABORT', { sessionId }, 'caravan-abort-' + sessionId); if (out === null) { ui.lastKey = ''; render(); return; } }
        disposeGame(); S.ui.closePanel(); S.ui.openPanel('dunhuang-work');
      } }
    ] });
  }
  // Host close button (X): during a run → abort confirmation; between beats → ignored; entry / instructions → the panel closes.
  function interceptClose() {
    const st = ui.data && ui.data.state;
    if (ui.game && st === 'GAMEPLAY') { requestAbort(); return true; }
    if (ui.game && ['EVALUATING', 'FEEDBACK', 'TRANSITION', 'TIMEOUT', 'ABORT_CONFIRM', 'SETTLEMENT'].includes(st)) return true;
    disposeGame(); return false;
  }
  function onClick(e) {
    if (!dom.shell || ui.busy) return;
    const b = e.target.closest('button'), bagEl = e.target.closest('.bag');
    if (!b) { if (bagEl && ui.selected && ui.selected.side === 'waiting') putInto(bagEl.dataset.bag); return; }
    if (b.disabled) return;
    if (b.dataset.abortStale) { const sessionId = b.dataset.abortStale; ui.busy = true; hostCtx.dispatch('CARAVAN_ABORT', { sessionId }, 'caravan-abort-' + sessionId).then(() => { ui.busy = false; ui.lastKey = ''; render(); }); return; }
    if (b.dataset.settle) { void settle(b.dataset.settle); return; }
    if (b.dataset.dest) { disposeGame(); leaveTo(b.dataset.dest); return; }
    if (b.dataset.mode) { if (b.dataset.mode === 'FORMAL') void startFormal(); else startTrial(); return; }
    if (b.dataset.op === 'retry-finish') { void submitFinish(); return; }
    if (!ui.game || !ui.data) return;
    if (b.dataset.id) {
      if (ui.data.state !== 'GAMEPLAY') return; const id = b.dataset.id, side = b.dataset.side;
      if (side === 'waiting') { if (ui.selected && ui.selected.id === id) { ui.selected = null; ui.firstPop = false; } else { ui.selected = { id, side: 'waiting' }; ui.firstPop = !ui.popShown; if (ui.firstPop) ui.popShown = true; } ui.lastKey = ''; render(); return; }
      if (ui.selected && ui.selected.side === 'waiting') return putInto(side);
      if (ui.data[side][ui.data[side].length - 1] !== id) { hint('先取出上层货物'); shake(side); return; }
      ui.selected = null; action('remove', { id, side }); return;
    }
    if (b.dataset.insert) return putInto(b.dataset.insert);
    if (b.dataset.op === 'how' || b.dataset.op === 'ready' || b.dataset.op === 'submit') action(b.dataset.op);
  }
  function ensureShell() {
    if (dom.shell) return;
    dom.shell = document.createElement('div'); dom.shell.className = 'caravan-shell'; dom.shell.setAttribute('aria-label', '驼队装货');
    dom.shell.addEventListener('click', onClick);
    window.addEventListener('resize', () => { if (dom.shell && dom.shell.isConnected) { ui.lastKey = ''; render(); } });
  }
  S.ui.registerPanel('dunhuang-work', {
    title: '营生',
    render(c, b) {
      const av = S.caravan.availability(c.p), C = COPY();
      const card = c.el('section', 'caravan-job-card');
      card.append(c.el('h3', '', C.entryTitle), c.el('p', 'caravan-job-desc', C.entryDescription));
      const meta = c.el('div', 'caravan-job-meta'); meta.append(c.el('span', '', C.entryTime), c.el('span', '', C.entryPay)); card.append(meta);
      const artBox = c.el('div', 'caravan-job-art'); artBox.style.backgroundImage = `url('${asset('caravan_camel_v0')}')`; artBox.setAttribute('role', 'img'); artBox.setAttribute('aria-label', '骆驼'); card.append(artBox);
      if (!av.canStartFormal && av.reason) card.append(c.el('p', 'caravan-job-note', av.reason + (av.canTrial ? '（仍可试玩）' : '')));
      card.append(c.button(C.enter, () => c.openPanel('caravan')));
      b.append(card);
    }
  });
  S.ui.registerPanel('caravan', {
    title: COPY().entryTitle,
    noClose(c) { const v = S.caravan.view(c.p); const st = ui.data && ui.data.state; return Boolean(v && v.result && !v.settled) || Boolean(ui.game && ['EVALUATING', 'FEEDBACK', 'TRANSITION', 'TIMEOUT', 'SETTLEMENT'].includes(st)) || Boolean(ui.finishPending); },
    render(c, b) { hostCtx = c; ensureShell(); b.append(dom.shell); ui.lastKey = ''; render(); }
  });
  S.caravanUI = { interceptClose, requestAbort, render, test: { ui, dom, game: () => ui.game, data: () => ui.data, dispose: disposeGame,
    reference() { const s = ui.game && ui.game.session; return s ? { left: s.board.left.map(c => c.instance), right: s.board.right.map(c => c.instance) } : null; },
    worst() { return ui.game ? S.caravanEngine.worstLayout(ui.game.session) : null; },
    warp(seconds) { if (!ui.game) return; const base = ui.game.clock; const off = (ui.game.__warp || 0) + seconds; ui.game.__warp = off; ui.game.clock = () => ((typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000) + off; void base; } } };
})(globalThis.Silk = globalThis.Silk || {});
