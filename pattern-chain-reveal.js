/*
 * 《缀纹成章》Settlement cultural reveal — 按 structureType 动态生成过程（canvas）。
 * 终态视觉 authority = 真实 fullAsset：动画只用 mask reveal / progressive reveal / 镜像与旋转的中间运动 / path reveal 表现生成过程，
 * 不用 tile 机械复制拼出与最终 PNG 不同的终态；动画结束后由 UI 显示真实 fullAsset 图片。
 */
(function (root) {
  'use strict';
  const cache = new Map();
  function load(src) {
    if (cache.has(src)) return cache.get(src);
    const p = new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('IMG_LOAD ' + src)); im.src = src; });
    cache.set(src, p); return p;
  }
  const clamp01 = t => (t < 0 ? 0 : t > 1 ? 1 : t);
  const ease = t => { t = clamp01(t); return (1 - Math.cos(Math.PI * t)) / 2; };
  // 阶段：0–0.5 单元逐步出现（结构性中间运动）；0.3–1 真实图样按结构遮罩揭示；0.55–0.9 单元淡出
  const stages = p => ({ pg: ease(p / 0.5), pr: ease((p - 0.3) / 0.7), ga: 0.9 * (1 - clamp01((p - 0.55) / 0.35)) });
  function drawUnit(G, x, y, size, rot, mirror, alpha) {
    if (alpha <= 0) return;
    const { ctx, unit } = G; const ar = unit.naturalWidth / unit.naturalHeight; const w = ar >= 1 ? size : size * ar, h = ar >= 1 ? size / ar : size;
    ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, y); ctx.rotate(rot); if (mirror) ctx.scale(-1, 1); ctx.drawImage(unit, -w / 2, -h / 2, w, h); ctx.restore();
  }
  function revealClip(G, pr, pathFn) {
    if (pr <= 0) return; const { ctx, full, fx, fy, fw, fh } = G;
    ctx.save(); ctx.beginPath(); pathFn(ctx, pr); ctx.clip(); ctx.drawImage(full, fx, fy, fw, fh); ctx.restore();
  }
  const STRUCTURES = {
    // 八瓣莲花：单瓣围绕圆心逐步形成八瓣（中心辐射）→ 扇形扫描揭示真实图样
    RADIAL_ROSETTE(G, p) {
      const { cx, cy, fw } = G; const { pg, pr, ga } = stages(p); const R = fw / 2; const n = Math.min(8, Math.floor(pg * 8.999));
      for (let i = 0; i < n; i++) { const a = (-90 + 22.5 + 45 * i) * Math.PI / 180; drawUnit(G, cx + Math.cos(a) * R * 0.6, cy + Math.sin(a) * R * 0.6, R * 0.64, a + Math.PI / 2, false, ga); }
      revealClip(G, pr, (c, q) => { const a0 = -Math.PI / 2 - Math.PI / 8; c.moveTo(cx, cy); c.arc(cx, cy, R * 1.1, a0, a0 + Math.PI * 2 * q); c.closePath(); });
    },
    // 双龙：单龙左右镜像、向心合成 → 自中线向两侧揭示
    BILATERAL_SYMMETRY(G, p) {
      const { cx, cy, fw, fh, fy } = G; const { pg, pr, ga } = stages(p); const u = fh * 0.6; const x = fw * 0.55 + (fw * 0.2 - fw * 0.55) * pg;
      drawUnit(G, cx - x, cy, u, 0, false, ga); drawUnit(G, cx + x, cy, u, 0, true, ga);
      revealClip(G, pr, (c, q) => { c.rect(cx - (fw / 2) * q, fy, fw * q, fh); });
    },
    // 三兔共耳：同一母版兔按 120° 关系依次出现 → 旋转扫描揭示 roundel（共享三耳只存在于真实图样）
    ROTATIONAL_SHARED_EAR_ROUNDEL(G, p) {
      const { cx, cy, fw } = G; const { pg, pr, ga } = stages(p); const R = fw / 2; const n = Math.min(3, Math.floor(pg * 3.999));
      for (let i = 0; i < n; i++) { const a = (-90 + 120 * i) * Math.PI / 180; drawUnit(G, cx + Math.cos(a) * R * 0.45, cy + Math.sin(a) * R * 0.45, R * 0.62, a - Math.PI / 2, false, ga); }
      revealClip(G, pr, (c, q) => { c.moveTo(cx, cy); c.arc(cx, cy, R * 1.1, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * q); c.closePath(); });
    },
    // 石榴卷草：沿 S 形路径连续生长并改变石榴朝向 → 自上而下带波形前沿的路径揭示
    S_SCROLL_CONTINUOUS_BAND(G, p) {
      const { fx, fy, fw, fh, cx } = G; const { pg, pr, ga } = stages(p); const n = Math.min(3, Math.floor(pg * 3.999)); const u = fw * 0.55;
      for (let i = 0; i < n; i++) drawUnit(G, cx + (i % 2 ? -1 : 1) * fw * 0.1, fy + fh * (0.17 + 0.33 * i), u, 0, i % 2 === 1, ga);
      revealClip(G, pr, (c, q) => { const yE = fy + fh * q; c.moveTo(fx, fy); c.lineTo(fx + fw, fy); c.lineTo(fx + fw, yE); for (let k = 0; k <= 12; k++) { const t = k / 12; c.lineTo(fx + fw * (1 - t), yE + Math.sin(t * Math.PI * 2) * fh * 0.02); } c.closePath(); });
    },
    // 连珠纹：五珠直角单元沿四边延展并闭合 → 顺时针四段边框揭示
    SQUARE_BORDER_CONTINUOUS(G, p) {
      const { fx, fy, fw, fh } = G; const { pg, pr, ga } = stages(p); const th = fw * 0.27; const u = fw * 0.3;
      const corners = [[fx + th / 2, fy + th / 2, 0], [fx + fw - th / 2, fy + th / 2, Math.PI / 2], [fx + fw - th / 2, fy + fh - th / 2, Math.PI], [fx + th / 2, fy + fh - th / 2, -Math.PI / 2]];
      const n = Math.min(4, Math.floor(pg * 4.999)); for (let i = 0; i < n; i++) drawUnit(G, corners[i][0], corners[i][1], u, corners[i][2], false, ga);
      revealClip(G, pr, (c, q) => { const s = q * 4; const seg = k => clamp01(s - k); c.rect(fx, fy, fw * seg(0), th); if (s > 1) c.rect(fx + fw - th, fy, th, fh * seg(1)); if (s > 2) c.rect(fx + fw - fw * seg(2), fy + fh - th, fw * seg(2), th); if (s > 3) c.rect(fx, fy + fh - fh * seg(3), th, fh * seg(3)); });
    },
    // 菱形连续纹：单菱形向横纵方向扩展 → 菱形遮罩自中心向外揭示平铺
    TESSELLATED_REPEAT(G, p) {
      const { fw, fh, cx, cy } = G; const { pg, pr, ga } = stages(p); const px = fw * 470 / 1254, py = fh * 416 / 1254; const u = px * 0.9;
      const cells = [[0, 0], [0.5, 0.5], [-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [1, 0], [-1, 0], [0, 1], [0, -1]];
      const n = Math.min(cells.length, Math.floor(pg * (cells.length + 0.999))); for (let i = 0; i < n; i++) drawUnit(G, cx + cells[i][0] * px, cy + cells[i][1] * py, u, 0, false, ga);
      revealClip(G, pr, (c, q) => { const s = q * Math.max(fw, fh) + 1; /* 菱形遮罩：q=1 时恰好覆盖整个方形图样 */ c.moveTo(cx, cy - s); c.lineTo(cx + s, cy); c.lineTo(cx, cy + s); c.lineTo(cx - s, cy); c.closePath(); });
    },
    DEFAULT(G, p) { const { pr } = stages(p); const { ctx, full, fx, fy, fw, fh } = G; ctx.save(); ctx.globalAlpha = pr; ctx.drawImage(full, fx, fy, fw, fh); ctx.restore(); }
  };
  function play(canvas, o) {
    const duration = o.duration || 2400; let raf = 0, done = false;
    const handle = { cancel() { done = true; cancelAnimationFrame(raf); }, get done() { return done; } };
    Promise.all([load(o.unitSrc), load(o.fullSrc)]).then(([unit, full]) => {
      if (done) return;
      const box = canvas.getBoundingClientRect(); const dpr = Math.min(3, root.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(box.width * dpr)); canvas.height = Math.max(1, Math.round(box.height * dpr));
      const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const W = box.width, H = box.height; const s = Math.min(W / full.naturalWidth, H / full.naturalHeight);
      const fw = full.naturalWidth * s, fh = full.naturalHeight * s, fx = (W - fw) / 2, fy = (H - fh) / 2;
      const G = { ctx, unit, full, W, H, fw, fh, fx, fy, cx: fx + fw / 2, cy: fy + fh / 2 };
      const fn = STRUCTURES[o.structureType] || STRUCTURES.DEFAULT; const t0 = performance.now();
      function frame(now) {
        if (done) return; const p = clamp01((now - t0) / duration); ctx.clearRect(0, 0, W, H); fn(G, p);
        if (p < 1) raf = requestAnimationFrame(frame); else { done = true; ctx.clearRect(0, 0, W, H); ctx.drawImage(full, fx, fy, fw, fh); if (o.onDone) o.onDone(null); }
      }
      raf = requestAnimationFrame(frame);
    }).catch(err => { done = true; if (o.onDone) o.onDone(err); });
    return handle;
  }
  root.PatternChainReveal = { play, load, STRUCTURE_TYPES: Object.keys(STRUCTURES).filter(k => k !== 'DEFAULT') };
})(window);
