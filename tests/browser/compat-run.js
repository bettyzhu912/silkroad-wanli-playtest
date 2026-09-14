'use strict';
// Chrome 61 baseline fallbacks exercised on a modern engine: window.__silkCompatForce switches the three CSS capabilities off before compat.js runs,
// so the .no-flex-gap / .no-focus-visible rules of the (staged) stylesheets and the aspect-ratio JS shim carry the layout — the way Android 8.1
// WebView 61 would see the package. Real Chrome 61 is not available here: this is the fallback path, not a Chrome 61 run.
// Usage: node tests/browser/compat-run.js [label] [--root <dir>] [--port 8471] [--cdp 9721]
const fs = require('fs'), path = require('path');
const { launch, startServer, sleep } = require('../tools/cdp');
const root = path.join(__dirname, '..', '..');
const argv = process.argv.slice(2), flag = n => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const label = argv.find((a, i) => !a.startsWith('--') && (i === 0 || !argv[i - 1].startsWith('--'))) || 'compat';
const serveRoot = flag('--root') ? path.resolve(flag('--root')) : root;
const staged = fs.readFileSync(path.join(serveRoot, 'caravan.css'), 'utf8').includes('.no-flex-gap .caravan-shell');   // the build wrote the generated fallbacks
const outDir = path.join(root, 'tests', 'results', 'evidence', 'compat-' + label); fs.rmSync(outDir, { recursive: true, force: true }); fs.mkdirSync(outDir, { recursive: true });
const checks = []; let shotIndex = 0;
const check = (name, ok, detail) => { checks.push({ name, ok: Boolean(ok), detail: detail === undefined ? '' : String(detail).slice(0, 400) }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  ' + String(detail).slice(0, 220) : '')); };
(async () => {
  const port = Number(flag('--port')) || 8471, srv = startServer(port, serveRoot); await sleep(500);
  const c = await launch({ port: Number(flag('--cdp')) || 9721, width: 390, height: 844, mobile: true });
  await c.send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__silkCompatForce = { flexGap: false, focusVisible: false, aspectRatio: false };' });
  const shot = async name => { const f = String(++shotIndex).padStart(2, '0') + '-' + name + '.png'; await c.screenshot(path.join(outDir, f)); return f; };
  const ev = js => c.eval(js);
  const clickText = text => ev(`(()=>{const top=['modal-panel','result-panel','secondary-panel','primary-panel'].map(k=>document.querySelector('section.'+k)).find(s=>s&&!s.hidden&&s.offsetParent!==null);const scope=top&&[...top.querySelectorAll('button')].some(b=>b.offsetParent!==null&&b.textContent.trim()===${JSON.stringify(text)})?top:document;const b=[...scope.querySelectorAll('button')].find(b=>!b.disabled&&b.offsetParent!==null&&b.textContent.trim()===${JSON.stringify(text)});if(!b)return false;b.click();return true})()`);
  const waitFor = async (js, ms = 8000, step = 100) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(js)) return true; await sleep(step); } return false; };
  const busyWait = () => waitFor('!Silk.app.busy', 8000, 50);
  const overflow = () => ev('document.documentElement.scrollWidth - window.innerWidth');
  const box = sel => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;const r=e.getBoundingClientRect();const cs=getComputedStyle(e);return {w:Math.round(r.width*100)/100,h:Math.round(r.height*100)/100,inlineH:e.style.height,inlineW:e.style.width,shim:e.getAttribute('data-aspect-shim'),visible:e.offsetParent!==null||cs.position==='fixed'}})()`);
  const ratioOk = (b, w, h, mode) => { if (!b || !b.w || !b.h) return false; const want = mode === 'width' ? b.h * w / h : b.w * h / w; const got = mode === 'width' ? b.w : b.h; return Math.abs(want - got) <= 1.5 && b.shim === mode; };
  const closeAll = async () => { await ev(`(()=>{for(const s of document.querySelectorAll('section.paper-panel .close-button'))if(s.offsetParent!==null)s.click();})()`); await sleep(200); };
  const toDunhuangMorning = async () => { await ev(`new Promise((resolve,reject)=>{const env=structuredClone(Silk.app.state);const p=env.progress;p.world.route=null;p.world.city='dunhuang';if(p.trip){p.trip.routeIndex=1;p.trip.phase='in_city';p.trip.routeHistory=['changan','dunhuang'];}p.world.tick=Math.ceil(p.world.tick/3)*3+3;if(p.world.tick%3!==0)p.world.tick+=3-p.world.tick%3;p.inventory.provisions=Math.max(p.inventory.provisions,20);p.eventSession=null;p.events=p.events||{};p.events.mainDays=p.events.mainDays||{};p.events.cityRollDays=p.events.cityRollDays||{};p.events.pendingCityRoll=null;for(let d=Math.floor(p.world.tick/3);d<Math.floor(p.world.tick/3)+60;d++){for(const c of ['changan','dunhuang','khotan'])p.events.cityRollDays[c+':'+d]={key:c+':'+d,city:c,day:d,trigger:false,suppressed:true};p.events.mainDays[d]='suppressed';}p.presentation.activeResult=null;env.meta.revision+=1;env.pending=null;const req=indexedDB.open('silkroad-rebuild-v1',2);req.onerror=()=>reject(req.error);req.onsuccess=()=>{const db=req.result;const tx=db.transaction('state','readwrite');tx.objectStore('state').put(env,'current');tx.oncomplete=()=>{db.close();resolve(true)};tx.onerror=()=>reject(tx.error);};})`); await ev('Silk.app.reload()'); await sleep(400); await waitFor('window.Silk&&Silk.app&&Silk.app.state&&Silk.app.state.progress&&Silk.app.state.progress.world&&!Silk.app.busy', 8000); await sleep(300); };
  const errors = [];
  try {
    await c.navigate('http://127.0.0.1:' + port + '/'); await sleep(900);
    await ev('new Promise(r=>{const t=setInterval(()=>{if(window.Silk&&Silk.app&&Silk.app.state){clearInterval(t);r()}},100)})'); await sleep(400);
    const classes = await ev('document.documentElement.className');
    check('A forced fallbacks: <html> carries no-flex-gap / no-focus-visible / no-aspect-ratio', /no-flex-gap/.test(classes) && /no-focus-visible/.test(classes) && /no-aspect-ratio/.test(classes), classes);
    check('A aspect shim installed with the mirrored rule list', await ev('Array.isArray(window.__silkAspectRules) && window.__silkAspectRules.length >= 9 && !!window.__silkAspectShim'), await ev('window.__silkAspectRules && window.__silkAspectRules.length'));
    const home = await box('.home-art-frame');
    check('A home art frame sized by the shim (height = width × 2091/941, inline, data-aspect-shim=height)', ratioOk(home, 941, 2091, 'height'), JSON.stringify(home));
    check('A home: no horizontal overflow with fallback margins', (await overflow()) <= 0, await overflow()); await shot('home-fallback');
    // focus fallback: programmatic focus must show the outline through the .no-focus-visible :focus copy (headless pages need focus emulation for :focus)
    await c.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    const focus = await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.offsetParent!==null);b.focus();const cs=getComputedStyle(b);return {style:cs.outlineStyle,width:cs.outlineWidth,text:b.textContent.trim()}})()`);
    check('B :focus fallback outlines a focused button (no-focus-visible)', focus && focus.style === 'solid' && parseFloat(focus.width) >= 2, JSON.stringify(focus));
    // into the game
    await clickText('启程'); await sleep(250); await clickText('自行探索'); await ev('new Promise(r=>{const t=setInterval(()=>{const p=Silk.app.state.progress;if(p&&p.world){clearInterval(t);r()}},100)})'); await sleep(500);
    check('C in game: no horizontal overflow', (await overflow()) <= 0, await overflow()); await shot('changan-fallback');
    const hudGap = await ev(`(()=>{const rows=[...document.querySelectorAll('.time-status')];const r=rows[0];if(!r||r.children.length<2)return null;return {display:getComputedStyle(r).display,margin:getComputedStyle(r.children[1]).marginLeft,children:r.children.length}})()`);
    check('C HUD time row: second child carries the margin fallback (styles.css .no-flex-gap .time-status>*+*)', hudGap && hudGap.margin === '4px', JSON.stringify(hudGap));
    // 长安 market (goods art aspect + panel header margins), left through the regular 离开市场 → 确认离市 flow
    await clickText('市场'); await waitFor('(()=>{const v=Silk.app.state.progress.market.visit;return v&&!v.settled})()', 6000); await busyWait(); await sleep(600);
    const goods = await box('img.goods-art');
    check('D market goods art squared by the shim (1:1, inline height)', goods && ratioOk(goods, 1, 1, 'height'), JSON.stringify(goods));
    const header = await ev(`(()=>{const f=[...document.querySelectorAll('.panel-header')].find(x=>x.offsetParent!==null&&x.children.length>=2);if(!f)return null;return {margin:getComputedStyle(f.children[1]).marginLeft,n:f.children.length}})()`);
    check('D panel header children separated by the margin fallback (styles.css .no-flex-gap .panel-header>*+*, 8px)', header && header.margin === '8px', JSON.stringify(header));
    check('D market: no horizontal overflow', (await overflow()) <= 0, await overflow()); await shot('market-fallback');
    await clickText('离开市场'); await sleep(400); if (await ev(`(()=>{const s=document.querySelector('[data-panel-id="market-exit-confirm"]');return Boolean(s&&s.offsetParent!==null)})()`)) await clickText('确认离市'); await busyWait(); await sleep(400);
    for (let i = 0; i < 4; i++) { const acked = await ev(`(()=>{const p=Silk.app.state.progress;const ar=p.presentation.activeResult;if(ar){Silk.ui.dispatch('result.ack',{resultId:ar.id});return true}return false})()`); await busyWait(); await sleep(200); if (!acked) break; }
    await closeAll();
    check('D market left (visit settled, no active result)', await ev('(()=>{const p=Silk.app.state.progress;return (!p.market.visit||p.market.visit.settled)&&!p.presentation.activeResult})()'), await ev('document.body.innerText.replace(/\\s+/g," ").slice(0,120)'));
    // world map
    await ev(`(()=>{const b=document.querySelector('.world-map-button');if(b)b.click();return !!b})()`); await sleep(500);
    const map = await box('.world-map-stage');
    check('E 舆图 stage sized by the shim (941:1672)', map && ratioOk(map, 941, 1672, 'height'), JSON.stringify(map)); await shot('map-fallback'); await closeAll();
    await ev("Silk.ui.dispatch('trip.begin')"); await busyWait(); await ev("Silk.ui.dispatch('trip.depart',{acknowledgeSupplyWarning:true})"); await busyWait(); await sleep(200);
    await toDunhuangMorning(); await closeAll();
    // 敦煌 caravan: camel width from height, bag / slots / items height from width
    await ev(`document.querySelector('.city-hotspot[data-hotspot="work"]').click()`); await sleep(350); await clickText('进入货栈'); await sleep(300);
    const opened = await waitFor('(()=>{const u=Silk.caravanUI.test.ui;return u.game&&!u.preparing&&u.prepared})()', 15000); await sleep(400);
    if (opened) { await clickText('试玩'); await sleep(300); for (let i = 0; i < 3; i++) { const m = await ev('(()=>{const m=document.querySelector("section.modal-panel");return m&&!m.hidden&&m.offsetParent!==null?m.innerText:""})()'); if (/仍要继续/.test(m)) { await clickText('仍要继续'); await busyWait(); await sleep(200); } else break; } await waitFor('(()=>{const d=Silk.caravanUI.test.data();return d&&d.state==="GAMEPLAY"})()', 15000); await sleep(400); }
    check('F caravan store opened in 敦煌 (试玩 run in GAMEPLAY)', opened && await ev('(()=>{const d=Silk.caravanUI.test.data();return !!d&&d.state==="GAMEPLAY"})()'), opened ? '' : await ev(`(()=>{const s=[...document.querySelectorAll("section.paper-panel")].filter(x=>!x.hidden&&x.offsetParent!==null).pop();const m=document.querySelector("section.modal-panel");return (m&&!m.hidden&&m.offsetParent!==null?'MODAL '+m.innerText.replace(/\s+/g,' ').slice(0,200)+' | ':'')+(s?s.innerText.replace(/\s+/g,' ').slice(0,300):document.body.innerText.replace(/\s+/g,' ').slice(0,300))})()`));
    const camel = await box('.caravan-shell .rig .camel'), bag = await box('.caravan-shell .bag.left'), slot = await box('.caravan-shell .bag.left .slot.l0');
    check('F caravan camel: width from height (1:1) — visible instead of collapsing to 0 width', camel && camel.w > 100 && ratioOk(camel, 1, 1, 'width'), JSON.stringify(camel));
    check('F caravan bag: height from width (100:130) — the saddlebag is clickable instead of 0 px tall', bag && bag.h > 60 && ratioOk(bag, 100, 130, 'height'), JSON.stringify(bag));
    check('F caravan slot: square from width', slot && slot.h > 10 && ratioOk(slot, 1, 1, 'height'), JSON.stringify(slot));
    const firstCargo = await ev(`(()=>{const e=document.querySelector('.caravan-shell .cargo');return e?e.dataset.id:null})()`);
    if (firstCargo) { await ev(`document.querySelector('.caravan-shell .cargo[data-id="${firstCargo}"]').click()`); await sleep(120); await ev(`document.querySelector('.caravan-shell .bag.left').click()`); await sleep(300); }
    const item = await box('.caravan-shell .bag.left .bag-item');
    check('F caravan bag item placed through the sized bag: square from width', item && item.h > 10 && ratioOk(item, 1, 1, 'height'), JSON.stringify(item));
    const tiers = await ev(`(()=>{const w=document.querySelector('.caravan-shell .waiting');if(!w)return null;const cs=getComputedStyle(w);return {display:cs.display,gridGap:cs.gridColumnGap||cs.columnGap}})()`);
    check('F caravan waiting grid keeps its column gap (grid-gap fallback written before gap)', tiers && tiers.display === 'grid' && tiers.gridGap === '4px', JSON.stringify(tiers));
    check('F caravan: no horizontal overflow', (await overflow()) <= 0, await overflow()); await shot('caravan-fallback');
    if (staged) {
      const sheets = await ev(`[...document.styleSheets].map(s=>{let n=0,g=0,h=0;try{for(const r of s.cssRules){n++;if(r.selectorText&&/no-flex-gap .caravan-shell/.test(r.selectorText))g++;const t=(r.cssText||'').replace(/url\\([^)]*\\)/g,'');if(/#[0-9a-f]{8}(?![0-9a-f])|#[0-9a-f]{4}(?![0-9a-f])/i.test(t))h++}}catch(e){n=-1}return {href:(s.href||'inline').split('/').pop(),rules:n,generated:g,hexAlpha:h}})`);
      const caravan = sheets.find(x => x.href === 'caravan.css');
      check('G staged caravan.css ships generated .no-flex-gap fallbacks', caravan && caravan.generated >= 15, JSON.stringify(caravan));
      check('G staged stylesheets carry no hex colours with alpha (all rgba)', sheets.filter(x => x.href.endsWith('.css')).every(x => x.hexAlpha === 0), JSON.stringify(sheets));
    }
    // console errors
    const cons = c.console.filter(m => m.type === 'error' || m.type === 'exception'); check('H no console errors on the fallback path', cons.length === 0, JSON.stringify(cons.slice(0, 3)));
  } catch (e) { errors.push(String(e && e.stack || e)); console.log('ERROR ' + e); try { await shot('error'); } catch (_) { } }
  const passed = checks.filter(k => k.ok).length;
  fs.writeFileSync(path.join(outDir, 'REPORT.json'), JSON.stringify({ label, serveRoot, staged, checks, errors, passed, total: checks.length }, null, 2));
  console.log(`compat fallbacks (${label}): ${passed}/${checks.length}` + (errors.length ? ' + ' + errors.length + ' error(s)' : ''));
  await c.close(); srv.stop();
  process.exit(passed === checks.length && !errors.length ? 0 : 1);
})();
