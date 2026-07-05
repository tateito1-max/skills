'use strict';
// Canvas 描画: タイル・視界(霧)・エンティティ・エフェクト

const Render = {
  cv: null, ctx: null,
  floats: [],  // ダメージ数字など {x,y,txt,color,t}
  beams: [],   // 矢・魔法の軌跡 {x0,y0,x1,y1,color,t}

  init() {
    this.cv = document.getElementById('cv');
    this.ctx = this.cv.getContext('2d');
  },

  addFloat(x, y, txt, color) {
    this.floats.push({ x, y, txt, color, t: 1.0 });
  },

  addBeam(x0, y0, x1, y1, color) {
    this.beams.push({ x0, y0, x1, y1, color, t: 0.18 });
  },

  update(dt) {
    for (const f of this.floats) { f.t -= dt; f.y -= dt * 0.8; }
    this.floats = this.floats.filter(f => f.t > 0);
    for (const b of this.beams) b.t -= dt;
    this.beams = this.beams.filter(b => b.t > 0);
  },

  tileColor(t, meta) {
    switch (t) {
      case T_WALL: return '#26232e';
      case T_FLOOR: return '#4a4454';
      case T_UP: return '#4a4454';
      case T_DOWN: return '#4a4454';
      case T_ORE: return '#26232e';
      case T_CHEST: return '#4a4454';
    }
    return '#000';
  },

  draw(p, map, enemies) {
    const ctx = this.ctx, W = this.cv.width, H = this.cv.height;
    ctx.fillStyle = '#131118';
    ctx.fillRect(0, 0, W, H);
    if (!map) return;

    const camX = p.x * TILE - W / 2, camY = p.y * TILE - H / 2;
    const x0 = Math.max(0, Math.floor(camX / TILE)), y0 = Math.max(0, Math.floor(camY / TILE));
    const x1 = Math.min(map.w - 1, Math.ceil((camX + W) / TILE)), y1 = Math.min(map.h - 1, Math.ceil((camY + H) / TILE));

    // 可視タイル判定(半径+LOS)し、explored に記録
    const visible = new Set();
    const pr = Math.floor(p.x), pc = Math.floor(p.y);
    for (let ty = pc - VIEW_RADIUS; ty <= pc + VIEW_RADIUS; ty++) {
      for (let tx = pr - VIEW_RADIUS; tx <= pr + VIEW_RADIUS; tx++) {
        if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) continue;
        if (dist(tx + 0.5, ty + 0.5, p.x, p.y) > VIEW_RADIUS) continue;
        if (!Dungeon.hasLOS(map, p.x, p.y, tx + 0.5, ty + 0.5)) continue;
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
        if (t === T_FLOOR || t === T_UP || t === T_DOWN || t === T_CHEST) {
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

    // 敵(可視タイル上のみ)
    for (const e of enemies) {
      if (e.dead) continue;
      const idx = Math.floor(e.y) * map.w + Math.floor(e.x);
      if (!visible.has(idx)) continue;
      const sx = e.x * TILE - camX, sy = e.y * TILE - camY;
      ctx.fillText(e.glyph, sx, sy);
      // HPバー
      if (e.hp < e.maxHp) {
        ctx.fillStyle = '#000';
        ctx.fillRect(sx - 14, sy - 20, 28, 4);
        ctx.fillStyle = '#e33';
        ctx.fillRect(sx - 14, sy - 20, 28 * (e.hp / e.maxHp), 4);
      }
    }

    // 軌跡
    for (const b of this.beams) {
      ctx.strokeStyle = b.color;
      ctx.globalAlpha = clamp(b.t / 0.18, 0, 1);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(b.x0 * TILE - camX, b.y0 * TILE - camY);
      ctx.lineTo(b.x1 * TILE - camX, b.y1 * TILE - camY);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // プレイヤー
    const px = p.x * TILE - camX, py = p.y * TILE - camY;
    ctx.globalAlpha = p.hidden ? 0.35 : 1;
    ctx.fillText('🧝', px, py);
    ctx.globalAlpha = 1;
    if (p.meditating) ctx.fillText('🧘', px, py - 22);

    // アクション進行バー(詠唱・包帯・採掘)
    let prog = null, col = '#fff';
    if (p.cast) { prog = 1 - p.cast.t / p.cast.spell.cast; col = '#a6f'; }
    else if (p.bandT > 0) { prog = 1 - p.bandT / clamp(8 - p.dex / 25, 3, 8); col = '#6f6'; }
    else if (p.mineT > 0) { prog = 1 - p.mineT / clamp(3.5 - p.skills.mining.val / 45, 1.2, 3.5); col = '#db5'; }
    if (prog !== null) {
      ctx.fillStyle = '#000';
      ctx.fillRect(px - 16, py + 18, 32, 5);
      ctx.fillStyle = col;
      ctx.fillRect(px - 16, py + 18, 32 * clamp(prog, 0, 1), 5);
    }

    // ダメージ数字
    ctx.font = 'bold 14px sans-serif';
    for (const f of this.floats) {
      ctx.globalAlpha = clamp(f.t, 0, 1);
      ctx.fillStyle = f.color;
      ctx.fillText(f.txt, f.x * TILE - camX, f.y * TILE - camY - 24);
      ctx.globalAlpha = 1;
    }
    ctx.font = '22px serif';
  },
};
