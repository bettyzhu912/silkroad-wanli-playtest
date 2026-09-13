/* B7 TOD Runtime Integration Validation Prototype v0.1 — debug controller (not connected to the game's world-time; no hotspots, no HUD).
   City × Morning / Noon / Dusk × instant / transition, layer toggles, protect-mask overlay, wipe against the untouched reconstruction
   (shader baseline) or against the approved preview PNG, region measurements and a pixel diff against the reconstruction baseline.
   Everything the validation harness needs is exposed on window.B7TodDebug. */
(function () {
  'use strict';
  const R = window.B7TodRuntime;
  const $ = id => document.getElementById(id);
  const nodes = { scene: $('scene'), world: $('scene-world'), canvas: $('bg'), preview: $('preview-overlay'), wipe: $('wipe'), guide: $('guide'), panel: $('panel'), readout: $('readout'), msg: $('msg'), trRange: $('tr-range'), trVal: $('tr-val'), tagCity: $('tag-city') };
  const rt = (() => { try { return R.create(nodes.canvas); } catch (e) { nodes.msg.textContent = '这个浏览器没有 WebGL，无法 runtime 渲染：' + e.message; nodes.msg.hidden = false; throw e; } })();
  const D = { manifest: null, city: null, state: 'noon', mode: 'instant', duration: 2.0, alphas: null, recon: null, split: 0.5, compare: 'none', ready: false, timing: [] };
  const fitScene = () => { const w = nodes.scene.clientWidth, h = nodes.scene.clientHeight; if (!w || !h) return; const f = R.fitSlack(w, h, R.cityArt); nodes.world.style.left = f.left + 'px'; nodes.world.style.top = f.top + 'px'; nodes.world.style.width = f.w + 'px'; nodes.world.style.height = f.h + 'px'; positionWipe(); };
  function say(t) { nodes.msg.textContent = t; nodes.msg.hidden = false; clearTimeout(say._t); say._t = setTimeout(() => { nodes.msg.hidden = true; }, 2600); }
  function pixelsOf(img) { const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0); return x.getImageData(0, 0, c.width, c.height).data; }
  async function loadCity(id) {
    const m = D.manifest.cities[id]; if (!m) throw new Error('unknown city ' + id);
    D.ready = false; nodes.readout.textContent = '加载 ' + m.name + ' 图层…';
    const cfg = await (await fetch(m.config, { cache: 'no-cache' })).json();
    if (cfg.schema !== 'tod-config-v1' || cfg.city !== id) throw new Error('config mismatch for ' + id);
    rt.setConfig(cfg);
    const a = m.assets; await rt.loadCity({ sky: a.sky, skyBlur: m.derived.skyBlur, city: a.city, title: a.title, mask: a.mask });
    const recon = new Image(); await new Promise((res, rej) => { recon.onload = res; recon.onerror = rej; recon.src = a.recon; });
    D.recon = pixelsOf(recon); D.alphas = { sky: alphaOf(rt.images.sky), city: alphaOf(rt.images.city), title: alphaOf(rt.images.title), mask: pixelsOf(rt.images.mask) };
    D.city = id; D.config = cfg; nodes.tagCity.textContent = m.name + ' · config ' + cfg.version + ' · ' + m.runtimeSet;
    nodes.trRange.value = cfg.transition.durationSec; D.duration = cfg.transition.durationSec; nodes.trVal.textContent = (+D.duration).toFixed(1);
    if (D.compare === 'preview') showPreview();
    rt.show(D.state); D.ready = true; syncUI(); readout();
  }
  function alphaOf(img) { const d = pixelsOf(img), a = new Uint8Array(img.naturalWidth * img.naturalHeight); for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3]; return a; }
  function setState(s, mode) {
    D.state = s; const md = mode || D.mode; syncUI();
    if (md === 'transition') { D.timing = []; const t0 = performance.now(); let last = t0; const tick = () => { const n = performance.now(); D.timing.push(n - last); last = n; if (rt.anim) requestAnimationFrame(tick); }; rt.transitionTo(s, D.duration, () => { D.transitionDone = performance.now() - t0; readout(); }); requestAnimationFrame(tick); }
    else rt.show(s);
    if (D.compare === 'preview') showPreview(); readout();
  }
  function syncUI() {
    for (const b of document.querySelectorAll('#seg-city button')) b.setAttribute('aria-pressed', b.dataset.city === D.city ? 'true' : 'false');
    for (const b of document.querySelectorAll('#seg-state button')) b.setAttribute('aria-pressed', b.dataset.state === D.state ? 'true' : 'false');
    for (const b of document.querySelectorAll('#seg-mode button')) b.setAttribute('aria-pressed', b.dataset.mode === D.mode ? 'true' : 'false');
    const st = D.config && D.config.states[D.state]; document.title = 'B7 TOD ' + (D.config ? D.config.cityName + ' ' + D.state : 'runtime');
    if (st) nodes.trRange.title = st.visualGoal || '';
  }
  // ---- measurements (same regions / formulas as the handoff's tod_pipeline.metrics)
  function frame() { const p = rt.readPixels(); const w = p.w, h = p.h, out = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) out.set(p.data.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4); return { w, h, data: out }; } // top-down RGBA
  function measure() {
    if (!D.ready) return null; const f = frame(), A = D.alphas, n = f.w * f.h, acc = { sky: [], city: [], title: [] };
    const regs = { sky: i => A.sky[i] > 127, city: i => A.city[i] > 127 && A.title[i] < 5, title: i => A.title[i] >= 255 };
    const res = {};
    for (const k of Object.keys(regs)) { let cnt = 0, sl = 0, ss = 0, black = 0; const lum = []; for (let i = 0; i < n; i++) { if (!regs[k](i)) continue; const r = f.data[i * 4] / 255, g = f.data[i * 4 + 1] / 255, b = f.data[i * 4 + 2] / 255, L = 0.2126 * r + 0.7152 * g + 0.0722 * b, mx = Math.max(r, g, b), mn = Math.min(r, g, b); cnt++; sl += L; ss += mx > 0 ? (mx - mn) / mx : 0; if (mx < 0.03) black++; lum.push(L); }
      lum.sort((a, b) => a - b); res[k] = { px: cnt, luma_mean: +(sl / cnt).toFixed(3), sat_mean: +(ss / cnt).toFixed(3), p05: +lum[Math.floor(cnt * 0.05)].toFixed(3), p95: +lum[Math.floor(cnt * 0.95)].toFixed(3), pure_black_frac: +(black / cnt).toFixed(4) }; }
    D.lastMeasure = res; return res;
  }
  function diffBaseline() { // runtime frame vs the layer reconstruction preview (Noon fidelity); also the city / title region outside the protect mask
    if (!D.ready) return null; const f = frame(), n = f.w * f.h, A = D.alphas; let max = 0, nz = 0, maxOut = 0, nzOut = 0, sum = 0;
    for (let i = 0; i < n; i++) { const d = Math.max(Math.abs(f.data[i * 4] - D.recon[i * 4]), Math.abs(f.data[i * 4 + 1] - D.recon[i * 4 + 1]), Math.abs(f.data[i * 4 + 2] - D.recon[i * 4 + 2])); sum += d; if (d > max) max = d; if (d) nz++; if (A.sky[i] <= 127 && A.mask[i * 4] < 128) { if (d > maxOut) maxOut = d; if (d) nzOut++; } }
    const r = { state: D.state, max, px_nonzero: nz, mean: +(sum / n).toFixed(4), cityTitleOutsideMask: { max: maxOut, px_nonzero: nzOut } }; D.lastDiff = r; return r;
  }
  async function diffAgainst(url) { // runtime frame vs any 720×1600 PNG (approved previews)
    if (!D.ready) return null; const img = new Image(); await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; }); const ref = pixelsOf(img), f = frame(), n = f.w * f.h; let max = 0, nz = 0, gt1 = 0, sum = 0;
    for (let i = 0; i < n; i++) { const d = Math.max(Math.abs(f.data[i * 4] - ref[i * 4]), Math.abs(f.data[i * 4 + 1] - ref[i * 4 + 1]), Math.abs(f.data[i * 4 + 2] - ref[i * 4 + 2])); sum += d; if (d > max) max = d; if (d) nz++; if (d > 1) gt1++; }
    return { url, max, px_nonzero: nz, px_gt1: gt1, mean: +(sum / n).toFixed(4) };
  }
  function readout() {
    if (!D.config) return; const st = D.config.states[D.state], L = rt.live || {}; const f3 = v => (+v).toFixed(3);
    const line = (name, p) => `${name}: bright ${f3(p.brightness)} contr ${f3(p.contrast)} sat ${f3(p.saturation)} temp ${(+p.temperature).toFixed(1)} tint ${(+p.tint).toFixed(1)} tintS ${f3(p.tintStrength)} haze ${f3(p.haze)} shadowT ${f3(p.shadowTintStrength)} hlC ${f3(p.highlightCompress)} prot w/g/t/p ${f3(p.warmProtect)}/${f3(p.greenProtect)}/${f3(p.tealProtect)}/${f3(p.pinkProtect)}`;
    let t = `<b>${D.config.cityName} · ${D.state}</b> · ${D.mode}${rt.anim ? ' · transition ' + Math.round((rt.progress || 0) * 100) + '%' : ''} · frames ${rt.frames}\n目标：${(st.visualGoal || '').slice(0, 120)}\n`;
    if (L.sky) t += line('SKY', L.sky) + ` grad ${f3(L.sky.gradientTop)} horizon ${f3(L.sky.horizonY)} glow ${f3(L.sky.glowStrength)}/${f3(L.sky.glowBand)} soft ${f3(L.sky.softness)}\n` + line('CITY', L.cityGround) + ` satLo/Hi ${f3(L.cityGround.protectSatLow)}/${f3(L.cityGround.protectSatHigh)}\n` + line('TITLE', L.titleOverlay) + `\nUNIFY tintS ${f3(L.globalUnify.unifyTintStrength)} contr ${f3(L.globalUnify.unifyContrast)} · EDGE on ${f3(L.edgeProtect.enabled)} sky ${f3(L.edgeProtect.blendSky)} city ${f3(L.edgeProtect.blendCity)}\n`;
    if (D.transitionDone) t += `上次 transition：${Math.round(D.transitionDone)} ms，${D.timing.length} 帧，平均帧间隔 ${(D.timing.reduce((a, b) => a + b, 0) / Math.max(1, D.timing.length)).toFixed(1)} ms\n`;
    if (D.lastMeasure) t += `测量 sky L/S ${D.lastMeasure.sky.luma_mean}/${D.lastMeasure.sky.sat_mean} · city L/S/p05 ${D.lastMeasure.city.luma_mean}/${D.lastMeasure.city.sat_mean}/${D.lastMeasure.city.p05} · title L ${D.lastMeasure.title.luma_mean}\n`;
    if (D.lastDiff) t += `对母版 diff（${D.lastDiff.state}）：max ${D.lastDiff.max} · px≠0 ${D.lastDiff.px_nonzero} · City/Title(mask 外) max ${D.lastDiff.cityTitleOutsideMask.max} px≠0 ${D.lastDiff.cityTitleOutsideMask.px_nonzero}\n`;
    const w = nodes.world.getBoundingClientRect(); t += `container：scene ${nodes.scene.clientWidth}×${nodes.scene.clientHeight} → world ${w.width.toFixed(1)}×${w.height.toFixed(1)} @ (${w.left.toFixed(1)}, ${w.top.toFixed(1)})（fitSlack · 720×1600 · slackTop 320）`;
    nodes.readout.innerHTML = t;
  }
  // ---- compare wipes
  function positionWipe() { nodes.wipe.style.left = (D.split * 100) + '%'; nodes.preview.style.clipPath = `inset(0 ${(100 - D.split * 100).toFixed(2)}% 0 0)`; }
  function showPreview() { const m = D.manifest.cities[D.city]; nodes.preview.src = m.previews[D.state]; nodes.preview.hidden = false; }
  function setCompare(kind) { D.compare = kind; rt.debug.split = kind === 'baseline' ? D.split : -1; nodes.preview.hidden = kind !== 'preview'; if (kind === 'preview') showPreview(); nodes.wipe.hidden = kind === 'none'; $('tg-compare').setAttribute('aria-pressed', kind === 'baseline'); $('tg-preview').setAttribute('aria-pressed', kind === 'preview'); rt.draw(); }
  let dragging = false; const moveWipe = e => { const r = nodes.world.getBoundingClientRect(); D.split = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); if (D.compare === 'baseline') rt.debug.split = D.split; positionWipe(); rt.draw(); };
  nodes.scene.addEventListener('pointerdown', e => { if (D.compare === 'none') return; dragging = true; moveWipe(e); }); window.addEventListener('pointermove', e => { if (dragging) moveWipe(e); }); window.addEventListener('pointerup', () => { dragging = false; });
  // ---- wiring
  const tg = (id, fn) => { const el = $(id); el.addEventListener('click', () => { const on = el.getAttribute('aria-pressed') !== 'true'; el.setAttribute('aria-pressed', on ? 'true' : 'false'); fn(on); rt.draw(); readout(); }); };
  tg('tg-sky', on => { rt.debug.sky = on ? 1 : 0; }); tg('tg-city', on => { rt.debug.city = on ? 1 : 0; }); tg('tg-title', on => { rt.debug.title = on ? 1 : 0; }); tg('tg-mask', on => { rt.debug.mask = on ? 1 : 0; });
  $('tg-compare').addEventListener('click', () => setCompare(D.compare === 'baseline' ? 'none' : 'baseline')); $('tg-preview').addEventListener('click', () => setCompare(D.compare === 'preview' ? 'none' : 'preview'));
  tg('tg-guide', on => { nodes.guide.hidden = !on; });
  document.querySelectorAll('#seg-city button').forEach(b => b.addEventListener('click', () => loadCity(b.dataset.city).catch(e => say(String(e)))));
  document.querySelectorAll('#seg-state button').forEach(b => b.addEventListener('click', () => setState(b.dataset.state)));
  document.querySelectorAll('#seg-mode button').forEach(b => b.addEventListener('click', () => { D.mode = b.dataset.mode; syncUI(); readout(); }));
  nodes.trRange.addEventListener('input', () => { D.duration = +nodes.trRange.value; nodes.trVal.textContent = D.duration.toFixed(1); });
  $('btn-measure').addEventListener('click', () => { measure(); readout(); }); $('btn-diff').addEventListener('click', () => { diffBaseline(); readout(); });
  $('btn-collapse').addEventListener('click', () => { const c = nodes.panel.classList.toggle('collapsed'); $('btn-collapse').textContent = c ? '展开' : '收起'; });
  window.addEventListener('resize', () => { fitScene(); readout(); });
  // ---- boot (hash: #city=khotan&state=dusk&mode=transition)
  const hash = Object.fromEntries(location.hash.replace(/^#/, '').split('&').filter(Boolean).map(kv => kv.split('=')));
  fitScene();
  fetch('config/manifest.json', { cache: 'no-cache' }).then(r => r.json()).then(async m => { D.manifest = m; D.state = ['morning', 'noon', 'dusk'].includes(hash.state) ? hash.state : 'noon'; D.mode = hash.mode === 'transition' ? 'transition' : 'instant'; await loadCity(m.cities[hash.city] ? hash.city : 'khotan'); fitScene(); }).catch(e => say('加载失败：' + e.message));
  window.B7TodDebug = { rt, D, loadCity, setState, measure, diffBaseline, diffAgainst, setCompare, fitScene, frameDataURL: () => nodes.canvas.toDataURL('image/png'), worldRect: () => nodes.world.getBoundingClientRect().toJSON(), fitSlack: R.fitSlack };
})();
