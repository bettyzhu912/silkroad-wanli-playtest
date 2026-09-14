'use strict';
// Chrome 61 (Android 8.1 WebView) CSS baseline pass for the Xiaohongshu package — minitool-zip-builder 1.6.0, references/css-compatibility.md.
// The source stylesheets stay modern (Pages / desktop). At build time every staged stylesheet goes through transform(): each feature that
// Chrome 61 cannot parse gets a baseline path written BEFORE it ("old value first, new value after"), so a modern engine still resolves the
// modern declaration and Chrome 61 keeps the fallback instead of dropping the declaration:
//   #rrggbbaa / #rgba colours (Chrome 62)   → rgba(r,g,b,a) everywhere (identical rendering, no dual rule needed)
//   inset (Chrome 87)                       → top / right / bottom / left inserted before it
//   min() / max() / clamp() (Chrome 79)     → a same-property fallback declaration (relative argument / preferred value) inserted before it
//   conic-gradient() (Chrome 69)            → the same value with every conic layer replaced by a solid linear-gradient of its first colour
//   gap on a grid container (Chrome 66)     → grid-gap / grid-row-gap / grid-column-gap inserted before it (Chrome 61 grid syntax)
//   gap on a flex container (Chrome 84)     → a `.no-flex-gap SEL > * + * { margin-… }` rule (compat.js sets the class after a real layout test)
//   :focus-visible (Chrome 86)              → a `.no-focus-visible … :focus` copy of the rule (compat.js sets the class when the selector is unknown)
//   aspect-ratio (Chrome 88)                → no CSS fallback exists; extractAspectRules() lists every rule so compat.js can size those boxes in JS
// lint() re-reads a stylesheet and reports every post-Chrome-61 feature that still lacks its baseline, so the build fails instead of shipping it.
const fs = require('fs');

