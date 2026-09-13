/* B7 Time-of-Day runtime — Runtime Integration Validation Prototype v0.1.
   Renders SKY → CITY_GROUND → TITLE_OVERLAY (720×1600, native coordinates) with the approved tod-config-v1 parameters through the
   tod-grade-v0.2.1 operator set. The GLSL below is the handoff's reference shader (reference/page_template_v1.html, pixel-equivalent to
   reference/tod_pipeline.py): one pass computes the four grades that edge protect needs (sky with Sky / City params, city with City / Sky
   params), the title grade, the straight-alpha composite and the global unify pass. Textures: NEAREST, no mipmap, straight alpha, no
   colour-space conversion — Noon (all-neutral) must equal the layer reconstruction pixel for pixel.
   Transition: every numeric parameter and colour of sky / cityGround / titleOverlay / globalUnify / edgeProtect is interpolated linearly
   in parameter space with smoothstep easing over config.transition.durationSec (the reserved value; the formal world-time logic owns it).
   Nothing here touches the game: no world-time, no hotspots, no HUD. */
window.B7TodRuntime = (function () {
  'use strict';
  const NEUTRAL_SKY = { brightness: 1, contrast: 1, saturation: 1, temperature: 0, tint: 0, softness: 0, haze: 0, hazeColor: [0.88, 0.92, 0.97], tintStrength: 0, tintColor: [1, 1, 1], gradientTop: 1, horizonY: 0.375, glowStrength: 0, glowBand: 0.12, glowColor: [1, 0.72, 0.45],
    shadowTintStrength: 0, shadowTintColor: [0.5, 0.58, 0.92], shadowPower: 1.6, shadowLift: 0, shadowLiftColor: [0.05, 0.08, 0.20],
    highlightTintStrength: 0, highlightTintColor: [0.95, 0.96, 1.0], highlightPower: 2.0, highlightCompress: 0, highlightKnee: 0.78,
    warmProtect: 0, greenProtect: 0, tealProtect: 0, pinkProtect: 0, protectSatLow: 0.15, protectSatHigh: 0.45 };
  const NEUTRAL_GLOBAL = { unifyTintStrength: 0, unifyTint: [0.96, 0.97, 1.0], unifyContrast: 0 };
  const NEUTRAL_EDGE = { enabled: 1, blendSky: 0.15, blendCity: 0.15 };
  const VS = `attribute vec2 p; varying vec2 v; void main(){ v = vec2(p.x*0.5+0.5, 0.5-p.y*0.5); gl_Position = vec4(p,0.,1.); }`;
  const FS = `precision highp float; varying vec2 v;
uniform sampler2D uSky,uSkyBlur,uCity,uTitle,uMask;
struct P{ float brightness,contrast,saturation,temperature,tint,softness,haze,tintStrength,gradientTop,horizonY,glowStrength,glowBand,
          shadowTintStrength,shadowPower,shadowLift,highlightTintStrength,highlightPower,highlightCompress,highlightKnee,warmProtect,greenProtect,tealProtect,pinkProtect,protectSatLow,protectSatHigh;
          vec3 hazeColor,tintColor,glowColor,shadowTintColor,shadowLiftColor,highlightTintColor; };
uniform P uS; uniform P uC; uniform P uT;
uniform vec3 uUnifyTint; uniform float uUnifyStrength,uUnifyContrast;
uniform float uEdgeOn,uBlendSky,uBlendCity,uSplit,uShowMask,uShowSky,uShowCity,uShowTitle;
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
  float sa = s.a*uShowSky, ca = c.a*uShowCity, ta = t.a*uShowTitle;
  vec3 o = vec3(0.0); o = mix(o, skyG, sa); o = mix(o, cityG, ca); o = mix(o, titleG, ta);
  o *= mix(vec3(1.0), uUnifyTint, uUnifyStrength);
  o = mix(o, smoothstep(0.0, 1.0, o), uUnifyContrast);
  o = clamp(o, 0.0, 1.0);
  vec3 b = vec3(0.0); b = mix(b, s.rgb, sa); b = mix(b, c.rgb, ca); b = mix(b, t.rgb, ta);
  vec3 f = v.x < uSplit ? b : o;
  f = mix(f, vec3(1.0,0.18,0.12), m*uShowMask*0.55);
  gl_FragColor = vec4(f, 1.0);
}`;
  const clone = o => JSON.parse(JSON.stringify(o));
  const fill = (o, base) => Object.assign({}, base, o || {});
  function normalizeState(st, cfg) { // = tod_pipeline.normalize_config for one state (every parameter explicit)
    return { sky: fill(st.sky, NEUTRAL_SKY), cityGround: fill(st.cityGround, NEUTRAL_SKY), titleOverlay: fill(st.titleOverlay, NEUTRAL_SKY), globalUnify: fill(st.globalUnify, NEUTRAL_GLOBAL), edgeProtect: fill(st.edgeProtect, fill(cfg.edgeProtect, NEUTRAL_EDGE)) };
  }
  function lerpParams(a, b, t) { const o = {}; for (const k of Object.keys(b)) { if (Array.isArray(b[k])) o[k] = b[k].map((v, i) => a[k][i] + (v - a[k][i]) * t); else if (typeof b[k] === 'number') o[k] = a[k] + (b[k] - a[k]) * t; else o[k] = b[k]; } return o; }
  const lerpState = (a, b, t) => ({ sky: lerpParams(a.sky, b.sky, t), cityGround: lerpParams(a.cityGround, b.cityGround, t), titleOverlay: lerpParams(a.titleOverlay, b.titleOverlay, t), globalUnify: lerpParams(a.globalUnify, b.globalUnify, t), edgeProtect: lerpParams(a.edgeProtect, b.edgeProtect, t) });
  function loadImg(src) { return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('image failed: ' + src)); im.src = src; }); }
  function create(canvas) {
    const gl = canvas.getContext('webgl', { premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false, alpha: false });
    if (!gl) throw new Error('WebGL unavailable');
    const loc = {}; let prog = null; const tex = {};
    const compile = (type, src) => { const sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh); if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh)); return sh; };
    prog = gl.createProgram(); gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const ap = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(ap); gl.vertexAttribPointer(ap, 2, gl.FLOAT, false, 0, 0);
    const u = n => gl.getUniformLocation(prog, n);
    ['uEdgeOn', 'uBlendSky', 'uBlendCity', 'uSplit', 'uShowMask', 'uShowSky', 'uShowCity', 'uShowTitle', 'uUnifyTint', 'uUnifyStrength', 'uUnifyContrast'].forEach(n => { loc[n] = u(n); });
    for (const L of ['uS', 'uC', 'uT']) for (const k of Object.keys(NEUTRAL_SKY)) loc[L + '.' + k] = u(L + '.' + k);
    const UNITS = ['uSky', 'uSkyBlur', 'uCity', 'uTitle', 'uMask']; UNITS.forEach((n, i) => gl.uniform1i(u(n), i));
    function texture(img, unit) {
      if (tex[unit]) gl.deleteTexture(tex[unit]);
      const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      tex[unit] = t; return t;
    }
    function setP(prefix, p) { for (const k of Object.keys(NEUTRAL_SKY)) { const val = (k in p) ? p[k] : NEUTRAL_SKY[k]; if (Array.isArray(val)) gl.uniform3f(loc[prefix + '.' + k], val[0], val[1], val[2]); else gl.uniform1f(loc[prefix + '.' + k], val); } }
    const rt = {
      gl, canvas, config: null, states: null, current: null, live: null, anim: null, images: null, frames: 0,
      debug: { split: -1, mask: 0, sky: 1, city: 1, title: 1 },
      async loadCity(urls) { // {sky, skyBlur, city, title, mask}
        const imgs = await Promise.all([urls.sky, urls.skyBlur, urls.city, urls.title, urls.mask].map(loadImg));
        for (const im of imgs) if (im.naturalWidth !== canvas.width || im.naturalHeight !== canvas.height) throw new Error('layer size ' + im.naturalWidth + '×' + im.naturalHeight + ' ≠ canvas ' + canvas.width + '×' + canvas.height);
        imgs.forEach((im, i) => texture(im, i)); rt.images = { sky: imgs[0], skyBlur: imgs[1], city: imgs[2], title: imgs[3], mask: imgs[4] }; return rt.images;
      },
      setConfig(cfg) { rt.config = cfg; rt.states = {}; for (const s of Object.keys(cfg.states)) rt.states[s] = normalizeState(cfg.states[s], cfg); },
      show(state) { rt.cancel(); rt.current = state; rt.live = clone(rt.states[state]); rt.draw(); },
      transitionTo(state, durationSec, onDone) {
        rt.cancel(); const from = rt.live ? clone(rt.live) : clone(rt.states[state]), target = rt.states[state]; rt.current = state;
        const dur = Math.max(0, +durationSec || 0) * 1000; if (!dur) { rt.live = clone(target); rt.draw(); if (onDone) onDone(); return; }
        const t0 = performance.now();
        const step = now => { const t = Math.min(1, (now - t0) / dur), e = t * t * (3 - 2 * t); rt.live = lerpState(from, target, e); rt.progress = t; rt.draw(); if (t < 1) rt.anim = requestAnimationFrame(step); else { rt.anim = null; if (onDone) onDone(); } };
        rt.anim = requestAnimationFrame(step);
      },
      cancel() { if (rt.anim) { cancelAnimationFrame(rt.anim); rt.anim = null; } },
      draw() {
        const L = rt.live; if (!L || !rt.images) return;
        setP('uS', L.sky); setP('uC', L.cityGround); setP('uT', L.titleOverlay);
        const g = L.globalUnify, e = L.edgeProtect, d = rt.debug;
        gl.uniform3f(loc.uUnifyTint, g.unifyTint[0], g.unifyTint[1], g.unifyTint[2]); gl.uniform1f(loc.uUnifyStrength, g.unifyTintStrength); gl.uniform1f(loc.uUnifyContrast, g.unifyContrast);
        gl.uniform1f(loc.uEdgeOn, e.enabled); gl.uniform1f(loc.uBlendSky, e.blendSky); gl.uniform1f(loc.uBlendCity, e.blendCity);
        gl.uniform1f(loc.uSplit, d.split); gl.uniform1f(loc.uShowMask, d.mask); gl.uniform1f(loc.uShowSky, d.sky); gl.uniform1f(loc.uShowCity, d.city); gl.uniform1f(loc.uShowTitle, d.title);
        gl.viewport(0, 0, canvas.width, canvas.height); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); rt.frames++;
      },
      readPixels() { const w = canvas.width, h = canvas.height, px = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px); return { w, h, data: px, flipped: true }; } // bottom-up rows
    };
    return rt;
  }
  // ---- B7 scene fit (verbatim policy of the game shell: fitSlack + cityArt) — the prototype must keep the background bounds the game uses
  const cityArt = { w: 720, h: 1600, slackTop: 320, slackBottom: 0 };
  function fitSlack(width, height, art) { const stdH = art.h - art.slackTop - art.slackBottom, scale = Math.min(width / art.w, height / stdH), w = art.w * scale, h = art.h * scale, slack = art.slackTop + art.slackBottom; let top; if (h <= height) top = (height - h) / 2; else { const crop = h - height; top = -(slack ? crop * art.slackTop / slack : crop / 2); } return { w, h, left: (width - w) / 2, top }; }
  return { create, NEUTRAL_SKY, NEUTRAL_GLOBAL, NEUTRAL_EDGE, normalizeState, lerpState, fitSlack, cityArt, FS, VS };
})();
