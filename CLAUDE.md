# CLAUDE.md

此檔案提供代理人在此儲存庫工作時的操作指引。

## 語言與治理

- 所有對話、spec、plan 與使用者文件 MUST 使用繁體中文（zh-TW）。
- `spec.md` 只記錄產品需求、使用者情境與驗收標準。
- `plan.md` 只記錄技術實作、架構決策、Firebase 設計、索引、安全規則與測試策略。

## 專案概述

NGEip 是一套以 Angular 20 與 Firebase 為基礎的企業資訊入口網站（EIP），
處理使用者管理、出勤、請假、補助與系統設定等流程。

## 不可違反的技術原則

1. **後端功能 exclusively 使用 Firebase**：僅可使用 Firebase Authentication、Cloud Firestore、Firebase Storage、Firebase Hosting、Firebase Cloud Messaging、Cloud Functions for Firebase。
2. **驗證唯一來源**：所有使用者驗證皆使用 Firebase Authentication；使用者資料儲存在 Firestore，並以 Firebase UID 作為 key。
3. **資料儲存唯一來源**：系統資料只能使用 Cloud Firestore，不可使用 Realtime Database。
4. **存取邊界必須同步維護**：前端資料存取必須受 `firestore.rules` 驗證；Cloud Functions 使用 Admin SDK 時必須在伺服器端顯式授權。
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
- Cloud Messaging：僅用於通知投遞；瀏覽器通知需由使用者明確同意。若保存 Token、綁定帳號或傳送個人化／交易型內容，必須先於 plan.md 完成生命週期、權限與安全設計。
- Cloud Functions：優先使用 2nd gen 與官方 `firebase-functions` / `firebase-admin` SDK；正式環境預設區域為與 default Firestore 一致的 `asia-east1`。
- Functions 授權：Admin SDK 不受 Security Rules 約束，函式內必須驗證 Auth、角色、輸入 schema 與資源所有權；事件 trigger 必須可冪等重試。
- Functions 密鑰：外部 API 憑證僅可放在 Secret Manager 並綁定至必要函式，不得寫入 Git、前端 environment 或 Firestore。

### Angular 結構

- 以 Angular 20 單一應用程式結構為準
- 功能頁面、元件、服務與守衛應清楚分層
- Firebase 存取請集中於可測試的服務層，避免在元件中散落查詢邏輯

### 安全與測試

- 任何新增集合、欄位權限或角色流程，都要同步更新 `firestore.rules`
- 單元測試需驗證商業規則、資料轉換與邊界條件
- 整合測試需驗證 Angular 與 Firebase 的資料流、授權與錯誤處理
- Cloud Functions 商業邏輯需與 trigger adapter 分離，並使用 Functions Emulator 或等價受控整合測試驗證觸發、授權、重試與失敗路徑
- 若產生器未自動建立測試檔，仍需手動補齊

## 遺留項目提醒

- Cloudinary 已全面移植至 Firebase Storage 並完成清理（v3.0.20）；不得再引入 Cloudinary 或其他第三方後端。`tools/migrate-avatars-to-storage.js` 與 `tools/storage-orphan-audit.js` 中對 Cloudinary 的字串引用僅為一次性搬遷／稽核用途，非新功能依賴。
- `angular.json` 的 `skipTests` 為歷史設定，不代表可略過測試要求。
