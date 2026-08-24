import type {
  DetectionMethod,
  DetectionSource,
  DetectionToken,
  MaskCandidate,
  NormalizedRect,
  SensitiveDataKind,
} from "./types";

export interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DetectionOptions {
  /** Zero-based page index. */
  pageIndex: number;
  source: DetectionSource;
}

interface IndexedToken extends DetectionToken {
  index: number;
  lineKey: string;
  normalizedText: string;
  rect: NormalizedRect;
}

interface TextStream {
  text: string;
  charToToken: Array<number | null>;
  tokens: IndexedToken[];
}

interface DetectionRule {
  kind: SensitiveDataKind;
  method: DetectionMethod;
  expression: RegExp;
  captureGroup?: number;
  clean: (text: string) => string;
  validate?: (text: string, stream: string, start: number, end: number) => boolean;
}

interface LocatedCandidate {
  candidate: MaskCandidate;
  start: number;
  end: number;
  ruleOrder: number;
}

const HYPHENS = /[‐‑‒–—―−]/g;

function finite(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, finite(value)));
}

/** Normalizes negative dimensions and clips a rectangle to the visible page. */
export function clampNormalizedRect(rect: NormalizedRect): NormalizedRect {
  const x = finite(rect.x);
  const y = finite(rect.y);
  const oppositeX = x + finite(rect.width);
  const oppositeY = y + finite(rect.height);
  const left = clamp01(Math.min(x, oppositeX));
  const top = clamp01(Math.min(y, oppositeY));
  const right = clamp01(Math.max(x, oppositeX));
  const bottom = clamp01(Math.max(y, oppositeY));

  return {
    x: left,
    y: top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

/** Converts a pixel rectangle into the shared, zoom-independent page space. */
export function normalizePixelRect(
  rect: PixelRect,
  pageWidth: number,
  pageHeight: number,
): NormalizedRect {
  if (
    !Number.isFinite(pageWidth) ||
    !Number.isFinite(pageHeight) ||
    pageWidth <= 0 ||
    pageHeight <= 0
  ) {
    throw new RangeError("Page dimensions must be finite positive numbers.");
  }

  return clampNormalizedRect({
    x: rect.x / pageWidth,
    y: rect.y / pageHeight,
    width: rect.width / pageWidth,
    height: rect.height / pageHeight,
  });
}

export function unionNormalizedRects(
  rects: readonly NormalizedRect[],
): NormalizedRect | undefined {
  const usable = rects
    .map(clampNormalizedRect)
    .filter((rect) => rect.width > 0 && rect.height > 0);
  if (usable.length === 0) return undefined;

  const left = Math.min(...usable.map((rect) => rect.x));
  const top = Math.min(...usable.map((rect) => rect.y));
  const right = Math.max(...usable.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...usable.map((rect) => rect.y + rect.height));
  return clampNormalizedRect({
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  });
}

function normalizeSearchText(value: string): string {
  return value.normalize("NFKC").replace(HYPHENS, "-");
}

function verticalOverlap(a: NormalizedRect, b: NormalizedRect): number {
  const overlap = Math.max(
    0,
    Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y),
  );
  const smallerHeight = Math.min(a.height, b.height);
  if (smallerHeight <= 0) {
    return Math.abs(a.y - b.y) <= 0.01 ? 1 : 0;
  }
  return overlap / smallerHeight;
}

function indexTokens(tokens: readonly DetectionToken[]): IndexedToken[] {
  let inferredLine = 0;
  let previousAnonymous: IndexedToken | undefined;

  return tokens.map((token, index) => {
    const rect = clampNormalizedRect(token.rect);
    let lineKey: string;
    if (token.lineId !== undefined) {
      lineKey = `explicit:${token.lineId}`;
      previousAnonymous = undefined;
    } else {
      if (!previousAnonymous || verticalOverlap(previousAnonymous.rect, rect) < 0.5) {
        inferredLine += 1;
      }
      lineKey = `inferred:${inferredLine}`;
    }

    const indexed: IndexedToken = {
      ...token,
      index,
      rect,
      lineKey,
      normalizedText: normalizeSearchText(token.text),
    };
    if (token.lineId === undefined) previousAnonymous = indexed;
    return indexed;
  });
}

function appendMappedText(
  stream: TextStream,
  value: string,
  tokenIndex: number | null,
): void {
  stream.text += value;
  for (let index = 0; index < value.length; index += 1) {
    stream.charToToken.push(tokenIndex);
  }
}

function createTextStream(tokens: readonly DetectionToken[]): TextStream {
  const indexedTokens = indexTokens(tokens).filter(
    (token) => token.normalizedText.length > 0,
  );
  const stream: TextStream = { text: "", charToToken: [], tokens: indexedTokens };

  indexedTokens.forEach((token, index) => {
    if (index > 0) {
      const previous = indexedTokens[index - 1];
      const sameLine = previous.lineKey === token.lineKey;
      const alreadySeparated =
        /\s$/.test(previous.normalizedText) || /^\s/.test(token.normalizedText);
      appendMappedText(stream, sameLine && !alreadySeparated ? " " : sameLine ? "" : "\n", null);
    }
    appendMappedText(stream, token.normalizedText, token.index);
  });

  return stream;
}

function cleanCompact(value: string): string {
  return value.replace(/[ \t]/g, "").trim();
}

function cleanReadable(value: string): string {
  return value.trim().replace(/[ \t]+/g, " ");
}

function validPhone(
  value: string,
  stream: string,
  start: number,
  end: number,
): boolean {
  const before = stream[start - 1] ?? "";
  const after = stream[end] ?? "";
  if (/\d/.test(before) || /\d/.test(after)) return false;

  const digits = value.replace(/\D/g, "");
  return value.trim().startsWith("+81")
    ? digits.length === 11 || digits.length === 12
    : digits.length === 10 || digits.length === 11;
}

function validPostalCode(
  _value: string,
  stream: string,
  start: number,
  end: number,
): boolean {
  const before = stream[start - 1] ?? "";
  const after = stream[end] ?? "";
  return !/[\dー-]/.test(before) && !/[\dー-]/.test(after);
}

function createRules(): DetectionRule[] {
  return [
    {
      kind: "email",
      method: "regex",
      expression:
        /[A-Z0-9._%+-]+[ \t]*@[ \t]*[A-Z0-9-]+(?:[ \t]*\.[ \t]*[A-Z0-9-]+)*[ \t]*\.[ \t]*[A-Z]{2,63}/gi,
      clean: cleanCompact,
    },
    {
      kind: "phone",
      method: "regex",
      expression: /(?:\+81(?:[ \t()ー-]*\d){9,10}|0(?:[ \t()ー-]*\d){9,10})/g,
      clean: cleanCompact,
      validate: validPhone,
    },
    {
      kind: "postal-code",
      method: "regex",
      expression: /(?:〒[ \t]*)?\d{3}[ \t]*[-ー][ \t]*\d{4}/g,
      clean: cleanCompact,
      validate: validPostalCode,
    },
    {
      kind: "postal-code",
      method: "label",
      expression:
        /(?:郵便番号|POSTAL(?:[ \t]+CODE)?|ZIP)[ \t]*[:#]?[ \t]*(\d{3}[ \tー-]*\d{4})/gi,
      captureGroup: 1,
      clean: cleanCompact,
    },
    {
      kind: "numeric-id",
      method: "label",
      expression:
        /(?:会員(?:番号|ID)?|顧客(?:番号|ID)?|申込(?:番号|ID)?|社員(?:番号|ID)?|マイナンバー|個人番号|登録番号|識別番号|ID|NO\.)[ \t]*[:#]?[ \t]*([A-Z0-9][A-Z0-9_-]{3,31})/gi,
      captureGroup: 1,
      clean: cleanCompact,
    },
    {
      kind: "name",
      method: "label",
      expression:
        /(?:^|\n)[ \t]*(?:氏名|お名前|NAME)[ \t]*[:]?[ \t]*([^\n]{2,60})/gim,
      captureGroup: 1,
      clean: cleanReadable,
    },
    {
      kind: "address",
      method: "label",
      expression:
        /(?:^|\n)[ \t]*(?:住所|所在地|ADDRESS)[ \t]*[:]?[ \t]*([^\n]{3,120})/gim,
      captureGroup: 1,
      clean: cleanReadable,
    },
  ];
}

function tokenIndicesForSpan(
  stream: TextStream,
  start: number,
  end: number,
): number[] {
  const seen = new Set<number>();
  for (let offset = start; offset < end; offset += 1) {
    const tokenIndex = stream.charToToken[offset];
    if (tokenIndex !== null && tokenIndex !== undefined) seen.add(tokenIndex);
  }
  return [...seen];
}

function rectsForTokenIndices(
  stream: TextStream,
  tokenIndices: readonly number[],
): NormalizedRect[] {
  const selected = tokenIndices
    .map((tokenIndex) => stream.tokens.find((token) => token.index === tokenIndex))
    .filter((token): token is IndexedToken => token !== undefined);
  const lines = new Map<string, NormalizedRect[]>();

  for (const token of selected) {
    const lineRects = lines.get(token.lineKey) ?? [];
    lineRects.push(token.rect);
    lines.set(token.lineKey, lineRects);
  }

  return [...lines.values()]
    .map(unionNormalizedRects)
    .filter((rect): rect is NormalizedRect => rect !== undefined);
}

function confidenceForTokenIndices(
  stream: TextStream,
  tokenIndices: readonly number[],
): number | undefined {
  const confidences = tokenIndices
    .map((tokenIndex) => stream.tokens.find((token) => token.index === tokenIndex)?.confidence)
    .filter((value): value is number => Number.isFinite(value));
  return confidences.length > 0 ? Math.min(...confidences) : undefined;
}

function capturedSpan(
  match: RegExpExecArray,
  captureGroup: number | undefined,
): { start: number; end: number; text: string } | undefined {
  const text = captureGroup === undefined ? match[0] : match[captureGroup];
  if (!text) return undefined;
  const relativeStart = captureGroup === undefined ? 0 : match[0].lastIndexOf(text);
  if (relativeStart < 0) return undefined;
  const start = match.index + relativeStart;
  return { start, end: start + text.length, text };
}

/**
 * Runs deterministic rules and returns review candidates only. Every result is
 * pending; this function deliberately has no dependency on the Redaction type.
 */
export function detectSensitiveCandidates(
  tokens: readonly DetectionToken[],
  options: DetectionOptions,
): MaskCandidate[] {
  if (!Number.isSafeInteger(options.pageIndex) || options.pageIndex < 0) {
    throw new RangeError("pageIndex must be a non-negative safe integer.");
  }

  const stream = createTextStream(tokens);
  if (!stream.text) return [];

  const located: LocatedCandidate[] = [];
  const seen = new Set<string>();

  createRules().forEach((rule, ruleOrder) => {
    let match: RegExpExecArray | null;
    while ((match = rule.expression.exec(stream.text)) !== null) {
      const span = capturedSpan(match, rule.captureGroup);
      if (!span || span.start === span.end) continue;
      const cleanedText = rule.clean(span.text);
      if (!cleanedText) continue;
      if (rule.validate && !rule.validate(span.text, stream.text, span.start, span.end)) {
        continue;
      }

      const tokenIndices = tokenIndicesForSpan(stream, span.start, span.end);
      const rects = rectsForTokenIndices(stream, tokenIndices);
      if (rects.length === 0) continue;

      const dedupeKey = `${rule.kind}:${span.start}:${span.end}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      const confidence = confidenceForTokenIndices(stream, tokenIndices);
      const candidate: MaskCandidate = {
        id: `${options.source}-p${options.pageIndex}-${rule.kind}-${span.start}-${span.end}`,
        pageIndex: options.pageIndex,
        kind: rule.kind,
        source: options.source,
        method: rule.method,
        text: cleanedText,
        rects,
        status: "pending",
        ...(confidence === undefined ? {} : { confidence }),
      };
      located.push({ candidate, start: span.start, end: span.end, ruleOrder });

      // Defensive guard for a future zero-width expression.
      if (match[0].length === 0) rule.expression.lastIndex += 1;
    }
  });

  return located
    .sort(
      (a, b) =>
        a.start - b.start ||
        a.end - b.end ||
        a.ruleOrder - b.ruleOrder ||
        a.candidate.kind.localeCompare(b.candidate.kind),
    )
    .map(({ candidate }) => candidate);
}
