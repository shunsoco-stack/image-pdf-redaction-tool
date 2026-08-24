import type {
  DetectionToken,
  MaskCandidate,
  NormalizedRect,
  SensitiveDataKind,
} from "./types";

const PAGE_WIDTH = 1200;
const PAGE_HEIGHT = 1600;
const FONT_STACK = '"Hiragino Sans", "Yu Gothic UI", "Yu Gothic", Meiryo, system-ui, sans-serif';

export type DemoPageKind = "invoice" | "application" | "member-roster";

export type DemoCandidateKind = SensitiveDataKind;

export interface DemoNormalizedBox extends NormalizedRect {
  /** Left edge as a fraction of the page width. */
  x: number;
  /** Top edge as a fraction of the page height. */
  y: number;
  /** Width as a fraction of the page width. */
  width: number;
  /** Height as a fraction of the page height. */
  height: number;
}

export interface DemoOCRToken extends DetectionToken {
  id: string;
  pageId: string;
  /** Alias retained for consumers that render normalized overlay boxes. */
  box: DemoNormalizedBox;
  candidateId?: string;
}

export interface DemoMaskCandidate extends MaskCandidate {
  pageId: string;
  label: string;
  /** Convenience alias of the candidate's single rect. */
  box: DemoNormalizedBox;
  status: "pending";
  rects: [DemoNormalizedBox];
  fixtureSource: "demo-fixture";
}

export interface DemoDocumentPage {
  id: string;
  pageNumber: number;
  title: string;
  kind: DemoPageKind;
  fileName: string;
  mimeType: "image/png";
  width: number;
  height: number;
  dataUrl: string;
  searchText: string;
  searchTokens: string[];
  ocrTokens: DemoOCRToken[];
  candidates: DemoMaskCandidate[];
}

export interface DemoDocument {
  id: "fictional-redaction-demo";
  name: string;
  description: string;
  disclaimer: string;
  totalCandidates: number;
  searchText: string;
  pages: DemoDocumentPage[];
}

export type DemoCanvasFactory = () => HTMLCanvasElement;

interface CandidateOptions {
  kind: DemoCandidateKind;
  label: string;
  method: "regex" | "label";
  confidence: number;
}

interface TextOptions {
  fontSize?: number;
  fontWeight?: 400 | 500 | 600 | 700 | 800;
  color?: string;
  align?: CanvasTextAlign;
  maxWidth?: number;
  candidate?: CandidateOptions;
}

interface PageDescriptor {
  id: string;
  pageNumber: number;
  title: string;
  kind: DemoPageKind;
  fileName: string;
  accent: string;
  eyebrow: string;
}

interface FictionalMember {
  id: string;
  name: string;
  email: string;
  phone: string;
  postalCode: string;
  address: string;
  plan: string;
}

const CANDIDATE = {
  name: { kind: "name", label: "氏名・名称", method: "label", confidence: 94 },
  email: { kind: "email", label: "メールアドレス", method: "regex", confidence: 99 },
  phone: { kind: "phone", label: "電話番号", method: "regex", confidence: 98 },
  postalCode: { kind: "postal-code", label: "郵便番号", method: "regex", confidence: 98 },
  address: { kind: "address", label: "住所", method: "label", confidence: 91 },
  numericId: { kind: "numeric-id", label: "ID番号", method: "label", confidence: 96 },
} as const satisfies Record<string, CandidateOptions>;

