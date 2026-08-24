#!/usr/bin/env node
"use strict";
/**
 * 満腹度を導入した探索の継戦性を、投入スタミナ別に複数回試すシミュレーションである（Issue #87 §12）。
 *
 * Human Verification前の傾向確認のみを目的とし、合否判定は行わない。
 * 数値はすべてPROTOTYPE ASSUMPTIONであり、期待する結果へ合わせるための調整は行わない。
 *
 * 使い方:
 *   node scripts/simulate_endurance.js [prototype.html] [試行回数]
 */

const path = require("path");
const { loadPrototype } = require("./prototype_harness");

const file = process.argv[2] || path.join(__dirname, "..", "prototype.html");
const trials = Number.parseInt(process.argv[3], 10) || 200;
const COSTS = [10, 20, 30, 50];
const LOCATION = "forest";

const average = (values) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0);
const rate = (count, total) => `${Math.round((count / total) * 100)}%`;
const fixed = (value) => value.toFixed(2);

// 街で全回復・満腹度を補給した状態から1回探索する
function fullySupplied(instance, maxHp, maxMp) {
  instance.api.state.location = "town";
  instance.api.state.currentHp = maxHp;
  instance.api.state.currentMp = maxMp;
  instance.api.supplySatiety();
  instance.api.state.staminaSpent = 0;
  instance.api.state.location = LOCATION;
}

function singleRun(cost, maxHp, maxMp) {
  const rows = [];
  for (let i = 0; i < trials; i += 1) {
    const instance = loadPrototype(file, {});
    fullySupplied(instance, maxHp, maxMp);
    instance.api.explore(cost);
    rows.push(instance.api.state.lastResult.summary);
  }
  return rows;
}

// 補給せずに探索を繰り返し、満腹度不足で中断するまでの回数を数える
function repeatedRuns(cost, maxHp, maxMp, limit = 30) {
  const counts = [];
  for (let i = 0; i < Math.min(trials, 50); i += 1) {
    const instance = loadPrototype(file, {});
    fullySupplied(instance, maxHp, maxMp);
    let runs = 0;
    for (let n = 0; n < limit; n += 1) {
      instance.api.state.staminaSpent = 0;
      if (instance.api.state.currentHp <= 0) break;
      instance.api.explore(cost);
      runs += 1;
      if (instance.api.state.lastResult.summary.satietyInterrupted) break;
    }
    counts.push(runs);
  }
  return counts;
}

const base = loadPrototype(file, {});
const CONFIG = base.api.CONFIG;
const maxHp = CONFIG.battle.player.maxHp;
const maxMp = CONFIG.battle.player.maxMp;

console.log(`prototype: ${file}`);
console.log(`最大HP ${maxHp} / 最大MP ${maxMp} / 最大満腹度 ${base.api.maxSatiety()}（(最大HP + 最大MP) × ${CONFIG.satiety.multiplier}）`);
console.log(`ロケーション: ${CONFIG.locations.list.find((def) => def.id === LOCATION).name} / 試行 ${trials} 回・Lv1初期状態`);
console.log("");
console.log("[1] 満腹度を補給した状態から1回探索した場合");
console.log("投入 | 平均イベント | 平均戦闘 | 2戦以上 | 平均勝利 | 平均敗北 | 中断率 | 満腹度不足中断 | 平均終了満腹度 | 平均戦闘後回復消費");
for (const cost of COSTS) {
  const rows = singleRun(cost, maxHp, maxMp);
  console.log([
    `⚡${cost}`.padEnd(4),
    fixed(average(rows.map((row) => row.events))).padStart(12),
    fixed(average(rows.map((row) => row.battles))).padStart(8),
    rate(rows.filter((row) => row.battles >= 2).length, rows.length).padStart(7),
    fixed(average(rows.map((row) => row.victories))).padStart(8),
    fixed(average(rows.map((row) => row.defeats))).padStart(8),
    rate(rows.filter((row) => row.interrupted).length, rows.length).padStart(6),
    rate(rows.filter((row) => row.satietyInterrupted).length, rows.length).padStart(14),
    fixed(average(rows.map((row) => row.endSatiety))).padStart(14),
    fixed(average(rows.map((row) => row.recoverySatiety))).padStart(18),
  ].join(" | "));
}
console.log("");
console.log("[2] 補給せずに同じ投入量で探索を繰り返した場合（満腹度不足で中断するまでの探索回数）");
console.log("投入 | 平均探索回数 | 最小 | 最大");
for (const cost of COSTS) {
  const counts = repeatedRuns(cost, maxHp, maxMp);
  console.log([
    `⚡${cost}`.padEnd(4),
    fixed(average(counts)).padStart(12),
    String(Math.min(...counts)).padStart(4),
    String(Math.max(...counts)).padStart(4),
  ].join(" | "));
}
