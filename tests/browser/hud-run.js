'use strict';
// HUD_POLISH_PATCH_v0.1 — runtime acceptance (headless Chrome, mobile emulation) over HUD_POLISH_ACCEPTANCE_CHECKLIST_v0.1:
// first-layer height unchanged, 30/20/50 columns, icon scales (×1.20 / ×1.20 / ×1.15), icon–number gap −4 px, groups centred,
// two-row time module (row 1 = old size + 1 px, single line, icon centred on row 1; row 2 = 商期 at ≈ ×1.15 integer px, numbers one
// weight up, left edge on the row-1 text start, ≈4 px net gap), nav icons ×1.30 with label size unchanged and gap −3 px, 20 % slots,
// centred stacks, hit area not smaller, nothing overflowing the first layer, states 未启程 / N / 22 日, across phone widths.
// Usage: node tests/browser/hud-run.js [label] [--root <dir>] [--port <http>] [--cdp <chrome port>]
const fs = require('fs'), path = require('path');
const { launch, startServer, sleep } = require('../tools/cdp');
const root = path.join(__dirname, '..', '..');
const argv = process.argv.slice(2), flag = n => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const label = argv.find((a, i) => !a.startsWith('--') && (i === 0 || !argv[i - 1].startsWith('--'))) || 'hud';
const serveRoot = flag('--root') ? path.resolve(flag('--root')) : root;
const outDir = path.join(root, 'tests', 'results', 'evidence', 'hud-' + label); fs.rmSync(outDir, { recursive: true, force: true }); fs.mkdirSync(outDir, { recursive: true });
const checks = [];
const check = (name, ok, detail) => { checks.push({ name, ok: Boolean(ok), detail: detail === undefined ? '' : String(detail).slice(0, 300) }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  ' + String(detail).slice(0, 200) : '')); };
const VIEWPORTS = [[390, 844, 'iphone13'], [375, 667, 'iphone8'], [360, 640, 'android-small'], [430, 932, 'iphone15promax'], [320, 568, 'iphone-se1']];
const MEASURE = `(()=>{const r=e=>{const b=e.getBoundingClientRect();return {x:+b.x.toFixed(1),y:+b.y.toFixed(1),w:+b.width.toFixed(1),h:+b.height.toFixed(1),right:+b.right.toFixed(1),bottom:+b.bottom.toFixed(1)}};const cs=e=>getComputedStyle(e);const px=v=>+parseFloat(v).toFixed(2);
  const hud=document.querySelector('.global-hud'),top=hud.querySelector('.hud-top'),nav=hud.querySelector('.hud-nav');const money=hud.querySelector('.money-status'),rep=hud.querySelector('.reputation-status'),time=hud.querySelector('.time-status');
  const H=px(cs(hud).height);const mi=money.querySelector('.ui-icon'),mv=money.querySelector('.status-value'),ri=rep.querySelector('.ui-icon'),rv=rep.querySelector('.status-value'),ti=time.querySelector('.ui-icon'),l1=time.querySelector('.date-line'),l2=time.querySelector('.trip-row'),num=time.querySelector('.trip-num'),block=time.querySelector('.time-block');
  const grp=e=>{const items=[...e.children];const a=items[0].getBoundingClientRect(),b=items[items.length-1].getBoundingClientRect();const slot=e.getBoundingClientRect();return {leftPad:+(Math.min(a.x,b.x)-slot.x).toFixed(1),rightPad:+(slot.right-Math.max(a.right,b.right)).toFixed(1)}};
  const cols=cs(top).gridTemplateColumns.split(' ').map(px);const tools=[...nav.querySelectorAll('.hud-tool')];
  return {vw:innerWidth,vh:innerHeight,H,hud:r(hud),top:r(top),nav:r(nav),cols,colRatio:cols.map(c=>+(c/r(top).w).toFixed(3)),
    money:{icon:r(mi),gap:+(r(mv).x-r(mi).right).toFixed(1),font:px(cs(mv).fontSize),center:grp(money)},rep:{icon:r(ri),gap:+(r(rv).x-r(ri).right).toFixed(1),font:px(cs(rv).fontSize),center:grp(rep)},
    time:{slot:r(time),icon:r(ti),block:r(block),line1:{...r(l1),font:px(cs(l1).fontSize),text:l1.textContent,overflow:l1.scrollWidth-l1.clientWidth,lines:Math.round(r(l1).h/(px(cs(l1).fontSize)*1.1))},line2:{...r(l2),font:px(cs(l2).fontSize),text:l2.innerText.replace(/\\s+/g,' '),weight:cs(l2).fontWeight,numWeight:num?cs(num).fontWeight:null,overflow:l2.scrollWidth-l2.clientWidth},iconCenterDelta:+((r(ti).y+r(ti).h/2)-(r(l1).y+r(l1).h/2)).toFixed(1),netGap:+(r(l2).y-r(l1).bottom).toFixed(1),indent:+(r(l2).x-r(l1).x).toFixed(1)},
    tools:tools.map(t=>{const i=t.querySelector('.ui-icon'),l=t.querySelector('.hud-label');return {label:l.textContent,slot:r(t).w,icon:r(i).w,labelFont:px(cs(l).fontSize),labelWeight:cs(l).fontWeight,gap:+(r(l).y-r(i).bottom).toFixed(1),stackCenter:+((r(i).x+r(i).w/2)-(r(t).x+r(t).w/2)).toFixed(1),hitH:r(t).h,hitW:r(t).w,bottom:r(l).bottom}}),
    hitBefore:px(cs(tools[0],'::before').height),labels:[...nav.querySelectorAll('.hud-label')].map(l=>l.textContent).join('/'),dividers:hud.querySelectorAll('hr, .hud-divider, .hud-chip, .journey-progress, progress').length}})()`;
(async () => {
  const port = Number(flag('--port')) || 8195, srv = startServer(port, serveRoot); await sleep(500);
  const shots = [];
  for (const [w, h, name] of VIEWPORTS) {
    const c = await launch({ port: (Number(flag('--cdp')) || 9415) + VIEWPORTS.findIndex(v => v[2] === name), width: w, height: h, mobile: true });
    const ev = js => c.eval(js);
    const clickText = text => ev(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>!b.disabled&&b.offsetParent!==null&&b.textContent.trim()===${JSON.stringify(text)});if(!b)return false;b.click();return true})()`);
    try {
      await c.navigate('http://127.0.0.1:' + port + '/'); await sleep(900); await ev('new Promise(r=>{const t=setInterval(()=>{if(window.Silk&&Silk.app&&Silk.app.state){clearInterval(t);r()}},100)})');
      if (await ev('Boolean(Silk.app.state.progress)')) { await ev("Silk.ui.dispatch('game.reset')"); await sleep(600); }
      await clickText('启程'); await ev('new Promise(r=>{const t=setInterval(()=>{const p=Silk.app.state.progress;if(p&&p.world){clearInterval(t);r()}},100)})'); await sleep(400); await clickText('自行探索'); await sleep(500);
      // realistic labels: day 26 at dusk (display only), then a trip in progress
      await ev("(()=>{Silk.app.state.progress.world.tick=77;Silk.ui.render(Silk.app.state);})()"); await sleep(300);
      const m = await ev(MEASURE); const H = m.H; const f = (k, base) => +(H * base).toFixed(1);
      const tag = name + ' ' + w + '×' + h;
      check(tag + ' A first layer height = 53% of the unchanged HUD height (' + m.top.h + ' / ' + m.hud.h + ')', Math.abs(m.top.h - m.hud.h * .53) < 1 && Math.abs(m.hud.h - (h * .089)) < 1.5, JSON.stringify({ hud: m.hud.h, top: m.top.h }));
      check(tag + ' A columns 30 / 20 / 50 (of the content box)', Math.abs(m.colRatio[0] - .3) < .006 && Math.abs(m.colRatio[1] - .2) < .006 && Math.abs(m.colRatio[2] - .5) < .006, m.colRatio.join('/'));
      check(tag + ' A 铜钱 / 鼎 icons ×1.20 (' + m.money.icon.w + ' px = 0.336H), 数字 font unchanged, gap −4 px → 0', Math.abs(m.money.icon.w - f(0, .336)) < .6 && Math.abs(m.rep.icon.w - f(0, .336)) < .6 && m.money.gap <= .5 && m.rep.gap <= .5 && Math.abs(m.money.font - Math.min(18, Math.max(11, H * .235))) < .3, JSON.stringify({ icon: m.money.icon.w, expect: f(0, .336), gap: m.money.gap, font: m.money.font }));
      check(tag + ' A groups centred in their slots (symmetric padding)', Math.abs(m.money.center.leftPad - m.money.center.rightPad) < 1.5 && Math.abs(m.rep.center.leftPad - m.rep.center.rightPad) < 1.5, JSON.stringify({ money: m.money.center, rep: m.rep.center }));
      check(tag + ' A enlarged icons stay inside the first-layer box', m.money.icon.y >= m.top.y - .5 && m.money.icon.bottom <= m.top.bottom + .5 && m.time.icon.y >= m.top.y - .5 && m.time.icon.bottom <= m.top.bottom + .5 && m.time.block.y >= m.top.y - .5 && m.time.block.bottom <= m.top.bottom + .5, JSON.stringify({ top: [m.top.y, m.top.bottom], money: [m.money.icon.y, m.money.icon.bottom], time: [m.time.icon.y, m.time.icon.bottom], block: [m.time.block.y, m.time.block.bottom] }));
      const line1Expected = Math.max(8, Math.min(13, Math.round(H * .139 + 1))), line2Expected = Math.round(line1Expected * 1.15);
      check(tag + ' B time icon ×1.15 (' + m.time.icon.w + ' px = 0.322H), centred on row 1', Math.abs(m.time.icon.w - f(0, .322)) < .6 && Math.abs(m.time.iconCenterDelta) <= 1, JSON.stringify({ icon: m.time.icon.w, expect: f(0, .322), delta: m.time.iconCenterDelta }));
      check(tag + ' B row 1 = old size + 1 px (' + m.time.line1.font + ' px), single line, no overflow: ' + m.time.line1.text, m.time.line1.font === line1Expected && m.time.line1.overflow <= 0 && m.time.line1.lines === 1 && /三月.*· (晨|午|暮)$/.test(m.time.line1.text) && !/tick/i.test(m.time.line1.text), JSON.stringify({ font: m.time.line1.font, expect: line1Expected, overflow: m.time.line1.overflow, w: m.time.line1.w, slot: m.time.slot.w }));
      check(tag + ' B row 2 = 商期　未启程 at round(row1 × 1.15) = ' + m.time.line2.font + ' px, left edge on the row-1 text start, ≈4 px net gap', m.time.line2.font === line2Expected && /^商期\s*未启程$/.test(m.time.line2.text) && Math.abs(m.time.indent) <= .5 && m.time.netGap >= 2.5 && m.time.netGap <= 5.5 && m.time.line2.overflow <= 0, JSON.stringify({ font: m.time.line2.font, expect: line2Expected, text: m.time.line2.text, indent: m.time.indent, netGap: m.time.netGap }));
      check(tag + ' B block fits the 50% slot with room (block ' + m.time.block.w + ' / slot ' + m.time.slot.w + ')', m.time.block.w <= m.time.slot.w - 4, JSON.stringify({ block: m.time.block.w, slot: m.time.slot.w }));
      check(tag + ' B no bar / chip / divider / third layer', m.dividers === 0 && m.nav.bottom <= m.hud.bottom + .5 && m.nav.y >= m.top.bottom - .5, JSON.stringify({ dividers: m.dividers }));
      check(tag + ' C order 行囊/委托/消息/商号/更多, icons ×1.30 (' + m.tools[0].icon + ' px = 0.364H), label font unchanged (' + m.tools[0].labelFont + ' px, weight ' + m.tools[0].labelWeight + '), gap −3 px, 20% slots, centred', m.labels === '行囊/委托/消息/商号/更多' && m.tools.every(t => Math.abs(t.icon - f(0, .364)) < .6 && Math.abs(t.labelFont - Math.min(11, Math.max(8, H * .145))) < .3 && t.labelWeight === '600' && Math.abs(t.gap + 3) <= .6 && Math.abs(t.slot - m.nav.w / 5) < .6 && Math.abs(t.stackCenter) <= 1), JSON.stringify(m.tools.map(t => ({ icon: t.icon, gap: t.gap, slot: t.slot, c: t.stackCenter }))));
      check(tag + ' C hit area not smaller (button ' + m.tools[0].hitW + '×' + m.tools[0].hitH + ', ::before ' + m.hitBefore + ' px) and stacks inside the HUD box (≤1 px)', m.tools.every(t => t.hitH >= m.nav.h - .5 && t.hitW >= m.nav.w / 5 - .6 && t.bottom <= m.hud.bottom + 1.2), JSON.stringify({ hit: [m.tools[0].hitW, m.tools[0].hitH], bottom: m.tools[0].bottom, hud: m.hud.bottom }));
      if (w === 390) { const shot = path.join(outDir, '01-' + name + '-unstarted.png'); await c.screenshot(shot); shots.push(shot); }
      // trip state (display only): 商期 N / 22 日 with heavier numbers
      await ev("(()=>{const p=Silk.app.state.progress;p.trip={id:'probe',startedAt:33,deadlineTick:99,arrivedChanganTick:null,returnStatus:null,phase:'in_city',routeIndex:1,routeHistory:['changan','dunhuang']};p.world.city='dunhuang';Silk.ui.render(Silk.app.state);})()"); await sleep(400);
      const t = await ev(MEASURE);
      check(tag + ' B trip state: 商期　15 / 22 日, numbers weight 600 vs text 400, still one line each, same layout', /^商期\s*15 \/ 22 日$/.test(t.time.line2.text) && t.time.line2.numWeight === '600' && t.time.line2.weight === '400' && t.time.line1.overflow <= 0 && t.time.line2.overflow <= 0 && Math.abs(t.time.indent) <= .5 && t.time.block.bottom <= t.top.bottom + .5, JSON.stringify({ text: t.time.line2.text, numWeight: t.time.line2.numWeight, overflow: [t.time.line1.overflow, t.time.line2.overflow], block: [t.time.block.y, t.time.block.bottom], top: [t.top.y, t.top.bottom] }));
      if (w === 390 || w === 320) { const shot = path.join(outDir, '02-' + name + '-trip.png'); await c.screenshot(shot); shots.push(shot); }
      const errs = c.console.filter(m => m.type === 'error' || m.type === 'exception').map(m => m.text.slice(0, 120)); check(tag + ' no console errors', errs.length === 0, JSON.stringify(errs.slice(0, 2)));
    } catch (e) { check(name + ' script error', false, String(e && e.message || e)); }
    await c.close();
  }
  srv.stop();
  const passed = checks.filter(x => x.ok).length;
  fs.writeFileSync(path.join(outDir, 'hud-run.json'), JSON.stringify({ label, passed, total: checks.length, checks, shots }, null, 2));
  console.log(`hud browser run [${label}]: ${passed}/${checks.length} → ` + outDir);
  process.exit(passed === checks.length ? 0 : 1);
})();
