import { detectSensitiveCandidates } from "./detection";
import type {
  DetectionToken,
  MaskCandidate,
  NormalizedRect,
  SupportedMimeType,
} from "./types";

export const MAX_FILE_BYTES = 50 * 1024 * 1024;
export const MAX_PDF_PAGES = 40;
export const MAX_RENDER_PIXELS = 6_000_000;
export const MAX_TOTAL_RENDER_PIXELS = 48_000_000;

export interface LoadedPage {
  id: string;
  pageNumber: number;
  title: string;
  width: number;
  height: number;
  /** Original page raster used by preview and the flattened export compositor. */
  dataUrl: string;
  tokens: DetectionToken[];
  searchText: string;
  pointWidth?: number;
  pointHeight?: number;
}

export interface LoadedDocument {
  id: string;
  name: string;
  mimeType: SupportedMimeType;
  size: number;
  pages: LoadedPage[];
  candidates: MaskCandidate[];
  demo: boolean;
}

export interface ProcessingProgress {
  phase: "reading" | "rendering" | "extracting" | "ocr" | "validating";
  progress: number;
  message: string;
}

export type ProgressCallback = (progress: ProcessingProgress) => void;

export class DocumentLoadError extends Error {
  constructor(
    readonly code:
      | "unsupported"
      | "too-large"
      | "too-many-pages"
      | "encrypted"
      | "corrupt"
      | "image-too-large",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "DocumentLoadError";
  }
}

function makeId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("処理をキャンセルしました。", "AbortError");
}

function bytesStartWith(bytes: Uint8Array, signature: readonly number[]) {
  return signature.every((value, index) => bytes[index] === value);
}

export function detectSupportedMime(
  bytes: Uint8Array,
  declaredType = "",
  fileName = "",
): SupportedMimeType | undefined {
  if (bytesStartWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf";
  if (bytesStartWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }
  if (bytesStartWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";

  const normalized = declaredType.toLowerCase().split(";")[0].trim();
  const extension = fileName.split(".").pop()?.toLowerCase();
  if (bytes.length === 0) {
    if (normalized === "application/pdf" || extension === "pdf") return "application/pdf";
    if (normalized === "image/png" || extension === "png") return "image/png";
    if (
      normalized === "image/jpeg" ||
      normalized === "image/jpg" ||
      extension === "jpg" ||
      extension === "jpeg"
    ) {
      return "image/jpeg";
    }
  }
  return undefined;
}

function createCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function safeRenderScale(
  width: number,
  height: number,
  preferred = 2,
  pixelLimit = MAX_RENDER_PIXELS,
) {
  return Math.min(preferred, Math.sqrt(pixelLimit / (width * height)));
}

function loadHtmlImage(source: Blob | string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = typeof source === "string" ? undefined : URL.createObjectURL(source);
    image.decoding = "async";
    image.onload = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      reject(new DocumentLoadError("corrupt", "画像を読み取れませんでした。"));
    };
    image.src = typeof source === "string" ? source : objectUrl ?? "";
  });
}

export async function imageSourceFromDataUrl(dataUrl: string) {
  return loadHtmlImage(dataUrl);
}

async function loadImagePage(file: File, signal?: AbortSignal): Promise<LoadedPage> {
  throwIfAborted(signal);
  let source: CanvasImageSource;
  let sourceWidth: number;
  let sourceHeight: number;
  let bitmap: ImageBitmap | undefined;

  try {
    if (typeof createImageBitmap === "function") {
      bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      source = bitmap;
      sourceWidth = bitmap.width;
      sourceHeight = bitmap.height;
    } else {
      const image = await loadHtmlImage(file);
      source = image;
      sourceWidth = image.naturalWidth;
      sourceHeight = image.naturalHeight;
    }

    if (!sourceWidth || !sourceHeight) {
      throw new DocumentLoadError("corrupt", "画像の寸法を取得できませんでした。");
    }

    const scale = Math.min(1, Math.sqrt(MAX_RENDER_PIXELS / (sourceWidth * sourceHeight)));
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = createCanvas(width, height);
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Canvas 2D context is unavailable.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(source, 0, 0, width, height);

    return {
      id: makeId("page"),
      pageNumber: 1,
      title: "画像 1",
      width,
      height,
      dataUrl: canvas.toDataURL("image/png"),
      tokens: [],
      searchText: "",
    };
  } catch (error) {
    if (error instanceof DocumentLoadError) throw error;
    throw new DocumentLoadError("corrupt", "画像を読み取れませんでした。", { cause: error });
  } finally {
    bitmap?.close();
  }
}

