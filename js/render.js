'use strict';
// Canvas 描画: タイル・視界(霧)・敵の群れ・パーティ

const Render = {
  cv: null, ctx: null,

  init() {
    this.cv = document.getElementById('cv');
    this.ctx = this.cv.getContext('2d');
  },

  tileColor(t) {
    switch (t) {
      case T_WALL: return '#26232e';
      case T_ORE: return '#26232e';
      default: return '#4a4454';
    }
  },

  draw() {
    const ctx = this.ctx, W = this.cv.width, H = this.cv.height;
    ctx.fillStyle = '#131118';
    ctx.fillRect(0, 0, W, H);
    if (Game.state !== 'dungeon') return;
    const map = Game.map();
    if (!map) return;
    const px = Game.px, py = Game.py;

    const camX = (px + 0.5) * TILE - W / 2, camY = (py + 0.5) * TILE - H / 2;
    const x0 = Math.max(0, Math.floor(camX / TILE)), y0 = Math.max(0, Math.floor(camY / TILE));
    const x1 = Math.min(map.w - 1, Math.ceil((camX + W) / TILE)), y1 = Math.min(map.h - 1, Math.ceil((camY + H) / TILE));

    // 可視タイル判定(半径+LOS)し、explored に記録
    const visible = new Set();
    for (let ty = py - VIEW_RADIUS; ty <= py + VIEW_RADIUS; ty++) {
      for (let tx = px - VIEW_RADIUS; tx <= px + VIEW_RADIUS; tx++) {
        if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) continue;
        if (dist(tx, ty, px, py) > VIEW_RADIUS) continue;
        if (!Dungeon.hasLOS(map, px + 0.5, py + 0.5, tx + 0.5, ty + 0.5)) continue;
        visible.add(ty * map.w + tx);
        map.explored[ty * map.w + tx] = 1;
      }
    }

    ctx.font = '22px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const idx = ty * map.w + tx;
        if (!map.explored[idx]) continue;
        const t = map.t[idx];
        const sx = tx * TILE - camX, sy = ty * TILE - camY;
        const vis = visible.has(idx);
        ctx.globalAlpha = vis ? 1 : 0.35;
        ctx.fillStyle = this.tileColor(t);
        ctx.fillRect(sx, sy, TILE, TILE);
        if (t !== T_WALL && t !== T_ORE) {
          ctx.strokeStyle = 'rgba(0,0,0,0.15)';
          ctx.strokeRect(sx + 0.5, sy + 0.5, TILE - 1, TILE - 1);
        }
        if (t === T_UP) { ctx.fillStyle = '#cfc76a'; ctx.fillText('▲', sx + TILE / 2, sy + TILE / 2); }
        else if (t === T_DOWN) { ctx.fillStyle = '#7ac76a'; ctx.fillText('▼', sx + TILE / 2, sy + TILE / 2); }
        else if (t === T_CHEST) { ctx.fillText('📦', sx + TILE / 2, sy + TILE / 2); }
        else if (t === T_ORE) {
          const meta = map.meta[tx + ',' + ty];
          const m = meta ? METALS.find(x => x.id === meta.metal) : METALS[0];
          ctx.fillStyle = m.color;
          ctx.fillText('◆', sx + TILE / 2, sy + TILE / 2);
        }
        ctx.globalAlpha = 1;
      }
    }

    // 敵の群れ(可視タイルのみ)。数を小さく添える
    for (const pk of Game.packs()) {
      const idx = pk.y * map.w + pk.x;
      if (!visible.has(idx)) continue;
      const sx = (pk.x + 0.5) * TILE - camX, sy = (pk.y + 0.5) * TILE - camY;
      ctx.fillText(pk.glyph, sx, sy);
      if (pk.n > 1) {
        ctx.font = 'bold 11px sans-serif';
        ctx.fillStyle = pk.aggro ? '#ff8a6a' : '#cbc4dd';
        ctx.fillText('×' + pk.n, sx + 10, sy + 10);
        ctx.font = '22px serif';
      }
    }

    // パーティ
    const sx = (px + 0.5) * TILE - camX, sy = (py + 0.5) * TILE - camY;
    ctx.globalAlpha = Game.sneaking ? 0.45 : 1;
    ctx.fillText('🧝', sx, sy);
    ctx.globalAlpha = 1;
  },
};
