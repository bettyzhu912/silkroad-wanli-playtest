# 字体（standalone 自托管子集）

| 文件 | 来源 | 授权 | 用途 |
|---|---|---|---|
| `zw-brush-mashanzheng.woff2` | Ma Shan Zheng（马善政毛笔楷书，Google Fonts / github.com/googlefonts/mashanzheng） | SIL OFL 1.1（`OFL-MaShanZheng.txt`） | 标题、纹样名牌、按钮的题签 / 书法感 |
| `zw-serif-notoserifsc-500.woff2` / `-700.woff2` | Noto Serif SC 可变字体实例化 wght 500 / 700 | SIL OFL 1.1（`OFL-NotoSerifSC.txt`） | 正文、说明、数据区（避免 Android 退化为无衬线） |

子集只包含本页面用到的字形（`glyphs.txt`），未收录字形按 CSS 字体栈回退到系统字体。生成工具：fonttools 4.60（`varLib.instancer` + `pyftsubset`）。
