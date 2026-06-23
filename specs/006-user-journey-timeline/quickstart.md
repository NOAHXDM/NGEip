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

## 2026-06-23 Claude Bot 第二輪複審修正驗證結果

- `npx tsc -p tsconfig.app.json --noEmit`：通過。
- `git diff --check`：通過。
- `npm test -- --watch=false --browsers=ChromeHeadless --include='src/app/journey-timeline/**/*.spec.ts'`：20 個 journey timeline 測試通過；新增 Material delete dialog 取消流程測試。
- `npm run test:journey-rules`：通過；新增 schema allowlist、不可變 `targetUserId` 更新拒絕，以及同 attachmentId 但不同 Storage 路徑不可被既有 cleanup queue 刪除的整合驗證。
- `npm test -- --watch=false --browsers=ChromeHeadless`：254 個測試通過、68 個既有測試略過，無失敗。
- `npm run build`：通過；production bundle 產出至 `dist/angular-eip`。沙盒內 build 仍會無錯誤訊息中止（exit 134），以外層權限重跑後通過。

本輪依複審修正：`hasJourneyCleanupOwnership` 加入完整 Storage path 比對、事件刪除二次確認改用 Material Dialog、timeline 查詢游標改用展開式 constraints 避免魔術索引，並強化 emulator 邊界測試以補足 Rules/schema/immutable 與跨路徑附件治理驗證。

## 2026-06-23 Claude Bot 第三輪複審修正驗證結果

- `npx tsc -p tsconfig.app.json --noEmit`：通過。
- `git diff --check`：通過。
- `npm test -- --watch=false --browsers=ChromeHeadless --include='src/app/journey-timeline/**/*.spec.ts'`：24 個 journey timeline 測試通過；新增純空白 title/content 驗證、20/21 筆來源分頁邊界與快取式 timeline color 回歸覆蓋。
- `npm run test:journey-rules`：通過；Storage delete rules 改為 exists guard 後單次讀取 session／cleanup queue，並維持 upload session 與 cleanup queue 治理鏈。
- `npm test -- --watch=false --browsers=ChromeHeadless`：258 個測試通過、68 個既有測試略過，無失敗。
- `npm run build`：通過；production bundle 產出至 `dist/angular-eip`。

本輪依複審修正：事件 update/delete 交易成功後，附件清理失敗不再向使用者回報「原資料未變更」，而是保留 cleanup queue 並以 warning 記錄；事件 dialog 加上 `Validators.pattern(/\S/)`，純空白欄位會進入 Angular invalid 狀態並顯示既有錯誤訊息；時間軸來源查詢改為每來源讀取 21 筆、輸出 20 筆，以正確判斷剛好 20 筆時已無更多資料；個人報告入口改用 `currentUser()?.uid` guard；刪除確認 Dialog 拆為獨立元件檔；`timelineColor()` 加入 Map 快取避免每次 change detection 重算 hash。

## 2026-06-23 Claude Bot 第四輪複審修正驗證結果

- `npx tsc -p tsconfig.app.json --noEmit`：通過。
- `git diff --check`：通過。
- `npm test -- --watch=false --browsers=ChromeHeadless --include='src/app/journey-timeline/**/*.spec.ts'`：27 個 journey timeline 測試通過；新增 null user、防止 dialog 結果丟失的 create/edit firstValueFrom 流程測試。
- `npm run test:journey-rules`：通過。
- `npm test -- --watch=false --browsers=ChromeHeadless`：261 個測試通過、68 個既有測試略過，無失敗。
- `npm run build`：通過；production bundle 產出至 `dist/angular-eip`。

本輪依複審修正：`openCreate()` 與 `openEdit()` 改為 `async` 並以 `firstValueFrom(dialog.afterClosed())` 等待內層事件 dialog 結果，不再因外層使用者編輯 Dialog 銷毀時間軸元件而取消訂閱、靜默丟失使用者輸入；`currentUser$` 訂閱改用 `user?.uid ?? ''` 防禦登出或 session 過期時 emit null；事件更新移除基於舊 snapshot 的附件數量前置檢查，統一由 transaction 內最新 Firestore snapshot 與 `mergeAttachmentChanges` 判斷並映射錯誤；`JourneyEventService` 的 create/update/delete 改為直接回傳 Promise，移除元件端多餘 Observable 解包。

## 2026-06-23 Claude Bot 第五輪複審修正驗證結果

- `npx tsc -p tsconfig.app.json --noEmit`：通過。
- `git diff --check`：通過。
- `npm test -- --watch=false --browsers=ChromeHeadless --include='src/app/journey-timeline/**/*.spec.ts'`：27 個 journey timeline 測試通過。
- `npm run test:journey-rules`：通過；確認 Storage Rules 保留 journey-event exists guard 後無 null evaluation warning，並維持 session／cleanup queue 治理。
- `npm run test:attachment-rules`：通過；確認 request attachment 既有 Rules matrix 無回歸，且 cleanup ownership 維持與 attendance/subsidy 上傳附件規章一致。
- `npm test -- --watch=false --browsers=ChromeHeadless`：261 個測試通過、68 個既有測試略過，無失敗。
- `npm run build`：通過；production bundle 產出至 `dist/angular-eip`。

