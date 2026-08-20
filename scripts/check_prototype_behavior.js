#!/usr/bin/env node
"use strict";
/**
 * prototype.html のインラインスクリプトを Node の vm 上で実行し、
 * 暦とスタミナの振る舞いを固定時刻で検証する最小テストである。
 *
 * 単一HTMLのままブラウザ以外で検証するため、DOM と localStorage は最小限のスタブを与え、
 * トップレベルの const / let を取り出すためのエピローグを連結して実行する。
 */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const EXPORTS = [
  "CONFIG", "state", "worldState", "calendarParts", "accruedStamina", "currentStamina",
  "spendStamina", "formatStamina", "migrateStaminaSpent", "explore", "load", "save", "render",
  "attributeTotal", "resistanceTotal", "baseDamage", "actionDamage", "simulateUtility",
];

function loadPrototype(file, storeSeed) {
  const source = fs.readFileSync(file, "utf8");
  const script = source.split("<script>")[1].split("</script>")[0];
  const elements = {};
  const makeEl = (id) => {
    if (elements[id]) return elements[id];
    const el = {
      id, textContent: "", innerHTML: "", valueAsNumber: 50, hidden: false, disabled: false,
      style: {}, dataset: {}, classList: { toggle() {}, add() {}, remove() {}, contains: () => false },
      setAttribute() {}, scrollIntoView() {}, addEventListener() {},
      querySelector: () => makeEl("_q"), querySelectorAll: () => [],
    };
    elements[id] = el;
    return el;
  };
  const store = Object.assign({}, storeSeed);
  const context = {
    console, Math, Date, JSON, Number, String, Object, Array, Boolean, Set, Map, Error,
    setInterval: () => 0, clearTimeout() {}, setTimeout: () => 0, confirm: () => true,
    localStorage: {
      getItem: (key) => (key in store ? store[key] : null),
      setItem: (key, value) => { store[key] = String(value); },
      removeItem: (key) => { delete store[key]; },
    },
    document: { getElementById: makeEl, addEventListener() {}, querySelector: () => makeEl("_q"), querySelectorAll: () => [] },
    window: {},
  };
  context.globalThis = context;
  vm.createContext(context);
  const epilogue = `;globalThis.__api={${EXPORTS.map((name) => `get ${name}(){return ${name}}`).join(",")}};`;
  vm.runInContext(script + epilogue, context, { filename: file });
  return { api: context.__api, elements, store };
}

