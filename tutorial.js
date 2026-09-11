(function(S){
  'use strict';
  const hints={
    preparation:['初次西行','去市场看看，买一些可以带去异地出售的货物，再准备旅途补给。准备好后点击【出发】。这些只是提示，你可以按自己的想法安排。'],
    'market.first':['市场与行囊','价格因城市和世界日变化。你可以在市场备货；旅途补给也在市场内。'],
    'cargo.firstPurchase':['货物已入行囊','行囊空间有限；扩充驼队可以增加货位。'],
    'supplies.firstOpen':['旅途补给','1日份供整支商队使用1日，补给大于0时固定占1个货位。途中事件可能带来额外耗时。'],
    'routeEvent.first':['商路上的选择','选择可能影响时间、钱财、行粮或货物；明确代价会写在选项上。'],
    'dunhuang.firstArrival':['初抵敦煌','到了第一座异地市场，去看看长安货现在值多少钱。'],
    'foreignMarket.first':['异地买卖','不同城市、不同日子的价格会变化。可以卖出、等一等，或继续带走。'],
    'crossCitySale.first':['一次真正的跑商','这笔异地交易已经结清。买入成本、售货收入和已实现盈亏都以刚才的实际交易结果为准。'],
    'localGoods.first':['当地货物','也可以看看敦煌的当地货物，带着继续西行或运回长安。'],
    'newspaper.introduce':['想提前看看行情？','本地商报记录商业消息和未来行情方向。每期2钱，不会直接告诉你精确涨跌幅度。'],
    'newspaper.first':['读商报','商报给未来方向，不给准确价格；旧刊会永久保留。'],
    'dusk.first':['商旅中的歇息','暮时需要安排歇息。客舍5钱，风餐露宿0钱但有风险。'],
    'unstartedDusk.first':['在长安歇息','未启程时，可留宿客舍，或免费寻处暂歇；有自住院落后，也可以回院歇息。'],
    'wait.first':['等待与商期','次日市场可能变化，但已经启程的商期也会继续经过。'],
    'reputation.first':['商路上的声誉','商誉会开放委托、货源、柜坊信用和长期经营机会。'],
    'khotan.firstArrival':['准备返程','西行已至最远处。接下来仍需经敦煌返回长安。等待行情时，也要留意本趟剩余时间。'],
    'guifang.first':['柜坊','这里可办理本地寄存、飞钱、借款和还款；取钱在寄存内办理。这些业务本身不耗时。'],
    'voucher.first':['飞钱','在当前城市交钱，指定另一座城市领取；有手续费，只能在目的地兑付。'],
    'loan.first':['借款与商期','借款30日到期，与每趟22日商期分别计时。办理前请留意利率、额度、到期日和逾期后果。'],
    'commission.first':['普通委托','捎货是把指定货物送到目的地；采买要在指定城市采购；求货可用符合条件的自有货物交付。'],
    'commission.cargo':['委托货物','这些货物属于委托人，占用货位，不能当普通商品出售；任务失败后按规则收回。'],
    'merchant.funding':['筹办商号','三项共300钱，可分批投入；已投入的钱不可撤回。筹齐后自然筹备2日，不会直接跳过时间。'],
    'merchant.open':['长安的商号','货物可以留在长安货柜自动出售；初次开张已有2个货柜。'],
    'merchant.cabinet':['货柜','一个货柜只经营一种商品，同一种商品同时只用一个货柜。商号货柜与旅途行囊分开。'],
    'merchant.stock':['等待买家','达到售价条件后才会尝试寻找买家，达标不等于一定成交。'],
    'merchant.staff':['延请帮手','不雇正式员工也能免费托人代看。正式员工有固定特长，需要延请费及每30日工钱。'],
    'merchant.supplier':['供应往来','商誉给接触资格；建立往来后才能去原产地购买。商号不会自动进货。'],
    'merchant.upgrade':['扩建商号','扩建提高货柜上限与人员名额，不送货柜，也不直接提高成交率。'],
    'merchant.property':['院落','院落可以自住或出租。当前不能转卖；出租为30日一期，租期内不能改为自住。'],
    'merchant.balance':['商号余额','经营收入进入商号余额，只能在长安调取；不生息，也不会自动还贷或办理飞钱。'],
    'merchant.repeat':['渐有熟客','熟客来自商号真实成交，按商品分别积累。暂时断货不会清零；本人在市场直接卖货不会增加商号熟客。'],
    'work.first':['长安营生','《酒肆诗令》正式完成耗时1个时段；试工与中途退出不推进世界时间。未启程时经过的日子不消耗下一趟商期。'],
    'routeGame.first':['路途小游戏','这是旅途事件的一种，按画面指令操作；表现会交回旅途事件统一结算。']
  };
  const order=Object.keys(hints),panelHints={market:'market.first',provisions:'supplies.firstOpen',guifang:'guifang.first','finance-vouchers':'voucher.first',commission:'commission.first',work:'work.first','merchant-cabinets':'merchant.cabinet','merchant-cabinet':'merchant.cabinet','merchant-staff':'merchant.staff','merchant-funds':'merchant.balance','merchant-properties':'merchant.property','merchant-suppliers':'merchant.supplier','merchant-expansion':'merchant.upgrade'};
  function trigger(p,id){
    if(!hints[id]||p.presentation.tutorialSeen[id]||p.presentation.notices.some(n=>n.kind==='tutorial'&&n.id===id))return;
    if(!p.presentation.tutorialEnabled){p.presentation.tutorialSeen[id]=true;return;}
    p.presentation.notices.push({id,kind:'tutorial',tutorialOrder:order.indexOf(id),title:hints[id][0],text:hints[id][1],nonBlocking:true});
  }
  function started(p){trigger(p,'preparation');}
  function visitIds(p,panel,data={}){
    const ids=[];if(panelHints[panel]&&(panel!=='work'||p.world.city==='changan'))ids.push(panelHints[panel]);
    if(panel==='market'&&p.world.city!=='changan'){ids.push('foreignMarket.first');if(p.world.city==='dunhuang')ids.push('localGoods.first','newspaper.introduce');}
    if(panel==='merchant_business')ids.push(p.merchant.status==='open'?'merchant.open':'merchant.funding');
    if(panel==='finance-form'&&data.operation==='borrow')ids.push('loan.first');
    if(panel==='newspaper'&&p.messages.reports.length)ids.push('newspaper.first');return ids;
  }
  function needsVisit(p,panel,data){return visitIds(p,panel,data).some(id=>!p.presentation.tutorialSeen[id]&&!p.presentation.notices.some(n=>n.id===id));}
  function visit(p,panel,data){
    for(const id of visitIds(p,panel,data))trigger(p,id);
    return {modal:false};
  }
  function onCommand(p,command,result){
    const type=command.type;
    if(type==='market.buy')trigger(p,'cargo.firstPurchase');
    if(type==='market.sell'&&result&&p.world.city!==result.acquisitionCity){const row=p.journal.filter(r=>r.type==='marketSell').at(-1);if(row?.crossCity)trigger(p,'crossCitySale.first');}
    if(type==='newspaper.purchase')trigger(p,'newspaper.first');
    if(type==='inn.wait'||type==='inn.waitCommission')trigger(p,'wait.first');
    if(type==='RM_START')trigger(p,'routeGame.first');
    if(type==='trip.journey'&&p.eventSession)trigger(p,'routeEvent.first');
    if(type==='commission.accept'&&p.inventory.lots.some(l=>l.ownership==='commissionOwned'))trigger(p,'commission.cargo');
    if(type==='merchant.stock')trigger(p,'merchant.stock');
    if(p.reputation.value>0)trigger(p,'reputation.first');
    if(p.world.city==='dunhuang'&&p.reputation.firstVisits.dunhuang)trigger(p,'dunhuang.firstArrival');
    if(p.world.city==='khotan'&&p.reputation.firstVisits.khotan)trigger(p,'khotan.firstArrival');
    if(p.trip||p.tripHistory.length){p.presentation.notices=p.presentation.notices.filter(n=>n.id!=='preparation');p.presentation.tutorialSeen.preparation=true;}
    const preparation=p.presentation.notices.find(n=>n.id==='preparation');if(preparation){preparation.text=[(p.market.visit?'✓':'○')+' 去市场看看',(p.journal.some(r=>r.type==='marketBuy')?'✓':'○')+' 买一些可以带去异地出售的货物',(p.inventory.provisions>0?'✓':'○')+' 准备旅途补给','○ 准备好后点击【出发】'].join('\n');}
    const eligible=S.merchant?.eligibility(p);if(eligible&&Object.values(eligible).every(Boolean)&&!p.presentation.seen['merchant-eligible']){
      p.presentation.seen['merchant-eligible']=true;p.presentation.notices.push({id:'merchant-eligible',kind:'major',title:'可以筹办商号了',text:'你已满足筹办条件，可以在长安商号查看三项筹办投入。',localCity:'changan'});
    }
  }
  function onTime(p){if(!p.world.route&&S.time.phase(p)===2)trigger(p,p.trip?'dusk.first':'unstartedDusk.first');}
  S.tutorial={hints,trigger,started,visit,needsVisit,onCommand};
  S.commands.register('tutorial.visit',(p,{panel,data})=>{S.util.ensure(typeof panel==='string'&&panel.length<100,'INVALID_PANEL');return visit(p,panel,data);});
  S.time.register('tutorial',{afterTick:onTime});
})(globalThis.Silk=globalThis.Silk||{});
