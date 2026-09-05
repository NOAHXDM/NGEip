const test = require("node:test");
const assert = require("node:assert/strict");
const ExcelJS = require("exceljs");
const { cutoffAt, initialStart, weekStart, shiftDate, lastWorkday, plannedDate, parseGovernmentCalendar } = require("../lib/jsm-weekly-report/calendar.js");
const { completionRows, JiraClient } = require("../lib/jsm-weekly-report/jira.js");
const { buildArtifact, TelegramClient } = require("../lib/jsm-weekly-report/delivery.js");
const { execute, scheduled, parseAdmin } = require("../lib/jsm-weekly-report/service.js");
const { ReportError } = require("../lib/jsm-weekly-report/model.js");
const start = cutoffAt("2026-08-28");
const end = cutoffAt("2026-09-04");
function issue(n, time = "2026-09-02T09:00:00Z", category = 3) {
  return { id: String(n), key: `DMIT-${n}`, fields: { summary: `標題${n}`, statuscategorychangedate: time, status: { statusCategory: { id: category } } } };
}

test("目前 Done、本期完成，排除重開與舊完成；精確開閉邊界、時間排序", () => {
  const rows = completionRows([issue(1, start), issue(2, end), issue(3, "2026-09-01T00:00:00Z"),
    issue(4, "2026-09-02T00:00:00Z", 2), issue(5, "2026-09-05T00:00:00Z")], start, end);
  assert.deepEqual(rows.map(r => r.key), ["DMIT-3", "DMIT-2"]);
  assert.deepEqual(completionRows([issue(2, end)], end, cutoffAt("2026-09-11")), []);
  assert.equal(completionRows([issue(2, "2026-09-09T00:00:00Z")], end, cutoffAt("2026-09-11")).length, 1);
  assert.throws(() => completionRows([issue(1, null)], start, end), /JIRA_COMPLETION_FIELD_MISSING/);
});

test("台北週界、跨年、首次週五界線、補班星期六與整週休假", () => {
  assert.equal(weekStart("2026-09-06"), "2026-08-31");
  assert.equal(weekStart("2027-01-01"), "2026-12-28");
  assert.equal(initialStart("2026-09-05"), start);
  const days = Object.fromEntries(Array.from({ length: 7 }, (_, i) => [shiftDate("2026-08-31", i), i < 5]));
  assert.equal(lastWorkday("2026-08-31", days), "2026-09-04");
  days["2026-09-04"] = false;
  assert.equal(lastWorkday("2026-08-31", days), "2026-09-03");
  days["2026-09-05"] = true;
  assert.equal(lastWorkday("2026-08-31", days), "2026-09-05");
  assert.equal(lastWorkday("2026-08-31", Object.fromEntries(Object.keys(days).map(d => [d, false]))), null);
  assert.throws(() => lastWorkday("2026-08-31", {}), /CALENDAR_MISSING/);
  assert.equal(plannedDate("2026-09-04", "2026-09-03", "2026-09-04"), "2026-09-04");
  assert.equal(plannedDate("2026-09-02", "2026-09-03", "2026-09-04"), "2026-09-03");
});

test("政府 CSV 驗證完整閏年、BOM、引號備註，拒絕缺日／重複／不明代碼", () => {
  const lines = ["\uFEFF西元日期,星期,是否放假,備註"];
  for (let d = "2028-01-01"; d.startsWith("2028"); d = shiftDate(d, 1)) lines.push(`${d.replaceAll("-", "")},一,0,"例外,備註"`);
  assert.equal(Object.keys(parseGovernmentCalendar(lines.join("\n"), 2028)).length, 366);
  assert.throws(() => parseGovernmentCalendar(lines.slice(0, -1).join("\n"), 2028), /INCOMPLETE_CALENDAR/);
  assert.throws(() => parseGovernmentCalendar([...lines, lines[1]].join("\n"), 2028), /INVALID_CALENDAR/);
  assert.throws(() => parseGovernmentCalendar(lines.join("\n").replace(",0,", ",1,"), 2028), /INVALID_CALENDAR/);
});

