import { PDFDocument } from "pdf-lib";
import { describe, expect, it, vi } from "vitest";

import {
  blurImageDataInPlace,
  composeRedactionsToCanvas,
  exportCanvasAsBlob,
  normalizedRectToPixelRect,
  rebuildPdfFromRasterizedPages,
  validateFlattenedPdf,
  type CanvasFactory,
  type PdfJsDocumentLike,
} from "./redaction-engine";
import type { Redaction } from "./types";

interface PixelSource {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
}

interface PixelCanvas extends PixelSource {
  canvas: HTMLCanvasElement;
}

function makePixels(
  width: number,
  height: number,
  color: readonly [number, number, number, number],
): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let offset = 0; offset < pixels.length; offset += 4) {
    pixels.set(color, offset);
  }
  return pixels;
}

function setPixel(
  pixels: Uint8ClampedArray,
  width: number,
  x: number,
  y: number,
  color: readonly [number, number, number, number],
): void {
  pixels.set(color, (y * width + x) * 4);
}

function getPixel(
  pixels: Uint8ClampedArray,
  width: number,
  x: number,
  y: number,
): [number, number, number, number] {
  const offset = (y * width + x) * 4;
  return [
    pixels[offset],
    pixels[offset + 1],
    pixels[offset + 2],
    pixels[offset + 3],
  ];
}

function createPixelCanvas(width: number, height: number): PixelCanvas {
  const state: PixelCanvas = {
    width,
    height,
    pixels: makePixels(width, height, [0, 0, 0, 0]),
    canvas: null as unknown as HTMLCanvasElement,
  };

  const context = {
    fillStyle: "#000000",
    drawImage(source: CanvasImageSource) {
      const pixelSource = source as unknown as PixelSource;
      if (
        pixelSource.width !== state.width ||
        pixelSource.height !== state.height
      ) {
        throw new Error("The test canvas only supports 1:1 draws.");
      }
      state.pixels.set(pixelSource.pixels);
    },
    getImageData(x: number, y: number, regionWidth: number, regionHeight: number) {
      const data = new Uint8ClampedArray(regionWidth * regionHeight * 4);
      for (let regionY = 0; regionY < regionHeight; regionY += 1) {
        for (let regionX = 0; regionX < regionWidth; regionX += 1) {
          const sourceOffset =
            ((y + regionY) * state.width + x + regionX) * 4;
          const targetOffset =
            (regionY * regionWidth + regionX) * 4;
          data.set(state.pixels.subarray(sourceOffset, sourceOffset + 4), targetOffset);
        }
      }
      return {
        data,
        width: regionWidth,
        height: regionHeight,
        colorSpace: "srgb",
      } as ImageData;
    },
    putImageData(imageData: ImageData, x: number, y: number) {
      for (let regionY = 0; regionY < imageData.height; regionY += 1) {
        for (let regionX = 0; regionX < imageData.width; regionX += 1) {
          const sourceOffset =
            (regionY * imageData.width + regionX) * 4;
          const targetOffset =
            ((y + regionY) * state.width + x + regionX) * 4;
          state.pixels.set(
            imageData.data.subarray(sourceOffset, sourceOffset + 4),
            targetOffset,
          );
        }
      }
    },
    fillRect(x: number, y: number, regionWidth: number, regionHeight: number) {
      for (let regionY = y; regionY < y + regionHeight; regionY += 1) {
        for (let regionX = x; regionX < x + regionWidth; regionX += 1) {
          setPixel(
            state.pixels,
            state.width,
            regionX,
            regionY,
            [0, 0, 0, 255],
          );
        }
      }
    },
  };

  state.canvas = {
    width,
    height,
    getContext: () => context,
    get pixels() {
      return state.pixels;
    },
  } as unknown as HTMLCanvasElement;

  return state;
}

function createCanvasHarness(): {
  factory: CanvasFactory;
  created: PixelCanvas[];
} {
  const created: PixelCanvas[] = [];
  return {
    created,
    factory(width, height) {
      const canvas = createPixelCanvas(width, height);
      created.push(canvas);
      return canvas.canvas;
    },
  };
}