interface PdfTextItemLike {
  str: string;
  width: number;
  height?: number;
  transform: number[];
  hasEOL?: boolean;
}

function isPdfTextItem(item: unknown): item is PdfTextItemLike {
  return Boolean(
    item &&
      typeof item === "object" &&
      "str" in item &&
      typeof (item as { str?: unknown }).str === "string" &&
      "transform" in item &&
      Array.isArray((item as { transform?: unknown }).transform),
  );
}

function clamp(value: number) {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

function normalizedRect(rect: NormalizedRect): NormalizedRect {
  const x = clamp(rect.x);
  const y = clamp(rect.y);
  return {
    x,
    y,
    width: Math.max(0, Math.min(clamp(rect.width), 1 - x)),
    height: Math.max(0, Math.min(clamp(rect.height), 1 - y)),
  };
}

export function extractPdfTokens(
  items: unknown[],
  viewport: { width: number; height: number; transform: number[] },
  transform: (first: number[], second: number[]) => number[],
): DetectionToken[] {
  const tokens: DetectionToken[] = [];
  const viewportScale = Math.max(
    1,
    Math.hypot(viewport.transform[0] ?? 0, viewport.transform[1] ?? 0),
  );
  for (const item of items) {
    if (!isPdfTextItem(item) || !item.str.trim()) continue;
    const matrix = transform(viewport.transform, item.transform);
    const fontHeight = Math.max(1, Math.hypot(matrix[2] ?? 0, matrix[3] ?? 0));
    const itemWidth = Math.max(
      1,
      Math.abs(item.width ? item.width * viewportScale : item.str.length * fontHeight * 0.5),
    );
    const originX = matrix[4] ?? 0;
    const originY = matrix[5] ?? 0;
    const baselineLength = Math.hypot(matrix[0] ?? 0, matrix[1] ?? 0);
    const baselineX = baselineLength > 0 ? ((matrix[0] ?? 0) / baselineLength) * itemWidth : itemWidth;
    const baselineY = baselineLength > 0 ? ((matrix[1] ?? 0) / baselineLength) * itemWidth : 0;
    const rawHeightX = matrix[2] ?? 0;
    const rawHeightY = matrix[3] ?? 0;
    const hasHeightVector = Math.hypot(rawHeightX, rawHeightY) > 0;
    const heightX = hasHeightVector ? rawHeightX : 0;
    const heightY = hasHeightVector ? rawHeightY : -fontHeight;
    const corners = [
      [originX, originY],
      [originX + baselineX, originY + baselineY],
      [originX + heightX, originY + heightY],
      [originX + baselineX + heightX, originY + baselineY + heightY],
    ];
    const xValues = corners.map(([x]) => x);
    const yValues = corners.map(([, y]) => y);
    const x = Math.min(...xValues);
    const y = Math.min(...yValues);
    const width = Math.max(...xValues) - x;
    const height = Math.max(...yValues) - y;
    const rect = normalizedRect({
      x: x / viewport.width,
      y: y / viewport.height,
      width: width / viewport.width,
      height: height / viewport.height,
    });
    tokens.push({
      text: item.str,
      rect,
      lineId: `pdf-${Math.round(rect.y * 300)}`,
    });
  }
  return tokens;
}

async function loadPdfPages(
  bytes: Uint8Array,
  onProgress?: ProgressCallback,
  signal?: AbortSignal,
): Promise<LoadedPage[]> {
  throwIfAborted(signal);
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(bytes),
    useSystemFonts: true,
    cMapUrl: "/pdfjs/cmaps/",
    cMapPacked: true,
    standardFontDataUrl: "/pdfjs/standard_fonts/",
    wasmUrl: "/pdfjs/wasm/",
    iccUrl: "/pdfjs/iccs/",
  });

  try {
    const pdf = await loadingTask.promise;
    if (pdf.numPages > MAX_PDF_PAGES) {
      throw new DocumentLoadError(
        "too-many-pages",
        `PDFは${MAX_PDF_PAGES}ページまで対応しています。`,
      );
    }
    const pages: LoadedPage[] = [];
    const perPagePixelBudget = Math.min(
      MAX_RENDER_PIXELS,
      Math.floor(MAX_TOTAL_RENDER_PIXELS / pdf.numPages),
    );

    for (let index = 0; index < pdf.numPages; index += 1) {
      throwIfAborted(signal);
      const page = await pdf.getPage(index + 1);
      const baseViewport = page.getViewport({ scale: 1 });
      const scale = safeRenderScale(
        baseViewport.width,
        baseViewport.height,
        2,
        perPagePixelBudget,
      );
      const viewport = page.getViewport({ scale });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Canvas 2D context is unavailable.");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);

      onProgress?.({
        phase: "rendering",
        progress: (index + 0.25) / pdf.numPages,
        message: `${index + 1} / ${pdf.numPages} ページを描画中`,
      });
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      throwIfAborted(signal);

      onProgress?.({
        phase: "extracting",
        progress: (index + 0.7) / pdf.numPages,
        message: `${index + 1} / ${pdf.numPages} ページのテキスト候補を確認中`,
      });
      const textContent = await page.getTextContent();
      const tokens = extractPdfTokens(
        textContent.items as unknown[],
        viewport,
        pdfjs.Util.transform,
      );
      pages.push({
        id: makeId("page"),
        pageNumber: index + 1,
        title: `ページ ${index + 1}`,
        width: canvas.width,
        height: canvas.height,
        dataUrl: canvas.toDataURL("image/png"),
        tokens,
        searchText: tokens.map((token) => token.text).join(" "),
        pointWidth: baseViewport.width,
        pointHeight: baseViewport.height,
      });
      page.cleanup();
    }

    return pages;
  } catch (error) {
    if (error instanceof DocumentLoadError) throw error;
    const message = error instanceof Error ? error.message : "";
    if (/password|encrypted/i.test(message)) {
      throw new DocumentLoadError(
        "encrypted",
        "パスワード保護されたPDFには対応していません。",
        { cause: error },
      );
    }
    throw new DocumentLoadError("corrupt", "PDFを読み取れませんでした。", { cause: error });
  } finally {
    await loadingTask.destroy().catch(() => undefined);
  }
}