const config = { cloudId: "cloud-test", project: "DMIT", token: "secret", auth: "bearer", email: "" };
test("Jira 160 筆分頁、唯讀 scope 對應 POST；不讀 changelog", async () => {
  const calls = [];
  const client = new JiraClient(config, async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return Response.json(calls.length === 1 ? { issues: Array.from({ length: 100 }, (_, n) => issue(n)), nextPageToken: "page2", isLast: false }
      : { issues: Array.from({ length: 60 }, (_, n) => issue(n + 100)), isLast: true });
  }, () => Date.parse(end));
  assert.equal((await client.report(start, end)).length, 160);
  assert.equal(calls.length, 2);
  assert.match(calls[0].body.jql, /statusCategory = Done/);
  assert.match(calls[0].body.jql, /statusCategoryChangedDate/);
  assert.equal(calls[1].body.nextPageToken, "page2");
  assert.equal(calls[0].init.headers.Authorization, "Bearer secret");
  assert.ok(calls.every(c => c.url.endsWith("/search/jql")));
  const basic = new JiraClient({ ...config, auth: "basic", email: "report@example.test" }, async (_, init) => {
    assert.equal(init.headers.Authorization, `Basic ${Buffer.from("report@example.test:secret").toString("base64")}`);
    return Response.json({ issues: [], isLast: true });
  });
  await basic.report(start, end);
});

test("Jira 不重試 429，不靜默接受不完整分頁／重複 token", async () => {
  let calls = 0;
  const client = new JiraClient(config, async () => { calls++; return Response.json({}, { status: 429 }); });
  await assert.rejects(client.report(start, end), /JIRA_HTTP_429/);
  assert.equal(calls, 1);
  await assert.rejects(new JiraClient(config, async () => Response.json({ issues: [] })).report(start, end), /JIRA_INCOMPLETE_PAGE/);
  await assert.rejects(new JiraClient(config, async () => Response.json({ issues: [], nextPageToken: "same" })).report(start, end), /JIRA_REPEATED_PAGE/);
});

test("XLSX 維持單欄無表頭、保留重複與公式字面值，零筆不產檔", async () => {
  const rows = ["同名", "同名", "=HYPERLINK(\"https://example.test\")", "+1", "@測試"].map((summary, n) => ({ key: `DMIT-${n}`, summary, completedAt: 0 }));
  const artifact = await buildArtifact(rows, start, end);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(artifact.bytes);
  assert.equal(wb.worksheets.length, 1);
  const sheet = wb.getWorksheet("Sheet");
  assert.equal(sheet.rowCount, 5);
  assert.equal(sheet.columnCount, 1);
  assert.deepEqual(sheet.getColumn(1).values.slice(1), rows.map(r => r.summary));
  assert.equal(sheet.getCell("A3").type, ExcelJS.ValueType.String);
  const largeRows = Array.from({ length: 160 }, (_, n) => ({ key: `DMIT-${n}`, summary: `工單 ${n}`, completedAt: n }));
  const large = new ExcelJS.Workbook();
  await large.xlsx.load((await buildArtifact(largeRows, start, end)).bytes);
  assert.equal(large.getWorksheet("Sheet").rowCount, 160);
  assert.deepEqual(large.getWorksheet("Sheet").getColumn(1).values.slice(1), largeRows.map(r => r.summary));
  const empty = await buildArtifact([], start, end);
  assert.equal(empty.bytes, undefined);
  assert.match(empty.caption, /本期共 0 筆/);
});