const FICTIONAL_MEMBERS: readonly FictionalMember[] = [
  {
    id: "MEM-DEMO-0001",
    name: "架空野 デモ子（架空）",
    email: "demo01@roster.example.test",
    phone: "000-1000-0001",
    postalCode: "〒000-0000",
    address: "架空県サンプル市デモ町0-0-1",
    plan: "デモ・スタンダード",
  },
  {
    id: "MEM-DEMO-0002",
    name: "サンプル島 例示郎（架空）",
    email: "demo02@roster.example.test",
    phone: "000-1000-0002",
    postalCode: "〒000-0000",
    address: "架空県サンプル市テスト通り0-0-2",
    plan: "デモ・ビジネス",
  },
  {
    id: "MEM-DEMO-0003",
    name: "モック森 テスト美（架空）",
    email: "demo03@roster.example.test",
    phone: "000-1000-0003",
    postalCode: "〒000-0000",
    address: "架空県サンプル市フィクション台0-0-3",
    plan: "デモ・スタンダード",
  },
];

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizedBox(
  x: number,
  y: number,
  width: number,
  height: number,
): DemoNormalizedBox {
  const left = clamp(x / PAGE_WIDTH, 0, 1);
  const top = clamp(y / PAGE_HEIGHT, 0, 1);
  return {
    x: left,
    y: top,
    width: clamp(width / PAGE_WIDTH, 0, 1 - left),
    height: clamp(height / PAGE_HEIGHT, 0, 1 - top),
  };
}

function roundRectPath(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
}

function fillRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  color: string,
) {
  context.save();
  roundRectPath(context, x, y, width, height, radius);
  context.fillStyle = color;
  context.fill();
  context.restore();
}

function strokeRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  color: string,
) {
  context.save();
  roundRectPath(context, x, y, width, height, radius);
  context.strokeStyle = color;
  context.lineWidth = 2;
  context.stroke();
  context.restore();
}

function horizontalRule(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  color = "#dbe2ea",
) {
  context.save();
  context.strokeStyle = color;
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(x, y);
  context.lineTo(x + width, y);
  context.stroke();
  context.restore();
}

function createSearchTokens(tokens: readonly DemoOCRToken[]) {
  const searchTokens = new Set<string>();
  tokens.forEach(({ text }) => {
    const normalized = text.normalize("NFKC").trim().toLocaleLowerCase("ja-JP");
    if (!normalized) return;
    searchTokens.add(normalized);
    normalized
      .split(/[\s　,、:：/|()（）・]+/u)
      .map((part) => part.trim())
      .filter((part) => part.length >= 2)
      .forEach((part) => searchTokens.add(part));
  });
  return [...searchTokens];
}

class DemoPagePainter {
  readonly ocrTokens: DemoOCRToken[] = [];
  readonly candidates: DemoMaskCandidate[] = [];

  constructor(
    private readonly context: CanvasRenderingContext2D,
    private readonly pageId: string,
    private readonly pageIndex: number,
  ) {}

  text(text: string, x: number, y: number, options: TextOptions = {}) {
    const fontSize = options.fontSize ?? 24;
    const fontWeight = options.fontWeight ?? 500;
    const align = options.align ?? "left";
    const maxWidth = options.maxWidth;
    const context = this.context;

    context.save();
    context.font = `${fontWeight} ${fontSize}px ${FONT_STACK}`;
    context.fillStyle = options.color ?? "#1f2937";
    context.textAlign = align;
    context.textBaseline = "top";
    const measuredWidth = context.measureText(text).width;
    const renderedWidth = Math.max(1, Math.min(measuredWidth, maxWidth ?? measuredWidth));
    if (maxWidth === undefined) context.fillText(text, x, y);
    else context.fillText(text, x, y, maxWidth);
    context.restore();

    const left = align === "center" ? x - renderedWidth / 2 : align === "right" || align === "end" ? x - renderedWidth : x;
    const paddingX = 5;
    const paddingY = 4;
    const box = normalizedBox(
      left - paddingX,
      y - paddingY,
      renderedWidth + paddingX * 2,
      fontSize * 1.28 + paddingY * 2,
    );
    const candidateId = options.candidate
      ? `${this.pageId}-candidate-${String(this.candidates.length + 1).padStart(2, "0")}`
      : undefined;
    const token: DemoOCRToken = {
      id: `${this.pageId}-token-${String(this.ocrTokens.length + 1).padStart(3, "0")}`,
      pageId: this.pageId,
      text,
      box,
      rect: box,
      confidence: options.candidate?.confidence ?? 100,
      ...(candidateId ? { candidateId } : {}),
    };
    this.ocrTokens.push(token);

    if (options.candidate && candidateId) {
      this.candidates.push({
        id: candidateId,
        pageId: this.pageId,
        pageIndex: this.pageIndex,
        kind: options.candidate.kind,
        label: options.candidate.label,
        text,
        box,
        rects: [box],
        status: "pending",
        source: "ocr",
        method: options.candidate.method,
        confidence: options.candidate.confidence,
        fixtureSource: "demo-fixture",
      });
    }
    return box;
  }
}

