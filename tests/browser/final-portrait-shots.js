'use strict';
// Extra portrait screenshots for the final adaptation check: bag / message / map panels, the journey scene itself (route event dismissed), a result panel and the more menu.
// Usage: node tests/browser/final-portrait-shots.js [label] [--only 390x844,...]
const fs = require('fs'), path = require('path');
const { launch, startServer, sleep } = require('../tools/cdp');
const root = path.join(__dirname, '..', '..');
const argv = process.argv.slice(2), flag = n => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const label = argv.find((a, i) => !a.startsWith('--') && (i === 0 || !argv[i - 1].startsWith('--'))) || 'final-portrait';
const serveRoot = flag('--root') ? path.resolve(flag('--root')) : root;
const outDir = path.join(root, 'tests', 'results', 'evidence', 'viewport-' + label); fs.mkdirSync(outDir, { recursive: true });
const ALL = [{ w: 320, h: 568 }, { w: 360, h: 780 }, { w: 375, h: 667 }, { w: 390, h: 844 }, { w: 430, h: 932 }];
const only = flag('--only'); const viewports = only ? ALL.filter(v => only.split(',').includes(v.w + 'x' + v.h)) : ALL;
const CHECK = `(() => {
  const vw = innerWidth, vh = innerHeight, out = { issues: [] };
  const vis = el => el.offsetParent !== null && el.getClientRects().length;
  const panel = [...document.querySelectorAll('section.paper-panel')].filter(s => !s.hidden && vis(s)).pop();
  if (panel) { const r = panel.getBoundingClientRect(); out.panel = { id: panel.dataset.panelId, x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
    for (const b of panel.querySelectorAll('button')) { if (!vis(b)) continue; const q = b.getBoundingClientRect(); if (q.width && (q.left < -1 || q.right > vw + 1)) out.issues.push('button outside x: ' + (b.textContent.trim() || b.getAttribute('aria-label'))); }
    const h = panel.querySelector('.panel-header'); if (h) { const q = h.getBoundingClientRect(); out.header = { y: Math.round(q.top), h: Math.round(q.height) }; }
    const body = panel.querySelector('.panel-body'); if (body) out.bodyScroll = body.scrollHeight > body.clientHeight + 1;
    const footer = panel.querySelector('.panel-footer'); if (footer && !footer.hidden) { const q = footer.getBoundingClientRect(); if (q.bottom > vh + 1) out.issues.push('footer below viewport'); }
  }
  const art = document.querySelector('.city-background, .travel-background, .home-art');
  if (art && art.naturalWidth) { const r = art.getBoundingClientRect(); const s = Math.min(r.width / art.naturalWidth, r.height / art.naturalHeight); const slack = { 1600: [320, 0], 2091: [300, 119], 1460: [140, 137] }[art.naturalHeight] || [0, 0]; const sT = slack[0] / art.naturalHeight * r.height, sB = slack[1] / art.naturalHeight * r.height; out.art = { natural: art.naturalWidth + 'x' + art.naturalHeight, box: Math.round(r.width) + 'x' + Math.round(r.height), boxRatio: +(r.width / r.height).toFixed(4), naturalRatio: +(art.naturalWidth / art.naturalHeight).toFixed(4), compositionInside: r.left >= -1 && r.top + sT >= -1 && r.right <= vw + 1 && r.bottom - sB <= vh + 1, bands: { top: Math.max(0, Math.round(r.top)), bottom: Math.max(0, Math.round(vh - r.bottom)), left: Math.max(0, Math.round(r.left)), right: Math.max(0, Math.round(vw - r.right)) } }; if (Math.abs(out.art.boxRatio - out.art.naturalRatio) > 0.004) out.issues.push('art box ratio differs from natural ratio'); if (!out.art.compositionInside) out.issues.push('original composition cropped by viewport'); }
  out.overflowX = document.documentElement.scrollWidth - vw; if (out.overflowX > 0) out.issues.push('horizontal overflow');
  return out;
})()`;
(async () => {
  const port = 8172, srv = startServer(port, serveRoot); await sleep(500); let cdpPort = 9380; const report = [];
  for (const v of viewports) {
    const name = v.w + 'x' + v.h, c = await launch({ port: cdpPort++, width: v.w, height: v.h, mobile: true }), rows = [];
    const shot = async n => c.screenshot(path.join(outDir, 'extra-' + name + '-' + n + '.png'));
    const check = async n => { await sleep(350); const r = await c.eval(CHECK); rows.push({ screen: n, ...r }); await shot(n); };
    const clickText = text => c.eval(`(()=>{const top=['modal-panel','result-panel','secondary-panel','primary-panel'].map(k=>document.querySelector('section.'+k)).find(s=>s&&!s.hidden&&s.offsetParent!==null);const scope=top&&[...top.querySelectorAll('button')].some(b=>b.offsetParent!==null&&(b.textContent.trim()===${JSON.stringify(text)}||b.getAttribute('aria-label')===${JSON.stringify(text)}))?top:document;const els=[...scope.querySelectorAll('button')].filter(b=>b.offsetParent!==null);const b=els.find(b=>b.textContent.trim()===${JSON.stringify(text)}||b.getAttribute('aria-label')===${JSON.stringify(text)})||els.find(b=>b.textContent.includes(${JSON.stringify(text)})||(b.getAttribute('aria-label')||'').includes(${JSON.stringify(text)}));if(!b)return false;b.click();return true})()`);
    const closeTop = () => c.eval(`(()=>{const ps=[...document.querySelectorAll('section.paper-panel')].filter(s=>!s.hidden&&s.offsetParent!==null);for(const p of ps.reverse()){const b=p.querySelector('.close-button');if(b){b.click();return true}}return false})()`);
    try {
      await c.navigate('http://127.0.0.1:' + port + '/'); await sleep(900);
      await c.eval('new Promise(r=>{const t=setInterval(()=>{if(window.Silk&&Silk.app&&Silk.app.state){clearInterval(t);r()}},100)})');
      await clickText('启程'); await sleep(250); await clickText('自行探索');
      await c.eval('new Promise(r=>{const t=setInterval(()=>{const p=Silk.app.state.progress;if(p&&p.world){clearInterval(t);r()}},100)})'); await sleep(500);
      await clickText('行囊'); await check('pack'); await closeTop(); await sleep(200);
      await clickText('消息'); await check('message'); await closeTop(); await sleep(200);
      await clickText('委托'); await check('commission'); await closeTop(); await sleep(200);
      await c.eval(`document.querySelector('.world-map-button').click()`); await check('map'); await closeTop(); await sleep(200);
      await clickText('柜坊'); await sleep(250); await clickText('长安寄存'); await sleep(250); await check('finance-form'); await closeTop(); await sleep(150); await closeTop(); await sleep(200);
      await clickText('出发'); await sleep(250); await clickText('敦煌'); await sleep(300); await clickText('出发前委托'); await sleep(300); await clickText('开始行程'); await sleep(300); await clickText('开始行程'); await sleep(1200);
      await check('journey-with-event');
      for (let i = 0; i < 3; i++) { const modal = await c.eval(`(()=>{const m=['section.modal-panel','section.result-panel'].map(q=>document.querySelector(q)).find(x=>x&&x.offsetParent!==null);return m?[...m.querySelectorAll('.panel-body button, .panel-footer button')].filter(b=>!b.disabled).map(b=>b.textContent.trim()):null})()`); if (!modal) break; await clickText(modal[modal.length - 1]); await sleep(600); }
      await check('journey');
      await c.eval(`(()=>{for(const l of document.querySelectorAll('.result-layer,.modal-layer,.primary-layer'))l.style.visibility='hidden'})()`); await sleep(200); await shot('journey-art-only'); await c.eval(`(()=>{for(const l of document.querySelectorAll('.result-layer,.modal-layer,.primary-layer'))l.style.visibility=''})()`);
    } catch (e) { rows.push({ screen: 'error', issues: [String(e.message || e).slice(0, 200)] }); try { await shot('error'); } catch (_) { } }
    const errors = c.console.filter(m => m.type === 'error' || m.type === 'exception').map(m => m.text.slice(0, 160));
    const badRequests = c.network.filter(r => r.status === 'FAILED' || (typeof r.status === 'number' && r.status >= 400)).map(r => ({ url: String(r.url).slice(-80), status: r.status, error: r.error }));
    const remote = c.network.filter(r => typeof r.url === 'string' && /^https?:\/\//.test(r.url) && !r.url.startsWith('http://127.0.0.1:')).map(r => r.url.slice(0, 100));
    report.push({ viewport: name, rows, consoleErrors: errors, requests: c.network.length, badRequests, remoteRequests: remote });
    if (badRequests.length) rows.push({ screen: 'network', issues: badRequests.map(b => b.status + ' ' + b.url) });
    if (remote.length) rows.push({ screen: 'network', issues: remote.map(u => 'remote request ' + u) });
    const issues = rows.flatMap(r => r.issues.map(i => r.screen + ': ' + i));
    console.log(name + ': ' + (issues.length ? issues.join(' | ') : 'no issues') + (errors.length ? ' | console errors ' + errors.length : ''));
    await c.close();
  }
  srv.stop(); fs.writeFileSync(path.join(outDir, 'extra-shots.json'), JSON.stringify(report, null, 1)); console.log('extra shots → ' + outDir);
})().catch(e => { console.error(e); process.exit(1); });
