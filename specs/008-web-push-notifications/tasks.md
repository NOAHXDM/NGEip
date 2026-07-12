# 任務清單：瀏覽器推播通知

**輸入**：`specs/008-web-push-notifications/spec.md`、`plan.md`
**功能分支**：`codex/dmit-2603-web-push`

## Phase 1：治理與文件

- [x] T001 修訂 `.specify/memory/constitution.md` 至 1.1.0，正式納入 Firebase Cloud Messaging。
- [x] T002 [P] 同步 `CLAUDE.md` 與 `.specify/templates/plan-template.md` 的允許服務與檢查項目。
- [x] T003 建立繁中 `specs/008-web-push-notifications/spec.md`、`plan.md`、`tasks.md`。

## Phase 2：共享基礎

- [x] T004 於 `src/app/app.config.ts` 註冊官方 Firebase Messaging provider。
- [x] T005 建立 `src/firebase-config.json` 與 `tools/generate-firebase-messaging-sw.mjs`，統一 Angular／SW 設定與 Firebase SDK 版本。
- [x] T006 [P] 建立 `public/manifest.json`、PWA 圖示與 `src/index.html` PWA metadata。
- [x] T007 在 `firebase.prod.json` 對 `/firebase-messaging-sw.js` 設定 no-cache headers。

## Phase 3：使用者故事 1－允許與停用通知（P1）

- [x] T008 [US1] 在 `src/app/services/notification.service.ts` 實作使用者授權、背景同步與停用生命週期。
- [x] T009 [US1] 在 `src/app/services/client-preferences.service.ts` 保存瀏覽器層級 opt-in。
- [x] T010 [US1] 在 `src/app/user-profile/user-profile.component.*` 建立正式通知設定 UI，移除 Token UI 與管理者控制。
- [x] T011 [US1] 確保 `src/app/layout/layout.component.ts` 登出不撤銷通知訂閱。
- [x] T012 [US1] 建立 `src/app/services/notification.service.spec.ts` 生命週期單元測試。
- [x] T013 [US1] 建立 `src/app/user-profile/user-profile.component.spec.ts`，驗證刷新、啟用與停用流程。

## Phase 4：使用者故事 2－一次性授權引導（P1）

- [x] T014 [US2] 建立 `src/app/notifications/fcm-permission-dialog/` 授權說明元件。
- [x] T015 [US2] 在 `src/app/layout/layout.component.ts` 實作一次性提示與背景初始化 gate。
- [x] T016 [P] [US2] 建立 `src/app/layout/layout.component.spec.ts`，覆蓋提示短路條件。
- [x] T017 [P] [US2] 建立 `src/app/notifications/fcm-permission-dialog/fcm-permission-dialog.component.spec.ts`，覆蓋啟用與暫不開啟。

## Phase 5：使用者故事 3－PWA 教學（P2）

- [x] T018 [US3] 在 `src/app/user-profile/user-profile.component.html` 建立 iPhone／iPad 與 Android 加入主畫面教學。
- [x] T019 [US3] 在 `src/app/user-profile/user-profile.component.scss` 建立桌面雙欄、行動單欄版面。
- [x] T020 [US3] 將通知設定 Tab 移至個人資料最後一個可見 Tab。

## Phase 6：複審修正與交付

- [x] T021 移除 `src/app/services/notification.service.ts` 正式環境前景 payload log，並保留可診斷的訂閱錯誤紀錄。
- [x] T022 將 `src/app/app.config.ts` 的 Messaging fallback 改為明確型別，避免 `any`。
- [x] T023 確認並記錄 `public/icons8-lightweight-*.png` 授權，在通知教學區塊提供 Icons8 attribution 連結。
- [x] T024 執行通知相關測試（15 通過）、完整 Karma 測試（323 通過、72 skipped）及 `npm run build`。
- [x] T025 執行 `git diff --check`、殘留 PoC／Token 儲存搜尋與 PR 差異審查。

## 相依性與完成標準

- T005 完成後才能確保每次 build 使用一致的 Firebase config 與 SDK 版本。
- T013、T016、T017 為憲章第 VII 條的合併門檻。
- T021～T025 完成且所有測試通過後，Claude Bot 複審項目才視為關閉。
