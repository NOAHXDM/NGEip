import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { defineBoolean, defineSecret, defineString } from "firebase-functions/params";
import { onRequest } from "firebase-functions/v2/https";
import { TelegramClient } from "./delivery";
import { JiraClient } from "./jira";
import { ReportError, requireValue } from "./model";
import { Dependencies, execute, parseAdmin, scheduled } from "./service";
import { FirestoreReportStore } from "./store";

const enabled = defineBoolean("JSM_WEEKLY_ENABLED", { default: false });
const workflowVerified = defineBoolean("JSM_WEEKLY_WORKFLOW_VERIFIED", { default: false });
const cloudId = defineString("JSM_WEEKLY_JIRA_CLOUD_ID", { default: "" });
const project = defineString("JSM_WEEKLY_JIRA_PROJECT", { default: "DMIT" });
// 個人 Atlassian 帳號建立的 scoped API token 使用 email + token 的 Basic 認證。
const auth = defineString("JSM_WEEKLY_JIRA_AUTH", { default: "basic" });
const email = defineString("JSM_WEEKLY_JIRA_EMAIL", { default: "" });
const serviceAccount = defineString("JSM_WEEKLY_RUNTIME_SERVICE_ACCOUNT", { default: "default" });
const jiraToken = defineSecret("JSM_WEEKLY_JIRA_TOKEN");
const telegramToken = defineSecret("JSM_WEEKLY_TELEGRAM_TOKEN");
const chatId = defineSecret("JSM_WEEKLY_TELEGRAM_CHAT_ID");

function dependencies(): Dependencies {
  if (!getApps().length) initializeApp();
  return {
    store: new FirestoreReportStore(getFirestore()),
    // 設定驗證在 claim 後執行，錯誤才會留下可補跑的原期間；人工確認不依賴 Jira 設定。
    jira: { report: async (start, end) => {
      requireValue(workflowVerified.value(), "JIRA_WORKFLOW_NOT_VERIFIED", 503);
      requireValue(auth.value() === "basic" || auth.value() === "bearer", "JIRA_CONFIG", 503);
      return new JiraClient({ cloudId: cloudId.value(), project: project.value(), auth: auth.value() as "basic" | "bearer", email: email.value(), token: jiraToken.value() }).report(start, end);
    } },
    telegram: { send: async artifact => new TelegramClient(telegramToken.value(), chatId.value()).send(artifact) },
    now: Date.now,
  };
}

interface Request { method: string; body: unknown; get(name: string): string | undefined }
interface Response {
  set(key: string, value: string): Response;
  status(code: number): Response;
  json(value: unknown): void;
}
export function createReportHandler(getDependencies = dependencies, isEnabled = () => enabled.value(), log = logger) {
  return async (req: Request, res: Response): Promise<void> => {
    res.set("Cache-Control", "no-store");
    try {
      requireValue(req.method === "POST", "METHOD_NOT_ALLOWED", 405);
      requireValue(req.get("content-type")?.split(";")[0].trim() === "application/json", "UNSUPPORTED_MEDIA_TYPE", 415);
      // IAM 由 Cloud Run 在 handler 前驗證；排程與管理者共用同一授權身分。
      if (!isEnabled()) { res.status(200).json({ result: "disabled" }); return; }
      let result: unknown;
      requireValue(req.body && typeof req.body === "object" && !Array.isArray(req.body));
      if ((req.body as Record<string, unknown>).action !== "scheduled") {
        const input = parseAdmin(req.body);
        const deps = getDependencies();
        if (input.action === "retry") result = await execute(deps, input.reportId, null);
        else {
          await deps.store.resolve(input.reportId, input.action, deps.now(), input.messageId);
          result = { result: input.action, reportId: input.reportId };
        }
      } else {
        requireValue(Object.keys(req.body).length === 1);
        const time = req.get("x-cloudscheduler-scheduletime");
        requireValue(typeof time === "string", "MISSING_SCHEDULE_TIME");
        result = await scheduled(getDependencies(), time);
      }
      log.info("JSM 週報執行結果", { component: "jsm-weekly-report", ...(result as object) });
      res.status(200).json(result);
    } catch (error) {
      const safe = error instanceof ReportError ? error : new ReportError("REPORT_FAILED");
      // 不輸出例外原文，避免 Jira Authorization 或含 Bot token 的 URL 洩漏。
      log.error("JSM 週報失敗", { component: "jsm-weekly-report", code: safe.code });
      res.status(safe.status).json({ error: safe.code });
    }
  };
}

const options = {
  invoker: "private" as const, cors: false, region: "asia-east1", timeoutSeconds: 540,
  memory: "512MiB" as const, minInstances: 0, maxInstances: 2, concurrency: 1,
  serviceAccount, secrets: [jiraToken, telegramToken, chatId],
};
export const sendJsmWeeklyReport = onRequest(options, createReportHandler());
