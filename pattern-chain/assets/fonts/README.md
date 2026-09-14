# 字体（standalone 自托管子集）

| 文件 | 来源 | 授权 | 用途 |
|---|---|---|---|
| `zw-brush-mashanzheng.woff2` | Ma Shan Zheng（马善政毛笔楷书，Google Fonts / github.com/googlefonts/mashanzheng） | SIL OFL 1.1（`OFL-MaShanZheng.txt`） | 标题、纹样名牌、按钮的题签 / 书法感 |
| `zw-serif-notoserifsc-500.woff2` / `-700.woff2` | Noto Serif SC 可变字体实例化 wght 500 / 700 | SIL OFL 1.1（`OFL-NotoSerifSC.txt`） | 正文、说明、数据区（避免 Android 退化为无衬线） |

子集只包含本页面**实际使用**的字形（用户决定 2026-09-14：subset > fallback > 整套字体；完整 OFL 字体文件不进入任何包）：
- `zw-brush-mashanzheng.woff2`（26.0 KB，73 字形）：只含题签 / 按钮 / 名牌位置出现的字（`glyphs-brush.txt`：缀纹成章、玩法说明、帮工完成、六种纹样名、万能图样、尚无纹样、按钮文案、数字）；
- `zw-serif-notoserifsc-500.woff2`（57.6 KB，373 字形）：正文全部中文字 + 数字 + ASCII 标点（`glyphs.txt`，由 standalone 与主游戏宿主的页面文本自动提取）；
- `zw-serif-notoserifsc-700.woff2`（18.0 KB，141 字形）：只含以粗体渲染的文本（副标题、HUD 数字、结算数据行；`glyphs-serif-700.txt`）。
未收录字形按 CSS 字体栈回退到系统字体（如 Ma Shan Zheng 无 `›`，该字符由 `.chev` 指定 serif 栈）。生成：fonttools 4.60 `pyftsubset --text-file --flavor=woff2 --no-hinting --layout-features=kern`（原始完整字体只在生成环境，不入库、不入包）。
