# 驗證快速上手：使用者歷程時間軸

## 自動化驗證

1. 執行 `npm test -- --watch=false`，確認 merge、cursor、component、dialog 與既有測試通過。
2. 執行 `npm run test:journey-rules`，啟動 Firestore／Storage Emulator 並驗證本功能 Rules 整合測試。
3. 執行 `npm run test:journey-integration`，以 Angular TestBed 搭配 Firestore Emulator 驗證 US1 目標使用者查詢隔離、跨來源分頁合併，以及兩個職場屬性報告嵌入點的 UID／權限回歸。
4. 執行 `npm run build`，確認 production build 無 template 或型別錯誤。

PR CI 會自動執行 `npx tsc -p tsconfig.spec.json --noEmit`、`npm test -- --watch=false` 與 `npm run test:journey-integration`；本機合併前仍可依上列指令手動重跑完整驗證。

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

## 2026-06-28 Issue #25 整合測試補強驗證結果

- `npx tsc -p tsconfig.spec.json --noEmit`：通過。
- `git diff --check`：通過。
- `npm run test:journey-integration`：通過；6 個 Angular＋Firestore Emulator 測試成功，並載入真實 `firestore.rules` 驗證 authenticated target/other/admin 讀取指定目標時間軸、跨使用者資料隔離、雙來源分頁無重複遺漏，以及兩個職場屬性報告嵌入點的 UID／權限回歸；本指令改為由 `firebase emulators:exec` 直接執行 `npx ng test`。
- `npm test -- --watch=false --include='src/app/journey-timeline/testing/report-embedding.spec.ts'`：2 個報告嵌入回歸測試通過；測試保留真實報告 component template，只替換時間軸與圖表等非目標 child component，確認空狀態外仍實際渲染 `app-user-journey-timeline` selector。
- `npm test -- --watch=false --include='src/app/journey-timeline/services/*.spec.ts'`：29 個 journey service 測試通過。
- `npm test -- --watch=false --include='src/app/journey-timeline/components/*.spec.ts' --include='src/app/journey-timeline/dialogs/*.spec.ts'`：20 個 journey component/dialog 測試通過。
- `npm run test:journey-rules`：通過；維持既有 Firestore／Storage Rules emulator 覆蓋。
- `npm run build`：通過；使用 nvm Node 22 的 arm64 PATH 執行，避開 `/usr/local/bin/node` x64 與既有 esbuild arm64 binary 的平台不符問題。

本輪依 Claude Bot 複審再修正：移除 report embedding spec 的手動 `ngOnInit()` 呼叫，並改用真實 template 搭配輕量 child replacement 驗證時間軸 selector；report embedding helper 在找不到時間軸時會以明確錯誤失敗，不再落入 null 解參照；`npm test` 預設帶入 `ChromeHeadless`，避免未指定 browser 時 Karma 等待手動連線，並新增 `npm run test:debug` 供本機 Chrome 互動除錯；integration setup 透過 Karma 供應並載入 `firestore.rules`，初始化流程以 pending promise 防止並行重複建立 test environment，teardown 則以 `try/finally` 確保 cleanup 失敗時仍會釋放 singleton；viewer 情境拆為獨立繁中 `it()`，讓 target/other/admin 任一情境失敗時可直接定位；分頁整合測試加入 100 次迭代上限，base seed 與大量 fixture seed 皆改為 `writeBatch` 降低 Emulator round-trip；same-time 補助測試資料改由工廠直接產生一致的 `applicationDate`／`createdAt`／`updatedAt`；`karma.journey-integration.conf.cjs` 改為繼承 `karma.conf.js`，且只有 integration 設定保留 `ChromeHeadless` 與較長的 `browserNoActivityTimeout`；`karma.conf.js` 會合併額外 plugins 而非覆蓋基礎 plugins；`testTimestamp()` 補上 1 至 31 日範圍防呆，分頁 fixture 也固定在 2026 年 1 月內，避免日期 overflow 讓排序案例失真。

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

## 2026-06-24 Claude Bot 第十輪複審修正驗證結果

