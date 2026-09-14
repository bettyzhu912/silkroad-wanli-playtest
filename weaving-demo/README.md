# 于阗织坊 · 公开试玩演示（未接入主游戏）

- 公开链接（无需登录）：https://bettyzhu912.github.io/silkroad-wanli-playtest/weaving-demo/
- 这是由 `weaving-demo/build-demo.sh` 生成的自包含静态页面副本（该脚本与最初的接入分支一起保存在归档标签 `archive/yutian-weaving-c303471`，分支本身已于 2026-09-14 删除）；`demo-host.js` / `demo.css` 只是演示壳。
- 注意：本文件夹是 2026-09-12 的**独立试玩快照**，与主游戏当前实现已不同步。于阗织坊后来在 R32 按营生宿主模式重做并接入主线（`weaving-engine.js` + `weaving.js` + `weaving-ui.js`，由 `tests/tools/sync-livelihood-minigames.js` 从 `weaving-v5/` 同步），当前口径以仓库根目录的那一套为准。
- 主游戏本体（本仓库根目录）未引用这个文件夹；发布工具（tests/tools/build-*.js）会跳过它。
