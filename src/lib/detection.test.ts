import { describe, expect, it } from "vitest";
import {
  clampNormalizedRect,
  detectSensitiveCandidates,
  normalizePixelRect,
  unionNormalizedRects,
} from "./detection";
import type { DetectionToken, NormalizedRect } from "./types";

function token(
  text: string,
  lineId: string,
  rect: NormalizedRect,
  confidence?: number,
): DetectionToken {
  return { text, lineId, rect, ...(confidence === undefined ? {} : { confidence }) };
}

function expectRectCloseTo(actual: NormalizedRect, expected: NormalizedRect): void {
  expect(actual.x).toBeCloseTo(expected.x);
  expect(actual.y).toBeCloseTo(expected.y);
  expect(actual.width).toBeCloseTo(expected.width);
  expect(actual.height).toBeCloseTo(expected.height);
}

describe("normalized rectangles", () => {
  it("converts pixel geometry into zoom-independent page coordinates", () => {
    expectRectCloseTo(
      normalizePixelRect({ x: 100, y: 50, width: 200, height: 100 }, 1000, 500),
      { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
    );
  });

  it("normalizes negative dimensions and clips to page bounds", () => {
    expectRectCloseTo(
      clampNormalizedRect({ x: 1.1, y: 0.8, width: -0.4, height: 0.4 }),
      { x: 0.7, y: 0.8, width: 0.3, height: 0.2 },
    );
  });

  it("unions normalized boxes and rejects invalid page dimensions", () => {
    const union = unionNormalizedRects([
        { x: 0.1, y: 0.2, width: 0.2, height: 0.1 },
        { x: 0.25, y: 0.18, width: 0.3, height: 0.2 },
      ]);
    expect(union).toBeDefined();
    expectRectCloseTo(union!, { x: 0.1, y: 0.18, width: 0.45, height: 0.2 });
    expect(() =>
      normalizePixelRect({ x: 0, y: 0, width: 1, height: 1 }, 0, 100),
    ).toThrow(RangeError);
  });
});

describe("detectSensitiveCandidates", () => {
  it("finds deterministic email, phone, postal-code, and labelled ID candidates", () => {
    const tokens: DetectionToken[] = [
      token("メール：", "email", { x: 0.05, y: 0.1, width: 0.12, height: 0.04 }),
      token(
        "demo.user@example.test",
        "email",
        { x: 0.2, y: 0.1, width: 0.4, height: 0.04 },
        94,
      ),
      token("電話：", "phone", { x: 0.05, y: 0.2, width: 0.12, height: 0.04 }),
      token("03-0000-0000", "phone", { x: 0.2, y: 0.2, width: 0.25, height: 0.04 }, 89),
      token("〒000-0000", "postal", { x: 0.2, y: 0.3, width: 0.22, height: 0.04 }),
      token("会員ID：", "id", { x: 0.05, y: 0.4, width: 0.13, height: 0.04 }),
      token("DEMO-48291", "id", { x: 0.2, y: 0.4, width: 0.2, height: 0.04 }, 92),
    ];

    const first = detectSensitiveCandidates(tokens, { pageIndex: 2, source: "ocr" });
    const second = detectSensitiveCandidates(tokens, { pageIndex: 2, source: "ocr" });

    expect(second).toEqual(first);
    expect(first.map((candidate) => candidate.kind)).toEqual([
      "email",
      "phone",
      "postal-code",
      "numeric-id",
    ]);
    expect(first.map((candidate) => candidate.text)).toEqual([
      "demo.user@example.test",
      "03-0000-0000",
      "〒000-0000",
      "DEMO-48291",
    ]);
    expect(first.every((candidate) => candidate.status === "pending")).toBe(true);
    expect(first.every((candidate) => candidate.pageIndex === 2)).toBe(true);
    expect(first.every((candidate) => candidate.source === "ocr")).toBe(true);
    expect(first[0].confidence).toBe(94);

    // Detection produces review evidence only; applying a mask is a separate action.
    expect(first.every((candidate) => !("mode" in candidate))).toBe(true);
    expect(first.every((candidate) => !("redaction" in candidate))).toBe(true);
  });

  it("uses labels for names, addresses, and an unhyphenated postal code", () => {
    const tokens: DetectionToken[] = [
      token("氏名：", "name", { x: 0.05, y: 0.1, width: 0.12, height: 0.05 }),
      token("架空", "name", { x: 0.2, y: 0.1, width: 0.1, height: 0.05 }),
      token("花子", "name", { x: 0.31, y: 0.1, width: 0.1, height: 0.05 }),
      token("住所：", "address", { x: 0.05, y: 0.2, width: 0.12, height: 0.05 }),
      token("デモ県サンプル市1-2-3", "address", {
        x: 0.2,
        y: 0.2,
        width: 0.5,
        height: 0.05,
      }),
      token("郵便番号：", "postal", { x: 0.05, y: 0.3, width: 0.16, height: 0.05 }),
      token("0000000", "postal", { x: 0.23, y: 0.3, width: 0.18, height: 0.05 }),
    ];

    const candidates = detectSensitiveCandidates(tokens, {
      pageIndex: 0,
      source: "pdf-text",
    });

    expect(candidates.map(({ kind, method, text }) => ({ kind, method, text }))).toEqual([
      { kind: "name", method: "label", text: "架空 花子" },
      { kind: "address", method: "label", text: "デモ県サンプル市1-2-3" },
      { kind: "postal-code", method: "label", text: "0000000" },
    ]);
    expect(candidates[0].rects).toHaveLength(1);
    expectRectCloseTo(candidates[0].rects[0], {
      x: 0.2,
      y: 0.1,
      width: 0.21,
      height: 0.05,
    });
  });

  it("clips candidate geometry and avoids unrelated standalone numbers", () => {
    const candidates = detectSensitiveCandidates(
      [
        token("請求額 123456円", "total", { x: 0.1, y: 0.1, width: 0.2, height: 0.04 }),
        token("user@portfolio.example", "email", {
          x: -0.1,
          y: 0.2,
          width: 0.4,
          height: 0.04,
        }),
      ],
      { pageIndex: 0, source: "pdf-text" },
    );

    expect(candidates).toHaveLength(1);
    expect(candidates[0].kind).toBe("email");
    expectRectCloseTo(candidates[0].rects[0], {
      x: 0,
      y: 0.2,
      width: 0.3,
      height: 0.04,
    });
  });

  it("validates page indices", () => {
    expect(() =>
      detectSensitiveCandidates([], { pageIndex: -1, source: "ocr" }),
    ).toThrow(RangeError);
  });
});
