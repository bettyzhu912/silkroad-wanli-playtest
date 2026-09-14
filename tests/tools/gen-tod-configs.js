'use strict';
// Regenerates tod-configs.js verbatim from the three approved tod-config-v1 JSON files (tod-prototype/config/). Usage: node tests/tools/gen-tod-configs.js
const fs = require('fs'), path = require('path'); const root = path.join(__dirname, '..', '..');
const cfgs = {"khotan":"B7_khotan_tod_config_v1.json","changan":"B7_changan_tod_config_v1.json","dunhuang":"B7_dunhuang_tod_config_v1.1.json"};
let out = "/* B7 Time-of-Day approved configs (tod-config-v1) — generated verbatim from tod-prototype/config/*.json by tests/tools/gen-tod-configs.js; do not edit.\n   于阗 v1 / 长安 v1 / 敦煌 v1.1, exactly as delivered in B7_TOD_handoff_v1.2_core.zip (tests/tod-config.test.js checks equality with the JSON files). */\n" + "(function(S){'use strict';S.todConfigs=Object.freeze({\n";
const parts = []; for (const [c, f] of Object.entries(cfgs)) { const j = JSON.parse(fs.readFileSync(path.join(root, 'tod-prototype', 'config', f), 'utf8')); if (j.city !== c) throw new Error('city mismatch ' + c); parts.push(JSON.stringify(c) + ':' + JSON.stringify(j)); }
out += parts.join(',\n') + '\n});})(globalThis.Silk=globalThis.Silk||{});\n';
fs.writeFileSync(path.join(root, 'tod-configs.js'), out); console.log('tod-configs.js written', out.length, 'bytes');
