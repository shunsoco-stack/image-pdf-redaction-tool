import { PDFDocument } from "pdf-lib";

import type { NormalizedRect, Redaction } from "./types";

export const DEFAULT_BLUR_RADIUS = 12;
export const DEFAULT_BLUR_PASSES = 3;

export interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type CanvasFactory = (
  width: number,
  height: number,
) => HTMLCanvasElement;

export interface ComposeRedactionsOptions {
  /** Redaction page indexes are zero-based. Images use page index 0. */
  pageIndex: number;
  width?: number;
  height?: number;
  blurRadius?: number;
  blurPasses?: number;
  canvasFactory?: CanvasFactory;
}

export type RasterImageFormat = "png" | "jpeg";

export interface RasterExportOptions {
  format: RasterImageFormat;
  /** JPEG quality in the 0..1 range. Ignored for PNG. */
  quality?: number;
}

export interface ExportableCanvas {
  toBlob?: (
    callback: BlobCallback,
    type?: string,
    quality?: number,
  ) => void;
  toDataURL?: (type?: string, quality?: number) => string;
  convertToBlob?: (options?: {
    type?: string;
    quality?: number;
  }) => Promise<Blob>;
}

export type BinaryInput = Blob | ArrayBuffer | Uint8Array;
export type EmbeddedRasterMimeType = "image/png" | "image/jpeg";

export interface RasterizedPdfPage {
  image: BinaryInput;
  /** Optional when the image type can be inferred from a Blob or magic bytes. */
  mimeType?: EmbeddedRasterMimeType | "image/jpg";
  /** Target PDF page dimensions in points. Defaults to the image dimensions. */
  pageWidth?: number;
  pageHeight?: number;
}

export interface PdfJsTextContentLike {
  items?: readonly unknown[];
}

export interface PdfJsPageLike {
  getTextContent: () => PromiseLike<PdfJsTextContentLike>;
}

export interface PdfJsDocumentLike {
  numPages: number;
  getPage: (pageNumber: number) => PromiseLike<PdfJsPageLike>;
  cleanup?: () => void | PromiseLike<void>;
  destroy?: () => void | PromiseLike<void>;
}

export interface PdfJsLoadingTaskLike {
  promise: PromiseLike<PdfJsDocumentLike>;
}

export type PdfJsLoader = (input: { data: Uint8Array }) =>
  | PdfJsDocumentLike
  | PdfJsLoadingTaskLike
  | PromiseLike<PdfJsDocumentLike | PdfJsLoadingTaskLike>;

export interface PdfPageValidation {
  pageNumber: number;
  textItemCount: number;
  extractedTextCharacters: number;
  hasTextLayer: boolean;
}

export interface PdfValidationReport {
  pageCount: number;
  expectedPageCount?: number;
  pageCountMatches?: boolean;
  /** True only when PDF.js reports no text items on every page. */
  textLayerAbsent: boolean;
  checksPassed: boolean;
  pages: readonly PdfPageValidation[];
}

export interface ValidateFlattenedPdfOptions {
  loader?: PdfJsLoader;
  expectedPageCount?: number;
  /** Defaults to true for a document opened by loader and false for an injected document. */
  destroyAfterValidation?: boolean;
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`${label} must be a positive safe integer.`);
  }
}

