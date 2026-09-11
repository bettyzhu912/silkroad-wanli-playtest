(function(S){
 'use strict';
 const cities={changan:'长安',dunhuang:'敦煌',khotan:'于阗'};
 function issue(c,b,r){
   b.append(c.el('h3','',cities[r.city]+'商报'));c.row('刊期',c.date(r.issueWorldDay*3).replace(/·晨$/,''),b);
   for(const m of r.messages){b.append(c.el('h3','',m.title));c.paragraph(b,m.text);}
   b.append(c.el('h3','','行情判断'));for(const good of S.inventory.goods){const j=r.productJudgements[good.id];if(j){c.row(good.name,j.label,b);if(j.text)c.paragraph(b,j.text,'form-hint');}}
   c.paragraph(b,'消息与判断只反映当时所知，不保证未来价格；旧刊正文和刊期会保留。','form-hint');
 }
 S.ui.registerPanel('newspaper',{title:'商报',render(c,b){
   const latest=S.newspapers.latest(c.p);if(latest)issue(c,b,latest);else c.paragraph(b,'尚未购入本城商报。');
   const status=S.newspapers.availability(c.p),visit=c.p.market.visit;if(visit&&!visit.settled){
     b.append(c.button(status.owned?'本期已购 · 免费查看':'购买新一期商报 · 2钱',()=>c.dispatch('newspaper.purchase',{visitId:visit.id}),{disabled:!status.owned&&c.p.cash<2}));
     if(status.owned)c.paragraph(b,'本期已购，重复查看不收费。下一期最早可在'+c.date(status.nextEligibleWorldDay*3)+'购买。','form-hint');
     else if(status.reason)c.paragraph(b,status.reason,'form-hint');
   }
   else c.paragraph(b,'请在市场内购买商报。','form-hint');
   b.append(c.button('查看旧刊',()=>c.openSecondary('newspaper-history')));
 }});
 S.ui.registerPanel('newspaper-history',{title:'旧刊',render(c,b,d){const rows=S.newspapers.history(c.p,d.city);if(!rows.length)c.paragraph(b,'暂无旧刊。');for(const r of rows.slice().reverse())b.append(c.button(cities[r.city]+' · '+c.date(r.issueWorldDay*3),()=>c.openSecondary('newspaper-issue',{id:r.id})));}});
 S.ui.registerPanel('newspaper-issue',{title:'商报',render(c,b,d){const r=S.newspapers.history(c.p).find(x=>x.id===d.id);if(r)issue(c,b,r);}});
 S.ui.registerPanel('inspect',{title:'商情',render(c,b){
   const latest=S.newspapers.latest(c.p);if(latest)issue(c,b,latest);else c.paragraph(b,'尚未购入本城商报。可在市场内购买，旧刊与当时判断会保留。');
   b.append(c.button('查看本城旧刊',()=>c.openSecondary('newspaper-history',{city:c.p.world.city})));
   const rows=c.p.messages.observations.filter(m=>(m.city||m.cityId)===c.p.world.city);
   if(rows.length){b.append(c.el('h3','','市面所见'));for(const m of rows.slice().reverse()){if(m.title)b.append(c.el('h3','',m.title));c.paragraph(b,m.text||m.body||'');if(Number.isInteger(m.tick))c.paragraph(b,c.date(m.tick),'form-hint');}}
 }});
 S.ui.registerPanel('message',{title:'消息',render(c,b){
   b.append(c.button('历期商报',()=>c.openSecondary('newspaper-history')));b.append(c.el('h3','','市面所见'));
   if(!c.p.messages.observations.length)c.paragraph(b,'暂无市面消息。');
   for(const m of c.p.messages.observations.slice().reverse()){const row=c.el('article','message-entry');if(m.title)row.append(c.el('h3','',m.title));c.paragraph(row,m.text||m.body||'');if(Number.isInteger(m.tick))c.paragraph(row,c.date(m.tick),'form-hint');b.append(row);}
 }});
})(globalThis.Silk=globalThis.Silk||{});
