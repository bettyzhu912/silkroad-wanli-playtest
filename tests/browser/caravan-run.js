'use strict';
// 敦煌《驼队装货》 main-game integration — real-browser acceptance run (headless Chrome, mobile emulation). Drives the integrated
// panel through real clicks: job card, entry availability by phase, instructions, trial (no world effect), formal run
// (NOT PASS → rearrange → 3 batches → 22 钱, +2 ticks to 暮, lodging flow), timeout after one batch, abort via the host close
// button, reload recovery, trial abort. Usage: node tests/browser/caravan-run.js [label] [--root <dir>]
const fs = require('fs'), path = require('path');
const { launch, startServer, sleep } = require('../tools/cdp');
const root = path.join(__dirname, '..', '..');
const argv = process.argv.slice(2), flag = n => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const label = argv.find((a, i) => !a.startsWith('--') && (i === 0 || !argv[i - 1].startsWith('--'))) || 'caravan';
const serveRoot = flag('--root') ? path.resolve(flag('--root')) : root;
const outDir = path.join(root, 'tests', 'results', 'evidence', 'caravan-' + label); fs.rmSync(outDir, { recursive: true, force: true }); fs.mkdirSync(outDir, { recursive: true });
const checks = []; let shotIndex = 0;
const check = (name, ok, detail) => { checks.push({ name, ok: Boolean(ok), detail: detail === undefined ? '' : String(detail).slice(0, 300) }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  ' + String(detail).slice(0, 200) : '')); };
(async () => {
  const port = Number(flag('--port')) || 8181, srv = startServer(port, serveRoot); await sleep(500);
  const c = await launch({ port: Number(flag('--cdp')) || 9401, width: 390, height: 844, mobile: true });
  const shot = async name => { const f = String(++shotIndex).padStart(2, '0') + '-' + name + '.png'; await c.screenshot(path.join(outDir, f)); return f; };
  const ev = js => c.eval(js);
  const state = () => ev('(()=>{const p=Silk.app.state.progress;const s=p.work&&p.work.caravan;return {cash:p.cash,tick:p.world.tick,phase:p.world.tick%3,city:p.world.city,caravan:s?{phase:s.phase,settled:s.settled,group:s.groupIndex,wage:s.result?s.result.totalWage:null,completed:s.result?s.result.completed:null}:null,journal:p.journal.filter(r=>r.type==="caravan").length}})()');
  const data = () => ev('(()=>{const d=Silk.caravanUI.test.data();return d?{state:d.state,batch:d.batch,mode:d.mode,remaining:d.remaining,left:d.left,right:d.right,waiting:d.waiting,canSubmit:d.canSubmit,feedback:d.feedback,settlement:d.settlement||null,kind:Silk.caravanUI.test.ui.kind}:null})()');
  const clickText = text => ev(`(()=>{const top=['modal-panel','result-panel','secondary-panel','primary-panel'].map(k=>document.querySelector('section.'+k)).find(s=>s&&!s.hidden&&s.offsetParent!==null);const scope=top&&[...top.querySelectorAll('button')].some(b=>b.offsetParent!==null&&b.textContent.trim()===${JSON.stringify(text)})?top:document;const b=[...scope.querySelectorAll('button')].find(b=>!b.disabled&&b.offsetParent!==null&&b.textContent.trim()===${JSON.stringify(text)});if(!b)return false;b.click();return true})()`);
  const clickSel = sel => ev(`(()=>{const b=document.querySelector(${JSON.stringify(sel)});if(!b||b.disabled)return false;b.click();return true})()`);
  const visibleText = () => ev('(()=>{const s=[...document.querySelectorAll("section.paper-panel")].filter(x=>!x.hidden&&x.offsetParent!==null).pop();return s?s.innerText.replace(/\\s+/g," ").slice(0,700):""})()');
  const modalText = () => ev('(()=>{const m=document.querySelector("section.modal-panel");return m&&!m.hidden&&m.offsetParent!==null?m.innerText.replace(/\\s+/g," "):""})()');
  const waitFor = async (js, ms = 8000, step = 100) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(js)) return true; await sleep(step); } return false; };
  const busyWait = () => waitFor('!Silk.app.busy', 8000, 50);
  const toDunhuangMorning = async () => { await ev(`new Promise((resolve,reject)=>{const env=structuredClone(Silk.app.state);const p=env.progress;p.world.route=null;p.world.city='dunhuang';if(p.trip){p.trip.routeIndex=1;p.trip.phase='in_city';p.trip.routeHistory=['changan','dunhuang'];}p.world.tick=Math.ceil(p.world.tick/3)*3+3;if(p.world.tick%3!==0)p.world.tick+=3-p.world.tick%3;p.inventory.provisions=Math.max(p.inventory.provisions,20);p.eventSession=null;p.events=p.events||{};p.events.mainDays=p.events.mainDays||{};p.events.cityRollDays=p.events.cityRollDays||{};p.events.pendingCityRoll=null;for(let d=Math.floor(p.world.tick/3);d<Math.floor(p.world.tick/3)+60;d++){for(const c of ['changan','dunhuang','khotan'])p.events.cityRollDays[c+':'+d]={key:c+':'+d,city:c,day:d,trigger:false,suppressed:true};p.events.mainDays[d]='suppressed';}p.presentation.activeResult=null;env.meta.revision+=1;env.pending=null;const req=indexedDB.open('silkroad-rebuild-v1',2);req.onerror=()=>reject(req.error);req.onsuccess=()=>{const db=req.result;const tx=db.transaction('state','readwrite');tx.objectStore('state').put(env,'current');tx.oncomplete=()=>{db.close();resolve(true)};tx.onerror=()=>reject(tx.error);};})`); await ev('Silk.app.reload()'); await sleep(400); await waitFor('window.Silk&&Silk.app&&Silk.app.state&&Silk.app.state.progress&&Silk.app.state.progress.world&&!Silk.app.busy', 8000); await sleep(300); };
  const closeAll = async () => { await ev(`(()=>{for(const s of document.querySelectorAll('section.paper-panel .close-button'))if(s.offsetParent!==null)s.click();})()`); await sleep(200); };
  const confirmRisk = async () => { for (let i = 0; i < 3; i++) { const m = await modalText(); if (/仍要继续/.test(m)) { await clickText('仍要继续'); await busyWait(); await sleep(200); } else break; } };
  const openStore = async () => { await closeAll(); await ev(`document.querySelector('.city-hotspot[data-hotspot="work"]').click()`); await sleep(350); await clickText('进入货栈'); await sleep(300); await waitFor('(()=>{const u=Silk.caravanUI.test.ui;return u.game&&!u.preparing&&u.prepared})()', 15000); await sleep(150); };
  const place = async (left, right) => { for (const [side, ids] of [['left', left], ['right', right]]) for (const id of ids) { const a = await clickSel(`.caravan-shell .cargo[data-id="${id}"]`); await sleep(90); const b = await clickSel('.caravan-shell .bag.' + side); if (!a || !b) throw new Error('place failed ' + id + ' ' + side); await sleep(120); } };
  const reference = () => ev('Silk.caravanUI.test.reference()');
  const worst = () => ev('Silk.caravanUI.test.worst()');
  const submitAndWait = async (expectBatch) => { await clickText('确认装好'); const ok = await waitFor(expectBatch ? `(()=>{const d=Silk.caravanUI.test.data();return d&&d.state==='GAMEPLAY'&&d.batch===${expectBatch}})()` : `(()=>{const d=Silk.caravanUI.test.data();return !d||d.state==='SETTLEMENT'||!Silk.caravanUI.test.game()})()`, 9000, 100); return ok; };
  const nextMorning = async () => { await closeAll(); await ev("Silk.ui.dispatch('inn.stay')"); await busyWait(); await sleep(250); for (let i = 0; i < 4; i++) { const acked = await ev(`(()=>{const p=Silk.app.state.progress;const ar=p.presentation.activeResult;if(ar){Silk.ui.dispatch('result.ack',{resultId:ar.id});return true}return false})()`); await busyWait(); await sleep(200); if (!acked) break; } await closeAll(); const st = await state(); if (st.phase !== 0) { await toDunhuangMorning(); } };
  const errors = [];
  try {
    await c.navigate('http://127.0.0.1:' + port + '/'); await sleep(900);
    await ev('new Promise(r=>{const t=setInterval(()=>{if(window.Silk&&Silk.app&&Silk.app.state){clearInterval(t);r()}},100)})');
    await clickText('启程'); await sleep(250); await clickText('自行探索'); await ev('new Promise(r=>{const t=setInterval(()=>{const p=Silk.app.state.progress;if(p&&p.world){clearInterval(t);r()}},100)})'); await sleep(400);
    await ev("Silk.ui.dispatch('trip.begin')"); await busyWait(); await ev("Silk.ui.dispatch('trip.depart',{acknowledgeSupplyWarning:true})"); await busyWait(); await sleep(200);
    await toDunhuangMorning();
    let st = await state(); check('boot: 敦煌 · 晨 · no caravan session', st.city === 'dunhuang' && st.phase === 0 && !st.caravan, JSON.stringify(st));
    const cash0 = st.cash;
    // ---------------- A. entry
    await ev(`document.querySelector('.city-hotspot[data-hotspot="work"]').click()`); await sleep(400);
    let text = await visibleText(); check('A 营生入口卡: 驼队装货 / 耗时：一日 / 进入货栈', /驼队装货/.test(text) && /耗时：一日/.test(text) && /进入货栈/.test(text), text.slice(0, 120)); await shot('job-card');
    await clickText('进入货栈'); await sleep(400); text = await visibleText();
    check('A 货栈入口页（art）: 驼队装货 / 本次帮工：一日 / 开始装货 / 试玩 / 玩法说明，无 驼队待发', /驼队装货/.test(text) && /本次帮工：一日/.test(text) && /开始装货/.test(text) && /试玩/.test(text) && /玩法说明/.test(text) && !/驼队待发/.test(text), text.slice(0, 160));
    const prepared = await waitFor('(()=>{const u=Silk.caravanUI.test.ui;return u.game&&!u.preparing&&u.prepared})()', 15000); check('A 备货完成后试玩可用（页内引擎，无 worker）', prepared); await shot('entry');
    const leak = await ev(`(()=>{const t=document.querySelector('[data-panel-id="caravan"]').innerText;return /groupIndex|settlementId|worldTick|Debug|测试题组|MockOuter|referenceSolution/i.test(t)})()`); check('A 玩家看不到开发字段 / 测试栏', !leak);
    await ev("(()=>{Silk.app.state.progress.world.tick+=1;Silk.ui.render(Silk.app.state);Silk.caravanUI.render();})()"); await sleep(200);
    let noon = await ev(`(()=>{const s=document.querySelector('.caravan-shell');const f=s.querySelector('[data-mode="FORMAL"]'),t=s.querySelector('[data-mode="TRIAL"]');return {formalDisabled:f?f.disabled:null,trialDisabled:t?t.disabled:null,text:s.innerText.includes('今日时间不足')}})()`);
    check('A 午: 开始装货禁用 + 今日时间不足，试玩可用', noon.formalDisabled === true && noon.trialDisabled === false && noon.text, JSON.stringify(noon)); await shot('entry-noon');
    await ev("(()=>{Silk.app.state.progress.world.tick+=1;Silk.ui.render(Silk.app.state);Silk.caravanUI.render();})()"); await sleep(200);
    noon = await ev(`(()=>{const s=document.querySelector('.caravan-shell');return {formal:!!s.querySelector('[data-mode="FORMAL"]'),trialDisabled:s.querySelector('[data-mode="TRIAL"]').disabled}})()`);
    check('A 暮: 开始装货不显示（P0 formal_entry.visible=false），试玩可用', !noon.formal && !noon.trialDisabled, JSON.stringify(noon));
    await ev("(()=>{Silk.app.state.progress.world.tick-=2;Silk.ui.render(Silk.app.state);Silk.caravanUI.render();})()"); await sleep(200);
    // ---------------- B. instructions
    await clickText('玩法说明'); await sleep(250); text = await visibleText();
    check('B 玩法说明含 4 件规则与新交互文案', /每只驼袋最多装 4 件/.test(text) && /点驼袋放入/.test(text), text.slice(0, 200)); await shot('how');
    await clickText('知道了'); await sleep(250); text = await visibleText(); check('B 知道了 → READY art 页', /本次帮工：一日/.test(text) && /开始装货/.test(text));
    // ---------------- C. trial: three batches, no world effect
    await clickText('试玩'); await sleep(400); await shot('trial-start'); let d = await data(); check('C 试玩开始: GAMEPLAY 第1批 · 75s · 无主游戏会话', d && d.state === 'GAMEPLAY' && d.batch === 1 && d.mode === 'TRIAL' && d.remaining <= 75 && !(await state()).caravan, JSON.stringify(d && { state: d.state, batch: d.batch, mode: d.mode }));
    let ref = await reference(); await place(ref.left, ref.right); d = await data(); check('C 点驼袋装入参考解 → 确认装好', d.canSubmit && d.waiting.length === 0); await shot('trial-b1-loaded');
    check('C 批次 1 PASS → 第2批', await submitAndWait(2));
    ref = await reference(); await place(ref.left, ref.right); check('C 批次 2 PASS → 第3批', await submitAndWait(3));
    ref = await reference(); await place(ref.left, ref.right); check('C 批次 3 PASS → 试玩结算', await submitAndWait(null)); await sleep(300);
    text = await visibleText(); check('C 试玩结算: 模拟所得 22 钱 + 试玩不消耗时间', /模拟所得/.test(text) && /22 钱/.test(text) && /试玩不消耗时间/.test(text), text.slice(0, 200)); await shot('trial-settlement');
    await clickText('结束帮工'); await sleep(400); st = await state(); text = await visibleText();
    check('C 结束帮工（试玩，唯一按钮）→ 营生列表；钱 / 时段不变、无会话', /进入货栈/.test(text) && st.cash === cash0 && st.phase === 0 && !st.caravan, JSON.stringify(st));
    // ---------------- D. formal run: NOT PASS → rearrange → 3 batches → 22 钱, +2 ticks, lodging
    await clickText('进入货栈'); await sleep(300); await waitFor('(()=>{const u=Silk.caravanUI.test.ui;return u.game&&!u.preparing&&u.prepared})()', 15000); await sleep(150);
    await clickText('开始装货'); await sleep(300); await confirmRisk(); await waitFor('(()=>{const d=Silk.caravanUI.test.data();return d&&d.state==="GAMEPLAY"&&Silk.caravanUI.test.ui.kind==="formal"})()', 15000); await sleep(200);
    st = await state(); d = await data(); check('D 正式开工: 主游戏会话 PLAYING（题组由主游戏 RNG 决定）、界面 GAMEPLAY 第1批', st.caravan && st.caravan.phase === 'PLAYING' && Number.isInteger(st.caravan.group) && d && d.state === 'GAMEPLAY' && d.mode === 'FORMAL' && d.kind === 'formal', JSON.stringify({ st: st.caravan, d: d && d.state }));
    const gated = await ev("(async()=>{try{await Silk.ui.dispatch('market.enter');}catch(e){}return Silk.app.state.progress.market.visit?'entered':'blocked'})()"); await sleep(100); await ev("(()=>{const e=document.querySelector('section.modal-panel');if(e&&!e.hidden){const b=[...e.querySelectorAll('button')].find(x=>x.offsetParent!==null);if(b)b.click();}})()");
    check('D 装货期间其他命令被拦截（MINIGAME_ACTIVE）', gated === 'blocked', gated); await ev("(()=>{if(Silk.ui.clearError)Silk.ui.clearError();})()");
    const xVisible = await ev(`(()=>{const b=document.querySelector('[data-panel-id="caravan"] .close-button');return !!(b&&b.offsetParent!==null)})()`); check('D 正式装货中主界面关闭按钮可见（走中止确认）', xVisible);
    ref = await reference(); await place(ref.left, ref.right); await shot('formal-b1-loaded'); check('D B1 参考解 PASS → 第2批', await submitAndWait(2));
    const bad = await worst(); check('D 有可用的不合格摆法用于 NOT PASS', bad && bad.left && bad.right);
    await place(bad.left, bad.right); await clickText('确认装好'); await sleep(1300); d = await data(); text = await ev('document.querySelector(".caravan-shell").innerText');
    check('D NOT PASS 反馈: 还不够稳，批次不变', d && d.feedback === 'NOT_PASS' && /还不够稳/.test(text) && d.batch === 2, JSON.stringify({ feedback: d && d.feedback, batch: d && d.batch })); await shot('formal-not-pass');
    await waitFor('(()=>{const d=Silk.caravanUI.test.data();return d&&d.state==="GAMEPLAY"})()', 5000); await sleep(150);
    for (const side of ['left', 'right']) { for (;;) { d = await data(); const bag = d[side]; if (!bag.length) break; await clickSel(`.caravan-shell .bag-item[data-id="${bag[bag.length - 1]}"]`); await sleep(120); } }
    d = await data(); check('D 逐件点顶层取出 → 全部回到待装区', d.waiting.length === d.left.length + d.right.length + d.waiting.length && d.left.length === 0 && d.right.length === 0);
    ref = await reference(); await place(ref.left, ref.right); check('D B2 重排 PASS → 第3批', await submitAndWait(3));
    ref = await reference(); await place(ref.left, ref.right); await shot('formal-b3-loaded'); check('D B3 PASS → 结算', await submitAndWait(null));
    const finished = await waitFor('(()=>{const p=Silk.app.state.progress;const s=p.work&&p.work.caravan;return s&&s.phase==="FINISHED"&&s.result&&!s.settled})()', 8000); await sleep(300);
    st = await state(); text = await visibleText();
    check('D 收工记录写入主游戏（CARAVAN_FINISH）: 3 批、22 钱，尚未结算、钱未变', finished && st.caravan.completed === 3 && st.caravan.wage === 22 && st.caravan.settled === false && st.cash === cash0, JSON.stringify(st));
    check('D 结算页（art）: 帮工完成 / 本次帮工：一日 / 所得工钱 22 钱 / 唯一按钮 结束帮工', /帮工完成/.test(text) && /本次帮工：一日/.test(text) && /所得工钱/.test(text) && /22 钱/.test(text) && /结束帮工/.test(text) && !/返回营生|退出营生/.test(text), text.slice(0, 220)); await shot('formal-settlement');
    const xHidden = await ev(`(()=>{const b=document.querySelector('[data-panel-id="caravan"] .close-button');return !(b&&b.offsetParent!==null)})()`); check('D 结算未完成时关闭按钮隐藏', xHidden);
    await clickText('结束帮工'); await busyWait(); await sleep(500); st = await state(); text = await visibleText();
    check('D 结束帮工 → 结算一次: 钱 +22、+2 时段落在暮、journal 1 条', st.cash === cash0 + 22 && st.phase === 2 && st.caravan.settled === true && st.journal === 1, JSON.stringify(st));
    check('D 暮 → 进入客舍住宿流程（主游戏 modal hierarchy）', /客舍|住宿|歇息/.test(text), text.slice(0, 120)); await shot('after-settlement-inn');
    const hud = await ev('document.body.innerText.includes(String(Silk.app.state.progress.cash))'); check('D HUD 显示新的钱数', hud);
    // ---------------- E. timeout after one batch (next morning)
    await nextMorning(); st = await state(); check('E 次日晨（住宿后）', st.phase === 0 && st.city === 'dunhuang', JSON.stringify(st));
    const cash1 = st.cash; await openStore(); await clickText('开始装货'); await sleep(300); await confirmRisk(); await waitFor('(()=>{const d=Silk.caravanUI.test.data();return d&&d.state==="GAMEPLAY"&&Silk.caravanUI.test.ui.kind==="formal"})()', 15000); await sleep(200);
    ref = await reference(); await place(ref.left, ref.right); check('E B1 PASS', await submitAndWait(2));
    await ev('Silk.caravanUI.test.warp(80)'); await sleep(400); await waitFor('(()=>{const d=Silk.caravanUI.test.data();return !d||d.state==="SETTLEMENT"||!Silk.caravanUI.test.game()})()', 6000); await sleep(400);
    const timedOut = await waitFor('(()=>{const p=Silk.app.state.progress;const s=p.work&&p.work.caravan;return s&&s.phase==="FINISHED"&&s.result&&!s.settled})()', 8000); st = await state(); text = await visibleText();
    check('E 时辰到: 保留已完成 1 批（TIMEOUT）、帮工完成 + 未完成批次、工钱 = 引擎 payout([tier])', timedOut && st.caravan.completed === 1 && st.caravan.wage >= 11 && st.caravan.wage <= 12 && /帮工完成/.test(text) && /未完成/.test(text) && !/退出营生/.test(text), JSON.stringify(st.caravan)); await shot('timeout-settlement');
    const wage1 = st.caravan.wage; await clickText('结束帮工'); await busyWait(); await sleep(400); st = await state();
    check('E 结束帮工（暮）→ 结算 + 客舍流程', st.cash === cash1 + wage1 && st.phase === 2 && st.caravan.settled, JSON.stringify(st));
    // ---------------- F. abort via the host close button
    await nextMorning(); st = await state(); const cash2 = st.cash;
    await openStore(); await clickText('开始装货'); await sleep(300); await confirmRisk(); await waitFor('(()=>{const d=Silk.caravanUI.test.data();return d&&d.state==="GAMEPLAY"&&Silk.caravanUI.test.ui.kind==="formal"})()', 15000); await sleep(200);
    ref = await reference(); await place(ref.left.slice(0, 1), []); await ev(`document.querySelector('[data-panel-id="caravan"] .close-button').click()`); await sleep(300); let m = await modalText();
    check('F 点关闭 → 主游戏 modal「要结束这次装货吗？」', /要结束这次装货吗/.test(m) && /结束装货/.test(m), m.slice(0, 120)); await shot('abort-modal');
    await clickText('继续装货'); await sleep(250); d = await data(); check('F 继续装货 → 回到 GAMEPLAY，货物保留', d && d.state === 'GAMEPLAY' && d.left.length === 1);
    await ev(`document.querySelector('[data-panel-id="caravan"] .close-button').click()`); await sleep(300); await clickText('结束装货'); await busyWait(); await sleep(500); st = await state(); text = await visibleText();
    check('F 结束装货 → 会话 ABORTED，不付钱不耗时，回到营生列表', st.caravan && st.caravan.phase === 'ABORTED' && st.cash === cash2 && st.phase === 0 && /进入货栈/.test(text), JSON.stringify(st)); await shot('after-abort');
    // ---------------- G. reload during a formal run → recovery abort without cost
    await openStore(); await clickText('开始装货'); await sleep(300); await confirmRisk(); await waitFor('(()=>{const d=Silk.caravanUI.test.data();return d&&d.state==="GAMEPLAY"&&Silk.caravanUI.test.ui.kind==="formal"})()', 15000); await sleep(200);
    await c.navigate('http://127.0.0.1:' + port + '/'); await sleep(1200); await ev('new Promise(r=>{const t=setInterval(()=>{if(window.Silk&&Silk.app&&Silk.app.state&&Silk.app.state.progress){clearInterval(t);r()}},100)})'); await waitFor('!Silk.app.busy', 10000); await sleep(500); st = await state(); text = await visibleText();
    check('G 重载: 进行中的正式装货按中止恢复（不计时、不付钱），无残留面板', st.caravan && st.caravan.phase === 'ABORTED' && st.cash === cash2 && st.phase === 0 && !/开始装货|第1批/.test(text), JSON.stringify({ st, text: text.slice(0, 60) })); await shot('after-reload');
    // ---------------- H. trial abort via close
    await openStore(); await clickText('试玩'); await sleep(400); await ev(`document.querySelector('[data-panel-id="caravan"] .close-button').click()`); await sleep(300); m = await modalText(); await clickText('结束装货'); await sleep(400); st = await state(); text = await visibleText();
    check('H 试玩中点关闭 → 同一确认 → 回营生列表，世界不变', /要结束这次装货吗/.test(m) && /进入货栈/.test(text) && st.cash === cash2 && st.phase === 0, JSON.stringify(st));
    await closeAll(); await shot('city-after');
    const consoleErrors = (typeof c.console === 'function' ? await c.console() : (c.console || [])).filter(e => /error/i.test(e.level || e.type || '')); check('N 无控制台错误', consoleErrors.length === 0, JSON.stringify(consoleErrors.slice(0, 3)));
  } catch (e) { errors.push(String(e && e.stack || e)); console.error(e); }
  await c.close(); srv.stop();
  const passed = checks.filter(x => x.ok).length;
  fs.writeFileSync(path.join(outDir, 'caravan-run.json'), JSON.stringify({ label, passed, total: checks.length, checks, errors }, null, 2));
  console.log(`caravan browser run [${label}]: ${passed}/${checks.length}` + (errors.length ? ' (script error)' : '') + ' → ' + outDir);
  process.exit(passed === checks.length && !errors.length ? 0 : 1);
})();
