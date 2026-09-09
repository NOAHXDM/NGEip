# JSM 週報變動審查

審查日期：2026-09-05。範圍包含新增週報模組、既有 Function export、Firestore Rules、政府日曆匯入工具、測試與 CI、套件及 lockfile、README 與本目錄文件；不含使用者既有 `.codex/`。

## 結果

本輪未發現尚未修正的阻擋性程式問題。審查中已修正：

- 將 Jira 設定檢查延至取得執行紀錄後，設定失敗仍保留原期間供補跑；人工確認不依賴 Jira 設定。
- 送出前及 sending transaction 完成後檢查執行期限，避免長時間延遲的舊執行在人工解鎖後才開始寄送。
- ExcelJS 的 uuid 間接相依使用 scoped override 11.1.1，排除該新增相依鏈的已知漏洞。
- 核對單一 private HTTP 入口、相同 invoker 權限、預設停用與不含 onSchedule，並使手動文件與 Jira POST search 的 5 項 granular scopes 一致。

## 驗證

- TypeScript Functions 建置通過。
- `npm run functions:test`：41 項通過，涵蓋既有功能回歸、日曆、Jira 分頁、160 列 XLSX round-trip、零筆通知、錯誤與 HTTP 契約。
- `npm run test:jsm-weekly`：7 項通過，使用真實 Firestore Emulator 驗證並行 transaction、跨期累計、人工補跑、防重送、硬中斷、跨年日曆與前端存取限制。
- `git diff --check` 通過。
- Functions production dependency audit：8 項 moderate，0 high／critical；剩餘項目位於既有 Firebase／Google 相依鏈，未由本次 ExcelJS／csv-parse 引入。未執行可能降版既有 Firebase 套件的廣泛 audit fix。

CI 已加入兩組週報相關測試；此處結果為本機執行，不代表遠端 CI 已執行。未重跑與本次無關的完整前端建置及瀏覽器測試。

## 正式啟用前仍須驗證

- DMIT workflow 的 `statuscategorychangedate` 及 token 工單可見範圍；完成前維持 workflowVerified=false。
- 政府日曆來源、完整年度與下一年度匯入，並由管理者追蹤政府修訂。
- IAM、Secrets、Scheduler、Telegram 實際收件及 Cloud Monitoring Email 告警。未部署、未建立排程、未發送外部訊息。
- Jira 搜尋索引延遲及非 snapshot 查詢仍是已揭露限制；補跑保留期間，但不保證還原當時的工單內容與狀態。
- Telegram 結果不明時必須先人工核對，不保證跨外部 API 的 exactly-once delivery。

操作與驗證步驟見 [手動部署文件](manual-deployment.md)。

## 2026-09-06：個人有範圍權杖決策同步

- 文件、需求、計畫與 README 統一採個人 Atlassian 帳號的 scoped API token；部署範例填 Basic 與 token 擁有者 Email。
- HTTP 參數的認證預設從 bearer 改為 basic；底層保留明確選用 Bearer 的相容性，不影響 Google OIDC Bearer。
- 註明已有 dotenv 必須自行更新、Cloud ID 與 Firebase Project ID 的差異，以及 Secret 與非密鑰參數的分工。未讀取或修改個人 dotenv／Secret 值。
- `npm run functions:test` 建置及 43 項測試通過，新增預設認證與缺少 Email 驗證；160 筆分頁測試改走 Basic 並驗證精確 gateway URL。
- `git diff --check` 通過。本次未更改交易、日曆與 Rules，未重跑 Firestore Emulator；未部署或執行正式 Jira 認證測試。

## 2026-09-06：4.5.0 合併前驗證

- 依次版本升版同步 package.json、package-lock.json、README 與 CHANGELOG 為 4.5.0。
- 重新執行 Functions 建置與 43 項測試、7 項 Firestore Emulator 整合測試，全部通過。
- Angular production build 首次在受限環境以 134 中止且未提供診斷；放寬環境限制後重跑成功。完整前端 Karma 測試未在本輪重跑。
- 差異格式檢查通過；未修改本機 dotenv、Secrets 或使用者既有 `.codex/`，未執行雲端部署。

## 2026-09-09：重新部署清除 invoker 授權的修復

- 根因：HTTP options 固定 `invoker: "private"`，Firebase CLI 更新 Cloud Run IAM 時會移除服務上的直接 Run Invoker 成員，與原文件「部署後手動加上 invoker」衝突。
- 改用 `JSM_WEEKLY_INVOKER_SERVICE_ACCOUNT` 部署參數，預設 private；正式部署明確指定共用 invoker Email。使用 CEL 延後至 CLI 解析，避免 discovery 階段尚未載入 dotenv 而錯用預設。互動輸入限制格式，另攔截 dotenv 的 public 值以維持非公開預設。
- 審查範圍包含 HTTP 部署設定、單元與 CLI 相容測試、npm script、CI、README、CHANGELOG 及本規格目錄；不改 Jira／Telegram 邏輯、Firestore 交易、Rules、報表截止時間、Secret 值或套件版本。
- `npm run functions:test`：TypeScript 建置及 47 項測試通過。
- `npm run test:jsm-weekly-deployment`：6 項通過，使用實際 Firebase CLI 14.27.0 的 CEL、SDK manifest discovery、backend 與 IAM member 轉換，驗證預設 private、指定帳號、重複解析、跨專案及拒絕公開存取。此測試為離線轉換驗證，不代表已進行兩次雲端部署。
- `npm run test:jsm-weekly`：7 項 Firestore Emulator 整合測試通過。測試中的 PERMISSION_DENIED 為預期 client Rules 拒絕；另有 Java <21 未來相容性提醒，CI 已使用 Java 21。
- `git diff --check` 通過。未重跑無關前端建置；未部署、未觸發正式報表、未改動本機 dotenv、正式 IAM 或 `.codex/`。
- 手動文件新增既有環境 403 遷移與驗收：保留原參數、設定 invoker、僅部署週報 Function、核對 IAM／OIDC、等待正常排程；不重建 Scheduler 或 Secret。純 IAM 403 不建立 failed run，不能直接拿 Scheduler 日期補跑。
- 本輪未發現尚未修正的阻擋性問題；正式驗收仍需管理者部署後核對直接與繼承 IAM，確認下一次 Scheduler 成功。

## 2026-09-09：4.5.2 版本整理

- 管理者提供截圖，確認週報 Function 更新成功，服務直接 IAM 包含指定 invoker 的 roles/run.invoker。此為管理者驗證結果，尚不代表下一次 Scheduler／Telegram 端到端驗收完成。
- 依要求將專案 patch 版本從 4.5.1 升至 4.5.2，同步 package.json、package-lock.json、README 與 CHANGELOG；Functions 子套件版本與相依套件不變。
- 提交範圍只包含本次 IAM 修正、測試、CI、部署文件與版本整理；不納入本機 dotenv、Secrets 或使用者的 `.codex/`。
