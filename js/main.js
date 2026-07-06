'use strict';
// ゲーム進行: ターン制探索、状態遷移(タイトル ⇔ キャンプ ⇔ ダンジョン ⇔ 戦闘)

const Game = {
  state: 'title', // title | camp | dungeon | wipe
  party: [], gold: 0, storage: [], deepest: 1,
  run: null,      // { depth, floors: {depth: {map, packs}} }
  px: 0, py: 0,   // パーティ位置(タイル)
  turn: 0,
  sneaking: false,

  init() {
    Render.init();
    UI.init();
    UI.renderTitle();
    UI.show('titleScreen');
    window.addEventListener('keydown', e => this.onKey(e));
    requestAnimationFrame(() => this.frame());
  },

  map() { return this.run ? this.run.floors[this.run.depth].map : null; },
  packs() { return this.run ? this.run.floors[this.run.depth].packs : []; },
  aliveParty() { return this.party.filter(c => !c.dead); },

  removePack(pack) {
    const ps = this.packs();
    const i = ps.indexOf(pack);
    if (i >= 0) ps.splice(i, 1);
  },

  // ===== 開始・キャンプ =====
  newGame() {
    this.party = []; this.gold = 300; this.storage = []; this.deepest = 1;
    Save.clear();
    this.toCamp();
    UI.log('冒険者キャンプへようこそ。まずは酒場で仲間を集めよう。', 'good');
  },

  continueGame() {
    const d = Save.load();
    if (!d) return;
    this.party = d.party; this.gold = d.gold; this.storage = d.storage; this.deepest = d.deepest;
    this.toCamp();
    UI.log('冒険の続きだ。', 'good');
  },

  toCamp() {
    this.state = 'camp';
    this.run = null;
    this.sneaking = false;
    for (const c of this.party) {
      if (!c.dead) { c.hp = c.maxHp; c.mana = c.maxMana; }
      c.defending = false;
    }
    Save.save();
    UI.hide('titleScreen'); UI.hide('wipeScreen'); UI.hide('charPanel');
    UI.renderCamp();
    UI.show('campScreen');
    UI.dirty.party = true;
  },

  enterDungeon(floor) {
    if (this.aliveParty().length === 0) { UI.log('生きている仲間がいない!酒場か寺院へ。', 'warn'); return; }
    this.run = { depth: 0, floors: {} };
    UI.hide('campScreen');
    this.state = 'dungeon';
    this.gotoFloor(floor, 'down');
    UI.log(`地下${floor}階に足を踏み入れた。`, 'sys');
  },

  gotoFloor(depth, dir) {
    if (!this.run.floors[depth]) this.run.floors[depth] = Dungeon.generate(depth);
    this.run.depth = depth;
    const map = this.map();
    if (dir === 'up') { this.px = map.downX; this.py = map.downY; }
    else { this.px = map.spawnX; this.py = map.spawnY; }
    if (depth > this.deepest) {
      this.deepest = depth;
      UI.log(`最深記録を更新! 地下${depth}階`, 'rare');
    }
  },

  // ===== ターン進行 =====
  // n ターン経過させる。戦闘が始まったら true を返す
  advanceTurn(n, resting) {
    for (let i = 0; i < n; i++) {
      this.turn++;
      // 回復(瞑想スキルでマナ再生が伸びる)
      for (const c of this.party) {
        if (c.dead) continue;
        c.hp = Math.min(c.maxHp, c.hp + (resting ? 0.8 : 0.05));
        const med = c.skills.meditation.val;
        c.mana = Math.min(c.maxMana, c.mana + (0.06 + med * 0.012) * (resting ? 3 : 1));
        if (resting && c.mana < c.maxMana && chance(0.15)) {
          Skills.tryGain(c, 'meditation', clamp(100 - (c.mana / c.maxMana) * 100, 0, 90));
        }
      }
      // 敵の群れの行動
      const sneakFactor = this.sneaking ? clamp(1 - Skills.avgOf(this.party, 'hiding') / 130, 0.2, 0.85) : 1;
      for (const pk of [...this.packs()]) {
        if (Entities.packTurn(pk, this.map(), this.px, this.py, sneakFactor)) {
          this.startBattle(pk, false);
          return true;
        }
      }
      UI.dirty.party = true;
    }
    return false;
  },

  startBattle(pack, playerInitiated) {
    const ambush = playerInitiated && this.sneaking && !pack.aggro;
    this.sneaking = false;
    pack.aggro = true;
    UI.hide('charPanel');
    Battle.start(pack, ambush);
  },

  tryMove(dx, dy) {
    const nx = this.px + dx, ny = this.py + dy;
    const pk = this.packs().find(p => p.x === nx && p.y === ny);
    if (pk) { this.startBattle(pk, true); return; }
    if (!Dungeon.isWalkable(this.map(), nx + 0.5, ny + 0.5)) return;
    this.px = nx; this.py = ny;
    // 隠密移動: 歩くたびに隠密判定(下手だと敵に見つかりやすくなるだけ)
    if (this.sneaking && chance(0.3)) {
      for (const c of this.aliveParty()) if (chance(0.4)) Skills.tryGain(c, 'hiding', 40);
    }
    this.advanceTurn(1);
  },

  interact() {
    const map = this.map();
    const t = map.t[this.py * map.w + this.px];
    // 足元: 階段
    if (t === T_DOWN) {
      this.gotoFloor(this.run.depth + 1, 'down');
      UI.log(`地下${this.run.depth}階へ降りた。`, 'sys');
      return;
    }
    if (t === T_UP) {
      if (this.run.depth <= 1) {
        UI.log('地上へ戻った。', 'good');
        this.toCamp();
      } else {
        this.gotoFloor(this.run.depth - 1, 'up');
        UI.log(`地下${this.run.depth}階へ上がった。`, 'sys');
      }
      return;
    }
    // 周囲: 宝箱・鉱脈
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const tx = this.px + dx, ty = this.py + dy;
      if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) continue;
      const tt = map.t[ty * map.w + tx];
      if (tt === T_CHEST) {
        map.t[ty * map.w + tx] = T_FLOOR;
        delete map.meta[tx + ',' + ty];
        Items.openChest(this.party, this.run.depth);
        this.advanceTurn(1);
        return;
      }
      if (tt === T_ORE) {
        Crafting.mineAttempt(map, tx, ty);
        this.advanceTurn(2); // 採掘は2ターンかかる(敵は動く)
        return;
      }
    }
    UI.log('ここには何もない。', 'sys');
  },

  rest() {
    UI.log('その場で休息する…(10ターン)', 'sys');
    if (this.advanceTurn(10, true)) UI.log('休息が破られた!', 'warn');
    else UI.log('少し体力と精神が回復した。', 'heal');
  },

  quickBandage() {
    const healer = Skills.bestAt(this.party, 'healing');
    const target = this.aliveParty().sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp))[0];
    if (!healer || !target) return;
    if (target.hp >= target.maxHp) { UI.log('誰も傷ついていない。', 'sys'); return; }
    if (!Items.partyConsume(this.party, 'bandage', 1)) { UI.log('包帯がない。', 'sys'); return; }
    Skills.tryGain(healer, 'healing', clamp((1 - target.hp / target.maxHp) * 80 + 10, 0, 95));
    const hs = healer.skills.healing.val;
    if (chance(0.25 + hs / 150)) {
      const amt = Math.round(randF(6, 12) + hs * 0.45);
      target.hp = Math.min(target.maxHp, target.hp + amt);
      UI.log(`${healer.name}が${target.name}に包帯を巻いた。HP+${amt}(3ターン)`, 'heal');
    } else {
      UI.log(`${healer.name}の手当ては失敗した…(3ターン)`, 'warn');
    }
    this.advanceTurn(3);
  },

  toggleSneak() {
    this.sneaking = !this.sneaking;
    UI.log(this.sneaking ? '足音を殺して進む…(隠密移動)' : '隠密をやめた。', 'sys');
  },

  onWipe() {
    this.state = 'wipe';
    let lost = 0;
    for (const c of this.party) { lost += c.inv.length; c.inv = []; }
    const goldLost = Math.floor(this.gold * 0.3);
    this.gold -= goldLost;
    this.run = null;
    Save.save();
    UI.renderWipe(`携行品${lost}個と${goldLost}ゴールドを失った。ギルドの手で亡骸はキャンプへ運ばれた…`);
    UI.show('wipeScreen');
  },

  // ===== 入力 =====
  onKey(e) {
    if (this.state !== 'dungeon' || Battle.active) return;
    const k = e.key.toLowerCase();
    switch (k) {
      case 'w': case 'arrowup': this.tryMove(0, -1); break;
      case 's': case 'arrowdown': this.tryMove(0, 1); break;
      case 'a': case 'arrowleft': this.tryMove(-1, 0); break;
      case 'd': case 'arrowright': this.tryMove(1, 0); break;
      case 'e': this.interact(); break;
      case 'r': this.rest(); break;
      case 'b': this.quickBandage(); break;
      case 'h': this.toggleSneak(); break;
      case 'escape': UI.hide('charPanel'); break;
      case '1': case '2': case '3': case '4': case '5': case '6': {
        const i = parseInt(k) - 1;
        if (this.party[i]) UI.openChar(i);
        break;
      }
    }
  },

  frame() {
    Render.draw();
    if (this.state !== 'title') UI.refresh();
    requestAnimationFrame(() => this.frame());
  },
};

window.addEventListener('DOMContentLoaded', () => Game.init());
