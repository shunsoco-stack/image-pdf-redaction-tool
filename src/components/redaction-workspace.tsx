/* eslint-disable @next/next/no-img-element -- User-provided data URLs must map 1:1 to canvas pixels. */
"use client";

import Image from "next/image";
import {
  AlertTriangle,
  ArrowLeftRight,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CloudOff,
  Columns2,
  Download,
  Eye,
  FileImage,
  FileText,
  Info,
  LockKeyhole,
  MousePointer2,
  Redo2,
  ScanSearch,
  Search,
  ShieldCheck,
  Sparkles,
  Square,
  Undo2,
  Upload,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { createDemoDocument, type DemoMaskCandidate } from "@/lib/demo-document";
import {
  DocumentLoadError,
  imageSourceFromDataUrl,
  loadDocumentFile,
  recognizePageText,
  terminateOcrWorker,
  type LoadedDocument,
  type LoadedPage,
  type ProcessingProgress,
} from "@/lib/document-loader";
import {
  createHistoryState,
  historyReducer,
  type HistoryAction,
  type HistoryState,
} from "@/lib/history";
import {
  composeRedactionsToCanvas,
  exportCanvasAsBlob,
  rebuildPdfFromRasterizedPages,
  validateFlattenedPdf,
  type PdfJsLoadingTaskLike,
  type PdfValidationReport,
} from "@/lib/redaction-engine";
import type {
  CandidateStatus,
  MaskCandidate,
  NormalizedRect,
  Redaction,
  RedactionMode,
  SensitiveDataKind,
} from "@/lib/types";

type WorkspaceView = "editor" | "compare" | "export";
type CandidateFilter = "all" | CandidateStatus;
type PreviewLayer = "original" | "masked";

interface ReviewState {
  candidates: MaskCandidate[];
  redactions: Redaction[];
}

interface Notice {
  tone: "info" | "success" | "warning" | "error";
  message: string;
}

interface MaskedPreview {
  key: string;
  url: string;
}

const EMPTY_REVIEW: ReviewState = { candidates: [], redactions: [] };

const KIND_LABELS: Record<SensitiveDataKind, string> = {
  name: "氏名",
  email: "メール",
  phone: "電話番号",
  "postal-code": "郵便番号",
  address: "住所",
  "numeric-id": "ID番号",
};

const WORKFLOW_STEPS = [
  "Upload",
  "Text / Area Detection",
  "Human Review",
  "Redaction",
  "Preview",
  "Export",
] as const;

function formatBytes(bytes: number) {
  if (bytes <= 0) return "ブラウザ生成デモ";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function makeId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function clamp(value: number, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum));
}

function rectFromPoints(start: { x: number; y: number }, end: { x: number; y: number }) {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  } satisfies NormalizedRect;
}

function expandRect(rect: NormalizedRect, padding = 0.0025): NormalizedRect {
  const x = clamp(rect.x - padding);
  const y = clamp(rect.y - padding);
  return {
    x,
    y,
    width: Math.min(1 - x, rect.width + padding * 2),
    height: Math.min(1 - y, rect.height + padding * 2),
  };
}

function cssRect(rect: NormalizedRect) {
  return {
    left: `${rect.x * 100}%`,
    top: `${rect.y * 100}%`,
    width: `${rect.width * 100}%`,
    height: `${rect.height * 100}%`,
  };
}

function filenameStem(name: string) {
  const withoutExtension = name.replace(/\.[^.]+$/, "").trim();
  return (withoutExtension || "document").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-");
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_500);
}

function candidateSourceLabel(candidate: MaskCandidate) {
  const fixture = (candidate as DemoMaskCandidate).fixtureSource === "demo-fixture";
  if (fixture) return "デモ検出";
  return candidate.source === "pdf-text" ? "PDFテキスト＋ルール" : "OCR＋ルール";
}

function createDemoWorkspace(): LoadedDocument {
  const demo = createDemoDocument();
  const pages: LoadedPage[] = demo.pages.map((page) => ({
    id: page.id,
    pageNumber: page.pageNumber,
    title: page.title,
    width: page.width,
    height: page.height,
    dataUrl: page.dataUrl,
    tokens: page.ocrTokens,
    searchText: page.searchText,
    pointWidth: 595.28,
    pointHeight: 841.89,
  }));
  return {
    id: demo.id,
    name: demo.name,
    mimeType: "application/pdf",
    size: 0,
    pages,
    candidates: demo.pages.flatMap((page) => page.candidates),
    demo: true,
  };
}

function sourceDescription(document: LoadedDocument) {
  if (document.demo) return "完全架空データ · 3ページ";
  if (document.mimeType === "application/pdf") return `PDF · ${document.pages.length}ページ`;
  return `${document.mimeType === "image/png" ? "PNG" : "JPEG"} · 1ページ`;
}

function noticeForError(error: unknown): Notice {
  if (error instanceof DOMException && error.name === "AbortError") {
    return { tone: "info", message: "処理をキャンセルしました。ファイルは送信されていません。" };
  }
  if (error instanceof DocumentLoadError) return { tone: "error", message: error.message };
  return {
    tone: "error",
    message: error instanceof Error ? error.message : "処理に失敗しました。別のファイルでお試しください。",
  };
}

