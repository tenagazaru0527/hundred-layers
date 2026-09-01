#!/usr/bin/env node
"use strict";
/**
 * prototype.html の振る舞いを Node の vm 上で検証する最小テストである。
 * DOM / localStorage スタブとスクリプト読み込みは prototype_harness.js と共有する。
 */

const fs = require("fs");
const path = require("path");
const { loadPrototype } = require("./prototype_harness");

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
// Issue #129で耐性は構成比重み付けへ変更した。斬50% / 打50%なら 0.5×0.5 + 0.5×0.5 = 0.50
equal("ダメージ: 対応する耐性を構成比で重み付けする",
  api.baseDamage(atkUnit, unit({ stats: plainDef.stats, resistances: { physical: { slash: 0.5, blunt: 0.5 } } }),
    { kind: "physical", attributes: { slash: 0.5, blunt: 0.5 } }), 21 * 1 - 10 * 1.5);
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

/* ---------- 属性構成比による耐性重み付け（Issue #129 / PROTOTYPE ASSUMPTION） ---------- */
// 属性倍率合計は行動威力として維持し、耐性側だけ攻撃内の構成比へ正規化する
const closeTo = (label, actual, expected) =>
  check(label, Math.abs(actual - expected) < 1e-9, `expected ${expected}, got ${actual}`);
const physical = (attributes) => ({ kind: "physical", attributes });
const resist = (physicalTable) => unit({ stats: plainDef.stats, resistances: { physical: physicalTable } });

// 単一属性は構成比100%となり、Issue #67の挙動と一致する
closeTo("耐性重み付け: 単一属性 斬1.00 は従来と同じ耐性値",
  api.weightedResistance(physical({ slash: 1 }), resist({ slash: 0.5 })), 0.5);
closeTo("耐性重み付け: 単一属性 斬1.42 も構成比100%斬として扱う",
  api.weightedResistance(physical({ slash: 1.42 }), resist({ slash: 0.5 })), 0.5);
equal("耐性重み付け: 単一属性Skillの威力1.42を維持する", api.attributeTotal(physical({ slash: 1.42 })), 1.42);
// 威力は倍率合計、耐性は構成比。0.50 を 0.50 × 1.42 のように増幅しない
closeTo("耐性重み付け: 単一属性Skillは威力と耐性を分離する",
  api.baseDamage(atkUnit, resist({ slash: 0.5 }), physical({ slash: 1.42 })), 21 * 1.42 - 10 * 1.5);

// ブロンズソードの配分に斬耐性0.50なら 0.60 × 0.50 = 0.30
closeTo("耐性重み付け: 斬0.60 / 突0.30 / 打0.10 に斬耐性0.50なら対応耐性0.30",
  api.weightedResistance(physical({ slash: 0.6, pierce: 0.3, blunt: 0.1 }), resist({ slash: 0.5 })), 0.3);
// 複数耐性は属性ごとの構成比で重み付けする（0.60×0.50 + 0.30×0.20 + 0.10×1.00 = 0.46）
closeTo("耐性重み付け: 複数耐性を各属性の構成比で重み付けする",
  api.weightedResistance(physical({ slash: 0.6, pierce: 0.3, blunt: 0.1 }),
    resist({ slash: 0.5, pierce: 0.2, blunt: 1 })), 0.46);
// 倍率合計1.40でも構成比は斬50% / 打50%。耐性は 0.5×0.5 + 0.5×0 = 0.25
closeTo("耐性重み付け: 倍率合計が1.0を超えても威力と構成比を分離する",
  api.weightedResistance(physical({ slash: 0.7, blunt: 0.7 }), resist({ slash: 0.5 })), 0.25);
closeTo("耐性重み付け: 倍率合計1.40は威力としてそのまま使う",
  api.baseDamage(atkUnit, resist({ slash: 0.5 }), physical({ slash: 0.7, blunt: 0.7 })), 21 * 1.4 - 10 * 1.25);

// 攻撃に含まれない属性・耐性なしの扱い
equal("耐性重み付け: 攻撃に含まれない属性耐性は影響しない",
  api.weightedResistance(physical({ slash: 1 }), resist({ blunt: 0.5 })), 0);
closeTo("耐性重み付け: 耐性0では従来と同じダメージになる",
  api.baseDamage(atkUnit, plainDef, physical({ slash: 0.6, pierce: 0.3, blunt: 0.1 })), 21 * 1 - 10);
equal("耐性重み付け: 耐性データがなくても壊れない",
  api.weightedResistance(physical({ slash: 1 }), unit({ resistances: undefined })), 0);
// 属性倍率合計が0の攻撃では0除算せず耐性0を返す
equal("耐性重み付け: 属性未設定では耐性0を返す", api.weightedResistance({ kind: "physical" }, resist({ slash: 0.5 })), 0);
equal("耐性重み付け: 属性倍率がすべて0でも耐性0を返す",
  api.weightedResistance(physical({ slash: 0, blunt: 0 }), resist({ slash: 0.5 })), 0);
equal("耐性重み付け: 0ダメージ安全処理を維持する",
  api.baseDamage(atkUnit, plainDef, physical({ slash: 0.1 })), 0);

// 魔法も同じ耐性重み付け処理を共有する（魔法を使う行動は未実装のまま）
closeTo("耐性重み付け: 魔法属性も同じ構成比重み付けを共有する",
  api.weightedResistance({ kind: "magic", attributes: { fire: 0.75, water: 0.25 } },
    unit({ resistances: { magic: { fire: 0.4, water: 0.8 } } })), 0.75 * 0.4 + 0.25 * 0.8);

// 現行式（単純加算）との差を明示する。複数属性でのみ差が出る
const simpleSum = (attributes, table) =>
  Object.keys(attributes).reduce((sum, key) => sum + (table[key] || 0), 0);
const mixedAttributes = { slash: 0.6, pierce: 0.3, blunt: 0.1 };
const slashOnlyTable = { slash: 0.5, pierce: 0, blunt: 0 };
equal("耐性重み付け: 単一属性では現行式と同値",
  api.weightedResistance(physical({ slash: 1 }), resist(slashOnlyTable)),
  simpleSum({ slash: 1 }, slashOnlyTable));
check("耐性重み付け: 複数属性では現行式より耐性が小さくなる",
  api.weightedResistance(physical(mixedAttributes), resist(slashOnlyTable))
    < simpleSum(mixedAttributes, slashOnlyTable),
  `${api.weightedResistance(physical(mixedAttributes), resist(slashOnlyTable))} < ${simpleSum(mixedAttributes, slashOnlyTable)}`);

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

