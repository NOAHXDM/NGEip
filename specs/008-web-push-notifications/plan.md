# 實作計畫：瀏覽器推播通知

**分支**：`codex/dmit-2603-web-push` | **日期**：2026-07-12 | **規格**：[spec.md](./spec.md)
**輸入**：Jira DMIT-2603 與已定案的純廣播 Web Push 產品範圍

## 摘要

以 Angular 20、官方 Firebase JavaScript SDK 與 Firebase Cloud Messaging 實作瀏覽器推播。使用者以此瀏覽器本機偏好自行允許或停用；FCM Token 僅由 SDK 在瀏覽器端管理，不寫入 Firestore、不綁定帳號，也不提供管理者檢視。發送端假設為 Firebase Console 的應用程式全體廣播，內容限非敏感公告。

本功能同時補齊 PWA manifest、背景 Service Worker、iOS／Android 加入主畫面教學及一次性授權引導。

## 技術背景

**語言／版本**：Angular 20、TypeScript 5.8
**主要依賴**：既有 `@angular/fire`、Firebase JS SDK、Angular Material、原生 Notification／Service Worker／Push API
**資料儲存**：瀏覽器 `localStorage` 僅保存 `notificationOptIn` 與 `notificationPromptDismissed`；不新增 Firestore 資料
**測試策略**：Karma／Jasmine 單元測試、Angular TestBed 元件整合測試、正式建置驗證
**目標平台**：Firebase Hosting 上的桌面與行動 Web／PWA
**專案型態**：Angular 單一前端應用程式
**效能目標**：未 opt-in 時不註冊 Messaging；已 opt-in 時每次應用啟動最多一次靜默同步；不增加 Firestore 讀寫
**限制條件**：僅傳送全體、非敏感廣播；不提供送達保證；iOS／iPadOS 16.4+ 需加入主畫面
**規模／範圍**：個人資料通知 Tab、登入後授權引導、單一背景 Service Worker

## 憲章檢查

- [x] 僅使用憲章允許的 Firebase 官方服務；Firebase Cloud Messaging 已於憲章 1.1.0 正式納入。
- [x] 不變更 Authentication 流程或使用者主檔。
- [x] 不新增 Firestore 集合、欄位、查詢、索引或成本。
- [x] 不變更 Firestore Security Rules；Token 不寫入 Firestore。
- [x] 僅使用官方 Firebase JavaScript SDK 與原生 Web API，沒有新增 npm 依賴。
- [x] 已限制初始化與訂閱同步時機，避免未 opt-in 使用者產生額外工作。
- [x] 已規劃服務、Layout、授權 Dialog、User Profile 的單元／整合測試。
- [x] spec、plan、tasks 與使用者文案皆使用繁體中文。
- [x] 使用者同意、通知內容敏感度、Token 保存及退出／清理策略均已定義。

## 架構與生命週期

### 設定單一來源

Firebase Web App 公開設定集中於 `src/firebase-config.json`：

- Angular `app.config.ts` 直接匯入該 JSON 初始化 Firebase。
- `tools/generate-firebase-messaging-sw.mjs` 於 build／watch 前讀取同一份 JSON，並依 `package-lock.json` 的 Firebase 實際版本產生 `public/firebase-messaging-sw.js`。
- 產物檔案保留於版本控制，檔頭標示不得手動編輯，避免 Angular 設定、Service Worker 設定及 CDN SDK 版本漂移。

VAPID public key 保留於 environment，因其屬 Messaging 訂閱參數而非 Firebase App config；public key 不是機密。

### 啟用

1. 使用者於 Dialog 或通知設定頁主動點擊啟用。
2. 確認瀏覽器與 Messaging 支援度。
3. 呼叫原生 `Notification.requestPermission()`。
4. 權限允許後註冊根 scope Service Worker，取得 FCM Token。
5. 成功後才保存 `notificationOptIn = true` 並註冊前景訊息處理器。

### 背景恢復

只有 `notificationOptIn === true` 且瀏覽器權限仍為 `granted` 時，應用程式啟動才靜默確保 Service Worker 與 Token 存在。背景流程不得呼叫權限視窗。

### 停用

先保存 `notificationOptIn = false`，再呼叫 `deleteToken()` 並以 Push API 解除殘留 subscription。即使清理失敗，下次啟動仍不得自動重建。登出不執行停用。