export function RedactionWorkspace() {
  const inputRef = useRef<HTMLInputElement>(null);
  const activeControllerRef = useRef<AbortController | null>(null);
  const drawStartRef = useRef<{ x: number; y: number } | null>(null);
  const drawPointerRef = useRef<number | null>(null);
  const comparePointerRef = useRef<number | null>(null);

  const [workspaceDocument, setWorkspaceDocument] = useState<LoadedDocument | null>(null);
  const [history, setHistory] = useState<HistoryState<ReviewState>>(() =>
    createHistoryState(EMPTY_REVIEW),
  );
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [view, setView] = useState<WorkspaceView>("editor");
  const [previewLayer, setPreviewLayer] = useState<PreviewLayer>("masked");
  const [tool, setTool] = useState<"pan" | "draw">("pan");
  const [maskMode, setMaskMode] = useState<RedactionMode>("black");
  const [draftRect, setDraftRect] = useState<NormalizedRect | null>(null);
  const [zoom, setZoom] = useState(1);
  const [compareSplit, setCompareSplit] = useState(52);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<CandidateFilter>("all");
  const [highlightedCandidateId, setHighlightedCandidateId] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProcessingProgress | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [maskedPreview, setMaskedPreview] = useState<MaskedPreview | null>(null);
  const [validation, setValidation] = useState<PdfValidationReport | null>(null);
  const [lastExportName, setLastExportName] = useState<string | null>(null);

  const review = history.present;
  const currentPage = workspaceDocument?.pages[currentPageIndex] ?? null;
  const pageRedactions = review.redactions.filter(
    (redaction) => redaction.pageIndex === currentPageIndex,
  );
  const pageCandidates = review.candidates.filter(
    (candidate) => candidate.pageIndex === currentPageIndex,
  );

  const pendingCount = review.candidates.filter((candidate) => candidate.status === "pending").length;
  const acceptedCount = review.candidates.filter((candidate) => candidate.status === "accepted").length;
  const ignoredCount = review.candidates.filter((candidate) => candidate.status === "ignored").length;
  const maskedPreviewKey = currentPage
    ? `${currentPage.id}:${pageRedactions
        .map((redaction) => `${redaction.id}:${redaction.mode}:${Object.values(redaction.rect).join(",")}`)
        .join("|")}`
    : null;
  const maskedDataUrl =
    maskedPreviewKey && maskedPreview?.key === maskedPreviewKey ? maskedPreview.url : null;

  const filteredCandidates = useMemo(() => {
    const normalizedQuery = query.trim().normalize("NFKC").toLocaleLowerCase("ja");
    return review.candidates.filter((candidate) => {
      if (filter !== "all" && candidate.status !== filter) return false;
      if (!normalizedQuery) return true;
      return (
        candidate.text.normalize("NFKC").toLocaleLowerCase("ja").includes(normalizedQuery) ||
        KIND_LABELS[candidate.kind].includes(normalizedQuery)
      );
    });
  }, [filter, query, review.candidates]);

  const textSearchPages = useMemo(() => {
    const normalizedQuery = query.trim().normalize("NFKC").toLocaleLowerCase("ja");
    if (!normalizedQuery || !workspaceDocument) return [];
    return workspaceDocument.pages.filter((page) =>
      page.searchText.normalize("NFKC").toLocaleLowerCase("ja").includes(normalizedQuery),
    );
  }, [query, workspaceDocument]);

  const dispatchHistory = useCallback((action: HistoryAction<ReviewState>) => {
    setHistory((current) => historyReducer(current, action));
  }, []);

  const replaceWorkspace = useCallback((document: LoadedDocument) => {
    setWorkspaceDocument(document);
    setCurrentPageIndex(0);
    setView("editor");
    setPreviewLayer("masked");
    setTool("pan");
    setQuery("");
    setFilter("all");
    setValidation(null);
    setLastExportName(null);
    setNotice(
      document.demo
        ? {
            tone: "info",
            message: "完全架空の3ページデモです。候補はまだ1件も確定していません。",
          }
        : {
            tone: "success",
            message: `${document.name} をブラウザ内で読み込みました。候補を確認してください。`,
          },
    );
    dispatchHistory({
      type: "reset",
      next: { candidates: document.candidates, redactions: [] },
    });
  }, [dispatchHistory]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      replaceWorkspace(createDemoWorkspace());
    });
    return () => {
      window.cancelAnimationFrame(frame);
      activeControllerRef.current?.abort();
      void terminateOcrWorker();
    };
  }, [replaceWorkspace]);

  useEffect(() => {
    if (!currentPage || !maskedPreviewKey) return;
    let cancelled = false;
    imageSourceFromDataUrl(currentPage.dataUrl)
      .then((image) =>
        composeRedactionsToCanvas(image, review.redactions, {
          pageIndex: currentPageIndex,
          width: currentPage.width,
          height: currentPage.height,
        }).toDataURL("image/png"),
      )
      .then((url) => {
        if (!cancelled) setMaskedPreview({ key: maskedPreviewKey, url });
      })
      .catch(() => {
        if (!cancelled) {
          setNotice({
            tone: "error",
            message: "マスク後プレビューを生成できませんでした。書き出し前に再読み込みしてください。",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [currentPage, currentPageIndex, maskedPreviewKey, review.redactions]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const modifier = event.metaKey || event.ctrlKey;
      if (!modifier) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
      ) {
        return;
      }
      if (event.key.toLowerCase() === "z") {
        event.preventDefault();
        dispatchHistory({ type: event.shiftKey ? "redo" : "undo" });
      } else if (event.key.toLowerCase() === "y") {
        event.preventDefault();
        dispatchHistory({ type: "redo" });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dispatchHistory]);

  const loadFile = useCallback(async (file: File) => {
    activeControllerRef.current?.abort();
    const controller = new AbortController();
    activeControllerRef.current = controller;
    setNotice(null);
    setProgress({ phase: "reading", progress: 0.01, message: "ファイルを確認中" });
    try {
      let loaded = await loadDocumentFile(file, setProgress, controller.signal);
      let ocrWarning: Notice | null = null;
      if (loaded.mimeType !== "application/pdf") {
        try {
          const recognized = await recognizePageText(
            loaded.pages[0],
            0,
            setProgress,
            controller.signal,
          );
          loaded = {
            ...loaded,
            pages: [{ ...loaded.pages[0], tokens: recognized.tokens, searchText: recognized.searchText }],
            candidates: recognized.candidates,
          };
        } catch (ocrError) {
          if (controller.signal.aborted) throw ocrError;
          ocrWarning = {
            tone: "warning",
            message: "画像は読み込みましたがOCR候補を取得できませんでした。手動範囲選択は利用できます。",
          };
        }
      }
      replaceWorkspace(loaded);
      if (ocrWarning) setNotice(ocrWarning);
    } catch (error) {
      setNotice(noticeForError(error));
    } finally {
      if (activeControllerRef.current === controller) activeControllerRef.current = null;
      setProgress(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }, [replaceWorkspace]);

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void loadFile(file);
  };

  const onDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) void loadFile(file);
  };

  const runOcr = useCallback(async (allPages: boolean) => {
    if (!workspaceDocument) return;
    activeControllerRef.current?.abort();
    const controller = new AbortController();
    activeControllerRef.current = controller;
    const targetIndexes = allPages
      ? workspaceDocument.pages.map((_, index) => index)
      : [currentPageIndex];
    const pages = [...workspaceDocument.pages];
    const supersededOcrCandidateIds = new Set(
      review.candidates
        .filter(
          (candidate) =>
            targetIndexes.includes(candidate.pageIndex) && candidate.source === "ocr",
        )
        .map((candidate) => candidate.id),
    );
    let candidates = review.candidates.filter(
      (candidate) =>
        !targetIndexes.includes(candidate.pageIndex) || candidate.source !== "ocr",
    );

    try {
      for (let position = 0; position < targetIndexes.length; position += 1) {
        const pageIndex = targetIndexes[position];
        const result = await recognizePageText(
          pages[pageIndex],
          pageIndex,
          (update) =>
            setProgress({
              ...update,
              message: allPages
                ? `${pageIndex + 1} / ${pages.length}ページ · ${update.message}`
                : update.message,
            }),
          controller.signal,
        );
        pages[pageIndex] = {
          ...pages[pageIndex],
          tokens: result.tokens,
          searchText: result.searchText,
        };
        candidates = [...candidates, ...result.candidates];
      }
      const updatedDocument = { ...workspaceDocument, pages, candidates, demo: false };
      setWorkspaceDocument(updatedDocument);
      dispatchHistory({
        type: "commit",
        next: {
          candidates,
          redactions: review.redactions.filter(
            (redaction) =>
              !redaction.candidateId || !supersededOcrCandidateIds.has(redaction.candidateId),
          ),
        },
      });
      setNotice({
        tone: "success",
        message: `${allPages ? "全ページ" : `ページ${currentPageIndex + 1}`}のOCRが完了しました。${candidates.length}件の候補を確認できます。`,
      });
    } catch (error) {
      setNotice(noticeForError(error));
    } finally {
      if (activeControllerRef.current === controller) activeControllerRef.current = null;
      setProgress(null);
    }
  }, [currentPageIndex, dispatchHistory, review.candidates, review.redactions, workspaceDocument]);

  const decideCandidate = useCallback((candidateId: string, status: "accepted" | "ignored") => {
    const candidate = review.candidates.find((item) => item.id === candidateId);
    if (!candidate) return;
    const candidates = review.candidates.map((item) =>
      item.id === candidateId ? { ...item, status } : item,
    );
    const withoutLinked = review.redactions.filter(
      (redaction) => redaction.candidateId !== candidateId,
    );
    const linked =
      status === "accepted"
        ? candidate.rects.map((rect, index) => ({
            id: makeId(`candidate-mask-${index}`),
            pageIndex: candidate.pageIndex,
            rect: expandRect(rect),
            mode: maskMode,
            source: "candidate" as const,
            candidateId,
          }))
        : [];
    dispatchHistory({
      type: "commit",
      next: { candidates, redactions: [...withoutLinked, ...linked] },
    });
    setHighlightedCandidateId(candidateId);
    setCurrentPageIndex(candidate.pageIndex);
    setPreviewLayer("masked");
  }, [dispatchHistory, maskMode, review.candidates, review.redactions]);

  const resetCandidate = useCallback((candidateId: string) => {
    dispatchHistory({
      type: "commit",
      next: {
        candidates: review.candidates.map((candidate) =>
          candidate.id === candidateId ? { ...candidate, status: "pending" } : candidate,
        ),
        redactions: review.redactions.filter(
          (redaction) => redaction.candidateId !== candidateId,
        ),
      },
    });
  }, [dispatchHistory, review.candidates, review.redactions]);

  const acceptVisibleCandidates = useCallback(() => {
    const ids = new Set(
      filteredCandidates
        .filter((candidate) => candidate.status === "pending")
        .map((candidate) => candidate.id),
    );
    if (!ids.size) return;
    const additions: Redaction[] = [];
    const candidates = review.candidates.map((candidate) => {
      if (!ids.has(candidate.id)) return candidate;
      candidate.rects.forEach((rect, index) =>
        additions.push({
          id: makeId(`batch-mask-${index}`),
          pageIndex: candidate.pageIndex,
          rect: expandRect(rect),
          mode: maskMode,
          source: "candidate",
          candidateId: candidate.id,
        }),
      );
      return { ...candidate, status: "accepted" as const };
    });
    dispatchHistory({
      type: "commit",
      next: { candidates, redactions: [...review.redactions, ...additions] },
    });
    setPreviewLayer("masked");
    setNotice({ tone: "success", message: `${ids.size}件を1回の操作でマスクしました。Undoでまとめて戻せます。` });
  }, [dispatchHistory, filteredCandidates, maskMode, review.candidates, review.redactions]);

  const pointForEvent = (event: ReactPointerEvent<HTMLElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: clamp((event.clientX - bounds.left) / bounds.width),
      y: clamp((event.clientY - bounds.top) / bounds.height),
    };
  };

  const onDocumentPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (tool !== "draw" || view !== "editor") return;
    if (drawPointerRef.current !== null) return;
    if (event.pointerType === "mouse" ? event.button !== 0 : !event.isPrimary) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointForEvent(event);
    drawStartRef.current = point;
    drawPointerRef.current = event.pointerId;
    setDraftRect({ x: point.x, y: point.y, width: 0, height: 0 });
  };

  const onDocumentPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (drawPointerRef.current !== event.pointerId || !drawStartRef.current) return;
    event.preventDefault();
    setDraftRect(rectFromPoints(drawStartRef.current, pointForEvent(event)));
  };

  const finishDrawing = (event: ReactPointerEvent<HTMLDivElement>, commit = true) => {
    if (drawPointerRef.current !== event.pointerId) return;
    const start = drawStartRef.current;
    try {
      if (!commit || !start) return;
      const finalRect = rectFromPoints(start, pointForEvent(event));
      if (finalRect.width >= 0.008 && finalRect.height >= 0.006) {
        dispatchHistory({
          type: "commit",
          next: {
            candidates: review.candidates,
            redactions: [
              ...review.redactions,
              {
                id: makeId("manual-mask"),
                pageIndex: currentPageIndex,
                rect: finalRect,
                mode: maskMode,
                source: "manual",
              },
            ],
          },
        });
        setPreviewLayer("masked");
        setNotice({ tone: "success", message: "手動マスクを追加しました。Undoで取り消せます。" });
      }
    } finally {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      drawStartRef.current = null;
      drawPointerRef.current = null;
      setDraftRect(null);
    }
  };

  const updateCompareSplit = (event: ReactPointerEvent<HTMLElement>) => {
    const frame = event.currentTarget.closest(".document-frame")?.getBoundingClientRect();
    if (!frame) return;
    setCompareSplit(clamp((event.clientX - frame.left) / frame.width) * 100);
  };

  const onComparePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    comparePointerRef.current = event.pointerId;
    updateCompareSplit(event);
  };

  const onComparePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (comparePointerRef.current !== event.pointerId) return;
    updateCompareSplit(event);
  };

  const onComparePointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (comparePointerRef.current === event.pointerId) comparePointerRef.current = null;
  };

  const composePage = useCallback(async (page: LoadedPage, pageIndex: number) => {
    const image = await imageSourceFromDataUrl(page.dataUrl);
    return composeRedactionsToCanvas(image, review.redactions, {
      pageIndex,
      width: page.width,
      height: page.height,
    });
  }, [review.redactions]);

  const exportImage = useCallback(async (format: "png" | "jpeg") => {
    if (!currentPage || !workspaceDocument) return;
    if (pendingCount > 0) {
      setNotice({
        tone: "warning",
        message: `未確認の候補が${pendingCount}件あります。すべて「マスクする」か「無視」を選んでください。`,
      });
      return;
    }
    if (!review.redactions.some((redaction) => redaction.pageIndex === currentPageIndex)) {
      setNotice({ tone: "warning", message: "現在のページにマスクを1件以上追加してください。" });
      return;
    }
    setProgress({ phase: "validating", progress: 0.25, message: "マスクを画像ピクセルへ焼き込み中" });
    try {
      const canvas = await composePage(currentPage, currentPageIndex);
      const blob = await exportCanvasAsBlob(canvas, { format, quality: 0.92 });
      const extension = format === "png" ? "png" : "jpg";
      const name = `${filenameStem(workspaceDocument.name)}-masked-page-${currentPageIndex + 1}.${extension}`;
      downloadBlob(blob, name);
      setLastExportName(name);
      setNotice({ tone: "success", message: `${name} をブラウザ内で生成しました。` });
    } catch (error) {
      setNotice(noticeForError(error));
    } finally {
      setProgress(null);
    }
  }, [composePage, currentPage, currentPageIndex, pendingCount, review.redactions, workspaceDocument]);

  const exportPdf = useCallback(async () => {
    if (!workspaceDocument) return;
    if (pendingCount > 0) {
      setNotice({
        tone: "warning",
        message: `未確認の候補が${pendingCount}件あります。すべて「マスクする」か「無視」を選んでください。`,
      });
      return;
    }
    if (review.redactions.length === 0) {
      setNotice({ tone: "warning", message: "マスクを1件以上追加してから書き出してください。" });
      return;
    }
    setValidation(null);
    setProgress({ phase: "rendering", progress: 0.03, message: "画像化PDFを準備中" });
    try {
      const rasterPages = [];
      for (let index = 0; index < workspaceDocument.pages.length; index += 1) {
        const page = workspaceDocument.pages[index];
        setProgress({
          phase: "rendering",
          progress: (index + 0.3) / (workspaceDocument.pages.length + 1),
          message: `${index + 1} / ${workspaceDocument.pages.length} ページへマスクを焼き込み中`,
        });
        const canvas = await composePage(page, index);
        rasterPages.push({
          image: await exportCanvasAsBlob(canvas, { format: "png" }),
          mimeType: "image/png" as const,
          pageWidth: page.pointWidth ?? page.width * 0.5,
          pageHeight: page.pointHeight ?? page.height * 0.5,
        });
      }

      const bytes = await rebuildPdfFromRasterizedPages(rasterPages);
      setProgress({ phase: "validating", progress: 0.9, message: "出力PDFのテキストレイヤーを検証中" });
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      const report = await validateFlattenedPdf(bytes, {
        expectedPageCount: workspaceDocument.pages.length,
        loader: ({ data }) =>
          pdfjs.getDocument({
            data: new Uint8Array(data),
            cMapUrl: "/pdfjs/cmaps/",
            cMapPacked: true,
            standardFontDataUrl: "/pdfjs/standard_fonts/",
            wasmUrl: "/pdfjs/wasm/",
            iccUrl: "/pdfjs/iccs/",
          }) as unknown as PdfJsLoadingTaskLike,
      });
      setValidation(report);
      if (!report.checksPassed) {
        setLastExportName(null);
        setNotice({
          tone: "warning",
          message: "PDFの構造検証を通過しなかったため、ダウンロードを停止しました。",
        });
        return;
      }
      const name = `${filenameStem(workspaceDocument.name)}-masked.pdf`;
      const owned = new Uint8Array(bytes.length);
      owned.set(bytes);
      downloadBlob(new Blob([owned.buffer], { type: "application/pdf" }), name);
      setLastExportName(name);
      setNotice({
        tone: "success",
        message: "画像化PDFを生成し、ページ数一致・テキストレイヤーなしを確認しました。",
      });
    } catch (error) {
      setNotice(noticeForError(error));
    } finally {
      setProgress(null);
    }
  }, [composePage, pendingCount, review.redactions.length, workspaceDocument]);

  const selectCandidate = (candidate: MaskCandidate) => {
    setCurrentPageIndex(candidate.pageIndex);
    setHighlightedCandidateId(candidate.id);
    setView("editor");
    window.setTimeout(() => setHighlightedCandidateId(null), 2_200);
  };

  const workflowState = (index: number) => {
    if (index === 0) return Boolean(workspaceDocument);
    if (index === 1) return review.candidates.length > 0;
    if (index === 2) return acceptedCount + ignoredCount > 0;
    if (index === 3) return review.redactions.length > 0;
    if (index === 4) return view === "compare" || view === "export" || Boolean(lastExportName);
    return Boolean(lastExportName);
  };

  const navigateWorkflow = (index: number) => {
    if (index === 0) inputRef.current?.click();
    else if (index === 1) void runOcr(false);
    else if (index === 2) {
      setView("editor");
      setFilter("pending");
    } else if (index === 3) {
      setView("editor");
      setTool("draw");
    } else if (index === 4) setView("compare");
    else setView("export");
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <Image
            className="brand-icon"
            src="/icons/image-pdf-redaction-tool.svg"
            alt=""
            width={42}
            height={42}
            priority
          />
          <div className="brand-copy">
            <h1>画像・PDF個人情報マスキングツール</h1>
            <p>Detect → Review → Redact → Validate → Export</p>
          </div>
        </div>
        <div className="topbar__actions">
          <div className="privacy-pill" title="サーバーへのファイル送信は行いません">
            <CloudOff size={14} aria-hidden="true" />
            ブラウザ内処理
          </div>
          <button
            className="button"
            type="button"
            aria-label="架空デモを読み込む"
            onClick={() => replaceWorkspace(createDemoWorkspace())}
          >
            <Sparkles size={15} aria-hidden="true" />
            <span>架空デモ</span>
          </button>
          <button
            className="button button--primary"
            type="button"
            aria-label="PNG・JPEG・PDFファイルを開く"
            onClick={() => inputRef.current?.click()}
          >
            <Upload size={15} aria-hidden="true" />
            <span>ファイルを開く</span>
          </button>
          <input
            ref={inputRef}
            className="visually-hidden"
            type="file"
            aria-label="マスキングするPNG・JPEG・PDFファイル"
            accept="image/png,image/jpeg,application/pdf,.png,.jpg,.jpeg,.pdf"
            onChange={onFileChange}
          />
        </div>
      </header>

      <div className="privacy-strip">
        <LockKeyhole size={14} aria-hidden="true" />
        ファイル・画像・認識テキストはブラウザ内で処理され、サーバーへ送信されません
      </div>

      <nav className="workflow-nav" aria-label="マスキング工程">
        {WORKFLOW_STEPS.map((label, index) => {
          const active =
            (index <= 3 && view === "editor" && (index === 3 ? tool === "draw" : index === 2)) ||
            (index === 4 && view === "compare") ||
            (index === 5 && view === "export");
          const complete = workflowState(index);
          return (
            <button
              key={label}
              className="view-step"
              type="button"
              aria-label={`${index + 1}. ${label}`}
              data-active={active}
              data-complete={complete && !active}
              onClick={() => navigateWorkflow(index)}
            >
              <span className="view-step__number" aria-hidden="true">
                {complete && !active ? <Check size={12} /> : index + 1}
              </span>
              <span className="view-step__label">{label}</span>
            </button>
          );
        })}
      </nav>

      <main className="workspace" onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>
        {notice ? (
          <div className={`notice notice--${notice.tone}`} role="status">
            {notice.tone === "success" ? <CheckCircle2 size={16} /> : <Info size={16} />}
            <span>{notice.message}</span>
            <button className="icon-button" type="button" aria-label="通知を閉じる" onClick={() => setNotice(null)}>
              <X size={14} />
            </button>
          </div>
        ) : null}

        <div className="workspace-grid">
          <aside className="panel page-rail" aria-label="ページ一覧">
            <div className="panel-heading">
              <h2>ページ</h2>
              <span className="count-badge">{workspaceDocument?.pages.length ?? 0}</span>
            </div>
            {workspaceDocument ? (
              <>
                <div className="file-summary">
                  <div className="file-summary__name" title={workspaceDocument.name}>
                    {workspaceDocument.name}
                  </div>
                  <div className="file-summary__meta">
                    {sourceDescription(workspaceDocument)} · {formatBytes(workspaceDocument.size)}
                  </div>
                </div>
                <div className="thumbnail-list">
                  {workspaceDocument.pages.map((page, index) => {
                    const masks = review.redactions.filter((item) => item.pageIndex === index).length;
                    return (
                      <button
                        key={page.id}
                        className="thumbnail-button"
                        type="button"
                        data-active={index === currentPageIndex}
                        onClick={() => setCurrentPageIndex(index)}
                        aria-label={`${page.title}へ移動`}
                      >
                        <img className="thumbnail-image" src={page.dataUrl} alt="" />
                        <span className="thumbnail-copy">
                          <strong>{page.title}</strong>
                          <span>{masks ? `${masks}箇所マスク` : "未マスク"}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="empty-state"><p>ページはまだありません</p></div>
            )}
          </aside>

          <section className="panel viewer-column" aria-label="Document Viewer">
            <div className="viewer-toolbar">
              <div className="toolbar-group">
                <button
                  className="tool-button"
                  type="button"
                  data-active={view === "editor" && tool === "pan"}
                  onClick={() => { setView("editor"); setTool("pan"); }}
                  title="確認モード"
                >
                  <MousePointer2 size={15} /> <span>確認</span>
                </button>
                <button
                  className="tool-button"
                  type="button"
                  data-active={view === "editor" && tool === "draw"}
                  onClick={() => { setView("editor"); setTool("draw"); setPreviewLayer("masked"); }}
                  title="Mouse / Touchで範囲を選択"
                >
                  <Square size={15} /> <span>範囲選択</span>
                </button>
                <div className="tool-divider" />
                <button
                  className="tool-button"
                  type="button"
                  data-active={view === "compare"}
                  onClick={() => setView("compare")}
                  title="Before / After"
                >
                  <Columns2 size={15} /> <span>比較</span>
                </button>
                <button
                  className="tool-button"
                  type="button"
                  data-active={view === "export"}
                  onClick={() => setView("export")}
                  title="書き出し"
                >
                  <Download size={15} /> <span>書き出し</span>
                </button>
              </div>
              <div className="toolbar-group">
                {view === "editor" ? (
                  <div className="segmented" role="group" aria-label="マスク方法">
                    <button type="button" aria-pressed={maskMode === "black"} onClick={() => setMaskMode("black")}>
                      黒塗り
                    </button>
                    <button type="button" aria-pressed={maskMode === "blur"} onClick={() => setMaskMode("blur")}>
                      Blur
                    </button>
                  </div>
                ) : null}
                <button className="icon-button" type="button" disabled={!history.past.length} onClick={() => dispatchHistory({ type: "undo" })} aria-label="元に戻す" title="元に戻す">
                  <Undo2 size={15} />
                </button>
                <button className="icon-button" type="button" disabled={!history.future.length} onClick={() => dispatchHistory({ type: "redo" })} aria-label="やり直す" title="やり直す">
                  <Redo2 size={15} />
                </button>
                <button className="icon-button" type="button" onClick={() => setZoom((value) => clamp(value - 0.1, 0.6, 1.5))} aria-label="縮小">
                  <ZoomOut size={15} />
                </button>
                <button className="icon-button" type="button" onClick={() => setZoom((value) => clamp(value + 0.1, 0.6, 1.5))} aria-label="拡大">
                  <ZoomIn size={15} />
                </button>
              </div>
            </div>

            <div className="viewer-stage" onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>
              {view === "export" ? (
                <div className="export-stage">
                  <div className="export-hero">
                    <div className="export-hero__icon"><ShieldCheck size={28} /></div>
                    <h2>マスク済みファイルを書き出す</h2>
                    <p>
                      PDFは各ページを画像化し、承認済み・手動マスクをピクセルへ焼き込んだ新しいPDFとして再構成します。
                    </p>
                  </div>
                  {pendingCount > 0 ? (
                    <div className="notice notice--warning" role="status">
                      <AlertTriangle size={16} /> 未確認の候補が{pendingCount}件あります。出力前にマスクするか無視を選んでください。
                    </div>
                  ) : review.redactions.length === 0 ? (
                    <div className="notice notice--warning" role="status">
                      <AlertTriangle size={16} /> マスクを1件以上追加すると書き出しできます。
                    </div>
                  ) : null}
                  {workspaceDocument?.mimeType === "application/pdf" || (workspaceDocument?.pages.length ?? 0) > 1 ? (
                    <div className="export-option">
                      <div className="export-option__icon"><FileText size={20} /></div>
                      <div>
                        <h3>画像化PDF</h3>
                        <p>元PDFのテキスト・フォーム・添付・メタデータをコピーしません</p>
                      </div>
                      <button
                        className="button button--primary"
                        type="button"
                        disabled={pendingCount > 0 || review.redactions.length === 0}
                        onClick={() => void exportPdf()}
                      >
                        <Download size={15} /> PDFを書き出す
                      </button>
                    </div>
                  ) : null}
                  <div className="export-option">
                    <div className="export-option__icon"><FileImage size={20} /></div>
                    <div>
                      <h3>現在のページを画像で保存</h3>
                      <p>新しい画像へマスクを焼き込みます</p>
                    </div>
                    <div className="inline-actions">
                      <button
                        className="button"
                        type="button"
                        disabled={pendingCount > 0 || pageRedactions.length === 0}
                        onClick={() => void exportImage("png")}
                      >PNG</button>
                      <button
                        className="button"
                        type="button"
                        disabled={pendingCount > 0 || pageRedactions.length === 0}
                        onClick={() => void exportImage("jpeg")}
                      >JPEG</button>
                    </div>
                  </div>
                  <div className="validation-card">
                    <CheckCircle2 size={21} />
                    <div>
                      <strong>
                        {validation?.checksPassed ? "画像化・テキストレイヤーなしを確認済み" : "出力時に構造を自動検証"}
                      </strong>
                      <p>
                        {validation
                          ? `${validation.pageCount}ページ · 全ページで抽出テキスト0件。これは構造検証であり、復元不能性の保証ではありません。`
                          : "ページ数とPDF.jsで抽出可能なテキストの有無を確認します。「完全削除」とは表現しません。"}
                      </p>
                    </div>
                  </div>
                  {lastExportName ? (
                    <div className="notice notice--success">
                      <CheckCircle2 size={16} /> 最新の出力：{lastExportName}
                    </div>
                  ) : null}
                </div>
              ) : currentPage ? (
                <div
                  className="document-frame"
                  data-tool={tool}
                  data-testid="document-frame"
                  style={{
                    aspectRatio: `${currentPage.width} / ${currentPage.height}`,
                    width: `min(100%, ${Math.round(540 * zoom)}px)`,
                  }}
                  onPointerDown={onDocumentPointerDown}
                  onPointerMove={onDocumentPointerMove}
                  onPointerUp={(event) => finishDrawing(event, true)}
                  onPointerCancel={(event) => finishDrawing(event, false)}
                >
                  {view === "compare" ? (
                    <div className="compare-wrap">
                      <img className="document-image" src={currentPage.dataUrl} alt={`${currentPage.title}の原本`} draggable={false} />
                      <div
                        className="compare-after"
                        style={{ clipPath: `inset(0 0 0 ${compareSplit}%)` }}
                        aria-busy={!maskedDataUrl}
                      >
                        {maskedDataUrl ? (
                          <img src={maskedDataUrl} alt={`${currentPage.title}のマスク後`} draggable={false} />
                        ) : (
                          <div className="compare-pending" role="status">
                            <span className="spinner" aria-hidden="true" /> マスク後を生成中
                          </div>
                        )}
                      </div>
                      <span className="compare-label compare-label--before">Original</span>
                      <span className="compare-label compare-label--after">
                        {maskedDataUrl ? "Masked" : "生成中"}
                      </span>
                      <span className="compare-divider" style={{ left: `${compareSplit}%` }} />
                      <button
                        className="compare-handle"
                        type="button"
                        role="slider"
                        aria-label="OriginalとMaskedの比較位置"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Math.round(compareSplit)}
                        style={{ left: `${compareSplit}%` }}
                        onPointerDown={onComparePointerDown}
                        onPointerMove={onComparePointerMove}
                        onPointerUp={onComparePointerUp}
                        onPointerCancel={onComparePointerUp}
                        onKeyDown={(event) => {
                          if (event.key === "ArrowLeft") setCompareSplit((value) => clamp(value - 2, 0, 100));
                          if (event.key === "ArrowRight") setCompareSplit((value) => clamp(value + 2, 0, 100));
                        }}
                      >
                        <ArrowLeftRight size={18} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <img
                        className="document-image"
                        src={currentPage.dataUrl}
                        alt={`${currentPage.title}${previewLayer === "original" ? "の原本" : "のマスク後"}`}
                        draggable={false}
                      />
                      {previewLayer === "masked" ? (
                        <div className="mask-layer" aria-hidden="true">
                          {pageRedactions.map((redaction) => (
                            <span
                              key={redaction.id}
                              className="redaction-box"
                              data-style={redaction.mode}
                              style={cssRect(redaction.rect)}
                            />
                          ))}
                        </div>
                      ) : null}
                      <div className="candidate-layer" aria-hidden="true">
                        {pageCandidates
                          .filter((candidate) => candidate.status === "pending")
                          .flatMap((candidate) =>
                            candidate.rects.map((rect, index) => (
                              <span
                                key={`${candidate.id}-${index}`}
                                className="candidate-box"
                                data-highlighted={candidate.id === highlightedCandidateId}
                                style={cssRect(rect)}
                              >
                                <span className="candidate-label">{KIND_LABELS[candidate.kind]}</span>
                              </span>
                            )),
                          )}
                      </div>
                      {draftRect ? <span className="draft-box" style={cssRect(draftRect)} aria-hidden="true" /> : null}
                    </>
                  )}
                </div>
              ) : (
                <div className="empty-state">
                  <div>
                    <Upload size={34} />
                    <p>PNG・JPEG・PDFをドロップしてください</p>
                  </div>
                </div>
              )}
            </div>

            <div className="viewer-footer">
              <div className="toolbar-group">
                {view === "editor" ? (
                  <div className="segmented" role="group" aria-label="表示切替">
                    <button type="button" aria-pressed={previewLayer === "original"} onClick={() => setPreviewLayer("original")}>Original</button>
                    <button type="button" aria-pressed={previewLayer === "masked"} onClick={() => setPreviewLayer("masked")}>Masked</button>
                  </div>
                ) : (
                  <span className="viewer-footer__status"><Columns2 size={14} /> Original / Masked 比較</span>
                )}
                <button className="icon-button" type="button" disabled={currentPageIndex <= 0} onClick={() => setCurrentPageIndex((index) => index - 1)} aria-label="前のページ"><ChevronLeft size={15} /></button>
                <span>{currentPageIndex + 1} / {workspaceDocument?.pages.length ?? 0}</span>
                <button className="icon-button" type="button" disabled={!workspaceDocument || currentPageIndex >= workspaceDocument.pages.length - 1} onClick={() => setCurrentPageIndex((index) => index + 1)} aria-label="次のページ"><ChevronRight size={15} /></button>
              </div>
              <div className="viewer-footer__status">
                <ShieldCheck size={14} /> {review.redactions.length}箇所をマスク
              </div>
              {maskMode === "blur" && view === "editor" ? (
                <span>Blurは視覚的秘匿です。高機密情報は黒塗りを推奨します。</span>
              ) : (
                <span className="shortcut-hint"><span className="kbd">⌘/Ctrl</span> + <span className="kbd">Z</span> Undo</span>
              )}
            </div>
          </section>

          <aside className="panel review-panel" aria-label="Mask候補 Human Review">
            <div className="panel-heading">
              <div>
                <h2>Mask候補</h2>
              </div>
              <span className="count-badge">{pendingCount}</span>
            </div>

            <div className="search-wrap">
              <Search size={14} aria-hidden="true" />
              <input
                className="search-input"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="OCR Textを検索"
                aria-label="OCR Textを検索"
              />
            </div>

            {textSearchPages.length ? (
              <div className="filter-row" role="group" aria-label="検索結果ページ">
                {textSearchPages.map((page) => (
                  <button
                    key={page.id}
                    className="filter-chip"
                    type="button"
                    aria-pressed={page.pageNumber - 1 === currentPageIndex}
                    onClick={() => setCurrentPageIndex(page.pageNumber - 1)}
                  >
                    {page.title}
                  </button>
                ))}
              </div>
            ) : null}

            <div className="filter-row" role="group" aria-label="候補ステータス">
              {(["all", "pending", "accepted", "ignored"] as const).map((value) => (
                <button key={value} className="filter-chip" type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>
                  {value === "all" ? "すべて" : value === "pending" ? "未確認" : value === "accepted" ? "マスク済み" : "無視"}
                </button>
              ))}
            </div>

            <div className="review-summary">
              <div className="review-metric"><strong>{pendingCount}</strong><span>未確認</span></div>
              <div className="review-metric"><strong>{acceptedCount}</strong><span>マスク</span></div>
              <div className="review-metric"><strong>{ignoredCount}</strong><span>無視</span></div>
            </div>

            <div className="inline-actions" style={{ padding: "0 0.8rem 0.7rem" }}>
              <button className="button" type="button" onClick={() => void runOcr(false)}>
                <ScanSearch size={14} /> このページをOCR
              </button>
              <button className="button" type="button" onClick={() => void runOcr(true)}>
                全ページ
              </button>
            </div>

            <div className="candidate-list">
              {filteredCandidates.length ? (
                filteredCandidates.map((candidate) => (
                  <article
                    key={candidate.id}
                    className="candidate-card"
                    data-status={candidate.status}
                    data-highlighted={candidate.id === highlightedCandidateId}
                    onClick={() => selectCandidate(candidate)}
                  >
                    <div className="candidate-meta">
                      <span className="candidate-kind">
                        {candidate.status === "accepted" ? <Check size={12} /> : candidate.status === "ignored" ? <Eye size={12} /> : <ScanSearch size={12} />}
                        {KIND_LABELS[candidate.kind]}
                      </span>
                      <span className="candidate-source">{candidateSourceLabel(candidate)}</span>
                    </div>
                    <p className="candidate-text">{candidate.text}</p>
                    <div className="candidate-location">
                      ページ {candidate.pageIndex + 1} · {candidate.confidence ? `確度 ${Math.round(candidate.confidence)}%` : "ルール一致"}
                    </div>
                    {candidate.status === "pending" ? (
                      <div className="candidate-actions">
                        <button className="candidate-action candidate-action--accept" type="button" onClick={(event) => { event.stopPropagation(); decideCandidate(candidate.id, "accepted"); }}>
                          <Check size={13} /> マスクする
                        </button>
                        <button className="candidate-action candidate-action--ignore" type="button" onClick={(event) => { event.stopPropagation(); decideCandidate(candidate.id, "ignored"); }}>
                          <X size={13} /> 無視
                        </button>
                      </div>
                    ) : (
                      <button className="candidate-action" type="button" onClick={(event) => { event.stopPropagation(); resetCandidate(candidate.id); }}>
                        判断を戻す
                      </button>
                    )}
                  </article>
                ))
              ) : (
                <div className="empty-state">
                  <div>
                    <ScanSearch size={30} />
                    <p>{query ? "一致する候補がありません" : "この条件の候補はありません"}</p>
                  </div>
                </div>
              )}
            </div>

            <div className="review-footer">
              <button className="button button--primary" type="button" disabled={!filteredCandidates.some((candidate) => candidate.status === "pending")} onClick={acceptVisibleCandidates}>
                <ShieldCheck size={15} /> 表示中の未確認をまとめてマスク
              </button>
            </div>
          </aside>
        </div>
      </main>

      {progress ? (
        <div className="processing-overlay" role="dialog" aria-modal="true" aria-label="処理中">
          <div className="processing-card">
            <div className="processing-title">
              <span className="spinner" aria-hidden="true" />
              ブラウザ内で処理しています
            </div>
            <div className="progress-track" aria-hidden="true">
              <div className="progress-bar" style={{ width: `${Math.max(3, progress.progress * 100)}%` }} />
            </div>
            <p className="processing-message">{progress.message}</p>
            <button className="button" type="button" onClick={() => activeControllerRef.current?.abort()}>
              キャンセル
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
