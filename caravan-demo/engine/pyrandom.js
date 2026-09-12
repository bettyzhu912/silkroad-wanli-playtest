// Bit-exact port of CPython's random.Random for the test sampler: MT19937 with init_by_array seeding from an int,
// getrandbits, _randbelow_with_getrandbits and sample() (pool branch, n <= setsize). Verified against CPython in tests/parity.js.
export class PyRandom {
  constructor(seed) { this.mt = new Uint32Array(624); this.mti = 625; this.seed(seed); }
  initGenrand(s) { const mt = this.mt; mt[0] = s >>> 0; for (let i = 1; i < 624; i++) { const prev = mt[i - 1] ^ (mt[i - 1] >>> 30); mt[i] = (Math.imul(1812433253, prev) + i) >>> 0; } this.mti = 624; }
  initByArray(key) {
    const mt = this.mt; this.initGenrand(19650218); let i = 1, j = 0; const n = key.length;
    for (let k = Math.max(624, n); k > 0; k--) { const prev = mt[i - 1] ^ (mt[i - 1] >>> 30); mt[i] = ((mt[i] ^ Math.imul(prev, 1664525)) + key[j] + j) >>> 0; i++; j++; if (i >= 624) { mt[0] = mt[623]; i = 1; } if (j >= n) j = 0; }
    for (let k = 623; k > 0; k--) { const prev = mt[i - 1] ^ (mt[i - 1] >>> 30); mt[i] = ((mt[i] ^ Math.imul(prev, 1566083941)) - i) >>> 0; i++; if (i >= 624) { mt[0] = mt[623]; i = 1; } }
    mt[0] = 0x80000000; this.mti = 624;
  }
  seed(a) { // CPython: abs(int) split into little-endian 32-bit words
    let v = BigInt(a); if (v < 0n) v = -v; const key = []; if (v === 0n) key.push(0); while (v > 0n) { key.push(Number(v & 0xffffffffn)); v >>= 32n; } this.initByArray(key);
  }
  genrandUint32() {
    const mt = this.mt; let y;
    if (this.mti >= 624) { let kk; for (kk = 0; kk < 624 - 397; kk++) { y = (mt[kk] & 0x80000000) | (mt[kk + 1] & 0x7fffffff); mt[kk] = mt[kk + 397] ^ (y >>> 1) ^ ((y & 1) ? 0x9908b0df : 0); } for (; kk < 623; kk++) { y = (mt[kk] & 0x80000000) | (mt[kk + 1] & 0x7fffffff); mt[kk] = mt[kk + (397 - 624)] ^ (y >>> 1) ^ ((y & 1) ? 0x9908b0df : 0); } y = (mt[623] & 0x80000000) | (mt[0] & 0x7fffffff); mt[623] = mt[396] ^ (y >>> 1) ^ ((y & 1) ? 0x9908b0df : 0); this.mti = 0; }
    y = mt[this.mti++]; y ^= y >>> 11; y ^= (y << 7) & 0x9d2c5680; y ^= (y << 15) & 0xefc60000; y ^= y >>> 18; return y >>> 0;
  }
  random() { const a = this.genrandUint32() >>> 5, b = this.genrandUint32() >>> 6; return (a * 67108864.0 + b) * (1.0 / 9007199254740992.0); }
  getrandbits(k) { if (k <= 0) throw new Error('k>0'); if (k <= 32) return this.genrandUint32() >>> (32 - k); throw new Error('getrandbits>32 unsupported'); }
  randbelow(n) { const k = n.toString(2).length; let r = this.getrandbits(k); while (r >= n) r = this.getrandbits(k); return r; }
  sample(population, k) {
    const n = population.length; if (k < 0 || k > n) throw new Error('sample larger than population');
    let setsize = 21; if (k > 5) setsize += Math.pow(4, Math.ceil(Math.log(k * 3) / Math.log(4)));
    if (n > setsize) throw new Error('set-based sample branch not ported');
    const pool = population.slice(), result = new Array(k);
    for (let i = 0; i < k; i++) { const j = this.randbelow(n - i); result[i] = pool[j]; pool[j] = pool[n - i - 1]; }
    return result;
  }
}