- `npx tsc -p tsconfig.app.json --noEmit`：通過。
- `git diff --check`：通過。
- `npm test -- --watch=false --browsers=ChromeHeadless --include='src/app/journey-timeline/**/*.spec.ts'`：41 個 journey timeline 測試通過；新增 create audit `changedFields` 與附件 metadata runtime guard 回歸。
- `npm run test:journey-rules`：通過；新增無效 event attachments schema 拒絕、owner/other 已登入使用者不可讀取 `userJourneyEventAudits` 的 emulator 驗證。沙盒內因 localhost port EPERM 失敗一次，已用外層權限重跑通過。
- `npm test -- --watch=false --browsers=ChromeHeadless`：275 個測試通過、68 個既有測試略過，無失敗。
- `npm run build`：通過；production bundle 產出至 `dist/angular-eip`。沙盒內 build 仍會無錯誤訊息中止（exit 134），以外層權限重跑後通過。

本輪依複審修正：Firestore Rules 的 `validJourneyEventData()` 補上 `attachments` 陣列 per-item schema 驗證，至少要求每筆附件 metadata 具備 `id`、`storagePath`、`originalName`、`contentType`、`size`、`uploadedBy`、`uploadedAt` 等必要欄位與基本型別，避免 Admin 透過 Console 或 SDK 寫入 `{ rogue: 'data' }` 後導致事件刪除流程無法建立 cleanup queue；`deleteAsync()` 也加入 runtime guard，對歷史異常附件 metadata 會記錄錯誤並略過 cleanup queue 建立，使事件仍可刪除；create audit 的 `changedFields` 改為僅在實際有附件時加入 `attachments`；`journeyEventAttachmentCleanupQueue` delete 規則補上註解，明確說明 queue 應由 service 在 Storage 清理完成後移除，不能先手動刪除；Storage Rules 的 `ownsJourneyUploadSession()` 自帶 `exists()` guard；Angular contract 文件補回 `JourneyEventDialogData.actorUid`。

## 2026-06-24 Claude Bot 第十一輪複審修正驗證結果

- `npx tsc -p tsconfig.app.json --noEmit`：通過。
- `git diff --check`：通過。
- `npm test -- --watch=false --browsers=ChromeHeadless --include='src/app/journey-timeline/**/*.spec.ts'`：45 個 journey timeline 測試通過；新增歷史附件 metadata 復原、嚴格樂觀鎖與 trim 後長度驗證回歸。
- `npm run test:journey-rules`：通過；新增純空白 title Firestore Rules 拒絕、非 actor Admin 不可提前刪 cleanup queue，以及歷史缺 `id` 但具合法 `storagePath` 的附件可在 delete transaction 建立 cleanup queue 的 emulator 驗證。沙盒內因 localhost port EPERM 失敗一次，已用外層權限重跑通過；emulator 輸出中的 `PERMISSION_DENIED` 為 `assertFails(...)` 預期拒絕案例。
- `npm test -- --watch=false --browsers=ChromeHeadless`：279 個測試通過、68 個既有測試略過，無失敗。
- `npm run build`：通過；production bundle 產出至 `dist/angular-eip`。沙盒內 build 仍會無錯誤訊息中止（exit 134），以外層權限重跑後通過。

本輪依複審修正：`deleteAsync()` 對歷史異常附件 metadata 不再直接略過；若仍保有合法 `storagePath`，會從 path 末段補回 attachment id 並產生最小可清理 metadata，讓 delete transaction 能建立 cleanup queue，避免 Storage 物件因沒有 queue 而永久卡住；只有連 `storagePath` 都缺失的資料才記錄錯誤並略過。Firestore Rules 的 cleanup transfer 同步支援這類歷史附件：正式新寫入仍需完整 schema，但歷史附件可用 `storagePath` 佐證原事件引用，且交易後必須移除同一 `storagePath`。`journeyEventAttachmentCleanupQueue` delete 收斂為只有 queue actor 可刪除，避免其他 Admin 提前刪 queue；`updateAsync()` / `deleteAsync()` 的樂觀鎖改為兩側皆為 `Timestamp` 且毫秒相同才放行，缺 `updatedAt` 的歷史快照會明確進入 conflict；事件 dialog 的長度驗證改以 trim 後字數計算，避免尾端空白造成 UI 與 service 規則不一致；cleanup queue create 移除多餘 `isSignedIn()`。

補充限制：`JourneyEventService.prepareUploads()` 目前仍使用 client-side `Timestamp.now()` 記錄事件附件 `uploadedAt`；此差異已歸入 T043（journey-event attachment 整合回共用 `AttachmentService` domain adapter）後續收斂。T050（journey-event attachment orphan audit）仍是後續治理項目，將補上 dry-run 稽核與真正 orphan / broken reference 判定。

