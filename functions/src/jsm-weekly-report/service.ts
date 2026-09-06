import { createHash } from "node:crypto";
import { cutoffAt, localDate, validDate } from "./calendar";
import { buildArtifact } from "./delivery";
import { Artifact, ReportError, ReportRow, ReportStore, requireValue } from "./model";

export interface Dependencies {
  store: ReportStore;
  jira: { report(start: string, end: string): Promise<ReportRow[]> };
  telegram: { send(artifact: Artifact): Promise<number> };
  now(): number;
}

export async function execute(deps: Dependencies, id: string, cutoff: string | null) {
  const run = await deps.store.claim(id, cutoff, deps.now());
  if (!run) return { result: "alreadyAttempted", reportId: id };
  let deliveryAttempted = false;
  try {
    const rows = await deps.jira.report(run.start, run.end);
    const artifact = await buildArtifact(rows, run.start, run.end);
    const hash = createHash("sha256").update(artifact.bytes ?? artifact.caption).digest("hex");
    requireValue(deps.now() < run.startedAt + 480_000, "REPORT_DEADLINE", 504);
    await deps.store.sending(run, rows.length, hash);
    // HTTP timeout 不保證立即終止程式。禁止長時間暫停的 worker 在人工解鎖後才開始發送。
    requireValue(deps.now() < run.startedAt + 480_000, "REPORT_DEADLINE", 504);
    deliveryAttempted = true;
    const messageId = await deps.telegram.send(artifact);
    await deps.store.complete(run, messageId);
    return { result: "sent", reportId: id, count: rows.length, start: run.start, end: run.end };
  } catch (error) {
    const code = error instanceof ReportError ? error.code : "REPORT_FAILED";
    const definitelyNotSent = code === "TELEGRAM_REJECTED" || code === "TELEGRAM_CONFIG";
    await deps.store.fail(run, code, deliveryAttempted && !definitelyNotSent);
    throw new ReportError(code, 502);
  }
}

export async function scheduled(deps: Dependencies, scheduleTime: string) {
  const time = Date.parse(scheduleTime);
  const now = deps.now();
  requireValue(Number.isFinite(time) && time <= now && now - time < 86_400_000, "INVALID_SCHEDULE_TIME");
  const date = localDate(time);
  requireValue(time === Date.parse(cutoffAt(date)), "INVALID_SCHEDULE_TIME");
  const plan = await deps.store.plan(date);
  if (plan.date !== date) return { result: "skipped", reportId: plan.id };
  return execute(deps, plan.id, cutoffAt(date));
}

export function parseAdmin(body: unknown): { action: "retry" | "confirmSent" | "confirmNotSent"; reportId: string; messageId?: number } {
  requireValue(body && typeof body === "object" && !Array.isArray(body));
  const input = body as Record<string, unknown>;
  requireValue(Object.keys(input).every(k => ["action", "reportId", "messageId"].includes(k)));
  requireValue(["retry", "confirmSent", "confirmNotSent"].includes(input.action as string) && validDate(input.reportId));
  requireValue(input.action === "confirmSent" ? Number.isSafeInteger(input.messageId) && Number(input.messageId) > 0 : input.messageId === undefined);
  return input as ReturnType<typeof parseAdmin>;
}
