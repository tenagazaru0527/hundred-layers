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
  "move", "setLocationAction", "locationAction", "defaultLocationAction",
  "attributeTotal", "resistanceTotal", "baseDamage", "actionDamage", "simulateUtility",
  "abilityLevel", "canRaiseAbility", "raiseAbility", "actionsFor", "validTactics", "gainExp",
  "runBattle", "rest", "battleHtml",
  "normalizeStrategy", "strategyDef", "simulatePlayerStrategy", "choosePlayerAction",
  "initialWorld", "normalizeWorld", "saveWorld", "addWorldProgress", "applyWorldUnlocks",
  "unlockLocation", "unlockBoss", "defeatBoss", "challengeBoss", "worldQuest",
  "locationDef", "locationUnlocked", "locationProgress", "locationComplete",
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
const { api, elements, store } = loadPrototype(file);
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
check("ステータス: APを表示する", /AP/.test(elements.statusBody.innerHTML), elements.statusBody.innerHTML);
check("ステータス: APをアビリティパネルから使用できる旨を説明する",
  /AP（アビリティポイント）[^。]*アビリティパネル[^。]*使用/.test(elements.statusBody.innerHTML), elements.statusBody.innerHTML);
check("ステータス: APが使用未実装という旧説明を残さない",
  !/AP（アビリティポイント）は保持のみ/.test(elements.statusBody.innerHTML)
  && !/AP[^。]*使用は未実装/.test(elements.statusBody.innerHTML), elements.statusBody.innerHTML);
check("アビリティ: 未使用APを表示", /AP /.test(elements.abilityBody.innerHTML));
check("スキル: 強打の仮MPコストを表示", /MPコスト<\/td><td>10</.test(elements.skillBody.innerHTML), elements.skillBody.innerHTML);
check("所持品: 所持金と所持品を表示", /Gold/.test(elements.itemsBody.innerHTML) && /薬草/.test(elements.itemsBody.innerHTML));
equal("MP UI: 現在値 / 最大値を表示", elements.mp.textContent, `${api.state.currentMp} / ${CONFIG.battle.player.maxMp}`);
equal("MP UI: 初期状態のバーは100%", elements.mpBar.style.width, "100%");
check("ロケーションメニュー: 街に宿屋・よろず屋・酒場がある",
  /宿屋/.test(elements.screen.innerHTML) && /よろず屋/.test(elements.screen.innerHTML) && /酒場/.test(elements.screen.innerHTML));
// 現在地の行動（Issue #64）
check("現在地の行動: 街の初期選択は宿屋", api.locationAction === "inn", api.locationAction);
check("現在地の行動: 宿屋の内容を表示する", /宿屋で休む/.test(elements.screen.innerHTML));
check("現在地の行動: 宿屋選択時によろず屋の内容を出さない", !/Gold\/個/.test(elements.screen.innerHTML));
api.setLocationAction("store");
check("現在地の行動: よろず屋へ切り替わる", api.locationAction === "store", api.locationAction);
check("現在地の行動: 素材換金と装備を表示する",
  /Gold\/個/.test(elements.screen.innerHTML) && /装備の購入・変更/.test(elements.screen.innerHTML));
check("現在地の行動: よろず屋選択時に宿屋の内容を出さない", !/宿屋で休む/.test(elements.screen.innerHTML));
check("現在地の行動: 街の本文に重複した移動ボタンがない", !/アルンの森へ/.test(elements.screen.innerHTML));

api.move("forest");
check("ロケーション移動: 現在地が更新される", api.state.location === "forest");
check("ロケーション移動: ダンジョンの初期選択は探索", api.locationAction === "explore", api.locationAction);
check("現在地の行動: 探索の内容を表示する", /探索開始/.test(elements.screen.innerHTML));
check("現在地の行動: ダンジョンの本文に重複した移動ボタンがない", !/街へ戻る/.test(elements.screen.innerHTML));
api.move("town");
check("ロケーション移動: 街へ戻ると初期選択が宿屋へ戻る",
  api.state.location === "town" && api.locationAction === "inn", api.locationAction);

api.state.location = "forest";
api.render();
check("ロケーションメニュー: ダンジョンに探索・討伐・採取がある",
  /探索/.test(elements.screen.innerHTML) && /討伐/.test(elements.screen.innerHTML) && /採取/.test(elements.screen.innerHTML));
check("ロケーションメニュー: 討伐・採取はdisabled", /<button disabled>討伐/.test(elements.screen.innerHTML) && /<button disabled>採取/.test(elements.screen.innerHTML));
api.state.location = "town";
api.setLocationAction("inn");
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
  // 回復行動（Issue #74の検証用）はダメージ計算を通さないため属性を持たない
  const label = Number.isFinite(action.heal) ? "に回復量がある" : "に属性がある";
  check(`プレイヤー行動: ${action.name} ${label}`,
    Number.isFinite(action.heal) ? action.heal > 0 : api.attributeTotal(action) > 0);
  check(`プレイヤー行動: ${action.name} に旧powerが残っていない`, action.power === undefined);
}

