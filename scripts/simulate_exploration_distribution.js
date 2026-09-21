#!/usr/bin/env node
"use strict";
/**
 * 探索一次抽選と素材探索ドロップの分布を確認するシミュレーションである（Issue #138）。
 *
 * 実装した確率構造が意図どおり働くかを見るためのもので、バランスの正式決定は行わない。
 * 数値はすべてPROTOTYPE ASSUMPTIONであり、期待値へ合わせるための調整は行わない。
 *
 * 通常探索と同じ explore() を繰り返し、state.lastResult.events の
 * primaryCategory / dropRank / dropItem を集計する。専用の簡略抽選は作らない。
 *
 * Issue #160 以降は、踏破率100%後の採取ねらいうち探索（explore の mode: "gather"）も同じ経路で集計し、
 * 通常探索との一次カテゴリ分布の差を併記する。これもHuman Verificationの代替ではない。
 *
 * 使い方:
 *   node scripts/simulate_exploration_distribution.js [prototype.html] [探索処理単位の回数]
 */

const path = require("path");
const { loadPrototype } = require("./prototype_harness");

const file = process.argv[2] || path.join(__dirname, "..", "prototype.html");
const units = Number.parseInt(process.argv[3], 10) || 20000;

const PRIMARY_ORDER = ["itemDrop", "encounter", "event", "failure", "progress"];
const RANK_ORDER = ["Rare", "Uncommon", "Common"];

const pct = (count, total) => (total ? (count / total) * 100 : 0).toFixed(2);
const pad = (value, width) => {
  const text = String(value);
  const size = [...text].reduce((sum, char) => sum + (/[ -~]/.test(char) ? 1 : 2), 0);
  return text + " ".repeat(Math.max(0, width - size));
};

// 探索の中断条件（HP0・満腹度不足）で分布が偏らないよう、1単位ごとに全快状態から実行する。
// 中断条件そのものの検証は check_prototype_behavior.js 側で行う。
function collect(locationId, unitCount, mode = "normal") {
  const instance = loadPrototype(file, {});
  const api = instance.api;
  const CONFIG = api.CONFIG;
  const cost = CONFIG.exploration.staminaPerEvent;
  const maxHp = CONFIG.battle.player.maxHp;
  const maxMp = CONFIG.battle.player.maxMp;
  const stats = {
    units: 0,
    primary: Object.fromEntries(PRIMARY_ORDER.map((key) => [key, 0])),
    ranks: Object.fromEntries(RANK_ORDER.map((key) => [key, 0])),
    items: new Map(),
    progressDepth: 0,
    battles: 0,
  };
  api.state.location = locationId;
  for (let i = 0; i < unitCount; i += 1) {
    api.state.currentHp = maxHp;
    api.state.currentMp = maxMp;
    api.state.satiety = api.maxSatiety();
    api.state.staminaSpent = 0;
    // 踏破率100%到達で進行が頭打ちにならないよう、深度と世界進行は都度戻す
    api.state.explorationDepth[locationId] = 0;
    // 採取ねらいうち探索は踏破率100%後だけ実行できるため、ロケーションを100%にしてから実行する
    if (mode !== "normal") api.worldState.locations[locationId].progress = api.locationDef(locationId).maxProgress;
    api.explore(cost, { mode });
    for (const event of api.state.lastResult.events) {
      stats.units += 1;
      stats.primary[event.primaryCategory] += 1;
      if (event.battle) stats.battles += 1;
      if (event.primaryCategory === "progress") stats.progressDepth += event.gain;
      if (event.dropRank) {
        stats.ranks[event.dropRank] += 1;
        stats.items.set(event.dropItem, (stats.items.get(event.dropItem) || 0) + event.dropAmount);
      }
    }
  }
  return stats;
}

const instance = loadPrototype(file, {});
const CONFIG = instance.api.CONFIG;
const locationName = (id) => CONFIG.locations.list.find((def) => def.id === id).name;
const expectedPrimary = (id, key) =>
  CONFIG.locations.content[id].primary.find((entry) => entry.id === key).probability * 100;
const expectedRank = (key) =>
  CONFIG.exploration.dropRanks.find((rank) => rank.id === key).probability * 100;
const expectedItemRate = (id, rank, item) => {
  const table = CONFIG.locations.content[id].drops.tables[rank];
  const total = table.reduce((sum, entry) => sum + entry.weight, 0);
  return (table.find((entry) => entry.item === item).weight / total) * 100;
};

console.log("探索一次抽選・探索ドロップ分布（Issue #138 / PROTOTYPE ASSUMPTION）");
console.log(`対象ファイル: ${path.relative(process.cwd(), file) || file}`);
console.log(`各ロケーション ${units} 探索処理単位（⚡${CONFIG.exploration.staminaPerEvent} × ${units} 回相当）`);
console.log("合否判定は行わない。確率構造が意図どおり働くかの確認に使う。");

