#!/usr/bin/env node
"use strict";
/**
 * prototype.html のインラインスクリプトを Node の vm 上で実行するための共通ハーネスである。
 *
 * 単一HTMLのままブラウザ以外で検証するため、DOM と localStorage は最小限のスタブを与え、
 * トップレベルの const / let を取り出すためのエピローグを連結して実行する。
 * 自動テスト（check_prototype_behavior.js）と継戦性シミュレーション（simulate_endurance.js）で共有する。
 */

const fs = require("fs");
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
  "locationContent", "encounterPool", "enemyDef", "eventText",
  "debug", "debugBattle", "debugRestore", "summaryText", "writeBattleTurns",
  "maxSatiety", "normalizeSatiety", "consumeSatiety", "planSatietyRecovery",
  "applySatietyRecovery", "supplySatiety", "satietyLogText",
  "aggregateGains", "gainsHtml", "resultHtml",
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

module.exports = { loadPrototype, EXPORTS };
