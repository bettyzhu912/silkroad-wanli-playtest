/* B7 Time-of-Day runtime — Formal Runtime Integration v0.1.
   Replaces the single static city background of the B7 city scene with the approved three-layer composite (SKY → CITY_GROUND → TITLE_OVERLAY,
   720×1600, native coordinates) graded by the city's approved tod-config-v1 (S.todConfigs, verbatim copies of the handoff JSON) through the
   tod-grade-v0.2.1 operator set — the GLSL below is the handoff's reference shader (reference/page_template_v1.html, pixel-equivalent to
   reference/tod_pipeline.py) and the one validated by the PASSed prototype (tod-prototype/). One WebGL pass computes the four grades that edge
   protect needs, the title grade, the straight-alpha composite and the global unify pass. Textures: NEAREST, no mipmap, straight alpha, no
   colour-space conversion.
   World time: read-only. shell.js passes S.time.phase(progress) (0 晨 / 1 午 / 2 暮) on every scene render; the renderer maps it to
   morning / noon / dusk and, on a change, interpolates every parameter and colour (sky / cityGround / titleOverlay / globalUnify / edgeProtect)
   with smoothstep easing over config.transition.durationSec. Nothing here writes world time, calls advanceTime or touches the save.
   Rollback: the static background <img> stays in the scene (hidden while the canvas shows); TOD off (S.tod.setEnabled(false), persisted),
   no WebGL, a lost context or an asset failure shows the image again — the scene box, hotspots, HUD and time are never touched.
   Debug override (S.tod.setOverride('dusk' | null)) only replaces the renderer's input phase; it never writes time. */
