# DECISIONS

主要な設計判断について、**なぜその判断をしたか**を短時間で追うための軽量なDecision Logである。

この文書は正式仕様のSSOTではない。仕様、確定度、Prototypeの実装範囲、未決事項は、各Decisionの「関連」に示す `GAME_CONCEPT.md`、`GAME_DESIGN.md`、`PROTOTYPE.md`、`OPEN_QUESTIONS.md`、Issue、Pull Requestを正とする。

## 1. statusページとの役割分担

- `status.html`：現在どこまで進み、次に何をするかを示す手動更新スナップショット
- `DECISIONS.md`：現在の設計や実装方針へ至った理由、比較した方向、再検討条件を示す索引

statusページの履歴や仕様本文をこの文書へ複製しない。必要な場合は互いに関連リンクだけを置く。

## 2. 記録対象

次のいずれかに該当し、今後の設計や実装判断へ影響するものを記録する。

- 正式仕様として採用または不採用を決めた
- 重要な方式をPrototypeで比較検証すると決めた
- 複数案から1つを選んだ
- 意図的に実装しない、または棚上げすると決めた
- Human Verificationから次の検証方向を決めた

単純なバグ修正、文言修正、軽微なリファクタ、一時的な数値変更、PR本文だけで十分な実装詳細は原則として記録しない。

## 3. 更新方法

- IDは `D-001` 形式で採番し、既存IDを再利用しない
- 確定度は `確定`、`Prototype仮採用`、`有力案`、`未決`のいずれかを使用する
- Decisionを記録したこと自体を正式採用とはみなさない
- 判断が変わった場合は過去Decisionを削除せず、新しいDecisionから変更元を参照する
- 事実誤認やリンク切れの訂正を除き、過去Decisionを現在の判断へ無言で書き換えない
- 追記前に対象テーマを `DOC_MAP.md` でルーティングし、直接関係するSSOT、Issue、Pull Requestだけを確認する

## 4. Decision Log

### D-001 100層攻略後は能力・装備を次の世界へ持ち越さない

