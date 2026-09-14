'use strict';
// GLOBAL_AUDIO_SYSTEM_v0.1 — trigger map + settings schema acceptance (Node, no DOM). Run: node tests/audio.test.js
const fs = require('fs'), path = require('path');
const { load, driver } = require('./harness');
const ROOT = path.join(__dirname, '..');
const S = load().Silk, A = S.audio;
const results = [];
function test(id, title, fn) { try { const d = fn() || []; results.push({ id, title, pass: true, details: d }); } catch (e) { results.push({ id, title, pass: false, details: [String(e && e.stack || e)] }); } }
function assert(c, m) { if (!c) throw new Error('ASSERT: ' + m); }
test('AU-1', 'registry: one BGM + two SFX, files present in the repo (BGM master + package variant)', () => {
  const bgmName = process.env.SILK_ROOT ? 'audio_bgm_main_v01_pkg.m4a' : 'audio_bgm_main_v01.mp3';   // the XHS build ships the compact package variant and rewrites the registry
  assert(A.ASSETS.bgm_main === bgmName && A.ASSETS.ui_confirm === 'sfx_ui_confirm_v01.wav' && A.ASSETS.coin_gain === 'sfx_coin_gain_v01.wav', 'registry ' + A.ASSETS.bgm_main);
  for (const f of [...Object.values(A.ASSETS), 'audio_bgm_main_v01_pkg.m4a']) assert(fs.existsSync(path.join(ROOT, f)), 'missing ' + f);
  assert(A.SFX.length === 2, 'exactly two sfx');
  return Object.values(A.ASSETS);
});
test('AU-2', 'settings schema: defaults (quiet music 0.35), normalize clamps volumes, legacy soundEnabled=false → both off once', () => {
  const d = A.normalize(null); assert(d.musicEnabled && d.sfxEnabled && d.musicVolume === 0.35 && d.sfxVolume === 0.7, 'defaults ' + JSON.stringify(d));
  const n = A.normalize({ musicVolume: 3, sfxVolume: -1, musicEnabled: false }); assert(n.musicVolume === 1 && n.sfxVolume === 0 && n.musicEnabled === false && n.sfxEnabled === true, 'clamp ' + JSON.stringify(n));
  const l = A.normalize({ soundEnabled: false }); assert(!l.musicEnabled && !l.sfxEnabled, 'legacy off');
  const l2 = A.normalize({ soundEnabled: false, musicEnabled: true }); assert(l2.musicEnabled && l2.sfxEnabled, 'legacy ignored once new keys exist');
  const v0 = A.normalize({ musicVolume: 0, musicEnabled: true }); assert(v0.musicEnabled === true, 'volume 0 does not flip enabled');
  const env = S.core.emptyEnvelope(); assert(env.preferences.musicEnabled === true && env.preferences.musicVolume === 0.35 && env.preferences.sfxEnabled === true && env.preferences.sfxVolume === 0.7, 'empty envelope carries the audio keys');
  return ['defaults 0.35 / 0.7'];
});
test('AU-3', 'trigger map (locked): market sell commit → one coin_gain whatever the quantity, 一键出售 once; buy / provisions / enter / leave silent', () => {
  assert(A.decide('market.buy', { kind: 'marketBuy', cashDelta: -20 }, -20, false) === null, 'buy silent (pure spending)');
  assert(A.decide('market.sell', { kind: 'marketSell', quantity: 1 }, 30, false) === 'coin_gain' && A.decide('market.sell', { kind: 'marketSell', quantity: 5 }, 150, false) === 'coin_gain', 'sell once per commit');
  assert(A.decide('market.sellAll', { kind: 'marketSellAll', items: [1, 2, 3] }, 90, false) === 'coin_gain', 'sellAll once');
  assert(A.decide('market.provisions', { kind: 'provisionsBought' }, -3, false) === null, 'provisions silent');
  assert(A.decide('market.enter', { kind: 'marketEntered' }, 0, false) === null && A.decide('market.leave', { kind: 'marketSummary', cashDelta: 40 }, 0, false) === null, 'enter / leave silent');
  return ['sell / sellAll → coin_gain once; buy / provisions / leave silent'];
});
test('AU-4', 'trigger map: commission accepted → ui_confirm; delivered with copper → coin_gain only (priority), without copper → ui_confirm; pickup / abandon silent', () => {
  assert(A.decide('commission.accept', { kind: 'commissionAccepted' }, 0, false) === 'ui_confirm', 'accept');
  assert(A.decide('commission.deliver', { kind: 'commissionDelivered' }, 45, false) === 'coin_gain', 'deliver with cash');
  assert(A.decide('commission.deliver', { kind: 'commissionDelivered' }, 0, false) === 'ui_confirm', 'deliver no cash');
  assert(A.decide('commission.pickup', { kind: 'commissionPickup' }, 0, false) === null && A.decide('commission.abandon', {}, 0, false) === null, 'pickup / abandon silent');
  return ['priority coin_gain > ui_confirm'];
});
test('AU-5', 'trigger map: newspaper purchased → ui_confirm once (already owned / unavailable silent); random event resolved → coin_gain if copper else ui_confirm', () => {
  assert(A.decide('newspaper.purchase', { kind: 'newspaper', alreadyOwned: false }, -2, false) === 'ui_confirm', 'new report');
  assert(A.decide('newspaper.purchase', { kind: 'newspaper', alreadyOwned: true }, 0, false) === null && A.decide('newspaper.purchase', { kind: 'newspaperUnavailable' }, 0, false) === null, 'owned / unavailable silent');
  assert(A.decide('EVENT_CHOOSE', { kind: 'event' }, 25, false) === 'coin_gain' && A.decide('EVENT_CHOOSE', { kind: 'event' }, -10, false) === 'ui_confirm' && A.decide('EVENT_RM_RESOLVE', { kind: 'event' }, 0, false) === 'ui_confirm', 'event');
  assert(A.decide('EVENT_STORY_PROTECTION_SELECT', {}, 0, false) === null, 'protection select silent');
  return ['newspaper / event'];
});
test('AU-6', 'trigger map: livelihood settlements with copper → coin_gain (FINISH / START / ABORT silent); replay never sounds; ordinary commands silent', () => {
  for (const t of ['CARAVAN_SETTLE', 'PATTERN_SETTLE', 'WEAVING_SETTLE', 'TAVERN_ACK', 'story.act']) assert(A.decide(t, {}, 12, false) === 'coin_gain', t);
  for (const t of ['CARAVAN_SETTLE', 'PATTERN_SETTLE']) assert(A.decide(t, {}, 0, false) === null, t + ' zero wage silent');
  for (const t of ['PATTERN_START', 'PATTERN_FINISH', 'PATTERN_ABORT', 'WEAVING_START', 'CARAVAN_FINISH', 'inn.stay', 'inn.wait', 'result.ack', 'notice.dismiss', 'settings.update', 'trip.begin', 'finance.borrow', 'finance.deposit', 'game.start']) assert(A.decide(t, {}, t === 'finance.borrow' ? 100 : 0, false) === null, t + ' silent');
  assert(A.decide('inn.stay', { kind: 'innFeedback' }, 8, false) === 'coin_gain', 'night event income → coin_gain');
  assert(A.decide('market.buy', { kind: 'marketBuy' }, -20, true) === null && A.decide('commission.accept', {}, 0, true) === null, 'replayed silent');
  return ['settlements / silence / replay'];
});
test('AU-7', 'onCommitted uses the real cash change of the envelope; store accepts the four keys and rejects out-of-range values', () => {
  const before = { progress: { cash: 100 } }, after = { progress: { cash: 130 } };
  assert(A.onCommitted({ type: 'PATTERN_SETTLE' }, {}, before, after, false) === 'coin_gain', 'settle with +30');
  assert(A.onCommitted({ type: 'PATTERN_SETTLE' }, {}, before, before, false) === null, 'no change silent');
  assert(A.onCommitted({ type: 'commission.accept' }, { kind: 'commissionAccepted' }, { progress: null }, { progress: null }, false) === 'ui_confirm', 'no progress → delta 0');
  const c = A.status().counts; assert(c.coin_gain >= 1 && c.ui_confirm >= 1, 'counts recorded without DOM: ' + JSON.stringify(c));
  const d = driver(S, 3);   // the reducer refuses settings.update outside the envelope transaction (store-only command)
  const r = d.tryRun('settings.update', { key: 'musicVolume', value: 0.5 }); assert(!r.ok && r.code === 'ENVELOPE_COMMAND', 'settings live in the envelope');
  return ['cash delta from envelope'];
});
const passed = results.filter(r => r.pass).length;
for (const r of results) console.log((r.pass ? 'PASS ' : 'FAIL ') + r.id + ' ' + r.title + (r.pass ? '  ' + r.details.join('; ') : '\n  ' + r.details.join('\n  ')));
console.log(`audio acceptance: ${passed}/${results.length}`);
process.exit(passed === results.length ? 0 : 1);
