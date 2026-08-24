# ポートフォリオ掲載用完全版プロンプト

以下を、既存ポートフォリオへ本作品を追加するCodexまたはClaude Codeへ渡してください。

> **公開情報（確認済み）**
>
> - Vercel公開URL: https://image-pdf-redaction-tool.vercel.app
> - GitHub URL: https://github.com/shunsoco-stack/image-pdf-redaction-tool
> - 作品ソース: `image-pdf-redaction-tool`
> - 専用アイコン: `image-pdf-redaction-tool/docs/portfolio-assets/image-pdf-redaction-tool.svg`
> - 必須スクリーンショット: `image-pdf-redaction-tool/docs/screenshots/01-document-viewer.png`〜`05-export.png`
>
> 公開画面またはGitHubを開けない場合、5画像が「撮影・確認済み」でない場合は、ポートフォリオ側を変更せず不足を報告して停止してください。

---

あなたは、既存ポートフォリオサイトへ完成確認済みの作品を1件追加します。対象は`image-pdf-redaction-tool`です。作品名を省略・改名せず、必ず**「画像・PDF個人情報マスキングツール」**と掲載してください。

## 絶対条件

- READMEの文言だけを信用せず、ソース、テスト結果、公開画面、出力ファイル、Screenshot台帳を突き合わせる。
- 実在人物・実顧客の氏名、メール、電話、住所、ID、文書、画像を使わない。
- Demoの「請求書・申込書・会員名簿」はCanvasで生成した完全架空データだけを使う。
- OCRやRegexの候補をAIが自動確定するように説明しない。
- PDFへ黒いRectangleを重ねただけの方式や「完全削除」と説明しない。
- Blurを不可逆・復元不能・安全な削除と説明しない。
- 対応形式は**PNG / JPEG / PDFだけ**とする。HEIC、WebP、TIFF、Office等を対応済みに含めない。
- 公開URL、GitHub URL、test数、処理上限、Screenshot、性能値を推測しない。
- 未確認のE2E、クロスブラウザ、アクセシビリティ、セキュリティ、復元不能性を実績化しない。
- 別作品の画像、AI生成の画面、開発中画像、UI合成、Placeholderを掲載しない。
- 既存ポートフォリオの設計・型・並び順・asset規則を尊重し、最小差分で追加する。

## 掲載前ゲート

次のすべてを再確認してください。1つでも満たさない場合は追加を停止します。別PDF Viewerでの表示確認は推奨追加QAとし、未実施の場合はQA Reportの記録を保持します。

1. `npm run lint`が成功する
2. `npm run typecheck`が成功する
3. `npm run test`が成功し、最新のtest file数・test数を取得できる
4. `npm run build`が成功し、`out/`にstatic exportが生成される
5. `npm run verify`が成功する
6. https://image-pdf-redaction-tool.vercel.app を外部ブラウザで開き、作品名と完成版UIを確認できる
7. 公開版で架空Demoを使い、Detect → Review → Redact → Validate → Exportを完走できる
8. 画像化PDFをブラウザ内で生成し、`application/pdf` Blobを確認できる
9. 出力時にページ数一致とPDF.js抽出テキスト0件の結果を確認できる
10. 公開版Networkで文書内容を含む送信がなく、Storageへ文書・OCR・Maskが永続保存されないことを確認できる
11. 公開版Consoleに作品操作を妨げるerrorがない
12. `docs/screenshots/README.md`の5画像がすべて最終公開版の「撮影・確認済み」になっている
13. `git remote get-url origin`とGitHub公開画面から https://github.com/shunsoco-stack/image-pdf-redaction-tool を確認できる
14. 専用SVGが存在し、64px相当でもDocument + Shield + Maskを判別できる
15. `docs/QA_REPORT.md`が実際の検証結果へ更新され、公開判定が「公開済み」になっている

別PDF Viewerでのページ数・見た目確認は推奨追加QAです。未実施の場合は実績化せず、QA Reportの未実施表記を残してください。

2026-08-24時点の記録は5 test files・31 tests、lint・typecheck・test・build成功です。掲載時には必ず再実行した最新値を確認してください。

## 最初に読むもの

- `image-pdf-redaction-tool/README.md`
- `image-pdf-redaction-tool/docs/QA_REPORT.md`
- `image-pdf-redaction-tool/docs/screenshots/README.md`
- `image-pdf-redaction-tool/package.json`
- `image-pdf-redaction-tool/next.config.ts`
- `image-pdf-redaction-tool/vercel.json`
- `image-pdf-redaction-tool/src/components/redaction-workspace.tsx`
- `image-pdf-redaction-tool/src/lib/types.ts`
- `image-pdf-redaction-tool/src/lib/document-loader.ts`
- `image-pdf-redaction-tool/src/lib/detection.ts`
- `image-pdf-redaction-tool/src/lib/redaction-engine.ts`
- `image-pdf-redaction-tool/src/lib/history.ts`
- `image-pdf-redaction-tool/src/lib/demo-document.ts`
- 既存ポートフォリオ側の`AGENTS.md`、作品データ定義、型、カード、詳細ページ、画像・icon配置規則

