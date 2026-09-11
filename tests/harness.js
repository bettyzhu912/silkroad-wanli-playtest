'use strict';
// Headless loader for the engine (no DOM / IndexedDB / UI modules). Mirrors index.html script order.
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const ORDER = ['assets.js', 'data.js', 'inn-data.js', 'commission-data.js', 'help-data.js', 'model.js', 'time.js', 'reputation.js', 'store.js', 'inventory.js', 'pricing.js', 'market.js', 'finance.js', 'merchant.js', 'minigames.js', 'tavern.js', 'events.js', 'inn.js', 'commissions.js', 'stories.js', 'observations.js', 'trip.js', 'time-risk.js', 'newspapers.js', 'tutorial.js', 'journey-controller.js'];
function load() {
  const ctx = { console, structuredClone, setTimeout, clearTimeout, Math, JSON };
  ctx.globalThis = ctx; ctx.crypto = require('crypto').webcrypto;
  vm.createContext(ctx);
  for (const f of ORDER) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  return ctx;
}
// Minimal store-like driver: clone before each command, discard on DomainError, validate after success.
function driver(S, seed = 7, mode = 'explore') {
  const env = pr => ({ meta: { ...S.core.versions, generation: 0, revision: 0 }, progress: pr });
  let n = 0;
  const d = {
    p: S.core.initialProgress(mode, seed),
    run(type, payload = {}) {
      n++;
      const draft = structuredClone(d.p);
      let result = S.commands.run(draft, { type, payload }, S.core.context('t-' + n)) || { modal: false };
      if (result.modal !== false) { result = { ...result, id: 'r-' + n }; draft.presentation.activeResult = structuredClone(result); }
      S.core.validate(env(draft));
      d.p = draft; return result;
    },
    tryRun(type, payload) { try { return { ok: true, result: d.run(type, payload) }; } catch (e) { return { ok: false, code: e.code, message: e.message, domain: e instanceof S.util.DomainError, error: e }; } },
    ack() { const ar = d.p.presentation.activeResult; if (ar) d.run('result.ack', { resultId: ar.id }); },
    resolveEvent(choiceId) { const ev = d.p.eventSession; if (ev && ev.status === 'AWAITING_CHOICE') { const def = S.events.definitions[ev.eventId]; const ch = choiceId ? def.choices.find(c => c.choiceId === choiceId) : def.choices.find(c => S.events.choiceAllowed(d.p, c.condition)); d.run('EVENT_CHOOSE', { eventSessionId: ev.id, choiceId: ch.choiceId }); d.ack(); } },
    toDusk() { while (S.time.phase(d.p) !== 2) { d.run('inn.wait', { ticks: 1 }); d.ack(); d.resolveEvent(); d.ack(); } },
    overnight(prefer) { d.toDusk(); const s = S.inn.snapshot(d.p); const type = prefer && s['can' + prefer[0].toUpperCase() + prefer.slice(1)] ? 'inn.' + prefer : s.canHome ? 'inn.home' : s.canRestOutside ? 'inn.restOutside' : s.canCamp ? 'inn.camp' : 'inn.stay'; const r = d.run(type); d.ack(); d.resolveEvent(); d.ack(); return r; },
    quietRoute(days = 40) { d.p.events = d.p.events || S.events.initial(); for (let x = S.time.day(d.p); x < S.time.day(d.p) + days; x++) d.p.events.mainDays[x] = 'suppressed'; d.p.inventory.provisions = Math.max(d.p.inventory.provisions, 20); },
    quietCity(days = 40) { d.p.events = d.p.events || S.events.initial(); d.p.events.cityRollDays = d.p.events.cityRollDays || {}; for (let x = S.time.day(d.p); x < S.time.day(d.p) + days; x++) for (const c of ['changan', 'dunhuang', 'khotan']) d.p.events.cityRollDays[c + ':' + x] = { key: c + ':' + x, city: c, day: x, trigger: false, suppressed: true }; },
    journeyToArrival() { let guard = 0; while (d.p.world.route && guard++ < 300) { const r = d.run('trip.journey'); d.ack(); if (r.kind === 'eventOpened') d.resolveEvent(); d.ack(); } },
    envelope() { return env(d.p); }
  };
  return d;
}
module.exports = { load, driver, ORDER };
