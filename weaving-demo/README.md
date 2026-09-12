# 于阗织坊 · 单独试玩演示（未接入主游戏）

- 试玩链接（claude.ai artifact，私有，可从页面分享）：https://claude.ai/code/artifact/1a794f7f-23e9-4be5-bdd9-eef1c8f567a6
- 本地方式：`sh weaving-demo/build-demo.sh <输出目录>` 生成自包含文件夹，用浏览器打开其中的 `index.html`。
- 演示里跑的是仓库根目录的同一套 `weaving.js` / `weaving-ui.js` / `weaving.css`（将来接入主游戏用的文件）；`demo-host.js` / `demo.css` 只是替代主游戏面板、命令、存档与客舍流程的演示壳，不会随主游戏打包。
- 演示壳行为：起始于于阗第2日晨、200 钱；「营生」→ 入口卡 → 织坊；结算后演示条显示「天色已暮…」并提供「歇息至次日晨」；刷新页面保留演示进度；正式帮工进行中刷新视为放弃（与主游戏规则一致）；「重置演示」清空。
- 接入主游戏的实现（分支 `yutian-weaving`，b93bacd）已完成并通过测试，待确认后合入 `main` 并重新出包。