// ---------- parsing (comments dropped, strings / parentheses respected) ----------
function stripComments(css) { return css.replace(/\/\*[\s\S]*?\*\//g, ''); }
function scanTo(text, i, stopChars) { // index of the first stop char at depth 0 outside strings, or -1
  let depth = 0, q = null;
  for (; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '\\') i++; else if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'") { q = ch; continue; }
    if (ch === '(') depth++; else if (ch === ')') depth--;
    else if (depth === 0 && stopChars.includes(ch)) return i;
  }
  return -1;
}
function matchBrace(text, open) { let depth = 0, q = null; for (let i = open; i < text.length; i++) { const ch = text[i]; if (q) { if (ch === '\\') i++; else if (ch === q) q = null; continue; } if (ch === '"' || ch === "'") { q = ch; continue; } if (ch === '{') depth++; else if (ch === '}') { depth--; if (!depth) return i; } } return -1; }
function splitTop(text, sep) { const out = []; let i = 0; while (i <= text.length) { const j = scanTo(text, i, sep); if (j < 0) { out.push(text.slice(i)); break; } out.push(text.slice(i, j)); i = j + 1; } return out; }
function parseDecls(body) { return splitTop(body, ';').map(s => s.trim()).filter(Boolean).map(d => { const k = d.indexOf(':'); return k < 0 ? [d, ''] : [d.slice(0, k).trim().toLowerCase(), d.slice(k + 1).trim()]; }).filter(d => d[0]); }
const DECL_AT = new Set(['font-face', 'page', 'counter-style', 'property', 'font-feature-values']);
function parse(css) {
  const nodes = []; let i = 0; css = stripComments(css);
  while (i < css.length) {
    while (i < css.length && /\s/.test(css[i])) i++;
    if (i >= css.length) break;
    if (css[i] === '@') {
      const stop = scanTo(css, i, '{;'); if (stop < 0) break;
      const head = css.slice(i + 1, stop).trim(), name = (head.match(/^[\w-]+/) || [head])[0].toLowerCase(), prelude = head.slice(name.length).trim();
      if (css[stop] === ';') { nodes.push({ type: 'at', name, prelude, statement: true }); i = stop + 1; continue; }
      const close = matchBrace(css, stop); const body = css.slice(stop + 1, close);
      nodes.push(DECL_AT.has(name) ? { type: 'at', name, prelude, decls: parseDecls(body) } : { type: 'at', name, prelude, children: parse(body) });
      i = close + 1; continue;
    }
    const open = scanTo(css, i, '{'); if (open < 0) break;
    const close = matchBrace(css, open);
    nodes.push({ type: 'rule', selector: css.slice(i, open).trim(), decls: parseDecls(css.slice(open + 1, close)) });
    i = close + 1;
  }
  return nodes;
}
function serialize(nodes) {
  return nodes.map(n => {
    if (n.type === 'rule') return n.selector + '{' + n.decls.map(d => d[0] + ':' + d[1]).join(';') + '}';
    if (n.statement) return '@' + n.name + (n.prelude ? ' ' + n.prelude : '') + ';';
    const head = '@' + n.name + (n.prelude ? ' ' + n.prelude : '');
    if (n.decls) return head + '{' + n.decls.map(d => d[0] + ':' + d[1]).join(';') + '}';
    return head + '{' + serialize(n.children) + '}';
  }).join('\n');
}
const selectors = sel => splitTop(sel, ',').map(s => s.trim()).filter(Boolean);
const norm = s => s.replace(/\s*([>+~,])\s*/g, '$1').replace(/\s+/g, ' ').trim();

// ---------- value helpers ----------
function hexToRgba(hex) { const h = hex.length === 4 ? hex.split('').map(c => c + c).join('') : hex; const n = i => parseInt(h.slice(i, i + 2), 16); const a = Math.round(n(6) / 255 * 1000) / 1000; return 'rgba(' + n(0) + ',' + n(2) + ',' + n(4) + ',' + a + ')'; }
function hexAlpha(value) { // outside url(...) only
  return value.split(/(url\((?:[^()]|\([^()]*\))*\))/).map((part, k) => k % 2 ? part : part.replace(/#([0-9a-f]{8}|[0-9a-f]{4})(?![0-9a-f])/gi, (m, hex) => hexToRgba(hex))).join('');
}
function findCall(value, names, from = 0) { // first top-level-ish call of one of `names` starting at/after `from`: { start, open, close }
  const re = new RegExp('(^|[^a-z0-9_-])(' + names.join('|') + ')\\(', 'ig'); re.lastIndex = from; const m = re.exec(value); if (!m) return null;
  const open = m.index + m[0].length - 1; let depth = 0; for (let i = open; i < value.length; i++) { if (value[i] === '(') depth++; else if (value[i] === ')') { depth--; if (!depth) return { start: m.index + m[1].length, name: m[2].toLowerCase(), open, close: i }; } } return null;
}
const RELATIVE = /(%|vw|vh|vmin|vmax|calc\()/;
function mathFallback(value) { // replaces every min()/max()/clamp() (innermost first) by one of its arguments
  let guard = 0;
  for (;;) {
    let call = findCall(value, ['min', 'max', 'clamp']), inner = call;
    while (inner) { const deeper = findCall(value.slice(0, inner.close), ['min', 'max', 'clamp'], inner.open + 1); if (!deeper) break; inner = deeper; }
    if (!inner || ++guard > 50) return value;
    const args = splitTop(value.slice(inner.open + 1, inner.close), ',').map(s => s.trim());
    let pick;
    if (inner.name === 'clamp') pick = args[1] || args[0];
    else if (inner.name === 'min') pick = args.find(a => RELATIVE.test(a)) || args[0];
    else pick = args[args.length - 1];
    value = value.slice(0, inner.start) + pick + value.slice(inner.close + 1);
  }
}
function conicFallback(value) {
  for (let guard = 0; guard < 20; guard++) {
    const call = findCall(value, ['conic-gradient', 'repeating-conic-gradient']); if (!call) return value;
    const inside = value.slice(call.open + 1, call.close), colour = (inside.match(/rgba?\([^)]*\)|#[0-9a-f]{3,8}\b|\b(?:transparent|white|black|red|gold|currentColor)\b/i) || ['transparent'])[0];
    value = value.slice(0, call.start) + 'linear-gradient(' + colour + ',' + colour + ')' + value.slice(call.close + 1);
  }
  return value;
}
function insetSides(value) { const v = splitTop(value.replace(/\s+/g, ' ').trim(), ' ').filter(Boolean); if (!v.length || v.length > 4 || /!important/.test(value)) return null; const [t, r = t, b = t, l = r] = v; return [['top', t], ['right', r], ['bottom', b], ['left', l]]; }
const gapParts = value => { const v = splitTop(value.trim(), ' ').filter(Boolean); return { row: v[0], column: v[1] || v[0] }; };

// ---------- per-file context: what display / direction / wrap each selector has (last declaration wins, any depth) ----------
function collect(nodes, map) {
  for (const n of nodes) {
    if (n.type === 'rule') { for (const s of selectors(n.selector)) { const e = map.get(norm(s)) || {}; for (const [p, v] of n.decls) { if (p === 'display') e.display = v; else if (p === 'flex-direction') e.direction = v; else if (p === 'flex-wrap') e.wrap = v; else if (p === 'flex-flow') { const f = v.split(/\s+/); e.direction = f.find(x => /column|row/.test(x)) || e.direction; e.wrap = f.find(x => /wrap/.test(x)) || e.wrap; } else if (p === 'height') e.height = v; else if (p === 'width') e.width = v; } map.set(norm(s), e); } }
    else if (n.children) collect(n.children, map);
  }
  return map;
}
function layoutOf(rule, map) {
  const own = {}; for (const [p, v] of rule.decls) { if (p === 'display') own.display = v; else if (p === 'flex-direction') own.direction = v; else if (p === 'flex-wrap') own.wrap = v; else if (p === 'flex-flow') { const f = v.split(/\s+/); own.direction = f.find(x => /column|row/.test(x)); own.wrap = f.find(x => /wrap/.test(x)); } }
  // exact selector first; otherwise the rule that declares the display of the same last compound (`.market-product .info-row` → `.info-row`, `.x>.info-row`)
  const lookup = s => { const k = norm(s); if (map.has(k) && map.get(k).display) return map.get(k); const last = k.split(/[ >+~]/).pop(); if (!last) return map.get(k) || {}; const simple = last.match(/\.[\w-]+|#[\w-]+|\[[^\]]+\]|^[a-z][\w-]*/gi) || []; const cands = [map.get(last), ...[...map.entries()].filter(([key, e]) => e.display && (key.endsWith(' ' + last) || key.endsWith('>' + last))).map(([, e]) => e), ...simple.map(x => map.get(x))].filter(Boolean); return cands.find(e => e.display) || map.get(k) || {}; };
  const inherited = selectors(rule.selector).map(lookup);
  const pick = key => own[key] || inherited.map(e => e[key]).find(Boolean);
  const display = pick('display') || '';
  return { kind: /grid/.test(display) ? 'grid' : /flex/.test(display) ? 'flex' : display ? 'other' : 'unknown', column: /column/.test(pick('direction') || ''), wrap: /wrap/.test(pick('wrap') || '') && !/nowrap/.test(pick('wrap') || '') };
}

// ---------- transform ----------
function transform(css, options = {}) {
  const nodes = parse(css), map = collect(nodes, new Map()), warnings = [], stats = { hexAlpha: 0, inset: 0, math: 0, conic: 0, gridGap: 0, flexGap: 0, focusVisible: 0, aspect: 0 };
  const existing = new Set(); (function walk(list) { for (const n of list) { if (n.type === 'rule') { for (const s of selectors(n.selector)) existing.add(norm(s)); } else if (n.children) walk(n.children); } })(nodes);
  const hasFallbackRule = sel => existing.has(norm(sel));
  function rewrite(list) {
    const out = [];
    for (const n of list) {
      if (n.type === 'at') { if (n.children) n.children = rewrite(n.children); else if (n.decls) n.decls = n.decls.map(([p, v]) => { const nv = hexAlpha(v); if (nv !== v) stats.hexAlpha++; return [p, nv]; }); out.push(n); continue; }
      const sels = selectors(n.selector), fallbackRule = sels.every(s => /^\.no-(flex-gap|focus-visible)\b/.test(s));
      const decls = [], seen = new Set();
      const has = p => n.decls.some(d => d[0] === p);
      for (const [p, raw] of n.decls) {
        let v = hexAlpha(raw); if (v !== raw) stats.hexAlpha++;
        if (p === 'inset' && !has('top') && !has('left') && !has('right') && !has('bottom')) { const sides = insetSides(v); if (sides) { decls.push(...sides); stats.inset++; } }
        if (/\b(min|max|clamp)\(/i.test(v) && !seen.has(p)) { const fb = mathFallback(v); if (fb !== v) { decls.push([p, fb]); stats.math++; } }
        if (/conic-gradient\(/i.test(v) && !seen.has(p)) { const fb = conicFallback(v); if (fb !== v) { decls.push([p, fb]); stats.conic++; } }
        if ((p === 'gap' || p === 'row-gap' || p === 'column-gap') && !fallbackRule) {
          const lay = layoutOf(n, map);
          if (lay.kind !== 'flex') { const gp = p === 'gap' ? 'grid-gap' : 'grid-' + p; if (!has(gp)) { decls.push([gp, v]); stats.gridGap++; } if (lay.kind === 'unknown') warnings.push(n.selector + ': gap on a container whose display is not declared in this stylesheet (grid-gap fallback written, no flex margin fallback)'); }
        }
        decls.push([p, v]); seen.add(p);
      }
      n.decls = decls; out.push(n);
      if (fallbackRule) continue;
      // flex gap → margin fallback rule under .no-flex-gap (skipped when the stylesheet already hand-writes one for that selector)
      const gapDecls = n.decls.filter(d => d[0] === 'gap' || d[0] === 'row-gap' || d[0] === 'column-gap');
      if (gapDecls.length) {
        const lay = layoutOf(n, map);
        if (lay.kind === 'flex') {
          const g = { row: '0', column: '0' }; for (const [p, v] of gapDecls) { if (p === 'gap') Object.assign(g, gapParts(v)); else if (p === 'row-gap') g.row = v; else g.column = v; }
          const targets = sels.filter(s => !hasFallbackRule('.no-flex-gap ' + s + '>*+*') && !hasFallbackRule('.no-flex-gap ' + s + '>*'));
          if (targets.length) {
            const between = lay.column ? [['margin-top', g.row]] : [['margin-left', g.column]];
            const rule = lay.wrap ? { type: 'rule', selector: targets.map(s => '.no-flex-gap ' + s + '>*').join(','), decls: [['margin-right', g.column], ['margin-bottom', g.row]] } : { type: 'rule', selector: targets.map(s => '.no-flex-gap ' + s + '>*+*').join(','), decls: between };
            if (lay.wrap) warnings.push(n.selector + ': wrapping flex gap approximated by margin-right / margin-bottom on every child');
            out.push(rule); stats.flexGap++;
          }
        }
      }
      // :focus-visible → :focus copy under .no-focus-visible
      if (/:focus-visible/.test(n.selector)) {
        const targets = sels.filter(s => /:focus-visible/.test(s) && !hasFallbackRule('.no-focus-visible ' + s.replace(/:focus-visible/g, ':focus')));
        if (targets.length) { out.push({ type: 'rule', selector: targets.map(s => '.no-focus-visible ' + s.replace(/:focus-visible/g, ':focus')).join(','), decls: n.decls.slice() }); stats.focusVisible++; }
      }
      if (n.decls.some(d => d[0] === 'aspect-ratio')) stats.aspect++;
    }
    return out;
  }
  const result = rewrite(nodes);
  return { css: serialize(result) + '\n', warnings, stats };
}

// ---------- aspect-ratio rules for the JS shim (compat.js ASPECT_RULES) ----------
function extractAspectRules(css) {
  const nodes = parse(css), map = collect(nodes, new Map()), out = [];
  (function walk(list) {
    for (const n of list) {
      if (n.type === 'at') { if (n.children) walk(n.children); continue; }
      const ar = n.decls.filter(d => d[0] === 'aspect-ratio').pop(); if (!ar) continue;
      const own = {}; for (const [p, v] of n.decls) { if (p === 'height') own.height = v; if (p === 'width') own.width = v; }
      for (const s of selectors(n.selector)) {
        if (/^auto$/i.test(ar[1])) { out.push([s, 0, 0, 'auto']); continue; }
        const m = ar[1].match(/^\s*([\d.]+)\s*(?:\/\s*([\d.]+))?\s*$/); if (!m) continue;
        const e = map.get(norm(s)) || {}, height = own.height || e.height, width = own.width || e.width;
        const mode = height && !/^auto$/i.test(height) && (!width || /^auto$/i.test(width)) ? 'width' : 'height';
        out.push([s, Number(m[1]), m[2] === undefined ? 1 : Number(m[2]), mode]);
      }
    }
  })(nodes);
  return out;
}

// ---------- lint: what a Chrome 61 engine would still drop without a baseline ----------
function lint(css, { aspectRules = null } = {}) {
  const issues = [], notes = [], nodes = parse(css), map = collect(nodes, new Map());
  const all = new Set(); (function walk(list) { for (const n of list) { if (n.type === 'rule') { for (const s of selectors(n.selector)) all.add(norm(s)); } else if (n.children) walk(n.children); } })(nodes);
  const shim = aspectRules ? new Set(aspectRules.map(r => norm(r[0]))) : null;
  (function walk(list, inSupports) {
    for (const n of list) {
      if (n.type === 'at') { if (n.children) walk(n.children, inSupports || n.name === 'supports'); else if (n.decls) for (const [p, v] of n.decls) if (/#[0-9a-f]{4}(?![0-9a-f])|#[0-9a-f]{8}(?![0-9a-f])/i.test(v.replace(/url\([^)]*\)/g, ''))) issues.push('@' + n.name + ' ' + p + ': hex colour with alpha (Chrome 62)'); continue; }
      const sels = selectors(n.selector), fallbackRule = sels.every(s => /^\.no-(flex-gap|focus-visible)\b/.test(s)), seen = [];
      const has = p => n.decls.some(d => d[0] === p);
      for (const [p, v] of n.decls) {
        const where = n.selector + ' → ' + p;
        if (/#[0-9a-f]{4}(?![0-9a-f])|#[0-9a-f]{8}(?![0-9a-f])/i.test(v.replace(/url\([^)]*\)/g, ''))) issues.push(where + ': hex colour with alpha (Chrome 62)');
        if (p === 'inset' && !(has('top') || has('left'))) issues.push(where + ': inset without top/right/bottom/left (Chrome 87)');
        if (/\b(min|max|clamp)\(/i.test(v) && !seen.includes(p)) issues.push(where + ': min()/max()/clamp() without a preceding fallback (Chrome 79)');
        if (/conic-gradient\(/i.test(v) && !seen.includes(p)) issues.push(where + ': conic-gradient() without a preceding fallback (Chrome 69)');
        if (/\d(dvh|svh|lvh|dvw|svw|lvw)\b/.test(v) && !seen.includes(p) && !inSupports) issues.push(where + ': dynamic viewport unit without a preceding fallback (Chrome 108)');
        if (/env\(/.test(v) && !inSupports && !seen.includes(p)) issues.push(where + ': env() outside @supports without a preceding fallback (Chrome 69)');
        if (/^(margin|padding)-(inline|block)|^inset-|^(inline|block)-size$/.test(p)) issues.push(where + ': logical property (Chrome 87)');
        if (p === 'overflow' && /clip/.test(v)) issues.push(where + ': overflow: clip (Chrome 90)');
        if (/color-mix\(|oklab\(|oklch\(/.test(v)) issues.push(where + ': modern colour function');
        if ((p === 'gap' || p === 'row-gap' || p === 'column-gap') && !fallbackRule) {
          const lay = layoutOf(n, map);
          if (lay.kind === 'flex') { const missing = sels.filter(s => !all.has(norm('.no-flex-gap ' + s + '>*+*')) && !all.has(norm('.no-flex-gap ' + s + '>*'))); if (missing.length) issues.push(where + ': flex gap without a .no-flex-gap margin fallback for ' + missing.join(', ') + ' (Chrome 84)'); }
          else { const gp = p === 'gap' ? 'grid-gap' : 'grid-' + p; if (!has(gp)) issues.push(where + ': ' + p + ' on a grid container without ' + gp + ' (Chrome 66)'); if (lay.kind === 'unknown') notes.push(where + ': container display not declared in this stylesheet'); }
        }
        if (p === 'aspect-ratio' && shim && !shim.has(norm(sels[0]))) issues.push(where + ': aspect-ratio rule missing from the compat.js ASPECT_RULES shim (Chrome 88)');
        if (/^(overscroll-behavior|scroll-padding|scroll-snap|text-decoration-thickness|text-underline-offset|content-visibility)/.test(p)) notes.push(where + ': progressive enhancement only (ignored by Chrome 61)');
        seen.push(p);
      }
      if (/:focus-visible/.test(n.selector) && !fallbackRule) { const missing = sels.filter(s => /:focus-visible/.test(s) && !all.has(norm('.no-focus-visible ' + s.replace(/:focus-visible/g, ':focus')))); if (missing.length) issues.push(n.selector + ': :focus-visible without a .no-focus-visible :focus copy (Chrome 86)'); }
      if (/:has\(|:is\(|:where\(|:focus-within/.test(n.selector) && !fallbackRule) issues.push(n.selector + ': selector Chrome 61 cannot parse');
    }
  })(nodes, false);
  return { issues, notes };
}

module.exports = { parse, serialize, transform, lint, extractAspectRules, hexAlpha, mathFallback, conicFallback, insetSides, norm };

if (require.main === module) { // node tests/tools/css-baseline.js <file.css> [--write out.css] [--lint]
  const argv = process.argv.slice(2), file = argv.find(a => !a.startsWith('--')), css = fs.readFileSync(file, 'utf8');
  if (argv.includes('--lint')) { const r = lint(css); for (const i of r.issues) console.log('ISSUE ' + i); for (const n of r.notes) console.log('note  ' + n); console.log(r.issues.length + ' issue(s), ' + r.notes.length + ' note(s)'); process.exit(r.issues.length ? 1 : 0); }
  const r = transform(css); const o = argv.indexOf('--write'); if (o >= 0) fs.writeFileSync(argv[o + 1], r.css); else process.stdout.write(r.css);
  for (const w of r.warnings) console.error('WARN ' + w); console.error(JSON.stringify(r.stats));
}
