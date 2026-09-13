# 于阗织坊 · 试玩（FINAL v5.0 · 15 根版）

独立可试玩页面，未接入主游戏：`weaving-v5/index.html`（GitHub Pages：`/silkroad-wanli-playtest/weaving-v5/`）。
主游戏的正式包 / 发布构建不包含本目录（`tests/tools/build-xhs.js`、`build-release.js` 已排除）。

## 唯一 Authority
`YUTIAN_WEAVING_FINAL_v5.0_15_LINES_CODEX_READY`（本包之前的所有于阗织坊 ZIP / UI / 逻辑 / 指令均不再使用）。

- 逻辑（75 秒、15 根、三轮 × 5、计分、随机顺序、工资、事件概率、文案状态、是否着色）：`01_GAMEPLAY_AUTHORITY/*`、`04_IMPLEMENTATION_CONFIG/*`。
- 视觉（构图、织机、市集背景、材质、丝束、5×5 圆环、目标牌、按钮风格）：`03_UI_REFERENCE_FINAL/UI-01…08`。八张图直接作为各阶段的画面底图，只有会变化的部件（挂位牌、丝束、张力标尺、圆环、丝线、纹样牌、急束红条、结算数字、HUD）叠加在画中的位置上。

## 文件
| 文件 | 作用 |
|---|---|
| `weaving-engine.js` | 纯逻辑状态机（无 DOM，可在 Node 中测试；主游戏接入时直接复用）：`createRun / tick / sortDrop / warpSet / warpSkip / weaveStart / weaveExtend / weaveRelease / knotUntie / looseRepair / pause / resume / abandon / settle / wagesFor` |
| `weaving-ui.js` | 画面层：底图 + 叠加部件、指针拖拽、HUD、暂停 / 说明 / 退出确认 / 试工教学卡、结算页 |
| `weaving.css` | 样式（art 空间 864×1536，按屏幕高度等比缩放；手机竖屏优先） |
| `art/` | 由本包八张最终图裁出的底图与部件（背景 5 张、丝束 10 张、圆环、配重、空槽、木纹补片） |
| `tests/engine.test.js` | 引擎验收（`node weaving-v5/tests/engine.test.js`） |

## 主游戏接入面（待确认后接入）
引擎无 DOM、可注入 seed；结算结果 `run.wages = { base, regular, urgent, total, totalCompleted, roundsCompleted }`，`run.status ∈ complete | timeout | abandoned | trial`。接入时由主游戏在「今日收工 → 离开织坊 / 继续留坊」处把 `total` 记入钱包并推进时辰；主动退出（`abandon`）为 0 工钱 0 时辰。本目录不会写入主游戏的钱包、时间或行程。
