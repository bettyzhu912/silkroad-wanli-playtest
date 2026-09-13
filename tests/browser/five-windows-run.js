'use strict';
// HUD 五窗口 Round 4 Correction (Round 28) — runtime acceptance (headless Chrome, mobile emulation).
// For each of the five HUD windows (行囊 / 委托 / 消息 / 商号 / 更多) at several phone sizes: opens as the single primary panel from its HUD entry;
// its own art (B2 v02 / B3 v01 / B4 v02 / B5 v01 / B6 v01 — five PNGs normalized to ONE visible-frame box) is the 9-slice frame drawn with ONE shared
// parameter set; the master rect is identical for all five (top = HUD second row + 12 px, bottom = 10 px above the city-name block, so the city name
// stays visible); the title and the close button sit on the plaque; the content area starts under the plaque and ends above the bottom ornaments;
// only the body scrolls; no horizontal overflow. One typography scale (T1–T5 + buttons) across the five pages. 行囊 keeps its two status icons
// (icon_camel_status_v01 / icon_packgear_status_v01) visible, unclipped and on top. 消息: tabs 商报 | 市面所见 (default 商报) and 最新商报 | 历史商报
// (default 最新商报, latest report shown at once), history newest → oldest with one issue expanded at a time, 市面所见 = persistent observation list,
// no unread / new / red-dot / expiry states. Global HUD rules: re-clicking the active entry neither refreshes nor closes; another entry replaces the
// primary; the backdrop does not close; Secondary → primary → page one layer at a time; the HUD stays in place and greys out while a modal blocks; the
// scene underneath is untouched; five entries share the width equally.
// Usage: node tests/browser/five-windows-run.js [label] [--root <dir>] [--port <http>] [--cdp <chrome port>]
const fs = require('fs'), path = require('path');
const { launch, startServer, sleep } = require('../tools/cdp');
const root = path.join(__dirname, '..', '..');
const argv = process.argv.slice(2), flag = n => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const label = argv.find((a, i) => !a.startsWith('--') && (i === 0 || !argv[i - 1].startsWith('--'))) || 'five-windows';
const serveRoot = flag('--root') ? path.resolve(flag('--root')) : root;
const outDir = path.join(root, 'tests', 'results', 'evidence', 'five-windows-' + label); fs.rmSync(outDir, { recursive: true, force: true }); fs.mkdirSync(outDir, { recursive: true });
const checks = [];
const check = (name, ok, detail) => { checks.push({ name, ok: Boolean(ok), detail: detail === undefined ? '' : String(detail).slice(0, 400) }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  ' + String(detail).slice(0, 220) : '')); };
const VIEWPORTS = [[390, 844, 'iphone13'], [375, 667, 'iphone8'], [320, 568, 'iphone-se1'], [430, 932, 'iphone15promax'], [360, 780, 'android']];
const SHELL = { top: 400, bottom: 150, header: 128, plaqueTop: 16, plaqueH: 108, close: 70, pad: 62, frame: { left: 12, top: 40, right: 12, bottom: 18 } }; // one set for all five (px in the 768×1152 art)
const WINDOWS = [
  { id: 'pack', title: '行囊', art: 'B2_bag_panel_bg_v02' },
  { id: 'commission', title: '委托', art: 'B3_commission_panel_bg_v01' },
  { id: 'message', title: '消息', art: 'B4_message_panel_bg_v02' },
  { id: 'merchant_business', title: '商号', art: 'B5_merchant_panel_bg_v01' },
  { id: 'more', title: '更多', art: 'B6_more_panel_bg_v01' },
];
const CITY_TITLE_TOP = { changan: 1418, dunhuang: 1382, khotan: 1380 }, CITY_ART_H = 1600;
const ICONS = ['icon_camel_status_v01', 'icon_packgear_status_v01'];
const TYPO = { t1: [18, '700'], t2: [15, '700'], t3: [14, '400'], t4: [13, '400'], t5: [14, '600'], button: [14, '600'] };
const MEASURE = `(()=>{const r=e=>{const b=e.getBoundingClientRect();return {x:+b.x.toFixed(1),y:+b.y.toFixed(1),w:+b.width.toFixed(1),h:+b.height.toFixed(1),right:+b.right.toFixed(1),bottom:+b.bottom.toFixed(1)}};const cs=(e,p)=>getComputedStyle(e,p);const px=v=>+parseFloat(v).toFixed(2);
  const layer=document.querySelector('.primary-layer'),box=layer.querySelector('.paper-panel');const st=Silk.ui.getState();const rootEl=document.getElementById('game-root');
  const scale=parseFloat(cs(box).getPropertyValue('--art-scale'))||null;const before=cs(box,'::before');
  const header=box.querySelector('.panel-header'),h2=header.querySelector('h2'),close=header.querySelector('.close-button'),body=box.querySelector('.panel-body'),footer=box.querySelector('.panel-footer');
  const onTop=el=>{const q=el.getBoundingClientRect();const e=document.elementFromPoint(q.x+q.width/2,q.y+q.height/2);return e===el||el.contains(e)};
  const icons=[...box.querySelectorAll('img.pack-status-icon')].map(i=>({src:i.getAttribute('src'),natural:i.naturalWidth,complete:i.complete,rect:r(i),visibility:cs(i).visibility,opacity:cs(i).opacity,display:cs(i).display,onTop:onTop(i)}));
  const hud=document.querySelector('.global-hud'),bg=document.querySelector('.city-scene .city-background');
  const vis=e=>e.offsetParent!==null&&e.getClientRects().length;const typo={};const grab=(name,sel,excl)=>{const set=new Set();for(const e of box.querySelectorAll(sel)){if(!vis(e))continue;if(excl&&e.matches(excl))continue;set.add(px(cs(e).fontSize)+'/'+cs(e).fontWeight);}typo[name]=[...set];};
  grab('t1','.panel-header h2');grab('t2','.panel-body h3, .panel-body .section-title','.msg-observation h3, .message-entry h3');grab('t3','.panel-body p, .info-row, .menu-entry, .msg-observation h3, .msg-history-item','.form-hint, .msg-meta, .msg-empty, .story-status, .story-next, .story-gains-footer');grab('t4','.form-hint, .msg-meta, .msg-empty, .story-status, .story-next, .story-gains-footer');grab('t5','.row-value');grab('button','.panel-body .ui-button, .panel-footer .ui-button, .msg-tab');grab('subtab','.msg-subtab');
  const shell={};for(const k of ['top','bottom','header','plaque-top','plaque-height','close','pad-bottom'])shell[k]=cs(box).getPropertyValue('--shell-'+k).trim();
  return {primaryHidden:layer.hidden,secondaryHidden:document.querySelector('.secondary-layer').hidden,visiblePrimaries:[...document.querySelectorAll('.primary-layer')].filter(l=>!l.hidden).length,state:{primary:st.primary,secondary:st.secondary},id:box.dataset.panelId,panel:r(box),scale,shell,root:r(rootEl),hud:r(hud),cityBg:bg?r(bg):null,city:Silk.app.state.progress.world.city,
    windowVars:{top:rootEl.style.getPropertyValue('--window-top'),bottom:rootEl.style.getPropertyValue('--window-bottom')},
    before:{display:before.display,source:before.borderImageSource,slice:before.borderImageSlice,top:px(before.borderTopWidth),left:px(before.borderLeftWidth),right:px(before.borderRightWidth),bottom:px(before.borderBottomWidth),repeat:before.borderImageRepeat},after:cs(box,'::after').display,
    pad:{top:px(cs(box).paddingTop),bottom:px(cs(box).paddingBottom),left:px(cs(box).paddingLeft)},bg:cs(box).backgroundImage,shadow:cs(box).boxShadow,border:px(cs(box).borderTopWidth),
    header:{rect:r(header),padTop:px(cs(header).paddingTop),h2:h2?{rect:r(h2),text:h2.textContent,font:px(cs(h2).fontSize),overflow:h2.scrollWidth-h2.clientWidth}:null,close:close?{rect:r(close),onTop:onTop(close)}:null},
    body:{rect:r(body),scrollH:body.scrollHeight,clientH:body.clientHeight,scrollW:body.scrollWidth,clientW:body.clientWidth,overflowY:cs(body).overflowY,children:body.childElementCount},footer:footer&&!footer.hidden?r(footer):null,icons,typo,
    docOverflowX:document.documentElement.scrollWidth-innerWidth,tools:[...document.querySelectorAll('.hud-tool')].map(t=>({panel:t.dataset.panel,label:t.querySelector('.hud-label').textContent,pressed:t.getAttribute('aria-pressed'),rect:r(t)})),blocked:hud.classList.contains('is-blocked'),hudVisible:hud.offsetParent!==null,modalHidden:document.querySelector('.modal-layer').hidden}})()`;
const MSG = `(()=>{const r=e=>{const b=e.getBoundingClientRect();return {x:+b.x.toFixed(1),y:+b.y.toFixed(1),w:+b.width.toFixed(1),h:+b.height.toFixed(1),right:+b.right.toFixed(1),bottom:+b.bottom.toFixed(1)}};const cs=e=>getComputedStyle(e);const box=document.querySelector('.primary-panel');const body=box.querySelector('.panel-body');
  const tab=e=>({text:e.textContent.trim(),selected:e.getAttribute('aria-selected'),role:e.getAttribute('role'),rect:r(e),border:parseFloat(cs(e).borderTopWidth),bg:cs(e).backgroundColor,radius:parseFloat(cs(e).borderTopLeftRadius),weight:cs(e).fontWeight,size:parseFloat(cs(e).fontSize),deco:cs(e).textDecorationLine,cursor:cs(e).cursor,shadow:cs(e).boxShadow});
  const bar=body.querySelector('.msg-tabbar');
  return {bar:bar?{position:cs(bar).position,rect:r(bar)}:null,tabs:[...body.querySelectorAll('.msg-tab')].map(tab),subtabs:[...body.querySelectorAll('.msg-subtab')].map(tab),view:(body.querySelector('[data-view]')||{}).dataset?.view||null,
    latestH3:[...body.querySelectorAll('.msg-report h3')].map(h=>h.textContent),latestMeta:[...body.querySelectorAll('.msg-report .msg-meta span')].map(s=>s.textContent),
    history:[...body.querySelectorAll('.msg-history-item')].map(i=>({id:i.dataset.reportId,expanded:i.getAttribute('aria-expanded'),text:i.textContent.trim()})),bodies:body.querySelectorAll('.msg-history-body').length,
    observations:[...body.querySelectorAll('.msg-observation')].map(o=>({meta:[...o.querySelectorAll('.msg-meta span')].map(s=>s.textContent),title:(o.querySelector('h3')||{}).textContent||null,text:(o.querySelector('p:not(.msg-meta)')||{}).textContent||''})),
    forbidden:box.querySelectorAll('[class*="unread"],[class*="badge"],.notification-dot,[class*="expired"],[class*="is-new"]').length,forbiddenText:/未读|已读|过期|NEW/.test(body.textContent),legacyButton:[...box.querySelectorAll('button')].some(b=>b.textContent.trim()==='历期商报'),
    bodyScrollTop:body.scrollTop,reports:Silk.app.state.progress.messages.reports.length,obsCount:Silk.app.state.progress.messages.observations.length}})()`;
const SCENE = `(()=>{const s=document.querySelector('.city-scene');const bg=s&&s.querySelector('.city-background');return {hotspots:s?s.querySelectorAll('.city-hotspot').length:0,bg:bg?bg.getAttribute('src'):null,city:Silk.app.state.progress.world.city,cash:Silk.app.state.progress.cash,tick:Silk.app.state.progress.world.tick}})()`;
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const same = (arr, expect) => arr.length === 1 && arr[0] === expect[0] + '/' + expect[1];
(async () => {
  const port = Number(flag('--port')) || 8199, srv = startServer(port, serveRoot); await sleep(500);
  for (const [w, h, name] of VIEWPORTS) {
    const c = await launch({ port: (Number(flag('--cdp')) || 9470) + VIEWPORTS.findIndex(v => v[2] === name), width: w, height: h, mobile: true });
    const ev = js => c.eval(js);
    const clickText = text => ev(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>!b.disabled&&b.offsetParent!==null&&b.textContent.trim()===${JSON.stringify(text)});if(!b)return false;b.click();return true})()`);
    const clickTool = id => ev(`(()=>{const b=document.querySelector('.hud-tool[data-panel=${JSON.stringify(id)}]');if(!b||b.disabled)return false;b.click();return true})()`);
    const clickSel = sel => ev(`(()=>{const b=document.querySelector(${JSON.stringify(sel)});if(!b)return false;b.click();return true})()`);
    const tag = name + ' ' + w + '×' + h;
    const shot = file => c.screenshot(path.join(outDir, name + '-' + file + '.png'));
    try {
      await c.navigate('http://127.0.0.1:' + port + '/'); await sleep(900); await ev('new Promise(r=>{const t=setInterval(()=>{if(window.Silk&&Silk.app&&Silk.app.state){clearInterval(t);r()}},100)})');
      if (await ev('Boolean(Silk.app.state.progress)')) { await ev("Silk.ui.dispatch('game.reset')"); await sleep(600); }
      await clickText('启程'); await ev('new Promise(r=>{const t=setInterval(()=>{const p=Silk.app.state.progress;if(p&&p.world){clearInterval(t);r()}},100)})'); await sleep(400); await clickText('自行探索'); await sleep(500);
      // one real report so the 消息 page has a latest issue (商情 purchase, 2 钱, 0 ticks)
      await ev("Silk.ui.dispatch('newspaper.purchase')"); await sleep(500);
      check(tag + ' setup: one 长安商报 purchased', await ev('Silk.app.state.progress.messages.reports.length') === 1, '');
      const scene0 = await ev(SCENE); await shot('00-map');
      const frames = {}; const expectScale = Math.max(.3, (w - 24) / 768); let rectInfo = null;
      for (const win of WINDOWS) {
        check(tag + ' ' + win.title + ' HUD entry opens it', await clickTool(win.id), ''); await sleep(450);
        const m = await ev(MEASURE); const s = m.scale; frames[win.id] = m.panel;
        check(tag + ' ' + win.title + ' is the single primary panel (data-panel-id, aria-pressed only on its entry)', !m.primaryHidden && m.visiblePrimaries === 1 && m.secondaryHidden && m.id === win.id && m.state.primary === win.id && m.tools.every(t => t.pressed === String(t.panel === win.id)), JSON.stringify({ id: m.id, primary: m.state.primary, pressed: m.tools.filter(t => t.pressed === 'true').map(t => t.panel) }));
        check(tag + ' ' + win.title + ' art = ' + win.art + ' as the shared 9-slice shell (' + SHELL.top + ' 64 ' + SHELL.bottom + ' 64 fill, one parameter set) scaled by --art-scale ' + (s && s.toFixed(3)), m.before.display === 'block' && m.before.source.includes(win.art) && [SHELL.top + ' 64 ' + SHELL.bottom + ' 64 fill', SHELL.top + ' 64 ' + SHELL.bottom + ' fill'].includes(m.before.slice) && m.before.repeat.startsWith('stretch') && s && near(s, expectScale, .002) && near(m.before.top, SHELL.top * s, 1) && near(m.before.bottom, SHELL.bottom * s, 1) && near(m.before.left, 64 * s, 1) && near(m.before.right, 64 * s, 1) && m.after === 'none' && m.bg === 'none' && m.shadow === 'none' && m.border === 0 && [m.shell.top, m.shell.bottom, m.shell.header, m.shell['plaque-top'], m.shell['plaque-height'], m.shell.close, m.shell['pad-bottom']].join() === [SHELL.top, SHELL.bottom, SHELL.header, SHELL.plaqueTop, SHELL.plaqueH, SHELL.close, SHELL.pad].join(), JSON.stringify({ source: m.before.source.replace(/^.*\//, ''), slice: m.before.slice, widths: [m.before.top, m.before.left, m.before.bottom], scale: s, shell: m.shell }));
        // master rect: top = HUD second row + 12, bottom = 10 px above the city-name block (8 px art margin above the text)
        const titleText = m.cityBg.y + m.cityBg.h * CITY_TITLE_TOP[m.city] / CITY_ART_H, titleBlock = m.cityBg.y + m.cityBg.h * (CITY_TITLE_TOP[m.city] - 8) / CITY_ART_H;
        rectInfo = { top: m.panel.y, hudBottom: m.hud.bottom, topGap: +(m.panel.y - m.hud.bottom).toFixed(1), bottom: m.panel.bottom, titleBlock: +titleBlock.toFixed(1), titleText: +titleText.toFixed(1), gapToTitleText: +(titleText - m.panel.bottom).toFixed(1), vars: m.windowVars, w: m.panel.w, h: m.panel.h, x: m.panel.x };
        check(tag + ' ' + win.title + ' master rect: top = HUD second row + 12 px (' + rectInfo.topGap + '), bottom 10 px above the city-name block (gap to the 城市名 text ' + rectInfo.gapToTitleText + ' px, ' + m.city + ')', near(m.panel.y - m.hud.bottom, 12, 1) && near(m.panel.bottom, titleBlock - 10, 1.5) && m.panel.bottom < titleText - 8 && m.windowVars.top && m.windowVars.bottom, JSON.stringify(rectInfo));
        const plaqueTop = m.panel.y + SHELL.plaqueTop * s, plaqueBottom = m.panel.y + (SHELL.plaqueTop + SHELL.plaqueH) * s, closeY = m.panel.y + SHELL.close * s;
        const h2 = m.header.h2, cl = m.header.close;
        check(tag + ' ' + win.title + ' title 「' + (h2 && h2.text) + '」 on the plaque (' + (h2 && h2.rect.y) + '–' + (h2 && h2.rect.bottom) + ' in ' + plaqueTop.toFixed(1) + '–' + plaqueBottom.toFixed(1) + '), single line, T1', h2 && h2.text === win.title && h2.rect.y >= plaqueTop - 1 && h2.rect.bottom <= plaqueBottom + 1 && h2.overflow <= 0 && h2.font === TYPO.t1[0] && near(m.header.padTop, SHELL.header * s, 1) && near(m.header.rect.h, SHELL.header * s, 1.5), JSON.stringify({ h2: h2 && h2.rect, font: h2 && h2.font, headerPad: m.header.padTop, expect: +(SHELL.header * s).toFixed(1) }));
        check(tag + ' ' + win.title + ' close button on the plaque (centre ' + (cl && (cl.rect.y + cl.rect.h / 2).toFixed(1)) + ' ≈ ' + closeY.toFixed(1) + '), inside the frame, on top', cl && near(cl.rect.y + cl.rect.h / 2, closeY, 2) && cl.rect.right <= m.panel.right + .5 && cl.rect.x >= m.panel.x && cl.onTop && cl.rect.w >= 44 && cl.rect.h >= 44, JSON.stringify(cl));
        const bodyTopMin = m.panel.y + SHELL.header * s - 1, bodyBottomMax = m.panel.bottom - SHELL.pad * s + 1;
        check(tag + ' ' + win.title + ' content area under the plaque and above the bottom ornaments (' + m.body.rect.y + '–' + m.body.rect.bottom + ' within ' + bodyTopMin.toFixed(1) + '–' + bodyBottomMax.toFixed(1) + '), only the body scrolls, no horizontal overflow', m.body.rect.y >= bodyTopMin && m.body.rect.bottom <= bodyBottomMax && (!m.footer || (m.footer.bottom <= bodyBottomMax && m.footer.right <= m.panel.right)) && m.body.overflowY === 'auto' && m.body.scrollW <= m.body.clientW + 1 && m.docOverflowX <= 0 && near(m.pad.bottom, SHELL.pad * s, 1) && near(m.pad.left, w * .05, 1) && m.body.children > 0, JSON.stringify({ body: m.body.rect, scroll: [m.body.scrollH, m.body.clientH], footer: m.footer, padBottom: m.pad.bottom }));
        const t = m.typo;
        check(tag + ' ' + win.title + ' typography scale T1 18/700 · T2 15/700 · T3 14/400 · T4 13/400 · T5 14/600 · buttons 14/600', same(t.t1, TYPO.t1) && (!t.t2.length || same(t.t2, TYPO.t2)) && same(t.t3, TYPO.t3) && (!t.t4.length || same(t.t4, TYPO.t4)) && (!t.t5.length || same(t.t5, TYPO.t5)) && (!t.button.length || t.button.every(x => x === TYPO.button[0] + '/' + TYPO.button[1] || x === TYPO.t2[0] + '/700' || x === TYPO.t2[0] + '/500')), JSON.stringify(t));
        if (win.id === 'pack') {
          const ok = m.icons.length === 2 && ICONS.every((n, i) => m.icons[i].src.includes(n)) && m.icons.every(i => i.natural > 0 && i.complete && i.visibility === 'visible' && i.opacity === '1' && i.display !== 'none' && near(i.rect.w, 28, .5) && near(i.rect.h, 28, .5) && i.rect.y >= m.body.rect.y - .5 && i.rect.bottom <= m.body.rect.bottom + .5 && i.rect.x >= m.body.rect.x && i.rect.right <= m.body.rect.right && i.onTop);
          check(tag + ' 行囊 keeps its two status icons (' + ICONS.join(' / ') + '): rendered 28×28, visible, inside the content area, not clipped, not covered', ok, JSON.stringify(m.icons.map(i => ({ src: i.src, natural: i.natural, rect: i.rect, onTop: i.onTop, vis: i.visibility, op: i.opacity }))));
        }
        if (win.id === 'message') {
          const hits = c.network.filter(n => /B4_message_panel_bg_v02\.(png|webp)/.test(n.url)), old = c.network.filter(n => /_v01\.(png|webp)/.test(n.url) && /B4_message|B2_bag/.test(n.url));
          check(tag + ' 消息 loads B4_message_panel_bg_v02 (' + hits.map(x => x.status).join(',') + '), no v01 request', hits.length >= 1 && hits.every(x => x.status === 200) && old.length === 0, JSON.stringify({ v02: hits.map(x => x.url.replace(/^.*\//, '')), v01: old.map(x => x.url) }));
          // ---- tab contract ----
          const g = await ev(MSG);
          check(tag + ' 消息 default = 商报 › 最新商报, the latest issue shown at once (no extra tap), no 历期商报 button', g.tabs.map(x => x.text).join('|') === '商报|市面所见' && g.tabs.map(x => x.selected).join() === 'true,false' && g.subtabs.map(x => x.text).join('|') === '最新商报|历史商报' && g.subtabs.map(x => x.selected).join() === 'true,false' && g.view === 'latest' && g.latestMeta[0] === '长安商报' && g.latestH3.includes('行情判断') && g.latestH3.length >= 2 && !g.legacyButton, JSON.stringify({ tabs: g.tabs.map(x => x.text + ':' + x.selected), sub: g.subtabs.map(x => x.text + ':' + x.selected), view: g.view, meta: g.latestMeta, h3: g.latestH3.length }));
          const tabOk = g.tabs.length === 2 && g.tabs.every(x => x.role === 'tab' && x.border >= 1 && x.bg !== 'rgba(0, 0, 0, 0)' && x.radius >= 4 && x.deco === 'none' && x.cursor === 'pointer' && x.rect.h >= 40) && near(g.tabs[0].rect.w, g.tabs[1].rect.w, 1) && g.tabs[0].weight === '700' && Number(g.tabs[1].weight) <= 500 && g.tabs[0].size === TYPO.t2[0];
          const subOk = g.subtabs.length === 2 && g.subtabs.every(x => x.role === 'tab' && x.border >= 1 && x.bg !== 'rgba(0, 0, 0, 0)' && x.radius >= 4 && x.deco === 'none' && x.rect.h >= 30 && x.rect.h < g.tabs[0].rect.h && x.size < g.tabs[0].size) && near(g.subtabs[0].rect.w, g.subtabs[1].rect.w, 1) && g.subtabs[0].weight === '700';
          check(tag + ' 消息 tabs are tangible book-tag tabs (equal width, border, tinted fill, soft radius, active heavier / darker, no underline), sub-tabs smaller and lighter, bar sticky', tabOk && subOk && g.bar && g.bar.position === 'sticky', JSON.stringify({ tab0: g.tabs[0], tab1: g.tabs[1], sub0: g.subtabs[0], bar: g.bar }));
          await shot('12a-message-latest');
          // a second (newer) issue in the in-page state so the history list has two entries
          await ev(`(()=>{const p=Silk.app.state.progress;const r=p.messages.reports[0];p.messages.reports.push({...JSON.parse(JSON.stringify(r)),id:'test-report-2',issueWorldDay:r.issueWorldDay+5,acquiredWorldDay:r.acquiredWorldDay+5,acquiredTick:r.acquiredTick+15});p.messages.observations.push({id:'obs-test-1',source:'test',sourceId:'test',selector:'test',templateId:'test',city:'changan',tick:p.world.tick,title:'坊间传闻',text:'西市茶肆里有人说，波斯商队过些日子会带来一批香料。'});Silk.ui.render(Silk.app.state);})()`); await sleep(300);
          await clickSel('.msg-subtab[data-subtab="history"]'); await sleep(300); let hs = await ev(MSG);
          check(tag + ' 历史商报: list newest → oldest, nothing expanded, sub-tab stays on top', hs.view === 'history' && hs.subtabs.map(x => x.selected).join() === 'false,true' && hs.history.length === 2 && hs.history[0].id === 'test-report-2' && hs.history.every(x => x.expanded === 'false') && hs.bodies === 0, JSON.stringify(hs.history));
          await clickSel('.msg-history-item[data-report-id="test-report-2"]'); await sleep(250); hs = await ev(MSG);
          const first = hs.history.map(x => x.expanded).join() === 'true,false' && hs.bodies === 1;
          await clickSel('.msg-history-item:not([data-report-id="test-report-2"])'); await sleep(250); const hs2 = await ev(MSG);
          const second = hs2.history.map(x => x.expanded).join() === 'false,true' && hs2.bodies === 1 && hs2.subtabs.map(x => x.selected).join() === 'false,true';
          await shot('12b-message-history-expanded');
          await clickSel('.msg-history-item[aria-expanded="true"]'); await sleep(250); const hs3 = await ev(MSG);
          check(tag + ' 历史商报: tap expands one issue, tapping another collapses the first (max 1 open), tapping again collapses', first && second && hs3.bodies === 0 && hs3.history.every(x => x.expanded === 'false'), JSON.stringify({ first, second, after: hs3.history.map(x => x.expanded), bodies: hs3.bodies }));
          await clickSel('.msg-tab[data-tab="observation"]'); await sleep(300); const ob = await ev(MSG);
          check(tag + ' 市面所见: persistent observation list (world date · city · content), no second-level tabs, no unread / new / red-dot / expiry state', ob.view === 'observation' && ob.tabs.map(x => x.selected).join() === 'false,true' && ob.subtabs.length === 0 && ob.observations.length === ob.obsCount && ob.observations.length >= 1 && ob.observations[0].meta.length === 2 && ob.observations[0].meta[1] === '长安' && ob.observations[0].text.includes('香料') && ob.forbidden === 0 && !ob.forbiddenText, JSON.stringify({ obs: ob.observations.slice(0, 2), forbidden: ob.forbidden, text: ob.forbiddenText }));
          await shot('12c-message-observations');
          await clickSel('.primary-panel .panel-header > .close-button'); await sleep(300); await clickTool('message'); await sleep(400); const re = await ev(MSG);
          check(tag + ' 消息 re-entry resets to 商报 › 最新商报', re.tabs.map(x => x.selected).join() === 'true,false' && re.subtabs.map(x => x.selected).join() === 'true,false' && re.view === 'latest', JSON.stringify({ tabs: re.tabs.map(x => x.selected), sub: re.subtabs.map(x => x.selected), view: re.view }));
        }
        await shot('1' + WINDOWS.indexOf(win) + '-' + win.id);
        if (win.id === 'pack') { await ev(`(()=>{const b=document.querySelector('.primary-panel .panel-body');b.scrollTop=1e6;return b.scrollTop})()`); await sleep(150); await shot('10-pack-scrolled'); }
        if (win.id === 'merchant_business') {
          const st = await ev(`(()=>{const b=document.querySelector('.primary-panel .panel-body');b.scrollTop=1e6;return {scrollTop:b.scrollTop,scrollH:b.scrollHeight,clientH:b.clientHeight}})()`);
          const m2 = await ev(MEASURE);
          check(tag + ' 商号 long content scrolls inside the body only (frame / title / close unchanged)', (st.scrollH <= st.clientH + 1 || st.scrollTop > 0) && JSON.stringify(m2.panel) === JSON.stringify(m.panel) && JSON.stringify(m2.header.h2.rect) === JSON.stringify(h2.rect) && JSON.stringify(m2.header.close.rect) === JSON.stringify(cl.rect), JSON.stringify(st));
        }
        await clickSel('.primary-panel .panel-header > .close-button'); await sleep(300);
        const closed = await ev(`(()=>{const l=document.querySelector('.primary-layer');return {hidden:l.hidden,primary:Silk.ui.getState().primary,pressed:[...document.querySelectorAll('.hud-tool[aria-pressed="true"]')].length}})()`);
        check(tag + ' ' + win.title + ' close button returns to the page', closed.hidden && closed.primary === null && closed.pressed === 0, JSON.stringify(closed));
      }
      const rects = Object.values(frames), f0 = rects[0];
      check(tag + ' one master rect for all five windows (' + f0.w + '×' + f0.h + ' at ' + f0.x + ',' + f0.y + ')', rects.every(r => near(r.x, f0.x, .5) && near(r.y, f0.y, .5) && near(r.w, f0.w, .5) && near(r.h, f0.h, .5)), JSON.stringify(frames));
      fs.writeFileSync(path.join(outDir, name + '-rect.json'), JSON.stringify({ viewport: [w, h], rect: f0, ...rectInfo, frameOnScreen: rectInfo && { top: +(f0.y + SHELL.frame.top * expectScale).toFixed(1), bottom: +(f0.bottom - SHELL.frame.bottom * expectScale).toFixed(1), left: +(f0.x + SHELL.frame.left * expectScale).toFixed(1), right: +(f0.right - SHELL.frame.right * expectScale).toFixed(1) } }, null, 2));
      // ---- global HUD rules ----
      await clickTool('pack'); await sleep(400); await ev(`document.querySelector('.primary-panel .panel-body').dataset.probe='kept'`);
      await clickTool('pack'); await sleep(300);
      const again = await ev(`(()=>{const b=document.querySelector('.primary-panel .panel-body');return {hidden:document.querySelector('.primary-layer').hidden,primary:Silk.ui.getState().primary,probe:b.dataset.probe}})()`);
      check(tag + ' re-clicking the active entry neither refreshes nor closes the window', !again.hidden && again.primary === 'pack' && again.probe === 'kept', JSON.stringify(again));
      await clickTool('commission'); await sleep(400);
      const sw = await ev(MEASURE);
      check(tag + ' another entry replaces the primary window (one primary at a time)', sw.id === 'commission' && sw.visiblePrimaries === 1 && sw.secondaryHidden && sw.tools.filter(t => t.pressed === 'true').map(t => t.panel).join() === 'commission', JSON.stringify({ id: sw.id, pressed: sw.tools.filter(t => t.pressed === 'true').map(t => t.panel) }));
      await clickSel('.primary-layer .panel-backdrop'); await sleep(250);
      const bd = await ev(`(()=>({hidden:document.querySelector('.primary-layer').hidden,primary:Silk.ui.getState().primary}))()`);
      check(tag + ' the backdrop blocks the scene and does not close the window', !bd.hidden && bd.primary === 'commission', JSON.stringify(bd));
      await clickTool('more'); await sleep(400);
      const menu = await ev(`[...document.querySelectorAll('.primary-panel .menu-entry')].map(b=>b.textContent.trim())`);
      check(tag + ' 更多 keeps its entries 丝路之录 / 系统通知 / 设置 / 玩法说明 + 重新开始游戏', menu.join('/') === '丝路之录/系统通知/设置/玩法说明' && await ev(`Boolean([...document.querySelectorAll('.primary-panel .danger-button')].find(b=>b.textContent.trim()==='重新开始游戏'))`), menu.join('/'));
      await ev(`[...document.querySelectorAll('.primary-panel .menu-entry')].find(b=>b.textContent.trim()==='设置').click()`); await sleep(400);
      const sec = await ev(MEASURE); await shot('20-more-settings-secondary');
      check(tag + ' 更多 → 设置 opens a secondary layer above the still-open primary', !sec.secondaryHidden && sec.state.secondary === 'settings' && sec.state.primary === 'more' && !sec.primaryHidden, JSON.stringify(sec.state));
      await clickSel('.secondary-panel .panel-header > .close-button'); await sleep(300);
      const back1 = await ev(MEASURE);
      check(tag + ' back consumes one layer: secondary closed, 更多 still open with its content', back1.secondaryHidden && back1.state.secondary === null && back1.state.primary === 'more' && !back1.primaryHidden && back1.id === 'more' && back1.body.children > 0, JSON.stringify(back1.state));
      await clickText('重新开始游戏'); await sleep(350);
      const blk = await ev(MEASURE); await shot('21-more-blocking-modal');
      check(tag + ' blocking modal: HUD stays in place, visible and greyed (is-blocked), window still underneath', !blk.modalHidden && blk.blocked && blk.hudVisible && near(blk.hud.y, sec.hud.y, .5) && near(blk.hud.h, sec.hud.h, .5) && blk.state.primary === 'more', JSON.stringify({ modalHidden: blk.modalHidden, blocked: blk.blocked, hud: blk.hud }));
      await clickText('取消'); await sleep(300);
      const un = await ev(MEASURE);
      check(tag + ' modal dismissed: HUD restored, 更多 still open', un.modalHidden && !un.blocked && un.state.primary === 'more' && !un.primaryHidden, JSON.stringify({ blocked: un.blocked, primary: un.state.primary }));
      await clickSel('.primary-panel .panel-header > .close-button'); await sleep(300);
      const scene1 = await ev(SCENE);
      check(tag + ' scene underneath untouched (hotspots, background, city, cash, time)', JSON.stringify(scene0) === JSON.stringify(scene1) && await ev(`document.querySelector('.primary-layer').hidden`), JSON.stringify(scene1));
      const t = un.tools; const slot = t[0].rect.w;
      check(tag + ' five entries 行囊/委托/消息/商号/更多 in order, equal slots (' + slot + ' px)', t.map(x => x.label).join('/') === '行囊/委托/消息/商号/更多' && t.every(x => near(x.rect.w, slot, 1)) && t.every((x, i) => i === 0 || x.rect.x >= t[i - 1].rect.right - .5), t.map(x => x.rect.w).join('/'));
      const old = c.network.filter(n => /(B4_message_panel_bg|B2_bag_panel_bg)_v01/.test(n.url)), failed = c.network.filter(n => n.status === 'FAILED' || n.status >= 400);
      check(tag + ' no v01 background request, no failed request', old.length === 0 && failed.length === 0, JSON.stringify({ old: old.map(x => x.url), failed: failed.slice(0, 3) }));
      const errs = c.console.filter(m => m.type === 'error' || m.type === 'exception').map(m => m.text.slice(0, 120)); check(tag + ' no console errors', errs.length === 0, JSON.stringify(errs.slice(0, 2)));
    } catch (e) { check(name + ' script error', false, String(e && e.message || e)); }
    await c.close();
  }
  srv.stop();
  const failed = checks.filter(c => !c.ok);
  fs.writeFileSync(path.join(outDir, 'five-windows-report.json'), JSON.stringify({ label, serveRoot, generatedAt: new Date().toISOString(), viewports: VIEWPORTS, shell: SHELL, windows: WINDOWS, typography: TYPO, passed: checks.length - failed.length, failed: failed.length, checks }, null, 2));
  console.log('\n' + (checks.length - failed.length) + '/' + checks.length + ' checks passed' + (failed.length ? ' — FAILED: ' + failed.map(f => f.name).join(' | ') : ''));
  process.exit(failed.length ? 1 : 0);
})();
