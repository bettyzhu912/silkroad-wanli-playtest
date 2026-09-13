'use strict';
// HUD_5_WINDOWS_UNIFIED_SHELL_AND_MESSAGE_UPDATE v0.2 — runtime acceptance (headless Chrome, mobile emulation).
// For each of the five HUD windows (行囊 / 委托 / 消息 / 商号 / 更多) at several phone sizes: opens as the single primary panel from its HUD entry,
// its own art is the 9-slice frame (B2 v02 / B3 v01 / B4 v02 / B5 v01 / B6 v01) scaled by --art-scale, the frame rectangle is identical for all five,
// the title and the close button sit on the plaque, the content area starts under the plaque and ends above the bottom ornaments, only the body
// scrolls, no horizontal overflow; 行囊 keeps its two status icons (icon_camel_status_v01 / icon_packgear_status_v01) visible, unclipped and on top;
// 消息 loads only B4 v02 (no v01 request anywhere). Global HUD rules: re-clicking the active entry neither refreshes nor closes; another entry replaces
// the primary; the backdrop does not close; Secondary → primary → page one layer at a time; the HUD stays in place and greys out while a modal blocks;
// the scene underneath is untouched; five entries share the width equally.
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
const WINDOWS = [
  { id: 'pack', title: '行囊', art: 'B2_bag_panel_bg_v02', top: 390, bottom: 130, header: 118, plaqueTop: 14, plaqueH: 104, close: 66, pad: 69 },
  { id: 'commission', title: '委托', art: 'B3_commission_panel_bg_v01', top: 400, bottom: 230, header: 194, plaqueTop: 81, plaqueH: 113, close: 137, pad: 150 },
  { id: 'message', title: '消息', art: 'B4_message_panel_bg_v02', top: 360, bottom: 180, header: 165, plaqueTop: 56, plaqueH: 109, close: 110, pad: 103 },
  { id: 'merchant_business', title: '商号', art: 'B5_merchant_panel_bg_v01', top: 390, bottom: 200, header: 114, plaqueTop: 12, plaqueH: 102, close: 63, pad: 119 },
  { id: 'more', title: '更多', art: 'B6_more_panel_bg_v01', top: 350, bottom: 180, header: 118, plaqueTop: 10, plaqueH: 108, close: 64, pad: 102 },
];
const ICONS = ['icon_camel_status_v01', 'icon_packgear_status_v01'];
const MEASURE = `(()=>{const r=e=>{const b=e.getBoundingClientRect();return {x:+b.x.toFixed(1),y:+b.y.toFixed(1),w:+b.width.toFixed(1),h:+b.height.toFixed(1),right:+b.right.toFixed(1),bottom:+b.bottom.toFixed(1)}};const cs=(e,p)=>getComputedStyle(e,p);const px=v=>+parseFloat(v).toFixed(2);
  const layer=document.querySelector('.primary-layer'),box=layer.querySelector('.paper-panel');const st=Silk.ui.getState();
  const scale=parseFloat(cs(box).getPropertyValue('--art-scale'))||null;const before=cs(box,'::before');
  const header=box.querySelector('.panel-header'),h2=header.querySelector('h2'),close=header.querySelector('.close-button'),body=box.querySelector('.panel-body'),footer=box.querySelector('.panel-footer');
  const onTop=el=>{const q=el.getBoundingClientRect();const e=document.elementFromPoint(q.x+q.width/2,q.y+q.height/2);return e===el||el.contains(e)};
  const icons=[...box.querySelectorAll('img.pack-status-icon')].map(i=>({src:i.getAttribute('src'),natural:i.naturalWidth,complete:i.complete,rect:r(i),visibility:cs(i).visibility,opacity:cs(i).opacity,display:cs(i).display,onTop:onTop(i)}));
  const hud=document.querySelector('.global-hud');
  return {primaryHidden:layer.hidden,secondaryHidden:document.querySelector('.secondary-layer').hidden,visiblePrimaries:[...document.querySelectorAll('.primary-layer')].filter(l=>!l.hidden).length,state:{primary:st.primary,secondary:st.secondary},id:box.dataset.panelId,panel:r(box),scale,
    before:{display:before.display,source:before.borderImageSource,slice:before.borderImageSlice,top:px(before.borderTopWidth),left:px(before.borderLeftWidth),right:px(before.borderRightWidth),bottom:px(before.borderBottomWidth),repeat:before.borderImageRepeat},after:cs(box,'::after').display,
    pad:{top:px(cs(box).paddingTop),bottom:px(cs(box).paddingBottom),left:px(cs(box).paddingLeft)},bg:cs(box).backgroundImage,shadow:cs(box).boxShadow,border:px(cs(box).borderTopWidth),
    header:{rect:r(header),padTop:px(cs(header).paddingTop),h2:h2?{rect:r(h2),text:h2.textContent,font:px(cs(h2).fontSize),overflow:h2.scrollWidth-h2.clientWidth}:null,close:close?{rect:r(close),onTop:onTop(close)}:null},
    body:{rect:r(body),scrollH:body.scrollHeight,clientH:body.clientHeight,scrollW:body.scrollWidth,clientW:body.clientWidth,overflowY:cs(body).overflowY,children:body.childElementCount},footer:footer&&!footer.hidden?r(footer):null,icons,
    docOverflowX:document.documentElement.scrollWidth-innerWidth,tools:[...document.querySelectorAll('.hud-tool')].map(t=>({panel:t.dataset.panel,label:t.querySelector('.hud-label').textContent,pressed:t.getAttribute('aria-pressed'),rect:r(t)})),hud:r(hud),blocked:hud.classList.contains('is-blocked'),hudVisible:hud.offsetParent!==null,modalHidden:document.querySelector('.modal-layer').hidden}})()`;