/* ---------- Ability / Skill（Issue #71） ---------- */
const abilityDefs = CONFIG.battle.abilities.list;
equal("Ability: Prototypeでは1種のみ", abilityDefs.length, 1);
const ability = abilityDefs[0];
equal("Ability: 新規stateはLv0", api.abilityLevel(ability.id), 0);
// 強打は未習得。応急手当はIssue #74の検証用行動で習得不要のため常に利用できる
equal("Ability: 未習得時は強打を利用可能行動に含めない",
  api.actionsFor(api.state.abilities).map((a) => a.id).join(","), "attack,firstAid");
const freshState = loadPrototype(file, {});
equal("Ability: 未習得時の初期戦術に強打を含めない",
  JSON.stringify(freshState.api.state.tactics), JSON.stringify({ attack: 75, firstAid: 25 }));

// AP不足では上げられない
api.state.skillPoints = 0;
check("Ability: AP不足では上げられない", api.canRaiseAbility(ability.id) === false);
api.raiseAbility(ability.id);
equal("Ability: AP不足時はLvが変わらない", api.abilityLevel(ability.id), 0);

// AP1消費でLv+1、閾値到達でSkill習得
api.state.skillPoints = 2;
check("Ability: APがあれば上げられる", api.canRaiseAbility(ability.id) === true);
api.raiseAbility(ability.id);
equal("Ability: AP1消費でLv+1", api.abilityLevel(ability.id), 1);
equal("Ability: APが1減る", api.state.skillPoints, 1);
equal("Skill: Lv1で強打を習得扱いにする",
  api.actionsFor(api.state.abilities).map((a) => a.id).join(","), "attack,skill,firstAid");
equal("Skill: 習得後の初期戦術は通常攻撃60 / 強打20 / 応急手当20",
  JSON.stringify(api.state.tactics), JSON.stringify({ attack: 60, skill: 20, firstAid: 20 }));
check("Skill: 習得後の戦術合計が100", Object.values(api.state.tactics).reduce((a, b) => a + b, 0) === 100);
check("Skill: 習得後の戦術設定が妥当", api.validTactics(api.state.tactics, api.state.abilities) === true);

// Prototype上限を超えて上げられない
check("Ability: Prototype上限へ到達すると上げられない", api.canRaiseAbility(ability.id) === false);
api.raiseAbility(ability.id);
equal("Ability: 上限を超えてLvが上がらない", api.abilityLevel(ability.id), ability.maxLevel);
equal("Ability: 上限到達後はAPを消費しない", api.state.skillPoints, 1);

// Ability UI / Skill UI
api.render();
check("Ability UI: Lvと未使用APを表示", /AP /.test(elements.abilityBody.innerHTML) && /Lv1/.test(elements.abilityBody.innerHTML));
check("Ability UI: 習得済みスキルを表示", /強打/.test(elements.abilityBody.innerHTML));
check("Ability UI: 上限到達でボタンをdisabledにする", /data-ability="[^"]*"\s+disabled/.test(elements.abilityBody.innerHTML), elements.abilityBody.innerHTML);
check("Skill UI: 習得状態と習得条件を表示",
  /習得済み/.test(elements.skillBody.innerHTML) && /斬撃術 Lv1/.test(elements.skillBody.innerHTML), elements.skillBody.innerHTML);
check("Skill UI: 属性と種別を表示", /斬 1.42/.test(elements.skillBody.innerHTML) && /Active/.test(elements.skillBody.innerHTML));

// 保存と再読込
api.save();
const savedAbility = JSON.parse(migratedStoreProbe()).abilities;
function migratedStoreProbe() { return store[CONFIG.storageKey]; }
equal("Ability: localStorageへ保存される", savedAbility[ability.id], 1);
const reloadedAbility = loadPrototype(file, store);
equal("Ability: 再読込後もLvを維持", reloadedAbility.api.abilityLevel(ability.id), 1);
equal("Skill: 再読込後も習得状態を維持",
  reloadedAbility.api.actionsFor(reloadedAbility.api.state.abilities).map((a) => a.id).join(","), "attack,skill,firstAid");

// 旧セーブ互換: Ability情報がなく、旧tacticsに強打比率が残っている場合
const legacyAbility = loadPrototype(file, {
  [CONFIG.storageKey]: JSON.stringify({
    tactics: { attack: 60, skill: 40 }, gold: 55, level: 3, parameterPoints: 2, skillPoints: 3,
    currentHp: 70, stats: { STR: 12, VIT: 10, DEX: 8, AGI: 8, INT: 8, MND: 8 },
  }),
});
equal("旧セーブ: AbilityデータがなくてもLv0で読み込む", legacyAbility.api.abilityLevel(ability.id), 0);
equal("旧セーブ: 未習得なら強打を戦術設定へ出さない",
  JSON.stringify(legacyAbility.api.state.tactics), JSON.stringify({ attack: 75, firstAid: 25 }));
