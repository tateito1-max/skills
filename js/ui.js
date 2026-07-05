'use strict';
// DOM UI: ログ、HUD、スキルパネル、インベントリ、キャンプ、タイトル、死亡画面

const UI = {
  dirty: { skills: true, inv: true },
  logEl: null,

  init() {
    this.logEl = document.getElementById('log');
    document.getElementById('skillPanel').addEventListener('click', e => this.onPanelClick(e));
    document.getElementById('invPanel').addEventListener('click', e => this.onPanelClick(e));
    document.getElementById('campScreen').addEventListener('click', e => this.onPanelClick(e));
    document.getElementById('titleScreen').addEventListener('click', e => this.onPanelClick(e));
    document.getElementById('deathScreen').addEventListener('click', e => this.onPanelClick(e));
  },

  log(msg, cls) {
    const div = document.createElement('div');
    div.className = 'msg ' + (cls || '');
    div.textContent = msg;
    this.logEl.appendChild(div);
    while (this.logEl.children.length > 60) this.logEl.removeChild(this.logEl.firstChild);
    this.logEl.scrollTop = this.logEl.scrollHeight;
  },

  toggle(id) {
    const el = document.getElementById(id);
    el.classList.toggle('hidden');
    if (!el.classList.contains('hidden')) {
      if (id === 'skillPanel') this.dirty.skills = true;
      if (id === 'invPanel') this.dirty.inv = true;
      this.refresh();
    }
  },

  show(id) { document.getElementById(id).classList.remove('hidden'); },
  hide(id) { document.getElementById(id).classList.add('hidden'); },

  // 毎フレーム: HUDバーと、開いていて dirty なパネルを更新
  refresh() {
    const p = Game.player;
    if (!p) return;
    this.setBar('hpBar', p.hp, p.maxHp);
    this.setBar('manaBar', p.mana, p.maxMana);
    this.setBar('stamBar', p.stam, p.maxStam);
    document.getElementById('depthLabel').textContent =
      Game.state === 'dungeon' ? `地下 ${Game.run.depth} 階` : 'キャンプ';
    document.getElementById('goldLabel').textContent = `💰 ${p.gold}`;
    const st = [];
    if (p.hidden) st.push('🫥隠密');
    if (p.meditating) st.push('🧘瞑想');
    if (p.bandT > 0) st.push('🩹手当て');
    if (p.cast) st.push('✨詠唱');
    if (p.mineT > 0) st.push('⛏採掘');
    document.getElementById('stateLabel').textContent = st.join(' ');

    const sp = document.getElementById('skillPanel');
    if (!sp.classList.contains('hidden') && this.dirty.skills) { this.renderSkills(p); this.dirty.skills = false; }
    const ip = document.getElementById('invPanel');
    if (!ip.classList.contains('hidden') && this.dirty.inv) { this.renderInv(p); this.dirty.inv = false; }
  },

  setBar(id, v, max) {
    const el = document.getElementById(id);
    el.querySelector('.fill').style.width = clamp(v / max * 100, 0, 100) + '%';
    el.querySelector('.txt').textContent = `${Math.ceil(v)}/${max}`;
  },

  lockIcon(lock) { return lock === 'up' ? '↑' : (lock === 'down' ? '↓' : '🔒'); },

  renderSkills(p) {
    const total = Skills.totalSkill(p);
    let html = `<h3>スキル <span class="cap ${total >= SKILL_CAP ? 'full' : ''}">${total.toFixed(1)} / ${SKILL_CAP}</span></h3>`;
    html += `<div class="stats">筋力 ${p.str} ・ 敏捷 ${p.dex} ・ 知力 ${p.int} <span class="cap">(${Skills.totalStat(p)}/${STAT_CAP})</span></div>`;
    let cat = '';
    for (const id of SKILL_ORDER) {
      const def = SKILLS[id], s = p.skills[id];
      if (def.cat !== cat) { cat = def.cat; html += `<div class="cat">${cat}</div>`; }
      html += `<div class="skillRow">
        <button class="lockBtn lock-${s.lock}" data-act="lock" data-id="${id}" title="↑成長 / ↓下降許可 / 🔒固定">${this.lockIcon(s.lock)}</button>
        <span class="sname">${def.name}</span>
        <span class="sbar"><span style="width:${s.val}%"></span></span>
        <span class="sval">${s.val.toFixed(1)}</span>
      </div>`;
    }
    html += `<div class="hint">合計が${SKILL_CAP}に達すると、↓のスキルを削って他が成長します。</div>`;
    document.getElementById('skillPanel').innerHTML = html;
  },

  renderInv(p) {
    let html = `<h3>装備と所持品</h3>`;
    html += `<div class="cat">装備中</div>`;
    for (const slot of ['weapon', 'shield', 'armor']) {
      const it = p.equip[slot];
      const label = { weapon: '武器', shield: '盾', armor: '鎧' }[slot];
      html += `<div class="itemRow"><span class="slot">${label}</span> ${it ? `<b>${it.name}</b> <i>${Items.describe(it)}</i>` : '<span class="dim">なし</span>'}
        ${it && slot !== 'weapon' ? `<button data-act="unequip" data-slot="${slot}">外す</button>` : ''}</div>`;
    }
    html += `<div class="cat">所持品(死ぬと失う)</div>`;
    if (p.inv.length === 0) html += `<div class="dim">なにも持っていない</div>`;
    for (const it of p.inv) {
      html += `<div class="itemRow"><b>${it.name}</b> <i>${Items.describe(it)}</i> `;
      if (it.kind === 'weapon' || it.kind === 'armor' || it.kind === 'shield')
        html += `<button data-act="equip" data-uid="${it.uid}">装備</button>`;
      if (it.kind === 'stack' && (it.id === 'healpot' || it.id === 'manapot'))
        html += `<button data-act="drink" data-id="${it.id}">飲む</button>`;
      html += `<button class="dim" data-act="drop" data-uid="${it.uid}">捨てる</button></div>`;
    }
    document.getElementById('invPanel').innerHTML = html;
  },

  // ===== キャンプ =====
  renderCamp() {
    const p = Game.player;
    const floors = [];
    for (let f = 1; f <= p.deepest; f += 5) floors.push(f);
    let html = `<div class="screenInner">
      <h2>🏕 冒険者キャンプ</h2>
      <p class="dim">傷は癒えた。倉庫のものは死んでも失わない。(ここで自動セーブ)</p>
      <div class="campCols">
      <div class="campBox">
        <h3>⚔ ダンジョンへ</h3>
        <p class="dim">最深到達: 地下${p.deepest}階</p>
        ${floors.map(f => `<button class="big" data-act="enter" data-floor="${f}">地下${f}階から潜る</button>`).join('')}
      </div>
      <div class="campBox">
        <h3>🔥 鍛冶場</h3>
        <button data-act="smelt">鉱石をすべて精錬</button>
        <div class="dim">金属:</div>
        <select id="metalSel">${METALS.filter(m => Items.count(p, m.id) > 0).map(m =>
          `<option value="${m.id}">${m.name} (${Items.count(p, m.id)})</option>`).join('') || '<option value="">インゴットなし</option>'}</select>
        ${RECIPES.map((r, i) => {
          const base = r.kind === 'weapon' ? WEAPONS[r.type] : (r.kind === 'shield' ? SHIELDS[r.type] : ARMORS[r.type]);
          return `<div class="itemRow">${base.name} <i>鋳塊${r.ingots} 難度${r.diff}</i> <button data-act="craft" data-i="${i}">鍛造</button></div>`;
        }).join('')}
      </div>
      <div class="campBox">
        <h3>🛒 売店 <span class="dim">💰${p.gold}</span></h3>
        ${SHOP.map(s => `<div class="itemRow">${s.name} <i>${s.gold}G</i> <button data-act="buy" data-id="${s.id}">買う</button></div>`).join('')}
        <h3>📦 倉庫</h3>
        <div class="dim">所持品 → 倉庫</div>
        ${p.inv.map(it => `<div class="itemRow">${it.name} <i>${Items.describe(it)}</i> <button data-act="store" data-uid="${it.uid}">預ける</button></div>`).join('') || '<div class="dim">なし</div>'}
        <div class="dim">倉庫 → 所持品</div>
        ${p.storage.map(it => `<div class="itemRow">${it.name} <i>${Items.describe(it)}</i> <button data-act="take" data-uid="${it.uid}">持ち出す</button></div>`).join('') || '<div class="dim">空</div>'}
      </div>
      </div>
      <p class="hint">C: スキル表 / I: 所持品はいつでも開けます</p>
    </div>`;
    document.getElementById('campScreen').innerHTML = html;
  },

  renderTitle() {
    let html = `<div class="screenInner">
      <h1>⚔ Depths of Sosaria</h1>
      <p>UO風スキル制ダンジョンクローラー — 使えば使うほど、その技は冴える。</p>`;
    if (Save.exists()) html += `<button class="big" data-act="continue">冒険を続ける</button><hr>`;
    html += `<p>生い立ちを選んで新たに始める:</p><div class="campCols">`;
    for (const t of TEMPLATES) {
      html += `<div class="campBox tpl" data-act="newgame" data-id="${t.id}">
        <h3>${t.name}</h3><p class="dim">${t.desc}</p>
        <p class="small">${Object.entries(t.skills).map(([k, v]) => `${SKILLS[k].name}${v}`).join(' / ')}</p>
      </div>`;
    }
    html += `</div>
      <p class="hint">移動: WASD/矢印 ・ E: 調べる(階段/宝箱/鉱脈) ・ 1-5: 魔法 ・ B: 包帯 ・ H: 隠密 ・ M: 瞑想 ・ C/I: パネル</p>
    </div>`;
    document.getElementById('titleScreen').innerHTML = html;
  },

  renderDeath(lost) {
    document.getElementById('deathScreen').innerHTML = `<div class="screenInner">
      <h1 class="deathTitle">汝、死せり…</h1>
      <p>${lost}</p>
      <p class="dim">スキルと装備・倉庫は失われない。</p>
      <button class="big" data-act="respawn">キャンプへ帰還する</button>
    </div>`;
  },

  // ===== クリックハンドラ(全パネル共通) =====
  onPanelClick(e) {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const p = Game.player;
    const act = el.dataset.act;
    switch (act) {
      case 'lock': Skills.cycleLock(p, el.dataset.id); break;
      case 'equip': {
        const it = p.inv.find(i => i.uid == el.dataset.uid);
        if (it) Items.equip(p, it);
        break;
      }
      case 'unequip': {
        const slot = el.dataset.slot;
        if (p.equip[slot]) { p.inv.push(p.equip[slot]); p.equip[slot] = null; this.dirty.inv = true; }
        break;
      }
      case 'drink': Combat.usePotion(p, el.dataset.id); break;
      case 'drop': {
        const i = p.inv.findIndex(x => x.uid == el.dataset.uid);
        if (i >= 0) { this.log(`${p.inv[i].name}を捨てた。`, 'sys'); p.inv.splice(i, 1); this.dirty.inv = true; }
        break;
      }
      case 'enter': Game.enterDungeon(parseInt(el.dataset.floor)); break;
      case 'smelt': Crafting.smeltAll(p); this.renderCamp(); break;
      case 'craft': {
        const sel = document.getElementById('metalSel');
        if (!sel || !sel.value) { this.log('まず鉱石を精錬してインゴットを作ろう。', 'sys'); break; }
        Crafting.craft(p, RECIPES[parseInt(el.dataset.i)], sel.value);
        Save.save(p);
        this.renderCamp();
        break;
      }
      case 'buy': {
        const s = SHOP.find(x => x.id === el.dataset.id);
        if (p.gold < s.gold) { this.log('ゴールドが足りない。', 'sys'); break; }
        p.gold -= s.gold;
        Items.addToInv(p, Items.makeStack(s.id, s.id === 'bandage' ? 10 : 1));
        this.log(`${s.name}を購入した。`, 'loot');
        this.dirty.inv = true;
        Save.save(p);
        this.renderCamp();
        break;
      }
      case 'store': {
        const i = p.inv.findIndex(x => x.uid == el.dataset.uid);
        if (i >= 0) { const it = p.inv.splice(i, 1)[0]; Items.addToInv(p, it, true); Save.save(p); this.renderCamp(); this.dirty.inv = true; }
        break;
      }
      case 'take': {
        const i = p.storage.findIndex(x => x.uid == el.dataset.uid);
        if (i >= 0) { const it = p.storage.splice(i, 1)[0]; Items.addToInv(p, it); Save.save(p); this.renderCamp(); this.dirty.inv = true; }
        break;
      }
      case 'continue': Game.startGame(Save.load()); break;
      case 'newgame': {
        Save.clear();
        const t = TEMPLATES.find(x => x.id === el.dataset.id);
        Game.startGame(Entities.makePlayer(t));
        break;
      }
      case 'respawn': Game.respawn(); break;
    }
    this.refresh();
  },
};