function assertFiniteRect(rect: NormalizedRect): void {
  for (const [label, value] of Object.entries(rect)) {
    if (!Number.isFinite(value)) {
      throw new RangeError(`Redaction rect ${label} must be finite.`);
    }
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

/**
 * Converts a normalized selection to conservative pixel bounds. The outer
 * edges are rounded outward so a fractional edge cannot leave a one-pixel gap.
 */
export function normalizedRectToPixelRect(
  rect: NormalizedRect,
  canvasWidth: number,
  canvasHeight: number,
): PixelRect | null {
  assertPositiveInteger(canvasWidth, "Canvas width");
  assertPositiveInteger(canvasHeight, "Canvas height");
  assertFiniteRect(rect);

  const x1 = clamp(Math.min(rect.x, rect.x + rect.width), 0, 1);
  const x2 = clamp(Math.max(rect.x, rect.x + rect.width), 0, 1);
  const y1 = clamp(Math.min(rect.y, rect.y + rect.height), 0, 1);
  const y2 = clamp(Math.max(rect.y, rect.y + rect.height), 0, 1);

  if (x2 <= x1 || y2 <= y1) return null;

  const left = Math.floor(x1 * canvasWidth);
  const top = Math.floor(y1 * canvasHeight);
  const right = Math.ceil(x2 * canvasWidth);
  const bottom = Math.ceil(y2 * canvasHeight);

  if (right <= left || bottom <= top) return null;

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

function pixelOffset(x: number, y: number, width: number): number {
  return (y * width + x) * 4;
}

function boxBlurHorizontal(
  source: Uint8ClampedArray,
  target: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
): void {
  const windowSize = radius * 2 + 1;

  for (let y = 0; y < height; y += 1) {
    let red = 0;
    let green = 0;
    let blue = 0;
    let alpha = 0;

    for (let offset = -radius; offset <= radius; offset += 1) {
      const sampleX = clamp(offset, 0, width - 1);
      const index = pixelOffset(sampleX, y, width);
      red += source[index];
      green += source[index + 1];
      blue += source[index + 2];
      alpha += source[index + 3];
    }

    for (let x = 0; x < width; x += 1) {
      const targetIndex = pixelOffset(x, y, width);
      target[targetIndex] = red / windowSize;
      target[targetIndex + 1] = green / windowSize;
      target[targetIndex + 2] = blue / windowSize;
      target[targetIndex + 3] = alpha / windowSize;

      const removeX = clamp(x - radius, 0, width - 1);
      const addX = clamp(x + radius + 1, 0, width - 1);
      const removeIndex = pixelOffset(removeX, y, width);
      const addIndex = pixelOffset(addX, y, width);

      red += source[addIndex] - source[removeIndex];
      green += source[addIndex + 1] - source[removeIndex + 1];
      blue += source[addIndex + 2] - source[removeIndex + 2];
      alpha += source[addIndex + 3] - source[removeIndex + 3];
    }
  }
}

function boxBlurVertical(
  source: Uint8ClampedArray,
  target: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
): void {
  const windowSize = radius * 2 + 1;

  for (let x = 0; x < width; x += 1) {
    let red = 0;
    let green = 0;
    let blue = 0;
    let alpha = 0;

    for (let offset = -radius; offset <= radius; offset += 1) {
      const sampleY = clamp(offset, 0, height - 1);
      const index = pixelOffset(x, sampleY, width);
      red += source[index];
      green += source[index + 1];
      blue += source[index + 2];
      alpha += source[index + 3];
    }

    for (let y = 0; y < height; y += 1) {
      const targetIndex = pixelOffset(x, y, width);
      target[targetIndex] = red / windowSize;
      target[targetIndex + 1] = green / windowSize;
      target[targetIndex + 2] = blue / windowSize;
      target[targetIndex + 3] = alpha / windowSize;

      const removeY = clamp(y - radius, 0, height - 1);
      const addY = clamp(y + radius + 1, 0, height - 1);
      const removeIndex = pixelOffset(x, removeY, width);
      const addIndex = pixelOffset(x, addY, width);

      red += source[addIndex] - source[removeIndex];
      green += source[addIndex + 1] - source[removeIndex + 1];
      blue += source[addIndex + 2] - source[removeIndex + 2];
      alpha += source[addIndex + 3] - source[removeIndex + 3];
    }
  }
}

/**
 * Safari-safe blur path. It operates directly on ImageData and never depends
 * on CanvasRenderingContext2D.filter, whose behavior has varied across Safari
 * versions and canvas implementations.
 */
export function blurImageDataInPlace(
  imageData: ImageData,
  radius: number,
  passes = DEFAULT_BLUR_PASSES,
): ImageData {
  assertPositiveInteger(imageData.width, "ImageData width");
  assertPositiveInteger(imageData.height, "ImageData height");

  if (!Number.isSafeInteger(radius) || radius < 0) {
    throw new RangeError("Blur radius must be a non-negative safe integer.");
  }
  assertPositiveInteger(passes, "Blur passes");

  const expectedLength = imageData.width * imageData.height * 4;
  if (imageData.data.length !== expectedLength) {
    throw new RangeError("ImageData length does not match its dimensions.");
  }

  const effectiveRadius = Math.min(
    radius,
    Math.max(imageData.width, imageData.height) - 1,
  );
  if (effectiveRadius === 0) return imageData;

  let current = new Uint8ClampedArray(imageData.data);
  const horizontal = new Uint8ClampedArray(expectedLength);
  let vertical = new Uint8ClampedArray(expectedLength);
  let result = current;

  for (let pass = 0; pass < passes; pass += 1) {
    boxBlurHorizontal(
      current,
      horizontal,
      imageData.width,
      imageData.height,
      effectiveRadius,
    );
    boxBlurVertical(
      horizontal,
      vertical,
      imageData.width,
      imageData.height,
      effectiveRadius,
    );
    result = vertical;

    if (pass < passes - 1) {
      const reusable = current;
      current = vertical;
      vertical = reusable;
    }
  }

  imageData.data.set(result);
  return imageData;
}

function readSourceDimension(
  source: CanvasImageSource,
  keys: readonly string[],
): number | undefined {
  const record = source as unknown as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      return value;
    }
  }
  return undefined;
}

function resolveCanvasDimension(
  explicit: number | undefined,
  inferred: number | undefined,
  label: string,
): number {
  const value = explicit ?? inferred;
  if (value === undefined || !Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} could not be determined from the source.`);
  }
  const rounded = Math.round(value);
  assertPositiveInteger(rounded, label);
  return rounded;
}

function defaultCanvasFactory(width: number, height: number): HTMLCanvasElement {
  if (typeof document === "undefined") {
    throw new Error(
      "A canvasFactory is required when redactions are composed outside a browser.",
    );
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function resolveBlurSetting(
  value: number | undefined,
  fallback: number,
  label: string,
): number {
  const resolved = value ?? fallback;
  assertPositiveInteger(resolved, label);
  return resolved;
}

/**
 * Draws the source and selected page's redactions onto a newly-created canvas.
 * Blur regions are baked first and opaque black regions are applied last so a
 * black mask remains solid wherever different redactions overlap.
 */
export function composeRedactionsToCanvas(
  source: CanvasImageSource,
  redactions: readonly Redaction[],
  options: ComposeRedactionsOptions,
): HTMLCanvasElement {
  if (!Number.isSafeInteger(options.pageIndex) || options.pageIndex < 0) {
    throw new RangeError("Page index must be a non-negative safe integer.");
  }

  const width = resolveCanvasDimension(
    options.width,
    readSourceDimension(source, ["naturalWidth", "videoWidth", "width"]),
    "Canvas width",
  );
  const height = resolveCanvasDimension(
    options.height,
    readSourceDimension(source, ["naturalHeight", "videoHeight", "height"]),
    "Canvas height",
  );
  const blurRadius = resolveBlurSetting(
    options.blurRadius,
    DEFAULT_BLUR_RADIUS,
    "Blur radius",
  );
  const blurPasses = resolveBlurSetting(
    options.blurPasses,
    DEFAULT_BLUR_PASSES,
    "Blur passes",
  );

  const canvas = (options.canvasFactory ?? defaultCanvasFactory)(width, height);
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("A 2D canvas context is required for redaction.");

  context.drawImage(source, 0, 0, width, height);

  const pageRedactions = redactions.filter(
    (redaction) => redaction.pageIndex === options.pageIndex,
  );

  for (const redaction of pageRedactions) {
    if (redaction.mode !== "blur") continue;
    const rect = normalizedRectToPixelRect(redaction.rect, width, height);
    if (!rect) continue;
    const pixels = context.getImageData(
      rect.x,
      rect.y,
      rect.width,
      rect.height,
    );
    blurImageDataInPlace(pixels, blurRadius, blurPasses);
    context.putImageData(pixels, rect.x, rect.y);
  }

  context.fillStyle = "#000000";
  for (const redaction of pageRedactions) {
    if (redaction.mode !== "black") continue;
    const rect = normalizedRectToPixelRect(redaction.rect, width, height);
    if (!rect) continue;
    context.fillRect(rect.x, rect.y, rect.width, rect.height);
  }

  return canvas;
}

function normalizeJpegQuality(value: number | undefined): number {
  const quality = value ?? 0.92;
  if (!Number.isFinite(quality)) {
    throw new RangeError("JPEG quality must be finite.");
  }
  return clamp(quality, 0, 1);
}

function dataUrlToBlob(dataUrl: string, fallbackMimeType: string): Blob {
  const match = /^data:([^;,]*)(;base64)?,([\s\S]*)$/.exec(dataUrl);
  if (!match) throw new Error("Canvas returned an invalid data URL.");

  const mimeType = match[1] || fallbackMimeType;
  const isBase64 = Boolean(match[2]);
  const encoded = match[3];
  const decoded = isBase64
    ? globalThis.atob(encoded)
    : decodeURIComponent(encoded);
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
}

/** Exports a fully-composed canvas as PNG or JPEG without server transport. */
export async function exportCanvasAsBlob(
  canvas: ExportableCanvas,
  options: RasterExportOptions,
): Promise<Blob> {
  const mimeType =
    options.format === "png" ? "image/png" : "image/jpeg";
  const quality =
    options.format === "jpeg" ? normalizeJpegQuality(options.quality) : undefined;

  if (typeof canvas.convertToBlob === "function") {
    return canvas.convertToBlob({ type: mimeType, quality });
  }

  if (typeof canvas.toBlob === "function") {
    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob?.(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error(`Canvas could not encode ${mimeType}.`));
        },
        mimeType,
        quality,
      );
    });
  }

  if (typeof canvas.toDataURL === "function") {
    return dataUrlToBlob(canvas.toDataURL(mimeType, quality), mimeType);
  }

  throw new Error("Canvas does not provide a supported image export method.");
}

function isBlob(value: BinaryInput): value is Blob {
  return typeof Blob !== "undefined" && value instanceof Blob;
}

async function binaryInputToBytes(input: BinaryInput): Promise<Uint8Array> {
  if (isBlob(input)) return new Uint8Array(await input.arrayBuffer());
  if (input instanceof Uint8Array) return new Uint8Array(input);
  return new Uint8Array(input.slice(0));
}

function normalizeRasterMimeType(
  explicit: RasterizedPdfPage["mimeType"],
  blobType: string | undefined,
  bytes: Uint8Array,
): EmbeddedRasterMimeType {
  const supplied = (explicit ?? blobType)?.toLowerCase();
  if (supplied === "image/png") return "image/png";
  if (supplied === "image/jpeg" || supplied === "image/jpg") {
    return "image/jpeg";
  }

  const isPng =
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a;
  if (isPng) return "image/png";

  const isJpeg =
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff;
  if (isJpeg) return "image/jpeg";

  throw new TypeError("Rasterized PDF pages must be PNG or JPEG images.");
}

function resolvePdfPageSize(
  page: RasterizedPdfPage,
  imageWidth: number,
  imageHeight: number,
): { width: number; height: number } {
  const { pageWidth, pageHeight } = page;
  if (pageWidth !== undefined && (!Number.isFinite(pageWidth) || pageWidth <= 0)) {
    throw new RangeError("PDF page width must be positive and finite.");
  }
  if (
    pageHeight !== undefined &&
    (!Number.isFinite(pageHeight) || pageHeight <= 0)
  ) {
    throw new RangeError("PDF page height must be positive and finite.");
  }

  if (pageWidth !== undefined && pageHeight !== undefined) {
    return { width: pageWidth, height: pageHeight };
  }
  if (pageWidth !== undefined) {
    return {
      width: pageWidth,
      height: pageWidth * (imageHeight / imageWidth),
    };
  }
  if (pageHeight !== undefined) {
    return {
      width: pageHeight * (imageWidth / imageHeight),
      height: pageHeight,
    };
  }
  return { width: imageWidth, height: imageHeight };
}

/**
 * Builds a new PDF containing only raster page images. No page, annotation,
 * metadata, or text object is copied from the source PDF.
 */
export async function rebuildPdfFromRasterizedPages(
  pages: readonly RasterizedPdfPage[],
): Promise<Uint8Array> {
  if (pages.length === 0) {
    throw new RangeError("At least one rasterized page is required.");
  }

  const output = await PDFDocument.create();

  for (const rasterPage of pages) {
    const bytes = await binaryInputToBytes(rasterPage.image);
    const blobType = isBlob(rasterPage.image)
      ? rasterPage.image.type
      : undefined;
    const mimeType = normalizeRasterMimeType(
      rasterPage.mimeType,
      blobType,
      bytes,
    );
    const image =
      mimeType === "image/png"
        ? await output.embedPng(bytes)
        : await output.embedJpg(bytes);
    const size = resolvePdfPageSize(rasterPage, image.width, image.height);
    const page = output.addPage([size.width, size.height]);
    page.drawImage(image, {
      x: 0,
      y: 0,
      width: size.width,
      height: size.height,
    });
  }

  return output.save();
}

function isPdfJsDocumentLike(value: unknown): value is PdfJsDocumentLike {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<PdfJsDocumentLike>;
  return (
    typeof candidate.numPages === "number" &&
    typeof candidate.getPage === "function"
  );
}

function isPdfJsLoadingTaskLike(value: unknown): value is PdfJsLoadingTaskLike {
  if (typeof value !== "object" || value === null) return false;
  return "promise" in value;
}

function textValue(item: unknown): string | null {
  if (typeof item !== "object" || item === null || !("str" in item)) {
    return null;
  }
  const value = (item as { str?: unknown }).str;
  return typeof value === "string" ? value : null;
}

/**
 * Checks page count and PDF.js text extraction. `textLayerAbsent` is evidence
 * about the exported structure, not a general forensic-security guarantee.
 */
export async function validateFlattenedPdf(
  source: BinaryInput | PdfJsDocumentLike,
  options: ValidateFlattenedPdfOptions = {},
): Promise<PdfValidationReport> {
  const injectedDocument = isPdfJsDocumentLike(source);
  let pdfDocument: PdfJsDocumentLike;

  if (injectedDocument) {
    pdfDocument = source;
  } else {
    if (!options.loader) {
      throw new TypeError(
        "A PDF.js loader is required when validating PDF bytes.",
      );
    }
    const bytes = await binaryInputToBytes(source);
    const loaded = await options.loader({ data: bytes });
    pdfDocument = isPdfJsLoadingTaskLike(loaded)
      ? await loaded.promise
      : loaded;
  }

  assertPositiveInteger(pdfDocument.numPages, "PDF page count");
  if (
    options.expectedPageCount !== undefined &&
    (!Number.isSafeInteger(options.expectedPageCount) ||
      options.expectedPageCount < 1)
  ) {
    throw new RangeError(
      "Expected PDF page count must be a positive safe integer.",
    );
  }

  const shouldDestroy =
    options.destroyAfterValidation ?? !injectedDocument;

  try {
    const pages: PdfPageValidation[] = [];
    for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
      const page = await pdfDocument.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const items = Array.isArray(textContent.items) ? textContent.items : [];
      const textValues = items
        .map(textValue)
        .filter((value): value is string => value !== null);
      const extractedTextCharacters = textValues.reduce(
        (total, value) => total + value.length,
        0,
      );

      pages.push({
        pageNumber,
        textItemCount: textValues.length,
        extractedTextCharacters,
        hasTextLayer: textValues.length > 0,
      });
    }

    const textLayerAbsent = pages.every((page) => !page.hasTextLayer);
    const pageCountMatches =
      options.expectedPageCount === undefined
        ? undefined
        : pdfDocument.numPages === options.expectedPageCount;

    return {
      pageCount: pdfDocument.numPages,
      expectedPageCount: options.expectedPageCount,
      pageCountMatches,
      textLayerAbsent,
      checksPassed: textLayerAbsent && pageCountMatches !== false,
      pages,
    };
  } finally {
    if (shouldDestroy) {
      if (pdfDocument.destroy) await pdfDocument.destroy();
      else if (pdfDocument.cleanup) await pdfDocument.cleanup();
    }
  }
}