equal("旧セーブ: 未習得なら強打を利用可能行動に含めない",
  legacyAbility.api.actionsFor(legacyAbility.api.state.abilities).map((a) => a.id).join(","), "attack,firstAid");
equal("旧セーブ: Gold / Lv / SP / AP / HP / statsを保持",
  [legacyAbility.api.state.gold, legacyAbility.api.state.level, legacyAbility.api.state.parameterPoints,
   legacyAbility.api.state.skillPoints, legacyAbility.api.state.currentHp, legacyAbility.api.state.stats.STR].join(","),
  "55,3,2,3,70,12");

// 未習得状態では強打を実行しない
const dummyEnemy = {
  id: "ability-dummy", name: "検証用", probability: 1, maxHp: 999, exp: 0, material: null,
  stats: { STR: 0, VIT: 0, DEX: 0, AGI: 0, INT: 0, MND: 0 },
  actions: [{ name: "様子見", probability: 1, kind: "physical", attributes: { blunt: 0 } }], resistances: {},
};
legacyAbility.api.state.tactics = { attack: 0, skill: 100 };   // 未習得Skillへ全振りした不正な設定
legacyAbility.api.state.currentHp = CONFIG.battle.player.maxHp;
legacyAbility.api.state.currentMp = CONFIG.battle.player.maxMp;
const legacyBattle = legacyAbility.api.runBattle([dummyEnemy]);
check("旧セーブ: 未習得の強打を実行しない",
  legacyBattle.turns.every((turn) => turn.playerAction === "通常攻撃"),
  legacyBattle.turns.map((t) => t.playerAction).join(","));

// LvUPでAPを得てAbilityへ使う縦切り
const growth = loadPrototype(file, {});
growth.api.state.exp = 0;
growth.api.gainExp(500);
check("縦切り: LvUPでAPを獲得する", growth.api.state.skillPoints > 0, String(growth.api.state.skillPoints));
growth.api.raiseAbility(ability.id);
equal("縦切り: 獲得したAPでAbility Lv1へ", growth.api.abilityLevel(ability.id), 1);
growth.api.state.tactics = { attack: 0, skill: 100 };
growth.api.state.currentHp = CONFIG.battle.player.maxHp;
growth.api.state.currentMp = 10;
const skillBattle = growth.api.runBattle([dummyEnemy]);
equal("縦切り: 習得した強打をオートバトルで使用する", skillBattle.turns[0].playerAction, "強打");
equal("縦切り: 強打でMPを10消費する", skillBattle.turns[0].mpSpent, 10);
equal("縦切り: 強打の属性倍率を維持",
  CONFIG.battle.player.actions.find((a) => a.id === "skill").attributes.slash, 1.42);

/* ---------- MP（Issue #68） ---------- */
equal("MP: 最大値はPrototype固定値", CONFIG.battle.player.maxMp, 50);
equal("MP: 新規stateは最大MPで開始", api.state.currentMp, CONFIG.battle.player.maxMp);
equal("MP: 強打の仮コスト", CONFIG.battle.player.actions.find((action) => action.id === "skill").mpCost, 10);

const mpDummy = {
  id: "mp-dummy", name: "MP検証用", probability: 1, maxHp: 1, exp: 0, material: null,
  stats: { STR: 0, VIT: 0, DEX: 0, AGI: 0, INT: 0, MND: 0 }, actions: [], resistances: {},
};
// 強打はAbility Lv1で習得するため、MP検証の前に習得済みにする（Issue #71）
api.state.abilities = { slashTraining: 1 };
api.state.tactics = { attack: 0, skill: 100 };
api.state.currentHp = CONFIG.battle.player.maxHp;
api.state.currentMp = 20;
const mpBattle1 = api.runBattle([mpDummy]);
equal("MP: MP消費行動でcurrentMpが減る", api.state.currentMp, 10);
equal("MP: 行動ログに消費量を保持", mpBattle1.turns[0].mpSpent, 10);
equal("MP: 戦闘終了後も残MPを保持", mpBattle1.playerMp, 10);
const mpBattle2 = api.runBattle([mpDummy]);
equal("MP: 次戦へ残MPを持ち越す", mpBattle2.turns[0].playerMp, 0);
const mpBattle3 = api.runBattle([mpDummy]);
// Issue #74で候補除外方式へ移行したため、抽選後のfallbackではなくUtility評価前に除外される
equal("MP: 不足時はMPコスト行動を候補から除外し通常攻撃を選ぶ", mpBattle3.turns[0].playerAction, "通常攻撃");
equal("MP: 除外理由はMP不足",
  (mpBattle3.turns[0].excluded || []).find((entry) => entry.id === "skill")?.reason, "mp");
