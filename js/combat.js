'use strict';
// 戦闘: スイングタイマー、命中/ダメージ、魔法、包帯、隠密、瞑想

const Combat = {
  // UO風の命中率: 攻撃側スキル vs 防御側スキル
  hitChance(atk, def) {
    return clamp((atk + 20) / ((def + 20) * 2), 0.05, 0.95);
  },

  nearestEnemy(p, enemies, range, needLOS, map) {
    let best = null, bd = range;
    for (const e of enemies) {
      if (e.dead) continue;
      const d = dist(p.x, p.y, e.x, e.y);
      if (d < bd && (!needLOS || Dungeon.hasLOS(map, p.x, p.y, e.x, e.y))) { bd = d; best = e; }
    }
    return best;
  },

  updatePlayer(p, enemies, map, dt, moving) {
    // 回復・再生
    p.stam = Math.min(p.maxStam, p.stam + dt * (moving ? 1.5 : 3));
    const manaRegen = 0.25 + p.skills.meditation.val / 120 + (p.meditating ? 1.2 + p.skills.meditation.val / 40 : 0);
    p.mana = Math.min(p.maxMana, p.mana + dt * manaRegen);
    p.hp = Math.min(p.maxHp, p.hp + dt * 0.08);

    if (moving) {
      if (p.meditating) { p.meditating = false; UI.log('瞑想が途切れた。', 'sys'); }
      if (p.cast) { p.cast = null; UI.log('詠唱が中断された。', 'sys'); }
      if (p.mineT > 0) { p.mineT = 0; p.mineTarget = null; }
      // 隠密状態での移動は毎秒スキル判定。失敗で姿を現す
      if (p.hidden) {
        p.hideT += dt;
        if (p.hideT >= 1) {
          p.hideT = 0;
          Skills.tryGain(p, 'hiding', 40);
          if (!chance(0.35 + p.skills.hiding.val / 160)) {
            p.hidden = false;
            UI.log('姿が露わになった!', 'warn');
          }
        }
      }
    }

    // 瞑想スキル成長
    if (p.meditating) {
      p.medT = (p.medT || 0) + dt;
      if (p.medT >= 2) {
        p.medT = 0;
        Skills.tryGain(p, 'meditation', clamp(100 - (p.mana / p.maxMana) * 100, 0, 90));
        if (p.mana >= p.maxMana) { p.meditating = false; UI.log('精神が満ちた。瞑想を終える。', 'sys'); }
      }
    }

    // 詠唱
    if (p.cast) {
      p.cast.t -= dt;
      if (p.cast.t <= 0) this.finishCast(p, enemies, map);
    }

    // 包帯
    if (p.bandT > 0) {
      p.bandT -= dt;
      if (p.bandT <= 0) this.finishBandage(p);
    }

    // 採掘
    if (p.mineT > 0) {
      p.mineT -= dt;
      if (p.mineT <= 0) Crafting.finishMine(p, map);
    }

    // オートアタック(隠密・詠唱・採掘中はしない)
    p.swingT = Math.max(0, p.swingT - dt);
    if (p.hidden || p.cast || p.mineT > 0) return;
    const w = Entities.weaponOf(p);
    const wd = WEAPONS[w.type];
    const target = this.nearestEnemy(p, enemies, wd.range, true, map);
    if (target && p.swingT <= 0) {
      if (p.stam < 4) return; // スタミナ切れは振れない
      p.stam -= 4;
      this.playerSwing(p, target, w, wd);
      // スイング間隔はDEXで短縮
      p.swingT = wd.speed * clamp(1.55 - p.dex / 160, 0.8, 1.5);
      if (p.meditating) { p.meditating = false; }
    }
  },

  playerSwing(p, e, w, wd) {
    const skillId = wd.skill;
    const atk = p.skills[skillId].val + (w.accurate ? 10 : 0);
    Skills.tryGain(p, skillId, e.skill);
    if (wd.range > 3) Render.addBeam(p.x, p.y, e.x, e.y, '#ccb');
    if (!chance(this.hitChance(atk, e.skill))) {
      Render.addFloat(e.x, e.y, 'miss', '#889');
      return;
    }
    let dmg = randF(wd.dmg[0], wd.dmg[1]) * (w.mult || 1);
    dmg *= 1 + p.str / 300 + p.skills.tactics.val / 160; // STRと戦術で強化
    dmg -= randF(e.armor * 0.3, e.armor * 0.7);
    dmg = Math.max(1, Math.round(dmg));
    Skills.tryGain(p, 'tactics', e.skill);
    this.damageEnemy(p, e, dmg, '#fa5');
  },

  damageEnemy(p, e, dmg, color) {
    e.hp -= dmg;
    e.aggro = true;
    Render.addFloat(e.x, e.y, String(dmg), color);
    if (e.hp <= 0) {
      e.dead = true;
      UI.log(`${e.name}を倒した!`, 'kill');
      Items.dropLoot(p, e);
      UI.dirty.inv = true;
    }
  },

  enemyAttack(e, p) {
    // 防御側は装備武器のスキルで回避
    const def = Entities.weaponSkillVal(p);
    if (e.ranged) Render.addBeam(e.x, e.y, p.x, p.y, '#a6f');
    if (!chance(this.hitChance(e.skill, def))) {
      Render.addFloat(p.x, p.y, 'miss', '#889');
      return;
    }
    let dmg = randF(e.dmg[0], e.dmg[1]);
    // 受け流し: 盾があればブロック判定(スキル成長機会)
    if (p.equip.shield) {
      Skills.tryGain(p, 'parrying', e.skill);
      if (chance(p.skills.parrying.val / 220)) {
        Render.addFloat(p.x, p.y, 'block!', '#6cf');
        dmg *= 0.25;
      }
    }
    const ar = (p.equip.armor ? p.equip.armor.def : 0) + (p.equip.shield ? p.equip.shield.def : 0);
    dmg -= randF(ar * 0.3, ar * 0.7);
    dmg = Math.max(1, Math.round(dmg));
    this.damagePlayer(p, dmg, e.name);
  },

  damagePlayer(p, dmg, srcName) {
    p.hp -= dmg;
    p.hidden = false;
    if (p.meditating) { p.meditating = false; UI.log('攻撃を受けて瞑想が途切れた。', 'sys'); }
    Render.addFloat(p.x, p.y, String(dmg), '#f55');
    if (p.hp <= 0) {
      p.hp = 0; p.dead = true;
      UI.log(`${srcName}に倒された…`, 'death');
      Game.onDeath();
    }
  },

  // ===== 魔法 =====
  startCast(p, idx) {
    const sp = SPELLS[idx];
    if (!sp || p.cast) return;
    if (p.mana < sp.mana) { UI.log('マナが足りない。', 'sys'); return; }
    p.hidden = false;
    p.meditating = false;
    p.cast = { spell: sp, t: sp.cast };
    UI.log(`${sp.name}を詠唱中…`, 'magic');
  },

  finishCast(p, enemies, map) {
    const sp = p.cast.spell;
    p.cast = null;
    p.mana -= sp.mana;
    Skills.tryGain(p, 'magery', sp.diff);
    // フィズル判定(UOでは失敗でもスキルは上がる)
    if (!chance(clamp(0.5 + (p.skills.magery.val - sp.diff) / 25, 0.05, 0.98))) {
      UI.log(`${sp.name}の詠唱に失敗した!`, 'warn');
      Render.addFloat(p.x, p.y, 'fizzle', '#a6f');
      return;
    }
    const power = 1 + p.skills.magery.val / 180;
    if (sp.heal) {
      const amt = Math.round(randF(sp.heal[0], sp.heal[1]) * power);
      p.hp = Math.min(p.maxHp, p.hp + amt);
      Render.addFloat(p.x, p.y, '+' + amt, '#6f6');
      UI.log(`${sp.name}で ${amt} 回復した。`, 'magic');
    } else {
      const target = this.nearestEnemy(p, enemies, 8, true, map);
      if (!target) { UI.log('射程内に標的がいない。', 'sys'); return; }
      Render.addBeam(p.x, p.y, target.x, target.y, sp.color);
      const dmg = Math.max(1, Math.round(randF(sp.dmg[0], sp.dmg[1]) * power));
      UI.log(`${sp.name}が${target.name}に命中!`, 'magic');
      this.damageEnemy(p, target, dmg, sp.color);
    }
  },

  // ===== 包帯 =====
  startBandage(p) {
    if (p.bandT > 0) { UI.log('もう手当て中だ。', 'sys'); return; }
    if (p.hp >= p.maxHp) { UI.log('傷はない。', 'sys'); return; }
    if (!Items.consume(p, 'bandage', 1)) { UI.log('包帯を持っていない。', 'sys'); return; }
    p.bandT = clamp(8 - p.dex / 25, 3, 8);
    UI.log('包帯を巻き始めた…', 'sys');
  },

  finishBandage(p) {
    p.bandT = 0;
    Skills.tryGain(p, 'healing', clamp((1 - p.hp / p.maxHp) * 80 + 10, 0, 95));
    const hs = p.skills.healing.val;
    if (chance(0.25 + hs / 150)) {
      const amt = Math.round(randF(6, 12) + hs * 0.45);
      p.hp = Math.min(p.maxHp, p.hp + amt);
      Render.addFloat(p.x, p.y, '+' + amt, '#6f6');
      UI.log(`手当てに成功し ${amt} 回復した。`, 'heal');
    } else {
      UI.log('手当てに失敗した…', 'warn');
    }
    UI.dirty.inv = true;
  },

  // ===== 隠密 =====
  tryHide(p, enemies) {
    if (p.hidden) { p.hidden = false; UI.log('姿を現した。', 'sys'); return; }
    const near = enemies.some(e => !e.dead && e.aggro && dist(p.x, p.y, e.x, e.y) < 3);
    Skills.tryGain(p, 'hiding', near ? 80 : 30);
    if (near && !chance(0.15)) { UI.log('敵の眼前では隠れられない!', 'warn'); return; }
    if (chance(0.3 + p.skills.hiding.val / 140)) {
      p.hidden = true;
      p.hideT = 0;
      for (const e of enemies) if (dist(p.x, p.y, e.x, e.y) > 2.5) e.aggro = false;
      UI.log('物陰に身を潜めた。', 'good');
    } else {
      UI.log('うまく隠れられなかった。', 'warn');
    }
  },

  toggleMeditate(p) {
    if (p.meditating) { p.meditating = false; UI.log('瞑想をやめた。', 'sys'); return; }
    if (p.mana >= p.maxMana) { UI.log('マナは満ちている。', 'sys'); return; }
    p.meditating = true;
    p.medT = 0;
    UI.log('瞑想を始めた…(移動で中断)', 'sys');
  },

  usePotion(p, potId) {
    if (!Items.consume(p, potId, 1)) return false;
    if (potId === 'healpot') {
      const amt = randInt(15, 30);
      p.hp = Math.min(p.maxHp, p.hp + amt);
      Render.addFloat(p.x, p.y, '+' + amt, '#6f6');
      UI.log(`回復ポーションで ${amt} 回復した。`, 'heal');
    } else if (potId === 'manapot') {
      const amt = randInt(15, 30);
      p.mana = Math.min(p.maxMana, p.mana + amt);
      UI.log(`マナポーションで ${amt} 回復した。`, 'magic');
    }
    UI.dirty.inv = true;
    return true;
  },
};
