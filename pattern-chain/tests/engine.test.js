'use strict';
// 《缀纹成章》引擎测试：node pattern-chain/tests/engine.test.js
const assert = require('assert');
const E = require('../pattern-chain-engine.js');
const { MOTIFS, WILDCARD, CONFIG } = E;
let passed = 0; const failed = [];
function test(name, fn) { try { fn(); passed++; console.log('PASS ' + name); } catch (e) { failed.push(name); console.log('FAIL ' + name + '\n  ' + (e.stack || e).toString().split('\n').slice(0, 4).join('\n  ')); } }
const I = (r, c) => r * CONFIG.cols + c;
function setBoard(run, rowsOfLetters, map) { // letters → motifs; '*' = wildcard
  let id = 1000; run.board = [];
  for (const row of rowsOfLetters) for (const ch of row) run.board.push({ id: id++, motif: ch === '*' ? WILDCARD : map[ch] });
  assert.strictEqual(run.board.length, 42);
}
function play(run, path) { const r0 = E.pathStart(run, path[0]); assert.ok(r0.ok, JSON.stringify(r0)); for (const i of path.slice(1)) E.pathExtend(run, i); return E.pathRelease(run, { zone: 'board' }); }
const checker = (run) => { const A = run.activeMotifs; const rows = []; for (let r = 0; r < 7; r++) { let s = ''; for (let c = 0; c < 6; c++) s += 'abcde'[(2 * r + c) % 5]; rows.push(s); } return { rows, map: { a: A[0], b: A[1], c: A[2], d: A[3], e: A[4] } }; };