本輪依複審修正：`JourneyEventService.rollbackPrepared()` 補上個別附件回滾失敗的 sessionId、attachmentId、storagePath 與 errorCode log，並以 best-effort 更新 session 狀態；`processCleanup()` 拆分 Storage delete 與 cleanup queue delete，Storage 失敗記錄 `storage-delete-failed`，queue 刪除失敗記錄 `queue-delete-failed`，Storage object-not-found 則視為可繼續移除 queue；Storage Rules 的 journey-event delete 規則保留 exists guard 並加註說明，以避免缺失 session/queue 文件造成 null evaluation warning，同時明確記錄 Admin 不可繞過 Firestore 附件關聯直接刪除 journey event Storage 物件；request attachment cleanup ownership 也保留 exists guard，避免 emulator 出現 null/undefined warning；時間軸 Admin 操作在 actorUid 尚未就緒時顯示 snackbar 提示；事件 dialog 移除 trim 後不可達的 `!title || !content` 檢查；Firestore Rules 移除 userJourneyEvents update 上多餘的 `isSignedIn()`。

## 2026-06-23 Claude Bot 第六輪複審修正驗證結果

- `npx tsc -p tsconfig.app.json --noEmit`：通過。
- `git diff --check`：通過。
- `npm test -- --watch=false --browsers=ChromeHeadless --include='src/app/journey-timeline/**/*.spec.ts'`：31 個 journey timeline 測試通過；新增 changedFields 動態稽核、附件驗證錯誤映射，以及 create/edit 並發防護回歸測試。
- `npm run test:journey-rules`：通過；確認 journey-event Storage create 補上 upload session exists guard 後仍維持 session／cleanup queue 治理。
- `npm test -- --watch=false --browsers=ChromeHeadless`：265 個測試通過、68 個既有測試略過，無失敗。
- `npm run build`：通過；production bundle 產出至 `dist/angular-eip`。沙盒內 build 仍會無錯誤訊息中止（exit 134），以外層權限重跑後通過。

本輪依複審修正：更新稽核的 `changedFields` 改為由 transaction 內最新事件快照與本次輸入動態比對，只記錄實際變更欄位；時間軸事件新增、編輯與刪除共用 `eventActionPending` guard，並在 template 停用相關按鈕，避免快速雙擊開啟多個 dialog 或建立重複事件；journey-event Storage create 規則補上 upload session exists guard，與 delete 分支的 null-safe pattern 對齊；附件驗證錯誤改為具體繁中訊息，保留檔案大小、格式、簽章與數量等可操作原因；時間軸同來源同時間的文件 ID tie-break 改為 locale-independent 字串比較，避免測試或執行環境 locale 影響排序。

T043（將 journey-event attachment 完整整合進共用 `AttachmentService` domain adapter）本輪仍列為後續技術債，原因是完整 adapter 重構會跨越 attendance/subsidy 既有上傳流程與回歸測試邊界；本輪先將 journey-event 上傳、回滾、cleanup 的可觀測錯誤紀錄、best-effort 行為、附件驗證訊息與 Rules 治理對齊既有規章，避免本 PR 額外擴大重構風險。

## 2026-06-23 Claude Bot 第七輪複審修正驗證結果

- `npx tsc -p tsconfig.app.json --noEmit`：通過。
- `git diff --check`：通過。
- `npm test -- --watch=false --browsers=ChromeHeadless --include='src/app/journey-timeline/**/*.spec.ts'`：36 個 journey timeline 測試通過；新增附件數量預檢、cleanup 補償三路徑、timeline gap 上限與 discriminated union 型別回歸覆蓋。
- `npm run test:journey-rules`：通過。
- `npm test -- --watch=false --browsers=ChromeHeadless`：270 個測試通過、68 個既有測試略過，無失敗。
- `npm run build`：通過；production bundle 產出至 `dist/angular-eip`。沙盒內 build 仍會無錯誤訊息中止（exit 134），以外層權限重跑後通過。

本輪依複審修正：`deleteAsync()` 加入與 update 相同的 `updatedAt` 樂觀鎖檢查，避免 Admin 以舊確認框刪除已被他人更新的事件；`event-not-found` 改為明確顯示「事件已不存在，請重新整理頁面。」並套用於 update/delete；更新前新增附件數量預檢，僅扣除確實存在且本次移除的附件 ID，避免明顯超量時先上傳再回滾；`processCleanup()` 抽出 `processJourneyEventAttachmentCleanup()`，單測覆蓋 Storage object-not-found 冪等成功、Storage delete 失敗與 queue delete 失敗三條補償路徑；時間軸垂直間距加入 200px 額外上限，避免多年歷史資料在小裝置產生極端空白；`JourneyTimelineItem` 改為 discriminated union，`source === 'event'` 時由 TypeScript 強制要求 `event` 存在，template 也改以來源型別窄化補助專屬欄位。

## 2026-06-23 Claude Bot 第八輪複審修正驗證結果

