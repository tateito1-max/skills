'use strict';
// アイテム生成・重量管理・装備・スタック・分配

const Items = {
  _uid: 1,

  // ===== 生成 =====
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

  // ===== 重量 =====
  weightOf(item) {
    if (!item) return 0;
    switch (item.kind) {
      case 'weapon': return WEAPONS[item.type].w;
      case 'armor': return ARMORS[item.type].w;
      case 'shield': return SHIELDS[item.type].w;
      case 'stack': return round1(STACKABLE[item.id].w * item.n);
      case 'ore': return round1(ORE_W * item.n);
      case 'ingot': return round1(INGOT_W * item.n);
    }
    return 0;
  },

  // 所持重量 = 持ち物 + 装備
  charWeight(c) {
    let w = 0;
    for (const it of c.inv) w += this.weightOf(it);
    for (const slot of ['weapon', 'shield', 'armor']) w += this.weightOf(c.equip[slot]);
    return round1(w);
  },

  // 所持容量はSTR次第(UOのストーン制)
  capacity(c) { return round1(15 + c.str * 1.5); },

  canCarry(c, item) {
    return this.charWeight(c) + this.weightOf(item) <= this.capacity(c);
  },

  // キャラに持たせる(重量チェック)。成功なら true
  addToChar(c, item) {
    if (!this.canCarry(c, item)) return false;
    if (item.kind === 'stack' || item.kind === 'ore' || item.kind === 'ingot') {
      const ex = c.inv.find(i => i.kind === item.kind && i.id === item.id);
      if (ex) { ex.n += item.n; return true; }
    }
    c.inv.push(item);
    return true;
  },

  // パーティの持てる者に分配。prefer を優先。持てた者を返す(全員無理なら null)
  giveToParty(party, item, prefer) {
    const order = prefer ? [prefer, ...party.filter(c => c !== prefer)] : party;
    for (const c of order) {
      if (c.dead) continue;
      if (this.addToChar(c, item)) {
        UI.dirty.party = true;
        return c;
      }
    }
    return null;
  },

  // ===== スタック操作 =====
  count(c, id) {
    const i = c.inv.find(x => (x.kind === 'stack' || x.kind === 'ore' || x.kind === 'ingot') && x.id === id);
    return i ? i.n : 0;
  },

  consume(c, id, n) {
    const i = c.inv.find(x => (x.kind === 'stack' || x.kind === 'ore' || x.kind === 'ingot') && x.id === id);
    if (!i || i.n < n) return false;
    i.n -= n;
    if (i.n <= 0) c.inv.splice(c.inv.indexOf(i), 1);
    UI.dirty.party = true;
    return true;
  },

  partyCount(party, id) {
    return party.reduce((s, c) => s + this.count(c, id), 0);
  },

  // パーティ全体から n 個消費(複数人にまたがってよい)
  partyConsume(party, id, n) {
    if (this.partyCount(party, id) < n) return false;
    for (const c of party) {
      while (n > 0 && this.count(c, id) > 0) {
        const take = Math.min(n, this.count(c, id));
        this.consume(c, id, take);
        n -= take;
      }
    }
    return true;
  },

  // ===== 戦利品 =====
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

  // 拾得処理: 分配してログを出す。誰も持てなければその旨を表示
  award(party, item) {
    const c = this.giveToParty(party, item);
    if (c) UI.log(`${item.name}を手に入れた(${c.name}が携行)`, item.tierIdx >= 3 ? 'rare' : 'loot');
    else UI.log(`${item.name}を見つけたが、重すぎて誰も持てない…置いていった。`, 'warn');
    return !!c;
  },

  openChest(party, depth) {
    const gold = randInt(10 + depth * 8, 40 + depth * 18);
    Game.gold += gold;
    UI.log(`宝箱を開けた。${gold}ゴールド!`, 'loot');
    if (chance(0.5)) this.award(party, this.randomEquip(depth));
    if (chance(0.3)) this.award(party, this.makeStack('healpot', 1));
    if (chance(0.25)) {
      const metals = METALS.filter(m => m.depth <= depth);
      this.award(party, this.makeIngot(metals[metals.length - 1].id, randInt(2, 4)));
    }
    UI.dirty.party = true;
  },

  describe(item) {
    const w = this.weightOf(item);
    if (item.kind === 'weapon') {
      const wd = WEAPONS[item.type];
      const lo = Math.round(wd.dmg[0] * item.mult), hi = Math.round(wd.dmg[1] * item.mult);
      return `攻${lo}-${hi}${wd.range > 2 ? ' 遠隔' : ''} ${SKILLS[wd.skill].name}${item.accurate ? ' 命中+' : ''} 重${w}`;
    }
    if (item.kind === 'armor' || item.kind === 'shield') return `防+${item.def} 重${w}`;
    if (item.n !== undefined) return `×${item.n} 重${w}`;
    return `重${w}`;
  },

  // 装備(同キャラのinv内から)。装備品も重量に含むため容量は変わらない
  equip(c, item) {
    const slot = item.kind === 'weapon' ? 'weapon' : (item.kind === 'shield' ? 'shield' : 'armor');
    const idx = c.inv.indexOf(item);
    if (idx < 0) return;
    c.inv.splice(idx, 1);
    if (c.equip[slot]) c.inv.push(c.equip[slot]);
    c.equip[slot] = item;
    UI.log(`${c.name}は${item.name}を装備した。`, 'sys');
    UI.dirty.party = true;
  },
};