資料と実装が異なる場合は、現行コードと実動作を正とし、作品側資料も修正してください。

## 掲載する基本情報

- 作品名: **画像・PDF個人情報マスキングツール**
- カテゴリ: **業務効率化ツール**
- サブカテゴリ: **個人情報保護・文書処理**
- 制作区分: **Concept Project / 自主制作**
- 公開URL: **https://image-pdf-redaction-tool.vercel.app**
- GitHub URL: **https://github.com/shunsoco-stack/image-pdf-redaction-tool**
- slug案: `image-pdf-redaction-tool`
- 専用アイコン: `docs/portfolio-assets/image-pdf-redaction-tool.svg`
- アイコンコンセプト: **Document / Image + Shield / Mask**

URLはHTTPSの実物だけを入れ、仮URLのまま保存しないでください。外部リンクを`target="_blank"`で開く場合は`rel="noopener noreferrer"`を付けます。

## 作品の中心価値

「画像をぼかすだけのツール」ではなく、検出の誤りを前提に、人が判断してから安全側の出力へ進む業務フローとして紹介してください。

```text
Upload
  ↓
Text / Area Detection
  ↓
Mask候補
  ↓
Human Review
  ↓
Redaction
  ↓
Preview / Validate
  ↓
Export
```

候補検出とマスク適用を状態として分離し、OCR・Regexが誤認しても勝手に確定しません。Manual Redaction、Before / After、画像化PDFの構造検証まで含め、Detect → Review → Redact → Validate → Exportを成立させた点が中心です。

## 推奨掲載コピー

### 一覧カード向け

> 画像・PDFの個人情報候補をブラウザ内で検出し、人が確認してから黒塗り・Blurを適用。複数ページ、手動範囲選択、Before / After、画像化PDF出力まで一貫したHuman-in-the-loop型の文書処理ツールです。

### 詳細ページの概要

> 氏名、メールアドレス、電話番号、住所、ID番号等を含む画像・PDFを、外部の文書処理APIへアップロードせずに確認・マスキングするConcept Projectです。PDFテキスト抽出、ブラウザ内OCR、決定論的なPattern Detectionは候補提示に限定し、利用者が各候補を「マスクする」または「無視」と判断します。候補外はMouse / Touchで直接選択でき、黒塗りまたはBlurを適用できます。出力前にOriginal / Maskedを比較し、PDFは各ページへマスクを画素として焼き込んだ画像だけの新規PDFへ再構成します。

### 課題

> OCRやRegexは便利でも、氏名・住所の文脈、誤認識、見落としを完全には判断できません。また、PDFへ黒い図形を重ねるだけでは元テキストが残る場合があります。機密文書では、自動化の速さと人の判断、安全な出力構造を同じフローに含める必要があります。

### 解決

> Detection結果をすべてpending候補として提示し、Review操作後にだけRedactionを生成する状態設計を採用しました。候補ごとの判断、検索・一括適用、Manual Redaction、Undo / Redo、Before / Afterを組み合わせています。PDF Exportでは原PDFオブジェクトをコピーせず、マスク済みページ画像だけを新しいPDFへ埋め込み、ページ数と抽出可能テキストレイヤーを検証します。

### 注記

> PDF出力の検証は、想定ページ数とPDF.jsで抽出可能なテキストレイヤーがないことを確認する構造検証です。あらゆる解析に対する復元不能性や、検出漏れがないことを保証しません。Blurは視覚的秘匿のため、高機密情報には黒塗りと最終目視確認を推奨します。

## 実装済み機能

公開画面と最新QAで到達できるものだけを掲載してください。

- PNG / JPEG / PDFの読み込み
- File Picker / Drag & Drop
- PDF.jsによるMulti-page PDF表示
- ページ一覧、Thumbnail、前後移動、Zoom
- PDF内Textの抽出
- Tesseract.jsによる日本語・英語OCR（現在ページ / 全ページ）
- OCR / PDF Text検索と該当ページ移動
- Regex / label ruleによるEmail、Phone、Postal Code、Numeric ID、氏名、住所候補
- すべてpendingから始まるMask候補
- `[マスクする]` / `[無視]` / `判断を戻す`
- Candidate種別、source、page、confidence / rule一致の表示
- Mouse / TouchによるManual Redaction
- 黒塗り / ImageData Blur
- 表示中の未確認候補のBatch適用
- 操作単位のUndo / Redo
- Original / Masked切替
- Before / After slider
- PNG / JPEGで現在ページを出力
- 全ページを画像化してfresh PDFへ再構成
- 出力PDFのページ数・抽出テキストレイヤー検証
- 進捗・Cancel・Error案内
- 3ページの完全架空Demo Mode
- Browser内処理を明示するPrivacy UI

