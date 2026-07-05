'use strict';
// アイテム生成・装備・スタック・ドロップ

const STACKABLE = {
  bandage: { name: '包帯' },
  healpot: { name: '回復ポーション' },
  manapot: { name: 'マナポーション' },
};

const Items = {
  _uid: 1,

  makeWeapon(type, tierIdx, metalId) {
    const tier = WEAPON_TIERS[clamp(tierIdx, 0, WEAPON_TIERS.length - 1)];
    const metal = metalId ? METALS.find(m => m.id === metalId) : null;
    const base = WEAPONS[type];
    return {
      uid: this._uid++, kind: 'weapon', type,
      name: (tier.name ? tier.name + ' ' : '') + (metal ? metal.name + '製' : '') + base.name,
      mult: tier.mult, tierIdx,
      accurate: chance(0.2) && tierIdx > 0,
    };
  },

  makeArmor(type, tierIdx) {
    const tier = ARMOR_TIERS[clamp(tierIdx, 0, ARMOR_TIERS.length - 1)];
    const base = ARMORS[type];
    return {
      uid: this._uid++, kind: 'armor', type,
      name: (tier.name ? tier.name + ' ' : '') + base.name,
      def: base.def + tier.add, tierIdx,
    };
  },

  makeShield(type, tierIdx) {
    const tier = ARMOR_TIERS[clamp(tierIdx, 0, ARMOR_TIERS.length - 1)];
    const base = SHIELDS[type];
    return {
      uid: this._uid++, kind: 'shield', type,
      name: (tier.name ? tier.name + ' ' : '') + base.name,
      def: base.def + tier.add, tierIdx,
    };
  },

  makeStack(id, n) {
    return { uid: this._uid++, kind: 'stack', id, name: STACKABLE[id].name, n };
  },

  makeOre(metalId, n) {
    const m = METALS.find(x => x.id === metalId);
    return { uid: this._uid++, kind: 'ore', id: metalId, name: m.name + '鉱石', n };
  },

  makeIngot(metalId, n) {
    const m = METALS.find(x => x.id === metalId);
    return { uid: this._uid++, kind: 'ingot', id: metalId, name: m.name + 'インゴット', n };
  },

  // スタック可能なら統合しつつインベントリへ
  addToInv(p, item, toStorage) {
    const list = toStorage ? p.storage : p.inv;
    if (item.kind === 'stack' || item.kind === 'ore' || item.kind === 'ingot') {
      const ex = list.find(i => i.kind === item.kind && i.id === item.id);
      if (ex) { ex.n += item.n; return; }
    }
    list.push(item);
  },

  count(p, id) {
    const i = p.inv.find(x => (x.kind === 'stack' || x.kind === 'ore' || x.kind === 'ingot') && x.id === id);
    return i ? i.n : 0;
  },

  consume(p, id, n) {
    const i = p.inv.find(x => (x.kind === 'stack' || x.kind === 'ore' || x.kind === 'ingot') && x.id === id);
    if (!i || i.n < n) return false;
    i.n -= n;
    if (i.n <= 0) p.inv.splice(p.inv.indexOf(i), 1);
    return true;
  },

  // 深さに応じたティア抽選(深いほど高ティア)
  rollTier(depth, tiers) {
    let idx = 0;
    for (let i = 1; i < tiers.length; i++) {
      const p = clamp(0.32 - i * 0.04 + depth * 0.018, 0, 0.5);
      if (chance(p)) idx = i; else break;
    }
    return idx;
  },

  randomEquip(depth) {
    const r = rand();
    if (r < 0.5) {
      const type = choice(Object.keys(WEAPONS).filter(t => t !== 'fists'));
      return this.makeWeapon(type, this.rollTier(depth, WEAPON_TIERS));
    } else if (r < 0.8) {
      const type = choice(Object.keys(ARMORS));
      return this.makeArmor(type, this.rollTier(depth, ARMOR_TIERS));
    }
    const type = choice(Object.keys(SHIELDS));
    return this.makeShield(type, this.rollTier(depth, ARMOR_TIERS));
  },

  dropLoot(p, e) {
    const depth = Game.run ? Game.run.depth : 1;
    const gold = randInt(e.gold[0], e.gold[1]);
    if (gold > 0) { p.gold += gold; UI.log(`${gold}ゴールドを拾った。`, 'loot'); }
    if (chance(0.22)) {
      const item = this.randomEquip(depth);
      this.addToInv(p, item);
      UI.log(`${item.name}を手に入れた!`, item.tierIdx >= 3 ? 'rare' : 'loot');
    }
    if (chance(0.18)) { this.addToInv(p, this.makeStack('bandage', randInt(2, 5))); UI.log('包帯を拾った。', 'loot'); }
    if (chance(0.1)) { this.addToInv(p, this.makeStack(chance(0.6) ? 'healpot' : 'manapot', 1)); UI.log('ポーションを拾った。', 'loot'); }
  },

  openChest(p, depth) {
    const gold = randInt(10 + depth * 8, 40 + depth * 18);
    p.gold += gold;
    UI.log(`宝箱を開けた。${gold}ゴールド!`, 'loot');
    if (chance(0.5)) {
      const item = this.randomEquip(depth);
      this.addToInv(p, item);
      UI.log(`${item.name}を手に入れた!`, item.tierIdx >= 3 ? 'rare' : 'loot');
    }
    if (chance(0.3)) { this.addToInv(p, this.makeStack('healpot', 1)); UI.log('回復ポーションが入っていた。', 'loot'); }
    if (chance(0.25)) {
      const metals = METALS.filter(m => m.depth <= depth);
      const m = metals[metals.length - 1];
      this.addToInv(p, this.makeIngot(m.id, randInt(2, 5)));
      UI.log(`${m.name}インゴットが入っていた。`, 'loot');
    }
    UI.dirty.inv = true;
  },

  // 装備の説明文
  describe(item) {
    if (item.kind === 'weapon') {
      const w = WEAPONS[item.type];
      const lo = Math.round(w.dmg[0] * item.mult), hi = Math.round(w.dmg[1] * item.mult);
      return `攻${lo}-${hi} 速${w.speed}s ${SKILLS[w.skill].name}${item.accurate ? ' 命中+' : ''}`;
    }
    if (item.kind === 'armor' || item.kind === 'shield') return `防+${item.def}`;
    if (item.n !== undefined) return `×${item.n}`;
    return '';
  },

  equip(p, item) {
    const slot = item.kind === 'weapon' ? 'weapon' : (item.kind === 'shield' ? 'shield' : 'armor');
    const idx = p.inv.indexOf(item);
    if (idx < 0) return;
    p.inv.splice(idx, 1);
    if (p.equip[slot]) p.inv.push(p.equip[slot]);
    p.equip[slot] = item;
    UI.log(`${item.name}を装備した。`, 'sys');
    UI.dirty.inv = true;
  },
};