## 2026-06-24 Claude Bot 第十二輪複審修正驗證結果

- `npx tsc -p tsconfig.app.json --noEmit`：通過。
- `git diff --check`：通過。
- `npm test -- --watch=false --browsers=ChromeHeadless --include='src/app/journey-timeline/**/*.spec.ts'`：45 個 journey timeline 測試通過；確認 timeline / dialog / service 回歸皆維持。
- `npm run test:journey-rules`：通過；新增 queue actor 被移除 Admin 身分後不可刪除 `journeyEventAttachmentCleanupQueue` 的 emulator 回歸。沙盒內若遇 localhost port EPERM，需以外層權限重跑；emulator 輸出中的 `PERMISSION_DENIED` 屬 `assertFails(...)` 預期拒絕案例。
- `npm test -- --watch=false --browsers=ChromeHeadless`：279 個測試通過、68 個既有測試略過，無失敗。
- `npm run build`：通過；production bundle 產出至 `dist/angular-eip`。

本輪依複審修正：`journeyEventAttachmentCleanupQueue` delete 規則改為「仍具 Admin 身分且為 queue actor」才可刪除，避免曾經建立 queue 的 Admin 被降權後仍能提前刪除治理依據；emulator 測試補上降權後刪除失敗與復權後僅 actor 可刪的案例。

`JourneyEventService.prepareUploads()` 改為以 `Promise.allSettled()` 平行上傳事件附件，並在任一檔失敗時等待所有檔案完成或失敗後再回滾所有已成功上傳的 Storage 物件，避免 `Promise.all()` 早退造成後續成功檔案逃過 rollback。事件 dialog 也改用 `signal()` / `computed()` 搭配 OnPush，讓可見附件清單只在移除清單變更時重算，降低小裝置表單輸入時的 change detection 負擔。

補充限制：連 `storagePath` 都缺失的歷史異常附件 metadata 仍無法可靠建立 cleanup queue；目前 `deleteAsync()` 會記錄 `eventId`、`storagePath` 與附件內容後略過，避免阻斷事件刪除。真正 orphan / broken reference 的 dry-run 稽核仍由 T050 收斂；T043/T047 的共用 `AttachmentService` journey-event adapter 與回歸測試仍維持後續技術債，避免本輪擴大為 attendance/subsidy 上傳架構重構。

## 2026-06-24 Claude Bot 第十三輪複審修正驗證結果

- `npx tsc -p tsconfig.app.json --noEmit`：通過。
- `git diff --check`：通過。
- `npm test -- --watch=false --browsers=ChromeHeadless --include='src/app/journey-timeline/**/*.spec.ts'`：45 個 journey timeline 測試通過。
- `npm run test:journey-rules`：通過；新增任意現任 Admin 可更新 cleanup retry 欄位、原 actor 降權後不可更新或刪除、任意現任 Admin 可刪 queue，且可依完整 path 匹配的 cleanup queue 刪除 Storage 物件的 emulator 回歸。沙盒內若遇 localhost port EPERM，需以外層權限重跑；emulator 輸出中的 `PERMISSION_DENIED` 屬 `assertFails(...)` 預期拒絕案例。
- `npm test -- --watch=false --browsers=ChromeHeadless`：279 個測試通過、68 個既有測試略過，無失敗。
- `npm run build`：通過；production bundle 產出至 `dist/angular-eip`。

本輪依產品回覆修正：`journeyEventAttachmentCleanupQueue` 的 retry 欄位更新維持「任意現任 Admin」可操作，但排除已降權的原 actor；queue delete 改為任意現任 Admin 可刪，避免建立者降權後 entry 永久卡住。Storage Rules 的 cleanup queue 刪除授權也同步改為任意現任 Admin 可依完整 `targetUserId/eventId/sessionId/attachmentId/storagePath` 匹配刪除實體物件，避免只放寬 Firestore queue 但 Storage 仍被 actor 綁死。

中低優先建議同步採用：Storage Rules 將 journey upload session / cleanup queue 文件讀取收斂為 exists guard 後單次 `get(...).data` 傳入 helper，減少同文件重複讀取；`deleteEvent()` 在刪除成功與錯誤路徑補上 `isAlive()` guard，避免元件銷毀後仍開 snackbar 或 reload；`prepareUploads()` 上傳失敗時改回滾所有 planned storage paths，而不只回滾 fulfilled 結果，降低部分失敗上傳留下 bytes 的風險；`JourneyEventService` 移除 public method 到 private `*Async` 的純委派層，直接以公開 async CRUD 方法承載實作。