「一括」は現在の検索・状態filterで表示中の未確認候補を1操作で受け入れる機能です。複数入力ファイルのBatch処理とは書かないでください。

## Human-in-the-loopの表現

必ず次を明記してください。

- OCR / Regex / label ruleは**候補検出**である
- 初期statusは`pending`で、検出だけではマスクされない
- 利用者が`マスクする`を押したときだけCandidate Redactionが追加される
- `無視`と`判断を戻す`を選べる
- Manual Redactionで検出漏れを補える
- 未確認候補が残るExport画面では警告し、すべて判断するまで出力を停止する
- 候補検出の完全性・正確性を保証しない

「AIが自動で個人情報を完全検出」「ワンクリックで安全化」「誤検出ゼロ」等は禁止です。現在のDetectionはPDF Text / Tesseract OCRと決定論的なルールです。

## PDF安全設計の表現

掲載文では次の実装を正確に説明してください。

- 各ページをCanvasへrenderする
- 承認済み候補と手動マスクを画素へ焼き込む
- マスク済みCanvasをPNG化する
- `PDFDocument.create()`で新規PDFを作る
- ページへ画像だけを埋め込む
- 元PDFのページ、テキスト、フォーム、注釈、添付、メタデータをコピーしない
- 出力後にページ数一致とPDF.js抽出テキスト0件を検証する

同時に次の限界を省略しないでください。

- `textLayerAbsent`は構造検証で、一般的なforensic security保証ではない
- マスク範囲の見落とし、OCR漏れ、人の判断ミスは別問題
- 画像化によりテキスト検索・選択、Screen Reader用Text、フォーム、注釈、添付、元メタデータを失う
- 解像度、画質、ファイルサイズが変わり得る
- Blurは画素を残し、文字が推測される可能性がある

「完全削除」「100%復元不能」「絶対安全」「不可逆保証」と書かないでください。

## Local-first / Privacyの表現

確認済みの実装境界は次のとおりです。

- Next.js static exportで文書受信用backendを実装しない
- 文書内容を送るfetch / XHR / WebSocket / Beacon / form submit処理がない
- 外部OCR / AI API、Database、Cloud Storageを使用しない
- PDF.js / Tesseract Worker、WASM、CMap、Font、Language assetはsame origin
- File、page raster、OCR Text、mask、outputをアプリからlocalStorage / IndexedDBへ永続保存しない
- DemoはCanvas生成で、実データ・外部素材を含まない

公開版のNetwork / Storageを確認した後にのみ、「ファイル・画像・認識テキストはブラウザ内で処理され、アプリ固有サーバーへ送信しない」と掲載してください。静的asset配信と通常のホスティングaccess logまで存在しないような表現は禁止です。

## Demoの表現

- 請求書、申込書、会員名簿の3ページ
- Canvasでブラウザ内生成
- 31候補、初期状態はすべてpending
- 氏名には「（架空）」
- Emailは`.example.test`
- Phoneは`000`から始まる明示的なdemo値
- Postal Codeは`〒000-0000`
- IDには`DEMO`
- 住所には`架空県`
- 実在人物の個人情報・第三者画像は0件

公開画面で最新の候補数を確認し、コード変更で数が変わっていれば31を更新してください。

## Apple Designの説明

Apple Design Skillは、見た目の模倣ではなく次の設計判断として掲載してください。

- Agency: 自動確定を避け、Mask / Ignore / Reset / Undo / Redoを提供
- Direct manipulation: Pointer EventsとPointer CaptureによるMouse / Touch範囲選択
- Feedback: status / progress / completion / warning / errorを操作の近くへ表示
- Wayfinding: 6工程、Page rail、Review件数、Original / Maskedを常時把握
- Spatial consistency: 左Page、中央Viewer、右Reviewの対応関係
- Responsibility: Local-first、Blur注意、PDF構造検証の限界を明示
- Accessibility preferences: reduced motion / transparency / more contrast
- Responsive: Desktopの深い編集と狭い画面のViewer優先配置

WCAG準拠、全キーボード操作、Screen Reader対応済みとは、実機QAなしに書かないでください。

## 対応形式と制限

