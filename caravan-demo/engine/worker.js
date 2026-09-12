// Module web worker hosting the JS engine port. Same message contract the page used with the Python bridge:
// state / action / reset / advance (test clock) / worst (test) / parity (test). Nothing here contains game rules.
import { Game, fingerprint, worstLayout } from './game.js';
let offset = 0; const clock = () => performance.now() / 1000 + offset; let game = new Game(clock);
const json = x => JSON.stringify(x);
self.onmessage = e => {
  const m = e.data; if (!m || !m.id) return;
  try {
    if (m.op === 'state') self.postMessage({ id: m.id, json: json(game.snapshot()) });
    else if (m.op === 'action') { try { self.postMessage({ id: m.id, json: json({ ok: true, data: game.action(m.payload) }) }); } catch (err) { self.postMessage({ id: m.id, json: json({ ok: false, error: String(err.message || err) }) }); } }
    else if (m.op === 'reset') { offset = 0; game = new Game(clock); self.postMessage({ id: m.id, json: json(game.snapshot()) }); }
    else if (m.op === 'advance') { offset += Number(m.seconds) || 0; self.postMessage({ id: m.id, json: json(game.snapshot()) }); }
    else if (m.op === 'worst') self.postMessage({ id: m.id, json: json(worstLayout(game.session)) });
    else if (m.op === 'parity') self.postMessage({ id: m.id, json: json(fingerprint(m.indices)) });
    else self.postMessage({ id: m.id, error: 'unknown op' });
  } catch (err) { self.postMessage({ id: m.id, error: String(err && err.message || err) }); }
};
self.postMessage({ type: 'ready', engine: 'js-port', python: 'n/a' });
