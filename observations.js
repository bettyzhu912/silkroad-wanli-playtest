(function(S){
  'use strict';
  const {ensure:E,clone}=S.util;
  const cities={changan:'长安',dunhuang:'敦煌',khotan:'于阗'};
  const selectors=Object.freeze(['destination_route_or_market_observation','route_observation','dunhuang_market_observation','changan_to_dunhuang_route_observation','dunhuang_route_observation','khotan_silk_market_observation','khotan_route_observation','dunhuang_wool_market_observation','dunhuang_culture_or_route_observation','khotan_jade_market_observation','camp_local_or_route_observation','route_observation_or_story_clue','changan_market_observation','changan_flavor_or_story_clue','dunhuang_next_route_observation','khotan_jade_or_market_observation']);
  const texts=Object.freeze({
    'OBS-MKT-01':'近日{城市}问价偏高，{商品}成交比平日更紧。',
    'OBS-MKT-02':'{城市}的{商品}买卖大致平稳，暂未见明显偏向。',
    'OBS-MKT-03':'{城市}的{商品}出价偏谨慎，眼下成交比平日清淡。',
    'OBS-MKT-FALLBACK-01':'来人只说市面买卖照常，没有足够把握判断后续变化。',
    'OBS-ROUTE-01':'照现有脚程，补给恐怕撑不到下一站，最好先作准备。',
    'OBS-ROUTE-02':'货绳和行装已经重新收紧，下一段路会稳当一些。',
    'OBS-ROUTE-03':'同行只说前路仍可通行，风沙与歇脚处仍要照常留心。'
  });
  function row(templateId,city,extra={}){return {templateId,city,text:texts[templateId],...extra};}
  function market(p,city,goods){
    E(cities[city],'OBS_CITY');const result=[];
    for(const goodId of [...new Set(goods)]){
      // Read only the current, already persisted quote. No reports or scheduled events are read here.
      const cached=p.market.prices[city];if(!cached||cached.day!==S.time.day(p)||!S.util.integer(cached.values?.[goodId],1))continue;
      const value=S.pricing.quote(p,city,goodId),base=S.pricing.basePrice(city,goodId);
      const templateId=value*100>=base*108?'OBS-MKT-01':value*100<=base*92?'OBS-MKT-03':'OBS-MKT-02';
      result.push(row(templateId,city,{goodId,text:texts[templateId].replace('{城市}',cities[city]).replace('{商品}',goodId)}));
    }
    return result.length?result:[row('OBS-MKT-FALLBACK-01',city)];
  }
  function leg(p,from,next=false){
    const route=p.world.route,plan=S.trip?.plan||p.trip?.routePlan||[];
    if(route&&(!from||route.from===from))return route;
    let index=p.trip?.routeIndex??0;if(next&&route?.to===from)index=route.index+1;
    const candidate=plan[index];return candidate&&(!from||candidate.from===from)?candidate:null;
  }
  function hasProtection(p,route){
    if(route?.prepared||!p.world.route&&p.inn.prepared)return true;
    if(p.stories?.lines?.QY06?.flags?.protectionAvailable&&p.inventory.lots.some(l=>l.storyLineId==='QY06'&&l.condition!=='destroyed'))return true;
    return ['cargoCamelRiskMultiplier','weatherCargoRiskMultiplier','ceramicDamageRiskMultiplier'].some(key=>{const m=p.events?.segmentModifiers?.[key];return m&&m.value>0&&m.value<1&&!m.consumed&&m.routeId===route?.id;});
  }
  function route(p,from,next=false){
    const current=leg(p,from,next),city=current?.from||from||p.world.city;
    if(!current)return [row('OBS-ROUTE-03',city)];
    const needed=current===p.world.route?Math.ceil(current.remainingTicks/3):current.days;
    const templateId=p.inventory.provisions<needed?'OBS-ROUTE-01':hasProtection(p,current)?'OBS-ROUTE-02':'OBS-ROUTE-03';
    return [row(templateId,city)];
  }
  function culture(){const source=globalThis.SilkData.inn?.talkPools.dunhuang.lines.find(l=>l.id==='DH_TALK_08');E(source,'OBS_STATIC_SOURCE');return [row('OBS-DH-CULTURE-01','dunhuang',{text:source.text,contentSourceId:source.id})];}
  function flavor(){const source=globalThis.SilkData.events.campPool.common.find(e=>e.eventId==='CAMP04');E(source,'OBS_STATIC_SOURCE');return [row('OBS-CA-FLAVOR-01','changan',{text:source.resultText,contentSourceId:source.eventId})];}
  function clues(p){return (S.stories?.knownClues?.(p)||[]).filter(x=>/^QY0[1-6]$/.test(x.lineId)&&cities[x.city]&&x.title).map(x=>row('OBS-QY-CLUE-01',x.city,{lineId:x.lineId,text:'你已听过的《'+x.title+'》尚未了结，可在'+cities[x.city]+'留意已经知晓的后续。'}));}
  const allGoods=()=>S.inventory.goods.map(g=>g.id),jadeGoods=p=>['于阗玉',...(S.inventory.unlocked(p,'精制玉器')?['精制玉器']:[])];
  function candidates(p,selector){
    E(selectors.includes(selector),'OBS_SELECTOR','信息来源不在正式清单中');let groups;
    const local=()=>market(p,p.world.city,allGoods()),dh=()=>market(p,'dunhuang',['河西毛织','干果','药材','染料']);
    switch(selector){
      case 'destination_route_or_market_observation':groups=[market(p,p.world.route?.to||leg(p)?.to||p.world.city,allGoods()),route(p)];break;
      case 'route_observation':groups=[route(p)];break;
      case 'dunhuang_market_observation':groups=[dh()];break;
      case 'changan_to_dunhuang_route_observation':groups=[route(p,'changan')];break;
      case 'dunhuang_route_observation':groups=[route(p,'dunhuang')];break;
      case 'khotan_silk_market_observation':groups=[market(p,'khotan',['于阗丝织'])];break;
      case 'khotan_route_observation':groups=[route(p,'khotan')];break;
      case 'dunhuang_wool_market_observation':groups=[market(p,'dunhuang',['河西毛织'])];break;
      case 'dunhuang_culture_or_route_observation':groups=[culture(),route(p,'dunhuang')];break;
      case 'khotan_jade_market_observation':groups=[market(p,'khotan',jadeGoods(p))];break;
      case 'camp_local_or_route_observation':groups=[local(),route(p)];break;
      case 'route_observation_or_story_clue':{const known=clues(p);groups=known.length?[route(p),known]:[route(p)];break;}
      case 'changan_market_observation':{const held=p.inventory.lots.filter(l=>l.ownership==='playerOwned'&&!l.nonMarketable&&l.condition!=='destroyed').map(l=>l.goodId);groups=[market(p,'changan',held.length?held:S.inventory.goods.filter(g=>g.originCity==='changan'&&!g.advanced).map(g=>g.id))];break;}
      case 'changan_flavor_or_story_clue':{const known=clues(p);groups=known.length?[flavor(),known]:[flavor()];break;}
      case 'dunhuang_next_route_observation':groups=[route(p,'dunhuang',true)];break;
      case 'khotan_jade_or_market_observation':groups=[market(p,'khotan',jadeGoods(p)),market(p,'khotan',allGoods().filter(g=>!['于阗玉','精制玉器'].includes(g)))];break;
    }
    return groups.flatMap(group=>group.map(x=>({...x,weight:1/groups.length/group.length})));
  }
  function resolve(p,selector,source,ctx){
    E(source&&typeof source.sourceId==='string'&&source.sourceId.length>0,'OBS_SOURCE');
    const previous=p.messages.observations.find(x=>x.source==='infoSelector'&&x.sourceId===source.sourceId&&x.selector===selector);
    if(previous)return clone(previous);
    const selected=S.random.pick(p,candidates(p,selector),x=>x.weight),{weight,...visible}=selected;
    const observation={id:S.util.id(p,'observation'),source:'infoSelector',sourceId:source.sourceId,selector,eventId:source.eventId||null,tick:p.world.tick,...visible,actualInfoText:visible.text};
    p.messages.observations.push(observation);return clone(observation);
  }
  function innFacts(p,{city=p.world.city,kind}){
    const selector=kind==='route'?({changan:'changan_to_dunhuang_route_observation',dunhuang:'dunhuang_next_route_observation',khotan:'khotan_route_observation'}[city]):({changan:'changan_market_observation',dunhuang:'dunhuang_market_observation',khotan:'khotan_jade_or_market_observation'}[city]);
    return candidates(p,selector).map(x=>({...x,id:x.templateId+(x.goodId?':'+x.goodId:''),valid:true}));
  }
  S.observations={selectors,texts,candidates,resolve,innFacts};
})(globalThis.Silk=globalThis.Silk||{});