equal("MP: 不足時も負数にならない", api.state.currentMp, 0);
const mpLog = api.battleHtml(mpBattle3);
check("MP: 戦闘ログで候補除外と残MPを確認できる", /MP不足/.test(mpLog) && /残MP/.test(mpLog), mpLog);
const legacyBattleLog = api.battleHtml({
  enemyName: "旧敵", enemyMaxHp: 10, result: "victory", playerHp: 5, enemyHp: 0,
  turns: [{ turn: 1, playerAction: "通常攻撃", playerDamage: 10, playerCritical: false,
    enemyAction: "行動なし", enemyDamage: 0, enemyCritical: false, playerHp: 5, enemyHp: 0, fallback: false }],
});
check("MP: 旧戦闘履歴にundefinedを表示しない", !/undefined/.test(legacyBattleLog), legacyBattleLog);

api.state.location = "forest";
api.state.currentHp = 1;
api.state.currentMp = 0;
api.move("town");
equal("MP: 街へ移動しただけでは回復しない", api.state.currentMp, 0);
api.rest();
equal("宿屋: HPを最大まで回復", api.state.currentHp, CONFIG.battle.player.maxHp);
equal("宿屋: MPを最大まで回復", api.state.currentMp, CONFIG.battle.player.maxMp);
api.state.currentMp = 13;
api.save();
equal("MP: currentMpをlocalStorageへ保存", JSON.parse(store[CONFIG.storageKey]).currentMp, 13);
api.state.currentMp = CONFIG.battle.player.maxMp;

/* ---------- プレイヤー作戦型Utility AI（Issue #74） ---------- */
const strategies = CONFIG.battle.strategies;
equal("作戦: Prototypeでは3種", strategies.list.map((entry) => entry.id).join(","), "balanced,offensive,defensive");
equal("作戦: 新規stateは既定の作戦", freshState.api.state.strategy, strategies.default);
equal("作戦: 未知IDは既定の作戦へ落とす", api.normalizeStrategy("unknown"), strategies.default);
equal("作戦: 旧セーブに作戦がなくても既定の作戦で読み込む", legacyAbility.api.state.strategy, strategies.default);

// 同一戦況・同一基礎優先度で作戦だけ変えて比較する。randomBandを0にして決定論で確認する
const ai = loadPrototype(file, {});
ai.api.CONFIG.battle.strategies.randomBand = 0;
ai.api.state.abilities = { slashTraining: 1 };
ai.api.state.tactics = { attack: 60, skill: 20, firstAid: 20 };
const pick = (id, situation) => ai.api.simulatePlayerStrategy(id, situation).action.name;

// HP満タン・MP満タン：攻撃重視だけがMP消費スキルを選ぶ
const healthy = { selfHpRatio: 1, selfMpRatio: 1, enemyHpRatio: 1 };
equal("作戦: バランスは通常攻撃", pick("balanced", healthy), "通常攻撃");
equal("作戦: 攻撃重視は強打", pick("offensive", healthy), "強打");
equal("作戦: 生存重視は通常攻撃", pick("defensive", healthy), "通常攻撃");

// HP75%：生存重視だけが回復へ切り替わる
const grazed = { selfHpRatio: 0.75, selfMpRatio: 1, enemyHpRatio: 1 };
equal("作戦: HP75%でバランスはまだ攻撃", pick("balanced", grazed), "通常攻撃");
equal("作戦: HP75%で攻撃重視は攻撃を続ける", pick("offensive", grazed), "強打");
equal("作戦: HP75%で生存重視は回復", pick("defensive", grazed), "応急手当");

// HP30%：危険域ではバランスも回復するが、攻撃重視は攻撃を続ける
const danger = { selfHpRatio: 0.3, selfMpRatio: 1, enemyHpRatio: 1 };
equal("作戦: HP30%でバランスは回復", pick("balanced", danger), "応急手当");
equal("作戦: HP30%で攻撃重視は攻撃を続ける", pick("offensive", danger), "強打");
equal("作戦: HP30%で生存重視は回復", pick("defensive", danger), "応急手当");

// MP残量20%：作戦によってMPの使い方が変わる
const lowMp = { selfHpRatio: 1, selfMpRatio: 0.2, enemyHpRatio: 1 };
equal("作戦: MP20%で攻撃重視はMPを使う", pick("offensive", lowMp), "強打");
equal("作戦: MP20%でバランスはMPを温存", pick("balanced", lowMp), "通常攻撃");
equal("作戦: MP20%で生存重視はMPを温存", pick("defensive", lowMp), "通常攻撃");
equal("作戦: 生存重視は温存したMPをHP低下時の回復へ回す",
  pick("defensive", { selfHpRatio: 0.4, selfMpRatio: 0.3, enemyHpRatio: 1 }), "応急手当");

// 候補除外（Issue #74 §3.1）
const excludedIds = (id, situation) =>
  ai.api.simulatePlayerStrategy(id, situation).excluded.map((entry) => `${entry.id}:${entry.reason}`).join(",");
equal("候補除外: HP満タンでは回復行動を除外", excludedIds("balanced", healthy), "firstAid:full");
equal("候補除外: MP不足のスキルを除外",
  excludedIds("offensive", { selfHpRatio: 0.5, selfMpRatio: 0, enemyHpRatio: 1 }), "skill:mp,firstAid:mp");
