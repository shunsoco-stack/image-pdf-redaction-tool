# 画像・PDF個人情報マスキングツール

> **Concept Project / 自主制作**
> 実在企業からの受託案件ではありません。デモ文書・氏名・連絡先・住所・IDはすべてコードで生成した明示的な架空データです。

画像やPDFに含まれる個人情報候補を検出し、人が1件ずつ確認してから黒塗りまたはBlurを適用する、ローカルファーストの文書処理ツールです。OCRやルール検出の結果を自動確定せず、最終判断を利用者に残します。

- 公開URL: https://image-pdf-redaction-tool.vercel.app
- GitHub: https://github.com/shunsoco-stack/image-pdf-redaction-tool

## 中心となるワークフロー

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

画面上でも `Detect → Review → Redact → Validate → Export` を一貫して示し、「検出できたこと」と「マスクを適用したこと」を分離しています。

## 主な機能

- PNG / JPEG / PDFの読み込み（対応済みと表現するのはこの3形式のみ）
- PDF.jsによる複数ページPDFの表示、ページ一覧、Thumbnail移動
- PDFテキスト抽出と、Tesseract.jsによるブラウザ内OCR（日本語＋英語）
- Email / Phone / Postal Code / Numeric IDのRegex・ラベルルール検出
- 氏名・住所のラベルベース候補検出
- 候補ごとの `[マスクする]` / `[無視]` と判断の取り消し
- 候補を選ぶと該当ページ・該当範囲へ移動するHuman Review
- Mouse / TouchのPointer Eventsによる手動範囲選択
- 黒塗り / Blurの選択
- 検索語、候補種別・状態、該当ページによる確認
- 表示中の未確認候補を1回の操作でまとめてマスク
- Undo / Redo（ボタン、`Ctrl/Cmd + Z`、`Shift + Ctrl/Cmd + Z`、`Ctrl/Cmd + Y`）
- Original / Masked切替と、ドラッグ・矢印キー対応のBefore / After比較
- PDF全ページの画像化再構成、ページ数・抽出可能テキストレイヤーの構造検証
- 現在ページのPNG / JPEG出力
- 進捗表示とキャンセル
- 完全架空の3ページDemo Mode

## Human-in-the-loop

OCRとパターン検出は、見落としを減らすための**候補提示**です。検出直後の状態はすべて`pending`で、マスクはまだ作成されません。

```text
候補を検出
  ├─ マスクする → 現在選択中の黒塗り / Blurを追加
  ├─ 無視       → マスクを追加しない
  └─ 判断を戻す → pendingへ戻す
```

誤認識や文脈判断が必要な情報を勝手に確定しません。未確認候補が残る間はExport画面で警告し、PDF / PNG / JPEGの書き出しを停止します。すべての候補を「マスクする」または「無視」と判断し、1件以上のマスクを作成してから出力できます。最終出力前には、候補以外の領域も含めてOriginal / Maskedを人が目視確認する運用を前提としています。

## OCRとPattern Detection

- 画像入力では読み込み後にOCRを実行します。OCRに失敗しても画像は保持し、手動範囲選択を続けられます。
- PDFでは最初にPDF内の抽出可能テキストを利用します。スキャンPDFなどには、現在ページまたは全ページのOCRを明示的に実行できます。
- OCRはTesseract.js、日本語・英語の学習データ、Worker、WASMを同一オリジンから読み込みます。
- Email、電話番号、郵便番号、ラベル付きIDは決定論的なルールで検出します。氏名・住所もラベルを根拠とする候補です。
- OCRとRegexは誤認・見落としを起こし得ます。候補数やconfidenceは完全性・正確性の保証ではありません。

## Manual Redaction

Viewerの「範囲選択」を有効にし、MouseまたはTouchでページ上をドラッグすると、正規化座標のマスクを追加します。Pointer Captureを使うため、ドラッグ中にポインターが範囲外へ出ても操作を追跡します。

- **黒塗り**: 出力Canvasへ不透明な黒画素として焼き込みます。
- **Blur**: 対象画素へImageDataベースのBox Blurを3回適用します。既定半径は12pxです。