- 日付: 2026-08-14
- 確定度: 確定
- 判断: 100層攻略を有限なゲーム単位の終了とし、キャラクター能力・装備等をそのまま次の世界へ引き継いで永続成長させない。
- 理由: 新しい世界では同じスタートラインから始め、過去の育成量だけが恒久的な有利にならないようにするため。その世界で誰とどのように攻略したかに意味を持たせる。
- 採用しなかった方向: 101層以降を追加し続けて終点を延ばす方式、能力・装備を次の世界へ持ち越して永続成長を中心にする方式。
- 関連:
  - [`GAME_CONCEPT.md` 9章](GAME_CONCEPT.md#9-世界の終了と再スタート)
  - [`GAME_DESIGN.md` 14章](GAME_DESIGN.md#14-世界終了リセット)
  - [`OPEN_QUESTIONS.md` 10章](OPEN_QUESTIONS.md#10-p2100層世界終了シーズンに関する未決事項)
  - [初期設計整理commit](https://github.com/tenagazaru0527/hundred-layers/commit/f8b4a1dbe3588d9ae3f842d0d292de13a3b01e54)
- 再検討条件: 「100層の有限世界」という根本要件自体を変更する場合。アカウント、プレイ履歴、クリア記録等をどこまで残すかはこのDecisionに含めず、引き続き未決とする。

### D-002 Ability Lv到達時にSkillを自動習得する

- 日付: 2026-08-18
- 確定度: 確定
- 判断: 基本パラメータでAbilityを解放し、APでAbility Lvを上げ、規定Lvへ到達した時点で対応Skillを自動習得する。Skill自体にLvを持たせず、APをSkillへ直接使わない。
- 理由: 基本パラメータ、Ability、Skillの役割を分け、キャラクターの適性と具体的な技の習得を一つの成長経路として扱うため。
- 採用しなかった方向: 使用回数や戦闘回数による熟練度成長、APをSkillへ直接投入する方式、Ability条件達成後に別ポイントでSkillを購入する方式。
- 関連:
  - [`GAME_DESIGN.md` 19.4–19.5](GAME_DESIGN.md#194-アビリティとアビリティポイントap)
  - [`PROTOTYPE.md` 8.1](PROTOTYPE.md#81-戦闘と育成)
  - [`OPEN_QUESTIONS.md` 13.3–13.4](OPEN_QUESTIONS.md#133-アビリティ)
  - [Issue #71](https://github.com/tenagazaru0527/hundred-layers/issues/71)
  - [PR #72](https://github.com/tenagazaru0527/hundred-layers/pull/72)
- 再検討条件: 基本パラメータ → Ability → Skillという正式な成長構造自体を見直す場合。具体的なAbility名、解放閾値、上限Lv、Skill性能の変更はこのDecisionの変更を意味しない。

### D-003 第1層で共有進行の最小サイクルを検証する

- 日付: 2026-08-18
- 確定度: Prototype仮採用
- 判断: 正式採用済みの共有進行方針を検証するため、第1層Prototypeでは、アルンの森とゴブリンの巣穴を順に進め、ボス解放・撃破から第2層解放へつなぐ。ロケーション踏破率、クエストStep、各種アンロック、ボス状態は別の役割を持つ状態として扱う。
- 理由: 個人の探索が世界変化と次の目標へ接続する感覚を、オンライン基盤や第2層コンテンツを先行実装せずに確認するため。1つの進捗値へ集約すると、踏破後の探索継続やアンロックの責務が曖昧になる。
- 採用しなかった方向: 第1層進行を単一の進捗値だけで表す方式、踏破率100%でロケーションを利用終了にする方式、本物のバックエンド共有進行を最初から実装する方式。
- 関連:
  - [`GAME_DESIGN.md` 2章](GAME_DESIGN.md#2-ゲーム全体の進行構造)
  - [`PROTOTYPE.md` 15.7](PROTOTYPE.md#157-第1層prototype進行モデル)
  - [`OPEN_QUESTIONS.md` 5章](OPEN_QUESTIONS.md#5-p2攻略進度ロケーション共有踏破率に関する未決事項)
  - [Issue #54](https://github.com/tenagazaru0527/hundred-layers/issues/54) / [PR #55](https://github.com/tenagazaru0527/hundred-layers/pull/55)
  - [Issue #76](https://github.com/tenagazaru0527/hundred-layers/issues/76) / [PR #77](https://github.com/tenagazaru0527/hundred-layers/pull/77)
- 再検討条件: Human Verificationで次の目標や解放が伝わらない場合、ロケーション数の増加で現在の状態分離・UIが成立しない場合、またはオンライン共有実装で追加の状態責務が判明した場合。第1層固有の名称・条件を全階層共通仕様にはしない。

### D-004 第1層コンテンツ案を正式化せずバックログで保持する

- 日付: 2026-08-21
- 確定度: 有力案
- 判断: 第1層の敵、イベント、背景等の候補は `GAME_DESIGN.md`へ一括で正式仕様化せず、Issue #73をアイデアバックログとして保持し、必要な項目だけを再評価してPrototypeへ導入する。
- 理由: 良いアイデアを失わずに残しつつ、現在の検証へ不要な世界設定・数値・ビジュアルを固定して設計を重くしないため。
- 採用しなかった方向: 候補をすべて正式設計へ流し込む方式、候補を記録せず破棄する方式、現在のPrototypeへ一括実装する方式。
- 関連:
  - [Issue #73](https://github.com/tenagazaru0527/hundred-layers/issues/73)
  - [`PROTOTYPE.md` 15.8](PROTOTYPE.md#158-第1層ロケーションの最小コンテンツ差issue-78)
  - [`OPEN_QUESTIONS.md` 5.5](OPEN_QUESTIONS.md#55-100到達後とボス解放)
- 再検討条件: 第1層コンテンツ実装、画像制作、UI試作へ着手する時点。採用時も名称・数値・確率は改めて確定度を判断し、バックログにあるだけで正式採用とはみなさない。

### D-005 プレイヤー作戦型Utility AIを比較検証する

- 日付: 2026-08-21
- 確定度: Prototype仮採用
- 判断: プレイヤーが作戦を選び、実行不能な行動を除外した後、基礎優先度・戦況・作戦・リソース消費から行動を評価する方式をPrototypeで検証する。現在の使用率は廃止せず、基礎優先度として再解釈する。
- 理由: 回復・防御等が増えた際、使用率だけの確率抽選では戦況を無視した行動が事前戦術より強く見える可能性があるため。戦闘前の作戦選択が自動戦闘中の行動差として現れるかを確認する。
- 採用しなかった方向: 今回のPrototypeでは、使用率だけで全行動を確率抽選し続ける方式、Score最大の行動だけを常に選ぶ完全決定論、敵AIとプレイヤーAIのScore式を無理に共通化する方式。
- 関連:
  - [`PROTOTYPE.md` 8.1](PROTOTYPE.md#81-戦闘と育成)
  - [`OPEN_QUESTIONS.md` 4.1](OPEN_QUESTIONS.md#41-通常戦闘方式)
  - [Issue #74](https://github.com/tenagazaru0527/hundred-layers/issues/74)
  - [PR #75](https://github.com/tenagazaru0527/hundred-layers/pull/75)
- 再検討条件: Human Verificationで作戦による行動・MP消費・戦闘結果の差を感じられない場合、指定した方針どおりに見えない場合、またはランダム性と個別Skill設定の役割を理解しにくい場合。正式な作戦方式、種類、Score式は未決とする。

### D-006 強敵を弱体化する前に探索の継戦性を分離検証する

- 日付: 2026-08-22
- 確定度: Prototype仮採用
- 判断: アルファウルフ等の敵能力値を直ちに下げず、強敵単体の戦闘強度と、複数戦闘によるHP / MP消耗を分けて検証する。Human Verification結果を踏まえ、敵弱体化より先に探索前準備、戦闘間回復、回復系Skill / Passive、消耗品等の継戦手段を別Issueで切り分ける。
- 理由: Lv5程度かつHP / MPが十分ならアルファウルフ単体に勝てる一方、探索中に戦闘が2回発生するとほぼ確実に敗北したため。原因が敵単体の強さではなく、HP / MP持越しに対する継戦手段不足にある可能性を先に検証する必要がある。
- 採用しなかった方向: 今回の調整では、原因を分けずに強敵の能力値だけを下げる方式、装備・回復Skill・Passive・消耗品・満腹度等を同時に追加して結果の原因を追えなくする方式。
- 関連:
  - [`GAME_DESIGN.md` 22章](GAME_DESIGN.md#22-探索中のhp--mp持越しと街への帰還)
  - [`PROTOTYPE.md` 15.9](PROTOTYPE.md#159-強敵単体と長期探索の検証手段issue-80)
  - [`OPEN_QUESTIONS.md` 4.6](OPEN_QUESTIONS.md#46-hp--mp持越し宿屋)
  - [Issue #80](https://github.com/tenagazaru0527/hundred-layers/issues/80)
  - [PR #81とHuman Verification結果](https://github.com/tenagazaru0527/hundred-layers/pull/81)
- 再検討条件: 継戦手段を追加しても十分な状態から強敵単体へ勝負にならない場合、または強敵の想定役割自体を変更する場合。どの継戦手段を採用するか、HP / MP持越しを正式採用するかは未決とする。