test("Telegram 選用 sendMessage／multipart sendDocument，逾時與 5xx 結果不明", async () => {
  const sent = [];
  const client = new TelegramClient("123:token", "-123", async (url, init) => {
    sent.push({ url, form: init.body });
    return Response.json({ ok: true, result: { message_id: 7 } });
  });
  await client.send(await buildArtifact([], start, end));
  await client.send(await buildArtifact([{ summary: "測試", key: "DMIT-1", completedAt: 0 }], start, end));
  assert.match(sent[0].url, /sendMessage$/);
  assert.match(sent[1].url, /sendDocument$/);
  assert.equal(sent[1].form.get("chat_id"), "-123");
  assert.ok(sent[1].form.get("document") instanceof Blob);
  for (const fetcher of [async () => { throw new Error("URL includes secret"); }, async () => Response.json({ ok: false }, { status: 502 })]) {
    await assert.rejects(new TelegramClient("123:token", "-123", fetcher).send({ caption: "", filename: "" }), /DELIVERY_UNKNOWN/);
  }
  await assert.rejects(new TelegramClient("123:token", "-123", async () => Response.json({ ok: false }, { status: 403 })).send({ caption: "", filename: "" }), /TELEGRAM_REJECTED/);
});

test("服務送出前錯誤可補跑，送出後紀錄錯誤保留人工確認", async () => {
  const failures = [];
  const run = { id: "2026-08-31", start, end, startedAt: Date.parse(end) };
  const deps = { now: () => Date.parse(end), store: {
    claim: async () => run, sending: async () => {}, complete: async () => { throw new Error("Firestore down"); },
    fail: async (_, code, uncertain) => failures.push({ code, uncertain }),
  }, jira: { report: async () => [] }, telegram: { send: async () => 1 } };
  await assert.rejects(execute(deps, run.id, end), /REPORT_FAILED/);
  assert.equal(failures[0].uncertain, true);
  deps.jira.report = async () => { throw new ReportError("JIRA_HTTP_401"); };
  await assert.rejects(execute(deps, run.id, end), /JIRA_HTTP_401/);
  assert.equal(failures[1].uncertain, false);
  deps.jira.report = async () => [];
  deps.telegram.send = async () => { throw new ReportError("TELEGRAM_REJECTED"); };
  await assert.rejects(execute(deps, run.id, end), /TELEGRAM_REJECTED/);
  assert.equal(failures[2].uncertain, false);
});

test("資料庫延遲超過送出期限時停止，不在人工解鎖後才寄送", async () => {
  let now = Date.parse(end), sent = 0;
  const failures = [];
  const deps = { now: () => now, store: {
    claim: async () => ({ id: "2026-08-31", start, end, startedAt: now }),
    sending: async () => { now += 600_000; },
    fail: async (_, code, uncertain) => failures.push({ code, uncertain }),
  }, jira: { report: async () => [] }, telegram: { send: async () => { sent++; return 1; } } };
  await assert.rejects(execute(deps, "2026-08-31", end), /REPORT_DEADLINE/);
  assert.equal(sent, 0);
  assert.deepEqual(failures, [{ code: "REPORT_DEADLINE", uncertain: false }]);
});

test("排程採原定時間，不將延遲到達視為新的 cutoff；人工輸入限制", async () => {
  const deps = { now: () => Date.parse(end) + 30_000, store: { plan: async () => ({ id: "2026-08-31", date: "2026-09-03" }) } };
  assert.equal((await scheduled(deps, end)).result, "skipped");
  await assert.rejects(scheduled(deps, "2026-09-04T10:00:00Z"), /INVALID_SCHEDULE_TIME/);
  assert.throws(() => parseAdmin({ action: "retry", reportId: "../../control" }), /INVALID_REQUEST/);
  assert.throws(() => parseAdmin({ action: "confirmSent", reportId: "2026-08-31" }), /INVALID_REQUEST/);
  assert.throws(() => parseAdmin({ action: "retry", reportId: "2026-02-30" }), /INVALID_REQUEST/);
  assert.equal(parseAdmin({ action: "confirmSent", reportId: "2026-08-31", messageId: 1 }).messageId, 1);
});
