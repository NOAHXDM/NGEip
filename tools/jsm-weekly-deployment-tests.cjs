// 離線測試實際 Firebase CLI 的參數解析與 IAM member 轉換；不呼叫 Google API。
// CI 使用固定版本的全域 firebase-tools；不複製 CLI 的 CEL parser 到測試中。
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const cliRoot = process.env.FIREBASE_TOOLS_ROOT || path.join(
  execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim(), "firebase-tools",
);
const { resolveString, ParamValue } = require(path.join(cliRoot, "lib/deploy/functions/params.js"));
const { getInvokerMembers } = require(path.join(cliRoot, "lib/gcp/proto.js"));
const { buildFromV1Alpha1 } = require(path.join(cliRoot, "lib/deploy/functions/runtimes/discovery/v1alpha1.js"));
const { toBackend, envWithTypes } = require(path.join(cliRoot, "lib/deploy/functions/build.js"));
const { stackToWire } = require(path.join(path.dirname(require.resolve("firebase-functions/params")), "../runtime/manifest.js"));
const { sendJsmWeeklyReport } = require("../functions/lib/jsm-weekly-report/http.js");
const { declaredParams } = require("firebase-functions/params");
const name = "JSM_WEEKLY_INVOKER_SERVICE_ACCOUNT";
const spec = declaredParams.find(p => p.name === name).toSpec();
const endpoint = sendJsmWeeklyReport.__endpoint;
function members(value = spec.default) {
  const params = { [name]: new ParamValue(value, false, { string: true }) };
  return getInvokerMembers(endpoint.httpsTrigger.invoker.map(expr => resolveString(expr, params)), "demo-project");
}
test("CLI 解析預設值後維持 private，不產生呼叫授權或排程", () => {
  assert.deepEqual(members(), []);
  assert.equal(endpoint.scheduleTrigger, undefined);
});
test("CLI 於兩次部署皆產生同一個指定 invoker member，而非清空授權", () => {
  const email = "weekly-invoker@demo-project.iam.gserviceaccount.com";
  for (let deployment = 0; deployment < 2; deployment++) {
    assert.deepEqual(members(email), [`serviceAccount:${email}`]);
  }
});
test("不同專案可指定自己的 invoker，不含固定正式環境帳號", () => {
  const email = "report-invoker@another-project.iam.gserviceaccount.com";
  assert.deepEqual(members(email), [`serviceAccount:${email}`]);
});
test("即使 dotenv 繞過互動驗證填 public，仍不開放 allUsers", () => {
  assert.deepEqual(members("public"), []);
});
test("dotenv 空值或公開 principal 會在 CLI member 轉換時失敗", () => {
  for (const value of ["", "allUsers", "allAuthenticatedUsers"]) assert.throws(() => members(value));
});
test("SDK manifest 經 CLI discovery 與 backend 轉換仍保留指定帳號與私有 HTTP 契約", () => {
  const params = declaredParams.map(p => p.toSpec());
  const manifest = stackToWire({ endpoints: { sendJsmWeeklyReport: { ...endpoint } }, params });
  const build = buildFromV1Alpha1(manifest, "demo-project", "asia-east1", "nodejs22");
  const env = Object.fromEntries(params.filter(p => p.type !== "secret").map(p => [p.name, String(p.default ?? "")]));
  env[name] = "weekly-invoker@demo-project.iam.gserviceaccount.com";
  env.JSM_WEEKLY_RUNTIME_SERVICE_ACCOUNT = "weekly-runtime@demo-project.iam.gserviceaccount.com";
  const resolved = toBackend(build, envWithTypes(params, env)).endpoints["asia-east1"].sendJsmWeeklyReport;
  assert.deepEqual(getInvokerMembers(resolved.httpsTrigger.invoker, "demo-project"), [`serviceAccount:${env[name]}`]);
  assert.equal(resolved.serviceAccount, env.JSM_WEEKLY_RUNTIME_SERVICE_ACCOUNT);
  assert.equal(resolved.scheduleTrigger, undefined);
  assert.equal(resolved.timeoutSeconds, 540);
});
