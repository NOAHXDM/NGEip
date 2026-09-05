const test = require("node:test");
const assert = require("node:assert/strict");
const { createReportHandler, sendJsmWeeklyReport } = require("../lib/jsm-weekly-report/http.js");
const { cutoffAt } = require("../lib/jsm-weekly-report/calendar.js");
function request(body = { action: "scheduled" }, extra = {}) {
  return { method: "POST", body, get: key => ({ "content-type": "application/json", "x-cloudscheduler-scheduletime": cutoffAt("2026-09-04") })[key], ...extra };
}
function response() { return { set() { return this; }, status(n) { this.code = n; return this; }, json(body) { this.body = body; } }; }
const silent = { info() {}, error() {} };
test("共用入口為 private HTTPS，無 schedule trigger", () => {
  for (const fn of [sendJsmWeeklyReport]) {
    assert.deepEqual(fn.__endpoint.httpsTrigger.invoker, ["private"]);
    assert.equal(fn.__endpoint.scheduleTrigger, undefined);
    assert.equal(fn.__endpoint.timeoutSeconds, 540);
  }
});
test("停用預設不讀 secret、不查詢、不寄送", async () => {
  const res = response();
  await createReportHandler(() => { throw new Error("should not load"); }, () => false, silent)(request(), res);
  assert.equal(res.body.result, "disabled");
});
test("共用入口拒絕不完整請求；錯誤原文不外洩", async () => {
  const handler = createReportHandler(() => { throw new Error("token-secret"); }, () => true, silent);
  for (const [req, status] of [[request({}, { method: "GET" }), 405], [request({}, { get: () => undefined }), 415], [request({ action: "retry" }), 400], [request(), 500]]) {
    const res = response();
    await handler(req, res);
    assert.equal(res.code, status);
    assert.ok(!JSON.stringify(res.body).includes("token-secret"));
  }
});
test("正常略過回 200；人工確認透過同一入口", async () => {
  const actions = [];
  const deps = { now: () => Date.parse(cutoffAt("2026-09-04")), store: { plan: async () => ({ id: "2026-08-31", date: "2026-09-05" }), resolve: async (...args) => actions.push(args) } };
  const res = response();
  await createReportHandler(() => deps, () => true, silent)(request(), res);
  assert.equal(res.body.result, "skipped");
  await createReportHandler(() => deps, () => true, silent)(request({ action: "confirmNotSent", reportId: "2026-08-31" }), response());
  assert.equal(actions[0][1], "confirmNotSent");
});
