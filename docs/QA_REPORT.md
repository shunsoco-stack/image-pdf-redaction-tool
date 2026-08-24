# QA Report

> 最終更新: 2026-08-24
>
> 対象: `image-pdf-redaction-tool` production release
>
> 公開URL: https://image-pdf-redaction-tool.vercel.app
>
> GitHub: https://github.com/shunsoco-stack/image-pdf-redaction-tool

## 結論

- **自動品質ゲート: 合格**。`npm run verify`でLint、TypeScript、5ファイル・31テスト、production static buildが連続成功しました。
- **Production主要フロー: 合格**。Detect → Review → Redact → Validate → Export、手動黒塗り・Blur、31候補一括適用、Undo、Before / After、本番OCR、PNG / JPEG生成、画像化PDF生成をChromiumで完走しました。
- **Vercel公開: 合格**。deployment `dpl_HkGn3MeePoGYAPzGQ77pcwUjwig4`はREADYで、固定URLを認証なしで表示できます。
- **最終画像: 合格**。必須5枚はproduction版・完全架空Demo・1425 × 990pxで撮影し、個別に目視確認しました。
- Critical / Highの既知不具合は最終検証範囲では確認されていません。ただし、Safari / Firefox / Android実機、40ページ・50MB境界、第三者によるセキュリティ評価を含む意味ではありません。

判定語は次の意味で使います。

| 判定 | 意味 |
| --- | --- |
| 合格（自動） | 2026-08-24のコマンド結果またはVitestで確認 |
| 合格（実ブラウザ） | Vercel productionをChromium自動操作し、画面状態・Console・生成結果を確認 |
| 実装確認 | 到達可能なUIとコード経路を静的に確認。実ブラウザ完走の代わりではない |
| 未実施 | 実機、公開環境、外部ブラウザ、実出力等の追加確認が必要 |

## 自動検証

2026-08-24に次を実行しました。

```bash
npm run verify
```

| 項目 | 結果 | 証跡 |
| --- | --- | --- |
| ESLint | 合格 | `eslint .`終了コード0 |
| TypeScript | 合格 | `next typegen`成功、`tsc --noEmit`終了コード0 |
| Unit / Integration | 合格 | Vitest: **5 files / 31 tests** |
| Production build | 合格 | Next.js 16.3.2 / Turbopack、static pages生成成功 |
| Static routes | 合格 | `/`、`/_not-found`、`/icon.svg`、`/manifest.webmanifest` |
| 一括検証 | 合格 | lint → typecheck → test → buildを連続実行して終了コード0 |

自動テストの主な対象は、対応ファイルシグネチャ、座標正規化、回転PDFテキストの4隅AABB、Regex・ラベル検出、架空デモ、履歴、Canvas合成、ImageData Blur、画像出力フォールバック、新規画像化PDF、PDF構造検証です。

自動テストは、実ブラウザでのPointer操作、OCRエンジンの実認識精度、実PDFのダウンロード、Vercel通信、スクリーンリーダー、クロスブラウザを証明しません。

## 機能確認

