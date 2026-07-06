'use strict';
// UO風スキルシステム: 使うと上がる・合計キャップ・ロック(↑↓🔒)・ステータス成長
// キャラクター単位で管理する

const Skills = {
  totalSkill(c) {
    let t = 0;
    for (const id of SKILL_ORDER) t += c.skills[id].val;
    return round1(t);
  },

  totalStat(c) { return c.str + c.dex + c.int; },

  // スキル使用時に呼ぶ。diff=行為の難易度(0〜100)。成長したら true
  tryGain(c, id, diff) {
    const s = c.skills[id];
    if (s.lock !== 'up' || s.val >= 100) return false;

    // UO風: 難易度が現在値に見合うほど上がりやすく、格下相手では上がりにくい。
    // 高スキルほど成長率が落ちる。
    const over = s.val - diff;                       // どれだけ格下の行為か
    let ch = 0.45 * clamp(1 - over / 45, 0.05, 1);   // 格下ペナルティ
    ch *= (108 - s.val) / 108;                       // 高スキル減衰
    if (diff > s.val + 25) ch *= 0.35;               // 無謀な挑戦も上がりにくい
    if (!chance(clamp(ch, 0.01, 0.5))) return false;

    // 合計キャップ処理: ↓ロックのスキルを削って空きを作る
    if (this.totalSkill(c) >= SKILL_CAP) {
      const down = SKILL_ORDER.filter(k => c.skills[k].lock === 'down' && c.skills[k].val > 0);
      if (down.length === 0) return false; // 空きが作れない
      const victim = down.reduce((a, b) => (c.skills[a].val >= c.skills[b].val ? a : b));
      c.skills[victim].val = round1(c.skills[victim].val - 0.1);
    }

    s.val = round1(s.val + 0.1);
    UI.log(`${c.name}の${SKILLS[id].name}が ${s.val.toFixed(1)} に上昇!`, 'gain');
    if (s.val >= 100) UI.log(`${c.name}は${SKILLS[id].name}を極めた!(グランドマスター)`, 'gm');
    this.tryStatGain(c, id);
    UI.dirty.party = true;
    return true;
  },

  // スキル成長に付随するステータス成長
  tryStatGain(c, id) {
    if (!chance(0.35)) return;
    if (this.totalStat(c) >= STAT_CAP) return;
    const w = SKILLS[id].stat;
    const r = rand() * (w.str + w.dex + w.int);
    const stat = r < w.str ? 'str' : (r < w.str + w.dex ? 'dex' : 'int');
    if (c[stat] >= 100) return;
    // 高ステータスほど上がりにくい
    if (!chance((105 - c[stat]) / 105)) return;
    c[stat]++;
    Entities.recalc(c);
    const jp = { str: '筋力', dex: '敏捷', int: '知力' };
    UI.log(`${c.name}の${jp[stat]}が ${c[stat]} に上昇!`, 'stat');
    UI.dirty.party = true;
  },

  cycleLock(c, id) {
    const s = c.skills[id];
    s.lock = s.lock === 'up' ? 'down' : (s.lock === 'down' ? 'lock' : 'up');
  },

  // パーティ内で最もスキルが高い生存メンバー
  bestAt(party, id) {
    let best = null;
    for (const c of party) {
      if (c.dead) continue;
      if (!best || c.skills[id].val > best.skills[id].val) best = c;
    }
    return best;
  },

  // 生存メンバーの平均スキル値
  avgOf(party, id) {
    const alive = party.filter(c => !c.dead);
    if (alive.length === 0) return 0;
    return alive.reduce((s, c) => s + c.skills[id].val, 0) / alive.length;
  },
};