test('config: 6x7=42, prototype 60s/10 strokes, min chain 3, wildcard at 8, 5 of 6 motifs, HALF_DAY', () => {
  assert.strictEqual(CONFIG.cols * CONFIG.rows, 42); assert.strictEqual(CONFIG.timerMs, 60000); assert.strictEqual(CONFIG.strokes, 10);
  assert.strictEqual(CONFIG.minChain, 3); assert.strictEqual(CONFIG.wildcardThreshold, 8); assert.strictEqual(CONFIG.activeMotifCount, 5);
  assert.strictEqual(CONFIG.workDuration, 'HALF_DAY'); assert.strictEqual(CONFIG.timeCostTicks, 1); assert.deepStrictEqual(MOTIFS, ['LOTUS', 'DRAGON', 'THREE_HARES', 'POMEGRANATE_SCROLL', 'PEARL_CHAIN', 'DIAMOND_PATTERN']);
});
test('scoring table: N=3/4/5/6/7/8 → 3/4/6/8/10/12, 2N-4 beyond, 1-2 cells score 0', () => {
  assert.deepStrictEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 12].map(E.scoreFor), [0, 0, 3, 4, 6, 8, 10, 12, 14, 20]);
});
test('createRun: 42 cells, 5 active ordinary motifs in canonical order, no wildcard on the initial board, playable, deterministic by seed', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const run = E.createRun({ seed, mode: 'TRIAL' });
    assert.strictEqual(run.board.length, 42); assert.strictEqual(run.activeMotifs.length, 5);
    assert.deepStrictEqual(run.activeMotifs, run.activeMotifs.slice().sort((a, b) => MOTIFS.indexOf(a) - MOTIFS.indexOf(b)));
    assert.ok(run.activeMotifs.every(m => MOTIFS.includes(m)));
    assert.ok(run.board.every(c => c && run.activeMotifs.includes(c.motif)), 'only active ordinary motifs');
    assert.ok(E.hasValidPath(run.board, 6, 7), 'initial board has a valid 3+ path');
    const ids = new Set(run.board.map(c => c.id)); assert.strictEqual(ids.size, 42);
  }
  const a = E.createRun({ seed: 42 }), b = E.createRun({ seed: 42 });
  assert.deepStrictEqual(a.board.map(c => c.motif), b.board.map(c => c.motif)); assert.deepStrictEqual(a.activeMotifs, b.activeMotifs);
  assert.throws(() => E.createRun({ mode: 'FULL' }), /INVALID_MODE/);
});
test('adjacency: 8 directions, no jumps, no repeats; backtrack pops without cost', () => {
  const run = E.createRun({ seed: 3 }); const ck = checker(run); const rows = ck.rows.slice();
  rows[0] = 'aaaaaa'; rows[1] = 'aaaaaa'; setBoard(run, rows, ck.map);
  assert.ok(E.pathStart(run, I(0, 0)).ok);
  assert.strictEqual(E.pathExtend(run, I(1, 1)).action, 'added');       // diagonal
  assert.strictEqual(E.pathExtend(run, I(0, 2)).action, 'added');       // diagonal back up
  assert.strictEqual(E.pathExtend(run, I(0, 4)).action, 'ignored');     // jump
  assert.strictEqual(E.pathExtend(run, I(0, 0)).action, 'ignored');     // repeat (not previous)
  assert.strictEqual(E.pathExtend(run, I(1, 1)).action, 'backtracked'); // previous node → pop
  assert.deepStrictEqual(run.path, [I(0, 0), I(1, 1)]); assert.strictEqual(run.backtracks, 1);
  assert.strictEqual(E.pathExtend(run, I(0, 0)).action, 'backtracked'); assert.deepStrictEqual(run.path, [I(0, 0)]);
  assert.strictEqual(E.pathExtend(run, I(0, 1)).action, 'added'); assert.strictEqual(E.pathExtend(run, I(0, 2)).action, 'added');
  const before = JSON.stringify(run.board), s = run.strokesLeft;
  const r = E.pathRelease(run, { zone: 'cancel' });
  assert.strictEqual(r.result, 'cancelled'); assert.strictEqual(run.strokesLeft, s); assert.strictEqual(run.score, 0); assert.strictEqual(JSON.stringify(run.board), before); assert.strictEqual(run.cancels, 1);
  assert.ok(Object.values(run.stats).every(v => v.clearedCount === 0));
});
test('1–2 cells release: invalid, no cost, board unchanged; outside release: invalid no cost (TEMP)', () => {
  const run = E.createRun({ seed: 3 }); const ck = checker(run); const rows = ck.rows.slice(); rows[0] = 'aaaaaa'; setBoard(run, rows, ck.map);
  const before = JSON.stringify(run.board);
  let r = play(run, [I(0, 0)]); assert.strictEqual(r.result, 'invalid'); assert.strictEqual(r.reason, 'TOO_SHORT');
  r = play(run, [I(0, 0), I(0, 1)]); assert.strictEqual(r.result, 'invalid'); assert.strictEqual(r.reason, 'TOO_SHORT');
  E.pathStart(run, I(0, 0)); E.pathExtend(run, I(0, 1)); E.pathExtend(run, I(0, 2)); r = E.pathRelease(run, { zone: 'outside' });
  assert.strictEqual(r.result, 'invalid'); assert.strictEqual(r.reason, 'OUTSIDE_RELEASE');
  assert.strictEqual(run.strokesLeft, 10); assert.strictEqual(run.score, 0); assert.strictEqual(JSON.stringify(run.board), before); assert.strictEqual(run.invalidReleases, 3);
});
test('wildcard: may start a path, first ordinary locks the type, cannot switch types through a wildcard, multiple wildcards allowed', () => {
  const run = E.createRun({ seed: 5 }); const ck = checker(run); const rows = ck.rows.slice();
  rows[0] = '*a*ab*'; rows[1] = 'bbbbbb'; setBoard(run, rows, ck.map);
  assert.ok(E.pathStart(run, I(0, 0)).ok); assert.strictEqual(run.lockedMotif, null); assert.strictEqual(E.preview(run).allWildcard, true);
  assert.strictEqual(E.pathExtend(run, I(0, 1)).action, 'added'); assert.strictEqual(run.lockedMotif, ck.map.a);
  assert.strictEqual(E.pathExtend(run, I(0, 2)).action, 'added');                       // wildcard in the middle
  assert.strictEqual(E.pathExtend(run, I(1, 2)).action, 'ignored');                     // b ≠ locked a
  assert.strictEqual(E.pathExtend(run, I(0, 3)).action, 'added');                       // a
  assert.strictEqual(E.pathExtend(run, I(0, 4)).action, 'ignored');                     // b
  assert.strictEqual(E.pathExtend(run, I(1, 4)).action, 'ignored');
  assert.deepStrictEqual(run.path, [I(0, 0), I(0, 1), I(0, 2), I(0, 3)]);
  const r = E.pathRelease(run, { zone: 'board' }); assert.strictEqual(r.result, 'committed'); assert.strictEqual(r.stroke.length, 4); assert.strictEqual(r.stroke.locked, ck.map.a);
  assert.strictEqual(r.stroke.ordinaryCount, 2); assert.strictEqual(r.stroke.wildcardCount, 2); assert.strictEqual(r.stroke.score, 4);
  assert.strictEqual(run.stats[ck.map.a].clearedCount, 2, 'wildcards not counted as ordinary'); assert.strictEqual(run.stats[ck.map.a].maxChainLength, 4); assert.strictEqual(run.wildcardsCleared, 2);
});
test('TEMP_PROTOTYPE_POLICY: all-wildcard path cannot commit, release invalid, no stroke cost', () => {
  const run = E.createRun({ seed: 5 }); const ck = checker(run); const rows = ck.rows.slice(); rows[3] = '****ab'; setBoard(run, rows, ck.map);
  const before = JSON.stringify(run.board);
  const r = play(run, [I(3, 0), I(3, 1), I(3, 2), I(3, 3)]);
  assert.strictEqual(r.result, 'invalid'); assert.strictEqual(r.reason, 'ALL_WILDCARD'); assert.strictEqual(run.strokesLeft, 10); assert.strictEqual(run.score, 0); assert.strictEqual(JSON.stringify(run.board), before);
  assert.ok(/TEMP_PROTOTYPE_POLICY/.test(E.POLICIES.allWildcardPath));
});
test('backtrack lock release (TEMP): wildcard, ordinary, backtrack → lock cleared', () => {
  const run = E.createRun({ seed: 5 }); const ck = checker(run); const rows = ck.rows.slice(); rows[0] = '*ab***'; setBoard(run, rows, ck.map);
  E.pathStart(run, I(0, 0)); E.pathExtend(run, I(0, 1)); assert.strictEqual(run.lockedMotif, ck.map.a);
  E.pathExtend(run, I(0, 0)); assert.strictEqual(run.lockedMotif, null); assert.deepStrictEqual(run.path, [I(0, 0)]);
  assert.strictEqual(E.pathExtend(run, I(1, 1)).action, 'added');
});
test('commit order: stroke consumed once, score once, removal, wildcard spawn at final node then gravity, vertical-only gravity, top refill from active motifs, no wildcard refill, board full', () => {
  const run = E.createRun({ seed: 9 }); const ck = checker(run); const rows = ck.rows.slice();
  rows[6] = 'aaaaaa'; rows[5] = 'aabcde'; setBoard(run, rows, ck.map);
  // 8-chain: row 6 all six + (5,0),(5,1) via a snake: (5,0)->(5,1)->(6,2)? not adjacent to (5,1)? (5,1)-(6,2) diagonal ok
  const path = [I(5, 0), I(5, 1), I(6, 2), I(6, 1), I(6, 0)]; // 5 chain first: check ordering adjacency
  const r = play(run, path); assert.strictEqual(r.result, 'committed'); assert.strictEqual(r.stroke.length, 5); assert.strictEqual(r.stroke.score, 6); assert.strictEqual(run.strokesLeft, 9); assert.strictEqual(run.score, 6);
  assert.strictEqual(r.diff.removed.length, 5); assert.strictEqual(r.diff.spawn, null); assert.ok(run.resolving);
  assert.ok(r.diff.moves.every(m => m.from % 6 === m.to % 6 && m.to > m.from), 'gravity vertical downward only');
  assert.ok(r.diff.refills.every(f => run.activeMotifs.includes(f.motif) && f.dropRows > 0), 'refill from active motifs');
  assert.ok(run.board.every(Boolean), 'board full after settle'); assert.strictEqual(run.board.length, 42);
  const ids = run.board.map(c => c.id); assert.strictEqual(new Set(ids).size, 42);
  assert.strictEqual(E.pathStart(run, 0).reason, 'RESOLVING');
  assert.strictEqual(E.resolveDone(run).ended, false); assert.strictEqual(run.resolving, false);
  // refills only in the top rows of the affected columns: columns 0,1,2 lost 2,2,1 cells
  const perCol = {}; for (const f of r.diff.refills) (perCol[f.index % 6] = perCol[f.index % 6] || []).push(Math.floor(f.index / 6));
  assert.deepStrictEqual(Object.keys(perCol).sort(), ['0', '1', '2']);
  for (const [c, rowsUsed] of Object.entries(perCol)) { const k = rowsUsed.length; assert.deepStrictEqual(rowsUsed.slice().sort(), Array.from({ length: k }, (_, i) => i), 'column ' + c + ' refilled rows 0..k-1'); assert.ok(r.diff.refills.filter(f => f.index % 6 === Number(c)).every(f => f.dropRows === k)); }
  assert.deepStrictEqual(Object.fromEntries(Object.entries(perCol).map(([c, v]) => [c, v.length])), { 0: 2, 1: 2, 2: 1 });
});
test('wildcard generation: 7-chain none; 8-chain exactly one at the final node (then gravity), never two', () => {
  const run = E.createRun({ seed: 11 }); const ck = checker(run); const rows = ck.rows.slice();
  rows[2] = 'aaaaaa'; rows[3] = 'aaaaaa'; setBoard(run, rows, ck.map);
  let r = play(run, [I(2, 0), I(2, 1), I(2, 2), I(2, 3), I(2, 4), I(2, 5), I(3, 5)]); // 7
  assert.strictEqual(r.stroke.length, 7); assert.strictEqual(r.stroke.generatesWildcard, false); assert.strictEqual(r.diff.spawn, null); assert.strictEqual(run.wildcardsGenerated, 0);
  assert.strictEqual(run.board.filter(c => c.motif === WILDCARD).length, 0); E.resolveDone(run);
  const run2 = E.createRun({ seed: 11 }); setBoard(run2, rows, ck.map);
  const final = I(3, 5);
  r = play(run2, [I(2, 0), I(2, 1), I(2, 2), I(2, 3), I(2, 4), I(2, 5), I(3, 4), final]); // 8, final node (3,5)
  assert.strictEqual(r.stroke.length, 8); assert.strictEqual(r.stroke.score, 12); assert.strictEqual(r.stroke.generatesWildcard, true); assert.strictEqual(r.diff.spawn.index, final); assert.strictEqual(run2.wildcardsGenerated, 1);
  const wilds = run2.board.map((c, i) => (c.motif === WILDCARD ? i : -1)).filter(i => i >= 0);
  assert.strictEqual(wilds.length, 1, 'exactly one wildcard'); assert.strictEqual(wilds[0] % 6, final % 6, 'same column as final node'); assert.ok(wilds[0] >= final, 'at or below the final node after gravity');
  assert.strictEqual(run2.board[wilds[0]].id, r.diff.spawn.id);
  E.resolveDone(run2);
  // 9-chain also exactly one
  const run3 = E.createRun({ seed: 12 }); const rows3 = ck.rows.slice(); rows3[0] = 'aaaaaa'; rows3[1] = 'aaaaaa'; setBoard(run3, rows3, checker(run3).map);
  const A = run3.activeMotifs[0]; for (let c = 0; c < 6; c++) { run3.board[I(0, c)].motif = A; run3.board[I(1, c)].motif = A; }
  r = play(run3, [I(0, 0), I(0, 1), I(0, 2), I(0, 3), I(0, 4), I(0, 5), I(1, 5), I(1, 4), I(1, 3)]);
  assert.strictEqual(r.stroke.length, 9); assert.strictEqual(r.stroke.score, 14); assert.strictEqual(run3.board.filter(c => c.motif === WILDCARD).length, 1);
});
test('representative selection: cleared count, then max chain, then score contribution, then canonical order; zero-clear → null', () => {
  const s = E.emptyStats();
  s.PEARL_CHAIN.clearedCount = 9; s.LOTUS.clearedCount = 8; s.LOTUS.maxChainLength = 8; s.LOTUS.scoreContribution = 50;
  assert.strictEqual(E.representativeOf(s), 'PEARL_CHAIN', 'cleared count beats longer chain / higher score');
  s.LOTUS.clearedCount = 9; assert.strictEqual(E.representativeOf(s), 'LOTUS', 'tie → max chain');
  s.PEARL_CHAIN.maxChainLength = 8; s.PEARL_CHAIN.scoreContribution = 60; assert.strictEqual(E.representativeOf(s), 'PEARL_CHAIN', 'tie chain → score');
  s.LOTUS.scoreContribution = 60; assert.strictEqual(E.representativeOf(s), 'LOTUS', 'all tied → canonical order');
  const d = E.emptyStats(); d.DIAMOND_PATTERN.clearedCount = 3; d.THREE_HARES.clearedCount = 3; assert.strictEqual(E.representativeOf(d), 'THREE_HARES');
  assert.strictEqual(E.representativeOf(E.emptyStats()), null, 'zero clears → no representative');
  assert.ok(!(WILDCARD in s), 'wildcard has no stats bucket');
});
test('NO_MOVE detection matches an independent brute-force oracle (player path rules): checkerboard, random boards, wildcards, all-wildcard', () => {
  // oracle: enumerate every simple 8-neighbour path up to length L and validate with the player rule (validatePath)
  function oracle(board, L) {
    const used = new Array(42).fill(false); const path = []; let found = false;
    function dfs(i) { if (found) return; path.push(i); used[i] = true; if (path.length >= 3 && E.validatePath(board, 6, path).ok && (path.length === L || L === 3)) { found = true; } else if (path.length < L) for (const j of E.neighbors(6, 7, i)) if (!used[j]) dfs(j); path.pop(); used[i] = false; }
    for (let s = 0; s < 42 && !found; s++) dfs(s); return found;
  }
  const run = E.createRun({ seed: 2 }); const ck = checker(run); setBoard(run, ck.rows, ck.map);
  assert.strictEqual(E.hasValidPath(run.board, 6, 7), false); assert.strictEqual(oracle(run.board, 3), false, 'checkerboard has no 3-path');
  run.board[I(3, 3)].motif = run.board[I(4, 4)].motif = run.board[I(5, 3)].motif = ck.map.a; // diagonal + turn
  assert.strictEqual(E.hasValidPath(run.board, 6, 7), true); assert.strictEqual(oracle(run.board, 3), true);
  assert.strictEqual(E.hasPathOfLength(run.board, 6, 7, 5), oracle(run.board, 5));
  const run2 = E.createRun({ seed: 2 }); setBoard(run2, ck.rows, ck.map); run2.board[I(0, 0)].motif = WILDCARD; run2.board[I(0, 1)].motif = WILDCARD;
  assert.strictEqual(E.hasValidPath(run2.board, 6, 7), true, 'two wildcards + an ordinary neighbour form a valid 3-path'); assert.strictEqual(oracle(run2.board, 3), true);
  const run3 = E.createRun({ seed: 2 }); setBoard(run3, ck.rows, ck.map); for (let i = 0; i < 42; i++) run3.board[i].motif = WILDCARD;
  assert.strictEqual(E.hasValidPath(run3.board, 6, 7), false, 'all-wildcard board is NO_MOVE under TEMP policy'); assert.strictEqual(oracle(run3.board, 3), false);
  // random sparse boards vs oracle (3-path and 5-path)
  const rng = E.rngCreate(77); let agree3 = 0, agree5 = 0, noMove = 0;
  for (let t = 0; t < 120; t++) {
    const rr = E.createRun({ seed: 500 + t }); const rows = []; for (let r = 0; r < 7; r++) { let s = ''; for (let c = 0; c < 6; c++) s += E.rngNext(rng) < 0.03 ? '*' : 'abcde'[(2 * r + c + (E.rngNext(rng) < 0.07 ? 1 : 0)) % 5]; rows.push(s); }
    setBoard(rr, rows, checker(rr).map);
    const o3 = oracle(rr.board, 3), o5 = oracle(rr.board, 5);
    assert.strictEqual(E.hasValidPath(rr.board, 6, 7), o3); assert.strictEqual(E.hasPathOfLength(rr.board, 6, 7, 5), o5); agree3++; agree5++; if (!o3) noMove++;
  }
  assert.strictEqual(agree3, 120); assert.strictEqual(agree5, 120); assert.ok(noMove > 5 && noMove < 115, 'sample mixes NO_MOVE and playable boards (NO_MOVE=' + noMove + ')');
});
test('shuffle: keeps the multiset, guarantees a 3+ path, counts once; not triggered when a 3+ exists', () => {
  const run = E.createRun({ seed: 2 }); const ck = checker(run); setBoard(run, ck.rows, ck.map);
  const count = b => b.reduce((m, c) => (m[c.motif] = (m[c.motif] || 0) + 1, m), {});
  const before = count(run.board);
  assert.strictEqual(E.shuffleBoard(run), true); assert.deepStrictEqual(count(run.board), before); assert.ok(E.hasValidPath(run.board, 6, 7)); assert.strictEqual(run.shuffles, 1); assert.strictEqual(run.shuffleUnresolved, false);
  // commit on a playable board must not shuffle
  const run2 = E.createRun({ seed: 21 }); const p = E.findPath(run2.board, 6, 7, 3); const r = play(run2, p); assert.strictEqual(r.result, 'committed');
  if (E.hasValidPath(run2.board, 6, 7)) assert.strictEqual(r.diff.shuffled, false);
});
test('timer: ends by TIME; timeout during drag discards the stroke without cost; timeout during resolve ends after resolveDone', () => {
  const run = E.createRun({ seed: 4 }); E.tick(run, 59999); assert.strictEqual(run.phase, 'PLAYING'); assert.strictEqual(run.timeLeftMs, 1);
  const p = E.findPath(run.board, 6, 7, 3); E.pathStart(run, p[0]); E.pathExtend(run, p[1]); E.pathExtend(run, p[2]);
  assert.strictEqual(E.tick(run, 1).ended, true); assert.strictEqual(run.phase, 'ENDED'); assert.strictEqual(run.endedBy, 'TIME'); assert.strictEqual(run.timeoutDuringDrag, true); assert.strictEqual(run.strokesLeft, 10); assert.strictEqual(run.validStrokes, 0);
  assert.strictEqual(run.result.completionStatus, 'COMPLETED'); assert.strictEqual(run.result.secondaryMetrics.representativeMotif, null);
  const run2 = E.createRun({ seed: 4 }); E.tick(run2, 59000); const p2 = E.findPath(run2.board, 6, 7, 3); const r = play(run2, p2); assert.strictEqual(r.result, 'committed');
  assert.strictEqual(E.tick(run2, 2000).ended, false); assert.strictEqual(run2.timeoutDuringResolve, true); assert.strictEqual(run2.phase, 'PLAYING');
  assert.strictEqual(E.resolveDone(run2).ended, true); assert.strictEqual(run2.endedBy, 'TIME'); assert.strictEqual(run2.validStrokes, 1);
  E.pause(run2); // no effect after end
  const run3 = E.createRun({ seed: 4 }); E.pause(run3); E.tick(run3, 100000); assert.strictEqual(run3.phase, 'PLAYING'); E.resume(run3); E.tick(run3, 60000); assert.strictEqual(run3.phase, 'ENDED');
});
test('strokes: game ends after the 10th valid commit (STROKES); invalid/cancel never consume; stats consistent', () => {
  const run = E.createRun({ seed: 8 }); let commits = 0;
  while (run.phase === 'PLAYING') {
    const p = E.findPath(run.board, 6, 7, 5) || E.findPath(run.board, 6, 7, 3); assert.ok(p);
    E.pathStart(run, p[0]); E.pathRelease(run, { zone: 'board' }); // 1 cell → invalid, no cost
    const r = play(run, p); assert.strictEqual(r.result, 'committed'); commits++; E.tick(run, 1000); E.resolveDone(run);
  }
  assert.strictEqual(commits, 10); assert.strictEqual(run.endedBy, 'STROKES'); assert.strictEqual(run.strokesLeft, 0); assert.strictEqual(run.invalidReleases, 10);
  assert.strictEqual(run.result.primaryMetrics.validStrokes, 10); assert.strictEqual(run.result.strokes.length, 10);
  assert.strictEqual(run.result.strokes.reduce((s, x) => s + x.score, 0), run.score);
  const by = run.result.secondaryMetrics.byMotif; assert.strictEqual(Object.values(by).reduce((s, x) => s + x.scoreContribution, 0), run.score);
  assert.ok(MOTIFS.includes(run.result.secondaryMetrics.representativeMotif));
});
test('results: TRIAL 0 cash/0 ticks; FORMAL completed → cash by the frozen ZHUWEN_CHENGZHANG_SCORE_TO_CASH_MAPPING + 1 tick; ABORTED → 0 cash, 0 ticks, no tier; jobId stays null', () => {
  const t = E.createRun({ seed: 1, mode: 'TRIAL' }); E.tick(t, 60000); assert.strictEqual(t.result.economy.cash, 0); assert.strictEqual(t.result.economy.timeCostTicks, 0); assert.strictEqual(t.result.performanceTier, null); assert.strictEqual(t.result.jobId, null);
  const f = E.createRun({ seed: 1, mode: 'FORMAL' }); E.tick(f, 60000); assert.strictEqual(f.result.economy.cash, E.scoreToCash(f.score, f.validStrokes)); assert.strictEqual(f.result.economy.cashMapping, 'ZHUWEN_CHENGZHANG_SCORE_TO_CASH_MAPPING'); assert.strictEqual(f.result.economy.timeCostTicks, 1); assert.ok(/ZHUWEN_CHENGZHANG_SCORE_TO_CASH_MAPPING/.test(f.result.economy.cashNote));
  const a = E.createRun({ seed: 1, mode: 'FORMAL' }); const p = E.findPath(a.board, 6, 7, 3); E.pathStart(a, p[0]); const res = E.abort(a);
  assert.strictEqual(res.completionStatus, 'ABORTED'); assert.strictEqual(res.economy.cash, 0); assert.strictEqual(res.economy.timeCostTicks, 0); assert.strictEqual(res.performanceTier, null); assert.strictEqual(a.phase, 'ABORTED'); assert.deepStrictEqual(a.path, []);
  assert.strictEqual(E.pathStart(a, 0).reason, 'NOT_PLAYING'); assert.strictEqual(E.abort(a), res);
  assert.deepStrictEqual(res.unfrozen, ['jobId', 'performanceTier', 'revealDuration', 'shuffleAlgorithmFinal']);
});
test('fuzz: 150 seeds of random play keep invariants (full board, unique ids, no double commit, score/stroke consistency, ends by STROKES or TIME)', () => {
  const rng = E.rngCreate(99);
  for (let seed = 100; seed < 250; seed++) {
    const run = E.createRun({ seed, mode: seed % 2 ? 'FORMAL' : 'TRIAL' }); let guard = 0;
    while (run.phase === 'PLAYING' && guard++ < 50) {
      const want = 3 + Math.floor(E.rngNext(rng) * 6); const p = E.findPath(run.board, 6, 7, want) || E.findPath(run.board, 6, 7, 3); assert.ok(p, 'board must stay playable');
      const strokesBefore = run.strokesLeft, scoreBefore = run.score;
      const r = play(run, p); assert.strictEqual(r.result, 'committed'); assert.strictEqual(run.strokesLeft, strokesBefore - 1); assert.strictEqual(run.score, scoreBefore + E.scoreFor(p.length));
      assert.strictEqual(E.pathRelease(run, { zone: 'board' }).result, 'none');
      assert.ok(run.board.every(Boolean)); assert.strictEqual(new Set(run.board.map(c => c.id)).size, 42);
      assert.ok(run.board.filter(c => c.motif === WILDCARD).length <= run.wildcardsGenerated);
      E.tick(run, 4000 + Math.floor(E.rngNext(rng) * 5000)); E.resolveDone(run);
    }
    assert.ok(run.phase === 'ENDED', 'ended'); assert.ok(['STROKES', 'TIME'].includes(run.endedBy), run.endedBy);
    assert.strictEqual(run.result.primaryMetrics.validStrokes, run.strokes.length); assert.ok(run.result.primaryMetrics.longestChain >= 3);
  }
});
console.log(`\n${passed} passed, ${failed.length} failed${failed.length ? ': ' + failed.join(', ') : ''}`);
process.exit(failed.length ? 1 : 0);

