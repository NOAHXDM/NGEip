# NGEip

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
- 系統設定與 Firebase Emulator 本地開發流程

## 技術堆疊

- **Frontend**：Angular 20、TypeScript、Angular Material、Bootstrap 5
- **Backend Platform**：Firebase Authentication、Cloud Firestore、Firebase Storage、Firebase Hosting
- **Testing**：Karma、Jasmine、Firebase Emulator Suite
- **Utilities**：date-fns

> 外部套件必須維持最少；若新增依賴，需先在 `plan.md` 說明必要性與替代方案。

## 快速開始

### 先決條件

- Node.js 18+
- npm 9+
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

常用指令：

```bash
npm run build      # 正式環境建置至 dist/angular-eip
npm run watch      # 開發模式建置並監聽變更
npm test           # 執行單元測試
npm run deploy     # 建置並部署至 Firebase（使用 firebase.prod.json）
```

## 架構約束

### 驗證與使用者資料

- 所有使用者驗證皆使用 Firebase Authentication
- 使用者主檔儲存在 Firestore 的 `users` 集合
- 每位使用者資料必須以 Firebase UID 作為文件主鍵或可唯一映射的鍵值

### 資料儲存

- 系統資料統一使用 Cloud Firestore
- 不可使用 Firebase Realtime Database
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

## 遺留注意事項

- 儲存庫中仍可能存在 Cloudinary 相關腳本或文件片段；這些內容屬於待清理遺留項，不得作為新增功能依據。
- `angular.json` 目前仍可見 `skipTests` 的歷史設定；此設定不會凌駕專案憲章，所有新功能仍必須補齊測試。

## 評量考核系統

評量考核系統（Peer Evaluation）是 NGEip 的核心功能模組，採用匿名考評設計，透過多位評核者的主觀評分搭配 Z-score 統計校正，產出每位員工的六大職場屬性雷達圖與職業原型分析。所有匿名性保障均實作於 Firestore Security Rules 層，確保受評者無法識別評核者身份。

### 操作流程

1. **管理者建立考核週期並指派評核關係**：設定週期名稱、年份（H1/H2）、截止日，並為每位受評者指派一至多位評核者。
2. **評核者填寫匿名考評表（10 題評分 + 整體評價）**：系統開放評核者填寫 10 道職場行為題目（每題 1–10 分），各題均附行為觀察 hint 說明，協助評核者理解評估重點；並於表末填寫整體評語（20–500 字）。分數 ≥9 或 ≤3 時，回饋說明欄自動轉為必填。
3. **管理者結束並發布（觸發 Z-score 校正計算）**：管理者確認後執行「結束並發布」，系統對每位評核者進行 per-rater Z-score 校正（TARGET_MEAN=5.5, SD=1.5, clamp 1–10），彙整六大屬性分數，決定職業原型，並將 snapshot 狀態更新為 `final`。
4. **受評者查看屬性報告（雷達圖、職業原型、跑馬燈）**：受評者登入後可在「我的屬性報告」頁面查看六角雷達圖、職業原型標籤、匿名整體評語跑馬燈，以及跨週期成長趨勢折線圖。

### 角色說明

| 角色 | 職責 |
|------|------|
| **管理者**（role: admin） | 建立與管理考核週期、指派評核關係、查閱所有考評表（含評核者身份）、執行結束並發布、開啟排名視圖 |
| **評核者**（Evaluator） | 查看分配給自己的考評任務、填寫並提交匿名考評表、截止日前可填寫 |
| **受評者**（Evaluatee） | 查看自己的職場屬性報告，包含雷達圖、職業原型、整體評語跑馬燈及歷史趨勢圖 |

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

系統依六大屬性分數分布決定員工的職業原型，並支援並列輸出多個原型：

| 原型 | 代號 | 決定邏輯 |
|------|------|---------|
| 勇者（Hero） | 🗡️ | 全屬性 ≥ 8（最高榮譽） |
| 初心者（Novice） | 🌱 | 三項以上原始平均分數 < 5（優先判斷） |
| 劍士（Swordsman） | ⚔️ | EXE 顯著最高（執行導向） |
| 法師（Mage） | 🔮 | INS 顯著最高（洞察導向） |
| 弓手（Archer） | 🏹 | ADP 顯著最高（應變導向） |
| 牧師（Priest） | ✨ | COL 顯著最高（協作導向） |
| 盜賊（Rogue） | 🗝️ | STB 顯著最高（穩定導向） |
| 商人（Merchant） | 💰 | INN 顯著最高（創新導向） |

### 匿名性保障

匿名性在 **Firestore Security Rules** 層強制執行，前端無法繞過：

- **受評者**無讀取 `evaluationForms` 集合的權限（`read: if false` for evaluatees），確保完全無法取得評核者提交的任何表單內容。
- **`userAttributeSnapshots`** 中僅儲存匿名彙整後的屬性分數與整體評語文字陣列，不含任何 `evaluatorUid` 欄位，從源頭消除身份洩漏可能。
- **`evaluationAssignments`** 受評者無法讀取自己被哪些人評核的指派關係，只有評核者本人與管理者可存取對應文件。
- 所有規則均附有對應的 Firebase Emulator 整合測試（`src/app/evaluation/testing/firestore-rules.spec.ts`），驗證 10 個關鍵匿名性案例，作為交付門檻。

## 授權

本專案採用 MIT License，詳見 `LICENSE.txt`。
