/** A rectangle expressed relative to the visible page, where every value is 0..1. */
export interface NormalizedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type SupportedMimeType =
  | "image/png"
  | "image/jpeg"
  | "application/pdf";

export type SensitiveDataKind =
  | "email"
  | "phone"
  | "postal-code"
  | "numeric-id"
  | "name"
  | "address";

export type DetectionSource = "pdf-text" | "ocr";
export type DetectionMethod = "regex" | "label";
export type CandidateStatus = "pending" | "accepted" | "ignored";

/** A text unit supplied by PDF text extraction or browser-side OCR. */
export interface DetectionToken {
  text: string;
  rect: NormalizedRect;
  /** Tokens with the same line id are joined before deterministic detection. */
  lineId?: string;
  /** Optional OCR confidence in the 0..100 range. */
  confidence?: number;
}

/**
 * A detector result is reviewable evidence only. It never represents an applied
 * redaction; the user must explicitly accept it first.
 */
export interface MaskCandidate {
  id: string;
  pageIndex: number;
  kind: SensitiveDataKind;
  source: DetectionSource;
  method: DetectionMethod;
  text: string;
  rects: NormalizedRect[];
  status: CandidateStatus;
  confidence?: number;
}

export type RedactionMode = "black" | "blur";
export type RedactionSource = "manual" | "candidate";

/** A user-approved or manually drawn operation that will be baked into export. */
export interface Redaction {
  id: string;
  pageIndex: number;
  rect: NormalizedRect;
  mode: RedactionMode;
  source: RedactionSource;
  candidateId?: string;
}
