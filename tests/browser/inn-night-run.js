'use strict';
// GUESTHOUSE_RANDOM_EVENT_SETTLEMENT_FIX_v1.0 — real-browser acceptance (headless Chrome, 390×844 mobile emulation, the real
// IndexedDB command store). Scenario from the checklist: 100 钱 at dusk in 长安, 留宿客舍 −5, night event G11 "keep" +12 → 107.
// Checks: HUD already 107 while the result card shows +12; double-click on the choice and on the confirmations settles once;
// reload after the event keeps 107 and refuses a second claim; reload in the middle of the event (after lodging, before the choice)
// restores the same occurrence without re-rolling; plain stay → 95; no backstage ids in player-visible text.
// Usage: node tests/browser/inn-night-run.js [label] [--root <dir>] [--port <http>] [--cdp <chrome port>]
const fs = require('fs'), path = require('path');
const { launch, startServer, sleep } = require('../tools/cdp');
const { load, driver } = require('../harness');
const root = path.join(__dirname, '..', '..');
const argv = process.argv.slice(2), flag = n => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const label = argv.find((a, i) => !a.startsWith('--') && (i === 0 || !argv[i - 1].startsWith('--'))) || 'inn';
const serveRoot = flag('--root') ? path.resolve(flag('--root')) : root;
const outDir = path.join(root, 'tests', 'results', 'evidence', 'inn-night-' + label); fs.rmSync(outDir, { recursive: true, force: true }); fs.mkdirSync(outDir, { recursive: true });
const checks = []; let shotIndex = 0;
const check = (name, ok, detail) => { checks.push({ name, ok: Boolean(ok), detail: detail === undefined ? '' : String(detail).slice(0, 300) }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  ' + String(detail).slice(0, 200) : '')); };
// Node-side scenario generation with the same engine files: seed 12 → dusk in 长安 with 100 钱; inn.stay opens G11, "keep" pays +12.
const S = load({ root: serveRoot }).Silk;
function scenario(seed, quiet) { const d = driver(S, seed); d.p.cash = 100; d.p.world.tick = 2; d.p.events = d.p.events || S.events.initial(); if (quiet) d.quietCity(3); return d.p; }
const eventProgress = scenario(12, false), plainProgress = scenario(3, true);
{ const probe = structuredClone(eventProgress); S.commands.run(probe, { type: 'inn.stay', payload: {} }, S.core.context('probe')); if (!(probe.eventSession && probe.eventSession.eventId === 'G11' && probe.cash === 95)) { console.error('scenario drift: seed 12 no longer opens G11 at 95 钱'); process.exit(2); } }
const keepText = S.events.definitions.G11.choices.find(c => c.choiceId === 'keep').choiceText;
(async () => {
  const port = Number(flag('--port')) || 8188, srv = startServer(port, serveRoot); await sleep(500);
  const c = await launch({ port: Number(flag('--cdp')) || 9408, width: 390, height: 844, mobile: true });
  const ev = js => c.eval(js);
  const shot = async name => { const f = String(++shotIndex).padStart(2, '0') + '-' + name + '.png'; await c.screenshot(path.join(outDir, f)); return f; };
  const clickText = (text, exact = true) => ev(`(()=>{const top=['modal-panel','result-panel','secondary-panel','primary-panel'].map(k=>document.querySelector('section.'+k)).find(s=>s&&!s.hidden&&s.offsetParent!==null);const match=b=>${exact}?b.textContent.trim()===${JSON.stringify(text)}:b.textContent.trim().startsWith(${JSON.stringify(text)});const scope=top&&[...top.querySelectorAll('button')].some(b=>b.offsetParent!==null&&match(b))?top:document;const b=[...scope.querySelectorAll('button')].find(b=>!b.disabled&&b.offsetParent!==null&&match(b));if(!b)return false;b.click();return true})()`);
  const doubleClickText = (text, exact = true) => ev(`(()=>{const top=['modal-panel','result-panel','secondary-panel','primary-panel'].map(k=>document.querySelector('section.'+k)).find(s=>s&&!s.hidden&&s.offsetParent!==null);const match=b=>${exact}?b.textContent.trim()===${JSON.stringify(text)}:b.textContent.trim().startsWith(${JSON.stringify(text)});const scope=top||document;const b=[...scope.querySelectorAll('button')].find(b=>!b.disabled&&b.offsetParent!==null&&match(b));if(!b)return false;b.click();b.click();setTimeout(()=>{try{b.click()}catch(_){}} ,0);return true})()`);
  const waitFor = async (js, ms = 8000, step = 100) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(js)) return true; await sleep(step); } return false; };
  const busyWait = () => waitFor('!Silk.app.busy', 8000, 50);
  const st = () => ev('(()=>{const p=Silk.app.state.progress;const s=p.eventSession;return {cash:p.cash,tick:p.world.tick,rev:Silk.app.state.meta.revision,event:s?{id:s.id,eventId:s.eventId,status:s.status,settlementId:s.settlementId}:null,settlements:Object.keys(p.events.settlements||{}),eventJournal:p.journal.filter(j=>j.type==="event").map(j=>j.cashDelta),innJournal:p.journal.filter(j=>j.type==="inn").map(j=>j.amount),activeResult:p.presentation.activeResult?p.presentation.activeResult.kind:null}})()');
  const hudCash = () => ev('(()=>{const h=document.querySelector(".hud");const m=(h?h.innerText:document.body.innerText).match(/\\d+/);return m?Number(m[0]):null})()');
  const visible = () => ev('(()=>{const s=[...document.querySelectorAll("section.paper-panel")].filter(x=>!x.hidden&&x.offsetParent!==null).pop();return s?s.innerText.replace(/\\s+/g," ").slice(0,600):""})()');
  const teleport = async progress => { await ev(`new Promise((resolve,reject)=>{const env=structuredClone(Silk.app.state);env.progress=${JSON.stringify(progress)};env.progress.presentation.activeResult=null;env.meta.revision+=1;env.pending=null;const req=indexedDB.open('silkroad-rebuild-v1',2);req.onerror=()=>reject(req.error);req.onsuccess=()=>{const db=req.result;const tx=db.transaction('state','readwrite');tx.objectStore('state').put(env,'current');tx.oncomplete=()=>{db.close();resolve(true)};tx.onerror=()=>reject(tx.error);};})`); await ev('Silk.app.reload()'); await sleep(400); await busyWait(); await ev(`(()=>{for(const s of document.querySelectorAll('section.paper-panel .close-button'))if(s.offsetParent!==null)s.click();})()`); await sleep(300); };
  const realReload = async () => { await c.navigate('http://127.0.0.1:' + port + '/'); await sleep(1200); await ev('new Promise(r=>{const t=setInterval(()=>{if(window.Silk&&Silk.app&&Silk.app.state&&Silk.app.state.progress){clearInterval(t);r()}},100)})'); await waitFor('!Silk.app.busy', 10000); await sleep(400); };
  const errors = [];
  try {
    await c.navigate('http://127.0.0.1:' + port + '/'); await sleep(900);
    await ev('new Promise(r=>{const t=setInterval(()=>{if(window.Silk&&Silk.app&&Silk.app.state){clearInterval(t);r()}},100)})');
    await clickText('启程'); await sleep(250); await clickText('自行探索'); await ev('new Promise(r=>{const t=setInterval(()=>{const p=Silk.app.state.progress;if(p&&p.world){clearInterval(t);r()}},100)})'); await sleep(400);
    // ---------------- A. plain stay: 100 → 95
    await teleport(plainProgress); let s = await st(); check('A boot at dusk with 100 钱 (no city event this day)', s.cash === 100 && s.tick % 3 === 2 && !s.event, JSON.stringify(s));
    await ev(`document.querySelector('.city-hotspot[data-hotspot="inn"]').click()`); await sleep(400); let text = await visible(); check('A 客舍 panel offers 留宿客舍', /留宿客舍/.test(text), text.slice(0, 120));
    check('A 留宿客舍 clicked', await clickText('留宿客舍', false)); await busyWait(); await sleep(500); s = await st(); text = await visible();
    check('A plain stay: 95 钱, inn card 昨夜宿费 5钱, HUD 95, no settlement entry', s.cash === 95 && s.activeResult === 'innFeedback' && /昨夜宿费 5钱/.test(text) && (await hudCash()) === 95 && s.settlements.length === 0 && s.innJournal.join() === '-5', JSON.stringify({ cash: s.cash, hud: await hudCash(), text: text.slice(0, 80) })); await shot('plain-stay-card');
    check('A 离开客舍 acknowledges the inn card', await clickText('离开客舍')); await busyWait(); await sleep(300); s = await st(); check('A morning after plain stay: 95, no active result', s.cash === 95 && !s.activeResult, JSON.stringify({ cash: s.cash, ar: s.activeResult }));
    // ---------------- B. event night: 100 → 95 → +12 → 107
    await teleport(eventProgress); s = await st(); check('B boot at dusk with 100 钱 (seed-12 scenario)', s.cash === 100 && !s.event, JSON.stringify(s));
    await ev(`document.querySelector('.city-hotspot[data-hotspot="inn"]').click()`); await sleep(400); check('B 留宿客舍 clicked', await clickText('留宿客舍', false)); await busyWait(); await sleep(500);
    s = await st(); text = await visible();
    check('B lodging settled first: cash 95, HUD 95, event G11 opened with settlement id, no event journal yet', s.cash === 95 && (await hudCash()) === 95 && s.event && s.event.eventId === 'G11' && s.event.status === 'AWAITING_CHOICE' && /-settlement$/.test(s.event.settlementId) && s.eventJournal.length === 0, JSON.stringify(s)); await shot('event-open');
    const predicted = await ev(`(()=>{const p=structuredClone(Silk.app.state.progress);const r=Silk.commands.run(p,{type:'EVENT_CHOOSE',payload:{eventSessionId:p.eventSession.id,choiceId:'keep'}},Silk.core.context('predict'));return {cash:p.cash,delta:r.cashDelta}})()`);
    check('B engine prediction on a clone: +12 → 107', predicted.delta === 12 && predicted.cash === 107, JSON.stringify(predicted));
    check('B choice double-clicked', await doubleClickText(keepText)); await busyWait(); await sleep(600); s = await st(); text = await visible();
    check('B one settlement: cash 107, ledger 1 entry, one event journal +12, session RESOLVED', s.cash === 107 && s.settlements.length === 1 && s.eventJournal.join() === '12' && s.event.status === 'RESOLVED', JSON.stringify(s));
    check('B result card shows 钱财 +12 while HUD already reads 107', /钱财 \+12钱/.test(text) && (await hudCash()) === 107, JSON.stringify({ hud: await hudCash(), text: text.slice(0, 160) })); await shot('event-result-hud-107');
    check('B no backstage ids on the card', !/settlementId|occurrenceId|Tick|sessionId/.test(text));
    check('B 继续 double-clicked', await doubleClickText('继续')); await busyWait(); await sleep(500); s = await st(); text = await visible();
    check('B inn card: 昨夜宿费 5钱 · 昨夜钱财 +12钱 · 随身铜钱 107钱; state still 107; still one settlement', /昨夜宿费 5钱/.test(text) && /昨夜钱财 \+12钱/.test(text) && /随身铜钱 107钱/.test(text) && s.cash === 107 && s.settlements.length === 1 && s.activeResult === 'innFeedback', JSON.stringify({ cash: s.cash, text: text.slice(0, 200) })); await shot('inn-card-107');
    check('B 离开客舍 double-clicked', await doubleClickText('离开客舍')); await busyWait(); await sleep(400); s = await st();
    check('B morning: cash 107, no active result, event ACKNOWLEDGED', s.cash === 107 && !s.activeResult && s.event.status === 'ACKNOWLEDGED' && (await hudCash()) === 107, JSON.stringify(s));
    const settlementId = s.event.settlementId;
    // ---------------- C. reload after the event: still 107, cannot claim again
    await realReload(); s = await st();
    check('C real reload: cash 107 (not 119), ledger still holds the settlement, HUD 107', s.cash === 107 && s.settlements.includes(settlementId) && (await hudCash()) === 107, JSON.stringify(s)); await shot('after-reload-107');
    const again = await ev(`(async()=>{try{const r=await Silk.ui.dispatch('EVENT_CHOOSE',{eventSessionId:${JSON.stringify(s.event.id)},choiceId:'keep'});return r===null?'null':'applied'}catch(e){return 'error:'+e.code}})()`); await busyWait(); await sleep(200); s = await st();
    check('C second claim after reload refused, cash still 107', again !== 'applied' && s.cash === 107 && s.settlements.length === 1, JSON.stringify({ again, cash: s.cash }));
    await ev(`(()=>{const e=document.querySelector('section.modal-panel');if(e&&!e.hidden){const b=[...e.querySelectorAll('button')].find(x=>x.offsetParent!==null);if(b)b.click();}})()`); await sleep(200);
    // ---------------- D. reload in the middle of the event (after lodging, before the choice): same occurrence, no re-roll
    await teleport(eventProgress); await ev(`document.querySelector('.city-hotspot[data-hotspot="inn"]').click()`); await sleep(400); await clickText('留宿客舍', false); await busyWait(); await sleep(400); s = await st(); const midId = s.event && s.event.id;
    await realReload(); await waitFor(`(()=>{const top=[...document.querySelectorAll('section.paper-panel')].filter(x=>!x.hidden&&x.offsetParent!==null).pop();return !!top&&[...top.querySelectorAll('button')].some(b=>b.textContent.trim()===${JSON.stringify(keepText)})})()`, 6000); s = await st(); text = await visible(); const buttons = await ev('(()=>{const top=[...document.querySelectorAll("section.paper-panel")].filter(x=>!x.hidden&&x.offsetParent!==null).pop();return top?[...top.querySelectorAll("button")].filter(b=>b.offsetParent!==null).map(b=>b.textContent.trim()):[]})()');
    check('D mid-event reload: cash 95, same G11 occurrence awaiting choice, event panel restored with its choices', s.cash === 95 && s.event && s.event.id === midId && s.event.status === 'AWAITING_CHOICE' && buttons.includes(keepText), JSON.stringify({ event: s.event, buttons, text: text.slice(0, 80) })); await shot('mid-event-reload');
    check('D choice clicked after reload', await clickText(keepText)); await busyWait(); await sleep(500); s = await st();
    check('D choice after reload settles once: 107, one settlement (no re-roll)', s.cash === 107 && s.settlements.length === 1 && s.eventJournal.join() === '12', JSON.stringify(s));
    await clickText('继续'); await busyWait(); await sleep(300); await clickText('离开客舍'); await busyWait(); await sleep(300); s = await st(); check('D acknowledged: 107 persists', s.cash === 107 && !s.activeResult, JSON.stringify({ cash: s.cash, ar: s.activeResult }));
    const consoleErrors = c.console.filter(m => m.type === 'error' || m.type === 'exception').map(m => m.text.slice(0, 160)); check('N no console errors', consoleErrors.length === 0, JSON.stringify(consoleErrors.slice(0, 3)));
  } catch (e) { errors.push(String(e && e.stack || e)); console.error(e); }
  await c.close(); srv.stop();
  const passed = checks.filter(x => x.ok).length;
  fs.writeFileSync(path.join(outDir, 'inn-night-run.json'), JSON.stringify({ label, passed, total: checks.length, checks, errors }, null, 2));
  console.log(`inn night browser run [${label}]: ${passed}/${checks.length}` + (errors.length ? ' (script error)' : '') + ' → ' + outDir);
  process.exit(passed === checks.length && !errors.length ? 0 : 1);
})();