| 項目 | 掲載可能な事実 |
| --- | --- |
| 入力 | PNG / JPEG / PDFのみ |
| 画像出力 | 現在ページをPNG / JPEG |
| PDF出力 | 全ページを画像化したfresh PDF |
| 同時入力 | 1ファイル |
| ファイル上限 | 50MB |
| PDF上限 | 40ページ |
| Raster | 1ページ6,000,000px以下、PDF全ページ合計48,000,000px以下へscale調整 |
| 暗号化PDF | Password保護PDFは非対応 |
| State保存 | 文書・OCR・Maskを永続保存しない |

処理時間、最大解像度、同時利用者数、圧縮率、検出率、精度、復元不能性を実測なしに追加しないでください。

## 使用技術

`package.json`、lockfile、import、実行コードを確認し、実際に使っているものだけを記載します。

- Next.js 16.3 / App Router / static export
- React 19.2
- TypeScript 5.9
- PDF.js (`pdfjs-dist`)
- pdf-lib
- Tesseract.js
- `@tesseract.js-data/jpn` / `eng`
- Canvas 2D / ImageData
- Pointer Events / AbortSignal
- Lucide React
- Vitest / jsdom / Testing Library / jest-dom
- ESLint 9
- Vercel（production URLを確認後）

依存に存在するだけで作品コードに使っていない技術、外部AI、Serverless Function、Database、認証を追加しないでください。

## 必須スクリーンショット

最終公開版を同じDesktop viewportで撮影・確認した次の5枚だけを使います。

1. `01-document-viewer.png` — Document Viewer、3ページThumbnail、Privacy、Workflow
2. `02-mask-candidates.png` — pending候補、`マスクする` / `無視`、該当範囲
3. `03-manual-redaction.png` — 範囲選択、黒塗り / Blur、Undo / Redo
4. `04-before-after.png` — Original / Masked slider
5. `05-export.png` — PDF / PNG / JPEG、画像化・テキストレイヤー検証結果

Altは[docs/screenshots/README.md](screenshots/README.md)の候補を基に、実際に写っている内容だけを日本語で記述してください。元の縦横比を維持し、ポートフォリオcardと詳細画面の両方で欠けを確認します。

## 実装手順

1. 対象作品とポートフォリオ双方の指示ファイルを読む。
2. 対象作品で`npm run verify`を再実行する。
3. Vercel公開URLを外部ブラウザで開き、完全架空Demoで主要flowを完走する。
4. Network / Storage / Console、DownloadしたPNG / JPEG / PDFを確認する。
5. GitHub remote、公開repository、最新commitを確認する。
6. QA ReportとScreenshot台帳を実測結果へ更新する。
7. 5画像と専用SVGを既存ポートフォリオのasset規則どおりに配置する。
8. 既存作品データの型、slug、category、subcategory、link、tag、sort orderを確認する。
9. 作品entry、card、詳細情報を最小差分で追加する。
10. Desktop / Tablet / Mobileでcard、detail、gallery、external links、altを確認する。
11. ポートフォリオ側でもlint、typecheck、test、production buildを実行する。
12. 404、broken image、Console error、横スクロール、focus欠落、リンク切れがないことを確認する。
13. 実装済み機能、最新品質値、確認済みURL、画像、既知制約を最終報告する。

## 推奨タグ

既存ポートフォリオのtag数と表記規則に合わせ、必要最小限を選びます。

- Next.js
- React
- TypeScript
- PDF.js
- pdf-lib
- Tesseract.js
- OCR
- Canvas
- Local-first
- Human-in-the-loop
- Document Processing
- Privacy

## 掲載後の受入条件

- 作品名、カテゴリ、サブカテゴリが指定どおり
- 一覧cardと詳細pageからVercel production URLとGitHub公開repositoryへ到達
- 5枚のScreenshotが正しい順番、比率、altで表示
- 専用iconが小サイズでも判別可能
- Local-firstとHuman-in-the-loopが冒頭で伝わる
- Manual Redaction、Before / After、Multi-page、Search、Batch、Undo / Redoが実装済み機能として説明される
- PDFのfresh rasterized exportとtrade-offが正確
- Blurと構造検証の限界が省略されない
- 実在個人情報、仮URL、未確認数値、別作品assetがない
- Portfolio production buildと実ブラウザ表示が正常

以上をすべて満たした場合だけ、作品を「完成・公開済み」として掲載してください。

---

この文書は、2026-08-24時点の実装、ローカル自動検証、Vercel productionでの実ブラウザ検証、最終5画像を基に作成しています。掲載時にも公開URL、GitHub、最新commit、品質ゲートを実物で再確認し、未確認項目を推測で埋めないでください。
