'use strict';
// ゲームループ・入力・状態遷移(タイトル ⇔ キャンプ ⇔ ダンジョン)

const Game = {
  state: 'title', // title | camp | dungeon | dead
  player: null,
  run: null,      // { depth, floors: {depth: {map, enemies}} }
  keys: {},
  lastT: 0,

  init() {
    Render.init();
    UI.init();
    UI.renderTitle();
    UI.show('titleScreen');

    window.addEventListener('keydown', e => this.onKey(e));
    window.addEventListener('keyup', e => { this.keys[e.key.toLowerCase()] = false; });

    requestAnimationFrame(t => this.frame(t));
  },

  startGame(player) {
    if (!player) return;
    this.player = player;
    UI.hide('titleScreen');
    this.toCamp(false);
    UI.log('キャンプに到着した。装備を整えダンジョンへ潜ろう。', 'good');
  },

  toCamp(heal = true) {
    const p = this.player;
    this.state = 'camp';
    this.run = null;
    if (heal) {
      p.hp = p.maxHp; p.mana = p.maxMana; p.stam = p.maxStam;
    }
    p.hidden = false; p.meditating = false; p.cast = null; p.bandT = 0; p.mineT = 0;
    Save.save(p);
    UI.renderCamp();
    UI.show('campScreen');
    UI.dirty.skills = true; UI.dirty.inv = true;
  },

  enterDungeon(floor) {
    this.run = { depth: 0, floors: {} };
    UI.hide('campScreen');
    this.state = 'dungeon';
    this.gotoFloor(floor, 'down');
    UI.log(`地下${floor}階に足を踏み入れた。`, 'sys');
  },

  // フロア移動。同一ラン中は生成済みフロアを保持
  gotoFloor(depth, dir) {
    const p = this.player;
    if (!this.run.floors[depth]) this.run.floors[depth] = Dungeon.generate(depth);
    this.run.depth = depth;
    const f = this.run.floors[depth];
    if (dir === 'up') {
      // 下の階から上がってきた: 下り階段の位置に出る
      p.x = f.map.downX; p.y = f.map.downY;
    } else {
      p.x = f.map.spawnX; p.y = f.map.spawnY;
    }
    if (depth > p.deepest) {
      p.deepest = depth;
      UI.log(`最深記録を更新! 地下${depth}階`, 'rare');
    }
  },

  onDeath() {
    this.state = 'dead';
    const p = this.player;
    const nItems = p.inv.length;
    const goldLost = Math.floor(p.gold * 0.3);
    p.inv = [];
    p.gold -= goldLost;
    Save.save(p);
    UI.renderDeath(`持っていた品${nItems}個と${goldLost}ゴールドを失った。`);
    UI.show('deathScreen');
  },

  respawn() {
    const p = this.player;
    p.dead = false;
    p.hp = p.maxHp;
    UI.hide('deathScreen');
    this.toCamp();
  },

  onKey(e) {
    const k = e.key.toLowerCase();
    this.keys[k] = true;
    if (this.state !== 'dungeon') {
      if (k === 'c') UI.toggle('skillPanel');
      if (k === 'i') UI.toggle('invPanel');
      return;
    }
    const p = this.player;
    switch (k) {
      case 'c': UI.toggle('skillPanel'); break;
      case 'i': UI.toggle('invPanel'); break;
      case 'escape': UI.hide('skillPanel'); UI.hide('invPanel'); break;
      case 'b': Combat.startBandage(p); break;
      case 'h': Combat.tryHide(p, this.enemies()); break;
      case 'm': Combat.toggleMeditate(p); break;
      case 'e': this.interact(); break;
      case '1': case '2': case '3': case '4': case '5':
        Combat.startCast(p, parseInt(k) - 1); break;
    }
  },

  enemies() { return this.run ? this.run.floors[this.run.depth].enemies : []; },
  map() { return this.run ? this.run.floors[this.run.depth].map : null; },

  // E: 足元と周囲1タイルを調べる(階段・宝箱・鉱脈)
  interact() {
    const p = this.player, map = this.map();
    const cx = Math.floor(p.x), cy = Math.floor(p.y);
    const spots = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    for (const [dx, dy] of spots) {
      const tx = cx + dx, ty = cy + dy;
      if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) continue;
      const t = map.t[ty * map.w + tx];
      if (t === T_DOWN && dx === 0 && dy === 0) {
        this.gotoFloor(this.run.depth + 1, 'down');
        UI.log(`地下${this.run.depth}階へ降りた。`, 'sys');
        return;
      }
      if (t === T_UP && dx === 0 && dy === 0) {
        if (this.run.depth <= 1) {
          UI.log('地上へ戻った。', 'good');
          this.toCamp();
        } else {
          this.gotoFloor(this.run.depth - 1, 'up');
          UI.log(`地下${this.run.depth}階へ上がった。`, 'sys');
        }
        return;
      }
      if (t === T_CHEST) {
        map.t[ty * map.w + tx] = T_FLOOR;
        delete map.meta[tx + ',' + ty];
        Items.openChest(p, this.run.depth);
        return;
      }
      if (t === T_ORE) {
        Crafting.startMine(p, map, tx, ty);
        return;
      }
    }
    UI.log('ここには何もない。', 'sys');
  },

  frame(t) {
    const dt = Math.min(0.05, (t - this.lastT) / 1000 || 0.016);
    this.lastT = t;

    if (this.state === 'dungeon' && !this.player.dead) {
      const p = this.player, map = this.map(), enemies = this.enemies();

      // 移動入力
      let dx = 0, dy = 0;
      if (this.keys['w'] || this.keys['arrowup']) dy -= 1;
      if (this.keys['s'] || this.keys['arrowdown']) dy += 1;
      if (this.keys['a'] || this.keys['arrowleft']) dx -= 1;
      if (this.keys['d'] || this.keys['arrowright']) dx += 1;
      const moving = dx !== 0 || dy !== 0;
      if (moving) {
        const len = Math.hypot(dx, dy);
        let spd = 4.2 * (p.hidden ? 0.55 : 1) * (p.stam <= 2 ? 0.6 : 1);
        Entities.moveEntity(map, p, dx / len * spd * dt, dy / len * spd * dt, 0.3);
      }

      Combat.updatePlayer(p, enemies, map, dt, moving);
      for (const e of enemies) Entities.updateEnemy(e, p, map, dt);
      Render.update(dt);
      Render.draw(p, map, enemies);
    } else if (this.player) {
      Render.update(dt);
      Render.draw(this.player, this.map(), this.run ? this.enemies() : []);
    }

    if (this.player) UI.refresh();
    requestAnimationFrame(tt => this.frame(tt));
  },
};

window.addEventListener('DOMContentLoaded', () => Game.init());
