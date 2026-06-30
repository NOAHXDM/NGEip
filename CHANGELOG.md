# 變更日誌

本專案的所有重要變更都將記錄在此檔案中。

格式基於 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.0.0/)，
並且本專案遵循 [語義化版本](https://semver.org/lang/zh-TW/)。

## [4.0.0] - 2026-06-26

本版為主版本升級（major），整合「使用者歷程時間軸」新模組與既有附件治理、補助共用池調整，
並包含 `attendanceLogs` 權限收斂等 **Breaking security change**；部署前請詳閱「安全」一節。

### 新增
- 新增「使用者歷程時間軸」模組（`specs/006-user-journey-timeline`）：
  - 合併非餐費補助申請與 Admin 建立的 `userJourneyEvents`，依業務日期由近到遠分頁呈現，支援載入更多、空狀態與錯誤狀態。
  - 嵌入「我的職場屬性報告」與 Admin「編輯使用者」的職場屬性報告 Tab；個人頁為唯讀，Admin 入口可新增、更新與刪除事件。
  - 事件支援 0–5 個附件、畫面內預覽，並沿用既有附件 metadata 契約與 upload session／cleanup queue 治理。
  - 左右交替卡片、依日期差距拉開垂直距離、穩定隨機色碼，並為筆電補助、健康檢查、訓練課程、AI 工具與旅遊補助提供不同 icon。
- 新增 `tools/seed-salary-summary-events.js`：一次性依各年度 Bonus_Report 計算每人「N 個月本薪」（N = 12 + 該年度獎金發放比例總和），於各使用者時間軸建立「年度總薪酬統計」事件。採內嵌已驗證靜態數據表、確定性 doc id 冪等、預設 dry-run，並以 `--actor=<adminUid>`（須為 admin）作為建立者與稽核 actor。
- 新增 `tools/seed-salary-adjustment-events.js`：一次性依 `salary.xlsx` 逐月本薪矩陣偵測每次本薪變動，於時間軸建立「薪資調整核定」事件，調幅為 `(新−舊)/舊`（兩位小數）。同採內嵌靜態表、冪等與 dry-run／`--apply` 流程。
- Attendance 與 subsidy 申請支援選填附件：
  - 每筆申請最多 5 個檔案，每檔最多 3 MiB。
  - 支援 PDF、JPEG、PNG、WebP，並於 client 驗證副檔名、MIME 與 magic bytes。
  - 新增／編輯表單及審核狀態 dialog 可直接預覽圖片與 PDF。
- 新增附件 upload session、cleanup queue 與預設 dry-run 的孤兒檔稽核工具，確保實體檔皆可追溯至申請、上傳工作階段或清理工作。

### 變更
- Training 與 AI Tool 額度改為單一週年制年度池：
  - 共用總額維持 24,000。
  - 移除 AI Tool 10,000 個別子上限；任一類型皆可使用全部共用剩餘額度。
  - 個人資料「補助上限」改為只顯示一張「Training + AI Tool」卡片，保留雙色堆疊呈現兩類使用量。
  - 共用剩餘額度統一為 `max(0, 24,000 − Training 已核准金額 − AI Tool 已核准金額)`。
- Pending 申請的附件可由申請人管理；管理員可在既有可開啟的表單中管理任意狀態附件。替換流程先上傳新檔再移除舊檔，上傳或 transaction 失敗時保留原附件。

### 修復
- Subsidy 申請儲存失敗時保留 dialog 與使用者已選資料，改在表單內顯示錯誤，不再以「建立失敗」結果直接關閉 dialog。

### 安全
- 新增 `userJourneyEvents`、`userJourneyEventAudits`、journey event 附件 session／cleanup 規則與索引：事件與附件可由所有已登入者讀取，但新增、更新、刪除與附件寫入 session 僅允許 `users/{uid}.role == admin`；audit 文件 create-only、不可更新或刪除，create／update 與 delete 各自綁定不可重用的 audit ID。
- **Breaking security change**：收斂 `attendanceLogs` 的更新權限（GitHub issue #22／#34）。任意已登入使用者可變更任意 attendance 的 `status`（核准／拒絕／退回待審），且 AnnualLeave 審核可在同一 transaction 連動調整申請人的剩餘特休時數；但跨使用者內容欄位（`reason`、`type`、時間、時數等）、`userId` 與附件更新仍只允許 admin 或「pending 狀態下的申請人本人」。若有 kiosk 或外部整合曾以非 owner／非 admin 身分修改他人 attendance 內容欄位，部署前必須改用 admin 或申請人本人帳號。詳見 `specs/007-attendance-permission-hardening/`。
- **Breaking security change**：`attendanceLogs` 的讀取、建立與更新由匿名可存取收斂為至少需要 Firebase Authentication 登入；若有 kiosk 或外部整合曾依賴匿名寫入，部署前必須改用已登入流程。
- 新增 Firestore／Storage Rules 附件權限矩陣：登入者可預覽、owner 僅能修改自己的 pending 申請、admin 可代辦；未登入、Storage list、同路徑 overwrite、缺少 actor 的 cleanup queue 刪除授權及未搭配 parent removal 的 queue create 均拒絕。
- Storage attachment path 採 create-only，正式 bucket CORS 僅允許 Firebase Hosting origins 與本機 `http://localhost:4200` 的 `GET`／`HEAD`。
- 附件新增與刪除 audit trail 記錄實際 `uploadedBy`／`actionBy`，歷程不保存 download URL 或 Storage path。
- 純附件編輯僅寫入「新增附件」／「刪除附件」稽核，不再額外產生內容為空的一般「更新」紀錄。
- 編輯儲存會在上傳前再次阻擋明顯超過五檔的選擇；upload session 對既有申請必須匹配 parent owner，且一般申請人只能對 pending parent 建立。

### 測試
- 新增共用池純計算單元測試，涵蓋一般使用、AI Tool 超過舊 10,000 門檻、用盡 24,000 與既有資料超額等情境。
- 補充服務整合測試，確認回傳結果只包含一張共用池卡片。
- 新增附件格式、3 MiB 邊界、五檔替換、預覽清理與重試競態防護、owner/admin UI、audit 顯示、孤兒分類與 Emulator Rules 測試；完整 Angular 測試共 222 項通過。
- 新增 journey-timeline 服務與元件測試，並新增 journey event emulator 測試腳本與 `npm run test:journey-rules`，覆蓋 authenticated cross-user read、非 Admin 寫入拒絕、Admin CRUD、audit 原子性、Admin-only 附件 session 與 Storage 附件讀取限制。

### 維護
- AI Tool 不再建立假的個別 `annualLimit` 設定，統計結果直接併入共用池。
- 補助額度模板改用 `SubsidyType` enum，移除類型判斷魔法數字。
- 附件列表沿用 parent request query，不增加列表查詢；Blob 下載限制 3 MiB 並使用 private cache。

### 文件
- 新增 `specs/004-training-ai-shared-pool` 產品規格與實作計畫，並同步 README 與程式註解。
- 本節規則取代 3.0.8 與更早版本記載的 AI Tool 10,000 個別上限；歷史段落保留原版本行為紀錄。
- 新增 `specs/005-request-attachments` 規格、資料模型、Rules／CORS 契約、快速驗證與任務紀錄，並同步 README 的附件操作與部署說明。
- 新增 `specs/006-user-journey-timeline` 規格、計畫、資料模型、契約、任務與 quickstart，並同步 README 的使用者歷程時間軸與一次性資料腳本說明。

## [3.1.0] - 2026-06-18

### 新增
- 評量考核的指派管理新增「隨機快選」：
  - 一次為週期內所有在職且非管理員使用者產生可編輯的指派預覽，確認後才寫入 Firestore。
  - 排除自評，每位受評者最多安排 10 位評核者，並依「足額、負載平均、同職稱優先」產生結果。
  - 支援重新隨機、手動更換評核者、候選人不足提示與已完成指派鎖定。
- 新增隨機快選的服務、元件、整合測試與 Firestore Security Rules 測試，涵蓋預覽、交易式儲存、重複指派防護及截止日限制。

### 修復
- 強化 Firebase Storage 頭像流程：
  - 使用者離職時會清理頭像，並補齊服務層測試。
  - 修正個人資料表單與頭像上傳間的競態條件，避免較早完成的非同步操作覆寫較新的狀態。
  - 補強頭像 URL、Storage 刪除與失敗回復等測試斷言。
- 隨機快選儲存改採交易式建立，避免併發操作造成重複指派或覆寫既有狀態。

### 文件
- 更新 README 的評核指派流程與管理者職責，補充隨機快選預覽規則。
- 將本地開發先決條件更新為 Node.js 20.19+ 與 npm 10+，對齊 Angular 20 工具鏈。
- 同步評量考核規格、實作計畫、快速開始、介面契約與任務清單。

## [3.0.20] - 2026-06-18

### 變更
- 使用者頭像上傳由 Cloudinary 全面移植至 Firebase Storage：
  - 頭像改存確定性路徑 `avatars/{uid}/avatar.webp`，新圖覆寫舊圖，先天不產生孤兒檔。
  - 上傳前以 Canvas 將圖片縮至 ≤512px 並壓縮為 webp，帶一週快取，降低儲存與下載成本。
  - 使用者個人資料頁改以檔案選取上傳取代 Cloudinary widget，並加上傳中狀態。

### 安全
- 新增 `storage.rules`：頭像僅登入者可讀、本人或 admin 可寫／刪、限圖片且 < 1MB。
- 升級 `@angular/*` 至 20.3.25（`^20` 範圍內），修補框架層 XSS／DoS 安全通報。
- 相依漏洞由 62 降至 11：移除 `firebase-admin` devDependency（搬遷／稽核工具改為按需臨時安裝），其餘以非破壞性 `npm audit fix` 修補。剩餘 11 項皆為建置／開發伺服器工具（vite、esbuild、webpack-dev-server 等），不進線上 bundle；其修補需等待 Angular 工具鏈大版升級，不得以 `npm audit fix --force`（會將工具鏈降至 Angular 8）處理。

### 移除
- 移除 Cloudinary widget script、`cloudinary` 與 `dotenv` 依賴。
- 移除系統設定（`systemConfig/license`）的 `cloudinaryCloudName` / `cloudinaryUploadPreset` 欄位與對應 UI。
- 刪除 `tools/cloudinary-cleanup.js`。

### 新增
- `tools/migrate-avatars-to-storage.js`：一次性將在職者頭像由 Cloudinary 搬遷至 Storage（已離職者跳過）。
- `tools/storage-orphan-audit.js`：Storage 孤兒檔稽核安全網。
- `StorageService`、`image-resize` 工具與對應單元測試（共 12 項）。

### 文件
- 更新 README 遺留注意事項、CLAUDE.md 遺留項目提醒、憲章 Sync Impact TODO。
- 新增 `specs/003-cloudinary-to-storage/plan.md` 實作計畫。

## [3.0.19] - 2026-06-15

### 變更
- 將 `users` 集合作為使用者在職狀態的唯一資料來源：
  - 未設定 `exitDate` 的使用者視為目前在職。
  - 註冊時改由 `users` 集合即時計算在職人數，再與 `systemConfig/license.maxUsers` 比較。
  - 更新使用者離職日時只修改使用者文件，不再增減 License 計數器。
- 系統設定畫面保留唯讀「目前在職人數」，內容由 `users` 集合即時計算。

### 資料模型
- `systemConfig/license` 不再建立或維護 `currentUsers`。
- 應用程式啟動時若偵測到既有 `currentUsers` 欄位，會自動將其移除。
- `License` TypeScript 介面同步移除 `currentUsers`。

### 修復
- 消除重複更新已離職使用者造成重複扣減、清除離職日未加回，以及計數器可能成為負數或與使用者資料不一致的風險。

### 文件
- 更新 README 使用者資料模型說明，以及系統設定畫面的程式註解與提示文字。
- 確認 `specs/002-peer-evaluation` 對在職使用者的定義仍為 `exitDate` 未設定，與本次實作一致，無需修改。

## [3.0.18] - 2026-06-10

### 變更
- 受評者報告（`/evaluation/my-report`）與管理者嵌入報告（`UserProfile` 內）的「整體評語」呈現改版：
  - 移除跑馬燈與點擊彈窗行為
  - 改為固定高度可捲動卡片區塊，同步顯示「整體評語（overallComments）」與「具體回饋（feedbackInsights）」
  - 區塊在未 hover 時自動慢速捲動，hover 時暫停，提升長內容閱讀體驗
- 管理者「評核總覽」的「重新結算加總平均分數」流程擴充：
  - 除了回填 `rawAttributes` / `rawTotalScore`，也會同步回填 `feedbackInsights`
  - 用於補齊舊週期資料缺少 `feedbackInsights` 的情境

### 清理
- 刪除不再使用的 `MarqueeCommentsComponent`（含舊跑馬燈/彈窗樣式與互動邏輯）
- 更新相關程式註解，移除跑馬燈舊描述

### 文件
- 更新 `README.md` 評量考核系統流程與角色說明，將「跑馬燈」改為「整體評語與具體回饋滾動區」
- 更新規格與操作文件：
  - `specs/002-peer-evaluation/spec.md`
  - `specs/002-peer-evaluation/quickstart.md`
  - `specs/002-peer-evaluation/contracts/angular-interfaces.md`

## [3.0.17] - 2026-06-04

### 變更
- 管理者評核總覽新增職業原型重算能力：
  - 可重算整個考核週期所有受評者的職業原型
  - 可在受評者卡片展開區僅重算單一受評者職業原型
  - 展開區顯示「最近一次重算時間」，若無資料則顯示「尚未重算」
- 職業原型判定補上 fallback：當「前兩高屬性組合」未命中對照表時，改以最高屬性搭配其可映射且分數最高的屬性判定（同分時依排序先後）

### 測試
- 補充並通過 `EvaluationCycleService` 單元測試：
  - `recalculateCareerArchetypeForEvaluatee(cycleId, evaluateeUid)` 成功/無表單/無快照分支
- 補充並通過 `ZScoreCalculatorService` 單元測試：
  - 前兩高組合未命中時的 fallback 判定案例

### 文件
- 同步修正程式註解與規格文件，確保與實作一致：
  - `README.md`：職業原型對照從「單屬性最高」更新為「雙屬性組合 + fallback」，並補充管理者重算操作
  - `specs/002-peer-evaluation/spec.md`：驗收情境補充 fallback 行為
  - `specs/002-peer-evaluation/職場屬性評鑑規格.md`：補充未命中對照表 fallback 規則
  - `specs/002-peer-evaluation/contracts/angular-interfaces.md`：同步新 API 與方法簽名

## [3.0.16] - 2026-06-04

### 變更
- 評核者「我的考評任務」卡片補齊受評者資訊顯示：`name`、`jobTitle`、`jobRank`。
- 「已填寫」分頁任務清單調整為依 `completedAt` 由新到舊（DESC）排序，優先呈現最新完成項目。
- 「填寫考評表單」頁面標題區新增被考評對象資訊顯示（`name` / `jobTitle` / `jobRank`）。

### 修復
- 受評者資料缺漏時加入一致 fallback 文案，避免卡片顯示空白：
  - `name` → `未知用戶`
  - `jobTitle` → `職稱未設定`
  - `jobRank` → `職等未設定`

### 文件
- 同步更新程式碼註解與規格文件，補充任務清單欄位顯示與排序規則：
  - `src/app/evaluation/pages/evaluation-tasks/evaluation-tasks.component.ts`
  - `src/app/evaluation/pages/evaluation-form/evaluation-form.component.ts`
  - `specs/002-peer-evaluation/spec.md`
  - `README.md`

### 關聯議題
- Closes [#12](https://github.com/NOAHXDM/NGEip/issues/12)

## [3.0.15] - 2026-06-02

### 修復
- 修正考評快照「有效評核人數」與「整體評語」數量不一致（評語多於評核人數）的問題：
  - 根因：`overallComments` 以 `arrayUnion` 只增不減，評核者於截止日前改寫整體評語時，新評語被追加為不同字串、舊評語從未移除，留下孤兒字串使評語數虛增；而 `validEvaluatorCount`（=實際表單數）維持正確，造成兩者漂移。
  - 編輯分支：評語改寫時於主批次提交後，另以獨立 batch `arrayRemove` 移除該評核者先前的舊評語，消除預覽期殘留。採「先加後刪」順序，即使清理失敗也僅退回原行為、不會遺失評語。
  - 結束並發布：`overallComments` 改由該受評者的所有考評表重新彙整，與 `validEvaluatorCount` 同源於 `evaluateeForms`，保證 `overallComments.length === validEvaluatorCount`，並過濾空白評語。

### 文件
- 同步更新規格與設計文件：`specs/002-peer-evaluation/data-model.md`（`overallComments` 欄位語意與查詢模式）、`plan.md`（preview 提交與 final 發布的評語維護機制），以及 `README.md`（結束並發布步驟說明評語與評核人數一致性）。

### 備註
- 因 Firestore 不允許在同一次寫入對同一欄位同時套用 `arrayUnion` 與 `arrayRemove`，編輯改寫的清理刻意拆為獨立的後續 commit。
- 匿名 `string[]` 設計刻意保留（避免以 `evaluatorUid` 為 key 而讓受評者反推評核者身份）。

## [3.0.14] - 2026-05-30

### 修復
- 出勤統計結算月份 quick pick 選項改為最多 12 個（含「本期」）：
  - 歷史月份選項最多保留最近 11 個。
  - 「本期（CURRENT）」固定保留，避免操作區過長。
- 修正用戶偏好回復邏輯：
  - 若使用者先前儲存的 `statQuickPickOption` 不在目前可選月份中，系統會自動 fallback 至「本期（CURRENT）」。
  - fallback 後同步更新 client preference，避免重整後持續落在無效選項。

### 文件
- 檢查現有 README 與規格文件，未發現與本次「出勤統計月份 quick pick 上限 / 無效選項 fallback」行為衝突的敘述；本次以變更日誌作為行為更新依據。

## [3.0.13] - 2026-05-29

### 變更
- 評核者在「我的考評任務」的「已填寫」分頁，截止日前可再次進入並編輯已提交考評表。
- 考評表單頁面新增已提交編輯模式：
  - `completed` 且未截止：可更新既有提交內容。
  - 已截止：維持唯讀，不允許修改。

### 安全
- 更新 Firestore Security Rules：允許評核者在截止日前更新自己提交的 `evaluationForms`，並限制不可更改 `evaluatorUid`、`evaluateeUid`、`cycleId`、`assignmentId`、`anomalyFlags`。

### 文件
- 同步更新 `specs/002-peer-evaluation/spec.md`、`specs/002-peer-evaluation/plan.md`、`specs/002-peer-evaluation/tasks.md`、`specs/002-peer-evaluation/data-model.md` 與 `README.md`，使「截止日前可編輯、截止後鎖定」規則一致。

## [3.0.12] - 2026-05-19

### 修復
- 請假相關下拉選單同步套用「離職超過兩個月不顯示」規則：
  - 申請人下拉選單選項
  - 代理人下拉選單選項
  - 申請人篩選下拉選單選項
- 抽出共用過濾邏輯至 `UserService`：
  - 新增 `getUsersWithinExitWindow(referenceDate, months)`
  - 新增 `filterUsersWithinExitWindow(users, referenceDate, months)`
- 出勤統計改為呼叫 `UserService.filterUsersWithinExitWindow(...)`，避免規則重複散落

## [3.0.11] - 2026-05-01

### 修復
- 出勤統計結算表格過濾離職兩個月以上的使用者：
  - 顯示 CURRENT（本期）資料時，離職日距今超過兩個月的使用者不計入統計
  - 顯示歷史月份（含尚未結算的 fallback 計算）時，以該月份結束日為基準，離職日早於兩個月前的使用者不計入統計
  - 執行「結算」操作時同樣套用此過濾，確保寫入 Firestore 的統計資料不包含已離職超過兩個月的使用者
- 修改範圍：`AttendanceStatsService.calcuateAttendanceStatsMonthly`，在 `users.map` 前新增 `activeUsers` 過濾條件，以 `user.exitDate` 的 `Timestamp.toDate()` 與 `subMonths(referenceDate, 2)` 比較

## [3.0.10] - 2026-03-25

### 修復
- 健檢補助進度條「已使用」改為回調近兩年內的核准紀錄：
  - 因累計上限 12,000 = 2 年份額度（6,000 × 2），兩年窗口內的使用量即為對當前水桶餘額的有效消耗
  - `usedAmount` 改為篩選 `applicationDate >= 兩年前` 的核准申請加總，不再使用終身累計
- 進度條公式改為 `usedAmount / (usedAmount + availableAmount)`：
  - 分母 = 近兩年已使用 + 水桶可用餘額 ≤ 12,000，語義直觀
- 同步更新 `getUserSubsidyLimitStatus` 與 `SubsidyLimitDetail` 的 JSDoc

### 範例
- 到職日 2020-09-01，2025-09-02 申請 12,000：
  - 當下（2026-03-25）：usedAmount = 12,000（近2年）、availableAmount = 0 → 進度 100%
  - 2026-09-01 滿 6 年後：usedAmount = 12,000（近2年）、availableAmount = 6,000 → 進度 67%
  - 2027-09-02 申請過期出窗口：usedAmount = 0、availableAmount = 12,000 → 進度 0%

## [3.0.9] - 2026-03-25

### 修復
- 健檢補助額度計算邏輯修正為「水桶模型」，修復超額未拋棄的問題：
  - 舊邏輯：`available = min(completedYears × 6,000 − lifetimeUsed, 12,000)`，未考慮歷年未使用額度超過上限應拋棄，導致已用完額度後仍顯示有可用餘額
  - 新邏輯：逐年模擬——每到職日週年加 6,000，餘額超過 12,000 即拋棄超出部分，再依申請時間順序扣除使用量
  - 新增 `calculateHealthCheckBalance()` 方法實作水桶模型
- 健檢補助進度條改以固定上限 12,000 為滿格基準：
  - `totalLimit` 固定為 `maxAvailable`（12,000），不再是浮動的 `usedAmount + availableAmount`
  - 進度條公式：`usedAmount / totalLimit`
  - 文字顯示三項：「已使用 / 可用餘額 / 累計上限」
  - 底部附註：「已使用 X%（每滿一年 +6,000，上限 12,000）」
- 同步更新 `getUserSubsidyLimitStatus` 與 `SubsidyLimitDetail` 的 JSDoc，補充 HealthCheck 水桶模型語義

### 範例
- 到職日 2020-09-01：
  - Year 1（2021-09-01）：餘額 0 + 6,000 = 6,000
  - Year 2（2022-09-01）：餘額 6,000 + 6,000 = 12,000
  - Year 3（2023-09-01）：餘額 min(12,000 + 6,000, 12,000) = 12,000（超出 6,000 拋棄）
  - 2025-09-02 申請 12,000 → 餘額 0，可用額度 0
  - Year 6（2026-09-01）：餘額 0 + 6,000 = 6,000

## [3.0.8] - 2026-03-25

### 修復
- Training 與 AITool 補助額度計算區間由曆年制改為到職日週年制（startDate ~ 滿週年），與其他補助一致
- Training + AITool 聯合上限邏輯重寫：
  - Training 進度條：已使用 = Training 用量 + AITool 用量（合計），總額 24,000
  - AITool 進度條：總額 = min(10,000, 24,000 − Training 單獨用量)，Training 使用會擠壓 AITool 可用額度
  - Training 進度條改為堆疊雙色Bar（藍色 Training / 橘色 AI Tool），附圖例標示
- `SubsidyStatsService.getUserSubsidyStatsByType` / `getUserAllSubsidyStats` 新增 `dateRange` 參數，支援以到職日週年日期範圍查詢核准補助（筆電補助仍使用曆年回溯 3 年）
- `SubsidyLimitDetail` 介面新增 `aiToolUsedAmount`、`trainingOnlyUsedAmount` 欄位供 UI 堆疊進度條分色

### 範例
- 到職日 2024-06-01，週年期間 2025-06-01 ~ 2026-05-31：
  - 申請 AITool 8,000 + Training 4,000 → Training Bar 已用 12,000 可用 12,000 總額 24,000；AITool Bar 已用 8,000 可用 2,000 總額 10,000
  - 申請 AITool 2,000 + Training 20,000 → Training Bar 已用 22,000 可用 2,000 總額 24,000；AITool Bar 已用 2,000 可用 2,000 總額 4,000

## [3.0.7] - 2026-03-24

### 修復
- 修正健檢補助進度條在終身累計制下顯示錯誤的問題：
  - 舊邏輯：進度條使用 `usedAmount / totalLimit`，但終身累計制下 `usedAmount + availableAmount ≠ totalLimit`，導致百分比與實際可用額度不一致
  - 新邏輯：健檢補助進度條改為 `usedAmount / (usedAmount + availableAmount)`，正確反映已使用與剩餘可用的比例
  - 移除「總額」標籤，僅顯示「已使用」與「可用」，避免終身累計制下三個數字語義混淆
- 健檢補助獨立為專屬顯示區塊（`subsidy.type === 2`），與其他補助的進度條計算邏輯分離

## [3.0.6] - 2026-03-24

### 變更
- 健檢補助（Health Check）額度計算邏輯從「年度 carry-over 制」改為「年資累進終身累計制」：
  - 舊邏輯：年度固定額度 6,000，前一年未用完的餘額可結轉至當年，最多累積 12,000
  - 新邏輯：從到職日起算，每滿一年增加 6,000 可用額度，剩餘可用額度上限為 12,000
  - 已使用金額改為查詢歷年所有已核准的健檢補助總額（終身累計），不再僅計算當期
  - 年資計算改用 `differenceInYears`（基於日曆日期），取代原本的 `differenceInDays / 365.25`
- 移除健檢補助的前一年統計查詢（`previousYearStats$`），改為全時間查詢，減少 Firestore 讀取次數

### 範例
- 到職日 2024-03-24：
  - 2025-03-24 滿 1 年 → 額度 6,000
  - 2025-05-01 申請 5,000 → 剩餘 1,000
  - 2026-03-24 滿 2 年 → 累計額度 12,000，已用 5,000，剩餘 7,000
  - 2027-03-24 滿 3 年 → 累計額度 18,000，已用 5,000，剩餘 min(13,000, 12,000) = 12,000

## [3.0.5] - 2026-03-20

### 文件
- 同步規格文件與程式碼邏輯，修正 6 處衝突：JSDoc `validEvaluatorCount` 門檻（< 3 → < 5, FR-015）、新增 `getSnapshotsByUserId` 介面、新增 `UserAttributeReportEmbedComponent` 契約、Firestore 寫入成本（3 → 4 writes）、`plan.md` 補充 rawAttributes/rawTotalScore 更新說明與元件結構（5 → 6 components）

## [3.0.4] - 2026-03-19

### 修復
- 修正跑馬燈評語元件（`MarqueeCommentsComponent`）滾動速率異常問題：將 `marquee-track` 的 `display: flex` 改為 `display: inline-flex`，使元素寬度由文字內容撐開，恢復恆定 120px/s 滾動速率
- 修正評核人數不足警示門檻（FR-015）：`attribute-report` 與 `user-attribute-report-embed` 兩個元件由 `validEvaluatorCount < 3` 改為 `< 5`，與功能規格一致
- 優化補助類型（subsidy type）標籤中文顯示文字，提升可讀性

### 文件
- 更新 README.md 評量考核系統說明文件
- 同步規格文件衝突修正：`tasks.md` 索引描述（userId+cycleId DESC → userId+computedAt DESC）、`angular-interfaces.md` 跑馬燈契約更新、`plan.md` 跑馬燈設計章節更新

## [3.0.3] - 2026-03-18

### 新增
- 評核題目新增行為觀察 hint 說明，協助評核者理解各題目的觀察重點

### 修復
- 修正評核者提交表單時 `userAttributeSnapshots` preview 快照缺少 `computedAt` 欄位，導致 `getMySnapshots()` 回傳空陣列的問題

### 變更
- 移除評鑑屬性報告頁面與嵌入式元件中的 ⚠️ 警告符號，簡化預覽狀態通知的視覺表達

## [3.0.2] - 2026-03-18

### 新增
- 指派管理視窗排除已離職使用者；使用者清單欄位標頭中文化

### 修復
- 修正考評表單評語字數驗證邏輯，與 Firestore Security Rules 保持一致

## [3.0.1] - 2026-03-17

### 修復
- 修正考評表單提交時 `feedbacks` 欄位含 `undefined` 值導致 Firestore SDK 拋出 TypeError 的問題
- 修正自我評核情境下 Firestore Security Rules 拒絕 batch 寫入的問題；service 層加入提前偵測並拋出明確錯誤訊息
- 修復評核總覽管理員頁面（`/evaluation/admin/overview`）`attributes` / `totalScore` 為 `undefined` 時呼叫 `.toFixed()` 導致渲染崩潰的問題
- 更新 Firestore Security Rules：允許一般使用者在 batch 寫入中遞增 `completedAssignments`；`userAttributeSnapshots` create rule 補上 `status:preview` 驗證

### 變更
- 導覽列調整：「使用者」按鈕移至桌面版常駐區，所有人均可存取，管理員專屬選單移除重複項目
- 加班優先順序設定區塊標題文字修正

## [3.0.0] - 2026-03-17

### 新增
- 實作同儕互評模組（#002）：支援員工間互相評核，包含問卷填寫、評分彙整與報表檢視
- 使用者個人檔案新增「屬性報告」（Attribute Report）Tab，供管理員檢視員工互評職場屬性分析
- 管理員可從使用者卡片直接進入屬性報告頁面

### 變更
- 完整國際化（i18n）至繁體中文，修復相關 build 問題
- 重整導航選單結構，新增手機版響應式顯示支援
- 考核週期排序改為依 `computedAt` 倒序排列，最新結果優先顯示

### 修復
- 修正評核表單問卷屬性對應關係
- 修正 my-report 頁面 `totalScore` 與 `attributes` 欄位 undefined 導致 `toFixed` 崩潰的問題

### 內部
- 建立同儕互評系統完整規格（spec.md）與實作計畫（plan.md）
- 移除補助申請原始資料與資料移轉工具（已完成遷移）

## [2.2.4] - 2026-03-10

### 修復
- 修復出勤統計頁面選擇尚未結算的月份時，顯示空白資料的問題（#11）
- 未結算月份現在改為動態計算該月已核准（Approved）的出勤時數，行為與 CURRENT 模式相同
- 統計頁面在無結算資料時（含 CURRENT）改顯示「Statistics not yet settled」提示，取代原本空白狀態

### 技術改進
- `AttendanceStatsService` 新增 `getAttendanceStatsTemporaryForMonth(yearMonth)` 公開方法，支援針對指定月份動態計算統計
- `AttendanceStatsComponent` 非 CURRENT 選項改用 `switchMap`，Firestore 無結算資料時自動 fallback 動態計算

## [2.2.3] - 2026-01-27

### 新增
- 午餐補助日報表新增「Import without limit」按鈕，支援匯入原始金額而不受 $150 限制
- 餐費匯入功能現在可選擇是否套用金額上限

### 變更
- 優化餐費匯入介面，提供兩種匯入模式：
  - Import：套用 $150 上限（原有功能）
  - Import without limit：不套用上限，直接匯入表格原始金額

## [2.2.2] - 2026-01-16

### 變更
- 移除補助申請遷移腳本中的冗餘欄位 `installmentCount` 和 `totalMonthlyAmount`
- 更新遷移文件說明，移除已廢棄的欄位引用
- 補助統計資訊現在完全從 `installments` 子集合動態計算，避免資料不一致

### 技術改進
- 簡化 `subsidyApplications` 文件結構，減少資料冗餘
- 統一資料來源：分期數和總金額統一從 `installments` 子集合計算

## [2.2.1] - 2025-12-28

### 重構
- 升級至 Angular 20 控制流語法
- 將 user-profile 元件的 `*ngIf` 改為 `@if` 語法
- 移除未使用的 NgIf 匯入
- 消除 NG8113 編譯警告

## [2.2.0] - 2025-12-28

### 新增
- 使用者個人檔案新增「補助額度」（Subsidy Limit）Tab，顯示員工補助使用情況
- 基於到職日週年計算補助額度（例如：到職日 2024/3/15，期間為 2024/3/15 - 2025/3/14）
- 補助申請資格自動判斷：
  - 試用期（90 天）檢查
  - 滿一年檢查
  - 額度用完自動標記為不可申請
- 五種補助類型完整支援：
  - 進修課程補助（Training）：試用期後可申請，年度上限 24,000
  - AI 工具補助（AI Tool）：試用期後可申請，年度上限 10,000
  - 健檢補助（Health Check）：滿一年可申請，年度上限 6,000，可累積最多 12,000
  - 筆電補助（Laptop）：滿一年可申請，年度上限 54,000
  - 旅遊補助（Travel）：滿一年可申請，年度上限 15,000
- 筆電補助特殊處理：
  - 顯示分期領取進度（已領取 X/36 期）
  - 前一次筆電補助必須領完 36 期才能再次申請
  - 顯示已領取金額與核准金額
- 健檢補助累積邏輯：前一年未用完的額度可累積至當年，最多累積至 12,000
- 進修+AI 工具聯合限制：兩者合計上限 24,000，AI 工具獨立上限 10,000
- 補助額度 Tab 內容可垂直捲動，期間資訊固定在頂部（sticky）

### 變更
- User Profile Dialog 新增高度限制（maxHeight: 90vh），解決內容過長無法捲動的問題
- 補助額度 Tab 所有介面文字改為英文，提升國際化支援
- 補助額度檢查邏輯：額度用完或超過時自動顯示「Quota exceeded」

### 技術改進
- 新增 `SubsidyLimitService` 服務，封裝補助額度計算邏輯
- 實作到職日週年期間計算功能
- 實作筆電分期狀態查詢功能
- 優化補助額度 UI/UX，包含進度條視覺化和資格狀態標籤

## [2.1.0] - 2025-12-27

### 新增
- 出勤服務新增 `actionBy` 參數，用於記錄建立與更新操作的執行者

### 變更
- 升級 Angular 框架至 v20 版本
- 重構補助統計排行榜，改為 Dialog 彈窗展示方式
- 調整午餐補助匯入邏輯以適應新版 Excel 格式

### 修復
- 修復 Angular v20 升級後的相容性問題

## [2.0.0] - 2025-12-23

### 新增

#### 補助管理系統
- 員工補助申請系統（第一階段與第二階段）
- 餐費補助系統（第三階段）
- 多種補助類型支援（培訓課程、筆電、餐費等）
- 補助申請審批工作流程
- 筆電分期記錄管理，支援自訂金額輸入
- 全面的補助統計功能（使用者級別與系統級別分析）
- Google Sheets 匯入功能，用於餐費補助記錄
- 補助資料遷移工具（支援開發與正式環境）
- Firestore 索引優化，提升補助申請與使用者餐費統計查詢效能

#### 開發者工具與文件
- 新增 `CLAUDE.md` 為 Claude Code 提供專案指引
- 新增 GitHub Actions 工作流程：
  - Claude PR Assistant workflow
  - Claude Code Review workflow

### 變更
- 更新補助申請計畫，移除過時的系統配置章節
- 更新補助申請詳細資訊，反映培訓課程 50% 資助政策
- 更新補助申請計畫，使用修訂版 Excel 檔案

### 改進
- 在使用者列表中隱藏已離職員工的聯絡資訊和生日
- 基於實際分期金額實作筆電補助統計
- 重構程式碼結構以提高可讀性和可維護性

### 修復
- 更新 `firebase.local.json` 中的託管來源路徑

### 移除
- 移除過時的補助申請 Excel 檔案

## [1.0.0] - 2024-12-15

### 新增

#### 使用者管理
- 使用者註冊與認證功能
- 基於角色的存取控制（管理員/一般使用者）
- 使用者個人資料管理
- 使用者列表顯示與篩選
- Cloudinary 整合用於頭像上傳
- 支援 Google 帳戶登入
- 離職員工視覺化指示器（LineThroughDirective）

#### 出勤管理
- 出勤記錄建立與追蹤
- 狀態管理（待審核/已核准/已拒絕）
- 多種出勤類型支援
- 出勤統計與報表功能
- 基於日期的動態篩選（每日、每週、每月、自訂範圍）
- 申請人篩選對話框
- 出勤歷史記錄與稽核軌跡
- 出勤統計匯出為 CSV 格式
- Firestore 索引優化，提升出勤查詢效能

#### 特休管理
- 基於服務年資計算特休假
- 特休餘額追蹤
- 特休交易歷史記錄
- 特休結算功能
- 可配置的請假政策（台灣勞基法）

#### 系統配置
- 授權管理（最大使用者數與當前使用者數）
- 請假政策配置
- 系統偏好設定（初始結算年度、加班優先順序）
- Cloudinary 配置（cloud name、upload preset）
- 時區選擇與處理
- 自訂日期範圍選項

#### Firebase 整合
- Firebase Authentication 整合
- Firestore 資料庫整合
- Firebase Hosting 部署
- Firebase 模擬器支援（本地開發）
- 環境特定配置（本地與正式環境）
- Firestore 安全規則（基於角色的權限控制）

#### 使用者介面
- 響應式設計（Angular Material + Bootstrap 5）
- 深色模式支援
- 工具列導航與使用者選單
- 卡片式佈局顯示使用者資訊
- 浮動操作按鈕
- 客製化 Snackbar 通知
- 日期時間選擇器整合
- 動態表格排序與篩選

### 變更
- 從 moment.js 遷移至 date-fns 進行日期處理
- 重構為 Angular 18 standalone components
- 簡化認證與 Firestore 模擬器設定

### 技術堆疊
- Angular 18
- Firebase (Auth, Firestore, Hosting)
- Angular Material
- Bootstrap 5
- date-fns
- Cloudinary
- Karma/Jasmine

[4.0.0]: https://github.com/NOAHXDM/NGEip/compare/v3.1.0...v4.0.0
[3.1.0]: https://github.com/NOAHXDM/NGEip/compare/v3.0.20...v3.1.0
[3.0.20]: https://github.com/NOAHXDM/NGEip/compare/v3.0.19...v3.0.20
[2.2.4]: https://github.com/NOAHXDM/NGEip/compare/v2.2.3...v2.2.4
[2.2.3]: https://github.com/NOAHXDM/NGEip/compare/v2.2.2...v2.2.3
[2.2.2]: https://github.com/NOAHXDM/NGEip/compare/v2.2.1...v2.2.2
[2.2.1]: https://github.com/NOAHXDM/NGEip/compare/v2.2.0...v2.2.1
[2.2.0]: https://github.com/NOAHXDM/NGEip/compare/v2.1.0...v2.2.0
[2.1.0]: https://github.com/NOAHXDM/NGEip/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/NOAHXDM/NGEip/compare/6317ec7...v2.0.0
[1.0.0]: https://github.com/NOAHXDM/NGEip/releases/tag/v1.0.0
