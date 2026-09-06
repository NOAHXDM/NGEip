// 使用方式見 specs/013-jsm-weekly-report/manual-deployment.md；預設只驗證，不寫入。
const { readFileSync } = require("node:fs");
const { createHash } = require("node:crypto");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { parseGovernmentCalendar } = require("../functions/lib/jsm-weekly-report/calendar.js");

async function main() {
  const args = process.argv.slice(2);
  const value = name => args[args.indexOf(name) + 1];
  const has = name => args.includes(name);
  if (!has("--file") || !has("--year") || (has("--apply") && !has("--project"))) {
    throw new Error("需指定 --file 官方 CSV --year 西元年；寫入另外指定 --apply --project 專案ID");
  }
  const bytes = readFileSync(value("--file"));
  const year = Number(value("--year"));
  const days = parseGovernmentCalendar(new TextDecoder("utf-8", { fatal: true }).decode(bytes), year);
  const version = createHash("sha256").update(bytes).digest("hex");
  console.log(JSON.stringify({ year, days: Object.keys(days).length, workdays: Object.values(days).filter(Boolean).length, version, apply: has("--apply") }));
  if (!has("--apply")) return;
  const projectId = value("--project");
  if (!/^[a-z][a-z0-9-]+$/.test(projectId)) throw new Error("無效專案ID");
  initializeApp({ projectId });
  await getFirestore().doc(`jsmWeeklyReportCalendars/${year}`).set({
    days, version, source: "https://data.gov.tw/dataset/14718", importedAt: new Date().toISOString(),
  });
  console.log(`已更新 ${projectId} 的 ${year} 政府行事曆。`);
}
main().catch(error => { console.error(error.code || error.message); process.exitCode = 1; });
