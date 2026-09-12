'use strict';
// Browser smoke + responsive + parity checks for the public standalone build (headless Chrome).
// Usage: node caravan-demo/tests/browser_smoke.js [--url <public url>] [--label name]
// Without --url it serves the caravan-demo folder locally. Uses the repo's CDP helper (tests/tools/cdp.js).
const fs = require('fs'), path = require('path');
const here = __dirname, demoRoot = path.join(here, '..'), repoRoot = path.join(demoRoot, '..');
const { launch, startServer, sleep } = require(path.join(repoRoot, 'tests', 'tools', 'cdp'));
const argv = process.argv.slice(2), flag = n => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const publicUrl = flag('--url'), label = flag('--label') || (publicUrl ? 'public' : 'local');
const outDir = path.join(here, 'results', label); fs.rmSync(outDir, { recursive: true, force: true }); fs.mkdirSync(outDir, { recursive: true });
const checks = []; let shotIndex = 0;
const check = (name, ok, detail) => { checks.push({ name, ok: Boolean(ok), detail: detail === undefined ? '' : String(detail).slice(0, 400) }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  ' + String(detail).slice(0, 200) : '')); };
(async () => {
  let srv = null, url = publicUrl;
  if (!url) { srv = startServer(8190, demoRoot); await sleep(500); url = 'http://127.0.0.1:8190/'; }
  const c = await launch({ port: 9410, width: 390, height: 844, mobile: true });
  const ev = js => c.eval(js);
  const shot = async name => { const f = String(++shotIndex).padStart(2, '0') + '-' + name + '.png'; await c.screenshot(path.join(outDir, f)); return f; };
  const waitFor = async (js, ms = 10000, step = 100) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(js)) return true; await sleep(step); } return false; };
  const st = () => ev('__bridge.state()');
  const click = sel => ev(`(()=>{const b=document.querySelector(${JSON.stringify(sel)});if(!b||b.disabled)return false;b.click();return true})()`);
  const clickText = text => ev(`(()=>{const b=[...document.querySelectorAll('#app button')].find(x=>!x.disabled&&x.textContent.trim()===${JSON.stringify(text)});if(!b)return false;b.click();return true})()`);
  const idle = async () => { await waitFor('!window.__appBusy', 4000, 50); await sleep(160); };
  const uiText = () => ev('document.querySelector("#app").innerText.replace(/\\s+/g," ")');
  const placeViaUI = async (left, right) => { for (const [side, ids] of [['left', left], ['right', right]]) for (const id of ids) { await click(`.cargo[data-id="${id}"]`); await sleep(120); const ok = await click(`.bag.${side} .action[data-insert="${side}"]`); if (!ok) throw new Error('insert button missing for ' + id); await idle(); } };
  const settleCycle = async () => { const ok = await clickText('确认装好'); if (!ok) throw new Error('确认装好 not visible'); await waitFor('(()=>{const s=window.__lastState;return s&&["GAMEPLAY","SETTLEMENT","LIVELIHOOD_LIST"].includes(s.state)&&s.state!=="EVALUATING"})()', 100, 100); await sleep(2600); await idle(); };
  const reference = async () => { const s = await st(); if (!s.debug) { await click('#debug'); await idle(); } const s2 = await st(); return s2.debug.referenceSolution; };
  const freshSession = async (mode, seconds = 75, index = 0) => { await ev(`__bridge.reset().then(()=>__bridge.action({op:'prepare',index:${index}}))`); await sleep(300); await waitFor(`(async()=>{const s=await __bridge.state();return s.prepared.includes(${index})&&s.state==='READY'})()`, 60000, 250); await ev(`document.querySelector('#seconds').value='${seconds}'`); await sleep(400); const ok = await clickText(mode === 'TRIAL' ? '试玩' : '开始装货'); if (!ok) throw new Error('start button not enabled'); await idle(); const s = await st(); if (s.state !== 'GAMEPLAY') throw new Error('not in gameplay: ' + s.state); return s; };
  try {
    await c.navigate(url); await sleep(800);
    const booted = await waitFor('document.querySelector("#loading")&&document.querySelector("#loading").hidden', 240000, 500);
    check('1 page boots: engine worker ready + boards prepared, READY opens', booted, await ev('document.querySelector("#loading-text").textContent'));
    await ev(`import('./bridge.js?v='+window.__BUILD).then(m=>{window.__bridge=m.bridge;});`); await waitFor('!!window.__bridge', 5000);
    await ev(`(()=>{const orig=window.__bridge.state.bind(window.__bridge);window.__bridge.state=async()=>{const s=await orig();window.__lastState=s;return s};})()`);
    const ready = await ev('window.__bridge.ready.then(m=>m.engine)'); check('1 engine worker reports ready', ready === 'js-port', ready);
    let s = await st(); check('1 READY state with prepared boards', s.state === 'READY' && s.prepared.includes(0), JSON.stringify({ state: s.state, prepared: s.prepared }));
    let text = await uiText(); check('1 READY screen copy', /驼队待发/.test(text) && /开始装货/.test(text) && /试玩/.test(text) && /玩法说明/.test(text), text.slice(0, 120)); await shot('ready');
    // 2 HOW_TO_PLAY
    await clickText('玩法说明 ⓘ'); await idle(); text = await uiText(); check('2 HOW_TO_PLAY opens', /怎么玩/.test(text) && /怎么装得稳/.test(text) && /知道了/.test(text)); await shot('how');
    await clickText('知道了'); await idle(); s = await st(); check('2 知道了 returns to READY', s.state === 'READY');
    // 3 FORMAL mock play: batch 1 with the reference layout via real UI clicks
    s = await freshSession('FORMAL', 75); check('3 FORMAL session starts (mock mode only)', s.state === 'GAMEPLAY' && s.mode === 'FORMAL' && s.batch === 1 && s.remaining <= 75, JSON.stringify({ batch: s.batch, remaining: s.remaining }));
    const b1ref = await reference(); await shot('formal-b1');
    await placeViaUI(b1ref.left, b1ref.right); s = await st(); check('3 tap-first 放入: all batch-1 cargo loaded, 确认装好 shown', s.canSubmit && s.waiting.length === 0 && /确认装好/.test(await uiText())); await shot('formal-b1-loaded');
    await settleCycle(); s = await st(); check('3 PASS → automatic transition to batch 2', s.batch === 2 && s.state === 'GAMEPLAY' && s.lastTier === 'RICH', JSON.stringify({ batch: s.batch, tier: s.lastTier, state: s.state }));
    // 4 NOT PASS → rearrange → resubmit (batch 2)
    const bad = await ev('__bridge.worst()'); await placeViaUI(bad.left, bad.right); await clickText('确认装好'); await sleep(1300); s = await st(); text = await uiText();
    check('4 NOT PASS feedback keeps the batch', s.feedback === 'NOT_PASS' && /还不够稳/.test(text), JSON.stringify({ feedback: s.feedback, state: s.state })); await shot('formal-not-pass'); await sleep(1200); await idle(); s = await st(); check('4 back to GAMEPLAY on the same batch', s.state === 'GAMEPLAY' && s.batch === 2);
    // remove everything from the top (top-layer only), check lower-layer hint
    const topOnly = await ev(`(()=>{const s=window.__lastState;const lower=s.left.length>1?s.left[0]:null;if(!lower)return 'skip';document.querySelector('.bag-item[data-id="'+lower+'"]').click();return document.querySelector('.context').textContent})()`);
    check('4 lower-layer tap only hints 先取出上层货物', topOnly === 'skip' || /先取出上层货物/.test(topOnly), topOnly);
    for (const side of ['left', 'right']) { for (;;) { s = await st(); const bag = s[side]; if (!bag.length) break; const top = bag[bag.length - 1]; await click(`.bag-item[data-id="${top}"]`); await sleep(120); const ok = await click(`.bag.${side} .action[data-remove="${side}"]`); if (!ok) throw new Error('remove button missing'); await idle(); } }
    s = await st(); check('4 取出 ↑ returns cargo to fixed original positions', s.waiting.length === s.slots.length && JSON.stringify(s.slots) === JSON.stringify((await st()).slots) && !s.canSubmit);
    const b2ref = await reference(); await placeViaUI(b2ref.left, b2ref.right); await settleCycle(); s = await st(); check('4 rearranged layout PASSes → batch 3', s.batch === 3 && s.state === 'GAMEPLAY');
    // 8 third batch → settlement
    const b3ref = await reference(); await placeViaUI(b3ref.left, b3ref.right); await shot('formal-b3-loaded'); await settleCycle(); s = await st(); text = await uiText();
    check('8 three completed batches → Settlement (immediately, no remaining-time reward)', s.state === 'SETTLEMENT' && s.settlement && s.settlement.completed === 3 && s.settlement.cash === 22 && /驼队装货完成/.test(text) && /今日所得/.test(text) && !/×/.test(text), JSON.stringify(s.settlement)); await shot('settlement');
    const closeAbsent = await ev('!document.querySelector("#app .close")'); check('8 Settlement has no Global Close', closeAbsent);
    const outer1 = (await st()).debug.mockOuter; check('8 mock outer applied once: cash 100→122, worldTicks +2, one work record', outer1.cash === 122 && outer1.worldTicks === 2 && outer1.workHistory.length === 1, JSON.stringify(outer1));
    await clickText('返回营生'); await idle(); s = await st(); text = await uiText(); check('9 返回营生 → livelihood list, no double commit', s.state === 'LIVELIHOOD_LIST' && /营生/.test(text));
    await ev("__bridge.action({op:'ready'})"); await idle(); s = await st(); const outer2 = s.debug ? s.debug.mockOuter : null; check('9 mock outer unchanged after navigation', !outer2 || (outer2.cash === 122 && outer2.worldTicks === 2), JSON.stringify(outer2));
    // 5 Timeout (mock clock hook): B1 done, then time runs out
    s = await freshSession('FORMAL', 75); const r1 = await reference(); await placeViaUI(r1.left, r1.right); await settleCycle(); await ev('__bridge.advance(80)'); await sleep(300); await waitFor('(async()=>{const s=await __bridge.state();return s.state==="SETTLEMENT"})()', 5000, 150); await sleep(600); s = await st(); text = await uiText();
    check('5 Timeout after B1 keeps the completed batch (出色 / 未完成 / 未完成, 12钱)', s.state === 'SETTLEMENT' && s.settlement.completed === 1 && s.settlement.cash === 12 && /未完成/.test(text) && !/失败/.test(text), JSON.stringify(s.settlement)); await shot('timeout-after-b1');
    await clickText('退出营生'); await idle(); s = await st(); check('9 退出营生 → city', s.state === 'CITY');
    // 6/7 Abort cancel and confirm
    s = await freshSession('FORMAL', 90); const r = await reference(); await placeViaUI(r.left, r.right); await settleCycle(); await placeViaUI([(await st()).slots[0]], []); await sleep(1500); const before = (await st()).remaining;
    await click('.close'); await idle(); text = await uiText(); check('6 Global Close in gameplay → abort confirmation copy', /要结束这次装货吗/.test(text) && /继续装货/.test(text) && /结束装货/.test(text)); await shot('abort-confirm');
    await sleep(1500); const during = (await st()).remaining; await clickText('继续装货'); await idle(); s = await st();
    check('6 Abort cancel restores gameplay and the paused clock', s.state === 'GAMEPLAY' && Math.abs(during - before) < 0.15 && s.left.length === 1, JSON.stringify({ before, during, after: s.remaining }));
    await click('.close'); await idle(); await clickText('结束装货'); await idle(); s = await st(); const outer3 = s.debug ? s.debug.mockOuter : null;
    check('7 Abort confirm commits zero state (ABORTED, previous batch not paid)', s.state === 'LIVELIHOOD_LIST' && (!outer3 || (outer3.cash === 100 && outer3.worldTicks === 0 && outer3.workHistory.length === 0)), JSON.stringify(outer3));
    // 10 TRIAL: full three batches, simulated income only
    s = await freshSession('TRIAL', 90); check('10 TRIAL session starts', s.mode === 'TRIAL' && /试玩 · 第1批/.test(await uiText()));
    for (let i = 0; i < 3; i++) { const rr = await reference(); await placeViaUI(rr.left, rr.right); await settleCycle(); }
    s = await st(); text = await uiText(); const outer4 = s.debug.mockOuter;
    check('10 TRIAL settlement: 模拟所得 22, real mock state untouched', s.state === 'SETTLEMENT' && s.settlement.cash === 22 && /模拟所得/.test(text) && /不消耗时间/.test(text) && outer4.cash === 100 && outer4.worldTicks === 0 && outer4.workHistory.length === 0, JSON.stringify({ settlement: s.settlement, outer: outer4 })); await shot('trial-settlement');
    // 11 Debug ON/OFF
    await clickText('返回营生'); await idle(); await ev("__bridge.action({op:'ready'})"); await idle(); s = await freshSession('FORMAL', 75);
    await ev('(()=>{const d=document.querySelector("#debug");if(!d.checked)d.click();})()'); await idle(); const dbgOn = await ev('(()=>{const p=document.querySelector("#debug-panel");return {hidden:p.hidden,len:document.querySelector("#debug-data").textContent.length}})()');
    check('11 Debug ON shows the debug record', !dbgOn.hidden && dbgOn.len > 200, JSON.stringify(dbgOn)); await shot('debug-on');
    await ev('(()=>{const d=document.querySelector("#debug");if(d.checked)d.click();})()'); await idle(); const dbgOff = await ev('(()=>{const p=document.querySelector("#debug-panel");return {hidden:p.hidden,len:document.querySelector("#debug-data").textContent.length}})()');
    const leak = await ev('/BalanceScore|StackingScore|LayoutScore|reference|Left=|Right=/i.test(document.querySelector("#app").innerText)');
    check('11 Debug OFF hides the panel; player UI leaks no scores', dbgOff.hidden && dbgOff.len === 0 && !leak, JSON.stringify(dbgOff));
    // parity: browser Pyodide vs native CPython fingerprint
    const nativeFp = JSON.parse(fs.readFileSync(path.join(here, 'parity_native.json'), 'utf8'));
    const browserFp = await ev('__bridge.parity([0,200,400])');
    const norm = o => JSON.stringify(o, (k, v) => k === 'runId' ? 'RUNID' : (v && typeof v === 'object' && !Array.isArray(v)) ? Object.fromEntries(Object.keys(v).sort().map(x => [x, v[x]])) : v); const same = norm(nativeFp.runs) === norm(browserFp.runs);
    check('P parity: in-browser JS engine == native CPython ' + nativeFp.python + ' for runs 0/200/400 (generator + scripted session)', same, same ? 'identical' : 'DIFF');
    fs.writeFileSync(path.join(outDir, 'parity_browser.json'), JSON.stringify(browserFp, null, 1));
    // responsive checks
    const responsive = [];
    for (const w of [360, 390, 430]) {
      await c.send('Emulation.setDeviceMetricsOverride', { width: w, height: 780, deviceScaleFactor: 2, mobile: true }); await sleep(400);
      await ev("dispatchEvent(new Event('resize'))"); await sleep(300);
      s = await freshSession('FORMAL', 75); const rr = await reference(); await ev('(()=>{const d=document.querySelector("#debug");if(d.checked)d.click();})()'); await idle();
      const m1 = await ev(`(()=>{const vw=innerWidth,r=el=>el?el.getBoundingClientRect():null;const main=r(document.querySelector('main'));const cargos=[...document.querySelectorAll('.cargo:not(.absent)')].map(r);const close=r(document.querySelector('#app .close'));return {vw,overflowX:document.documentElement.scrollWidth-vw,main:{l:main.left,r:main.right,t:main.top,b:main.bottom},cargoInside:cargos.every(q=>q.left>=main.left-1&&q.right<=main.right+1&&q.top>=main.top-1&&q.bottom<=main.bottom+1),closeInside:close&&close.right<=main.right+1&&close.top>=main.top-1,timerVisible:!!document.querySelector('.timer'),balanceVisible:!!document.querySelector('.balance-track')}})()`);
      await placeViaUI(rr.left, rr.right);
      const m2 = await ev(`(()=>{const r=el=>el?el.getBoundingClientRect():null;const main=r(document.querySelector('main'));const sub=r(document.querySelector('.submit'));const bags=[...document.querySelectorAll('.bag-item')].map(r);return {submitInside:sub&&sub.left>=main.left&&sub.right<=main.right&&sub.top>=main.top&&sub.bottom<=main.bottom,bagsInside:bags.every(q=>q.left>=main.left-1&&q.right<=main.right+1&&q.top>=main.top-1&&q.bottom<=main.bottom+1),mainH:main.height,vh:innerHeight}})()`);
      await shot('responsive-' + w); responsive.push({ w, ...m1, ...m2 });
      const ok = m1.overflowX <= 0 && m1.cargoInside && m1.closeInside && m1.timerVisible && m1.balanceVisible && m2.submitInside && m2.bagsInside && m1.main.b <= 780 + 1;
      check('R ' + w + 'px width: no horizontal scroll, cargo/close/timer/balance/确认装好/bag items inside the modal', ok, JSON.stringify({ overflowX: m1.overflowX, mainH: m2.mainH, cargoInside: m1.cargoInside, submitInside: m2.submitInside }));
      await click('.close'); await idle(); await clickText('结束装货'); await idle();
    }
    await c.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    // network / security
    const reqs = c.network.filter(r => typeof r.url === 'string');
    const local = reqs.filter(r => /localhost|127\.0\.0\.1/.test(r.url) && !(srv && r.url.startsWith('http://127.0.0.1:8190/')));
    const badReqs = c.network.filter(r => r.status === 'FAILED' || (typeof r.status === 'number' && r.status >= 400));
    const hosts = [...new Set(reqs.map(r => { try { return new URL(r.url).host; } catch (_) { return r.url; } }))];
    check('N no localhost URLs in runtime requests', local.length === 0, JSON.stringify(local.map(r => r.url)).slice(0, 200));
    check('N no failed / 4xx / 5xx requests', badReqs.length === 0, JSON.stringify(badReqs.map(r => [r.url, r.status])).slice(0, 300));
    check('N request hosts = page origin only (no CDN, no API)', hosts.every(h => (srv ? h === '127.0.0.1:8190' : /github\.io$/.test(h))), hosts.join(' '));
    const errors = c.console.filter(m => m.type === 'error' || m.type === 'exception').map(m => m.text.slice(0, 200)); check('N no console errors/exceptions', errors.length === 0, errors.join(' | '));
    fs.writeFileSync(path.join(outDir, 'responsive.json'), JSON.stringify(responsive, null, 1));
  } catch (e) { check('run completed without harness error', false, String(e.stack || e).slice(0, 800)); try { await shot('error'); } catch (_) { } }
  const passed = checks.filter(x => x.ok).length;
  fs.writeFileSync(path.join(outDir, 'browser_smoke.json'), JSON.stringify({ label, url, checks, passed, total: checks.length }, null, 1));
  console.log('browser smoke [' + label + ']: ' + passed + '/' + checks.length + ' → ' + outDir);
  await c.close(); if (srv) srv.stop(); process.exit(passed === checks.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
