# 實作計畫：Cloudinary 移植至 Firebase Storage

**分支**：`003-cloudinary-to-storage` | **日期**：2026-06-17 | **規格**：[spec.md](./spec.md)
**輸入**：使用者頭像上傳功能由 Cloudinary 移植至 Firebase Storage 的需求

**注意**：所有內容 MUST 以繁體中文（zh-TW）撰寫，且技術實作與決策必須記錄於本檔，不得回寫到 spec.md。本檔僅記錄技術實作、架構決策、Firebase 設計、安全規則與測試策略。

## 摘要

把目前**唯一**使用 Cloudinary 的功能（使用者頭像上傳）整體移植到 Firebase Storage，搬遷既有頭像，並建立一套**從設計上就不產生孤兒檔**的成本控管機制。完成後移除 Cloudinary 依賴、CDN script、`.env` 與系統設定欄位，符合憲章「Firebase 平台唯一後端來源」（憲章 Sync Impact 已將「Cloudinary 遺留清理」列為待辦 TODO）。

**核心技術方向**：

- 新增 `provideStorage` 與 `storage.rules`，建立可測試的 `storage.service` 集中 Storage 存取。
- 採用**確定性路徑覆寫**（`avatars/{uid}/avatar.webp`），新圖覆寫舊圖，先天不產生孤兒檔。
- 上傳前以 Canvas API 縮圖 + webp 壓縮，不引入第三方套件。
- 一次性 Admin SDK 腳本搬遷既有在職者頭像；已離職者（含 `exitDate`）跳過。

## 技術背景

**語言／版本**：Angular 20、TypeScript 5.x、Firebase JS SDK v10+
**主要依賴**：`@angular/core`、`@angular/material`、`@angular/forms`、`@angular/fire`、`firebase`（官方 SDK，含 `firebase/storage`）、`rxjs`；搬遷／稽核腳本使用 `firebase-admin`（僅 tools，不進前端 bundle）；**移除** `cloudinary` devDependency
**資料儲存**：Cloud Firestore（`users/{uid}.photoUrl` 結構不變）＋ Firebase Storage（`avatars/{uid}/avatar.webp`）
**測試策略**：Karma/Jasmine 單元測試（縮圖工具、storage.service、刪檔流程）；Firebase Emulator（Auth + Firestore + Storage）整合測試；`@firebase/rules-unit-testing` 驗證 `storage.rules`
**目標平台**：Firebase Hosting 上的 Angular SPA
**專案型態**：Angular 20 standalone components（已採用）
**效能目標**：頭像上傳壓縮後單檔 20–50KB；顯示端沿用既有 `photoUrl` 直連，無額外 Firestore 讀取；頭像帶一週瀏覽器快取以壓低 egress
**限制條件**：僅可使用 Firebase 官方服務；**不使用 Cloud Functions**（憲章允許清單僅 Auth／Firestore／Storage／Hosting）；外部套件最少化；Security Rules 須同步維護
**規模／範圍**：唯一使用點為使用者頭像；新增 1 份 `storage.rules`、1 個 service、1 個工具函式、2 支 tools 腳本；受影響元件：`user-profile`、`system-config`；既有頭像一次性搬遷

## 架構決策（已確認）

| 決策 | 結論 | 理由 |
|------|------|------|
| 孤兒檔清理 | **確定性路徑覆寫**：固定路徑、新圖覆寫舊圖；離職（設定 `exitDate`）時前端一併刪檔 | 零後端、零 Cloud Functions、儲存量不隨重傳成長，最省成本且符合憲章 |
| 頭像讀取權限 | **僅登入者可讀**（`request.auth != null`） | 內部 EIP 性質，無需公開 |
| 既有頭像搬遷 | 一次性 Admin SDK 腳本自動搬遷；**已離職者（有 `exitDate`）跳過不搬** | 離職者頭像無保留價值，省搬遷成本與儲存量 |

## 憲章檢查

*Gate：Phase 0 研究前必須通過；Phase 1 設計後需再次複核。*

