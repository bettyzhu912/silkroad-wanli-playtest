'use strict';
// GLOBAL_NUMERIC_STEPPER_UI_PATCH_v1.1 — real-browser acceptance (headless Chrome, 390×844 mobile emulation) over the 04 checklist:
// visual (no bare native input, one shared component), interaction (±1, manual entry, integer-only, clamp to max, disabled at
// min/max, empty/0 disables confirm), market buy / sell / provisions totals, 柜坊 deposit / withdraw / borrow / repay / 飞钱 limits,
// 商号 amount panel (integer, quantity, decimal-percent variants), read-only numbers untouched, gameplay payloads unchanged.
// Usage: node tests/browser/stepper-run.js [label] [--root <dir>] [--port <http>] [--cdp <chrome port>]
const fs = require('fs'), path = require('path');
const { launch, startServer, sleep } = require('../tools/cdp');
const root = path.join(__dirname, '..', '..');
const argv = process.argv.slice(2), flag = n => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const label = argv.find((a, i) => !a.startsWith('--') && (i === 0 || !argv[i - 1].startsWith('--'))) || 'stepper';
const serveRoot = flag('--root') ? path.resolve(flag('--root')) : root;
const outDir = path.join(root, 'tests', 'results', 'evidence', 'stepper-' + label); fs.rmSync(outDir, { recursive: true, force: true }); fs.mkdirSync(outDir, { recursive: true });
const checks = []; let shotIndex = 0;
const check = (name, ok, detail) => { checks.push({ name, ok: Boolean(ok), detail: detail === undefined ? '' : String(detail).slice(0, 300) }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  ' + String(detail).slice(0, 200) : '')); };
(async () => {
  const port = Number(flag('--port')) || 8184, srv = startServer(port, serveRoot); await sleep(500);
  const c = await launch({ port: Number(flag('--cdp')) || 9404, width: 390, height: 844, mobile: true });
  const ev = js => c.eval(js);
  const shot = async name => { const f = String(++shotIndex).padStart(2, '0') + '-' + name + '.png'; await c.screenshot(path.join(outDir, f)); return f; };
  const clickText = text => ev(`(()=>{const top=['modal-panel','result-panel','secondary-panel','primary-panel'].map(k=>document.querySelector('section.'+k)).find(s=>s&&!s.hidden&&s.offsetParent!==null);const scope=top&&[...top.querySelectorAll('button')].some(b=>b.offsetParent!==null&&b.textContent.trim()===${JSON.stringify(text)})?top:document;const b=[...scope.querySelectorAll('button')].find(b=>!b.disabled&&b.offsetParent!==null&&b.textContent.trim()===${JSON.stringify(text)});if(!b)return false;b.click();return true})()`);
  const waitFor = async (js, ms = 8000, step = 100) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(js)) return true; await sleep(step); } return false; };
  const busyWait = () => waitFor('!Silk.app.busy', 8000, 50);
  const panelText = id => ev(`(()=>{const s=document.querySelector('[data-panel-id="${id}"]');return s?s.innerText.replace(/\\s+/g,' ').slice(0,500):''})()`);
  const st = () => ev('(()=>{const p=Silk.app.state.progress;return {cash:p.cash,provisions:p.inventory.provisions,lots:p.inventory.lots.map(l=>({g:l.goodId,q:l.quantity})),deposits:JSON.stringify(Silk.finance.snapshot(p).deposits||{}),loans:(Silk.finance.snapshot(p).loans||[]).length}})()');
  // stepper probe inside a panel: state of the one shared component + surrounding form controls
  const probe = id => ev(`(()=>{const s=document.querySelector('[data-panel-id="${id}"]');if(!s)return null;const w=s.querySelector('.numeric-stepper');if(!w)return {stepper:false,inputs:s.querySelectorAll('input').length};const i=w.querySelector('.stepper-input'),m=w.querySelector('.stepper-minus'),p=w.querySelector('.stepper-plus');const cs=getComputedStyle(i);const bare=[...s.querySelectorAll('input')].filter(x=>!x.classList.contains('stepper-input')).length;const submit=s.querySelector('.panel-footer button, form .ui-button');return {stepper:true,value:i.value,minusDisabled:m.disabled,plusDisabled:p.disabled,bare,inputs:s.querySelectorAll('input').length,steppers:s.querySelectorAll('.numeric-stepper').length,bg:cs.backgroundColor,border:cs.borderColor,minH:Math.round(i.getBoundingClientRect().height),btnW:[Math.round(m.getBoundingClientRect().width),Math.round(p.getBoundingClientRect().width)],inputW:Math.round(i.getBoundingClientRect().width),submitDisabled:submit?submit.disabled:null,submitText:submit?submit.textContent.trim():null,inputmode:i.inputMode,hint:(s.querySelector('form .form-hint')||s.querySelector('.form-hint')||{}).textContent||''}})()`);
  const type = (id, text) => ev(`(()=>{const i=document.querySelector('[data-panel-id="${id}"] .stepper-input');i.focus();i.value=${JSON.stringify(text)};i.dispatchEvent(new Event('input',{bubbles:true}));i.dispatchEvent(new Event('blur'));return i.value})()`);
  const press = (id, which) => ev(`(()=>{const b=document.querySelector('[data-panel-id="${id}"] .stepper-${which}');if(!b||b.disabled)return false;b.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:1}));b.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:1}));return true})()`);
  const errors = [];
  try {
    await c.navigate('http://127.0.0.1:' + port + '/'); await sleep(900);
    await ev('new Promise(r=>{const t=setInterval(()=>{if(window.Silk&&Silk.app&&Silk.app.state){clearInterval(t);r()}},100)})');
    await clickText('启程'); await sleep(250); await clickText('自行探索'); await ev('new Promise(r=>{const t=setInterval(()=>{const p=Silk.app.state.progress;if(p&&p.world){clearInterval(t);r()}},100)})'); await sleep(400);
    let s0 = await st(); check('boot: new game in 长安 with cash', s0.cash > 0, JSON.stringify(s0));
    check('read-only: HUD / scene contain no stepper', await ev('!document.querySelector(".hud .numeric-stepper, .scene .numeric-stepper")'));
    // ---------------- A. market buy
    await ev(`document.querySelector('.city-hotspot[data-hotspot="market"]').click()`); await sleep(900); await busyWait();
    const buyOk = await ev(`(()=>{const b=[...document.querySelectorAll('[data-panel-id="market"] .market-product button')].find(x=>x.textContent.trim()==='买入'&&!x.disabled);if(!b)return null;const card=b.closest('.market-product');b.click();return card.dataset.goodId})()`); await sleep(400);
    check('A market → 买入 opens trade-form', Boolean(buyOk), buyOk);
    let pr = await probe('trade-form'); const unit = await ev(`(()=>{const t=document.querySelector('[data-panel-id="trade-form"]').innerText;const m=t.match(/单价\\s*(\\d+)/);return m?Number(m[1]):null})()`);
    check('A buy: one shared stepper, no bare input, default 1, － disabled, ＋ enabled, confirm enabled', pr && pr.stepper && pr.bare === 0 && pr.steppers === 1 && pr.value === '1' && pr.minusDisabled && !pr.plusDisabled && pr.submitDisabled === false, JSON.stringify(pr));
    check('A buy: paper field, not white; buttons equal width, middle wider, ≥44px tall', pr && pr.bg !== 'rgb(255, 255, 255)' && pr.btnW[0] === pr.btnW[1] && pr.inputW > pr.btnW[0] && pr.minH >= 44, JSON.stringify({ bg: pr.bg, btnW: pr.btnW, inputW: pr.inputW, h: pr.minH }));
    check('A buy: inputmode numeric', pr.inputmode === 'numeric'); await shot('market-buy-default');
    await press('trade-form', 'plus'); await sleep(120); pr = await probe('trade-form');
    check('A buy: ＋ → 2, 合计 = 2 × 单价, － enabled', pr.value === '2' && !pr.minusDisabled && new RegExp('合计\\s*' + (2 * unit) + '钱').test(pr.hint), JSON.stringify({ v: pr.value, hint: pr.hint, unit }));
    await press('trade-form', 'minus'); await sleep(120); pr = await probe('trade-form'); check('A buy: － → 1, － disabled again', pr.value === '1' && pr.minusDisabled);
    const maxBuy = await ev(`(()=>{const t=document.querySelector('[data-panel-id="trade-form"] .form-hint').textContent;const m=t.match(/最多(\\d+)/);return m?Number(m[1]):null})()`);
    await type('trade-form', '999999'); await sleep(120); pr = await probe('trade-form');
    check('A buy: typing 999999 clamps to business max (' + maxBuy + '), ＋ disabled at max', pr.value === String(maxBuy) && pr.plusDisabled && pr.submitDisabled === (maxBuy === 0), JSON.stringify({ v: pr.value, max: maxBuy, plus: pr.plusDisabled })); await shot('market-buy-max');
    await type('trade-form', 'abc'); await sleep(80); pr = await probe('trade-form'); check('A buy: letters rejected → empty, confirm disabled, － disabled', pr.value === '' && pr.submitDisabled === true && pr.minusDisabled, JSON.stringify(pr.value));
    await type('trade-form', '-3'); await sleep(80); pr = await probe('trade-form'); check('A buy: negative sign stripped', pr.value === '3', pr.value);
    await type('trade-form', '2.5'); await sleep(80); pr = await probe('trade-form'); check('A buy: decimal point stripped (integer only)', /^\d+$/.test(pr.value), pr.value);
    await type('trade-form', '0'); await sleep(80); pr = await probe('trade-form'); check('A buy: 0 → confirm disabled, － disabled', pr.value === '0' && pr.submitDisabled === true && pr.minusDisabled);
    await press('trade-form', 'plus'); await sleep(80); pr = await probe('trade-form'); check('A buy: ＋ from 0 → 1', pr.value === '1');
    await type('trade-form', '2'); await sleep(80); const cashBefore = (await st()).cash; await clickText('确认买入'); await busyWait(); await sleep(500);
    let s1 = await st(); const bought = s1.lots.find(l => l.g === buyOk);
    check('A buy: 确认买入 dispatches the stepper value — 2 件 bought, cash −2×单价 (gameplay unchanged)', bought && bought.q === 2 && s1.cash === cashBefore - 2 * unit, JSON.stringify({ bought, cash: [cashBefore, s1.cash], unit }));
    await ev(`(()=>{const p=Silk.app.state.progress;const ar=p.presentation.activeResult;if(ar)Silk.ui.dispatch('result.ack',{resultId:ar.id});})()`); await busyWait(); await sleep(300);
    // ---------------- B. market sell
    await ev(`(()=>{for(const s of document.querySelectorAll('section.secondary-panel .close-button'))if(s.offsetParent!==null)s.click();})()`); await sleep(300);
    const sellOk = await ev(`(()=>{const card=document.querySelector('[data-panel-id="market"] .market-product[data-good-id="${buyOk}"]');const b=card&&[...card.querySelectorAll('button')].find(x=>/卖出/.test(x.textContent)&&!x.disabled);if(!b)return false;b.click();return true})()`); await sleep(400);
    check('B market → 卖出 opens the sell form', sellOk);
    pr = await probe('trade-form'); check('B sell: same shared stepper on 售出, max = held quantity (2), ＋ disabled at max after typing', pr && pr.stepper && pr.bare === 0 && pr.submitText === '确认出售', JSON.stringify(pr && { v: pr.value, submit: pr.submitText }));
    await type('trade-form', '99'); await sleep(80); pr = await probe('trade-form'); check('B sell: 99 → clamped to 2, ＋ disabled', pr.value === '2' && pr.plusDisabled, pr.value); await shot('market-sell');
    await type('trade-form', '1'); await sleep(80); await clickText('确认出售'); await busyWait(); await sleep(500); s1 = await st(); const left = s1.lots.find(l => l.g === buyOk);
    check('B sell: 1 件 sold via stepper value, 1 left', left && left.q === 1, JSON.stringify(s1.lots));
    await ev(`(()=>{const p=Silk.app.state.progress;const ar=p.presentation.activeResult;if(ar)Silk.ui.dispatch('result.ack',{resultId:ar.id});})()`); await busyWait(); await sleep(300);
    // ---------------- C. provisions
    await ev(`(()=>{for(const s of document.querySelectorAll('section.secondary-panel .close-button'))if(s.offsetParent!==null)s.click();})()`); await sleep(300);
    await clickText('购买粮草'); await sleep(400); pr = await probe('provisions');
    check('C provisions: shared stepper (日份), default 1, hint 支出', pr && pr.stepper && pr.bare === 0 && pr.value === '1' && /支出/.test(pr.hint), JSON.stringify(pr && { v: pr.value, hint: pr.hint }));
    await type('provisions', '999999'); await sleep(80); pr = await probe('provisions'); const cashNow = (await st()).cash; check('C provisions: clamps to cash (' + cashNow + ')', pr.value === String(cashNow) && pr.plusDisabled, pr.value); await shot('provisions');
    await type('provisions', '3'); await sleep(80); await clickText('购买补给'); await busyWait(); await sleep(500); s1 = await st(); check('C provisions: bought 3 日份 for 3 钱', s1.provisions === 3 && s1.cash === cashNow - 3, JSON.stringify({ prov: s1.provisions, cash: [cashNow, s1.cash] }));
    await ev(`(()=>{const p=Silk.app.state.progress;const ar=p.presentation.activeResult;if(ar)Silk.ui.dispatch('result.ack',{resultId:ar.id});})()`); await busyWait(); await sleep(300);
    await ev("Silk.ui.closeSecondary()"); await sleep(200); const leftMarket = await clickText('离开市场'); await busyWait(); await sleep(400);
    await ev(`(()=>{const p=Silk.app.state.progress;const ar=p.presentation.activeResult;if(ar)Silk.ui.dispatch('result.ack',{resultId:ar.id});})()`); await busyWait(); await sleep(300);
    check('C 离开市场 (market visit settled before 柜坊)', leftMarket && (await ev('(()=>{const v=Silk.app.state.progress.market.visit;return !v||v.settled})()')));
    // ---------------- D. 柜坊
    await ev(`(()=>{for(const s of document.querySelectorAll('section.paper-panel .close-button'))if(s.offsetParent!==null)s.click();})()`); await sleep(300);
    const settleUi = async () => { for (let i = 0; i < 6; i++) { const acted = await ev(`(()=>{const p=Silk.app.state.progress;const ar=p.presentation.activeResult;if(ar){Silk.ui.dispatch('result.ack',{resultId:ar.id});return 'ack'}const m=document.querySelector('section.modal-panel');if(m&&!m.hidden&&m.offsetParent!==null){const b=[...m.querySelectorAll('button')].find(x=>x.offsetParent!==null&&!x.disabled);if(b){b.click();return 'modal:'+b.textContent.trim()}}const n=p.presentation.notices;if(n&&n.length){const nt=n[0];Silk.ui.dispatch(nt.kind==='tutorial'?'tutorial.dismiss':'notice.dismiss',nt.kind==='tutorial'?{id:nt.id}:{ids:[nt.id],id:nt.id});return 'notice'}return null})()`); await busyWait(); await sleep(250); if (!acted) break; } };
    await settleUi(); await ev(`(()=>{for(const s of document.querySelectorAll('section.paper-panel .close-button'))if(s.offsetParent!==null)s.click();})()`); await sleep(300); await settleUi();
    await ev(`document.querySelector('.city-hotspot[data-hotspot="guifang"]').click()`); await sleep(600); await settleUi(); let gt = await panelText('guifang');
    check('D 柜坊 opens', /寄存/.test(gt), gt.slice(0, 80) || JSON.stringify(await ev('(()=>({panels:[...document.querySelectorAll("section.paper-panel")].filter(x=>!x.hidden&&x.offsetParent!==null).map(x=>x.dataset.panelId),phase:Silk.app.state.progress.world.tick%3,text:document.body.innerText.replace(/\\s+/g," ").slice(0,160)}))()')));
    const openFinance = async (label) => { if (label === '存钱' || label === '取钱') { const dep = await ev(`(()=>{const b=[...document.querySelectorAll('[data-panel-id="guifang"] button')].find(x=>/寄存$/.test(x.textContent.trim())&&!x.disabled);if(!b)return false;b.click();return true})()`); await sleep(350); if (!dep) return false; } const ok = await clickText(label); await waitFor('!!document.querySelector(\'[data-panel-id="finance-form"] .numeric-stepper\')', 4000); await sleep(200); return ok; };
    check('D 存钱 form opens (柜坊 → 长安寄存 → 存钱)', await openFinance('存钱')); pr = await probe('finance-form');
    if (!pr) { const diag = await ev('(()=>({panels:[...document.querySelectorAll("section.paper-panel")].filter(x=>!x.hidden&&x.offsetParent!==null).map(x=>x.dataset.panelId+":"+x.innerText.replace(/\\s+/g," ").slice(0,80)),modal:(document.querySelector("section.modal-panel")||{}).innerText||"",busy:Silk.app.busy}))()'); const errs = c.console.filter(m => m.type === 'error' || m.type === 'exception').map(m => m.text.slice(0, 300)); check('D diagnostics (finance-form missing)', false, JSON.stringify({ diag, errs: errs.slice(-3) })); throw new Error('finance-form missing'); }
    check('D deposit: shared stepper, empty → confirm disabled, － disabled, ＋ enabled, limit hint', pr && pr.stepper && pr.bare === 0 && pr.value === '' && pr.submitDisabled === true && pr.minusDisabled && !pr.plusDisabled && /当前可办理上限/.test(pr.hint), JSON.stringify(pr && { v: pr.value, hint: pr.hint, sub: pr.submitDisabled }));
    await press('finance-form', 'plus'); await sleep(100); pr = await probe('finance-form'); check('D deposit: ＋ from empty → 1, confirm enabled', pr.value === '1' && pr.submitDisabled === false);
    const cashD = (await st()).cash; await type('finance-form', '999999'); await sleep(100); pr = await probe('finance-form'); check('D deposit: clamps to cash (' + cashD + '), ＋ disabled', pr.value === String(cashD) && pr.plusDisabled, pr.value); await shot('finance-deposit');
    await type('finance-form', '10'); await sleep(100); await clickText('确认办理'); await busyWait(); await sleep(500); s1 = await st(); check('D deposit: 10 钱 deposited via stepper value', s1.cash === cashD - 10, JSON.stringify({ cash: [cashD, s1.cash] }));
    await clickText('继续办理'); await busyWait(); await sleep(400);
    check('D 取钱 form opens', await openFinance('取钱')); await type('finance-form', '999'); await sleep(100); pr = await probe('finance-form'); check('D withdraw: max = local deposit (10), clamped, ＋ disabled', pr.value === '10' && pr.plusDisabled, pr.value); await shot('finance-withdraw');
    await ev("Silk.ui.closeSecondary()"); await sleep(200); await ev("Silk.ui.closeSecondary()"); await sleep(200);
    const borrowOpen = await openFinance('借款'); if (borrowOpen) { pr = await probe('finance-form'); check('D borrow: shared stepper with credit limit hint', pr && pr.stepper && pr.bare === 0 && /当前可办理上限/.test(pr.hint), JSON.stringify(pr && pr.hint)); await shot('finance-borrow'); await press('finance-form', 'plus'); await sleep(80); await type('finance-form', '20'); await sleep(80); pr = await probe('finance-form'); if (pr.submitDisabled === false) { await clickText('确认办理'); await busyWait(); await sleep(500); await clickText('继续办理'); await busyWait(); await sleep(400); } else { await ev(`(()=>{for(const s of document.querySelectorAll('section.secondary-panel .close-button'))if(s.offsetParent!==null)s.click();})()`); await sleep(300); } } else check('D borrow: not offered in this state (skipped)', true);
    const repayOpen = await openFinance('还款'); if (repayOpen) { await clickText('还款'); await sleep(400); pr = await probe('finance-form'); await type('finance-form', '99999'); await sleep(100); pr = await probe('finance-form'); check('D repay: shared stepper, clamped to min(cash, outstanding), ＋ disabled', pr && pr.stepper && pr.bare === 0 && pr.plusDisabled && Number(pr.value) > 0, JSON.stringify(pr && { v: pr.value, hint: pr.hint })); await shot('finance-repay'); await ev(`(()=>{for(const s of document.querySelectorAll('section.secondary-panel .close-button'))if(s.offsetParent!==null)s.click();})()`); await sleep(300); } else check('D repay: no loan in this state (skipped)', true);
    await ev(`(()=>{for(const s of document.querySelectorAll('section.paper-panel .close-button'))if(s.offsetParent!==null)s.click();})()`); await sleep(300);
    await ev(`document.querySelector('.city-hotspot[data-hotspot="guifang"]').click()`); await sleep(400); const vOpen = await clickText('飞钱'); await sleep(400); const v2 = await clickText('办理飞钱'); await sleep(400);
    if (vOpen && v2) { pr = await probe('finance-form'); const cashV = (await st()).cash; await type('finance-form', '999999'); await sleep(100); pr = await probe('finance-form');
      check('D 飞钱: shared stepper + source/destination selects kept; clamps to cash', pr && pr.stepper && pr.bare === 0 && pr.value === String(cashV) && /最低面额/.test(pr.hint), JSON.stringify(pr && { v: pr.value, hint: pr.hint.slice(0, 80) }));
      const switched = await ev(`(()=>{const sel=document.querySelector('[data-panel-id="finance-form"] select[name="finance-source"]');if(!sel)return null;sel.value='deposit';sel.dispatchEvent(new Event('change',{bubbles:true}));return document.querySelector('[data-panel-id="finance-form"] .stepper-input').value})()`); await sleep(100); pr = await probe('finance-form');
      check('D 飞钱: switching source to 寄存 re-clamps the stepper to the deposit limit (10) live', switched === '10' && pr.plusDisabled, JSON.stringify({ switched, hint: pr.hint.slice(0, 60) })); await shot('finance-voucher');
    } else check('D 飞钱 form (skipped: ' + vOpen + '/' + v2 + ')', true);
    await ev(`(()=>{for(const s of document.querySelectorAll('section.paper-panel .close-button'))if(s.offsetParent!==null)s.click();})()`); await sleep(300);
    // ---------------- E. 商号 amount panel (three variants), opened directly on the merchant panel
    await ev("Silk.ui.openPanel('merchant_business')"); await sleep(300); await ev("Silk.ui.openSecondary('business-amount',{type:'merchant.unstock',payload:{},field:'quantity',max:7,label:'输入数量',unit:'件'})"); await sleep(300); pr = await probe('business-amount');
    check('E 商号 quantity: shared stepper, empty → confirm disabled, hint 上限 7件', pr && pr.stepper && pr.bare === 0 && pr.value === '' && pr.submitDisabled === true && /当前上限：7件/.test(pr.hint), JSON.stringify(pr && { v: pr.value, hint: pr.hint }));
    await type('business-amount', '50'); await sleep(80); pr = await probe('business-amount'); check('E 商号 quantity: clamps to 7, ＋ disabled, confirm enabled', pr.value === '7' && pr.plusDisabled && pr.submitDisabled === false); await shot('business-quantity');
    await ev("Silk.ui.closeSecondary()"); await sleep(200); await ev("Silk.ui.openSecondary('business-amount',{type:'merchant.saleRule',payload:{},field:'value',label:'输入每件底价'})"); await sleep(300); pr = await probe('business-amount');
    await press('business-amount', 'plus'); await sleep(80); await type('business-amount', '123456'); await sleep(80); pr = await probe('business-amount'); check('E 商号 price (no business max): integer entry kept, ＋ stays enabled, confirm enabled', pr.value === '123456' && !pr.plusDisabled && pr.submitDisabled === false, JSON.stringify({ v: pr.value }));
    await ev("Silk.ui.closeSecondary()"); await sleep(200); await ev("Silk.ui.openSecondary('business-amount',{type:'merchant.saleRule',payload:{},field:'value',label:'输入百分比',unit:'%',decimal:true,percent:true,allowZero:true,description:'输入10表示10%。'})"); await sleep(300);
    await type('business-amount', '12.5'); await sleep(80); pr = await probe('business-amount'); check('E 商号 percent (existing decimal rule): 12.5 accepted by the same component, inputmode decimal', pr.value === '12.5' && pr.inputmode === 'decimal' && pr.submitDisabled === false, JSON.stringify({ v: pr.value, im: pr.inputmode }));
    await type('business-amount', '0'); await sleep(80); pr = await probe('business-amount'); check('E 商号 percent allowZero: 0 valid, － disabled at 0', pr.value === '0' && pr.minusDisabled && pr.submitDisabled === false); await shot('business-percent');
    await ev("Silk.ui.closeSecondary()"); await sleep(200); await ev("Silk.ui.closePanel()"); await sleep(200);
    // ---------------- F. no leftover native inputs anywhere
    const bareSeen = checks.filter(x => /"bare":[1-9]/.test(x.detail)).length;
    check('F every editable number seen used .stepper-input (no bare native inputs in any visited panel)', bareSeen === 0, 'panels with bare inputs: ' + bareSeen);
    const consoleErrors = c.console.filter(m => m.type === 'error' || m.type === 'exception').map(m => m.text.slice(0, 160)); check('N no console errors', consoleErrors.length === 0, JSON.stringify(consoleErrors.slice(0, 3)));
  } catch (e) { errors.push(String(e && e.stack || e)); console.error(e); }
  await c.close(); srv.stop();
  const passed = checks.filter(x => x.ok).length;
  fs.writeFileSync(path.join(outDir, 'stepper-run.json'), JSON.stringify({ label, passed, total: checks.length, checks, errors }, null, 2));
  console.log(`stepper browser run [${label}]: ${passed}/${checks.length}` + (errors.length ? ' (script error)' : '') + ' → ' + outDir);
  process.exit(passed === checks.length && !errors.length ? 0 : 1);
})();
