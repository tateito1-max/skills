'use strict';
// 乱数・数値ユーティリティ

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let _rng = mulberry32((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0);

function rand() { return _rng(); }
function randInt(a, b) { return a + Math.floor(rand() * (b - a + 1)); }
function randF(a, b) { return a + rand() * (b - a); }
function choice(arr) { return arr[Math.floor(rand() * arr.length)]; }
function chance(p) { return rand() < p; }
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function dist(x1, y1, x2, y2) { return Math.hypot(x2 - x1, y2 - y1); }
function round1(v) { return Math.round(v * 10) / 10; }
