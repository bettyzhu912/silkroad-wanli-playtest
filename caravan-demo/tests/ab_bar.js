'use strict';
// A/B screenshots: balance bar 9px (thin) vs 12px (default), plus an icon strip (main-game icons next to the placeholders).
const fs = require('fs'), path = require('path');
const here = __dirname, demoRoot = path.join(here, '..'), repoRoot = path.join(demoRoot, '..');
const { launch, startServer, sleep } = require(path.join(repoRoot, 'tests', 'tools', 'cdp'));
(async () => {
  const out = path.join(here, 'results', 'ab'); fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(demoRoot, 'icon-strip.html'), `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#f6ead0;padding:12px;font:13px system-ui"><div style="display:flex;gap:14px;align-items:flex-end">${['goods_khotan_yutianyu_v01.png','goods_khotan_jingzhi_yuqi_v01.png','goods_dunhuang_ranliao_v01.png','placeholder_silverware_v0.svg','placeholder_turquoise_v0.svg','placeholder_pepper_v0.svg'].map(f=>`<div style="text-align:center"><img src="assets/cargo/${f}" style="width:88px;height:88px;object-fit:contain"><div>${f.replace(/goods_|_v0\\d?\\.\\w+|placeholder_/g,'')}</div></div>`).join('')}</div></body>`);
  const srv = startServer(8192, demoRoot); await sleep(400);
  const c = await launch({ port: 9412, width: 390, height: 844, mobile: true });
  const ev = js => c.eval(js);
  await c.navigate('http://127.0.0.1:8192/icon-strip.html'); await sleep(700); await c.screenshot(path.join(out, 'icon-strip.png'));
  await c.navigate('http://127.0.0.1:8192/'); await sleep(800);
  await ev('new Promise(r=>{const t=setInterval(()=>{const l=document.querySelector("#loading");if(l&&l.hidden){clearInterval(t);r()}},200)})');
  await ev(`import('./bridge.js?v='+window.__BUILD).then(m=>{window.__bridge=m.bridge;})`); await sleep(300);
  const click = sel => ev(`(()=>{const b=document.querySelector(${JSON.stringify(sel)});if(!b||b.disabled)return false;b.click();return true})()`);
  await ev(`(()=>{const b=[...document.querySelectorAll('#app button')].find(x=>x.textContent.trim()==='试玩');b.click();})()`); await sleep(600);
  const slots = await ev('__bridge.state().then(s=>s.slots)');
  // one item left, one right → bead near the centre band; then a third → off-centre
  await click(`.cargo[data-id="${slots[0]}"]`); await sleep(150); await click('.bag.left .action[data-insert="left"]'); await sleep(400);
  await click(`.cargo[data-id="${slots[1]}"]`); await sleep(150); await click('.bag.right .action[data-insert="right"]'); await sleep(400);
  await click(`.cargo[data-id="${slots[2]}"]`); await sleep(150); await click('.bag.right .action[data-insert="right"]'); await sleep(700);
  await click(`.cargo[data-id="${slots[3]}"]`); await sleep(300);   // selected: 放入 buttons visible
  await c.screenshot(path.join(out, 'bar-12px-default.png'));
  await ev('document.querySelector("main").classList.add("thin-bar")'); await sleep(300); await c.screenshot(path.join(out, 'bar-9px-thin.png'));
  await ev('document.querySelector("main").classList.remove("thin-bar")');
  await c.close(); srv.stop(); fs.unlinkSync(path.join(demoRoot, 'icon-strip.html')); console.log('A/B shots →', out);
})().catch(e => { console.error(e); process.exit(1); });
