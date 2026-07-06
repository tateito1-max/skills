'use strict';
// DOM UI: ログ、HUD、パーティカード、キャラパネル、キャンプ、タイトル、戦闘画面

const UI = {
  dirty: { party: true },
  logEl: null,
  charIdx: -1, // 開いているキャラパネル

  init() {
    this.logEl = document.getElementById('log');
    for (const id of ['campScreen', 'titleScreen', 'wipeScreen', 'charPanel', 'battleScreen', 'partyHud']) {
      document.getElementById(id).addEventListener('click', e => this.onClick(e));
    }
  },

  log(msg, cls) {
    const div = document.createElement('div');
    div.className = 'msg ' + (cls || '');
    div.textContent = msg;
    this.logEl.appendChild(div);
    while (this.logEl.children.length > 80) this.logEl.removeChild(this.logEl.firstChild);
    this.logEl.scrollTop = this.logEl.scrollHeight;
  },

  show(id) { document.getElementById(id).classList.remove('hidden'); },
  hide(id) { document.getElementById(id).classList.add('hidden'); },

  refresh() {
    document.getElementById('depthLabel').textContent =
      Game.state === 'dungeon' ? `地下 ${Game.run.depth} 階` : (Game.state === 'camp' ? 'キャンプ' : '');
    document.getElementById('goldLabel').textContent = `💰 ${Game.gold}`;
    document.getElementById('turnLabel').textContent = Game.state === 'dungeon' ? `⏳ ${Game.turn}` : '';
    document.getElementById('sneakLabel').textContent = Game.sneaking ? '🫥 隠密移動中' : '';
    if (this.dirty.party) {
      this.renderPartyHud();
      if (this.charIdx >= 0 && !document.getElementById('charPanel').classList.contains('hidden')) this.renderChar();
      this.dirty.party = false;
    }
  },

  barHtml(v, max, cls) {
    return `<span class="mbar ${cls}"><span style="width:${clamp(v / Math.max(1, max) * 100, 0, 100)}%"></span></span>`;
  },

  renderPartyHud() {
    let html = '';
    Game.party.forEach((c, i) => {
      const w = Items.charWeight(c), cap = Items.capacity(c);
      html += `<div class="ccard ${c.dead ? 'deadCard' : ''}" data-act="open-char" data-i="${i}">
        <div class="cname">${c.dead ? '☠ ' : ''}${c.name} <span class="crow">${c.row === 'front' ? '前' : '後'}</span></div>
        <div class="cline">HP ${this.barHtml(c.hp, c.maxHp, 'hp')} <span class="cnum">${Math.ceil(c.hp)}</span></div>
        <div class="cline">MP ${this.barHtml(c.mana, c.maxMana, 'mp')} <span class="cnum">${Math.floor(c.mana)}</span></div>
        <div class="cline cw ${w > cap * 0.9 ? 'heavy' : ''}">⚖ ${w} / ${cap}</div>
      </div>`;
    });
    if (Game.party.length === 0) html = '<div class="dim" style="padding:8px">パーティがいない — 酒場で仲間を作ろう</div>';
    document.getElementById('partyHud').innerHTML = html;
  },

  openChar(i) {
    this.charIdx = i;
    this.renderChar();
    this.show('charPanel');
  },

  lockIcon(lock) { return lock === 'up' ? '↑' : (lock === 'down' ? '↓' : '🔒'); },

  renderChar() {
    const c = Game.party[this.charIdx];
    if (!c) { this.hide('charPanel'); return; }
    const total = Skills.totalSkill(c);
    const w = Items.charWeight(c), cap = Items.capacity(c);
    let html = `<button class="closeBtn" data-act="close-char">✕</button>
      <h3>${c.dead ? '☠ ' : ''}${c.name} <span class="cap">(${TEMPLATES.find(t => t.id === c.tplId).name})</span></h3>
      <div class="stats">筋力 ${c.str} ・ 敏捷 ${c.dex} ・ 知力 ${c.int} <span class="cap">(${Skills.totalStat(c)}/${STAT_CAP})</span></div>
      <div class="stats">HP ${Math.ceil(c.hp)}/${c.maxHp} ・ MP ${Math.floor(c.mana)}/${c.maxMana}
        ・ <b class="${w > cap ? 'heavy' : ''}">重量 ${w}/${cap}</b></div>
      <div class="stats">隊列: <b>${c.row === 'front' ? '前衛' : '後衛'}</b> <button data-act="toggle-row">前後入替</button></div>`;

    // スキル
    html += `<div class="cat">スキル <span class="cap ${total >= SKILL_CAP ? 'full' : ''}">${total.toFixed(1)} / ${SKILL_CAP}</span></div>`;
    let cat = '';
    for (const id of SKILL_ORDER) {
      const def = SKILLS[id], s = c.skills[id];
      if (def.cat !== cat) { cat = def.cat; html += `<div class="cat2">${cat}</div>`; }
      html += `<div class="skillRow">
        <button class="lockBtn lock-${s.lock}" data-act="lock" data-id="${id}" title="↑成長 / ↓下降許可 / 🔒固定">${this.lockIcon(s.lock)}</button>
        <span class="sname">${def.name}</span>
        <span class="sbar"><span style="width:${s.val}%"></span></span>
        <span class="sval">${s.val.toFixed(1)}</span>
      </div>`;
    }

    // 探索中の回復魔法
    if (Game.state === 'dungeon' && !c.dead) {
      html += `<div class="cat">行動</div>`;
      for (let i = 0; i < SPELLS.length; i++) {
        const sp = SPELLS[i];
        if (sp.t !== 'ally') continue;
        html += `<button data-act="cast-heal" data-i="${i}" ${c.mana < sp.mana ? 'disabled' : ''}>${sp.name}(MP${sp.mana})</button>`;
      }
    }

    // 装備
    html += `<div class="cat">装備(重量に含む)</div>`;
    for (const slot of ['weapon', 'shield', 'armor']) {
      const it = c.equip[slot];
      const label = { weapon: '武器', shield: '盾', armor: '鎧' }[slot];
      html += `<div class="itemRow"><span class="slot">${label}</span> ${it ? `<b>${it.name}</b> <i>${Items.describe(it)}</i>` : '<span class="dim">なし</span>'}
        ${it && slot !== 'weapon' ? `<button data-act="unequip" data-slot="${slot}">外す</button>` : ''}</div>`;
    }

    // 所持品
    html += `<div class="cat">所持品(全滅すると失う)</div>`;
    if (c.inv.length === 0) html += `<div class="dim">なにも持っていない</div>`;
    const others = Game.party.map((o, i) => ({ o, i })).filter(x => x.i !== this.charIdx && !x.o.dead);
    for (const it of c.inv) {
      html += `<div class="itemRow"><b>${it.name}</b> <i>${Items.describe(it)}</i> `;
      if (it.kind === 'weapon' || it.kind === 'armor' || it.kind === 'shield')
        html += `<button data-act="equip" data-uid="${it.uid}">装備</button>`;
      if (it.kind === 'stack' && (it.id === 'healpot' || it.id === 'manapot') && !c.dead)
        html += `<button data-act="drink" data-id="${it.id}">飲む</button>`;
      for (const { o, i } of others)
        html += `<button class="giveBtn" data-act="give" data-uid="${it.uid}" data-to="${i}" title="${o.name}に渡す">→${o.name.slice(0, 2)}</button>`;
      html += `<button class="dim" data-act="drop" data-uid="${it.uid}">捨てる</button></div>`;
    }
    document.getElementById('charPanel').innerHTML = html;
  },

  // ===== キャンプ =====
  renderCamp() {
    const floors = [];
    for (let f = 1; f <= Game.deepest; f += 5) floors.push(f);
    const deadChars = Game.party.map((c, i) => ({ c, i })).filter(x => x.c.dead);
    let html = `<div class="screenInner">
      <h2>🏕 冒険者キャンプ</h2>
      <p class="dim">生存者は全回復した。倉庫のものは全滅しても失わない。(ここで自動セーブ)</p>
      <div class="campCols">

      <div class="campBox">
        <h3>🍺 酒場 <span class="dim">${Game.party.length}/${PARTY_MAX}人</span></h3>
        ${Game.party.map((c, i) => `<div class="itemRow">${c.dead ? '☠ ' : ''}<b>${c.name}</b>
          <i>${TEMPLATES.find(t => t.id === c.tplId).name}/${c.row === 'front' ? '前' : '後'}</i>
          <button data-act="up-char" data-i="${i}" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button data-act="row-char" data-i="${i}">前後</button>
          <button class="dim" data-act="del-char" data-i="${i}">解雇</button></div>`).join('') || '<div class="dim">まだ誰もいない</div>'}
        ${Game.party.length < PARTY_MAX ? `
          <div class="cat">新しい仲間</div>
          <input id="newName" placeholder="名前(空欄でおまかせ)" maxlength="8">
          <select id="newTpl">${TEMPLATES.map(t => `<option value="${t.id}">${t.name} — ${t.desc}</option>`).join('')}</select>
          <button data-act="create-char">作成</button>
          ${Game.party.length === 0 ? '<button class="big" data-act="auto-party">おまかせで4人編成</button>' : ''}` : ''}
      </div>

      <div class="campBox">
        <h3>⚔ ダンジョンへ</h3>
        <p class="dim">最深到達: 地下${Game.deepest}階</p>
        ${floors.map(f => `<button class="big" data-act="enter" data-floor="${f}">地下${f}階から潜る</button>`).join('')}
        <h3>⛪ 寺院</h3>
        ${deadChars.length === 0 ? '<div class="dim">死者はいない</div>' :
          deadChars.map(({ c, i }) => {
            const cost = Math.min(Game.gold, Math.floor(100 + Skills.totalSkill(c) * 1.5));
            return `<div class="itemRow">☠ ${c.name} <button data-act="revive" data-i="${i}">蘇生(${cost}G)</button></div>`;
          }).join('')}
      </div>

      <div class="campBox">
        <h3>🔥 鍛冶場</h3>
        <button data-act="smelt">鉱石をすべて精錬</button>
        <div class="dim">金属:</div>
        <select id="metalSel">${METALS.filter(m => Crafting.ingotCount(m.id) > 0).map(m =>
          `<option value="${m.id}">${m.name} (${Crafting.ingotCount(m.id)})</option>`).join('') || '<option value="">インゴットなし</option>'}</select>
        ${RECIPES.map((r, i) => {
          const base = r.kind === 'weapon' ? WEAPONS[r.type] : (r.kind === 'shield' ? SHIELDS[r.type] : ARMORS[r.type]);
          return `<div class="itemRow">${base.name} <i>鋳塊${r.ingots} 難度${r.diff}</i> <button data-act="craft" data-i="${i}">鍛造</button></div>`;
        }).join('')}
      </div>

      <div class="campBox">
        <h3>🛒 売店 <span class="dim">💰${Game.gold}</span></h3>
        ${SHOP.map(s => `<div class="itemRow">${s.name} <i>${s.gold}G</i> <button data-act="buy" data-id="${s.id}">買う</button></div>`).join('')}
        <h3>📦 倉庫</h3>
        <div class="dim">所持品 → 倉庫</div>
        ${Game.party.flatMap((c, ci) => c.inv.map(it =>
          `<div class="itemRow"><span class="dim">${c.name}:</span> ${it.name} <i>${Items.describe(it)}</i> <button data-act="store" data-ci="${ci}" data-uid="${it.uid}">預ける</button></div>`)).join('') || '<div class="dim">なし</div>'}
        <div class="dim">倉庫 → 所持品(持てる者へ)</div>
        ${Game.storage.map(it => `<div class="itemRow">${it.name} <i>${Items.describe(it)}</i> <button data-act="take" data-uid="${it.uid}">持ち出す</button></div>`).join('') || '<div class="dim">空</div>'}
      </div>
      </div>
      <p class="hint">下のパーティカードをクリックするとスキル・装備を確認できます</p>
    </div>`;
    document.getElementById('campScreen').innerHTML = html;
  },

  renderTitle() {
    let html = `<div class="screenInner">
      <h1>⚔ Depths of Sosaria</h1>
      <p>UOスキル制 × ウィザードリィ風パーティ制 ダンジョンクローラー</p>
      <p class="dim">使えば使うほど技は冴える。持てる重さは筋力次第。</p>`;
    if (Save.exists()) html += `<button class="big" data-act="continue">冒険を続ける</button>`;
    html += `<button class="big" data-act="new">はじめから(酒場でパーティ編成)</button>
      <p class="hint">移動: WASD/矢印(1歩=1ターン) ・ E: 調べる ・ R: 休息 ・ B: 包帯 ・ H: 隠密 ・ 1-6: キャラ表示</p>
    </div>`;
    document.getElementById('titleScreen').innerHTML = html;
  },

  renderWipe(msg) {
    document.getElementById('wipeScreen').innerHTML = `<div class="screenInner">
      <h1 class="deathTitle">全滅…</h1>
      <p>${msg}</p>
      <p class="dim">スキル・装備・倉庫は失われない。寺院で仲間を蘇生しよう。</p>
      <button class="big" data-act="to-camp">キャンプへ</button>
    </div>`;
  },

  // ===== 戦闘画面 =====
  showBattle() { this.renderBattle(); this.show('battleScreen'); },
  hideBattle() { this.hide('battleScreen'); },

  renderBattle() {
    const B = Battle;
    let html = `<div class="battleInner">`;

    // 敵グループ
    html += `<div class="egroups">`;
    B.groups.forEach((g, gi) => {
      const alive = B.aliveMembers(g);
      const label = String.fromCharCode(65 + gi);
      html += `<div class="egroup ${alive.length === 0 ? 'gdead' : ''}">
        <div class="gname">${label}) ${g.glyph} ${g.name} ×${alive.length}</div>
        <div class="gpips">${g.members.map(m =>
          `<span class="pip" style="opacity:${m.hp <= 0 ? 0.15 : 0.35 + 0.65 * m.hp / m.maxHp}"></span>`).join('')}</div>
      </div>`;
    });
    html += `</div>`;

    // 戦闘ログ
    html += `<div class="blog" id="blog">${B.lines.map(l => `<div class="msg ${l.cls}">${l.msg}</div>`).join('')}</div>`;

    // パーティ状態
    html += `<div class="bparty">`;
    Game.party.forEach((c, i) => {
      const cur = B.phase === 'command' && B.currentChar() === c;
      html += `<div class="bcard ${c.dead ? 'deadCard' : ''} ${cur ? 'bcur' : ''}">
        <div class="cname">${c.dead ? '☠ ' : ''}${c.name} <span class="crow">${c.row === 'front' ? '前' : '後'}</span></div>
        <div class="cline">HP ${this.barHtml(c.hp, c.maxHp, 'hp')} <span class="cnum">${Math.ceil(c.hp)}</span></div>
        <div class="cline">MP ${this.barHtml(c.mana, c.maxMana, 'mp')} <span class="cnum">${Math.floor(c.mana)}</span></div>
      </div>`;
    });
    html += `</div>`;

    // コマンド
    html += `<div class="bcmd">`;
    const c = B.currentChar();
    if (B.phase === 'command' && c) {
      if (!B.pending) {
        html += `<span class="bwho">${c.name}の行動:</span>
          <button data-act="b-attack" ${B.canMelee(c) ? '' : 'disabled title="後衛からは遠隔武器のみ"'}>⚔ 戦う</button>
          <button data-act="b-spell">✨ 呪文</button>
          <button data-act="b-defend">🛡 防御</button>
          <button data-act="b-item">🧪 アイテム</button>
          <button data-act="b-flee">🏃 逃走(全員)</button>`;
      } else if (B.pending.stage === 'spell') {
        html += `<span class="bwho">呪文:</span>` + SPELLS.map((sp, i) =>
          `<button data-act="b-pick-spell" data-i="${i}" ${c.mana < sp.mana ? 'disabled' : ''}>${sp.name}(${sp.mana})</button>`).join('') +
          `<button class="dim" data-act="b-cancel">戻る</button>`;
      } else if (B.pending.stage === 'item') {
        const opts = ['healpot', 'manapot', 'bandage'].filter(id => Items.count(c, id) > 0);
        html += `<span class="bwho">アイテム:</span>` + (opts.length ? opts.map(id =>
          `<button data-act="b-pick-item" data-id="${id}">${STACKABLE[id].name}×${Items.count(c, id)}</button>`).join('') :
          '<span class="dim">使えるものがない</span>') +
          `<button class="dim" data-act="b-cancel">戻る</button>`;
      } else if (B.pending.stage === 'group') {
        html += `<span class="bwho">対象:</span>` + B.aliveGroups().map((g, i) =>
          `<button data-act="b-pick-group" data-i="${i}">${String.fromCharCode(65 + B.groups.indexOf(g))}) ${g.name}</button>`).join('') +
          `<button class="dim" data-act="b-cancel">戻る</button>`;
      } else if (B.pending.stage === 'ally') {
        html += `<span class="bwho">誰に:</span>` + Game.party.map((a, i) =>
          a.dead ? '' : `<button data-act="b-pick-ally" data-i="${i}">${a.name}</button>`).join('') +
          `<button class="dim" data-act="b-cancel">戻る</button>`;
      }
    }
    html += `</div></div>`;

    document.getElementById('battleScreen').innerHTML = html;
    const blog = document.getElementById('blog');
    if (blog) blog.scrollTop = blog.scrollHeight;
  },

  // ===== クリックハンドラ =====
  onClick(e) {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act;
    const c = Game.party[this.charIdx];

    switch (act) {
      // タイトル・全滅
      case 'continue': Game.continueGame(); break;
      case 'new': Game.newGame(); break;
      case 'to-camp': Game.toCamp(); break;

      // パーティカード・キャラパネル
      case 'open-char': this.openChar(parseInt(el.dataset.i)); break;
      case 'close-char': this.hide('charPanel'); this.charIdx = -1; break;
      case 'lock': Skills.cycleLock(c, el.dataset.id); this.renderChar(); break;
      case 'toggle-row': c.row = c.row === 'front' ? 'back' : 'front'; this.dirty.party = true; this.renderChar(); break;
      case 'equip': {
        const it = c.inv.find(i => i.uid == el.dataset.uid);
        if (it) Items.equip(c, it);
        this.renderChar(); break;
      }
      case 'unequip': {
        const slot = el.dataset.slot;
        if (c.equip[slot]) { c.inv.push(c.equip[slot]); c.equip[slot] = null; this.dirty.party = true; }
        this.renderChar(); break;
      }
      case 'drink': {
        if (!Items.consume(c, el.dataset.id, 1)) break;
        const amt = randInt(15, 30);
        if (el.dataset.id === 'healpot') { c.hp = Math.min(c.maxHp, c.hp + amt); this.log(`${c.name}は回復ポーションを飲んだ。HP+${amt}`, 'heal'); }
        else { c.mana = Math.min(c.maxMana, c.mana + amt); this.log(`${c.name}はマナポーションを飲んだ。MP+${amt}`, 'magic'); }
        this.renderChar(); break;
      }
      case 'give': {
        const it = c.inv.find(i => i.uid == el.dataset.uid);
        const to = Game.party[parseInt(el.dataset.to)];
        if (!it || !to) break;
        // スタックは1個ずつではなく丸ごと渡す
        if (!Items.canCarry(to, it)) { this.log(`${to.name}は重くて持てない!`, 'warn'); break; }
        c.inv.splice(c.inv.indexOf(it), 1);
        Items.addToChar(to, it);
        this.log(`${c.name}は${it.name}を${to.name}に渡した。`, 'sys');
        this.dirty.party = true; this.renderChar(); break;
      }
      case 'drop': {
        const i = c.inv.findIndex(x => x.uid == el.dataset.uid);
        if (i >= 0) { this.log(`${c.name}は${c.inv[i].name}を捨てた。`, 'sys'); c.inv.splice(i, 1); this.dirty.party = true; }
        this.renderChar(); break;
      }
      case 'cast-heal': {
        if (Game.state !== 'dungeon' || Battle.active) break;
        const sp = SPELLS[parseInt(el.dataset.i)];
        if (c.mana < sp.mana) break;
        c.mana -= sp.mana;
        const target = Game.aliveParty().sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp))[0];
        Skills.tryGain(c, 'magery', sp.diff);
        if (!chance(clamp(0.5 + (c.skills.magery.val - sp.diff) / 25, 0.05, 0.98))) {
          this.log(`${c.name}の${sp.name}は失敗した!`, 'warn');
        } else {
          const amt = Math.round(randF(sp.heal[0], sp.heal[1]) * (1 + c.skills.magery.val / 180));
          target.hp = Math.min(target.maxHp, target.hp + amt);
          this.log(`${c.name}の${sp.name}!${target.name}のHPが${amt}回復。`, 'heal');
        }
        Game.advanceTurn(1);
        this.dirty.party = true; this.renderChar(); break;
      }

      // 酒場
      case 'create-char': {
        if (Game.party.length >= PARTY_MAX) break;
        const nameIn = document.getElementById('newName').value.trim();
        const used = Game.party.map(x => x.name);
        const name = nameIn || choice(NAMES.filter(n => !used.includes(n))) || 'ナナシ';
        const tpl = TEMPLATES.find(t => t.id === document.getElementById('newTpl').value);
        Game.party.push(Entities.makeChar(name, tpl));
        this.log(`${name}(${tpl.name})が仲間に加わった!`, 'good');
        Save.save(); this.renderCamp(); this.dirty.party = true; break;
      }
      case 'auto-party': {
        const picks = ['warrior', 'smith', 'archer', 'priest'];
        const used = [];
        for (const id of picks) {
          if (Game.party.length >= PARTY_MAX) break;
          const name = choice(NAMES.filter(n => !used.includes(n)));
          used.push(name);
          Game.party.push(Entities.makeChar(name, TEMPLATES.find(t => t.id === id)));
        }
        this.log('4人のパーティが結成された!', 'good');
        Save.save(); this.renderCamp(); this.dirty.party = true; break;
      }
      case 'del-char': {
        const i = parseInt(el.dataset.i);
        this.log(`${Game.party[i].name}はパーティを去った。`, 'sys');
        Game.party.splice(i, 1);
        Save.save(); this.renderCamp(); this.dirty.party = true; break;
      }
      case 'row-char': {
        const ch = Game.party[parseInt(el.dataset.i)];
        ch.row = ch.row === 'front' ? 'back' : 'front';
        Save.save(); this.renderCamp(); this.dirty.party = true; break;
      }
      case 'up-char': {
        const i = parseInt(el.dataset.i);
        if (i > 0) { const [ch] = Game.party.splice(i, 1); Game.party.splice(i - 1, 0, ch); }
        Save.save(); this.renderCamp(); this.dirty.party = true; break;
      }

      // 寺院
      case 'revive': {
        const ch = Game.party[parseInt(el.dataset.i)];
        const cost = Math.min(Game.gold, Math.floor(100 + Skills.totalSkill(ch) * 1.5));
        Game.gold -= cost;
        ch.dead = false; ch.hp = ch.maxHp; ch.mana = ch.maxMana;
        this.log(`${ch.name}は蘇った!(${cost}G)`, 'good');
        Save.save(); this.renderCamp(); this.dirty.party = true; break;
      }

      // ダンジョン・鍛冶・売店・倉庫
      case 'enter': Game.enterDungeon(parseInt(el.dataset.floor)); break;
      case 'smelt': Crafting.smeltAll(); this.renderCamp(); break;
      case 'craft': {
        const sel = document.getElementById('metalSel');
        if (!sel || !sel.value) { this.log('まず鉱石を精錬してインゴットを作ろう。', 'sys'); break; }
        Crafting.craft(RECIPES[parseInt(el.dataset.i)], sel.value);
        Save.save(); this.renderCamp(); break;
      }
      case 'buy': {
        const s = SHOP.find(x => x.id === el.dataset.id);
        if (Game.gold < s.gold) { this.log('ゴールドが足りない。', 'sys'); break; }
        const item = Items.makeStack(s.id, s.n);
        const who = Items.giveToParty(Game.party, item);
        if (!who) { this.log('全員の荷物が重すぎて持てない!', 'warn'); break; }
        Game.gold -= s.gold;
        this.log(`${s.name}を購入した(${who.name}が携行)。`, 'loot');
        Save.save(); this.renderCamp(); this.dirty.party = true; break;
      }
      case 'store': {
        const ch = Game.party[parseInt(el.dataset.ci)];
        const i = ch.inv.findIndex(x => x.uid == el.dataset.uid);
        if (i >= 0) { Game.storage.push(ch.inv.splice(i, 1)[0]); Save.save(); this.renderCamp(); this.dirty.party = true; }
        break;
      }
      case 'take': {
        const i = Game.storage.findIndex(x => x.uid == el.dataset.uid);
        if (i < 0) break;
        const it = Game.storage[i];
        const who = Items.giveToParty(Game.party, it);
        if (!who) { this.log('重すぎて誰も持てない!', 'warn'); break; }
        Game.storage.splice(i, 1);
        Save.save(); this.renderCamp(); this.dirty.party = true; break;
      }

      // 戦闘
      case 'b-attack': Battle.cmdAttack(); break;
      case 'b-spell': Battle.cmdSpell(); break;
      case 'b-defend': Battle.cmdDefend(); break;
      case 'b-item': Battle.cmdItem(); break;
      case 'b-flee': Battle.cmdFlee(); break;
      case 'b-pick-spell': Battle.pickSpell(parseInt(el.dataset.i)); break;
      case 'b-pick-item': Battle.pickItem(el.dataset.id); break;
      case 'b-pick-group': Battle.pickGroup(parseInt(el.dataset.i)); break;
      case 'b-pick-ally': Battle.pickAlly(parseInt(el.dataset.i)); break;
      case 'b-cancel': Battle.cancel(); break;
    }
    this.refresh();
  },
};
