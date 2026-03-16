<!--
Sync Impact Report
- Version change: N/A（模板） → 1.0.0
- Modified principles:
  - 模板原則 1 → I. Firebase 平台唯一後端來源
  - 模板原則 2 → II. Firebase Authentication 為唯一驗證機制
  - 模板原則 3 → III. Cloud Firestore 為唯一系統資料庫
  - 模板原則 4 → IV. Firestore Security Rules 強制執行
  - 模板原則 5 → V. Angular 與官方 Firebase SDK 優先
  - 新增 → VI. 效能與成本效率為預設要求
  - 新增 → VII. 商業邏輯測試為交付門檻
  - 新增 → VIII. 繁體中文文件與規格治理
- Added sections:
  - 技術與資料治理
  - 文件與交付流程
- Removed sections:
  - 無
- Templates requiring updates:
  - ✅ .specify/templates/plan-template.md
  - ✅ .specify/templates/spec-template.md
  - ✅ .specify/templates/tasks-template.md
  - N/A .specify/templates/commands/
  - ✅ README.md
  - ✅ CLAUDE.md
- Follow-up TODOs:
  - TODO(RATIFICATION_DATE): 無法從既有儲存庫或文件確認首次正式採納日期，需由維護者補填。
  - 儲存庫仍可見 Cloudinary 腳本與 Angular schematics 的 skipTests 遺留設定，需後續實作層清理以完全符合本憲章。
-->
# NGEip Constitution

## Core Principles

### I. Firebase 平台唯一後端來源
所有新建或重構中的後端功能 MUST exclusively 使用 Firebase 官方服務組合：
Cloud Firestore、Firebase Authentication、Firebase Storage 與 Firebase Hosting。
不得為新功能引入 Cloudinary、Realtime Database、自建 API 伺服器或其他第三方後端/BaaS。
若確有不可避免之例外，必須先提出憲章修訂並附遷移與風險說明。
理由：統一平台可降低整合複雜度、權限分散與維運成本，並讓安全規則、部署與模擬器流程保持一致。

### II. Firebase Authentication 為唯一驗證機制
所有使用者驗證 MUST 使用 Firebase Authentication，允許的登入方式限
email/password 或經產品批准的 OAuth 提供者。所有使用者主檔資料 MUST 儲存在
Firestore，並以 Firebase UID 作為文件主鍵或唯一索引鍵；不得建立平行帳號系統或自管密碼。
理由：以 Firebase UID 作為唯一身份來源，可確保授權、個人資料與審計紀錄一致對應。

### III. Cloud Firestore 為唯一系統資料庫
系統資料儲存 MUST 使用 Cloud Firestore；不得使用 Firebase Realtime Database。
資料模型 MUST 優先採用平坦、可查詢且可預估成本的結構，避免深層巢狀、跨集合高頻 join
思維或會造成大量重複讀取的設計。每項資料模型變更 MUST 同步說明查詢模式、索引需求與讀寫成本影響。
理由：Firestore 的成本與效能高度依賴文件結構、查詢路徑與索引設計，平坦模型更利於擴充與控管成本。

### IV. Firestore Security Rules 強制執行
所有 Firestore 資料存取 MUST 受 Firestore Security Rules 驗證，且規則 MUST 與資料模型、
角色權限與功能流程同步演進。任何新增集合、欄位敏感度變更或權限調整，皆 MUST 在交付前補齊規則、
模擬器驗證與必要測試。不得以「先開放、後補規則」作為常態流程。
理由：Security Rules 是本專案的主要資料邊界，若未與功能同步維護，將直接導致資料外洩或越權操作風險。

### V. Angular 與官方 Firebase SDK 優先
前端 MUST 以 Angular 20 儲存庫結構為準，所有前端 Firebase 互動 MUST 使用官方 Firebase
JavaScript SDK。外部套件 MUST 維持最少，新增套件前 MUST 先證明 Angular、Angular Material、
原生 Web API 或既有依賴無法滿足需求，並在 plan.md 記錄採用理由。
理由：減少依賴可降低 bundle 風險、升級成本與資安暴露面，並確保 Firebase 行為與官方文件一致。

