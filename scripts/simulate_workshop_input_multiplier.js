#!/usr/bin/env node
"use strict";
/**
 * 工房の投入倍率（inputMultiplier）が判断として成立するかを確認するシミュレーションである（Issue #143）。
 *
 * Issue #117 / #127 の候補式を、投入倍率と成功率だけへ絞って検証する。
 *
 *   1試行の素材消費 = レシピ基準量 × inputMultiplier
 *   1試行の成功率   = min(100%, 基礎成功率 × inputMultiplier)
 *   1試行の成果     = 成功したらレシピ1回分（倍率では増えない）
 *
 * 環境RGB・補助触媒・大成功／会心・副産物・100%超過還元・生産職Lv・工房使用料・
 * 加工時間・装備鍛造・素材品質・経済価格は一切導入しない。
 *
 * ゲーム本体（prototype.html）は読み込まず、変更もしない。実装前の数理検証専用である。
 * 数値はすべてPROTOTYPE ASSUMPTIONであり、正式な成功率式・倍率上限を確定するものではない。
 *
 * 乱数はseed固定の疑似乱数を使い、同じ引数なら同じ結果になる。
 *
 * 使い方:
 *   node scripts/simulate_workshop_input_multiplier.js [試行回数] [seed]
 */

const trials = Number.parseInt(process.argv[2], 10) || 30000;
const seed = Number.parseInt(process.argv[3], 10) || 20260902;

/* ---------- モデル ---------- */

const RECIPE_BASE_QUANTITY = 1;   // レシピ1回分の素材基準量
const RECIPE_OUTPUT = 1;          // レシピ1回分の成果物数（倍率では増えない）

// 1試行の成功率。Clampにより100%を超えない
const successRate = (base, multiplier) => Math.min(1, base * multiplier);
// 1試行の素材消費
const materialsPerAttempt = (multiplier) => RECIPE_BASE_QUANTITY * multiplier;

/* ---------- seed固定の疑似乱数（mulberry32） ---------- */

