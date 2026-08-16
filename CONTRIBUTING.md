# Contributing

この文書は、今後作成するIssue・Pull Request・branchの軽量な共通ルールを定める。既存のIssue・Pull Request・branchへ遡って適用しない。

## Issue

Issueタイトルは原則として日本語で記述し、type prefixは付けない。種類よりも「何を達成するIssueか」が伝わるタイトルを優先する。

例：

```text
始まりの洞窟にボス戦を追加する
ゲーム内日時をヘッダーへ表示する
戦闘ログの残HP表記を明確化する
```

新しい開発Issueには、原則として開発Issue Formを使用する。目的、背景、実装・変更対象、非対象、受入条件、Human Verification、関連情報を記載する。

ゲーム内容、UI、体感、操作の確認が必要な場合は、Human Verificationの具体的な確認項目を明記する。AIによる実装や自動テストが完了しても、人間が実際に確認していない項目は完了扱いにしない。

## Pull Request

Pull Requestタイトルは、次の形式を基本とする。

```text
<type>: <日本語の要約>
```

typeは次のいずれかを使用する。

- `feat`: 機能・ゲーム内容の追加または変更
- `fix`: 不具合修正
- `docs`: 設計書・文書のみの変更
- `refactor`: 挙動を変えないコード整理
- `test`: テストのみの変更
- `ci`: GitHub Actions・CI/CDの変更
- `chore`: その他の開発環境・運用変更

例：

```text
feat: 始まりの洞窟にボス戦を追加する
fix: 戦闘終了後にHPが保存されない問題を修正する
docs: 探索仕様を現行Prototypeへ同期する
chore: IssueとPRのテンプレートを追加する
```

Pull Request本文には、対応Issue、概要、変更内容、対象外、テスト結果、設計書への影響、Human Verification、補足・残存リスクを記載する。

自動テストとHuman Verificationは分けて記録する。人間による実確認前にHuman Verification完了とは記載しない。Human Verificationが必要な場合は、具体的な確認項目を本文へ記載する。

このルールはConventional Commits全体やcommit messageの強制を導入するものではない。

## Branch

branch名は厳格には検証しないが、可能な範囲で次の形式を推奨する。

```text
<type>/<short-kebab>-issue<番号>
```

例：

```text
feat/cave-boss-issue41
fix/battle-hp-save-issue42
docs/prototype-sync-issue43
```

命名の差だけを理由にMergeをブロックしない。
