'use strict';
// B7 TOD Formal Runtime Integration v0.1 — acceptance inside the real game (headless Chrome, ANGLE / SwiftShader WebGL, mobile emulation).
//   • Noon fidelity in the real B7 scene: the TOD canvas frame (canvas.toDataURL, native 720×1600) vs the layer reconstruction — khotan /
//     changan diff 0; dunhuang v1.1: city + title outside the protect mask diff 0 (sky graded by the approved config); all nine states vs the
//     approved previews ≤ 1/255
//   • geometry: scene world box, .city-background box, every hotspot box, HUD box and the five-window vars are identical with TOD off (static
//     image) and on (canvas) at four viewports; every hotspot is hit-testable above the background and a real click gives the same result
//     (panel / 敬请期待 modal) with TOD on as with TOD off, in all three phases; HUD unfiltered; five windows open / close; a modal's backdrop, not
//     the canvas, receives the pointer; the canvas has pointer-events none
//   • real world time: inn.wait (a legal game command, from the real saved state) advances the tick by one → the renderer transitions
//     morning → noon → dusk (config 2.0 s smoothstep, intermediate frames), ends exactly on the instant frame; S.time.advance is called once
//     per command; two commands back to back converge on the latest phase; debug override never writes time
//   • city switching (incl. a three-city race), reset / re-enter, leak check (renderers / textures), rollback (TOD off → image, hotspots and time
//     untouched → on again), simulated asset failure → static image, no console errors
// Evidence (runtime frames, viewport screenshots, JSON) → tests/results/evidence/tod-integration-<label>/
// Usage: node tests/browser/tod-integration-run.js [label] [--root <dir>] [--port <http>] [--cdp <port>]
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const { launch, startServer, sleep } = require('../tools/cdp');
const root = path.join(__dirname, '..', '..');
const argv = process.argv.slice(2), flag = n => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const label = argv.find((a, i) => !a.startsWith('--') && (i === 0 || !argv[i - 1].startsWith('--'))) || 'source';
const serveRoot = flag('--root') ? path.resolve(flag('--root')) : root;
const outDir = path.join(root, 'tests', 'results', 'evidence', 'tod-integration-' + label); fs.rmSync(outDir, { recursive: true, force: true }); for (const d of ['runtime', 'shots']) fs.mkdirSync(path.join(outDir, d), { recursive: true });
const CITIES = ['changan', 'dunhuang', 'khotan'], PHASES = ['morning', 'noon', 'dusk'], NAMES = { changan: '长安', dunhuang: '敦煌', khotan: '于阗' };
const PREVIEW = { khotan: 'v1', changan: 'v1', dunhuang: 'v1.1' }, CONFIGS = { khotan: 'B7_khotan_tod_config_v1.json', changan: 'B7_changan_tod_config_v1.json', dunhuang: 'B7_dunhuang_tod_config_v1.1.json' };
const checks = []; const check = (name, ok, detail) => { checks.push({ name, ok: Boolean(ok), detail: detail === undefined ? '' : String(detail).slice(0, 700) }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  ' + String(detail).slice(0, 240) : '')); };
function decodePNG(buf) { // 8-bit gray / RGB / gray+alpha / RGBA, non-interlaced
  let pos = 8; const chunks = []; let w = 0, h = 0, ct = 0;
  while (pos < buf.length) { const len = buf.readUInt32BE(pos), type = buf.toString('ascii', pos + 4, pos + 8), data = buf.subarray(pos + 8, pos + 8 + len); if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ct = data[9]; } if (type === 'IDAT') chunks.push(data); pos += 12 + len; }
  const bpp = { 0: 1, 2: 3, 4: 2, 6: 4 }[ct], raw = zlib.inflateSync(Buffer.concat(chunks)), stride = w * bpp, out = Buffer.alloc(w * h * bpp); let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) { const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), cur = Buffer.alloc(stride);
    for (let i = 0; i < stride; i++) { const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0; let v = line[i]; if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1; else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; } cur[i] = v & 255; }
    cur.copy(out, y * stride); prev = cur; }
  return { w, h, bpp, data: out };
}
const px = (img, i, c) => img.data[i * img.bpp + (img.bpp === 1 ? 0 : c)];
function diffImages(A, B, region) { if (!A || !B) return { max: 255, px_nonzero: -1, missing: true }; let max = 0, nz = 0, gt1 = 0, sum = 0, n = 0; for (let i = 0; i < A.w * A.h; i++) { if (region && !region(i)) continue; n++; const d = Math.max(Math.abs(px(A, i, 0) - px(B, i, 0)), Math.abs(px(A, i, 1) - px(B, i, 1)), Math.abs(px(A, i, 2) - px(B, i, 2))); if (d > max) max = d; if (d) nz++; if (d > 1) gt1++; sum += d; } return { max, px_nonzero: nz, px_gt1: gt1, mean: n ? +(sum / n).toFixed(4) : 0, n }; }
const load = f => decodePNG(fs.readFileSync(f));
(async () => {
  const port = Number(flag('--port')) || 8399, srv = startServer(port, serveRoot); await sleep(500);
  const c = await launch({ port: Number(flag('--cdp')) || 9699, width: 390, height: 844, mobile: true, gpu: true });
  const ev = js => c.eval(js);
  const mouse = async (type, x, y) => c.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: type === 'mouseMoved' ? 0 : 1, pointerType: 'mouse' });
  const click = async (x, y) => { await mouse('mousePressed', x, y); await sleep(30); await mouse('mouseReleased', x, y); };
  const clickText = text => ev(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>!b.disabled&&b.offsetParent!==null&&b.textContent.trim()===${JSON.stringify(text)});if(!b)return false;b.click();return true})()`);
  const snap = () => ev('Silk.tod.snapshot()');
  const waitReady = async (ms = 8000) => { const t0 = Date.now(); let s = await snap(); while (Date.now() - t0 < ms && !(s.ready && !s.animating)) { await sleep(60); s = await snap(); } return s; };
  const waitIdle = async (ms = 6000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (!(await ev('Silk.app.busy||Silk.ui.getState().blockingModalCount>0'))) return true; await sleep(80); } return false; };
  // render-only world override (city / tick on the live state object) — enough for fidelity / geometry / panel checks; a real dispatch rebuilds the state from the store
  const setWorld = async (city, tick) => { await ev(`(()=>{const p=Silk.app.state.progress;p.world.city=${JSON.stringify(city)};p.world.tick=${tick};Silk.ui.render(Silk.app.state);})()`); };
  const tickFor = (phase, day = 20) => day * 3 + PHASES.indexOf(phase);
  const frame = async file => { const url = await ev('Silk.tod.frameDataURL()'); if (!url) return null; const b = Buffer.from(url.split(',')[1], 'base64'); if (file) fs.writeFileSync(file, b); return decodePNG(b); };
  const geometry = () => ev(`(()=>{const r=e=>{if(!e)return null;const b=e.getBoundingClientRect();return [b.x,b.y,b.width,b.height].map(v=>Math.round(v*100)/100)};const bg=document.querySelector('.city-scene .city-background');const cs=bg?getComputedStyle(bg):null;const hots={};for(const h of document.querySelectorAll('.city-hotspot'))hots[h.dataset.hotspot]=r(h);const rootEl=document.getElementById('game-root');const hud=document.querySelector('.global-hud');
    return {bgTag:bg?bg.tagName:null,bg:r(bg),bgPointer:cs?cs.pointerEvents:null,bgFit:cs?cs.objectFit:null,bgFilter:cs?cs.filter:null,world:r(document.querySelector('.scene-world')),scene:r(document.querySelector('.city-scene')),hots,hud:r(hud),hudFilter:hud?getComputedStyle(hud).filter:null,win:[rootEl.style.getPropertyValue('--window-top'),rootEl.style.getPropertyValue('--window-bottom')],imgs:[...document.querySelectorAll('.city-scene img.city-background')].map(i=>({src:i.getAttribute('src'),hidden:i.hidden})),canvases:document.querySelectorAll('.city-scene canvas.city-background').length}})()`);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const dismissGuide = async () => { for (let i = 0; i < 5; i++) { const closed = await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>!b.disabled&&b.offsetParent!==null&&/自行探索|知道了|关闭|返回/.test(b.textContent.trim()));if(!b)return false;b.click();return true})()`); if (!closed) break; await sleep(250); } };
  const cleanup = async () => { for (let g = 0; g < 6 && await ev('(()=>{const p=Silk.app.state.progress;const s=Silk.ui.getState();return Boolean(s.primary||s.secondary||s.blockingModalCount||(p&&p.presentation&&p.presentation.activeResult))})()'); g++) { await ev("(async()=>{const p=Silk.app.state.progress;const r=p&&p.presentation&&p.presentation.activeResult;if(r){await Silk.ui.dispatch('result.ack',{resultId:r.id});}Silk.ui.closeSecondary();Silk.ui.closePanel();Silk.ui.dismissModal();})()"); await sleep(250); await waitIdle(6000); } };
  const ackResult = async () => { await ev("(async()=>{const p=Silk.app.state.progress;const r=p&&p.presentation&&p.presentation.activeResult;if(r)await Silk.ui.dispatch('result.ack',{resultId:r.id});})()"); await waitIdle(4000); };
  const freshGame = async () => { if (await ev('Boolean(Silk.app.state.progress)')) { await cleanup(); await ev("Silk.ui.dispatch('game.reset')"); const t0 = Date.now(); while (Date.now() - t0 < 5000 && await ev('Boolean(Silk.app.state.progress)')) await sleep(100); }
    await clickText('启程'); const t0 = Date.now(); while (Date.now() - t0 < 6000 && !(await ev('Boolean(Silk.app.state.progress&&Silk.app.state.progress.world)'))) await sleep(100); await sleep(300); await dismissGuide(); };
  // click every hotspot once and record what it opens (panel id / modal title), restoring the render-only world after each click (market / 出发 dispatch and rebuild the state)
  const clickHotspots = async (city, tick) => {
    const ids = await ev('[...document.querySelectorAll(".city-hotspot")].map(h=>h.dataset.hotspot)'); const results = [];
    for (const id of ids) {
      await setWorld(city, tick); await sleep(120);
      const h = await ev(`(()=>{const h=document.querySelector('.city-hotspot[data-hotspot=${JSON.stringify(id)}]');const b=h.getBoundingClientRect();const cx=b.x+b.width/2,cy=b.y+b.height/2;const e=document.elementFromPoint(cx,cy);return {cx,cy,hit:e===h||h.contains(e),top:e?e.tagName+'.'+e.className:null}})()`);
      await click(h.cx, h.cy); await sleep(350); await waitIdle(4000);
      const st = await ev('(()=>{const s=Silk.ui.getState();const m=document.querySelector(".modal-layer");const mt=m&&!m.hidden?(m.querySelector("h2")||{}).textContent:null;return {primary:s.primary,modal:mt}})()');
      results.push({ id, hit: h.hit, top: h.top, opened: st.primary || (st.modal ? 'modal:' + st.modal : null) });
      if (st.primary) await ev('Silk.ui.closePanel()'); if (st.modal) await ev('Silk.ui.dismissModal()'); await sleep(200); await waitIdle(6000);
      for (let g = 0; g < 3 && await ev('Silk.ui.getState().primary||Silk.ui.getState().blockingModalCount'); g++) { await ev('Silk.ui.closePanel();Silk.ui.dismissModal();'); await sleep(200); await waitIdle(6000); }
    }
    return results;
  };
  const report = { label, serveRoot, cities: {}, geometry: {}, hotspots: {}, time: {}, perf: {}, checks };
  try {
    await c.navigate('http://127.0.0.1:' + port + '/'); await sleep(900); await ev('new Promise(r=>{const t=setInterval(()=>{if(window.Silk&&Silk.app&&Silk.app.state&&Silk.tod){clearInterval(t);r()}},100)})');
    await ev("localStorage.removeItem('silkroad.tod.enabled')"); await freshGame();
    const gl = await ev('(()=>{const cv=document.createElement("canvas");const g=cv.getContext("webgl");if(!g)return null;const d=g.getExtension("WEBGL_debug_renderer_info");return d?g.getParameter(d.UNMASKED_RENDERER_WEBGL):g.getParameter(g.RENDERER)})()');
    check('WebGL available (headless ANGLE / SwiftShader)', Boolean(gl), gl);
    const s0 = await waitReady(); const realTick0 = await ev('Silk.app.state.progress.world.tick');
    check('TOD attached to the real B7 scene on first entry (changan), enabled by default, first frame at the real phase, no override', s0.enabled && s0.ready && s0.city === 'changan' && s0.phase === PHASES[realTick0 % 3] && s0.override === null, JSON.stringify({ city: s0.city, phase: s0.phase, realPhase: s0.realPhase, loadMs: s0.status.lastLoadMs, textures: s0.textures }));
    // ---------------- geometry: TOD off (static image) vs on (canvas) at four viewports, per city
    for (const city of CITIES) {
      report.geometry[city] = {};
      for (const [vw, vh] of [[390, 844], [375, 667], [430, 932], [360, 780]]) {
        await c.send('Emulation.setDeviceMetricsOverride', { width: vw, height: vh, deviceScaleFactor: 2, mobile: true, screenWidth: vw, screenHeight: vh }); await sleep(120);
        await ev('Silk.tod.setEnabled(false)'); await setWorld(city, tickFor('noon')); await sleep(250); const off = await geometry();
        await ev('Silk.tod.setEnabled(true)'); await setWorld(city, tickFor('noon')); await waitReady(); await sleep(120); const on = await geometry();
        const equal = ['bg', 'world', 'scene', 'hots', 'hud', 'win'].every(k => same(off[k], on[k]));
        check(`${NAMES[city]} ${vw}×${vh}: scene / background / ${Object.keys(on.hots).length} hotspots / HUD / window vars identical with TOD off (IMG) and on (CANVAS); canvas pointer-events none, object-fit contain, no filter`, equal && off.bgTag === 'IMG' && on.bgTag === 'CANVAS' && on.bgPointer === 'none' && on.bgFit === 'contain' && on.bgFilter === 'none' && on.hudFilter === 'none' && on.canvases === 1 && on.imgs.length === 1 && on.imgs[0].hidden === true && off.imgs[0].hidden === false, JSON.stringify({ off: { bg: off.bg, hots: off.hots }, on: { bg: on.bg, hots: on.hots, imgs: on.imgs } }));
        report.geometry[city][vw + 'x' + vh] = { off, on };
      }
    }
    await c.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true, screenWidth: 390, screenHeight: 844 }); await sleep(120);
    // ---------------- per city × phase: fidelity, hotspot clicks (TOD off baseline vs on), HUD, windows, modal, screenshots
    const instantFrames = {};
    for (const city of CITIES) {
      report.cities[city] = {}; report.hotspots[city] = {};
      const cfgFiles = JSON.parse(fs.readFileSync(path.join(root, 'tod-prototype', 'config', CONFIGS[city]), 'utf8')).asset.files;
      const A = path.join(root, 'tod-prototype', 'assets', city), recon = load(path.join(A, cfgFiles.recon)), sky = load(path.join(A, cfgFiles.sky)), mask = load(path.join(A, cfgFiles.mask));
      const outsideMask = i => sky.data[i * 4 + 3] <= 127 && mask.data[i] < 128;
      for (const phase of PHASES) {
        const tick = tickFor(phase);
        await ev('Silk.tod.setEnabled(false)'); await setWorld(city, tick); await sleep(200); const base = await clickHotspots(city, tick);
        await ev('Silk.tod.setEnabled(true)'); await setWorld(city, tick); const s = await waitReady(); await sleep(100);
        const f = await frame(path.join(outDir, 'runtime', `${city}_${phase}.png`)); instantFrames[city + phase] = f;
        const prev = load(path.join(root, 'tod-prototype', 'reference', 'previews', `B7_${city}_tod_${phase}_${PREVIEW[city]}.png`)); const dPrev = diffImages(f, prev);
        const dRecon = diffImages(f, recon), dOut = diffImages(f, recon, outsideMask);
        report.cities[city][phase] = { phase: s.phase, realPhase: s.realPhase, vsReconstruction: dRecon, cityTitleOutsideMask: dOut, vsApprovedPreview: dPrev, loadMs: s.status.lastLoadMs };
        check(`${NAMES[city]} ${phase}: renderer phase = real world-time phase, config ${s.city}, 5 textures, no override`, s.phase === phase && s.realPhase === phase && s.city === city && s.textures === 5 && s.override === null, JSON.stringify({ phase: s.phase, real: s.realPhase }));
        if (phase === 'noon') {
          if (city === 'dunhuang') check(`敦煌 Noon fidelity (v1.1 rule): city + title outside the protect mask = reconstruction, max ${dOut.max} px≠0 ${dOut.px_nonzero} (of ${dOut.n}); sky graded by the approved config (whole frame max ${dRecon.max})`, dOut.max === 0 && dOut.px_nonzero === 0, JSON.stringify({ dOut, dRecon }));
          else check(`${NAMES[city]} Noon fidelity: real-scene canvas frame = layer reconstruction pixel for pixel (max ${dRecon.max}, px≠0 ${dRecon.px_nonzero})`, dRecon.max === 0 && dRecon.px_nonzero === 0, JSON.stringify(dRecon));
        }
        check(`${NAMES[city]} ${phase}: frame vs approved preview max ${dPrev.max}/255, px>1 ${dPrev.px_gt1}, mean ${dPrev.mean}`, dPrev.max <= 1, JSON.stringify(dPrev));
        await c.screenshot(path.join(outDir, 'shots', `${city}_${phase}_390x844.png`));
        const withTod = await clickHotspots(city, tick); report.hotspots[city][phase] = { base, withTod };
        const sameResults = base.length === withTod.length && base.every((b, i) => b.id === withTod[i].id && b.opened === withTod[i].opened);
        check(`${NAMES[city]} ${phase}: ${withTod.length} hotspots hit-testable above the TOD canvas and real clicks open the same targets as with TOD off (${withTod.map(h => h.id + '→' + h.opened).join(', ')})`, sameResults && withTod.every(h => h.hit && h.opened), JSON.stringify({ base: base.map(h => [h.id, h.opened]), withTod: withTod.map(h => [h.id, h.hit, h.opened]) }));
        await setWorld(city, tick); await waitReady();
      }
      const hudCheck = await ev('(()=>{const hud=document.querySelector(".global-hud");const cs=getComputedStyle(hud);const tools=[...document.querySelectorAll(".hud-tool")].map(t=>t.textContent.trim());const time=document.querySelector(".time-status");const b=document.querySelector(".hud-tool").getBoundingClientRect();const e=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);return {filter:cs.filter,opacity:cs.opacity,visible:!hud.hidden&&hud.getBoundingClientRect().height>0,tools,time:time?time.textContent.trim():null,onTop:!!e&&e.closest(".global-hud")!==null}})()');
      check(`${NAMES[city]} HUD intact over the TOD background: visible, unfiltered, five tools, time module, on top`, hudCheck.visible && hudCheck.filter === 'none' && hudCheck.opacity === '1' && hudCheck.tools.length === 5 && hudCheck.time && hudCheck.onTop, JSON.stringify(hudCheck));
      let winOk = 0; for (const id of ['pack', 'commission', 'message', 'merchant_business', 'more']) { await ev(`Silk.ui.openPanel(${JSON.stringify(id)})`); await sleep(250); const w = await ev('(()=>{const l=document.querySelector(".primary-layer");const b=l.querySelector(".paper-panel");return {hidden:l.hidden,id:b.dataset.panelId,h:b.getBoundingClientRect().height,bodyChildren:b.querySelector(".panel-body").childElementCount}})()'); if (!w.hidden && w.id === id && w.h > 200) winOk++; else check(`${NAMES[city]} window ${id} opens`, false, JSON.stringify(w)); await ev('Silk.ui.closePanel()'); await sleep(150); }
      check(`${NAMES[city]} five HUD windows open and close over the TOD background (${winOk}/5)`, winOk === 5 && (await ev('document.querySelector(".primary-layer").hidden')));
      await ev("Silk.ui.showModal({title:'TOD 测试弹窗',body:'遮罩阻断',actions:[{label:'返回',run:()=>Silk.ui.dismissModal()}]})"); await sleep(250);
      const modal = await ev('(()=>{const l=document.querySelector(".modal-layer");const hot=document.querySelector(".city-hotspot");const b=hot.getBoundingClientRect();const e=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);const bg=document.querySelector(".city-scene .city-background");return {hidden:l.hidden,isBackdropOrModal:!!e&&(e.closest(".modal-layer")!==null),bgIsCanvas:bg&&bg.tagName==="CANVAS",count:Silk.ui.getState().blockingModalCount}})()');
      await ev('Silk.ui.dismissModal()'); await sleep(200);
      check(`${NAMES[city]} modal: backdrop receives the pointer above a hotspot, background canvas untouched`, !modal.hidden && modal.isBackdropOrModal && modal.bgIsCanvas && modal.count === 1 && (await ev('Silk.ui.getState().blockingModalCount')) === 0, JSON.stringify(modal));
    }
    // ---------------- city switching race, many switches, reset / re-enter, leaks (render-only world updates)
    await ev(`(()=>{const p=Silk.app.state.progress;for(const c of ['changan','dunhuang','khotan']){p.world.city=c;p.world.tick=${tickFor('dusk')};Silk.ui.render(Silk.app.state);}})()`);
    const sRace = await waitReady(); const fRace = await frame(); const dRace = diffImages(fRace, instantFrames.khotandusk);
    check(`rapid three-city switch (changan → dunhuang → khotan before any load finished): final scene is khotan dusk, stale loads dropped (max ${dRace.max}), one live renderer`, sRace.city === 'khotan' && sRace.phase === 'dusk' && dRace.max === 0 && sRace.textures === 5 && sRace.status.renderers - sRace.status.disposes === 1, JSON.stringify({ city: sRace.city, phase: sRace.phase, status: sRace.status }));
    for (let i = 0; i < 12; i++) { await setWorld(CITIES[i % 3], tickFor(PHASES[i % 3])); await waitReady(); }
    const st1 = await ev('({r:Silk.tod.status.renderers,d:Silk.tod.status.disposes,t:Silk.tod.snapshot().textures,canvases:document.querySelectorAll("canvas.city-background").length,imgs:document.querySelectorAll("img.city-background").length})');
    check(`12 city switches: exactly one renderer alive (renderers − disposes = ${st1.r} − ${st1.d}), 5 textures, one canvas + one hidden image in the DOM`, st1.r - st1.d === 1 && st1.t === 5 && st1.canvases === 1 && st1.imgs === 1, JSON.stringify(st1));
    await cleanup(); await ev("Silk.ui.dispatch('game.reset')"); { const t = Date.now(); while (Date.now() - t < 5000 && await ev('Boolean(Silk.app.state.progress)')) await sleep(100); } await sleep(300);
    const afterReset = await ev('({scene:Silk.tod.snapshot().city,start:!document.querySelector(".start-screen").hidden,r:Silk.tod.status.renderers,d:Silk.tod.status.disposes})');
    await clickText('启程'); { const t = Date.now(); while (Date.now() - t < 6000 && !(await ev('Boolean(Silk.app.state.progress&&Silk.app.state.progress.world)'))) await sleep(100); } await sleep(300); await dismissGuide();
    const sRe = await waitReady(); const fRe = await frame(); const dRe = diffImages(fRe, instantFrames['changan' + sRe.phase]);
    check(`reset → start screen releases the renderer (renderers ${afterReset.r} = disposes ${afterReset.d}); 启程 re-enters changan at the real phase ${sRe.phase} with a fresh renderer (frame = instant frame, max ${dRe.max})`, afterReset.scene === null && afterReset.start && afterReset.r === afterReset.d && sRe.ready && sRe.city === 'changan' && dRe.max === 0, JSON.stringify({ afterReset, sRe: [sRe.city, sRe.phase] }));
    // ---------------- rollback: TOD off → static image, hotspots / time untouched; on again; simulated asset failure → image
    await setWorld('dunhuang', tickFor('dusk')); await waitReady(); const gOn = await geometry(); const tickR = await ev('Silk.app.state.progress.world.tick');
    await ev('Silk.tod.setEnabled(false)'); await sleep(200); const gOff = await geometry(); const sOff = await snap();
    check(`rollback: Silk.tod.setEnabled(false) removes the canvas in place — static image ${gOff.imgs[0] && gOff.imgs[0].src} visible, hotspots / boxes identical, no renderer, tick ${tickR} unchanged, persisted`, gOff.bgTag === 'IMG' && gOff.imgs[0] && !gOff.imgs[0].hidden && /B7_city_dunhuang_bg_v01/.test(gOff.imgs[0].src) && gOff.canvases === 0 && same(gOn.hots, gOff.hots) && same(gOn.bg, gOff.bg) && !sOff.enabled && sOff.city === null && (await ev('Silk.app.state.progress.world.tick')) === tickR && (await ev("localStorage.getItem('silkroad.tod.enabled')")) === '0', JSON.stringify({ gOff: { bgTag: gOff.bgTag, imgs: gOff.imgs, canvases: gOff.canvases }, sOff: sOff.status }));
    await c.screenshot(path.join(outDir, 'shots', 'rollback_dunhuang_static_390x844.png'));
    await ev('Silk.tod.setEnabled(true)'); const sOn = await waitReady(); const fOn = await frame(); const dOn = diffImages(fOn, instantFrames.dunhuangdusk);
    check(`TOD on again: renderer re-attached, frame = instant dusk (max ${dOn.max}), persisted`, sOn.enabled && sOn.ready && sOn.city === 'dunhuang' && dOn.max === 0 && (await ev("localStorage.getItem('silkroad.tod.enabled')")) === '1', JSON.stringify(sOn.status));
    await ev('Silk.tod._test.failNext=true;Silk.ui.resetScene();Silk.ui.render(Silk.app.state)'); await sleep(600); const gFail = await geometry(); const sFail = await snap();
    check(`simulated asset failure: static image shown (fallback '${sFail.status.fallback}'), hotspots identical, no renderer, error diagnosed`, gFail.bgTag === 'IMG' && !gFail.imgs[0].hidden && gFail.canvases === 0 && sFail.status.fallback === 'load-failed' && /simulated/.test(sFail.status.error || '') && same(gOn.hots, gFail.hots), JSON.stringify({ status: sFail.status }));
    await ev('Silk.ui.resetScene();Silk.ui.render(Silk.app.state)'); const sBack = await waitReady(); check('next scene rebuild recovers the TOD renderer', sBack.ready && sBack.city === 'dunhuang', JSON.stringify(sBack.status));
    // ---------------- continuous phase updates (render path, world-time index read on every render): morning → noon → dusk with the second update mid-transition
    await setWorld('khotan', tickFor('morning')); await waitReady(); const kM = instantFrames.khotanmorning, kN = instantFrames.khotannoon, kD = instantFrames.khotandusk;
    await setWorld('khotan', tickFor('noon')); await sleep(400); const cm = await snap(); await setWorld('khotan', tickFor('dusk')); await sleep(200); const cm2 = await snap();
    const cs2 = await waitReady(); const cF = await frame(path.join(outDir, 'runtime', 'khotan_continuous_dusk.png')); const dC = diffImages(cF, kD);
    check(`continuous updates: second phase change issued mid-transition (animating ${cm.animating}, target ${cm.phase} → ${cm2.phase}) converges on the latest phase; final = instant dusk frame (max ${dC.max})`, cm.animating && cm.phase === 'noon' && cm2.phase === 'dusk' && cm2.animating && cs2.phase === 'dusk' && dC.max === 0, JSON.stringify({ cm: [cm.phase, cm.animating], cm2: [cm2.phase, cm2.animating] }));
    await setWorld('khotan', tickFor('dusk')); const sSame = await snap(); check('same phase rendered again: no animation restarted', !sSame.animating && sSame.phase === 'dusk', JSON.stringify([sSame.phase, sSame.animating]));
    // debug override: renderer only, never time
    const tickBefore = await ev('Silk.app.state.progress.world.tick'); await ev("Silk.tod.setOverride('morning')"); const so = await waitReady(); const fo = await frame(); const dO = diffImages(fo, kM);
    await ev('Silk.tod.setOverride(null)'); const sr = await waitReady(); const fr = await frame(); const dR = diffImages(fr, kD); const tickAfter = await ev('Silk.app.state.progress.world.tick');
    check(`debug override: 'morning' renders morning instantly (max ${dO.max}) while the real phase stays dusk; clearing it re-reads the real phase at once (max ${dR.max}); tick untouched (${tickBefore} → ${tickAfter})`, so.phase === 'morning' && so.realPhase === 'dusk' && dO.max === 0 && sr.phase === 'dusk' && sr.override === null && dR.max === 0 && tickBefore === tickAfter, JSON.stringify({ so: [so.phase, so.realPhase], sr: [sr.phase, sr.realPhase] }));
    // ---------------- real world time from the real saved state (changan, tick 0 = 晨): inn.wait → transition morning → noon; spy counts S.time.advance
    await freshGame(); const sT = await waitReady(); const tickA = await ev('Silk.app.state.progress.world.tick');
    check('real saved state after 启程: changan at 晨 (tick ' + tickA + '), TOD ready at morning', sT.city === 'changan' && tickA % 3 === 0 && sT.phase === 'morning', JSON.stringify([sT.city, sT.phase]));
    await ev('(()=>{const orig=Silk.time.advance;window.__origAdvance=orig;window.__advCalls=[];Silk.time.advance=function(p,count,ctx){window.__advCalls.push({count,reason:ctx&&ctx.reason,before:p.world.tick});return orig.apply(this,arguments)};})()');
    const morningF = instantFrames.changanmorning, noonF = instantFrames.changannoon;
    const t0 = Date.now(); await ev("Silk.ui.dispatch('inn.wait',{ticks:1},undefined,undefined,true)"); const samples = [];
    while (Date.now() - t0 < 2800) { const s = await snap(); const f = await frame(); if (f) samples.push({ t: Date.now() - t0, animating: s.animating, sb: s.live ? +s.live.sky.brightness.toFixed(3) : null, vsMorning: diffImages(f, morningF).mean, vsNoon: diffImages(f, noonF).mean, frames: s.frames, lastFrameMs: s.lastFrameMs }); if (!s.animating && samples.length > 2) break; await sleep(150); }
    const s1 = await waitReady(); const endF = await frame(path.join(outDir, 'runtime', 'changan_after-inn-wait_noon.png')); const dEnd = diffImages(endF, noonF);
    const tick1 = await ev('Silk.app.state.progress.world.tick'), adv = await ev('window.__advCalls'); await ev('Silk.time.advance=window.__origAdvance');
    const mids = samples.filter(x => x.animating && x.vsMorning > 0 && x.vsNoon > 0);
    check(`real time: inn.wait advanced the tick by 1 (${tickA} → ${tick1}), S.time.advance called once (${JSON.stringify(adv)}), renderer morning → noon by transition: ${samples.length} samples, ${mids.length} intermediate, final frame = instant noon frame (max ${dEnd.max})`, tick1 === tickA + 1 && adv.length === 1 && adv[0].count === 1 && s1.phase === 'noon' && s1.realPhase === 'noon' && mids.length >= 2 && dEnd.max === 0 && mids.every((m, i) => i === 0 || m.vsMorning >= mids[i - 1].vsMorning - 0.5), JSON.stringify({ samples: samples.map(x => [x.t, x.animating, x.sb, x.vsMorning, x.vsNoon, x.lastFrameMs]) }));
    report.time.transition = { samples, endDiff: dEnd, advCalls: adv, afterCommand: await ev('(()=>{const s=Silk.ui.getState();return {primary:s.primary,tick:Silk.app.state.progress.world.tick}})()') };
    report.perf = { loadMs: Object.fromEntries(CITIES.map(city => [city, report.cities[city].noon.loadMs])), transitionFrameMs: report.time.transition.samples.map(s => s.lastFrameMs), gl };
    const errs = c.console.filter(m => m.type === 'error' || m.type === 'exception').map(m => m.text.slice(0, 200)), non200 = c.network.filter(n => n.status !== 200 && n.status !== 304).map(n => n.url + ' ' + n.status);
    check('no console errors, no failed requests', errs.length === 0 && non200.length === 0, JSON.stringify({ errs: errs.slice(0, 3), non200: non200.slice(0, 3) }));
  } catch (e) { check('script error', false, String(e && e.stack || e)); }
  fs.writeFileSync(path.join(outDir, 'integration.json'), JSON.stringify(report, null, 1));
  await c.close(); srv.stop();
  const failed = checks.filter(x => !x.ok);
  console.log('\n' + (checks.length - failed.length) + '/' + checks.length + ' checks passed' + (failed.length ? ' — FAILED: ' + failed.slice(0, 8).map(f => f.name).join(' | ') : ''));
  process.exit(failed.length ? 1 : 0);
})();
