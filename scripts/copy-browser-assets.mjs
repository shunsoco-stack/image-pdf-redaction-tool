import { copyFile, cp, mkdir } from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const pdfjsRoot = path.join(projectRoot, "node_modules", "pdfjs-dist");
const publicRoot = path.join(projectRoot, "public");
const assetRoot = path.join(publicRoot, "pdfjs");
const assetDirectories = ["cmaps", "standard_fonts", "wasm", "iccs"];
const ocrRoot = path.join(publicRoot, "ocr");
const ocrLanguageRoot = path.join(ocrRoot, "lang");

await mkdir(assetRoot, { recursive: true });
await copyFile(
  path.join(pdfjsRoot, "build", "pdf.worker.min.mjs"),
  path.join(publicRoot, "pdf.worker.min.mjs"),
);
await Promise.all(
  assetDirectories.map((directory) =>
    cp(path.join(pdfjsRoot, directory), path.join(assetRoot, directory), {
      recursive: true,
      force: true,
    }),
  ),
);

await mkdir(ocrLanguageRoot, { recursive: true });
await copyFile(
  path.join(projectRoot, "node_modules", "tesseract.js", "dist", "worker.min.js"),
  path.join(ocrRoot, "worker.min.js"),
);
await cp(
  path.join(projectRoot, "node_modules", "tesseract.js-core"),
  path.join(ocrRoot, "core"),
  { recursive: true, force: true },
);
for (const language of ["eng", "jpn"]) {
  await copyFile(
    path.join(
      projectRoot,
      "node_modules",
      "@tesseract.js-data",
      language,
      "4.0.0_best_int",
      `${language}.traineddata.gz`,
    ),
    path.join(ocrLanguageRoot, `${language}.traineddata.gz`),
  );
}
