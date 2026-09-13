# 缀纹成章（DUNHUANG_PATTERN_CHAIN）· standalone 试玩 v0.1

独立可玩页面，**未接入主游戏**：`pattern-chain/index.html`（GitHub Pages：`/silkroad-wanli-playtest/pattern-chain/`）。主游戏的正式包 / 发布构建不包含本目录。

## Authority
- 玩法 / 系统：`ZHUWEN_CHENGZHANG_IMPLEMENTATION_MASTER_v1.1.md`
- 资产：`ZHUWEN_CHENGZHANG_ASSET_MANIFEST_v1.1.md`
- READY / SETTLEMENT 页与玩家文案：`ZHUWEN_CHENGZHANG_UI_PAGE_SUPPLEMENT_v1.0`
- 未冻结项的临时处理：`DEV_DECISION_RECORD.md`（发布仓 `ZHUWEN_CHENGZHANG_MINIGAME/STANDALONE_v0.1/`）

## 文件
| 文件 | 作用 |
|---|---|
| `pattern-chain-engine.js` | 纯逻辑引擎（无 DOM；Node 可测；主游戏接入时直接复用）：`createRun / pathStart / pathExtend / pathRelease / resolveDone / tick / pause / resume / abort / findPath / hasValidPath / representativeOf`；`run.result` 为 `MiniGameResult` 结构 |
| `pattern-chain-ui.js` | 四页 UI（READY / HOW_TO_PLAY / GAMEPLAY / SETTLEMENT）、Pointer 输入映射、消除 / 重力 / 补充动画、结算页与调试入口 |
| `pattern-chain-reveal.js` | 动态成章（canvas）：按 structureType 的遮罩 / 路径 / 镜像 / 旋转过程，终态落到真实 fullAsset |
| `pattern-chain-host-mock.js` | mock host：世界时间（晨 / 午 / 暮）、现金、正式记录；仅 standalone 脚手架 |
| `pattern-chain.css` | 360 × 620 modal 基准样式（`--u` 缩放） |
| `assets/runtime/` | 15 个运行时派生副本（WebP）+ `RUNTIME_DERIVATIVES.json`（映射到 canonical 原图与 SHA-256） |
| `assets/fonts/` | OFL 字体子集（Ma Shan Zheng 题签 / Noto Serif SC 正文），见目录内 README |
| `assets/mock/` | 主游戏敦煌城市背景（仅作 modal 后方 mock 背景） |
| `tests/engine.test.js` | 引擎测试：`node pattern-chain/tests/engine.test.js` |
| `../tests/browser/pattern-chain-run.js` | 浏览器真实输入测试：`node tests/browser/pattern-chain-run.js full --out <dir>` |

## 调试参数（不改变正式随机池规则）
- `?seed=N`：固定随机种子（每次开局 seed+1）
- `?phase=0|1|2`：mock 世界时段 晨 / 午 / 暮
- `?reveal=LOTUS|DRAGON|THREE_HARES|POMEGRANATE_SCROLL|PEARL_CHAIN|DIAMOND_PATTERN[&mode=FORMAL]`：直接打开结算页调试夹具（页面标注「调试夹具 · 非真实对局」）
- 页面右上「模拟 host」：查看 / 设置世界时间、查看最近结果 JSON

## mock 边界
standalone 不连接真实经济、存档、旅途统计、B7 入口或主游戏路由。正式模式「所得」显示「待结算」（cash mapping 未冻结）；`advanceTime(1)` 只作用于 mock 世界时间。
