const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { initializeTestEnvironment, assertFails } = require("@firebase/rules-unit-testing");
const { doc, setDoc, getDoc } = require("firebase/firestore");
const { FirestoreReportStore } = require("../functions/lib/jsm-weekly-report/store.js");
const { cutoffAt, shiftDate } = require("../functions/lib/jsm-weekly-report/calendar.js");
const { scheduled } = require("../functions/lib/jsm-weekly-report/service.js");

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIRESTORE_EMULATOR_HOST.startsWith("127.0.0.1:")) throw new Error("只允許本機 Firestore Emulator");
const projectId = "demo-jsm-weekly";
let app, db, env;
test.before(async () => {
  app = initializeApp({ projectId }); db = getFirestore(app);
  env = await initializeTestEnvironment({ projectId, firestore: { rules: readFileSync("firestore.rules", "utf8") } });
});
test.after(async () => { await env.cleanup(); await deleteApp(app); });
test.beforeEach(async () => { await env.clearFirestore(); });
async function calendar(overrides = {}) {
  const days = {};
  for (let date = "2026-01-01"; date.startsWith("2026"); date = shiftDate(date, 1)) days[date] = ![0, 6].includes(new Date(date).getUTCDay());
  await db.doc("jsmWeeklyReportCalendars/2026").set({ days: { ...days, ...overrides }, version: "test" });
}
const now = Date.parse(cutoffAt("2026-09-04"));

test("transaction 只允許一個並行執行；成功後不可重送", async () => {
  await calendar();
  const store = new FirestoreReportStore(db);
  await store.plan("2026-09-04");
  const claims = await Promise.allSettled([store.claim("2026-08-31", cutoffAt("2026-09-04"), now), store.claim("2026-08-31", cutoffAt("2026-09-04"), now)]);
  assert.equal(claims.filter(c => c.status === "fulfilled").length, 1);
  const run = claims.find(c => c.status === "fulfilled").value;
  await store.sending(run, 1, "hash"); await store.complete(run, 1);
  assert.equal(await store.claim(run.id, run.end, now), null);
  assert.equal((await db.doc("jsmWeeklyReportState/control").get()).data().cursor, run.end);
});

test("失敗不隔日補跑；人工補跑保留期間；下週可累計但不能倒退重跑舊期", async () => {
  await calendar();
  const store = new FirestoreReportStore(db);
  await store.plan("2026-09-04");
  const run = await store.claim("2026-08-31", cutoffAt("2026-09-04"), now);
  await store.fail(run, "JIRA_HTTP_401", false);
  assert.equal(await store.claim(run.id, run.end, now + 60_000), null);
  const retry = await store.claim(run.id, null, now + 100_000);
  assert.equal(retry.start, run.start); assert.equal(retry.end, run.end);
  await store.fail(retry, "JIRA_HTTP_401", false);
  const next = await store.claim("2026-09-07", cutoffAt("2026-09-11"), now + 7 * 86400000);
  assert.equal(next.start, run.start);
  await store.sending(next, 2, "hash"); await store.complete(next, 2);
  await assert.rejects(store.claim(run.id, null, now + 8 * 86400000), /PERIOD_SUPERSEDED/);
});

test("送達不明阻止下週累計；人工確認前需等待執行終止", async () => {
  await calendar(); const store = new FirestoreReportStore(db);
  await store.plan("2026-09-04");
  const run = await store.claim("2026-08-31", cutoffAt("2026-09-04"), now);
  await store.sending(run, 1, "hash"); await store.fail(run, "DELIVERY_UNKNOWN", true);
  await assert.rejects(store.claim("2026-09-07", cutoffAt("2026-09-11"), now + 7 * 86400000), /RUN_REQUIRES_REVIEW/);
  await assert.rejects(store.resolve(run.id, "confirmSent", now + 60_000, 8), /RUN_STILL_ACTIVE/);
  await store.resolve(run.id, "confirmSent", now + 601_000, 8);
  assert.equal((await db.doc("jsmWeeklyReportState/control").get()).data().cursor, run.end);
});

test("崩潰在 sending 階段保留鎖，確認未送達後才允許補跑", async () => {
  await calendar(); const store = new FirestoreReportStore(db);
  await store.plan("2026-09-04");
  const run = await store.claim("2026-08-31", cutoffAt("2026-09-04"), now);
  await store.sending(run, 1, "hash");
  await store.resolve(run.id, "confirmNotSent", now + 601_000);
  const retry = await store.claim(run.id, null, now + 602_000);
  assert.notEqual(retry.attemptId, run.attemptId);
  await assert.rejects(store.complete(run, 9), /RUN_OWNERSHIP_LOST/);
});

test("完整服務：首次休假週累計、零筆通知推進界線、API 不被假日觸發", async () => {
  const off = Object.fromEntries(Array.from({ length: 7 }, (_, i) => [shiftDate("2026-08-31", i), false]));
  await calendar(off);
  let queried = 0, delivered = 0;
  const deps = { now: () => now, store: new FirestoreReportStore(db), jira: { report: async (start) => { queried++; assert.equal(start, cutoffAt("2026-08-28")); return []; } },
    telegram: { send: async artifact => { delivered++; assert.equal(artifact.bytes, undefined); return 10; } } };
  assert.equal((await scheduled(deps, cutoffAt("2026-09-04"))).result, "skipped");
  assert.equal(queried, 0);
  deps.now = () => now + 7 * 86400000;
  assert.equal((await scheduled(deps, cutoffAt("2026-09-11"))).result, "sent");
  assert.equal(delivered, 1);
  assert.equal((await db.doc("jsmWeeklyReportState/control").get()).data().cursor, cutoffAt("2026-09-11"));
});

test("補班星期六、臨時停班原定日與跨年缺年度資料", async () => {
  await calendar({ "2026-09-05": true }); const store = new FirestoreReportStore(db);
  assert.equal((await store.plan("2026-09-04")).date, "2026-09-05");
  await calendar({ "2026-09-04": false, "2026-09-05": false });
  assert.equal((await store.plan("2026-09-05")).date, "2026-09-05");
  await assert.rejects(store.plan("2026-12-31"), /CALENDAR_MISSING/);
});

test("Firestore rules 拒絕匿名、一般使用者及前端 admin 存取所有週報集合", async () => {
  await db.doc("users/admin").set({ role: "admin" });
  for (const ctx of [env.unauthenticatedContext(), env.authenticatedContext("user"), env.authenticatedContext("admin")]) {
    for (const collection of ["jsmWeeklyReportState", "jsmWeeklyReportRuns", "jsmWeeklyReportWeeks", "jsmWeeklyReportCalendars"]) {
      await assertFails(setDoc(doc(ctx.firestore(), `${collection}/test`), { cursor: "tampered" }));
      await assertFails(getDoc(doc(ctx.firestore(), `${collection}/test`)));
    }
  }
});
