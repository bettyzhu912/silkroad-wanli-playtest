'use strict';
// The runtime copy of the three approved TOD configs (tod-configs.js) must equal the approved JSON files byte-for-byte in content
// (deep equality of the parsed objects) and carry the approved versions / pipeline. Usage: node tests/tod-config.test.js
const fs = require('fs'), path = require('path'), vm = require('vm'); const root = path.join(__dirname, '..');
const sandbox = { globalThis: {} }; sandbox.globalThis = sandbox; vm.runInNewContext(fs.readFileSync(path.join(root, 'tod-configs.js'), 'utf8'), sandbox);
const S = sandbox.Silk; let pass = 0, fail = 0; const check = (n, ok, d) => { if (ok) pass++; else fail++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d ? '  ' + d : '')); };
const expect = { khotan: ['B7_khotan_tod_config_v1.json', 'v1'], changan: ['B7_changan_tod_config_v1.json', 'v1'], dunhuang: ['B7_dunhuang_tod_config_v1.1.json', 'v1.1'] };
for (const [city, [file, version]] of Object.entries(expect)) { const j = JSON.parse(fs.readFileSync(path.join(root, 'tod-prototype', 'config', file), 'utf8')); const r = S.todConfigs[city];
  check(city + ': runtime config deep-equals approved ' + file, JSON.stringify(r) === JSON.stringify(j));
  check(city + ': schema tod-config-v1, pipeline tod-grade-v0.2.1, version ' + version + ', status approved', r.schema === 'tod-config-v1' && r.pipelineVersion === 'tod-grade-v0.2.1' && r.version === version && /approved/.test(r.status), r.status);
  check(city + ': three states with sky / cityGround / titleOverlay / globalUnify / edgeProtect + transition', ['morning', 'noon', 'dusk'].every(s => ['sky', 'cityGround', 'titleOverlay', 'globalUnify', 'edgeProtect'].every(k => r.states[s][k])) && typeof r.transition.durationSec === 'number'); }
console.log('tod-config: ' + pass + '/' + (pass + fail) + ' passed'); process.exit(fail ? 1 : 0);
