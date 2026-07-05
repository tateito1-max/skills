'use strict';
// UO風スキルシステム: 使うと上がる・合計キャップ・ロック(↑↓🔒)・ステータス成長

const Skills = {
  totalSkill(p) {
    let t = 0;
    for (const id of SKILL_ORDER) t += p.skills[id].val;
    return round1(t);
  },

  totalStat(p) { return p.str + p.dex + p.int; },

  // スキル使用時に呼ぶ。diff=行為の難易度(0〜100)。成長したら true
  tryGain(p, id, diff) {
    const s = p.skills[id];
    if (s.lock !== 'up' || s.val >= 100) return false;

    // UO風: 難易度が現在値に近いほど上がりやすく、格下相手では上がりにくい。
    // 高スキルほど成長率が落ちる。
    const over = s.val - diff;                       // どれだけ格下の行為か
    let c = 0.45 * clamp(1 - over / 45, 0.05, 1);    // 格下ペナルティ
    c *= (108 - s.val) / 108;                        // 高スキル減衰
    if (diff > s.val + 25) c *= 0.35;                // 無謀な挑戦も上がりにくい
    if (!chance(clamp(c, 0.01, 0.5))) return false;

    // 合計キャップ処理: ↓ロックのスキルを削って空きを作る
    if (this.totalSkill(p) >= SKILL_CAP) {
      const down = SKILL_ORDER.filter(k => p.skills[k].lock === 'down' && p.skills[k].val > 0);
      if (down.length === 0) return false; // 空きが作れない
      const victim = down.reduce((a, b) => (p.skills[a].val >= p.skills[b].val ? a : b));
      p.skills[victim].val = round1(p.skills[victim].val - 0.1);
    }

    s.val = round1(s.val + 0.1);
    UI.log(`${SKILLS[id].name}のスキルが ${s.val.toFixed(1)} に上昇した!`, 'gain');
    if (s.val >= 100) UI.log(`${SKILLS[id].name}を極めた!(グランドマスター)`, 'gm');
    this.tryStatGain(p, id);
    UI.dirty.skills = true;
    return true;
  },

  // スキル成長に付随するステータス成長
  tryStatGain(p, id) {
    if (!chance(0.35)) return;
    if (this.totalStat(p) >= STAT_CAP) return;
    const w = SKILLS[id].stat;
    const r = rand() * (w.str + w.dex + w.int);
    const stat = r < w.str ? 'str' : (r < w.str + w.dex ? 'dex' : 'int');
    if (p[stat] >= 100) return;
    // 高ステータスほど上がりにくい
    if (!chance((105 - p[stat]) / 105)) return;
    p[stat]++;
    Entities.recalc(p);
    const jp = { str: '筋力', dex: '敏捷', int: '知力' };
    UI.log(`${jp[stat]}が ${p[stat]} に上昇した!`, 'stat');
  },

  cycleLock(p, id) {
    const s = p.skills[id];
    s.lock = s.lock === 'up' ? 'down' : (s.lock === 'down' ? 'lock' : 'up');
    UI.dirty.skills = true;
  },
};
