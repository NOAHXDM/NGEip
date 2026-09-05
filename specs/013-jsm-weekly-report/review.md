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
