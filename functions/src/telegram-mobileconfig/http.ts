import { randomUUID, timingSafeEqual } from "node:crypto";

import { logger } from "firebase-functions";
import { defineSecret } from "firebase-functions/params";
import { onRequest } from "firebase-functions/v2/https";

import {
  generateMobileconfig,
  mobileconfigFileName,
  parseCreateClipCommand,
  selectTelegramImage,
  type TelegramImageMessage,
} from "./mobileconfig";

const telegramBotToken = defineSecret("TELEGRAM_BOT_TOKEN");
const telegramWebhookSecret = defineSecret("TELEGRAM_WEBHOOK_SECRET");
const TELEGRAM_API_TIMEOUT_MS = 10_000;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

const INVALID_COMMAND_MESSAGE =
  "❌ 發生錯誤\n指令格式：/createclip label:顯示名稱 url:網址";
const MISSING_IMAGE_MESSAGE = "❌ 發生錯誤\n圖片：是否已附上圖片？";
const IMAGE_TOO_LARGE_MESSAGE = "❌ 發生錯誤\n圖片不可超過 20 MiB。";

interface TelegramMessage extends TelegramImageMessage {
  message_id?: unknown;
  text?: unknown;
  caption?: unknown;
  chat?: {
    id?: unknown;
    type?: unknown;
  };
}

interface TelegramUpdate {
  update_id?: unknown;
  message?: TelegramMessage;
}

interface HttpRequest {
  method: string;
  body: unknown;
  get(name: string): string | undefined;
}

interface HttpResponse {
  set(field: string, value: string): HttpResponse;
  status(statusCode: number): HttpResponse;
  send(body: string): void;
}

interface StructuredLogger {
  info(message: string, data: Record<string, unknown>): void;
  error(message: string, data: Record<string, unknown>): void;
}

export interface TelegramFile {
  filePath: string;
  fileSize?: number;
}

export interface TelegramClient {
  getFile(fileId: string): Promise<TelegramFile>;
  downloadFile(filePath: string): Promise<Uint8Array>;
  sendMessage(chatId: number, messageId: number, text: string): Promise<void>;
  sendDocument(
    chatId: number,
    messageId: number,
    document: string,
    fileName: string,
  ): Promise<void>;
}

export interface HandlerDependencies {
  createTelegramClient(): TelegramClient;
  getWebhookSecret(): string;
  createRequestId(): string;
  log: StructuredLogger;
  now(): number;
}

export class TelegramApiError extends Error {
  constructor(readonly operation: string) {
    super("Telegram API 無法完成請求。");
    this.name = "TelegramApiError";
  }
}

function secretMatches(received: string | undefined, expected: string): boolean {
  if (!received || !expected) {
    return false;
  }

  const receivedBytes = Buffer.from(received, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  return receivedBytes.length === expectedBytes.length &&
    timingSafeEqual(receivedBytes, expectedBytes);
}

function telegramUpdate(body: unknown): TelegramUpdate | undefined {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return undefined;
  }

  const update = body as TelegramUpdate;
  return Number.isSafeInteger(update.update_id) ? update : undefined;
}

function privateMessage(update: TelegramUpdate): {
  chatId: number;
  messageId: number;
  message: TelegramMessage;
} | undefined {
  const message = update.message;
  if (
    !message ||
    message.chat?.type !== "private" ||
    typeof message.chat.id !== "number" ||
    !Number.isSafeInteger(message.chat.id) ||
    typeof message.message_id !== "number" ||
    !Number.isSafeInteger(message.message_id)
  ) {
    return undefined;
  }

  return { chatId: message.chat.id, messageId: message.message_id, message };
}

interface TelegramApiResponse<T> {
  ok?: unknown;
  result?: T;
}

interface TelegramGetFileResult {
  file_path?: unknown;
  file_size?: unknown;
}

export class DefaultTelegramClient implements TelegramClient {
  constructor(private readonly botToken: string) {}

  private async call<T>(operation: string, body: unknown): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`https://api.telegram.org/bot${this.botToken}/${operation}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TELEGRAM_API_TIMEOUT_MS),
      });
    } catch {
      throw new TelegramApiError(operation);
    }

    let payload: TelegramApiResponse<T>;
    try {
      payload = await response.json() as TelegramApiResponse<T>;
    } catch {
      throw new TelegramApiError(operation);
    }

    if (!response.ok || payload.ok !== true || payload.result === undefined) {
      throw new TelegramApiError(operation);
    }
    return payload.result;
  }

  async getFile(fileId: string): Promise<TelegramFile> {
    const result = await this.call<TelegramGetFileResult>("getFile", { file_id: fileId });
    if (
      typeof result.file_path !== "string" ||
      result.file_path.length === 0 ||
      result.file_path.startsWith("/") ||
      result.file_path.split("/").includes("..")
    ) {
      throw new TelegramApiError("getFile");
    }

    return {
      filePath: result.file_path,
      ...(typeof result.file_size === "number" ? { fileSize: result.file_size } : {}),
    };
  }

  async downloadFile(filePath: string): Promise<Uint8Array> {
    let response: Response;
    try {
      const encodedPath = filePath.split("/").map(encodeURIComponent).join("/");
      response = await fetch(
        `https://api.telegram.org/file/bot${this.botToken}/${encodedPath}`,
        { signal: AbortSignal.timeout(TELEGRAM_API_TIMEOUT_MS) },
      );
    } catch {
      throw new TelegramApiError("downloadFile");
    }

    if (!response.ok) {
      throw new TelegramApiError("downloadFile");
    }
    return new Uint8Array(await response.arrayBuffer());
  }

  async sendMessage(chatId: number, messageId: number, text: string): Promise<void> {
    await this.call("sendMessage", {
      chat_id: chatId,
      text,
      reply_parameters: { message_id: messageId },
    });
  }

  async sendDocument(
    chatId: number,
    messageId: number,
    document: string,
    fileName: string,
  ): Promise<void> {
    const form = new FormData();
    form.append("chat_id", String(chatId));
    form.append("reply_parameters", JSON.stringify({ message_id: messageId }));
    form.append(
      "document",
      new Blob([document], { type: "application/x-apple-aspen-config" }),
      fileName,
    );

    let response: Response;
    try {
      response = await fetch(`https://api.telegram.org/bot${this.botToken}/sendDocument`, {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(TELEGRAM_API_TIMEOUT_MS),
      });
    } catch {
      throw new TelegramApiError("sendDocument");
    }

    if (!response.ok) {
      throw new TelegramApiError("sendDocument");
    }

    try {
      const payload = await response.json() as TelegramApiResponse<unknown>;
      if (payload.ok !== true) {
        throw new TelegramApiError("sendDocument");
      }
    } catch (error) {
      if (error instanceof TelegramApiError) {
        throw error;
      }
      throw new TelegramApiError("sendDocument");
    }
  }
}

