'use strict';
// ウィザードリィ風コマンド戦闘: 敵グループ vs パーティ(前衛/後衛)、ラウンド制

const Battle = {
  active: false,
  groups: [], pack: null,
  cmds: [], order: [], curIdx: 0, round: 1,
  pending: null,   // コマンド選択の途中状態 {stage, act, spellIdx, itemId}
  ambush: false,   // 隠密からの先制
  lines: [],       // 戦闘ログ

  start(pack, ambush) {
    this.active = true;
    this.pack = pack;
    this.groups = Entities.buildGroups(pack);
    this.round = 1;
    this.ambush = ambush;
    this.lines = [];
    for (const c of Game.party) c.defending = false;
    const desc = this.groups.map(g => `${g.name} ×${g.members.length}`).join('、');
    this.bl(`${desc} が立ちはだかる!`, 'warn');
    if (ambush) this.bl('奇襲成功!このラウンド、敵は動けない!', 'good');
    this.beginCommandPhase();
    UI.showBattle();
  },

  bl(msg, cls) {
    this.lines.push({ msg, cls: cls || '' });
    if (this.lines.length > 200) this.lines.shift();
  },

  aliveChars() { return Game.party.filter(c => !c.dead); },
  aliveMembers(g) { return g.members.filter(m => m.hp > 0); },
  aliveGroups() { return this.groups.filter(g => this.aliveMembers(g).length > 0); },

  // 実効前衛: 前衛が全滅していれば後衛が前衛扱い
  effectiveFront() {
    const front = this.aliveChars().filter(c => c.row === 'front');
    return front.length > 0 ? front : this.aliveChars();
  },

  isFrontEff(c) { return this.effectiveFront().includes(c); },

  canMelee(c) {
    const w = Entities.weaponOf(c);
    return WEAPONS[w.type].range > 2 || this.isFrontEff(c);
  },

  // ===== コマンド選択フェーズ =====
  beginCommandPhase() {
    this.cmds = [];
    this.curIdx = 0;
    this.pending = null;
    this.phase = 'command';
    this.skipDeadCursor();
  },

  currentChar() {
    return this.aliveChars()[this.curIdx] || null;
  },

  skipDeadCursor() {
    if (this.curIdx >= this.aliveChars().length) this.resolveRound();
  },

  pushCmd(cmd) {
    this.cmds.push(cmd);
    this.pending = null;
    this.curIdx++;
    this.skipDeadCursor();
    UI.renderBattle();
  },

  // ---- UI から呼ばれる ----
  cmdAttack() {
    const c = this.currentChar();
    if (!this.canMelee(c)) { this.bl(`${c.name}は後衛からでは届かない!(遠隔武器が必要)`, 'warn'); UI.renderBattle(); return; }
    const gs = this.aliveGroups();
    if (gs.length === 1) { this.pushCmd({ char: c, act: 'attack', group: gs[0] }); return; }
    this.pending = { stage: 'group', act: 'attack' };
    UI.renderBattle();
  },

  cmdSpell() {
    this.pending = { stage: 'spell' };
    UI.renderBattle();
  },

  cmdDefend() {
    this.pushCmd({ char: this.currentChar(), act: 'defend' });
  },

  cmdItem() {
    this.pending = { stage: 'item' };
    UI.renderBattle();
  },

  cmdFlee() {
    // パーティ全体で逃走を試みる(このラウンドの残りメンバーは行動しない)
    this.phase = 'resolve';
    this.resolveFlee();
  },

  pickSpell(i) {
    const c = this.currentChar();
    const sp = SPELLS[i];
    if (c.mana < sp.mana) { this.bl(`${c.name}のマナが足りない。`, 'sys'); this.pending = null; UI.renderBattle(); return; }
    if (sp.t === 'ally') { this.pending = { stage: 'ally', act: 'spell', spellIdx: i }; }
    else {
      const gs = this.aliveGroups();
      if (gs.length === 1) { this.pushCmd({ char: c, act: 'spell', spellIdx: i, group: gs[0] }); return; }
      this.pending = { stage: 'group', act: 'spell', spellIdx: i };
    }
    UI.renderBattle();
  },

  pickItem(id) {
    this.pending = { stage: 'ally', act: 'item', itemId: id };
    UI.renderBattle();
  },

  pickGroup(gi) {
    const c = this.currentChar();
    const g = this.aliveGroups()[gi];
    if (!g) return;
    const p = this.pending;
    if (p.act === 'attack') this.pushCmd({ char: c, act: 'attack', group: g });
    else this.pushCmd({ char: c, act: 'spell', spellIdx: p.spellIdx, group: g });
  },

  pickAlly(i) {
    const c = this.currentChar();
    const ally = Game.party[i];
    if (!ally || ally.dead) return;
    const p = this.pending;
    if (p.act === 'spell') this.pushCmd({ char: c, act: 'spell', spellIdx: p.spellIdx, ally });
    else this.pushCmd({ char: c, act: 'item', itemId: p.itemId, ally });
  },

  cancel() {
    this.pending = null;
    UI.renderBattle();
  },

  // ===== 解決フェーズ =====
  resolveFlee() {
    const avgDex = this.aliveChars().reduce((s, c) => s + c.dex, 0) / this.aliveChars().length;
    const ch = clamp(0.45 + avgDex / 250 + Skills.avgOf(Game.party, 'hiding') / 400 - this.pack.depth * 0.008, 0.15, 0.9);
    if (chance(ch)) {
      this.bl('うまく逃げ切った!', 'good');
      this.end('fled');
      return;
    }
    this.bl('回り込まれた!逃げられない!', 'warn');
    // 逃走失敗: 敵だけが行動
    for (const g of this.groups) {
      for (const m of [...this.aliveMembers(g)]) {
        if (this.aliveChars().length === 0) break;
        this.enemyAct(g, m);
      }
    }
    if (this.checkEnd()) return;
    this.round++;
    this.beginCommandPhase();
    UI.renderBattle();
  },

  resolveRound() {
    this.phase = 'resolve';
    const actors = [];
    for (const cmd of this.cmds) {
      actors.push({ side: 'p', spd: cmd.char.dex + randInt(0, 20), cmd });
    }
    if (!(this.ambush && this.round === 1)) {
      for (const g of this.groups) {
        for (const m of this.aliveMembers(g)) {
          actors.push({ side: 'e', spd: g.skill * 0.5 + randInt(0, 20), group: g, member: m });
        }
      }
    }
    actors.sort((a, b) => b.spd - a.spd);

    this.bl(`―― 第${this.round}ラウンド ――`, 'round');
    for (const a of actors) {
      if (this.aliveGroups().length === 0 || this.aliveChars().length === 0) break;
      if (a.side === 'p') {
        const c = a.cmd.char;
        if (c.dead) continue;
        this.execCmd(a.cmd);
      } else {
        if (a.member.hp <= 0) continue;
        this.enemyAct(a.group, a.member);
      }
    }

    for (const c of Game.party) c.defending = false;
    if (this.checkEnd()) return;
    this.round++;
    this.beginCommandPhase();
    UI.renderBattle();
  },

  execCmd(cmd) {
    const c = cmd.char;
    switch (cmd.act) {
      case 'attack': this.charAttack(c, cmd.group); break;
      case 'spell': this.castSpell(c, cmd); break;
      case 'defend': c.defending = true; this.bl(`${c.name}は身を固めている。`, 'sys'); break;
      case 'item': this.useItem(c, cmd); break;
    }
  },

  // 攻撃対象グループが全滅していたら別グループへ
  retarget(group) {
    if (this.aliveMembers(group).length > 0) return group;
    return this.aliveGroups()[0] || null;
  },

  charAttack(c, group) {
    group = this.retarget(group);
    if (!group) return;
    const w = Entities.weaponOf(c);
    const wd = WEAPONS[w.type];
    if (wd.range <= 2 && !this.isFrontEff(c)) { this.bl(`${c.name}の攻撃は届かない!`, 'sys'); return; }
    const target = this.aliveMembers(group)[0];
    const atk = c.skills[wd.skill].val + (w.accurate ? 10 : 0);
    Skills.tryGain(c, wd.skill, group.skill);
    if (!chance(clamp((atk + 20) / ((group.skill + 20) * 2), 0.05, 0.95))) {
      this.bl(`${c.name}の攻撃は${group.name}にかわされた。`, 'miss');
      return;
    }
    let dmg = randF(wd.dmg[0], wd.dmg[1]) * (w.mult || 1);
    dmg *= 1 + c.str / 300 + c.skills.tactics.val / 160;
    dmg -= randF(group.armor * 0.3, group.armor * 0.7);
    dmg = Math.max(1, Math.round(dmg));
    Skills.tryGain(c, 'tactics', group.skill);
    this.damageMember(group, target, dmg, `${c.name}の一撃!`);
  },

  damageMember(group, member, dmg, prefix) {
    member.hp -= dmg;
    if (member.hp <= 0) {
      this.bl(`${prefix} ${group.name}に${dmg}ダメージ — 倒した!`, 'kill');
    } else {
      this.bl(`${prefix} ${group.name}に${dmg}ダメージ。`, 'hit');
    }
  },

  castSpell(c, cmd) {
    const sp = SPELLS[cmd.spellIdx];
    if (c.mana < sp.mana) { this.bl(`${c.name}のマナが尽きている。`, 'sys'); return; }
    c.mana -= sp.mana;
    Skills.tryGain(c, 'magery', sp.diff);
    if (!chance(clamp(0.5 + (c.skills.magery.val - sp.diff) / 25, 0.05, 0.98))) {
      this.bl(`${c.name}の${sp.name}は失敗した!(フィズル)`, 'miss');
      return;
    }
    const power = 1 + c.skills.magery.val / 180;
    if (sp.t === 'ally') {
      const ally = cmd.ally.dead ? this.aliveChars()[0] : cmd.ally;
      if (!ally) return;
      const amt = Math.round(randF(sp.heal[0], sp.heal[1]) * power);
      ally.hp = Math.min(ally.maxHp, ally.hp + amt);
      this.bl(`${c.name}の${sp.name}!${ally.name}のHPが${amt}回復。`, 'heal');
    } else if (sp.t === 'group') {
      const group = this.retarget(cmd.group);
      if (!group) return;
      this.bl(`${c.name}の${sp.name}が${group.name}の群れを包む!`, 'magic');
      for (const m of [...this.aliveMembers(group)]) {
        const dmg = Math.max(1, Math.round(randF(sp.dmg[0], sp.dmg[1]) * power * 0.7));
        this.damageMember(group, m, dmg, '炎が走る —');
      }
    } else {
      const group = this.retarget(cmd.group);
      if (!group) return;
      const target = this.aliveMembers(group)[0];
      const dmg = Math.max(1, Math.round(randF(sp.dmg[0], sp.dmg[1]) * power));
      this.bl(`${c.name}の${sp.name}!`, 'magic');
      this.damageMember(group, target, dmg, '魔力が炸裂 —');
    }
  },

  useItem(c, cmd) {
    const ally = cmd.ally.dead ? c : cmd.ally;
    if (!Items.consume(c, cmd.itemId, 1)) { this.bl(`${c.name}はアイテムを持っていなかった。`, 'sys'); return; }
    if (cmd.itemId === 'healpot') {
      const amt = randInt(15, 30);
      ally.hp = Math.min(ally.maxHp, ally.hp + amt);
      this.bl(`${c.name}は回復ポーションを${ally === c ? '飲んだ' : ally.name + 'に使った'}。HP+${amt}`, 'heal');
    } else if (cmd.itemId === 'manapot') {
      const amt = randInt(15, 30);
      ally.mana = Math.min(ally.maxMana, ally.mana + amt);
      this.bl(`${c.name}はマナポーションを${ally === c ? '飲んだ' : ally.name + 'に使った'}。MP+${amt}`, 'magic');
    } else if (cmd.itemId === 'bandage') {
      Skills.tryGain(c, 'healing', clamp((1 - ally.hp / ally.maxHp) * 80 + 10, 0, 95));
      const hs = c.skills.healing.val;
      if (chance(0.25 + hs / 150)) {
        const amt = Math.round(randF(6, 12) + hs * 0.45);
        ally.hp = Math.min(ally.maxHp, ally.hp + amt);
        this.bl(`${c.name}は${ally.name}に包帯を巻いた。HP+${amt}`, 'heal');
      } else {
        this.bl(`${c.name}の手当ては失敗した…`, 'miss');
      }
    }
  },

  enemyAct(group, member) {
    // 遠隔は誰でも、近接は実効前衛のみ狙える
    const targets = group.ranged ? this.aliveChars() : this.effectiveFront();
    if (targets.length === 0) return;
    const c = choice(targets);
    const def = Entities.weaponSkillVal(c) + (c.defending ? 15 : 0);
    if (!chance(clamp((group.skill + 20) / ((def + 20) * 2), 0.05, 0.95))) {
      this.bl(`${group.name}の攻撃を${c.name}はかわした。`, 'miss');
      return;
    }
    let dmg = randF(group.dmg[0], group.dmg[1]);
    if (c.equip.shield) {
      Skills.tryGain(c, 'parrying', group.skill);
      if (chance(c.skills.parrying.val / 220 * (c.defending ? 1.6 : 1))) {
        this.bl(`${c.name}は盾で受け流した!`, 'good');
        dmg *= 0.25;
      }
    }
    dmg -= randF(Entities.armorOf(c) * 0.3, Entities.armorOf(c) * 0.7);
    if (c.defending) dmg *= 0.5;
    dmg = Math.max(1, Math.round(dmg));
    c.hp -= dmg;
    if (c.hp <= 0) {
      c.hp = 0; c.dead = true;
      this.bl(`${group.name}の攻撃!${c.name}は倒れた…!`, 'death');
    } else {
      this.bl(`${group.name}の攻撃!${c.name}に${dmg}ダメージ。`, 'ehit');
    }
    UI.dirty.party = true;
  },

  checkEnd() {
    if (this.aliveChars().length === 0) { this.end('wipe'); return true; }
    if (this.aliveGroups().length === 0) { this.victory(); return true; }
    return false;
  },

  victory() {
    this.bl('敵を全て打ち倒した!', 'good');
    let gold = 0;
    for (const g of this.groups) {
      for (let i = 0; i < g.members.length; i++) gold += randInt(g.gold[0], g.gold[1]);
    }
    Game.gold += gold;
    UI.log(`戦闘に勝利!${gold}ゴールドを得た。`, 'loot');
    const depth = this.pack.depth;
    const rolls = Math.min(3, Math.ceil(this.groups.reduce((s, g) => s + g.members.length, 0) * 0.4));
    for (let i = 0; i < rolls; i++) {
      if (chance(0.3)) Items.award(Game.party, Items.randomEquip(depth));
      if (chance(0.2)) Items.award(Game.party, Items.makeStack('bandage', randInt(2, 4)));
      if (chance(0.12)) Items.award(Game.party, Items.makeStack(chance(0.6) ? 'healpot' : 'manapot', 1));
    }
    this.end('victory');
  },

  end(result) {
    this.active = false;
    if (result === 'victory') {
      Game.removePack(this.pack);
    } else if (result === 'fled') {
      this.pack.cooldown = 6;
      this.pack.aggro = false;
      UI.log('命からがら逃げ出した。', 'sys');
    } else if (result === 'wipe') {
      UI.hideBattle();
      Game.onWipe();
      return;
    }
    UI.hideBattle();
    UI.dirty.party = true;
  },
};
