# 于阗织坊 · 试玩（FINAL v5.0 · 15 根版 · 360×620 modal）

独立可试玩页面，未接入主游戏：`weaving-v5/index.html`（GitHub Pages：`/silkroad-wanli-playtest/weaving-v5/`）。
主游戏的正式包 / 发布构建不包含本目录（`tests/tools/build-xhs.js`、`build-release.js` 已排除）。

## Authority（按优先级）
1. `YUTIAN_MODAL_AUTHORITY_CONFLICT_RESOLUTION_FINAL_v1.1`（README_FIRST + AUTHORITY_CONFLICT_RESOLUTION + MODAL_LAYOUT_SPEC；UI-01～UI-09）：外层容器与内部布局按 360×620 modal 重排；UI-09 是结算页的空模板底板，UI-08 只是最终效果参考。
2. 已确认的 Gameplay（`YUTIAN_WEAVING_FINAL_v5.0_15_LINES_CODEX_READY`：75 秒、15 根、三轮 × 5、工资、随机事件、试工）—— 本次 modal 迁移未改一行引擎。
3. Hotfix v1.0 PATCH A（结算层级：主状态「顺利收工」、合计收入最重）/ PATCH B（素白纹样描边、目标牌只由 board state 驱动）—— 继续生效；PATCH A 的「本次织成 n / 15 根 · 完成 m 轮」统计行按 v1.1 明确删除。

## 页面结构
- 模拟主游戏层（`.host`）：于阗城景（`art/modal/host_khotan_bg.webp`，主游戏 `B7_city_khotan_bg_v01` 的副本）+ 半透明遮罩，只是 standalone 脚手架；真实接入时由主游戏场景与面板层替代。
- Modal（`.modal`）：宽 `min(92vw, 360px)`、高 620（视口更矮时才随之收缩）；顶部 52 px HUD（于阗织坊牌匾 / 计数 / 日影 / 44×44 暂停），其余为织机本体（`.stage`）。没有任何 `transform: scale()` 拟合。
- 织机本体：每个阶段显示 `art/modal/body_<phase>.webp` —— 由 FINAL v5.0 的整页画作裁出织机（x 82..782）、去掉纯装饰横向切片（平行经线、木板空白、流苏下段）后重新拼接（`tools/gen-modal-art.py` → `art/modal/LAYOUT.json` + `layout.js`）。活动部件（挂位牌、丝束、张力标尺、配重、圆环、丝线、纹样牌、急束红条）仍按画中位置叠加：画作坐标 → 合成坐标（`cx` / `cy`）→ CSS px（× k，k = 本体高度 / 1091）。四个玩法阶段合成高度相同，k 在阶段间不变；操作对象尺寸与整页版一致（k ≈ 0.52）。
- 今日收工：`art/modal/body_settle.webp` = UI-09 去掉顶部 HUD 条（y < 168）的原尺寸模板；状态「顺利收工」、基础工钱 / 常规加赏 / 急束加成 / 合计收入及数值为透明文字，印在模板空位上（`T9` 坐标）；金额全部来自 `run.wages`；无白色卡片、无统计行、无「获得手艺」；两个按钮为模板上画好的「继续留坊 / 离开织坊」加透明点击区。

## 文件
| 文件 | 作用 |
|---|---|
| `weaving-engine.js` | 纯逻辑状态机（无 DOM，可在 Node 中测试；主游戏接入时直接复用）：`createRun / tick / sortDrop / warpSet / warpSkip / weaveStart / weaveExtend / weaveRelease / knotUntie / looseRepair / pause / resume / abandon / settle / wagesFor` —— 本轮未改 |
| `weaving-ui.js` | 画面层：modal 拟合（`fit`）、坐标映射、各阶段叠加部件、指针拖拽、HUD、暂停 / 说明 / 退出确认 / 试工教学卡、UI-09 结算；对外 `YutianWeavingUI.geom() / screenOf()` 供测试映射坐标 |
| `weaving.css` | 样式：模拟层、modal、HUD、部件（art px × `--k`）、结算透明文字、卡片 |
| `art/modal/` | 运行时派生：`body_sort / warp / warp_done / weave / settle.webp`、`host_khotan_bg.webp`、`LAYOUT.json`、`layout.js` |
| `art/bg_*.jpg`、`art/src/ui09_settle_template_v1.1.png` | canonical 源图（八图裁出的整页画作 5 张；UI-09 空模板）—— 生成器输入，运行时不加载 |
| `art/*.png` | 丝束 ×10、圆环、配重、空槽、木纹补片（与 FINAL v5.0 相同） |
| `tools/gen-modal-art.py` | 由源图生成 `art/modal/`（切片表在脚本内，与 LAYOUT.json 一致） |
| `tools/stamp.py` | 给 `index.html` 的 `?v=` 打内容戳 |
| `tests/engine.test.js` | 引擎验收 11 项（`node weaving-v5/tests/engine.test.js`） |
| `tests/layout.test.js` | 布局表一致性 21 项：layout.js == LAYOUT.json、合成图尺寸、切片不覆盖活动部件、源图 SHA（`node weaving-v5/tests/layout.test.js`） |
| `../tests/browser/weaving-v5-modal-qa.js` | 六种手机宽度真实输入 QA（modal 尺寸 / 无缩放 / 无滚动 / 部件在窗内 / 触控目标 / UI-09 结算） |
| `../tests/browser/weaving-v5-regression.js` | 20 局真实输入回归（PATCH A / B，modal 版坐标） |

## 主游戏接入面（待确认后接入）
引擎无 DOM、可注入 seed；结算结果 `run.wages = { base, regular, urgent, total, totalCompleted, roundsCompleted }`，`run.status ∈ complete | timeout | abandoned | trial`。接入时由主游戏在「今日收工 → 离开织坊 / 继续留坊」处把 `total` 记入钱包并推进时辰；主动退出（`abandon`）为 0 工钱 0 时辰。本目录不会写入主游戏的钱包、时间或行程。Modal 本体（HUD + `.stage`）即接入主游戏面板层的窗口内容；`.host` 层在接入时移除。