function redaction(
  overrides: Partial<Redaction> & Pick<Redaction, "id" | "rect" | "mode">,
): Redaction {
  return {
    pageIndex: 0,
    source: "manual",
    ...overrides,
  };
}

describe("normalizedRectToPixelRect", () => {
  it("clamps selections and rounds their outer edges outward", () => {
    expect(
      normalizedRectToPixelRect(
        { x: -0.1, y: 0.8, width: 0.3, height: 0.4 },
        10,
        10,
      ),
    ).toEqual({ x: 0, y: 8, width: 2, height: 2 });
  });

  it("supports a rectangle drawn in the reverse direction", () => {
    expect(
      normalizedRectToPixelRect(
        { x: 0.76, y: 0.81, width: -0.5, height: -0.61 },
        10,
        10,
      ),
    ).toEqual({ x: 2, y: 2, width: 6, height: 7 });
  });
});

describe("blurImageDataInPlace", () => {
  it("spreads pixels without using a canvas filter", () => {
    const imageData = {
      width: 3,
      height: 1,
      data: new Uint8ClampedArray([
        0, 0, 0, 255,
        255, 255, 255, 255,
        0, 0, 0, 255,
      ]),
    } as ImageData;

    expect(blurImageDataInPlace(imageData, 1, 1)).toBe(imageData);
    expect(imageData.data[0]).toBeGreaterThan(0);
    expect(imageData.data[4]).toBeLessThan(255);
    expect(imageData.data[8]).toBeGreaterThan(0);
    expect([imageData.data[3], imageData.data[7], imageData.data[11]]).toEqual([
      255,
      255,
      255,
    ]);
  });
});

describe("composeRedactionsToCanvas", () => {
  it("draws the source into a fresh canvas and applies only the selected page", () => {
    const source: PixelSource = {
      width: 4,
      height: 2,
      pixels: makePixels(4, 2, [255, 255, 255, 255]),
    };
    const harness = createCanvasHarness();

    const canvas = composeRedactionsToCanvas(
      source as unknown as CanvasImageSource,
      [
        redaction({
          id: "visible",
          mode: "black",
          rect: { x: 0.5, y: 0, width: 0.5, height: 0.5 },
        }),
        redaction({
          id: "other-page",
          pageIndex: 1,
          mode: "black",
          rect: { x: 0, y: 0, width: 1, height: 1 },
        }),
      ],
      { pageIndex: 0, canvasFactory: harness.factory },
    );

    expect(canvas).not.toBe(source);
    expect(harness.created).toHaveLength(1);
    const output = harness.created[0].pixels;
    expect(getPixel(output, 4, 0, 0)).toEqual([255, 255, 255, 255]);
    expect(getPixel(output, 4, 2, 0)).toEqual([0, 0, 0, 255]);
    expect(getPixel(output, 4, 3, 0)).toEqual([0, 0, 0, 255]);
    expect(getPixel(output, 4, 2, 1)).toEqual([255, 255, 255, 255]);
  });

  it("uses ImageData blur and keeps overlapping black masks fully opaque", () => {
    const source: PixelSource = {
      width: 3,
      height: 1,
      pixels: makePixels(3, 1, [0, 0, 0, 255]),
    };
    setPixel(source.pixels, source.width, 1, 0, [255, 255, 255, 255]);
    const harness = createCanvasHarness();

    composeRedactionsToCanvas(
      source as unknown as CanvasImageSource,
      [
        redaction({
          id: "black-wins",
          mode: "black",
          rect: { x: 1 / 3, y: 0, width: 1 / 3, height: 1 },
        }),
        redaction({
          id: "blur",
          mode: "blur",
          rect: { x: 0, y: 0, width: 1, height: 1 },
        }),
      ],
      {
        pageIndex: 0,
        blurRadius: 1,
        blurPasses: 1,
        canvasFactory: harness.factory,
      },
    );

    const output = harness.created[0].pixels;
    expect(getPixel(output, 3, 0, 0)[0]).toBeGreaterThan(0);
    expect(getPixel(output, 3, 1, 0)).toEqual([0, 0, 0, 255]);
    expect(getPixel(output, 3, 2, 0)[0]).toBeGreaterThan(0);
  });
});

