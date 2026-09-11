'use strict';
// Multi-viewport layout audit in headless Chrome: for each phone/tablet/desktop size, start a new save through the real UI,
// open the main screens and record overflow, HUD metrics, panel footer visibility, hotspot placement and scene-art letterboxing.
// Usage: node tests/browser/viewport-audit.js [label] [--root <dir>] [--only 375x812,390x844]
const fs = require('fs'), path = require('path');
const { launch, startServer, sleep } = require('../tools/cdp');
const root = path.join(__dirname, '..', '..');
const argv = process.argv.slice(2), flag = n => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const label = argv.find((a, i) => !a.startsWith('--') && (i === 0 || !argv[i - 1].startsWith('--'))) || 'viewports';
const serveRoot = flag('--root') ? path.resolve(flag('--root')) : root;
const outDir = path.join(root, 'tests', 'results', 'evidence', 'viewport-' + label); fs.rmSync(outDir, { recursive: true, force: true }); fs.mkdirSync(outDir, { recursive: true });
const ALL = [
  { w: 320, h: 568, name: 'iphone-se1-320x568' }, { w: 360, h: 640, name: 'android-small-360x640' }, { w: 360, h: 780, name: 'android-tall-360x780' },
  { w: 375, h: 667, name: 'iphone8-375x667' }, { w: 375, h: 812, name: 'iphoneX-375x812' }, { w: 390, h: 844, name: 'iphone13-390x844' },
  { w: 412, h: 915, name: 'pixel-412x915' }, { w: 430, h: 932, name: 'iphone15promax-430x932' }, { w: 768, h: 1024, name: 'ipad-portrait-768x1024' },
  { w: 844, h: 390, name: 'iphone13-landscape-844x390', landscape: true }, { w: 1024, h: 768, name: 'ipad-landscape-1024x768', landscape: true }, { w: 1280, h: 900, name: 'desktop-1280x900', desktop: true },
];
const only = flag('--only'); const viewports = only ? ALL.filter(v => only.split(',').includes(v.w + 'x' + v.h)) : ALL;
const METRICS = `(() => {
  const vw = window.innerWidth, vh = window.innerHeight, docEl = document.documentElement;
  const rect = el => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), inside: r.left >= -1 && r.top >= -1 && r.right <= vw + 1 && r.bottom <= vh + 1 }; };
  const fs = el => el ? parseFloat(getComputedStyle(el).fontSize) : null;
  const root = document.getElementById('game-root');
  const panel = [...document.querySelectorAll('section.paper-panel')].find(s => !s.hidden && s.offsetParent !== null);
  const footerButtons = panel ? [...panel.querySelectorAll('footer button, .panel-footer button')].filter(b => b.offsetParent !== null).map(b => ({ text: b.textContent.trim().slice(0, 12), ...rect(b) })) : [];
  const hotspots = [...document.querySelectorAll('.city-hotspot, .home-hotspot')].filter(b => b.offsetParent !== null).map(b => ({ text: b.textContent.trim().slice(0, 6) || b.getAttribute('aria-label'), ...rect(b) }));
  const art = document.querySelector('.city-background, .home-art, .travel-art img, .world-map-background');
  const artRect = art ? rect(art) : null; let artDrawn = null;
  if (art && art.naturalWidth) { const s = Math.min(art.clientWidth / art.naturalWidth, art.clientHeight / art.naturalHeight); artDrawn = { w: Math.round(art.naturalWidth * s), h: Math.round(art.naturalHeight * s), boxW: art.clientWidth, boxH: art.clientHeight, bandX: Math.round((art.clientWidth - art.naturalWidth * s) / 2), bandY: Math.round((art.clientHeight - art.naturalHeight * s) / 2), fit: getComputedStyle(art).objectFit }; }
  return { vw, vh, dpr: window.devicePixelRatio, overflowX: docEl.scrollWidth - vw, overflowY: docEl.scrollHeight - vh, root: rect(root), rootHeightVar: getComputedStyle(docEl).getPropertyValue('--viewport-height').trim(), hud: rect(document.querySelector('.global-hud')), hudFonts: { statusValue: fs(document.querySelector('.status-value')), dateLines: fs(document.querySelector('.date-lines')), hudLabel: fs(document.querySelector('.hud-label')) }, panel: panel ? { id: panel.dataset.panelId || panel.className, ...rect(panel), bodyScrollable: !!panel.querySelector('.panel-body') && panel.querySelector('.panel-body').scrollHeight > panel.querySelector('.panel-body').clientHeight } : null, footerButtons, hotspots, art: artRect && { rect: artRect, drawn: artDrawn }, bodyFont: fs(document.body), buttonMin: Math.min(...[...document.querySelectorAll('button')].filter(b => b.offsetParent !== null).map(b => b.getBoundingClientRect().height).filter(h => h > 0), 999) };
})()`;
(async () => {
  const port = 8160, srv = startServer(port, serveRoot); await sleep(500);
  const report = { label, serveRoot, viewports: [] };
  let cdpPort = 9360;
  for (const v of viewports) {
    const c = await launch({ port: cdpPort++, width: v.w, height: v.h, mobile: !v.desktop });
    const shots = [], issues = [], screens = {};
    const shot = async name => { const f = v.name + '-' + name + '.png'; await c.screenshot(path.join(outDir, f)); shots.push(f); };
    const clickText = (text, scope) => c.eval(`(()=>{const secs=[...document.querySelectorAll('section.paper-panel')].filter(x=>!x.hidden&&x.offsetParent!==null);const order=['modal-panel','result-panel','secondary-panel','primary-panel'];let sc=null;for(const cls of order){sc=secs.find(s=>s.classList.contains(cls));if(sc)break}const rootEl=${scope === 'page' ? 'document' : '(sc||document)'};const b=[...rootEl.querySelectorAll('button')].find(x=>!x.disabled&&x.offsetParent!==null&&x.textContent.trim().startsWith(${JSON.stringify(text)}));if(!b)return 'NOT_FOUND';b.click();return 'ok'})()`);
    const closeAll = async () => { for (let i = 0; i < 4; i++) { const r = await c.eval(`(()=>{const secs=[...document.querySelectorAll('section.paper-panel.secondary-panel, section.paper-panel.primary-panel, section.paper-panel.result-panel')].filter(x=>!x.hidden&&x.offsetParent!==null);if(!secs.length)return 'none';const s=secs[secs.length-1];const close=s.querySelector('button[aria-label="关闭"]');if(close){close.click();return 'closed'}const b=[...s.querySelectorAll('button')].filter(x=>!x.disabled&&x.offsetParent!==null&&/^(继续|离开客舍|返回|离开市场|离开柜坊|知道了)/.test(x.textContent.trim()));if(b.length){b[b.length-1].click();return 'footer'}return 'stuck'})()`); if (r === 'none' || r === 'stuck') break; await sleep(200); } };
    const capture = async (name) => { await sleep(350); const m = await c.eval(METRICS); screens[name] = m; await shot(name); if (m.overflowX > 0) issues.push(name + ': horizontal overflow ' + m.overflowX + 'px'); for (const b of m.footerButtons) if (!b.inside) issues.push(name + ': footer button "' + b.text + '" outside viewport'); for (const h of m.hotspots) if (!h.inside) issues.push(name + ': hotspot "' + h.text + '" outside viewport'); if (m.panel && m.panel.h < 200) issues.push(name + ': panel height only ' + m.panel.h + 'px'); return m; };
    try {
      await c.navigate('http://127.0.0.1:' + port + '/'); await sleep(900);
      await c.eval('new Promise(r=>{const t=setInterval(()=>{if(window.Silk&&Silk.app&&Silk.app.state){clearInterval(t);r()}},100)})');
      await capture('01-home');
      await clickText('启程', 'page'); await sleep(300); await capture('02-start-choice');
      await clickText('自行探索', 'page'); await c.eval('new Promise(r=>{const t=setInterval(()=>{const p=Silk.app.state.progress;if(p&&p.world){clearInterval(t);r()}},100)})'); await sleep(400);
      await capture('03-city');
      await clickText('市场', 'page'); await sleep(700); await capture('04-market'); await closeAll();
      await clickText('客舍', 'page'); await sleep(300); await capture('05-inn'); await closeAll();
      await clickText('委托', 'page'); await sleep(300); await capture('06-commissions'); await closeAll();
      await clickText('柜坊', 'page'); await sleep(300); await capture('07-guifang'); await closeAll();
      await clickText('出发', 'page'); await sleep(300); await capture('08-depart'); await clickText('敦煌'); await sleep(500); await capture('09-draft'); await closeAll();
      await clickText('地图', 'page'); await sleep(400); await capture('10-map'); await closeAll();
      await clickText('更多', 'page'); await sleep(300); await capture('11-more'); await closeAll();
      // start the trip to see the journey scene
      await clickText('出发', 'page'); await sleep(300); await clickText('出发前委托'); await sleep(300); await clickText('开始行程'); await sleep(300); await clickText('开始行程'); await sleep(1200); await capture('12-journey');
    } catch (e) { issues.push('harness error: ' + String(e.message || e).slice(0, 200)); try { await shot('error'); } catch (_) { } }
    const errors = c.console.filter(m => m.type === 'error' || m.type === 'exception').map(m => m.text.slice(0, 160));
    report.viewports.push({ ...v, issues, consoleErrors: errors, screens, shots });
    console.log(v.name + ': ' + (issues.length ? issues.length + ' issue(s): ' + issues.join(' | ') : 'no layout issues') + (errors.length ? ' | console errors: ' + errors.length : ''));
    await c.close();
  }
  srv.stop();
  fs.writeFileSync(path.join(outDir, 'viewport-audit.json'), JSON.stringify(report, null, 1));
  console.log('viewport audit → ' + outDir);
})().catch(e => { console.error(e); process.exit(1); });
