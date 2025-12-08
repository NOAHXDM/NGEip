# CLAUDE.md

此檔案提供 Claude Code (claude.ai/code) 在此儲存庫中工作時的指引。

## 重要提醒

**語言設定：請務必使用繁體中文 (zh-TW) 回應所有對話。**

## 專案概述

企業資訊入口網站 (EIP) - 基於 Angular 18 + Firebase 的企業管理系統，用於員工出勤、請假管理和使用者管理。系統支援使用 Firebase 模擬器的本地開發和正式環境部署。

## 開發指令

### 本地開發
```bash
npm start                    # 啟動 Firebase 模擬器 (Auth 在 :9099, Firestore 在 :8080)
npm run build                # 正式環境建置至 dist/angular-eip
npm run watch                # 開發模式建置並監聽變更
npm test                     # 執行 Karma/Jasmine 測試
```

### 部署
```bash
npm run deploy               # 建置並部署至 Firebase (使用 firebase.prod.json)
firebase login               # 登入 Firebase
node tools/cloudinary-cleanup.js  # 清理未使用的 Cloudinary 圖片
```

## 架構

### 環境設定

應用程式使用基於環境的 Firebase 配置：
- **本地環境 (firebase.local.json)**：連接至 Firebase 模擬器 (`environment.useEmulators: true`)
- **正式環境 (firebase.prod.json)**：連接至線上 Firebase (`environment.useEmulators: false`)

環境檔案透過 Angular 的檔案替換機制在建置時切換（參見 angular.json）。

### Firebase 整合

- **認證 (Authentication)**：Firebase Auth，支援模擬器
- **資料庫 (Database)**：Firestore，包含集合：`users`、`attendanceLogs`、`attendanceStats`、`systemConfig`
- **託管 (Hosting)**：靜態網站部署至 Firebase Hosting (區域：asia-east1)
- **模擬器 (Emulators)**：Auth 在 port 9099，Firestore 在 port 8080

### 路由與守衛

路由定義於 `src/app/app.routes.ts`：
- 受保護的路由使用 `authGuard`（僅限已認證使用者）
- 登入/註冊使用 `noAuthGuard`（僅限未認證使用者）
- Layout 元件 (`LayoutComponent`) 包裹所有已認證路由

### 核心服務

**UserService** (`src/app/services/user.service.ts`)
- 使用 Firestore 交易的使用者 CRUD 操作
- 基於授權的使用者數量管理
- 透過 `currentUser$` observable 提供當前使用者狀態
- 使用者列表含過濾功能（隱藏管理員、離職員工）

**AttendanceService** (`src/app/services/attendance.service.ts`)
- 建立出勤記錄並記錄稽核軌跡
- 狀態管理（待審核/已核准/已拒絕）
- 基於日期的查詢（每日、每週、每月）
- 透過 `TimezoneService` 處理時區感知的時間戳記

**AnnualLeaveService** (`src/app/services/annual-leave.service.ts`)
- 基於服務年資計算特休假
- 透過注入令牌 `LEAVE_POLICY_CONFIG` 驅動政策
- 預設政策：`TAIWAN_POLICY`（可配置的假期級別）

**SystemConfigService** (`src/app/services/system-config.service.ts`)
- 授權管理（最大使用者數、當前使用者數）
- 系統偏好設定（初始結算年度、加班優先順序）
- Cloudinary 配置（cloud name、upload preset）
- 透過 `APP_INITIALIZER` 自動初始化

### 資料模型

定義於服務檔案中的關鍵介面：
- **User**：uid、email、name、role (admin/user)、startDate、endDate、avatar、status
- **AttendanceLog**：user、startDateTime、endDateTime、reason、type、status、auditTrail
- **License**：maxUsers、currentUsers、initialSettlementYear、cloudinaryConfig

### 依賴注入

**注入令牌 (Injection Tokens)** (`src/app/tokens/`)
- `LEAVE_POLICY_CONFIG`：可配置的請假政策（預設：台灣勞基法）

### 共用元件

**指令 (Directives)** (`src/app/directives/`)
- `LineThroughDirective`：離職員工的視覺指示器

**管道 (Pipes)** (`src/app/pipes/`)
- `AttendanceTypePipe`：顯示出勤類型標籤
- `ReasonPriorityPipe`：顯示原因優先級標籤
- `UserNamePipe`：格式化使用者名稱
- `FirestoreTimestampPipe`：將 Firestore 時間戳記轉換為可讀日期

### Firestore 安全規則

`firestore.rules` 中的規則：
- 管理員角色透過 Firestore 查詢檢查（而非客戶端聲明）
- 使用者可讀取所有資料，更新自己的非敏感欄位（無法變更 role/email）
- 管理員對使用者擁有完整 CRUD 權限
- `systemConfig/license`：讀寫開放，但更新 maxUsers 需要管理員權限
- 出勤集合：目前開放讀寫（建議正式環境收緊權限）

### Cloudinary 整合

使用 Cloudinary Upload Widget 上傳頭像：
- 配置儲存於 `systemConfig/license`（cloudName、uploadPreset）
- 清理腳本：`tools/cloudinary-cleanup.js` 移除未使用的圖片
- 執行清理前先將使用中的圖片匯出至 `tools/eipImages.json`

## 關鍵模式

1. **反應式狀態 (Reactive State)**：服務公開 observables（例如 `currentUser$`、`license$`）
2. **Firestore 交易 (Transactions)**：使用者建立/刪除會原子性地更新授權計數
3. **時區處理 (Timezone Handling)**：所有時間戳記透過 `TimezoneService` 轉換以確保一致性
4. **稽核軌跡 (Audit Trails)**：出勤變更追蹤時間戳記和使用者參照
5. **元件測試已停用**：`angular.json` 為所有 schematics 設定 `skipTests: true`

## 技術堆疊

- Angular 18 (standalone components)
- Angular Material + Bootstrap 5
- Firebase (Auth, Firestore, Hosting)
- date-fns 用於日期處理
- Cloudinary 用於圖片儲存
- Karma/Jasmine 用於測試