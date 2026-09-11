'use strict';
// Tiny Chrome DevTools Protocol client (no dependencies; uses Node's global WebSocket) for real-browser evidence runs.
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
function getJSON(url) { return new Promise((res, rej) => http.get(url, r => { let b = ''; r.on('data', d => b += d); r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { rej(e); } }); }).on('error', rej)); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function launch({ port = 9333, width = 1280, height = 900, mobile = false, profile } = {}) {
  const dir = profile || fs.mkdtempSync(path.join(os.tmpdir(), 'silk-cdp-'));
  const args = ['--headless=new', '--remote-debugging-port=' + port, '--user-data-dir=' + dir, '--window-size=' + width + ',' + height, '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--hide-scrollbars', 'about:blank'];
  const proc = spawn(CHROME, args, { stdio: ['ignore', 'ignore', 'pipe'] }); let err = ''; proc.stderr.on('data', d => { err += d; });
  let targets; for (let i = 0; i < 100; i++) { await sleep(150); try { targets = await getJSON('http://127.0.0.1:' + port + '/json/list'); if (targets?.length) break; } catch (_) { } }
  if (!targets?.length) { proc.kill(); throw new Error('chrome did not start: ' + err.slice(-500)); }
  const page = targets.find(t => t.type === 'page') || targets[0];
  const client = await connect(page.webSocketDebuggerUrl);
  client.proc = proc; client.profile = dir;
  await client.send('Page.enable'); await client.send('Runtime.enable'); await client.send('Network.enable'); await client.send('Log.enable');
  if (mobile) await client.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: true, screenWidth: width, screenHeight: height });
  if (mobile) await client.send('Emulation.setTouchEmulationEnabled', { enabled: true });
  return client;
}
function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url); let id = 0; const pending = new Map(); const listeners = [];
    const client = {
      ws, console: [], network: [], logs: [],
      send(method, params = {}) { return new Promise((res, rej) => { const mid = ++id; pending.set(mid, { res, rej, method }); ws.send(JSON.stringify({ id: mid, method, params })); }); },
      on(fn) { listeners.push(fn); },
      async eval(expression, { awaitPromise = true } = {}) { const r = await client.send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true }); if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)); return r.result.value; },
      async screenshot(file, { fullPage = false } = {}) { const params = { format: 'png', captureBeyondViewport: fullPage }; if (fullPage) { const m = await client.send('Page.getLayoutMetrics'); const w = Math.ceil(m.cssContentSize.width), h = Math.ceil(m.cssContentSize.height); params.clip = { x: 0, y: 0, width: w, height: h, scale: 1 }; } const r = await client.send('Page.captureScreenshot', params); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, Buffer.from(r.data, 'base64')); return file; },
      async navigate(url) { const loaded = new Promise(res => { const h = m => { if (m.method === 'Page.loadEventFired') { res(); } }; listeners.push(h); }); await client.send('Page.navigate', { url }); await loaded; await sleep(300); },
      async close() { try { await client.send('Browser.close'); } catch (_) { } try { ws.close(); } catch (_) { } try { client.proc?.kill(); } catch (_) { } }
    };
    ws.onopen = () => resolve(client); ws.onerror = e => reject(new Error('ws error ' + (e.message || '')));
    ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const { res, rej, method } = pending.get(m.id); pending.delete(m.id); if (m.error) rej(new Error(method + ': ' + m.error.message)); else res(m.result); return; }
      if (m.method === 'Runtime.consoleAPICalled') client.console.push({ type: m.params.type, text: m.params.args.map(a => a.value ?? a.description ?? '').join(' ') });
      if (m.method === 'Runtime.exceptionThrown') client.console.push({ type: 'exception', text: m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text });
      if (m.method === 'Log.entryAdded') client.logs.push({ level: m.params.entry.level, source: m.params.entry.source, text: m.params.entry.text, url: m.params.entry.url });
      if (m.method === 'Network.responseReceived') client.network.push({ url: m.params.response.url, status: m.params.response.status, type: m.params.type });
      if (m.method === 'Network.loadingFailed') client.network.push({ url: m.params.requestId, status: 'FAILED', error: m.params.errorText, type: m.params.type });
      for (const l of listeners) l(m); };
  });
}
function startServer(port, root) { const child = spawn(process.execPath, [path.join(__dirname, 'static-server.js'), String(port), root], { stdio: ['ignore', 'pipe', 'pipe'] }); let out = ''; child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { out += d; }); return { child, get log() { return out; }, stop() { child.kill(); } }; }
module.exports = { launch, startServer, sleep };
if (require.main === module) (async () => { const srv = startServer(8138, path.join(__dirname, '..', '..')); await sleep(400); const c = await launch({ port: 9333 }); await c.navigate('http://127.0.0.1:8138/'); await sleep(800); console.log('title', await c.eval('document.title')); await c.screenshot(path.join(os.tmpdir(), 'silk-home.png')); console.log('network', c.network.length, 'non200', c.network.filter(n => n.status !== 200).length, 'console', c.console.length); await c.close(); srv.stop(); })().catch(e => { console.error(e); process.exit(1); });
