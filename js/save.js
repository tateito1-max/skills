'use strict';
// localStorage セーブ/ロード(キャンプ帰還時に保存)

const SAVE_KEY = 'uodc_save_v2';

const Save = {
  save() {
    try {
      const data = {
        v: 2,
        party: Game.party,
        gold: Game.gold,
        storage: Game.storage,
        deepest: Game.deepest,
        uid: Items._uid,
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch (e) { /* プライベートモード等では保存不可 */ }
  },

  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const d = JSON.parse(raw);
      for (const c of d.party) {
        c.defending = false;
        Entities.recalc(c);
        c.hp = c.dead ? 0 : c.maxHp;
        c.mana = c.maxMana;
      }
      Items._uid = d.uid || 10000;
      return d;
    } catch (e) { return null; }
  },

  exists() {
    try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
  },

  clear() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
  },
};