| ID | 要件 | 状態 | 確認内容 / 境界 |
| --- | --- | --- | --- |
| F-01 | PNG / JPEG / PDF入力 | 合格（自動）＋実装確認 | Signatureを検証し、誤った申告MIMEを信用しない。ほかの形式は非対応 |
| F-02 | Upload / Drag & Drop | 合格（実ブラウザ）＋実装確認 | File picker経路で実PDFを読込。Dropも同じ処理関数へ渡す |
| F-03 | Multi-page PDF | 実装確認 | PDF.jsで全ページをrenderし、Thumbnailと前後移動を表示。上限40ページ |
| F-04 | OCR | 合格（実ブラウザ）＋実装確認 | Productionで架空Demo 1ページをOCRし28候補を生成。Tesseract.js `jpn+eng`、現在ページ／全ページ、進捗・キャンセル |
| F-05 | Pattern Detection | 合格（自動） | Email、Phone、Postal Code、Numeric IDをRegex / labelで候補化。氏名・住所はlabel候補 |
| F-06 | Human Review | 合格（自動）＋実装確認 | 候補は`pending`。`マスクする` / `無視` / `判断を戻す`。検出だけではRedactionを作らない |
| F-07 | Manual Redaction | 合格（実ブラウザ）＋実装確認 | ProductionでMouse範囲選択による黒塗り1件・Blur 1件を確認。Pointer Events + Pointer CaptureでTouchも同経路 |
| F-08 | Batch | 合格（実ブラウザ） | 31件を1コミットでまとめてマスクし、ローカル実ブラウザで1回のUndoを確認 |
| F-09 | Undo / Redo | 合格（自動）＋実装確認 | 100状態上限、分岐後Redo消去、ボタンとKeyboard shortcut |
| F-10 | Search | 実装確認 | OCR / PDF Textを検索し、該当ページChipと候補絞り込みを表示 |
| F-11 | Original / Masked | 合格（実ブラウザ） | 表示切替とBefore / After sliderをproductionで確認。Pointerと左右矢印に対応 |
| F-12 | PNG / JPEG Export | 合格（自動＋実ブラウザ） | Productionで現在ページのPNG / JPEG生成完了通知を確認。JPEG quality 0.92 |
| F-13 | Masked PDF Export | 合格（自動＋実ブラウザ） | Productionで3ページをPNG化し、新しいPDF Blob（387,036 bytes）へ画像だけを埋め込み |
| F-14 | PDF Validate | 合格（自動＋実ブラウザ） | Production出力で3ページ一致・PDF.js抽出テキスト0件を確認。復元不能性の保証とは表示しない |
| F-15 | Demo Mode | 合格（自動） | Canvas生成の請求書・申込書・会員名簿。31候補はすべてpending |
| F-16 | Privacy UI | 実装確認 | ヘッダーとStripにブラウザ内処理を表示。実装境界は下記Privacy確認参照 |

## Human-in-the-loop確認

候補検出とRedactionは型・状態とも分離されています。

- `MaskCandidate.status`: `pending | accepted | ignored`
- `Redaction.source`: `manual | candidate`
- 候補検出関数は`MaskCandidate[]`だけを返し、Redactionを作りません。
- 利用者が「マスクする」を選ぶと、該当候補に紐づくRedactionを初めて追加します。
- 「無視」はマスクを追加しません。
- OCRの再実行時は対象ページのOCR候補だけを置き換え、PDFテキスト候補・既存マスク・手動マスクを保持します。置換操作自体もUndoできます。
- 未確認候補が残る場合、またはマスクが0件の場合は警告し、PDF / PNG / JPEG出力を停止します。

## Redaction Safety確認

### 黒塗り

- 対象ページの新しいCanvasへ原本を描画した後、正規化範囲を外向きに丸めて不透明な黒画素を描画します。
- Blurと黒塗りが重なる場合、黒塗りを最後に描画し、重複部を不透明に保つテストがあります。
- 画像出力はCanvasの新しいPNG / JPEGであり、元ファイルを上書きしません。

### Blur

- CSS filterではなく、対象のImageDataへ既定半径12px・3 passのBox Blurを適用します。
- Blurは画素を残す視覚的秘匿です。高機密情報に対する不可逆な削除とは扱いません。
- Blur後の文字やコードが人・OCR・画像処理で推測される可能性があります。高機密用途は黒塗りを選び、出力を再確認する必要があります。

### PDF

- `PDFDocument.create()`で新規PDFを作り、各ページへマスク済みPNGのみを埋め込みます。
- 元PDFのページ、テキスト、フォーム、注釈、添付、メタデータはコピーしません。
- 出力後にページ数一致と、PDF.jsで抽出可能なテキストアイテム0件を確認します。
- この構造検証は、全解析手法に対する復元不能性、マスク範囲の完全性、OCR候補の完全性を保証しません。「完全削除」と表現しないUI・READMEになっています。
- 画像化により、テキスト検索・選択、アクセシビリティ、フォーム、リンク、注釈、添付、元メタデータが失われ、解像度と容量が変わり得ます。