const failures = [];
function check(label, condition, detail) {
  if (condition) return;
  failures.push(detail ? `${label}: ${detail}` : label);
}
function equal(label, actual, expected) {
  check(label, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const file = process.argv[2] || path.join(__dirname, "..", "prototype.html");
const { api, elements } = loadPrototype(file);
const CONFIG = api.CONFIG;
const open = CONFIG.stamina.worldOpenAt;
const DAY_MS = 24 * 60 * 60 * 1000;
const gameDay = DAY_MS / CONFIG.time.scale;

/* ---------- 暦 ---------- */
const first = api.calendarParts(open);
equal("暦: 世界開始日の月", first.month, CONFIG.time.months[0].replace("の月", ""));
equal("暦: 世界開始日の週", first.week, 1);
equal("暦: 世界開始日の曜日", first.weekday, CONFIG.time.weekdays[0].replace("の日", ""));
check("暦: 世界開始日は特別日ではない", first.special === false);

for (let day = 0; day < CONFIG.time.daysPerYear - 1; day += 1) {
  const parts = api.calendarParts(open + day * gameDay);
  const monthIndex = Math.floor(day / CONFIG.time.daysPerMonth);
  check(`暦: ${day}日目の週番号が1〜4`, parts.week >= 1 && parts.week <= 4, `week=${parts.week}`);
  equal(`暦: ${day}日目の月名`, parts.month, CONFIG.time.months[monthIndex].replace("の月", ""));
  equal(`暦: ${day}日目の曜日`, parts.weekday, CONFIG.time.weekdays[day % CONFIG.time.weekdays.length].replace("の日", ""));
  if (day % CONFIG.time.daysPerMonth === CONFIG.time.daysPerMonth - 1) {
    equal(`暦: ${day}日目は第4週`, parts.week, 4);
  }
}

const special = api.calendarParts(open + (CONFIG.time.daysPerYear - 1) * gameDay);
check("暦: 365日目が特別日", special.special === true);
equal("暦: 特別日の名称", special.specialName, CONFIG.time.specialDay);

const nextYear = api.calendarParts(open + CONFIG.time.daysPerYear * gameDay);
equal("暦: 翌年の年数", nextYear.year, 2);
check("暦: 年・日付・時刻を内部計算として保持", Number.isFinite(first.year) && Number.isFinite(first.dayOfMonth) && typeof first.clock === "string");

api.render();
const calendarText = ["calMonth", "calDay", "calSpecialName"]
  .map((id) => String(elements[id] ? elements[id].textContent : "")).join(" ");
check("暦UI: 年を表示しない", !/年/.test(calendarText), calendarText);
check("暦UI: 具体日付を表示しない", !/日$|\d+日/.test(calendarText), calendarText);
check("暦UI: 時刻を表示しない", !/\d{1,2}:\d{2}/.test(calendarText), calendarText);
check("暦UI: 月名を表示する", /\S/.test(String(elements.calMonth.textContent)));
const shownDay = api.calendarParts();
equal("暦UI: 日行は第N の 曜日 をまとめて表示する", elements.calDay.textContent, `第${shownDay.week}の${shownDay.weekday}`);
check("暦UI: 通常日は特別日行を隠す", elements.calSpecial.hidden === true);
check("暦UI: 通常日は月・曜日行を表示する", elements.calNormalMonth.hidden === false && elements.calNormalDay.hidden === false);

const openBefore = CONFIG.stamina.worldOpenAt;
CONFIG.stamina.worldOpenAt = Date.now() - (CONFIG.time.daysPerYear - 1) * gameDay;
api.render();
check("暦UI: 特別日は特別日行だけを表示する",
  elements.calSpecial.hidden === false && elements.calNormalMonth.hidden === true && elements.calNormalDay.hidden === true);
equal("暦UI: 特別日の表示名", elements.calSpecialName.textContent, CONFIG.time.specialDay);
CONFIG.stamina.worldOpenAt = openBefore;
api.render();

/* ---------- 右カラムの構造（Issue #60） ---------- */
const source = fs.readFileSync(file, "utf8");
const foldIds = ["foldStatus", "foldAbility", "foldSkill", "foldItems"];
for (const id of foldIds) {
  const tag = source.match(new RegExp(`<details[^>]*id="${id}"[^>]*>`));
  check(`右カラム: ${id} が details で存在する`, Boolean(tag), "見つからない");
  if (tag) check(`右カラム: ${id} は初期状態で閉じている`, !/\bopen\b/.test(tag[0]), tag[0]);
}
check("右カラム: 情報パネルの下にロケーションメニューがある",
  source.indexOf('id="foldItems"') < source.indexOf('id="locationPanel"'));
check("右カラム: ロケーションメニューをアコーディオンで閉じない",
  /<section[^>]*id="locationPanel"/.test(source));
check("左カラム: 現在地ボタンを持たない", !/id="commandMain"/.test(source));
check("左カラム: ステータス／アビリティ／スキル／所持品のショートカットを持つ",
  ["commandStatus", "commandAbility", "commandSkills", "commandItems"].every((id) => source.includes(`id="${id}"`)));
check("右カラム: activeView と戻るボタンを持たない", !/activeView/.test(source) && !/viewBack/.test(source));

api.render();
for (const id of ["statusBody", "abilityBody", "skillBody", "itemsBody"]) {
  check(`右カラム: ${id} が描画される`, /\S/.test(String(elements[id].innerHTML)), "空");
}
check("ステータス: SP割り振りボタンを保持", /data-allocate="STR"/.test(elements.statusBody.innerHTML));
check("ステータス: INT / MNDを効果未実装として表示", /効果未実装/.test(elements.statusBody.innerHTML));
check("アビリティ: 未使用APを表示", /AP /.test(elements.abilityBody.innerHTML));
check("所持品: 所持金と所持品を表示", /Gold/.test(elements.itemsBody.innerHTML) && /薬草/.test(elements.itemsBody.innerHTML));
check("ロケーションメニュー: 街に宿屋・よろず屋・酒場がある",
  /宿屋/.test(elements.screen.innerHTML) && /よろず屋/.test(elements.screen.innerHTML) && /酒場/.test(elements.screen.innerHTML));
api.state.location = "cave";
api.render();
check("ロケーションメニュー: ダンジョンに探索・討伐・採取がある",
  /探索/.test(elements.screen.innerHTML) && /討伐/.test(elements.screen.innerHTML) && /採取/.test(elements.screen.innerHTML));
check("ロケーションメニュー: 討伐・採取はdisabled", /<button disabled>討伐/.test(elements.screen.innerHTML) && /<button disabled>採取/.test(elements.screen.innerHTML));
api.state.location = "town";
api.render();

/* ---------- スタミナ ---------- */
equal("スタミナ: 設定が1秒1回復", CONFIG.stamina.recoveryPerSecond, 1);
check("スタミナ: 最大値の設定を持たない", CONFIG.maxStamina === undefined && CONFIG.staminaRecoveryMs === undefined);

api.state.staminaSpent = 0;
equal("スタミナ: 世界開始直後は初期値", api.currentStamina(open), CONFIG.stamina.initial);
equal("スタミナ: 10秒経過で+10", api.currentStamina(open + 10000), CONFIG.stamina.initial + 10);
api.spendStamina(10);
equal("スタミナ: 10消費で-10", api.currentStamina(open + 10000), CONFIG.stamina.initial);

api.state.staminaSpent = 0;
const longRun = api.currentStamina(open + 200000 * 1000);
check("スタミナ: 100を超えて蓄積する", longRun > 100, `value=${longRun}`);
equal("スタミナ: 最大値でclampされない", longRun, CONFIG.stamina.initial + 200000);

const scaleBefore = CONFIG.time.scale;
const staminaBefore = api.currentStamina(open + 12345000);
CONFIG.time.scale = scaleBefore * 7;
equal("スタミナ: GAME_TIME_SCALEに連動しない", api.currentStamina(open + 12345000), staminaBefore);
CONFIG.time.scale = scaleBefore;

api.state.staminaSpent = 250;
equal("スタミナ: 負数を返さない", api.currentStamina(open), 0);

/* ---------- 属性倍率・属性耐性（Issue #67） ---------- */
const unit = (over) => Object.assign(
  { stats: { STR: 10, VIT: 10, DEX: 8, AGI: 8, INT: 8, MND: 10 }, weaponAtk: 0, armorDef: 0, magicAtk: 0, magicDef: 0, resistances: {} },
  over);
const atkUnit = unit({ weaponAtk: 11 });                                               // 物理攻撃力 = 10 + 11 = 21
const plainDef = unit({ stats: { STR: 0, VIT: 10, DEX: 0, AGI: 8, INT: 0, MND: 3 } }); // 物理防御力 = 10
const slash = { kind: "physical", attributes: { slash: 1 } };

equal("属性: 単一属性の倍率合計", api.attributeTotal(slash), 1);
equal("属性: 複数属性の倍率合計", api.attributeTotal({ kind: "physical", attributes: { slash: 0.7, blunt: 0.3 } }), 1);
equal("属性: 属性未設定は0として扱う", api.attributeTotal({ kind: "physical" }), 0);

equal("ダメージ: 単一属性・耐性0", api.baseDamage(atkUnit, plainDef, slash), 21 - 10);
equal("ダメージ: 単一属性・耐性あり",
  api.baseDamage(atkUnit, unit({ stats: plainDef.stats, resistances: { physical: { slash: 0.5 } } }), slash), 21 - 10 * 1.5);
equal("ダメージ: 複数属性は倍率を合計する",
  api.baseDamage(atkUnit, plainDef, { kind: "physical", attributes: { slash: 0.7, blunt: 0.7 } }), 21 * 1.4 - 10);
equal("ダメージ: 攻撃に含まれない耐性は参照しない",
  api.baseDamage(atkUnit, unit({ stats: plainDef.stats, resistances: { physical: { blunt: 0.5 } } }), slash), 21 - 10);
equal("ダメージ: 対応する耐性だけを合計する",
  api.baseDamage(atkUnit, unit({ stats: plainDef.stats, resistances: { physical: { slash: 0.5, blunt: 0.5 } } }),
    { kind: "physical", attributes: { slash: 0.5, blunt: 0.5 } }), 21 - 10 * 2);
equal("ダメージ: 0未満を返さない",
  api.baseDamage(atkUnit, plainDef, { kind: "physical", attributes: { slash: 0.1 } }), 0);
equal("ダメージ: 耐性データがなくても壊れない",
  api.baseDamage(atkUnit, unit({ resistances: undefined }), slash), 21 - 10);
equal("ダメージ: 魔法はINTとMNDを使う",
  api.baseDamage(atkUnit, plainDef, { kind: "magic", attributes: { fire: 1 } }), 8 - 3);
equal("ダメージ: 魔法も対応属性の耐性だけ参照する",
  api.baseDamage(atkUnit, unit({ stats: plainDef.stats, resistances: { magic: { water: 1 } } }),
    { kind: "magic", attributes: { fire: 1 } }), 8 - 3);

// gapが負なら会心は発生しないため、DEX / AGI補正を決定的に確認できる
const slowDef = unit({ stats: { STR: 0, VIT: 10, DEX: 0, AGI: 28, INT: 0, MND: 3 } });
equal("ダメージ: DEX / AGI補正が適用される", api.actionDamage(atkUnit, slowDef, slash).damage, Math.floor((21 - 10) * 0.8));
check("ダメージ: DEX <= AGIでは会心が発生しない", api.actionDamage(atkUnit, slowDef, slash).critical === false);
check("ダメージ: 会心倍率とDEX / AGI除数を維持",
  CONFIG.battle.damage.criticalMultiplier === 2 && CONFIG.battle.damage.dexAgiDivisor === 100);

const allEnemies = [...CONFIG.battle.enemies, ...CONFIG.battle.eliteEnemies];
for (const enemy of allEnemies) {
  check(`敵データ: ${enemy.name} が属性耐性を持つ`, Boolean(enemy.resistances));
  for (const action of enemy.actions) {
    check(`敵データ: ${enemy.name} ${action.name} に属性がある`,
      action.kind === "physical" && api.attributeTotal(action) > 0, JSON.stringify(action));
    check(`敵データ: ${enemy.name} ${action.name} に旧powerが残っていない`, action.power === undefined);
  }
}
for (const action of CONFIG.battle.player.actions) {
  check(`プレイヤー行動: ${action.name} に属性がある`, api.attributeTotal(action) > 0);
  check(`プレイヤー行動: ${action.name} に旧powerが残っていない`, action.power === undefined);
}

// Utility AIの行動選択に回帰がないこと
equal("Utility AI: 通常時は殴打", api.simulateUtility("orc", 0.9, 0.9).action.name, "殴打");
equal("Utility AI: 相手が低HPなら兜割り", api.simulateUtility("orc", 0.9, 0.3).action.name, "兜割り");
equal("Utility AI: 自分が低HPなら兜割り", api.simulateUtility("orc", 0.3, 0.9).action.name, "兜割り");

/* ---------- 旧セーブからの移行 ---------- */
const now = Date.now();
const legacy = {
  stamina: 42, lastStaminaUpdate: now - 5 * 60000, worldStart: now - 500000,
  gold: 321, level: 5, exp: 12, parameterPoints: 3, skillPoints: 2, currentHp: 77,
  items: { "薬草": 4, "オークの角": 1 }, location: "cave", explorationDepth: 61,
  ownedEquipment: ["trainingDagger", "travelerClothes", "ironDagger"],
  equippedWeapon: "ironDagger", equippedArmor: "travelerClothes",
  history: [{ cost: 10, before: 0, after: 8, total: 8, worldBefore: 0, worldAfter: 8, worldTotal: 8, events: [] }], systemLog: [{ at: "00:00", message: "既存ログ" }],
};
const migrated = loadPrototype(file, { [CONFIG.storageKey]: JSON.stringify(legacy) });
const ms = migrated.api.state;
equal("移行: Goldを保持", ms.gold, 321);
equal("移行: Lvを保持", ms.level, 5);
equal("移行: EXPを保持", ms.exp, 12);
equal("移行: SPを保持", ms.parameterPoints, 3);
equal("移行: APを保持", ms.skillPoints, 2);
equal("移行: HPを保持", ms.currentHp, 77);
equal("移行: 所持品を保持", ms.items["薬草"], 4);
equal("移行: 装備を保持", ms.equippedWeapon, "ironDagger");
equal("移行: locationを保持", ms.location, "cave");
equal("移行: 探索深度を保持", ms.explorationDepth, 61);
equal("移行: 探索履歴を保持", ms.history.length, 1);
equal("移行: システムログを保持", ms.systemLog.length, 1);
check("移行: 累計使用スタミナが負数にならない", ms.staminaSpent >= 0, `spent=${ms.staminaSpent}`);
check("移行: 旧フィールドを保持しない",
  ms.stamina === undefined && ms.lastStaminaUpdate === undefined && ms.worldStart === undefined);
// 旧仕様は最大100・1分1回復。保存値へ lastStaminaUpdate からの未反映回復分を足した値を維持する
const legacyExpected = Math.min(100, legacy.stamina + Math.floor((Date.now() - legacy.lastStaminaUpdate) / 60000));
equal("移行: 未反映回復分の期待値", legacyExpected, 47);
const migratedNow = migrated.api.currentStamina(Date.now());
check("移行: 未反映回復を含む旧仕様上の現在スタミナを維持",
  Math.abs(migratedNow - legacyExpected) <= 1, `stamina=${migratedNow}, expected=${legacyExpected}`);

const saved = JSON.parse(migrated.store[CONFIG.storageKey] || "null");
check("移行: 無操作でもlocalStorageへ書き戻す", saved !== null);
check("移行: 保存内容が新形式", saved && Number.isFinite(saved.staminaSpent)
  && saved.stamina === undefined && saved.lastStaminaUpdate === undefined && saved.worldStart === undefined,
  JSON.stringify(saved && { staminaSpent: saved.staminaSpent, stamina: saved.stamina, lastStaminaUpdate: saved.lastStaminaUpdate, worldStart: saved.worldStart }));
equal("移行: 保存内容が他状態を保持", saved && saved.gold, 321);

// 保存済みデータを再読込しても再移行にならない
const reloaded = loadPrototype(file, migrated.store);
equal("再読込: 累計使用量が保存値と一致", reloaded.api.state.staminaSpent, saved.staminaSpent);
equal("再読込: Goldを保持", reloaded.api.state.gold, 321);

// 旧仕様の上限100を超えて回復させない
const capped = loadPrototype(file, {
  [CONFIG.storageKey]: JSON.stringify({ stamina: 95, lastStaminaUpdate: Date.now() - 3600 * 1000, gold: 1 }),
});
const cappedNow = capped.api.currentStamina(Date.now());
check("移行: 未反映回復は旧仕様の最大100で頭打ちにする", Math.abs(cappedNow - 100) <= 1, `stamina=${cappedNow}`);

/* ---------- 参加時期に依存しないこと ---------- */
const later = loadPrototype(file, {});
later.api.state.staminaSpent = 0;
migrated.api.state.staminaSpent = 0;
equal("後発プレイヤー: 同一時刻・同一消費なら同じスタミナ",
  later.api.currentStamina(now), migrated.api.currentStamina(now));

if (failures.length) {
  for (const failure of failures) console.error(`check_prototype_behavior.js: FAIL: ${failure}`);
  process.exit(1);
}
console.log("check_prototype_behavior.js: PASS");
