'use strict';
// localStorage セーブ/ロード(キャンプ帰還時に保存)

const SAVE_KEY = 'uodc_save_v1';

const Save = {
  save(p) {
    try {
      const data = {
        v: 1,
        str: p.str, dex: p.dex, int: p.int,
        hp: p.hp, mana: p.mana, stam: p.stam,
        skills: p.skills,
        equip: p.equip,
        inv: p.inv, storage: p.storage,
        gold: p.gold, deepest: p.deepest,
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
      const p = Entities.makePlayer(TEMPLATES[0]);
      p.str = d.str; p.dex = d.dex; p.int = d.int;
      p.skills = d.skills;
      p.equip = d.equip;
      p.inv = d.inv; p.storage = d.storage || [];
      p.gold = d.gold; p.deepest = d.deepest || 1;
      Items._uid = d.uid || 1000;
      Entities.recalc(p);
      p.hp = p.maxHp; p.mana = p.maxMana; p.stam = p.maxStam;
      return p;
    } catch (e) { return null; }
  },

  exists() {
    try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
  },

  clear() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
  },
};