Blurは視覚的な難読化であり、秘匿対象の輪郭や画素統計が残ります。文字やコードを推測できる可能性があるため、高機密情報には黒塗りを推奨します。

## PDF ExportとRedaction Safety

このツールは、元PDFに黒いRectangleを重ねただけの方式を「完全削除」と表現しません。

PDF書き出しでは次の処理を行います。

1. 各ページをCanvas上の画像として読み込む
2. 承認済み候補と手動マスクを画素へ焼き込む
3. 各ページをPNG化する
4. `PDFDocument.create()`で新しいPDFを作る
5. 新しい各ページへ画像だけを埋め込む
6. PDF.jsでページ数一致と抽出可能テキストレイヤー0件を確認する

元PDFのページオブジェクト、テキスト、注釈、フォーム、添付ファイル、メタデータは出力PDFへコピーしません。これにより、単純な上塗りより元テキストを取り出しにくい構造にします。

ただし、検証しているのは「想定ページ数」と「PDF.jsで抽出可能なテキストレイヤーがないこと」です。すべての解析手法に対する復元不能性や、候補の見落としがないことを保証するものではありません。機密文書は必ずBefore / Afterと出力ファイルを目視確認してください。

画像化には次のトレードオフがあります。

- テキスト選択・検索・コピーができなくなる
- Screen Reader向けテキスト、フォーム、リンク、注釈、添付、元メタデータを引き継がない
- 元PDFと比べて解像度、画質、ファイルサイズが変わり得る
- OCRを再実行すれば、Blurされた文字が読める可能性がある

## 対応形式

| 入力 | 読み込み | 出力 | 備考 |
| --- | --- | --- | --- |
| PNG | 対応 | 現在ページをPNG / JPEG | 読み込み時にブラウザ内OCR |
| JPEG / JPG | 対応 | 現在ページをPNG / JPEG | EXIF orientationをブラウザ能力に応じて反映してCanvas化 |
| PDF | 対応 | 画像化PDF、現在ページをPNG / JPEG | 最大40ページ、パスワード保護PDFは非対応 |

HEIC、WebP、TIFF、Office文書などは対応済み形式に含めません。拡張子や申告MIMEだけでなく、PNG / JPEG / PDFのファイルシグネチャを確認します。

## Local-first architecture

```text
File / Fictional Demo
  → signature・size検証
  → PDF.js render / Canvas decode
  → PDF text extraction / Tesseract.js OCR
  → deterministic candidate detection
  → Human Review / Manual Redaction
  → Canvas pixel composition
  → fresh image-only PDF or PNG / JPEG
  → local download
```

- ファイル本体、ページ画像、認識テキスト、マスク情報、出力はページを開いているブラウザ内で処理します。
- 文書を受け取るアプリ固有のAPI Route、Server Action、Database、クラウドストレージ、外部AI APIはありません。
- アプリコードには文書内容を送る`fetch` / XHR / WebSocket / Beacon処理を実装していません。
- PDF.jsとOCRのWorker・言語・WASM関連資産はbuild時に`public/`へコピーし、実行時は同一オリジンから取得します。
- ファイル本体やOCR結果を`localStorage` / IndexedDBへ保存しません。再読込やタブを閉じると作業状態は失われます。
- VercelはHTML・JavaScript・Worker等の静的アセットを配信するため、通常のHTTPアクセスとホスティング側のアクセスログは発生し得ます。これは利用者が選択した文書内容をアプリへアップロードすることとは区別しています。

画面の「ファイル・画像・認識テキストはブラウザ内で処理され、サーバーへ送信されません」という表示は、この実装境界に基づきます。

## Demo Mode

Canvasだけで毎回生成する3ページの架空文書を同梱しています。

1. 請求書
2. 申込書
3. 会員名簿

候補は31件で、初期状態はすべて`pending`です。氏名には「（架空）」、住所には「架空県」、メールには`.example.test`、電話には`000`、郵便番号には`〒000-0000`、IDには`DEMO`を使います。実在人物の個人情報や第三者画像は含みません。

## Apple Designの反映

装飾の模倣ではなく、操作の主導権と予測可能性を中心に反映しています。

