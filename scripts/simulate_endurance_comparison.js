#!/usr/bin/env node
"use strict";
/**
 * Issue #163: 踏破率100%後の通常／採取探索を、実際のexplore()で比較する。
 * 各試行は同じ初期状態から1回探索。試行内の処理単位間では補給しない。
 * 合否・ゲーム性・正式バランスを判定しない。
 * node scripts/simulate_endurance_comparison.js [prototype.html] [各条件の試行数] [seed]
 */
const assert = require("assert/strict");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { loadPrototype } = require("./prototype_harness");

const file = process.argv[2] || path.join(__dirname, "..", "prototype.html");
const trials = Number(process.argv[3] ?? 2000);
const seed = Number(process.argv[4] ?? 163);
assert(Number.isSafeInteger(trials) && trials >= 2, "試行数は2以上の整数");
assert(Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff, "seedはuint32");
const now = Date.parse("2026-10-09T00:00:00Z");
const base = loadPrototype(file, {}, { now: () => now }).api;
const CONFIG = base.CONFIG;
const copy = (value) => JSON.parse(JSON.stringify(value));
const initial = copy(base.state);
const world = copy(base.worldState);
for (const id of ["forest", "den"]) {
  world.locations[id].unlocked = true;
  world.locations[id].progress = base.locationDef(id).maxProgress;
  initial.explorationDepth[id] = base.locationDef(id).depth;
}
const profiles = { full: base.maxSatiety(), low: 100 };
assert(profiles.low <= profiles.full, "低満腹度条件は最大値以下");

