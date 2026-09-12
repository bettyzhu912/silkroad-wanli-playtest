(function (S) {
  'use strict';
  const store = new S.SaveStore();
  let running = null;
  let runningKey = null;
  const seedCache = new Map();
  function shortId(value) { let hash=2166136261;for(const ch of value){hash ^= ch.charCodeAt(0);hash=Math.imul(hash,16777619);}return (hash>>>0).toString(36); }
  const app = {
    state: null,
    async dispatch(type, payload = {}, sourceId, expectedGeneration) {
      if(expectedGeneration!==undefined)S.util.ensure(expectedGeneration===app.state.meta.generation,'STALE_GENERATION','旧页面操作已失效，请重新打开当前页面');
      const fingerprint = S.util.stable({type,payload});
      const requestedKey = S.util.stable({type,payload,sourceId:sourceId||null});
      if (running) {
        S.util.ensure(runningKey === requestedKey, 'BUSY', '上一项操作正在保存，请稍后再试');
        return running;
      }
      const supplied = sourceId || 'action-'+app.state.meta.generation+'-'+app.state.meta.revision+'-'+shortId(fingerprint);
      const id = /^[^:]{1,200}$/.test(supplied) ? supplied : 'action-'+shortId(supplied);
      const actualPayload = S.util.clone(payload);
      if(type==='game.start'){
        if(!seedCache.has(id)){const words=new Uint32Array(1);crypto.getRandomValues(words);seedCache.set(id,words[0]||1);}
        actualPayload.seed=seedCache.get(id);
        if(app.state.pending?.command?.type==='game.start')actualPayload.seed=app.state.pending.command.payload.seed;
      }
      const command={generation:app.state.meta.generation,revision:app.state.meta.revision,sourceType:'ui',sourceId:id,type,payload:actualPayload};
      runningKey=requestedKey;
      running=(async()=>{
        try{
          const outcome=await store.execute(command);app.state=outcome.state;S.ui.render(app.state);return outcome;
        }catch(error){
          try{app.state=error.state||await store.load();S.ui.render(app.state);}catch(_){}
          throw error;
        }finally{running=null;runningKey=null;}
      })();
      return running;
    },
    async reload() {const recovered=await store.recoverPending();app.state=recovered.state;S.ui.render(app.state);return recovered;},
    get busy(){return Boolean(running);}
  };
  S.app=app;
  async function boot(){
    try{
      await store.open();await store.recoverPending();app.state=(await store.upgrade()).state;
      // Restoring an in-progress real-time activity never counts time spent away.
      if(app.state.progress?.work?.tavern&&!app.state.progress.work.tavern.result&&app.state.progress.work.tavern.phase!=='PAUSED'){
        const session=app.state.progress.work.tavern;
        const c={generation:app.state.meta.generation,revision:app.state.meta.revision,sourceType:'recovery',sourceId:'tavern-pause-'+app.state.meta.revision,type:'TAVERN_PAUSE',payload:{sessionId:session.id}};
        app.state=(await store.execute(c)).state;
      }
      if(app.state.progress?.work?.routeGame&&!app.state.progress.work.routeGame.result&&app.state.progress.work.routeGame.phase!=='PAUSED'){
        const session=app.state.progress.work.routeGame;
        const c={generation:app.state.meta.generation,revision:app.state.meta.revision,sourceType:'recovery',sourceId:'rm-pause-'+app.state.meta.revision,type:'RM_PAUSE',payload:{sessionId:session.id}};
        app.state=(await store.execute(c)).state;
      }
      if(app.state.progress?.work?.caravan&&app.state.progress.work.caravan.phase==='PLAYING'&&!app.state.progress.work.caravan.result){
        const session=app.state.progress.work.caravan;
        const c={generation:app.state.meta.generation,revision:app.state.meta.revision,sourceType:'recovery',sourceId:'caravan-abort-'+app.state.meta.revision,type:'CARAVAN_ABORT',payload:{sessionId:session.id}};
        app.state=(await store.execute(c)).state;
      }
      S.ui.mount(app);
      const visit=app.state.progress?.market?.visit;
      if(visit&&!visit.settled)S.ui.openPanel('market');
    }catch(error){
      const root=document.getElementById('game-root');root.replaceChildren();
      const p=document.createElement('p');p.textContent='暂时无法打开自动存档。进度未被清除。'+(/[\u3400-\u9fff]/.test(error.message||'')?error.message:'');
      const retry=document.createElement('button');retry.type='button';retry.textContent='重试';retry.addEventListener('click',boot);root.append(p,retry);
      try{
        const recovery=await store.recoveryInfo();
        if(recovery.canRestore){
          const note=document.createElement('p');note.textContent='发现最近一次可读取的自动备份。恢复后会回到该备份保存时的进度。';
          const restore=document.createElement('button');restore.type='button';restore.textContent='恢复最近可读备份';
          restore.addEventListener('click',async()=>{restore.disabled=true;try{await store.restoreBackup(recovery.generation,recovery.revision);await boot();}catch(e){restore.disabled=false;note.textContent='备份暂未恢复，原记录仍保留。请重试。';}});root.append(note,restore);
        }
        if(Number.isSafeInteger(recovery.generation)&&Number.isSafeInteger(recovery.revision)){
          const reset=document.createElement('button'),notice=document.createElement('p');reset.textContent='重新开始游戏';
          reset.addEventListener('click',()=>{
            reset.disabled=true;notice.textContent='重新开始会清除当前进度，设置会保留。是否继续？';
            const cancel=document.createElement('button');let next=document.createElement('button');cancel.textContent='取消';next.textContent='继续';
            const clear=()=>{notice.textContent='';cancel.remove();next.remove();reset.disabled=false;};cancel.addEventListener('click',clear);
            next.addEventListener('click',()=>{notice.textContent='最后确认：当前进度将被永久清除。';const final=document.createElement('button');final.textContent='确认重新开始';next.replaceWith(final);next=final;final.onclick=async()=>{next.disabled=true;try{await store.resetUnreadable(recovery.generation,recovery.revision);await boot();}catch(e){notice.textContent='未能重新开始，原记录保留，请重试。';next.disabled=false;}};},{once:true});root.append(cancel,next);
          });root.append(reset,notice);
        }
      }catch(_){}
    }
  }
  boot();
})(globalThis.Silk = globalThis.Silk || {});
