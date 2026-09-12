'use strict';
// Three-city main-screen check: new 720×1280 backgrounds, HUD / map-button safe insets and hotspot placement (art-relative) per phone size.
// Usage: node tests/browser/city-scenes-shot.js [label] [--root <dir>] [--only 390x844,...]
const fs = require('fs'), path = require('path');
const { launch, startServer, sleep } = require('../tools/cdp');
const root = path.join(__dirname, '..', '..');
const argv = process.argv.slice(2), flag = n => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const label = argv.find((a, i) => !a.startsWith('--') && (i === 0 || !argv[i - 1].startsWith('--'))) || 'city-scenes';
const serveRoot = flag('--root') ? path.resolve(flag('--root')) : root;
const outDir = path.join(root, 'tests', 'results', 'evidence', 'viewport-' + label); fs.mkdirSync(outDir, { recursive: true });
const ALL = [{ w: 320, h: 568 }, { w: 360, h: 640 }, { w: 360, h: 780 }, { w: 375, h: 667 }, { w: 375, h: 812 }, { w: 390, h: 844 }, { w: 412, h: 915 }, { w: 430, h: 932 }];
const only = flag('--only'); const viewports = only ? ALL.filter(v => only.split(',').includes(v.w + 'x' + v.h)) : ALL;
const METRICS = `(() => {
  const vw = innerWidth, vh = innerHeight, r = el => { const b = el.getBoundingClientRect(); return { x: +b.left.toFixed(1), y: +b.top.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1), r: +b.right.toFixed(1), b: +b.bottom.toFixed(1) }; };
  const out = { issues: [] }, art = document.querySelector('.city-background'), hud = document.querySelector('.global-hud'), map = document.querySelector('.city-scene > .world-map-button');
  if (!art || !art.naturalWidth) { out.issues.push('city background not loaded'); return out; }
  const a = r(art); out.art = { natural: art.naturalWidth + 'x' + art.naturalHeight, box: a, boxRatio: +(a.w / a.h).toFixed(4), naturalRatio: +(art.naturalWidth / art.naturalHeight).toFixed(4), src: art.currentSrc.split('/').pop() };
  if (Math.abs(out.art.boxRatio - out.art.naturalRatio) > 0.003) out.issues.push('art box ratio differs from natural ratio');
  const sky = art.naturalHeight === 1600 ? 320 / 1600 : 0; out.bands = { left: +Math.max(0, a.x).toFixed(1), right: +Math.max(0, vw - a.r).toFixed(1), top: +Math.max(0, a.y).toFixed(1), bottom: +Math.max(0, vh - a.b).toFixed(1), skyCropped: +Math.max(0, -a.y).toFixed(1), skyAllowance: +(sky * a.h).toFixed(1) };
  if (a.x < -1 || a.r > vw + 1 || a.b > vh + 1 || -a.y > sky * a.h + 1) out.issues.push('art cropped beyond the added-sky allowance');
  out.hud = r(hud);
  const cs = getComputedStyle(document.documentElement), uiTop = parseFloat(cs.getPropertyValue('--ui-top')), uiBottom = parseFloat(cs.getPropertyValue('--ui-bottom')); out.insets = { uiTop, uiBottom }; if (out.hud.y < uiTop - 0.5) out.issues.push('HUD above --ui-top');
  out.map = r(map); out.mapBottomClearance = +(vh - out.map.b).toFixed(1); const safeB = parseFloat(cs.getPropertyValue('--safe-bottom')) || 0, expectMap = Math.max(safeB, 18) + 6; out.insets.mapBottom = expectMap; if (out.mapBottomClearance < expectMap - 0.5) out.issues.push('map button too close to bottom (' + out.mapBottomClearance + 'px)'); if (out.map.r > vw + 0.5) out.issues.push('map button outside right edge');
  out.hotspots = [...document.querySelectorAll('.city-hotspot')].map(h => { const q = r(h), ax = +h.dataset.artX, ay = +h.dataset.artY, cx = q.x + q.w / 2, cy = q.y + q.h / 2; const ex = a.x + ax / art.naturalWidth * a.w, ey = a.y + ay / art.naturalHeight * a.h; const d = Math.hypot(cx - ex, cy - ey); if (d > 3) out.issues.push('hotspot ' + h.dataset.hotspot + ' drifted ' + d.toFixed(1) + 'px from its art anchor'); if (q.x < -0.5 || q.r > vw + 0.5 || q.y < -0.5 || q.b > vh + 0.5) out.issues.push('hotspot ' + h.dataset.hotspot + ' outside viewport'); const underHud = q.y < out.hud.b && q.b > out.hud.y && q.x < out.hud.r && q.r > out.hud.x; if (underHud) out.issues.push('hotspot ' + h.dataset.hotspot + ' overlaps HUD'); const vis = r(h.querySelector('.hotspot-visual') || h); const underMap = vis.y < out.map.b && vis.b > out.map.y && vis.x < out.map.r && vis.r > out.map.x; if (underMap) out.issues.push('hotspot ' + h.dataset.hotspot + ' plaque overlaps map button by ' + Math.min(vis.b - out.map.y, out.map.b - vis.y).toFixed(1) + 'px'); return { id: h.dataset.hotspot, art: [ax, ay], center: [+cx.toFixed(1), +cy.toFixed(1)], expected: [+ex.toFixed(1), +ey.toFixed(1)] }; });
  return out;
})()`;
(async () => {
  const port = 8176, srv = startServer(port, serveRoot); await sleep(500); let cdpPort = 9390; const report = { serveRoot, viewports: [] };
  for (const v of viewports) {
    const name = v.w + 'x' + v.h, c = await launch({ port: cdpPort++, width: v.w, height: v.h, mobile: true }), rows = [];
    const clickText = text => c.eval(`(()=>{const els=[...document.querySelectorAll('button')].filter(b=>b.offsetParent!==null);const b=els.find(b=>b.textContent.trim()===${JSON.stringify(text)});if(!b)return false;b.click();return true})()`);
    try {
      await c.navigate('http://127.0.0.1:' + port + '/'); await sleep(900);
      await c.eval('new Promise(r=>{const t=setInterval(()=>{if(window.Silk&&Silk.app&&Silk.app.state){clearInterval(t);r()}},100)})');
      await clickText('启程'); await sleep(250); await clickText('自行探索');
      await c.eval('new Promise(r=>{const t=setInterval(()=>{const p=Silk.app.state.progress;if(p&&p.world){clearInterval(t);r()}},100)})'); await sleep(600);
      for (const city of ['changan', 'dunhuang', 'khotan']) {
        // scene-only switch for the visual check (no gameplay involved): set the city and re-render
        await c.eval(`(()=>{Silk.app.state.progress.world.city=${JSON.stringify(city)};Silk.ui.render(Silk.app.state);})()`);
        await c.eval(`new Promise(r=>{const img=document.querySelector('.city-background');if(img&&img.complete&&img.naturalWidth){r();return}const t=setInterval(()=>{const i=document.querySelector('.city-background');if(i&&i.complete&&i.naturalWidth){clearInterval(t);r()}},100)})`); await sleep(400);
        await c.eval('(()=>{dispatchEvent(new Event("resize"))})()'); await sleep(250);
        const m = await c.eval(METRICS); rows.push({ city, ...m }); await c.screenshot(path.join(outDir, 'city-' + name + '-' + city + '.png'));
      }
    } catch (e) { rows.push({ city: 'error', issues: [String(e.message || e).slice(0, 200)] }); }
    const errors = c.console.filter(m => m.type === 'error' || m.type === 'exception').map(m => m.text.slice(0, 160));
    report.viewports.push({ viewport: name, rows, consoleErrors: errors });
    const issues = rows.flatMap(r => (r.issues || []).map(i => r.city + ': ' + i));
    console.log(name + ': ' + (issues.length ? issues.join(' | ') : 'no issues') + (errors.length ? ' | console errors ' + errors.length : ''));
    await c.close();
  }
  srv.stop(); fs.writeFileSync(path.join(outDir, 'city-scenes.json'), JSON.stringify(report, null, 1)); console.log('city scenes → ' + outDir);
})().catch(e => { console.error(e); process.exit(1); });
