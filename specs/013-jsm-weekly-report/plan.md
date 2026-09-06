# JSM 週報實作計畫

## 後端與權限

`sendJsmWeeklyReport` 是 Node 22、asia-east1、2nd gen 私有 HTTP Function，540 秒 timeout、512 MiB、minInstances 0。Cloud Run IAM 在 handler 前驗證 OIDC；排程與人工操作者共用 invoker 身分，所有操作有相同權限。沒有 onSchedule、公開 webhook 或前端管理頁。預設 `JSM_WEEKLY_ENABLED=false`。

`calendar.ts` 負責台北日期、週界與政府 CSV；`jira.ts` 負責分頁唯讀查詢；`delivery.ts` 負責 XLSX 與 Telegram；`store.ts` 集中 Firestore transaction；`service.ts` 串接可注入依賴；`http.ts` 處理契約、設定、IAM 部署選項與安全 log。

## Jira 認證

Jira 認證依 2026-09-06 決策採個人帳號 scoped API token。`JSM_WEEKLY_JIRA_AUTH` 預設 basic，搭配必填的 token 擁有者 Email；client 將 email:token 編碼為 Basic，並固定使用 api.atlassian.com/ex/jira 的 Cloud ID gateway。Token 由 Secret Manager 提供；dotenv 僅保存非密鑰設定，不保存 scopes 或 token。保留明確指定 bearer 的既有相容分支，但不是本流程預設。Google Cloud invoker 的 OIDC Bearer 與 Jira Basic 是兩個獨立認證邊界。

## 完成時間

依最新決策採目前 Done + `statuscategorychangedate`。該欄位是最近狀態「類別」變更時間，從非 Done 重開再進入 Done 才形成新完成時間；Done 類別內的狀態切換不算新的完成。啟用前驗證 DMIT 重開狀態屬非 Done，重新完成會更新此欄位，再設定 `JSM_WEEKLY_WORKFLOW_VERIFIED=true`。不假設 resolutiondate 在各 workflow 都會更新，不讀 changelog。

使用 `POST /rest/api/3/search/jql`、`nextPageToken` 分頁，只要求 summary、statuscategorychangedate、status。JQL 用較寬的相對天數篩候選，避免 Jira 帳號時區差異；在回傳 ISO timestamp 上精確套 `(start,end]`。當前狀態再次檢查 Done；同 issue ID 去重。最大 10,000 候選工單、20 秒單次請求、390 秒 Jira 查詢預算，超限明確失敗，不寄截斷結果。

Jira enhanced search 具索引延遲且沒有整批 snapshot 保證。查詢當下狀態／標題與補跑時相同期間可能不同；本版不保存報表內容，不承諾還原歷史 snapshot。17:30 是排程與資料截止時間，實際 Telegram 到達在查詢／產檔完成後。

## 狀態資料

全部集合僅 Admin SDK／雲端 IAM 工具可用，Security Rules 明確禁止 client 讀寫，不需要新增複合索引。

| 集合 | 文件鍵 | 內容 |
| --- | --- | --- |
| jsmWeeklyReportCalendars | YYYY | 完整年度 date:boolean、來源、CSV hash、匯入時間 |
| jsmWeeklyReportWeeks | 當週星期一 YYYY-MM-DD | 預定寄送日、日曆版本 |
| jsmWeeklyReportState | control | initialStart、成功 cursor、active run ID |
| jsmWeeklyReportRuns | 當週星期一 YYYY-MM-DD | 期間、狀態、attemptId、啟動時間、筆數、檔案 hash、Telegram message ID、固定錯誤碼 |

每天依政府資料重新算本週最後工作日；若最新日曆使最後工作日已過，保留先前尚未到達的預定日，以處理臨時停班。跨年須兩年度日曆；缺資料明確失敗，不自行套一般週末規則。首次每日檢查保存初始起點，讓第一個完整放假週也能累計。

claim transaction 同時讀 control 與 run，取得全域鎖。run ID 採週一起始日期，不因日曆更新變更防重送識別。所有狀態更新驗證 attemptId，避免舊執行覆寫新補跑。

`running → sending → sent`。送出前的錯誤或 Telegram 明確 4xx 拒絕變成 failed 並釋放鎖；逾時、5xx、不合法回覆或送出後 Firestore 寫入失敗保留 needsReview 與鎖。Function 硬中斷留下 running/sending，管理者在啟動 10 分鐘後才可確認未送出／已送出。開始發送前（含 Firestore sending transaction 返回後）檢查 480 秒期限，Telegram 限時 45 秒，避免舊 worker 因長時間延遲在人工解鎖後才寄送。僅 sent 推進 cursor。

同一期曾執行則 scheduled 不再執行；failed 可人工 retry 或下週累計。needsReview／未釐清硬中斷會阻擋所有下一期以防累計重送。confirmNotSent 只改為 failed，不自動寄送；confirmSent 記錄 message ID 並推進原截止時間。人工 retry 不接受任意期間。

## 測試

ExcelJS 使用的 uuid 以 scoped override 固定 11.1.1，排除 GHSA-w5hq-g745-h8pq。root 與 functions/package.json 皆需保留 override，分別供 workspace 安裝與獨立 Cloud Functions 建置使用。

- `npm run functions:test`：既有功能回歸、時間／日曆、Jira 分頁／授權／錯誤、XLSX round-trip、Telegram、服務與 HTTP 契約。
- `npm run test:jsm-weekly`：專用 demo Firestore Emulator，驗證真實 transaction 並行、失敗／補跑、cursor、硬中斷、日曆與 client Rules。
- CI 執行兩者。正式 Jira、Telegram、IAM、Email 由部署文件的受控驗證完成，不能以本地模擬取代。