(function (S) {
  'use strict';
  const PHASES = ['morning', 'noon', 'dusk']; // world-time phase index (S.time.phase: tick % 3 → 晨 / 午 / 暮) → TOD state
  const STORAGE_KEY = 'silkroad.tod.enabled';
  const NEUTRAL_SKY = { brightness: 1, contrast: 1, saturation: 1, temperature: 0, tint: 0, softness: 0, haze: 0, hazeColor: [0.88, 0.92, 0.97], tintStrength: 0, tintColor: [1, 1, 1], gradientTop: 1, horizonY: 0.375, glowStrength: 0, glowBand: 0.12, glowColor: [1, 0.72, 0.45],
    shadowTintStrength: 0, shadowTintColor: [0.5, 0.58, 0.92], shadowPower: 1.6, shadowLift: 0, shadowLiftColor: [0.05, 0.08, 0.20],
    highlightTintStrength: 0, highlightTintColor: [0.95, 0.96, 1.0], highlightPower: 2.0, highlightCompress: 0, highlightKnee: 0.78,
    warmProtect: 0, greenProtect: 0, tealProtect: 0, pinkProtect: 0, protectSatLow: 0.15, protectSatHigh: 0.45 };
  const NEUTRAL_GLOBAL = { unifyTintStrength: 0, unifyTint: [0.96, 0.97, 1.0], unifyContrast: 0 };
  const NEUTRAL_EDGE = { enabled: 1, blendSky: 0.15, blendCity: 0.15 };
  const VS = 'attribute vec2 p; varying vec2 v; void main(){ v = vec2(p.x*0.5+0.5, 0.5-p.y*0.5); gl_Position = vec4(p,0.,1.); }';
  const FS = `precision highp float; varying vec2 v;
uniform sampler2D uSky,uSkyBlur,uCity,uTitle,uMask;
struct P{ float brightness,contrast,saturation,temperature,tint,softness,haze,tintStrength,gradientTop,horizonY,glowStrength,glowBand,
          shadowTintStrength,shadowPower,shadowLift,highlightTintStrength,highlightPower,highlightCompress,highlightKnee,warmProtect,greenProtect,tealProtect,pinkProtect,protectSatLow,protectSatHigh;
          vec3 hazeColor,tintColor,glowColor,shadowTintColor,shadowLiftColor,highlightTintColor; };
uniform P uS; uniform P uC; uniform P uT;
uniform vec3 uUnifyTint; uniform float uUnifyStrength,uUnifyContrast;
uniform float uEdgeOn,uBlendSky,uBlendCity;
float luma(vec3 c){ return dot(c, vec3(0.2126,0.7152,0.0722)); }
vec3 hs(vec3 c){ float mx=max(c.r,max(c.g,c.b)); float mn=min(c.r,min(c.g,c.b)); float d=mx-mn; float s = mx>1e-6 ? d/mx : 0.0; float h=0.0;
  if(d>1e-6){ if(mx==c.r) h=mod((c.g-c.b)/d,6.0); else if(mx==c.g) h=(c.b-c.r)/d+2.0; else h=(c.r-c.g)/d+4.0; h*=60.0; if(h<0.0) h+=360.0; } return vec3(h,s,mx); }
float win(float h, float center, float half_, float soft){ float dh = abs(mod(h-center+180.0,360.0)-180.0); return 1.0 - smoothstep(half_-soft, half_, dh); }
vec3 grade(vec3 o, vec3 src, P p, float y, float isSky){
  vec3 c = src;
  float t = p.temperature/100.0, ti = p.tint/100.0;
  c *= vec3(1.0 + t*0.16, 1.0 - ti*0.10, 1.0 - t*0.16);
  float g = mix(1.0, mix(p.gradientTop, 1.0, clamp(y/max(p.horizonY,1e-6),0.0,1.0)), isSky);
  c *= p.brightness * g;
  c = (c - 0.5) * p.contrast + 0.5;
  float l = luma(c); c = mix(vec3(l), c, p.saturation);
  c *= mix(vec3(1.0), p.tintColor, p.tintStrength);
  c = mix(c, p.hazeColor, p.haze);
  float L = clamp(luma(c), 0.0, 1.0);
  float ws = pow(1.0-L, p.shadowPower), wh = pow(L, p.highlightPower);
  c *= mix(vec3(1.0), p.shadowTintColor, ws*p.shadowTintStrength);
  c += p.shadowLiftColor * p.shadowLift * pow(1.0-L, 3.0);
  c *= mix(vec3(1.0), p.highlightTintColor, wh*p.highlightTintStrength);
  float r = p.highlightCompress * smoothstep(p.highlightKnee, 1.0, L);
  c *= (1.0 - r) + r * p.highlightKnee / max(L, 1e-4);
  if (p.warmProtect + p.greenProtect + p.tealProtect + p.pinkProtect > 0.0) {
    vec3 H = hs(o); float wsat = smoothstep(p.protectSatLow, p.protectSatHigh, H.y);
    float prot = clamp(wsat * (win(H.x,35.0,25.0,10.0)*p.warmProtect + win(H.x,120.0,45.0,15.0)*p.greenProtect + win(H.x,188.0,25.0,10.0)*p.tealProtect + win(H.x,350.0,30.0,10.0)*p.pinkProtect), 0.0, 1.0);
    vec3 cr = o * (luma(c) / max(luma(o), 1e-4));
    c = mix(c, cr, prot);
  }
  float band = smoothstep(p.horizonY - p.glowBand, p.horizonY, y);
  c += p.glowColor * p.glowStrength * band * isSky;
  return clamp(c, 0.0, 1.0);
}
void main(){
  vec4 s = texture2D(uSky, v); vec4 sb = texture2D(uSkyBlur, v); vec4 c = texture2D(uCity, v); vec4 t = texture2D(uTitle, v);
  float m = texture2D(uMask, v).r * uEdgeOn;
  float y = v.y;
  vec3 skySrc = mix(s.rgb, sb.rgb, uS.softness);
  vec3 skyS = grade(s.rgb, skySrc, uS, y, 1.0); vec3 skyC = grade(s.rgb, s.rgb, uC, y, 0.0);
  vec3 cityC = grade(c.rgb, c.rgb, uC, y, 0.0); vec3 cityS = grade(c.rgb, c.rgb, uS, y, 1.0);
  vec3 titleG = grade(t.rgb, t.rgb, uT, y, 0.0);
  vec3 skyG = mix(skyS, skyC, m*uBlendSky); vec3 cityG = mix(cityC, cityS, m*uBlendCity);
  vec3 o = vec3(0.0); o = mix(o, skyG, s.a); o = mix(o, cityG, c.a); o = mix(o, titleG, t.a);
  o *= mix(vec3(1.0), uUnifyTint, uUnifyStrength);
  o = mix(o, smoothstep(0.0, 1.0, o), uUnifyContrast);
  gl_FragColor = vec4(clamp(o, 0.0, 1.0), 1.0);
}`;
  const clone = o => JSON.parse(JSON.stringify(o)), fill = (o, base) => Object.assign({}, base, o || {});
  const normalizeState = (st, cfg) => ({ sky: fill(st.sky, NEUTRAL_SKY), cityGround: fill(st.cityGround, NEUTRAL_SKY), titleOverlay: fill(st.titleOverlay, NEUTRAL_SKY), globalUnify: fill(st.globalUnify, NEUTRAL_GLOBAL), edgeProtect: fill(st.edgeProtect, fill(cfg.edgeProtect, NEUTRAL_EDGE)) });
  function lerpParams(a, b, t) { const o = {}; for (const k of Object.keys(b)) { if (Array.isArray(b[k])) o[k] = b[k].map((v, i) => a[k][i] + (v - a[k][i]) * t); else if (typeof b[k] === 'number') o[k] = a[k] + (b[k] - a[k]) * t; else o[k] = b[k]; } return o; }
  const lerpState = (a, b, t) => ({ sky: lerpParams(a.sky, b.sky, t), cityGround: lerpParams(a.cityGround, b.cityGround, t), titleOverlay: lerpParams(a.titleOverlay, b.titleOverlay, t), globalUnify: lerpParams(a.globalUnify, b.globalUnify, t), edgeProtect: lerpParams(a.edgeProtect, b.edgeProtect, t) });
  const asset = key => { const f = S.assets && S.assets[key]; if (!f) throw new Error('TOD asset mapping missing: ' + key); return f; };
  function loadImg(src) { return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('TOD layer failed to load: ' + src)); im.src = src; }); }
  // ---------------------------------------------------------------- renderer (one per attached city scene)
  function createRenderer(canvas) {
    const gl = canvas.getContext('webgl', { premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false, alpha: false, powerPreference: 'low-power' });
    if (!gl) throw new Error('WebGL unavailable');
    const compile = (type, src) => { const sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh); if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error('TOD shader: ' + gl.getShaderInfoLog(sh)); return sh; };
    const prog = gl.createProgram(); gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('TOD program: ' + gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const ap = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(ap); gl.vertexAttribPointer(ap, 2, gl.FLOAT, false, 0, 0);
    const loc = {}, u = n => gl.getUniformLocation(prog, n);
    ['uEdgeOn', 'uBlendSky', 'uBlendCity', 'uUnifyTint', 'uUnifyStrength', 'uUnifyContrast'].forEach(n => { loc[n] = u(n); });
    for (const L of ['uS', 'uC', 'uT']) for (const k of Object.keys(NEUTRAL_SKY)) loc[L + '.' + k] = u(L + '.' + k);
    ['uSky', 'uSkyBlur', 'uCity', 'uTitle', 'uMask'].forEach((n, i) => gl.uniform1i(u(n), i));
    const textures = [];
    const setP = (prefix, p) => { for (const k of Object.keys(NEUTRAL_SKY)) { const val = p[k]; if (Array.isArray(val)) gl.uniform3f(loc[prefix + '.' + k], val[0], val[1], val[2]); else gl.uniform1f(loc[prefix + '.' + k], val); } };
    const rt = {
      gl, canvas, states: null, current: null, live: null, anim: null, frames: 0, lastFrameMs: 0, disposed: false,
      upload(imgs) { // [sky, skyBlur, city, title, mask]
        imgs.forEach((img, unit) => { const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
          gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); textures.push(t); });
      },
      setConfig(cfg) { rt.config = cfg; rt.states = {}; for (const s of Object.keys(cfg.states)) rt.states[s] = normalizeState(cfg.states[s], cfg); },
      show(state) { rt.cancel(); rt.current = state; rt.live = clone(rt.states[state]); rt.draw(); },
      transitionTo(state, durationSec) {
        rt.cancel(); const from = rt.live ? clone(rt.live) : clone(rt.states[state]), target = rt.states[state]; rt.current = state;
        const dur = Math.max(0, +durationSec || 0) * 1000; if (!dur) { rt.live = clone(target); rt.draw(); return; }
        const t0 = performance.now();
        const step = now => { const t = Math.min(1, (now - t0) / dur), e = t * t * (3 - 2 * t); rt.live = t >= 1 ? clone(target) : lerpState(from, target, e); rt.draw(); rt.anim = t < 1 ? requestAnimationFrame(step) : null; };
        rt.anim = requestAnimationFrame(step);
      },
      cancel() { if (rt.anim) { cancelAnimationFrame(rt.anim); rt.anim = null; } },
      draw() {
        if (rt.disposed || !rt.live || gl.isContextLost()) return; const t0 = performance.now(), L = rt.live;
        setP('uS', L.sky); setP('uC', L.cityGround); setP('uT', L.titleOverlay);
        const g = L.globalUnify, e = L.edgeProtect;
        gl.uniform3f(loc.uUnifyTint, g.unifyTint[0], g.unifyTint[1], g.unifyTint[2]); gl.uniform1f(loc.uUnifyStrength, g.unifyTintStrength); gl.uniform1f(loc.uUnifyContrast, g.unifyContrast);
        gl.uniform1f(loc.uEdgeOn, e.enabled); gl.uniform1f(loc.uBlendSky, e.blendSky); gl.uniform1f(loc.uBlendCity, e.blendCity);
        gl.viewport(0, 0, canvas.width, canvas.height); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); rt.frames++; rt.lastFrameMs = performance.now() - t0;
      },
      dispose() { if (rt.disposed) return; rt.disposed = true; rt.cancel(); try { for (const t of textures) gl.deleteTexture(t); textures.length = 0; gl.deleteProgram(prog); gl.deleteBuffer(buf); const ext = gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext(); } catch (_) { /* context already gone */ } },
      textureCount: () => textures.length
    };
    return rt;
  }
  // ---------------------------------------------------------------- integration surface
  let enabled = true; try { enabled = localStorage.getItem(STORAGE_KEY) !== '0'; } catch (_) { /* storage unavailable: enabled */ }
  const tod = {
    PHASES,
    scene: null, // { city, canvas, img, rt, ready, serial, phase (renderer input), realPhase }
    override: null,
    status: { enabled, supported: typeof WebGLRenderingContext !== 'undefined', city: null, phase: null, realPhase: null, ready: false, loading: false, error: null, fallback: null, frames: 0, attaches: 0, renderers: 0, disposes: 0, lastLoadMs: 0 },
    get enabled() { return enabled; },
    configFor(city) { const cfg = S.todConfigs && S.todConfigs[city]; if (!cfg || cfg.schema !== 'tod-config-v1' || cfg.city !== city) throw new Error('TOD config missing for ' + city); return cfg; },
    phaseName(index) { return PHASES[index] || null; },
    /* Called by shell.js when the city scene is (re)built. Appends the TOD canvas (same class + box as the image) and the hidden static image
       (rollback path) to the scene world and starts loading the city's layers. Returns false when TOD is off → shell appends the image itself. */
    attach(sceneWorld, city, img) {
      if (!enabled || !tod.status.supported) { tod.status.fallback = !enabled ? 'disabled' : 'no-webgl'; return false; }
      tod.detach();
      const canvas = document.createElement('canvas'); canvas.className = 'city-background'; canvas.width = 720; canvas.height = 1600; canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', img.alt || '城市景观');
      img.hidden = true; sceneWorld.append(canvas, img);
      const scene = { city, canvas, img, rt: null, ready: false, serial: ++tod._serial, phase: null, realPhase: null, pendingPhase: null };
      tod.scene = scene; tod.status.attaches++; Object.assign(tod.status, { city, ready: false, loading: true, error: null, fallback: null });
      canvas.addEventListener('webglcontextlost', ev => { ev.preventDefault(); if (tod.scene === scene) tod.fallback('context-lost'); });
      const cfg = tod.configFor(city), files = cfg.asset.files, t0 = performance.now();
      const urls = [asset(files.sky.replace(/\.png$/, '')), asset('B7_city_' + city + '_sky_blur3_v01'), asset(files.city.replace(/\.png$/, '')), asset(files.title.replace(/\.png$/, '')), asset(files.mask.replace(/\.png$/, ''))];
      const loads = tod._test && tod._test.failNext ? (tod._test.failNext = false, Promise.reject(new Error('TOD test: simulated asset failure'))) : Promise.all(urls.map(loadImg));
      loads.then(imgs => {
        if (tod.scene !== scene || scene.serial !== tod._serial || !canvas.isConnected) return; // a newer scene replaced this one while loading: drop the stale result
        for (const im of imgs) if (im.naturalWidth !== 720 || im.naturalHeight !== 1600) throw new Error('TOD layer size ' + im.naturalWidth + '×' + im.naturalHeight);
        const rt = createRenderer(canvas); rt.upload(imgs); rt.setConfig(cfg); scene.rt = rt; scene.ready = true; tod.status.renderers++;
        tod.status.loading = false; tod.status.ready = true; tod.status.lastLoadMs = Math.round(performance.now() - t0);
        if (scene.pendingPhase) rt.show(scene.pendingPhase); // first visible frame = the real phase, no default-noon flash
        tod.prefetchOthers(city);
      }).catch(err => { if (tod.scene !== scene) return; tod.status.error = String(err && err.message || err); console.warn('[TOD] ' + tod.status.error + ' — static background shown'); tod.fallback('load-failed'); });
      return true;
    },
    /* Called by shell.js on every city-scene render with the real world-time phase index. Debug override replaces only the renderer input. */
    sync(city, phaseIndex) {
      const scene = tod.scene; if (!scene || scene.city !== city || !scene.canvas.isConnected) return;
      const instant = tod._instantNext; tod._instantNext = false;
      scene.realPhase = PHASES[phaseIndex] || null; const phase = tod.override || scene.realPhase; tod.status.realPhase = scene.realPhase; tod.status.phase = phase;
      if (!phase) { console.warn('[TOD] world-time phase unavailable (' + phaseIndex + '); keeping the last frame'); tod.status.error = 'phase-unavailable:' + phaseIndex; return; }
      if (!scene.ready) { scene.pendingPhase = phase; scene.phase = phase; return; }
      if (scene.phase === phase) return; // same phase: never restart the animation
      const first = scene.phase === null; scene.phase = phase;
      if (first || instant) scene.rt.show(phase); else scene.rt.transitionTo(phase, scene.rt.config.transition && scene.rt.config.transition.durationSec);
    },
    detach() { const scene = tod.scene; if (!scene) return; tod.scene = null; if (scene.rt) { scene.rt.dispose(); tod.status.disposes++; } tod.status.ready = false; tod.status.loading = false; tod.status.city = null; },
    fallback(reason) { const scene = tod.scene; if (!scene) return; tod.status.fallback = reason; if (scene.rt) { scene.rt.dispose(); tod.status.disposes++; } scene.rt = null; scene.ready = false; tod.status.ready = false; tod.status.loading = false; if (scene.canvas.isConnected) scene.canvas.remove(); scene.img.hidden = false; tod.scene = null; },
    /* TOD switch (persisted). Off: the canvas is removed in place and the static image shows — no scene rebuild, hotspots / HUD / time untouched. On: the scene is rebuilt once so the renderer attaches. */
    setEnabled(on) { enabled = Boolean(on); tod.status.enabled = enabled; try { localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0'); } catch (_) { /* ignore */ } if (!enabled) tod.fallback('disabled'); else if (S.ui && S.ui.resetScene) S.ui.resetScene(); tod.rerender(); },
    /* Development-only override of the renderer's input phase (never written to world time). null → the real phase is read again at once (instant). */
    setOverride(phase) { tod.override = PHASES.includes(phase) ? phase : null; tod._instantNext = true; tod.rerender(); },
    rerender() { if (S.ui && S.ui.render && S.app && S.app.state && S.app.state.progress) S.ui.render(S.app.state); }, // only while a city / journey scene exists
    prefetchOthers(city) { // warm the HTTP cache for the other two cities (no decode, no GPU memory)
      try { for (const other of Object.keys(S.todConfigs || {})) { if (other === city) continue; const f = S.todConfigs[other].asset.files; for (const key of [f.sky, f.city, f.title, f.mask].map(n => n.replace(/\.png$/, '')).concat(['B7_city_' + other + '_sky_blur3_v01'])) { const l = document.createElement('link'); l.rel = 'prefetch'; l.as = 'image'; l.href = asset(key); document.head.append(l); } } } catch (_) { /* optional */ }
    },
    snapshot() { const scene = tod.scene; return { enabled, city: scene ? scene.city : null, phase: scene ? scene.phase : null, realPhase: scene ? scene.realPhase : null, ready: Boolean(scene && scene.ready), animating: Boolean(scene && scene.rt && scene.rt.anim), frames: scene && scene.rt ? scene.rt.frames : 0, lastFrameMs: scene && scene.rt ? scene.rt.lastFrameMs : 0, textures: scene && scene.rt ? scene.rt.textureCount() : 0, live: scene && scene.rt ? scene.rt.live : null, status: tod.status, override: tod.override }; },
    frameDataURL() { const scene = tod.scene; return scene && scene.ready ? scene.canvas.toDataURL('image/png') : null; },
    _serial: 0, _instantNext: false, _test: { failNext: false }
  };
  S.tod = tod;
})(globalThis.Silk = globalThis.Silk || {});
