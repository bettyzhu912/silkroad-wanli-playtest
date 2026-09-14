#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Generates the main-game host stylesheets of the two livelihood minigames from the standalone stylesheets (which stay canonical):
  pattern-chain/pattern-chain.css → pattern-chain.css   (scoped under .pc-shell)
  weaving-v5/weaving.css          → weaving.css         (scoped under .yw-shell)
Every rule is prefixed with the shell class; page-shell rules of the standalone pages (html / body / mock host / debug bar) are dropped;
:root custom properties move onto the shell; keyframes get a pc- / yw- prefix so they cannot collide with the main game or each other;
@font-face urls point at the package root (the fonts are copied there by sync-livelihood-minigames.js). A host block per game
(panel geometry inside the main-game panel layer, job cards) is appended. Rerun after any change to the standalone stylesheets."""
import re, os
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')

def parse(css):
    out = []; i = 0; n = len(css)
    while i < n:
        m = re.match(r'\s*(/\*.*?\*/\s*)*', css[i:], re.S); i += m.end() if m else 0
        if i >= n: break
        j = css.index('{', i); sel = css[i:j].strip(); depth = 1; k = j + 1
        while depth:
            if css[k] == '{': depth += 1
            elif css[k] == '}': depth -= 1
            k += 1
        out.append((sel, css[j + 1:k - 1])); i = k
    return out

def scope(css, shell, drop, keyframes, fonts_prefix=''):
    rules = parse(css); out = []
    def prefix(sel):
        parts = []
        for s in sel.split(','):
            s = s.strip()
            if not s: continue
            if drop.match(s): continue
            if s == ':root': parts.append(shell); continue
            if s == '*': parts.append(shell + ' *'); continue
            if s.startswith('[hidden]'): continue  # the main game already defines [hidden]
            parts.append(shell + ' ' + s)
        return ', '.join(parts)
    def fix_body(body):
        for a, b in keyframes.items(): body = re.sub(r'(animation(?:-name)?\s*:[^;]*?)\b' + a + r'\b', r'\g<1>' + b, body)
        body = body.replace('url("assets/fonts/', 'url("' + fonts_prefix)
        return body
    for sel, body in rules:
        if sel.startswith('@font-face'):
            out.append('@font-face{' + fix_body(body.strip()) + '}'); continue
        if sel.startswith('@keyframes'):
            name = sel.split()[1]; out.append('@keyframes ' + keyframes.get(name, name) + '{' + body.strip() + '}'); continue
        if sel.startswith('@media'):
            inner = []
            for s2, b2 in parse(body):
                p = prefix(s2)
                if p: inner.append(p + '{' + fix_body(b2.strip()) + '}')
            if inner: out.append(sel + '{' + ''.join(inner) + '}')
            continue
        p = prefix(sel)
        if p: out.append(p + '{' + fix_body(body.strip()) + '}')
    return '\n'.join(out)

PC_DROP = re.compile(r'^(html|body|\.host|\.city|\.city-hud|\.city-nav|\.dim|\.entry|\.entry-button|\.entry-note|\.debug|\.debug-toggle|\.debug\b)')
YW_DROP = re.compile(r'^(html|body|\.host|\.host-bg|\.host-mask|\.host-note|\.app|\.rotate)$')

pc = open(os.path.join(ROOT, 'pattern-chain', 'pattern-chain.css'), encoding='utf-8').read()
pc_out = scope(pc, '.pc-shell', PC_DROP, {'pop': 'pc-pop', 'pulse': 'pc-pulse'})
pc_host = '''
/* 缀纹成章 — main-game host block (not in the standalone): the panel of the primary layer becomes a bare stage and the 360×620 modal sits centred in it */
.pc-shell{position:relative;width:100%;height:100%;flex:1 1 auto;min-height:0;overflow:hidden;touch-action:none;font-family:var(--serif);color:var(--ink);--mw:360px}
.pc-shell .modal{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%)}
.pc-shell .toast{top:calc(50% - 300px)}
.pc-shell .page-stale{background:var(--paper)}
.pc-shell .stale-body{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:calc(14*var(--u));padding:calc(24*var(--u));text-align:center;font-size:calc(15*var(--u));line-height:1.8;color:#4a3a2c}
.pc-shell .settle-cash{font-family:var(--num);font-size:calc(16*var(--u));color:#8a3b26;font-weight:700}
.pc-shell .inline-error{color:#9a2f1e;font-size:calc(12*var(--u));margin:calc(6*var(--u)) 0 0}
.paper-panel[data-panel-id="pattern-chain"],.paper-panel[data-panel-id="weaving"]{padding:0;background:none;border:0;box-shadow:none;left:var(--safe-left);right:var(--safe-right);top:calc(var(--hud-top) + var(--hud-height) + 8px);bottom:calc(var(--safe-bottom) + 8px)}
.paper-panel[data-panel-id="pattern-chain"]::before,.paper-panel[data-panel-id="pattern-chain"]::after,.paper-panel[data-panel-id="weaving"]::before,.paper-panel[data-panel-id="weaving"]::after{display:none}
.paper-panel[data-panel-id="pattern-chain"]>.panel-header,.paper-panel[data-panel-id="weaving"]>.panel-header,.paper-panel[data-panel-id="pattern-chain"]>.panel-footer,.paper-panel[data-panel-id="weaving"]>.panel-footer{display:none}
.paper-panel[data-panel-id="pattern-chain"]>.panel-body,.paper-panel[data-panel-id="weaving"]>.panel-body{padding:0;overflow:hidden;display:flex;flex-direction:column;flex:1 1 auto;min-height:0}
.primary-layer.minigame-modal-layer .panel-backdrop{background:#1a0f0899}
.paper-panel[data-panel-id="khotan-work"]>.panel-header h2{font-size:1.02rem;letter-spacing:.18em;font-weight:500}
.caravan-job-art.pc-job-art{background-size:contain;background-position:center}
.caravan-job-art.yw-job-art{background-size:contain;background-position:center;height:120px}
'''
open(os.path.join(ROOT, 'pattern-chain.css'), 'w', encoding='utf-8').write(
    '/* 缀纹成章 — main-game host styling. GENERATED by tests/tools/gen-livelihood-css.py from pattern-chain/pattern-chain.css (standalone v0.1):\n   every rule scoped under .pc-shell; the standalone page shell (body / mock city / debug bar) is replaced by the host block at the end. */\n' + pc_out + pc_host)

yw = open(os.path.join(ROOT, 'weaving-v5', 'weaving.css'), encoding='utf-8').read()
yw_out = scope(yw, '.yw-shell', YW_DROP, {'pulse': 'yw-pulse', 'shake': 'yw-shake'})
yw_host = '''
/* 于阗织坊 — main-game host block (not in the standalone): the modal is sized by weaving-ui.js from the shell box (the standalone used the viewport) */
.yw-shell{position:relative;width:100%;height:100%;flex:1 1 auto;min-height:0;display:flex;align-items:center;justify-content:center;overflow:hidden;touch-action:none;font-family:var(--font);color:var(--ink);-webkit-user-select:none;user-select:none}
.yw-shell .modal{width:var(--yw-w,360px);height:var(--yw-h,620px);flex:0 0 auto}
.yw-shell .card .sub.avail{color:#3b2718}.yw-shell .card .sub.na{color:#a3302b}
.yw-shell .inline-error{color:#9a2f1e;font-size:13px;margin:6px 0 0}
.yw-shell .btn[disabled]{opacity:.5;cursor:default}
'''
open(os.path.join(ROOT, 'weaving.css'), 'w', encoding='utf-8').write(
    '/* 于阗织坊 — main-game host styling. GENERATED by tests/tools/gen-livelihood-css.py from weaving-v5/weaving.css (FINAL v5.0 modal edition):\n   every rule scoped under .yw-shell; the standalone page shell (body / mock host / rotate hint) is replaced by the host block at the end. */\n' + yw_out + yw_host)
print('pattern-chain.css', len(pc_out), 'weaving.css', len(yw_out))
