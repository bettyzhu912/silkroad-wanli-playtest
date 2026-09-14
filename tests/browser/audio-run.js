'use strict';
// GLOBAL_AUDIO_SYSTEM_v0.1 — real-browser acceptance (headless Chrome, mobile emulation, autoplay allowed so playback state is observable).
// Home 设置 and in-game 更多 → 设置 share one Audio Settings block over one persisted state; BGM is one looping element that survives HUD windows /
// market / panel switches and pause / resume keeps its position; SFX fire only on semantic events (market commit, commission accepted,
// newspaper purchased, livelihood settlement) and never on ordinary clicks / +− / tabs / HUD windows / slider drags.
// Usage: node tests/browser/audio-run.js [label] [--root <dir>] [--port 8461] [--cdp 9711]
const fs = require('fs'), path = require('path');
const { launch, startServer, sleep } = require('../tools/cdp');
const root = path.join(__dirname, '..', '..');
const argv = process.argv.slice(2), flag = n => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const label = argv.find((a, i) => !a.startsWith('--') && (i === 0 || !argv[i - 1].startsWith('--'))) || 'audio';
const serveRoot = flag('--root') ? path.resolve(flag('--root')) : root;
const outDir = path.join(root, 'tests', 'results', 'evidence', 'audio-' + label); fs.rmSync(outDir, { recursive: true, force: true }); fs.mkdirSync(outDir, { recursive: true });
const checks = []; let shotIndex = 0;
const check = (name, ok, detail) => { checks.push({ name, ok: Boolean(ok), detail: detail === undefined ? '' : String(detail).slice(0, 400) }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  ' + String(detail).slice(0, 200) : '')); };
(async () => {
  const port = Number(flag('--port')) || 8461, srv = startServer(port, serveRoot); await sleep(500);
  const c = await launch({ port: Number(flag('--cdp')) || 9711, width: 390, height: 844, mobile: true, extraArgs: ['--autoplay-policy=no-user-gesture-required'] });
  const shot = async name => { const f = String(++shotIndex).padStart(2, '0') + '-' + name + '.png'; await c.screenshot(path.join(outDir, f)); return f; };
  const ev = js => c.eval(js);
  const status = () => ev('Silk.audio.status()');
  const prefs = () => ev('(()=>{const p=Silk.app.state.preferences;return {musicEnabled:p.musicEnabled,musicVolume:p.musicVolume,sfxEnabled:p.sfxEnabled,sfxVolume:p.sfxVolume}})()');
  const clickText = text => ev(`(()=>{const top=['modal-panel','result-panel','secondary-panel','primary-panel'].map(k=>document.querySelector('section.'+k)).find(s=>s&&!s.hidden&&s.offsetParent!==null);const scope=top&&[...top.querySelectorAll('button')].some(b=>b.offsetParent!==null&&b.textContent.trim()===${JSON.stringify(text)})?top:document;const b=[...scope.querySelectorAll('button')].find(b=>!b.disabled&&b.offsetParent!==null&&b.textContent.trim()===${JSON.stringify(text)});if(!b)return false;b.click();return true})()`);
  const visibleText = () => ev('(()=>{const s=[...document.querySelectorAll("section.paper-panel")].filter(x=>!x.hidden&&x.offsetParent!==null).pop();return s?s.innerText.replace(/\\s+/g," ").slice(0,600):""})()');
  const waitFor = async (js, ms = 8000, step = 100) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(js)) return true; await sleep(step); } return false; };
  const busyWait = () => waitFor('!Silk.app.busy', 8000, 50);
  const closeAll = async () => { for (let i = 0; i < 3; i++) { await ev(`(()=>{for(const s of document.querySelectorAll('section.paper-panel .close-button'))if(s.offsetParent!==null)s.click();})()`); await sleep(150); } };
  const settingsPanel = () => ev('(()=>{const s=[...document.querySelectorAll("section.paper-panel")].filter(x=>!x.hidden&&x.offsetParent!==null).pop();if(!s)return null;const rows=[...s.querySelectorAll(".info-row")].map(r=>r.querySelector(".row-label").textContent+"="+r.querySelector(".row-value").textContent);const sl=[...s.querySelectorAll("input.audio-slider")].map(i=>i.name+"="+i.value);return {rows,sliders:sl,text:s.innerText.replace(/\\s+/g," ").slice(0,300)}})()');
  const toggleRow = label => ev(`(()=>{const s=[...document.querySelectorAll("section.paper-panel")].filter(x=>!x.hidden&&x.offsetParent!==null).pop();const r=[...s.querySelectorAll(".info-row")].find(r=>r.querySelector(".row-label").textContent===${JSON.stringify(label)});if(!r)return false;r.click();return true})()`);
  const slide = async (name, values, release) => { for (const v of values) { await ev(`(()=>{const i=document.querySelector('input.audio-slider[name="${name}"]');i.value=${v};i.dispatchEvent(new Event('input',{bubbles:true}));return true})()`); await sleep(40); } if (release) { await ev(`(()=>{const i=document.querySelector('input.audio-slider[name="${name}"]');i.dispatchEvent(new Event('change',{bubbles:true}));return true})()`); await busyWait(); await sleep(250); } };
  const counts = async () => (await status()).counts;
  const gesture = async () => { await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16 }); await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16 }); await sleep(100); };   // one real user gesture (autoplay unlock), never a click on a control
  const errors = [];
  try {
    await c.navigate('http://127.0.0.1:' + port + '/'); await sleep(900);
    await ev('new Promise(r=>{const t=setInterval(()=>{if(window.Silk&&Silk.app&&Silk.app.state){clearInterval(t);r()}},100)})');
    await gesture(); let st = await status();
    check('A init order: manager mounted after the persisted settings, defaults 音乐 开 0.35 / 音效 开 0.7; no audio before the first gesture, then the home screen joins the BGM session (one element, loop)', st.mounted && st.prefs.musicEnabled && st.prefs.musicVolume === 0.35 && st.prefs.sfxEnabled && st.prefs.sfxVolume === 0.7 && !st.inGame && st.bgm && !st.bgm.paused && st.bgmPlays === 1 && st.elements === 3 && st.bgm.loop, JSON.stringify(st));
    await sleep(600); const home0 = await status(); check('A home BGM advancing before the game starts', home0.bgm.currentTime > 0.3, JSON.stringify(home0.bgm));
    // ---- home 设置
    await ev(`document.querySelector('.home-settings').click()`); await sleep(400); let sp = await settingsPanel();
    check('B home 设置: 音乐 开/关 + 音乐音量 slider, 音效 开/关 + 音效音量 slider; no single 声音 switch', sp && sp.rows.join('|') === '音乐=开启|音效=开启' && sp.sliders.join('|') === 'music-volume=35|sfx-volume=70' && !/声音/.test(sp.text), JSON.stringify(sp)); await shot('home-settings');
    await toggleRow('音乐'); await busyWait(); await sleep(200); await slide('music-volume', [40, 33, 30], true); await toggleRow('音效'); await busyWait(); await sleep(200);
    let pf = await prefs(); sp = await settingsPanel();
    check('B home: 音乐 关 / 30% / 音效 关 → persisted preferences + panel state', pf.musicEnabled === false && pf.musicVolume === 0.3 && pf.sfxEnabled === false && sp.rows.join('|') === '音乐=关闭|音效=关闭' && sp.sliders[0] === 'music-volume=30', JSON.stringify({ pf, sp })); await shot('home-settings-changed');
    await closeAll();
    // ---- into the game → 更多 → 设置 shows the same state
    await clickText('启程'); await sleep(250); await clickText('自行探索'); await ev('new Promise(r=>{const t=setInterval(()=>{const p=Silk.app.state.progress;if(p&&p.world){clearInterval(t);r()}},100)})'); await sleep(400);
    await ev(`document.querySelector('.hud-tool[data-panel="more"]').click()`); await sleep(300); await clickText('设置'); await sleep(350); sp = await settingsPanel(); st = await status();
    check('C in-game 更多 → 设置: identical state (音乐 关 30% / 音效 关); music (turned off on the home screen) stays off in game, same element', sp && sp.rows.join('|') === '音乐=关闭|音效=关闭' && sp.sliders.join('|') === 'music-volume=30|sfx-volume=70' && st.inGame && st.bgm.paused && st.elements === 3, JSON.stringify(sp)); await shot('ingame-settings');
    // ---- persistence across reload
    await c.navigate('http://127.0.0.1:' + port + '/'); await sleep(1200); await ev('new Promise(r=>{const t=setInterval(()=>{if(window.Silk&&Silk.app&&Silk.app.state&&Silk.app.state.progress){clearInterval(t);r()}},100)})'); await waitFor('!Silk.app.busy', 8000); await sleep(300); await gesture();
    pf = await prefs(); st = await status();
    check('D reload: musicEnabled / musicVolume / sfxEnabled / sfxVolume persisted; music off → BGM never started after the reload (no flash of audio)', pf.musicEnabled === false && pf.musicVolume === 0.3 && pf.sfxEnabled === false && pf.sfxVolume === 0.7 && st.bgm.paused && st.bgmPlays === 0, JSON.stringify(pf));
    // ---- music on in game → plays, loops, survives panel switches
    await closeAll(); await ev(`document.querySelector('.hud-tool[data-panel="more"]').click()`); await sleep(300); await clickText('设置'); await sleep(300); await toggleRow('音乐'); await busyWait(); await sleep(900); st = await status();
    check('E 音乐 开 (in game) → the one BGM element plays, loop on, volume 0.3, time advancing', st.prefs.musicEnabled && !st.bgm.paused && st.bgm.loop && Math.abs(st.bgm.volume - 0.3) < 1e-6 && st.bgm.currentTime > 0.3 && st.elements === 3, JSON.stringify(st.bgm));
    let last = st.bgm.currentTime; await closeAll(); const c0 = await counts();
    for (const id of ['pack', 'commission', 'message', 'merchant_business', 'more']) { await ev(`document.querySelector('.hud-tool[data-panel="${id}"]').click()`); await sleep(250); const s = await status(); check('E HUD window ' + id + ': same element keeps playing, no restart (t ' + last.toFixed(2) + ' → ' + s.bgm.currentTime.toFixed(2) + '), no sfx', s.elements === 3 && !s.bgm.paused && s.bgm.currentTime >= last - 0.05 && s.bgmPlays === 1, JSON.stringify({ t: s.bgm.currentTime, plays: s.bgmPlays })); last = s.bgm.currentTime; await closeAll(); }
    await ev(`document.querySelector('.city-hotspot[data-hotspot="market"]').click()`); await busyWait(); await sleep(400); st = await status();
    check('E market open: BGM continues from ' + last.toFixed(2) + ' (now ' + st.bgm.currentTime.toFixed(2) + '), one instance', st.elements === 3 && !st.bgm.paused && st.bgm.currentTime >= last - 0.05 && st.bgmPlays === 1); last = st.bgm.currentTime;
    const c1 = await counts(); check('E opening HUD windows / market produced no sfx', c1.ui_confirm === c0.ui_confirm && c1.coin_gain === c0.coin_gain, JSON.stringify(c1));
    // ---- market: +/- silent, buy → one coin_gain, sellAll → one coin_gain
    await ev(`(()=>{const b=document.querySelector('[data-panel-id="market"] .market-product[data-good-id="绢帛"] .market-card-actions button[data-action="buy"]');if(b&&!b.disabled)b.click();return true})()`); await sleep(300);
    const stepperClicks = await ev(`(()=>{let n=0;for(const sel of ['.stepper-plus','.stepper-plus','.stepper-minus']){const b=document.querySelector('[data-panel-id="market"] .trade-expand '+sel);if(!b||b.disabled)continue;b.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:1}));b.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:1}));n++;}return n})()`); await sleep(200);
    let cc = await counts(); check('F market +/- clicks (' + stepperClicks + ') → no sfx', stepperClicks > 0 && cc.coin_gain === c1.coin_gain && cc.ui_confirm === c1.ui_confirm, JSON.stringify(cc));
    const goods = await ev('(()=>{const v=Silk.app.state.progress.market.visit;return {visitId:v.id,goods:v.offers?Object.keys(v.offers):null,rows:(Silk.market.snapshot?Silk.market.snapshot(Silk.app.state.progress):null)}})()').catch(() => null);
    const buy = async (goodId, qty) => ev(`Silk.ui.dispatch('market.buy',{visitId:Silk.app.state.progress.market.visit.id,goodId:${JSON.stringify(goodId)},quantity:${qty}}).then(r=>r?'ok':'null').catch(e=>'ERR '+e.message)`);
    const ack = async () => { for (let i = 0; i < 3; i++) { const a = await ev(`(()=>{const ar=Silk.app.state.progress.presentation.activeResult;if(ar){Silk.ui.dispatch('result.ack',{resultId:ar.id});return true}return false})()`); await busyWait(); await sleep(150); if (!a) break; } };
    const cashA = await ev('Silk.app.state.progress.cash'); const r1 = await buy('绢帛', 2); await busyWait(); await ack(); cc = await counts();
    check('F market.buy commit (pure spending) → silent', r1 === 'ok' && (await ev('Silk.app.state.progress.cash')) < cashA && cc.coin_gain === c1.coin_gain && cc.ui_confirm === c1.ui_confirm, JSON.stringify({ r1, cc }));
    const rs = await ev(`Silk.ui.dispatch('market.sell',{visitId:Silk.app.state.progress.market.visit.id,goodId:'绢帛',quantity:1}).then(r=>r?'ok':'null').catch(e=>'ERR '+e.message)`); await busyWait(); await ack(); const c1s = await counts();
    check('F market.sell commit (1 件) → exactly one coin_gain', rs === 'ok' && c1s.coin_gain === cc.coin_gain + 1 && c1s.ui_confirm === cc.ui_confirm, JSON.stringify({ rs, c1s }));
    const r2 = await buy('纸张', 1); await busyWait(); await ack(); const c2 = await counts();
    const r3 = await ev(`Silk.ui.dispatch('market.sellAll',{visitId:Silk.app.state.progress.market.visit.id}).then(r=>r?'ok':'null').catch(e=>'ERR '+e.message)`); await busyWait(); await ack(); cc = await counts();
    check('F 一键出售 (two lots, several 件) → exactly one coin_gain; the buy before it silent', r2 === 'ok' && r3 === 'ok' && c2.coin_gain === c1s.coin_gain && cc.coin_gain === c2.coin_gain + 1, JSON.stringify({ r2, r3, before: c2, after: cc }));
    await ev(`Silk.ui.dispatch('market.leave',{visitId:Silk.app.state.progress.market.visit.id})`); await busyWait(); await ack(); await sleep(200); const c3 = await counts(); check('F leaving the market (summary) → no sfx', c3.coin_gain === cc.coin_gain && c3.ui_confirm === cc.ui_confirm);
    await closeAll();
    // ---- commission accepted → ui_confirm; newspaper purchase → ui_confirm once, second (owned) silent
    const cid = await ev('(()=>{const b=Silk.app.state.progress.commissions.board;return b&&b[0]?b[0].commissionId:null})()');
    if (cid) { const ra = await ev(`Silk.ui.dispatch('commission.accept',{commissionId:${JSON.stringify(cid)}}).then(r=>r?'ok':'null').catch(e=>'ERR '+e.message)`); await busyWait(); await ack(); cc = await counts(); check('G commission.accept success → one ui_confirm, no coin_gain', ra === 'ok' && cc.ui_confirm === c3.ui_confirm + 1 && cc.coin_gain === c3.coin_gain, JSON.stringify({ ra, cc })); } else check('G commission.accept (no board commission available)', true, 'skipped');
    const c4 = await counts(); const rn = await ev(`Silk.app.dispatch('newspaper.purchase',{}).then(r=>JSON.stringify(r.result&&{kind:r.result.kind,owned:r.result.alreadyOwned})).catch(e=>'ERR '+(e.code||e.message))`); await busyWait(); await ack(); cc = await counts();
    if (/"kind":"newspaper"/.test(rn)) check('G newspaper.purchase (new report) → one ui_confirm', cc.ui_confirm === c4.ui_confirm + 1 && cc.coin_gain === c4.coin_gain, JSON.stringify({ rn, cc }));
    else check('G newspaper.purchase not available this early (' + rn + ') → silent (no sound for an unavailable / failed purchase)', cc.ui_confirm === c4.ui_confirm && cc.coin_gain === c4.coin_gain, JSON.stringify({ rn, cc }));
    const c5 = await counts(); await ev(`Silk.ui.dispatch('newspaper.purchase',{}).catch(()=>null)`); await busyWait(); await ack(); cc = await counts(); check('G second purchase (already owned) → silent', cc.ui_confirm === c5.ui_confirm && cc.coin_gain === c5.coin_gain);
    // ---- livelihood settlement → coin_gain once (FINISH silent)
    await ev("Silk.ui.dispatch('trip.begin')"); await busyWait(); await ack(); await ev("Silk.ui.dispatch('trip.depart',{acknowledgeSupplyWarning:true})"); await busyWait(); await ack(); await sleep(200);
    await ev(`new Promise((resolve,reject)=>{const env=structuredClone(Silk.app.state);const p=env.progress;p.world.route=null;p.world.city='dunhuang';if(p.trip){p.trip.routeIndex=1;p.trip.phase='in_city';p.trip.routeHistory=['changan','dunhuang'];}p.world.tick=Math.ceil(p.world.tick/3)*3+3;p.inventory.provisions=Math.max(p.inventory.provisions,20);p.eventSession=null;p.events=p.events||{};p.events.mainDays=p.events.mainDays||{};p.events.cityRollDays=p.events.cityRollDays||{};p.events.pendingCityRoll=null;for(let d=Math.floor(p.world.tick/3);d<Math.floor(p.world.tick/3)+60;d++){for(const cc of ['changan','dunhuang','khotan'])p.events.cityRollDays[cc+':'+d]={key:cc+':'+d,city:cc,day:d,trigger:false,suppressed:true};p.events.mainDays[d]='suppressed';}p.presentation.activeResult=null;env.meta.revision+=1;env.pending=null;const req=indexedDB.open('silkroad-rebuild-v1',2);req.onerror=()=>reject(req.error);req.onsuccess=()=>{const db=req.result;const tx=db.transaction('state','readwrite');tx.objectStore('state').put(env,'current');tx.oncomplete=()=>{db.close();resolve(true)};tx.onerror=()=>reject(tx.error);};})`); await ev('Silk.app.reload()'); await sleep(400); await waitFor('!Silk.app.busy', 8000); await sleep(300); await closeAll();
    const c6 = await counts(); st = await status(); const tBefore = st.bgm.currentTime;
    await ev(`Silk.ui.dispatch('PATTERN_START',{mode:'FORMAL'},undefined,undefined,true)`); await busyWait(); const cs = await counts();
    await ev(`(()=>{const s=Silk.app.state.progress.work.pattern;return Silk.ui.dispatch('PATTERN_FINISH',{sessionId:s.id,outcome:{endedBy:'STROKES',score:42,validStrokes:10,longestChain:6,wildcardsGenerated:0,representativeMotif:'LOTUS',elapsedMs:41000}})})()`); await busyWait(); const cf = await counts();
    const cashS = await ev('Silk.app.state.progress.cash'); await ev(`(()=>{const s=Silk.app.state.progress.work.pattern;return Silk.ui.dispatch('PATTERN_SETTLE',{sessionId:s.id,settlementId:s.settlementId})})()`); await busyWait(); await sleep(200); cc = await counts(); st = await status();
    check('H livelihood: START / FINISH silent, SETTLE (+' + ((await ev('Silk.app.state.progress.cash')) - cashS) + ' 钱) → one coin_gain; BGM kept running across the reload-free session', cs.coin_gain === c6.coin_gain && cf.coin_gain === c6.coin_gain && cc.coin_gain === c6.coin_gain + 1 && cc.ui_confirm === c6.ui_confirm && !st.bgm.paused && st.bgm.currentTime >= tBefore - 0.05, JSON.stringify({ c6, cs, cf, cc }));
    await closeAll();
    // ---- pause keeps the position; resume continues
    await ev(`document.querySelector('.hud-tool[data-panel="more"]').click()`); await sleep(250); await clickText('设置'); await sleep(300);
    await toggleRow('音乐'); await busyWait(); await sleep(150); st = await status(); const tPaused = st.bgm.currentTime; await sleep(700); const st2 = await status();
    check('I 音乐 关 → BGM paused at once, position kept (' + tPaused.toFixed(2) + ')', st.bgm.paused && st2.bgm.paused && Math.abs(st2.bgm.currentTime - tPaused) < 0.05 && !st2.prefs.musicEnabled, JSON.stringify({ tPaused, t2: st2.bgm.currentTime }));
    await toggleRow('音乐'); await busyWait(); await sleep(600); st = await status();
    check('I 音乐 开 → resumes from the kept position (now ' + st.bgm.currentTime.toFixed(2) + '), same element', !st.bgm.paused && st.bgm.currentTime >= tPaused - 0.05 && st.bgm.currentTime < tPaused + 1.5 && st.elements === 3, JSON.stringify({ tPaused, now: st.bgm.currentTime }));
    // ---- sliders: music live volume while dragging (no dispatch until release); sfx drag silent, release → one preview
    const revBefore = await ev('Silk.app.state.meta.revision'); await slide('music-volume', [50, 60, 70], false); st = await status(); const revMid = await ev('Silk.app.state.meta.revision');
    check('J music slider drag: live volume 0.7 applied, nothing persisted until release', Math.abs(st.bgm.volume - 0.7) < 1e-6 && revMid === revBefore, JSON.stringify({ vol: st.bgm.volume }));
    await slide('music-volume', [], true); pf = await prefs(); check('J music slider release → musicVolume 0.7 persisted', pf.musicVolume === 0.7, JSON.stringify(pf));
    await toggleRow('音效'); await busyWait(); await sleep(150); const c7 = await counts();
    await slide('sfx-volume', [60, 50, 40, 45], false); cc = await counts(); check('J sfx slider drag → no sound while dragging', cc.ui_confirm === c7.ui_confirm && cc.coin_gain === c7.coin_gain, JSON.stringify(cc));
    await slide('sfx-volume', [], true); await sleep(200); cc = await counts(); pf = await prefs();
    check('J sfx slider release → sfxVolume 0.45 persisted + exactly one ui_confirm preview', pf.sfxVolume === 0.45 && cc.ui_confirm === c7.ui_confirm + 1 && cc.coin_gain === c7.coin_gain, JSON.stringify({ pf, cc })); await shot('ingame-settings-final');
    const home = await ev('(()=>{const p=Silk.app.state.preferences;return p.musicEnabled===true&&p.musicVolume===0.7&&p.sfxEnabled===true&&p.sfxVolume===0.45})()'); check('K the same global state is what the home 设置 reads (single source of truth)', home);
    const consoleErrors = (c.console || []).filter(e => /error|exception/i.test(e.type || '')); check('Z no console errors', consoleErrors.length === 0, JSON.stringify(consoleErrors.slice(0, 3)));
    const bad = (c.network || []).filter(n => n.status !== 200 && n.status !== 304 && n.status !== 206); check('Z all requests ok (audio files served)', bad.length === 0 && (c.network || []).some(n => /audio_bgm_main_v01/.test(n.url)), JSON.stringify(bad.slice(0, 5)));
  } catch (e) { errors.push(String(e && e.stack || e)); console.error(e); try { await shot('error'); } catch (_) { /* ignore */ } }
  await c.close(); srv.stop();
  const passed = checks.filter(x => x.ok).length;
  fs.writeFileSync(path.join(outDir, 'audio-run.json'), JSON.stringify({ label, serveRoot, passed, total: checks.length, checks, errors, generatedAt: new Date().toISOString() }, null, 2));
  console.log(`audio browser run [${label}]: ${passed}/${checks.length}` + (errors.length ? ' (script error)' : '') + ' → ' + outDir);
  process.exit(passed === checks.length && !errors.length ? 0 : 1);
})();
