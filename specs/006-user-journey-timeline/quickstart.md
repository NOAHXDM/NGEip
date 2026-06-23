# 驗證快速上手：使用者歷程時間軸

## 自動化驗證

1. 執行 `npm test -- --watch=false`，確認 merge、cursor、component、dialog 與既有測試通過。
2. 啟動 Firestore／Storage Emulator，執行本功能 Rules 整合測試。
3. 執行 `npm run build`，確認 production build 無 template 或型別錯誤。

## 手動 smoke test

1. 以 Admin 開啟一位使用者的編輯 dialog，進入「職場屬性報告」Tab。
2. 確認沒有考核快照時，時間軸仍可見。
3. 建立過去、今天、未來日期各一筆事件，包含圖片與 PDF；確認排序、預覽與欄位顯示。
4. 編輯一筆事件日期，確認它移到正確位置；替換附件後確認舊檔進入清理流程。
5. 建立至少 25 筆事件並混入不同日期補助，確認「載入更早歷程」無重複、無遺漏。
6. 以該目標使用者登入「我的職場屬性報告」，確認可讀取既有事件與附件，但不能新增、修改或刪除。
7. 以另一位已登入的非目標使用者直接讀取事件與附件，確認允許；嘗試新增／修改／刪除則確認 Rules 拒絕。
8. 確認補助項目包含五種非餐費類型，但餐費資料完全不出現在時間軸。
9. 模擬上傳或 transaction 失敗，確認事件維持原狀且沒有真正孤兒附件。
10. 以 100 筆混合資料執行至少 20 次冷啟動量測，記錄第 95 百分位首批呈現時間並確認不超過 3 秒。
11. 由未熟悉功能的測試者建立一筆含附件事件，記錄從開啟 Tab 至成功顯示所需時間並確認不超過 2 分鐘。

## 2026-06-22 實作驗證結果

- `npx tsc -p tsconfig.app.json --noEmit`：通過。
- `npm run build`：通過；production bundle 產出至 `dist/angular-eip`。
- `npm test -- --watch=false --browsers=ChromeHeadless`：240 個測試通過、68 個既有測試略過，無失敗。
- `npm run test:journey-rules`：以 `demo-user-journey` 啟動 Firestore／Storage Emulator，驗證 authenticated cross-user read、非 Admin update deny、Admin create/update/delete、audit 原子性，以及 Admin-only 附件 session／讀取／禁止覆寫，全部通過。

尚未執行 100 筆／20 次冷啟動 P95 效能量測，以及由未熟悉功能測試者進行的兩分鐘操作驗證；這兩項保留為合併前人工驗收。

## 2026-06-23 需求修正驗證結果

- `npx tsc -p tsconfig.app.json --noEmit`：通過。
- `git diff --check`：通過。
- `npm test -- --watch=false --browsers=ChromeHeadless --include='src/app/journey-timeline/**/*.spec.ts'`：6 個 journey timeline 測試通過。
- `npm run test:journey-rules`：通過；驗證 authenticated cross-user read、非 Admin create/update/session 拒絕、Admin create/update/delete、audit 原子性、Admin-only 附件 session，以及附件讀取／禁止覆寫。
- `npm run build`：通過；production bundle 產出至 `dist/angular-eip`。沙盒內 build 曾無錯誤訊息中止（exit 134），以外層權限重跑後通過。

## 2026-06-23 Claude Bot 複審修正驗證結果

- `npx tsc -p tsconfig.app.json --noEmit`：通過。
- `git diff --check`：通過。
- `npm test -- --watch=false --browsers=ChromeHeadless --include='src/app/journey-timeline/**/*.spec.ts'`：19 個 journey timeline 測試通過；補強 timeline buffer merge、event service 正規化／錯誤映射、dialog UTC 日期與欄位驗證，以及補助 icon／日期 gap component 規則。
- `npm test -- --watch=false --browsers=ChromeHeadless`：253 個測試通過、68 個既有測試略過，無失敗。
- `npm run test:journey-rules`：通過；新增驗證 Admin 無 upload session 或 cleanup queue 時不可直接刪除 journey event Storage 物件，必須由合法 cleanup queue 治理後才能刪除。
- `npm run build`：通過；production bundle 產出至 `dist/angular-eip`。沙盒內 build 仍會無錯誤訊息中止（exit 134），以外層權限重跑後通過。

本輪依複審修正：移除 journey event Storage delete 的 Admin 直通權限、簡化 Firestore `validJourneySessionParent` rules read、移除事件附件上傳後多餘 `getDoc`、將事件日期輸入與顯示統一為 UTC、替 dialog `afterClosed()` 加上 `takeUntilDestroyed`，並提供附件衝突與附件數量衝突的明確繁中錯誤訊息。

## 部署順序

1. 先部署 `firestore.rules`、`storage.rules` 與 `firestore.indexes.json`。
2. 等待 Firestore 複合索引狀態成為 Enabled。
3. 再部署 Angular Hosting bundle。
4. 依上方 smoke test 驗證兩個入口、權限、排序、附件與載入更多。
