'use strict';
// 生産: 採掘(ダンジョン内・ターン消費)、精錬・鍛冶(キャンプ)
// 作業は「パーティで最も腕の良い生存メンバー」が担当し、その者のスキルが伸びる

const Crafting = {
  // 隣接する鉱脈を1回採掘する(呼び出し側で2ターン経過させる)
  mineAttempt(map, tx, ty) {
    const meta = map.meta[tx + ',' + ty];
    if (!meta || !meta.metal) return;
    const miner = Skills.bestAt(Game.party, 'mining');
    if (!miner) return;
    const metal = METALS.find(m => m.id === meta.metal);
    Skills.tryGain(miner, 'mining', metal.diff);
    if (!chance(clamp(0.5 + (miner.skills.mining.val - metal.diff) / 40, 0.05, 0.95))) {
      UI.log(`${miner.name}は鉱石を砕いてしまった…`, 'warn');
    } else {
      const ore = Items.makeOre(metal.id, randInt(1, 2));
      if (Items.giveToParty(Game.party, ore, miner)) {
        UI.log(`${miner.name}は${ore.name}を${ore.n}個掘り出した!`, 'loot');
      } else {
        UI.log(`${ore.name}を掘り出したが、重すぎて誰も持てない…`, 'warn');
      }
    }
    meta.left--;
    if (meta.left <= 0) {
      map.t[ty * map.w + tx] = T_WALL;
      delete map.meta[tx + ',' + ty];
      UI.log('鉱脈は掘り尽くした。', 'sys');
    }
  },

  // キャンプ: パーティの鉱石を全て精錬(最良の採掘者が担当)
  smeltAll() {
    const miner = Skills.bestAt(Game.party, 'mining');
    if (!miner) return;
    let any = false;
    for (const metal of METALS) {
      // 鉱石だけを数える(インゴットと同じidなので kind で判別して集める)
      let oreN = 0;
      for (const c of Game.party) {
        const ore = c.inv.find(i => i.kind === 'ore' && i.id === metal.id);
        if (ore) oreN += ore.n;
      }
      if (oreN === 0) continue;
      any = true;
      let got = 0, lost = 0;
      for (let i = 0; i < oreN; i++) {
        Skills.tryGain(miner, 'mining', metal.diff);
        if (chance(clamp(0.6 + (miner.skills.mining.val - metal.diff) / 40, 0.1, 0.98))) got++;
        else lost++;
      }
      // 鉱石を没収してインゴットを付与
      for (const c of Game.party) {
        const ore = c.inv.find(i => i.kind === 'ore' && i.id === metal.id);
        if (ore) c.inv.splice(c.inv.indexOf(ore), 1);
      }
      if (got > 0) {
        const ing = Items.makeIngot(metal.id, got);
        if (!Items.giveToParty(Game.party, ing, miner)) {
          UI.log(`${metal.name}インゴットが重すぎて持てない…倉庫に置いた。`, 'sys');
          Game.storage.push(ing);
        }
      }
      UI.log(`${miner.name}が${metal.name}鉱石を精錬: インゴット${got}個${lost ? `(${lost}個失敗)` : ''}`, got ? 'loot' : 'warn');
    }
    if (!any) UI.log('精錬する鉱石がない。', 'sys');
    UI.dirty.party = true;
  },

  // インゴット所持数(鉱石と区別して数える)
  ingotCount(metalId) {
    let n = 0;
    for (const c of Game.party) {
      const ing = c.inv.find(i => i.kind === 'ingot' && i.id === metalId);
      if (ing) n += ing.n;
    }
    return n;
  },

  consumeIngots(metalId, n) {
    if (this.ingotCount(metalId) < n) return false;
    for (const c of Game.party) {
      const ing = c.inv.find(i => i.kind === 'ingot' && i.id === metalId);
      if (!ing) continue;
      const take = Math.min(n, ing.n);
      ing.n -= take; n -= take;
      if (ing.n <= 0) c.inv.splice(c.inv.indexOf(ing), 1);
      if (n <= 0) break;
    }
    return true;
  },

  // キャンプ: 鍛冶(最良の鍛冶師が担当)
  craft(recipe, metalId) {
    const smith = Skills.bestAt(Game.party, 'blacksmithy');
    if (!smith) return;
    const metal = METALS.find(m => m.id === metalId);
    if (this.ingotCount(metalId) < recipe.ingots) { UI.log('インゴットが足りない。', 'sys'); return; }
    this.consumeIngots(metalId, recipe.ingots);
    const diff = recipe.diff + metal.diff * 0.5;
    Skills.tryGain(smith, 'blacksmithy', diff);
    if (!chance(clamp(0.5 + (smith.skills.blacksmithy.val - diff) / 40, 0.05, 0.95))) {
      UI.log(`${smith.name}は鍛造に失敗し、インゴットを無駄にした…`, 'warn');
      UI.dirty.party = true;
      return;
    }
    let tier = metal.tierBias;
    if (chance(clamp(smith.skills.blacksmithy.val / 200, 0, 0.5))) tier++;
    let item;
    if (recipe.kind === 'weapon') item = Items.makeWeapon(recipe.type, tier, metalId);
    else if (recipe.kind === 'shield') item = Items.makeShield(recipe.type, tier);
    else item = Items.makeArmor(recipe.type, tier);
    if (!Items.giveToParty(Game.party, item, smith)) {
      Game.storage.push(item);
      UI.log(`${smith.name}は${item.name}を鍛え上げた!(重いので倉庫へ)`, tier >= 3 ? 'rare' : 'good');
    } else {
      UI.log(`${smith.name}は${item.name}を鍛え上げた!`, tier >= 3 ? 'rare' : 'good');
    }
    UI.dirty.party = true;
  },
};