## Privacy確認

### コード上で確認できたこと

- Next.js static exportで、文書受信用のAPI Route / Server Actionを実装していません。
- 文書データを送る`fetch`、XHR、WebSocket、Beacon、form submit処理はソース内にありません。
- Database、認証、外部AI / OCR API、クラウドストレージを使用しません。
- PDF.js Worker、CMap、標準フォント、WASM、ICC、Tesseract Worker / Core / `jpn`・`eng`言語資産はbuild時に`public/`へコピーします。
- ファイル、ページ画像、OCR Text、マスク、出力をアプリから`localStorage` / IndexedDBへ保存する処理はありません。
- DemoはCanvasだけで生成し、外部画像や実個人情報を参照しません。

### 表現上の境界

- 「ファイルはブラウザ内で処理されます」は、文書内容をアプリ固有のサーバーへ送信しない現在の実装を指します。
- Vercelは静的ファイルを配信するため、通常のページ・assetリクエストとホスティング側アクセスログは発生し得ます。
- Production NetworkではVercel同一オリジンの静的assetと`data:`画像だけを確認し、文書内容を外部送信するrequestは確認されませんでした。Local Storage / Session Storageはいずれも空でした。

## Limits / Error handling

| 項目 | 実装値 / 状態 |
| --- | --- |
| 同時入力 | 1ファイル |
| ファイルサイズ | 50MB以下 |
| PDFページ数 | 40ページ以下 |
| Raster予算 | 1ページ最大6,000,000px、PDF全ページ合計48,000,000pxへscale調整 |
| 暗号化PDF | パスワード保護PDFは非対応として案内 |
| 壊れた入力 | `corrupt`として案内 |
| 非対応形式 | PNG / JPEG / PDFだけを案内 |
| OCR失敗 | 画像は表示し、手動範囲選択を継続可能 |
| キャンセル | File処理 / OCRでAbortControllerを利用し、OCR Workerを終了 |

50MB・40ページは、すべての端末で快適に処理できる保証値ではありません。負荷はページ寸法、画像量、OCR量、ブラウザ、利用可能メモリに依存します。

## Accessibility / Responsive

| 項目 | 状態 | 備考 |
| --- | --- | --- |
| Semantic labels / ARIA | 実装確認 | nav、aside、viewer、status、dialog、slider、group、button label |
| axe-core WCAG A / AA | 合格（実ブラウザ） | violations 0。Gradient背景により自動判定不能のcontrast 1項目は目視対象 |
| Visible focus | 実装確認 | `:focus-visible`を確認 |
| Keyboard | 部分実装確認 | Undo / Redo、Before / After左右矢印。全導線のTab走査は未実施 |
| Pointer / Touch | 実装確認 | Manual Redactionと比較sliderでPointer Events / Capture |
| Reduced motion | 実装確認 | animation / transitionを短縮 |
| Reduced transparency | 実装確認 | backdrop blurを停止し不透明背景へ変更 |
| More contrast | 実装確認 | Border / color変数を強化 |
| Responsive | 合格（実ブラウザ）＋実装確認 | 390 × 844で横overflowなし。1180 / 960 / 680px付近で3カラムから縦配置へ変更 |
| Screen Reader | 未実施 | VoiceOver / NVDA等の手動確認が必要 |
| Browser zoom 200% | 未実施 | レイアウト・操作の手動確認が必要 |
| Mobile実機 | 未実施 | Touch描画、Download、OCRを含む確認が必要 |

WCAG適合を宣言していません。

## 実ブラウザ受入チェック

公開前後に、**完全架空データだけ**で次を実施してください。