## 2026-06-24 Claude Bot 第十四輪複審修正驗證結果

- `npx tsc -p tsconfig.app.json --noEmit`：通過。
- `git diff --check`：通過。
- `npm test -- --watch=false --browsers=ChromeHeadless --include='src/app/journey-timeline/services/journey-event.service.spec.ts'`：23 個 JourneyEventService 測試通過；新增 public `create()` / `update()` / `delete()` batch/transaction/cleanup 行為、樂觀鎖衝突與上傳失敗 rollback 回歸。
- `npm test -- --watch=false --browsers=ChromeHeadless --include='src/app/journey-timeline/**/*.spec.ts'`：51 個 journey timeline 測試通過。
- `npm run test:journey-rules`：通過；確認 Storage Rules 在 helper 內部保留 exists guard 後仍維持 journey event attachment session / cleanup queue 治理。沙盒內若遇 localhost port EPERM，需以外層權限重跑；emulator 輸出中的 `PERMISSION_DENIED` 屬 `assertFails(...)` 預期拒絕案例。
- `npm test -- --watch=false --browsers=ChromeHeadless`：285 個測試通過、68 個既有測試略過，無失敗。
- `npm run build`：通過；production bundle 產出至 `dist/angular-eip`。

本輪依複審修正：`JourneyEventService` 新增可注入的 Firestore ops seam，正式環境仍使用 AngularFire 原生 `doc`、`collection`、`writeBatch`、`runTransaction`、`setDoc`、`updateDoc` 與 `deleteDoc`，測試則以 fake ops 直接覆蓋 public CRUD 的商業流程，補上 create event/audit、update optimistic lock/audit/cleanup queue、delete audit/cleanup queue，以及上傳失敗時回滾 planned storage paths 與移除 upload session 的單元測試。

中低優先建議同步收斂：事件日期在 service 邊界統一正規化為 UTC 日起點，避免非 UTC 午夜匯入資料在 dialog 編輯後以不明確時間保存；Storage Rules 的 `ownsJourneyUploadSession()` 與 `hasJourneyCleanupOwnership()` 在 helper 內部保留 `exists()` guard，避免缺失 session/queue 文件時直接讀取 `.data`；`JourneyTimelineService.loadNext()` 對同一 session 加上 `inFlightPromise` 序列化，避免 public API 被並發呼叫時重複 shift buffer；`journeyCreateChangedFields()` 補註須與 `changedJourneyEventFields()` 同步維護。

補充限制：`recoverJourneyEventAttachmentMetadata()` 仍保留歷史異常資料 cleanup 能力，這是前輪為避免部署前 corrupt metadata 造成 Storage 永久無法清理而加入的保守路徑；正式新寫入仍由 Rules schema 阻擋無效附件 metadata。若後續確認沒有部署前歷史資料，可另開議題移除 recovery 或改為一次性 migration。

## 2026-06-24 Claude Bot 第十五輪複審修正驗證結果

- `npx tsc -p tsconfig.app.json --noEmit`：通過。
- `git diff --check`：通過。
- `npm test -- --watch=false --browsers=ChromeHeadless --include='src/app/journey-timeline/**/*.spec.ts'`：51 個 journey timeline 測試通過；確認既有 journey timeline/service/component 行為無回歸。
- `npm run test:journey-rules`：通過；新增事件附件 `storagePath` 必須匹配正式事件 `targetUserId/eventId` 的 emulator 回歸，避免 Admin 先用 A 使用者建立 upload session、再將同一路徑掛到 B 使用者事件。沙盒內若遇 localhost port EPERM，需以外層權限重跑；emulator 輸出中的 `PERMISSION_DENIED` 屬 `assertFails(...)` 預期拒絕案例。
- `npm test -- --watch=false --browsers=ChromeHeadless`：285 個測試通過、68 個既有測試略過，無失敗。
- `npm run build`：通過；production bundle 產出至 `dist/angular-eip`。沙盒內曾因 process/cache 資源限制以 134 中止，已用外層權限重跑通過。

