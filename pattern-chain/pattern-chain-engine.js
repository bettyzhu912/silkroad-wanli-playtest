/*
 * 《缀纹成章》DUNHUANG_PATTERN_CHAIN — 纯逻辑引擎（无 DOM，可在 Node 中测试）
 * Authority: ZHUWEN_CHENGZHANG_IMPLEMENTATION_MASTER_v1.1 + ZHUWEN_CHENGZHANG_ASSET_MANIFEST_v1.1 + UI_PAGE_SUPPLEMENT_v1.0
 * 规则标记：已确认 / PROTOTYPE（照值实施，可调） / TEMP_PROTOTYPE_POLICY（临时政策，保留标记） / TEMP_DEV_DECISION（未冻结边界的最小临时处理，见 DEV_DECISION_RECORD）
 * standalone 阶段：不连接真实经济、存档、旅途统计、B7 入口或主游戏路由。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PatternChainEngine = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const MINIGAME_ID = 'DUNHUANG_PATTERN_CHAIN';
  const DISPLAY_NAME = '缀纹成章';
  // 固定 canonical motif order（已确认），同时用于最终并列兜底
  const MOTIFS = Object.freeze(['LOTUS', 'DRAGON', 'THREE_HARES', 'POMEGRANATE_SCROLL', 'PEARL_CHAIN', 'DIAMOND_PATTERN']);
  const WILDCARD = 'BAOXIANGHUA_WILDCARD'; // 内部命名保留；玩家可见层统一「万能图样」
  const CONFIG = Object.freeze({
    cols: 6, rows: 7,                 // 6 × 7 = 42 格（当前玩法基线）
    timerMs: 60000,                   // PROTOTYPE 参数：60 秒，非最终冻结（单局体验目标约 45–60 秒）
    strokes: 10,                      // PROTOTYPE 参数：10 有效笔，非最终冻结
    minChain: 3,                      // 已确认：最短有效链 3
    wildcardThreshold: 8,             // 已确认：单笔链长 ≥ 8 生成 1 个万能图样（每笔最多 1 个）
    activeMotifCount: 5,              // 已确认：每局从 6 种普通纹样随机抽 5 种
    workDuration: 'HALF_DAY',         // C4 已冻结：固定半日工
    timeCostTicks: 1,                 // C4 已冻结：正式完成后 advanceTime(1)
    formalStartPhases: [0, 1],        // 晨 / 午可开始，暮不可开始（HALF_DAY 规则）
    shuffleTries: 300,                // TEMP_DEV_DECISION：重排尝试上限
    shuffleSoftTries: 60,             // TEMP_DEV_DECISION：前 60 次优先寻找含 5+ 路径的重排（soft target）
    initialBoardSoftTries: 20         // TEMP_DEV_DECISION：初盘优先生成含 5+ 路径的棋盘
  });
  const POLICIES = Object.freeze({
    allWildcardPath: 'TEMP_PROTOTYPE_POLICY: 全 wildcard 路径不能 commit，松手 invalid，不扣笔数',
    statistics: 'TEMP_STATS_POLICY_v1: 链长 N（含 wildcard）与本笔分数归属锁定的普通纹样；wildcard 不计入任何普通纹样的 clearedCount；生成 wildcard 的 final node 原普通 tile 计入 clearedCount；原始逐笔记录保留可重算',
    backtrackLock: 'TEMP_DEV_DECISION: 回退后按剩余路径重新计算锁型（撤掉首个普通纹样后只剩 wildcard 时解除锁型）',
    outsideRelease: 'TEMP_DEV_DECISION: 在棋盘区域外且非取消区松手 = 整笔无效、无成本（不把未定义区域当作提交区）',
    timeoutDuringDrag: 'TEMP_DEV_DECISION: 倒计时归零时若正在拖动，本笔作废、无成本；若正在结算动画，本笔已提交的结果完整执行后再结束',
    zeroClear: 'TEMP_DEV_DECISION: 零有效清除局无代表纹样（representativeMotif = null），结算页不虚构「本轮最多」',
    refillDistribution: 'TEMP_DEV_DECISION: 初盘与顶部补充在本局 5 种普通纹样中均匀随机；初盘与补充不产生 wildcard（唯一来源为 8+ 有效长链）'
  });
  const UNFROZEN = Object.freeze(['jobId', 'performanceTier', 'revealDuration', 'shuffleAlgorithmFinal']);
  // ZHUWEN_CHENGZHANG_SCORE_TO_CASH_MAPPING（用户冻结 2026-09-14）：validStrokes == 0 → 0 cash；否则 cash = min(15, 6 + floor((score − 1) / 15))。
  // 正式完成局付 6–15 钱；TRIAL / ABORTED 恒为 0。本映射按当前 60 s / 10 笔 prototype baseline 平衡：若日后改动局时长或笔数，须重新验证经济分布，
  // 但不得悄悄改动本公式（baseline 记录在下，主游戏的 tests/livelihood.test.js 在 baseline 变化时会失败提醒）。
  const SCORE_TO_CASH = Object.freeze({ id: 'ZHUWEN_CHENGZHANG_SCORE_TO_CASH_MAPPING', minCash: 6, maxCash: 15, scoreStep: 15, baseline: Object.freeze({ timerMs: 60000, strokes: 10 }) });
  function scoreToCash(score, validStrokes) { if (!(validStrokes > 0)) return 0; return Math.min(SCORE_TO_CASH.maxCash, SCORE_TO_CASH.minCash + Math.floor((Math.max(0, score) - 1) / SCORE_TO_CASH.scoreStep)); }

  // ---- 随机数（mulberry32，可复现）----
  function rngCreate(seed) { return { state: (seed >>> 0) || 0x9e3779b9 }; }
  function rngNext(rng) {
    let t = (rng.state = (rng.state + 0x6D2B79F5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function rngInt(rng, n) { return Math.floor(rngNext(rng) * n); }
  function shuffleArray(rng, arr) { for (let i = arr.length - 1; i > 0; i--) { const j = rngInt(rng, i + 1); const t = arr[i]; arr[i] = arr[j]; arr[j] = t; } return arr; }

  // ---- 棋盘几何 ----
  const idx = (cols, r, c) => r * cols + c;
  const rowOf = (cols, i) => Math.floor(i / cols);
  const colOf = (cols, i) => i % cols;
  function adjacent(cols, a, b) {
    if (a === b) return false;
    const dr = Math.abs(rowOf(cols, a) - rowOf(cols, b)), dc = Math.abs(colOf(cols, a) - colOf(cols, b));
    return dr <= 1 && dc <= 1;
  }
  function neighbors(cols, rows, i) {
    const r = rowOf(cols, i), c = colOf(cols, i), out = [];
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue; const rr = r + dr, cc = c + dc;
      if (rr >= 0 && rr < rows && cc >= 0 && cc < cols) out.push(idx(cols, rr, cc));
    }
    return out;
  }
  const isWild = cell => Boolean(cell) && cell.motif === WILDCARD;

  // ---- 计分（已确认）----
  function scoreFor(n) { if (n < CONFIG.minChain) return 0; return n <= 4 ? n : 2 * n - 4; }

  // ---- 路径校验（与玩家路径、可玩性检测共用同一规则）----
  // 返回 { ok, reason, locked, length }：ok 表示可提交（长度 ≥ 3 且至少一个普通纹样）
  function validatePath(board, cols, path) {
    if (!path.length) return { ok: false, reason: 'EMPTY', locked: null, length: 0 };
    const seen = new Set(); let locked = null;
    for (let k = 0; k < path.length; k++) {
      const i = path[k], cell = board[i];
      if (!cell) return { ok: false, reason: 'EMPTY_CELL', locked, length: k };
      if (seen.has(i)) return { ok: false, reason: 'REPEAT', locked, length: k };
      seen.add(i);
      if (k > 0 && !adjacent(cols, path[k - 1], i)) return { ok: false, reason: 'NOT_ADJACENT', locked, length: k };
      if (!isWild(cell)) { if (locked === null) locked = cell.motif; else if (cell.motif !== locked) return { ok: false, reason: 'TYPE_MISMATCH', locked, length: k }; }
    }
    if (path.length < CONFIG.minChain) return { ok: false, reason: 'TOO_SHORT', locked, length: path.length };
    if (locked === null) return { ok: false, reason: 'ALL_WILDCARD', locked, length: path.length }; // TEMP_PROTOTYPE_POLICY
    return { ok: true, reason: null, locked, length: path.length };
  }
  function lockOf(board, path) { for (const i of path) { const cell = board[i]; if (cell && !isWild(cell)) return cell.motif; } return null; }

  // ---- 可玩性检测：全盘是否存在任意合法长度 ≥ minLen 的路径（8 方向、锁型、wildcard、TEMP 全 wildcard 限制）----
  // 任何合法的长度 ≥ L 路径都包含一段长度恰为 L 的合法连续子路径（取含首个普通纹样的 L 格窗口），因此只需搜索定长 L 的合法路径。
  function findPath(board, cols, rows, len) {
    const used = new Array(board.length).fill(false); const path = [];
    function dfs(i, locked) {
      path.push(i); used[i] = true;
      if (path.length === len) { if (locked !== null) return true; path.pop(); used[i] = false; return false; }
      for (const j of neighbors(cols, rows, i)) {
        if (used[j]) continue; const cell = board[j]; if (!cell) continue;
        let nl = locked;
        if (!isWild(cell)) { if (locked !== null && cell.motif !== locked) continue; nl = cell.motif; }
        if (dfs(j, nl)) return true;
      }
      path.pop(); used[i] = false; return false;
    }
    for (let s = 0; s < board.length; s++) {
      const cell = board[s]; if (!cell) continue;
      if (dfs(s, isWild(cell) ? null : cell.motif)) return path.slice();
    }
    return null;
  }
  const hasValidPath = (board, cols, rows) => findPath(board, cols, rows, CONFIG.minChain) !== null;
  const hasPathOfLength = (board, cols, rows, len) => findPath(board, cols, rows, len) !== null;

  // ---- 统计 / 代表纹样（已确认的四级规则）----
  function emptyStats() { const s = {}; for (const m of MOTIFS) s[m] = { clearedCount: 0, maxChainLength: 0, scoreContribution: 0, strokes: 0 }; return s; }
  function representativeOf(stats) {
    const ranked = MOTIFS.map((m, i) => ({ m, i, s: stats[m] }))
      .sort((a, b) => (b.s.clearedCount - a.s.clearedCount) || (b.s.maxChainLength - a.s.maxChainLength) || (b.s.scoreContribution - a.s.scoreContribution) || (a.i - b.i));
    const first = ranked[0];
    return first && first.s.clearedCount > 0 ? first.m : null; // 零有效清除：null（TEMP_DEV_DECISION，不借 canonical order 冒充「本轮最多」）
  }

  // ---- 局 ----
  function newCell(run, motif) { return { id: run.nextId++, motif }; }
  function generateBoard(run) {
    const { cols, rows } = run; const n = cols * rows;
    let best = null;
    for (let t = 0; t < CONFIG.initialBoardSoftTries + 80; t++) {
      const board = new Array(n); for (let i = 0; i < n; i++) board[i] = newCell(run, run.activeMotifs[rngInt(run.rng, run.activeMotifs.length)]);
      if (!hasValidPath(board, cols, rows)) continue; // 硬要求：至少一条合法 3+
      if (t < CONFIG.initialBoardSoftTries && !hasPathOfLength(board, cols, rows, 5)) { if (!best) best = board; continue; } // soft target：5+
      return board;
    }
    if (best) return best;
    throw new Error('INITIAL_BOARD_UNPLAYABLE');
  }
  function createRun({ mode = 'TRIAL', seed = 1, now = 0, jobId = null } = {}) {
    if (mode !== 'TRIAL' && mode !== 'FORMAL') throw new Error('INVALID_MODE');
    const rng = rngCreate(seed);
    const pool = shuffleArray(rng, MOTIFS.slice());
    const active = pool.slice(0, CONFIG.activeMotifCount).sort((a, b) => MOTIFS.indexOf(a) - MOTIFS.indexOf(b));
    const run = {
      minigameId: MINIGAME_ID, mode, seed, jobId, // jobId 未冻结：standalone 由 mock host 提供占位
      cols: CONFIG.cols, rows: CONFIG.rows, rng, nextId: 1,
      activeMotifs: active, board: null,
      strokesLeft: CONFIG.strokes, score: 0, timerMs: CONFIG.timerMs, elapsedMs: 0, timeLeftMs: CONFIG.timerMs,
      phase: 'PLAYING', paused: false, resolving: false, path: [], lockedMotif: null,
      stats: emptyStats(), strokes: [], validStrokes: 0, longestChain: 0, wildcardsGenerated: 0, wildcardsCleared: 0,
      shuffles: 0, shuffleUnresolved: false, invalidReleases: 0, cancels: 0, backtracks: 0,
      timeoutDuringDrag: false, timeoutDuringResolve: false,
      endedBy: null, startedAt: now, endedAt: null, representativeMotif: null, result: null
    };
    run.board = generateBoard(run);
    return run;
  }

  function guardInput(run) {
    if (run.phase !== 'PLAYING') return 'NOT_PLAYING';
    if (run.paused) return 'PAUSED';
    if (run.resolving) return 'RESOLVING';
    return null;
  }
  function clearPath(run) { run.path = []; run.lockedMotif = null; }
  function preview(run) {
    const n = run.path.length, locked = run.lockedMotif;
    const valid = n >= CONFIG.minChain && locked !== null;
    return { length: n, locked, valid, allWildcard: n > 0 && locked === null, score: valid ? scoreFor(n) : 0, wildcard: valid && n >= CONFIG.wildcardThreshold };
  }
  function pathStart(run, i) {
    const g = guardInput(run); if (g) return { ok: false, reason: g };
    const cell = run.board[i]; if (!cell) return { ok: false, reason: 'EMPTY_CELL' };
    run.path = [i]; run.lockedMotif = isWild(cell) ? null : cell.motif;
    return { ok: true, preview: preview(run) };
  }
  function pathExtend(run, i) {
    const g = guardInput(run); if (g) return { ok: false, action: 'ignored', reason: g };
    if (!run.path.length) return { ok: false, action: 'ignored', reason: 'NO_PATH' };
    const last = run.path[run.path.length - 1];
    if (i === last) return { ok: true, action: 'ignored', reason: 'SAME', preview: preview(run) };
    if (run.path.length >= 2 && i === run.path[run.path.length - 2]) { // 逐格回退：回到前一节点撤销尾节点
      run.path.pop(); run.lockedMotif = lockOf(run.board, run.path); run.backtracks++;
      return { ok: true, action: 'backtracked', preview: preview(run) };
    }
    if (run.path.includes(i)) return { ok: true, action: 'ignored', reason: 'REPEAT', preview: preview(run) };
    if (!adjacent(run.cols, last, i)) return { ok: true, action: 'ignored', reason: 'NOT_ADJACENT', preview: preview(run) };
    const cell = run.board[i]; if (!cell) return { ok: true, action: 'ignored', reason: 'EMPTY_CELL', preview: preview(run) };
    if (!isWild(cell)) {
      if (run.lockedMotif !== null && cell.motif !== run.lockedMotif) return { ok: true, action: 'ignored', reason: 'TYPE_MISMATCH', preview: preview(run) };
      if (run.lockedMotif === null) run.lockedMotif = cell.motif;
    }
    run.path.push(i);
    return { ok: true, action: 'added', preview: preview(run) };
  }
  function pathCancel(run) { if (!run.path.length) return { result: 'none' }; run.cancels++; clearPath(run); return { result: 'cancelled' }; }

  // 松手：zone = 'board' | 'cancel' | 'outside'
  function pathRelease(run, { zone = 'board' } = {}) {
    if (!run.path.length) return { result: 'none' };
    if (run.phase !== 'PLAYING' || run.paused || run.resolving) { clearPath(run); return { result: 'invalid', reason: 'NOT_PLAYING' }; }
    if (zone === 'cancel') return pathCancel(run);
    if (zone === 'outside') { run.invalidReleases++; clearPath(run); return { result: 'invalid', reason: 'OUTSIDE_RELEASE' }; } // TEMP_DEV_DECISION
    const v = validatePath(run.board, run.cols, run.path);
    if (!v.ok) { run.invalidReleases++; const reason = v.reason; clearPath(run); return { result: 'invalid', reason }; } // 无成本
    return commit(run, v);
  }

  // 有效 stroke 严格顺序：validate → consume stroke → score → wildcard generation → remove → wildcard spawn → vertical gravity → top refill → settle → playability check
  function commit(run, v) {
    const path = run.path.slice(), N = path.length, locked = v.locked, finalNode = path[N - 1];
    const cells = path.map(i => ({ index: i, id: run.board[i].id, motif: run.board[i].motif }));
    const ordinaryCount = cells.filter(c => c.motif !== WILDCARD).length, wildcardCount = N - ordinaryCount;
    // consume stroke
    run.strokesLeft--;
    // score
    const strokeScore = scoreFor(N); run.score += strokeScore;
    // wildcard generation（判定）
    const generatesWildcard = N >= CONFIG.wildcardThreshold;
    // statistics（TEMP_STATS_POLICY_v1，原始记录保留）
    const st = run.stats[locked]; st.clearedCount += ordinaryCount; st.maxChainLength = Math.max(st.maxChainLength, N); st.scoreContribution += strokeScore; st.strokes++;
    run.validStrokes++; run.longestChain = Math.max(run.longestChain, N); run.wildcardsCleared += wildcardCount; if (generatesWildcard) run.wildcardsGenerated++;
    const stroke = { n: run.validStrokes, length: N, locked, ordinaryCount, wildcardCount, score: strokeScore, generatesWildcard, finalNode, cells, atMs: run.elapsedMs };
    run.strokes.push(stroke);
    // remove
    for (const c of cells) run.board[c.index] = null;
    // wildcard spawn（清除后在 final node 放置）
    let spawn = null;
    if (generatesWildcard) { const cell = newCell(run, WILDCARD); run.board[finalNode] = cell; spawn = { index: finalNode, id: cell.id, motif: WILDCARD }; }
    // vertical gravity + top refill
    const moves = [], refills = [];
    for (let c = 0; c < run.cols; c++) {
      const kept = [];
      for (let r = run.rows - 1; r >= 0; r--) { const cell = run.board[idx(run.cols, r, c)]; if (cell) kept.push({ cell, from: r }); }
      let r = run.rows - 1;
      for (const k of kept) { const to = idx(run.cols, r, c); run.board[to] = k.cell; if (k.from !== r) moves.push({ id: k.cell.id, from: idx(run.cols, k.from, c), to }); r--; }
      const empties = r + 1;
      for (let rr = r; rr >= 0; rr--) { const cell = newCell(run, run.activeMotifs[rngInt(run.rng, run.activeMotifs.length)]); const to = idx(run.cols, rr, c); run.board[to] = cell; refills.push({ index: to, id: cell.id, motif: cell.motif, dropRows: empties }); }
    }
    // settle → playability check
    let shuffled = false;
    if (!hasValidPath(run.board, run.cols, run.rows)) shuffled = shuffleBoard(run);
    clearPath(run); run.resolving = true;
    return { result: 'committed', stroke, diff: { removed: cells, spawn, moves, refills, shuffled, board: snapshotBoard(run) } };
  }
  // NO_MOVE 才重排：保持 tile 多重集（换位不换种类）；硬要求至少一条合法 3+，5+ 为 soft target
  function shuffleBoard(run) {
    const motifs = run.board.map(c => c.motif);
    let fallback = null;
    for (let t = 0; t < CONFIG.shuffleTries; t++) {
      const perm = shuffleArray(run.rng, motifs.slice());
      const board = perm.map(m => newCell(run, m));
      if (!hasValidPath(board, run.cols, run.rows)) continue;
      if (t < CONFIG.shuffleSoftTries && !hasPathOfLength(board, run.cols, run.rows, 5)) { if (!fallback) fallback = board; continue; }
      run.board = board; run.shuffles++; return true;
    }
    if (fallback) { run.board = fallback; run.shuffles++; return true; }
    run.shuffleUnresolved = true; run.shuffles++; // 报告而非无限循环；结算时如实标记
    return true;
  }
  function resolveDone(run) {
    if (!run.resolving) return { ended: run.phase === 'ENDED' };
    run.resolving = false;
    if (run.phase !== 'PLAYING') return { ended: run.phase === 'ENDED' };
    if (run.strokesLeft <= 0) end(run, 'STROKES');
    else if (run.timeLeftMs <= 0) end(run, 'TIME');
    else if (run.shuffleUnresolved) end(run, 'NO_MOVE_UNRESOLVED');
    return { ended: run.phase === 'ENDED' };
  }
  function tick(run, dtMs) {
    if (run.phase !== 'PLAYING' || run.paused || !(dtMs > 0)) return { ended: false };
    run.elapsedMs += dtMs; run.timeLeftMs = Math.max(0, run.timerMs - run.elapsedMs);
    if (run.timeLeftMs > 0) return { ended: false };
    if (run.path.length) { run.timeoutDuringDrag = true; clearPath(run); } // TEMP_DEV_DECISION：本笔作废、无成本
    if (run.resolving) { run.timeoutDuringResolve = true; return { ended: false }; } // 结算动画完成后再结束
    end(run, 'TIME'); return { ended: true };
  }
  function pause(run) { if (run.phase === 'PLAYING') run.paused = true; }
  function resume(run) { run.paused = false; }
  function end(run, by) {
    if (run.phase !== 'PLAYING') return; run.phase = 'ENDED'; run.endedBy = by; run.endedAt = run.startedAt + run.elapsedMs; clearPath(run);
    run.representativeMotif = representativeOf(run.stats); // 先冻结统计，再启动动画
    run.result = buildResult(run, 'COMPLETED');
  }
  function abort(run) {
    if (run.phase !== 'PLAYING') return run.result;
    run.phase = 'ABORTED'; run.endedBy = 'ABORT'; run.endedAt = run.startedAt + run.elapsedMs; clearPath(run); run.resolving = false;
    run.representativeMotif = null; run.result = buildResult(run, 'ABORTED'); return run.result;
  }
  function snapshotBoard(run) { return run.board.map(c => (c ? { id: c.id, motif: c.motif } : null)); }
  function buildResult(run, completionStatus) {
    return {
      minigameId: MINIGAME_ID, jobId: run.jobId, mode: run.mode, completionStatus,
      performanceTier: null, // 未冻结：不编 RICH / NORMAL / MODEST 分数线
      primaryMetrics: { score: run.score, validStrokes: run.validStrokes, longestChain: run.longestChain, wildcardsGenerated: run.wildcardsGenerated },
      secondaryMetrics: { representativeMotif: run.representativeMotif, activeMotifs: run.activeMotifs.slice(), byMotif: JSON.parse(JSON.stringify(run.stats)), wildcardsCleared: run.wildcardsCleared, shuffles: run.shuffles, shuffleUnresolved: run.shuffleUnresolved, endedBy: run.endedBy, invalidReleases: run.invalidReleases, cancels: run.cancels, backtracks: run.backtracks },
      bonusMetrics: {},
      durationData: { timerMs: run.timerMs, elapsedMs: run.elapsedMs, startedAt: run.startedAt, endedAt: run.endedAt, timeoutDuringDrag: run.timeoutDuringDrag, timeoutDuringResolve: run.timeoutDuringResolve },
      strokes: run.strokes.map(s => Object.assign({}, s, { cells: s.cells.slice() })),
      prototype: { timerMs: CONFIG.timerMs, strokes: CONFIG.strokes, board: CONFIG.cols + 'x' + CONFIG.rows, seed: run.seed },
      policies: POLICIES, unfrozen: UNFROZEN,
      economy: { cash: completionStatus === 'ABORTED' || run.mode === 'TRIAL' ? 0 : scoreToCash(run.score, run.validStrokes), cashMapping: SCORE_TO_CASH.id, cashNote: run.mode === 'TRIAL' ? '试玩模式 · 不获得实际收益' : completionStatus === 'ABORTED' ? 'ABORTED：0 cash' : 'ZHUWEN_CHENGZHANG_SCORE_TO_CASH_MAPPING：min(15, 6 + ⌊(score − 1) / 15⌋)，无有效落笔 0', timeCostTicks: run.mode === 'FORMAL' && completionStatus === 'COMPLETED' ? CONFIG.timeCostTicks : 0 }
    };
  }

  return Object.freeze({
    MINIGAME_ID, DISPLAY_NAME, MOTIFS, WILDCARD, CONFIG, POLICIES, UNFROZEN, SCORE_TO_CASH, scoreToCash,
    createRun, pathStart, pathExtend, pathRelease, pathCancel, preview, resolveDone, tick, pause, resume, abort, shuffleBoard, buildResult,
    scoreFor, validatePath, findPath, hasValidPath, hasPathOfLength, representativeOf, emptyStats, adjacent, neighbors, snapshotBoard, rngCreate, rngNext
  });
});