## Firebase Cloud Messaging 治理與廣播假設

- 發送端使用 Firebase Console 的應用程式廣播，不實作自建 API、後端排程、topic 管理或個人化發送。
- Token 只用於瀏覽器 SDK 建立 FCM 訂閱，應用程式不回傳、不顯示、不持久化。
- 推播不得包含姓名、帳號、交易、考勤、補助、評核或其他個人／敏感資訊。
- 若未來需要分群、交易通知、事件自動化或送達追蹤，必須另立 spec／plan，重新設計 Token 綁定、Security Rules、退出、清理與後端發送架構。

## Hosting 與 Service Worker 快取

`firebase.prod.json` 對 `/firebase-messaging-sw.js` 設定 `Cache-Control: no-cache, no-store, must-revalidate`，避免 Hosting 或瀏覽器長期沿用舊版背景程式。其他靜態資產維持既有快取行為。

## 風險與緩解

- **憲章服務清單原未包含 FCM**：已修訂憲章至 1.1.0，正式納入並限制用途。
- **設定與 SDK 版本漂移**：使用共用 JSON 與產生腳本，從 lockfile 取得 Firebase 版本。
- **使用者誤以為可保證送達**：UI 只描述啟用狀態，不提供送達狀態或管理端檢視。
- **敏感資料出現在推播**：規格明定僅限非敏感全體廣播；擴充必須重新審查。
- **停用後被背景修復**：以 `notificationOptIn` 與瀏覽器 permission 分離，先寫 opt-out 再清理訂閱。
- **清除網站資料後 permission 仍 granted**：本機 opt-in 消失時不自動訂閱，等待使用者再次明確操作。
- **Service Worker 更新延遲**：對 SW 使用 no-cache Hosting header。
- **第三方圖示授權**：PWA 尺寸沿用既有 Lightweight 圖示，通知教學區塊提供 Icons8 原始圖示與來源連結，符合免費使用的 attribution 要求。

## 遷移與部署

- **資料遷移**：無 Firestore 或帳號資料遷移。
- **既有 PoC 欄位**：正式程式不讀寫 `fcmPocEnabled` 或 `fcmTokens`；若 production 曾寫入，可另以資料清理工作移除，但不影響功能。
- **瀏覽器遷移**：註冊根 scope SW 前清除 Firebase SDK 早期可能產生的預設 Messaging scope。
- **部署順序**：先執行 SW 產生腳本與 Angular build，再部署 Hosting；部署後以真實 HTTPS 環境進行桌面、Android、iPhone PWA 手動驗證。

## 測試策略

- `NotificationService`：支援度、授權拒絕、成功訂閱、背景 opt-in gate、停用意圖。
- `LayoutComponent`：不支援、permission 非 default、已 dismissed 與首次顯示 Dialog 分支。
- `FcmPermissionDialogComponent`：啟用與暫不開啟皆記錄一次性提示狀態。
- `UserProfileComponent`：刷新狀態、啟用／停用後刷新與使用者訊息。
- 整體：執行 `npm test -- --watch=false --browsers=ChromeHeadlessNoSandbox` 與 `npm run build`。
- Firebase Emulator 不支援 Messaging；真實投遞需於 HTTPS preview／production 手動驗證，並記錄為平台限制。

## 專案結構

```text
specs/008-web-push-notifications/
├── spec.md
├── plan.md
└── tasks.md

src/app/
├── notifications/fcm-permission-dialog/
├── services/notification.service.ts
├── layout/layout.component.ts
└── user-profile/user-profile.component.*

src/firebase-config.json
public/firebase-messaging-sw.js
public/manifest.json
tools/generate-firebase-messaging-sw.mjs
firebase.prod.json
```

## 複雜度追蹤

| 項目 | 為何需要 | 已拒絕的較簡方案 |
| --- | --- | --- |
| Firebase Cloud Messaging | Web Push 需要受信任且跨瀏覽器的官方推播服務；專案已依賴 Firebase SDK | 自建 Push 後端違反 Firebase-only；只用 Notification API 無法接收遠端訊息 |
| 產生式 Service Worker | SW 無法直接使用 Angular environment 替換，需要避免兩份 config 與 SDK 版本漂移 | 手動同步兩份設定容易漏改，已被 code review 指出風險 |