// Mulberry32。条件ごとに独立したseedの系列を用い、Math.randomは必ず復元する。
function randomSource(value) {
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let n = Math.imul(value ^ (value >>> 15), value | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

function collect(location, profile, cost, mode, streamSeed) {
  const api = loadPrototype(file, {}, { now: () => now }).api;
  const rows = [];
  const randomBefore = Math.random;
  try {
    Math.random = randomSource(streamSeed);
    for (let i = 0; i < trials; i += 1) {
      Object.assign(api.state, copy(initial), { location, satiety: profiles[profile] });
      Object.assign(api.worldState, copy(world));
      assert.equal(api.locationProgress(location), 100);
      assert(api.explorationModeAvailable(location, mode));
      assert(api.currentStamina() >= cost);
      api.explore(cost, { mode });
      const result = api.state.lastResult;
      assert(result, "explore()が拒否された");
      const s = result.summary;
      assert.equal(s.mode, mode);
      assert.equal(s.startSatiety, profiles[profile]);
      assert.equal(s.events, result.events.length);
      assert.equal(s.plannedEvents, cost / CONFIG.exploration.staminaPerEvent);
      assert.equal(s.battles, s.victories + s.defeats);
      assert.equal(s.cost, cost);
      const healTypes = api.explorationCategoryEvents(location, "event")
        .filter((event) => event.id === "heal").map((event) => event.type);
      let heal = 0, usefulHeal = 0, healedHp = 0, drops = 0, eventCount = 0;
      for (const event of result.events) {
        if (event.primaryCategory === "event") {
          eventCount += 1;
          if (healTypes.includes(event.type)) {
            heal += 1;
            // 実回復量は本番が生成した結果文から取得。回復式を別実装しない。
            const match = event.text.match(/HPが(\d+)回復した。$/);
            assert(match || event.text.endsWith("HPはすでに満タンだった。"), "回復結果文の形式変更");
            const amount = match ? Number(match[1]) : 0;
            healedHp += amount;
            if (amount > 0) usefulHeal += 1;
          }
        }
        if (event.primaryCategory === "itemDrop") drops += event.dropAmount;
      }
      rows.push({
        planned: s.plannedEvents, units: s.events,
        interrupted: Number(s.interrupted), hpInterrupt: Number(s.interruptReason === "hp"),
        satietyInterrupt: Number(s.interruptReason === "satiety"),
        hp: s.endHp, satiety: s.endSatiety, hpFull: Number(s.endHp === CONFIG.battle.player.maxHp),
        hpZero: Number(s.endHp === 0), battles: s.battles, victories: s.victories, defeats: s.defeats,
        recoverySatiety: s.recoverySatiety, eventCount, heal, usefulHeal, healedHp, drops,
      });
    }
  } finally {
    Math.random = randomBefore;
  }
  const sum = (key) => rows.reduce((total, row) => total + row[key], 0);
  const mean = (key) => sum(key) / trials;
  const variance = (key) => {
    const center = mean(key);
    return rows.reduce((total, row) => total + (row[key] - center) ** 2, 0) / (trials - 1);
  };
  // 行ごとの独立試行を分母にする。イベント単位を独立標本としてCIを狭めない。
  return { location, profile, cost, mode, streamSeed, sum, mean, variance };
}

console.log("通常／採取探索の継戦性比較（Issue #163 / PROTOTYPE ASSUMPTION）");
console.log(`prototype SHA256: ${crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex")}`);
console.log(`固定時刻: ${new Date(now).toISOString()} / 各条件 ${trials} 独立試行 / seed ${seed}`);
console.log(`初期キャラクター: ${JSON.stringify(initial)}`);
console.log(`満腹度条件: ${JSON.stringify(profiles)} / 両ロケーション踏破率100%、初期深度は上限`);
console.log("試行は1回のexplore(cost, {mode})。試行間で初期化し、試行内ではHP/MP/満腹度を持ち越す。");
console.log("回復地点と戦闘後の満腹度回復は別集計。探索ドロップは戦闘報酬・戦闘素材を含まない。");

const results = [];
for (const location of ["forest", "den"]) {
  for (const profile of Object.keys(profiles)) {
    for (const cost of CONFIG.explorationCosts) {
      for (const mode of ["normal", "gather"]) {
        const streamSeed = (seed + Math.imul(results.length, 0x9e3779b9)) >>> 0;
        results.push(collect(location, profile, cost, mode, streamSeed));
      }
    }
  }
}
const f = (value) => value.toFixed(3);
const table = (headers, rows) => {
  console.log(`| ${headers.join(" | ")} |`);
  console.log(`| ${headers.map(() => "---").join(" | ")} |`);
  for (const row of rows) console.log(`| ${row.join(" | ")} |`);
};
const label = (r) => `${r.location}/${r.profile}/⚡${r.cost}/${r.mode}`;
console.log("\n[総数] 各行の分母は試行数。中断は本番summaryのフラグ、HP0終了は別に表示。");
table(["条件", "seed", "試行", "予定単位", "実単位", "中断(HP/満腹)", "HP0終了", "戦闘(勝/敗)", "イベント", "回復地点(有効)", "地点実回復HP", "探索drop個数"],
  results.map((r) => [label(r), r.streamSeed, trials, r.sum("planned"), r.sum("units"),
    `${r.sum("interrupted")}(${r.sum("hpInterrupt")}/${r.sum("satietyInterrupt")})`, r.sum("hpZero"),
    `${r.sum("battles")}(${r.sum("victories")}/${r.sum("defeats")})`, r.sum("eventCount"),
    `${r.sum("heal")}(${r.sum("usefulHeal")})`, r.sum("healedHp"), r.sum("drops")]));
console.log("\n[1試行あたり平均] 中断率・HP満タン率の分母も試行数。中断試行を除外しない。");
table(["条件", "実単位", "終了HP", "終了満腹度", "戦闘", "戦闘後回復消費", "中断%", "HP満タン%", "回復地点", "有効地点", "地点回復HP", "drop個数"],
  results.map((r) => [label(r), ...["units", "hp", "satiety", "battles", "recoverySatiety"].map((k) => f(r.mean(k))),
    f(r.mean("interrupted") * 100), f(r.mean("hpFull") * 100), ...["heal", "usefulHeal", "healedHp", "drops"].map((k) => f(r.mean(k)))]));
console.log("\n[実処理単位あたり] 総数÷実単位。中断により分母が変わるため、投入量あたりの比較とは区別。");
table(["条件", "イベント/単位", "回復地点/単位", "有効地点/単位", "drop個数/単位", "戦闘/単位"],
  results.map((r) => [label(r), ...["eventCount", "heal", "usefulHeal", "drops", "battles"].map((k) => f(r.sum(k) / r.sum("units")))]));
console.log("\n[差: 採取−通常] 独立試行平均差の近似95% Monte Carlo区間（±1.96 SE）。中断は比率差。多重比較補正なし、正式な優劣判定には使わない。");
console.log("区間が0を含む差は今回の試行数では判断できない。両群の分散が0なら天井／床効果で判定困難。");
table(["条件", "終了HP差 [区間]", "終了満腹度差 [区間]", "中断比率差 [区間]", "有効地点/試行差 [区間]", "drop個数/試行差 [区間]"],
  results.filter((r) => r.mode === "normal").map((normal) => {
    const gather = results.find((r) => r.location === normal.location && r.profile === normal.profile && r.cost === normal.cost && r.mode === "gather");
    return [`${normal.location}/${normal.profile}/⚡${normal.cost}`, ...["hp", "satiety", "interrupted", "usefulHeal", "drops"].map((key) => {
      const difference = gather.mean(key) - normal.mean(key);
      const se = Math.sqrt((gather.variance(key) + normal.variance(key)) / trials);
      return se === 0 ? `${f(difference)} (分散0: 判定困難)` : `${f(difference)} [${f(difference - 1.96 * se)}, ${f(difference + 1.96 * se)}]`;
    })];
  }));
console.log("\n0件は不存在の証明ではない。中断0/Nの発生率上限目安は約3/N（95%、各条件単独）。");
console.log("全快条件の天井効果、低満腹度条件の床効果、少数の有効回復に注意。単回探索比較であり、長期反復・体感・危険度不足の原因は未検証。");
