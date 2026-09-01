#!/usr/bin/env node
"use strict";
/**
 * 属性耐性の適用方式を、現行式と候補式で並べて比較するシミュレーションである（Issue #129）。
 *
 *   現行式：攻撃に含まれる属性の耐性を単純加算する（Issue #67）
 *   候補式：攻撃内の属性構成比で耐性を重み付けする（Issue #129 / 現行prototype.htmlの実装）
 *
 * 2つのprototype.htmlを突き合わせるのではなく、同一の固定条件に対して両方の式を
 * このスクリプト内で計算して並べる。攻撃力・防御力・DEX / AGI補正・武器性能・敵耐性は
 * prototype.html のCONFIGから読み、このスクリプト側で調整しない。
 *
 * Human Verification前の影響確認が目的で、合否判定は行わない。数値はすべてPROTOTYPE ASSUMPTIONである。
 * 戦闘全体の回帰は既存の simulate_boss.js / simulate_endurance.js で別途確認する。
 *
 * 使い方:
 *   node scripts/compare_resistance_formula.js [prototype.html]
 */

const path = require("path");
const { loadPrototype } = require("./prototype_harness");

const file = process.argv[2] || path.join(__dirname, "..", "prototype.html");
const { api } = loadPrototype(file, {});
const CONFIG = api.CONFIG;
const equipment = CONFIG.battle.equipment;
const damageConfig = CONFIG.battle.damage;
const labels = CONFIG.battle.attributes.physical;

const weapon = (id) => equipment.weapons.find((entry) => entry.id === id);
const armor = (id) => equipment.armors.find((entry) => entry.id === id);
const enemy = (id) => CONFIG.battle.enemies.find((entry) => entry.id === id);
const playerAction = (id) => CONFIG.battle.player.actions.find((entry) => entry.id === id);

/* ---------- 比較する2つの耐性適用方式 ---------- */

const attributeTotal = (attributes) =>
  Object.keys(attributes).reduce((sum, key) => sum + attributes[key], 0);

// 現行式：含まれている属性の耐性をそのまま合計する
const simpleSumResistance = (attributes, table) =>
  Object.keys(attributes).reduce((sum, key) => sum + (table[key] || 0), 0);

// 候補式：攻撃内の属性構成比で重み付けする。属性倍率合計が0以下なら耐性を参照しない
const weightedResistance = (attributes, table) => {
  const total = attributeTotal(attributes);
  if (!(total > 0)) return 0;
  return Object.keys(attributes)
    .reduce((sum, key) => sum + (attributes[key] / total) * (table[key] || 0), 0);
};

/* ---------- ダメージ計算（式以外はPrototypeと同じ扱い） ---------- */

// 物理ダメージ = max(0, 物理攻撃力 × 属性倍率合計 - 物理防御力 × (1 + 対応耐性))
const baseDamage = (attack, defense, attributes, resistance) =>
  Math.max(0, attack * attributeTotal(attributes) - defense * (1 + resistance));

// DEX / AGI補正のみを適用した最終ダメージ（会心は発生しなかった場合）
const finalDamage = (base, dex, agi) =>
  Math.max(0, Math.floor(base * (1 + (dex - agi) / damageConfig.dexAgiDivisor)));

/* ---------- 固定条件 ---------- */

const playerStats = CONFIG.stats.initial;                 // Lv1初期値・SP未割り振り
const playerArmor = armor(equipment.starter.armor).def;   // 防具は初期装備で固定

const attackCases = [
  {
    label: "短剣 通常攻撃",
    attributes: weapon("trainingDagger").normalAttackAttributes,
    weaponAtk: weapon("trainingDagger").atk,
  },
  {
    label: "ブロンズソード 通常攻撃",
    attributes: weapon("bronzeSword").normalAttackAttributes,
    weaponAtk: weapon("bronzeSword").atk,
  },
  // Skillは武器の通常攻撃属性を参照しない（Issue #125）。武器はATKだけを寄与する
  {
    label: "強打（短剣装備）",
    attributes: playerAction("skill").attributes,
    weaponAtk: weapon("trainingDagger").atk,
  },
  {
    label: "強打（ブロンズソード装備）",
    attributes: playerAction("skill").attributes,
    weaponAtk: weapon("bronzeSword").atk,
  },
];

