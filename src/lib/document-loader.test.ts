import { describe, expect, it } from "vitest";

import { detectSupportedMime, extractPdfTokens } from "./document-loader";

describe("detectSupportedMime", () => {
  it("accepts only stable PNG, JPEG, and PDF signatures", () => {
    expect(detectSupportedMime(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]))).toBe(
      "application/pdf",
    );
    expect(
      detectSupportedMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    ).toBe("image/png");
    expect(detectSupportedMime(new Uint8Array([0xff, 0xd8, 0xff, 0xdb]))).toBe(
      "image/jpeg",
    );
    expect(detectSupportedMime(new Uint8Array([0x52, 0x49, 0x46, 0x46]), "image/webp")).toBe(
      undefined,
    );
  });

  it("does not trust a misleading MIME declaration when bytes are present", () => {
    expect(
      detectSupportedMime(new Uint8Array([1, 2, 3, 4]), "application/pdf", "wrong.pdf"),
    ).toBeUndefined();
  });
});

describe("extractPdfTokens", () => {
  const viewport = {
    width: 200,
    height: 200,
    transform: [2, 0, 0, -2, 0, 200],
  };
  const usePreparedMatrix = (_viewport: number[], item: number[]) => item;

  it("applies the viewport scale to PDF text-run widths", () => {
    const [token] = extractPdfTokens(
      [{ str: "masked", width: 50, transform: [10, 0, 0, -20, 20, 100] }],
      viewport,
      usePreparedMatrix,
    );

    expect(token.rect).toEqual({ x: 0.1, y: 0.4, width: 0.5, height: 0.1 });
  });

  it("uses transformed corner bounds for rotated PDF text", () => {
    const [token] = extractPdfTokens(
      [{ str: "rotated", width: 50, transform: [0, 10, 20, 0, 100, 20] }],
      viewport,
      usePreparedMatrix,
    );

    expect(token.rect).toEqual({ x: 0.5, y: 0.1, width: 0.1, height: 0.5 });
  });
});
