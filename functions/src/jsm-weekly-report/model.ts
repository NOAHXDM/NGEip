export class ReportError extends Error {
  constructor(public readonly code: string, public readonly status = 500) {
    super(code);
  }
}

export function requireValue(condition: unknown, code = "INVALID_REQUEST", status = 400): asserts condition {
  if (!condition) throw new ReportError(code, status);
}

export type RunStatus = "running" | "sending" | "sent" | "failed" | "needsReview";
export interface Run {
  id: string;
  start: string;
  end: string;
  status: RunStatus;
  attemptId: string;
  startedAt: number;
  count?: number;
  fileHash?: string;
  messageId?: number;
  error?: string;
}
export interface ReportRow { key: string; summary: string; completedAt: number }
export interface Artifact { filename: string; caption: string; bytes?: Buffer }

export interface ReportStore {
  plan(date: string): Promise<{ id: string; date: string | null }>;
  claim(id: string, cutoff: string | null, now: number): Promise<Run | null>;
  sending(run: Run, count: number, hash: string): Promise<void>;
  complete(run: Run, messageId: number): Promise<void>;
  fail(run: Run, code: string, uncertain: boolean): Promise<void>;
  resolve(id: string, action: "confirmSent" | "confirmNotSent", now: number, messageId?: number): Promise<void>;
}
