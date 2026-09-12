#!/usr/bin/env python3
"""Native (CPython) regression for the deployed standalone build:
 1. P0 automated tests on the byte-identical vendor copy (expected 117/117);
 2. the P1 adapter tests run against the browser adapter p1_game.Game (17 fake-clock tests; the HTTP-cookie test targets the
    removed HTTP layer and is replaced by the worker-bridge browser test) and against the original server.py (18, needs Python 3.10+);
 3. the native parity fingerprint (indices 0 / 200 / 400) that the browser build must reproduce exactly.
"""
import sys, json, subprocess, unittest, hashlib, pathlib, time, os
ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.dont_write_bytecode = True
out = {'python': sys.version.split()[0]}
# 1. P0
(ROOT / 'py/vendor/p0/reports').mkdir(exist_ok=True)
p0 = subprocess.run([sys.executable, '-B', str(ROOT / 'py/vendor/p0/tests/test_p0.py')], capture_output=True, text=True, cwd=str(ROOT / 'py/vendor/p0'))
if p0.returncode not in (0, 1): print(p0.stdout[-800:], p0.stderr[-800:])
res = json.loads((ROOT / 'py/vendor/p0/reports/automated_test_results.json').read_text())
out['p0'] = {'passed': res['passed'], 'executed': res['executed'], 'failed': res['failed'], 'notRun': res['notRun'], 'status': res['status']}
# vendor hashes vs frozen manifest
manifest = json.loads((ROOT / 'py/vendor/p0/reference/manifest.json').read_text())
out['vendorHashes'] = {}
for row in manifest['files']:
    p = ROOT / 'py/vendor/p0' / row['path']
    if p.exists() and not row['path'].startswith('reports/'): out['vendorHashes'][row['path']] = hashlib.sha256(p.read_bytes()).hexdigest() == row['sha256']
# 2. P1 adapter tests against p1_game.Game
sys.path[:0] = [str(ROOT / 'py'), str(ROOT / 'py/vendor/p0/src'), str(ROOT / 'py/vendor/p0/tests'), str(ROOT / 'tests/baseline')]
import p1_game, types
shim = types.ModuleType('server'); shim.Game = p1_game.Game; sys.modules['server'] = shim
import test_p1
test_p1.ROOT = ROOT / 'py'   # the adapter tests locate vendor/p0 relative to the package root
suite = unittest.TestSuite()
for name in unittest.defaultTestLoader.getTestCaseNames(test_p1.P1Tests):
    if name == 'test_http_cookie_keeps_session': continue
    suite.addTest(test_p1.P1Tests(name))
r = unittest.TextTestRunner(verbosity=1).run(suite)
out['p1AdapterOnBrowserAdapter'] = {'executed': r.testsRun, 'failures': [str(t) for t, _ in r.failures + r.errors], 'skipped': ['test_http_cookie_keeps_session (HTTP layer removed; covered by browser bridge smoke)']}
# 3. parity fingerprint
import parity_probe
t0 = time.time(); fp = parity_probe.fingerprint([0, 200, 400]); out['parityNativeSeconds'] = round(time.time() - t0, 2)
(ROOT / 'tests/parity_native.json').write_text(json.dumps(fp, ensure_ascii=False, sort_keys=True, indent=1))
out['parityFingerprintSha256'] = hashlib.sha256(json.dumps(fp, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
(ROOT / 'tests/native_results.json').write_text(json.dumps(out, ensure_ascii=False, indent=1))
print(json.dumps(out, ensure_ascii=False, indent=1))
ok = out['p0']['failed'] == 0 and out['p0']['passed'] == 117 and not out['p1AdapterOnBrowserAdapter']['failures'] and all(out['vendorHashes'].values())
sys.exit(0 if ok else 1)
