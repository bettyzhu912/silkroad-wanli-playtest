(function(root){
 const data = {
  "version": "1.0",
  "title": "07/09 客舍行动反馈专项补丁",
  "global": {
    "talkCostCash": 2,
    "talkTimePlayerFacing": "耗时1个时段",
    "talkAllowedPeriods": [
      "晨",
      "昼"
    ],
    "talkLimit": "每城每世界日最多1次",
    "recentNormalTalkIdsPerCity": 3,
    "feedbackAutoDismiss": false,
    "feedbackMustAcknowledge": true,
    "playerFacingTickForbidden": true,
    "compendiumFrontendLocked": true,
    "dynamicFactsMustComeFromExistingWorldState": true
  },
  "feedbackActions": {
    "rest": {
      "costCash": 1,
      "time": "1个时段",
      "continueLabel": "继续"
    },
    "talk": {
      "costCash": 2,
      "time": "1个时段",
      "continueLabel": "继续"
    },
    "waitCommission": {
      "costCashPerPeriod": 1,
      "cannotCrossDusk": true,
      "continueLabel": "继续"
    },
    "prepareCargo": {
      "costCash": 0,
      "time": "1个时段",
      "setsPrepared": true,
      "playerText": "下一段旅途中，因装载松动导致的货损风险有所降低。",
      "continueLabel": "继续"
    },
    "stayInn": {
      "costCash": 5,
      "time": "暮→次日晨",
      "continueLabel": "开始新的一日"
    },
    "camp": {
      "costCash": 0,
      "time": "暮→次日晨",
      "continueLabel": "开始新的一日",
      "nightOutcomeWeights": {
        "safe": 65,
        "cargoDamage": 15,
        "cashRisk": 10,
        "ordinaryCampEvent": 10
      }
    }
  },
  "talkPools": {
    "changan": {
      "topicWeights": {
        "市场/商品": 35,
        "河西及西来商队": 20,
        "贵家宴会/采买": 15,
        "西市风土/见闻": 15,
        "特殊剧情线索": 10,
        "纯风味": 5
      },
      "lines": [
        {
          "id": "CA_TALK_01",
          "topic": "市场/商品",
          "text": "一名东来的商人说，近日有人打听纸张和绢帛的价钱，比前些日子勤快。",
          "resultType": "MARKET_OBSERVATION",
          "feedbackLabel": "市面所见",
          "origin": "v1.6继承",
          "implementationNote": "该条只有在现有市场/消息状态支持对应说法时进入候选；否则跳过。"
        },
        {
          "id": "CA_TALK_02",
          "topic": "市场/商品",
          "text": "桌边几名商人争论漆器是否值得压钱远运，谁也没有完全说服谁。",
          "resultType": "MARKET_RUMOR",
          "feedbackLabel": "市面所见",
          "origin": "v1.6继承",
          "implementationNote": "普通经营传闻，不直接改价。"
        },
        {
          "id": "CA_TALK_03",
          "topic": "河西及西来商队",
          "text": "有人刚从河西回来，说一路上商队不少，只是几处停留比往常久。",
          "resultType": "ROUTE_OBSERVATION",
          "feedbackLabel": "市面所见",
          "origin": "v1.6继承",
          "implementationNote": "模糊路讯，不显示概率。"
        },
        {
          "id": "CA_TALK_04",
          "topic": "河西及西来商队",
          "text": "一名驼夫提起西去的同行近日多了，补给和脚力都得早点安排。",
          "resultType": "ROUTE_OBSERVATION",
          "feedbackLabel": "市面所见",
          "origin": "v1.6继承",
          "implementationNote": "路线准备提示。"
        },
        {
          "id": "CA_TALK_05",
          "topic": "贵家宴会/采买",
          "text": "伙计说城中近来有人替大户四处问货，但究竟要多少还没有准信。",
          "resultType": "MARKET_OBSERVATION",
          "feedbackLabel": "市面所见",
          "origin": "v1.6继承",
          "implementationNote": "只有有对应有效商业消息时进入候选。"
        },
        {
          "id": "CA_TALK_06",
          "topic": "贵家宴会/采买",
          "text": "邻桌有人议论某场宴饮将近，几类精细货物最近被问得更勤。",
          "resultType": "MARKET_OBSERVATION",
          "feedbackLabel": "市面所见",
          "origin": "v1.6继承",
          "implementationNote": "只给方向，不直接改价。"
        },
        {
          "id": "CA_TALK_07",
          "topic": "西市风土/见闻",
          "text": "一名熟悉西市的外来商人讲起自己如何辨认不同来处的货物。",
          "resultType": "LORE",
          "feedbackLabel": "见闻",
          "origin": "v1.6继承",
          "implementationNote": "只记录见闻。"
        },
        {
          "id": "CA_TALK_08",
          "topic": "西市风土/见闻",
          "text": "几名不同来处的商旅围着一张货单比划，谈话里夹着陌生的词音。",
          "resultType": "LORE",
          "feedbackLabel": "见闻",
          "origin": "v1.6继承",
          "implementationNote": "可写对应见闻 flag，前台图鉴仍 LOCKED。"
        },
        {
          "id": "CA_TALK_09",
          "topic": "特殊剧情线索",
          "text": "有人提起一批托人带往河西的货迟迟无人肯接。",
          "resultType": "CLUE",
          "feedbackLabel": "线索",
          "origin": "v1.6继承",
          "implementationNote": "只写 specialClue 类前置，不直接弹委托。"
        },
        {
          "id": "CA_TALK_10",
          "topic": "特殊剧情线索",
          "text": "一名商人四处问有没有常走敦煌的人，却又不肯在堂中细说缘由。",
          "resultType": "CLUE",
          "feedbackLabel": "线索",
          "origin": "v1.6继承",
          "implementationNote": "只写剧情/委托前置。"
        },
        {
          "id": "CA_TALK_11",
          "topic": "纯风味",
          "text": "有人一边吃饼一边抱怨昨夜没睡好，同行只是笑他还不惯长途。",
          "resultType": "FLAVOR",
          "feedbackLabel": null,
          "origin": "v1.6继承",
          "implementationNote": "无数值结果。"
        },
        {
          "id": "CA_TALK_12",
          "topic": "纯风味",
          "text": "伙计把门边的尘土扫了又扫，不一会儿又被进出的靴子踩乱。",
          "resultType": "FLAVOR",
          "feedbackLabel": null,
          "origin": "v1.6继承",
          "implementationNote": "无数值结果。"
        },
        {
          "id": "CA_TALK_13",
          "topic": "市场/商品",
          "text": "一个刚从西市回来的商人说，几家铺子都在重新清点绢帛，只是没人肯说接下来准备收多少。",
          "resultType": "MARKET_OBSERVATION",
          "feedbackLabel": "市面所见",
          "origin": "v1.0新增",
          "implementationNote": "只有有对应有效市场观察时进入候选。"
        },
        {
          "id": "CA_TALK_14",
          "topic": "河西及西来商队",
          "text": "有人提起昨日出城的一支驼队装得太满，走到城外才又停下来重新分货。",
          "resultType": "LORE",
          "feedbackLabel": "见闻",
          "origin": "v1.0新增",
          "implementationNote": "商旅经验，不直接修改货位或事件概率。"
        },
        {
          "id": "CA_TALK_15",
          "topic": "贵家宴会/采买",
          "text": "邻桌商人说，城里替大户采买的人最难伺候，今日问的是一类货，明日说不定又换了主意。",
          "resultType": "LORE",
          "feedbackLabel": "见闻",
          "origin": "v1.0新增",
          "implementationNote": "强化“传闻不是确定预测”。"
        },
        {
          "id": "CA_TALK_16",
          "topic": "西市风土/见闻",
          "text": "一个常跑西市的脚夫说，真正忙起来时，商人说什么话并不重要，先看他把哪几包货放在最顺手的位置。",
          "resultType": "LORE",
          "feedbackLabel": "见闻",
          "origin": "v1.0新增",
          "implementationNote": "无直接经济效果。"
        },
        {
          "id": "CA_TALK_17",
          "topic": "西市风土/见闻",
          "text": "一个口音陌生的商人把几枚不同地方流通过的钱摊在掌心，旁边的人轮流拿起来看，却谁也没有谈成生意。",
          "resultType": "LORE",
          "feedbackLabel": "见闻",
          "origin": "v1.0新增",
          "implementationNote": "只做丝路交流感，不新增第二套货币系统。"
        },
        {
          "id": "CA_TALK_18",
          "topic": "特殊剧情线索",
          "text": "有人低声说，一支本该从河西回来的商队迟了几日，货主已经派人往城门外打听。",
          "resultType": "CLUE",
          "feedbackLabel": "线索",
          "origin": "v1.0新增",
          "implementationNote": "只写剧情/委托前置。"
        },
        {
          "id": "CA_TALK_19",
          "topic": "市场/商品",
          "text": "一名商人压低声音，告诉同桌他刚在西市听到了一条关于最近买卖的消息。",
          "resultType": "DYNAMIC_MARKET",
          "feedbackLabel": "市面所见",
          "origin": "v1.0新增",
          "implementationNote": "随后展示从当前长安有效市面所见池抽中的真实消息全文；没有有效消息则本条不进入候选。"
        },
        {
          "id": "CA_TALK_20",
          "topic": "纯风味",
          "text": "堂里几个人为了谁该坐靠门的位置争了半天，最后一阵冷风吹进来，原本争座的人反倒一起往里面挪。",
          "resultType": "FLAVOR",
          "feedbackLabel": null,
          "origin": "v1.0新增",
          "implementationNote": "无数值结果。"
        }
      ]
    },
    "dunhuang": {
      "topicWeights": {
        "路况/风沙/水源": 30,
        "商品/商队": 25,
        "语言与商旅生活": 20,
        "特殊剧情线索": 15,
        "纯风味": 10
      },
      "lines": [
        {
          "id": "DH_TALK_01",
          "topic": "路况/风沙/水源",
          "text": "一支刚进城的驼队说，西去路上近两日风沙偏重。",
          "resultType": "ROUTE_OBSERVATION",
          "feedbackLabel": "市面所见",
          "origin": "v1.6继承",
          "implementationNote": "只在现有路况消息支持时进入候选；不直接改事件概率。"
        },
        {
          "id": "DH_TALK_02",
          "topic": "路况/风沙/水源",
          "text": "有人说前方几处水源尚可，但最好不要拖到暮时才启程。",
          "resultType": "ROUTE_OBSERVATION",
          "feedbackLabel": "市面所见",
          "origin": "v1.6继承",
          "implementationNote": "路线提示。"
        },
        {
          "id": "DH_TALK_03",
          "topic": "路况/风沙/水源",
          "text": "一名驼夫抱怨前路有一段走得比预计慢，同行都因此晚到了些。",
          "resultType": "ROUTE_OBSERVATION",
          "feedbackLabel": "市面所见",
          "origin": "v1.6继承",
          "implementationNote": "只给方向，不显示精确延误概率。"
        },
        {
          "id": "DH_TALK_04",
          "topic": "商品/商队",
          "text": "东来的商人说药材收得很快，几家货栈都在问还有没有新货。",
          "resultType": "MARKET_OBSERVATION",
          "feedbackLabel": "市面所见",
          "origin": "v1.6继承",
          "implementationNote": "只有有对应有效市场观察时进入候选。"
        },
        {
          "id": "DH_TALK_05",
          "topic": "商品/商队",
          "text": "有人等的一支染料商队还没进城，堂里已经有人开始猜测缘由。",
          "resultType": "MARKET_OBSERVATION",
          "feedbackLabel": "市面所见",
          "origin": "v1.6继承",
          "implementationNote": "商业消息候选。"
        },
        {
          "id": "DH_TALK_06",
          "topic": "商品/商队",
          "text": "几包河西毛织刚卸下来，就有人围过去问价。",
          "resultType": "MARKET_RUMOR",
          "feedbackLabel": "市面所见",
          "origin": "v1.6继承",
          "implementationNote": "市场传闻，不直接改价。"
        },
        {
          "id": "DH_TALK_07",
          "topic": "语言与商旅生活",
          "text": "两名商人言语不通，只得指着货物反复比画。旁边有人拿出一本记着汉、藏词语的小册。",
          "resultType": "LORE_FLAG",
          "feedbackLabel": "见闻",
          "origin": "v1.6继承",
          "implementationNote": "优先写“汉藏商旅词册”待解锁 flag；已记录则只给普通见闻。"
        },
        {
          "id": "DH_TALK_08",
          "topic": "语言与商旅生活",
          "text": "一个旅人反复学着别人说“住宿”“食物”和“价钱”的词，惹得同桌人发笑。",
          "resultType": "LORE",
          "feedbackLabel": "见闻",
          "origin": "v1.6继承",
          "implementationNote": "无直接经济效果。"
        },
        {
          "id": "DH_TALK_09",
          "topic": "特殊剧情线索",
          "text": "有人在找一支失约的商队，据说他们原本应该昨日到达。",
          "resultType": "CLUE",
          "feedbackLabel": "线索",
          "origin": "v1.6继承",
          "implementationNote": "剧情 flag。"
        },
        {
          "id": "DH_TALK_10",
          "topic": "特殊剧情线索",
          "text": "一名商人问谁愿意替他向西带一句口信，却迟迟没有开价。",
          "resultType": "CLUE",
          "feedbackLabel": "线索",
          "origin": "v1.6继承",
          "implementationNote": "特殊委托前置，不直接弹委托。"
        },
        {
          "id": "DH_TALK_11",
          "topic": "纯风味",
          "text": "风声一阵紧一阵松，堂里的人都习惯性地看了眼门外。",
          "resultType": "FLAVOR",
          "feedbackLabel": null,
          "origin": "v1.6继承",
          "implementationNote": "无数值变化。"
        },
        {
          "id": "DH_TALK_12",
          "topic": "纯风味",
          "text": "几个驼夫比谁鞋里的沙更多，最后干脆把靴子倒过来一起笑。",
          "resultType": "FLAVOR",
          "feedbackLabel": null,
          "origin": "v1.6继承",
          "implementationNote": "无数值变化。"
        },
        {
          "id": "DH_TALK_13",
          "topic": "路况/风沙/水源",
          "text": "刚进城的驼夫说，前路有些地方能找到水并不等于适合久停，商队往往只让牲口喘一阵便继续走。",
          "resultType": "LORE",
          "feedbackLabel": "见闻",
          "origin": "v1.0新增",
          "implementationNote": "路线生活知识，不直接修改补给。"
        },
        {
          "id": "DH_TALK_14",
          "topic": "商品/商队",
          "text": "一个货栈伙计说，东西两边来的货常常一前一后错开，昨日还堆满门口的东西，过两日也许就难见了。",
          "resultType": "LORE",
          "feedbackLabel": "见闻",
          "origin": "v1.0新增",
          "implementationNote": "强化动态市场感，不直接改库存。"
        },
        {
          "id": "DH_TALK_15",
          "topic": "语言与商旅生活",
          "text": "一桌人为了一个货名争了许久，最后干脆把东西拿到桌上，指着实物才终于说清楚。",
          "resultType": "LORE",
          "feedbackLabel": "见闻",
          "origin": "v1.0新增",
          "implementationNote": "无直接经济效果。"
        },
        {
          "id": "DH_TALK_16",
          "topic": "语言与商旅生活",
          "text": "一个从西面来的商人说，他这一路最怕的不是走得慢，而是到了该歇的时候还找不到合适的地方停队。",
          "resultType": "LORE",
          "feedbackLabel": "见闻",
          "origin": "v1.0新增",
          "implementationNote": "商旅生活见闻。"
        },
        {
          "id": "DH_TALK_17",
          "topic": "路况/风沙/水源",
          "text": "一个刚从西路回来的旅人被几个人围着问前程，他最后只挑了一件最要紧的事说。",
          "resultType": "DYNAMIC_ROUTE",
          "feedbackLabel": "市面所见",
          "origin": "v1.0新增",
          "implementationNote": "随后展示当前敦煌→下一段有效路况消息全文；无有效消息则不进入候选。"
        },
        {
          "id": "DH_TALK_18",
          "topic": "语言与商旅生活",
          "text": "客舍里有人说起经过石窟附近时见到的供养人与商旅图像，旁边几个跑惯长路的人都说看着格外亲切。",
          "resultType": "LORE_FLAG",
          "feedbackLabel": "见闻",
          "origin": "v1.0新增",
          "implementationNote": "可写敦煌商旅图/相关待解锁 flag；前台图鉴仍 LOCKED。"
        },
        {
          "id": "DH_TALK_19",
          "topic": "特殊剧情线索",
          "text": "一名驼夫说，有人正在打听一支没有按约到达的队伍，只知道他们最后一次被看见时还在往西走。",
          "resultType": "CLUE",
          "feedbackLabel": "线索",
          "origin": "v1.0新增",
          "implementationNote": "只写剧情前置。"
        },
        {
          "id": "DH_TALK_20",
          "topic": "纯风味",
          "text": "几个刚进门的人还没坐下就先一起拍衣服上的沙，结果堂里顿时扬起一阵灰，连伙计都忍不住咳了起来。",
          "resultType": "FLAVOR",
          "feedbackLabel": null,
          "origin": "v1.0新增",
          "implementationNote": "无数值变化。"
        }
      ]
    },
    "khotan": {
      "topicWeights": {
        "玉料/玉商": 30,
        "丝织": 20,
        "东西商队": 20,
        "佛寺绿洲/风土": 15,
        "特殊剧情线索": 10,
        "下一段路况": 5
      },
      "lines": [
        {
          "id": "YT_TALK_01",
          "topic": "玉料/玉商",
          "text": "火堆旁有人说，真正好的玉料不会时时摆在市面上，得看时候也得看关系。",
          "resultType": "MARKET_RUMOR",
          "feedbackLabel": "市面所见",
          "origin": "v1.6继承",
          "implementationNote": "只做货源氛围，不直接解锁商品。"
        },
        {
          "id": "YT_TALK_02",
          "topic": "玉料/玉商",
          "text": "一名玉商提起河中采来的料子差别很大，光看大小未必看得出价值。",
          "resultType": "LORE",
          "feedbackLabel": "见闻",
          "origin": "v1.6继承",
          "implementationNote": "于阗玉/万货志辅助见闻。"
        },
        {
          "id": "YT_TALK_03",
          "topic": "玉料/玉商",
          "text": "有人说这几日问玉的人不少，但好料仍然不多。",
          "resultType": "MARKET_OBSERVATION",
          "feedbackLabel": "市面所见",
          "origin": "v1.6继承",
          "implementationNote": "只有有对应有效市场观察时进入候选。"
        },
        {
          "id": "YT_TALK_04",
          "topic": "丝织",
          "text": "邻桌商人摸着一匹本地丝料，说这里的丝织不能只拿长安货来比较。",
          "resultType": "LORE",
          "feedbackLabel": "见闻",
          "origin": "v1.6继承",
          "implementationNote": "于阗丝织见闻。"
        },
        {
          "id": "YT_TALK_05",
          "topic": "丝织",
          "text": "有人准备把一批丝料往东带，却仍在盘算一路的本钱与货位。",
          "resultType": "MARKET_RUMOR",
          "feedbackLabel": "市面所见",
          "origin": "v1.6继承",
          "implementationNote": "市场/经营传闻。"
        },
        {
          "id": "YT_TALK_06",
          "topic": "东西商队",
          "text": "一支东去商队清晨就要出发，同行正四处问有没有人顺路。",
          "resultType": "ROUTE_OBSERVATION",
          "feedbackLabel": "市面所见",
          "origin": "v1.6继承",
          "implementationNote": "可作为路线/委托候选信息，但本条不直接生成委托。"
        },
        {
          "id": "YT_TALK_07",
          "topic": "东西商队",
          "text": "刚到的旅人说，东去路上驼队不少，消息传得比货物还快。",
          "resultType": "ROUTE_OBSERVATION",
          "feedbackLabel": "市面所见",
          "origin": "v1.6继承",
          "implementationNote": "普通路线消息。"
        },
        {
          "id": "YT_TALK_08",
          "topic": "佛寺绿洲/风土",
          "text": "一名旅人说起城外水渠、桑园与佛寺相连的绿洲景象。",
          "resultType": "LORE_FLAG",
          "feedbackLabel": "见闻",
          "origin": "v1.6继承",
          "implementationNote": "可写佛寺绿洲相关待解锁 flag。"
        },
        {
          "id": "YT_TALK_09",
          "topic": "佛寺绿洲/风土",
          "text": "有人提起途中在寺外补水歇脚，才真正觉得离开了漫长的沙地。",
          "resultType": "LORE_FLAG",
          "feedbackLabel": "见闻",
          "origin": "v1.6继承",
          "implementationNote": "只记录见闻/flag。"
        },
        {
          "id": "YT_TALK_10",
          "topic": "特殊剧情线索",
          "text": "一名玉商似乎在等某个常往长安的人，见你靠近却先停了话头。",
          "resultType": "CLUE",
          "feedbackLabel": "线索",
          "origin": "v1.6继承",
          "implementationNote": "特殊剧情 flag。"
        },
        {
          "id": "YT_TALK_11",
          "topic": "特殊剧情线索",
          "text": "有人说一批本该东运的货还压在手里，正在找可信的同行。",
          "resultType": "CLUE",
          "feedbackLabel": "线索",
          "origin": "v1.6继承",
          "implementationNote": "特殊委托前置。"
        },
        {
          "id": "YT_TALK_12",
          "topic": "下一段路况",
          "text": "西来的旅人说近几日风势尚可，但出绿洲后仍要尽早找好歇脚处。",
          "resultType": "ROUTE_OBSERVATION",
          "feedbackLabel": "市面所见",
          "origin": "v1.6继承",
          "implementationNote": "下一段路况消息；只告知，不直接改概率。"
        },
        {
          "id": "YT_TALK_13",
          "topic": "玉料/玉商",
          "text": "一个玉商说，外行最容易先问一块料有多大，真正做久了的人反而先问它从哪里来、里面有什么。",
          "resultType": "LORE",
          "feedbackLabel": "见闻",
          "origin": "v1.0新增",
          "implementationNote": "无直接经济效果。"
        },
        {
          "id": "YT_TALK_14",
          "topic": "玉料/玉商",
          "text": "几名商人围着一包玉料议价，谈到最后最大的那块反倒没有最先成交。",
          "resultType": "LORE",
          "feedbackLabel": "见闻",
          "origin": "v1.0新增",
          "implementationNote": "强化“大不等于一定更值钱”。"
        },
        {
          "id": "YT_TALK_15",
          "topic": "丝织",
          "text": "一个织工模样的人说，本地养蚕织出的丝料与东来的货各有自己的用处，不能只看是不是出自长安。",
          "resultType": "LORE",
          "feedbackLabel": "见闻",
          "origin": "v1.0新增",
          "implementationNote": "于阗本地丝织文化见闻。"
        },
        {
          "id": "YT_TALK_16",
          "topic": "东西商队",
          "text": "东去的商人正在重新分配驼背上的货位，一件值钱的小货与一大包普通货，让他们争论了许久。",
          "resultType": "LORE",
          "feedbackLabel": "见闻",
          "origin": "v1.0新增",
          "implementationNote": "呼应货位经营，不给数值。"
        },
        {
          "id": "YT_TALK_17",
          "topic": "佛寺绿洲/风土",
          "text": "一名远来的旅人说，走过很长一段沙地后，第一次看见水渠、桑树和寺院连在一起时，才真正知道已经靠近有人烟的地方。",
          "resultType": "LORE_FLAG",
          "feedbackLabel": "见闻",
          "origin": "v1.0新增",
          "implementationNote": "可写佛寺绿洲相关 flag，前台图鉴继续 LOCKED。"
        },
        {
          "id": "YT_TALK_18",
          "topic": "下一段路况",
          "text": "一个刚从东面回来的商旅被问起前路，只说最近最值得留意的是一件事。",
          "resultType": "DYNAMIC_ROUTE",
          "feedbackLabel": "市面所见",
          "origin": "v1.0新增",
          "implementationNote": "随后展示当前于阗返程有效路况消息全文；无有效消息则本条不进入候选。"
        },
        {
          "id": "YT_TALK_19",
          "topic": "特殊剧情线索",
          "text": "火堆旁有人提到，一名玉商手里还有几块没有拿到市面上的料，只肯见常年往来东西两地的人。",
          "resultType": "CLUE",
          "feedbackLabel": "线索",
          "origin": "v1.0新增",
          "implementationNote": "不解锁于阗玉/精制玉器，不绕过商誉与供货关系。"
        },
        {
          "id": "YT_TALK_20",
          "topic": "玉料/玉商",
          "text": "有人把一块玉料递给同伴看了半天，等旁边的人也想伸手时，他立刻又用布包了回去，引得一桌人都笑了。",
          "resultType": "FLAVOR",
          "feedbackLabel": null,
          "origin": "v1.0新增",
          "implementationNote": "无数值变化。"
        }
      ]
    }
  },
  "storyNodes": [
    {
      "id": "CA_INN_CHAIN_01",
      "city": "长安",
      "chain": "《第一次西行的人》",
      "trigger": "完成首次敦煌到达后；长安晨/昼听闲谈",
      "displayText": "客舍里一个准备第一次西行的年轻行商反复问别人：敦煌究竟要走多久、什么货更适合压在驼背上。玩家已经走过这段路，因此听起来格外熟悉。",
      "backendResult": "记录 flag；无奖励",
      "playerFeedback": "经历｜这段交谈被你记了下来。"
    },
    {
      "id": "CA_INN_CHAIN_02",
      "city": "长安",
      "chain": "《第一次西行的人》",
      "trigger": "下一次完成敦煌→长安返程后，再次在长安客舍听闲谈",
      "displayText": "上次那个行商已经回来了。他承认自己第一趟押错了货，也第一次明白“能卖”不等于“值得带”。",
      "backendResult": "获得1条普通市面所见；剧情 step+1",
      "playerFeedback": "市面所见｜✓ 已记入"
    },
    {
      "id": "CA_INN_CHAIN_03",
      "city": "长安",
      "chain": "《第一次西行的人》",
      "trigger": "再完成至少1次西行；长安客舍",
      "displayText": "年轻行商这次不再追问“带什么最赚”，而是先打听路况、货位和沿途价格。周围人也开始愿意认真听他说话。",
      "backendResult": "可写入1条经营型见闻；不加商誉",
      "playerFeedback": "见闻｜✓ 已记录"
    },
    {
      "id": "CA_INN_CHAIN_04",
      "city": "长安",
      "chain": "《第一次西行的人》",
      "trigger": "玩家累计完成2次完整往返；长安客舍",
      "displayText": "他认出玩家，主动把刚听到的一条河西商业消息告诉你：“上回是我问你，这回也该还你一条消息了。”",
      "backendResult": "保证获得1条长安/敦煌相关市面所见；链完成",
      "playerFeedback": "市面所见｜✓ 已记入；必须直接展示实际消息全文"
    },
    {
      "id": "DH_INN_CHAIN_01",
      "city": "敦煌",
      "chain": "《词册边上的生意》",
      "trigger": "首次在敦煌触发语言交流类闲谈",
      "displayText": "两名商人因语言不通反复比画货物与住宿。一旁有人拿出记着汉、藏词语的小册帮忙。",
      "backendResult": "检查“汉藏商旅词册”待解锁 flag；剧情 flag",
      "playerFeedback": "见闻｜✓ 已记录"
    },
    {
      "id": "DH_INN_CHAIN_02",
      "city": "敦煌",
      "chain": "《词册边上的生意》",
      "trigger": "至少经过1个世界日后，再到敦煌客舍",
      "displayText": "上次那名旅商已经会说几个常用词，讨价还价虽然生硬，却不再完全依赖手势。",
      "backendResult": "丝路见闻；无直接经济效果",
      "playerFeedback": "见闻｜✓ 已记录"
    },
    {
      "id": "DH_INN_CHAIN_03",
      "city": "敦煌",
      "chain": "《词册边上的生意》",
      "trigger": "再一次不同商期或不同到访触发",
      "displayText": "这回换成另一个新来的商人听不懂话；曾经需要别人帮忙的旅商反过来替他指着词册解释价钱和住宿。",
      "backendResult": "记录“交流延续” flag；可提供普通剧情线索",
      "playerFeedback": "经历｜这段交谈被你记了下来。"
    },
    {
      "id": "DH_INN_CHAIN_04",
      "city": "敦煌",
      "chain": "《词册边上的生意》",
      "trigger": "链3完成后，后续敦煌晨/昼闲谈",
      "displayText": "熟悉的旅商记得你曾在旁听过这些争论，临走前告诉你一条刚从西面听来的商队消息。",
      "backendResult": "保证获得1条下一段路况或商队市面所见；链完成",
      "playerFeedback": "市面所见｜✓ 已记入；必须直接展示实际消息全文"
    },
    {
      "id": "YT_INN_CHAIN_01",
      "city": "于阗",
      "chain": "《火堆边的玉商》",
      "trigger": "首次在于阗触发玉料类闲谈",
      "displayText": "火堆旁，一名玉商把几块大小不同的料摆在布上。他说，大块未必更值钱，真正要看质地、色泽与里面的问题。",
      "backendResult": "于阗玉相关见闻 flag；不解锁商品",
      "playerFeedback": "见闻｜✓ 已记录"
    },
    {
      "id": "YT_INN_CHAIN_02",
      "city": "于阗",
      "chain": "《火堆边的玉商》",
      "trigger": "后续再次到访于阗客舍",
      "displayText": "你又见到那个玉商。这一次有人只挑最大的一块，他却把更小的一块单独收起，不肯轻易报价。",
      "backendResult": "强化“稀有货源不一定公开陈列”的世界观；无数值奖励",
      "playerFeedback": "经历｜这段交谈被你记了下来。"
    },
    {
      "id": "YT_INN_CHAIN_03",
      "city": "于阗",
      "chain": "《火堆边的玉商》",
      "trigger": "玩家至少完成一次于阗→长安返程后，再回于阗",
      "displayText": "玉商问起东边市场对玉料的看法。你听见旁人把长安的价钱、路上的风险和货位成本一起拿来算账。",
      "backendResult": "获得1条于阗/长安商业观察；剧情 step+1",
      "playerFeedback": "市面所见｜✓ 已记入；若有实际观察则直接展示全文"
    },
    {
      "id": "YT_INN_CHAIN_04",
      "city": "于阗",
      "chain": "《火堆边的玉商》",
      "trigger": "商誉达到相应货源节点时；于阗客舍或供应商事件前",
      "displayText": "玉商认出你已经不是第一次往返。他只说：“有些货不摆在外头。”随后结束谈话。",
      "backendResult": "只设置 supplierStoryClue；实际于阗玉/精制玉器解锁仍由商誉与供应商系统决定；链完成",
      "playerFeedback": "线索｜✓ 已留意"
    }
  ],
  "ambientLines": {
    "changan": [
      "堂中坐着几个刚从河西回来的商人，脚边还堆着未拆的货包。",
      "门外人声不断，脚夫与驼队从街口来来往往。",
      "有人把新买来的纸张摊在桌上，正和同行商量西去的价钱。",
      "一桌旅商说着不同口音，话题却绕不开货价与路程。",
      "客舍伙计忙着添水，门边又进来一队准备出城的商旅。",
      "几名脚夫正在核对货包，似乎有人准备趁晨光启程。",
      "堂角有人低声谈起西市近来的买卖，旁边几个人都竖起耳朵。",
      "城里的喧闹隔着门板仍听得清楚，客舍里却尽是赶路人的疲态。"
    ],
    "dunhuang": [
      "门边堆着刚卸下的货包，表面的沙尘还没有完全掸净。",
      "一阵风从门缝里卷进细沙，伙计熟练地拿布压住桌上的纸片。",
      "堂中混着几种不同口音，商人们时不时用手势补上说不清的话。",
      "有人刚从西面回来，水囊和靴子上还带着一路的尘土。",
      "几名驼夫围在一起商量明日的路线，桌面上画着粗略的方向。",
      "客舍里不时有人问起井水、风势和下一处能歇脚的地方。",
      "新到的商队正在清点货包，几个人争着向他们打听前路。",
      "门外驼铃响了一阵，又有一支商队慢慢进城。"
    ],
    "khotan": [
      "客舍外能看到绿洲的树影，远处的沙地在日光下发白。",
      "堂里有人把几块玉料包好又打开，反复比较成色与重量。",
      "几名织工模样的人从门外经过，手里抱着卷好的丝料。",
      "水渠边的湿气让空气比一路沙地里柔和许多。",
      "一个玉商把布包压在膝上，始终没有让旁人随便碰里面的东西。",
      "东来的商队正在歇脚，有人问起回长安还要走多久。",
      "远处隐约传来寺院的声响，堂里说话的人也短暂安静了一会儿。",
      "客舍外的桑树随风轻动，几名旅人正商量明晨再向东走。"
    ]
  },
  "campEvents": [
    {
      "id": "CAMP_01",
      "title": "借火同宿",
      "city": null,
      "weight": 12,
      "effect": "observation",
      "text": "你在一支商队的火堆旁借了个位置。闲谈间，有人提起了近来的市面消息。"
    },
    {
      "id": "CAMP_02",
      "title": "商旅分食",
      "city": null,
      "weight": 10,
      "effect": "provisionsGain",
      "text": "邻近商旅分来一些耐放的干粮。天亮清点时，补给多出了一日份。"
    },
    {
      "id": "CAMP_03",
      "title": "拾得散钱",
      "city": null,
      "weight": 8,
      "effect": "cashGain",
      "text": "清晨收拾草席时，你在尘土里发现几枚无人认领的散钱。"
    },
    {
      "id": "CAMP_04",
      "title": "夜半驼铃",
      "city": null,
      "weight": 14,
      "effect": "flavor",
      "text": "半夜驼铃断断续续响了几回。你醒了又睡，所幸一夜无事。"
    },
    {
      "id": "CAMP_05",
      "title": "旅人问路",
      "city": null,
      "weight": 10,
      "effect": "routeObservation",
      "text": "一个赶夜路的旅人来问方向，临走前也留下了几句沿途见闻。"
    },
    {
      "id": "CAMP_06",
      "title": "野犬翻囊",
      "city": null,
      "weight": 10,
      "effect": "provisionsLoss",
      "text": "夜里野犬在行囊附近翻动。赶走它们后，你发现少了一日补给。"
    },
    {
      "id": "CAMP_07",
      "title": "晨露湿粮",
      "city": null,
      "weight": 8,
      "effect": "provisionsLoss",
      "text": "清晨露气很重，一小包干粮受了潮，只得丢掉。"
    },
    {
      "id": "CAMP_08",
      "title": "星下无眠",
      "city": null,
      "weight": 8,
      "effect": "flavor",
      "text": "城外灯火渐熄，你望着驼队与星光熬过一夜。没有发生什么大事。"
    },
    {
      "id": "CAMP_09",
      "title": "西市夜话",
      "city": "changan",
      "weight": 10,
      "effect": "observation",
      "text": "同宿商旅谈起西市最近某类货物、外来商队或贵家采买",
      "sourceMechanicalText": "写入1条市面所见；不直接改价"
    },
    {
      "id": "CAMP_10",
      "title": "城门候晓",
      "city": "changan",
      "weight": 10,
      "effect": "clue",
      "text": "城门外同候天明的商人、脚夫、驼队闲谈往来见闻",
      "sourceMechanicalText": "风味/普通剧情线索"
    },
    {
      "id": "CAMP_11",
      "title": "汉藏词语",
      "city": "dunhuang",
      "weight": 10,
      "effect": "phrasebook",
      "text": "商旅之间因语言不通互相比画货物、住宿与买卖词语",
      "sourceMechanicalText": "优先记录“汉藏商旅词册”待解锁flag；已记录则转普通见闻"
    },
    {
      "id": "CAMP_12",
      "title": "沙州夜风",
      "city": "dunhuang",
      "weight": 10,
      "effect": "routeObservation",
      "text": "夜风里有人谈起前路风沙、井水或来往商队",
      "sourceMechanicalText": "获得1条下一段路况消息；仅告知，不直接改概率"
    },
    {
      "id": "CAMP_13",
      "title": "玉商火堆",
      "city": "khotan",
      "weight": 10,
      "effect": "rumor",
      "text": "同宿玉商谈论玉料、河中采玉、东去报价或商队去向",
      "sourceMechanicalText": "获得于阗货物传闻/普通线索"
    },
    {
      "id": "CAMP_14",
      "title": "佛寺晚钟",
      "city": "khotan",
      "weight": 10,
      "effect": "lore",
      "text": "夜色中的绿洲、桑园与佛寺声响成为一段旅途见闻",
      "sourceMechanicalText": "丝路见闻/剧情flag；无直接经济效果"
    }
  ],
  "source": {}
};
 function freeze(value){ if(value && typeof value === "object" && !Object.isFrozen(value)){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
 root.SilkData = Object.freeze({...root.SilkData, inn: freeze(data)});
})(globalThis);