export async function loadDocumentFile(
  file: File,
  onProgress?: ProgressCallback,
  signal?: AbortSignal,
): Promise<LoadedDocument> {
  if (file.size > MAX_FILE_BYTES) {
    throw new DocumentLoadError(
      "too-large",
      `ファイルは${Math.round(MAX_FILE_BYTES / 1024 / 1024)}MB以下を選択してください。`,
    );
  }
  throwIfAborted(signal);
  onProgress?.({ phase: "reading", progress: 0.04, message: "ファイルをブラウザ内で読み込み中" });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mimeType = detectSupportedMime(bytes.subarray(0, 16), file.type, file.name);
  if (!mimeType) {
    throw new DocumentLoadError(
      "unsupported",
      "対応形式はPNG・JPEG・PDFです。",
    );
  }
  throwIfAborted(signal);

  const pages =
    mimeType === "application/pdf"
      ? await loadPdfPages(bytes, onProgress, signal)
      : [await loadImagePage(file, signal)];
  const candidates = pages.flatMap((page, pageIndex) =>
    detectSensitiveCandidates(page.tokens, { pageIndex, source: "pdf-text" }),
  );

  onProgress?.({ phase: "validating", progress: 1, message: "読み込みが完了しました" });
  return {
    id: makeId("document"),
    name: file.name,
    mimeType,
    size: file.size,
    pages,
    candidates,
    demo: false,
  };
}