### VI. 效能與成本效率為預設要求
所有功能設計 MUST 同時優化使用者體驗、Firestore 讀寫成本與前端載入效能。實作時 MUST 避免不必要讀取、
重複監聽、過大查詢範圍與未分頁列表；對高頻流程應明確定義快取、索引、批次操作或聚合策略。
plan.md MUST 說明主要成本熱點與對應緩解方案。
理由：Firebase 採使用量計費，若未在設計期納入成本控制，功能成長會直接放大營運支出與延遲問題。

### VII. 商業邏輯測試為交付門檻
所有 business logic MUST 具備單元測試與整合測試後方可合併。單元測試 MUST 驗證核心規則、
資料轉換與邊界條件；整合測試 MUST 驗證 Angular 與 Firebase 互動、授權流程、資料存取規則
或跨服務工作流。既有工具若預設略過測試檔產生，不構成免測理由，任一功能仍 MUST 手動補齊測試。
理由：本專案的商業規則、授權與資料成本高度耦合，缺少測試將無法可靠驗證回歸與權限邊界。

### VIII. 繁體中文文件與規格治理
所有 spec、plan 與使用者文件 MUST 以繁體中文（zh-TW）撰寫。產品需求、使用者情境、驗收標準
與商業目標 MUST 放在 spec.md；技術實作方案、架構決策、Firebase 資料結構、索引與套件取捨 MUST
放在 plan.md。文件不得混用語言或將需求與實作決策寫在錯誤檔案。
理由：統一語言與文件分工可降低溝通成本，讓產品、設計與工程成員能在固定位置找到正確資訊。

## 技術與資料治理

- Firebase Storage MUST 作為檔案、媒體與附件儲存的唯一方案；新增功能不得再依賴 Cloudinary。
- Firestore 文件命名、集合切分、索引與彙總策略 MUST 以降低讀寫次數與避免熱點為原則。
- 涉及權限的功能設計 MUST 同時提交資料結構、Security Rules 與測試策略，三者缺一不可。
- Firebase Hosting 為預設部署目標；若需要額外交付管線，必須證明不破壞既有 Firebase-first 原則。
- 所有新增依賴、資料模型與部署差異 MUST 在 plan.md 記錄其必要性、替代方案與成本影響。

## 文件與交付流程

1. spec.md MUST 先以繁體中文定義使用者故事、功能需求、邊界案例與可衡量成功標準。
2. plan.md MUST 再以繁體中文記錄技術背景、Firestore 結構、Authentication 流程、Security Rules、
   成本/效能考量與測試策略。
3. tasks.md MUST 將工作拆解為可執行任務，並明確包含測試、Security Rules、效能檢查與文件更新工作。
4. README、快速上手、操作手冊與代理人指引等使用者文件 MUST 與憲章一致，若出現衝突，以本憲章為準並立即修正。
5. Code review、規格審查與發佈前檢查 MUST 逐項確認本憲章要求，而非以口頭共識替代。

## Governance

- 本憲章優先於 README、CLAUDE.md、任務模板與慣例性做法；文件或流程若與本憲章衝突，MUST 以本憲章為準。
- 修訂程序 MUST 包含：修訂提案、受影響模板/文件同步更新、版本號調整、以及必要的遷移或清理計畫。
- 版本號 MUST 採語意化版本：MAJOR 用於移除或重新定義既有原則；MINOR 用於新增原則、章節或實質擴充要求；PATCH 用於不改變治理意義的文字澄清。
- 每次修訂後 MUST 在檔案頂部更新 Sync Impact Report，列出版本變更、受影響檔案與後續待辦。
- 所有規格審查、計畫審查、任務拆解與 pull request review MUST 檢查 Firebase-only、Security Rules、測試、效能成本與 zh-TW 文件要求是否符合。
- 若發現現有程式碼或文件不符憲章，MUST 建立修正工作並在相關 spec/plan/tasks 或 issue 中追蹤至完成，不得將偏差視為默認標準。

**Version**: 1.0.0 | **Ratified**: TODO(RATIFICATION_DATE): 無法從既有儲存庫或文件確認首次正式採納日期 | **Last Amended**: 2026-03-16