equal("候補除外: 使用回数上限に達したスキルを除外",
  excludedIds("offensive", { ...healthy, usesByAction: { skill: 0 } }), "skill:uses,firstAid:full");
equal("候補除外: 除外されても通常攻撃は必ず残る",
  pick("offensive", { selfHpRatio: 1, selfMpRatio: 0, enemyHpRatio: 1 }), "通常攻撃");
equal("候補除外: 未習得の強打は候補に現れない",
  ai.api.simulatePlayerStrategy("offensive", { ...healthy, abilities: { slashTraining: 0 } })
    .scores.map((score) => score.id).join(","), "attack");

// 基礎優先度0は「使用しない」というプレイヤー指定として扱う
ai.api.CONFIG.battle.strategies.randomBand = 0;
ai.api.state.tactics = { attack: 100, skill: 0, firstAid: 0 };
equal("優先度0: 生存重視でもHP低下時に応急手当0なら使用しない", pick("defensive", danger), "通常攻撃");
equal("優先度0: 攻撃重視でも強打0なら使用しない", pick("offensive", healthy), "通常攻撃");
equal("優先度0: 除外理由を優先度0として記録",
  excludedIds("offensive", healthy), "skill:unused,firstAid:unused");
check("安全fallback: 候補が残る通常時はfallback扱いにしない",
  ai.api.simulatePlayerStrategy("offensive", healthy).fallback === false);

// 全候補が消えた場合の安全fallback。validTacticsが合計100%を要求するためUIからは到達しないが、
// 優先度0・MP不足・使用回数上限・HP満タンの重なりで候補が全滅しても通常攻撃を選べること
ai.api.state.tactics = { attack: 0, skill: 0, firstAid: 0 };
const allExcluded = ai.api.simulatePlayerStrategy("offensive", danger);
equal("安全fallback: 全候補が除外されても通常攻撃を選ぶ", allExcluded.action.name, "通常攻撃");
check("安全fallback: fallbackとして記録する", allExcluded.fallback === true);
equal("安全fallback: 全行動を除外理由付きで記録",
  allExcluded.excluded.map((entry) => `${entry.id}:${entry.reason}`).join(","),
  "attack:unused,skill:unused,firstAid:unused");

// ランダム性：randomBandが0なら決定論、正なら最高Scoreに近い候補ほど選ばれやすい重み付き抽選
const repeat = (times, fn) => new Set(Array.from({ length: times }, fn));
ai.api.state.tactics = { attack: 60, skill: 20, firstAid: 20 };
ai.api.CONFIG.battle.strategies.randomBand = 0;
equal("ランダム性: randomBand0では選択が揺れない", repeat(40, () => pick("balanced", healthy)).size, 1);

// バランス・HP満タンでは 通常攻撃=45 / 強打=25+15=40 となり、Score差5で近接する
ai.api.state.tactics = { attack: 45, skill: 25, firstAid: 30 };
ai.api.CONFIG.battle.strategies.randomBand = 10;
const maxWeight = strategies.randomBand + strategies.randomWeightBase;
const weighted = ai.api.simulatePlayerStrategy("balanced", healthy);
equal("重み付き抽選: 対象は上位候補2件", weighted.top.map((entry) => entry.name).join(","), "通常攻撃,強打");
equal("重み付き抽選: 最高Scoreの重みは randomBand + randomWeightBase",
  weighted.top.find((entry) => entry.name === "通常攻撃").weight, maxWeight);
equal("重み付き抽選: Score差5の候補は重みが5小さい",
  weighted.top.find((entry) => entry.name === "強打").weight, maxWeight - 5);
check("ランダム性: 近いScoreの上位候補間では選択が割れる",
  repeat(80, () => pick("balanced", healthy)).size > 1);
// 一様抽選なら約50:50、重み付き（11:6）なら通常攻撃が明確に多くなる
const picks = Array.from({ length: 1000 }, () => pick("balanced", healthy));
const highScore = picks.filter((name) => name === "通常攻撃").length;
check("重み付き抽選: 高Scoreの候補が明確に選ばれやすい",
  highScore > (picks.length - highScore) * 1.3, `通常攻撃 ${highScore} / ${picks.length}`);
ai.api.CONFIG.battle.strategies.randomBand = strategies.randomBand;
ai.api.state.tactics = { attack: 60, skill: 20, firstAid: 20 };

