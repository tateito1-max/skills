'use strict';
// ゲームデータ定義(スキル・武具・敵・魔法・金属・レシピ・重量)

const SKILL_CAP = 700;   // スキル合計キャップ(1キャラあたり。UOの700に準拠)
const STAT_CAP = 225;    // STR+DEX+INT の合計キャップ
const PARTY_MAX = 6;     // パーティ最大人数

// スキル定義。stat はスキル使用時に成長しうるステータスの重み
const SKILLS = {
  swords:      { name: '剣術',     cat: '戦闘', stat: { str: 0.6, dex: 0.3, int: 0.1 } },
  archery:     { name: '弓術',     cat: '戦闘', stat: { str: 0.2, dex: 0.7, int: 0.1 } },
  tactics:     { name: '戦術',     cat: '戦闘', stat: { str: 0.6, dex: 0.3, int: 0.1 } },
  parrying:    { name: '受け流し', cat: '戦闘', stat: { str: 0.4, dex: 0.5, int: 0.1 } },
  magery:      { name: '魔法',     cat: '魔法', stat: { str: 0.1, dex: 0.1, int: 0.8 } },
  meditation:  { name: '瞑想',     cat: '魔法', stat: { str: 0.0, dex: 0.1, int: 0.9 } },
  healing:     { name: '治療',     cat: '補助', stat: { str: 0.2, dex: 0.5, int: 0.3 } },
  hiding:      { name: '隠密',     cat: '補助', stat: { str: 0.0, dex: 0.8, int: 0.2 } },
  mining:      { name: '採掘',     cat: '生産', stat: { str: 0.7, dex: 0.2, int: 0.1 } },
  blacksmithy: { name: '鍛冶',     cat: '生産', stat: { str: 0.6, dex: 0.3, int: 0.1 } },
};
const SKILL_ORDER = ['swords', 'archery', 'tactics', 'parrying', 'magery', 'meditation', 'healing', 'hiding', 'mining', 'blacksmithy'];

// 武器タイプ。range>2 は後衛からも使える遠隔武器
const WEAPONS = {
  fists:      { name: '素手',           skill: 'swords',  dmg: [1, 3],   range: 1, w: 0 },
  dagger:     { name: 'ダガー',         skill: 'swords',  dmg: [3, 8],   range: 1, w: 1 },
  longsword:  { name: 'ロングソード',   skill: 'swords',  dmg: [6, 15],  range: 1, w: 4 },
  broadsword: { name: 'ブロードソード', skill: 'swords',  dmg: [8, 19],  range: 1, w: 5 },
  waraxe:     { name: 'ウォーアックス', skill: 'swords',  dmg: [11, 25], range: 1, w: 7 },
  bow:        { name: 'ボウ',           skill: 'archery', dmg: [8, 18],  range: 6, w: 3 },
  crossbow:   { name: 'クロスボウ',     skill: 'archery', dmg: [12, 26], range: 6, w: 5 },
};

const ARMORS = {
  leather: { name: 'レザーアーマー',     def: 3,  w: 4 },
  studded: { name: 'スタデッドアーマー', def: 5,  w: 6 },
  chain:   { name: 'チェインメイル',     def: 8,  w: 10 },
  plate:   { name: 'プレートメイル',     def: 12, w: 15 },
};

const SHIELDS = {
  buckler: { name: 'バックラー',       def: 2, w: 3 },
  heater:  { name: 'ヒーターシールド', def: 4, w: 5 },
};

// スタック品の1個あたり重量
const STACKABLE = {
  bandage: { name: '包帯',           w: 0.1 },
  healpot: { name: '回復ポーション', w: 0.5 },
  manapot: { name: 'マナポーション', w: 0.5 },
};
const ORE_W = 4, INGOT_W = 2; // 鉱石・インゴットの重量

