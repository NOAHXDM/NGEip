import { timingSafeEqual } from "node:crypto";

import { FunctionError } from "./errors";

const GOOGLE_DOC_PATH = /^\/document\/d\/([A-Za-z0-9_-]+)(?:\/.*)?$/;
const ISSUE_KEY = /^[A-Z][A-Z0-9_]{1,31}-[1-9][0-9]*$/;
const REQUEST_KEYS = new Set(["docUrl", "issueKey"]);

export interface GetGoogleDocPlainTextRequest {
  docUrl: string;
  issueKey: string;
}

export interface ValidatedRequest extends GetGoogleDocPlainTextRequest {
  documentId: string;
}

function invalidRequest(): never {
  throw new FunctionError(400, "INVALID_REQUEST", "Request 格式不正確。");
}

export function parseRequest(body: unknown): ValidatedRequest {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return invalidRequest();
  }

  const record = body as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== REQUEST_KEYS.size || keys.some((key) => !REQUEST_KEYS.has(key))) {
    return invalidRequest();
  }

  if (typeof record.docUrl !== "string" || typeof record.issueKey !== "string") {
    return invalidRequest();
  }

  const docUrl = record.docUrl.trim();
  const issueKey = record.issueKey.trim();
  if (!ISSUE_KEY.test(issueKey)) {
    return invalidRequest();
  }

  let url: URL;
  try {
    url = new URL(docUrl);
  } catch {
    return invalidRequest();
  }

  if (
    url.protocol !== "https:" ||
    url.hostname !== "docs.google.com" ||
    url.port !== "" ||
    url.username !== "" ||
    url.password !== ""
  ) {
    return invalidRequest();
  }

  const match = GOOGLE_DOC_PATH.exec(url.pathname);
  if (!match?.[1]) {
    return invalidRequest();
  }

  return {
    docUrl,
    issueKey,
    documentId: match[1],
  };
}

export function tokenMatches(received: string | undefined, expected: string): boolean {
  if (!received || !expected) {
    return false;
  }

  const receivedBytes = Buffer.from(received, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  return receivedBytes.length === expectedBytes.length &&
    timingSafeEqual(receivedBytes, expectedBytes);
}
