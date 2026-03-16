# CLAUDE.md

此檔案提供代理人在此儲存庫工作時的操作指引。

## 語言與治理

- 所有對話、spec、plan 與使用者文件 MUST 使用繁體中文（zh-TW）。
- 工作前請先遵守 `.specify/memory/constitution.md`；若本檔與憲章衝突，以憲章為準。
- `spec.md` 只記錄產品需求、使用者情境與驗收標準。
- `plan.md` 只記錄技術實作、架構決策、Firebase 設計、索引、安全規則與測試策略。

## 專案概述

NGEip 是一套以 Angular 20 與 Firebase 為基礎的企業資訊入口網站（EIP），
處理使用者管理、出勤、請假、補助與系統設定等流程。

## 不可違反的技術原則

1. **後端功能 exclusively 使用 Firebase**：僅可使用 Firebase Authentication、Cloud Firestore、Firebase Storage、Firebase Hosting。
2. **驗證唯一來源**：所有使用者驗證皆使用 Firebase Authentication；使用者資料儲存在 Firestore，並以 Firebase UID 作為 key。
3. **資料儲存唯一來源**：系統資料只能使用 Cloud Firestore，不可使用 Realtime Database。
4. **Security Rules 必須同步維護**：所有資料存取都必須受 `firestore.rules` 驗證。
5. **前端互動限制**：所有 Firebase 操作必須使用官方 Firebase JavaScript SDK；外部套件應維持最少。
6. **效能與成本優先**：避免不必要讀取、重複監聽與大型查詢；設計時需考量索引與成本。
7. **測試是交付門檻**：所有 business logic 必須具備單元測試與整合測試。

## 開發指令

### 本地開發

```bash
npm start
npm run build
npm run watch
npm test
```

### 部署

```bash
npm run deploy
firebase login
```

## 實作注意事項

### Firebase 使用方式

- Authentication：僅使用 Firebase Authentication（email/password 或核准的 OAuth）
- Firestore：資料模型優先平坦化，文件與查詢設計需兼顧索引與成本
- Storage：檔案與媒體應使用 Firebase Storage
- Hosting：前端預設部署至 Firebase Hosting

### Angular 結構

- 以 Angular 20 單一應用程式結構為準
- 功能頁面、元件、服務與守衛應清楚分層
- Firebase 存取請集中於可測試的服務層，避免在元件中散落查詢邏輯

### 安全與測試

- 任何新增集合、欄位權限或角色流程，都要同步更新 `firestore.rules`
- 單元測試需驗證商業規則、資料轉換與邊界條件
- 整合測試需驗證 Angular 與 Firebase 的資料流、授權與錯誤處理
- 若產生器未自動建立測試檔，仍需手動補齊

## 遺留項目提醒

- 儲存庫仍可能存在 Cloudinary 腳本或敘述，視為待清理遺留內容；不得作為新功能實作依據。
- `angular.json` 的 `skipTests` 為歷史設定，不代表可略過測試要求。
