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

## 授權

本專案採用 MIT License，詳見 `LICENSE.txt`。
