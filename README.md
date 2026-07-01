# NGEip

[![Contributors](https://img.shields.io/github/contributors/NOAHXDM/NGEip.svg?style=for-the-badge)](https://github.com/NOAHXDM/NGEip/graphs/contributors)
[![Forks](https://img.shields.io/github/forks/NOAHXDM/NGEip.svg?style=for-the-badge)](https://github.com/NOAHXDM/NGEip/network/members)
[![Stargazers](https://img.shields.io/github/stars/NOAHXDM/NGEip.svg?style=for-the-badge)](https://github.com/NOAHXDM/NGEip/stargazers)
[![Issues](https://img.shields.io/github/issues/NOAHXDM/NGEip.svg?style=for-the-badge)](https://github.com/NOAHXDM/NGEip/issues)
[![License](https://img.shields.io/github/license/NOAHXDM/NGEip.svg?style=for-the-badge)](LICENSE.txt)
[![Version](https://img.shields.io/github/package-json/v/NOAHXDM/NGEip?style=for-the-badge)](package.json)
[![Last Commit](https://img.shields.io/github/last-commit/NOAHXDM/NGEip?style=for-the-badge)](https://github.com/NOAHXDM/NGEip/commits/main)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/NOAHXDM/NGEip)

NGEip 是一套以 **Angular 20 + Firebase** 為核心的企業資訊入口網站（EIP）。
本專案依據 `.specify/memory/constitution.md` 的治理原則運作，後端能力統一使用
Firebase Authentication、Cloud Firestore、Firebase Storage 與 Firebase Hosting。

## 專案定位

- 服務企業內部的人員資料、出勤、請假、補助與系統設定流程
- 以 Firebase 為唯一後端平台，集中管理驗證、資料存取、檔案儲存與部署
- 以繁體中文（zh-TW）作為規格、計畫與使用者文件的主要語言

## 核心原則摘要

1. **Firebase-only backend**：新增或重構功能不得再引入 Cloudinary、Realtime Database 或其他後端服務。
2. **驗證一致性**：所有登入流程皆以 Firebase Authentication 為唯一來源，使用者資料儲存在 Firestore，並以 Firebase UID 作為鍵值。
3. **Firestore-first data model**：資料模型優先採平坦結構，設計時需同時考量索引、查詢效率與讀寫成本。
4. **Security Rules mandatory**：所有資料存取必須受 Firestore Security Rules 驗證。
5. **Angular + 官方 Firebase SDK**：前端 Firebase 互動統一透過官方 Firebase JavaScript SDK。
6. **測試為交付門檻**：所有 business logic 必須具備單元測試與整合測試。
7. **文件分工**：產品需求寫在 `spec.md`，技術實作與決策寫在 `plan.md`。

## 主要功能

- 使用者註冊、登入與角色管理
- 員工出勤紀錄、審核與統計
- 請假規則、餘額與異動管理
- 補助申請、審核與統計
- Attendance 與 subsidy 多檔附件、畫面內預覽、異動稽核與孤兒檔治理
- 使用者歷程時間軸（合併補助申請與 Admin 事件，依業務日期分頁呈現）
- 系統設定與 Firebase Emulator 本地開發流程

### Training + AI Tool 補助額度

- Training 與 AI Tool 依員工到職日週年期間共用一個 24,000 額度池。
- 兩種類型皆無個別子上限，任一類型都可使用尚未被另一類型占用的全部剩餘額度。
- 額度只計入該週年期間內狀態為 `approved` 的 `approvedAmount`；pending 與 rejected 申請不占用額度。
- 個人資料的「補助上限」僅顯示一張「Training + AI Tool」卡片，以雙色區分兩類已使用金額。
- 共用剩餘額度公式為 `max(0, 24,000 − Training 已核准金額 − AI Tool 已核准金額)`。

### 申請附件

- Attendance 與 subsidy 新增／編輯表單可選填附件，每筆申請最多 5 個，每檔最多 3 MiB（`3 × 1024 × 1024 bytes`）。
- 僅接受 PDF、JPEG、PNG、WebP；client 會同時檢查副檔名、MIME 與 magic bytes。
- 所有已登入使用者可在既有表單與審核狀態 dialog 內預覽圖片及 PDF；列表不新增獨立附件入口。
- 申請人僅能管理自己 pending 申請的附件；管理員可在既有可開啟的表單中處理任意狀態。Subsidy list 不新增 approved／rejected 的任意編輯入口。
- 替換附件時先上傳新檔再標記移除舊檔；最終仍須不超過 5 個。新檔上傳或 transaction 失敗時，舊檔與原 metadata 保持不變。
- 每次新增／刪除都記錄實際操作者。實體檔必須由 parent request、upload session 或 cleanup queue 持有，並可用 `npm run audit:request-attachments` 進行 dry-run 稽核。

### Attendance 審核權限

- 任一已登入使用者可變更所有 attendance 申請的 `status`（`pending`／`approved`／`rejected`），但該操作只能單獨更新狀態，不可混入原因、類型、時間、時數、`userId` 或附件異動。
- Attendance 內容與附件仍維持較嚴格邊界：申請人只能編輯自己的 pending 申請；管理員可代辦任意狀態。
- AnnualLeave 從 pending 核准時會扣除申請人的剩餘特休時數，從 approved 退回 pending 時會補回；這項餘額異動必須與同一筆 attendance status transition 原子提交，並由 Firestore Rules 驗證。

### 使用者歷程時間軸

- 將非餐費補助申請與 Admin 建立的 `userJourneyEvents` 合併為單一時間軸，依業務日期由近到遠分頁呈現，支援載入更多、空狀態與錯誤狀態。
- 補助卡片顯示申請日期、狀態、發票金額與核准金額，發票金額沿用補助申請表單的欄位語意，避免與實際核准補助金額混淆。
- 嵌入「我的職場屬性報告」與 Admin「編輯使用者」的職場屬性報告 Tab：個人頁為唯讀；Admin 入口可新增、更新與刪除事件。
- 事件可附 0–5 個附件並於畫面內預覽，沿用既有附件 metadata 契約與 upload session／cleanup queue 治理。
- 事件與附件可由所有已登入者讀取，但寫入（新增／更新／刪除與附件 session）僅限 `users/{uid}.role == admin`；所有異動寫入 create-only 的 `userJourneyEventAudits`。可用 `npm run test:journey-rules` 驗證 Rules。
- 已針對新 `role=user` 且尚無補助紀錄的使用者補強首筆事件建立流程（GitHub issue #36）：無附件事件會直接通過附件 metadata 驗證，並以 Emulator regression test 鎖定 Admin 建立第一筆歷程的權限行為。

#### 一次性資料腳本

兩支位於 `tools/` 的一次性腳本，可將歷史薪酬資料寫入使用者歷程時間軸（與前端 `JourneyEventService.create` 相同的文件＋稽核結構）。皆預設 dry-run、採確定性 doc id 冪等可重跑，並以 `--actor=<adminUid>`（須為 admin）作為事件建立者與稽核 actor；姓名以 `users.name` 對應 UID，查無或同名多筆者略過並警示。

薪酬原始資料屬敏感資訊，不提交至 Git。執行前請依 repository 內的 example schema 建立本機資料檔：

- `tools/data/salary-summary.json`（參考 `tools/data/salary-summary.example.json`）
- `tools/data/salary-adjustments.json`（參考 `tools/data/salary-adjustments.example.json`）

```bash
# 年度總薪酬統計（N = 12 + 該年度獎金發放比例總和）
node tools/seed-salary-summary-events.js --actor=<adminUid>            # dry-run 預覽
node tools/seed-salary-summary-events.js --actor=<adminUid> --apply    # 實際寫入

# 薪資調整核定（逐月本薪變動，調幅 =(新−舊)/舊）
node tools/seed-salary-adjustment-events.js --actor=<adminUid>         # dry-run 預覽
node tools/seed-salary-adjustment-events.js --actor=<adminUid> --apply # 實際寫入
```

> 兩支腳本透過 Firebase Admin SDK 寫入，執行前需 `npm i -D firebase-admin` 並設定 `GOOGLE_APPLICATION_CREDENTIALS`。

## 技術堆疊

- **Frontend**：Angular 20、TypeScript、Angular Material、Bootstrap 5
- **Backend Platform**：Firebase Authentication、Cloud Firestore、Firebase Storage、Firebase Hosting
- **Testing**：Karma、Jasmine、Firebase Emulator Suite
- **Utilities**：date-fns

> 外部套件必須維持最少；若新增依賴，需先在 `plan.md` 說明必要性與替代方案。

## 快速開始

### 先決條件

- Node.js 20.19+
- npm 10+
- Angular CLI 20+
- Firebase CLI：`npm install -g firebase-tools`
- 可存取的 Firebase 專案與對應設定檔

### 安裝

```bash
git clone https://github.com/NOAHXDM/NGEip.git
cd NGEip
npm install
```

### 本地開發

```bash
npm start
```

目前開發流程會啟動既有的 Firebase Emulator 設定，至少包含：

- Firebase Auth Emulator：`http://localhost:9099`
- Firestore Emulator：`http://localhost:8080`
- Storage Emulator：`http://localhost:9199`

常用指令：

```bash
npm run build      # 正式環境建置至 dist/angular-eip
npm run watch      # 開發模式建置並監聽變更
npm test           # 執行單元測試
npm run test:attendance-rules       # 執行 attendance 審核／特休 Firestore Rules 矩陣
npm run test:attachment-rules       # 執行附件 Firestore／Storage Rules 矩陣
npm run test:journey-rules          # 執行使用者歷程 Firestore／Storage Rules 矩陣
npm run test:journey-integration    # 執行使用者歷程 Angular + Firestore Emulator 整合測試
npm run test:attachment-audit       # 執行附件孤兒分類測試
npm run audit:request-attachments   # 正式資料 dry-run（需 Admin SDK 憑證）
npm run deploy     # 建置並部署至 Firebase（使用 firebase.prod.json）
```

PR CI 會執行 TypeScript spec typecheck、headless Karma、production build、journey rules 與 journey integration 測試；若本機 Firebase CLI 遇到 Hosting web framework 設定，需使用支援 `FIREBASE_CLI_EXPERIMENTS=webframeworks` 的 Firebase CLI 版本。

## 架構約束

### 驗證與使用者資料

- 所有使用者驗證皆使用 Firebase Authentication
- 使用者主檔儲存在 Firestore 的 `users` 集合
- 每位使用者資料必須以 Firebase UID 作為文件主鍵或可唯一映射的鍵值
- `users` 集合是使用者狀態的唯一資料來源；未設定 `exitDate` 者視為目前在職
- `systemConfig/license` 僅儲存 `maxUsers` 等系統設定，不儲存目前在職人數
- 系統設定畫面與註冊上限檢查皆由 `users` 集合即時計算目前在職人數

### 資料儲存

- 系統資料統一使用 Cloud Firestore
- 不可使用 Firebase Realtime Database
- 私有申請附件儲存在 `request-attachments/{kind}/{requestId}/{sessionId}/{attachmentId}`，正式 metadata 隨 attendance/subsidy parent 文件保存。
- 附件上傳、替換與清理須透過 upload session／cleanup queue 維持 reference；不得產生無 parent、session 或 queue 的實體檔。
- 新增資料模型時，必須在 `plan.md` 說明：
  - 集合與文件結構
  - 查詢路徑與索引需求
  - 預估讀寫熱點與成本控制策略

### 安全規則

- 所有資料存取都必須通過 `firestore.rules`
- 新增集合、權限或敏感欄位時，必須同步更新安全規則與測試
- 不得以「先開放再補規則」作為正式流程

### 前端與套件

- 前端以 Angular 20 儲存庫結構為準
- 所有 Firebase 互動必須使用官方 Firebase JavaScript SDK
- 任何新套件都必須以「無法由 Angular、原生 Web API 或既有依賴解決」為前提

## 測試要求

- 所有 business logic 必須同時具備：
  - 單元測試：驗證規則、轉換、邊界條件
  - 整合測試：驗證 Angular 與 Firebase 的整合、授權與資料流
- 若既有 Angular schematics 設定會略過測試檔產生，開發者仍必須手動補齊測試
- 功能未完成測試前，不應視為可合併或可交付

## 文件規範

- `spec.md`：產品需求、使用者故事、驗收情境、成功標準
- `plan.md`：技術實作、Firebase 設計、索引、安全規則、效能／成本策略
- 使用者文件、快速上手與操作說明應以繁體中文撰寫

## 部署

正式站點預設部署至 Firebase Hosting。部署前至少需確認：

1. Firebase Authentication 與 Firestore 設定已完成
2. Firestore Security Rules 與索引已同步更新
3. 正式環境設定檔（例如 `firebase.prod.json`）已配置完成
4. 測試通過，且未引入違反憲章的新依賴或新後端服務
5. `storage.cors.json` 已套用至正式 bucket；Firebase deploy 不會自動更新 bucket CORS

## 遺留注意事項

- Cloudinary 已全面移植至 Firebase Storage（使用者頭像）並完成清理：移除 widget script、`cloudinary`/`dotenv` 依賴、系統設定的 Cloudinary 欄位與舊清理工具。頭像改存確定性路徑 `avatars/{uid}/avatar.webp`，孤兒檔清理見 `tools/storage-orphan-audit.js`。詳見 `specs/003-cloudinary-to-storage/plan.md`。
- `angular.json` 目前仍可見 `skipTests` 的歷史設定；此設定不會凌駕專案憲章，所有新功能仍必須補齊測試。

## 評量考核系統

評量考核系統（Peer Evaluation）是 NGEip 的核心功能模組，採用匿名考評設計，透過多位評核者的主觀評分搭配 Z-score 統計校正，產出每位員工的六大職場屬性雷達圖與職業原型分析。所有匿名性保障均實作於 Firestore Security Rules 層，確保受評者無法識別評核者身份。

### 操作流程

1. **管理者建立考核週期並指派評核關係**：設定週期名稱、年份（H1/H2）、截止日，並為每位受評者指派一至多位評核者。管理者也可使用「隨機快選」，一次為所有在職且非管理員的使用者產生可編輯預覽；系統會排除自評、盡量平均評核負載並優先安排同職稱評核者，確認後才寫入正式指派，且不會異動已完成指派。
2. **評核者填寫匿名考評表（10 題評分 + 整體評價）**：系統開放評核者填寫 10 道職場行為題目（每題 1–10 分），各題均附行為觀察 hint 說明，協助評核者理解評估重點；並於表末填寫整體評語（20–500 字）。分數 ≥9 或 ≤3 時，回饋說明欄自動轉為必填。任務卡片會顯示受評者 `name / jobTitle / jobRank`（缺值時顯示「未知用戶 / 職稱未設定 / 職等未設定」）；任務提交後會移至「已填寫」，且在截止日前可再次編輯已提交內容；「已填寫」分頁依完成時間新到舊排序。
3. **管理者結束並發布（觸發 Z-score 校正計算）**：管理者確認後執行「結束並發布」，系統對每位評核者進行 per-rater Z-score 校正（TARGET_MEAN=5.5, SD=1.5, clamp 1–10），彙整六大屬性分數，決定職業原型，並將 snapshot 狀態更新為 `final`。整體評語與具體回饋內容於此階段由該受評者的所有考評表重新彙整（`overallComments` / `feedbackInsights`），與「有效評核者人數」同源，確保報告內容與表單來源一致。
4. **管理者可手動重算職業原型**：在管理者總覽可重算整個週期，或於受評者卡片展開區僅重算單一受評者，並顯示最近一次重算時間以利追蹤。
5. **受評者查看屬性報告（雷達圖、職業原型、整體評語/具體回饋）**：受評者登入後可在「我的屬性報告」頁面查看六角雷達圖、職業原型標籤，以及固定高度可捲動的「整體評語與具體回饋」區塊（未 hover 時自動慢速捲動，hover 時暫停），並查看跨週期成長趨勢折線圖。

### 角色說明

| 角色 | 職責 |
|------|------|
| **管理者**（role: admin） | 建立與管理考核週期、手動指派或以隨機快選預覽批次建立評核關係、查閱所有考評表（含評核者身份）、執行結束並發布、開啟排名視圖、重算職業原型（全週期或單一受評者） |
| **評核者**（Evaluator） | 查看分配給自己的考評任務（卡片含受評者 name/jobTitle/jobRank）、填寫並提交匿名考評表、截止日前可填寫與編輯已填寫任務，已填寫分頁依完成時間由新到舊排序 |
| **受評者**（Evaluatee） | 查看自己的職場屬性報告，包含雷達圖、職業原型、整體評語與具體回饋滾動區及歷史趨勢圖 |

### RO 屬性說明

系統以 RO Online 職業屬性為靈感，定義六大職場能力指標：

| 屬性代號 | 中文名稱 | 英文全名 | 說明 |
|---------|---------|---------|------|
| EXE | 執行力 | Execution | 將任務化為實際成果的行動力與交付能力 |
| INS | 洞察力 | Insight | 分析問題、吸收知識、找到最優解的智識能力 |
| ADP | 應變力 | Adaptability | 在壓力與變化中快速調整、靈活響應的能力 |
| COL | 協作力 | Collaboration | 精準溝通、有效傳遞資訊與凝聚團隊的能力 |
| STB | 穩定力 | Stability | 面對挑戰持續維持高品質輸出的韌性與承諾感 |
| INN | 創新力 | Innovation | 突破框架、主動提案、創造超預期價值的能力 |

及格線為各屬性 **6 分**（滿分 10 分），雷達圖以橘色虛線標示。

### 評鑑題目

考評表包含 10 道職場行為題目，各題附行為觀察 hint 說明（inline 顯示於題目下方）；分數 ≥9 或 ≤3 時，回饋說明欄自動轉為必填：

| # | 題目 | 對應屬性 |
|---|------|----------|
| Q1 | 溝通與協作能力 | COL |
| Q2 | 問題解決能力 | INS |
| Q3 | 自我管理與組織能力 | ADP |
| Q4 | 創新與主動性 | INN |
| Q5 | 責任心與承諾 | STB |
| Q6 | 團隊精神與合作 | COL |
| Q7 | 積極學習與成長 | INS |
| Q8 | 專業態度與品質意識 | STB |
| Q9 | 壓力應對能力 | ADP |
| Q10 | 工作效率與結果導向 | EXE |

### 屬性計算公式

| 屬性 | 計算方式 | 滿分 |
|------|---------|------|
| EXE 執行力 | Q10 | 10 |
| INS 洞察力 | (Q2 + Q7) ÷ 2 | 10 |
| ADP 應變力 | (Q3 + Q9) ÷ 2 | 10 |
| COL 協作力 | (Q1 + Q6) ÷ 2 | 10 |
| STB 穩定力 | (Q5 + Q8) ÷ 2 | 10 |
| INN 創新力 | Q4 | 10 |

> **總分** = EXE + INS + ADP + COL + STB + INN（滿分 60 分，及格總分 36 分）

各屬性以 **6 分**為及格基準，依薪資職等（J 初階、M 中階、S 資深）有相應行為標準；職等越高，同分數代表的行為期望越嚴格。詳細分級標準見 `specs/002-peer-evaluation/職場屬性評鑑規格.md`。

### 職業原型

系統依六大屬性分數分布決定員工的職業原型，並支援並列輸出多個原型。

- 優先順序：勇者（全屬性 ≥ 8）→ 初心者（原始分數任三項 < 5）→ 前兩高屬性組合映射
- 若前兩高屬性組合未命中對照表，fallback 為「最高屬性 + 其可映射且分數最高的屬性」（同分時依排序先後）

| 原型 | 代號 | 決定邏輯 |
|------|------|---------|
| 勇者（Hero） | 🌟 | 全屬性 ≥ 8（最高榮譽） |
| 初心者（Novice） | 🌱 | 三項以上原始平均分數 < 5（優先判斷） |
| 劍士（Swordsman） | ⚔️ | EXE + STB |
| 法師（Mage） | 🧙 | INS + INN |
| 弓手（Archer） | 🏹 | ADP + COL |
| 牧師（Priest） | ✨ | COL + STB |
| 盜賊（Rogue） | 🗡️ | ADP + INN |
| 商人（Merchant） | 🔨 | EXE + INS |

### 匿名性保障

匿名性在 **Firestore Security Rules** 層強制執行，前端無法繞過：

- **受評者**無讀取 `evaluationForms` 集合的權限（`read: if false` for evaluatees），確保完全無法取得評核者提交的任何表單內容。
- **`userAttributeSnapshots`** 中僅儲存匿名彙整後的屬性分數與整體評語文字陣列，不含任何 `evaluatorUid` 欄位，從源頭消除身份洩漏可能。
- **`evaluationAssignments`** 受評者無法讀取自己被哪些人評核的指派關係，只有評核者本人與管理者可存取對應文件。
- 所有規則均附有對應的 Firebase Emulator 整合測試（`src/app/evaluation/testing/firestore-rules.spec.ts`），驗證 10 個關鍵匿名性案例，作為交付門檻。

## 授權

本專案採用 MIT License，詳見 `LICENSE.txt`。
