(function(S){
  'use strict';
  // SILKROAD_NEW_PLAYER_GUIDE_PATCH_v1.0: the former notice-based tutorial (preparation task chain, first-visit panel hints, first
  // purchase / dusk / arrival hints) is retired. The one-time new-player guide lives in guide.js + guide-ui.js; detailed rules stay
  // under 更多 → 玩法说明. The command names and the presentation fields are kept so older saves and replays remain valid, but no
  // tutorial notice is ever created again and any persisted one is dropped.
  const hints={};
  function trigger(){}
  function started(){}
  function needsVisit(){return false;}
  function visit(){return {modal:false};}
  function purge(p){if(p.presentation?.notices?.some(n=>n.kind==='tutorial'))p.presentation.notices=p.presentation.notices.filter(n=>n.kind!=='tutorial');}
  function onCommand(p){
    purge(p);
    // Gameplay notification (not a tutorial): the 商号 eligibility notice stays.
    const eligible=S.merchant?.eligibility(p);if(eligible&&Object.values(eligible).every(Boolean)&&!p.presentation.seen['merchant-eligible']){
      p.presentation.seen['merchant-eligible']=true;p.presentation.notices.push({id:'merchant-eligible',kind:'major',title:'可以筹办商号了',text:'你已满足筹办条件，可以在长安商号查看三项筹办投入。',localCity:'changan'});
    }
  }
  S.tutorial={hints,trigger,started,visit,needsVisit,onCommand,purge,retired:'SILKROAD_NEW_PLAYER_GUIDE_PATCH_v1.0'};
  S.commands.register('tutorial.visit',(p,{panel})=>{S.util.ensure(typeof panel==='string'&&panel.length<100,'INVALID_PANEL');return visit();});
})(globalThis.Silk=globalThis.Silk||{});
