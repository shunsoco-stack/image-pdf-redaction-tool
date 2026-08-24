import { describe, expect, it } from "vitest";

import {
  createDemoDocument,
  type DemoCanvasFactory,
  type DemoMaskCandidate,
} from "./demo-document";

class FakeCanvasContext {
  fillStyle: string | CanvasGradient | CanvasPattern = "#000000";
  strokeStyle: string | CanvasGradient | CanvasPattern = "#000000";
  lineWidth = 1;
  globalAlpha = 1;
  font = "16px sans-serif";
  textAlign: CanvasTextAlign = "left";
  textBaseline: CanvasTextBaseline = "alphabetic";

  beginPath() {}
  closePath() {}
  fill() {}
  fillRect() {}
  fillText() {}
  lineTo() {}
  moveTo() {}
  quadraticCurveTo() {}
  restore() {}
  rotate() {}
  save() {}
  stroke() {}
  translate() {}

  measureText(text: string) {
    const width = [...text].reduce((total, character) => total + (/^[\x00-\xff]$/u.test(character) ? 10 : 20), 0);
    return { width } as TextMetrics;
  }
}

function fakeCanvasFactory(): DemoCanvasFactory {
  let page = 0;
  return () => {
    page += 1;
    const context = new FakeCanvasContext();
    return {
      width: 0,
      height: 0,
      getContext: () => context,
      toDataURL: () => `data:image/png;base64,ZGVtby1wYWdlLS${page}`,
    } as unknown as HTMLCanvasElement;
  };
}

function candidatesOfKind(candidates: readonly DemoMaskCandidate[], kind: DemoMaskCandidate["kind"]) {
  return candidates.filter((candidate) => candidate.kind === kind);
}

describe("createDemoDocument", () => {
  it("Canvasだけで請求書・申込書・会員名簿の3ページを生成する", () => {
    const document = createDemoDocument(fakeCanvasFactory());

    expect(document.pages).toHaveLength(3);
    expect(document.pages.map((page) => page.kind)).toEqual(["invoice", "application", "member-roster"]);
    expect(document.pages.map((page) => page.pageNumber)).toEqual([1, 2, 3]);
    expect(document.pages.every((page) => page.width === 1200 && page.height === 1600)).toBe(true);
    expect(document.pages.every((page) => page.mimeType === "image/png")).toBe(true);
    expect(document.pages.every((page) => page.dataUrl.startsWith("data:image/png;base64,"))).toBe(true);
  });

  it("全候補を未確定のpendingとして返し、boxを0〜1へ正規化する", () => {
    const document = createDemoDocument(fakeCanvasFactory());
    const candidates = document.pages.flatMap((page) => page.candidates);

    expect(candidates.length).toBeGreaterThanOrEqual(24);
    expect(document.totalCandidates).toBe(candidates.length);
    expect(new Set(candidates.map((candidate) => candidate.kind))).toEqual(new Set([
      "name",
      "email",
      "phone",
      "postal-code",
      "address",
      "numeric-id",
    ]));
    candidates.forEach((candidate) => {
      expect(candidate.status).toBe("pending");
      expect(candidate.source).toBe("ocr");
      expect(candidate.fixtureSource).toBe("demo-fixture");
      expect(candidate.pageIndex).toBeGreaterThanOrEqual(0);
      expect(candidate.rects).toEqual([candidate.box]);
      expect(candidate.box.x).toBeGreaterThanOrEqual(0);
      expect(candidate.box.y).toBeGreaterThanOrEqual(0);
      expect(candidate.box.width).toBeGreaterThan(0);
      expect(candidate.box.height).toBeGreaterThan(0);
      expect(candidate.box.x + candidate.box.width).toBeLessThanOrEqual(1);
      expect(candidate.box.y + candidate.box.height).toBeLessThanOrEqual(1);
    });
  });

  it("実在連絡先を避け、予約済みdomainと明示的な無効値だけを使用する", () => {
    const document = createDemoDocument(fakeCanvasFactory());
    const candidates = document.pages.flatMap((page) => page.candidates);

    candidatesOfKind(candidates, "email").forEach((candidate) => {
      expect(candidate.text).toMatch(/^[a-z0-9]+@[a-z0-9]+\.example\.test$/i);
    });
    candidatesOfKind(candidates, "phone").forEach((candidate) => {
      expect(candidate.text).toMatch(/^000-/);
    });
    candidatesOfKind(candidates, "postal-code").forEach((candidate) => {
      expect(candidate.text).toBe("〒000-0000");
    });
    candidatesOfKind(candidates, "numeric-id").forEach((candidate) => {
      expect(candidate.text).toContain("DEMO");
    });
    candidatesOfKind(candidates, "name").forEach((candidate) => {
      expect(candidate.text).toContain("架空");
    });
    candidatesOfKind(candidates, "address").forEach((candidate) => {
      expect(candidate.text).toContain("架空県");
    });
  });

  it("候補をOCR tokenと検索用textへ同じ座標・文言で接続する", () => {
    const document = createDemoDocument(fakeCanvasFactory());

    document.pages.forEach((page) => {
      expect(page.ocrTokens.length).toBeGreaterThan(page.candidates.length);
      page.candidates.forEach((candidate) => {
        const token = page.ocrTokens.find((item) => item.candidateId === candidate.id);
        expect(token?.text).toBe(candidate.text);
        expect(token?.box).toEqual(candidate.box);
        expect(page.searchText).toContain(candidate.text);
        expect(page.searchTokens).toContain(candidate.text.normalize("NFKC").toLocaleLowerCase("ja-JP"));
      });
    });
  });
});