本輪依複審修正：Firestore Rules 的事件附件 schema 不再只驗證附件欄位存在與型別，而是要求 `storagePath` 必須落在 `journey-event-attachments/{targetUserId}/{eventId}/{sessionId}/{attachmentId}` 結構下，並以事件本身的 `targetUserId` 與文件 `eventId` 作為授權來源，阻斷跨使用者路徑挪用。Rules schema 同步補上 `hasAll()` required-field 檢查，避免缺欄位資料在拒絕時走到不必要的欄位存取。

中低優先建議同步收斂：`pairedJourneyAudit()` 改為先確認 `existsAfter(auditPath)` 再讀取 audit；audit create/update/delete effect 也拆為 helper，先檢查交易前後事件文件存在狀態後再讀 `getAfter()` / `get()`，降低缺少 paired 文件時的 rules evaluation 噪音。個人職場屬性報告頁的時間軸入口在 `currentUser()` 尚未初始化時改顯示載入卡片，避免 auth signal 初始 `undefined` 時直接隱藏時間軸。

補充限制：journey event Storage 物件仍維持「不可由 Admin 直接 emergency delete」的治理方向，必須透過 upload session 或 cleanup queue 關聯刪除，以保持與 attendance/subsidy 附件治理一致。若未來要處理真正 orphan / broken reference，仍由 T050 的 dry-run orphan audit 與治理流程另行收斂，避免在 Storage Rules 加入可繞過 Firestore 關聯的直通刪除權限。

## 2026-06-30 Issue #25 Claude Bot 複審修正驗證結果

- `npx tsc -p tsconfig.spec.json --noEmit`：通過。
- `git diff --check`：通過。
- `npm test -- --watch=false --include='src/app/journey-timeline/testing/report-embedding.spec.ts'`：2 個報告嵌入回歸測試通過，確認職場屬性報告入口仍實際渲染 `app-user-journey-timeline` selector。
- `npm run test:journey-integration`：通過；6 個 Angular + Firestore Emulator 測試成功，並透過 `karma.journey-integration.conf.cjs` 載入真實 `firestore.rules`。

本輪依 Claude Bot 複審修正：`teardownJourneyTimelineTestEnv()` 會先消化初始化 promise 的拒絕結果並清空 singleton 狀態，避免初始化失敗時 `afterAll` 再次丟出同一錯誤造成測試輸出混淆；VS Code `ng test` launch 改走 `npm: test:debug`，讓 `npm test` 保持 headless 預設、互動除錯則由 `npm run test:debug` 明確啟動 Chrome；`@firebase/rules-unit-testing` 需要的瀏覽器端 `process.env` 空 shim 補上註解，避免後續誤刪導致 browser bundle 內 `process is not defined`；`karma.conf.js` 除了合併額外 plugins，也同步合併 integration 設定提供的 `files`，確保 `firestore.rules` 會被 Karma served 給整合測試讀取。

補充限制：attachments、evaluation 與 journey timeline 的 Emulator setup 仍有可抽共用 factory 的重複樣板；此項牽涉跨 feature 測試基礎建設，保留為後續維護議題，避免本輪 Issue #25 整合測試補強擴大為測試架構重構。

## 2026-06-30 Issue #25 Claude Bot CI 門禁補強驗證結果

- `npx tsc -p tsconfig.spec.json --noEmit`：通過。
- `git diff --check`：通過。
- `npm test -- --watch=false --include='src/app/journey-timeline/testing/report-embedding.spec.ts'`：2 個報告嵌入回歸測試通過。
- `npm run test:journey-integration`：通過；6 個 Angular + Firestore Emulator 測試成功。

本輪依 Claude Bot 複審修正：新增 PR CI workflow，於 pull request 與 main push 自動執行 spec typecheck、headless Karma 測試與 journey timeline integration 測試，避免整合測試只停留在手動驗證；`karma.conf.js` 同步合併 `reporters` override，維持與 `plugins`、`files` 一致的陣列合併策略；report embedding spec 的 spy 物件改由每個 `beforeEach` 重新建立，消除 describe scope spy strategy 污染風險；`testTimestamp()` 補上固定 2026 年 1 月 fixture 的 JSDoc，明確標示此 helper 的使用範圍。

## 部署順序

1. 先部署 `firestore.rules`、`storage.rules` 與 `firestore.indexes.json`。
2. 等待 Firestore 複合索引狀態成為 Enabled。
3. 再部署 Angular Hosting bundle。
4. 依上方 smoke test 驗證兩個入口、權限、排序、附件與載入更多。
