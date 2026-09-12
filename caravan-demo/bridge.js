// Main-thread client of the engine worker (engine/worker.js). Same JSON contract as the P1 server (/api/state, /api/action).
export const bridge = (() => {
  const worker = new Worker('engine/worker.js?v=' + window.__BUILD, { type: 'module' });
  const pending = new Map(); let seq = 0; const listeners = new Set();
  let readyResolve, readyReject; const ready = new Promise((a, b) => { readyResolve = a; readyReject = b; });
  worker.onerror = e => { for (const l of listeners) l({ type: 'fatal', error: e.message || 'worker error' }); readyReject(new Error(e.message || 'worker error')); };
  worker.onmessage = e => {
    const m = e.data;
    if (m.type === 'progress') { for (const l of listeners) l(m); return; }
    if (m.type === 'ready') { for (const l of listeners) l(m); readyResolve(m); return; }
    if (m.type === 'fatal') { for (const l of listeners) l(m); readyReject(new Error(m.error)); return; }
    const p = pending.get(m.id); if (!p) return; pending.delete(m.id);
    if (m.error) p.reject(new Error(m.error)); else p.resolve(m.json);
  };
  const call = (op, extra = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); worker.postMessage({ id, op, ...extra }); });
  return {
    ready, onStatus: fn => listeners.add(fn),
    async state() { await ready; return JSON.parse(await call('state')); },
    async action(payload) { await ready; const r = JSON.parse(await call('action', { payload })); if (!r.ok) throw new Error(r.error); return r.data; },
    async reset() { await ready; return JSON.parse(await call('reset')); },
    async parity(indices) { await ready; return JSON.parse(await call('parity', { indices })); },
    async advance(seconds) { await ready; return JSON.parse(await call('advance', { seconds })); },   // test/debug clock hook
    async worst() { await ready; return JSON.parse(await call('worst')); }   // test hook: a NOT-PASS layout for the current board
  };
})();