- `npx tsc -p tsconfig.app.json --noEmit`：通過。
- `git diff --check`：通過。
- `npm test -- --watch=false --browsers=ChromeHeadless --include='src/app/journey-timeline/**/*.spec.ts'`：39 個 journey timeline 測試通過；新增 reload/loadMore session generation 競態、afterClosed 完成但未 emit 時不送出，以及缺 eventDate 異常快照不誤記 changedFields 的回歸測試。
- `npm run test:journey-rules`：通過；確認 journey-event Storage create/delete helper guard 調整後仍維持 session／cleanup queue 治理。
- `npm test -- --watch=false --browsers=ChromeHeadless`：273 個測試通過、68 個既有測試略過，無失敗。
- `npm run build`：通過；production bundle 產出至 `dist/angular-eip`。沙盒內 build 仍會無錯誤訊息中止（exit 134），以外層權限重跑後通過。

本輪依複審修正：`reload()` 與 `loadMore()` 加入 `sessionGeneration` 與 session identity guard，舊 session 的 `loadMore()` 在 reload 後完成時不會把舊頁資料附加到新清單；事件新增／編輯／刪除 dialog 的 `afterClosed()` 改由 `takeUntilDestroyed(this.destroyRef)` 與 `defaultIfEmpty(undefined)` 保護，元件銷毀或串流完成但未 emit 時不再送出事件，也不更新已銷毀元件的 signals；Storage Rules 將 journey-event upload session exists guard 收斂到 `hasValidJourneyUploadSession()`，並讓 `hasJourneyCleanupOwnership()` 自帶 exists guard，避免未來獨立呼叫時產生 null evaluation；`changedJourneyEventFields()` 移除對非 optional `eventDate` 的 optional chaining，只有現值確實是 `Timestamp` 且毫秒值不同時才記錄 `eventDate`，避免異常快照造成過度稽核。

T017／T018／T047 仍維持為後續技術債：目前本分支以 journey service/component/dialog specs 與 `tools/journey-event-emulator-tests.cjs` 覆蓋 userId 查詢隔離、Rules 跨使用者讀取、Admin-only 寫入、附件 session/cleanup queue 與嵌入權限主要行為；若要補齊 tasks 原文指定的 Angular＋Firestore integration spec 與共用 `AttachmentService` adapter 回歸，需整理專案既有多處 `testing/*.spec.ts`／Jest emulator 架構與 T043 adapter 重構，適合另開獨立 PR 收斂，避免本修正輪擴大為跨 attendance/subsidy 的測試平台重整。

## 2026-06-24 Claude Bot 第九輪複審修正驗證結果

- `npx tsc -p tsconfig.app.json --noEmit`：通過。
- `git diff --check`：通過。
- `npm test -- --watch=false --browsers=ChromeHeadless --include='src/app/journey-timeline/**/*.spec.ts'`：39 個 journey timeline 測試通過；補上 `invalid-event-fields` 的明確繁中錯誤映射回歸。
- `npm run test:journey-rules`：通過；新增 cleanup queue 轉移驗證，確認相同附件 id/storagePath 但 `uploadedAt` 序列化不同時仍可建立合法 cleanup queue，且 storagePath 不符時會被拒絕。
- `npm test -- --watch=false --browsers=ChromeHeadless`：273 個測試通過、68 個既有測試略過，無失敗。
- `npm run build`：通過；production bundle 產出至 `dist/angular-eip`。沙盒內 build 仍會無錯誤訊息中止（exit 134），以外層權限重跑後通過。

本輪依複審修正：`JourneyEventService.createAsync()` 與 `updateAsync()` 先正規化／驗證事件欄位，再建立 upload session 與寫入 Storage，避免欄位無效時先上傳附件再 rollback；`invalid-event-fields` 改為明確繁中訊息，不再落入通用錯誤；事件附件 `uploadedAt` 改為逐檔上傳後個別記錄，避免多檔共用同一 client timestamp；Firestore Rules 將 upload session create 的 Admin gate 提到頂層；cleanup queue 轉移不再用整個 attachment map 深度相等，而是比對正式事件原附件中的 `id + storagePath`，並確認交易後該 id 已自事件 attachments 移除；Storage Rules 的 journey upload session 與 cleanup ownership helper 改回 `exists(...) && firestore.get(...).data...` 的 null-safe pattern。

補充限制：若瀏覽器在 `prepareUploads()` 成功建立 upload session 並完成 Storage 上傳後、但正式 event batch/transaction commit 前崩潰，client 端 rollback 無法執行，session 可能停在 `uploading`。目前 `request-attachment-orphan-audit.js` 已能盤點 Storage 物件是否被 parent/session/queue 引用，但尚未提供 journey-event upload session TTL 或自動清掃流程；此項維持為後續治理工作，需另行設計避免誤刪仍在上傳中的合法 session。

## 部署順序

1. 先部署 `firestore.rules`、`storage.rules` 與 `firestore.indexes.json`。
2. 等待 Firestore 複合索引狀態成為 Enabled。
3. 再部署 Angular Hosting bundle。
4. 依上方 smoke test 驗證兩個入口、權限、排序、附件與載入更多。