describe("exportCanvasAsBlob", () => {
  it.each([
    { format: "png" as const, mimeType: "image/png", quality: undefined },
    { format: "jpeg" as const, mimeType: "image/jpeg", quality: 0.74 },
  ])("exports $format locally", async ({ format, mimeType, quality }) => {
    const encoder = vi.fn(
      (callback: BlobCallback, type?: string, passedQuality?: number) => {
        expect(type).toBe(mimeType);
        expect(passedQuality).toBe(quality);
        callback(new Blob(["encoded"], { type }));
      },
    );

    const blob = await exportCanvasAsBlob(
      { toBlob: encoder },
      { format, quality },
    );

    expect(blob.type).toBe(mimeType);
    expect(blob.size).toBeGreaterThan(0);
    expect(encoder).toHaveBeenCalledOnce();
  });

  it("falls back to a canvas data URL when toBlob is unavailable", async () => {
    const blob = await exportCanvasAsBlob(
      { toDataURL: () => "data:image/png;base64,AQID" },
      { format: "png" },
    );

    expect(blob.type).toBe("image/png");
    expect(Array.from(new Uint8Array(await blob.arrayBuffer()))).toEqual([
      1, 2, 3,
    ]);
  });
});

describe("rebuildPdfFromRasterizedPages", () => {
  it("creates a fresh image-only PDF with the requested page sizes", async () => {
    const png = new Uint8Array(
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        "base64",
      ),
    );

    const bytes = await rebuildPdfFromRasterizedPages([
      { image: png, mimeType: "image/png", pageWidth: 612, pageHeight: 792 },
      { image: png, pageWidth: 400 },
    ]);
    const document = await PDFDocument.load(bytes);

    expect(document.getPageCount()).toBe(2);
    expect(document.getPage(0).getSize()).toEqual({ width: 612, height: 792 });
    expect(document.getPage(1).getSize()).toEqual({ width: 400, height: 400 });
  });
});

describe("validateFlattenedPdf", () => {
  it("reports page count mismatches and any remaining text layer", async () => {
    const documentLike: PdfJsDocumentLike = {
      numPages: 2,
      async getPage(pageNumber) {
        return {
          async getTextContent() {
            return {
              items: pageNumber === 1 ? [] : [{ str: "still searchable" }],
            };
          },
        };
      },
    };

    const report = await validateFlattenedPdf(documentLike, {
      expectedPageCount: 3,
    });

    expect(report).toMatchObject({
      pageCount: 2,
      expectedPageCount: 3,
      pageCountMatches: false,
      textLayerAbsent: false,
      checksPassed: false,
    });
    expect(report.pages).toEqual([
      {
        pageNumber: 1,
        textItemCount: 0,
        extractedTextCharacters: 0,
        hasTextLayer: false,
      },
      {
        pageNumber: 2,
        textItemCount: 1,
        extractedTextCharacters: 16,
        hasTextLayer: true,
      },
    ]);
  });

  it("accepts a PDF.js-style loading task and disposes its document", async () => {
    const destroy = vi.fn();
    const documentLike: PdfJsDocumentLike = {
      numPages: 2,
      async getPage() {
        return { async getTextContent() { return { items: [] }; } };
      },
      destroy,
    };
    const loader = vi.fn((input: { data: Uint8Array }) => {
      expect(input.data).toBeInstanceOf(Uint8Array);
      return { promise: Promise.resolve(documentLike) };
    });
    const source = new Uint8Array([1, 2, 3]);

    const report = await validateFlattenedPdf(source, {
      loader,
      expectedPageCount: 2,
    });

    expect(report).toMatchObject({
      pageCount: 2,
      pageCountMatches: true,
      textLayerAbsent: true,
      checksPassed: true,
    });
    expect(loader).toHaveBeenCalledOnce();
    expect(loader.mock.calls[0][0].data).not.toBe(source);
    expect(destroy).toHaveBeenCalledOnce();
  });
});
