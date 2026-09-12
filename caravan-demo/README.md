# 《驼队装货》 Standalone public playtest build

**Status:** `STANDALONE_PUBLIC_PLAYTEST` · `READY_FOR_ITERATIVE_PLAYTEST` · `NOT_INTEGRATED_WITH_MAIN_GAME`

- Public URL: **https://bettyzhu912.github.io/silkroad-wanli-playtest/caravan-demo/** (static GitHub Pages, no login, no CDN, no API).
- Baseline: `DUNHUANG_CARAVAN_LOADING_P1_PLAYABLE_v0.1.zip` (P1 adapter `server.py` + `web/`) over the verified P0 (`vendor/p0`, SHA-256 identical to the P0 manifest).
- This folder is a self-contained static site inside the playtest repository. The main game (repository root) does not reference it and the release/xhs build tools skip it.

## Why a JavaScript engine, and how it is proven equal
No Python-capable public host is available without creating a hosting account, and the requirement is a link that opens instantly on any device. Following the execution instruction's fallback rule, the P0/P1 Python remains the **authority** (kept unchanged under `py/`, still run natively by the tests), and `engine/` is a line-by-line port whose output is proven identical by three parity tests:

| Parity test | What is compared | Result |
| --- | --- | --- |
| `tests/parity_evidence.js` | JS `one_run(i)` for **all 500 stress runs (1500 accepted boards)** vs the saved Python evidence `accepted_boards.jsonl` (SHA-256 `2deea753…`, the P0 report's file): cargo, reference solution, every metric, warnings, telemetry, reject history, attempt traces, penalty breakdown | 500/500 identical |
| `tests/parity_scores.js` vs `tests/parity_scores.py` | every feasible layout of 15 boards (227,160 layouts) scored by both `evaluateLayout` implementations, hashed | identical hash |
| `tests/parity_session.js` vs `py/parity_probe.py` | scripted FORMAL sessions (reference layout, NOT PASS rework, settlement, mock outer state) for runs 0/200/400 | identical |

Plus `tests/adapter.test.js`: the 17 P1 fake-clock adapter tests ported to the JS `Game` (17/17), and `tests/run_native_tests.py`: P0 117/117 + the same 17 adapter tests on the Python deployment copy + the native fingerprint.

The test sampler (`stress.one_run`) is reproduced bit-exactly, including CPython's `random.Random(seed).sample` (MT19937, `engine/pyrandom.js`), so test group 0–499 in the page is the same board set as the Python prototype.

## Layout of this folder
```
index.html app.js style.css bridge.js        P1 web client (transport swapped from HTTP to a worker message; emoji → icon images)
engine/  data.js core.js generator.js session.js stress.js pyrandom.js game.js worker.js   JS port (data generated from the frozen JSON)
py/      vendor/p0/* (unchanged P0)  p1_game.py (P1 Game, synchronous prepare)  p1_bridge.py  parity_probe.py   Python authority + native tests
assets/  camel.png  cargo/*                  temporary camel; cargo icons (see table below)
cargo-icons.js                               cargo art mapping layer (replace a path here to swap art)
tools/   stamp.py gen-data.js                cache-busting stamp; regenerate engine/data.js from the JSON
tests/   parity_*.js/.py adapter.test.js run_native_tests.py browser_smoke.js oracle/   tests + saved oracle
```

## Redeploy
1. Edit files in this folder (rules live only in `engine/` + `py/`; keep them in sync and rerun the parity tests).
2. `node tools/gen-data.js` if the authority JSON changed; `python3 tools/stamp.py` to refresh cache-busting stamps.
3. Tests: `python3.11 tests/run_native_tests.py`, `node tests/parity_evidence.js`, `python3.11 tests/parity_scores.py && node tests/parity_scores.js`, `node tests/parity_session.js`, `node tests/adapter.test.js`, `node tests/browser_smoke.js` (local) / `node tests/browser_smoke.js --url <public url> --label public`.
4. Commit and push `main`; GitHub Pages publishes within about a minute.

## Cargo icon assets
| cargoId | displayName | iconSource | file |
| --- | --- | --- | --- |
| silk | 绢帛 | MAIN_GAME_EXISTING | assets/cargo/goods_changan_juanbo_v01.png |
| paper | 纸张 | MAIN_GAME_EXISTING | assets/cargo/goods_changan_zhizhang_v01.png |
| ceramics | 陶瓷 | MAIN_GAME_EXISTING | assets/cargo/goods_changan_tang_ceramics_v01.png |
| lacquerware | 漆器 | MAIN_GAME_EXISTING | assets/cargo/goods_changan_lacquerware_v01.png |
| hexi_wool | 河西毛织 | MAIN_GAME_EXISTING | assets/cargo/goods_dunhuang_heximaozhi_v01.png |
| dried_fruit | 干果 | MAIN_GAME_EXISTING | assets/cargo/goods_dunhuang_ganguo_v01.png |
| medicinal_herbs | 药材 | MAIN_GAME_EXISTING | assets/cargo/goods_dunhuang_yaocai_v01.png |
| dye | 染料 | MAIN_GAME_EXISTING | assets/cargo/goods_dunhuang_ranliao_v01.png |
| khotan_silk | 于阗丝织 | MAIN_GAME_EXISTING | assets/cargo/goods_khotan_sizhi_v01.png |
| khotan_jade | 于阗玉 | MAIN_GAME_EXISTING | assets/cargo/goods_khotan_yutianyu_v01.png |
| fine_jade | 精制玉器 | MAIN_GAME_EXISTING | assets/cargo/goods_khotan_jingzhi_yuqi_v01.png |
| felt_shoes | 毛毡鞋 | MAIN_GAME_EXISTING | assets/cargo/goods_khotan_maozhanxue_v01.png |
| silverware | 银器 | TEMP_PLACEHOLDER | assets/cargo/placeholder_silverware_v0.svg |
| turquoise | 绿松石 | TEMP_PLACEHOLDER | assets/cargo/placeholder_turquoise_v0.svg |
| pepper | 胡椒 | TEMP_PLACEHOLDER | assets/cargo/placeholder_pepper_v0.svg |

Placeholders are hand-drawn SVGs derived from `CARGO_DATA.json` (银器: heavy durable silver ewer and bowls on a cloth; 绿松石: medium fragile/pressure-sensitive stones bedded in a padded box; 胡椒: light plain small tied sack with peppercorns). They are temporary; to replace one, drop the final icon in `assets/cargo/` and change the path in `cargo-icons.js`. Cargo data, scoring, generator, session and state flow never reference the art.

## Round-2 UI polish (2026-09-12, commit 6612e72 → build stamp 6c9fbcefbb)
Presentation-only changes agreed after the first public playtest review. No rule, value, copy of the P0/P1 texts, state flow or timing changed; `engine/` and `py/` are untouched (parity/regression evidence above still applies).
- Stage: camel + saddlebags live in a centred `.rig` that `fitRig()` scales to the window (`min(stageH−8, stageW×0.72, 330)` high), so the window no longer looks empty; the modal size is unchanged.
- Saddlebags: about 33 % of the rig width each, cinched mouth with a rope band, less of the camel covered. Loaded cargo shows image-only (no name, no card border), larger and slightly overlapping like a real load; the top item is emphasised and the selected item outlined. Unselected cargo still shows the "普通" tag like every other tag.
- Balance bar: rail 12 px / bead 18 px, bead coloured by the band it sits in, 0.45 s eased movement, clamped so it never overshoots the rail ends. `main.thin-bar` keeps the previous 9 px rail for the A/B screenshot (`tests/ab_bar.js` → `tests/results/ab/`).
- The 放入 button pops in only on the first waiting-cargo selection of a session; 44 px close target; batch/timer spacing.
- The three TEMP_PLACEHOLDER icons (银器 / 绿松石 / 胡椒) were repainted in the main-game icon style (gradients, highlights, grain). They remain temporary art with the same filenames, so the replacement path in `cargo-icons.js` is unchanged.
- The "时限 / 测试题组 / Debug" top bar stays in the playtest build and is to be removed from the formal build.

## Boundaries kept
`MAIN_GAME_MODIFIED = NO` · `B7_INTEGRATED = NO` · `REAL_WALLET_WRITES = NO` · `REAL_WORLD_TIME_WRITES = NO` · `V0.4_BALANCE_CHANGES = NONE`.
FORMAL updates only the in-memory `MockOuter`; TRIAL keeps 0 real cash / 0 time / 0 trip delta / no formal history; Abort commits nothing; Timeout keeps completed batches; Settlement exits are idempotent. No long-term save: reloading the page starts a fresh mock session (the P1 prototype's cookie session was in-memory as well). Debug is available through the top-bar checkbox. Test hooks (`advance`, `worst`, `parity`, `reset`) exist only on the worker bridge for automated tests and are never triggered by the player UI.

## Known limitations
- Temporary art (camel and three placeholder cargo icons); the twelve main-game icons are the real assets.
- Physical-device and human playtests remain NOT_RUN by this automation; desktop and mobile emulation only.
- Board preparation for a test group runs in the worker (about 0.1–0.5 s on a phone); "正在备货…" shows meanwhile.
- The B1 soft-difficulty and B3 boundary observations from P0 are intentionally untouched (playtest observations, not tuning).