function createRandom(value) {
  let state = value >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- 集計ヘルパー ---------- */

const average = (values) => (values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0);
const stdev = (values) => {
  if (values.length < 2) return 0;
  const mean = average(values);
  return Math.sqrt(values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length);
};
// 昇順ソート済み配列からのパーセンタイル（最近傍順位法）
const percentile = (sorted, p) => {
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
  return sorted[index];
};
const rate = (count, total) => (total ? (count / total) * 100 : 0);
const num = (value, digits = 2) => value.toFixed(digits);
const pad = (value, width) => {
  const text = String(value);
  // 全角文字を2幅として数える
  const size = [...text].reduce((sum, char) => sum + (/[ -~]/.test(char) ? 1 : 2), 0);
  return text + " ".repeat(Math.max(0, width - size));
};
const heading = (text) => {
  console.log("");
  console.log(text);
};

/* ---------- A. 同一素材予算 ---------- */

// 予算 budget を使い切るまで加工する。1試行あたり materialsPerAttempt(m) を消費し、
// 端数（budget % m）は投入できずに残る。
function budgetTheory(base, multiplier, budget) {
  const cost = materialsPerAttempt(multiplier);
  const attempts = Math.floor(budget / cost);
  const leftover = budget - attempts * cost;
  const p = successRate(base, multiplier);
  const mean = attempts * p * RECIPE_OUTPUT;
  const variance = attempts * p * (1 - p) * RECIPE_OUTPUT ** 2;
  return {
    attempts,
    leftover,
    successRate: p,
    mean,
    sd: Math.sqrt(variance),
    zeroRate: (1 - p) ** attempts * 100,
    perMaterial: budget ? mean / budget : 0,
  };
}

function budgetMonteCarlo(base, multiplier, budget, random, count) {
  const theory = budgetTheory(base, multiplier, budget);
  const outputs = [];
  for (let i = 0; i < count; i += 1) {
    let made = 0;
    for (let attempt = 0; attempt < theory.attempts; attempt += 1) {
      if (random() < theory.successRate) made += RECIPE_OUTPUT;
    }
    outputs.push(made);
  }
  const sorted = [...outputs].sort((a, b) => a - b);
  const mean = average(outputs);
  return {
    ...theory,
    mcMean: mean,
    mcSd: stdev(outputs),
    median: percentile(sorted, 50),
    p5: percentile(sorted, 5),
    p95: percentile(sorted, 95),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mcZeroRate: rate(outputs.filter((v) => v === 0).length, outputs.length),
    belowTheoryRate: rate(outputs.filter((v) => v < theory.mean).length, outputs.length),
    mcPerMaterial: budget ? mean / budget : 0,
  };
}

/* ---------- B. 目標完成数へ到達するまで ---------- */

// 目標 target 個を作り終えるまで加工を続ける。成功率0では終わらないため上限を設ける。
function targetMonteCarlo(base, multiplier, target, random, count, attemptLimit = 100000) {
  const p = successRate(base, multiplier);
  const cost = materialsPerAttempt(multiplier);
  const materials = [];
  const attemptsList = [];
  let maxStreak = 0;
  let reachedLimit = 0;
  for (let i = 0; i < count; i += 1) {
    let made = 0;
    let attempts = 0;
    let streak = 0;
    while (made < target && attempts < attemptLimit) {
      attempts += 1;
      if (random() < p) {
        made += RECIPE_OUTPUT;
        streak = 0;
      } else {
        streak += 1;
        if (streak > maxStreak) maxStreak = streak;
      }
    }
    if (made < target) reachedLimit += 1;
    materials.push(attempts * cost);
    attemptsList.push(attempts);
  }
  const sorted = [...materials].sort((a, b) => a - b);
  // 理論期待値：負の二項分布。目標到達までの試行回数の期待値は target / p
  const theoryAttempts = p > 0 ? (target * RECIPE_OUTPUT) / p : Infinity;
  return {
    successRate: p,
    cost,
    theoryAttempts,
    theoryMaterials: theoryAttempts * cost,
    meanMaterials: average(materials),
    medianMaterials: percentile(sorted, 50),
    p90Materials: percentile(sorted, 90),
    p95Materials: percentile(sorted, 95),
    minMaterials: sorted[0],
    maxMaterials: sorted[sorted.length - 1],
    sdMaterials: stdev(materials),
    meanAttempts: average(attemptsList),
    maxFailStreak: maxStreak,
    reachedLimit,
  };
}

/* ---------- 出力 ---------- */

const BASE_RATES = [0.1, 0.2, 0.25, 0.5];
const MAIN_BASE = 0.1;
const MULTIPLIERS = [1, 2, 3, 4, 5, 6, 8, 10, 12];
const BUDGETS = [100, 20, 9];
const TARGETS = [1, 5, 10];

console.log("工房の投入倍率シミュレーション（Issue #143 / PROTOTYPE ASSUMPTION）");
console.log(`試行回数 ${trials} 回 ／ seed ${seed}（seed固定のため再実行しても同じ結果になる）`);
console.log("");
console.log("モデル：1試行の素材消費 = レシピ基準量 × 倍率 ／ 成功率 = min(100%, 基礎成功率 × 倍率)");
console.log("成功時の成果はレシピ1回分で固定し、倍率では増えない。環境・触媒・大成功・還元は導入しない。");

/* --- 1. 理論関係 --- */
heading("■ 1. 理論関係：倍率ごとの成功率と期待素材効率");
console.log(`${pad("基礎成功率", 14)}${pad("倍率", 6)}${pad("消費/試行", 12)}${pad("成功率", 10)}${pad("期待成果/試行", 16)}${pad("期待成果/素材1個", 18)}Clamp`);
for (const base of BASE_RATES) {
  for (const m of MULTIPLIERS) {
    const p = successRate(base, m);
    const cost = materialsPerAttempt(m);
    const clamped = base * m > 1;
    console.log(
      `${pad(`${num(base * 100, 0)}%`, 14)}${pad(m, 6)}${pad(cost, 12)}${pad(`${num(p * 100, 1)}%`, 10)}`
      + `${pad(num(p * RECIPE_OUTPUT, 3), 16)}${pad(num((p * RECIPE_OUTPUT) / cost, 4), 18)}${clamped ? "あり（効率低下）" : "なし"}`,
    );
  }
}
console.log("");
console.log("Clamp前は 期待成果/素材1個 = 基礎成功率 で一定になり、倍率では期待効率が変わらない。");
console.log("Clampを超える倍率（基礎成功率 × 倍率 > 100%）だけ、素材効率が明確に悪化する。");

/* --- 2. A. 同一素材予算 --- */
heading(`■ 2-A. 同一素材予算（基礎成功率 ${num(MAIN_BASE * 100, 0)}%）`);
const budgetResults = {};
for (const budget of BUDGETS) {
  const random = createRandom(seed + budget);
  console.log("");
  console.log(`▼ 素材予算 ${budget} 個`);
  console.log(
    `${pad("倍率", 6)}${pad("試行", 8)}${pad("端数", 8)}${pad("理論平均", 12)}${pad("実測平均", 12)}`
    + `${pad("実測SD", 10)}${pad("中央値", 10)}${pad("5%点", 8)}${pad("95%点", 8)}${pad("0個率", 10)}素材1個あたり`,
  );
  budgetResults[budget] = {};
  for (const m of MULTIPLIERS) {
    const result = budgetMonteCarlo(MAIN_BASE, m, budget, random, trials);
    budgetResults[budget][m] = result;
    console.log(
      `${pad(m, 6)}${pad(result.attempts, 8)}${pad(result.leftover, 8)}${pad(num(result.mean, 3), 12)}`
      + `${pad(num(result.mcMean, 3), 12)}${pad(num(result.mcSd, 3), 10)}${pad(result.median, 10)}`
      + `${pad(result.p5, 8)}${pad(result.p95, 8)}${pad(`${num(result.mcZeroRate, 2)}%`, 10)}${num(result.mcPerMaterial, 4)}`,
    );
  }
}

/* --- 3. B. 目標完成数到達 --- */
heading(`■ 2-B. 目標完成数へ到達するまでの素材消費（基礎成功率 ${num(MAIN_BASE * 100, 0)}%）`);
const targetResults = {};
for (const target of TARGETS) {
  const random = createRandom(seed + target * 7919);
  console.log("");
  console.log(`▼ 完成品 ${target} 個を作るまで`);
  console.log(
    `${pad("倍率", 6)}${pad("理論消費", 12)}${pad("平均消費", 12)}${pad("中央値", 10)}${pad("90%点", 10)}`
    + `${pad("95%点", 10)}${pad("最小", 8)}${pad("最大", 8)}${pad("消費SD", 10)}${pad("平均試行", 10)}最大連続失敗`,
  );
  targetResults[target] = {};
  for (const m of MULTIPLIERS) {
    const result = targetMonteCarlo(MAIN_BASE, m, target, random, trials);
    targetResults[target][m] = result;
    console.log(
      `${pad(m, 6)}${pad(num(result.theoryMaterials, 2), 12)}${pad(num(result.meanMaterials, 2), 12)}`
      + `${pad(result.medianMaterials, 10)}${pad(result.p90Materials, 10)}${pad(result.p95Materials, 10)}`
      + `${pad(result.minMaterials, 8)}${pad(result.maxMaterials, 8)}${pad(num(result.sdMaterials, 2), 10)}`
      + `${pad(num(result.meanAttempts, 2), 10)}${result.maxFailStreak}`,
    );
  }
}

/* --- 4. 判断材料の要約 --- */
heading("■ 3. 判断材料の要約");
const budget100 = budgetResults[100];
const budget9 = budgetResults[9];
const target10 = targetResults[10];
console.log(`予算100個：倍率1の実測平均 ${num(budget100[1].mcMean, 2)} 個（SD ${num(budget100[1].mcSd, 2)}）に対し、`
  + `倍率10は ${num(budget100[10].mcMean, 2)} 個（SD ${num(budget100[10].mcSd, 2)}）。`);
console.log(`　平均差 ${num(budget100[10].mcMean - budget100[1].mcMean, 2)} 個、`
  + `0個で終わる確率は ${num(budget100[1].mcZeroRate, 2)}% → ${num(budget100[10].mcZeroRate, 2)}%。`);
console.log(`予算9個（倍率10を選べない）：倍率1の実測平均 ${num(budget9[1].mcMean, 2)} 個 ／ `
  + `0個で終わる確率 ${num(budget9[1].mcZeroRate, 2)}%。倍率10は試行 ${budget9[10].attempts} 回で常に0個。`);
console.log(`完成10個目標：倍率1の平均消費 ${num(target10[1].meanMaterials, 1)}（95%点 ${target10[1].p95Materials}、最小 ${target10[1].minMaterials}）に対し、`
  + `倍率10は常に ${target10[10].meanMaterials} で確定。`);
console.log("");
console.log("低倍率は期待効率が同じまま分散が大きく、運が良ければ素材を節約でき、悪ければ大きく超過する。");
console.log("高倍率（Clamp到達）は分散0で確定するが、素材の端数を使い切れず、Clampを超えると効率が落ちる。");
console.log("この出力はA / B / C判定の材料であり、スクリプト側では判定しない。");

/* ---------- 自動確認 ---------- */

const failures = [];
const check = (label, condition, detail) => {
  if (!condition) failures.push(detail ? `${label}: ${detail}` : label);
};
const near = (label, actual, expected, tolerance) =>
  check(label, Math.abs(actual - expected) <= tolerance, `expected ${expected} ± ${tolerance}, got ${actual}`);

// 成功率とClamp
near("m=1 / b=10% で1試行成功率10%", successRate(0.1, 1), 0.1, 1e-12);
near("m=10 / b=10% で1試行成功率100%", successRate(0.1, 10), 1, 1e-12);
check("Clampを超える倍率でも成功率100%を超えない",
  [12, 20, 100].every((m) => successRate(0.1, m) === 1),
  [12, 20, 100].map((m) => successRate(0.1, m)).join(","));
check("Clamp後は素材効率が悪化する",
  successRate(0.1, 12) / materialsPerAttempt(12) < successRate(0.1, 10) / materialsPerAttempt(10));
check("Clamp前は素材効率が倍率によらず一定",
  [1, 2, 5, 10].every((m) => Math.abs(successRate(0.1, m) / materialsPerAttempt(m) - 0.1) < 1e-12));
// 同一素材予算での試行回数と端数
check("同一素材予算で倍率別の試行回数が正しい",
  MULTIPLIERS.every((m) => budgetTheory(0.1, m, 100).attempts === Math.floor(100 / m)),
  MULTIPLIERS.map((m) => `${m}:${budgetTheory(0.1, m, 100).attempts}`).join(","));
check("端数は予算 - 試行回数 × 消費で一致する",
  MULTIPLIERS.every((m) => {
    const t = budgetTheory(0.1, m, 100);
    return t.leftover === 100 - t.attempts * materialsPerAttempt(m);
  }));
check("予算不足の倍率では試行できない", budgetTheory(0.1, 10, 9).attempts === 0);
// Monte Carlo と理論値の照合
for (const m of MULTIPLIERS) {
  const result = budgetResults[100][m];
  const tolerance = Math.max(0.05, (4 * result.sd) / Math.sqrt(trials));
  near(`Monte Carlo平均が理論期待値へ近づく（予算100 / 倍率${m}）`, result.mcMean, result.mean, tolerance);
}
check("倍率10（成功率100%）では分散が0になる",
  budgetResults[100][10].mcSd === 0 && budgetResults[100][10].sd === 0,
  `${budgetResults[100][10].mcSd},${budgetResults[100][10].sd}`);
check("低倍率ほど完成数の分散が大きい",
  budgetResults[100][1].mcSd > budgetResults[100][5].mcSd
  && budgetResults[100][5].mcSd > budgetResults[100][10].mcSd,
  [1, 5, 10].map((m) => `${m}:${num(budgetResults[100][m].mcSd, 3)}`).join(","));
// 目標完成数到達型
for (const m of [1, 2, 5, 10]) {
  const result = targetResults[10][m];
  const tolerance = Math.max(1, (4 * result.sdMaterials) / Math.sqrt(trials));
  near(`目標到達型の平均素材消費が理論値へ近づく（倍率${m}）`, result.meanMaterials, result.theoryMaterials, tolerance);
}
check("目標到達型で素材消費は試行回数 × 倍率と一致する",
  MULTIPLIERS.every((m) => {
    const result = targetResults[10][m];
    return Math.abs(result.meanMaterials - result.meanAttempts * m) < 1e-9;
  }));
check("倍率10では目標到達に必要な試行回数が目標数と一致する",
  targetResults[10][10].meanAttempts === 10 && targetResults[10][10].maxFailStreak === 0);
check("目標到達型で試行上限に達したケースがない",
  TARGETS.every((target) => MULTIPLIERS.every((m) => targetResults[target][m].reachedLimit === 0)));

heading("■ 4. 自動確認");
if (failures.length) {
  for (const failure of failures) console.error(`simulate_workshop_input_multiplier.js: FAIL: ${failure}`);
  process.exit(1);
}
console.log("simulate_workshop_input_multiplier.js: PASS");