const SCENE = `(()=>{const s=document.querySelector('.city-scene');const bg=s&&s.querySelector('.city-background');return {hotspots:s?s.querySelectorAll('.city-hotspot').length:0,bg:bg?bg.getAttribute('src'):null,city:Silk.app.state.progress.world.city,cash:Silk.app.state.progress.cash,tick:Silk.app.state.progress.world.tick}})()`;
const near = (a, b, tol) => Math.abs(a - b) <= tol;
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
      const scene0 = await ev(SCENE); await shot('00-map');
      const frames = {}; const expectScale = Math.max(.3, (w - 24) / 768);
      for (const win of WINDOWS) {
        check(tag + ' ' + win.title + ' HUD entry opens it', await clickTool(win.id), ''); await sleep(450);
        const m = await ev(MEASURE); const s = m.scale; frames[win.id] = m.panel;
        check(tag + ' ' + win.title + ' is the single primary panel (data-panel-id, aria-pressed only on its entry)', !m.primaryHidden && m.visiblePrimaries === 1 && m.secondaryHidden && m.id === win.id && m.state.primary === win.id && m.tools.every(t => t.pressed === String(t.panel === win.id)), JSON.stringify({ id: m.id, primary: m.state.primary, pressed: m.tools.filter(t => t.pressed === 'true').map(t => t.panel) }));
        check(tag + ' ' + win.title + ' art = ' + win.art + ' as a 9-slice frame (' + win.top + ' 64 ' + win.bottom + ' 64 fill) scaled by --art-scale ' + (s && s.toFixed(3)), m.before.display === 'block' && m.before.source.includes(win.art) && [win.top + ' 64 ' + win.bottom + ' 64 fill', win.top + ' 64 ' + win.bottom + ' fill'].includes(m.before.slice) && m.before.repeat.startsWith('stretch') && s && near(s, expectScale, .002) && near(m.before.top, win.top * s, 1) && near(m.before.bottom, win.bottom * s, 1) && near(m.before.left, 64 * s, 1) && near(m.before.right, 64 * s, 1) && m.after === 'none' && m.bg === 'none' && m.shadow === 'none' && m.border === 0, JSON.stringify({ source: m.before.source.replace(/^.*\//, ''), slice: m.before.slice, widths: [m.before.top, m.before.left, m.before.bottom], scale: s, after: m.after, bg: m.bg }));
        const plaqueTop = m.panel.y + win.plaqueTop * s, plaqueBottom = m.panel.y + (win.plaqueTop + win.plaqueH) * s, closeY = m.panel.y + win.close * s;
        const h2 = m.header.h2, cl = m.header.close;
        check(tag + ' ' + win.title + ' title 「' + (h2 && h2.text) + '」 sits on the plaque (' + (h2 && h2.rect.y) + '–' + (h2 && h2.rect.bottom) + ' in ' + plaqueTop.toFixed(1) + '–' + plaqueBottom.toFixed(1) + '), single line', h2 && h2.text === win.title && h2.rect.y >= plaqueTop - 1 && h2.rect.bottom <= plaqueBottom + 1 && h2.overflow <= 0 && h2.font >= 14 && near(m.header.padTop, win.header * s, 1) && near(m.header.rect.h, win.header * s, 1.5), JSON.stringify({ h2: h2 && h2.rect, font: h2 && h2.font, headerPad: m.header.padTop, expect: +(win.header * s).toFixed(1) }));
        check(tag + ' ' + win.title + ' close button on the plaque (centre ' + (cl && (cl.rect.y + cl.rect.h / 2).toFixed(1)) + ' ≈ ' + closeY.toFixed(1) + '), inside the frame, on top', cl && near(cl.rect.y + cl.rect.h / 2, closeY, 2) && cl.rect.right <= m.panel.right + .5 && cl.rect.x >= m.panel.x && cl.onTop && cl.rect.w >= 44 && cl.rect.h >= 44, JSON.stringify(cl));
        const bodyTopMin = m.panel.y + win.header * s - 1, bodyBottomMax = m.panel.bottom - win.pad * s + 1;
        check(tag + ' ' + win.title + ' content area under the plaque and above the bottom ornaments (' + m.body.rect.y + '–' + m.body.rect.bottom + ' within ' + bodyTopMin.toFixed(1) + '–' + bodyBottomMax.toFixed(1) + '), only the body scrolls, no horizontal overflow', m.body.rect.y >= bodyTopMin && m.body.rect.bottom <= bodyBottomMax && (!m.footer || (m.footer.bottom <= bodyBottomMax && m.footer.right <= m.panel.right)) && m.body.overflowY === 'auto' && m.body.scrollW <= m.body.clientW + 1 && m.docOverflowX <= 0 && near(m.pad.bottom, win.pad * s, 1) && near(m.pad.left, w * .05, 1) && m.body.children > 0, JSON.stringify({ body: m.body.rect, scroll: [m.body.scrollH, m.body.clientH], footer: m.footer, padBottom: m.pad.bottom }));
        if (win.id === 'pack') {
          const ok = m.icons.length === 2 && ICONS.every((n, i) => m.icons[i].src.includes(n)) && m.icons.every(i => i.natural > 0 && i.complete && i.visibility === 'visible' && i.opacity === '1' && i.display !== 'none' && near(i.rect.w, 28, .5) && near(i.rect.h, 28, .5) && i.rect.y >= m.body.rect.y - .5 && i.rect.bottom <= m.body.rect.bottom + .5 && i.rect.x >= m.body.rect.x && i.rect.right <= m.body.rect.right && i.onTop);
          check(tag + ' 行囊 keeps its two status icons (' + ICONS.join(' / ') + '): rendered 28×28, visible, inside the content area, not clipped, not covered', ok, JSON.stringify(m.icons.map(i => ({ src: i.src, natural: i.natural, rect: i.rect, onTop: i.onTop, vis: i.visibility, op: i.opacity }))));
        }
        if (win.id === 'message') {
          const hits = c.network.filter(n => /B4_message_panel_bg_v02\.(png|webp)/.test(n.url)), old = c.network.filter(n => /_v01\.(png|webp)/.test(n.url) && /B4_message|B2_bag/.test(n.url));
          check(tag + ' 消息 loads B4_message_panel_bg_v02 (' + hits.map(x => x.status).join(',') + '), no v01 request', hits.length >= 1 && hits.every(x => x.status === 200) && old.length === 0, JSON.stringify({ v02: hits.map(x => x.url.replace(/^.*\//, '')), v01: old.map(x => x.url) }));
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
      check(tag + ' one frame geometry for all five windows (' + f0.w + '×' + f0.h + ' at ' + f0.x + ',' + f0.y + ')', rects.every(r => near(r.x, f0.x, .5) && near(r.y, f0.y, .5) && near(r.w, f0.w, .5) && near(r.h, f0.h, .5)), JSON.stringify(frames));
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
  fs.writeFileSync(path.join(outDir, 'five-windows-report.json'), JSON.stringify({ label, serveRoot, generatedAt: new Date().toISOString(), viewports: VIEWPORTS, windows: WINDOWS, passed: checks.length - failed.length, failed: failed.length, checks }, null, 2));
  console.log('\n' + (checks.length - failed.length) + '/' + checks.length + ' checks passed' + (failed.length ? ' — FAILED: ' + failed.map(f => f.name).join(' | ') : ''));
  process.exit(failed.length ? 1 : 0);
})();
