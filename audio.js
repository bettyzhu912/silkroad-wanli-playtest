(function (S) {
  'use strict';
  // GLOBAL_AUDIO_SYSTEM_v0.1 — the one audio authority of the game (AudioManager). Pages and gameplay never play sound themselves:
  // the shell mounts the manager once (after the persisted settings are loaded, so no flash of audio), every render syncs the
  // settings + session state into it, and app.js reports every committed command so the trigger map below decides whether a
  // semantic event deserves one of the two v0.1 sound effects. One looping <audio> element carries the BGM for the whole session
  // (panels / HUD windows / market never recreate it; pause keeps the position so re-enabling resumes where it stopped).
  const ASSETS = Object.freeze({ bgm_main: 'audio_bgm_main_v01.mp3', ui_confirm: 'sfx_ui_confirm_v01.wav', coin_gain: 'sfx_coin_gain_v01.wav' });
  const SFX = Object.freeze(['ui_confirm', 'coin_gain']);
  const DEFAULTS = Object.freeze({ musicEnabled: true, musicVolume: 0.35, sfxEnabled: true, sfxVolume: 0.7 });   // BGM deliberately quiet
  const KEYS = Object.freeze(Object.keys(DEFAULTS));
  const clamp01 = v => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : null);
  // Persisted schema (store preferences): musicEnabled / musicVolume / sfxEnabled / sfxVolume. The retired single `soundEnabled` switch is
  // honoured once: a save that had turned it off and has no new keys yet starts with both music and sfx off.
  function normalize(prefs) {
    const p = prefs || {}, out = {};
    const legacyOff = p.soundEnabled === false && typeof p.musicEnabled !== 'boolean' && typeof p.sfxEnabled !== 'boolean';
    out.musicEnabled = typeof p.musicEnabled === 'boolean' ? p.musicEnabled : !legacyOff && DEFAULTS.musicEnabled;
    out.sfxEnabled = typeof p.sfxEnabled === 'boolean' ? p.sfxEnabled : !legacyOff && DEFAULTS.sfxEnabled;
    out.musicVolume = clamp01(p.musicVolume) === null ? DEFAULTS.musicVolume : clamp01(p.musicVolume);
    out.sfxVolume = clamp01(p.sfxVolume) === null ? DEFAULTS.sfxVolume : clamp01(p.sfxVolume);
    return out;
  }
  // ---- trigger map (v0.1, locked by the user 2026-09-14): coin_gain means copper INCOME / a reward arriving only — market sells (one per successful sell
  // transaction commit, whatever the quantity; 一键出售 once), commission completion, random / night events, livelihood settlements, 商路奇缘 and other
  // explicit rewards; buying / provisions / any pure spending and leaving the market never sound. One sound per committed command, coin_gain wins over ui_confirm.
  const COIN_ON_GAIN = /^(market\.sell|market\.sellAll|commission\.deliver|EVENT_CHOOSE|EVENT_RM_RESOLVE|CARAVAN_SETTLE|PATTERN_SETTLE|WEAVING_SETTLE|story\.act)$|^(inn\.|TAVERN_)/;
  function decide(type, result, cashDelta, replayed) {
    if (replayed) return null;   // an idempotent replay of an already committed command never sounds again
    const r = result || {}, delta = Number.isFinite(cashDelta) ? cashDelta : 0;
    if (COIN_ON_GAIN.test(type) && delta > 0) return 'coin_gain';   // copper income arrived (sell commit / 一键出售 / settlement / reward); buys, provisions, market.leave, loans stay silent
    if (type === 'commission.accept') return 'ui_confirm';                                                                                                  // accepted (the command succeeded, not the click)
    if (type === 'commission.deliver') return r.kind === 'commissionDelivered' ? 'ui_confirm' : null;                                                       // completed without copper
    if (type === 'newspaper.purchase') return r.kind === 'newspaper' && !r.alreadyOwned ? 'ui_confirm' : null;                                              // a new report acquired
    if (type === 'EVENT_CHOOSE' || type === 'EVENT_RM_RESOLVE') return r.kind === 'event' ? 'ui_confirm' : null;                                            // event resolved without copper income
    return null;
  }
  const state = { prefs: normalize(null), inGame: false, unlocked: false, mounted: false, bgm: null, sfx: {}, log: [], counts: { ui_confirm: 0, coin_gain: 0 }, bgmPlays: 0, elements: 0, lastError: null, previewPending: false };
  const hasDOM = () => typeof document !== 'undefined' && typeof Audio !== 'undefined';
  function src(key) { return (S.assets && S.assets[ASSETS[key]]) || ASSETS[key]; }
  // R39 — the Xiaohongshu package ships without audio FILES: the container's type table (zip-artifact-spec §2) accepts no audio extension at all
  // (.m4a / .mp3 / .wav / .ogg are rejected by upload validation) and its CSP forbids `data:` / `blob:` media for <audio> (§3 and the §6 checklist:
  // "音视频、字体仅用包内文件"), so no encoding of the file can reach the container either. That build declares `Silk.audioUnavailable` and the
  // manager then creates no elements — every other part of v0.1 is untouched: the settings block, persistence, the trigger map and the counters all
  // behave exactly as before, there is simply nothing to play and nothing to 404. Pages / desktop / source builds are unaffected.
  const audioAvailable = () => S.audioUnavailable !== true;
  function mount(prefs) {
    state.prefs = normalize(prefs);
    if (state.mounted || !hasDOM()) return;
    state.mounted = true;
    if (!audioAvailable()) return;   // no packaged media: stay silent, keep every setting and decision path alive
    const bgm = new Audio(); bgm.src = src('bgm_main'); bgm.loop = true; bgm.preload = 'auto'; bgm.volume = state.prefs.musicVolume; bgm.setAttribute('data-audio', 'bgm_main'); bgm.addEventListener('play', () => { state.bgmPlays++; });
    state.bgm = bgm; state.elements++;
    for (const name of SFX) { const a = new Audio(); a.src = src(name); a.preload = 'auto'; a.setAttribute('data-audio', name); state.sfx[name] = a; state.elements++; }
    const unlock = () => { if (state.unlocked) return; state.unlocked = true; applyMusic(); };
    for (const type of ['pointerdown', 'keydown', 'touchend']) document.addEventListener(type, unlock, { capture: true, passive: true });
    applyMusic();
  }
  function shouldPlayMusic() { return state.mounted && state.prefs.musicEnabled; }   // one session-level BGM: it may start on the home screen (after the first real gesture) and simply continues into the game
  function applyMusic() {
    const bgm = state.bgm; if (!bgm) return;
    bgm.volume = state.prefs.musicVolume;
    if (shouldPlayMusic()) { if (bgm.paused && state.unlocked) { const p = bgm.play(); if (p && p.catch) p.catch(e => { state.lastError = String(e && e.name || e); if (e && e.name === 'NotAllowedError') state.unlocked = false; }); } }   // autoplay refused → wait for the next real gesture, no prompt
    else if (!bgm.paused) bgm.pause();   // pause keeps currentTime → re-enabling resumes from here
  }
  // called on every shell render: settings + whether a game session is on (informational; the BGM session spans home screen and game)
  function sync(envelope) {
    if (!envelope) return;
    const next = normalize(envelope.preferences); const changed = KEYS.some(k => next[k] !== state.prefs[k]);
    state.prefs = next; state.inGame = Boolean(envelope.progress);
    if (changed || state.mounted) applyMusic();
  }
  function playSfx(name) {
    if (!SFX.includes(name)) return false;
    state.counts[name]++; state.log.push({ name, at: Date.now() }); if (state.log.length > 50) state.log.shift();
    if (!state.prefs.sfxEnabled || !state.mounted) return false;
    const a = state.sfx[name]; if (!a) return false;
    try { a.pause(); a.currentTime = 0; a.volume = state.prefs.sfxVolume; const p = a.play(); if (p && p.catch) p.catch(e => { state.lastError = String(e && e.name || e); }); } catch (e) { state.lastError = String(e); return false; }
    return true;
  }
  // app.js reports every executed command: the decision uses the command, its committed result and the real cash change
  function onCommitted(command, result, before, after, replayed) {
    const cashBefore = before && before.progress ? before.progress.cash : null, cashAfter = after && after.progress ? after.progress.cash : null;
    const delta = Number.isFinite(cashBefore) && Number.isFinite(cashAfter) ? cashAfter - cashBefore : 0;
    const sfx = decide(command.type, result, delta, replayed);
    if (sfx) playSfx(sfx);
    return sfx;
  }
  // live slider changes: volume applies at once; the sfx slider previews once on release, never while dragging
  function setMusicVolume(v) { const x = clamp01(v); if (x === null) return; state.prefs.musicVolume = x; if (state.bgm) state.bgm.volume = x; }
  function setSfxVolume(v) { const x = clamp01(v); if (x === null) return; state.prefs.sfxVolume = x; }
  function setMusicEnabled(on) { state.prefs.musicEnabled = Boolean(on); applyMusic(); }
  function setSfxEnabled(on) { state.prefs.sfxEnabled = Boolean(on); }
  function preview() { return playSfx('ui_confirm'); }
  function status() { const b = state.bgm; return { prefs: { ...state.prefs }, inGame: state.inGame, unlocked: state.unlocked, mounted: state.mounted, available: audioAvailable(), elements: state.elements, bgm: b ? { paused: b.paused, currentTime: b.currentTime, loop: b.loop, volume: b.volume, src: (b.getAttribute('src') || '').split('/').pop(), readyState: b.readyState } : null, bgmPlays: state.bgmPlays, counts: { ...state.counts }, log: state.log.slice(-10), lastError: state.lastError }; }
  S.audio = { ASSETS, SFX, DEFAULTS, KEYS, normalize, decide, mount, sync, playSfx, onCommitted, setMusicVolume, setSfxVolume, setMusicEnabled, setSfxEnabled, preview, status, playBGM() { state.unlocked = true; applyMusic(); }, pauseBGM() { if (state.bgm && !state.bgm.paused) state.bgm.pause(); }, _state: state };
})(globalThis.Silk = globalThis.Silk || {});