const slime = enemy("slime");
const goblin = enemy("goblin");
const defenderCases = [
  {
    label: "耐性0（ゴブリン）",
    stats: goblin.stats,
    table: goblin.resistances.physical,
  },
  {
    label: "斬耐性のみ（洞窟スライム）",
    stats: slime.stats,
    table: slime.resistances.physical,
  },
  // 複数耐性の挙動を見るための比較用仮想敵。洞窟スライムの能力値へ突・打耐性を足しただけで、
  // Prototypeの敵データは変更していない
  {
    label: "複数耐性（比較用仮想敵）",
    stats: slime.stats,
    table: { ...slime.resistances.physical, pierce: 0.2, blunt: 0.1 },
  },
];

/* ---------- 出力 ---------- */

const num = (value, digits = 2) => value.toFixed(digits);
const attributesText = (attributes) =>
  Object.keys(labels)
    .filter((key) => attributes[key])
    .map((key) => `${labels[key]}${attributes[key].toFixed(2)}`)
    .join(" / ");
const resistanceText = (table) => {
  const text = Object.keys(labels)
    .filter((key) => table[key])
    .map((key) => `${labels[key]}${table[key].toFixed(2)}`)
    .join(" / ");
  return text || "なし";
};
const pad = (value, width) => {
  const text = String(value);
  // 全角文字を2幅として数える
  const size = [...text].reduce((sum, char) => sum + (/[ -~]/.test(char) ? 1 : 2), 0);
  return text + " ".repeat(Math.max(0, width - size));
};

console.log("属性耐性の適用方式 比較（Issue #129 / PROTOTYPE ASSUMPTION）");
console.log(`対象ファイル: ${path.relative(process.cwd(), file) || file}`);
console.log("");
console.log("現行式: 対応耐性 = Σ 使用属性の耐性");
console.log("候補式: 対応耐性 = Σ (属性倍率 / 属性倍率合計) × 使用属性の耐性");
console.log("");
console.log(`プレイヤー: STR ${playerStats.STR} / DEX ${playerStats.DEX} ・ 防具DEF ${playerArmor}（Lv1初期・SP未割り振り）`);
console.log("最終ダメージはDEX / AGI補正のみを適用し、会心は発生しなかった場合の値である。");

for (const defender of defenderCases) {
  const defense = defender.stats.VIT;
  console.log("");
  console.log(`■ ${defender.label}　耐性: ${resistanceText(defender.table)}　VIT ${defense} / AGI ${defender.stats.AGI}`);
  console.log([
    pad("攻撃", 28), pad("属性配分", 30), pad("倍率計", 8),
    pad("対応耐性 現行→候補", 22), pad("基礎ダメージ 現行→候補", 26), "最終ダメージ 現行→候補",
  ].join(""));
  for (const attack of attackCases) {
    const power = playerStats.STR + attack.weaponAtk;
    const current = simpleSumResistance(attack.attributes, defender.table);
    const candidate = weightedResistance(attack.attributes, defender.table);
    const baseCurrent = baseDamage(power, defense, attack.attributes, current);
    const baseCandidate = baseDamage(power, defense, attack.attributes, candidate);
    const finalCurrent = finalDamage(baseCurrent, playerStats.DEX, defender.stats.AGI);
    const finalCandidate = finalDamage(baseCandidate, playerStats.DEX, defender.stats.AGI);
    const diff = finalCandidate - finalCurrent;
    console.log([
      pad(attack.label, 28),
      pad(attributesText(attack.attributes), 30),
      pad(num(attributeTotal(attack.attributes)), 8),
      pad(`${num(current)} → ${num(candidate)}`, 22),
      pad(`${num(baseCurrent)} → ${num(baseCandidate)}`, 26),
      `${finalCurrent} → ${finalCandidate}${diff === 0 ? "（同値）" : `（${diff > 0 ? "+" : ""}${diff}）`}`,
    ].join(""));
  }
}

console.log("");
console.log("単一属性の攻撃は現行式と候補式で対応耐性が一致し、複数属性の攻撃だけが変化する。");
console.log("式変更の影響を隠すための敵能力・武器性能の調整は行っていない。");