- [x] 僅使用 Firebase Authentication、Cloud Firestore、Firebase Storage、Firebase Hosting；**移除** Cloudinary，無新增其他後端。
- [x] 所有驗證流程均以 Firebase Authentication 為唯一來源；頭像路徑以 Firebase UID 對應（`avatars/{uid}/`）。
- [x] Firestore 資料模型已說明：`users/{uid}.photoUrl` 結構不變，僅來源 URL 由 Cloudinary 改為 Storage download URL；無新增集合。
- [x] 已定義 `storage.rules`（新增）與 Firestore `License` 欄位移除；模擬器加開 Storage（port 9199）驗證授權邊界。
- [x] 前端 Firebase 互動僅使用官方 Firebase JavaScript SDK（`firebase/storage`）；縮圖以原生 Canvas API 實作，不新增外部套件。
- [x] 已列出效能／成本熱點（見「成本控管策略」）：壓縮上傳、路徑覆寫、Cache-Control、沿用既有顯示讀取。
- [x] 已規劃 business logic 的單元測試與整合測試（見「測試策略」），兩者皆為交付門檻。
- [x] 本檔以繁體中文撰寫，技術決策留在 plan.md。

> 例外備註：`storage.rules` 啟用 admin 代寫／代刪分支（配合 `user-profile` 的 admin 代編模式），會以 `firestore.get` 跨服務讀取 `users/{uid}.role`，每次寫／刪計費一次 Firestore read。頭像寫入頻率極低、成本可忽略；本人自助上傳不觸發該讀取。

## 現況盤點

- **唯一使用點**：`src/app/user-profile/user-profile.component.ts` 透過 Cloudinary Upload Widget 上傳，成功後拿 `secure_url` 寫入 `users/{uid}.photoUrl`（`src/app/services/user.service.ts:164` `updateUserPhotoUrl`）。
- **`storageBucket` 已設定**（`src/app/app.config.ts:31` = `noahxdm-eip.firebasestorage.app`）但**從未註冊 `provideStorage`、從未呼叫任何 Storage API**。
- **無 `storage.rules`**；`firebase.local.json` / `firebase.prod.json` 皆無 `storage` 區段，emulator 未開 storage port。
- 系統設定 `systemConfig/license` 存有 `cloudinaryCloudName`、`cloudinaryUploadPreset`（`src/app/services/system-config.service.ts`），UI 在 `src/app/system-config/system-config.component`。
- `tools/cloudinary-cleanup.js` + `downloadUsersPhotoPublicId()`（`src/app/system-config/system-config.component.ts:128`）為舊手動清理流程，搭配 `tools/eipImages.json`。
- `src/index.html:18` 載入 Cloudinary widget script；`package.json` 有 `cloudinary` devDependency；`.env` 有 `CLOUDINARY_URL`。

## Storage 路徑與資料模型

**固定路徑（覆寫策略核心）**：

```text
avatars/{uid}/avatar.webp
```

- 每位使用者**只有一個** avatar 物件。重新上傳＝覆寫同一路徑 → **先天不可能有孤兒檔**。
- `photoUrl` 仍存 `getDownloadURL()` 回傳的 HTTPS URL（含 token）；Firestore 結構與顯示端（`layout`、`user-card-easy`）**完全不用改**。
- 上傳 metadata：`contentType: 'image/webp'`、`cacheControl: 'public,max-age=604800'`（一週瀏覽器快取，壓低 egress 成本）。

