#!/usr/bin/env node
"use strict";
/**
 * 第1層ボス（ゴブリン・ウォーロード）と戦力差の関係を確認するシミュレーションである（Issue #105）。
 *
 * 装備強化段階とプレイヤー成長段階を変えて同じボスと戦い、勝率・所要ターン・残HPの差を見る。
 * Human Verification前の強度確認が目的で、合否判定は行わない。数値はすべてPROTOTYPE ASSUMPTIONである。
 *
 * 使い方:
 *   node scripts/simulate_boss.js [prototype.html] [試行回数]
 */

const path = require("path");
const { loadPrototype } = require("./prototype_harness");

const file = process.argv[2] || path.join(__dirname, "..", "prototype.html");
const trials = Number.parseInt(process.argv[3], 10) || 300;
const BOSS_ID = "goblinWarlord";

const instance = loadPrototype(file, {});
const api = instance.api;
const CONFIG = api.CONFIG;
const boss = CONFIG.battle.bosses.find((entry) => entry.id === BOSS_ID);
const maxHp = CONFIG.battle.player.maxHp;
const maxMp = CONFIG.battle.player.maxMp;

// 成長段階。SPは筋力・体力へ均等に割り振った想定（Prototypeの割り振り可能ステータス）
const PROFILES = [
  { label: "Lv1初期", stats: {} },
  { label: "Lv5相当(SP4)", stats: { STR: 2, VIT: 2 } },
  { label: "Lv7相当(SP6)", stats: { STR: 3, VIT: 3 } },
  { label: "Lv10相当(SP9)", stats: { STR: 5, VIT: 4 } },
  { label: "Lv15相当(SP14)", stats: { STR: 7, VIT: 7 } },
];
const ENHANCES = [0, 1, 3, 5, 10];

function run(profile, weaponLevel, armorLevel) {
  let wins = 0;
  let turns = 0;
  let remainHp = 0;
  let enemyHp = 0;
  for (let i = 0; i < trials; i += 1) {
    api.state.stats = { ...CONFIG.stats.initial };
    for (const [key, value] of Object.entries(profile.stats)) api.state.stats[key] += value;
    api.state.enhancements = {
      [CONFIG.battle.equipment.starter.weapon]: weaponLevel,
      [CONFIG.battle.equipment.starter.armor]: armorLevel,
    };
    api.state.currentHp = maxHp;
    api.state.currentMp = maxMp;
    const battle = api.runBattle([{ ...boss, probability: 1 }]);
    if (battle.result === "victory") wins += 1;
    turns += battle.turns.length;
    remainHp += battle.playerHp;
    enemyHp += battle.enemyHp;
  }
  return {
    win: (wins / trials) * 100,
    turns: turns / trials,
    hp: remainHp / trials,
    enemyHp: enemyHp / trials,
  };
}

const fixed = (value, digits = 1) => value.toFixed(digits);
console.log(`prototype: ${file}`);
console.log(`${boss.name}：HP ${boss.maxHp} / STR ${boss.stats.STR} / VIT ${boss.stats.VIT} / DEX ${boss.stats.DEX} / AGI ${boss.stats.AGI}`);
console.log(`プレイヤー：最大HP ${maxHp} / 最大MP ${maxMp} / 作戦バランス・既定の基礎優先度 / 試行 ${trials} 回`);
console.log("");
console.log("成長段階 | 強化 | 勝率 | 平均ターン | 平均残HP | 平均ボス残HP");
for (const profile of PROFILES) {
  for (const level of ENHANCES) {
    const result = run(profile, level, level);
    console.log([
      profile.label.padEnd(14),
      `武器+${level}/防具+${level}`.padEnd(14),
      `${fixed(result.win)}%`.padStart(6),
      fixed(result.turns).padStart(10),
      fixed(result.hp).padStart(8),
      fixed(result.enemyHp).padStart(12),
    ].join(" | "));
  }
}
console.log("");
console.log("武器のみ / 防具のみ強化の比較（Lv10相当）");
console.log("強化内容 | 勝率 | 平均ターン | 平均残HP | 平均ボス残HP");
const lv10 = PROFILES[3];
for (const [w, a, label] of [[0, 0, "強化なし"], [10, 0, "武器+10のみ"], [0, 10, "防具+10のみ"], [10, 10, "両方+10"]]) {
  const result = run(lv10, w, a);
  console.log([
    label.padEnd(12), `${fixed(result.win)}%`.padStart(6), fixed(result.turns).padStart(10),
    fixed(result.hp).padStart(8), fixed(result.enemyHp).padStart(12),
  ].join(" | "));
}
