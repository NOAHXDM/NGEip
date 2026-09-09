# JSM 週報手動部署與操作

Function 已實作，預設停用；本文件不代表正式部署已完成。以下 `<...>` 均須換成自己的值。API 權限於 2026-09-05 依官方文件核對；2026-09-06 確認採個人 Atlassian 帳號的有範圍 API 權杖，認證方式為 Basic。

## Jira token 範圍

在個人 Atlassian 帳號的安全性 → API 權杖頁面，選擇「建立有範圍的 API 權杖」，指定 Jira 並設定到期日；不要選無範圍的「建立 API 權杖」。

本版只使用 **POST `/rest/api/3/search/jql`**，不讀歷程或專案狀態 API。建立有範圍權杖時，若介面提供 Classic scope，可勾選官方建議的 `read:jira-work`；若使用 Granular scopes，勾選下列 **5 項**，兩種方式擇一即可。Classic scope 仍是 scope，不代表無範圍權杖：

- [ ] `read:issue-details:jira`
- [ ] `read:field.default-value:jira`
- [ ] `read:field.option:jira`
- [ ] `read:field:jira`
- [ ] `read:group:jira`

這是 POST enhanced search 的官方 scope 清單，即使只輸出標題仍依 endpoint 契約授權。不需要 changelog、狀態 API、工單寫入／刪除、管理權限或 JSM 寫入 scopes。

帳號另需 DMIT 的 Browse Projects 與 issue security level 可見權限；scopes 不會增加帳號原本看不到的工單。HTTP 200 不代表資料完整，須與同帳號人工查詢核對。設定 token 到期日並安排輪替。

本流程使用 `https://api.atlassian.com/ex/jira/<CLOUD_ID>`，程式已固定此 gateway；不改用 `<site>.atlassian.net`。`CLOUD_ID` 是 Jira 站台 ID，不是 Organization ID、Firebase Project ID 或完整網址。

個人帳號的有範圍權杖採 **Basic（建立權杖的帳號 Email + 原始 token）**；有 scopes 不等於 Bearer。程式會組成認證標頭，不必自行將 token 做 Base64 編碼或加上 Basic／Bearer 前綴。Scopes 在 Atlassian 建立權杖時選取，不能透過 dotenv 增加。

## 首次啟用前：驗證完成欄位

本版選用 `statuscategorychangedate`，意義是最近一次狀態類別變更時間。由 Jira 管理者在測試工單確認：

1. 完成、取消、不處理、重複等狀態都屬 Done，重開狀態屬 To Do 或 In Progress。
2. 用同一個 scoped token POST `/rest/api/3/search/jql`，body 如下；把 key 換成測試工單，不加 Done 篩選以便觀察重開。

```json
{"jql":"key = DMIT-123","fields":["summary","status","statuscategorychangedate"],"maxResults":1}
```

3. 完成 → 重開 → 再完成，每次查詢回傳欄位；確認再完成時 timestamp 更新且 statusCategory.id 為 3。
4. 測試保留在重開狀態的工單不會被正式 Done 查詢選中。已完成且未重開的工單時間維持不變；Done 類別內互轉不算重新完成。
5. 記錄結果後才設定 `JSM_WEEKLY_WORKFLOW_VERIFIED=true`。若不符合，先修正 workflow 或調整完成欄位設計，不直接啟用。

查詢是即時狀態，沒有歷史 snapshot。補跑雖保留原期間，若工單已在補跑前重開或再次完成，結果可能不同。Jira 搜尋索引也可能延遲；本版不保證秒級即時索引完整性。

## 設定 Secrets 與執行環境

先建立專用 runtime service account，授予 Firestore 存取需要的 `roles/datastore.user`，以及以下三個 Secret 的 `roles/secretmanager.secretAccessor`。不要共用既有 Google Docs Function 的 service account。排程／人工共用另一個 invoker service account，不授予它 Firestore 或 Secret 存取權。invoker 也須在部署前建立於同一專案（已存在則沿用），不得使用 Cloud Scheduler service agent 本身。