## Security Rules（新增 `storage.rules`）

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // 是否為 admin：跨服務讀取 Firestore users/{uid}.role（每次計費一次 read）
    function isAdmin() {
      return request.auth != null
        && firestore.get(/databases/(default)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }

    match /avatars/{uid}/{fileName} {
      // 僅登入者可讀
      allow read: if request.auth != null;
      // 本人或 admin 可寫；限圖片、限大小
      allow write: if request.auth != null
        && (request.auth.uid == uid || isAdmin())
        && request.resource.size < 1 * 1024 * 1024            // < 1MB
        && request.resource.contentType.matches('image/.*');
      // 本人或 admin 可刪
      allow delete: if request.auth != null
        && (request.auth.uid == uid || isAdmin());
    }

    // 其餘路徑一律拒絕
    match /{allPaths=**} { allow read, write: if false; }
  }
}
```

> **admin 代寫／代刪（已啟用）**：`user-profile` 具 admin 代編他人資料的模式，故規則允許 admin 寫／刪他人頭像。代價是 `isAdmin()` 以 `firestore.get(...users/$(uid))` 跨服務讀取、每次寫／刪計費一次 Firestore read；頭像寫入頻率極低，成本可忽略。本人自助上傳走 `request.auth.uid == uid` 分支，不觸發該讀取。

同步調整：

- `firebase.local.json` / `firebase.prod.json` 新增 `storage` 區段（指向 `storage.rules`）。
- emulator 設定加開 storage（port `9199`），並於 `app.config.ts` 在 `useEmulators` 時 `connectStorageEmulator`。

## 程式碼改動清單（逐檔）

### 新增

| 檔案 | 內容 |
|------|------|
| `storage.rules` | 上述規則 |
| `src/app/services/storage.service.ts` | 封裝 `uploadBytes` / `getDownloadURL` / `deleteObject`，集中可測試的 Storage 存取（憲章：Firebase 存取集中於服務層） |
| `src/app/utils/image-resize.ts` | Canvas API 將上傳圖縮到 ≤512px、輸出 webp（quality ~0.8）；不引入第三方套件 |
| `tools/migrate-avatars-to-storage.js` | 一次性搬遷腳本（見「既有頭像搬遷」） |
| `tools/storage-orphan-audit.js` | 取代 `cloudinary-cleanup.js`：列出 Storage `avatars/`、比對 Firestore `photoUrl`，預設 dry-run 回報孤兒檔，加 `--delete` 才實刪。作為稽核安全網 |

### 修改

| 檔案 | 改動 |
|------|------|
| `src/app/app.config.ts` | 加 `provideStorage(() => getStorage())`；`useEmulators` 時 `connectStorageEmulator(storage,'localhost',9199)` |
| `src/app/user-profile/user-profile.component.ts` | 移除 `declare var cloudinary`、`cloudinaryWidget`、`ngOnInit` 的 widget 初始化；改為 `<input type="file">` 觸發 → resize → `storageService.uploadAvatar(uid,file)` → 取得 URL → `updateUserPhotoUrl`；加上傳中／錯誤狀態 |
| `src/app/user-profile/user-profile.component.html` | 頭像點擊改觸發隱藏 file input；加 loading 提示 |
| `src/app/services/user.service.ts` | 新增 `deleteUserAvatar(uid)`；離職流程（`updateUserAdvanced` 設定 `exitDate` 時）呼叫 Storage 刪檔。`updateUserPhotoUrl` 不變 |
| `src/app/services/system-config.service.ts` | `License` interface 移除 `cloudinaryCloudName` / `cloudinaryUploadPreset`；`updateLicense` 移除對應參數 |
| `src/app/system-config/system-config.component.ts` / `.html` | 移除 Cloudinary 設定表單欄位與 `downloadUsersPhotoPublicId()`（或改為呼叫新的 orphan-audit 流程） |
| `src/index.html` | 移除 Cloudinary widget `<script>` |
| `package.json` | 移除 `cloudinary` devDependency（`dotenv` 視搬遷腳本是否保留） |
| `.env` | 移除 `CLOUDINARY_URL`（搬遷期間暫留，搬完即刪） |

### 刪除

- `tools/cloudinary-cleanup.js`、`tools/eipImages.json`（搬遷與驗證完成後）

## 成本控管策略

Firebase Storage 計費＝**儲存量 $0.026/GB/月 + 下載 egress $0.12/GB + 操作數**。頭像本身極小，重點是別讓它無謂長大：

1. **上傳前 Canvas 壓縮**：≤512px webp，每張約 20–50KB（取代 Cloudinary 可能存的數 MB 原圖）。
2. **確定性路徑覆寫**：再怎麼重傳，每人只有一個物件，**儲存量不隨次數成長**。
3. **`Cache-Control` metadata**：頭像一週瀏覽器快取，顯示端不重複下載 → egress 趨近於零。
4. **Spark 免費額度**（5GB 儲存 / 1GB 每日下載）對內部 EIP 頭像量綽綽有餘。
5. 顯示端沿用 `photoUrl` 直連，無額外 Firestore 讀取放大。

## 孤兒檔刪除策略（多層防線，全程不用 Cloud Functions）

1. **第一道（設計層）**：固定路徑覆寫 → 重傳不產生孤兒。
2. **第二道（生命週期事件）**：使用者離職（設定 `exitDate`）時，前端於交易成功後 `deleteObject(avatars/{uid}/avatar.webp)`。
3. **第三道（人工稽核安全網）**：`tools/storage-orphan-audit.js` 用 Admin SDK 列出 `avatars/` 全部物件、比對 Firestore 全體 `photoUrl`，列出對不上的檔案，**預設 dry-run**，加 `--delete` 才實刪。可重跑。
4. **未來擴充其他上傳功能**（請假附件、補助單據）：沿用「實體文件 + 確定性路徑」綁定；若有「上傳後未送出」暫存需求，對 `temp/` 路徑加 **GCS Object Lifecycle Management**（bucket 層設定，非 Cloud Functions），N 天自動清。

## 既有頭像搬遷（`tools/migrate-avatars-to-storage.js`）

Admin SDK，一次性、可重跑、冪等：

1. 讀 Firestore 全體 `users`。
2. 篩選：`photoUrl` 仍是 Cloudinary 網域 **且 無 `exitDate`**（離職者跳過）。
3. 逐一：下載 Cloudinary 圖 → （可選）伺服器端壓縮 → 上傳到 `avatars/{uid}/avatar.webp`（帶 contentType / cacheControl）→ `getDownloadURL` → 更新該 user `photoUrl`。
4. 冪等：`photoUrl` 已是 Storage 網域者跳過；逐筆 log 成功／失敗，失敗不中斷整批。
5. 先 `--dry-run` 核對名單，再正式執行。

## 測試策略

- **單元**：`image-resize`（尺寸／格式／品質邊界）、`storage.service`（路徑組成、上傳／刪除呼叫，mock SDK）、`user.service.deleteUserAvatar`、離職時觸發刪檔流程。
- **整合（emulator）**：上傳 → `photoUrl` 寫入 → 顯示；離職 → 檔案被刪；`storage.rules` 授權測試（本人可寫、admin 可寫／刪他人、非本人非 admin 被拒、超過 1MB 被拒、非圖片被拒、未登入不可讀）。
- **搬遷腳本**：對 emulator 跑 dry-run 驗證篩選（含離職者跳過、冪等）。

## 上線步驟（建議順序，可平滑回退）

1. 加 `provideStorage` + `storage.rules` + emulator 設定，本地驗證新上傳流程（此時 Cloudinary 仍在）。
2. 部署 `storage.rules` 與前端新版（新上傳走 Storage，舊 Cloudinary URL 仍可顯示，**雙軌並存**）。
3. 跑搬遷腳本 dry-run → 正式搬遷在職者頭像。
4. 驗證顯示與權限無誤後，**清理遺留**：移除 widget script、`cloudinary` 依賴、`.env`、`license` 的 Cloudinary 欄位與 UI、舊 cleanup 工具；停用 Cloudinary 帳號。
5. 更新 `README` 與憲章 Sync Impact 待辦 TODO（標記 Cloudinary 已清除）。

## 風險與注意

- **`storage.rules` 的 admin 分支會產生 Firestore read 計費**（已啟用以支援 admin 代編模式）；因頭像寫入頻率極低，成本可忽略，本人自助上傳走 `uid` 比對分支不觸發讀取。
- **下載 URL token**：`getDownloadURL` 的 URL 含 token，拿到即可讀；「僅登入者可讀」的 rule 只擋 SDK 直接存取路徑，不擋已外洩的 download URL。對內部 EIP 屬可接受；若極敏感，未來可改 `getBlob` + 短期簽章。
- **Canvas 壓縮**對 HEIC 等格式支援有限；建議 `accept="image/png,image/jpeg,image/webp"`，無法解碼時提示。
- 搬遷需 Cloudinary 圖仍可公開存取（目前 `secure_url` 即可），搬完再停帳號。

## 複雜度追蹤

> 本功能無憲章例外；移植本身即為還清憲章列出的 Cloudinary 遺留 TODO。

| 例外項目 | 為何需要 | 已拒絕的較簡方案 |
|----------|----------|------------------|
| 無 | — | — |