test('ZHUWEN_CHENGZHANG_SCORE_TO_CASH_MAPPING (frozen): 0 strokes → 0; else min(15, 6 + floor((score-1)/15)); baseline 60 s / 10 strokes', () => {
  assert.strictEqual(E.scoreToCash(0, 0), 0); assert.strictEqual(E.scoreToCash(40, 0), 0);
  assert.strictEqual(E.scoreToCash(3, 1), 6); assert.strictEqual(E.scoreToCash(15, 5), 6); assert.strictEqual(E.scoreToCash(16, 5), 7); assert.strictEqual(E.scoreToCash(30, 10), 7); assert.strictEqual(E.scoreToCash(31, 10), 8);
  assert.strictEqual(E.scoreToCash(60, 10), 9); assert.strictEqual(E.scoreToCash(135, 10), 14); assert.strictEqual(E.scoreToCash(136, 10), 15); assert.strictEqual(E.scoreToCash(800, 10), 15);
  for (let s = 1; s <= 900; s++) { const c = E.scoreToCash(s, 1); assert.ok(c >= 6 && c <= 15, 'bounds at ' + s); }
  assert.deepStrictEqual(E.SCORE_TO_CASH.baseline, { timerMs: 60000, strokes: 10 }); assert.strictEqual(CONFIG.timerMs, E.SCORE_TO_CASH.baseline.timerMs); assert.strictEqual(CONFIG.strokes, E.SCORE_TO_CASH.baseline.strokes);
  const a = E.createRun({ seed: 9, mode: 'FORMAL' }); E.abort(a); assert.strictEqual(a.result.economy.cash, 0);
});
