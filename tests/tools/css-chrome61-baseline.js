'use strict';
// Adds Chrome 61 baseline declarations / gated fallback rules to the game CSS without changing what modern engines render.
const fs = require('fs');
const [,, src, out] = process.argv;
let css = fs.readFileSync(src, 'utf8'); const stats = {};
const bump = k => { stats[k] = (stats[k] || 0) + 1; };
// 1) inset shorthand -> physical properties first
css = css.replace(/(^|[;{])inset:([^;}]+)/g, (m, pre, val) => { const v = val.trim().split(/\s+/); const [t, r = t, b = t, l = r] = v; bump('inset'); return `${pre}top:${t};right:${r};bottom:${b};left:${l};inset:${val}`; });
// helper: split top-level comma args
function args(s) { const out = []; let depth = 0, cur = ''; for (const ch of s) { if (ch === '(') depth++; if (ch === ')') depth--; if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += ch; } out.push(cur.trim()); return out; }
function fnDecl(name, pick) { const re = new RegExp(`(^|[;{])([a-z-]+):(${name}\\()`, 'g'); let m; const edits = []; while ((m = re.exec(css))) { const start = m.index + m[1].length; let i = m.index + m[0].length, depth = 1; while (i < css.length && depth) { if (css[i] === '(') depth++; else if (css[i] === ')') depth--; i++; } const full = css.slice(start, i); const prop = m[2]; const inner = full.slice(prop.length + 1 + name.length + 1, -1); const a = args(inner); const baseline = pick(a); if (baseline) edits.push({ start, end: i, text: `${prop}:${baseline};${full}` }); } for (const e of edits.reverse()) { css = css.slice(0, e.start) + e.text + css.slice(e.end); bump(name); } }
fnDecl('clamp', a => a[1]); // preferred value
fnDecl('min', a => a[0]); fnDecl('max', a => a[0]);
// 3) overflow-wrap:anywhere (Chrome 80)
css = css.replace(/(^|[;{])overflow-wrap:anywhere/g, (m, pre) => { bump('overflow-wrap'); return `${pre}overflow-wrap:break-word;overflow-wrap:anywhere`; });
// 4) :root baseline for dvh + env(): plain values first, modern values behind @supports
if (/--viewport-height:100dvh/.test(css)) { css = css.replace('--viewport-height:100dvh', '--viewport-height:100vh'); css = css.replace(/(:root\{[^}]*\})/, '$1@supports (height:100dvh){:root{--viewport-height:100dvh}}'); bump('dvh'); }
const envVars = ['top', 'bottom', 'left', 'right'].filter(side => css.includes(`--safe-${side}:env(safe-area-inset-${side},0px)`));
if (envVars.length) { for (const side of envVars) css = css.replace(`--safe-${side}:env(safe-area-inset-${side},0px)`, `--safe-${side}:0px`); const modern = envVars.map(side => `--safe-${side}:var(--safe-area-inset-${side},env(safe-area-inset-${side},0px))`).join(';'); css = css.replace(/(:root\{[^}]*\}(?:@supports \(height:100dvh\)\{:root\{[^}]*\}\})?)/, `$1@supports (padding-top:env(safe-area-inset-top,0px)){:root{${modern}}}`); bump('env'); }
// 5) :is() expansion
function expandIs(selector) { const idx = selector.indexOf(':is('); if (idx < 0) return [selector]; let i = idx + 4, depth = 1; while (depth) { if (selector[i] === '(') depth++; else if (selector[i] === ')') depth--; i++; } const inner = selector.slice(idx + 4, i - 1); const pre = selector.slice(0, idx), post = selector.slice(i); return args(inner).flatMap(a => expandIs(pre + a + post)); }
css = css.replace(/(^|[}])([^{}@]*:is\([^{}]*)\{/g, (m, pre, sel) => { bump(':is'); return `${pre}${args(sel).flatMap(expandIs).join(',')}{`; });
// 6) parse rules (one level of @media) for gap / focus-visible fallbacks
const rules = []; { let i = 0, depth = 0, sel = '', body = '', inBody = false, stack = []; while (i < css.length) { const ch = css[i]; if (!inBody) { if (ch === '{') { const t = sel.trim(); if (t.startsWith('@media') || t.startsWith('@supports')) { stack.push(t); sel = ''; i++; continue; } inBody = true; body = ''; } else if (ch === '}') { stack.pop(); } else sel += ch; } else { if (ch === '}') { rules.push({ ctx: stack.join(' '), sel: sel.trim(), body: body.trim() }); sel = ''; inBody = false; } else body += ch; } i++; } }
const displayOf = new Map(); for (const r of rules) { const m = r.body.match(/(?:^|;)display:([a-z-]+)/); if (m) for (const s of r.sel.split(',')) displayOf.set(s.trim(), m[1]); }
const manual = { '.time-status': 'flex', '.market-product .info-row': 'flex', '.pack-status-row .info-row': 'flex', '.pack-status>.info-row': 'flex', '.home-choice .start-choices': 'grid' };
const flexFallback = {}; // ctx -> rules
for (const r of rules) { const gm = r.body.match(/(?:^|;)gap:([^;]+)/); if (!gm) continue; const gap = gm[1].trim(); if (gap === '0') continue; const disp = displayOf.get(r.sel) || manual[r.sel] || '?'; if (disp === 'grid') { const from = `${r.sel}{${r.body}}`; const to = `${r.sel}{${r.body.replace(/(^|;)gap:/, `$1grid-gap:${gap};gap:`)}}`; if (!css.includes(from)) throw new Error('grid rule not found ' + r.sel); css = css.replace(from, to); bump('grid-gap'); continue; } if (disp !== 'flex' && disp !== 'inline-flex') throw new Error('unknown display for gap rule ' + r.sel + ' ' + disp); const [rowGap, colGap = rowGap] = gap.split(/\s+/); const column = /flex-direction:column/.test(r.body); const wrap = /flex-wrap:wrap/.test(r.body); const decl = column ? `margin-top:${rowGap}` : wrap ? `margin-left:${colGap};margin-top:${rowGap}` : `margin-left:${colGap}`; (flexFallback[r.ctx] ||= []).push(`.no-flex-gap ${r.sel}>*+*{${decl}}`); bump('flex-gap'); }
let appendix = '';
for (const [ctx, list] of Object.entries(flexFallback)) appendix += ctx ? `${ctx}{${list.join('')}}` : list.join('');
// 7) :focus-visible -> gated :focus companion
for (const r of rules) { if (!r.sel.includes(':focus-visible')) continue; const sels = r.sel.split(',').map(s => '.no-focus-visible ' + s.trim().replace(/:focus-visible/g, ':focus')); const rule = `${sels.join(',')}{${r.body}}`; appendix += r.ctx ? `${r.ctx}{${rule}}` : rule; bump('focus'); }
css += (css.endsWith('\n') ? '' : '\n') + '/* Chrome 61 baseline fallbacks (gated by compat.js capability classes) */\n' + appendix + '\n';
fs.writeFileSync(out, css);
console.log(JSON.stringify(stats), 'appendix bytes', appendix.length);
