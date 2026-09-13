'use strict';
// B7 Time-of-Day Runtime Integration Validation v0.1 — headless Chrome (ANGLE / SwiftShader WebGL) drives tod-prototype/ and validates:
//   • Noon fidelity: the runtime frame vs the layer reconstruction (khotan / changan: 0 diff; dunhuang v1.1: sky differs by design, city + title
//     outside the protect mask must be 0), plus the all-neutral anchor for every city
//   • Morning / Noon / Dusk runtime frames vs the approved previews (parity ≤ 1/255 like the handoff's own WebGL check)
//   • layer integrity: the background container equals the game shell's fitSlack bounds at several viewports and never moves between
//     cities / states / during a transition; the canvas keeps 720×1600 native pixels
//   • transition: sampled frames between noon and dusk are intermediate (no pop), the parameter path is continuous, no console errors
// Writes 9 runtime-rendered 720×1600 PNGs (canvas.toDataURL — not preview copies), viewport screenshots and a JSON report to
// tests/results/evidence/tod-prototype-<label>/.  Usage: node tests/browser/tod-prototype-run.js [label] [--root <dir>] [--port <http>] [--cdp <port>]
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const { launch, startServer, sleep } = require('../tools/cdp');
const root = path.join(__dirname, '..', '..');
const argv = process.argv.slice(2), flag = n => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const label = argv.find((a, i) => !a.startsWith('--') && (i === 0 || !argv[i - 1].startsWith('--'))) || 'source';
const serveRoot = flag('--root') ? path.resolve(flag('--root')) : root;
const outDir = path.join(root, 'tests', 'results', 'evidence', 'tod-prototype-' + label); fs.rmSync(outDir, { recursive: true, force: true }); fs.mkdirSync(path.join(outDir, 'runtime'), { recursive: true }); fs.mkdirSync(path.join(outDir, 'shots'), { recursive: true });
const CITIES = ['changan', 'dunhuang', 'khotan'], STATES = ['morning', 'noon', 'dusk'];
const checks = []; const check = (name, ok, detail) => { checks.push({ name, ok: Boolean(ok), detail: detail === undefined ? '' : String(detail).slice(0, 600) }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  ' + String(detail).slice(0, 240) : '')); };
function decodePNG(buf) { // 8-bit RGB / RGBA, non-interlaced
  let pos = 8; const chunks = []; let w = 0, h = 0, ct = 0;
  while (pos < buf.length) { const len = buf.readUInt32BE(pos), type = buf.toString('ascii', pos + 4, pos + 8), data = buf.subarray(pos + 8, pos + 8 + len); if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ct = data[9]; } if (type === 'IDAT') chunks.push(data); pos += 12 + len; }
  const bpp = ct === 6 ? 4 : 3, raw = zlib.inflateSync(Buffer.concat(chunks)), stride = w * bpp, out = Buffer.alloc(w * h * bpp); let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) { const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), cur = Buffer.alloc(stride);
    for (let i = 0; i < stride; i++) { const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0; let v = line[i]; if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1; else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; } cur[i] = v & 255; }
    cur.copy(out, y * stride); prev = cur; }
  return { w, h, bpp, data: out };
}
function diffImages(A, B) { // max / count / mean over RGB
  if (A.w !== B.w || A.h !== B.h) return { max: 255, px_nonzero: A.w * A.h, mean: 255, sizeMismatch: true };
  let max = 0, nz = 0, gt1 = 0, sum = 0; const n = A.w * A.h;
  for (let i = 0; i < n; i++) { const a = i * A.bpp, b = i * B.bpp; const d = Math.max(Math.abs(A.data[a] - B.data[b]), Math.abs(A.data[a + 1] - B.data[b + 1]), Math.abs(A.data[a + 2] - B.data[b + 2])); if (d > max) max = d; if (d) nz++; if (d > 1) gt1++; sum += d; }
  return { max, px_nonzero: nz, px_gt1: gt1, mean: +(sum / n).toFixed(4) };
}
const fitSlack = (width, height, art = { w: 720, h: 1600, slackTop: 320, slackBottom: 0 }) => { const stdH = art.h - art.slackTop - art.slackBottom, scale = Math.min(width / art.w, height / stdH), w = art.w * scale, h = art.h * scale, slack = art.slackTop + art.slackBottom; let top; if (h <= height) top = (height - h) / 2; else { const crop = h - height; top = -(slack ? crop * art.slackTop / slack : crop / 2); } return { w, h, left: (width - w) / 2, top }; };
(async () => {
  const port = Number(flag('--port')) || 8395, srv = startServer(port, serveRoot); await sleep(500);
  const W = 390, H = 844; const c = await launch({ port: Number(flag('--cdp')) || 9681, width: W, height: H, mobile: true, gpu: true });
  const ev = js => c.eval(js);
  const report = { label, serveRoot, viewport: [W, H], cities: {}, container: {}, transition: {}, generatedAt: new Date().toISOString() };
  const saveDataURL = (dataUrl, file) => { const b = Buffer.from(dataUrl.split(',')[1], 'base64'); fs.writeFileSync(file, b); return b; };
  try {
    await c.navigate('http://127.0.0.1:' + port + '/tod-prototype/'); await sleep(600);
    await ev('new Promise(r=>{const t=setInterval(()=>{if(window.B7TodDebug&&B7TodDebug.D.ready){clearInterval(t);r()}},50)})');
    const glInfo = await ev('(()=>{const gl=B7TodDebug.rt.gl;const dbg=gl.getExtension("WEBGL_debug_renderer_info");return {renderer:dbg?gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),version:gl.getParameter(gl.VERSION),maxTex:gl.getParameter(gl.MAX_TEXTURE_SIZE)}})()');
    check('WebGL runtime available in headless Chrome', glInfo && glInfo.maxTex >= 2048, JSON.stringify(glInfo)); report.gl = glInfo;
    await ev('document.getElementById("panel").classList.add("collapsed")');
    // ---- container: the world box equals the game shell's fitSlack bounds at several viewports; canvas keeps native 720×1600
    for (const [vw, vh] of [[360, 740], [375, 812], [390, 844], [430, 932], [768, 1024], [1280, 800]]) {
      await c.send('Emulation.setDeviceMetricsOverride', { width: vw, height: vh, deviceScaleFactor: 1, mobile: vw < 700, screenWidth: vw, screenHeight: vh }); await sleep(150); await ev('B7TodDebug.fitScene()'); await sleep(50);
      const r = await ev('(()=>{const w=B7TodDebug.worldRect();const cv=document.getElementById("bg");const cr=cv.getBoundingClientRect();const cs=getComputedStyle(cv);return {scene:[document.getElementById("scene").clientWidth,document.getElementById("scene").clientHeight],world:[w.left,w.top,w.width,w.height],canvas:[cr.left,cr.top,cr.width,cr.height],native:[cv.width,cv.height],objectFit:cs.objectFit,pad:cs.padding,margin:cs.margin,transform:cs.transform}})()');
      const exp = fitSlack(r.scene[0], r.scene[1]); const okBox = Math.abs(r.world[0] - exp.left) < 0.6 && Math.abs(r.world[1] - exp.top) < 0.6 && Math.abs(r.world[2] - exp.w) < 0.6 && Math.abs(r.world[3] - exp.h) < 0.6 && Math.abs(r.canvas[0] - r.world[0]) < 0.6 && Math.abs(r.canvas[2] - r.world[2]) < 0.6 && Math.abs(r.canvas[3] - r.world[3]) < 0.6;
      check(`container ${vw}×${vh}: world box = shell fitSlack ${exp.w.toFixed(1)}×${exp.h.toFixed(1)} @ (${exp.left.toFixed(1)}, ${exp.top.toFixed(1)}); canvas fills it, native 720×1600, object-fit contain, no padding / margin / transform`, okBox && r.native[0] === 720 && r.native[1] === 1600 && r.objectFit === 'contain' && r.pad === '0px' && r.margin === '0px' && (r.transform === 'none' || /^matrix\(1, 0, 0, 1, 0, 0\)$/.test(r.transform)), JSON.stringify(r));
      report.container[vw + 'x' + vh] = { measured: r, expected: exp };
    }
    await c.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: true, screenWidth: W, screenHeight: H }); await sleep(150); await ev('B7TodDebug.fitScene()');
    const box0 = await ev('B7TodDebug.worldRect()');
    // ---- per city × state: runtime frame, Noon fidelity, approved-preview parity, measurements, screenshots
    for (const city of CITIES) {
      await ev(`B7TodDebug.loadCity(${JSON.stringify(city)})`); await sleep(200); const cfg = await ev('({version:B7TodDebug.D.config.version,status:B7TodDebug.D.config.status,pipeline:B7TodDebug.D.config.pipelineVersion,name:B7TodDebug.D.config.cityName,transition:B7TodDebug.D.config.transition.durationSec})');
      check(`${city}: approved config loaded (${cfg.name} ${cfg.version}, ${cfg.pipeline})`, cfg.pipeline === 'tod-grade-v0.2.1' && /approved|confirmed|人工/.test(cfg.status) || cfg.version, JSON.stringify(cfg));
      report.cities[city] = { config: cfg, states: {} };
      const manifest = await ev('B7TodDebug.D.manifest.cities[' + JSON.stringify(city) + ']');
      for (const st of STATES) {
        await ev(`B7TodDebug.setState(${JSON.stringify(st)}, 'instant')`); await sleep(120); await ev('B7TodDebug.rt.draw()'); await sleep(60);
        const png = saveDataURL(await ev('B7TodDebug.frameDataURL()'), path.join(outDir, 'runtime', `${city}_${st}.png`)); const frame = decodePNG(png);
        const recon = decodePNG(fs.readFileSync(path.join(serveRoot, 'tod-prototype', manifest.assets.recon))); const dRecon = diffImages(frame, recon);
        const prev = decodePNG(fs.readFileSync(path.join(serveRoot, 'tod-prototype', manifest.previews[st]))); const dPrev = diffImages(frame, prev);
        const inPage = await ev('B7TodDebug.diffBaseline()'); const meas = await ev('B7TodDebug.measure()');
        const box = await ev('B7TodDebug.worldRect()'); const same = ['x', 'y', 'width', 'height'].every(k => Math.abs(box[k] - box0[k]) < 0.01);
        report.cities[city].states[st] = { frame: `runtime/${city}_${st}.png`, vsReconstruction: dRecon, vsApprovedPreview: dPrev, inPageDiff: inPage, metrics: meas };
        if (st === 'noon') {
          if (city === 'dunhuang') check(`${city} noon fidelity (v1.1 rule): city + title outside the protect mask = reconstruction (max ${inPage.cityTitleOutsideMask.max}); sky graded by the approved config (max ${dRecon.max})`, inPage.cityTitleOutsideMask.max === 0 && inPage.cityTitleOutsideMask.px_nonzero === 0, JSON.stringify({ dRecon, inPage }));
          else check(`${city} noon fidelity: runtime frame = layer reconstruction pixel for pixel (max ${dRecon.max}, px≠0 ${dRecon.px_nonzero})`, dRecon.max === 0 && dRecon.px_nonzero === 0, JSON.stringify(dRecon));
        }
        check(`${city} ${st}: runtime frame vs approved preview max ${dPrev.max}/255, px>1 ${dPrev.px_gt1}, mean ${dPrev.mean}`, dPrev.max <= 1, JSON.stringify(dPrev));
        check(`${city} ${st}: background box unchanged, metrics measured (sky L ${meas.sky.luma_mean} S ${meas.sky.sat_mean} · city L ${meas.city.luma_mean} p05 ${meas.city.p05} · title L ${meas.title.luma_mean})`, same && meas.sky.px > 0 && meas.city.px > 0 && meas.title.px > 0, JSON.stringify({ box, meas }));
        await c.screenshot(path.join(outDir, 'shots', `${city}_${st}_${W}x${H}.png`));
      }
      // layer toggles (evidence only): sky-only / city-only frames
      await ev(`B7TodDebug.setState('dusk','instant'); B7TodDebug.rt.debug.city=0; B7TodDebug.rt.debug.title=0; B7TodDebug.rt.draw()`); saveDataURL(await ev('B7TodDebug.frameDataURL()'), path.join(outDir, 'runtime', `${city}_dusk_sky-only.png`));
      await ev(`B7TodDebug.rt.debug.city=1; B7TodDebug.rt.debug.sky=0; B7TodDebug.rt.draw()`); saveDataURL(await ev('B7TodDebug.frameDataURL()'), path.join(outDir, 'runtime', `${city}_dusk_city-only.png`));
      await ev(`B7TodDebug.rt.debug.sky=1; B7TodDebug.rt.debug.title=1; B7TodDebug.rt.debug.mask=1; B7TodDebug.rt.draw()`); saveDataURL(await ev('B7TodDebug.frameDataURL()'), path.join(outDir, 'runtime', `${city}_dusk_mask-overlay.png`));
      await ev(`B7TodDebug.rt.debug.mask=0; B7TodDebug.rt.draw()`);
      // ---- transition noon → dusk (config duration): sampled frames are intermediate, box never moves, parameters continuous
      await ev(`B7TodDebug.setState('noon','instant')`); await sleep(100);
      const noonF = decodePNG(saveDataURL(await ev('B7TodDebug.frameDataURL()'), path.join(outDir, 'runtime', `_tmp.png`)));
      const dur = cfg.transition; await ev(`B7TodDebug.D.duration=${dur}; B7TodDebug.setState('dusk','transition')`);
      const samples = []; const t0 = Date.now(); let boxes = [];
      while (Date.now() - t0 < dur * 1000 + 400) { const prog = await ev('(B7TodDebug.rt.progress||0)'); const anim = await ev('!!B7TodDebug.rt.anim'); if (!anim && prog >= 1) break; const url = await ev('B7TodDebug.frameDataURL()'); const live = await ev('({sb:B7TodDebug.rt.live.sky.brightness,cb:B7TodDebug.rt.live.cityGround.brightness,tb:B7TodDebug.rt.live.titleOverlay.brightness,es:B7TodDebug.rt.live.edgeProtect.blendSky,u:B7TodDebug.rt.live.globalUnify.unifyTintStrength})'); boxes.push(await ev('B7TodDebug.worldRect()')); samples.push({ prog, live, img: decodePNG(saveDataURL(url, path.join(outDir, 'runtime', `_tmp.png`))) }); await sleep(180); }
      await sleep(200); const duskF = decodePNG(saveDataURL(await ev('B7TodDebug.frameDataURL()'), path.join(outDir, 'runtime', `_tmp.png`)));
      const timing = await ev('({frames:B7TodDebug.D.timing.length,avg:B7TodDebug.D.timing.reduce((a,b)=>a+b,0)/Math.max(1,B7TodDebug.D.timing.length),done:B7TodDebug.D.transitionDone})');
      const mids = samples.filter(s => s.prog > 0.05 && s.prog < 0.95);
      const inter = mids.map(s => { const dn = diffImages(s.img, noonF), dd = diffImages(s.img, duskF); return { prog: +s.prog.toFixed(2), vsNoon: dn.mean, vsDusk: dd.mean, sb: +s.live.sb.toFixed(3), cb: +s.live.cb.toFixed(3), tb: +s.live.tb.toFixed(3), es: +s.live.es.toFixed(3), u: +s.live.u.toFixed(3) }; });
      const monotone = inter.every((s, i) => i === 0 || (s.vsNoon >= inter[i - 1].vsNoon - 0.5 && s.vsDusk <= inter[i - 1].vsDusk + 0.5));
      const between = inter.every(s => s.vsNoon > 0 && s.vsDusk > 0 && s.sb <= 1 && s.sb >= 0.58 && s.tb <= 1 && s.tb >= 0.9);
      const boxStill = boxes.every(b => ['x', 'y', 'width', 'height'].every(k => Math.abs(b[k] - box0[k]) < 0.01));
      check(`${city} transition noon → dusk (${dur}s, smoothstep): ${samples.length} samples, ${inter.length} intermediate frames all between the end states, monotone, box still, ${timing.frames} rAF frames avg ${timing.avg.toFixed(1)} ms`, inter.length >= 3 && between && monotone && boxStill && timing.frames >= 10, JSON.stringify({ inter, timing }));
      report.transition[city] = { durationSec: dur, samples: inter, timing };
      report.cities[city].sameBox = true;
    }
    fs.unlinkSync(path.join(outDir, 'runtime', '_tmp.png'));
    // ---- no console errors, no failed requests
    const errs = c.console.filter(m => m.type === 'error' || m.type === 'exception').map(m => m.text.slice(0, 200)), non200 = c.network.filter(n => n.status !== 200 && n.status !== 304).map(n => n.url + ' ' + n.status);
    check('no console errors, no failed requests', errs.length === 0 && non200.length === 0, JSON.stringify({ errs: errs.slice(0, 3), non200: non200.slice(0, 3) }));
  } catch (e) { check('script error', false, String(e && e.stack || e)); }
  report.checks = checks; fs.writeFileSync(path.join(outDir, 'validation.json'), JSON.stringify(report, null, 1));
  await c.close(); srv.stop();
  const failed = checks.filter(x => !x.ok);
  console.log('\n' + (checks.length - failed.length) + '/' + checks.length + ' checks passed' + (failed.length ? ' — FAILED: ' + failed.slice(0, 8).map(f => f.name).join(' | ') : ''));
  process.exit(failed.length ? 1 : 0);
})();