// 回復行動の実処理
const healDummy = {
  id: "heal-dummy", name: "作戦検証用", probability: 1, maxHp: 999, exp: 0, material: null,
  stats: { STR: 0, VIT: 0, DEX: 0, AGI: 0, INT: 0, MND: 0 },
  actions: [{ name: "様子見", probability: 1, kind: "physical", attributes: { blunt: 0 } }], resistances: {},
};
const firstAid = CONFIG.battle.player.actions.find((action) => action.id === "firstAid");
equal("回復行動: 習得条件を持たない", firstAid.requires, undefined);
ai.api.CONFIG.battle.strategies.randomBand = 0;
ai.api.state.strategy = "defensive";
ai.api.state.currentHp = 40;
ai.api.state.currentMp = CONFIG.battle.player.maxMp;
const healBattle = ai.api.runBattle([healDummy]);
equal("回復行動: 生存重視の初手は応急手当", healBattle.turns[0].playerAction, "応急手当");
equal("回復行動: HPが回復量ぶん回復する", healBattle.turns[0].healed, firstAid.heal);
equal("回復行動: MPを消費する", healBattle.turns[0].mpSpent, firstAid.mpCost);
equal("回復行動: ダメージを与えない", healBattle.turns[0].playerDamage, 0);
check("回復行動: 最大HPを超えない",
  healBattle.turns.every((turn) => turn.playerHp <= CONFIG.battle.player.maxHp));
check("回復行動: 戦闘ログへ回復量を表示", /HPが\d+回復/.test(ai.api.battleHtml(healBattle)));
check("回復行動: 戦闘ログへ作戦を表示", /作戦：生存重視/.test(ai.api.battleHtml(healBattle)));

// 実戦闘でも全候補除外から安全fallbackできること
ai.api.state.tactics = { attack: 0, skill: 0, firstAid: 0 };
ai.api.state.currentHp = CONFIG.battle.player.maxHp;
ai.api.state.currentMp = CONFIG.battle.player.maxMp;
const fallbackBattle = ai.api.runBattle([healDummy]);
check("安全fallback: 実戦闘でも通常攻撃を実行する",
  fallbackBattle.turns.every((turn) => turn.playerAction === "通常攻撃"),
  fallbackBattle.turns.map((turn) => turn.playerAction).join(","));
equal("安全fallback: MPを消費しない", fallbackBattle.playerMp, CONFIG.battle.player.maxMp);
check("安全fallback: 戦闘ログへfallbackを表示",
  /通常攻撃へfallback/.test(ai.api.battleHtml(fallbackBattle)));
check("安全fallback: 戦闘ログへ優先度0の除外理由を表示",
  /優先度0/.test(ai.api.battleHtml(fallbackBattle)));
ai.api.state.tactics = { attack: 60, skill: 20, firstAid: 20 };

// 保存と再読込
ai.api.state.strategy = "offensive";
ai.api.save();
equal("作戦: localStorageへ保存される", JSON.parse(ai.store[CONFIG.storageKey]).strategy, "offensive");
equal("作戦: 再読込後も維持される", loadPrototype(file, ai.store).api.state.strategy, "offensive");

// Utility AIの行動選択に回帰がないこと
equal("Utility AI: 通常時は殴打", api.simulateUtility("orc", 0.9, 0.9).action.name, "殴打");
equal("Utility AI: 相手が低HPなら兜割り", api.simulateUtility("orc", 0.9, 0.3).action.name, "兜割り");
equal("Utility AI: 自分が低HPなら兜割り", api.simulateUtility("orc", 0.3, 0.9).action.name, "兜割り");

/* ---------- 第1層ロケーション進行（Issue #76） ---------- */
const layer1 = loadPrototype(file, {});
const w = () => layer1.api.worldState;
const maxHp = CONFIG.battle.player.maxHp;
// 探索を1回まわす。HPを満タンへ戻してから呼び、スタミナが実際に消費されたことを成立条件にする
// （履歴は historyLimit で頭打ちになるため、実行判定には使わない）
function runExplore(instance) {
  instance.api.state.currentHp = maxHp;
  instance.api.state.currentMp = CONFIG.battle.player.maxMp;
  const before = instance.api.state.staminaSpent;
  instance.api.explore(10);
  return instance.api.state.staminaSpent === before + 10;
}
// トラップ・進行なし等の踏破率0イベントを引くことがあるため、増加するまで数回まわす
function exploreUntilProgress(instance, locationId, attempts = 15) {
  for (let i = 0; i < attempts; i += 1) {
    const before = instance.api.locationProgress(locationId);
    if (!runExplore(instance)) return false;
    if (instance.api.locationProgress(locationId) > before) return true;
  }
  return false;
}

equal("第1層: ロケーションは街・森・巣穴の3種",
  CONFIG.locations.list.map((def) => `${def.id}:${def.name}`).join(","),
  "town:アルマセント,forest:アルンの森,den:ゴブリンの巣穴");
check("第1層: 新規stateでアルンの森はunlocked", w().locations.forest.unlocked === true);
check("第1層: 新規stateでゴブリンの巣穴はlocked", w().locations.den.unlocked === false);
equal("第1層: 新規stateの踏破率はロケーション別に0",
  `${w().locations.forest.progress},${w().locations.den.progress}`, "0,0");
equal("第1層: 開始クエストはアルンの森の調査", layer1.api.worldQuest().title, "アルンの森を調査せよ");
check("第1層: 新規stateでボスも第2層も未解放",
  w().bosses.goblinWarlord.unlocked === false && w().bosses.goblinWarlord.defeated === false
  && w().layers.layer2Unlocked === false);