function paintFoundation(
  context: CanvasRenderingContext2D,
  painter: DemoPagePainter,
  descriptor: PageDescriptor,
) {
  context.fillStyle = "#edf2f7";
  context.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
  context.fillStyle = "#ffffff";
  context.fillRect(34, 28, PAGE_WIDTH - 68, PAGE_HEIGHT - 56);
  context.fillStyle = descriptor.accent;
  context.fillRect(34, 28, PAGE_WIDTH - 68, 232);

  fillRoundedRect(context, 78, 72, 116, 42, 21, "rgba(255,255,255,0.2)");
  painter.text("DEMO", 136, 81, { fontSize: 18, fontWeight: 800, color: "#ffffff", align: "center" });
  painter.text(descriptor.eyebrow, 78, 138, { fontSize: 18, fontWeight: 700, color: "rgba(255,255,255,0.78)" });
  painter.text(descriptor.title, 78, 174, { fontSize: 42, fontWeight: 800, color: "#ffffff", maxWidth: 850 });
  painter.text(`PAGE ${descriptor.pageNumber} / 3`, 1122, 82, { fontSize: 17, fontWeight: 700, color: "#ffffff", align: "right" });

  context.save();
  context.translate(PAGE_WIDTH / 2, PAGE_HEIGHT / 2 + 50);
  context.rotate(-Math.PI / 5.8);
  context.globalAlpha = 0.035;
  context.font = `800 112px ${FONT_STACK}`;
  context.fillStyle = descriptor.accent;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("FICTIONAL DATA", 0, 0);
  context.restore();

  horizontalRule(context, 78, 1484, 1044);
  painter.text("DEMO ONLY — 全情報は架空です。実在の個人・団体とは関係ありません。", 78, 1510, {
    fontSize: 17,
    fontWeight: 600,
    color: "#64748b",
    maxWidth: 920,
  });
}

