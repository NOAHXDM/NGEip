import ExcelJS from "exceljs";
import { localDate } from "./calendar";
import { Artifact, ReportError, ReportRow, requireValue } from "./model";

export async function buildArtifact(rows: ReportRow[], start: string, end: string): Promise<Artifact> {
  const display = (date: string) => `${localDate(Date.parse(date))} 17:30`;
  const caption = `[每週報表] ${display(start)} ～ ${display(end)}\n本期共 ${rows.length} 筆`;
  const filename = `${localDate(Date.parse(start)).replaceAll("-", "")}~${localDate(Date.parse(end)).replaceAll("-", "")}每周報表.xlsx`;
  if (!rows.length) return { caption, filename };
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date(end);
  workbook.modified = new Date(end);
  const sheet = workbook.addWorksheet("Sheet");
  sheet.getColumn(1).width = 91;
  for (const row of rows) {
    requireValue(row.summary.length <= 32767, "SUMMARY_TOO_LONG", 502);
    // 明確字串值，包含以 =、+、-、@ 開頭的標題都不會變成公式。
    sheet.addRow([row.summary]);
  }
  const bytes = Buffer.from(await workbook.xlsx.writeBuffer());
  requireValue(bytes.length < 49_000_000, "REPORT_TOO_LARGE", 502);
  return { caption, filename, bytes };
}

export class TelegramClient {
  constructor(private readonly token: string, private readonly chatId: string, private readonly fetcher: typeof fetch = fetch) {
    requireValue(/^\d+:[A-Za-z0-9_-]+$/.test(token) && /^-?\d+$/.test(chatId), "TELEGRAM_CONFIG", 503);
  }
  async send(artifact: Artifact): Promise<number> {
    const form = new FormData();
    form.set("chat_id", this.chatId);
    if (artifact.bytes) {
      form.set("caption", artifact.caption);
      form.set("document", new Blob([new Uint8Array(artifact.bytes)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), artifact.filename);
    } else form.set("text", artifact.caption);
    try {
      const response = await this.fetcher(`https://api.telegram.org/bot${this.token}/${artifact.bytes ? "sendDocument" : "sendMessage"}`, {
        method: "POST", body: form, redirect: "error", signal: AbortSignal.timeout(45_000),
      });
      const body = await response.json() as { ok?: boolean; result?: { message_id?: number } };
      // Telegram 明確拒絕才視為未送出；5xx 或無法判讀回覆一律需人工確認。
      if (!response.ok && response.status >= 400 && response.status < 500 && body.ok === false) {
        throw new ReportError("TELEGRAM_REJECTED", 502);
      }
      if (!response.ok || body.ok !== true || !Number.isSafeInteger(body.result?.message_id)) throw new ReportError("DELIVERY_UNKNOWN", 502);
      return body.result!.message_id!;
    } catch (error) {
      if (error instanceof ReportError) throw error;
      throw new ReportError("DELIVERY_UNKNOWN", 502);
    }
  }
}