// lockedロケーションへは移動できない
layer1.api.move("den");
equal("第1層: lockedロケーションへ移動できない", layer1.api.state.location, "town");
check("第1層: 街では探索できない", runExplore(layer1) === false);

// 森で探索すると森の踏破率だけが進む
layer1.api.move("forest");
equal("第1層: 解放済みの森へは移動できる", layer1.api.state.location, "forest");
check("第1層: 森で探索すると森の踏破率が進む", exploreUntilProgress(layer1, "forest"));
check("第1層: 森の探索では巣穴の踏破率が進まない",
  w().locations.den.progress === 0, JSON.stringify(w().locations));
check("第1層: 個人の探索深度もロケーション別に進む",
  layer1.api.state.explorationDepth.forest >= 0 && layer1.api.state.explorationDepth.den === 0,
  JSON.stringify(layer1.api.state.explorationDepth));

// 森100%でゴブリンの巣穴を1回だけ解放する
layer1.api.addWorldProgress("forest", 100);
equal("第1層: 森の踏破率は100%で頭打ち", w().locations.forest.progress, 100);
check("第1層: 森100%で巣穴が解放される",
  layer1.api.unlockLocation("den") === true && w().locations.den.unlocked === true);
check("第1層: 巣穴の解放は1回だけ発火する", layer1.api.unlockLocation("den") === false);
equal("第1層: 巣穴解放でクエストが進む", layer1.api.worldQuest().title, "ゴブリンを掃討せよ");
equal("第1層: 巣穴解放時のStepは巣穴調査", w().quest.step, "denSurvey");
check("第1層: 前のクエストを完了扱いにする", w().quest.completed.includes("forestSurvey"));

// 100%到達後も探索を継続できる
check("第1層: 森100%後も森を探索できる", runExplore(layer1));
equal("第1層: 100%到達後は森の踏破率が増えない", w().locations.forest.progress, 100);

// 巣穴100%でゴブリン・ウォーロードを1回だけ解放する
layer1.api.move("den");
equal("第1層: 解放後は巣穴へ移動できる", layer1.api.state.location, "den");
check("第1層: 巣穴で探索すると巣穴の踏破率が進む", exploreUntilProgress(layer1, "den"));
check("第1層: 巣穴の探索では森の踏破率が変わらない",
  w().locations.forest.progress === 100, JSON.stringify(w().locations));
layer1.api.addWorldProgress("den", 100);
check("第1層: 巣穴100%でボスが解放される",
  layer1.api.unlockBoss("goblinWarlord") === true && w().bosses.goblinWarlord.unlocked === true);
check("第1層: ボスの解放は1回だけ発火する", layer1.api.unlockBoss("goblinWarlord") === false);
equal("第1層: ボス解放でStepが討伐へ進む", w().quest.step, "warlord");
check("第1層: 巣穴100%後も巣穴を探索できる", runExplore(layer1));
equal("第1層: 100%到達後は巣穴の踏破率が増えない", w().locations.den.progress, 100);

// ボス未解放では撃破できない
const freshBoss = loadPrototype(file, {});
check("第1層: ボス未解放時は撃破処理できない",
  freshBoss.api.defeatBoss("goblinWarlord") === false
  && freshBoss.api.worldState.bosses.goblinWarlord.defeated === false
  && freshBoss.api.worldState.layers.layer2Unlocked === false);

// 撃破 → 第2層解放 → 重複しない
check("第1層: ボス撃破でdefeatedになる",
  layer1.api.defeatBoss("goblinWarlord") === true && w().bosses.goblinWarlord.defeated === true);
check("第1層: 初回撃破で第2層が解放される", w().layers.layer2Unlocked === true);
check("第1層: 撃破でクエストが完了する",
  w().quest.current === null && w().quest.completed.includes("goblinCleanup"));
equal("第1層: 完了後のクエスト表示", layer1.api.worldQuest().title, CONFIG.world.completedTitle);
const worldSnapshot = JSON.stringify(w());
check("第1層: 再度撃破しても進行が重複しない",
  layer1.api.defeatBoss("goblinWarlord") === false && JSON.stringify(w()) === worldSnapshot);

// 保存と再読込
layer1.api.saveWorld();
const reloadedWorld = loadPrototype(file, layer1.store).api.worldState;
equal("第1層: 再読込後も進行状態を維持する",
  JSON.stringify({ forest: reloadedWorld.locations.forest, den: reloadedWorld.locations.den,
    boss: reloadedWorld.bosses.goblinWarlord, layer2: reloadedWorld.layers.layer2Unlocked,
    quest: reloadedWorld.quest.current }),
  JSON.stringify({ forest: { unlocked: true, progress: 100 }, den: { unlocked: true, progress: 100 },
    boss: { unlocked: true, defeated: true }, layer2: true, quest: null }));

