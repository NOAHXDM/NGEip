# JSM 週報手動部署與操作

Function 已實作，預設停用；本文件不代表正式部署已完成。以下 `<...>` 均須換成自己的值。API 權限於 2026-09-05 依官方文件核對。

## Jira token 範圍

本版只使用 **POST `/rest/api/3/search/jql`**，不讀歷程或專案狀態 API。建立 Jira scoped API token 時，若介面提供 Classic scope，可勾選官方建議的 `read:jira-work`；若使用 Granular scopes，勾選下列 **5 項**，兩種方式擇一即可：

- [ ] `read:issue-details:jira`
- [ ] `read:field.default-value:jira`
- [ ] `read:field.option:jira`
- [ ] `read:field:jira`
- [ ] `read:group:jira`

這是 POST enhanced search 的官方 scope 清單，即使只輸出標題仍依 endpoint 契約授權。不需要 changelog、狀態 API、工單寫入／刪除、管理權限或 JSM 寫入 scopes。

帳號另需 DMIT 的 Browse Projects 與 issue security level 可見權限；scopes 不會增加帳號原本看不到的工單。HTTP 200 不代表資料完整，須與同帳號人工查詢核對。設定 token 到期日並安排輪替。

Scoped token 一律使用 `https://api.atlassian.com/ex/jira/<CLOUD_ID>`。Atlassian service account token 用 Bearer；一般帳號 token 用 Basic（email + token）。以環境參數指定，不猜測認證類型。

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

先建立專用 runtime service account，授予 Firestore 存取需要的 `roles/datastore.user`，以及以下三個 Secret 的 `roles/secretmanager.secretAccessor`。不要共用既有 Google Docs Function 的 service account。排程／人工共用另一個 invoker service account，不授予它 Firestore 或 Secret 存取權。

```sh
firebase functions:secrets:set JSM_WEEKLY_JIRA_TOKEN --project <PROJECT_ID>
firebase functions:secrets:set JSM_WEEKLY_TELEGRAM_TOKEN --project <PROJECT_ID>
firebase functions:secrets:set JSM_WEEKLY_TELEGRAM_CHAT_ID --project <PROJECT_ID>
```

使用 CLI 互動輸入值，不把密鑰放在命令列、Git、log 或前端。chat ID 為數字字串（群組通常是負數）；Bot 須在群組中且能傳訊息／文件。

建立未提交 Git 的 `functions/.env.<PROJECT_ID>`：

```dotenv
JSM_WEEKLY_ENABLED=false
JSM_WEEKLY_WORKFLOW_VERIFIED=false
JSM_WEEKLY_JIRA_CLOUD_ID=<CLOUD_ID>
JSM_WEEKLY_JIRA_PROJECT=DMIT
JSM_WEEKLY_JIRA_AUTH=bearer
JSM_WEEKLY_JIRA_EMAIL=
JSM_WEEKLY_RUNTIME_SERVICE_ACCOUNT=<RUNTIME_SA_EMAIL>
```

一般帳號 token 改為 `JSM_WEEKLY_JIRA_AUTH=basic` 並填 email。workflow 與日曆驗證完成後將前兩項改成 true 再部署。尚未填設定的 clone 預設停用，Repository 不含 onSchedule。每一專案支援一條報表資料流；已有執行紀錄後不要任意更改 Jira Project 或群組設定，避免混用 cursor。

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
npm run test:jsm-weekly
firebase deploy --config firebase.prod.json --project <PROJECT_ID> --only functions:sendJsmWeeklyReport,firestore:rules
```

這不會建立 Scheduler。首次部署須確認 Secrets、runtime service account 與部署者的 serviceAccountUser 權限。Function 設為 invoker private；部署後確認沒有 allUsers／allAuthenticatedUsers 的 Run Invoker 授權，也沒有更高層級的非預期授權。

取得 Function 的 service URI 與 Cloud Run service 名稱：

```sh
gcloud functions describe sendJsmWeeklyReport --gen2 --region asia-east1 --project <PROJECT_ID> --format='value(serviceConfig.uri)'
gcloud functions describe sendJsmWeeklyReport --gen2 --region asia-east1 --project <PROJECT_ID> --format='value(serviceConfig.service)'
```

以下 `<FUNCTION_URL>` 使用輸出的 service URI；`<RUN_SERVICE>` 用 service 資源名稱的最後一段。以同一個 invoker service account 供排程與管理者呼叫：

```sh
gcloud run services add-iam-policy-binding <RUN_SERVICE> --region asia-east1 --project <PROJECT_ID> --member='serviceAccount:<INVOKER_SA_EMAIL>' --role=roles/run.invoker
```

## 手動建立 Cloud Scheduler

先在同一專案建立 invoker service account（不得使用 Cloud Scheduler service agent 本身），啟用 Scheduler API。建立 job 的操作者須能 actAs 此帳號；保留 Scheduler service agent 的 roles/cloudscheduler.serviceAgent。

```sh
gcloud services enable cloudscheduler.googleapis.com --project <PROJECT_ID>
gcloud scheduler jobs create http jsm-weekly-report --project <PROJECT_ID> --location asia-east1 --schedule='30 17 * * *' --time-zone=Asia/Taipei --uri='<FUNCTION_URL>' --http-method=POST --headers='Content-Type=application/json' --message-body='{"action":"scheduled"}' --oidc-service-account-email='<INVOKER_SA_EMAIL>' --oidc-token-audience='<FUNCTION_URL>' --max-retry-attempts=0 --max-retry-duration=0s --attempt-deadline=600s
```

Function 使用 Scheduler 自帶 `X-CloudScheduler-ScheduleTime` 作為原定截止時間，只接受台北 17:30 且在一天內的投遞。只有本週最後工作日才查 Jira、寄送。不可將一般 Run now 當成補跑；補跑請使用下方 retry 契約。

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
- [Cloud Scheduler 重試](https://docs.cloud.google.com/scheduler/docs/configuring/retry-jobs)
- [Email 日誌告警](https://docs.cloud.google.com/logging/docs/alerting/log-based-alerts)
