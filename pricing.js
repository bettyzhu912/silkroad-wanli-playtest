(function (S) {
  'use strict';
  const { ensure, integer, clone } = S.util;
  const policyVersion = 'YUERONG-G01-2026-09-10-v1.0';
  const cities = ['changan', 'dunhuang', 'khotan'];
  const rows = [
    ['绢帛',24,32,38],['纸张',10,14,18],['唐代陶瓷',18,25,32],['漆器',28,37,46],
    ['河西毛织',31,20,27],['干果',18,10,14],['药材',26,15,22],['染料',36,22,30],
    ['于阗丝织',46,34,26],['于阗玉',64,46,34],['精制玉器',110,82,60],['毛毡鞋',30,22,16]
  ];
  const basePrices = Object.freeze(Object.fromEntries(cities.map((city,i)=>[city,Object.freeze(Object.fromEntries(rows.map(row=>[row[0],row[i+1]])))])));
  const clamp = (n,min,max)=>Math.min(max,Math.max(min,n));
  function basePrice(city,goodId) { ensure(cities.includes(city)&&Object.hasOwn(basePrices[city],goodId),'UNKNOWN_PRICE_GOOD');return basePrices[city][goodId]; }
  function naturalFromRoll(roll) {
    ensure(Number.isFinite(roll)&&roll>=0&&roll<1,'INVALID_ROLL');
    return roll<.15?-.08:roll<.35?-.04:roll<.65?0:roll<.85?.04:.08;
  }
  function activePressures(p,city,goodId) {
    basePrice(city,goodId);const day=S.time.day(p);
    return (p.market.scheduled||[]).filter(e=>e.cityId===city&&e.status!=='cancelled'&&day>=e.plannedStartWorldDay&&day<e.plannedStartWorldDay+e.durationDays)
      .flatMap(e=>(e.pressures||[]).filter(x=>x.goodId===goodId).map(x=>({...clone(x),eventId:e.eventId})));
  }
  function netPressure(p,city,goodId) {
    const basis=activePressures(p,city,goodId).reduce((n,e)=>n+Math.round(e.pressureDelta*10000)*(['demand_up','supply_down'].includes(e.pressureType)?1:-1),0);
    return clamp(basis,-2000,2000)/10000;
  }
  function calculate(base,natural,pressure) {
    ensure(integer(base,1)&&[-.08,-.04,0,.04,.08].includes(natural)&&Number.isFinite(pressure),'INVALID_PRICE_INPUT');
    const netBasis=clamp(Math.round(pressure*10000),-2000,2000), impactBasis=netBasis*6/10;
    const changeBasis=clamp(Math.round(natural*10000)+impactBasis,-2000,2000);
    // G01 explicitly rounds market prices half-up; financial R3 rounding remains separate.
    return Math.max(1,Math.floor((base*(10000+changeBasis)+5000)/10000));
  }
  function initialise(p) {
    const day=S.time.day(p);p.market.prices=p.market.prices||{};
    for(const city of cities){
      const current=p.market.prices[city];
      if(current?.day===day&&current.policyVersion===policyVersion)continue;
      const values={},naturalChanges={},scheduledPressures={};
      for(const [goodId] of rows){
        const natural=naturalFromRoll(S.random.next(p)),pressure=netPressure(p,city,goodId);
        values[goodId]=calculate(basePrice(city,goodId),natural,pressure);naturalChanges[goodId]=natural;scheduledPressures[goodId]=pressure;
      }
      p.market.prices[city]={day,policyVersion,values,naturalChanges,scheduledPressures};
    }
    p.market.pricePolicyVersion=policyVersion;
  }
  function quote(p,city,goodId,worldDay=S.time.day(p)) {
    basePrice(city,goodId);ensure(worldDay===S.time.day(p),'NONCURRENT_PRICE_READ','只能读取当前实际市价');
    const current=p.market.prices[city];
    ensure(current&&current.policyVersion===policyVersion&&current.day===worldDay&&integer(current.values[goodId],1),'PRICE_SNAPSHOT_UNAVAILABLE','当日市价尚未完成保存，请重新进入游戏');
    return current.values[goodId];
  }
  function validate(p) {
    for(const [city,current] of Object.entries(p.market.prices||{})){
      ensure(cities.includes(city)&&integer(current.day)&&current.day<=S.time.day(p),'INVALID_PRICE_SNAPSHOT');
      for(const [goodId] of rows){
        ensure(integer(current.values[goodId],1),'INVALID_PRICE_SNAPSHOT');
        if(current.policyVersion===policyVersion){
          const natural=current.naturalChanges[goodId],pressure=current.scheduledPressures[goodId];
          ensure(Number.isFinite(pressure)&&pressure>=-.20&&pressure<=.20&&current.values[goodId]===calculate(basePrice(city,goodId),natural,pressure),'INVALID_PRICE_SNAPSHOT');
        }
      }
    }
    return true;
  }
  S.pricing={policyVersion,basePrices,basePrice,naturalFromRoll,calculate,initialise,quote,activePressures,netPressure,validate};
  S.time.register('pricing',{dayStart:initialise});
})(globalThis.Silk = globalThis.Silk || {});
