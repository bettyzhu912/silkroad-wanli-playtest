/* 于阗织坊 FINAL v5.0 — engine (no DOM). Authority: YUTIAN_WEAVING_FINAL_v5.0_15_LINES_CODEX_READY
   Flow: SORT (5) → WARP (5) → WARP_DONE (1.5 s, timer paused) → WEAVE round 1..3 × 5 = 15 → SETTLED.
   75 s shared timer runs in SORT / WARP / WEAVE; paused in PAUSE, URGENT, WARP_DONE, ROUND_TRANSITION. */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.YutianWeavingEngine = factory(); })(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const IDENTITIES = [
    { id: 'red', color: '赤红', pattern: '莲纹', hex: '#c8353b' },
    { id: 'white', color: '素白', pattern: '圆点纹', hex: '#f1e9d6' },
    { id: 'teal', color: '青绿', pattern: '团花纹', hex: '#2f9b9a' },
    { id: 'yellow', color: '明黄', pattern: '菱纹', hex: '#e1a323' },
    { id: 'purple', color: '紫色', pattern: '四瓣纹', hex: '#7b47b9' }
  ];
  const CONFIG = {
    totalSeconds: 75, sortItems: 5, warpGroups: 5, warpBand: [0.44, 0.56],
    rows: 5, cols: 5, rounds: 3, perRound: 5, total: 15,
    wages: { bands: [[0, 4, 9], [5, 9, 11], [10, 14, 15], [15, 15, 19]], regularBonusMax: 3, urgentBonus: 1, maxTotal: 23 },
    urgent: { probability: 0.35, eligibleAfter: 7, seconds: 8, requiredLines: 2 },
    loose: { firstAfter: 7, secondProbability: 0.6, maxPerRun: 2, repairSeconds: 5 },
    knot: { crossings: [0, 0.45, 0.65] },
    warpDoneSeconds: 1.5, roundTransitionSeconds: 0.7
  };
  // deterministic xorshift32
  function rng(state) { let x = state >>> 0 || 0x9e3779b9; return { next() { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }, get state() { return x; } }; }
  function shuffle(arr, r) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r.next() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  const ids = () => IDENTITIES.map(i => i.id);
  const node = (row, col) => row * CONFIG.cols + col, rowOf = n => Math.floor(n / CONFIG.cols), colOf = n => n % CONFIG.cols;
  const adjacent = (a, b) => (rowOf(a) === rowOf(b) && Math.abs(colOf(a) - colOf(b)) === 1) || (colOf(a) === colOf(b) && Math.abs(rowOf(a) - rowOf(b)) === 1);
  function freshBoard(r) { return { targets: shuffle(ids(), r), paths: {}, lit: {}, current: null, roundCount: 0 }; }
  function createRun(options = {}) {
    const seed = options.seed >>> 0 || ((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0), r = rng(seed), mode = options.mode === 'trial' ? 'trial' : 'formal';
    const run = {
      version: '5.0', mode, seed, phase: 'SORT', paused: false, timeLeftMs: CONFIG.totalSeconds * 1000, transitionMs: 0,
      sort: { tray: shuffle(ids(), r), placed: {}, count: 0 },
      warp: { values: [], done: [false, false, false, false, false], count: 0 },
      weave: { round: 1, roundsCompleted: 0, totalCompleted: 0, board: null, knot: null, loose: null, looseCount: 0, urgentRolled: false, urgentDone: false, urgentSuccess: false, urgentPending: false },
      urgent: null, wages: null, status: null, log: [], _rng: seed
    };
    // warp: every group starts outside the 合宜 band so that each one needs a real adjustment
    for (let i = 0; i < CONFIG.warpGroups; i++) { const side = r.next() < 0.5 ? -1 : 1; run.warp.values.push(0.5 + side * (0.2 + r.next() * 0.16)); }
    run.weave.board = freshBoard(r);
    run.weave.urgentRolled = mode === 'formal' ? r.next() < CONFIG.urgent.probability : false; // rolled exactly once at run creation
    if (options.forceUrgent !== undefined) run.weave.urgentRolled = Boolean(options.forceUrgent);
    run._rng = r.state; run._r = r;
    return run;
  }
  const R = run => run._r || (run._r = rng(run._rng));
  function log(run, type, extra) { run.log.push(Object.assign({ type, t: CONFIG.totalSeconds * 1000 - run.timeLeftMs }, extra || {})); }
  const timerRuns = run => !run.paused && ['SORT', 'WARP', 'WEAVE'].includes(run.phase) && run.mode === 'formal';
  // ---------------- time
  function tick(run, dtMs) {
    const events = []; if (!(dtMs > 0)) return events;
    if (run.phase === 'WARP_DONE' && !run.paused) { run.transitionMs -= dtMs; if (run.transitionMs <= 0) { startWeave(run); events.push({ type: 'WEAVE_START' }); } return events; }
    if (run.phase === 'ROUND_TRANSITION' && !run.paused) { run.transitionMs -= dtMs; if (run.transitionMs <= 0) { nextRound(run); events.push({ type: 'ROUND_START', round: run.weave.round }); } return events; }
    if (run.phase === 'URGENT' && !run.paused) { run.urgent.msLeft -= dtMs; if (run.urgent.msLeft <= 0) { endUrgent(run, false); events.push({ type: 'URGENT_END', success: false }); } return events; }
    if (run.phase === 'WEAVE' && !run.paused && run.weave.loose) { run.weave.loose.msLeft -= dtMs; if (run.weave.loose.msLeft <= 0) { looseFail(run); events.push({ type: 'LOOSE_FAILED' }); } }
    if (timerRuns(run)) { run.timeLeftMs -= dtMs; if (run.timeLeftMs <= 0) { run.timeLeftMs = 0; settle(run, 'timeout'); events.push({ type: 'TIMEOUT' }); } }
    return events;
  }
  function pause(run) { if (['SORT', 'WARP', 'WARP_DONE', 'WEAVE', 'ROUND_TRANSITION', 'URGENT'].includes(run.phase)) run.paused = true; }
  function resume(run) { run.paused = false; }
  // ---------------- 理丝
  function sortDrop(run, identityId, slotId) {
    if (run.phase !== 'SORT' || run.paused) return { ok: false, reason: 'PHASE' };
    if (!ids().includes(identityId) || !ids().includes(slotId) || run.sort.placed[identityId]) return { ok: false, reason: 'INVALID' };
    if (identityId !== slotId) { log(run, 'sortMiss', { identityId, slotId }); return { ok: false, reason: 'MISMATCH' }; } // colour AND pattern must match: the bundle returns
    run.sort.placed[identityId] = true; run.sort.count++; log(run, 'sortHit', { identityId });
    if (run.sort.count >= CONFIG.sortItems) { run.phase = 'WARP'; return { ok: true, done: true, phase: 'WARP' }; }
    return { ok: true, done: false };
  }
  // ---------------- 定经
  const inBand = v => v >= CONFIG.warpBand[0] && v <= CONFIG.warpBand[1];
  function warpSet(run, group, value) {
    if (run.phase !== 'WARP' || run.paused) return { ok: false, reason: 'PHASE' };
    if (!(group >= 0 && group < CONFIG.warpGroups) || !Number.isFinite(value)) return { ok: false, reason: 'INVALID' };
    run.warp.values[group] = Math.min(1, Math.max(0, value)); run.warp.done[group] = inBand(run.warp.values[group]); run.warp.count = run.warp.done.filter(Boolean).length;
    if (run.warp.count === CONFIG.warpGroups) { run.phase = 'WARP_DONE'; run.transitionMs = CONFIG.warpDoneSeconds * 1000; log(run, 'warpDone'); return { ok: true, allDone: true }; }
    return { ok: true, allDone: false, done: run.warp.done[group] };
  }
  function warpSkip(run) { if (run.phase !== 'WARP_DONE') return { ok: false }; startWeave(run); return { ok: true }; }
  function startWeave(run) { run.phase = 'WEAVE'; run.transitionMs = 0; log(run, 'weaveStart', { round: run.weave.round }); }
  // ---------------- 开工
  const board = run => run.phase === 'URGENT' ? run.urgent.board : run.weave.board;
  const blocked = run => run.phase === 'WEAVE' && (run.weave.knot || run.weave.loose);
  function weaveStart(run, identityId) {
    if (!(run.phase === 'WEAVE' || run.phase === 'URGENT') || run.paused) return { ok: false, reason: 'PHASE' };
    if (blocked(run)) return { ok: false, reason: run.weave.knot ? 'KNOT' : 'LOOSE' };
    const b = board(run); if (!ids().includes(identityId) || b.lit[identityId]) return { ok: false, reason: 'INVALID' };
    b.current = { identity: identityId, nodes: [] }; return { ok: true };
  }
  function weaveExtend(run, n) {
    if (!(run.phase === 'WEAVE' || run.phase === 'URGENT') || run.paused) return { ok: false, reason: 'PHASE' };
    const b = board(run), cur = b.current; if (!cur) return { ok: false, reason: 'NO_LINE' };
    if (!Number.isInteger(n) || n < 0 || n >= CONFIG.rows * CONFIG.cols) return { ok: false, reason: 'INVALID' };
    const last = cur.nodes[cur.nodes.length - 1];
    if (cur.nodes.length === 0) { if (n !== node(0, ids().indexOf(cur.identity))) return { ok: false, reason: 'START_NODE' }; }   // the thread hangs from its own bundle: first ring is directly below it
    else {
      if (n === last) return { ok: true, same: true };
      if (cur.nodes.length >= 2 && n === cur.nodes[cur.nodes.length - 2]) { cur.nodes.pop(); return { ok: true, backtrack: true }; } // dragging back one ring retracts
      if (!adjacent(last, n)) return { ok: false, reason: 'NOT_ADJACENT' };
      if (cur.nodes.includes(n)) return { ok: false, reason: 'REVISIT' };
      // rings and segments may be shared with finished lines (threads cross at rings, which is what knots are rolled from); a line never revisits its own ring, so every target order stays routable
    }
    cur.nodes.push(n); return { ok: true };
  }
  function crossingsOf(b, path) { let c = 0; for (const [id, p] of Object.entries(b.paths)) { if (p === path) continue; for (const n of path) if (p.includes(n)) c++; } return c; }
  function weaveRelease(run, targetSlot) {
    if (!(run.phase === 'WEAVE' || run.phase === 'URGENT') || run.paused) return { ok: false, reason: 'PHASE' };
    const b = board(run), cur = b.current; if (!cur) return { ok: false, reason: 'NO_LINE' };
    b.current = null;
    // legal completion = correct top identity + a real ring path ending on the bottom row + the matching target directly below that ring.
    // Anything else (a direct drag from the bundle to a target, a wrong target, a path that does not reach the bottom row) is INVALID: no count, no light, no roll.
    if (!Number.isInteger(targetSlot) || cur.nodes.length === 0) { log(run, 'lineInvalid', { identity: cur.identity, reason: cur.nodes.length === 0 ? 'NO_RINGS' : 'NO_TARGET' }); return { ok: false, reason: cur.nodes.length === 0 ? 'NO_RINGS' : 'NO_TARGET' }; }
    const last = cur.nodes[cur.nodes.length - 1];
    if (rowOf(last) !== CONFIG.rows - 1 || colOf(last) !== targetSlot) { log(run, 'lineInvalid', { identity: cur.identity, reason: 'NOT_ABOVE_TARGET' }); return { ok: false, reason: 'NOT_ABOVE_TARGET' }; }
    if (b.targets[targetSlot] !== cur.identity) { log(run, 'lineInvalid', { identity: cur.identity, reason: 'WRONG_TARGET' }); return { ok: false, reason: 'WRONG_TARGET' }; }
    b.paths[cur.identity] = cur.nodes.slice(); b.lit[cur.identity] = true; b.roundCount++;
    if (run.phase === 'URGENT') {
      const u = run.urgent; const done = u.required.filter(id => u.board.lit[id]).length;
      if (done >= CONFIG.urgent.requiredLines) { endUrgent(run, true); return { ok: true, completed: true, urgentSuccess: true }; }
      return { ok: true, completed: true, urgentProgress: done };
    }
    const w = run.weave; w.totalCompleted++; log(run, 'lineDone', { identity: cur.identity, round: w.round, roundCount: b.roundCount, total: w.totalCompleted });
    const out = { ok: true, completed: true, roundCount: b.roundCount, totalCompleted: w.totalCompleted, events: [] };
    const roundDone = b.roundCount >= CONFIG.perRound;
    if (roundDone) {
      w.roundsCompleted++;
      if (w.round >= (run.mode === 'trial' ? 1 : CONFIG.rounds)) { settle(run, run.mode === 'trial' ? 'trial' : 'complete'); out.runDone = true; out.events.push({ type: 'RUN_DONE' }); return out; }
      run.phase = 'ROUND_TRANSITION'; run.transitionMs = CONFIG.roundTransitionSeconds * 1000; out.roundDone = true; out.events.push({ type: 'ROUND_DONE', round: w.round }); return out;
    }
    // 先试一试: the two faults are demonstrated once each (line 2 → 丝头松脱, line 3 → 丝结缠住) with their teaching cards; no clock, no 急束
    if (run.mode === 'trial') {
      if (w.totalCompleted === 2) { beginLoose(run, cur.identity); out.events.push({ type: 'LOOSE_START', identity: cur.identity, segment: w.loose.segment, teach: true }); }
      else if (w.totalCompleted === 3) { const p = b.paths[cur.identity]; const shared = p.find(n => Object.entries(b.paths).some(([id, q]) => id !== cur.identity && q.includes(n))); w.knot = { node: shared !== undefined ? shared : p[Math.min(1, p.length - 1)], identity: cur.identity, crossings: crossingsOf(b, p) }; out.events.push({ type: 'KNOT', node: w.knot.node, teach: true }); }
      return out;
    }
    // random events (formal only, never on a round's last line): 急束 once when eligible, then 丝头松脱 (first guaranteed), then 丝结缠住 by real crossings
    const r = R(run), crossings = crossingsOf(b, b.paths[cur.identity]);
    if (run.mode === 'formal' && w.urgentRolled && !w.urgentDone && w.totalCompleted >= CONFIG.urgent.eligibleAfter) { beginUrgent(run); out.events.push({ type: 'URGENT_START' }); return out; }
    if (run.mode === 'formal' && w.totalCompleted >= CONFIG.loose.firstAfter && w.looseCount < CONFIG.loose.maxPerRun && !w.knot) {
      const trigger = w.looseCount === 0 ? true : r.next() < CONFIG.loose.secondProbability;
      if (trigger) { beginLoose(run, cur.identity); out.events.push({ type: 'LOOSE_START', identity: cur.identity, segment: w.loose.segment }); return out; }
    }
    if (run.mode === 'formal' && !w.knot && crossings > 0) {
      const p = CONFIG.knot.crossings[Math.min(2, crossings)]; const roll = r.next();
      if (roll < p) { const shared = b.paths[cur.identity].find(n => Object.entries(b.paths).some(([id, q]) => id !== cur.identity && q.includes(n))); w.knot = { node: shared, identity: cur.identity, crossings }; log(run, 'knot', { node: shared, crossings }); out.events.push({ type: 'KNOT', node: shared }); }
      else log(run, 'knotRollMiss', { crossings, roll });
    }
    return out;
  }
  function nextRound(run) { const w = run.weave; w.round++; w.board = freshBoard(R(run)); w.knot = null; w.loose = null; run.phase = 'WEAVE'; run.transitionMs = 0; log(run, 'roundStart', { round: w.round }); }
  // ---------------- 丝结缠住 / 丝头松脱 (formal: on the real board, compact hints only)
  function knotUntie(run, n) { const w = run.weave; if (run.phase !== 'WEAVE' || !w.knot) return { ok: false }; if (n !== undefined && n !== w.knot.node) return { ok: false, reason: 'WRONG_NODE' }; log(run, 'knotUntied', { node: w.knot.node }); w.knot = null; return { ok: true }; }
  function beginLoose(run, identity) {
    const w = run.weave, path = w.board.paths[identity]; const seg = Math.floor(R(run).next() * (path.length - 1 || 1));
    w.loose = { identity, segment: seg, from: path[seg], to: path[seg + 1], msLeft: CONFIG.loose.repairSeconds * 1000 }; w.looseCount++; log(run, 'loose', { identity, segment: seg });
  }
  function looseRepair(run, from, to) {
    const w = run.weave; if (run.phase !== 'WEAVE' || !w.loose) return { ok: false };
    const l = w.loose; if (!((from === l.from && to === l.to) || (from === l.to && to === l.from))) return { ok: false, reason: 'WRONG_SEGMENT' };
    log(run, 'looseRepaired', { identity: l.identity }); w.loose = null; return { ok: true };
  }
  function looseFail(run) { // not repaired within 5 s: that thread unravels — its target goes dark again and the line must be woven again (counts stay equal to the lit targets)
    const w = run.weave, l = w.loose, b = w.board; delete b.paths[l.identity]; delete b.lit[l.identity]; b.roundCount = Math.max(0, b.roundCount - 1); w.totalCompleted = Math.max(0, w.totalCompleted - 1); log(run, 'looseFailed', { identity: l.identity }); w.loose = null;
  }
  // ---------------- 急束: an independent 8-second challenge on its own board; the 75 s clock stops
  function beginUrgent(run) {
    const w = run.weave, r = R(run); w.urgentDone = true; w.urgentPending = false;
    const required = shuffle(ids(), r).slice(0, CONFIG.urgent.requiredLines);
    run.urgent = { board: freshBoard(r), required, msLeft: CONFIG.urgent.seconds * 1000, savedPhase: 'WEAVE' }; run.phase = 'URGENT'; log(run, 'urgentStart', { required });
  }
  function endUrgent(run, success) { const w = run.weave; w.urgentSuccess = success; log(run, 'urgentEnd', { success }); run.urgent = null; run.phase = 'WEAVE'; }
  // ---------------- settlement / exit
  function wagesFor(run) {
    const w = run.weave, t = w.totalCompleted, band = CONFIG.wages.bands.find(([lo, hi]) => t >= lo && t <= hi);
    const base = band ? band[2] : 9, regular = Math.min(CONFIG.wages.regularBonusMax, w.roundsCompleted), urgent = w.urgentSuccess ? CONFIG.wages.urgentBonus : 0;
    return { base, regular, urgent, total: Math.min(CONFIG.wages.maxTotal, base + regular + urgent), totalCompleted: t, roundsCompleted: w.roundsCompleted };
  }
  function settle(run, status) { if (run.phase === 'SETTLED' || run.phase === 'ABANDONED') return run.wages; run.weave.board.current = null; run.weave.knot = null; run.weave.loose = null; run.urgent = null; run.phase = 'SETTLED'; run.status = status; run.wages = wagesFor(run); log(run, 'settled', { status, wages: run.wages }); return run.wages; }
  function abandon(run) { if (run.phase === 'SETTLED' || run.phase === 'ABANDONED') return { ok: false }; run.phase = 'ABANDONED'; run.status = 'abandoned'; run.wages = { base: 0, regular: 0, urgent: 0, total: 0, totalCompleted: run.weave.totalCompleted, roundsCompleted: run.weave.roundsCompleted, timeCost: 0 }; log(run, 'abandoned'); return { ok: true }; }
  const view = run => ({ phase: run.phase, paused: run.paused, timeLeftMs: run.timeLeftMs, sort: run.sort, warp: run.warp, weave: run.weave, urgent: run.urgent, wages: run.wages, status: run.status });
  return { IDENTITIES, CONFIG, createRun, tick, pause, resume, sortDrop, warpSet, warpSkip, weaveStart, weaveExtend, weaveRelease, knotUntie, looseRepair, settle, abandon, wagesFor, view, node, rowOf, colOf, crossingsOf };
});
