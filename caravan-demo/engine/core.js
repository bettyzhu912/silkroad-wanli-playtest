// Port of vendor/p0/src/core.py (P0 pure scoring). The Python file remains the authority; tests/parity.js proves equality.
import { CARGO_DATA, PROTOTYPE_CONFIG } from './data.js';
export const CONFIG = PROTOTYPE_CONFIG, F = CONFIG.FROZEN_FOR_PROTOTYPE, T = CONFIG.PLAYTEST_TUNABLE;
export const CATALOG = Object.fromEntries(CARGO_DATA.cargo.map(c => [c.id, c]));
export const ATTR = CARGO_DATA.attributeLabels;
export class Cargo { constructor(instance, kind, weight, attributes, archetype, cw) { this.instance = instance; this.kind = kind; this.weight = weight; this.attributes = attributes; this.archetype = archetype; this.cw = cw; Object.freeze(this); } }
export function cargo(kind, instance = null) { const c = CATALOG[kind]; if (!c) throw new Error('unknown cargo ' + kind); return new Cargo(instance || kind, kind, c.weight, Object.freeze(c.attributes.slice()), c.archetype, c.constraintWeight); }
export function cargoEquals(a, b) { return a.instance === b.instance && a.kind === b.kind && a.weight === b.weight && a.archetype === b.archetype && a.cw === b.cw && a.attributes.length === b.attributes.length && a.attributes.every((x, i) => x === b.attributes[i]); }
export function physical_ratio(left, right) { if (left < 0 || right < 0 || !Number.isFinite(left + right)) throw new Error('invalid weight'); const mx = Math.max(left, right); return mx ? Math.min(left, right) / mx : null; }
export function classify(balance, stacking) {
  for (const v of [balance, stacking]) if (!(Number.isFinite(v) && v >= 0 && v <= 100)) throw new Error('invalid score');
  const layout = T.layoutWeights.balance * balance + T.layoutWeights.stacking * stacking, p = T.pass;
  const passed = layout >= p.layoutMin && balance >= p.balanceMin && stacking >= p.stackingMin;
  let tier = null;
  if (passed) tier = (layout >= T.performance.richLayoutMin && balance >= F.scoringArchitecture.richBalanceMin && stacking >= F.scoringArchitecture.richStackingMin) ? 'RICH' : layout < T.performance.normalLayoutMin ? 'MODEST' : 'NORMAL';
  return [layout, passed, tier];
}
export function item_penalty(c, layer, above) {
  const st = T.stacking, parts = {}; const weight_above = above.reduce((s, x) => s + x.weight, 0);
  if (c.weight === 5) parts.heavyLayer = st.heavyLayerPenalties[layer - 1];
  if (c.attributes.includes('PRESSURE_SENSITIVE') && !c.attributes.includes('DURABLE')) parts.pressure = st.pressureBands.find(b => weight_above >= b.minAbove && (b.maxAbove === null || weight_above <= b.maxAbove)).penalty;
  if (c.attributes.includes('FRAGILE')) { parts.fragileLayer = st.fragileLayerPenalties[layer - 1]; parts.fragileHeavyAbove = above.some(x => x.weight === 5) ? st.fragileAnyHeavyAbovePenalty : 0; }
  if (c.attributes.includes('SOFT')) parts.soft = weight_above >= st.softAboveThreshold ? st.softPenalty : 0;
  const raw = Object.values(parts).reduce((s, v) => s + v, 0);
  return { instance: c.instance, layer, weightAbove: weight_above, components: parts, rawPenalty: raw, penalty: Math.min(st.maxPenaltyPerCargo, raw) };
}
const bagCache = new Map();
export function bag_summary(bag) {
  const key = bag.map(c => c.instance + '|' + c.kind).join(',');
  let v = bagCache.get(key); if (v) return v;
  const w = bag.reduce((s, c) => s + c.weight, 0); let p = 0;
  for (let i = 0; i < bag.length; i++) p += item_penalty(bag[i], i + 1, bag.slice(i + 1)).penalty;
  v = [w, p]; if (bagCache.size > 30000) bagCache.clear(); bagCache.set(key, v); return v;
}
export function validate_layout(left, right, expected = null) {
  if (left.length > 4 || right.length > 4 || [...left, ...right].some(c => !(c instanceof Cargo))) throw new Error('REJECT_FEASIBILITY');
  const ids = [...left, ...right].map(c => c.instance); if (new Set(ids).size !== ids.length) throw new Error('REJECT_FEASIBILITY');
  if (expected !== null) { const a = ids.slice().sort(), b = expected.map(c => c.instance).sort(); if (a.length !== b.length || a.some((x, i) => x !== b[i])) throw new Error('REJECT_INCOMPLETE_LAYOUT'); }
}
export function evaluateLayout(left, right, referenceBestPhysicalRatio, { expected = null, debug = false } = {}) {
  left = Array.from(left); right = Array.from(right); validate_layout(left, right, expected);
  const [lw, lp] = bag_summary(left), [rw, rp] = bag_summary(right); const ratio = physical_ratio(lw, rw);
  if (ratio === null) return { state: 'EMPTY_UNSCORED', physicalBalanceRatio: null, BalanceScore: null, StackingScore: null, LayoutScore: null, passed: false, performanceTier: null };
  if (!Number.isFinite(referenceBestPhysicalRatio) || !(0 < referenceBestPhysicalRatio && referenceBestPhysicalRatio <= 1)) throw new Error('invalid reference denominator');
  const balance = Math.min(100.0, 100 * ratio / referenceBestPhysicalRatio), stacking = Math.max(0, 100 - lp - rp);
  const [layout, passed, tier] = classify(balance, stacking);
  const score = { physicalBalanceRatio: ratio, BalanceScore: balance, StackingScore: stacking, LayoutScore: layout, passed, performanceTier: tier };
  if (!debug) return score;
  return { ...score, leftWeight: lw, rightWeight: rw, cargoWeights: [...left, ...right].map(c => c.weight), constraintWeight: [...left, ...right].reduce((s, c) => s + c.cw, 0), referenceBestPhysicalRatio,
    penaltySources: { left: left.map((c, i) => item_penalty(c, i + 1, left.slice(i + 1))), right: right.map((c, i) => item_penalty(c, i + 1, right.slice(i + 1))) },
    warnings: ratio > referenceBestPhysicalRatio ? ['WARN_PLAYER_EXCEEDS_REFERENCE_PHYSICAL_RATIO'] : [] };
}
// Python tuple/list comparison (lexicographic, element-wise; numbers or strings or nested arrays)
export function cmp(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) { const n = Math.min(a.length, b.length); for (let i = 0; i < n; i++) { const c = cmp(a[i], b[i]); if (c) return c; } return a.length - b.length; }
  return a < b ? -1 : a > b ? 1 : 0;
}
export const pyMin = (a, b) => cmp(a, b) <= 0 ? a : b;
export function canonical_layout(left, right) { const pair = [left.map(c => c.instance), right.map(c => c.instance)]; return pyMin(pair, [pair[1], pair[0]]); }
const sortStr = a => a.slice().sort((x, y) => x < y ? -1 : x > y ? 1 : 0), sortNum = a => a.slice().sort((x, y) => x - y);
export function strategy_signature(left, right) {
  const all = [...left, ...right];
  const side = b => [b.reduce((s, c) => s + c.weight, 0), sortStr(b.slice(0, 2).map(c => c.archetype)), sortStr(b.slice(2).map(c => c.archetype))];
  const pair = [side(left), side(right)];
  return [all.length, sortNum(all.map(c => c.weight)), sortStr(all.map(c => c.archetype)), all.filter(c => c.cw >= 2).length,
    all.filter(c => c.archetype === 'HEAVY_DURABLE').length, all.filter(c => c.archetype === 'HEAVY_FRAGILE').length,
    all.filter(c => c.attributes.includes('PRESSURE_SENSITIVE')).length, all.filter(c => c.attributes.includes('SOFT')).length, pyMin(pair, [pair[1], pair[0]])];
}
export function serialize_signature(s) { return JSON.stringify(s); }
