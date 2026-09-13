'use strict';
// CITY_TIME_AND_INTERACTION_POLISH v0.1 — runtime acceptance (headless Chrome, 390×844 mobile emulation).
// A. r21: the r20 晨 / 午 / 暮 background filter + overlay were WITHDRAWN — no data-phase, no filter, no overlay; hotspot-free blocks of the scene are pixel-identical across the three phases
// B. scene hotspots: static edge + halo whose opacity alone breathes (3.6 s, ease-in-out, base .30 → peak .33), staggered non-sequentially,
//    no transform / label change, hit areas intact, paused while the scene is inert, unavailable entries static + weakened
// C. HUD entries: static hint, no animation · D. no time / resource change while idling, clicks unchanged, no console errors.
// Usage: node tests/browser/atmosphere-run.js [label] [--root <dir>] [--port <http>] [--cdp <chrome port>]
const fs = require('fs'), path = require('path');
const { launch, startServer, sleep } = require('../tools/cdp');
const root = path.join(__dirname, '..', '..');
const argv = process.argv.slice(2), flag = n => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const label = argv.find((a, i) => !a.startsWith('--') && (i === 0 || !argv[i - 1].startsWith('--'))) || 'atmosphere';
const serveRoot = flag('--root') ? path.resolve(flag('--root')) : root;
const outDir = path.join(root, 'tests', 'results', 'evidence', 'atmosphere-' + label); fs.rmSync(outDir, { recursive: true, force: true }); fs.mkdirSync(outDir, { recursive: true });
const checks = [];
const check = (name, ok, detail) => { checks.push({ name, ok: Boolean(ok), detail: detail === undefined ? '' : String(detail).slice(0, 400) }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  ' + String(detail).slice(0, 220) : '')); };
(async () => {
  const port = Number(flag('--port')) || 8280, srv = startServer(port, serveRoot); await sleep(500);
  const c = await launch({ port: Number(flag('--cdp')) || 9701, width: 390, height: 844, mobile: true });
  const ev = js => c.eval(js);
  const clickText = text => ev(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>!b.disabled&&b.offsetParent!==null&&b.textContent.trim().startsWith(${JSON.stringify(text)}));if(!b)return false;b.click();return true})()`);
  const st = () => ev('(()=>{const p=Silk.app.state.progress;return {tick:p.world.tick,cash:p.cash,city:p.world.city,phase:document.querySelector(".city-scene").dataset.phase||null,rev:Silk.app.state.meta.revision}})()');
  const setTick = async t => { await ev(`(()=>{const p=Silk.app.state.progress;p.world.tick=${t};Silk.ui.render(Silk.app.state);return true})()`); await sleep(250); };
  const PHASE = `(()=>{const scene=document.querySelector('.city-scene'),bg=scene.querySelector('.city-background'),ov=scene.querySelector('.city-atmosphere'),hudIcon=document.querySelector('.hud-tool .ui-icon'),label=scene.querySelector('.hotspot-label'),frame=scene.querySelector('.plaque-frame');const cs=e=>getComputedStyle(e);return {phase:scene.dataset.phase||null,hasPhaseAttr:scene.hasAttribute('data-phase'),worldPhase:Silk.time.phase(Silk.app.state.progress),bgFilter:cs(bg).filter,bgOpacity:cs(bg).opacity,overlay:ov?{bg:cs(ov).backgroundImage,opacity:cs(ov).opacity}:null,worldChildren:[...scene.querySelector('.scene-world').children].map(e=>e.className),hudIconFilter:cs(hudIcon).filter,hudColor:cs(document.querySelector('.hud-label')).color,labelColor:cs(label).color,labelFilter:cs(label).filter,frameFilter:cs(frame).filter}})()`;
  // three 64×64 CSS-px blocks of the visible background (top / middle / bottom of the scene) clear of every hotspot (+ its halo), the HUD and the map button
  const BLOCKS = `(()=>{const img=document.querySelector('.city-background');const ir=img.getBoundingClientRect();const vw=innerWidth,vh=innerHeight;const keep=[...document.querySelectorAll('.city-hotspot, .global-hud, .world-map-button, .notice-card')].map(e=>{const r=e.getBoundingClientRect();const px=r.width*.7,py=r.height*1.0;return [r.x-px,r.y-py,r.right+px,r.bottom+py]});const size=64;const free=(x,y)=>!keep.some(b=>x<b[2]&&x+size>b[0]&&y<b[3]&&y+size>b[1]);const top=Math.max(0,ir.y)+8,bottom=Math.min(vh,ir.bottom)-8,left=Math.max(0,ir.x)+8,right=Math.min(vw,ir.right)-8;const out=[];const scan=(y0,y1,step)=>{for(let y=y0;step>0?y+size<=y1:y>=y1;y+=step)for(let x=left;x+size<=right;x+=16)if(free(x,y))return {x,y,width:size,height:size};return null};const mid=(top+bottom)/2;for(const b of [scan(top,bottom,16),scan(mid,bottom,16),scan(bottom-size,top,-16)])if(b&&!out.some(o=>o.x===b.x&&o.y===b.y))out.push(b);return out})()`;
  const HALO = `(()=>{const hs=[...document.querySelectorAll('.city-hotspot')];return hs.map(h=>{const halo=h.querySelector('.hotspot-halo'),lab=h.querySelector('.hotspot-label'),cs=getComputedStyle(halo);const anims=halo.getAnimations();const kf=anims[0]?anims[0].effect.getKeyframes().map(k=>({offset:k.computedOffset,opacity:Number(k.opacity)})):null;const r=h.getBoundingClientRect();return {id:h.dataset.hotspot,availability:h.dataset.availability,name:cs.animationName,duration:cs.animationDuration,timing:cs.animationTimingFunction,iteration:cs.animationIterationCount,direction:cs.animationDirection,delay:cs.animationDelay,play:anims[0]?anims[0].playState:null,keyframes:kf,opacity:Number(cs.opacity),pe:cs.pointerEvents,z:cs.zIndex,labelOpacity:getComputedStyle(lab).opacity,transform:getComputedStyle(h).transform,cx:r.x+r.width/2,cy:r.y+r.height/2,w:r.width,h:r.height,hotAnims:h.getAnimations({subtree:true}).length}})})()`;
  const SAMPLE = `(()=>{const hs=[...document.querySelectorAll('.city-hotspot')];return hs.map(h=>({id:h.dataset.hotspot,o:+Number(getComputedStyle(h.querySelector('.hotspot-halo')).opacity).toFixed(4),lo:getComputedStyle(h.querySelector('.hotspot-label')).opacity,fo:getComputedStyle(h.querySelector('.plaque-frame')).opacity,tr:getComputedStyle(h).transform,rect:[h.getBoundingClientRect().x,h.getBoundingClientRect().y]}))})()`;
  try {
    await c.navigate('http://127.0.0.1:' + port + '/'); await sleep(900); await ev('new Promise(r=>{const t=setInterval(()=>{if(window.Silk&&Silk.app&&Silk.app.state){clearInterval(t);r()}},100)})');
    if (await ev('Boolean(Silk.app.state.progress)')) { await ev("Silk.ui.dispatch('game.reset')"); await sleep(600); }
    await clickText('启程'); await ev('new Promise(r=>{const t=setInterval(()=>{const p=Silk.app.state.progress;if(p&&p.world){clearInterval(t);r()}},100)})'); await sleep(400); await clickText('自行探索'); await sleep(700);
    let s = await st(); check('setup: 长安 city scene at tick 0 (晨); the scene carries no data-phase (r21: background filter withdrawn)', s.city === 'changan' && s.tick === 0 && s.phase === null, JSON.stringify(s));
    // ---------------- A. background untouched at every phase (r21: the r20 晨 / 午 / 暮 filter + overlay were withdrawn; the world time still advances, the scene just no longer paints it)
    const phases = {}, clips = {};
    for (const [tick, name] of [[0, 'morning'], [1, 'noon'], [2, 'dusk']]) {
      await setTick(tick); phases[name] = await ev(PHASE); const blocks = await ev(BLOCKS); clips[name] = [];
      for (const b of blocks) clips[name].push((await c.send('Page.captureScreenshot', { format: 'png', clip: { x: b.x, y: b.y, width: b.width, height: b.height, scale: 1 } })).data);
      phases[name].blocks = blocks; await c.screenshot(path.join(outDir, 'phase-' + name + '.png'));
    }
    check('A the world phase still advances (Silk.time.phase 0 / 1 / 2) while the scene exposes no data-phase at any tick', [phases.morning, phases.noon, phases.dusk].map(x => x.worldPhase).join() === '0,1,2' && Object.values(phases).every(x => x.phase === null && !x.hasPhaseAttr), JSON.stringify(Object.values(phases).map(x => [x.worldPhase, x.phase, x.hasPhaseAttr])));
    check('A background image untouched: computed filter none, opacity 1, no .city-atmosphere overlay, .scene-world = one background image + the hotspots, at every tick', Object.values(phases).every(x => x.bgFilter === 'none' && x.bgOpacity === '1' && x.overlay === null && x.worldChildren.filter(k => /city-background/.test(k)).length === 1 && x.worldChildren.length >= 6 && x.worldChildren.every(k => /city-background|city-hotspot/.test(k))), JSON.stringify({ filters: Object.values(phases).map(x => x.bgFilter), children: phases.morning.worldChildren }));
    check('A hotspot-free blocks of the scene (sky / middle / ground) are pixel-identical across 晨 / 午 / 暮 (no tint, dimming or colour grading)', phases.morning.blocks.length >= 2 && clips.morning.length === clips.noon.length && clips.morning.length === clips.dusk.length && clips.morning.every((d, i) => d === clips.noon[i] && d === clips.dusk[i]), JSON.stringify(phases.morning.blocks));
    check('A HUD icon / label, plaque frame and hotspot label styles identical across phases', new Set(Object.values(phases).map(x => x.hudIconFilter + '|' + x.hudColor + '|' + x.labelColor + '|' + x.frameFilter + '|' + x.labelFilter)).size === 1, JSON.stringify({ hud: phases.morning.hudIconFilter, label: phases.morning.labelColor }));
    // ---------------- B. hotspot halo
    await setTick(0); let halos = await ev(HALO);
    check('B every available hotspot has a halo breathing on opacity only: hotspotBreath 3.6s ease-in-out infinite alternate, keyframes .30 → .33 (+10 % of the base)', halos.length >= 5 && halos.filter(h => h.availability === 'available').every(h => h.name === 'hotspotBreath' && h.duration === '3.6s' && h.timing === 'ease-in-out' && h.iteration === 'infinite' && h.direction === 'alternate' && h.play === 'running' && h.keyframes && h.keyframes.length === 2 && Math.abs(h.keyframes[0].opacity - .30) < .001 && Math.abs(h.keyframes[1].opacity - .33) < .001 && h.pe === 'none' && h.hotAnims === 1), JSON.stringify(halos.map(h => [h.id, h.name, h.duration, h.timing, h.direction, h.play, h.keyframes])));
    const delays = halos.map(h => parseFloat(h.delay)); const sorted = [...delays].sort((a, b) => a - b);
    check('B phases staggered, not sequential (delays neither ascending nor descending in scene order)', new Set(delays).size >= 4 && delays.join() !== sorted.join() && delays.join() !== sorted.reverse().join(), JSON.stringify(delays));
    const samples = []; const t0 = Date.now(); for (let i = 0; i < 14; i++) { samples.push({ t: Date.now() - t0, v: await ev(SAMPLE) }); if (i < 6) await c.screenshot(path.join(outDir, 'breath-frame-' + String(i).padStart(2, '0') + '.png')); await sleep(300); }
    const byId = {}; for (const smp of samples) for (const h of smp.v) (byId[h.id] = byId[h.id] || []).push(h);
    const stats = Object.entries(byId).map(([id, rows]) => ({ id, min: Math.min(...rows.map(r => r.o)), max: Math.max(...rows.map(r => r.o)), labelSteady: new Set(rows.map(r => r.lo + '|' + r.fo + '|' + r.tr + '|' + r.rect.join(','))).size === 1 }));
    const market = stats.find(x => x.id === 'market');
    check('B observed over ≈4 s (14 samples): halo opacity stays within [.30, .33] and actually moves (never dims out, never brighter than the peak); labels, frames, transforms and positions steady', stats.filter(x => x.id !== 'work' || true).every(x => x.min >= .295 && x.max <= .335 && x.labelSteady) && stats.some(x => x.max - x.min >= .012), JSON.stringify(stats));
    fs.writeFileSync(path.join(outDir, 'halo-samples.json'), JSON.stringify({ samples, stats }, null, 1));
    const hit = await ev(`(()=>{return [...document.querySelectorAll('.city-hotspot')].map(h=>{const r=h.getBoundingClientRect();const e=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {id:h.dataset.hotspot,hit:Boolean(e&&e.closest('.city-hotspot')===h)}})})()`);
    check('B hit test: the element under every hotspot centre is the hotspot itself (halo / overlay never intercept)', hit.every(h => h.hit), JSON.stringify(hit));
    // click behaviour unchanged: 市场 opens the market panel; scene inert → breathing paused; leave (no trade) → 0 tick
    const before = await st(); await ev(`document.querySelector('.city-hotspot[data-hotspot="market"]').click()`); await sleep(800);
    const paused = await ev(`(()=>{const scene=document.querySelector('.city-scene');const a=scene.querySelector('.hotspot-halo').getAnimations()[0];return {inert:scene.inert,play:a?a.playState:null,market:Boolean(document.querySelector('[data-panel-id="market"]'))}})()`);
    check('B 市场 hotspot still opens the market; while a panel covers the scene (inert) the breathing is paused', paused.market && paused.inert && paused.play === 'paused', JSON.stringify(paused));
    await clickText('离开市场'); await sleep(500); s = await st();
    const resumed = await ev(`(()=>{const scene=document.querySelector('.city-scene');const a=scene.querySelector('.hotspot-halo').getAnimations()[0];return {inert:scene.inert,play:a?a.playState:null}})()`);
    check('B leaving the market (no trade) returns to the city with 0 tick; breathing resumes', s.tick === before.tick && !resumed.inert && resumed.play === 'running', JSON.stringify({ tick: [before.tick, s.tick], resumed }));
    // unavailable entry: 营生 outside 长安 / 敦煌 (existing 敬请期待 rule) — static, weakened, label readable
    await ev(`(()=>{const p=Silk.app.state.progress;p.world.city='khotan';Silk.ui.render(Silk.app.state);return true})()`); await sleep(400);
    const kh = await ev(HALO); const work = kh.find(h => h.id === 'work');
    const workLabel = await ev(`(()=>{const l=document.querySelector('.city-hotspot[data-hotspot="work"] .hotspot-label');const cs=getComputedStyle(l);return {color:cs.color,opacity:cs.opacity,text:l.textContent}})()`);
    check('B unavailable entry (于阗 营生): no breathing, weaker static halo, label still readable', work && work.availability === 'unavailable' && work.name === 'none' && work.opacity <= .2 && kh.filter(h => h.id !== 'work').every(h => h.name === 'hotspotBreath') && workLabel.opacity === '1' && workLabel.text === '营生', JSON.stringify({ work: work && [work.availability, work.name, work.opacity], label: workLabel }));
    await c.screenshot(path.join(outDir, 'khotan-unavailable-work.png'));
    await ev(`(()=>{const p=Silk.app.state.progress;p.world.city='changan';Silk.ui.render(Silk.app.state);return true})()`); await sleep(400);
    // ---------------- C. HUD
    const hud = await ev(`(()=>{const tools=[...document.querySelectorAll('.hud-tool')];return tools.map(t=>{const i=t.querySelector('.ui-icon');const cs=getComputedStyle(i);return {id:t.dataset.panel,filter:cs.filter,anims:t.getAnimations({subtree:true}).length,disabled:t.disabled}})})()`);
    const hudA = await ev(`[...document.querySelectorAll('.hud-tool .ui-icon')].map(i=>getComputedStyle(i).opacity+'|'+getComputedStyle(i).filter)`); await sleep(1500); const hudB = await ev(`[...document.querySelectorAll('.hud-tool .ui-icon')].map(i=>getComputedStyle(i).opacity+'|'+getComputedStyle(i).filter)`);
    check('C five HUD entries carry a static edge + low halo (drop-shadow filter), no animation, unchanged after 1.5 s', hud.length === 5 && hud.every(t => /drop-shadow/.test(t.filter) && t.anims === 0) && JSON.stringify(hudA) === JSON.stringify(hudB), JSON.stringify(hud.map(t => [t.id, t.anims])));
    // ---------------- D. idle: no time / resource change; reduced motion honoured
    const idle0 = await st(); await sleep(5000); const idle1 = await st();
    check('D idling 5 s on the city scene changes nothing (tick, cash, revision)', idle0.tick === idle1.tick && idle0.cash === idle1.cash && idle0.rev === idle1.rev, JSON.stringify({ idle0, idle1 }));
    await c.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }); await sleep(300);
    const rm = await ev(`getComputedStyle(document.querySelector('.city-hotspot .hotspot-halo')).animationName`); check('D prefers-reduced-motion: reduce → halo static (animation none)', rm === 'none', rm);
    await c.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
    const errs = c.console.filter(m => m.type === 'error' || m.type === 'exception').map(m => m.text.slice(0, 160)); check('no console errors', errs.length === 0, JSON.stringify(errs.slice(0, 3)));
  } catch (e) { check('script error', false, String(e && e.stack || e).slice(0, 400)); }
  await c.close(); srv.stop();
  const passed = checks.filter(x => x.ok).length;
  fs.writeFileSync(path.join(outDir, 'atmosphere-run.json'), JSON.stringify({ label, passed, total: checks.length, checks }, null, 2));
  console.log(`atmosphere browser run [${label}]: ${passed}/${checks.length} → ` + outDir);
  process.exit(passed === checks.length ? 0 : 1);
})();
