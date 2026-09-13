# B7 Time-of-Day · Runtime Integration Validation Prototype v0.1

独立验证原型，**未接入主游戏**（不连 world-time、不接 hotspot / HUD、不改 `advanceTime`）：`tod-prototype/index.html`（GitHub Pages：`/silkroad-wanli-playtest/tod-prototype/`）。主游戏正式包 / 发布构建不包含本目录（`tests/tools/build-xhs.js`、`build-release.js` 已排除）。

## 内容
| 路径 | 作用 |
|---|---|
| `tod-runtime.js` | runtime：WebGL 单 pass 合成 SKY → CITY_GROUND → TITLE_OVERLAY，算子 = `tod-grade-v0.2.1`（GLSL 与 handoff `reference/page_template_v1.html` 相同，与 `reference/tod_pipeline.py` 逐像素等价）；edge protect 四次 grade、global unify；状态切换按 `config.transition`（smoothstep，全部数值与颜色线性插值，含 edgeProtect）；`fitSlack` / `cityArt` 与主游戏 `shell.js` 逐字相同 |
| `tod-debug.js` | debug controller：城市 × Morning / Noon / Dusk × instant / transition，图层开关，protect mask 叠显，母版 / approved 预览擦除线对比，区域测量，对母版逐像素 diff；`window.B7TodDebug` 供验证脚本调用 |
| `config/` | 三城 **approved config 原文件**（逐字节未改）+ `manifest.json`（城市 → config / 图层 / 派生 / 预览路径，含 SHA-256） |
| `assets/<city>/` | 三城 runtime layers 原 PNG（`B7_city_<city>_runtime_v01`，未修改）+ `derived/*_sky_blur3_v01.png`（softness 用的 alpha 归一化高斯模糊，由 handoff 参考实现 `make_blur` 生成） |
| `reference/previews/` | 三城 approved 三态预览（只用于页内擦除线对比与验证脚本比对；runtime 截图不来自这里） |
| `../tests/browser/tod-prototype-run.js` | 验证脚本：容器 = 主游戏 fitSlack 边界、Noon 保真、九态 vs approved 预览、过渡采样、无 console error |

## 容器（与未来 B7 接入一致）
`.scene` 全视口 → `.scene-world` 由 `fitSlack(width, height, {w:720, h:1600, slackTop:320})` 定位（主游戏 `shell.js` 的规则）→ `<canvas class="city-background" width=720 height=1600>` 使用主游戏 `.city-background` 的同一 CSS（inset 0、100%、`object-fit: contain`）。接入时只需把 `<img class="city-background">` 换成这块 canvas，hotspot 的百分比坐标不变。
