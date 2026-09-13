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
   if(!c.p.world.route)b.append(c.button('前往商情',()=>c.openSecondary('inspect')));
   b.append(c.button('查看旧刊',()=>c.openSecondary('newspaper-history')));
 }});
 S.ui.registerPanel('newspaper-history',{title:'旧刊',render(c,b,d){const rows=S.newspapers.history(c.p,d.city);if(!rows.length)c.paragraph(b,'暂无旧刊。');for(const r of rows.slice().reverse())b.append(c.button(cities[r.city]+' · '+c.date(r.issueWorldDay*3),()=>c.openSecondary('newspaper-issue',{id:r.id})));}});
 S.ui.registerPanel('newspaper-issue',{title:'商报',render(c,b,d){const r=S.newspapers.history(c.p).find(x=>x.id===d.id);if(r)issue(c,b,r);}});
 S.ui.registerPanel('inspect',{title:'商情',render(c,b){
   const latest=S.newspapers.latest(c.p);if(latest)issue(c,b,latest);else c.paragraph(b,'尚未购入本城商报。旧刊与当时判断会保留。');
   const status=S.newspapers.availability(c.p);
   b.append(c.button(status.owned?'本期已购 · 免费查看':'购买当期商报 · 2钱',()=>c.dispatch('newspaper.purchase'),{disabled:!status.owned&&c.p.cash<2}));
   c.paragraph(b,'查看与购买商报均不耗时，不计入市场交易。','form-hint');if(status.reason)c.paragraph(b,status.reason,'form-hint');
   b.append(c.button('查看本城旧刊',()=>c.openSecondary('newspaper-history',{city:c.p.world.city})));
   const rows=c.p.messages.observations.filter(m=>(m.city||m.cityId)===c.p.world.city);
   if(rows.length){b.append(c.el('h3','','市面所见'));for(const m of rows.slice().reverse()){if(m.title)b.append(c.el('h3','',m.title));c.paragraph(b,m.text||m.body||'');if(Number.isInteger(m.tick))c.paragraph(b,c.date(m.tick),'form-hint');}}
 }});
 // Round 28 消息 page contract: two equal first-level tabs 商报 | 市面所见 (default 商报), inside 商报 two second-level tabs 最新商报 | 历史商报 (default 最新商报,
 // the latest report shown at once); 历史商报 = list newest → oldest, one issue expanded at a time; 市面所见 = the persistent MarketObservation
 // list (world date · city · content). No unread / read / new / red-dot / expiry states — a persistent reading page, not a notification centre.
 const msgView={key:null,tab:'report',sub:'latest',open:null};
 function reportDate(c,r){return c.date(r.issueWorldDay*3).replace(/·晨$/,'');}
 function reportsNewestFirst(p){return S.newspapers.history(p).slice().sort((a,b)=>b.issueWorldDay-a.issueWorldDay||(b.acquiredTick||0)-(a.acquiredTick||0));}
 function reportBody(c,b,r){
   const meta=c.el('p','msg-meta');meta.append(c.el('span','',cities[r.city]+'商报'),c.el('span','','刊期 '+reportDate(c,r)));b.append(meta);
   for(const m of r.messages){b.append(c.el('h3','',m.title));c.paragraph(b,m.text);}
   b.append(c.el('h3','','行情判断'));for(const good of S.inventory.goods){const j=r.productJudgements[good.id];if(j){c.row(good.name,j.label,b);if(j.text)c.paragraph(b,j.text,'form-hint');}}
   c.paragraph(b,'消息与判断只反映当时所知，不保证未来价格；旧刊正文和刊期会保留。','form-hint');
 }
 S.ui.registerPanel('message',{title:'消息',render(c,b){
   const key=c.entryId+':'+(S.ui.getState().secondary==='message'?'s':'p');if(msgView.key!==key){msgView.key=key;msgView.tab='report';msgView.sub='latest';msgView.open=null;}
   const rerender=()=>S.ui.render(c.state);
   const bar=c.el('div','msg-tabbar'),tabs=c.el('div','msg-tabs');tabs.setAttribute('role','tablist');
   for(const [id,label] of [['report','商报'],['observation','市面所见']]){const t=c.button(label,()=>{if(msgView.tab!==id){msgView.tab=id;msgView.open=null;rerender();}},{className:'msg-tab'});t.setAttribute('role','tab');t.setAttribute('aria-selected',String(msgView.tab===id));t.dataset.tab=id;tabs.append(t);}
   bar.append(tabs);
   if(msgView.tab==='report'){const sub=c.el('div','msg-subtabs');sub.setAttribute('role','tablist');for(const [id,label] of [['latest','最新商报'],['history','历史商报']]){const t=c.button(label,()=>{if(msgView.sub!==id){msgView.sub=id;msgView.open=null;rerender();}},{className:'msg-subtab'});t.setAttribute('role','tab');t.setAttribute('aria-selected',String(msgView.sub===id));t.dataset.subtab=id;sub.append(t);}bar.append(sub);}
   b.append(bar);
   // Round 29: the sticky bar is transparent at rest (the art's top-right sketch shows through) and gets a light paper backdrop only while the list is scrolled
   const stuck=()=>bar.classList.toggle('is-stuck',b.scrollTop>2);b.onscroll=stuck;stuck();
   const rows=reportsNewestFirst(c.p);
   if(msgView.tab==='report'&&msgView.sub==='latest'){const box=c.el('section','msg-report');box.dataset.view='latest';if(!rows.length)box.append(c.el('p','msg-empty','尚未购入商报。各城【商情】可购买当期商报。'));else reportBody(c,box,rows[0]);b.append(box);return;}
   if(msgView.tab==='report'){const list=c.el('section','msg-history');list.dataset.view='history';if(!rows.length)list.append(c.el('p','msg-empty','暂无历史商报。'));
     for(const r of rows){const open=msgView.open===r.id;const item=c.button('',()=>{msgView.open=open?null:r.id;rerender();},{className:'msg-history-item'});item.setAttribute('aria-expanded',String(open));item.dataset.reportId=r.id;item.append(c.el('span','',cities[r.city]+'商报 · '+reportDate(c,r)),c.el('span','msg-chevron',open?'收起':'展开'));list.append(item);if(open){const body=c.el('div','msg-history-body');reportBody(c,body,r);list.append(body);}}
     b.append(list);return;}
   const list=c.el('section','msg-observations');list.dataset.view='observation';const obs=c.p.messages.observations.slice().reverse();if(!obs.length)list.append(c.el('p','msg-empty','暂无市面消息。'));
   for(const m of obs){const row=c.el('article','msg-observation');const meta=c.el('p','msg-meta');if(Number.isInteger(m.tick))meta.append(c.el('span','',c.date(m.tick)));const city=m.city||m.cityId;if(city&&cities[city])meta.append(c.el('span','',cities[city]));if(meta.childNodes.length)row.append(meta);if(m.title)row.append(c.el('h3','',m.title));c.paragraph(row,m.text||m.body||'');list.append(row);}
   b.append(list);
 }});
})(globalThis.Silk=globalThis.Silk||{});
