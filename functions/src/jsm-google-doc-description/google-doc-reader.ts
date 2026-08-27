import { GoogleAuth } from "google-auth-library";

import { FunctionError } from "./errors";
import type { GoogleDocsDocument } from "./plain-text";

const DOCS_READONLY_SCOPE = "https://www.googleapis.com/auth/documents.readonly";
const DOCS_API_DEADLINE_MS = 10_000;
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

export interface GoogleDocReadResult {
  document: GoogleDocsDocument;
  attemptCount: number;
}

export interface GoogleDocReader {
  read(documentId: string): Promise<GoogleDocReadResult>;
}

interface HttpErrorShape {
  code?: unknown;
  name?: unknown;
  response?: {
    status?: unknown;
  };
}

function upstreamStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const status = (error as HttpErrorShape).response?.status;
  return typeof status === "number" ? status : undefined;
}

function isTimeout(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const shape = error as HttpErrorShape;
  return shape.name === "AbortError" ||
    shape.code === "ETIMEDOUT" ||
    shape.code === "ECONNABORTED";
}

export function mapGoogleApiError(error: unknown): FunctionError {
  const status = upstreamStatus(error);
  if (status === 403) {
    return new FunctionError(
      403,
      "DOC_ACCESS_DENIED",
      "Function 無法讀取指定的 Google Docs 文件。",
    );
  }
  if (status === 404) {
    return new FunctionError(404, "DOC_NOT_FOUND", "找不到指定的 Google Docs 文件。");
  }
  if (status === 429) {
    return new FunctionError(
      429,
      "UPSTREAM_RATE_LIMITED",
      "Google Docs API 暫時限制請求流量。",
    );
  }
  if (isTimeout(error)) {
    return new FunctionError(504, "DOCS_API_TIMEOUT", "Google Docs API 回應逾時。");
  }

  return new FunctionError(502, "DOCS_API_ERROR", "Google Docs API 暫時無法完成請求。");
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export class DefaultGoogleDocReader implements GoogleDocReader {
  private readonly auth = new GoogleAuth({ scopes: [DOCS_READONLY_SCOPE] });

  async read(documentId: string): Promise<GoogleDocReadResult> {
    const deadline = Date.now() + DOCS_API_DEADLINE_MS;
    let lastError: unknown;

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new FunctionError(504, "DOCS_API_TIMEOUT", "Google Docs API 回應逾時。");
      }

      try {
        const client = await this.auth.getClient();
        const response = await client.request<GoogleDocsDocument>({
          method: "GET",
          url: `https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}`,
          params: { includeTabsContent: false },
          timeout: remaining,
          retryConfig: { retry: 0 },
        });

        if (!response.data || !Array.isArray(response.data.body?.content)) {
          throw new FunctionError(
            502,
            "DOCS_API_ERROR",
            "Google Docs API 回傳無效內容。",
          );
        }

        return { document: response.data, attemptCount: attempt };
      } catch (error) {
        if (error instanceof FunctionError) {
          throw error;
        }

        lastError = error;
        const status = upstreamStatus(error);
        const shouldRetry = attempt === 1 && status !== undefined && RETRYABLE_STATUS.has(status);
        if (!shouldRetry) {
          throw mapGoogleApiError(error);
        }

        const delay = 150 + Math.floor(Math.random() * 101);
        if (Date.now() + delay >= deadline) {
          throw new FunctionError(504, "DOCS_API_TIMEOUT", "Google Docs API 回應逾時。");
        }
        await wait(delay);
      }
    }

    throw mapGoogleApiError(lastError);
  }
}
