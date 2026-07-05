'use strict';
// 生産: 採掘(ダンジョン内)、精錬・鍛冶(キャンプ)

const Crafting = {
  // 隣接する鉱脈タイルの採掘を開始
  startMine(p, map, tx, ty) {
    const meta = map.meta[tx + ',' + ty];
    if (!meta || !meta.metal) return;
    p.mineTarget = { tx, ty };
    p.mineT = clamp(3.5 - p.skills.mining.val / 45, 1.2, 3.5);
    p.hidden = false;
    UI.log('鉱脈を掘り始めた…', 'sys');
  },

  finishMine(p, map) {
    const t = p.mineTarget;
    p.mineT = 0; p.mineTarget = null;
    if (!t) return;
    const meta = map.meta[t.tx + ',' + t.ty];
    if (!meta || !meta.metal) return;
    const metal = METALS.find(m => m.id === meta.metal);
    Skills.tryGain(p, 'mining', metal.diff);
    if (!chance(clamp(0.5 + (p.skills.mining.val - metal.diff) / 40, 0.05, 0.95))) {
      UI.log('鉱石を砕いてしまった…', 'warn');
    } else {
      const n = randInt(1, 2);
      Items.addToInv(p, Items.makeOre(metal.id, n));
      UI.log(`${metal.name}鉱石を ${n} 個掘り出した!`, 'loot');
      UI.dirty.inv = true;
    }
    meta.left--;
    if (meta.left <= 0) {
      map.t[t.ty * map.w + t.tx] = T_WALL;
      delete map.meta[t.tx + ',' + t.ty];
      UI.log('鉱脈は掘り尽くした。', 'sys');
    }
  },

  // キャンプ: 手持ちの鉱石を全て精錬
  smeltAll(p) {
    const ores = p.inv.filter(i => i.kind === 'ore');
    if (ores.length === 0) { UI.log('精錬する鉱石がない。', 'sys'); return; }
    for (const ore of [...ores]) {
      const metal = METALS.find(m => m.id === ore.id);
      let got = 0, lost = 0;
      for (let i = 0; i < ore.n; i++) {
        Skills.tryGain(p, 'mining', metal.diff);
        if (chance(clamp(0.6 + (p.skills.mining.val - metal.diff) / 40, 0.1, 0.98))) got++;
        else lost++;
      }
      p.inv.splice(p.inv.indexOf(ore), 1);
      if (got > 0) Items.addToInv(p, Items.makeIngot(metal.id, got));
      UI.log(`${metal.name}鉱石を精錬: インゴット${got}個${lost ? `(${lost}個失敗)` : ''}`, got ? 'loot' : 'warn');
    }
    UI.dirty.inv = true;
  },

  // キャンプ: 鍛冶(metalId のインゴットで recipe を作る)
  craft(p, recipe, metalId) {
    const metal = METALS.find(m => m.id === metalId);
    if (Items.count(p, metalId) < recipe.ingots) { UI.log('インゴットが足りない。', 'sys'); return; }
    Items.consume(p, metalId, recipe.ingots);
    const diff = recipe.diff + metal.diff * 0.5;
    Skills.tryGain(p, 'blacksmithy', diff);
    if (!chance(clamp(0.5 + (p.skills.blacksmithy.val - diff) / 40, 0.05, 0.95))) {
      UI.log('鍛造に失敗し、インゴットを無駄にした…', 'warn');
      UI.dirty.inv = true;
      return;
    }
    // 高品質(Exceptional)判定でティア上昇。金属自体のボーナスも乗る
    let tier = metal.tierBias;
    if (chance(clamp(p.skills.blacksmithy.val / 200, 0, 0.5))) tier++;
    let item;
    if (recipe.kind === 'weapon') item = Items.makeWeapon(recipe.type, tier, metalId);
    else if (recipe.kind === 'shield') item = Items.makeShield(recipe.type, tier);
    else item = Items.makeArmor(recipe.type, tier);
    Items.addToInv(p, item);
    UI.log(`${item.name}を鍛え上げた!`, tier >= 3 ? 'rare' : 'good');
    UI.dirty.inv = true;
  },
};
