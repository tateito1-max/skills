'use strict';
// プレイヤー生成・派生値・敵の生成とAI

const Entities = {
  makePlayer(template) {
    const p = {
      x: 0, y: 0,
      str: template.stats.str, dex: template.stats.dex, int: template.stats.int,
      hp: 0, mana: 0, stam: 0,
      skills: {},
      equip: { weapon: null, shield: null, armor: null },
      inv: [], storage: [], gold: 100,
      deepest: 1,
      // 一時状態
      swingT: 0, cast: null, bandT: 0, mineT: 0, mineTarget: null,
      hidden: false, meditating: false, hideT: 0,
      dead: false,
    };
    for (const id of SKILL_ORDER) {
      p.skills[id] = { val: template.skills[id] || 0, lock: 'up' };
    }
    p.equip.weapon = Items.makeWeapon(template.weapon, 0);
    if (template.shield) p.equip.shield = Items.makeShield(template.shield, 0);
    p.equip.armor = Items.makeArmor('leather', 0);
    Items.addToInv(p, Items.makeStack('bandage', 15));
    Items.addToInv(p, Items.makeStack('healpot', 2));
    Items.addToInv(p, Items.makeStack('manapot', 1));
    this.recalc(p);
    p.hp = p.maxHp; p.mana = p.maxMana; p.stam = p.maxStam;
    return p;
  },

  recalc(p) {
    p.maxHp = Math.floor(30 + p.str * 0.8);
    p.maxMana = p.int;
    p.maxStam = p.dex;
    p.hp = Math.min(p.hp, p.maxHp);
    p.mana = Math.min(p.mana, p.maxMana);
    p.stam = Math.min(p.stam, p.maxStam);
  },

  weaponOf(p) { return p.equip.weapon || Items.makeWeapon('fists', 0); },

  // 現在の武器に対応するスキル値(防御にも使う)
  weaponSkillVal(p) {
    const w = this.weaponOf(p);
    return p.skills[WEAPONS[w.type].skill].val;
  },

  makeEnemy(type, x, y, depth) {
    const d = ENEMIES[type];
    const scale = 1 + Math.max(0, depth - d.depth) * 0.06; // 出現階より深いと強化
    return {
      type, x, y,
      name: d.name, glyph: d.glyph,
      hp: Math.floor(d.hp * scale), maxHp: Math.floor(d.hp * scale),
      skill: Math.min(110, d.skill + Math.max(0, depth - d.depth) * 2),
      dmg: d.dmg, speed: d.speed, aggroR: d.aggro, armor: d.armor,
      ranged: !!d.ranged, rangedRange: d.rangedRange || 0,
      gold: d.gold,
      aggro: false, swingT: randF(0.5, 1.5), dead: false,
      wanderT: 0, wx: 0, wy: 0,
    };
  },

  // 壁ずり移動(x軸y軸を別々に判定)。半径 r の円で判定
  moveEntity(map, e, dx, dy, r) {
    if (dx !== 0) {
      const nx = e.x + dx;
      const edge = nx + Math.sign(dx) * r;
      if (Dungeon.isWalkable(map, edge, e.y - r * 0.7) && Dungeon.isWalkable(map, edge, e.y + r * 0.7)) e.x = nx;
    }
    if (dy !== 0) {
      const ny = e.y + dy;
      const edge = ny + Math.sign(dy) * r;
      if (Dungeon.isWalkable(map, e.x - r * 0.7, edge) && Dungeon.isWalkable(map, e.x + r * 0.7, edge)) e.y = ny;
    }
  },

  updateEnemy(e, p, map, dt) {
    if (e.dead || p.dead) return;
    const d = dist(e.x, e.y, p.x, p.y);

    // 索敵。隠密中は感知半径が大きく縮む
    if (!e.aggro) {
      const r = e.aggroR * (p.hidden ? 0.22 : 1);
      if (d < r && Dungeon.hasLOS(map, e.x, e.y, p.x, p.y)) {
        e.aggro = true;
        UI.log(`${e.name}がこちらに気づいた!`, 'warn');
      }
    }

    e.swingT = Math.max(0, e.swingT - dt);

    if (e.aggro && !p.hidden) {
      const atkRange = e.ranged ? e.rangedRange : 1.5;
      if (d > atkRange * 0.9) {
        // 追跡
        const s = e.speed * dt / Math.max(d, 0.001);
        this.moveEntity(map, e, (p.x - e.x) * s, (p.y - e.y) * s, 0.35);
      } else if (e.swingT <= 0 && Dungeon.hasLOS(map, e.x, e.y, p.x, p.y)) {
        Combat.enemyAttack(e, p);
        e.swingT = randF(1.6, 2.4);
      }
    } else {
      // 徘徊
      e.wanderT -= dt;
      if (e.wanderT <= 0) {
        e.wanderT = randF(1.5, 4);
        const a = rand() * Math.PI * 2;
        e.wx = Math.cos(a); e.wy = Math.sin(a);
        if (chance(0.4)) { e.wx = 0; e.wy = 0; }
      }
      this.moveEntity(map, e, e.wx * e.speed * 0.3 * dt, e.wy * e.speed * 0.3 * dt, 0.35);
      if (e.aggro && p.hidden) {
        // 見失う
        if (chance(dt * 0.5)) e.aggro = false;
      }
    }
  },
};
