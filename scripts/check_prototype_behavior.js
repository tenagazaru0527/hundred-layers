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
  "abilityLevel", "canRaiseAbility", "raiseAbility", "actionsFor", "validTactics", "runBattle", "gainExp",
  "runBattle", "rest", "battleHtml",
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
check("現在地の行動: 街の本文に重複した移動ボタンがない", !/始まりの洞窟へ/.test(elements.screen.innerHTML));

api.move("cave");
check("ロケーション移動: 現在地が更新される", api.state.location === "cave");
check("ロケーション移動: ダンジョンの初期選択は探索", api.locationAction === "explore", api.locationAction);
check("現在地の行動: 探索の内容を表示する", /探索開始/.test(elements.screen.innerHTML));
check("現在地の行動: 洞窟の本文に重複した移動ボタンがない", !/街へ戻る/.test(elements.screen.innerHTML));
api.move("town");
check("ロケーション移動: 街へ戻ると初期選択が宿屋へ戻る",
  api.state.location === "town" && api.locationAction === "inn", api.locationAction);

api.state.location = "cave";
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
  check(`プレイヤー行動: ${action.name} に属性がある`, api.attributeTotal(action) > 0);
  check(`プレイヤー行動: ${action.name} に旧powerが残っていない`, action.power === undefined);
}

/* ---------- Ability / Skill（Issue #71） ---------- */
const abilityDefs = CONFIG.battle.abilities.list;
equal("Ability: Prototypeでは1種のみ", abilityDefs.length, 1);
const ability = abilityDefs[0];
equal("Ability: 新規stateはLv0", api.abilityLevel(ability.id), 0);
equal("Ability: 未習得時の利用可能行動は通常攻撃のみ", api.actionsFor(api.state.abilities).map((a) => a.id).join(","), "attack");
equal("Ability: 未習得時の初期戦術は通常攻撃100%", JSON.stringify(api.state.tactics), JSON.stringify({ attack: 100 }));

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
  api.actionsFor(api.state.abilities).map((a) => a.id).join(","), "attack,skill");
equal("Skill: 習得後の初期戦術は通常攻撃60 / 強打40", JSON.stringify(api.state.tactics), JSON.stringify({ attack: 60, skill: 40 }));
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
  reloadedAbility.api.actionsFor(reloadedAbility.api.state.abilities).map((a) => a.id).join(","), "attack,skill");

// 旧セーブ互換: Ability情報がなく、旧tacticsに強打比率が残っている場合
const legacyAbility = loadPrototype(file, {
  [CONFIG.storageKey]: JSON.stringify({
    tactics: { attack: 60, skill: 40 }, gold: 55, level: 3, parameterPoints: 2, skillPoints: 3,
    currentHp: 70, stats: { STR: 12, VIT: 10, DEX: 8, AGI: 8, INT: 8, MND: 8 },
  }),
});
equal("旧セーブ: AbilityデータがなくてもLv0で読み込む", legacyAbility.api.abilityLevel(ability.id), 0);
equal("旧セーブ: 未習得なら強打を戦術設定へ出さない",
  JSON.stringify(legacyAbility.api.state.tactics), JSON.stringify({ attack: 100 }));
equal("旧セーブ: 未習得なら強打を利用可能行動に含めない",
  legacyAbility.api.actionsFor(legacyAbility.api.state.abilities).map((a) => a.id).join(","), "attack");
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
equal("MP: 不足時は通常攻撃へfallback", mpBattle3.turns[0].playerAction, "通常攻撃");
equal("MP: fallback理由はMP不足", mpBattle3.turns[0].fallbackReason, "mp");
equal("MP: 不足時も負数にならない", api.state.currentMp, 0);
const mpLog = api.battleHtml(mpBattle3);
check("MP: 戦闘ログでfallbackと残MPを確認できる", /MP不足/.test(mpLog) && /残MP/.test(mpLog), mpLog);
const legacyBattleLog = api.battleHtml({
  enemyName: "旧敵", enemyMaxHp: 10, result: "victory", playerHp: 5, enemyHp: 0,
  turns: [{ turn: 1, playerAction: "通常攻撃", playerDamage: 10, playerCritical: false,
    enemyAction: "行動なし", enemyDamage: 0, enemyCritical: false, playerHp: 5, enemyHp: 0, fallback: false }],
});
check("MP: 旧戦闘履歴にundefinedを表示しない", !/undefined/.test(legacyBattleLog), legacyBattleLog);

api.state.location = "cave";
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
equal("移行: MPがない旧セーブは最大MPで初期化", ms.currentMp, CONFIG.battle.player.maxMp);
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
