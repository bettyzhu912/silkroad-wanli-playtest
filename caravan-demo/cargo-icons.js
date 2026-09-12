// Cargo art mapping layer. Game data / scoring / generator / session never depend on these files: replacing an icon
// means changing a path here (or dropping a same-named file into assets/cargo/).
export const CARGO_ICONS = {
  silk:            { file: 'assets/cargo/goods_changan_juanbo_v01.png',        source: 'MAIN_GAME_EXISTING' },
  paper:           { file: 'assets/cargo/goods_changan_zhizhang_v01.png',      source: 'MAIN_GAME_EXISTING' },
  ceramics:        { file: 'assets/cargo/goods_changan_tang_ceramics_v01.png', source: 'MAIN_GAME_EXISTING' },
  lacquerware:     { file: 'assets/cargo/goods_changan_lacquerware_v01.png',   source: 'MAIN_GAME_EXISTING' },
  hexi_wool:       { file: 'assets/cargo/goods_dunhuang_heximaozhi_v01.png',   source: 'MAIN_GAME_EXISTING' },
  dried_fruit:     { file: 'assets/cargo/goods_dunhuang_ganguo_v01.png',       source: 'MAIN_GAME_EXISTING' },
  medicinal_herbs: { file: 'assets/cargo/goods_dunhuang_yaocai_v01.png',       source: 'MAIN_GAME_EXISTING' },
  dye:             { file: 'assets/cargo/goods_dunhuang_ranliao_v01.png',      source: 'MAIN_GAME_EXISTING' },
  khotan_silk:     { file: 'assets/cargo/goods_khotan_sizhi_v01.png',          source: 'MAIN_GAME_EXISTING' },
  khotan_jade:     { file: 'assets/cargo/goods_khotan_yutianyu_v01.png',       source: 'MAIN_GAME_EXISTING' },
  fine_jade:       { file: 'assets/cargo/goods_khotan_jingzhi_yuqi_v01.png',   source: 'MAIN_GAME_EXISTING' },
  felt_shoes:      { file: 'assets/cargo/goods_khotan_maozhanxue_v01.png',     source: 'MAIN_GAME_EXISTING' },
  silverware:      { file: 'assets/cargo/placeholder_silverware_v0.svg',       source: 'TEMP_PLACEHOLDER' },
  turquoise:       { file: 'assets/cargo/placeholder_turquoise_v0.svg',        source: 'TEMP_PLACEHOLDER' },
  pepper:          { file: 'assets/cargo/placeholder_pepper_v0.svg',           source: 'TEMP_PLACEHOLDER' }
};
export const icon = kind => (CARGO_ICONS[kind] || {}).file || 'assets/cargo/placeholder_missing.svg';
