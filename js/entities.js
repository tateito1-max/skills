'use strict';
// キャラクター生成・派生値、敵の群れ(パック)とそのターン行動

const Entities = {
  makeChar(name, template) {
    const c = {
      name, tplId: template.id,
      row: template.row,
      str: template.stats.str, dex: template.stats.dex, int: template.stats.int,
      hp: 0, mana: 0,
      skills: {},
      equip: { weapon: null, shield: null, armor: null },
      inv: [],
      dead: false,
      defending: false,
    };
    for (const id of SKILL_ORDER) {
      c.skills[id] = { val: template.skills[id] || 0, lock: 'up' };
    }
    c.equip.weapon = Items.makeWeapon(template.weapon, 0);
    if (template.shield) c.equip.shield = Items.makeShield(template.shield, 0);
    c.equip.armor = Items.makeArmor('leather', 0);
    Items.addToChar(c, Items.makeStack('bandage', 5));
    Items.addToChar(c, Items.makeStack('healpot', 1));
    this.recalc(c);
    c.hp = c.maxHp; c.mana = c.maxMana;
    return c;
  },

  recalc(c) {
    c.maxHp = Math.floor(30 + c.str * 0.8);
    c.maxMana = c.int;
    c.hp = Math.min(c.hp, c.maxHp);
    c.mana = Math.min(c.mana, c.maxMana);
  },

  weaponOf(c) { return c.equip.weapon || Items.makeWeapon('fists', 0); },

  weaponSkillVal(c) {
    const w = this.weaponOf(c);
    return c.skills[WEAPONS[w.type].skill].val;
  },

  armorOf(c) {
    return (c.equip.armor ? c.equip.armor.def : 0) + (c.equip.shield ? c.equip.shield.def : 0);
  },

  // ===== 敵の群れ(マップ上の1シンボル=1エンカウント) =====
  makePack(type, x, y, depth) {
    const d = ENEMIES[type];
    return {
      type, x, y, depth,
      name: d.name, glyph: d.glyph,
      n: randInt(d.pack[0], d.pack[1]),
      aggroR: d.aggro,
      aggro: false,
      cooldown: 0, // 逃走直後は再交戦しない猶予ターン
      wanderT: 0,
    };
  },

  // 戦闘用の敵グループを組む(パック本体+確率で援軍グループ)
  buildGroups(pack) {
    const depth = pack.depth;
    const groups = [this.makeGroup(pack.type, pack.n, depth)];
    if (chance(0.3 + depth * 0.015)) {
      const pool = Object.keys(ENEMIES).filter(k => ENEMIES[k].depth <= depth && ENEMIES[k].depth >= depth - 5);
      const t = choice(pool);
      const d = ENEMIES[t];
      groups.push(this.makeGroup(t, randInt(d.pack[0], d.pack[1]), depth));
    }
    return groups;
  },

  makeGroup(type, n, depth) {
    const d = ENEMIES[type];
    const scale = 1 + Math.max(0, depth - d.depth) * 0.06;
    const hp = Math.floor(d.hp * scale);
    return {
      type, name: d.name, glyph: d.glyph,
      skill: Math.min(110, d.skill + Math.max(0, depth - d.depth) * 2),
      dmg: d.dmg, armor: d.armor, ranged: !!d.ranged,
      gold: d.gold,
      members: Array.from({ length: n }, () => ({ hp, maxHp: hp })),
    };
  },

  // 1ワールドターンぶんのパック行動。交戦に入るなら true
  packTurn(pack, map, px, py, sneakFactor) {
    if (pack.cooldown > 0) { pack.cooldown--; return false; }
    const d = Math.max(Math.abs(pack.x - px), Math.abs(pack.y - py)); // チェビシェフ距離

    if (!pack.aggro) {
      if (d <= pack.aggroR * sneakFactor && Dungeon.hasLOS(map, pack.x + 0.5, pack.y + 0.5, px + 0.5, py + 0.5)) {
        pack.aggro = true;
        UI.log(`${pack.name}の群れがこちらに気づいた!`, 'warn');
      } else {
        // 徘徊(2ターンに1歩)
        pack.wanderT++;
        if (pack.wanderT >= 2) {
          pack.wanderT = 0;
          const dir = choice([[1, 0], [-1, 0], [0, 1], [0, -1], [0, 0]]);
          this.tryStep(pack, map, pack.x + dir[0], pack.y + dir[1], px, py);
        }
        return false;
      }
    }

    if (pack.aggro) {
      if (d <= 1) return true; // 隣接 → 交戦
      // プレイヤーへ貪欲に1歩(隠密で見失うことも)
      if (sneakFactor < 1 && chance(0.25)) { pack.aggro = false; return false; }
      const sx = Math.sign(px - pack.x), sy = Math.sign(py - pack.y);
      const opts = Math.abs(px - pack.x) >= Math.abs(py - pack.y)
        ? [[sx, 0], [0, sy], [sx, sy]] : [[0, sy], [sx, 0], [sx, sy]];
      for (const [dx, dy] of opts) {
        if (dx === 0 && dy === 0) continue;
        if (this.tryStep(pack, map, pack.x + dx, pack.y + dy, px, py)) break;
      }
      return Math.max(Math.abs(pack.x - px), Math.abs(pack.y - py)) <= 1;
    }
    return false;
  },

  tryStep(pack, map, nx, ny, px, py) {
    if (!Dungeon.isWalkable(map, nx + 0.5, ny + 0.5)) return false;
    if (nx === px && ny === py) return false; // プレイヤーのマスには乗らない(隣接判定で交戦)
    if (Game.packs().some(o => o !== pack && o.x === nx && o.y === ny)) return false;
    pack.x = nx; pack.y = ny;
    return true;
  },
};