function paintInvoice(context: CanvasRenderingContext2D, painter: DemoPagePainter) {
  painter.text("請求先（すべて架空）", 78, 312, { fontSize: 18, fontWeight: 800, color: "#64748b" });
  painter.text("株式会社フィクションラボ（架空）", 78, 356, {
    fontSize: 29,
    fontWeight: 800,
    maxWidth: 560,
    candidate: CANDIDATE.name,
  });
  painter.text("〒000-0000", 78, 414, { fontSize: 21, candidate: CANDIDATE.postalCode });
  painter.text("架空県サンプル市デモ町0-0-0", 78, 454, {
    fontSize: 21,
    maxWidth: 540,
    candidate: CANDIDATE.address,
  });
  painter.text("000-0000-0000", 78, 494, { fontSize: 21, candidate: CANDIDATE.phone });
  painter.text("billing@invoice.example.test", 78, 534, {
    fontSize: 21,
    maxWidth: 520,
    candidate: CANDIDATE.email,
  });

  fillRoundedRect(context, 702, 304, 420, 274, 18, "#f3f6ff");
  painter.text("INVOICE DETAILS", 734, 334, { fontSize: 16, fontWeight: 800, color: "#4f67b8" });
  painter.text("請求書ID", 734, 384, { fontSize: 17, fontWeight: 700, color: "#64748b" });
  painter.text("DEMO-INV-000042", 1090, 381, {
    fontSize: 20,
    fontWeight: 800,
    align: "right",
    candidate: CANDIDATE.numericId,
  });
  painter.text("発行日", 734, 434, { fontSize: 17, fontWeight: 700, color: "#64748b" });
  painter.text("2099-01-01", 1090, 431, { fontSize: 20, fontWeight: 700, align: "right" });
  painter.text("支払期限", 734, 484, { fontSize: 17, fontWeight: 700, color: "#64748b" });
  painter.text("2099-01-31", 1090, 481, { fontSize: 20, fontWeight: 700, align: "right" });
  painter.text("通貨", 734, 534, { fontSize: 17, fontWeight: 700, color: "#64748b" });
  painter.text("DEMO JPY", 1090, 531, { fontSize: 20, fontWeight: 700, align: "right" });

  fillRoundedRect(context, 78, 650, 1044, 54, 10, "#203f99");
  painter.text("項目", 104, 665, { fontSize: 17, fontWeight: 800, color: "#ffffff" });
  painter.text("数量", 718, 665, { fontSize: 17, fontWeight: 800, color: "#ffffff", align: "right" });
  painter.text("単価", 900, 665, { fontSize: 17, fontWeight: 800, color: "#ffffff", align: "right" });
  painter.text("金額", 1094, 665, { fontSize: 17, fontWeight: 800, color: "#ffffff", align: "right" });

  const rows = [
    ["文書ワークフロー設計（デモ）", "1", "120,000", "120,000"],
    ["候補レビュー画面設計（デモ）", "1", "80,000", "80,000"],
    ["マスキング検証支援（デモ）", "2", "35,000", "70,000"],
  ] as const;
  rows.forEach((row, index) => {
    const y = 734 + index * 92;
    if (index % 2 === 0) {
      context.fillStyle = "#f8fafc";
      context.fillRect(78, y - 16, 1044, 76);
    }
    painter.text(row[0], 104, y, { fontSize: 20, fontWeight: 600, maxWidth: 540 });
    painter.text(row[1], 718, y, { fontSize: 20, align: "right" });
    painter.text(row[2], 900, y, { fontSize: 20, align: "right" });
    painter.text(row[3], 1094, y, { fontSize: 20, fontWeight: 700, align: "right" });
  });

  horizontalRule(context, 674, 1060, 448, "#cbd5e1");
  painter.text("小計", 716, 1091, { fontSize: 19, fontWeight: 600, color: "#64748b" });
  painter.text("270,000", 1094, 1091, { fontSize: 22, fontWeight: 700, align: "right" });
  painter.text("デモ税額", 716, 1141, { fontSize: 19, fontWeight: 600, color: "#64748b" });
  painter.text("27,000", 1094, 1141, { fontSize: 22, fontWeight: 700, align: "right" });
  fillRoundedRect(context, 674, 1200, 448, 96, 14, "#eaf0ff");
  painter.text("DEMO TOTAL", 708, 1227, { fontSize: 18, fontWeight: 800, color: "#4f67b8" });
  painter.text("297,000", 1090, 1218, { fontSize: 34, fontWeight: 800, color: "#203f99", align: "right" });

  painter.text("照合用デモID（無効）", 78, 1328, { fontSize: 17, fontWeight: 700, color: "#64748b" });
  painter.text("DEMO-ID-00000042", 78, 1368, {
    fontSize: 23,
    fontWeight: 800,
    candidate: CANDIDATE.numericId,
  });
}

