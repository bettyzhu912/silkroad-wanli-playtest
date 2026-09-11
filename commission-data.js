(function(root){
 const data = {
  "templates": [
    {
      "templateId": "CA-B-D01",
      "sourceCityLabel": "长安",
      "typeLabel": "捎货",
      "scaleLabel": "常契",
      "routeText": "长安→敦煌",
      "goodsText": "纸张×1–2",
      "attributesText": "—",
      "text": "西市纸商托你把几束纸送到敦煌货栈，脚钱到货即结。"
    },
    {
      "templateId": "CA-B-D02",
      "sourceCityLabel": "长安",
      "typeLabel": "捎货",
      "scaleLabel": "常契",
      "routeText": "长安→敦煌",
      "goodsText": "绢帛×1–2",
      "attributesText": "—",
      "text": "一名准备西行的绢商少了驮位，请你顺路代带一小包绢帛到敦煌。"
    },
    {
      "templateId": "CA-B-P01",
      "sourceCityLabel": "长安",
      "typeLabel": "采买",
      "scaleLabel": "常契",
      "routeText": "敦煌→长安",
      "goodsText": "药材×1–2",
      "attributesText": "—",
      "text": "长安药铺想添一批河西常用药材，请你返程经过敦煌时替他采买。"
    },
    {
      "templateId": "CA-B-P02",
      "sourceCityLabel": "长安",
      "typeLabel": "采买",
      "scaleLabel": "常契",
      "routeText": "敦煌→长安",
      "goodsText": "干果×1–2",
      "attributesText": "—",
      "text": "西市食肆托你回程带些敦煌干果，整单价格已经说定。"
    },
    {
      "templateId": "CA-B-W01",
      "sourceCityLabel": "长安",
      "typeLabel": "求货",
      "scaleLabel": "常契",
      "routeText": "交长安",
      "goodsText": "河西毛织×1–2",
      "attributesText": "—",
      "text": "西市有客商正在收河西毛织，愿意给出高于平日的收购价。"
    },
    {
      "templateId": "CA-B-W02",
      "sourceCityLabel": "长安",
      "typeLabel": "求货",
      "scaleLabel": "常契",
      "routeText": "交长安",
      "goodsText": "药材×1–2",
      "attributesText": "—",
      "text": "几家药铺正在补货，有人愿以更好的价钱收你带回来的药材。"
    },
    {
      "templateId": "CA-G-D01",
      "sourceCityLabel": "长安",
      "typeLabel": "捎货",
      "scaleLabel": "良契",
      "routeText": "长安→于阗",
      "goodsText": "纸张×2–3",
      "attributesText": "远途",
      "text": "寺院书手托你把一批纸张一路带到于阗，路远，脚钱也比普通捎货高。"
    },
    {
      "templateId": "CA-G-D02",
      "sourceCityLabel": "长安",
      "typeLabel": "捎货",
      "scaleLabel": "良契",
      "routeText": "长安→敦煌",
      "goodsText": "唐代陶瓷×1",
      "attributesText": "易损/加急二选一",
      "text": "器铺托你带一箱陶器去敦煌，包装仔细，但路上经不起碰撞。"
    },
    {
      "templateId": "CA-G-P01",
      "sourceCityLabel": "长安",
      "typeLabel": "采买",
      "scaleLabel": "良契",
      "routeText": "于阗→长安",
      "goodsText": "于阗丝织×2–3",
      "attributesText": "远途",
      "text": "西市绢商想看于阗织坊的新货，托你从于阗采买后带回长安。"
    },
    {
      "templateId": "CA-G-P02",
      "sourceCityLabel": "长安",
      "typeLabel": "采买",
      "scaleLabel": "良契",
      "routeText": "敦煌→长安",
      "goodsText": "染料×2–3",
      "attributesText": "晨交或昼交",
      "text": "城中染作缺一批河西染料，约好回长安后在指定时段交货。"
    },
    {
      "templateId": "CA-G-W01",
      "sourceCityLabel": "长安",
      "typeLabel": "求货",
      "scaleLabel": "良契",
      "routeText": "交长安",
      "goodsText": "于阗丝织×2–3",
      "attributesText": "远途",
      "text": "贵家采办正在寻于阗丝织，愿为成色完好的货多付一些。"
    },
    {
      "templateId": "CA-G-W02",
      "sourceCityLabel": "长安",
      "typeLabel": "求货",
      "scaleLabel": "良契",
      "routeText": "交长安",
      "goodsText": "漆器×2",
      "attributesText": "贵重",
      "text": "西市有人收精细漆器，开出的价高，但验货也更仔细。"
    },
    {
      "templateId": "CA-E-D01",
      "sourceCityLabel": "长安",
      "typeLabel": "捎货",
      "scaleLabel": "重托",
      "routeText": "长安→于阗",
      "goodsText": "唐代陶瓷×2",
      "attributesText": "远途+易损+贵重",
      "text": "器铺将两箱精细陶器交给你远送于阗，既占驮位又经不起撞。"
    },
    {
      "templateId": "CA-E-D02",
      "sourceCityLabel": "长安",
      "typeLabel": "捎货",
      "scaleLabel": "重托",
      "routeText": "长安→敦煌",
      "goodsText": "漆器×3–4",
      "attributesText": "贵重+加急",
      "text": "一批精细漆器必须尽快送到敦煌，委托人愿给重脚钱。"
    },
    {
      "templateId": "CA-E-P01",
      "sourceCityLabel": "长安",
      "typeLabel": "采买",
      "scaleLabel": "重托",
      "routeText": "于阗→长安",
      "goodsText": "精制玉器×3",
      "attributesText": "远途+贵重+稀有",
      "text": "西市器商托你从于阗寻三件做工出色的玉器带回长安。"
    },
    {
      "templateId": "CA-E-P02",
      "sourceCityLabel": "长安",
      "typeLabel": "采买",
      "scaleLabel": "重托",
      "routeText": "于阗→长安",
      "goodsText": "于阗玉×3–4",
      "attributesText": "远途+贵重+稀有",
      "text": "有客商愿收一批成色可靠的于阗玉料，整单价已经锁定。"
    },
    {
      "templateId": "CA-E-W01",
      "sourceCityLabel": "长安",
      "typeLabel": "求货",
      "scaleLabel": "重托",
      "routeText": "交长安",
      "goodsText": "精制玉器×3",
      "attributesText": "贵重+稀有",
      "text": "贵家采办在长安等一批精制玉器，愿出明显高于市面的价。"
    },
    {
      "templateId": "CA-E-W02",
      "sourceCityLabel": "长安",
      "typeLabel": "求货",
      "scaleLabel": "重托",
      "routeText": "交长安",
      "goodsText": "于阗玉×3–4",
      "attributesText": "贵重+稀有",
      "text": "西市有大买家收于阗玉料，数量不小，验货严格。"
    },
    {
      "templateId": "DH-B-D01",
      "sourceCityLabel": "敦煌",
      "typeLabel": "捎货",
      "scaleLabel": "常契",
      "routeText": "敦煌→于阗",
      "goodsText": "干果×1–2",
      "attributesText": "—",
      "text": "货栈管事有两包耐放干果要顺路送往于阗。"
    },
    {
      "templateId": "DH-B-D02",
      "sourceCityLabel": "敦煌",
      "typeLabel": "捎货",
      "scaleLabel": "常契",
      "routeText": "敦煌→长安",
      "goodsText": "河西毛织×1–2",
      "attributesText": "—",
      "text": "一名东行客商想托你把几匹河西毛织带回长安。"
    },
    {
      "templateId": "DH-B-P01",
      "sourceCityLabel": "敦煌",
      "typeLabel": "采买",
      "scaleLabel": "常契",
      "routeText": "长安→敦煌",
      "goodsText": "纸张×1–2",
      "attributesText": "—",
      "text": "敦煌书手想补几束长安纸张，托你下一次东来时顺便带来。"
    },
    {
      "templateId": "DH-B-P02",
      "sourceCityLabel": "敦煌",
      "typeLabel": "采买",
      "scaleLabel": "常契",
      "routeText": "于阗→敦煌",
      "goodsText": "毛毡鞋×1–2",
      "attributesText": "—",
      "text": "货栈想添几双于阗毛毡鞋，请你从于阗回程时采买。"
    },
    {
      "templateId": "DH-B-W01",
      "sourceCityLabel": "敦煌",
      "typeLabel": "求货",
      "scaleLabel": "常契",
      "routeText": "交敦煌",
      "goodsText": "纸张×1–2",
      "attributesText": "—",
      "text": "敦煌几名书手正收纸张，愿意给出比平日更好的价钱。"
    },
    {
      "templateId": "DH-B-W02",
      "sourceCityLabel": "敦煌",
      "typeLabel": "求货",
      "scaleLabel": "常契",
      "routeText": "交敦煌",
      "goodsText": "于阗丝织×1–2",
      "attributesText": "—",
      "text": "过境商旅有人想收少量于阗丝织，成色合格即可。"
    },
    {
      "templateId": "DH-G-D01",
      "sourceCityLabel": "敦煌",
      "typeLabel": "捎货",
      "scaleLabel": "良契",
      "routeText": "敦煌→长安",
      "goodsText": "染料×2–3",
      "attributesText": "远途",
      "text": "染坊有一批染料要东送长安，路程长，脚钱按远途算。"
    },
    {
      "templateId": "DH-G-D02",
      "sourceCityLabel": "敦煌",
      "typeLabel": "捎货",
      "scaleLabel": "良契",
      "routeText": "敦煌→于阗",
      "goodsText": "药材×2–3",
      "attributesText": "加急",
      "text": "药商托你把一批药材尽快送往于阗，要求首次抵达后立即交付。"
    },
    {
      "templateId": "DH-G-P01",
      "sourceCityLabel": "敦煌",
      "typeLabel": "采买",
      "scaleLabel": "良契",
      "routeText": "于阗→敦煌",
      "goodsText": "于阗丝织×2–3",
      "attributesText": "晨交",
      "text": "货栈替东来客商收一批于阗丝织，只在每日晨时验货。"
    },
    {
      "templateId": "DH-G-P02",
      "sourceCityLabel": "敦煌",
      "typeLabel": "采买",
      "scaleLabel": "良契",
      "routeText": "长安→敦煌",
      "goodsText": "漆器×2–3",
      "attributesText": "贵重",
      "text": "敦煌器铺想从长安补几件精细漆器，愿给整单好价。"
    },
    {
      "templateId": "DH-G-W01",
      "sourceCityLabel": "敦煌",
      "typeLabel": "求货",
      "scaleLabel": "良契",
      "routeText": "交敦煌",
      "goodsText": "唐代陶瓷×1",
      "attributesText": "易损",
      "text": "有客商在敦煌寻完整陶器，破损货一概不要。"
    },
    {
      "templateId": "DH-G-W02",
      "sourceCityLabel": "敦煌",
      "typeLabel": "求货",
      "scaleLabel": "良契",
      "routeText": "交敦煌",
      "goodsText": "药材×2–3",
      "attributesText": "加急",
      "text": "一名长途药商正急着凑货，愿意高价收完整药材。"
    },
    {
      "templateId": "DH-E-D01",
      "sourceCityLabel": "敦煌",
      "typeLabel": "捎货",
      "scaleLabel": "重托",
      "routeText": "敦煌→长安",
      "goodsText": "染料×3–4",
      "attributesText": "远途+贵重",
      "text": "货栈托你把一批高价染料东送长安，货值不低。"
    },
    {
      "templateId": "DH-E-D02",
      "sourceCityLabel": "敦煌",
      "typeLabel": "捎货",
      "scaleLabel": "重托",
      "routeText": "敦煌→于阗",
      "goodsText": "唐代陶瓷×2",
      "attributesText": "易损+贵重",
      "text": "两箱陶器要从敦煌送往于阗，必须一路小心驮运。"
    },
    {
      "templateId": "DH-E-P01",
      "sourceCityLabel": "敦煌",
      "typeLabel": "采买",
      "scaleLabel": "重托",
      "routeText": "于阗→长安",
      "goodsText": "于阗玉×3",
      "attributesText": "远途+贵重+稀有",
      "text": "一名东行大商托你在于阗寻玉料，并直接带回长安。"
    },
    {
      "templateId": "DH-E-P02",
      "sourceCityLabel": "敦煌",
      "typeLabel": "采买",
      "scaleLabel": "重托",
      "routeText": "长安→敦煌",
      "goodsText": "漆器×3",
      "attributesText": "贵重+晨交",
      "text": "货栈替一名客商收一批长安漆器，每日晨时验货。"
    },
    {
      "templateId": "DH-E-W01",
      "sourceCityLabel": "敦煌",
      "typeLabel": "求货",
      "scaleLabel": "重托",
      "routeText": "交敦煌",
      "goodsText": "精制玉器×3",
      "attributesText": "贵重+稀有",
      "text": "敦煌有客商愿高价收三件精制玉器，验货严格。"
    },
    {
      "templateId": "DH-E-W02",
      "sourceCityLabel": "敦煌",
      "typeLabel": "求货",
      "scaleLabel": "重托",
      "routeText": "交敦煌",
      "goodsText": "于阗丝织×3–4",
      "attributesText": "贵重+加急",
      "text": "一支准备东行的商队急收于阗丝织，首次可交时必须办妥。"
    },
    {
      "templateId": "HT-B-D01",
      "sourceCityLabel": "于阗",
      "typeLabel": "捎货",
      "scaleLabel": "常契",
      "routeText": "于阗→敦煌",
      "goodsText": "于阗丝织×1–2",
      "attributesText": "—",
      "text": "织坊托你把两匹丝织顺路带到敦煌货栈。"
    },
    {
      "templateId": "HT-B-D02",
      "sourceCityLabel": "于阗",
      "typeLabel": "捎货",
      "scaleLabel": "常契",
      "routeText": "于阗→敦煌",
      "goodsText": "毛毡鞋×1–2",
      "attributesText": "—",
      "text": "毡坊有几双毛毡鞋要交给敦煌的客商。"
    },
    {
      "templateId": "HT-B-P01",
      "sourceCityLabel": "于阗",
      "typeLabel": "采买",
      "scaleLabel": "常契",
      "routeText": "敦煌→于阗",
      "goodsText": "药材×1–2",
      "attributesText": "—",
      "text": "于阗商户托你从敦煌带些药材回来，整单价已经说好。"
    },
    {
      "templateId": "HT-B-P02",
      "sourceCityLabel": "于阗",
      "typeLabel": "采买",
      "scaleLabel": "常契",
      "routeText": "敦煌→于阗",
      "goodsText": "干果×1–2",
      "attributesText": "—",
      "text": "织坊伙计想补些耐放干果，请你从敦煌采买。"
    },
    {
      "templateId": "HT-B-W01",
      "sourceCityLabel": "于阗",
      "typeLabel": "求货",
      "scaleLabel": "常契",
      "routeText": "交于阗",
      "goodsText": "纸张×1–2",
      "attributesText": "—",
      "text": "寺院书手正在收纸张，愿意为完好纸束多付一些。"
    },
    {
      "templateId": "HT-B-W02",
      "sourceCityLabel": "于阗",
      "typeLabel": "求货",
      "scaleLabel": "常契",
      "routeText": "交于阗",
      "goodsText": "药材×1–2",
      "attributesText": "—",
      "text": "于阗有商户补药材库存，愿意高于市价收少量现货。"
    },
    {
      "templateId": "HT-G-D01",
      "sourceCityLabel": "于阗",
      "typeLabel": "捎货",
      "scaleLabel": "良契",
      "routeText": "于阗→长安",
      "goodsText": "于阗丝织×2–3",
      "attributesText": "远途",
      "text": "织坊想把一批丝织送到长安试销，托你一路东带。"
    },
    {
      "templateId": "HT-G-D02",
      "sourceCityLabel": "于阗",
      "typeLabel": "捎货",
      "scaleLabel": "良契",
      "routeText": "于阗→敦煌",
      "goodsText": "精制玉器×2",
      "attributesText": "贵重",
      "text": "玉工托你把两件做好的玉器送到敦煌，交接时要仔细验封。"
    },
    {
      "templateId": "HT-G-P01",
      "sourceCityLabel": "于阗",
      "typeLabel": "采买",
      "scaleLabel": "良契",
      "routeText": "敦煌→于阗",
      "goodsText": "染料×2–3",
      "attributesText": "昼交",
      "text": "织坊托你从敦煌采买染料，每日昼时有人收货。"
    },
    {
      "templateId": "HT-G-P02",
      "sourceCityLabel": "于阗",
      "typeLabel": "采买",
      "scaleLabel": "良契",
      "routeText": "长安→于阗",
      "goodsText": "纸张×2–3",
      "attributesText": "远途",
      "text": "寺院书手托你从长安一路带几束纸张到于阗。"
    },
    {
      "templateId": "HT-G-W01",
      "sourceCityLabel": "于阗",
      "typeLabel": "求货",
      "scaleLabel": "良契",
      "routeText": "交于阗",
      "goodsText": "唐代陶瓷×1",
      "attributesText": "易损+贵重",
      "text": "有玉工想换一件完整长安陶器，愿意给出好价。"
    },
    {
      "templateId": "HT-G-W02",
      "sourceCityLabel": "于阗",
      "typeLabel": "求货",
      "scaleLabel": "良契",
      "routeText": "交于阗",
      "goodsText": "河西毛织×2–3",
      "attributesText": "加急",
      "text": "一支准备穿越寒路的商队急收河西毛织。"
    },
    {
      "templateId": "HT-E-D01",
      "sourceCityLabel": "于阗",
      "typeLabel": "捎货",
      "scaleLabel": "重托",
      "routeText": "于阗→长安",
      "goodsText": "精制玉器×3",
      "attributesText": "远途+贵重+稀有",
      "text": "玉坊托你把三件精制玉器送到长安，整趟路都得小心。"
    },
    {
      "templateId": "HT-E-D02",
      "sourceCityLabel": "于阗",
      "typeLabel": "捎货",
      "scaleLabel": "重托",
      "routeText": "于阗→长安",
      "goodsText": "于阗玉×3–4",
      "attributesText": "远途+贵重+稀有",
      "text": "一批玉料要远送长安，货值很高，不得在普通市场转手。"
    },
    {
      "templateId": "HT-E-P01",
      "sourceCityLabel": "于阗",
      "typeLabel": "采买",
      "scaleLabel": "重托",
      "routeText": "长安→于阗",
      "goodsText": "漆器×3",
      "attributesText": "远途+贵重",
      "text": "于阗贵客托你从长安采买几件精细漆器。"
    },
    {
      "templateId": "HT-E-P02",
      "sourceCityLabel": "于阗",
      "typeLabel": "采买",
      "scaleLabel": "重托",
      "routeText": "敦煌→于阗",
      "goodsText": "染料×3–4",
      "attributesText": "贵重+加急",
      "text": "织坊急需一批上好染料，首次回到于阗就要交货。"
    },
    {
      "templateId": "HT-E-W01",
      "sourceCityLabel": "于阗",
      "typeLabel": "求货",
      "scaleLabel": "重托",
      "routeText": "交于阗",
      "goodsText": "纸张×3–4",
      "attributesText": "稀有+加急",
      "text": "寺院书手急收一批成色齐整的纸张，数量不小。"
    },
    {
      "templateId": "HT-E-W02",
      "sourceCityLabel": "于阗",
      "typeLabel": "求货",
      "scaleLabel": "重托",
      "routeText": "交于阗",
      "goodsText": "唐代陶瓷×2",
      "attributesText": "易损+贵重",
      "text": "有客商高价求两件完整陶器，任何破损都不能用于交付。"
    }
  ],
  "stories": [
    {
      "id": "QY01",
      "name": "一卷西行",
      "triggerText": "触发：商誉≥10；至少到过敦煌1次；长安可触发",
      "theme": "主题：纸张、经卷、寺院书手与三地流通；不建立宗教评价，只表现商旅中的抄写与材料需求。",
      "chapters": [
        {
          "id": "QY01_1",
          "lineId": "QY01",
          "chapter": 1,
          "title": "纸束西行",
          "location": "长安",
          "text": "寺院书手托你把一包纸样带到敦煌。选择普通包扎（0钱）或加固包扎（-3钱，后续货损保护）。",
          "resultText": "到敦煌交付；+8钱，+1商誉；记录 qy01_reinforced。"
        },
        {
          "id": "QY01_2",
          "lineId": "QY01",
          "chapter": 2,
          "title": "纸色不同",
          "location": "敦煌",
          "text": "敦煌书手比较纸样后，托你在于阗看看当地书写材料需求。到于阗后选择‘照实转述’或‘夸大长安纸的紧缺’。",
          "resultText": "照实：+1商誉；夸大：+4钱但记录 qy01_exaggerated。"
        },
        {
          "id": "QY01_3",
          "lineId": "QY01",
          "chapter": 3,
          "title": "经帙需织",
          "location": "于阗",
          "text": "于阗寺院书手想用丝织作经帙，委托你准备于阗丝织×1并带一份回敦煌作样。",
          "resultText": "完成 +10钱，+1商誉；货物为玩家自有，可自行采购。"
        },
        {
          "id": "QY01_4",
          "lineId": "QY01",
          "chapter": 4,
          "title": "敦煌回话",
          "location": "敦煌返程",
          "text": "敦煌书手根据你之前的转述决定是否继续收长安纸。若曾夸大，会要求你说明为何市面并未如说法紧缺。",
          "resultText": "坦白：不扣已有商誉但本章仅+4钱；坚持说法：+8钱，无商誉。照实路线：+8钱，+2商誉。"
        },
        {
          "id": "QY01_5",
          "lineId": "QY01",
          "chapter": 5,
          "title": "一卷成形",
          "location": "长安返程",
          "text": "把沿途反馈带回长安。系统根据 qy01_reinforced / qy01_exaggerated 给出不同总结。",
          "resultText": "最终 +12～18钱，+2～3商誉；closed。"
        }
      ]
    },
    {
      "id": "QY02",
      "name": "玉料两价",
      "triggerText": "触发：商誉≥20；已在商号建立于阗玉供应关系、具备采购资格；于阗可触发",
      "theme": "主题：玉料价值、成色判断与跨城报价；不做宝石鉴定小游戏，只做商业选择与责任。",
      "chapters": [
        {
          "id": "QY02_1",
          "lineId": "QY02",
          "chapter": 1,
          "title": "一块试料",
          "location": "于阗",
          "text": "玉料商交给你一块 storyOwned 试料，托你带到敦煌听听东来商人的报价。",
          "resultText": "试料1格、贵重；到敦煌 +6钱，+1商誉。"
        },
        {
          "id": "QY02_2",
          "lineId": "QY02",
          "chapter": 2,
          "title": "两种说法",
          "location": "敦煌",
          "text": "一名买家愿高价，但只问‘是否有明显瑕处’。选择照实说明或含糊带过。",
          "resultText": "照实：branch=honest；含糊：branch=conceal，立即多得+6钱但留下flag。"
        },
        {
          "id": "QY02_3",
          "lineId": "QY02",
          "chapter": 3,
          "title": "长安器铺",
          "location": "长安",
          "text": "若继续带试料到长安，一家器铺给出更完整评价。可选择把评价原样带回于阗，或只带最有利的报价。",
          "resultText": "原样：+2商誉；只带高价：+8钱，无商誉。"
        },
        {
          "id": "QY02_4",
          "lineId": "QY02",
          "chapter": 4,
          "title": "回到玉市",
          "location": "下一商期于阗",
          "text": "玉料商根据此前信息决定是否把一批更好的料交给你代寻买家。",
          "resultText": "honest路径更容易出现贵重重托；conceal路径要求先解释。"
        },
        {
          "id": "QY02_5",
          "lineId": "QY02",
          "chapter": 5,
          "title": "价外之信",
          "location": "敦煌或长安",
          "text": "最终章不再送特殊物，只根据你过去是否如实传价给结局。",
          "resultText": "诚信结局：+18钱,+4商誉；逐利结局：+28钱,+2商誉；均closed。"
        }
      ]
    },
    {
      "id": "QY03",
      "name": "风沙旧箱",
      "triggerText": "触发：商誉≥10；敦煌去程；前一商期至少触发过1次货损/风沙事件",
      "theme": "主题：货栈托运责任与货损补救，直接联动既有风沙/装驮经历。",
      "chapters": [
        {
          "id": "QY03_1",
          "lineId": "QY03",
          "chapter": 1,
          "title": "无人来取的货箱",
          "location": "敦煌",
          "text": "货栈管事请你把一只久等收货人的旧箱送往于阗。可选择直接带走或花2钱重新加固。",
          "resultText": "storyOwned，1格；记录 qy03_repacked。"
        },
        {
          "id": "QY03_2",
          "lineId": "QY03",
          "chapter": 2,
          "title": "驮架松动",
          "location": "敦煌→于阗",
          "text": "若本段触发兼容货损事件，则追加奇缘选项：优先护住旧箱；有敦煌装驮经历时可获得免费高成功率选项。",
          "resultText": "不另Roll事件；结果记录 intact / damaged。"
        },
        {
          "id": "QY03_3",
          "lineId": "QY03",
          "chapter": 3,
          "title": "封口有异",
          "location": "于阗",
          "text": "收货方发现旧箱封口与原记号不完全一致。选择让对方先开箱验货，或原封退回敦煌核对。",
          "resultText": "开箱：更快但若damaged奖励降低；退回：跨商期继续。"
        },
        {
          "id": "QY03_4",
          "lineId": "QY03",
          "chapter": 4,
          "title": "货栈旧账",
          "location": "敦煌返程或下商期",
          "text": "核对旧货单后发现是一次转手登记失误，并非盗换。",
          "resultText": "若此前谨慎处理：+15钱,+3商誉；强行交付：+10钱,+1商誉；closed。"
        }
      ]
    },
    {
      "id": "QY04",
      "name": "织坊东行",
      "triggerText": "触发：商誉≥20；于阗；至少完成过1份于阗丝织普通委托",
      "theme": "主题：于阗丝织如何沿敦煌进入长安市场；强调订单规模选择，不做正式商号系统。",
      "chapters": [
        {
          "id": "QY04_1",
          "lineId": "QY04",
          "chapter": 1,
          "title": "两匹样货",
          "location": "于阗",
          "text": "织坊管事托你带两匹丝织到敦煌试销。可选稳妥包装（占2格）或合并压装（占1格但货损后果更重）。",
          "resultText": "到敦煌 +10钱,+1商誉；记录 packing。"
        },
        {
          "id": "QY04_2",
          "lineId": "QY04",
          "chapter": 2,
          "title": "东行客商的加单",
          "location": "敦煌",
          "text": "客商愿意加订：小单2件或大单4件。大单只在你当前货位和商期时间允许时出现。",
          "resultText": "小单后续稳定；大单后续报酬高、难度高。"
        },
        {
          "id": "QY04_3",
          "lineId": "QY04",
          "chapter": 3,
          "title": "长安试价",
          "location": "长安",
          "text": "把样货带到长安。选择立即按当前报价成交，或只报行情不成交。",
          "resultText": "成交得现金；不成交获得一条‘市面所见’级消息，不解锁商报判断。"
        },
        {
          "id": "QY04_4",
          "lineId": "QY04",
          "chapter": 4,
          "title": "织坊回信",
          "location": "下一商期于阗",
          "text": "织坊根据你带回的结果调整下一批货。",
          "resultText": "依据小单/大单与是否诚实回报生成不同采买/捎货章节。"
        },
        {
          "id": "QY04_5",
          "lineId": "QY04",
          "chapter": 5,
          "title": "东行成单",
          "location": "长安返程",
          "text": "完成最后一批交付。",
          "resultText": "稳妥线 +22钱,+4商誉；激进大单线成功 +32钱,+4商誉；若途中货损则 +14～20钱,+2商誉；closed。"
        }
      ]
    },
    {
      "id": "QY05",
      "name": "河西药帖",
      "triggerText": "触发：商誉≥10；敦煌；至少完成过1份药材或干果普通委托",
      "theme": "主题：药材贸易与供货信息，不涉及诊疗建议或药效判断。",
      "chapters": [
        {
          "id": "QY05_1",
          "lineId": "QY05",
          "chapter": 1,
          "title": "一张货目",
          "location": "敦煌",
          "text": "药商给你一张货目，想知道长安哪些河西药材更好出手。",
          "resultText": "无特殊货；到长安后查看市场并回报。"
        },
        {
          "id": "QY05_2",
          "lineId": "QY05",
          "chapter": 2,
          "title": "长安的两种报价",
          "location": "长安",
          "text": "两家铺子给出不同收购方式：一次高价少量，或较稳的长期价。选择其一带回敦煌。",
          "resultText": "high / stable flag；+4钱。"
        },
        {
          "id": "QY05_3",
          "lineId": "QY05",
          "chapter": 3,
          "title": "回程补货",
          "location": "敦煌返程",
          "text": "药商根据你的选择托你准备一小批药材。若当前市场事件显示供应紧，任务只提高难度/报酬，不直接告诉玩家原因。",
          "resultText": "完成 +10～16钱,+2商誉。"
        },
        {
          "id": "QY05_4",
          "lineId": "QY05",
          "chapter": 4,
          "title": "货目改写",
          "location": "下一商期长安或敦煌",
          "text": "对比实际成交与之前建议；如果玩家曾夸大价格，会得到较差的本章结算但不扣已有商誉。",
          "resultText": "稳定线 +14钱,+3商誉；逐高价线 +18钱,+2商誉；closed。"
        }
      ]
    },
    {
      "id": "QY06",
      "name": "三城合契",
      "triggerText": "触发：商誉≥40；已完成任意3条其他商路奇缘；长安触发",
      "theme": "主题：后期综合商路故事。不是商号/公会系统，只是一轮由三地商户共同参与的特殊大单。",
      "chapters": [
        {
          "id": "QY06_1",
          "lineId": "QY06",
          "chapter": 1,
          "title": "三张货目",
          "location": "长安",
          "text": "你同时收到长安、敦煌、于阗三份货目。选择本次主打：稳妥货（纸/干果）、高值货（玉/漆器）或时效货（药材/染料）。",
          "resultText": "branch=steady/value/urgent。"
        },
        {
          "id": "QY06_2",
          "lineId": "QY06",
          "chapter": 2,
          "title": "敦煌调度",
          "location": "敦煌去程",
          "text": "根据主打方向出现一次调整：稳妥线可减货位压力；高值线可加固贵重货；时效线可花钱换取省时选择。",
          "resultText": "0～-5钱成本；记录 preparation。"
        },
        {
          "id": "QY06_3",
          "lineId": "QY06",
          "chapter": 3,
          "title": "于阗换单",
          "location": "于阗",
          "text": "当地供货情况与出发时不同。玩家选择坚持原计划或换成另一种可交货。",
          "resultText": "坚持：高风险高收益；换单：收益较稳。"
        },
        {
          "id": "QY06_4",
          "lineId": "QY06",
          "chapter": 4,
          "title": "回程验货",
          "location": "敦煌返程",
          "text": "货栈统一检查本次货况；如果曾在随机事件中保护货物，这里给正向回响。",
          "resultText": "+8～15钱阶段奖励。"
        },
        {
          "id": "QY06_5",
          "lineId": "QY06",
          "chapter": 5,
          "title": "长安结契",
          "location": "长安返程",
          "text": "完成整轮特殊大单并总结你这一路的选择。",
          "resultText": "成功 +30～45钱,+5商誉；若有受损仍可按分支完成但收益降低；closed。"
        }
      ]
    }
  ]
};
 function freeze(value){ if(value && typeof value === "object" && !Object.isFrozen(value)){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
 root.SilkData = Object.freeze({...root.SilkData, commissions: freeze(data)});
})(globalThis);