const productionDependencies: HandlerDependencies = {
  createTelegramClient: () => new DefaultTelegramClient(telegramBotToken.value()),
  getWebhookSecret: () => telegramWebhookSecret.value(),
  createRequestId: randomUUID,
  log: logger,
  now: Date.now,
};

export function createHandler(dependencies: HandlerDependencies) {
  return async (request: HttpRequest, response: HttpResponse): Promise<void> => {
    const requestId = dependencies.createRequestId();
    const startedAt = dependencies.now();
    let updateId: number | undefined;

    response.set("Content-Type", "text/plain; charset=utf-8");
    response.set("Cache-Control", "no-store");
    response.set("X-Request-Id", requestId);

    if (request.method !== "POST") {
      response.set("Allow", "POST");
      response.status(405).send("method not allowed");
      return;
    }

    if (!secretMatches(
      request.get("x-telegram-bot-api-secret-token"),
      dependencies.getWebhookSecret(),
    )) {
      response.status(401).send("unauthorized");
      return;
    }

    const update = telegramUpdate(request.body);
    if (!update) {
      response.status(400).send("invalid update");
      return;
    }
    updateId = update.update_id as number;

    const context = privateMessage(update);
    if (!context) {
      response.status(200).send("ignored");
      return;
    }

    const client = dependencies.createTelegramClient();
    const input = typeof context.message.caption === "string"
      ? context.message.caption
      : context.message.text;
    const command = parseCreateClipCommand(input);

    try {
      if (!command) {
        await client.sendMessage(
          context.chatId,
          context.messageId,
          INVALID_COMMAND_MESSAGE,
        );
        response.status(200).send("invalid command");
        return;
      }

      const imageFile = selectTelegramImage(context.message);
      if (!imageFile) {
        await client.sendMessage(
          context.chatId,
          context.messageId,
          MISSING_IMAGE_MESSAGE,
        );
        response.status(200).send("missing image");
        return;
      }

      if (imageFile.fileSize !== undefined && imageFile.fileSize > MAX_IMAGE_BYTES) {
        await client.sendMessage(
          context.chatId,
          context.messageId,
          IMAGE_TOO_LARGE_MESSAGE,
        );
        response.status(200).send("image too large");
        return;
      }

      const telegramFile = await client.getFile(imageFile.fileId);
      if (telegramFile.fileSize !== undefined && telegramFile.fileSize > MAX_IMAGE_BYTES) {
        await client.sendMessage(
          context.chatId,
          context.messageId,
          IMAGE_TOO_LARGE_MESSAGE,
        );
        response.status(200).send("image too large");
        return;
      }

      const image = await client.downloadFile(telegramFile.filePath);
      if (image.byteLength > MAX_IMAGE_BYTES) {
        await client.sendMessage(
          context.chatId,
          context.messageId,
          IMAGE_TOO_LARGE_MESSAGE,
        );
        response.status(200).send("image too large");
        return;
      }

      const mobileconfig = generateMobileconfig(command, image);
      await client.sendDocument(
        context.chatId,
        context.messageId,
        mobileconfig,
        mobileconfigFileName(command.label),
      );

      dependencies.log.info("Telegram Web Clip 描述檔產生成功", {
        requestId,
        updateId,
        result: "success",
        latencyMs: dependencies.now() - startedAt,
        imageBytes: image.byteLength,
      });
      response.status(200).send("ok");
    } catch (error) {
      dependencies.log.error("Telegram Web Clip 描述檔產生失敗", {
        requestId,
        updateId,
        result: error instanceof TelegramApiError ? "TELEGRAM_API_ERROR" : "INTERNAL_ERROR",
        ...(error instanceof TelegramApiError ? { operation: error.operation } : {}),
        latencyMs: dependencies.now() - startedAt,
      });
      response.status(502).send("upstream error");
    }
  };
}

const handler = createHandler(productionDependencies);

export const telegramMobileconfigWebhook = onRequest(
  {
    cors: false,
    timeoutSeconds: 30,
    memory: "256MiB",
    minInstances: 0,
    maxInstances: 3,
    concurrency: 10,
    invoker: "public",
    secrets: [telegramBotToken, telegramWebhookSecret],
  },
  async (request, response) => handler(request, response),
);