// UO風の武器ティア接頭辞(ダメージ倍率)
const WEAPON_TIERS = [
  { name: '',                 mult: 1.0 },
  { name: 'ルーイン',         mult: 1.15 },
  { name: 'マイト',           mult: 1.3 },
  { name: 'フォース',         mult: 1.5 },
  { name: 'パワー',           mult: 1.7 },
  { name: 'ヴァンキッシング', mult: 2.0 },
];
// 防具ティア接頭辞(防御加算)
const ARMOR_TIERS = [
  { name: '',                     add: 0 },
  { name: 'ディフェンス',         add: 2 },
  { name: 'ガーディング',         add: 4 },
  { name: 'ハーデニング',         add: 6 },
  { name: 'フォーティフィケーション', add: 9 },
  { name: 'インバルネラビリティ', add: 13 },
];

// 敵定義。depth=出現開始階層、pack=群れの規模、ranged=後衛も狙える遠隔攻撃
const ENEMIES = {
  rat:      { name: 'ドブネズミ',   glyph: '🐀', depth: 1,  hp: 12,  skill: 10, dmg: [1, 4],   aggro: 5, gold: [0, 4],   armor: 0, pack: [2, 5] },
  bat:      { name: '巨大コウモリ', glyph: '🦇', depth: 1,  hp: 10,  skill: 15, dmg: [2, 5],   aggro: 6, gold: [0, 5],   armor: 0, pack: [2, 4] },
  slime:    { name: 'スライム',     glyph: '🟢', depth: 2,  hp: 26,  skill: 20, dmg: [3, 7],   aggro: 5, gold: [2, 10],  armor: 1, pack: [1, 3] },
  skeleton: { name: 'スケルトン',   glyph: '💀', depth: 2,  hp: 30,  skill: 30, dmg: [4, 10],  aggro: 7, gold: [4, 16],  armor: 2, pack: [2, 4] },
  zombie:   { name: 'ゾンビ',       glyph: '🧟', depth: 3,  hp: 48,  skill: 32, dmg: [5, 12],  aggro: 6, gold: [4, 18],  armor: 2, pack: [2, 4] },
  orc:      { name: 'オーク',       glyph: '👹', depth: 4,  hp: 55,  skill: 46, dmg: [7, 15],  aggro: 8, gold: [10, 35], armor: 4, pack: [2, 4] },
  ettin:    { name: 'エティン',     glyph: '👺', depth: 6,  hp: 90,  skill: 58, dmg: [10, 22], aggro: 8, gold: [20, 55], armor: 6, pack: [1, 2] },
  troll:    { name: 'トロール',     glyph: '🧌', depth: 8,  hp: 125, skill: 68, dmg: [13, 28], aggro: 8, gold: [30, 80], armor: 8, pack: [1, 2] },
  lich:     { name: 'リッチ',       glyph: '🌑', depth: 10, hp: 145, skill: 82, dmg: [18, 34], aggro: 9, gold: [60, 150], armor: 8, pack: [1, 2], ranged: true },
  dragon:   { name: 'ドラゴン',     glyph: '🐉', depth: 13, hp: 280, skill: 98, dmg: [24, 45], aggro: 9, gold: [150, 400], armor: 14, pack: [1, 1], ranged: true },
};

// 魔法。t=対象種別(enemy=敵1体 / group=敵グループ / ally=味方1人)
const SPELLS = [
  { id: 'marrow', name: 'マジックアロー',   mana: 4,  diff: 0,  t: 'enemy', dmg: [5, 10] },
  { id: 'heal',   name: 'ヒール',           mana: 6,  diff: 15, t: 'ally',  heal: [8, 18] },
  { id: 'fball',  name: 'ファイアボール',   mana: 10, diff: 32, t: 'group', dmg: [12, 22] },
  { id: 'bolt',   name: 'ライトニング',     mana: 15, diff: 52, t: 'enemy', dmg: [22, 38] },
  { id: 'gheal',  name: 'グレーターヒール', mana: 14, diff: 62, t: 'ally',  heal: [26, 46] },
];