// UI導線
const lockedUi = loadPrototype(file, {});
lockedUi.api.render();
check("第1層UI: 3ロケーションの移動ボタンを表示する",
  ["town", "forest", "den"].every((id) => lockedUi.elements.locationButtons.innerHTML.includes(`data-location="${id}"`)),
  lockedUi.elements.locationButtons.innerHTML);
check("第1層UI: 未解放の巣穴はdisabledで表示する",
  /data-location="den"[^>]*disabled/.test(lockedUi.elements.locationButtons.innerHTML),
  lockedUi.elements.locationButtons.innerHTML);
check("第1層UI: 未解放の巣穴に解放条件を示す",
  /アルンの森 踏破率100%で解放/.test(lockedUi.elements.locationButtons.innerHTML));
lockedUi.api.state.location = "forest";
lockedUi.api.render();
check("第1層UI: ダンジョンでは現在地の踏破率を表示する",
  lockedUi.elements.location.textContent === "アルンの森" && lockedUi.elements.clearRateBox.hidden === false);
lockedUi.api.state.location = "town";
lockedUi.api.render();
check("第1層UI: 街では踏破率を表示しない", lockedUi.elements.clearRateBox.hidden === true);

layer1.api.render();
check("第1層UI: 撃破済みのボスを討伐済みとして表示する",
  /ゴブリン・ウォーロードは討伐済みです/.test(layer1.elements.screen.innerHTML));
check("第1層UI: 第2層の解放を表示する",
  /第2層が解放されました/.test(layer1.elements.screen.innerHTML), layer1.elements.screen.innerHTML);

// 検証用撃破ボタンの導線
const bossFlow = loadPrototype(file, {});
bossFlow.api.addWorldProgress("forest", 100);
bossFlow.api.applyWorldUnlocks();
bossFlow.api.state.location = "den";
bossFlow.api.render();
check("第1層UI: ボス未解放時は解放条件を示す",
  /踏破率が100%に到達すると、ゴブリン・ウォーロードが解放されます/.test(bossFlow.elements.screen.innerHTML),
  bossFlow.elements.screen.innerHTML);
bossFlow.api.addWorldProgress("den", 100);
bossFlow.api.applyWorldUnlocks();
check("第1層: 解放判定をまとめて実行しても順に発火する",
  bossFlow.api.worldState.locations.den.unlocked === true
  && bossFlow.api.worldState.bosses.goblinWarlord.unlocked === true);
bossFlow.api.state.location = "den";
bossFlow.api.render();
check("第1層UI: 未撃破時は検証用撃破ボタンを表示する",
  /data-boss="goblinWarlord"/.test(bossFlow.elements.screen.innerHTML));
bossFlow.api.challengeBoss("goblinWarlord");
check("第1層: 検証用撃破で第2層まで解放される",
  bossFlow.api.worldState.bosses.goblinWarlord.defeated === true
  && bossFlow.api.worldState.layers.layer2Unlocked === true);

// 旧形式の世界進行は破棄して初期化する（Issue #76 §9）
const legacyWorld = loadPrototype(file, {
  [CONFIG.worldStorageKey]: JSON.stringify({ progress: 100, step: "bossFound", bossUnlocked: true }),
  [CONFIG.storageKey]: JSON.stringify({ gold: 777, level: 4, location: "cave", explorationDepth: 55 }),
});
check("旧セーブ: 旧形式の世界進行を破棄して初期化する",
  legacyWorld.api.worldState.locations.forest.progress === 0
  && legacyWorld.api.worldState.locations.den.unlocked === false
  && legacyWorld.api.worldState.bosses.goblinWarlord.unlocked === false
  && legacyWorld.api.worldState.layers.layer2Unlocked === false,
  JSON.stringify(legacyWorld.api.worldState));
equal("旧セーブ: 世界進行を初期化してもGoldは保持する", legacyWorld.api.state.gold, 777);
equal("旧セーブ: 世界進行を初期化してもLvは保持する", legacyWorld.api.state.level, 4);
equal("旧セーブ: 旧locationは街へ落とす", legacyWorld.api.state.location, "town");
check("旧セーブ: 初期化した旨をログへ残す",
  legacyWorld.api.state.systemLog.some((entry) => /旧形式の世界進行/.test(entry.message)),
  JSON.stringify(legacyWorld.api.state.systemLog));

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
equal("移行: MPがない旧セーブは最大MPで初期化", ms.currentMp, CONFIG.battle.player.maxMp);
equal("移行: 所持品を保持", ms.items["薬草"], 4);
equal("移行: 装備を保持", ms.equippedWeapon, "ironDagger");
// Issue #76でロケーションが分割されたため、旧「始まりの洞窟」の現在地と探索深度は引き継がない
equal("移行: 旧locationは街へ正規化する", ms.location, "town");
equal("移行: 旧探索深度は引き継がずロケーション別に0で初期化する",
  JSON.stringify(ms.explorationDepth), JSON.stringify({ forest: 0, den: 0 }));
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
