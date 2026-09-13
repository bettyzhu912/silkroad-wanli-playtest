'use strict';
// 于阗织坊 modal layout consistency: art/modal/LAYOUT.json (generator output) == art/modal/layout.js (what the page loads); every composed
// body image has the table's size; all gameplay bodies share one height (k never changes between phases); no live piece is anchored inside a
// removed decorative slice; the 定经 scale still fits its painted plaque after the slice inside it; the UI-09 template crop matches its source.
// Usage: node weaving-v5/tests/layout.test.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const checks = []; const check = (name, ok, detail) => { checks.push(ok); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  ' + String(detail).slice(0, 200) : '')); };
const json = JSON.parse(fs.readFileSync(path.join(root, 'art/modal/LAYOUT.json'), 'utf8'));
const sandbox = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(root, 'art/modal/layout.js'), 'utf8'), sandbox);
check('layout.js equals LAYOUT.json', JSON.stringify(sandbox.window.YutianWeavingLayout) === JSON.stringify(json));
function webpSize(file) { // VP8 / VP8L / VP8X headers
  const b = fs.readFileSync(file); const fourcc = b.toString('ascii', 12, 16);
  if (fourcc === 'VP8X') return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
  if (fourcc === 'VP8L') { const bits = b.readUInt32LE(21); return { w: 1 + (bits & 0x3fff), h: 1 + ((bits >> 14) & 0x3fff) }; }
  return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
}
const ART = { cols: [217, 325, 433, 541, 648], rows: [553, 646, 738, 831, 923], tagY: 395, tagH: 88, trayY: 1058, trayH: 178, scaleY: 588, scaleH: 286, weightY: 1036, weightH: 182, woodY: 1028, woodH: 198, bundleTopY: 322, bundleTopH: 164, targetY: 1013, targetH: 104, urgentY: 266, urgentH: 50, chipY: 495, warpDoneBtn: [1268, 78] };
const anchors = { sort: [[ART.tagY, ART.tagH], [ART.trayY, ART.trayH]], warp: [[ART.weightY, ART.weightH], [ART.woodY, ART.woodH]], warp_done: [ART.warpDoneBtn], weave: [[ART.bundleTopY, ART.bundleTopH], [ART.targetY, ART.targetH], [ART.urgentY, ART.urgentH], [ART.chipY, 40], ...ART.rows.map(y => [y - 31, 62])] };
const heights = new Set();
for (const [name, p] of Object.entries(json.phases)) {
  const sz = webpSize(path.join(root, p.img)); heights.add(p.h);
  const kept = p.end - json.top - p.removed.reduce((s, [a, b]) => s + (b - a), 0);
  check(`${name}: composed image ${sz.w}×${sz.h} = table ${p.w}×${p.h} = kept rows ${kept}`, sz.w === p.w && sz.h === p.h && kept === p.h && p.w === json.crop.w);
  check(`${name}: removed slices ordered, inside [top, end) and non-overlapping`, p.removed.every(([a, b], i) => a < b && a >= json.top && b <= p.end && (i === 0 || a >= p.removed[i - 1][1])), JSON.stringify(p.removed));
  const bad = (anchors[name] || []).filter(([y, h]) => p.removed.some(([a, b]) => (y > a && y < b) || (y + h > a && y + h < b) && !(name === 'warp' && y === ART.scaleY)));
  check(`${name}: no live piece anchored or ending inside a removed slice`, bad.length === 0, JSON.stringify(bad));
}
check('all gameplay bodies share one composed height (k identical in 理丝 / 定经 / 经线已齐 / 开工)', heights.size === 1, [...heights].join(','));
{ // 定经: the DOM scale (588..874) must stay inside the painted plaque (570..890) after the slice inside the plaque
  const p = json.phases.warp, cy = y => y - json.top - p.removed.reduce((s, [a, b]) => s + (y >= b ? b - a : y > a ? y - a : 0), 0);
  check(`定经 scale 588..874 → composed ${cy(ART.scaleY)}..${cy(ART.scaleY) + ART.scaleH} inside painted plaque ${cy(570)}..${cy(890)}`, cy(ART.scaleY) >= cy(570) && cy(ART.scaleY) + ART.scaleH <= cy(890));
}
{ const s = json.settle, sz = webpSize(path.join(root, s.img)); check(`settle: UI-09 crop ${sz.w}×${sz.h} = ${s.srcW}×${s.srcH - s.top} (template below its HUD strip)`, sz.w === s.w && sz.h === s.h && s.w === s.srcW && s.h === s.srcH - s.top); }
for (const [src, sha] of Object.entries(json.sources)) { const crypto = require('crypto'); const h = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, src))).digest('hex'); check(`source ${src} unchanged since generation (${sha.slice(0, 8)}…)`, h === sha); }
const failed = checks.filter(x => !x).length; console.log(`weaving modal layout: ${checks.length - failed}/${checks.length} passed`); process.exit(failed ? 1 : 0);