```sh
firebase functions:secrets:set JSM_WEEKLY_JIRA_TOKEN --project <PROJECT_ID>
firebase functions:secrets:set JSM_WEEKLY_TELEGRAM_TOKEN --project <PROJECT_ID>
firebase functions:secrets:set JSM_WEEKLY_TELEGRAM_CHAT_ID --project <PROJECT_ID>
```

使用 CLI 互動輸入值，不把密鑰放在命令列、Git、log 或前端。chat ID 為數字字串（群組通常是負數）；Bot 須在群組中且能傳訊息／文件。

建立未提交 Git 的 `functions/.env.<PROJECT_ID>`，檔名使用部署目標的 Firebase Project ID。此檔只保存非密鑰的專案設定，部署時由 Firebase CLI 讀取；Token 與 chat ID 仍留在 Secret Manager，不放進 dotenv：

```dotenv
JSM_WEEKLY_ENABLED=false
JSM_WEEKLY_WORKFLOW_VERIFIED=false
JSM_WEEKLY_JIRA_CLOUD_ID=<CLOUD_ID>
JSM_WEEKLY_JIRA_PROJECT=DMIT
JSM_WEEKLY_JIRA_AUTH=basic
JSM_WEEKLY_JIRA_EMAIL=<ATLASSIAN_ACCOUNT_EMAIL>
JSM_WEEKLY_RUNTIME_SERVICE_ACCOUNT=<RUNTIME_SA_EMAIL>
JSM_WEEKLY_INVOKER_SERVICE_ACCOUNT=<INVOKER_SA_EMAIL>
```

`JSM_WEEKLY_JIRA_EMAIL` 必填，必須與建立該權杖的 Atlassian 帳號一致；不是告警收件者。`JSM_WEEKLY_RUNTIME_SERVICE_ACCOUNT` 則填 Google Cloud runtime IAM 帳號（例如 `jsm-weekly-runtime@<PROJECT_ID>.iam.gserviceaccount.com`），不是 Jira 帳號，也不是 Scheduler invoker。

`JSM_WEEKLY_INVOKER_SERVICE_ACCOUNT` 填排程／人工共用帳號的完整 Email，例如 `jsm-weekly-invoker@<PROJECT_ID>.iam.gserviceaccount.com`；不加 `serviceAccount:` 前綴，不填 runtime 帳號。這是非密鑰的部署參數，CLI 會用它設定此 Cloud Run 服務的 `roles/run.invoker`。未設定時參數預設 `private`（不授予直接呼叫權限）；非互動部署若缺參數可能直接中止，應明確提供值。互動輸入僅接受專用服務帳號 Email 或 `private`；若 dotenv 誤填 `public`，程式仍解析為 `private`，不開放匿名呼叫；空值或無效 principal 會造成部署失敗，不可用來啟用服務。

**每一台部署電腦與 CI 都必須提供相同 invoker 參數。** Firebase CLI 會依程式設定更新服務層級的 Run Invoker 綁定；本設計只宣告這一個帳號，額外手動加入的同角色成員不會保留。不要再依賴「程式固定 private、部署後手動加權限」：後續部署會清掉該手動授權。`private` 也不會移除專案／組織層級繼承的權限，須另行檢查。

workflow 與日曆驗證完成後將前兩項改成 true 再部署。尚未填設定的 clone 預設停用，Repository 不含 onSchedule。每一專案支援一條報表資料流；已有執行紀錄後不要任意更改 Jira Project 或群組設定，避免混用 cursor。

若先前照舊範例填了 `JSM_WEEKLY_JIRA_AUTH=bearer` 且 Email 留空，必須手動改為上述設定再部署；程式改變預設值不會覆蓋你已有的 dotenv。換電腦或 CI 部署也須提供同一組非密鑰參數。Token 更新則以 Secret CLI 建立新版本，再重新部署引用它的 Function。

