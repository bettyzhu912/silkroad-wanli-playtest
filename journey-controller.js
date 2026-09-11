(function(S){
  'use strict';
  // This timer only requests an existing persisted command. It never measures
  // elapsed world time, changes movement, or draws random events itself.
  S.createJourneyController=function({getState,isBlocked,dispatch,schedule=setTimeout,cancel=clearTimeout,onError=()=>{}}){
    let timer=null,key=null,inFlight=false,failed=false;
    function ready(){
      const state=getState(),p=state?.progress;
      return Boolean(p?.world.route&&!p.presentation.activeResult&&
        (!p.eventSession||p.eventSession.status==='ACKNOWLEDGED')&&!isBlocked());
    }
    function stop(){if(timer!==null)cancel(timer);timer=null;key=null;}
    function refresh(){
      if(failed||inFlight||!ready()){stop();return;}
      const state=getState(),next=[state.meta.generation,state.meta.revision,state.progress.world.route.id].join('-');
      if(timer!==null&&key===next)return;
      stop();key=next;
      timer=schedule(async()=>{
        timer=null;
        const current=getState(),currentKey=current&&[current.meta.generation,current.meta.revision,current.progress?.world.route?.id].join('-');
        if(currentKey!==next||!ready()){refresh();return;}
        inFlight=true;
        try{const result=await dispatch('trip.journey',{},'journey-auto-'+next);if(result===null)failed=true;}
        catch(error){failed=true;onError(error);}
        finally{inFlight=false;refresh();}
      },1100);
    }
    return {refresh,stop,retry(){failed=false;refresh();},get failed(){return failed;}};
  };
})(globalThis.Silk=globalThis.Silk||{});