// Issue #111で第2層の仮入口を追加したため、第1層のロケーションだけを比較する
equal("第1層: ロケーションは街・森・巣穴の3種",
  CONFIG.locations.list.filter((def) => def.layer === 1).map((def) => `${def.id}:${def.name}`).join(","),
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
// Issue #105で検証用撃破ボタンを実際のボス戦へ置き換えた
check("第1層UI: 未撃破時はボスへの挑戦ボタンを表示する",
  /data-boss="goblinWarlord"/.test(bossFlow.elements.screen.innerHTML)
  && /ゴブリン・ウォーロードへ挑戦する/.test(bossFlow.elements.screen.innerHTML),
  bossFlow.elements.screen.innerHTML);
check("第1層UI: ボスのHPと現在のHP / MPを表示する",
  new RegExp(`ゴブリン・ウォーロード　HP ${CONFIG.battle.bosses[0].maxHp}`).test(bossFlow.elements.screen.innerHTML));

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

/* ---------- ロケーション別コンテンツ（Issue #78） ---------- */
const contentIds = ["forest", "den"];
const sum = (list) => list.reduce((total, entry) => total + entry.probability, 0);
for (const id of contentIds) {
  const content = CONFIG.locations.content[id];
  const name = CONFIG.locations.list.find((def) => def.id === id).name;
  check(`ロケーション別: ${name} に通常敵・強敵・探索イベント・報酬がある`,
    Boolean(content?.normalEnemies?.length && content?.eliteEnemies?.length
      && content?.explorationEvents?.length && content?.rewards?.itemDrops?.length));
  check(`ロケーション別: ${name} の通常敵の出現率合計が1`, Math.abs(sum(content.normalEnemies) - 1) < 1e-9,
    String(sum(content.normalEnemies)));
  check(`ロケーション別: ${name} の強敵の出現率合計が1`, Math.abs(sum(content.eliteEnemies) - 1) < 1e-9,
    String(sum(content.eliteEnemies)));
  check(`ロケーション別: ${name} の探索イベント確率合計が1`, Math.abs(sum(content.explorationEvents) - 1) < 1e-9,
    String(sum(content.explorationEvents)));
  check(`ロケーション別: ${name} の報酬抽選確率合計が1`, Math.abs(sum(content.rewards.itemDrops) - 1) < 1e-9,
    String(sum(content.rewards.itemDrops)));
  for (const kind of ["normalEnemies", "eliteEnemies"]) {
    const pool = api.encounterPool(id, kind);
    equal(`ロケーション別: ${name} の${kind}がすべてマスタ定義へ解決できる`, pool.length, content[kind].length);
    check(`ロケーション別: ${name} の${kind}が戦闘に必要なデータを持つ`,
      pool.every((enemy) => enemy.maxHp > 0 && enemy.actions?.length > 0 && enemy.material && enemy.resistances));
  }
}

// 敵テーブルの差別化
const forestEnemies = api.encounterPool("forest", "normalEnemies").map((enemy) => enemy.name);
const denEnemies = api.encounterPool("den", "normalEnemies").map((enemy) => enemy.name);
equal("ロケーション別: 森の通常敵", forestEnemies.join(","), "フォレストウルフ,ワイルドボア,キラービー,ゴブリン");
equal("ロケーション別: 巣穴の通常敵", denEnemies.join(","), "ゴブリン,洞窟コウモリ,洞窟スライム");
const goblinRate = (id) => CONFIG.locations.content[id].normalEnemies.find((entry) => entry.id === "goblin").probability;
check("ロケーション別: ゴブリンは巣穴で最も高頻度",
  CONFIG.locations.content.den.normalEnemies.every((entry) => entry.probability <= goblinRate("den")));
check("ロケーション別: 森のゴブリンは低頻度で主敵にしない",
  goblinRate("forest") < goblinRate("den")
  && CONFIG.locations.content.forest.normalEnemies.every((entry) => entry.id === "goblin" || entry.probability > goblinRate("forest")));
equal("ロケーション別: 森の強敵はアルファウルフ", api.encounterPool("forest", "eliteEnemies")[0].name, "アルファウルフ");
equal("ロケーション別: 巣穴の強敵は洞窟オーク", api.encounterPool("den", "eliteEnemies")[0].name, "洞窟オーク");
check("ロケーション別: 森と巣穴で通常敵が重ならない（ゴブリンを除く）",
  forestEnemies.filter((name) => denEnemies.includes(name)).join(",") === "ゴブリン");
check("Utility AI: 森の強敵も既存のUtility AIで行動を選ぶ",
  api.simulateUtility("alphaWolf", 0.9, 0.9).action.name === "牙の連撃"
  && api.simulateUtility("alphaWolf", 0.9, 0.3).action.name === "喉笛狙い");

// 探索イベントの差別化
const eventIds = (id) => CONFIG.locations.content[id].explorationEvents.map((event) => event.id);
check("ロケーション別: 森にゴブリンの痕跡・人の利用痕跡・自然素材採取がある",
  ["goblinTrace", "humanTrace", "item"].every((id) => eventIds("forest").includes(id)), eventIds("forest").join(","));
check("ロケーション別: 巣穴に拠点痕跡・粗雑な罠・盗品イベントがある",
  ["camp", "trap", "item", "treasure"].every((id) => eventIds("den").includes(id)), eventIds("den").join(","));
check("ロケーション別: 森と巣穴で同一のイベント文面を使わない",
  CONFIG.locations.content.forest.explorationEvents.every((event) =>
    !CONFIG.locations.content.den.explorationEvents.some((other) => other.text && other.text === event.text)));

// 報酬・取得物の差別化
const dropItems = (id) => CONFIG.locations.content[id].rewards.itemDrops.map((drop) => drop.item);
check("ロケーション別: 森と巣穴で戦闘報酬テーブルが異なる",
  JSON.stringify(CONFIG.locations.content.forest.rewards) !== JSON.stringify(CONFIG.locations.content.den.rewards));
check("ロケーション別: 森の報酬は自然素材寄り", dropItems("forest").includes("アルンベリー") && dropItems("forest").includes("薬草"));
check("ロケーション別: 巣穴の報酬は硬貨・鉱石・ゴブリン素材寄り",
  ["古い硬貨", "鉄鉱石", "ゴブリンの牙"].every((item) => dropItems("den").includes(item)));
check("ロケーション別: アルンベリーは森限定の取得物",
  JSON.stringify(CONFIG.locations.content.den).includes("アルンベリー") === false);
check("ロケーション別: アルンベリーは換金対象にしない",
  CONFIG.materials.list.every((entry) => entry.item !== "アルンベリー"));
equal("ロケーション別: イベント文面の{item}を置換する",
  api.eventText("「{item}」×{amount} を手に入れた。", { item: "薬草", amount: 2 }), "「薬草」×2 を手に入れた。");

// 実際に探索を回しても、他ロケーション固有の成果は出ない
const denOnly = ["コウモリの翼膜", "スライムの粘液", "オークの角"];
const forestOnly = ["狼の毛皮", "猪の牙", "蜂の毒針", "銀狼の毛皮", "アルンベリー"];
function exploreMany(instance, locationId, times) {
  instance.api.state.location = locationId;
  for (let i = 0; i < times; i += 1) {
    instance.api.state.currentHp = maxHp;
    instance.api.state.currentMp = CONFIG.battle.player.maxMp;
    instance.api.state.staminaSpent = 0;
    instance.api.explore(50);
  }
  return Object.keys(instance.api.state.items);
}
const forestRun = loadPrototype(file, {});
const forestItems = exploreMany(forestRun, "forest", 40);
check("ロケーション別: 森の探索で巣穴固有の素材は出ない",
  denOnly.every((item) => !forestItems.includes(item)), forestItems.join(","));
const denRun = loadPrototype(file, {});
denRun.api.worldState.locations.den.unlocked = true;
const denItems = exploreMany(denRun, "den", 40);
check("ロケーション別: 巣穴の探索で森固有の素材は出ない",
  forestOnly.every((item) => !denItems.includes(item)), denItems.join(","));
check("ロケーション別: 森の探索で森固有の成果を得られる",
  forestOnly.some((item) => forestItems.includes(item)), forestItems.join(","));
check("ロケーション別: 巣穴の探索で巣穴固有の素材を得られる",
  denOnly.some((item) => denItems.includes(item)), denItems.join(","));

/* ---------- 強敵直接テストと継戦性サマリー（Issue #80） ---------- */
const dbg = loadPrototype(file, {});
dbg.api.state.gold = 100;
dbg.api.state.items = { "薬草": 1 };
dbg.api.state.staminaSpent = 40;
dbg.api.state.explorationDepth.forest = 12;
dbg.api.addWorldProgress("forest", 20);
dbg.api.debug("restore");
equal("デバッグ: HP全回復", dbg.api.state.currentHp, maxHp);
equal("デバッグ: MP全回復", dbg.api.state.currentMp, CONFIG.battle.player.maxMp);

// 直接戦闘は進行・報酬・成長へ影響しない
const untouched = (instance) => JSON.stringify({
  gold: instance.api.state.gold, exp: instance.api.state.exp, level: instance.api.state.level,
  parameterPoints: instance.api.state.parameterPoints, skillPoints: instance.api.state.skillPoints,
  items: instance.api.state.items, staminaSpent: instance.api.state.staminaSpent,
  explorationDepth: instance.api.state.explorationDepth, history: instance.api.state.history.length,
  world: instance.api.worldState,
});
const beforeDebugBattle = untouched(dbg);
const debugResult = dbg.api.debugBattle("alphaWolf");
check("デバッグ戦闘: 強敵と直接戦闘できる",
  debugResult !== null && debugResult.enemyName === "アルファウルフ" && debugResult.turns.length > 0);
check("デバッグ戦闘: 通常戦闘と同じ勝敗判定を返す", ["victory", "defeat"].includes(debugResult.result));
equal("デバッグ戦闘: スタミナ・踏破率・深度・EXP・Gold・素材／アイテム・クエストが変化しない",
  untouched(dbg), beforeDebugBattle);
check("デバッグ戦闘: HP / MPは戦闘結果として変化しうる",
  dbg.api.state.currentHp <= maxHp && dbg.api.state.currentMp <= CONFIG.battle.player.maxMp);
check("デバッグ戦闘: 結果と非接続である旨をログへ残す",
  dbg.api.state.systemLog.some((entry) => /デバッグ戦闘結果/.test(entry.message))
  && dbg.api.state.systemLog.some((entry) => /スタミナ・踏破率・探索深度・EXP・Gold・素材／アイテムは変化しない/.test(entry.message)));

// 洞窟オークも同じ導線で確認できる。未知IDと戦闘不能状態では実行しない
dbg.api.debug("restore");
check("デバッグ戦闘: 洞窟オークとも直接戦闘できる", dbg.api.debugBattle("orc")?.enemyName === "洞窟オーク");
equal("デバッグ戦闘: 未知の敵IDでは戦闘しない", dbg.api.debugBattle("unknownEnemy"), null);
dbg.api.state.currentHp = 0;
const beforeHp0 = untouched(dbg);
equal("デバッグ戦闘: HP0では戦闘しない", dbg.api.debugBattle("alphaWolf"), null);
equal("デバッグ戦闘: HP0で実行しても状態が変わらない", untouched(dbg), beforeHp0);
check("デバッグ戦闘: HP0の理由をログへ残す",
  dbg.api.state.systemLog.some((entry) => /HPが0のため戦闘できない/.test(entry.message)));

// 継戦性サマリー
const endurance = loadPrototype(file, {});
endurance.api.state.location = "forest";
endurance.api.debug("restore");
const startHp = endurance.api.state.currentHp;
const startMp = endurance.api.state.currentMp;
endurance.api.explore(30);
const summary = endurance.api.state.lastResult.summary;
check("サマリー: 探索結果へ継戦性サマリーが残る", Boolean(summary), JSON.stringify(endurance.api.state.lastResult));
equal("サマリー: 投入スタミナ", summary.cost, 30);
equal("サマリー: 予定イベント数", summary.plannedEvents, 3);
check("サマリー: 実際に処理したイベント数は予定以下", summary.events > 0 && summary.events <= summary.plannedEvents,
  JSON.stringify(summary));
equal("サマリー: 勝敗数の合計が戦闘回数と一致", summary.victories + summary.defeats, summary.battles);
equal("サマリー: 戦闘回数が探索イベントと一致",
  summary.battles, endurance.api.state.lastResult.events.filter((event) => event.battle).length);
equal("サマリー: 探索開始時のHP / MP", `${summary.startHp},${summary.startMp}`, `${startHp},${startMp}`);
equal("サマリー: 探索終了時のHP / MP",
  `${summary.endHp},${summary.endMp}`, `${endurance.api.state.currentHp},${endurance.api.state.currentMp}`);
// interruptedは停止条件の成立を表す。満腹度不足は最終イベントの回復後にも成立するため、
// satietyInterrupted=trueとevents=plannedEventsは両立する（Issue #97）。
equal("サマリー: 中断の有無と未処理イベント・満腹度不足が整合する",
  summary.interrupted, summary.events < summary.plannedEvents || summary.satietyInterrupted);
equal("サマリー: 満腹度不足による中断を区別して記録する",
  summary.satietyInterrupted,
  endurance.api.state.lastResult.events.some((event) => event.recovery && !event.recovery.full));
check("サマリー: システムログへサマリー行を出す",
  endurance.api.state.systemLog.some((entry) => /探索サマリー：/.test(entry.message)),
  JSON.stringify(endurance.api.state.systemLog.slice(0, 3)));
endurance.api.render();
check("サマリー: 探索結果パネルへ継戦性サマリーを表示する",
  /継戦性サマリー/.test(endurance.elements.screen.innerHTML), endurance.elements.screen.innerHTML.slice(0, 400));

// 旧セーブ（summaryなし）の履歴・結果表示でも落ちない
const legacyResult = loadPrototype(file, {
  [CONFIG.storageKey]: JSON.stringify({
    gold: 10, location: "forest",
    history: [{ cost: 10, location: "forest", locationName: "アルンの森", events: [], worldBefore: 0, worldAfter: 4, worldTotal: 4 }],
  }),
});
legacyResult.api.render();
check("サマリー: summaryのない旧履歴でも描画できる",
  legacyResult.elements.history.innerHTML.includes("アルンの森")
  && /継戦性サマリー/.test(legacyResult.elements.history.innerHTML) === false);

/* ---------- 満腹度（Issue #87 / PROTOTYPE ASSUMPTION） ---------- */
const maxMp = CONFIG.battle.player.maxMp;
const satietyMax = (maxHp + maxMp) * CONFIG.satiety.multiplier;
equal("満腹度: 最大満腹度は (最大HP + 最大MP) × 10", api.maxSatiety(), satietyMax);
equal("満腹度: 倍率はPrototype仮値の10", CONFIG.satiety.multiplier, 10);

// state / save
const fresh = loadPrototype(file, {});
equal("満腹度: 新規stateは最大値から始まる", fresh.api.state.satiety, satietyMax);
fresh.api.render();
equal("満腹度: 冒険者情報へ現在／最大を表示する", fresh.elements.satiety.textContent, `${satietyMax} / ${satietyMax}`);

const noSatiety = loadPrototype(file, { [CONFIG.storageKey]: JSON.stringify({ gold: 55, currentHp: 40, currentMp: 10 }) });
equal("満腹度: 満腹度のない旧セーブは最大値で補完する", noSatiety.api.state.satiety, satietyMax);
equal("満腹度: 旧セーブの他の状態は保持する", `${noSatiety.api.state.gold},${noSatiety.api.state.currentHp}`, "55,40");

const savedSatiety = loadPrototype(file, {});
savedSatiety.api.state.satiety = 1234;
savedSatiety.api.save();
equal("満腹度: localStorageへ保存する", JSON.parse(savedSatiety.store[CONFIG.storageKey]).satiety, 1234);
equal("満腹度: 保存値から復元する", loadPrototype(file, savedSatiety.store).api.state.satiety, 1234);
equal("満腹度: 負数のセーブ値は保持しない",
  loadPrototype(file, { [CONFIG.storageKey]: JSON.stringify({ satiety: -50 }) }).api.state.satiety >= 0, true);
equal("満腹度: 最大値を超えるセーブ値は最大値へ丸める",
  loadPrototype(file, { [CONFIG.storageKey]: JSON.stringify({ satiety: satietyMax + 500 }) }).api.state.satiety, satietyMax);

// 戦闘後回復の計算（決定論）
const recovery = loadPrototype(file, {});
function planFrom(hp, mp, satiety) {
  recovery.api.state.currentHp = hp;
  recovery.api.state.currentMp = mp;
  recovery.api.state.satiety = satiety;
  return recovery.api.applySatietyRecovery();
}
const enough = planFrom(maxHp - 40, maxMp - 30, satietyMax);
equal("戦闘後回復: 満腹度十分ならHP / MPを全回復する",
  `${recovery.api.state.currentHp},${recovery.api.state.currentMp}`, `${maxHp},${maxMp}`);
equal("戦闘後回復: 消費満腹度 = HP回復量 + MP回復量", enough.used, enough.hp + enough.mp);
equal("戦闘後回復: 必要満腹度 = 不足HP + 不足MP", enough.need, 70);
equal("戦闘後回復: 満腹度は消費分だけ減る", recovery.api.state.satiety, satietyMax - 70);
equal("戦闘後回復: 全回復できたことを記録する", enough.full, true);

const hpOnly = planFrom(maxHp - 25, maxMp, satietyMax);
equal("戦闘後回復: HPのみ不足", `${hpOnly.hp},${hpOnly.mp},${hpOnly.used}`, "25,0,25");
const mpOnly = planFrom(maxHp, maxMp - 12, satietyMax);
equal("戦闘後回復: MPのみ不足", `${mpOnly.hp},${mpOnly.mp},${mpOnly.used}`, "0,12,12");
const bothFull = planFrom(maxHp, maxMp, satietyMax);
equal("戦闘後回復: HP / MPが満タンなら何も消費しない", `${bothFull.used},${bothFull.full}`, "0,true");

// 満腹度不足時の比例配分
const partial = planFrom(maxHp - 40, maxMp - 30, 35);
equal("満腹度不足: 不足HP : 不足MPで比例配分する", `${partial.hp},${partial.mp}`, "20,15");
equal("満腹度不足: 回復量合計が使用満腹度を超えない", partial.hp + partial.mp, partial.used);
equal("満腹度不足: 満腹度を使い切る", recovery.api.state.satiety, 0);
equal("満腹度不足: 全回復できなかったことを記録する", partial.full, false);
check("満腹度不足: HP / MPが最大値を超えない",
  recovery.api.state.currentHp <= maxHp && recovery.api.state.currentMp <= maxMp);

const fractional = planFrom(maxHp - 10, maxMp - 5, 7);
equal("満腹度不足: 端数条件でも回復量合計が満腹度を超えない", fractional.hp + fractional.mp, 7);
equal("満腹度不足: 端数処理は決定論（HP切り捨て・余りをMPへ）", `${fractional.hp},${fractional.mp}`, "4,3");
const empty = planFrom(maxHp - 10, maxMp - 5, 0);
equal("満腹度不足: 満腹度0では回復しない", `${empty.hp},${empty.mp},${empty.used}`, "0,0,0");
equal("満腹度不足: 満腹度は0未満にならない", recovery.api.state.satiety, 0);
equal("満腹度不足: 消費量は満腹度残量で頭打ちになる", recovery.api.consumeSatiety(999), 0);

// スタミナ消費 → 満腹度消費
const staminaRun = loadPrototype(file, {});
staminaRun.api.state.location = "forest";
staminaRun.api.debug("restore");
const staminaStart = staminaRun.api.state.satiety;
staminaRun.api.explore(30);
const staminaSummary = staminaRun.api.state.lastResult.summary;
equal("スタミナ: 投入スタミナ1につき満腹度1を消費する", staminaSummary.staminaSatiety, 30);
equal("スタミナ: 開始時満腹度を記録する", staminaSummary.startSatiety, staminaStart);
equal("スタミナ: 満腹度の増減がスタミナ由来と戦闘後回復由来の合計と一致する",
  staminaSummary.startSatiety - staminaSummary.endSatiety,
  staminaSummary.staminaSatiety + staminaSummary.recoverySatiety);
equal("スタミナ: 終了時満腹度がstateと一致する", staminaSummary.endSatiety, staminaRun.api.state.satiety);
equal("スタミナ: 投入スタミナは全量コミットする", staminaRun.api.state.staminaSpent, 30);
equal("サマリー: 最大満腹度を記録する", staminaSummary.maxSatiety, satietyMax);
check("サマリー: システムログへ満腹度を含むサマリー行を出す",
  staminaRun.api.state.systemLog.some((entry) => /探索サマリー：/.test(entry.message) && /満腹度/.test(entry.message)));
staminaRun.api.render();
check("サマリー: 探索結果パネルへ満腹度の内訳を表示する",
  /満腹度消費：スタミナ/.test(staminaRun.elements.screen.innerHTML));

// 満腹度不足による中断と、投入スタミナの非返却（Issue #97、決定論）
// 戦闘までは追加抽選のない「深度進行」を選び、指定したイベントで実際の戦闘・回復を行う。
// 以降の戦闘内抽選も固定する。ハーネス共有のMath.randomは必ず元へ戻す。
function controlledSatietyExploration(plannedEvents, battleEvent, satiety, battleRoll = 0.5) {
  const instance = loadPrototype(file, {});
  instance.api.state.location = "forest";
  instance.api.state.satiety = satiety;
  const events = instance.api.locationContent("forest").explorationEvents;
  function eventRoll(id) {
    const index = events.findIndex((event) => event.id === id);
    if (index < 0) throw new Error(`テスト用イベントが見つからない: ${id}`);
    return events.slice(0, index).reduce((total, event) => total + event.probability, 0)
      + events[index].probability / 2;
  }
  const rolls = Array.from({ length: Math.min(battleEvent, plannedEvents) }, (_, index) =>
    eventRoll(index + 1 === battleEvent ? "battle" : "advance"));
  const originalRandom = Math.random;
  try {
    Math.random = () => rolls.length ? rolls.shift() : battleRoll;
    instance.api.explore(plannedEvents * instance.api.CONFIG.exploration.staminaPerEvent);
  } finally {
    Math.random = originalRandom;
  }
  return instance;
}

// 最終イベントは勝利・敗北の両方を検証する。0.1は狼に勝利、0.5は猪に敗北する抽選。
for (const [plannedEvents, battleEvent, battleRoll] of [[5, 1, 0.5], [5, 3, 0.5], [5, 5, 0.5], [1, 1, 0.5], [5, 5, 0.1]]) {
  const label = `満腹度不足（${battleEvent}/${plannedEvents}回目、抽選${battleRoll}）`;
  const shortage = controlledSatietyExploration(plannedEvents, battleEvent, 0, battleRoll);
  const result = shortage.api.state.lastResult;
  const shortageSummary = result.summary;
  const shortageEvent = result.events[battleEvent - 1];
  equal(`${label}: 予定イベント数を保持する`, shortageSummary.plannedEvents, plannedEvents);
  equal(`${label}: 不足を起こしたイベントまで処理済みとする`, shortageSummary.events, battleEvent);
  equal(`${label}: イベント配列と処理数が一致する`, result.events.length, shortageSummary.events);
  equal(`${label}: 戦闘は指定イベントの1回だけ`, shortageSummary.battles, 1);
  equal(`${label}: 予定した勝敗を再現する`, shortageEvent?.battle?.result, battleRoll === 0.1 ? "victory" : "defeat");
  check(`${label}: 戦闘後に回復不足が発生する`,
    Boolean(shortageEvent?.battle && shortageEvent.recovery?.need > 0 && !shortageEvent.recovery.full));
  equal(`${label}: 全回復できないため探索を中断する`, shortageSummary.satietyInterrupted, true);
  equal(`${label}: 最終イベントでも停止条件の成立を記録する`, shortageSummary.interrupted, true);
  equal(`${label}: 中断しても投入スタミナは返却しない`,
    shortage.api.state.staminaSpent, plannedEvents * CONFIG.exploration.staminaPerEvent);
  equal(`${label}: 未処理イベントが残るのは最終イベントより前の中断だけ`,
    shortageSummary.events < shortageSummary.plannedEvents, battleEvent < plannedEvents);
  check(`${label}: 中断理由をログへ残す`,
    shortage.api.state.systemLog.some((entry) => /満腹度が不足しHP \/ MPを最大まで回復できなかったため、探索を中断した。/.test(entry.message)));
  check(`${label}: 結果パネルに満腹度不足の中断を表示する`,
    /満腹度不足により探索を中断しました。/.test(shortage.elements.screen.innerHTML));
  if (shortageEvent?.recovery) {
    equal(`${label}: 満腹度0では回復できない`, shortageEvent.recovery.used, 0);
    check(`${label}: 探索結果へ戦闘後回復の内訳を残す`,
      Number.isFinite(shortageEvent.recovery.hpNeed) && Number.isFinite(shortageEvent.recovery.mpNeed)
      && Number.isFinite(shortageEvent.recovery.before) && Number.isFinite(shortageEvent.recovery.after));
  }
}

// 対照ケース：同じ最終戦闘でも全回復できれば中断しない。満腹度0だけでも中断しない。
for (const [label, battleEvent, satiety] of [["最終戦闘で全回復", 5, satietyMax], ["満腹度0で戦闘なし", 6, 0]]) {
  const normal = controlledSatietyExploration(5, battleEvent, satiety);
  const result = normal.api.state.lastResult;
  equal(`${label}: 全予定イベントを処理する`, result.summary.events, 5);
  equal(`${label}: 予定した戦闘回数と一致する`, result.summary.battles, battleEvent === 5 ? 1 : 0);
  equal(`${label}: 満腹度不足による中断ではない`, result.summary.satietyInterrupted, false);
  equal(`${label}: 中断ではない`, result.summary.interrupted, false);
  if (battleEvent === 5) {
    check(`${label}: 実際に必要量を回復する`,
      result.events[4].recovery?.need > 0 && result.events[4].recovery.full);
  }
}

// 敗北の扱いと、満腹度十分な場合の続行
const battles = loadPrototype(file, {});
battles.api.state.location = "forest";
let defeatEvent = null;
let defeatContinued = false;
let recoveredAndContinued = false;
for (let i = 0; i < 80; i += 1) {
  battles.api.debug("restore");
  battles.api.state.satiety = satietyMax;
  battles.api.state.staminaSpent = 0;
  battles.api.state.currentHp = 20;
  battles.api.explore(50);
  const result = battles.api.state.lastResult;
  result.events.forEach((event, index) => {
    if (!event.battle) return;
    if (event.battle.result !== "victory") {
      defeatEvent = defeatEvent || event;
      if (index < result.events.length - 1) defeatContinued = true;
    }
    if (event.recovery && event.recovery.used > 0 && index < result.events.length - 1) recoveredAndContinued = true;
  });
  check("戦闘後回復: 満腹度が十分なら戦闘後にHP / MPが最大へ戻る",
    result.events.every((event) => !event.recovery || !event.recovery.full
      || (event.recovery.hp === event.recovery.hpNeed && event.recovery.mp === event.recovery.mpNeed)));
  check("戦闘後回復: 満腹度は0未満にならない", battles.api.state.satiety >= 0);
  equal("サマリー: 満腹度不足による中断と部分回復が整合する",
    result.summary.satietyInterrupted,
    result.events.some((event) => event.recovery && !event.recovery.full));
  equal("サマリー: 戦闘後回復由来の消費が実際の回復量合計と一致する",
    result.summary.recoverySatiety,
    result.events.reduce((total, event) => total + (event.recovery ? event.recovery.used : 0), 0));
  equal("サマリー: 中断の有無と未処理イベント・満腹度不足が整合する",
    result.summary.interrupted, result.summary.events < result.summary.plannedEvents || result.summary.satietyInterrupted);
}
check("敗北: 探索中に敗北が発生する状況を再現できる", Boolean(defeatEvent));
if (defeatEvent) {
  check("敗北: 勝利相当のEXP / 戦利品 / 探索進行を与えない",
    !defeatEvent.reward && !defeatEvent.material && !defeatEvent.growth && (defeatEvent.gain || 0) === 0,
    JSON.stringify({ reward: defeatEvent.reward, material: defeatEvent.material, growth: defeatEvent.growth, gain: defeatEvent.gain }));
  check("敗北: 敗北後も満腹度による戦闘後回復を行う", Boolean(defeatEvent.recovery));
}
check("敗北: 満腹度が十分なら敗北後も探索を続行できる", defeatContinued);
check("戦闘後回復: 全回復できた戦闘の後は探索を続行する", recoveredAndContinued);

// 強敵直接テストとの分離（Issue #87 §8）
const direct = loadPrototype(file, {});
direct.api.debug("restore");
direct.api.state.currentHp = Math.floor(maxHp / 2);
direct.api.state.currentMp = Math.floor(maxMp / 2);
direct.api.state.satiety = satietyMax;
const beforeDirectHp = direct.api.state.currentHp;
direct.api.debugBattle("alphaWolf");
equal("強敵直接テスト: 満腹度を消費しない", direct.api.state.satiety, satietyMax);
check("強敵直接テスト: 戦闘後回復でHPが最大へ戻らない",
  direct.api.state.currentHp <= beforeDirectHp,
  `before=${beforeDirectHp}, after=${direct.api.state.currentHp}`);
direct.api.debug("restore");
equal("強敵直接テスト: デバッグ全回復は満腹度を変えない", direct.api.state.satiety, satietyMax);

// 街の検証用補給（Issue #87 §9）
const supply = loadPrototype(file, {});
supply.api.state.satiety = 10;
supply.api.state.currentHp = 1;
supply.api.state.currentMp = 1;
supply.api.state.location = "forest";
supply.api.supplySatiety();
equal("補給: 街の外では補給できない", supply.api.state.satiety, 10);
supply.api.state.location = "town";
supply.api.supplySatiety();
equal("補給: 街で満腹度を最大まで戻せる", supply.api.state.satiety, satietyMax);
equal("補給: 補給はHP / MPを回復しない", `${supply.api.state.currentHp},${supply.api.state.currentMp}`, "1,1");
check("補給: 検証用であることをログへ残す",
  supply.api.state.systemLog.some((entry) => /検証用の補給で満腹度を回復した。/.test(entry.message)));
supply.api.render();
check("補給: 街の画面へ検証用補給の導線がある",
  /満腹度を補給（検証用）/.test(supply.elements.screen.innerHTML), supply.elements.screen.innerHTML.slice(0, 200));
supply.api.state.satiety = 100;
supply.api.rest();
equal("補給: 宿屋は満腹度を回復しない", supply.api.state.satiety, 100);
equal("補給: 宿屋のHP / MP回復は従来どおり",
  `${supply.api.state.currentHp},${supply.api.state.currentMp}`, `${maxHp},${maxMp}`);

/* ---------- 探索結果UI（Issue #91 / PROTOTYPE ASSUMPTION） ---------- */
// 集約は表示専用であり、報酬・成長・世界進行のロジックは変更しない
const gainsUnit = loadPrototype(file, {});
const emptyGains = gainsUnit.api.aggregateGains([]);
equal("成果集約: 何も得ていない探索では獲得を作らない",
  `${emptyGains.items.length},${emptyGains.exp},${emptyGains.levels}`, "0,0,0");
const sampleGains = gainsUnit.api.aggregateGains([
  { item: "薬草", itemAmount: 1 },
  { reward: { item: "薬草", amount: 1 }, material: { item: "狼の毛皮", amount: 1 }, growth: { exp: 6, levels: 0, before: 1, level: 1 } },
  { reward: { item: null, amount: 0 }, material: { item: "狼の毛皮", amount: 1 }, growth: { exp: 12, levels: 1, before: 1, level: 2 } },
  { growth: { exp: 5, levels: 2, before: 2, level: 4 } },
]);
equal("成果集約: 同一アイテムを合算する",
  sampleGains.items.map((entry) => `${entry.item}×${entry.amount}`).join(","), "薬草×2,狼の毛皮×2");
equal("成果集約: EXPを合計する", sampleGains.exp, 23);
equal("成果集約: LvUPの開始Lvと到達Lvを集約する", `${sampleGains.before}→${sampleGains.level}`, "1→4");
equal("成果集約: LvUP回数からSP / APを集約する",
  `${sampleGains.levels},${sampleGains.sp},${sampleGains.ap}`,
  `3,${3 * CONFIG.growth.parameterPointsPerLevel},${3 * CONFIG.growth.skillPointsPerLevel}`);
equal("成果集約: 獲得のないアイテム抽選は集約しない",
  sampleGains.items.some((entry) => entry.item === null), false);

// 実際の探索結果と、所持品・EXP・SP / APの増加が一致すること（回帰確認）
const resultRun = loadPrototype(file, {});
resultRun.api.state.location = "forest";
for (let i = 0; i < 30; i += 1) {
  resultRun.api.debug("restore");
  resultRun.api.state.satiety = satietyMax;
  resultRun.api.state.staminaSpent = 0;
  const itemsBefore = JSON.parse(JSON.stringify(resultRun.api.state.items));
  const levelBefore = resultRun.api.state.level;
  const spBefore = resultRun.api.state.parameterPoints;
  const apBefore = resultRun.api.state.skillPoints;
  resultRun.api.explore(50);
  const result = resultRun.api.state.lastResult;
  const gains = resultRun.api.aggregateGains(result.events);
  const diff = {};
  for (const [item, count] of Object.entries(resultRun.api.state.items)) {
    const delta = count - (itemsBefore[item] || 0);
    if (delta > 0) diff[item] = delta;
  }
  const asList = (table) => Object.keys(table).sort().map((item) => `${item}×${table[item]}`).join(",");
  equal("成果集約: 集約した獲得アイテムが所持品の増加と一致する",
    asList(Object.fromEntries(gains.items.map((entry) => [entry.item, entry.amount]))), asList(diff));
  equal("成果集約: 集約したEXPが各戦闘のEXP合計と一致する",
    gains.exp, result.events.reduce((total, event) => total + (event.growth ? event.growth.exp : 0), 0));
  equal("成果集約: 集約したSP / APが実際の増加と一致する",
    `${gains.sp},${gains.ap}`, `${resultRun.api.state.parameterPoints - spBefore},${resultRun.api.state.skillPoints - apBefore}`);
  equal("成果集約: LvUPがない探索ではレベル変化を表示しない",
    gains.levels > 0, resultRun.api.state.level > levelBefore);
  if (gains.levels > 0) {
    equal("成果集約: 到達Lvが現在のLvと一致する", gains.level, resultRun.api.state.level);
    equal("成果集約: 開始Lvが探索前のLvと一致する", gains.before, levelBefore);
  }
}

// 表示構造
resultRun.api.render();
const resultScreen = resultRun.elements.screen.innerHTML;
check("探索結果: 主な成果を先頭へ表示する", /今回の主な成果/.test(resultScreen));
check("探索結果: 獲得・成長・世界進行の区分を持つ", /獲得/.test(resultScreen) && /世界進行/.test(resultScreen));
check("探索結果: 踏破率の開始値 → 終了値をサマリーへ表示する",
  new RegExp(`${resultRun.api.state.lastResult.worldBefore}% → ${resultRun.api.state.lastResult.worldAfter}%`).test(resultScreen));
check("探索結果: 主な成果はイベント詳細より前にある",
  resultScreen.indexOf("今回の主な成果") < resultScreen.indexOf("探索イベントの詳細"), String(resultScreen.indexOf("今回の主な成果")));
check("探索結果: イベント詳細を残す", /探索イベントの詳細/.test(resultScreen) && /class="event"/.test(resultScreen));
check("探索結果: 継戦性サマリーを残す", /継戦性サマリー/.test(resultScreen) && /満腹度/.test(resultScreen));
check("探索結果: 継戦情報への短い導線を主な成果へ置く", /gains-note/.test(resultScreen));

// 戦闘ターン詳細は初期状態で閉じる（勝敗を問わず到達できる）
const foldRun = loadPrototype(file, {});
const foldDummy = {
  id: "foldDummy", name: "検証用の敵", maxHp: 1, exp: 1, probability: 1,
  material: { item: "薬草", amount: 1 }, stats: { STR: 1, VIT: 1, DEX: 1, AGI: 1, INT: 1, MND: 1 },
  actions: [{ name: "体当たり", probability: 1, kind: "physical", attributes: { blunt: 0.1 } }],
  resistances: { physical: { slash: 0, pierce: 0, blunt: 0 }, magic: {} },
};
const foldHtml = foldRun.api.battleHtml(foldRun.api.runBattle([foldDummy]));
check("戦闘ログ: ターン詳細は初期状態で閉じている", /<details class="battle-log">/.test(foldHtml), foldHtml.slice(0, 120));
check("戦闘ログ: 展開できることが分かる表示を出す", /戦闘詳細を見る/.test(foldHtml));
check("戦闘ログ: 折りたたんでも勝敗は分かる", /オートバトル：(勝利|敗北)/.test(foldHtml));
check("戦闘ログ: ターンログと戦闘終了時HP / MPは展開すれば確認できる",
  /ターン：プレイヤー/.test(foldHtml) && /戦闘終了：プレイヤー HP/.test(foldHtml));
const defeatHtml = foldRun.api.battleHtml({
  enemyName: "検証用の敵", enemyMaxHp: 100, enemyHp: 40, result: "defeat", strategyName: "バランス",
  playerHp: 0, playerMp: 0,
  turns: [{ turn: 1, playerAction: "通常攻撃", playerDamage: 10, playerCritical: false, enemyAction: "体当たり", enemyDamage: 130, enemyCritical: false, playerHp: 0, playerMp: 0, healed: 0, mpSpent: 0 }],
});
check("戦闘ログ: 敗北時も同じ折りたたみで詳細へ到達できる",
  /<details class="battle-log">/.test(defeatHtml) && /ターン：プレイヤー/.test(defeatHtml));

// 旧セーブの探索結果（アイテム情報なし）でも描画できる
const legacyGains = loadPrototype(file, {
  [CONFIG.storageKey]: JSON.stringify({
    location: "forest",
    lastResult: {
      cost: 10, location: "forest", locationName: "アルンの森", before: 0, after: 4,
      worldBefore: 0, worldAfter: 4, worldTotal: 4,
      events: [{ type: "深度進行", gain: 4, worldGain: 4, text: "古い形式のイベント" }],
    },
  }),
});
legacyGains.api.render();
check("探索結果: 旧形式の探索結果でも主な成果を描画できる",
  /今回の主な成果/.test(legacyGains.elements.screen.innerHTML)
  && /獲得なし/.test(legacyGains.elements.screen.innerHTML),
  legacyGains.elements.screen.innerHTML.slice(0, 200));
check("探索結果: 継戦性サマリーのない旧結果では検証情報を出さない",
  /継戦性サマリー/.test(legacyGains.elements.screen.innerHTML) === false);

/* ---------- 装備強化（Issue #102 / PROTOTYPE ASSUMPTION） ---------- */
const enhanceCfg = CONFIG.battle.equipment.enhance;
equal("装備強化: 最大強化値", enhanceCfg.maxLevel, 10);
equal("装備強化: 1試行あたりのGold費用", enhanceCfg.goldPerAttempt, 1);
equal("装備強化: 連続鍛錬の選択肢", enhanceCfg.attempts.join(","), "1,10,50,100");
equal("装備強化: 段階別成功率", enhanceCfg.successRates.join(","), "0.5,0.4,0.3,0.2,0.1,0.05,0.04,0.03,0.02,0.01");
equal("装備強化: 現在段階の成功率を返す",
  [0, 4, 9].map((level) => api.enhanceSuccessRate(level)).join(","), "0.5,0.1,0.01");
equal("装備強化: +10では強化できない", api.enhanceSuccessRate(10), 0);
equal("装備強化: 実効性能 = round(基礎 × (1 + 強化値 × 0.1))",
  [0, 1, 5, 10].map((level) => api.enhancedValue(11, level)).join(","), "11,12,17,22");
equal("装備強化: +10で基礎性能の200%", api.enhancedValue(13, 10), 26);

// 乱数を固定して成功／失敗を決定論的に再現する（Issue #97と同じ方式）
function withRolls(rolls, fn) {
  const original = Math.random;
  const queue = rolls.slice();
  try {
    Math.random = () => (queue.length ? queue.shift() : 0.999);
    return fn();
  } finally {
    Math.random = original;
  }
}
function smithInstance(gold = 1000) {
  const instance = loadPrototype(file, {});
  instance.api.state.gold = gold;
  return instance;
}

// 新規stateと旧セーブ
const freshSmith = smithInstance();
equal("装備強化: 新規stateの強化値は+0", JSON.stringify(freshSmith.api.state.enhancements), "{}");
equal("装備強化: 新規装備の強化値は0", freshSmith.api.enhanceLevel("trainingDagger"), 0);
const legacySmith = loadPrototype(file, {
  [CONFIG.storageKey]: JSON.stringify({
    gold: 40, ownedEquipment: ["trainingDagger", "travelerClothes", "ironDagger"],
    equippedWeapon: "ironDagger", equippedArmor: "travelerClothes",
  }),
});
equal("装備強化: 強化情報のない旧セーブは全装備+0として読み込む",
  ["trainingDagger", "ironDagger", "travelerClothes", "leatherArmor"]
    .map((id) => legacySmith.api.enhanceLevel(id)).join(","), "0,0,0,0");
equal("装備強化: 旧セーブの装備所持を失わない", legacySmith.api.state.ownedEquipment.join(","),
  "trainingDagger,travelerClothes,ironDagger");
equal("装備強化: 旧セーブの装備中状態を失わない", legacySmith.api.state.equippedWeapon, "ironDagger");
equal("装備強化: 不正な強化値は保持しない",
  JSON.stringify(loadPrototype(file, {
    [CONFIG.storageKey]: JSON.stringify({ enhancements: { trainingDagger: -3, ironDagger: 99, unknownGear: 5, travelerClothes: 1.5 } }),
  }).api.state.enhancements), JSON.stringify({ ironDagger: 10 }));

// 成功時だけ+1される
const oneSuccess = smithInstance();
const successResult = withRolls([0.1], () => oneSuccess.api.enhanceEquipment("weapons", "trainingDagger", 1));
equal("装備強化: 成功すると強化値が+1される", successResult.level, 1);
equal("装備強化: 成功数・失敗数を記録する", `${successResult.tries},${successResult.success},${successResult.fail}`, "1,1,0");
equal("装備強化: 成功時に1試行分Goldを消費する", `${successResult.gold},${oneSuccess.api.state.gold}`, "1,999");
equal("装備強化: 実効性能の変化を記録する", `${successResult.startValue}→${successResult.value}`, "11→12");

// 失敗しても装備消失・強化値低下がない
const failRun = smithInstance();
withRolls([0.1], () => failRun.api.enhanceEquipment("weapons", "trainingDagger", 1));
const failResult = withRolls([0.9], () => failRun.api.enhanceEquipment("weapons", "trainingDagger", 1));
equal("装備強化: 失敗しても強化値が下がらない", failResult.level, 1);
equal("装備強化: 失敗しても装備を失わない",
  failRun.api.state.ownedEquipment.includes("trainingDagger") && failRun.api.state.equippedWeapon === "trainingDagger", true);
equal("装備強化: 失敗時も1試行分Goldを消費する", `${failResult.gold},${failRun.api.state.gold}`, "1,998");
equal("装備強化: 失敗数を記録する", `${failResult.success},${failResult.fail}`, "0,1");

// 連続鍛錬は実行試行分だけGoldを消費する
const seriesRun = smithInstance();
// +0→+1（50%）で成功、+1→+2（40%）で失敗2回、+1→+2で成功、+2→+3（30%）で失敗
const series = withRolls([0.4, 0.5, 0.9, 0.2, 0.9], () => seriesRun.api.enhanceEquipment("weapons", "trainingDagger", 5));
equal("連続鍛錬: 指定回数を実行する", `${series.tries},${series.attempts}`, "5,5");
equal("連続鍛錬: 固定乱数で複数成功を再現できる", `${series.start}→${series.level}`, "0→2");
equal("連続鍛錬: 成功数・失敗数が試行数と一致する", series.success + series.fail, series.tries);
equal("連続鍛錬: 実行試行分だけGoldを消費する", `${series.gold},${seriesRun.api.state.gold}`, "5,995");
equal("連続鍛錬: 停止理由は指定回数到達", series.stop, "attempts");

// Gold不足で停止し、先払いしない
const poorRun = smithInstance(3);
const poor = withRolls([0.9, 0.9, 0.9, 0.9, 0.9], () => poorRun.api.enhanceEquipment("weapons", "trainingDagger", 10));
equal("連続鍛錬: Gold不足で停止する", poor.stop, "gold");
equal("連続鍛錬: 所持Gold分だけ試行する", poor.tries, 3);
equal("連続鍛錬: Goldを先払いしない", `${poor.gold},${poorRun.api.state.gold}`, "3,0");
equal("連続鍛錬: Goldが負数にならない", poorRun.api.state.gold >= 0, true);

// +10で自動停止し、+10を超えない
const maxRun = smithInstance();
const toMax = withRolls(Array.from({ length: 20 }, () => 0.005),
  () => maxRun.api.enhanceEquipment("weapons", "trainingDagger", 20));
equal("連続鍛錬: +10へ到達したら停止する", `${toMax.level},${toMax.stop}`, "10,max");
equal("連続鍛錬: +10を超えて強化しない", maxRun.api.enhanceLevel("trainingDagger"), enhanceCfg.maxLevel);
equal("連続鍛錬: +10到達までの試行分だけGoldを消費する", toMax.tries, 10);
const atMax = withRolls([0.005], () => maxRun.api.enhanceEquipment("weapons", "trainingDagger", 10));
equal("連続鍛錬: +10装備では試行もGold消費も行わない", `${atMax.tries},${atMax.gold},${atMax.stop}`, "0,0,max");
equal("装備強化: +10装備の実効ATK", api.enhancedValue(11, 10), 22);

// 保存と再読込
maxRun.api.save();
equal("装備強化: 強化値を保存する", JSON.parse(maxRun.store[CONFIG.storageKey]).enhancements.trainingDagger, 10);
equal("装備強化: 強化値を復元する", loadPrototype(file, maxRun.store).api.enhanceLevel("trainingDagger"), 10);

// 強化を戦闘へ反映する
const battleRun = smithInstance();
const enemyUnitDef = {
  stats: { STR: 30, VIT: 10, DEX: 5, AGI: 5, INT: 5, MND: 5 },
  weaponAtk: 0, armorDef: 0, magicAtk: 0, magicDef: 0, resistances: {},
};
const slashAction = { kind: "physical", attributes: { slash: 1 } };
const damageBefore = withRolls([0.99], () => api.actionDamage(battleRun.api.playerUnit(), enemyUnitDef, slashAction).damage);
const takenBefore = withRolls([0.99], () => api.actionDamage(enemyUnitDef, battleRun.api.playerUnit(), slashAction).damage);
withRolls(Array.from({ length: 10 }, () => 0.005),
  () => battleRun.api.enhanceEquipment("weapons", "trainingDagger", 10));
withRolls(Array.from({ length: 10 }, () => 0.005),
  () => battleRun.api.enhanceEquipment("armors", "travelerClothes", 10));
equal("装備強化: 武器強化が実効ATKへ反映される", battleRun.api.weaponAtk(), api.enhancedValue(11, 10));
equal("装備強化: 防具強化が実効DEFへ反映される", battleRun.api.armorDef(), api.enhancedValue(11, 10));
equal("装備強化: 実効性能が戦闘ユニットへ渡る",
  `${battleRun.api.playerUnit().weaponAtk},${battleRun.api.playerUnit().armorDef}`, "22,22");
const damageAfter = withRolls([0.99], () => api.actionDamage(battleRun.api.playerUnit(), enemyUnitDef, slashAction).damage);
const takenAfter = withRolls([0.99], () => api.actionDamage(enemyUnitDef, battleRun.api.playerUnit(), slashAction).damage);
check("装備強化: 武器強化で与ダメージが増える", damageAfter > damageBefore, `${damageBefore} → ${damageAfter}`);
check("装備強化: 防具強化で被ダメージが減る", takenAfter < takenBefore, `${takenBefore} → ${takenAfter}`);

// 実行条件
const guardRun = smithInstance();
guardRun.api.state.location = "forest";
equal("装備強化: 街以外では強化できない",
  withRolls([0.1], () => guardRun.api.enhanceEquipment("weapons", "trainingDagger", 1)), null);
guardRun.api.state.location = "town";
equal("装備強化: 未所持の装備は強化できない",
  withRolls([0.1], () => guardRun.api.enhanceEquipment("weapons", "ironDagger", 1)), null);
equal("装備強化: 未知の装備IDでは強化しない",
  withRolls([0.1], () => guardRun.api.enhanceEquipment("weapons", "unknownGear", 1)), null);
equal("装備強化: 不正な試行回数では強化しない",
  withRolls([0.1], () => guardRun.api.enhanceEquipment("weapons", "trainingDagger", 0)), null);
equal("装備強化: 実行しなかった場合はGoldが変化しない", guardRun.api.state.gold, 1000);

// UI導線
const smithUi = smithInstance();
smithUi.api.setLocationAction("smith");
smithUi.api.render();
const smithScreen = smithUi.elements.screen.innerHTML;
check("鍛冶屋: 街の行動へ鍛冶屋を追加する", /鍛冶屋/.test(smithUi.elements.locationButtons.innerHTML + smithScreen), smithScreen.slice(0, 200));
check("鍛冶屋: 対象装備名と現在強化値を表示する", /訓練用の短剣/.test(smithScreen) && /\+0/.test(smithScreen));
check("鍛冶屋: 基礎性能と実効性能を表示する", /ATK 11 → <strong>11<\/strong>/.test(smithScreen));
check("鍛冶屋: 現在段階の成功率を表示する", /成功率 50%/.test(smithScreen));
check("鍛冶屋: 1試行のGold費用と所持Goldを表示する", /所持金 1000 Gold/.test(smithScreen) && /1試行 1 Gold/.test(smithScreen));
check("鍛冶屋: 1 / 10 / 50 / 100回の実行導線がある",
  enhanceCfg.attempts.every((n) => smithScreen.includes(`data-enhance="weapons:trainingDagger:${n}"`)));
check("鍛冶屋: 未所持装備は強化対象に出さない", smithScreen.includes("鉄の短剣") === false);
withRolls([0.1], () => smithUi.api.enhanceEquipment("weapons", "trainingDagger", 1));
const smithAfter = smithUi.elements.screen.innerHTML;
check("鍛冶屋: 実行結果を画面へ表示する",
  /直近の強化結果/.test(smithAfter) && /試行 1 \/ 1 回（成功 1 ／ 失敗 0）/.test(smithAfter), smithAfter.slice(-400));
check("鍛冶屋: 実行結果をシステムログへ残す",
  smithUi.api.state.systemLog.some((entry) => /鍛冶屋：訓練用の短剣 \+0 → \+1/.test(entry.message)),
  JSON.stringify(smithUi.api.state.systemLog.slice(0, 2)));
check("鍛冶屋: 強化値を冒険者情報へ表示する", /訓練用の短剣 \+1（ATK 12）/.test(smithUi.elements.weaponName.textContent),
  smithUi.elements.weaponName.textContent);
// +10では実行ボタンを無効化する
withRolls(Array.from({ length: 9 }, () => 0.005), () => smithUi.api.enhanceEquipment("weapons", "trainingDagger", 9));
check("鍛冶屋: +10装備の実行導線を無効化する",
  /data-enhance="weapons:trainingDagger:1" disabled/.test(smithUi.elements.screen.innerHTML)
  && /強化完了/.test(smithUi.elements.screen.innerHTML));

// 検証用Gold付与
const debugGold = loadPrototype(file, {});
const goldBefore = debugGold.api.state.gold;
debugGold.api.debug("gold");
equal("デバッグ: 検証用Goldを付与する", debugGold.api.state.gold, goldBefore + CONFIG.debugGold);
check("デバッグ: 正式なGold供給源ではない旨をログへ残す",
  debugGold.api.state.systemLog.some((entry) => /正式なGold供給源ではない/.test(entry.message)));

// 既存のショップ導線に回帰がないこと
const shopRun = loadPrototype(file, {});
shopRun.api.state.gold = 15;
shopRun.api.buy("weapons", "ironDagger");
equal("回帰: 装備を購入できる", shopRun.api.state.ownedEquipment.includes("ironDagger"), true);
equal("回帰: 購入でGoldを消費する", shopRun.api.state.gold, 0);
shopRun.api.equip("weapons", "ironDagger");
equal("回帰: 装備を変更できる", shopRun.api.state.equippedWeapon, "ironDagger");
equal("回帰: 購入した装備は+0から始まる", shopRun.api.enhanceLevel("ironDagger"), 0);
equal("回帰: 未強化装備の実効ATKは基礎値と一致する", shopRun.api.weaponAtk(), 13);

/* ---------- 武器ごとの通常攻撃属性配分（Issue #125 / PROTOTYPE ASSUMPTION） ---------- */
const weaponMasters = CONFIG.battle.equipment.weapons;
const weaponMaster = (id) => weaponMasters.find((entry) => entry.id === id);
const attrText = (attributes) => JSON.stringify(attributes);
// 0.6 + 0.3 + 0.1 のような合成配分は二進小数で誤差を持つため、比較は許容誤差付きで行う
const nearly = (label, actual, expected) =>
  check(label, Math.abs(actual - expected) < 1e-9, `expected ${expected}, got ${actual}`);

check("武器属性: すべての武器が通常攻撃属性配分を持つ",
  weaponMasters.every((entry) => entry.normalAttackAttributes
    && Object.keys(entry.normalAttackAttributes).length > 0),
  JSON.stringify(weaponMasters.map((entry) => [entry.id, entry.normalAttackAttributes])));
equal("武器属性: 訓練用の短剣は現行挙動維持の斬1.00",
  attrText(weaponMaster("trainingDagger").normalAttackAttributes), attrText({ slash: 1 }));
equal("武器属性: 鉄の短剣は現行挙動維持の斬1.00",
  attrText(weaponMaster("ironDagger").normalAttackAttributes), attrText({ slash: 1 }));
equal("武器属性: 検証用へ追加するのはブロンズソード1本だけ", weaponMasters.length, 3);
equal("武器属性: ブロンズソードの物攻と価格",
  `${weaponMaster("bronzeSword").name},${weaponMaster("bronzeSword").atk},${weaponMaster("bronzeSword").price}`,
  "ブロンズソード,12,150");
equal("武器属性: ブロンズソードの配分は斬0.60 / 突0.30 / 打0.10",
  attrText(weaponMaster("bronzeSword").normalAttackAttributes),
  attrText({ slash: 0.6, pierce: 0.3, blunt: 0.1 }));

// 装備武器ごとのインスタンス。ブロンズソードは購入してから装備する
function weaponInstance(weaponId) {
  const instance = loadPrototype(file, {});
  instance.api.state.gold = 1000;
  if (weaponId !== "trainingDagger") {
    instance.api.buy("weapons", weaponId);
    instance.api.equip("weapons", weaponId);
  }
  return instance;
}
const daggerRun = weaponInstance("trainingDagger");
const bronzeRun = weaponInstance("bronzeSword");
const normalAttackOf = (instance) =>
  instance.api.CONFIG.battle.player.actions.find((action) => action.id === "attack");
const heavySkillOf = (instance) =>
  instance.api.CONFIG.battle.player.actions.find((action) => action.id === "skill");

equal("武器属性: ブロンズソードを150 Goldで購入する", bronzeRun.api.state.gold, 850);
equal("武器属性: 購入した武器へ装備変更できる", bronzeRun.api.state.equippedWeapon, "bronzeSword");

equal("通常攻撃: 装備中武器の属性配分を参照する",
  attrText(bronzeRun.api.weaponNormalAttackAttributes()),
  attrText({ slash: 0.6, pierce: 0.3, blunt: 0.1 }));
equal("通常攻撃: 既存短剣は現行どおり斬1.00を参照する",
  attrText(daggerRun.api.weaponNormalAttackAttributes()), attrText({ slash: 1 }));
equal("通常攻撃: 行動データではなく装備武器の配分で解決する",
  attrText(bronzeRun.api.resolvePlayerAction(normalAttackOf(bronzeRun)).attributes),
  attrText(bronzeRun.api.weaponNormalAttackAttributes()));
equal("通常攻撃: 解決しても行動データ側の属性配分を書き換えない",
  attrText(normalAttackOf(bronzeRun).attributes), attrText({ slash: 1 }));
nearly("通常攻撃: 武器属性を二重計上しない",
  bronzeRun.api.attributeTotal(bronzeRun.api.resolvePlayerAction(normalAttackOf(bronzeRun))), 1);

// 装備変更で通常攻撃属性も切り替わる
bronzeRun.api.equip("weapons", "trainingDagger");
equal("通常攻撃: 装備変更で属性配分も切り替わる",
  attrText(bronzeRun.api.weaponNormalAttackAttributes()), attrText({ slash: 1 }));
bronzeRun.api.equip("weapons", "bronzeSword");
equal("通常攻撃: 装備を戻すと属性配分も戻る",
  attrText(bronzeRun.api.weaponNormalAttackAttributes()),
  attrText({ slash: 0.6, pierce: 0.3, blunt: 0.1 }));

equal("Skill: 武器の通常攻撃属性を参照しない",
  attrText(bronzeRun.api.resolvePlayerAction(heavySkillOf(bronzeRun)).attributes),
  attrText({ slash: 1.42 }));
equal("Skill: 武器属性と合成せずSkill自身の倍率だけを使う",
  bronzeRun.api.attributeTotal(bronzeRun.api.resolvePlayerAction(heavySkillOf(bronzeRun))), 1.42);
check("Skill: 解決してもSkill行動データを差し替えない",
  bronzeRun.api.resolvePlayerAction(heavySkillOf(bronzeRun)) === heavySkillOf(bronzeRun));

// 既存の属性倍率／耐性計算へそのまま接続する（物理攻撃力 = STR 10 + 武器ATK、物理防御力 = VIT 6）
const pierceResistant = unit({
  stats: { STR: 30, VIT: 6, DEX: 5, AGI: 5, INT: 5, MND: 5 },
  resistances: { physical: { slash: 0, pierce: 0.6, blunt: 0 } },
});
const slashResistant = unit({
  stats: { STR: 30, VIT: 6, DEX: 5, AGI: 5, INT: 5, MND: 5 },
  resistances: { physical: { slash: 0.5, pierce: 0, blunt: 0 } },
});
const daggerNormal = daggerRun.api.resolvePlayerAction(normalAttackOf(daggerRun));
const bronzeNormal = bronzeRun.api.resolvePlayerAction(normalAttackOf(bronzeRun));
nearly("耐性接続: 斬のみの短剣は突耐性を受けない",
  api.baseDamage(daggerRun.api.playerUnit(), pierceResistant, daggerNormal), 21 * 1 - 6 * 1);
// 突の構成比0.30 × 突耐性0.60 = 0.18（Issue #129）
nearly("耐性接続: 突を含むブロンズソードは構成比の分だけ突耐性を受ける",
  api.baseDamage(bronzeRun.api.playerUnit(), pierceResistant, bronzeNormal), 22 * 1 - 6 * 1.18);
nearly("耐性接続: 斬耐性はどちらの武器も受ける（短剣）",
  api.baseDamage(daggerRun.api.playerUnit(), slashResistant, daggerNormal), 21 * 1 - 6 * 1.5);
// 斬の構成比0.60 × 斬耐性0.50 = 0.30。斬100%の短剣（0.50）より受ける耐性が小さい
nearly("耐性接続: 斬耐性は斬の構成比の分だけ受ける（ブロンズソード）",
  api.baseDamage(bronzeRun.api.playerUnit(), slashResistant, bronzeNormal), 22 * 1 - 6 * 1.3);
nearly("耐性接続: Skillは武器側の突を巻き込まない",
  api.baseDamage(bronzeRun.api.playerUnit(), pierceResistant,
    bronzeRun.api.resolvePlayerAction(heavySkillOf(bronzeRun))), 22 * 1.42 - 6 * 1);

// 既存戦闘・行動選択への回帰
const bronzeBattle = weaponInstance("bronzeSword");
const bronzeBattleResult = bronzeBattle.api.runBattle([
  { ...bronzeBattle.api.enemyDef("slime"), probability: 1 },
]);
check("回帰: ブロンズソード装備でも戦闘が成立する",
  ["victory", "defeat"].includes(bronzeBattleResult.result) && bronzeBattleResult.turns.length > 0,
  JSON.stringify({ result: bronzeBattleResult.result, turns: bronzeBattleResult.turns.length }));
check("回帰: 戦闘ログの行動名は行動データ側のまま",
  bronzeBattleResult.turns.every((turn) => ["通常攻撃", "強打", "応急手当"].includes(turn.playerAction)),
  JSON.stringify(bronzeBattleResult.turns.map((turn) => turn.playerAction)));
check("回帰: 武器属性の追加後もUtility AIが行動を選べる",
  Boolean(bronzeRun.api.simulatePlayerStrategy("balanced", {}).action));

// 戦闘経路そのものが装備武器の属性配分を使うことを決定的に確認する
// Math.random を常に0.999へ固定し、通常攻撃のみを候補にすることで会心・行動抽選の揺れを排除する
const attributeDummyEnemy = {
  id: "attributeDummy", name: "属性検証ダミー", maxHp: 100, exp: 0, material: null,
  stats: { STR: 1, VIT: 10, DEX: 1, AGI: 20, INT: 1, MND: 1 },
  actions: [{ name: "様子見", probability: 1, kind: "physical", attributes: { slash: 0 } }],
  resistances: { physical: { slash: 0, pierce: 1, blunt: 0 }, magic: {} },
  probability: 1,
};
function firstTurnDamage(weaponId) {
  const instance = weaponInstance(weaponId);
  instance.api.state.tactics = { attack: 100, firstAid: 0 };
  const battle = withRolls([], () => instance.api.runBattle([attributeDummyEnemy]));
  return battle.turns[0];
}
const daggerTurn = firstTurnDamage("trainingDagger");
const bronzeTurn = firstTurnDamage("bronzeSword");
equal("戦闘接続: 通常攻撃が選ばれている",
  `${daggerTurn.playerAction},${bronzeTurn.playerAction}`, "通常攻撃,通常攻撃");
// 短剣: (STR 10 + ATK 11) × 斬1.00 - VIT 10 × (1 + 耐性0) = 11、DEX / AGI補正 ×0.88
equal("戦闘接続: 斬のみの短剣は突耐性を受けない", daggerTurn.playerDamage, Math.floor(11 * 0.88));
// ブロンズソード: (STR 10 + ATK 12) × 1.00 - VIT 10 × (1 + 突構成比0.30 × 突耐性1.00) = 9、DEX / AGI補正 ×0.88
equal("戦闘接続: 突を含むブロンズソードは構成比の分だけ突耐性を受ける",
  bronzeTurn.playerDamage, Math.floor(9 * 0.88));
check("戦闘接続: 装備武器の属性差が与ダメージへ現れる",
  daggerTurn.playerDamage !== bronzeTurn.playerDamage,
  `${daggerTurn.playerDamage} / ${bronzeTurn.playerDamage}`);

// 旧セーブ互換
const legacyWeaponSave = loadPrototype(file, {
  [CONFIG.storageKey]: JSON.stringify({
    gold: 10, ownedEquipment: ["trainingDagger", "ironDagger", "travelerClothes"],
    equippedWeapon: "ironDagger", equippedArmor: "travelerClothes",
  }),
});
equal("旧セーブ: 追加武器を持たない旧セーブでも装備を保持する",
  legacyWeaponSave.api.state.equippedWeapon, "ironDagger");
check("旧セーブ: ブロンズソードを自動付与しない",
  legacyWeaponSave.api.state.ownedEquipment.includes("bronzeSword") === false,
  legacyWeaponSave.api.state.ownedEquipment.join(","));
equal("旧セーブ: 旧セーブの装備でも通常攻撃属性を解決できる",
  attrText(legacyWeaponSave.api.weaponNormalAttackAttributes()), attrText({ slash: 1 }));
const unknownWeaponSave = loadPrototype(file, {
  [CONFIG.storageKey]: JSON.stringify({ equippedWeapon: "unknownGear" }),
});
equal("旧セーブ: 未知の装備IDはスターター装備の属性へフォールバックする",
  attrText(unknownWeaponSave.api.weaponNormalAttackAttributes()), attrText({ slash: 1 }));
equal("武器属性: 属性配分を持たない武器データは行動データ側の配分へフォールバックする",
  attrText(api.normalAttackAttributes({ id: "legacyWeapon", atk: 5 })), attrText({ slash: 1 }));

// UI
const weaponUi = weaponInstance("bronzeSword");
weaponUi.api.render();
const equipmentUiHtml = weaponUi.api.equipmentHtml();
check("装備UI: 装備中武器の通常攻撃属性を表示する",
  /通常攻撃 斬60% \/ 突30% \/ 打10%/.test(equipmentUiHtml), equipmentUiHtml.slice(0, 400));
check("装備UI: 候補武器の通常攻撃属性も表示する",
  /通常攻撃 斬100%/.test(equipmentUiHtml));
equal("装備UI: 通常攻撃属性は武器3種にだけ表示する",
  (equipmentUiHtml.match(/通常攻撃 /g) || []).length, 3);
// 武器名と通常攻撃属性は行を分けて表示する（区切り記号は置かない）。幅の狭い冒険者情報では属性の区切りも詰める
equal("冒険者情報: 装備中武器の通常攻撃属性を改行して表示する",
  weaponUi.elements.weaponName.textContent, "ブロンズソード（ATK 12）\n通常攻撃 斬60%/突30%/打10%");
equal("装備UI: 装備一覧の区切りは詰めない",
  api.normalAttackAttributesText(weaponMaster("bronzeSword")), "斬60% / 突30% / 打10%");

/* ---------- 第1層ボス戦（Issue #105 / PROTOTYPE ASSUMPTION） ---------- */
const bossEnemy = CONFIG.battle.bosses.find((entry) => entry.id === "goblinWarlord");
check("ボス: ゴブリン・ウォーロードの敵定義がある", Boolean(bossEnemy));
check("ボス: 戦闘に必要なデータを持つ",
  bossEnemy.maxHp > 0 && bossEnemy.actions.length >= 2 && bossEnemy.actions.length <= 3
  && CONFIG.stats.order.every((key) => Number.isFinite(bossEnemy.stats[key]))
  && Boolean(bossEnemy.resistances.physical && bossEnemy.resistances.magic),
  JSON.stringify({ hp: bossEnemy.maxHp, actions: bossEnemy.actions.length }));
equal("ボス: 行動確率の合計が1",
  Math.abs(bossEnemy.actions.reduce((total, action) => total + action.probability, 0) - 1) < 1e-9, true);
equal("ボス: 敵定義を共通の解決経路から引ける", api.enemyDef("goblinWarlord").name, "ゴブリン・ウォーロード");
equal("ボス: 単一行動テーブルのUtility AIを使う",
  Object.keys(bossEnemy.ai.actions).length, bossEnemy.actions.length);
equal("ボス: 専用報酬を持たない", `${bossEnemy.exp},${bossEnemy.material}`, "0,null");
equal("ボス: 世界進行のボス定義と敵定義のIDが対応する",
  CONFIG.world.bosses.every((entry) => Boolean(api.enemyDef(entry.id))), true);

// ボス戦を決定論的に再現する。作戦は通常攻撃のみとし、会心・抽選の揺れを固定する
function bossReady(instance) {
  instance.api.addWorldProgress("forest", 100);
  instance.api.applyWorldUnlocks();
  instance.api.addWorldProgress("den", 100);
  instance.api.applyWorldUnlocks();
  instance.api.state.location = "den";
  instance.api.state.tactics = { attack: 100, firstAid: 0 };
  instance.api.state.currentHp = maxHp;
  instance.api.state.currentMp = CONFIG.battle.player.maxMp;
  return instance;
}
// 勝利条件：STRと強化値を十分に上げると数ターンで撃破できる
function forceVictory(instance) {
  instance.api.state.stats = { ...CONFIG.stats.initial, STR: 60 };
  instance.api.state.enhancements = { trainingDagger: 10, travelerClothes: 10 };
}
// 敗北条件：HP1から開始すると反撃で必ず倒れる
function forceDefeat(instance) {
  instance.api.state.currentHp = 1;
}

// 未解放では通常導線から挑戦できない
const bossLocked = bossReady(loadPrototype(file, {}));
bossLocked.api.worldState.bosses.goblinWarlord.unlocked = false;
equal("ボス: 未解放では挑戦できない",
  withRolls([0.999], () => bossLocked.api.challengeBoss("goblinWarlord")), null);
equal("ボス: 未解放で挑戦してもworld stateが変わらない",
  `${bossLocked.api.worldState.bosses.goblinWarlord.defeated},${bossLocked.api.worldState.layers.layer2Unlocked}`,
  "false,false");

// 巣穴100%で解放される既存挙動を維持する
const bossUnlock = bossReady(loadPrototype(file, {}));
equal("ボス: 巣穴100%で解放される", bossUnlock.api.worldState.bosses.goblinWarlord.unlocked, true);
equal("ボス: 解放時点では未撃破", bossUnlock.api.worldState.bosses.goblinWarlord.defeated, false);

// 敗北では討伐が成立しない
const bossLose = bossReady(loadPrototype(file, {}));
forceDefeat(bossLose);
const loseBattle = withRolls(Array.from({ length: 40 }, () => 0.999),
  () => bossLose.api.challengeBoss("goblinWarlord"));
equal("ボス戦: 敗北を再現できる", loseBattle?.result, "defeat");
equal("ボス戦: 敗北ではdefeatedがfalseのまま", bossLose.api.worldState.bosses.goblinWarlord.defeated, false);
equal("ボス戦: 敗北では第2層が解放されない", bossLose.api.worldState.layers.layer2Unlocked, false);
equal("ボス戦: 敗北ではクエストが進行しない", bossLose.api.worldState.quest.current, "goblinCleanup");
equal("ボス戦: 敗北後のHPは0", bossLose.api.state.currentHp, 0);
check("ボス戦: 敗北をログへ残す",
  bossLose.api.state.systemLog.some((entry) => /ボス戦結果：敗北/.test(entry.message))
  && bossLose.api.state.systemLog.some((entry) => /討伐は成立せず/.test(entry.message)));
// HPが0のままでは再挑戦できない
equal("ボス戦: HP0では挑戦できない",
  withRolls([0.999], () => bossLose.api.challengeBoss("goblinWarlord")), null);
check("ボス戦: HP0の理由をログへ残す",
  bossLose.api.state.systemLog.some((entry) => /HPが0のためボス戦を開始できない/.test(entry.message)));

// 勝利で第1層進行が1回だけ進む
const bossWin = bossReady(loadPrototype(file, {}));
forceVictory(bossWin);
bossWin.api.state.gold = 50;
bossWin.api.state.items = { "薬草": 2 };
bossWin.api.state.staminaSpent = 30;
bossWin.api.state.satiety = 500;
const beforeWin = JSON.stringify({
  gold: bossWin.api.state.gold, exp: bossWin.api.state.exp, level: bossWin.api.state.level,
  items: bossWin.api.state.items, staminaSpent: bossWin.api.state.staminaSpent,
  satiety: bossWin.api.state.satiety, depth: bossWin.api.state.explorationDepth,
  progress: bossWin.api.locationProgress("den"),
});
const winBattle = withRolls(Array.from({ length: 40 }, () => 0.999),
  () => bossWin.api.challengeBoss("goblinWarlord"));
equal("ボス戦: 勝利を再現できる", winBattle?.result, "victory");
equal("ボス戦: 勝利でdefeatedになる", bossWin.api.worldState.bosses.goblinWarlord.defeated, true);
equal("ボス戦: 勝利で第2層が解放される", bossWin.api.worldState.layers.layer2Unlocked, true);
equal("ボス戦: 勝利で第1層クエストが完了する",
  `${bossWin.api.worldState.quest.current},${bossWin.api.worldState.quest.completed.includes("goblinCleanup")}`,
  "null,true");
equal("ボス戦: 勝利しても専用報酬・EXP・Gold・素材・スタミナ・踏破率は変化しない",
  JSON.stringify({
    gold: bossWin.api.state.gold, exp: bossWin.api.state.exp, level: bossWin.api.state.level,
    items: bossWin.api.state.items, staminaSpent: bossWin.api.state.staminaSpent,
    satiety: bossWin.api.state.satiety, depth: bossWin.api.state.explorationDepth,
    progress: bossWin.api.locationProgress("den"),
  }), beforeWin);
check("ボス戦: 戦闘後のHP / MPをログで確認できる",
  bossWin.api.state.systemLog.some((entry) => /ボス戦結果：勝利/.test(entry.message) && /HP .* → .* \/ 130/.test(entry.message)),
  JSON.stringify(bossWin.api.state.systemLog.slice(0, 3)));
equal("ボス戦: 戦闘結果のHPがstateへ反映される", bossWin.api.state.currentHp, winBattle.playerHp);
// 撃破後は重複して進行しない
const afterWin = JSON.stringify(bossWin.api.worldState);
equal("ボス戦: 撃破済みでは再挑戦できない",
  withRolls(Array.from({ length: 40 }, () => 0.999), () => bossWin.api.challengeBoss("goblinWarlord")), null);
equal("ボス戦: 再度挑戦しても進行が重複しない", JSON.stringify(bossWin.api.worldState), afterWin);
bossWin.api.render();
check("ボス戦UI: 撃破済みと第2層解放を表示する",
  /ゴブリン・ウォーロードは討伐済みです/.test(bossWin.elements.screen.innerHTML)
  && /第2層が解放されました/.test(bossWin.elements.screen.innerHTML));

// 街からは挑戦できない
const bossTown = bossReady(loadPrototype(file, {}));
bossTown.api.state.location = "town";
equal("ボス戦: ボスのいるロケーション以外からは挑戦できない",
  withRolls([0.999], () => bossTown.api.challengeBoss("goblinWarlord")), null);
equal("ボス戦: 挑戦できない場合はworld stateが変わらない",
  bossTown.api.worldState.bosses.goblinWarlord.defeated, false);

// 既存戦闘と同じダメージ処理を使い、装備強化が反映される
const bossDamage = bossReady(loadPrototype(file, {}));
const attackAction = CONFIG.battle.player.actions.find((action) => action.id === "attack");
const bossUnitDef = {
  stats: bossEnemy.stats, weaponAtk: 0, armorDef: 0, magicAtk: 0, magicDef: 0,
  resistances: bossEnemy.resistances,
};
const plainDamage = withRolls([0.999],
  () => api.actionDamage(bossDamage.api.playerUnit(), bossUnitDef, attackAction).damage);
const firstTurn = withRolls(Array.from({ length: 40 }, () => 0.999),
  () => bossDamage.api.runBattle([{ ...bossEnemy, probability: 1 }])).turns[0];
equal("ボス戦: 通常戦闘と同じダメージ処理を使う", firstTurn.playerDamage, plainDamage);
bossDamage.api.state.enhancements = { trainingDagger: 10, travelerClothes: 10 };
const enhancedDamage = withRolls([0.999],
  () => api.actionDamage(bossDamage.api.playerUnit(), bossUnitDef, attackAction).damage);
check("ボス戦: 武器強化がボスへの与ダメージへ反映される", enhancedDamage > plainDamage,
  `${plainDamage} → ${enhancedDamage}`);
const takenPlain = withRolls([0.999],
  () => api.actionDamage(bossUnitDef, loadPrototype(file, {}).api.playerUnit(), bossEnemy.actions[0]).damage);
const takenEnhanced = withRolls([0.999],
  () => api.actionDamage(bossUnitDef, bossDamage.api.playerUnit(), bossEnemy.actions[0]).damage);
check("ボス戦: 防具強化がボスからの被ダメージへ反映される", takenEnhanced < takenPlain,
  `${takenPlain} → ${takenEnhanced}`);

// 戦力差が結果へ表れること（決定論的な固定条件で比較する）
function bossOutcome(stats, level) {
  const instance = bossReady(loadPrototype(file, {}));
  instance.api.state.stats = { ...CONFIG.stats.initial, ...stats };
  instance.api.state.enhancements = { trainingDagger: level, travelerClothes: level };
  const battle = withRolls(Array.from({ length: 80 }, () => 0.999),
    () => instance.api.runBattle([{ ...bossEnemy, probability: 1 }]));
  return { result: battle.result, turns: battle.turns.length, enemyHp: battle.enemyHp, playerHp: battle.playerHp };
}
const plainOutcome = bossOutcome({}, 0);
const enhancedOutcome = bossOutcome({}, 10);
equal("ボス強度: 未強化のLv1初期状態では勝てない", plainOutcome.result, "defeat");
equal("ボス強度: 強化するとLv1初期状態でも勝てる", enhancedOutcome.result, "victory");
check("ボス強度: 強化でボスへ与える総ダメージが増える", enhancedOutcome.enemyHp < plainOutcome.enemyHp,
  `${plainOutcome.enemyHp} → ${enhancedOutcome.enemyHp}`);
// 通常攻撃のみの決定論条件では、STR / VITを伸ばすと未強化でも勝てる
const grownOutcome = bossOutcome({ STR: 21, VIT: 21 }, 0);
equal("ボス強度: 成長すれば未強化でも勝てる（+10だけが正解ではない）", grownOutcome.result, "victory");

// デバッグ直接戦闘（Issue #80と同じ扱い）
const bossDebug = loadPrototype(file, {});
bossDebug.api.state.tactics = { attack: 100, firstAid: 0 };
bossDebug.api.state.stats = { ...CONFIG.stats.initial, STR: 60 };
bossDebug.api.state.enhancements = { trainingDagger: 10, travelerClothes: 10 };
bossDebug.api.state.gold = 77;
bossDebug.api.state.items = { "薬草": 1 };
const beforeDebugBoss = JSON.stringify({
  world: bossDebug.api.worldState, gold: bossDebug.api.state.gold, exp: bossDebug.api.state.exp,
  items: bossDebug.api.state.items, staminaSpent: bossDebug.api.state.staminaSpent,
  satiety: bossDebug.api.state.satiety, depth: bossDebug.api.state.explorationDepth,
});
const debugBossBattle = withRolls(Array.from({ length: 40 }, () => 0.999),
  () => bossDebug.api.debugBattle("goblinWarlord"));
equal("デバッグ戦闘: ボス未解放でもボスと直接戦闘できる", debugBossBattle?.enemyName, "ゴブリン・ウォーロード");
equal("デバッグ戦闘: 通常ボス戦と同じ敵定義を使う", debugBossBattle.enemyMaxHp, bossEnemy.maxHp);
equal("デバッグ戦闘: 勝利しても撃破フラグ・クエスト・第2層・報酬が変化しない",
  JSON.stringify({
    world: bossDebug.api.worldState, gold: bossDebug.api.state.gold, exp: bossDebug.api.state.exp,
    items: bossDebug.api.state.items, staminaSpent: bossDebug.api.state.staminaSpent,
    satiety: bossDebug.api.state.satiety, depth: bossDebug.api.state.explorationDepth,
  }), beforeDebugBoss);
equal("デバッグ戦闘: ボス戦の勝敗は通常戦闘と同じ判定", debugBossBattle.result, "victory");
check("デバッグ戦闘: HP / MPは戦闘結果として反映される",
  bossDebug.api.state.currentHp <= maxHp && bossDebug.api.state.currentHp === debugBossBattle.playerHp);
bossDebug.api.debug("restore");
equal("デバッグ戦闘: 全回復で同条件から繰り返し比較できる", bossDebug.api.state.currentHp, maxHp);

/* ---------- 直近のボス戦の戦闘詳細（Issue #107 / PROTOTYPE ASSUMPTION） ---------- */
// 表示は実際のbattle結果を再利用する。詳細のために戦闘を再実行・再生成しない
function bossLogInstance(force) {
  const instance = bossReady(loadPrototype(file, {}));
  force(instance);
  const battle = withRolls(Array.from({ length: 80 }, () => 0.999),
    () => instance.api.challengeBoss("goblinWarlord"));
  instance.api.render();
  return { instance, battle, html: instance.elements.screen.innerHTML };
}
const bossLogWin = bossLogInstance(forceVictory);
const bossLogLose = bossLogInstance(forceDefeat);
equal("ボス戦ログ: 勝利を再現できる", bossLogWin.battle.result, "victory");
equal("ボス戦ログ: 敗北を再現できる", bossLogLose.battle.result, "defeat");

for (const [label, run] of [["勝利", bossLogWin], ["敗北", bossLogLose]]) {
  const html = run.html;
  const detail = html.slice(html.indexOf("直近のボス戦"));
  check(`ボス戦ログ（${label}）: 直近のボス戦へ戦闘詳細の導線がある`,
    /<details class="battle-log">/.test(detail) && /戦闘詳細を見る/.test(detail), detail.slice(0, 300));
  check(`ボス戦ログ（${label}）: 戦闘詳細は初期状態で閉じている`,
    /<details class="battle-log" open>/.test(detail) === false, detail.slice(0, 300));
  check(`ボス戦ログ（${label}）: 実際のボス戦のターンを表示する`,
    (detail.match(/ターン：プレイヤー/g) || []).length === run.battle.turns.length,
    `turns=${run.battle.turns.length}, li=${(detail.match(/ターン：プレイヤー/g) || []).length}`);
  check(`ボス戦ログ（${label}）: 折りたたんだままでも勝敗が分かる`,
    new RegExp(`ゴブリン・ウォーロードとのオートバトル：${label}`).test(detail), detail.slice(0, 300));
  check(`ボス戦ログ（${label}）: 要約の勝敗とターン数を維持する`,
    new RegExp(`ゴブリン・ウォーロード：${label}（${run.battle.turns.length}ターン）`).test(detail), detail.slice(0, 300));
  check(`ボス戦ログ（${label}）: 要約の終了時HP / MPを維持する`,
    new RegExp(`終了時 HP ${run.instance.api.state.currentHp} / ${maxHp}`).test(detail)
    && new RegExp(`MP ${run.instance.api.state.currentMp} / ${CONFIG.battle.player.maxMp}`).test(detail),
    detail.slice(0, 300));
  check(`ボス戦ログ（${label}）: 要約のボス残HPを維持する`,
    new RegExp(`ゴブリン・ウォーロード HP ${run.battle.enemyHp} / ${run.battle.enemyMaxHp}`).test(detail),
    detail.slice(0, 400));
  check(`ボス戦ログ（${label}）: 展開すれば戦闘終了時のHP / MPまで追える`,
    /戦闘終了：プレイヤー HP/.test(detail));
}
check("ボス戦ログ: 勝利では第2層解放を要約へ残す", /第2層が解放された。/.test(bossLogWin.html));
check("ボス戦ログ: 敗北では討伐不成立を要約へ残す", /討伐は成立していない。/.test(bossLogLose.html));

// 再描画しても戦闘を再実行しない
const beforeRerender = JSON.stringify({
  world: bossLogWin.instance.api.worldState,
  hp: bossLogWin.instance.api.state.currentHp, mp: bossLogWin.instance.api.state.currentMp,
  gold: bossLogWin.instance.api.state.gold, exp: bossLogWin.instance.api.state.exp,
  log: bossLogWin.instance.api.state.systemLog.length,
});
bossLogWin.instance.api.render();
bossLogWin.instance.api.render();
equal("ボス戦ログ: 再描画しても戦闘を再実行しない（state・world・ログが変わらない）",
  JSON.stringify({
    world: bossLogWin.instance.api.worldState,
    hp: bossLogWin.instance.api.state.currentHp, mp: bossLogWin.instance.api.state.currentMp,
    gold: bossLogWin.instance.api.state.gold, exp: bossLogWin.instance.api.state.exp,
    log: bossLogWin.instance.api.state.systemLog.length,
  }), beforeRerender);
equal("ボス戦ログ: 再描画してもターン数が変わらない",
  (bossLogWin.instance.elements.screen.innerHTML.match(/ターン：プレイヤー/g) || []).length,
  bossLogWin.battle.turns.length);
equal("ボス戦ログ: 表示はlocalStorageへ保存しない",
  JSON.parse(bossLogWin.instance.store[CONFIG.storageKey] || "{}").lastBossResult, undefined);

/* ---------- 第2層への最小遷移（Issue #111 / PROTOTYPE ASSUMPTION） ---------- */
equal("階層: 第1層と第2層を定義する",
  CONFIG.layers.list.map((def) => `${def.id}:${def.name}`).join(","), "1:第1層,2:第2層");
equal("階層: 各階層の入口ロケーションを明示する",
  CONFIG.layers.list.map((def) => def.entry).join(","), "town,layer2Entry");
equal("階層: 第2層は遷移検証用のplaceholderのみを持つ",
  CONFIG.locations.list.filter((def) => def.layer === 2).map((def) => `${def.id}:${def.kind}`).join(","),
  "layer2Entry:placeholder");
equal("階層: 既存ロケーションはすべて第1層に属する",
  CONFIG.locations.list.filter((def) => def.layer !== 2).every((def) => def.layer === 1), true);

// 新規stateとロック状態
const layerFresh = loadPrototype(file, {});
equal("階層: 新規stateの現在階層は第1層", layerFresh.api.state.layer, 1);
equal("階層: 新規stateの現在地は第1層の入口", layerFresh.api.state.location, "town");
equal("階層: 第2層は未解放", layerFresh.api.layerUnlocked(2), false);
layerFresh.api.moveLayer(2);
equal("階層: 未解放の間は第2層へ移動できない",
  `${layerFresh.api.state.layer},${layerFresh.api.state.location}`, "1,town");
check("階層: 未解放の理由をログへ残す",
  layerFresh.api.state.systemLog.some((entry) => /第2層はまだ解放されていない/.test(entry.message)),
  JSON.stringify(layerFresh.api.state.systemLog.slice(0, 2)));
layerFresh.api.render();
check("階層UI: 未解放の第2層はdisabledで表示する",
  /data-layer="2"[^>]*disabled/.test(layerFresh.elements.layerButtons.innerHTML),
  layerFresh.elements.layerButtons.innerHTML);
check("階層UI: 未解放の解放条件を示す",
  /ゴブリン・ウォーロードを撃破すると解放される/.test(layerFresh.elements.layerButtons.innerHTML));
check("階層UI: 現在の階層を示す",
  /data-layer="1"[^>]*disabled/.test(layerFresh.elements.layerButtons.innerHTML)
  && /layer-button active/.test(layerFresh.elements.layerButtons.innerHTML));
equal("階層UI: 現在階層をヘッダーへ表示する", layerFresh.elements.currentLayer.textContent, "第1層");
check("階層UI: 第1層では第2層の仮入口をロケーションへ出さない",
  layerFresh.elements.locationButtons.innerHTML.includes("layer2Entry") === false);

// ボス撃破 → 第2層解放 → 遷移
const layerRun = bossReady(loadPrototype(file, {}));
forceVictory(layerRun);
layerRun.api.state.explorationDepth.forest = 40;
withRolls(Array.from({ length: 80 }, () => 0.999), () => layerRun.api.challengeBoss("goblinWarlord"));
equal("階層: ウォーロード勝利で第2層が解放される", layerRun.api.worldState.layers.layer2Unlocked, true);
equal("階層: 解放されても現在階層は変わらない（解放状態と現在階層は独立）", layerRun.api.state.layer, 1);
equal("階層: 解放後は第2層が移動可能になる", layerRun.api.layerUnlocked(2), true);
layerRun.api.moveLayer(2);
equal("階層: 解放後は第2層へ移動できる", layerRun.api.state.layer, 2);
equal("階層: 第2層では仮入口ロケーションにいる", layerRun.api.state.location, "layer2Entry");
equal("階層: 第2層移動後もworld stateは変化しない",
  `${layerRun.api.locationProgress("den")},${layerRun.api.worldState.bosses.goblinWarlord.defeated}`, "100,true");
check("階層: 階層移動をログへ残す",
  layerRun.api.state.systemLog.some((entry) => /第1層から第2層へ移動した/.test(entry.message)));
layerRun.api.render();
equal("階層UI: 第2層では現在階層表示が第2層になる", layerRun.elements.currentLayer.textContent, "第2層");
check("階層UI: 第2層では仮入口ロケーションだけを表示する",
  /data-location="layer2Entry"/.test(layerRun.elements.locationButtons.innerHTML)
  && ["town", "forest", "den"].every((id) => layerRun.elements.locationButtons.innerHTML.includes(`data-location="${id}"`) === false),
  layerRun.elements.locationButtons.innerHTML);
check("階層UI: 第2層の画面はコンテンツ未実装であることを示す",
  /第2層 仮入口/.test(layerRun.elements.screen.innerHTML)
  && /この階層のPrototypeコンテンツは未実装です/.test(layerRun.elements.screen.innerHTML),
  layerRun.elements.screen.innerHTML.slice(0, 400));
check("階層UI: 第2層の画面から第1層へ戻れることを示す",
  /第1層へ戻ると、これまでの進行を続けられます/.test(layerRun.elements.screen.innerHTML));
check("階層UI: 第2層では探索・宿屋等の行動を出さない",
  /data-cost=/.test(layerRun.elements.screen.innerHTML) === false
  && /id="inn"/.test(layerRun.elements.screen.innerHTML) === false);
equal("階層UI: 第2層では踏破率を表示しない", layerRun.elements.clearRateBox.hidden, true);

// 第1層へ戻っても既存進行を維持する
layerRun.api.moveLayer(1);
equal("階層: 第2層から第1層へ戻れる",
  `${layerRun.api.state.layer},${layerRun.api.state.location}`, "1,town");
equal("階層: 第1層へ戻っても踏破率を維持する",
  `${layerRun.api.locationProgress("forest")},${layerRun.api.locationProgress("den")}`, "100,100");
equal("階層: 第1層へ戻ってもボス撃破・第2層解放を維持する",
  `${layerRun.api.worldState.bosses.goblinWarlord.defeated},${layerRun.api.worldState.layers.layer2Unlocked}`,
  "true,true");
equal("階層: 第1層へ戻ってもクエスト完了状態を維持する",
  `${layerRun.api.worldState.quest.current},${layerRun.api.worldState.quest.completed.includes("goblinCleanup")}`,
  "null,true");
equal("階層: 第1層へ戻っても個人の探索深度を維持する", layerRun.api.state.explorationDepth.forest, 40);
layerRun.api.render();
check("階層UI: 第1層へ戻ると第1層のロケーションを表示する",
  ["town", "forest", "den"].every((id) => layerRun.elements.locationButtons.innerHTML.includes(`data-location="${id}"`)));

// 保存と再読込
layerRun.api.moveLayer(2);
layerRun.api.save();
layerRun.api.saveWorld();
equal("階層: 現在階層を保存する", JSON.parse(layerRun.store[CONFIG.storageKey]).layer, 2);
const layerReloaded = loadPrototype(file, layerRun.store);
equal("階層: 再読込後も第2層にいる",
  `${layerReloaded.api.state.layer},${layerReloaded.api.state.location}`, "2,layer2Entry");
equal("階層: 再読込後も第1層の進行を維持する",
  `${layerReloaded.api.locationProgress("den")},${layerReloaded.api.worldState.bosses.goblinWarlord.defeated}`,
  "100,true");
// 未解放なのに第2層が保存されている場合は第1層へ落とす
const layerInvalid = loadPrototype(file, {
  [CONFIG.storageKey]: JSON.stringify({ layer: 2, location: "layer2Entry", gold: 42 }),
});
equal("階層: 未解放の階層が保存されていても第1層へ正規化する",
  `${layerInvalid.api.state.layer},${layerInvalid.api.state.location}`, "1,town");
equal("階層: 正規化しても他の状態を失わない", layerInvalid.api.state.gold, 42);
// 現在階層と一致しないロケーションも入口へ落とす
const layerMismatch = loadPrototype(file, {
  [CONFIG.storageKey]: JSON.stringify({ layer: 1, location: "layer2Entry" }),
});
equal("階層: 現在階層に属さないロケーションは入口へ落とす", layerMismatch.api.state.location, "town");
equal("階層: 不正な階層値は第1層として扱う",
  loadPrototype(file, { [CONFIG.storageKey]: JSON.stringify({ layer: "2" }) }).api.state.layer, 1);

// 第2層にいても第1層の探索状態を壊さない（回帰確認）
const layerExplore = bossReady(loadPrototype(file, {}));
forceVictory(layerExplore);
withRolls(Array.from({ length: 80 }, () => 0.999), () => layerExplore.api.challengeBoss("goblinWarlord"));
layerExplore.api.moveLayer(2);
const depthBefore = JSON.stringify(layerExplore.api.state.explorationDepth);
layerExplore.api.explore(10);
equal("階層: 第2層では探索を実行しない", JSON.stringify(layerExplore.api.state.explorationDepth), depthBefore);
layerExplore.api.moveLayer(1);
layerExplore.api.move("forest");
layerExplore.api.debug("restore");
layerExplore.api.state.staminaSpent = 0;
layerExplore.api.explore(10);
equal("階層: 第1層へ戻れば従来どおり探索できる",
  layerExplore.api.state.lastResult.location, "forest");

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
