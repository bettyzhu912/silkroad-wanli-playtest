/* Compatibility layer for the mini-tool container baseline (Android 8.1 Chrome / WebView 61).
   Classic script, ES2017 syntax only, loaded before every other script. Every shim is feature-detected and is a no-op on modern engines. */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : this;
  function define(target, name, value) { Object.defineProperty(target, name, { value: value, writable: true, configurable: true, enumerable: false }); }

  // globalThis (Chrome 71)
  if (typeof root.globalThis === 'undefined') { root.globalThis = root; }

  // Object.hasOwn (Chrome 93), Object.fromEntries (Chrome 73)
  if (typeof Object.hasOwn !== 'function') define(Object, 'hasOwn', function hasOwn(target, key) {
    if (target === null || target === undefined) throw new TypeError('Cannot convert undefined or null to object');
    return Object.prototype.hasOwnProperty.call(Object(target), key);
  });
  if (typeof Object.fromEntries !== 'function') define(Object, 'fromEntries', function fromEntries(entries) {
    var out = {}, list = Array.from(entries);
    for (var i = 0; i < list.length; i++) out[list[i][0]] = list[i][1];
    return out;
  });

  // Array.prototype.at / String.prototype.at (Chrome 92)
  function at(list, index) { var len = list.length, n = Math.trunc(index) || 0; if (n < 0) n += len; if (n < 0 || n >= len) return undefined; return list[n]; }
  if (typeof Array.prototype.at !== 'function') define(Array.prototype, 'at', function (index) { return at(this, index); });
  if (typeof String.prototype.at !== 'function') define(String.prototype, 'at', function (index) { return at(String(this), index); });

  // Array.prototype.flat / flatMap (Chrome 69)
  if (typeof Array.prototype.flat !== 'function') define(Array.prototype, 'flat', function flat(depth) {
    var level = depth === undefined ? 1 : Math.trunc(depth) || 0, out = [];
    (function push(list, remaining) { for (var i = 0; i < list.length; i++) { if (!(i in list)) continue; var v = list[i]; if (remaining > 0 && Array.isArray(v)) push(v, remaining - 1); else out.push(v); } })(this, level);
    return out;
  });
  if (typeof Array.prototype.flatMap !== 'function') define(Array.prototype, 'flatMap', function flatMap(fn, thisArg) {
    var out = [];
    for (var i = 0; i < this.length; i++) { if (!(i in this)) continue; var v = fn.call(thisArg, this[i], i, this); if (Array.isArray(v)) { for (var j = 0; j < v.length; j++) out.push(v[j]); } else out.push(v); }
    return out;
  });

  // queueMicrotask (Chrome 71)
  if (typeof root.queueMicrotask !== 'function') root.queueMicrotask = function queueMicrotask(callback) {
    Promise.resolve().then(callback).catch(function (error) { setTimeout(function () { throw error; }, 0); });
  };

  // structuredClone (Chrome 98): plain-data deep clone with cycle support; keeps undefined properties like the native algorithm
  if (typeof root.structuredClone !== 'function') root.structuredClone = function structuredClone(value) {
    var seen = new Map();
    function clone(v) {
      if (v === null || typeof v !== 'object') {
        if (typeof v === 'function' || typeof v === 'symbol') throw new TypeError('structuredClone: ' + typeof v + ' could not be cloned.');
        return v;
      }
      if (seen.has(v)) return seen.get(v);
      var out, i, keys;
      if (Array.isArray(v)) { out = new Array(v.length); seen.set(v, out); for (i = 0; i < v.length; i++) if (i in v) out[i] = clone(v[i]); return out; }
      if (v instanceof Date) return new Date(v.getTime());
      if (v instanceof RegExp) return new RegExp(v.source, v.flags);
      if (v instanceof Map) { out = new Map(); seen.set(v, out); v.forEach(function (val, key) { out.set(clone(key), clone(val)); }); return out; }
      if (v instanceof Set) { out = new Set(); seen.set(v, out); v.forEach(function (val) { out.add(clone(val)); }); return out; }
      if (v instanceof ArrayBuffer) return v.slice(0);
      if (ArrayBuffer.isView(v)) return new v.constructor(v);
      out = {}; seen.set(v, out);
      keys = Object.keys(v);
      for (i = 0; i < keys.length; i++) out[keys[i]] = clone(v[keys[i]]);
      return out;
    }
    return clone(value);
  };

  // Element / Document / DocumentFragment .replaceChildren (Chrome 86)
  function replaceChildren() { while (this.lastChild) this.removeChild(this.lastChild); if (arguments.length) this.append.apply(this, arguments); }
  if (typeof root.Element !== 'undefined') {
    [root.Element, root.Document, root.DocumentFragment].forEach(function (Ctor) {
      if (Ctor && Ctor.prototype && typeof Ctor.prototype.replaceChildren !== 'function') define(Ctor.prototype, 'replaceChildren', replaceChildren);
    });
  }

  // CSS capability classes: styles keep their modern rules; Chrome 61 fallbacks are gated by these classes on <html>
  if (typeof document !== 'undefined' && document.documentElement) {
    var html = document.documentElement;
    var supports = root.CSS && typeof root.CSS.supports === 'function'
      ? function (a, b) { try { return b === undefined ? root.CSS.supports(a) : root.CSS.supports(a, b); } catch (error) { return false; } }
      : function () { return false; };
    function supportsFlexGap() {
      if (!document.body) return null;
      var flex = document.createElement('div');
      flex.style.position = 'absolute'; flex.style.visibility = 'hidden'; flex.style.display = 'flex'; flex.style.flexDirection = 'column'; flex.style.rowGap = '1px';
      flex.appendChild(document.createElement('div')); flex.appendChild(document.createElement('div'));
      document.body.appendChild(flex);
      var ok = flex.scrollHeight === 1;
      flex.parentNode.removeChild(flex);
      return ok;
    }
    // tests may force a capability off (window.__silkCompatForce = { flexGap: false, focusVisible: false, aspectRatio: false }) to exercise the fallbacks on a modern engine
    var force = root.__silkCompatForce || {};
    function capability(name, detect) { return typeof force[name] === 'boolean' ? force[name] : detect(); }
    function applyClasses() {
      if (capability('flexGap', supportsFlexGap) === false) html.classList.add('no-flex-gap');
      if (!capability('focusVisible', function () { return supports('selector(:focus-visible)'); })) html.classList.add('no-focus-visible');
      if (!capability('aspectRatio', function () { return supports('aspect-ratio', '1 / 1'); })) { html.classList.add('no-aspect-ratio'); startAspectShim(); }
    }
    // aspect-ratio (Chrome 88) has no CSS fallback: every aspect-ratio rule of the stylesheets is mirrored here ([selector, width, height, mode] —
    // mode 'height' sizes the height from the laid-out width, 'width' the width from the height, 'auto' clears an earlier entry) and, only when the
    // engine lacks the property, the matching boxes get an inline size after every layout-affecting DOM change. tests/tools/css-baseline.js keeps
    // this list in sync with the stylesheets (the package build fails when a rule is missing).
    var ASPECT_RULES = [
      ['.world-map-stage', 941, 1672, 'height'],
      ['.travel-art', 657, 1183, 'height'],
      ['.journey-scene .travel-art', 0, 0, 'auto'],
      ['.home-art-frame', 941, 2091, 'height'],
      ['.market-product>img.goods-art', 1, 1, 'height'],
      ['.caravan-shell .rig .camel', 1, 1, 'width'],
      ['.caravan-shell .bag', 100, 130, 'height'],
      ['.caravan-shell .slot', 1, 1, 'height'],
      ['.caravan-shell .bag-item', 1, 1, 'height']
    ];
    root.__silkAspectRules = ASPECT_RULES;
    function startAspectShim() {
      var pending = false, px = function (v) { return parseFloat(v) || 0; };
      function apply() {
        pending = false;
        var decisions = new Map();
        for (var i = 0; i < ASPECT_RULES.length; i++) {
          var rule = ASPECT_RULES[i], nodes;
          try { nodes = document.querySelectorAll(rule[0]); } catch (error) { continue; }
          for (var j = 0; j < nodes.length; j++) decisions.set(nodes[j], rule[3] === 'auto' ? null : rule);
        }
        decisions.forEach(function (rule, el) {
          if (!rule) { if (el.style.height && el.getAttribute('data-aspect-shim')) { el.style.height = ''; el.style.width = ''; el.removeAttribute('data-aspect-shim'); } return; }
          var cs = getComputedStyle(el), border = cs.boxSizing === 'border-box', prop, value;
          if (rule[3] === 'width') {
            var h = el.offsetHeight; if (!h) return;
            value = h * rule[1] / rule[2]; if (!border) value -= px(cs.paddingLeft) + px(cs.paddingRight) + px(cs.borderLeftWidth) + px(cs.borderRightWidth); prop = 'width';
          } else {
            var w = el.offsetWidth; if (!w) return;
            value = w * rule[2] / rule[1]; if (!border) value -= px(cs.paddingTop) + px(cs.paddingBottom) + px(cs.borderTopWidth) + px(cs.borderBottomWidth); prop = 'height';
          }
          var text = Math.max(0, Math.round(value * 100) / 100) + 'px';
          if (el.style[prop] !== text) { el.style[prop] = text; el.setAttribute('data-aspect-shim', prop); }
        });
      }
      function schedule() { if (pending) return; pending = true; requestAnimationFrame(apply); }
      var observer = new MutationObserver(schedule);
      function start() { observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] }); schedule(); }
      if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
      window.addEventListener('resize', schedule);
      root.__silkAspectShim = { apply: apply, schedule: schedule };
    }
    if (document.body) applyClasses(); else document.addEventListener('DOMContentLoaded', applyClasses);
    // --viewport-height: styles.css starts from 100vh and shell.js keeps the pixel value in sync (visualViewport / resize), so no dvh shim is needed here.
  }
})();