function paintApplication(context: CanvasRenderingContext2D, painter: DemoPagePainter) {
  painter.text("申込内容（デモ専用）", 78, 310, { fontSize: 18, fontWeight: 800, color: "#64748b" });
  painter.text("業務改善ツール・架空トライアル申込", 78, 352, { fontSize: 31, fontWeight: 800, maxWidth: 850 });
  fillRoundedRect(context, 78, 414, 1044, 76, 14, "#f5f1ff");
  painter.text("この申込書はポートフォリオ用に生成された架空データです。送信・契約には利用できません。", 106, 438, {
    fontSize: 19,
    fontWeight: 600,
    color: "#6846a5",
    maxWidth: 980,
  });

  const field = (
    label: string,
    value: string,
    x: number,
    y: number,
    width: number,
    candidate?: CandidateOptions,
  ) => {
    painter.text(label, x, y, { fontSize: 16, fontWeight: 800, color: "#64748b" });
    fillRoundedRect(context, x, y + 34, width, 70, 12, "#fafafa");
    strokeRoundedRect(context, x, y + 34, width, 70, 12, "#d8dee8");
    painter.text(value, x + 20, y + 54, {
      fontSize: 22,
      fontWeight: 600,
      maxWidth: width - 40,
      ...(candidate ? { candidate } : {}),
    });
  };

  field("申込ID", "APP-DEMO-0007", 78, 544, 498, CANDIDATE.numericId);
  field("申込区分", "架空トライアル", 624, 544, 498);
  field("氏名（架空）", "デモ野 サンプル（架空）", 78, 684, 498, CANDIDATE.name);
  field("メールアドレス", "applicant@form.example.test", 624, 684, 498, CANDIDATE.email);
  field("電話番号（発信不可）", "000-0000-0101", 78, 824, 498, CANDIDATE.phone);
  field("郵便番号（無効）", "〒000-0000", 624, 824, 498, CANDIDATE.postalCode);
  field("住所（架空）", "架空県サンプル市フォーム町0-0-0", 78, 964, 1044, CANDIDATE.address);
  field("希望プラン", "デモ・業務効率化プラン", 78, 1104, 498);
  field("利用人数", "5名（架空）", 624, 1104, 498);

  painter.text("申込メモ", 78, 1244, { fontSize: 16, fontWeight: 800, color: "#64748b" });
  fillRoundedRect(context, 78, 1278, 1044, 136, 12, "#fafafa");
  strokeRoundedRect(context, 78, 1278, 1044, 136, 12, "#d8dee8");
  painter.text("Detect → Review → Redact → Validate → Export のデモ確認に使用します。", 100, 1304, {
    fontSize: 20,
    fontWeight: 600,
    maxWidth: 980,
  });
  painter.text("本申込は無効です。すべての入力内容は架空です。", 100, 1352, {
    fontSize: 18,
    color: "#64748b",
    maxWidth: 980,
  });
}

function paintMemberRoster(context: CanvasRenderingContext2D, painter: DemoPagePainter) {
  painter.text("架空会員名簿", 78, 310, { fontSize: 31, fontWeight: 800 });
  painter.text("3名 / 全件デモデータ / 連絡先はすべて無効", 78, 358, {
    fontSize: 18,
    fontWeight: 600,
    color: "#64748b",
  });

  FICTIONAL_MEMBERS.forEach((member, index) => {
    const top = 420 + index * 320;
    fillRoundedRect(context, 78, top, 1044, 282, 18, index % 2 === 0 ? "#f2faf8" : "#f8fafc");
    strokeRoundedRect(context, 78, top, 1044, 282, 18, "#d6e2df");
    fillRoundedRect(context, 100, top + 24, 132, 34, 17, "#d9f2ec");
    painter.text(`MEMBER ${String(index + 1).padStart(2, "0")}`, 166, top + 31, {
      fontSize: 14,
      fontWeight: 800,
      color: "#16796f",
      align: "center",
    });
    painter.text(member.id, 264, top + 28, {
      fontSize: 18,
      fontWeight: 800,
      color: "#345c57",
      candidate: CANDIDATE.numericId,
    });
    painter.text(member.plan, 1094, top + 28, {
      fontSize: 16,
      fontWeight: 700,
      color: "#64748b",
      align: "right",
    });

    painter.text("氏名", 100, top + 86, { fontSize: 14, fontWeight: 800, color: "#64748b" });
    painter.text(member.name, 100, top + 112, {
      fontSize: 24,
      fontWeight: 800,
      maxWidth: 430,
      candidate: CANDIDATE.name,
    });
    painter.text("メール", 570, top + 86, { fontSize: 14, fontWeight: 800, color: "#64748b" });
    painter.text(member.email, 570, top + 112, {
      fontSize: 20,
      fontWeight: 600,
      maxWidth: 510,
      candidate: CANDIDATE.email,
    });

    painter.text("電話（発信不可）", 100, top + 174, { fontSize: 14, fontWeight: 800, color: "#64748b" });
    painter.text(member.phone, 100, top + 200, {
      fontSize: 21,
      fontWeight: 700,
      candidate: CANDIDATE.phone,
    });
    painter.text("郵便番号", 352, top + 174, { fontSize: 14, fontWeight: 800, color: "#64748b" });
    painter.text(member.postalCode, 352, top + 200, {
      fontSize: 21,
      fontWeight: 700,
      candidate: CANDIDATE.postalCode,
    });
    painter.text("住所（架空）", 570, top + 174, { fontSize: 14, fontWeight: 800, color: "#64748b" });
    painter.text(member.address, 570, top + 200, {
      fontSize: 19,
      fontWeight: 600,
      maxWidth: 510,
      candidate: CANDIDATE.address,
    });
  });
}

