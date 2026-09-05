# Repository Instructions

## 開発作業の基準

- Claude Code / Codex共通の開発・検証ルール（Canonical rule）はこの `AGENTS.md` を正とし、`CLAUDE.md` 等の別ファイルへ複製しない。
- 対象Issueを、当該作業の Scope / Out of Scope / Acceptance Criteria の基準とする。
- 恒久的なゲーム仕様のSSOTは、従来どおり `docs/DOC_MAP.md` が示す設計文書とする。仕様確認では下記のルーティングに従い、`docs/` 全体を不用意に探索しない。

## 設計ドキュメント更新

- 最初に `docs/DOC_MAP.md` を確認し、変更テーマを1つ以上特定する。
- DOC_MAPが示すSSOTの対象セクションを先に確認する。
- 関連文書も原則として指定セクションだけ確認し、必要なファイルだけ変更する。
- 未決事項を勝手に正式仕様化しない。
- `正式採用`、`Prototype仮採用`、`未決`など、既存の確定度を維持する。
- ゲーム設計アイデアの追加、既存仕様の変更、設計文書の同期には `.agents/skills/update-game-design/SKILL.md` を使用する。

## 広範囲確認へ切り替える条件

次の場合だけDOC_MAPのルーティング範囲を超えて確認する。範囲を広げる前に理由を短く説明する。

- 複数システムにまたがる変更
- `docs/GAME_CONCEPT.md` に関わる根本思想の変更
- SSOT構造そのものの変更
- 対象セクション内で他仕様との矛盾を検出した
- DOC_MAPだけでは参照先を決定できない
- ユーザーが全体整合確認を明示した

`docs/` 全体や `docs/minutes/` の全文確認を通常動作にしない。設計経緯が必要な場合だけ `docs/minutes/` を参照する。

## GitHub運用

- Issue・Pull Requestの作成・更新時は、`CONTRIBUTING.md`の命名・本文ルールに従う。
- Human Verificationが残る場合、自動検証とPR作成後に `REVIEW_REQUIRED` として停止し、未確認項目を人間へ引き渡す。
- Agent自身はmergeしない。

## 検証ルーティング

- Prototype変更時の通常full regression入口は `python3 scripts/check_prototype.py` とする。
- `check_prototype.py` は内部で `check_prototype_behavior.js` を実行するため、通常は両方を連続実行しない。behavior検証の直接実行は、失敗箇所の切り分けなど必要な場合に限る。
- `check_prototype_behavior.js` を読む場合は、Issue番号・関数名・機能見出しで対象箇所を絞る。毎回全体を読まない。
- 下表は変更内容から必要な検証を選ぶためのルーティングであり、全項目を実行するチェックリストではない。全simulation実行を標準動作にせず、Issueの受入条件と変更領域に応じて必要なものだけ選ぶ。

| 変更領域 | 基本検証 | 追加検証 |
|---|---|---|
| 通常Prototype変更 | `python3 scripts/check_prototype.py` | 原則なし |
| 探索確率 / drop | `python3 scripts/check_prototype.py` | 必要時 `node scripts/simulate_exploration_distribution.js` |
| 満腹度 / HP持越し / 探索継戦 | `python3 scripts/check_prototype.py` | 必要時 `node scripts/simulate_endurance.js` |
| 戦闘式 / 装備戦力 / Boss | `python3 scripts/check_prototype.py` | 必要時 `node scripts/simulate_boss.js` |
| 属性 / 耐性式 | `python3 scripts/check_prototype.py` | `node scripts/compare_resistance_formula.js`。影響が広い場合のみboss / endurance |
| 工房recipe / inventory | `python3 scripts/check_prototype.py` | 原則simulation不要 |
| inputMultiplierモデル変更 | 対象Issueに応じた確認 | `node scripts/simulate_workshop_input_multiplier.js` |
| status page | `python3 scripts/check_status_page.py` | 原則なし |

## Agent Verification / Human Verification

- Agent Verification：state transition、数値計算、save/load、migration、unlock条件、inventory / equipment、deterministic logic、syntax / runtime error、機械的なrender条件を確認する。
- Human Verification：UIの分かりやすさ、ゲーム進行テンポ、面白さ、情報量が多すぎないか、クリック導線、バランス体感、世界観やゲーム感覚を人間が確認する。
- 自動検証の結果とHuman Verificationの状況は分けて記録する。Agent自身はHuman Verificationを完了扱いにせず、自動検証だけで人間の確認項目を完了判定しない。