const results = {};
for (const id of ["forest", "den"]) {
  const stats = collect(id, units);
  results[id] = stats;
  console.log("");
  console.log(`■ ${locationName(id)}　実処理 ${stats.units} 単位`);
  console.log(`${pad("一次結果", 22)}${pad("件数", 10)}${pad("実測", 10)}期待`);
  for (const key of PRIMARY_ORDER) {
    const label = CONFIG.locations.content[id].primary.find((entry) => entry.id === key).type;
    console.log(`${pad(label, 22)}${pad(stats.primary[key], 10)}${pad(`${pct(stats.primary[key], stats.units)}%`, 10)}${expectedPrimary(id, key).toFixed(2)}%`);
  }
  const drops = stats.primary.itemDrop;
  console.log(`${pad("取得ランク", 22)}${pad("件数", 10)}${pad("実測", 10)}期待`);
  for (const rank of RANK_ORDER) {
    console.log(`${pad(rank, 22)}${pad(stats.ranks[rank], 10)}${pad(`${pct(stats.ranks[rank], drops)}%`, 10)}${expectedRank(rank).toFixed(2)}%`);
  }
  console.log("取得アイテム（ランク内実測率／期待率）");
  for (const rank of RANK_ORDER) {
    const table = CONFIG.locations.content[id].drops.tables[rank];
    const rankTotal = stats.ranks[rank];
    for (const entry of table) {
      const got = stats.items.get(entry.item) || 0;
      // 実測率はそのランクを引いた回数に対する割合で、一次抽選のitemDrop率は含まない
      console.log(`  ${pad(`${rank} ${entry.item}`, 30)}${pad(got, 8)}${pad(`${pct(got, rankTotal)}%`, 10)}${expectedItemRate(id, rank, entry.item).toFixed(2)}%`);
    }
  }
  console.log(`探索進行で加算した深度合計：${stats.progressDepth}　戦闘発生：${stats.battles}回`);
}

console.log("");
const forest = results.forest;
const den = results.den;
console.log("ロケーション比較");
console.log(`${pad("", 22)}${pad("探索進行", 14)}${pad("モンスター遭遇", 18)}探索失敗`);
console.log(`${pad(locationName("forest"), 22)}${pad(`${pct(forest.primary.progress, forest.units)}%`, 14)}${pad(`${pct(forest.primary.encounter, forest.units)}%`, 18)}${pct(forest.primary.failure, forest.units)}%`);
console.log(`${pad(locationName("den"), 22)}${pad(`${pct(den.primary.progress, den.units)}%`, 14)}${pad(`${pct(den.primary.encounter, den.units)}%`, 18)}${pct(den.primary.failure, den.units)}%`);
console.log(forest.primary.progress > den.primary.progress
  ? "森の方が探索進行が多い。" : "想定と異なり、森の探索進行が巣穴以下だった。");
console.log(den.primary.encounter > forest.primary.encounter && den.primary.failure > forest.primary.failure
  ? "巣穴の方が戦闘・失敗が多い。" : "想定と異なり、巣穴の戦闘／失敗が森以下だった。");
console.log("アイテム取得数を含め、確率を合わせるための敵能力・素材重みの調整は行っていない。");

// 通常探索と採取ねらいうち探索の一次カテゴリ分布比較（Issue #160 / PROTOTYPE ASSUMPTION）
const gatherRate = (id, key) =>
  instance.api.explorationPrimary(id, "gather").find((entry) => entry.id === key).probability * 100;
console.log("");
console.log("通常探索／採取ねらいうち探索（踏破率100%）の一次カテゴリ分布（Issue #160 / PROTOTYPE ASSUMPTION）");
console.log("採取ねらいうち探索は、イベント発生の50%をアイテムドロップへ移す検証用の仮値である。");
for (const id of ["forest", "den"]) {
  const normal = results[id];
  const gather = collect(id, units, "gather");
  console.log("");
  console.log(`■ ${locationName(id)}　実処理 通常 ${normal.units} 単位 ／ 採取ねらいうち ${gather.units} 単位`);
  console.log(`${pad("一次結果", 22)}${pad("通常 実測", 12)}${pad("通常 期待", 12)}${pad("採取 実測", 12)}${pad("採取 期待", 12)}差（実測）`);
  for (const key of PRIMARY_ORDER) {
    const label = CONFIG.locations.content[id].primary.find((entry) => entry.id === key).type;
    const normalPct = pct(normal.primary[key], normal.units);
    const gatherPct = pct(gather.primary[key], gather.units);
    const diff = (Number(gatherPct) - Number(normalPct)).toFixed(2);
    console.log(`${pad(label, 22)}${pad(`${normalPct}%`, 12)}${pad(`${expectedPrimary(id, key).toFixed(2)}%`, 12)}${pad(`${gatherPct}%`, 12)}${pad(`${gatherRate(id, key).toFixed(2)}%`, 12)}${diff > 0 ? "+" : ""}${diff}pt`);
  }
  const gatherDrops = gather.primary.itemDrop;
  console.log(`${pad("取得ランク（採取）", 22)}${pad("件数", 10)}${pad("実測", 10)}期待`);
  for (const rank of RANK_ORDER) {
    console.log(`${pad(rank, 22)}${pad(gather.ranks[rank], 10)}${pad(`${pct(gather.ranks[rank], gatherDrops)}%`, 10)}${expectedRank(rank).toFixed(2)}%`);
  }
  const itemTotal = (stats) => [...stats.items.values()].reduce((sum, amount) => sum + amount, 0);
  console.log(`探索ドロップ取得数：通常 ${itemTotal(normal)} 個 ／ 採取ねらいうち ${itemTotal(gather)} 個　イベント発生：通常 ${normal.primary.event} 回 ／ 採取ねらいうち ${gather.primary.event} 回`);
}
console.log("合否判定は行わない。差が設定どおり出ているかの確認に使い、体感の強弱はHuman Verificationで確認する。");