interface OCRWorkerLike {
  recognize: (
    image: string,
    options?: Record<string, unknown>,
    output?: Record<string, boolean>,
  ) => Promise<{
    data: {
      text: string;
      blocks: Array<{
        paragraphs: Array<{
          lines: Array<{
            words: Array<{
              text: string;
              confidence: number;
              bbox: { x0: number; y0: number; x1: number; y1: number };
            }>;
          }>;
        }>;
      }> | null;
    };
  }>;
  terminate: () => Promise<unknown>;
}

let ocrWorkerPromise: Promise<OCRWorkerLike> | undefined;
let activeOcrProgress: ProgressCallback | undefined;

async function getOcrWorker(): Promise<OCRWorkerLike> {
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = import("tesseract.js")
      .then(async ({ createWorker, OEM }) => {
        const worker = await createWorker(["jpn", "eng"], OEM.LSTM_ONLY, {
          workerPath: "/ocr/worker.min.js",
          corePath: "/ocr/core",
          langPath: "/ocr/lang",
          logger: (message) => {
            activeOcrProgress?.({
              phase: "ocr",
              progress: Math.max(0, Math.min(1, message.progress)),
              message:
                message.status === "recognizing text"
                  ? `文字を認識中 ${Math.round(message.progress * 100)}%`
                  : "OCRエンジンを準備中",
            });
          },
        });
        return worker as OCRWorkerLike;
      })
      .catch((error) => {
        ocrWorkerPromise = undefined;
        throw error;
      });
  }
  return ocrWorkerPromise;
}

export async function terminateOcrWorker() {
  const workerPromise = ocrWorkerPromise;
  ocrWorkerPromise = undefined;
  activeOcrProgress = undefined;
  if (workerPromise) {
    const worker = await workerPromise.catch(() => undefined);
    await worker?.terminate().catch(() => undefined);
  }
}

export async function recognizePageText(
  page: LoadedPage,
  pageIndex: number,
  onProgress?: ProgressCallback,
  signal?: AbortSignal,
): Promise<{ tokens: DetectionToken[]; searchText: string; candidates: MaskCandidate[] }> {
  throwIfAborted(signal);
  activeOcrProgress = onProgress;
  const abort = () => void terminateOcrWorker();
  signal?.addEventListener("abort", abort, { once: true });

  try {
    const worker = await getOcrWorker();
    throwIfAborted(signal);
    const result = await worker.recognize(page.dataUrl, {}, { text: true, blocks: true });
    throwIfAborted(signal);
    const tokens: DetectionToken[] = [];
    result.data.blocks?.forEach((block, blockIndex) =>
      block.paragraphs.forEach((paragraph, paragraphIndex) =>
        paragraph.lines.forEach((line, lineIndex) =>
          line.words.forEach((word) => {
            if (!word.text.trim()) return;
            tokens.push({
              text: word.text,
              confidence: word.confidence,
              lineId: `ocr-${blockIndex}-${paragraphIndex}-${lineIndex}`,
              rect: normalizedRect({
                x: word.bbox.x0 / page.width,
                y: word.bbox.y0 / page.height,
                width: (word.bbox.x1 - word.bbox.x0) / page.width,
                height: (word.bbox.y1 - word.bbox.y0) / page.height,
              }),
            });
          }),
        ),
      ),
    );
    const searchText = result.data.text.trim();
    const candidates = detectSensitiveCandidates(tokens, { pageIndex, source: "ocr" });
    return { tokens, searchText, candidates };
  } finally {
    activeOcrProgress = undefined;
    signal?.removeEventListener("abort", abort);
  }
}