// 金属(採掘)。depth=出現階層、diff=採掘/精錬難易度、tierBias=鍛冶時のティア補正
const METALS = [
  { id: 'iron',     name: 'アイアン',     depth: 1,  diff: 0,  color: '#9aa2ad', tierBias: 0 },
  { id: 'shadow',   name: 'シャドウ',     depth: 4,  diff: 30, color: '#5a5f6e', tierBias: 1 },
  { id: 'gold',     name: 'ゴールド',     depth: 7,  diff: 50, color: '#d9b23c', tierBias: 2 },
  { id: 'agapite',  name: 'アガパイト',   depth: 10, diff: 65, color: '#c47a5a', tierBias: 3 },
  { id: 'verite',   name: 'ヴェライト',   depth: 13, diff: 80, color: '#5aa06a', tierBias: 4 },
  { id: 'valorite', name: 'ヴァロライト', depth: 16, diff: 92, color: '#5a7ec4', tierBias: 5 },
];

// 鍛冶レシピ(インゴット数と難易度)
const RECIPES = [
  { kind: 'weapon', type: 'dagger',     ingots: 3,  diff: 5 },
  { kind: 'weapon', type: 'longsword',  ingots: 6,  diff: 25 },
  { kind: 'weapon', type: 'broadsword', ingots: 8,  diff: 40 },
  { kind: 'weapon', type: 'waraxe',     ingots: 10, diff: 55 },
  { kind: 'shield', type: 'buckler',    ingots: 4,  diff: 15 },
  { kind: 'shield', type: 'heater',     ingots: 7,  diff: 45 },
  { kind: 'armor',  type: 'chain',      ingots: 12, diff: 50 },
  { kind: 'armor',  type: 'plate',      ingots: 18, diff: 70 },
];

// 生い立ち(キャラ作成テンプレート)
const TEMPLATES = [
  {
    id: 'warrior', name: '剣士', desc: '剣と盾で前衛を張る。',
    skills: { swords: 35, tactics: 30, parrying: 20, healing: 15 },
    stats: { str: 30, dex: 25, int: 10 },
    weapon: 'longsword', shield: 'buckler', row: 'front',
  },
  {
    id: 'archer', name: '射手', desc: '後衛から弓で仕留める。',
    skills: { archery: 35, tactics: 30, hiding: 20, healing: 15 },
    stats: { str: 20, dex: 35, int: 10 },
    weapon: 'bow', shield: null, row: 'back',
  },
  {
    id: 'mage', name: '魔導士', desc: '攻撃魔法と瞑想。打たれ弱い。',
    skills: { magery: 35, meditation: 30, healing: 20, hiding: 15 },
    stats: { str: 15, dex: 15, int: 35 },
    weapon: 'dagger', shield: null, row: 'back',
  },
  {
    id: 'priest', name: '僧侶', desc: '回復魔法と手当てで支える。',
    skills: { magery: 25, meditation: 20, healing: 35, parrying: 20 },
    stats: { str: 20, dex: 20, int: 25 },
    weapon: 'dagger', shield: 'buckler', row: 'back',
  },
  {
    id: 'smith', name: '坑夫鍛冶', desc: '掘って鍛えて装備で勝つ。力持ち。',
    skills: { mining: 35, blacksmithy: 30, swords: 20, tactics: 15 },
    stats: { str: 35, dex: 20, int: 10 },
    weapon: 'dagger', shield: null, row: 'front',
  },
];

// キャラ名の候補
const NAMES = ['アイン', 'ベルガ', 'セシル', 'ドレイク', 'エルザ', 'フィン', 'ギデオン', 'ハンナ', 'イオリ', 'ヨルグ', 'カイ', 'リタ', 'ムジカ', 'ノア'];

// タイル種別
const T_WALL = 0, T_FLOOR = 1, T_UP = 2, T_DOWN = 3, T_ORE = 4, T_CHEST = 5;

const TILE = 32;              // タイル描画サイズ(px)
const VIEW_RADIUS = 8;        // 視界半径(タイル)

const SHOP = [
  { id: 'bandage', name: '包帯 ×10', gold: 30, n: 10 },
  { id: 'healpot', name: '回復ポーション', gold: 25, n: 1 },
  { id: 'manapot', name: 'マナポーション', gold: 25, n: 1 },
];