- [x] Vercel production URLが認証なしでHTTP 200
- [x] 初期表示で3ページの架空Demoが表示される
- [x] Demoの31候補がすべて未確認で始まる
- [ ] 候補1件を「マスクする」、別候補を「無視」にできる
- [x] 表示中候補をまとめてマスクし、1回のUndoで戻せる
- [x] Mouseで黒塗り範囲とBlur範囲を追加できる
- [ ] Touch実機で黒塗り範囲とBlur範囲を追加できる
- [ ] OCR Text検索から該当ページへ移動できる
- [x] Original / MaskedとBefore / After sliderを確認できる
- [ ] 架空PNGとJPEGを読み込み、OCR失敗時も手動処理できる
- [ ] 架空の複数ページPDFを読み込み、Thumbnail移動できる
- [x] ProductionでPNG / JPEGの生成完了を確認
- [x] 画像化PDF Blobを生成し、ページ数一致・抽出テキスト0件の表示を確認
- [ ] 出力PDFを別Viewerで開き、見た目とページ数を確認
- [x] Export前の未確認候補警告と出力button停止を確認
- [ ] 処理キャンセル後に再操作できる
- [x] Console / Page Errorがないことを記録
- [x] Networkで同一オリジン静的assetと`data:`以外の文書requestがないことを確認
- [x] Local / Session Storageが空であることを確認
- [x] 1425 × 990のDesktop viewportで必須スクリーンショット5枚を撮影
- [x] 390 × 844で横スクロールがないことを確認
- [ ] 390 × 844前後のTouch実機操作を確認

## クロスブラウザ / 負荷

| 環境・シナリオ | 状態 | 追加確認事項 |
| --- | --- | --- |
| Chromium on Windows | 合格（実ブラウザ） | OCR、PDF Worker、Mouse Pointer、Blob生成、Consoleを確認 |
| Edge on Windows | 未実施 | OCR、PDF Worker、Pointer、Download、Console |
| Safari on macOS | 未実施 | ImageData Blur、Worker、PDF Download、Pointer |
| Safari on iOS | 未実施 | Touch drawing、memory、Download、responsive |
| Android Chrome | 未実施 | Touch drawing、OCR、memory |
| 40ページPDF | 未実施 | OCR前後の時間・memory・cancel |
| 50MB境界 | 未実施 | 50MB以下／超のerror表示、端末memory |
| 連続3回の読み込み・出力 | 未実施 | Heap増加、Worker終了、操作継続 |
| 低解像度・傾き・表形式OCR | 未実施 | 候補精度と手動fallback |

## スクリーンショット判定

必須5枚は[docs/screenshots/README.md](screenshots/README.md)の台帳に従います。

| # | 画面 | 状態 |
| --- | --- | --- |
| 1 | Document Viewer | 撮影・目視確認済み（1425 × 990） |
| 2 | Mask候補 | 撮影・目視確認済み（1425 × 990） |
| 3 | Manual Redaction | 撮影・目視確認済み（1425 × 990） |
| 4 | Before / After | 撮影・目視確認済み（1425 × 990） |
| 5 | Export | 撮影・目視確認済み（1425 × 990） |

## 公開ゲート

現在の判定: **Vercel production・主要E2E・最終5画像まで合格。GitHub公開確認待ち**

GitHub公開とremote確認後に「完成・公開済み」へ更新します。

1. Vercel production URLを外部ブラウザで確認
2. 公開URLでHuman Review → Manual Redaction → Compare → PDF / Image Exportを完走
3. 出力PDFの構造検証結果と別Viewer表示を確認
4. 公開版Network / Storage / Consoleを確認
5. 最終公開版の必須スクリーンショット5枚を撮影・目視確認
6. GitHub remoteと公開repositoryの最新commitを確認
7. README、QA、掲載プロンプトへ実URLを反映

未実施項目を推測で「合格」へ変更しないでください。
