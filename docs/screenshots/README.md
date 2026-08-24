# Portfolio Screenshot Ledger

作品名: **画像・PDF個人情報マスキングツール**

必須枚数: **5枚**

データ条件: **同梱の完全架空Demoだけを使用**

撮影対象: **最終Vercel production版**

## 現在の状態

| # | ファイル | 必須画面 | 状態 |
| --- | --- | --- | --- |
| 1 | `01-document-viewer.png` | Document Viewer | 撮影・目視確認済み |
| 2 | `02-mask-candidates.png` | Mask候補 | 撮影・目視確認済み |
| 3 | `03-manual-redaction.png` | Manual Redaction | 撮影・目視確認済み |
| 4 | `04-before-after.png` | Before / After | 撮影・目視確認済み |
| 5 | `05-export.png` | Export | 撮影・目視確認済み |

## 共通撮影条件

- URL: https://image-pdf-redaction-tool.vercel.app
- Desktop viewport: **1425 × 990px**。5枚すべて同じ寸法
- Browser zoom: 100%
- Color scheme: Light
- Data: ヘッダーの「架空デモ」から読み込んだ3ページだけ
- Browser chrome、開発ツール、Cursor、個人アカウント、通知、Download barは写さない
- Dev overlay、React error、Console warning、未読込assetがない状態で撮る
- 画像を切り抜く場合もアプリの元の縦横比を維持し、UIを合成・改変しない
- 実在人物名、実メール、実電話、実住所、実ID、実顧客文書を絶対に使わない
- 撮影後に各PNGを開き、文字、Mask状態、余白、欠け、個人情報がないことを目視確認する
- READMEやポートフォリオへ掲載するのは、台帳を「撮影・確認済み」に更新した画像だけ

## 1. Document Viewer

ファイル: `01-document-viewer.png`

推奨状態:

- 架空Demoの「請求書」ページを表示
- 3ページのThumbnailが左側に見える
- Viewer、Workflow、Privacy表示、Mask候補panelが同時に読める
- Original表示
- 未確認候補は自動確定されていない状態

Alt候補:

> 3ページの架空文書をThumbnailで移動できる画像・PDF個人情報マスキングツールのDocument Viewer

確認項目:

- [x] `ブラウザ内処理`とPrivacy stripが見える
- [x] 請求書・申込書・会員名簿の3ページが分かる
- [x] UploadからExportまでの工程が見える
- [x] UIの欠け・横スクロールがない

## 2. Mask候補

ファイル: `02-mask-candidates.png`

推奨状態:

- Filterは「未確認」
- EmailまたはPhone候補をクリックし、Viewer上の候補boxをhighlight
- Candidate cardの種別、検出元、架空テキスト、ページ、`マスクする` / `無視`を読める
- 自動マスクされていない状態を残す

Alt候補:

> OCRとルールが提示した個人情報候補をマスクするか無視するか人が確認する画面

確認項目:

- [x] `[マスクする]`と`[無視]`が同じ候補に表示される
- [x] `未確認 / マスク / 無視`の件数が見える
- [x] 候補boxはpending表現で、黒塗りと混同しない
- [x] `.example.test`、`000`、`DEMO`等の架空値だけが見える

## 3. Manual Redaction

ファイル: `03-manual-redaction.png`

推奨状態:

- Viewer toolは「範囲選択」
- 黒塗りを1箇所、Blurを1箇所追加
- Manual操作後の成功noticeまたはMask件数が見える
- Viewer内に手動範囲の結果が明確に見える
- Undo / Redo buttonも画面内に含める

Alt候補:

> 文書上をMouseまたはTouchで範囲選択し黒塗りとBlurを追加するManual Redaction画面

確認項目:

- [x] `範囲選択`がactive
- [x] `黒塗り` / `Blur`の切替が見える
- [x] Manual maskがページの架空情報だけを覆う
- [x] Blurの注意文が表示される

## 4. Before / After

ファイル: `04-before-after.png`

推奨状態:

- 候補マスクと手動マスクを複数適用後に「比較」へ移動
- Sliderを45〜55%付近に置く
- 左右に`Original` / `Masked` labelが見える
- Dividerの両側で同じ架空文書の変化を比較できる

Alt候補:

> 架空会員名簿のOriginalとBlur適用後のMaskedを可動式スライダーで比較するBefore After画面

確認項目:

- [x] 同じページのBefore / Afterである
- [x] Slider handleと両labelが見える
- [x] マスク位置のずれ・1px gapが目視でない
- [x] Original側の値は完全架空データだけ

## 5. Export

ファイル: `05-export.png`

推奨状態:

- すべての候補を`マスクする`または`無視`でReview済みにする
- 架空Demoから画像化PDFを実際に生成する
- `画像化・テキストレイヤーなしを確認済み`、3ページ、抽出テキスト0件の結果を表示
- 最新出力名と、PDF / PNG / JPEGの選択肢が見える
- 未確認候補の警告がない状態

Alt候補:

> マスクを画素へ焼き込んだ画像化PDFを生成しページ数とテキストレイヤー不在を検証するExport画面

確認項目:

- [x] PDF書き出し後のvalidation結果が見える
- [x] `復元不能性の保証ではありません`という境界が読める
- [x] PNG / JPEGの現在ページ出力も見える
- [ ] DownloadしたPDFを別Viewerで開いて3ページを確認済み

ブラウザ内では`application/pdf`・387,036 bytesのBlob生成、3ページ一致、PDF.js抽出テキスト0件を確認しました。自動ブラウザのdownload保存はキャンセルされたため、別Viewerでの手動確認は未実施として残します。

## 撮影後の台帳更新

各画像について次を記録してください。

| ファイル | 撮影日時 | Production URL / commit | Viewport | 目視確認者 | 備考 |
| --- | --- | --- | --- | --- | --- |
| `01-document-viewer.png` | 2026-08-24 23:30 JST | production / `dpl_HkGn3MeePoGYAPzGQ77pcwUjwig4` | 1425 × 990 | Codex production browser | 250,576 bytes |
| `02-mask-candidates.png` | 2026-08-24 23:30 JST | production / `dpl_HkGn3MeePoGYAPzGQ77pcwUjwig4` | 1425 × 990 | Codex production browser | 247,707 bytes |
| `03-manual-redaction.png` | 2026-08-24 23:30 JST | production / `dpl_HkGn3MeePoGYAPzGQ77pcwUjwig4` | 1425 × 990 | Codex production browser | 246,785 bytes |
| `04-before-after.png` | 2026-08-24 23:30 JST | production / `dpl_HkGn3MeePoGYAPzGQ77pcwUjwig4` | 1425 × 990 | Codex production browser | 232,242 bytes |
| `05-export.png` | 2026-08-24 23:30 JST | production / `dpl_HkGn3MeePoGYAPzGQ77pcwUjwig4` | 1425 × 990 | Codex production browser | 198,010 bytes |

5枚ともproduction deploymentの実画面を同じviewportで撮影し、画像を個別に開いて内容・比率・架空データ・欠けを目視確認しました。GitHub掲載時は`main`の最新commitと上記deploymentのソース差分も再確認してください。
