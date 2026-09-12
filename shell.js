(function (S) {
  'use strict';
  const cities = { changan: '长安', dunhuang: '敦煌', khotan: '于阗' };
  const panels = new Map();
  const resultRenderers = new Map();
  const ui = { app: null, state: null, primary: null, secondary: null, back: [], modals: [], busy: false,
    tutorialCooldown: false, keyboard: false, mounted: false, error: '', focusReturn: null, sceneCity: null, viewMemory: new Map(),lastResultId:null,resultReturn:null,entrySerial:0 };
  let nodes = {};
  let journeyController=null,lastRouteId=null,lastTripId=null;
  // City hotspots are scene-level: coordinates are pixels on the 720×1600 (20:9) city artwork and scale with the art in fitScene(); they never follow the HUD or the viewport.
  // The 20:9 backgrounds are the 720×1280 composition placed at y=320..1600 with 320px of added sky above (pixel match, mean diff ≈0.5/255): x unchanged, y +320; no hotspot re-marked.
  const cityArt = { w: 720, h: 1600, slackTop: 320, slackBottom: 0 };
  // Home (941×2091) and journey (657×1460) arts are the 20:9 versions with parchment above/below the original composition; the added regions are the only croppable slack.
  const homeArt = { w: 941, h: 2091, slackTop: 300, slackBottom: 119 }, travelArt = { w: 657, h: 1460, slackTop: 140, slackBottom: 137 };
  // Fit rule shared by the long arts: the original composition (between the slack regions) is always complete at its own aspect ratio; the slack fills the remaining height and is cropped (top/bottom in proportion) only when the viewport is shorter than the full art; bands appear only when even the composition cannot fill.
  function fitSlack(width,height,art){const stdH=art.h-art.slackTop-art.slackBottom,scale=Math.min(width/art.w,height/stdH),w=art.w*scale,h=art.h*scale,slack=art.slackTop+art.slackBottom;let top;if(h<=height)top=(height-h)/2;else{const crop=h-height;top=-(slack?crop*art.slackTop/slack:crop/2);}return {w,h,left:(width-w)/2,top};}
  const hotspots = {
    changan: [['work','营生',140,780],['depart','出发',367,850],['guifang','柜坊',489,916],['inn','客舍',199,932],['merchant_business','商号',641,1055],['inspect','商情',199,1154],['market','市场',516,1361]],
    dunhuang: [['depart','出发',497,795],['guifang','柜坊',170,993],['inn','客舍',252,1086],['inspect','商情',176,1208],['market','市场',589,1208],['work','营生',639,1376]],
    khotan: [['inn','客舍',383,718],['market','市场',559,858],['guifang','柜坊',432,990],['inspect','商情',161,1001],['depart','出发',536,1074],['work','营生',337,1323]]
  };

  const titles = { pack:'行囊', commission:'委托', message:'消息', merchant_business:'商号', more:'更多', guifang:'柜坊', inn:'客舍', market:'市场', work:'营生', 'dunhuang-work':'营生', caravan:'驼队装货', inspect:'商情', depart:'出发', map:'地图', funds:'资金总览', reputation:'商誉详情', time:'时间与商期', help:'玩法说明', settings:'设置', notification:'系统通知', archive:'丝路之录' };
  const icons = { pack:'pack', commission:'commission', message:'message', merchant_business:'merchant_business', more:'more', money:'money', reputation:'reputation', time:'time_calendar', close:'close', help:'help', settings:'settings', notification:'notification', archive:'silkroad_archive', inspect:'inspect' };
  function el(tag, className, text) { const e=document.createElement(tag); if(className)e.className=className; if(text!==undefined)e.textContent=String(text); return e; }
  function asset(name) { const found=S.assets && S.assets[name]; if(!found)throw new Error('CURRENT asset mapping missing: '+name); return found; }
  function icon(name, className='ui-icon') { const e=el('img',className); e.src=asset('global_icon_'+(icons[name]||name)+'_v01'); e.alt=''; e.draggable=false; return e; }
  function button(label, fn, options={}) { const b=el('button',options.className||'ui-button',label),generation=ui.state?.meta.generation; b.type='button'; b.disabled=Boolean(options.disabled)||ui.busy; if(!options.disabled)b.dataset.busyDisabled='true';if(options.label)b.setAttribute('aria-label',options.label); b.addEventListener('click',()=>{if(b.isConnected&&ui.state?.meta.generation===generation&&!b.disabled&&!ui.busy){if(options.natural!==false)ui.tutorialCooldown=false;fn();}}); return b; }
  function closeButton(fn) { const b=button('',fn,{className:'close-button',label:'关闭',natural:false});b.append(icon('close'));return b; }
  function row(label,value,parent,action) { const e=action?button('',action,{className:'info-row row-button'}):el('div','info-row'); e.append(el('span','row-label',label),el('span','row-value',value));if(parent)parent.append(e);return e; }
  function paragraph(parent,text,className) { parent.append(el('p',className||'',text)); }
  function formatMoney(value) { return Number.isSafeInteger(value)?value.toLocaleString('zh-CN')+'钱':'—'; }
  function p() { return ui.state&&ui.state.progress; }
  function date(tick) { return S.time&&S.time.format?S.time.format(tick):'日期待接入'; }
  function panelKey() { return [ui.primary&&ui.primary.id,ui.secondary&&ui.secondary.id].filter(Boolean).join('/'); }
  function context() { const generation=ui.state?.meta.generation;return { S, state:ui.state,p:p(),app:ui.app,entryId:ui.entrySerial,el,button,numericStepper,row,paragraph,formatMoney,date,openPanel,openSecondary,closePanel,closeSecondary,dispatch(type,payload,sourceId){return ui.state?.meta.generation===generation?dispatch(type,payload,sourceId,generation):Promise.resolve(null);},showModal,dismissModal,engineeringGap }; }
  function commandAvailable(type) { return type==='game.start'||type==='game.reset'||Boolean(S.commands&&S.commands.has(type)); }
  function stableSource(type,payload) { const m=ui.state&&ui.state.meta||{};const text=S.util&&S.util.stable?S.util.stable(payload):JSON.stringify(payload);let hash=2166136261;for(let i=0;i<text.length;i++)hash=Math.imul(hash^text.charCodeAt(i),16777619);return 'ui-'+m.generation+'-'+m.revision+'-'+type.replace(/[^A-Za-z0-9_-]/g,'-').slice(0,60)+'-'+(hash>>>0).toString(16); }
  async function dispatch(type,payload={},sourceId,expectedGeneration=ui.state?.meta.generation,acknowledgedRisk=false) {
    if(ui.busy)return null;
    if(expectedGeneration!==ui.state?.meta.generation)return null;
    if(!commandAvailable(type)){engineeringGap(titles[type]||'当前操作','该已确定功能尚未完成命令接入。');return null;}
    const id=sourceId||stableSource(type,payload);
    if(!acknowledgedRisk&&p()&&S.timeRisk?.check){const risk=S.timeRisk.check(p(),type,payload);if(risk)return new Promise(resolve=>{
      const previous=ui.modals[0];const restore=()=>{if(previous)ui.modals[0]=previous;else ui.modals.shift();renderModals();renderNotices();};
      const warning={title:risk.title,body:risk.text,actions:[{label:'取消',run:()=>{restore();resolve(null);}},{label:'仍要继续',run:async()=>{restore();resolve(await dispatch(type,{...payload,...(risk.confirmPayload||{})},id,expectedGeneration,true));}}]};
      if(previous)ui.modals[0]=warning;else ui.modals.unshift(warning);renderModals();renderNotices();
    });}
    ui.busy=true;ui.error='';renderControls();
    try {
      const result=await ui.app.dispatch(type,payload,id,expectedGeneration);
      ui.state=ui.app.state||ui.state;
      if(type==='game.reset'){ui.startChoice=false;ui.primary=null;ui.secondary=null;ui.back=[];ui.modals=[];ui.viewMemory.clear();ui.sceneCity=null;journeyController?.retry();}
      if(type==='tutorial.dismiss')ui.tutorialCooldown=true;
      else if(type!=='notice.dismiss'&&type!=='result.ack')ui.tutorialCooldown=false;
      return result;
    } catch(error) {
      if(type==='game.reset')ui.error='未能重新开始游戏。当前进度未被清除，请稍后重试。';
      else ui.error=(error&&error.message&&/[\u3400-\u9fff]/.test(error.message))?error.message:'操作尚未完成，请稍后重试。';
      return null;
    } finally {ui.busy=false;render(ui.state);}
  }
  // GLOBAL_NUMERIC_STEPPER_UI_PATCH_v1.1 — the single shared numeric input: 【－】[editable integer]【＋】. Every player-editable
  // quantity / amount in the game goes through this. It owns only the widget: min / max come from the calling business rule (max may be
  // a function so it tracks live limits), manual entry and the buttons share the same clamp, and the caller keeps its own validation +
  // submit logic (the inner <input> keeps its name and still fires 'input' events, so existing listeners, captureInputs/restoreInputs and
  // the browser tests keep working). Integer only unless the calling rule already accepts decimals (decimal:true); step 1; hold to repeat.
  function numericStepper(options={}) {
    const wrap=el('div','numeric-stepper'); wrap.setAttribute('role','group'); if(options.label)wrap.setAttribute('aria-label',options.label);
    const minus=el('button','stepper-btn stepper-minus','－'); minus.type='button'; minus.setAttribute('aria-label','减少'); minus.tabIndex=-1;
    const plus=el('button','stepper-btn stepper-plus','＋'); plus.type='button'; plus.setAttribute('aria-label','增加'); plus.tabIndex=-1;
    const input=el('input','stepper-input'); input.type='text'; input.inputMode=options.decimal?'decimal':'numeric'; input.pattern=options.decimal?'[0-9.]*':'[0-9]*'; input.autocomplete='off'; input.maxLength=15; input.enterKeyHint='done';
    if(options.name)input.name=options.name; if(options.label)input.setAttribute('aria-label',options.label); input.value=options.value===undefined||options.value===null?'':String(options.value);
    wrap.append(minus,input,plus);
    const step=options.step||1;
    const limits=()=>{const raw=typeof options.max==='function'?options.max():options.max;const max=raw===undefined||raw===null||!Number.isFinite(Number(raw))?Infinity:Math.max(0,Number(raw));const min=options.min===undefined||options.min===null?1:Number(options.min);return {min,max};};
    const parse=()=>{const t=input.value;if(!(options.decimal?/^\d+(\.\d{1,4})?$/:/^\d+$/).test(t))return null;const n=Number(t);return Number.isFinite(n)?n:null;};
    function sanitize(){let v=input.value.replace(options.decimal?/[^0-9.]/g:/[^0-9]/g,'');if(options.decimal){const i=v.indexOf('.');if(i>=0)v=v.slice(0,i+1)+v.slice(i+1).replace(/\./g,'');}
      const {max}=limits();if(v!==''&&Number(v)>max)v=String(max);if(v!==input.value){const pos=v.length;input.value=v;try{input.setSelectionRange(pos,pos);}catch(_){}}}
    function refresh(){const {min,max}=limits(),n=parse(),off=Boolean(options.disabled);input.disabled=off;minus.disabled=off||n===null||n<=min;plus.disabled=off||max<min||(n!==null&&n>=max);wrap.classList.toggle('at-min',n!==null&&n<=min);wrap.classList.toggle('at-max',n!==null&&n>=max);wrap.classList.toggle('is-empty',n===null);}
    function stepBy(direction){const {min,max}=limits();if(max<min)return;const cur=parse();let n=cur===null?(direction>0?Math.max(min,step):min):cur+direction*step;if(options.decimal)n=Math.round(n*10000)/10000;n=Math.min(max,Math.max(min,n));if(!Number.isFinite(n))return;input.value=String(n);input.dispatchEvent(new Event('input',{bubbles:true}));}
    function hold(btn,direction){let timer=null,repeat=null;const stop=()=>{clearTimeout(timer);clearInterval(repeat);timer=repeat=null;};
      btn.addEventListener('pointerdown',e=>{if(btn.disabled)return;e.preventDefault();stepBy(direction);timer=setTimeout(()=>{repeat=setInterval(()=>{if(btn.disabled||!btn.isConnected){stop();return;}stepBy(direction);},90);},420);});
      for(const type of ['pointerup','pointerleave','pointercancel','lostpointercapture'])btn.addEventListener(type,stop);
      btn.addEventListener('click',e=>{if(e.detail===0&&!btn.disabled)stepBy(direction);});   // keyboard / assistive activation (pointer clicks are handled on pointerdown)
    }
    hold(minus,-1);hold(plus,1);
    input.addEventListener('input',()=>{sanitize();refresh();if(options.onChange)options.onChange(parse(),input.value);});
    input.addEventListener('blur',()=>{if(options.decimal&&/\.$/.test(input.value)){input.value=input.value.slice(0,-1);input.dispatchEvent(new Event('input',{bubbles:true}));}refresh();});
    input.addEventListener('focus',()=>{try{input.select();}catch(_){}});
    refresh();
    return {element:wrap,input,minus,plus,refresh,limits,value:parse,set(v){input.value=v===undefined||v===null?'':String(v);input.dispatchEvent(new Event('input',{bubbles:true}));}};
  }
  function captureInputs() {
    const content=nodes.secondaryBody&&ui.secondary?nodes.secondaryBody:nodes.primaryBody;
    if(!content)return;
    const values={};content.querySelectorAll('input[name],select[name],textarea[name]').forEach(e=>{values[e.name]={value:e.value,checked:e.checked};});
    ui.viewMemory.set(panelKey(),{values,scroll:content.scrollTop,focus:content.contains(document.activeElement)?document.activeElement.name:null});
  }
  function restoreInputs(content) {
    const old=ui.viewMemory.get(panelKey());if(!old)return;
    content.querySelectorAll('input[name],select[name],textarea[name]').forEach(e=>{if(old.values[e.name]){e.value=old.values[e.name].value;e.checked=old.values[e.name].checked;}});
    content.querySelectorAll('input[name="finance-amount"],input[name="business-amount"],input[name^="quantity-"]').forEach(amount=>amount.dispatchEvent(new Event('input',{bubbles:true})));
    content.scrollTop=old.scroll;
    if(old.focus){const e=[...content.querySelectorAll('[name]')].find(x=>x.name===old.focus);if(e)e.focus({preventScroll:true});}
  }
  function openPanel(id,data={}) {
    if(id==='depart')id='trip';
    if(ui.busy||ui.modals.length||activeResult()||workResult())return;
    if(p()?.world.route&&id!=='trip')return;
    if(p()?.eventSession&&['AWAITING_CHOICE','AWAITING_SKILL'].includes(p().eventSession.status)&&id!=='event')return;
    if(ui.primary&&ui.primary.id===id&&!ui.secondary)return;
    if(id!=='market'&&p()?.market.visit&&!p().market.visit.settled){openSecondary(id,data);return;}
    captureInputs();ui.focusReturn=document.activeElement;ui.primary={id,data};ui.entrySerial++;ui.secondary=id==='trip'&&p()?.trip?.phase==='return_tasks'?{id:'return-tasks',data:{}}:null;ui.back=[];ui.error='';ui.tutorialCooldown=false;renderPanels();renderNotices();focusPanel();
    if(id==='market'&&(!p()?.market.visit||p().market.visit.settled)&&S.time.phase(p())!==2)void dispatch('market.enter').then(result=>{if(result)visitTutorial(id,data);});
    else visitTutorial(id,data);
  }
  function openSecondary(id,data={}) {
    if(ui.busy||ui.modals.length)return;
    captureInputs();if(ui.secondary)ui.back.push(ui.secondary);ui.secondary={id,data};ui.error='';renderPanels();renderNotices();focusPanel();visitTutorial(id,data);
  }
  function visitTutorial(panel,data){if(p()&&!activeResult()&&S.tutorial?.needsVisit(p(),panel,data))void dispatch('tutorial.visit',{panel,data});}
  function closeSecondary() {if(ui.busy)return;captureInputs();ui.secondary=ui.back.pop()||null;ui.error='';renderPanels();renderNotices();focusPanel();}
  function closePanel() {
    if(ui.busy||activeResult()||workResult())return;
    if(p()?.world.route||p()?.eventSession&&['AWAITING_CHOICE','AWAITING_SKILL'].includes(p().eventSession.status))return;
    if(ui.primary&&ui.primary.id==='caravan'&&S.caravanUI&&S.caravanUI.interceptClose&&S.caravanUI.interceptClose())return;
    const work=activeWork();if(work){if(work.kind==='tavern'&&work.mode==='TRIAL'){dispatch('TAVERN_ABORT',{sessionId:work.id}).then(()=>{if(!ui.error){ui.primary=null;render(ui.state);}});}return;}
    if(ui.primary&&ui.primary.id==='market'&&p()&&p().market.visit&&!p().market.visit.settled){dispatch('market.leave',{visitId:p().market.visit.id}).then(()=>{if(!ui.error){ui.primary=null;ui.secondary=null;render(ui.state);}});return;}
    captureInputs();ui.primary=null;ui.secondary=null;ui.back=[];ui.error='';ui.tutorialCooldown=false;renderPanels();renderNotices();if(ui.focusReturn&&ui.focusReturn.isConnected)ui.focusReturn.focus({preventScroll:true});
  }
  function showModal(spec) {ui.modals.push(spec);renderModals();renderNotices();}
  function dismissModal() {if(ui.busy)return;ui.modals.shift();renderModals();renderNotices();focusPanel();}
  function engineeringGap(title,detail) {showModal({title,engineering:true,body:detail||'此功能规则已确定，当前工程尚未完成接入。',actions:[{label:'返回',run:dismissModal}]});}
  function beginReset() {
    showModal({id:'reset-first',title:'重新开始游戏？',body:'重新开始后，你当前的商旅进度、钱财、行囊、商誉、委托、商号及其他游戏进度都会清除。游戏设置会保留。',actions:[{label:'取消',run:dismissModal},{label:'继续',run:()=>{ui.modals[0]={id:'reset-final',title:'最后确认',body:'当前游戏进度将被永久清除，无法恢复。确认重新开始吗？',actions:[{label:'返回',run:dismissModal},{label:'确认重新开始',danger:true,run:()=>dispatch('game.reset')}]};renderModals();}}]});
  }
  function activeResult() {return p()&&p().presentation&&p().presentation.activeResult||null;}
  function activeWork() {const work=p()&&p().work;if(!work)return null;for(const [kind,session] of [['tavern',work.tavern],['routeGame',work.routeGame],['caravan',work.caravan]]){if(session&&!session.result&&!['FINISHED','COMPLETE','COMPLETED','ABORTED','SETTLED'].includes(session.phase))return {...session,kind};}return null;}
  function workResult() {const work=p()&&p().work;if(!work)return null;const session=work.tavern;if(session&&session.result&&session.result.completionStatus==='COMPLETED'&&!session.resultAcknowledged)return session;const caravan=work.caravan;if(caravan&&caravan.result&&!caravan.settled)return {...caravan,kind:'caravan'};return null;}
  function isFinanceResult(result=activeResult()) {return Boolean(result&&['deposit','withdraw','borrow','repay','issueVoucher','redeemVoucher'].includes(result.type));}
  function isEventResult(result=activeResult()) {return result?.kind==='event';}
  function isInnResult(result=activeResult()) {return result?.kind==='innFeedback';}
  function containedResult() {return isFinanceResult()||isEventResult()||isInnResult();}
  function blocking() {return ui.busy||ui.modals.length>0||Boolean(activeResult())||Boolean(activeWork())||Boolean(workResult());}
  function focusPanel() {const top=nodes.modal&&!nodes.modal.hidden?nodes.modal:nodes.result&&!nodes.result.hidden?nodes.result:ui.secondary?nodes.secondary:ui.primary?nodes.primary:null;if(top){const first=top.querySelector('button:not(:disabled), input:not(:disabled), [tabindex="0"]');if(first)first.focus({preventScroll:true});}}
  function makePanel(kind) {
    const layer=el('section','panel-layer '+kind+'-layer');layer.hidden=true;
    const backdrop=el('div','panel-backdrop');backdrop.setAttribute('aria-hidden','true');layer.append(backdrop);
    const box=el('section','paper-panel '+kind+'-panel');box.setAttribute('role','dialog');box.setAttribute('aria-modal',kind==='modal'?'true':'false');box.tabIndex=-1;
    const header=el('header','panel-header'),body=el('div','panel-body'),footer=el('footer','panel-footer');box.append(header,body,footer);layer.append(box);
    return {layer,box,header,body,footer};
  }
  function renderScene() {
    const progress=p();if(!progress)return;
    if(progress.world.route){
      ui.sceneCity=null;nodes.scene.classList.add('journey-scene');nodes.scene.setAttribute('aria-label','行进地图');
      for(const old of nodes.scene.querySelectorAll(':scope > .world-map-button, :scope > .travel-art-caption, :scope > .journey-status'))old.remove();nodes.sceneWorld.replaceChildren();
      renderTravelArt(context(),nodes.sceneWorld,progress.world.route);const cap=nodes.sceneWorld.querySelector('.travel-art-caption');if(cap)nodes.scene.append(cap);nodes.scene.append(mapButton(()=>openSecondary('map')));
      const status=el('div','journey-status');status.setAttribute('aria-live','polite');
      if(ui.error){paragraph(status,ui.error,'inline-error');status.append(button('重试行程',()=>{ui.error='';journeyController?.retry();render(ui.state);}));status.append(button('重新载入存档',()=>location.reload()));}
      nodes.scene.append(status);fitScene();return;
    }
    nodes.scene.classList.remove('journey-scene');for(const old of nodes.scene.querySelectorAll(':scope > .travel-art-caption, :scope > .journey-status'))old.remove();
    const city=progress.world.city;
    if(ui.sceneCity!==city){
      ui.sceneCity=city;nodes.sceneWorld.replaceChildren();nodes.scene.setAttribute('aria-label',cities[city]+'城市主界面');
      nodes.scene.querySelector(':scope > .world-map-button')?.remove();nodes.scene.append(mapButton(()=>openPanel('map')));
      const img=el('img','city-background');img.src=asset('B7_city_'+city+'_bg_v0'+(city==='changan'?'2':'1'));img.alt=cities[city]+'城市景观';img.draggable=false;nodes.sceneWorld.append(img);
      for(const [id,label,x,y] of hotspots[city]){
        const hot=button('',()=>{if(id==='work'&&city==='dunhuang'){openPanel('dunhuang-work');return;}if(id==='work'&&city!=='changan'){showModal({title:label,body:'敬请期待',actions:[{label:'返回',run:dismissModal}]});return;}openPanel(id);},{className:'city-hotspot text-hotspot',label});
        hot.dataset.hotspot=id;hot.dataset.artX=x;hot.dataset.artY=y;hot.style.left=(x/cityArt.w*100)+'%';hot.style.top=(y/cityArt.h*100)+'%';
        {const plaque=el('span','hotspot-visual '+(['guifang','inn'].includes(id)?'global-plaque':'b7-plaque'));const frame=el('img','plaque-frame');frame.src=asset(['guifang','inn'].includes(id)?'global_scene_hotspot_label_frame_v01':'city_marker_frame_v01');frame.alt='';plaque.append(frame,el('span','hotspot-label',label));hot.append(plaque);}
        nodes.sceneWorld.append(hot);
      }
    }
    fitScene();
  }
  function fitScene() {
    if(!nodes.sceneWorld)return;const width=nodes.scene.clientWidth,height=nodes.scene.clientHeight;if(!width||!height)return;
    if(p()?.world.route){
      // Journey art (657×1460, parchment slack 140 above / 137 below the map): slack fit rule, see fitSlack()
      const fit=fitSlack(width,height,travelArt);nodes.sceneWorld.style.width=fit.w+'px';nodes.sceneWorld.style.height=fit.h+'px';nodes.sceneWorld.style.left=fit.left+'px';nodes.sceneWorld.style.top=fit.top+'px';return;
    }
    // City art (720×1600, top 320px = added sky): slack fit rule, see fitSlack(); the standard 720×1280 composition is always complete.
    const fit=fitSlack(width,height,cityArt),worldW=fit.w,worldH=fit.h,left=fit.left,top=fit.top;
    nodes.sceneWorld.style.left=left+'px';nodes.sceneWorld.style.width=worldW+'px';nodes.sceneWorld.style.height=worldH+'px';nodes.sceneWorld.style.top=top+'px';
    // hotspots in px on the art; plaques are kept fully inside the viewport (only matters for plaques near the art edge on very narrow screens)
    for(const hot of nodes.sceneWorld.querySelectorAll('.city-hotspot')){const ax=Number(hot.dataset.artX),ay=Number(hot.dataset.artY);if(!ax)continue;const hw=(hot.offsetWidth||82)/2+2,hh=(hot.offsetHeight||44)/2+2;
      const cx=Math.min(Math.max(ax/cityArt.w*worldW,-left+hw),-left+width-hw),cy=Math.min(Math.max(ay/cityArt.h*worldH,-top+hh),-top+height-hh);hot.style.left=cx+'px';hot.style.top=cy+'px';}
  }
  function fitHome() {
    const frame=nodes.start&&nodes.start.querySelector('.home-art-frame');if(!frame||nodes.start.hidden)return;
    const cs=getComputedStyle(nodes.start),availW=nodes.start.clientWidth-parseFloat(cs.paddingLeft)-parseFloat(cs.paddingRight),availH=nodes.start.clientHeight-parseFloat(cs.paddingTop)-parseFloat(cs.paddingBottom);if(!(availW>0&&availH>0))return;
    // Home art (941×2091, parchment slack 300 above / 119 below the original composition): slack fit rule, see fitSlack()
    const fit=fitSlack(availW,availH,homeArt);frame.style.width=fit.w+'px';frame.style.height=fit.h+'px';frame.style.marginLeft=fit.left+'px';frame.style.marginTop=fit.top+'px';
  }
  function describe() {return S.time&&S.time.describe?S.time.describe(p()):{yearLabel:'贞元十六年',dateLabel:p().world.tick===0?'三月十一日':date(p().world.tick),phaseLabel:['晨','午','暮'][p().world.tick%3],tripLabel:p().trip?'商旅进行中':'商期 未启程'};}
  function renderHUD() {
    if(!p())return;const d=describe();nodes.hudTop.replaceChildren();
    const money=button('',()=>openPanel('funds'),{className:'hud-status money-status',label:'随身铜钱 '+p().cash+'，查看资金总览'});money.append(icon('money'),el('span','status-value',p().cash.toLocaleString('zh-CN')));
    const rep=button('',()=>openPanel('reputation'),{className:'hud-status reputation-status',label:'商誉 '+p().reputation.value+'，查看详情'});rep.append(icon('reputation'),el('span','status-value',p().reputation.value));
    const time=button('',()=>openPanel('time'),{className:'hud-status time-status',label:'查看时间与商期'});time.append(icon('time'));const text=el('span','date-lines');text.append(el('span','',d.yearLabel),el('span','',d.dateLabel+' · '+d.phaseLabel),el('span','trip-line',d.tripLabel));time.append(text);nodes.hudTop.append(money,rep,time);
    nodes.hudNav.replaceChildren();for(const id of ['pack','commission','message','merchant_business','more']){const b=button('',()=>openPanel(id),{className:'hud-tool',label:titles[id]});b.dataset.panel=id;b.setAttribute('aria-pressed',String(Boolean(ui.primary&&ui.primary.id===id)));b.append(icon(id),el('span','hud-label',titles[id]));const flags=p().presentation.badges||{};if(flags[id]){const dot=el('span','notification-dot');dot.setAttribute('aria-label','有待处理内容');b.append(dot);}nodes.hudNav.append(b);}
  }
  function renderStart() {
    nodes.start.replaceChildren();const frame=el('div','home-art-frame'),art=el('img','home-art');
    art.src=asset('home_screen_visual_reference_v01');art.alt='丝路万里——我在大唐经商';art.draggable=false;frame.append(art);
    // Hotspots follow the complete approved 941×1672 artwork; the illustration is not sliced or redesigned.
    for(const [id,label,action] of [['depart','启程',()=>{ui.startChoice=true;renderStart();}],['announcement','公告',()=>openPanel('notification')],['settings','设置',()=>openPanel('settings')]]){
      const hot=button('',action,{className:'home-hotspot home-'+id,label});hot.append(el('span','visually-hidden',label));frame.append(hot);
    }
    if(ui.startChoice){const card=el('section','home-choice paper-panel');card.setAttribute('role','dialog');card.setAttribute('aria-label','选择开局方式');card.append(el('h2','','启程'));
      const choices=el('div','start-choices');choices.append(button('按指引开始',()=>dispatch('game.start',{mode:'guided'})),button('自行探索',()=>dispatch('game.start',{mode:'explore'}),{className:'ui-button secondary-button'}),button('返回首页',()=>{ui.startChoice=false;renderStart();},{className:'text-button'}));card.append(choices);if(ui.error)paragraph(card,ui.error,'inline-error');nodes.start.append(frame,card);fitHome();return;
    }else if(ui.error)paragraph(frame,ui.error,'home-error inline-error');
    nodes.start.append(frame);fitHome();
  }
  function renderPanelContent(current,parts,isSecondary) {
    parts.header.replaceChildren();parts.body.replaceChildren();parts.footer.replaceChildren();
    parts.box.dataset.panelId=current.id;
    const spec=panels.get(current.id);const title=(typeof spec?.title==='function'?spec.title(context(),current.data):spec&&spec.title)||titles[current.id]||current.id;
    parts.header.append(el('h2','',title));const work=activeWork();const noClose=(typeof spec?.noClose==='function'?spec.noClose(context(),current.data):spec&&spec.noClose)||(work&&work.kind==='tavern'&&work.mode==='FORMAL');
    if(!noClose)parts.header.append(closeButton(isSecondary?closeSecondary:closePanel));
    if(isSecondary&&ui.back.length)parts.header.insertBefore(button('返回',closeSecondary,{className:'text-button'}),parts.header.firstChild);
    if(spec?.header)spec.header(context(),parts.header,current.data);
    if(spec){spec.render(context(),parts.body,current.data);if(spec.footer)spec.footer(context(),parts.footer,current.data);}
    else {paragraph(parts.body,'工程接入尚未完成','engineering-note');paragraph(parts.body,'该功能属于本期已确定范围，当前尚未完成界面与业务连接。');}
    if(ui.error)paragraph(parts.body,ui.error,'inline-error');parts.footer.hidden=!parts.footer.childNodes.length;restoreInputs(parts.body);
  }
  function renderPanels() {
    if(!nodes.primary)return;
    if(!ui.primary&&!activeResult()&&p()?.market.visit&&!p().market.visit.settled)ui.primary={id:'market',data:{}};
    if(!ui.primary&&!activeResult()&&['returned_at_dusk_pending_rest','return_tasks'].includes(p()?.trip?.phase)){ui.primary={id:'trip',data:{}};if(p().trip.phase==='return_tasks')ui.secondary={id:'return-tasks',data:{}};}
    const work=activeWork();if(!work&&!activeResult()&&!workResult()&&p()?.world.route)ui.primary=null;
    if(!work&&p()?.eventSession&&['AWAITING_CHOICE','AWAITING_SKILL'].includes(p().eventSession.status))ui.primary={id:'event',data:{}};
    if(work){ui.primary={id:work.kind==='tavern'?'work':work.kind==='caravan'?'caravan':'route-minigame',data:{}};ui.secondary=null;ui.back=[];}
    const pendingResult=workResult();if(pendingResult){ui.primary={id:pendingResult.kind==='caravan'?'caravan':'work',data:{}};ui.secondary=null;ui.back=[];}
    if(isFinanceResult()){ui.primary={id:'guifang',data:{}};ui.secondary=null;ui.back=[];}
    if(isEventResult())ui.primary={id:'event',data:{}};
    if(isInnResult()){ui.primary={id:'inn',data:{}};ui.secondary=null;ui.back=[];}
    nodes.primary.hidden=!ui.primary;nodes.secondary.hidden=!ui.secondary;
    if(ui.primary){if(isFinanceResult())renderFinanceResult(nodes.primaryParts,activeResult());else if(isEventResult()||isInnResult())renderResultContent(nodes.primaryParts,activeResult());else renderPanelContent(ui.primary,nodes.primaryParts,false);}
    if(ui.secondary)renderPanelContent(ui.secondary,nodes.secondaryParts,true);
    renderHUD();renderControls();journeyController?.refresh();
  }
  function renderModals() {
    if(!nodes.modal)return;const current=ui.modals[0];nodes.modal.hidden=!current;
    if(current){const parts=nodes.modalParts;parts.header.replaceChildren(el('h2','',current.title));parts.body.replaceChildren();parts.footer.replaceChildren();if(current.engineering)paragraph(parts.body,'工程预览 · 功能接入未完成','engineering-note');paragraph(parts.body,current.body);if(ui.error)paragraph(parts.body,ui.error,'inline-error');for(const a of current.actions||[])parts.footer.append(button(a.label,a.run,{className:'ui-button'+(a.danger?' danger-button':''),natural:false}));}
    renderControls();
  }
  function renderResult() {
    const current=activeResult();nodes.result.hidden=!current||containedResult();if(!current||containedResult())return;
    renderResultContent(nodes.resultParts,current);
  }
  function renderResultContent(parts,current) {
    parts.box.dataset.panelId='result';
    parts.header.replaceChildren(el('h2','',current.title||'本次结果'));parts.body.replaceChildren();parts.footer.replaceChildren();parts.footer.hidden=false;
    const renderer=resultRenderers.get(current.kind)||resultRenderers.get('*');
    if(renderer)renderer(context(),parts.body,current);
    else if(current.text||current.body||current.lines){if(current.text||current.body)paragraph(parts.body,current.text||current.body);for(const line of current.lines||[])paragraph(parts.body,typeof line==='string'?line:line.text||'');}
    else paragraph(parts.body,'工程提示：业务结果已保存，结果字段的展示尚待接入。','engineering-note');
    if(renderer&&renderer.footer)renderer.footer(context(),parts.footer,current);else parts.footer.append(button(current.continueLabel||(current.kind==='event'&&p()?.world.route?'继续赶路':'继续'),()=>dispatch('result.ack',{resultId:current.id}),{natural:false}));if(ui.error)paragraph(parts.body,ui.error,'inline-error');
  }
  function noticeKind(n) {return n.kind||n.type||'compact';}
  function noticeRank(n) {const k=noticeKind(n);return k==='loan'||k==='risk'||k==='major'||k==='commissionFailure'?0:k==='tutorial'?1:2;}
  function selectNotice() {
    if(!p()||blocking()||ui.keyboard||p().presentation.unstable)return null;
    const notices=(p().presentation.notices||[]).filter(n=>!p().presentation.seen[n.id]&&!(n.localCity&&(p().world.route||n.localCity!==p().world.city))&&!(noticeKind(n)==='tutorial'&&(!ui.state.preferences.tutorialEnabled||p().presentation.tutorialSeen[n.id]||ui.tutorialCooldown)));
    notices.sort((a,b)=>noticeRank(a)-noticeRank(b)||(b.severity||0)-(a.severity||0)||(a.tutorialOrder||0)-(b.tutorialOrder||0));
    if(!notices.length)return null;const first=notices[0];
    if(noticeKind(first)!=='loan'||Array.isArray(first.loans))return {...first,ids:[first.id]};
    const loans=notices.filter(n=>noticeKind(n)==='loan');const unique=new Map();for(const n of loans){const key=n.loanId||n.id;const old=unique.get(key);if(!old||(n.severity||0)>(old.severity||0))unique.set(key,n);}
    const rows=[...unique.values()].sort((a,b)=>(b.severity||0)-(a.severity||0));return {...rows[0],loanRows:rows,ids:loans.map(n=>n.id)};
  }
  function renderNotices() {
    if(!nodes.notice)return;const n=selectNotice();nodes.notice.hidden=!n;nodes.notice.replaceChildren();if(!n)return;
    const header=el('header','notice-header');header.append(el('h2','',n.title||'提示'));const dismiss=()=>dispatch(noticeKind(n)==='tutorial'?'tutorial.dismiss':'notice.dismiss',noticeKind(n)==='tutorial'?{id:n.id}:{ids:n.ids,id:n.id});if(noticeKind(n)!=='commissionFailure')header.append(closeButton(dismiss));
    const body=el('div','notice-body');const loanRows=n.loans||n.loanRows;if(loanRows){if(loanRows.length>1)paragraph(body,'你有 '+loanRows.length+' 笔贷款需要留意。');for(const loan of loanRows){const label=loan.sourceLabel||loan.label||(loan.originCity?cities[loan.originCity]+'柜坊':'贷款')+(loan.loanId?' · '+loan.loanId:'');paragraph(body,label+(loan.dueLabel?' · 到期：'+loan.dueLabel:''));const due=loan.currentDue??loan.amount;if(Number.isSafeInteger(due))row('当前应还',formatMoney(due),body);if(loan.text)paragraph(body,loan.text);}}
    else {if(n.text||n.body)paragraph(body,n.text||n.body);for(const line of n.lines||[])paragraph(body,typeof line==='string'?line:line.text||'');}
    if(noticeKind(n)==='commissionFailure'){for(const result of n.results||[]){paragraph(body,result.title||'委托');for(const lot of result.removedCargo||[])row(lot.goodId+' · 待清理',lot.quantity+'件',body);}paragraph(body,'点击「知道了」后，清理上述失效委托的绑定货物。','form-hint');body.append(button('知道了',dismiss,{natural:false}));}
    nodes.notice.append(header,body);nodes.notice.setAttribute('aria-live','polite');
  }
  function renderControls() {
    if(!nodes.hud)return;const blocked=blocking();nodes.hud.classList.toggle('is-blocked',blocked);nodes.hud.inert=blocked;
    nodes.scene.inert=blocked||Boolean(ui.primary)||Boolean(ui.secondary);
    nodes.primaryParts.box.inert=ui.busy||ui.modals.length>0||(Boolean(activeResult())&&!containedResult())||Boolean(ui.secondary);
    nodes.secondaryParts.box.inert=ui.busy||ui.modals.length>0;
    nodes.secondary.classList.toggle('over-result',Boolean(activeResult()));
    nodes.resultParts.box.inert=ui.busy||ui.modals.length>0||Boolean(ui.secondary);
    nodes.root.classList.toggle('is-pending',ui.busy);nodes.root.setAttribute('aria-busy',String(ui.busy));
    // Native editability must agree with the pending panel: inert alone does not
    // expose a disabled input to assistive technology or browser input drivers.
    nodes.root.querySelectorAll('input,select,textarea').forEach(field=>{
      if(ui.busy){if(!field.hasAttribute('data-pending-disabled'))field.dataset.pendingDisabled=String(field.disabled);field.disabled=true;}
      else if(field.hasAttribute('data-pending-disabled')){field.disabled=field.dataset.pendingDisabled==='true';delete field.dataset.pendingDisabled;}
    });
    nodes.root.querySelectorAll('button[data-busy-disabled]').forEach(b=>{b.disabled=ui.busy;});
  }
  function render(state) {
    if(!ui.mounted)return;captureInputs();ui.state=state||ui.app.state;
    const routeId=p()?.world.route?.id||null;
    if(lastRouteId&&!routeId){ui.primary=null;ui.secondary=null;ui.back=[];ui.modals=[];ui.error='';ui.sceneCity=null;}
    lastRouteId=routeId;
    const tripId=p()?.trip?.id||null;if(lastTripId&&!tripId){ui.primary=null;ui.secondary=null;ui.back=[];ui.resultReturn=null;}lastTripId=tripId;
    const nextResult=activeResult();
    if(nextResult&&nextResult.id!==ui.lastResultId){
      ui.resultReturn=null;
      const marketTransaction=['marketBuy','marketSell','marketSellAll','provisionsBought'].includes(nextResult.kind);
      if(marketTransaction){ui.primary={id:'market',data:{}};ui.viewMemory.clear();}
      if(ui.secondary&&!containedResult()&&!marketTransaction){
        const history=[...ui.back],secondary=ui.secondary.id==='business-amount'?history.pop()||null:ui.secondary;
        ui.resultReturn={secondary,back:history};
      }
      ui.secondary=null;ui.back=[];ui.lastResultId=nextResult.id;
    }else if(!nextResult&&ui.lastResultId){if(ui.resultReturn){ui.secondary=ui.resultReturn.secondary;ui.back=ui.resultReturn.back;}ui.lastResultId=null;ui.resultReturn=null;}
    const hasProgress=Boolean(p());nodes.start.hidden=hasProgress;nodes.hud.hidden=!hasProgress;nodes.scene.hidden=!hasProgress;
    if(!hasProgress){renderStart();}
    else {renderScene();renderHUD();}
    renderPanels();renderResult();renderModals();renderNotices();renderControls();
    journeyController?.refresh();
  }
  function viewportChanged() {
    const vv=window.visualViewport;const height=vv?vv.height:window.innerHeight;
    document.documentElement.style.setProperty('--viewport-height',height+'px');
    const wasKeyboard=ui.keyboard;
    ui.keyboard=Boolean(document.activeElement&&/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName))||Boolean(vv&&window.innerHeight-height>140);
    if(nodes.root){nodes.root.classList.toggle('keyboard-open',ui.keyboard);nodes.root.style.setProperty('--art-scale',String(Math.max(.3,(nodes.root.clientWidth-24)/768)));const safeBottom=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-bottom'))||0;nodes.root.style.setProperty('--map-bottom',(Math.max(safeBottom,18)+6)+'px');}fitScene();fitHome();if(wasKeyboard!==ui.keyboard)renderNotices();
    if(ui.keyboard&&document.activeElement&&document.activeElement.scrollIntoView)document.activeElement.scrollIntoView({block:'nearest'});
  }
  function keyboardHandler(event) {
    const top=ui.modals.length?nodes.modalParts.box:ui.secondary?nodes.secondaryParts.box:containedResult()?nodes.primaryParts.box:activeResult()?nodes.resultParts.box:ui.primary?nodes.primaryParts.box:null;
    if(event.key==='Escape'){
      if(ui.modals.length||ui.busy||(activeResult()&&!ui.secondary)){event.preventDefault();return;}
      if(ui.secondary){event.preventDefault();closeSecondary();}else if(ui.primary){event.preventDefault();if(ui.primary.id!=='market')closePanel();}return;
    }
    if(event.key==='Tab'&&top){const focusable=[...top.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')].filter(e=>!e.hidden&&e.getClientRects().length);if(!focusable.length){event.preventDefault();top.focus();return;}const first=focusable[0],last=focusable[focusable.length-1];if(event.shiftKey&&(document.activeElement===first||!top.contains(document.activeElement))){event.preventDefault();last.focus();}else if(!event.shiftKey&&(document.activeElement===last||!top.contains(document.activeElement))){event.preventDefault();first.focus();}}
  }
  function mount(app) {
    if(ui.mounted){ui.app=app;render(app.state);return;}
    ui.app=app;nodes.root=document.getElementById('game-root');if(!nodes.root)throw new Error('game-root missing');nodes.root.replaceChildren();
    journeyController=S.createJourneyController?.({getState:()=>ui.app.state,isBlocked:()=>blocking()||ui.app.busy||Boolean(ui.secondary)||Boolean(ui.primary)||document.hidden,dispatch});
    document.addEventListener('visibilitychange',()=>journeyController?.refresh());
    const rotateHint=el('div','rotate-hint');rotateHint.setAttribute('role','status');rotateHint.append(el('p','rotate-title','请将手机竖屏使用'),el('p','rotate-sub','本作按竖屏画面设计，横屏时暂停显示，转回竖屏即可继续。'));
    const stage=el('div','game-stage');nodes.start=el('section','start-screen');nodes.scene=el('section','city-scene');nodes.sceneWorld=el('div','scene-world');nodes.scene.append(nodes.sceneWorld);
    nodes.hud=el('header','global-hud');nodes.hudTop=el('div','hud-top');nodes.hudNav=el('nav','hud-nav');nodes.hudNav.setAttribute('aria-label','全局功能');nodes.hud.append(nodes.hudTop,nodes.hudNav);
    stage.append(nodes.scene,nodes.start,nodes.hud);
    for(const key of ['primary','secondary','result','modal']){const parts=makePanel(key);nodes[key+'Parts']=parts;nodes[key]=parts.layer;nodes[key+'Body']=parts.body;stage.append(parts.layer);}
    nodes.notice=el('aside','notice-card paper-panel');nodes.notice.hidden=true;stage.append(nodes.notice);nodes.root.append(stage,rotateHint);
    document.addEventListener('keydown',keyboardHandler);document.addEventListener('focusin',viewportChanged);document.addEventListener('focusout',()=>setTimeout(viewportChanged,0));window.addEventListener('resize',viewportChanged);if(window.visualViewport){window.visualViewport.addEventListener('resize',viewportChanged);window.visualViewport.addEventListener('scroll',viewportChanged);}
    ui.mounted=true;viewportChanged();render(app.state);
  }
  function registerPanel(id,spec) {panels.set(id,spec);if(ui.mounted&&(ui.primary&&ui.primary.id===id||ui.secondary&&ui.secondary.id===id))renderPanels();}
  function mapButton(action){const b=button('',action,{className:'world-map-button',label:'地图'}),art=el('img','map-button-art');art.src=asset('B6_world_map_button_v01');art.alt='';art.draggable=false;b.append(art);return b;}
  const worldMapAnchors={changan:[.859,.748],dunhuang:[.776,.552],khotan:[.610,.467]};
  function markerDirection(progress){const route=progress.world.route;if(route)return ['changan>dunhuang','dunhuang>khotan'].includes(route.from+'>'+route.to)?'westbound':'eastbound';return (progress.trip?.routeIndex||0)<2?'westbound':'eastbound';}
  function routeFraction(route){return Math.max(0,Math.min(1,route.traveledTicks/(route.traveledTicks+route.remainingTicks||1)));}
  S.travelVisual={markerDirection,routeFraction};
  function locationMarker(direction){const img=el('img','location-marker');img.src=asset('B6_location_marker_'+direction+'_v01');img.alt='商队当前位置';img.draggable=false;img.dataset.direction=direction;return img;}
  registerPanel('map',{title:'丝路舆图',render(c,b){const world=el('div','world-map-stage'),background=el('img','world-map-background');background.src=asset('B6_world_map_bg_v02');background.alt='丝路舆图，当前开放路线为长安、敦煌、于阗';background.draggable=false;world.append(background);const route=c.p.world.route,from=worldMapAnchors[route?route.from:c.p.world.city],to=route?worldMapAnchors[route.to]:from,f=route?routeFraction(route):0,marker=locationMarker(markerDirection(c.p));marker.style.left=((from[0]+(to[0]-from[0])*f)*100)+'%';marker.style.top=((from[1]+(to[1]-from[1])*f)*100)+'%';world.append(marker);b.append(world);paragraph(b,route?'当前路段：'+cities[route.from]+' → '+cities[route.to]:'当前所在：'+cities[c.p.world.city],'map-position-label');}});
  function renderTravelArt(c,b,route){
    const firstLeg=route.index===0||route.index===3,art=el('figure','travel-art'),background=el('img','travel-background');
    background.src=asset(firstLeg?'B6_travel_changan_dunhuang_bg_v01':'B6_travel_dunhuang_khotan_bg_v01');background.alt=cities[route.from]+'至'+cities[route.to]+'的旅程景观';background.draggable=false;art.append(background);
    // The supplied artwork defines orientation; no mirroring or geographic-name inference.
    const direction=markerDirection(c.p),marker=locationMarker(direction),f=routeFraction(route);
    const onLong=([x,y])=>[x,(y*(travelArt.h-travelArt.slackTop-travelArt.slackBottom)+travelArt.slackTop)/travelArt.h];const endpoints=firstLeg?{changan:onLong([.90,.57]),dunhuang:onLong([.14,.425])}:{dunhuang:onLong([.87,.54]),khotan:onLong([.14,.51])},from=endpoints[route.from],to=endpoints[route.to];
    marker.style.left=((from[0]+(to[0]-from[0])*f)*100)+'%';marker.style.top=((from[1]+(to[1]-from[1])*f)*100)+'%';art.append(marker);
    const elapsedDay=Math.floor((c.p.world.tick-route.startedTick)/3)+1;
    const caption=el('figcaption','travel-art-caption',cities[route.from]+' — '+cities[route.to]+' · 第'+elapsedDay+'日 / 预计'+route.days+'日');art.append(caption);b.append(art);
  }
  registerPanel('more',{title:'更多',render(c,b){for(const id of ['archive','notification','settings','help']){const item=button('',()=>openSecondary(id),{className:'menu-entry'});item.append(icon(id),el('span','',titles[id]));b.append(item);}b.append(button('重新开始游戏',beginReset,{className:'ui-button danger-button'}));}});
  registerPanel('funds',{title:'资金总览',render(c,b){const snapshot=S.finance&&S.finance.fundsSnapshot?S.finance.fundsSnapshot(c.p):null;if(!snapshot){paragraph(b,'资金快照接口尚未接入。','engineering-note');return;}row('随身铜钱',formatMoney(snapshot.cash),b);row('资金总额',formatMoney(snapshot.totalFunds),b,()=>openSecondary('fund-details',{kind:'assets'}));row('负债合计',formatMoney(snapshot.totalDebt),b,()=>openSecondary('fund-details',{kind:'debts'}));row('净资金',formatMoney(snapshot.netFunds),b);}});
  registerPanel('fund-details',{title:'资金明细',render(c,b,data){const snapshot=S.finance.fundsSnapshot(c.p);for(const item of snapshot[data.kind]||[]){row(item.label,formatMoney(item.amount),b);if(item.dueLabel)paragraph(b,'到期：'+item.dueLabel+(item.overdue?' · 已逾期':''),'form-hint');}if(!(snapshot[data.kind]||[]).length)paragraph(b,data.kind==='debts'?'暂无未清偿负债。':'暂无其他资金记录。');}});
  registerPanel('reputation',{title:'商誉详情',render(c,b){row('当前商誉',c.p.reputation.value,b);const changes=c.p.reputation.history||[];for(const x of changes)row(x.label||x.source||'商誉变化',x.delta>0?'+'+x.delta:x.delta,b);if(!changes.length)paragraph(b,'暂无商誉变化记录。');}});
  registerPanel('time',{title:'时间与商期',render(c,b){const d=describe();row('当前日期',d.yearLabel+' '+d.dateLabel,b);row('当前时段',d.phaseLabel,b);row('当前商期',d.tripLabel,b);if(d.remainingLabel)row('商期剩余',d.remainingLabel,b);if(c.p.trip)row('本商期截止',date(c.p.trip.deadlineTick),b);const loans=S.finance?.snapshot(c.p).loans||[];for(const loan of loans)row(cities[loan.originCity]+'柜坊 · '+loan.loanId,date(loan.dueTick)+(loan.status==='overdue'?' · 已逾期':''),b);for(const task of c.p.commissions.active.filter(x=>['accepted','pending_pickup','in_transit','ready_to_turn_in'].includes(x.status)))row(task.title,date(task.deadlineTick)+(task.handoffPhase!==null?' · 约定'+['晨','午'][task.handoffPhase]+'交':''),b);for(const item of c.p.presentation.deadlines||[])row(item.label,item.value,b);}});
  registerPanel('pack',{title:'行囊',render(c,b){row('补给',c.p.inventory.provisions+'日份',b);row('骆驼',c.p.inventory.camelCount+'匹',b);if(!c.p.inventory.lots.length)paragraph(b,'行囊中暂无货物。');for(const lot of c.p.inventory.lots)row(lot.label||lot.goodId,lot.quantity+'份'+(lot.condition==='damaged'?' · 受损':''),b);}});
  registerPanel('message',{title:'消息',render(c,b){for(const x of [...c.p.messages.reports,...c.p.messages.observations]){const item=el('article','message-entry');if(x.title)item.append(el('h3','',x.title));paragraph(item,x.text||x.body||'');b.append(item);}if(!b.childNodes.length)paragraph(b,'暂无消息。');}});
  registerPanel('notification',{title:'系统通知',render(c,b){const rows=c.p?.presentation.notices||[];if(!rows.length)paragraph(b,'暂无新通知。');for(const n of rows){b.append(el('h3','',n.title||'提示'));paragraph(b,n.text||n.body||'');}}});
  registerPanel('archive',{title:'丝路之录',render(c,b){paragraph(b,'敬请期待');}});
  registerPanel('settings',{title:'设置',render(c,b){paragraph(b,'游戏设置会在重新开始游戏后保留。');if(!panels.has('settings-controls'))paragraph(b,'工程接入尚未完成：设置控件尚未连接。','engineering-note');else panels.get('settings-controls').render(c,b);}});
  registerPanel('help',{title:'玩法说明',render(c,b){if(S.content&&S.content.helpText)paragraph(b,S.content.helpText);else paragraph(b,'工程接入尚未完成：完整正式玩法说明正文尚未连接。','engineering-note');}});
  function financeView() {return S.finance&&S.finance.snapshot?S.finance.snapshot(p()):null;}
  function localDeposit(view) {return view.deposits.find(d=>d.cityId===p().world.city)?.balance||0;}
  function unavailable(label,reason,parent) {const b=button(label,()=>openSecondary('finance-info',{title:label,text:reason}),{className:'ui-button is-unavailable'});b.setAttribute('aria-disabled','true');parent.append(b);}
  registerPanel('finance-info',{title:'柜坊说明',render(c,b,data){paragraph(b,data.text);}});
  registerPanel('voucher-history',{title:'飞钱与历史',render(c,b){paragraph(b,'飞钱是游戏采用的汇兑设计，三城之间通兑，其中于阗通兑属于游戏扩展。');paragraph(b,'目前没有明确证据证明贞元时期存在覆盖于阗的对应飞钱网络。');}});
  registerPanel('guifang',{title:'柜坊',render(c,b){
    const v=financeView();if(!v){paragraph(b,'金融接口尚未接入。','engineering-note');return;}
    row('随身铜钱',formatMoney(v.cash),b);row(cities[c.p.world.city]+'寄存',formatMoney(localDeposit(v)),b);
    if(v.vouchers.length)row('待兑飞钱',v.vouchers.length+'张',b);
    if(v.loans.length)row('当前欠款',formatMoney(v.totalDebt),b);
    const grid=el('div','business-grid');grid.append(button(cities[c.p.world.city]+'寄存',()=>openSecondary('finance-deposit')),button('飞钱 ⓘ',()=>openSecondary('finance-vouchers')));
    if(v.borrowingAllowed&&v.availableCredit>0)grid.append(button('借款',()=>openSecondary('finance-form',{operation:'borrow'})));else unavailable('借款',v.borrowingAllowed?'当前可用授信不足。':'请先清偿逾期借款。',grid);
    if(v.loans.length)grid.append(button('还款',()=>openSecondary('finance-loans')));else unavailable('还款','当前无未结贷款',grid);b.append(grid);
  },footer(c,f){f.append(button('离开柜坊',closePanel));}});
  registerPanel('finance-deposit',{title:'本地寄存',render(c,b){const v=financeView();row(cities[c.p.world.city]+'寄存',formatMoney(localDeposit(v)),b);row('随身铜钱',formatMoney(v.cash),b);const group=el('div','finance-operation');if(v.cash>0)group.append(button('存钱',()=>openSecondary('finance-form',{operation:'deposit'})));else unavailable('存钱','随身铜钱不足。',group);if(localDeposit(v)>0)group.append(button('取钱',()=>openSecondary('finance-form',{operation:'withdraw'})));else unavailable('取钱','当前城市没有可取寄存。',group);b.append(group);}});
  registerPanel('finance-loans',{title:'还款',render(c,b){const v=financeView();if(!v.loans.length){paragraph(b,'当前无未结贷款');return;}for(const loan of v.loans){const card=el('section','voucher-card');row(cities[loan.originCity]+'柜坊 · '+loan.loanId,formatMoney(loan.outstandingBalance),card);paragraph(card,'到期：'+date(loan.dueTick)+(loan.status==='overdue'?' · 已逾期':''),'form-hint');if(v.cash>0)card.append(button('还款',()=>openSecondary('finance-form',{operation:'repay',loanId:loan.loanId})));else unavailable('还款','随身铜钱不足。',card);b.append(card);}}});
  registerPanel('finance-vouchers',{title:'飞钱',render(c,b){const v=financeView();paragraph(b,'飞钱可从随身铜钱或本城寄存办理，抵达指定城市后兑付。');b.append(button('飞钱与历史 ⓘ',()=>openSecondary('voucher-history'),{className:'text-button'}));const group=el('div','finance-operation');if(v.cash>0||localDeposit(v)>0)group.append(button('办理飞钱',()=>openSecondary('finance-form',{operation:'issueVoucher'})));else unavailable('办理飞钱','当前没有可用于办理飞钱的钱款。',group);b.append(group);if(!v.vouchers.length)paragraph(b,'当前无可兑飞钱');for(const voucher of v.vouchers){const card=el('section','voucher-card');row('凭券',voucher.voucherId,card);row('汇出地',cities[voucher.originCity],card);row('兑付地',cities[voucher.destinationCity],card);row('到地可兑',formatMoney(voucher.redeemableAmount),card);if(voucher.destinationCity===c.p.world.city)card.append(button('兑付',()=>dispatch('finance.redeemVoucher',{voucherId:voucher.voucherId})));else unavailable('兑付','请抵达'+cities[voucher.destinationCity]+'后兑付。',card);b.append(card);}}});
  function financeLimit(operation,v,loanId,source='cash') {if(operation==='deposit')return v.cash;if(operation==='withdraw')return localDeposit(v);if(operation==='borrow')return v.borrowingAllowed?v.availableCredit:0;if(operation==='repay')return Math.min(v.cash,v.loans.find(l=>l.loanId===loanId)?.outstandingBalance||0);if(operation==='issueVoucher')return source==='cash'?v.cash:localDeposit(v);return 0;}
  registerPanel('finance-form',{title:'柜坊办理',render(c,b,data){
    const v=financeView(),labels={deposit:'存钱',withdraw:'取钱',borrow:'借款',repay:'还款',issueVoucher:'办理飞钱'};
    const form=el('form','finance-form');form.id='finance-form';form.noValidate=true;form.dataset.operation=data.operation;
    form.append(el('h3','',labels[data.operation]));
    let sourceSelect=null,destinationSelect=null;
    if(data.operation==='issueVoucher'){
      const sourceField=el('label','form-field','资金来源');sourceSelect=el('select');sourceSelect.name='finance-source';for(const [value,label] of [['cash','随身铜钱'],['deposit',cities[c.p.world.city]+'寄存']]){const option=el('option','',label);option.value=value;sourceSelect.append(option);}sourceField.append(sourceSelect);form.append(sourceField);
      const destField=el('label','form-field','兑付城市');destinationSelect=el('select');destinationSelect.name='finance-destination';for(const city of Object.keys(cities).filter(x=>x!==c.p.world.city)){const option=el('option','',cities[city]);option.value=city;destinationSelect.append(option);}destField.append(destinationSelect);form.append(destField);
    }
    const field=el('div','form-field');field.append(el('span','field-label','输入金额'));const stepper=numericStepper({name:'finance-amount',value:'',min:1,max:()=>max(),label:'输入金额'});const input=stepper.input;input.required=true;input.setAttribute('aria-describedby','finance-limit');field.append(stepper.element);form.append(field);
    const hint=el('p','form-hint');hint.id='finance-limit';form.append(hint);
    function max(){return financeLimit(data.operation,financeView(),data.loanId,sourceSelect?sourceSelect.value:'cash');}
    function validate(clamp=false){const limit=max();if(clamp){input.value=input.value.replace(/[^0-9]/g,'');if(Number(input.value)>limit)input.value=String(limit);}hint.textContent='当前可办理上限：'+formatMoney(limit);let ok=/^[0-9]+$/.test(input.value)&&Number.isSafeInteger(Number(input.value))&&Number(input.value)>0&&Number(input.value)<=limit;
      // RC3 BUG-11: the same fee function as the reducer decides the minimum face value (redeemable must be ≥ 1).
      if(data.operation==='issueVoucher'&&S.finance?.voucherQuote){const q=S.finance.voucherQuote(c.p,Number(input.value)||0);hint.textContent='当前可办理上限：'+formatMoney(limit)+'；最低面额'+q.minimumFace+'钱。'+(Number(input.value)>0?'手续费'+formatMoney(q.feeAmount)+'，到地可兑'+formatMoney(q.redeemableAmount)+(q.valid?'':'（兑付金额不足1钱，无法办理）'):'');ok=ok&&q.valid;}
      const submit=document.getElementById('finance-submit');if(submit)submit.disabled=!ok||ui.busy;stepper.refresh();return ok;}
    input.addEventListener('input',()=>validate(true));if(sourceSelect)sourceSelect.addEventListener('change',()=>validate(true));
    form.addEventListener('submit',e=>{e.preventDefault();if(!validate()||ui.busy)return;const payload={amount:Number(input.value)};if(data.loanId)payload.loanId=data.loanId;if(sourceSelect){payload.source=sourceSelect.value;payload.destinationCity=destinationSelect.value;}dispatch('finance.'+data.operation,payload);});
    b.append(form);validate();
  },footer(c,f){const submit=button('确认办理',()=>{}, {disabled:true});submit.id='finance-submit';submit.type='submit';submit.setAttribute('form','finance-form');f.append(submit);}});
  function renderFinanceResult(parts,result) {
    parts.box.dataset.panelId='finance-result';
    const labels={deposit:'寄存成功',withdraw:'取钱成功',borrow:'借款成功',repay:'还款成功',issueVoucher:'飞钱办理成功',redeemVoucher:'飞钱兑付成功'};
    parts.header.replaceChildren(el('h2','',labels[result.type]));parts.body.replaceChildren();parts.footer.replaceChildren();
    const v=financeView();
    if(result.type==='issueVoucher'){
      row('资金来源',result.source==='cash'?'随身铜钱':cities[result.voucher.originCity]+'寄存',parts.body);row('汇出地',cities[result.voucher.originCity],parts.body);row('兑付地',cities[result.voucher.destinationCity],parts.body);row('办理金额',formatMoney(result.amount),parts.body);row('汇兑费',formatMoney(result.feeAmount),parts.body);row('到地可兑',formatMoney(result.voucher.redeemableAmount),parts.body);
    }else if(result.type==='repay'){row('本次还款',formatMoney(result.amount),parts.body);row('当前尚欠',formatMoney(result.remainingDebt),parts.body);}
    else {const amount=result.amount??result.cashDelta??0;const positive=['withdraw','borrow','redeemVoucher'].includes(result.type);paragraph(parts.body,(positive?'+':'−')+formatMoney(Math.abs(amount)),'result-amount');}
    row('随身铜钱',formatMoney(v.cash),parts.body);row(cities[p().world.city]+'寄存',formatMoney(localDeposit(v)),parts.body);
    async function acknowledge(leave){await dispatch('result.ack',{resultId:result.id});if(!ui.error){ui.primary=leave?null:{id:'guifang',data:{}};ui.secondary=null;ui.back=[];render(ui.state);}}
    parts.footer.hidden=false;parts.footer.append(button('继续办理',()=>acknowledge(false),{natural:false}),button('离开柜坊',()=>acknowledge(true),{natural:false}));if(ui.error)paragraph(parts.body,ui.error,'inline-error');
  }
  S.ui={mount,render,registerPanel,numericStepper,renderTravelArt,registerMenu(id,spec){registerPanel(id,spec);},registerResult(kind,fn){resultRenderers.set(kind,fn);},openPanel,openSecondary,closePanel,closeSecondary,showModal,dismissModal,dispatch,
    getState(){return {primary:ui.primary&&ui.primary.id,secondary:ui.secondary&&ui.secondary.id,secondaryHistory:ui.back.length,blockingModalCount:ui.modals.length?1:0,queuedModals:Math.max(0,ui.modals.length-1),busy:ui.busy,keyboard:ui.keyboard,tutorialCooldown:ui.tutorialCooldown};}};
})(globalThis.Silk=globalThis.Silk||{});