底層 Jira client 仍保留明確指定 Bearer 的相容能力，供 Atlassian Service Account token 使用；這不是本次確認的個人權杖部署流程，不要因為權杖有 scopes 就切換為 Bearer。

## 匯入政府行事曆

從[政府資料集](https://data.gov.tw/dataset/14718)下載「中華民國政府行政機關辦公日曆表」年度 CSV，選一般版（非 Google 行事曆專用格式）。政府 CSV 的是否放假：0 為上班、2 為放假。

```sh
npm run functions:build
node tools/import-jsm-calendar.cjs --file <CSV_PATH> --year 2026
```

此命令只驗證 UTF-8、完整年度、日期、重複與放假代碼，顯示筆數／工作日數／hash。確認檔案來源後，以有 Firestore 寫入權的 Application Default Credentials 執行：

```sh
gcloud auth application-default login
node tools/import-jsm-calendar.cjs --file <CSV_PATH> --year 2026 --project <PROJECT_ID> --apply
```

以同樣方式匯入下一年度，避免跨年那週缺日曆。政府發布修正版時重新下載並執行，更新同一年度文件。工具保存來源與版本 hash，不把個別公司休假混入政府日曆。

Function 每天檢查本週並保存預定發送日。更新使最後工作日已經過去時，保留原定尚未到達的發送日；前提是該週曾成功執行檢查。首次啟用無歷史排程時無法回推未曾保存的臨時停班決策。

## 部署私有 Function 與規則

```sh
npm run functions:test
npm run test:jsm-weekly-deployment
npm run test:jsm-weekly
firebase deploy --config firebase.prod.json --project <PROJECT_ID> --only functions:sendJsmWeeklyReport,firestore:rules
```

這不會建立 Scheduler。首次部署須確認 Secrets、runtime service account 與部署者的 serviceAccountUser 權限；部署者還需有目標服務的 `run.services.getIamPolicy`／`run.services.setIamPolicy` 權限，才能讀取與更新呼叫授權，不要把這些部署權限授予 invoker。Function 仍是需要 IAM 認證的私有入口，但部署時會明確授權設定中的 invoker，而不是固定使用 `invoker: "private"`。部署後確認沒有 allUsers／allAuthenticatedUsers 的 Run Invoker 授權，也沒有更高層級的非預期授權。

取得 Function 的 service URI 與 Cloud Run service 名稱：

```sh
gcloud functions describe sendJsmWeeklyReport --gen2 --region asia-east1 --project <PROJECT_ID> --format='value(serviceConfig.uri)'
gcloud functions describe sendJsmWeeklyReport --gen2 --region asia-east1 --project <PROJECT_ID> --format='value(serviceConfig.service)'
```

以下 `<FUNCTION_URL>` 使用輸出的 service URI；`<RUN_SERVICE>` 用 service 資源名稱的最後一段。檢查部署後的直接授權：

```sh
gcloud run services get-iam-policy <RUN_SERVICE> --region asia-east1 --project <PROJECT_ID> --format=yaml
```

預期 `roles/run.invoker` 的 members 包含 `serviceAccount:<INVOKER_SA_EMAIL>`。不要只看部署成功訊息；若缺少，先核對部署參數與部署者更新 IAM 的權限。

## 已部署環境：修復重新部署後 Scheduler 403

舊版固定 `invoker: "private"`，會在 Firebase 部署更新 IAM 時移除先前手動加上的 Run Invoker 授權。這種情況不能只重複手動加權限，必須更新程式及部署參數：

1. 更新至本次修正的程式，在既有 `functions/.env.<PROJECT_ID>` **新增** `JSM_WEEKLY_INVOKER_SERVICE_ACCOUNT=<INVOKER_SA_EMAIL>`。保留其他已驗證設定，不要把已啟用的 enabled／workflowVerified 重設為 false；不必重建 Secret 或服務帳號。
2. 執行上述單元、部署設定與 Emulator 測試。部署設定測試需要全域安裝 Firebase CLI（CI 固定 14.27.0）；它只在本機使用 CLI 的參數解析與 IAM member 轉換，不呼叫 Google API。非全域安裝可用 `FIREBASE_TOOLS_ROOT` 指定 firebase-tools 套件目錄。
3. 僅更新週報 Function；本次沒有修改 Firestore Rules：

```sh
firebase deploy --config firebase.prod.json --project <PROJECT_ID> --only functions:sendJsmWeeklyReport
```

4. 用上一節 `get-iam-policy` 確認指定 invoker 已具有服務層級的 `roles/run.invoker`。再確認既有 Scheduler 的儲存設定：

```sh
gcloud scheduler jobs describe jsm-weekly-report --project <PROJECT_ID> --location asia-east1 --format='yaml(state,schedule,timeZone,httpTarget.uri,httpTarget.httpMethod,httpTarget.oidcToken,retryConfig)'
```

`serviceAccountEmail` 必須等於新增參數；`audience` 使用 `serviceConfig.uri`，URI 指向同一 Function，POST、每日 `30 17 * * *`、Asia/Taipei，且未暫停。沿用原本的零重試設定，不必重建 Scheduler、匯入日曆或重新登入 ADC。

5. 等下一次正常 17:30 排程，確認 Scheduler 成功及 Function 結果。非最後工作日預期 HTTP 200／`skipped`；最後工作日才可能寄送。**不要在任意時間按 Run now 驗收**，它仍受下節的觸發時間限制。

若 403 發生在 Cloud Run IAM、handler 未執行，該次不會建立可 `retry` 的 failed 報表；不要憑 Scheduler 日期手動建立 reportId 或修改 cursor。沿用既有狀態讓下一次有效排程處理；若沒有任何成功初始化，首次起點仍依當週之前一週五計算，並非從首次 403 日期回推。若另有 failed／needsReview 紀錄，再依下方人工操作處理。

## 手動建立 Cloud Scheduler

使用部署參數中的同一個 invoker service account，啟用 Scheduler API。建立 job 的操作者須能 actAs 此帳號；保留 Scheduler service agent 的 roles/cloudscheduler.serviceAgent。

```sh
gcloud services enable cloudscheduler.googleapis.com --project <PROJECT_ID>
gcloud scheduler jobs create http jsm-weekly-report --project <PROJECT_ID> --location asia-east1 --schedule='30 17 * * *' --time-zone=Asia/Taipei --uri='<FUNCTION_URL>' --http-method=POST --headers='Content-Type=application/json' --message-body='{"action":"scheduled"}' --oidc-service-account-email='<INVOKER_SA_EMAIL>' --oidc-token-audience='<FUNCTION_URL>' --max-retry-attempts=0 --max-retry-duration=0s --attempt-deadline=600s
```

Function 使用 Scheduler 自帶 `X-CloudScheduler-ScheduleTime` 判斷排程日期，接受台北時間 17:30:00（含）至 17:35:00（不含）的觸發時間，例如 17:30:05.199743；時間不得在未來，且投遞時須距觸發時間未滿 24 小時。報表截止時間一律取該日期的 17:30:00，不會隨觸發偏移或投遞延遲而延後。只有本週最後工作日才查 Jira、寄送，其他日期回傳 HTTP 200 與 `skipped`。一般 Run now 仍受此觸發範圍限制，不可當成補跑；補跑請使用下方 retry 契約。

17:30 是開始查詢與報表截止時間，實際送達時間在查詢及產檔之後。無失敗重試仍可能有重複投遞，Firestore run 及全域執行鎖負責防重送。

## 手動操作（同一 Function）

人工以相同 invoker service account 取得 OIDC token，操作者需被授予該帳號的 `roles/iam.serviceAccountTokenCreator`。建立本機 request JSON 檔，內容選一種：

```json
{"action":"retry","reportId":"2026-08-31"}
```

```json
{"action":"confirmSent","reportId":"2026-08-31","messageId":12345}
```

```json
{"action":"confirmNotSent","reportId":"2026-08-31"}
```

reportId 是原期週一日期，可在 Firestore jsmWeeklyReportRuns 或成功 log 取得。retry 只接受 failed，沿用原 start/end；已成功或新一期已涵蓋的舊期拒絕補跑。

以下 shell 變數只用於短期 OIDC token，執行時勿啟用 shell trace：

此處的 `Authorization: Bearer` 是 **Google Cloud OIDC 呼叫 Function**，不是 Jira API 認證；即使 dotenv 的 Jira AUTH 為 basic，下列命令仍須維持 Bearer。

```sh
JSM_REPORT_ID_TOKEN=$(gcloud auth print-identity-token --impersonate-service-account='<INVOKER_SA_EMAIL>' --audiences='<FUNCTION_URL>')
curl --fail-with-body --request POST '<FUNCTION_URL>' --header "Authorization: Bearer ${JSM_REPORT_ID_TOKEN}" --header 'Content-Type: application/json' --data-binary @<REQUEST_JSON_PATH>
unset JSM_REPORT_ID_TOKEN
```

needsReview、殘留 running/sending 會阻止後續報表。執行開始 10 分鐘後，查看群組：確認已送達則 confirmSent 並填 messageId；確認未送達則 confirmNotSent（只釋放鎖並設 failed），再自行決定 retry 或等下週累計。不要直接修改 control.cursor／active。

只執行 retry 不需 Scheduler header。任意期間、任意 chat ID 或 Jira URL 都不接受作為 request 參數。

## Email 告警與驗證

Function 不內建 SMTP。管理者在 Cloud Monitoring 建立 Email notification channel 和 log-based alert。Function 告警篩選：

```text
resource.type="cloud_run_revision"
resource.labels.service_name="<RUN_SERVICE>"
severity>=ERROR
jsonPayload.component="jsm-weekly-report"
```

另設 Scheduler job 失敗告警，涵蓋 OIDC、Function 尚未啟動及執行逾時：

```text
resource.type="cloud_scheduler_job"
resource.labels.job_id="jsm-weekly-report"
resource.labels.location="asia-east1"
severity>=ERROR
```

依 Logs Explorer 中實際失敗紀錄核對 filter，設定 Email 收件者、通知間隔與 incident 關閉策略。重複失敗告警可能被通知間隔／incident 狀態抑制，不代表每次失敗必有獨立 Email。

使用測試專案／群組完成：未授權呼叫被拒絕、160 筆以上查詢與列數核對、零筆不附檔、明確失敗留下 failed 並收到 Email、逾時留下待人工確認、補跑不改原期間。確認目前參數 enabled 與 workflowVerified 皆為 true；正式啟用前先在測試環境驗證，不直接用真實群組做故障注入。

停用時 pause Scheduler；緊急停止新執行可設 JSM_WEEKLY_ENABLED=false 再部署。停用不會中止已在執行的請求。保留 Firestore 執行紀錄與初始界線，恢復後可延續期間。

## 官方參考

- [Jira POST enhanced search 與 scopes](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-search/)
- [statusCategoryChangedDate 語意](https://support.atlassian.com/jira/kb/how-to-search-using-statuscategory-statuscategorychangeddate-function-with-jql/)
- [一般帳號 scoped API token](https://support.atlassian.com/atlassian-account/docs/manage-api-tokens-for-your-atlassian-account)
- [Service account API token](https://support.atlassian.com/user-management/docs/manage-api-tokens-for-service-accounts/)
- [Cloud Scheduler OIDC](https://cloud.google.com/scheduler/docs/http-target-auth)
- [Firebase 部署參數與 dotenv](https://firebase.google.com/docs/functions/config-env)
- [Firebase CLI 部署 Function 與 invoker 更新實作](https://github.com/firebase/firebase-tools/blob/v14.27.0/src/deploy/functions/release/fabricator.ts)
- [Cloud Scheduler 重試](https://docs.cloud.google.com/scheduler/docs/configuring/retry-jobs)
- [Email 日誌告警](https://docs.cloud.google.com/logging/docs/alerting/log-based-alerts)