const PAGE_DESCRIPTORS: readonly PageDescriptor[] = [
  {
    id: "demo-invoice",
    pageNumber: 1,
    title: "架空請求書 / FICTIONAL INVOICE",
    kind: "invoice",
    fileName: "demo-fictional-invoice.png",
    accent: "#2447a6",
    eyebrow: "DOCUMENT 01 · INVOICE",
  },
  {
    id: "demo-application",
    pageNumber: 2,
    title: "架空申込書 / FICTIONAL APPLICATION",
    kind: "application",
    fileName: "demo-fictional-application.png",
    accent: "#6b46a3",
    eyebrow: "DOCUMENT 02 · APPLICATION",
  },
  {
    id: "demo-member-roster",
    pageNumber: 3,
    title: "架空会員名簿 / FICTIONAL ROSTER",
    kind: "member-roster",
    fileName: "demo-fictional-member-roster.png",
    accent: "#147a70",
    eyebrow: "DOCUMENT 03 · MEMBER ROSTER",
  },
];

function defaultCanvasFactory() {
  if (typeof document === "undefined") {
    throw new Error("Demo document generation requires a browser Canvas environment.");
  }
  return document.createElement("canvas");
}

function createPage(
  descriptor: PageDescriptor,
  canvasFactory: DemoCanvasFactory,
): DemoDocumentPage {
  const canvas = canvasFactory();
  canvas.width = PAGE_WIDTH;
  canvas.height = PAGE_HEIGHT;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Demo document generation requires a 2D Canvas context.");

  const painter = new DemoPagePainter(context, descriptor.id, descriptor.pageNumber - 1);
  paintFoundation(context, painter, descriptor);
  if (descriptor.kind === "invoice") paintInvoice(context, painter);
  else if (descriptor.kind === "application") paintApplication(context, painter);
  else paintMemberRoster(context, painter);

  const searchText = painter.ocrTokens.map((token) => token.text).join("\n");
  return {
    id: descriptor.id,
    pageNumber: descriptor.pageNumber,
    title: descriptor.title,
    kind: descriptor.kind,
    fileName: descriptor.fileName,
    mimeType: "image/png",
    width: PAGE_WIDTH,
    height: PAGE_HEIGHT,
    dataUrl: canvas.toDataURL("image/png"),
    searchText,
    searchTokens: createSearchTokens(painter.ocrTokens),
    ocrTokens: painter.ocrTokens,
    candidates: painter.candidates,
  };
}

/**
 * Generates three wholly fictional PNG pages in the browser. The accompanying
 * tokens model OCR output for Demo Mode so candidate review can be demonstrated
 * deterministically; they are not the result of an OCR request or external API.
 */
export function createDemoDocument(
  canvasFactory: DemoCanvasFactory = defaultCanvasFactory,
): DemoDocument {
  const pages = PAGE_DESCRIPTORS.map((descriptor) => createPage(descriptor, canvasFactory));
  return {
    id: "fictional-redaction-demo",
    name: "架空書類3ページ・マスキングデモ",
    description: "架空の請求書・申込書・会員名簿で、候補確認から出力までを試せます。",
    disclaimer: "すべての氏名・住所・連絡先・IDはデモ専用の架空または無効な値です。",
    totalCandidates: pages.reduce((total, page) => total + page.candidates.length, 0),
    searchText: pages.map((page) => page.searchText).join("\n"),
    pages,
  };
}
