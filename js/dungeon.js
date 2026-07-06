'use strict';
// ダンジョン自動生成: 部屋+通路、階段、鉱脈、宝箱、敵の群れ配置

const Dungeon = {
  generate(depth) {
    const w = 46, h = 34;
    const t = new Uint8Array(w * h); // 全部 T_WALL(=0)
    const rooms = [];
    const tries = 60;
    const maxRooms = randInt(8, 11);

    for (let i = 0; i < tries && rooms.length < maxRooms; i++) {
      const rw = randInt(5, 10), rh = randInt(4, 8);
      const rx = randInt(1, w - rw - 2), ry = randInt(1, h - rh - 2);
      const r = { x: rx, y: ry, w: rw, h: rh, cx: rx + Math.floor(rw / 2), cy: ry + Math.floor(rh / 2) };
      if (rooms.some(o => rx < o.x + o.w + 1 && rx + rw + 1 > o.x && ry < o.y + o.h + 1 && ry + rh + 1 > o.y)) continue;
      rooms.push(r);
      for (let y = ry; y < ry + rh; y++)
        for (let x = rx; x < rx + rw; x++) t[y * w + x] = T_FLOOR;
    }

    // 通路(L字)で順番に接続
    for (let i = 1; i < rooms.length; i++) {
      const a = rooms[i - 1], b = rooms[i];
      let x = a.cx, y = a.cy;
      while (x !== b.cx) { t[y * w + x] = t[y * w + x] || T_FLOOR; x += Math.sign(b.cx - x); }
      while (y !== b.cy) { t[y * w + x] = t[y * w + x] || T_FLOOR; y += Math.sign(b.cy - y); }
      t[y * w + x] = t[y * w + x] || T_FLOOR;
    }

    const map = { w, h, t, depth, meta: {}, explored: new Uint8Array(w * h) };

    // 上り階段(スポーン)と下り階段(最遠部屋)
    const start = rooms[0];
    map.t[start.cy * w + start.cx] = T_UP;
    map.spawnX = start.cx; map.spawnY = start.cy;
    let far = rooms[0], fd = -1;
    for (const r of rooms) {
      const d = dist(start.cx, start.cy, r.cx, r.cy);
      if (d > fd) { fd = d; far = r; }
    }
    map.t[far.cy * w + far.cx] = T_DOWN;
    map.downX = far.cx; map.downY = far.cy;

    // 鉱脈: 床に隣接した壁を鉱石タイルに
    const metals = METALS.filter(m => m.depth <= depth);
    const veins = randInt(3, 6);
    let placed = 0;
    for (let i = 0; i < 300 && placed < veins; i++) {
      const x = randInt(1, w - 2), y = randInt(1, h - 2);
      if (t[y * w + x] !== T_WALL) continue;
      const adj = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => t[(y + dy) * w + (x + dx)] === T_FLOOR);
      if (!adj) continue;
      let metal = metals[0];
      for (const m of metals) if (chance(0.45)) metal = m;
      t[y * w + x] = T_ORE;
      map.meta[x + ',' + y] = { metal: metal.id, left: randInt(2, 4) };
      placed++;
    }

    // 宝箱: 部屋ごとに確率で
    for (const r of rooms) {
      if (r === rooms[0] || !chance(0.4)) continue;
      const x = randInt(r.x, r.x + r.w - 1), y = randInt(r.y, r.y + r.h - 1);
      if (t[y * w + x] !== T_FLOOR) continue;
      t[y * w + x] = T_CHEST;
      map.meta[x + ',' + y] = { chest: true };
    }

    // 敵の群れ配置(部屋ごとに確率で1〜2パック)
    const packs = [];
    const types = Object.keys(ENEMIES).filter(k => {
      const e = ENEMIES[k];
      return e.depth <= depth && e.depth >= depth - 5;
    });
    if (types.length === 0) types.push('rat');
    for (let i = 1; i < rooms.length; i++) {
      const r = rooms[i];
      const n = chance(0.7) ? 1 : 2;
      for (let j = 0; j < n; j++) {
        const x = randInt(r.x, r.x + r.w - 1), y = randInt(r.y, r.y + r.h - 1);
        if (t[y * w + x] !== T_FLOOR) continue;
        if (packs.some(p => p.x === x && p.y === y)) continue;
        packs.push(Entities.makePack(choice(types), x, y, depth));
      }
    }

    return { map, packs };
  },

  tileAt(map, x, y) {
    const tx = Math.floor(x), ty = Math.floor(y);
    if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) return T_WALL;
    return map.t[ty * map.w + tx];
  },

  isWalkable(map, x, y) {
    const t = this.tileAt(map, x, y);
    return t === T_FLOOR || t === T_UP || t === T_DOWN;
  },

  // タイル単位のブレゼンハムで視線判定
  hasLOS(map, x0, y0, x1, y1) {
    let tx0 = Math.floor(x0), ty0 = Math.floor(y0);
    const tx1 = Math.floor(x1), ty1 = Math.floor(y1);
    const dx = Math.abs(tx1 - tx0), dy = Math.abs(ty1 - ty0);
    const sx = tx0 < tx1 ? 1 : -1, sy = ty0 < ty1 ? 1 : -1;
    let err = dx - dy;
    while (tx0 !== tx1 || ty0 !== ty1) {
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; tx0 += sx; }
      if (e2 < dx) { err += dx; ty0 += sy; }
      if (tx0 === tx1 && ty0 === ty1) break;
      const t = this.tileAt(map, tx0 + 0.5, ty0 + 0.5);
      if (t === T_WALL || t === T_ORE) return false;
    }
    return true;
  },
};
