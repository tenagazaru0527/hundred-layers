# Repository Instructions

## 開発作業の基準

- Claude Code / Codex共通の開発・検証ルール（Canonical rule）はこの `AGENTS.md` を正とし、`CLAUDE.md` 等の別ファイルへ複製しない。
- 対象Issueを、当該作業の Scope / Out of Scope / Acceptance Criteria の基準とする。Issueの存在だけでは操作権限を付与しない。
- 着手前に、対象repository / branch、未commit差分を含む作業状態、並行作業・依存関係、対象environment / resource、SSOT、projectとtaskに対する明示承認の有効範囲を確認する。未確認・競合・不安全な状態が影響する操作では停止する。
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

### 明示承認の範囲と停止条件

- `ai-dev-foundation/GATES.md` の参照・採用、他project・過去taskの承認を、Hundred Layersの個別操作の承認として引き継がない。**このprojectと対象taskの両方**で有効なHumanの明示承認を確認する。
- 対象IssueのScope / Out of Scope / Acceptance Criteriaと矛盾しないことを前提に、対象task・目的・完了条件、repository / branchまたはchange set、environment / resource、許可操作、Humanに残す判断・承認・実行操作、承認者・日時・根拠となる承認への参照・有効範囲・終了条件を、当該Issue / PR本文等の既存の作業記録へ残す。記録しただけで権限が生じるわけではない。
- 明示承認された範囲では、**許可された工程に限り**、調査 → 実装・文書編集 → 必要なテスト・simulation → 作業branchへのcommit / push → PR作成を継続できる。工程の切替や、範囲内の通常のrepository書込み・低riskなcommitごとに再承認を求めない。この工程例は全操作への包括許可ではない。
- 新たな未解決の仕様判断、またはscope / 対象repository・branch・environment・resource / 操作 / 権限 / risk・影響範囲 / rollback可能性の実質的変更が発生した場合、**影響する操作を停止**し、差分と必要な判断・再承認をHumanへ渡す。許可済みの他工程を無条件に停止する必要はない。
- Production・稼働中shared resource、credential、破壊的・不可逆操作などは必要な操作別承認やHuman実行を維持する。tool・実行環境の安全制約を省略・迂回せず、Agentはpermission拡張・guardrail解除・scope拡大を自己承認しない。
- mainへの直接pushはGitHub Pages公開と、設定されていればDiscord通知へつながる。作業branchへの通常のpush承認は、main直接push・merge・auto-merge・deploy・workflow_dispatchの許可ではない。Agent自身はmergeしない。

- Issue・Pull Requestの作成・更新時は、`CONTRIBUTING.md`の命名・本文ルールに従う。
- Human Verificationが残る場合、自動検証とPR作成後に `REVIEW_REQUIRED` として停止し、未確認項目を人間へ引き渡す。
- Agent自身はmergeしない。

### Pull Requestの影響範囲と検証状態

- PR作成時は、テンプレートの影響範囲と検証状態を省略せず、各項目を記入する。
- ゲーム仕様に関係する変更では、`docs/DOC_MAP.md`から関連テーマと確認対象のSSOTを特定する。ゲーム仕様と無関係な変更では `N/A` とする。
- 差分から古くなる可能性がある文書を列挙し、関連する`OPEN_QUESTIONS.md`またはDecisionの再検討条件がある場合は記載する。該当しない場合は `N/A` とする。
- Automated Test、Simulation、Adversarial Playtest、Human Verification、Docs Syncは、それぞれ `DONE / PENDING / N/A` のいずれかで明示し、必要に応じてコマンド、結果、未完了理由、確認項目を補足する。
- Issueの受入条件と変更領域に不要な検証は実行せず `N/A` とする。
- Agent自身はHuman Verificationを `DONE` にしない。人間による確認前は `PENDING`、Human Verificationが不要な場合は `N/A` とする。

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
