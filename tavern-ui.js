(function (S) {
  'use strict';
  const clock = { id:null, baseMs:0, anchor:0, running:false, frame:0, pending:null,
    pauseRequested:false, localHold:false, failed:null, sequence:null };
  let app=null, refs={};
  const view=()=>app&&app.state.progress?S.tavern.view(app.state.progress):null;
  const active=v=>v&&!v.result&&!['PAUSED','FINISHED','ABORTED'].includes(v.phase);
  function elapsed(v=view()) {
    if(!v)return 0;
    return Math.min(v.endMs,Math.max(v.elapsedMs,Math.floor(clock.baseMs+(clock.running?performance.now()-clock.anchor:0))));
  }
  function stop(v=view()) {
    if(v&&clock.id===v.sessionId)clock.baseMs=elapsed(v);
    clock.running=false;cancelAnimationFrame(clock.frame);clock.frame=0;
  }
  function sync(v) {
    if(!v){stop();clock.id=null;return;}
    if(clock.id!==v.sessionId){stop();Object.assign(clock,{id:v.sessionId,baseMs:v.elapsedMs,anchor:performance.now(),sequence:v.sequence,pauseRequested:false,localHold:false,failed:null});}
    if(clock.sequence!==v.sequence||v.elapsedMs>clock.baseMs){clock.sequence=v.sequence;clock.baseMs=v.elapsedMs;clock.anchor=performance.now();}
    if(!active(v)){stop(v);clock.baseMs=v.elapsedMs;}
    else if(!clock.pending&&!clock.pauseRequested&&!clock.localHold&&!document.hidden&&!clock.running){clock.baseMs=v.elapsedMs;clock.anchor=performance.now();clock.running=true;}
    if(clock.running&&!clock.frame)clock.frame=requestAnimationFrame(tick);
  }
  function paint(v) {
    const now=elapsed(v),playing=Math.max(0,now-v.readyMs);
    if(refs.countdown?.isConnected)refs.countdown.textContent=(Math.max(0,v.roundDurationMs-playing)/1000).toFixed(1)+'秒';
    if(refs.progress?.isConnected)refs.progress.value=Math.min(v.roundDurationMs,playing);
    const enabled=active(v)&&v.phase==='QUESTION'&&!clock.pending&&!clock.localHold&&!clock.pauseRequested&&!S.ui.getState().busy&&now>=v.current.inputAllowedMs&&now<v.current.deadlineMs;
    for(const b of refs.answers||[])if(b.isConnected)b.disabled=!enabled;
  }
  function tick() {
    clock.frame=0;const v=view();
    if(!v||clock.id!==v.sessionId||!active(v)||document.hidden||clock.localHold||clock.pauseRequested){stop(v);return;}
    paint(v);
    if(!clock.pending&&elapsed(v)>=Math.min(v.endMs,v.nextTransitionMs)){void step();return;}
    clock.frame=requestAnimationFrame(tick);
  }
  async function send(type,payload,sourceId) {
    if(clock.pending)return clock.pending;
    stop();
    const operation=(async()=>{
      const outcome=await S.ui.dispatch(type,payload,sourceId);
      if(outcome===null){clock.failed={type,payload,sourceId};clock.localHold=true;}
      else clock.failed=null;
      return outcome;
    })();
    clock.pending=operation;
    let outcome;
    try {outcome=await operation;}
    finally {
      clock.pending=null;const v=view();
      if(v){clock.baseMs=v.elapsedMs;clock.sequence=v.sequence;clock.anchor=performance.now();}
      sync(v);if(app)S.ui.render(app.state);
    }
    return outcome;
  }
  async function step(answer,forcedTime) {
    const v=view();if(!active(v)||clock.pending)return null;
    const ms=forcedTime===undefined?elapsed(v):Math.min(v.endMs,Math.max(v.elapsedMs,Math.floor(forcedTime)));
    const payload={sessionId:v.sessionId,sequence:v.sequence+1,elapsedMs:ms};
    if(answer){payload.questionId=answer.questionId;payload.lineId=answer.lineId;}
    return send('TAVERN_STEP',payload);
  }
  async function pause() {
    let v=view();if(!v||v.result)return;
    const desired=elapsed(v);clock.pauseRequested=true;stop(v);
    if(clock.pending)await clock.pending;
    v=view();if(!v||v.result)return;
    if(clock.failed){clock.localHold=true;if(app)S.ui.render(app.state);return;}
    if(active(v)&&desired>v.elapsedMs){await step(null,desired);if(clock.failed)return;}
    v=view();if(v&&!v.result&&v.phase!=='PAUSED')await send('TAVERN_PAUSE',{sessionId:v.sessionId});
    if(app)S.ui.render(app.state);
  }
  async function resume() {
    if(clock.pending)return;
    if(clock.failed){const failed=clock.failed;if(await send(failed.type,failed.payload,failed.sourceId)===null)return;}
    let v=view();if(!v||v.result)return;
    // A failed pause is retried before the user resumes, so hidden time never leaks into play time.
    if(v.phase!=='PAUSED'&&(clock.pauseRequested||clock.localHold)){if(await send('TAVERN_PAUSE',{sessionId:v.sessionId})===null)return;v=view();}
    clock.localHold=false;clock.pauseRequested=false;
    if(v.phase==='PAUSED')await send('TAVERN_RESUME',{sessionId:v.sessionId});
    else {sync(v);S.ui.render(app.state);}
  }
  async function start(mode) {
    stop();clock.pauseRequested=false;clock.localHold=false;clock.failed=null;
    await send('TAVERN_START',{mode});
  }
  async function acknowledge(nextMode) {
    const v=view();if(!v?.result)return;
    const result=await send('TAVERN_ACK',{sessionId:v.sessionId});
    if(result===null)return;
    if(nextMode)await start(nextMode);else S.ui.closePanel();
  }
  function resultContent(c,b,v) {
    const r=v.result;
    b.append(c.el('h3','tavern-result-title',v.mode==='FORMAL'?'酒肆帮工 · 今日结算':'酒肆诗令 · 试工结算'));
    if(r.completionStatus==='ABORTED'){c.paragraph(b,'本次试工已结束。钱财与时段未发生变化。');return;}
    c.row('接中',r.correctCount+' / '+r.answeredCount,b);
    c.row('最长连令',r.maxCombo,b);c.row('妙答',r.quickAnswerCount,b);c.row('加彩',r.bonusWon,b);
    if(v.mode==='FORMAL'){
      c.row('基础工钱',c.formatMoney(r.reward.base),b);
      c.row('酒客赏钱',c.formatMoney(r.reward.performance+r.reward.quick+r.reward.bonus),b);
      c.paragraph(b,'今日所得 '+c.formatMoney(r.income),'result-amount');c.paragraph(b,'耗时1个时段。','form-hint');
    }else{c.paragraph(b,'试工所得 '+c.formatMoney(r.simulatedIncome),'result-amount');c.paragraph(b,'试工不发工钱，也不推进世界时间。','form-hint');}
  }
  S.ui.registerPanel('work',{
    title:'酒肆诗令',
    noClose(){const v=view();return Boolean(v&&(!v.result&&v.mode==='FORMAL'||v.result&&!v.resultAcknowledged));},
    render(c,b){
      app=c.app;const v=S.tavern.view(c.p);refs={};sync(v);
      if(!v||v.resultAcknowledged||v.phase==='ABORTED'){
        c.paragraph(b,'酒客兴起行令，替掌柜应答诗句。接得越好，赏钱越多。');
        c.row('玩法','接诗 · 连令',b);c.row('正式帮工耗时','1个时段',b);
        if(c.p.world.city!=='changan'||c.p.world.route||S.time.phase(c.p)===2)c.paragraph(b,'酒肆诗令可在长安晨间或午间开始。','form-hint');
        c.paragraph(b,'可先试工熟悉玩法，试工不改变钱财和世界时间。','form-hint');return;
      }
      if(v.result){resultContent(c,b,v);return;}
      if(v.phase==='PAUSED'||clock.pauseRequested||clock.localHold){
        b.append(c.el('h3','tavern-pause-title','诗令暂歇'));
        c.paragraph(b,clock.failed?'保存尚未完成。请重试后继续，倒计时已暂停。':'回来后由你亲自继续，倒计时不会悄悄流逝。');return;
      }
      const stats=c.el('div','tavern-scoreboard');refs.countdown=c.el('strong','tavern-countdown');stats.append(refs.countdown,c.el('span','','接中 '+v.correctCount),c.el('span','','连令 '+v.combo));b.append(stats);
      refs.progress=c.el('progress','tavern-progress');refs.progress.max=v.roundDurationMs;refs.progress.setAttribute('aria-label','诗令有效游玩时间');b.append(refs.progress);
      if(v.phase==='READY'){c.paragraph(b,'客人出句，替他接上。连中数令，可得更多赏钱。','tavern-ready');}
      else if(v.phase==='WAIT'){c.paragraph(b,'这一轮诗令即将结束。','tavern-ready');}
      else if(v.current){
        const q=v.current;
        const labels={NEXT_LINE:'请接下一句',PREVIOUS_LINE:'请接上一句',SAME_POEM:'请选择同诗中的句子'};
        const question=c.el('section','tavern-question');
        c.paragraph(question,(q.isBonus?'加彩令 · ':'')+labels[q.questionType],'tavern-question-label');
        c.paragraph(question,q.prompt,'tavern-prompt');
        const choices=c.el('div','tavern-answers');refs.answers=[];
        for(const option of q.options){
          let className='ui-button tavern-answer';
          if(q.feedback&&option.lineId===q.feedback.correctLineId)className+=' answer-correct';
          else if(q.feedback&&option.lineId===q.feedback.selectedLineId)className+=' answer-wrong';
          const answer=c.button(option.text,()=>{const latest=view();if(latest?.current?.questionId!==q.questionId)return;void step({questionId:q.questionId,lineId:option.lineId});},{className,disabled:true});
          choices.append(answer);refs.answers.push(answer);
        }
        b.append(question,choices);
        if(q.feedback){const f=q.feedback;const feedback=c.el('div','tavern-feedback');feedback.setAttribute('role','status');feedback.append(c.el('strong','',f.timeout?'未及时接令':f.correct?(f.quick?'妙答！':'接得好！'):'此句未合'));c.paragraph(feedback,f.correctText);c.paragraph(feedback,f.author+'《'+f.poemTitle+'》','form-hint');question.append(feedback);}
      }
      paint(v);
    },
    footer(c,f){
      const v=S.tavern.view(c.p);
      if(!v||v.resultAcknowledged||v.phase==='ABORTED'){
        const available=c.p.world.city==='changan'&&!c.p.world.route&&S.time.phase(c.p)<2;
        f.append(c.button('开始帮工',()=>start('FORMAL'),{disabled:!available}),c.button('试工',()=>start('TRIAL'),{disabled:!available}),c.button('玩法说明',()=>c.openSecondary('tavern-help'),{className:'text-button'}));
      }else if(v.result){
        f.append(c.button(v.mode==='FORMAL'?'结束帮工':'返回营生',()=>acknowledge()));
        if(v.mode==='TRIAL')f.append(c.button('开始正式帮工',()=>acknowledge('FORMAL')));
      }else if(v.phase==='PAUSED'||clock.localHold||clock.pauseRequested){f.append(c.button(clock.failed?'重试保存并继续':'继续',resume));}
      else f.append(c.button('暂歇',pause,{className:'text-button'}));
    }
  });
  S.ui.registerPanel('tavern-help',{title:'诗令玩法',render(c,b){
    c.paragraph(b,'听酒客出句，从四句中选出合适的一句。有时接下句，有时寻上句，也有同诗辨句。');
    c.paragraph(b,'答得快、连中多，可得到更多酒客赏钱。加彩令接对另有赏钱。');
    c.paragraph(b,'每轮有效游玩45秒。开场、切到后台和暂歇时不计入有效游玩时间。');
    c.paragraph(b,'正式帮工开始后需完成本轮，结算推进1个时段。试工可退出，不计工钱，也不推进世界时间。');
  }});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)void pause();});
  window.addEventListener('pagehide',()=>{stop();clock.pauseRequested=true;});
})(globalThis.Silk=globalThis.Silk||{});