- **Agency**: 候補を自動確定せず、マスク／無視／判断を戻す／Undo・Redoを用意
- **Direct manipulation**: Mouse / TouchのPointer Eventsで文書上を直接選択
- **Feedback**: 検出、処理中、完了、警告、エラーを画面内で明示
- **Wayfinding**: 6段階の工程、ページ一覧、未確認・マスク・無視の件数を常時表示
- **Materials & hierarchy**: Viewerを主役に、ページ・確認・出力を近接配置した半透明の業務UI
- **Accessibility preferences**: `prefers-reduced-motion`、`prefers-reduced-transparency`、`prefers-contrast`へ対応
- **Responsive**: Desktopの3カラムを、狭い画面ではViewer優先の縦配置と横スクロールThumbnailへ変更

## 制限値と既知の制約

- 1回に読み込めるファイルは1件です。
- ファイルサイズ上限は50MBです。
- PDFは40ページまでです。
- 画像・PDFは1ページ最大6,000,000pxへ調整します。PDFは全ページ合計48,000,000pxの予算も適用し、ページ数に応じてrender scaleを自動調整します。
- 実際の処理速度とメモリ上限は、ページ数、解像度、PDF構造、OCR量、端末・ブラウザに依存します。
- パスワード保護PDFの復号には対応しません。
- OCRは手書き、低解像度、傾き、複雑な表、特殊字体で精度が低下します。
- 一括適用は「現在の検索・状態フィルターで表示中の未確認候補」が対象です。
- 検索対象は抽出済みのPDFテキストまたはOCRテキストです。画像内の文字はOCR前には検索できません。
- 共同編集、クラウド保存、アカウント同期、監査証跡、電子署名は対象外です。

## Setup

前提: Node.js 24.x。

```bash
npm install
npm run dev
```

`dev` / `build`の前に、インストール済みパッケージからPDF.jsとTesseract.jsのブラウザ資産を`public/`へコピーします。実行時の秘密鍵、外部API、Databaseは不要です。

## Quality commands

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run verify
```

2026-08-24の最終検証では、`npm run verify`が成功しました。Vitestは5ファイル・31テストです。詳細と未実施項目は[docs/QA_REPORT.md](docs/QA_REPORT.md)を参照してください。

## Vercel

Next.js 16.3のstatic exportを使用し、`out/`をVercelへ配信します。

```bash
npm run verify
vercel --prod
```

`vercel.json`は`npm run build`と`out`を指定しています。Productionは https://image-pdf-redaction-tool.vercel.app で公開しています。

## Screenshots

ポートフォリオ用の必須5画面です。Vercel production版を同じ1425 × 990pxのDesktop viewportで撮影し、同梱の完全架空デモ以外のデータを使っていません。

1. [Document Viewer](docs/screenshots/01-document-viewer.png)
2. [Mask候補](docs/screenshots/02-mask-candidates.png)
3. [Manual Redaction](docs/screenshots/03-manual-redaction.png)
4. [Before / After](docs/screenshots/04-before-after.png)
5. [Export](docs/screenshots/05-export.png)

撮影状態、ファイル名、alt文、ファイルサイズは[docs/screenshots/README.md](docs/screenshots/README.md)に記録しています。

## ポートフォリオ分類

- 作品名: 画像・PDF個人情報マスキングツール
- カテゴリ: **業務効率化ツール**
- サブカテゴリ: **個人情報保護・文書処理**
- 制作区分: Concept Project / 自主制作
- 専用アイコン: Document / Image + Shield / Mask
- 掲載用プロンプト: [docs/PORTFOLIO_COMPLETE_PROMPT.md](docs/PORTFOLIO_COMPLETE_PROMPT.md)

## 使用技術

- Next.js 16.3 / React 19.2 / TypeScript 5.9
- PDF.js (`pdfjs-dist`) / pdf-lib
- Tesseract.js + 日本語・英語学習データ
- Canvas 2D / ImageData / Pointer Events / AbortSignal
- Lucide React
- Vitest / jsdom / Testing Library / ESLint 9
- Vercel static hosting

## License

ポートフォリオ作品として制作しており、リポジトリ全体へ適用するオープンソースライセンスは現時点で設定していません。第三者ライブラリと同梱ブラウザ資産は、それぞれのライセンスに従います。
