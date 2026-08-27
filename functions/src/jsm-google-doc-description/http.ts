import { createHash, randomUUID } from "node:crypto";

import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions";
import { onRequest } from "firebase-functions/v2/https";

import { parseRequest, tokenMatches } from "./contract";
import { asFunctionError, FunctionError } from "./errors";
import {
  DefaultGoogleDocReader,
  type GoogleDocReader,
} from "./google-doc-reader";
import { extractN8nCompatiblePlainText } from "./plain-text";

const jiraDocWebhookToken = defineSecret("JIRA_DOC_WEBHOOK_TOKEN");
const googleDocReader = new DefaultGoogleDocReader();

interface HttpRequest {
  method: string;
  body: unknown;
  get(name: string): string | undefined;
}

interface HttpResponse {
  set(field: string, value: string): HttpResponse;
  status(statusCode: number): HttpResponse;
  json(body: unknown): void;
}

interface StructuredLogger {
  info(message: string, data: Record<string, unknown>): void;
  error(message: string, data: Record<string, unknown>): void;
}

export interface HandlerDependencies {
  reader: GoogleDocReader;
  getWebhookToken(): string;
  log: StructuredLogger;
  createRequestId(): string;
  now(): number;
}

const productionDependencies: HandlerDependencies = {
  reader: googleDocReader,
  getWebhookToken: () => jiraDocWebhookToken.value(),
  log: logger,
  createRequestId: randomUUID,
  now: Date.now,
};

function contentTypeIsJson(request: HttpRequest): boolean {
  return request.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ===
    "application/json";
}

function contentHash(content: string): string {
  return `sha256:${createHash("sha256").update(content, "utf8").digest("hex")}`;
}

export function createHandler(dependencies: HandlerDependencies) {
  return async (request: HttpRequest, response: HttpResponse): Promise<void> => {
    const requestId = dependencies.createRequestId();
    const startedAt = dependencies.now();
    let issueKey: string | undefined;

    response.set("Content-Type", "application/json; charset=utf-8");
    response.set("Cache-Control", "no-store");
    response.set("X-Request-Id", requestId);

    try {
      if (request.method !== "POST") {
        response.set("Allow", "POST");
        throw new FunctionError(405, "METHOD_NOT_ALLOWED", "僅接受 POST request。");
      }

      if (!tokenMatches(request.get("x-ngeip-webhook-token"), dependencies.getWebhookToken())) {
        throw new FunctionError(401, "UNAUTHORIZED", "Webhook 驗證失敗。");
      }

      if (!contentTypeIsJson(request)) {
        throw new FunctionError(
          415,
          "UNSUPPORTED_MEDIA_TYPE",
          "Content-Type 必須是 application/json。",
        );
      }

      const input = parseRequest(request.body);
      issueKey = input.issueKey;
      const result = await dependencies.reader.read(input.documentId);
      const content = extractN8nCompatiblePlainText(result.document);
      const hash = contentHash(content);

      dependencies.log.info("JSM Google Docs 純文字讀取成功", {
        requestId,
        issueKey,
        result: "success",
        latencyMs: dependencies.now() - startedAt,
        googleApiAttemptCount: result.attemptCount,
        contentLength: content.length,
        contentHash: hash,
      });

      response.status(200).json({
        source: input.docUrl,
        documentId: input.documentId,
        revisionId: result.document.revisionId ?? null,
        content,
        contentHash: hash,
      });
    } catch (error) {
      const functionError = asFunctionError(error);
      dependencies.log.error("JSM Google Docs 純文字讀取失敗", {
        requestId,
        ...(issueKey ? { issueKey } : {}),
        result: functionError.code,
        latencyMs: dependencies.now() - startedAt,
      });

      response.status(functionError.status).json({
        error: {
          code: functionError.code,
          message: functionError.message,
          requestId,
        },
      });
    }
  };
}

const handler = createHandler(productionDependencies);

export const getGoogleDocPlainText = onRequest(
  {
    cors: false,
    timeoutSeconds: 30,
    memory: "256MiB",
    minInstances: 0,
    maxInstances: 3,
    concurrency: 10,
    invoker: "public",
    serviceAccount: "jsm-google-doc-reader@noahxdm-eip.iam.gserviceaccount.com",
    secrets: [jiraDocWebhookToken],
  },
  async (request, response) => handler(request, response),
);
