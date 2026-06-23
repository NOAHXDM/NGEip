# 任務清單：使用者歷程時間軸

**輸入**：來自 `/specs/006-user-journey-timeline/` 的 `spec.md`、`plan.md`、`research.md`、`data-model.md`、`contracts/` 與 `quickstart.md`  
**範圍**：在兩個職場屬性報告入口顯示非餐費補助與新事件的合併時間軸；所有已登入者可讀事件／附件，只有 Admin 可建立、更新及刪除任意事件。

**測試要求**：排序、分頁、權限、Firebase 資料存取及附件補償 MUST 先建立失敗測試，再實作至通過。

## Phase 1：準備（共享基礎）

**目的**：建立 feature 結構、共用型別與測試骨架。

- [ ] T001 建立 `src/app/journey-timeline/components/`、`src/app/journey-timeline/dialogs/`、`src/app/journey-timeline/models/`、`src/app/journey-timeline/services/` 與 `src/app/journey-timeline/testing/` 目錄結構
- [x] T002 [P] 依 `specs/006-user-journey-timeline/contracts/angular-interfaces.md` 在 `src/app/journey-timeline/models/journey-timeline.models.ts` 定義 `UserJourneyEvent`、`JourneyTimelineItem`、分頁狀態與 dialog 資料型別
- [ ] T003 [P] 在 `src/app/journey-timeline/testing/journey-timeline-test-data.ts` 建立事件、補助、附件及跨頁交錯資料工廠
- [ ] T004 [P] 在 `src/app/journey-timeline/testing/emulator-setup.ts` 建立 Auth／Firestore／Storage Emulator 測試初始化與一般使用者、其他使用者、Admin 測試身份
- [ ] T005 盤點 `src/app/evaluation/pages/attribute-report/attribute-report.component.ts` 與 `src/app/evaluation/components/user-attribute-report-embed/user-attribute-report-embed.component.ts` 的 template 條件區塊，記錄時間軸必須位於考核空狀態之外的插入點於 `specs/006-user-journey-timeline/quickstart.md`

---

## Phase 2：基礎能力（阻塞性前置）

**目的**：完成所有故事共用的資料契約、Rules、索引及 service 骨架；本階段完成前不得進入故事實作。

### 測試（先寫並確認失敗）

- [ ] T006 [P] 在 `src/app/journey-timeline/testing/firestore-rules.spec.ts` 建立 authenticated 跨使用者讀取、以 `users/{request.auth.uid}.role` 判定 Admin、非 Admin create/update/delete 拒絕、Admin CRUD、欄位 allowlist／型別／非空白 title 1–100／content 1–5,000／attachments 0–5、actor UID、不可變欄位、每次改變且不可重用的 `lastAuditId`、不可變 `deleteAuditId`、event/audit 時間等於 `request.time`、平坦 audit immutable，以及孤立／偽造 audit create 拒絕的 Rules 邊界測試
- [ ] T007 [P] 在 `src/app/journey-timeline/testing/storage-rules.spec.ts` 建立所有 authenticated 可 get、未登入拒絕、禁止 list、Admin session create、非 Admin session create 拒絕、cleanup queue delete、3 MiB 邊界與 PDF/JPEG/PNG/WebP MIME allowlist 的 Rules 測試
- [ ] T008 [P] 在 `src/app/journey-timeline/services/journey-timeline.service.spec.ts` 建立 Timestamp 正規化、event/subsidy view model 轉換及 stable comparator 的失敗測試

### 實作

- [x] T009 在 `firestore.rules` 新增 `userJourneyEvents`、平坦 `userJourneyEventAudits`、`journeyEventAttachmentUploadSessions` 與 `journeyEventAttachmentCleanupQueue` 的完整 schema、actor、`users/{request.auth.uid}.role == "admin"`、Admin-only 寫入及 authenticated cross-user read 規則，並以 event `lastAuditId`／`deleteAuditId`、parent before/after 與 `getAfter()` 限制 audit 必須伴隨合法事件交易建立
- [x] T010 在 `storage.rules` 新增 `journey-event-attachments/{targetUserId}/{eventId}/{sessionId}/{attachmentId}` 的讀取、建立、刪除及禁止覆寫／列舉規則
- [x] T011 [P] 在 `firestore.indexes.json` 新增 `userJourneyEvents(targetUserId ASC, eventDate DESC, __name__ DESC)` 並確認或補上 `subsidyApplications(userId ASC, applicationDate DESC, __name__ DESC)` 複合索引
- [x] T012 [P] 在 `src/app/journey-timeline/services/journey-timeline.service.ts` 建立官方 Firebase SDK 注入、來源轉換、stable comparator、cursor/buffer 狀態與統一錯誤型別骨架
- [x] T013 [P] 在 `src/app/journey-timeline/services/journey-event.service.ts` 建立事件與平坦 audit collection references、Admin-only CRUD／附件協調方法簽章
- [ ] T014 執行 `src/app/journey-timeline/testing/firestore-rules.spec.ts` 與 `src/app/journey-timeline/testing/storage-rules.spec.ts`，修正 `firestore.rules`、`storage.rules` 直到 Phase 2 權限測試通過

**Checkpoint**：資料模型、索引、Rules 與兩個 service 的共同契約已就緒，三個使用者故事可開始實作。

---

## Phase 3：使用者故事 1－查看個人歷程 (Priority: P1) 🎯 MVP

**目標**：使用者與 Admin 可在指定的職場屬性報告入口，看見目標使用者的非餐費補助與事件，並由近到遠穩定排序。

**獨立驗證方式**：準備同一使用者不同日期的補助與事件，確認兩個報告入口皆顯示正確混合順序、排除餐費與他人資料；沒有考核快照時仍可看到時間軸。

### 測試（先寫並確認失敗）

- [ ] T015 [P] [US1] 在 `src/app/journey-timeline/services/journey-timeline.service.spec.ts` 建立 event/subsidy 混合排序、相同時間 event 優先、sourceId tie-break、他人資料隔離與不讀餐費集合的單元測試
- [ ] T016 [P] [US1] 在 `src/app/journey-timeline/components/user-journey-timeline.component.spec.ts` 建立 loading、content、empty、error/retry、補助狀態與附件摘要顯示的元件測試
- [ ] T017 [P] [US1] 在 `src/app/journey-timeline/testing/us1-integration.spec.ts` 建立目標使用者、非目標使用者與 Admin 皆可讀取事件，但時間軸查詢仍只合併指定 `targetUserId` 資料的 Angular＋Firestore 整合測試
- [ ] T018 [P] [US1] 在 `src/app/journey-timeline/testing/report-embedding.spec.ts` 建立「無考核快照仍顯示時間軸」、兩個嵌入點目標 UID 與個人唯讀／Admin permissions 正確的回歸測試

### 實作

- [x] T019 [US1] 在 `src/app/journey-timeline/services/journey-timeline.service.ts` 實作 `subsidyApplications` 與 `userJourneyEvents` 的首批有界 `getDocs()` 查詢、共同 view model 轉換及 20 筆 stable merge
- [x] T020 [P] [US1] 建立 `src/app/journey-timeline/components/user-journey-timeline.component.ts` 的 standalone 元件、`userId`／`eventPermissions` inputs 與載入／重試狀態
- [x] T021 [P] [US1] 在 `src/app/journey-timeline/components/user-journey-timeline.component.html` 實作時間軸 header、日期、來源 icon、補助狀態／金額／內容、附件摘要及 loading／empty／error 狀態
- [x] T022 [P] [US1] 在 `src/app/journey-timeline/components/user-journey-timeline.component.scss` 實作桌面／行動版時間軸線、項目卡片、長文字換行、狀態 chip 與鍵盤焦點樣式
- [x] T023 [US1] 在 `src/app/evaluation/pages/attribute-report/attribute-report.component.ts` 將時間軸嵌入個人報告內容後方，傳入目前登入 UID 與唯讀權限 `{canCreate:false, canUpdate:false, canDelete:false}`
- [x] T024 [US1] 在 `src/app/evaluation/components/user-attribute-report-embed/user-attribute-report-embed.component.ts` 將時間軸嵌入 Admin 使用者編輯 Tab 的報告內容後方，傳入既有 `userId` 與完整 Admin permissions
- [x] T025 [US1] 調整 `src/app/evaluation/pages/attribute-report/attribute-report.component.ts` 與 `src/app/evaluation/components/user-attribute-report-embed/user-attribute-report-embed.component.ts` 的空狀態條件，確保無考核快照時時間軸仍獨立載入
- [ ] T026 [US1] 執行 `src/app/journey-timeline/services/journey-timeline.service.spec.ts`、`src/app/journey-timeline/components/user-journey-timeline.component.spec.ts`、`src/app/journey-timeline/testing/us1-integration.spec.ts` 與 evaluation 回歸測試，確認 US1 可獨立展示

**Checkpoint**：US1 已可作為唯讀 MVP 交付；事件可由測試資料或管理工具寫入，時間軸在兩個入口皆正常呈現。

---

## Phase 4：使用者故事 2－建立與維護事件 (Priority: P1)

**目標**：Admin 可建立、更新及刪除事件；目標使用者與非目標使用者僅可讀；所有異動寫入平坦、不可變 audit。

**獨立驗證方式**：Admin 建立、更新並刪除事件；目標使用者與非目標使用者讀取成功但寫入遭拒，並確認每次異動皆有 flat audit。

### 測試（先寫並確認失敗）

- [ ] T027 [P] [US2] 在 `src/app/journey-timeline/services/journey-event.service.spec.ts` 建立 Admin create/update/delete、非 Admin write deny、transaction 衝突、targetUserId／deleteAuditId 不可轉移、create/update `lastAuditId`、flat delete audit 使用預建 `deleteAuditId` 與錯誤映射測試
- [ ] T028 [P] [US2] 在 `src/app/journey-timeline/dialogs/journey-event-dialog.component.spec.ts` 建立 eventDate/title/content 必填、trim、100／5,000 字邊界、取消零寫入及 submitting 防重送測試
- [ ] T029 [P] [US2] 在 `src/app/journey-timeline/components/user-journey-timeline.component.spec.ts` 建立 Admin 全 controls、一般使用者 read-only、刪除二次確認與 CRUD 後重新整理排序測試
- [ ] T030 [P] [US2] 在 `src/app/journey-timeline/testing/us2-integration.spec.ts` 建立 Admin create/update/delete、非 Admin write deny 與三種動作平坦 audit 的整合測試

### 實作

- [x] T031 [P] [US2] 建立 `src/app/journey-timeline/dialogs/journey-event-dialog.component.ts` 的 reactive form、建立／編輯模式、字數驗證、submitting 狀態與繁體中文錯誤處理
- [x] T032 [P] [US2] 建立 `src/app/journey-timeline/dialogs/journey-event-dialog.component.html` 與 `src/app/journey-timeline/dialogs/journey-event-dialog.component.scss` 的日期、標題、內容欄位及 responsive dialog 版面
- [x] T033 [US2] 在 `src/app/journey-timeline/services/journey-event.service.ts` 實作 Admin create batch、Admin 最新 snapshot update transaction、create/update `lastAuditId`、預建不可變 `deleteAuditId`、同 ID `userJourneyEventAudits` 寫入、actor 欄位與 immutable targetUserId 驗證
- [x] T034 [US2] 在 `src/app/journey-timeline/services/journey-event.service.ts` 實作 Admin-only delete transaction，以事件既有 `deleteAuditId` 同步建立平坦 delete audit 後刪除 parent event，不建立 audit 子集合
- [x] T035 [US2] 在 `src/app/journey-timeline/components/user-journey-timeline.component.ts` 與 `.html` 依 `eventPermissions` 串接 Admin 新增／編輯／刪除 dialog，成功後重抓首批資料；一般使用者不顯示事件寫入 controls
- [x] T036 [US2] 在 `src/app/journey-timeline/dialogs/journey-event-dialog.component.ts`、`src/app/journey-timeline/components/user-journey-timeline.component.ts` 與對應 HTML 補齊權限改變、transaction 衝突、資料不存在及重試的繁體中文訊息
- [ ] T037 [US2] 執行 event service、dialog、timeline component、US2 integration 與 Firestore Rules 測試，確認 US2 可獨立展示且 US1 不回歸

**Checkpoint**：Admin 可完整管理無附件事件，目標使用者與非目標使用者只能讀取，所有異動均可由平坦 audit 稽核。

---

## Phase 5：使用者故事 3－查看附件與載入更多歷程 (Priority: P2)

**目標**：事件可管理並預覽合法附件；大量混合歷程能逐批載入且不重複、不遺漏。

**獨立驗證方式**：建立超過 20 筆跨來源交錯資料及含圖片/PDF 的事件，驗證游標、buffer、預覽、替換、刪除與失敗補償。

### 測試（先寫並確認失敗）

- [ ] T038 [P] [US3] 在 `src/app/journey-timeline/services/journey-timeline.service.spec.ts` 建立雙來源 cursor/buffer、跨頁同時間資料、來源先耗盡、重試、end-of-list 與無重複遺漏測試
- [ ] T039 [P] [US3] 在 `src/app/journey-timeline/services/journey-event.service.spec.ts` 建立五檔／3 MiB／格式驗證、Admin upload session、非 Admin upload session 拒絕、部分上傳補償、update attachment conflict、cleanup queue 與 object-not-found 冪等測試
- [ ] T040 [P] [US3] 在 `src/app/journey-timeline/dialogs/journey-event-dialog.component.spec.ts` 建立附件新增、移除、替換、最終五檔、取消零遠端寫入與預覽 dialog 串接測試
- [ ] T041 [P] [US3] 在 `src/app/journey-timeline/testing/us3-integration.spec.ts` 建立 authenticated cross-user attachment read、Admin session→event、event→cleanup queue、Admin 刪除整筆事件附件治理及跨頁混合查詢整合測試

### 實作

- [x] T042 [US3] 在 `src/app/journey-timeline/services/journey-timeline.service.ts` 實作各來源獨立 cursor、保留未輸出 buffer、「載入更早歷程」與 retry 不重置既有成功資料的流程
- [ ] T043 [US3] 擴充 `src/app/services/attachment.service.ts` 與 `src/app/attachments/attachment.models.ts` 的 domain adapter 以支援 `journey-event`，完整共用 attendance/subsidy 的五檔、3 MiB、格式、magic bytes、預覽、session、補償、cleanup 與孤兒治理規章，並保持既有兩種 request 行為相容
- [x] T044 [US3] 在 `src/app/journey-timeline/services/journey-event.service.ts` 僅使用 `journeyEventAttachmentUploadSessions` 實作 Admin 上傳、event transaction reference transfer、失敗補償與 `journeyEventAttachmentCleanupQueue` 清理流程
- [x] T045 [US3] 在 `src/app/journey-timeline/dialogs/journey-event-dialog.component.ts` 與 `.html` 整合 `AttachmentListComponent`，支援事件附件選取、驗證、預覽、移除與替換
- [x] T046 [US3] 在 `src/app/journey-timeline/components/user-journey-timeline.component.ts` 與 `.html` 整合 `AttachmentPreviewDialogComponent`，並加入「載入更早歷程」、partial loading、重試與 end-of-list 狀態
- [ ] T047 [US3] 在 `src/app/services/attachment.service.spec.ts` 補上 journey-event 回歸案例，確認 request attachment 路徑、session 與 cleanup 流程未被破壞
- [ ] T048 [US3] 執行 US3 單元／整合／Storage Rules 測試，並依 `specs/006-user-journey-timeline/quickstart.md` 驗證圖片、PDF、跨頁與失敗補償

**Checkpoint**：三個使用者故事均可獨立運作；大量歷程與附件全生命週期皆符合規格。

---

## Phase 6：潤飾與跨故事交付

**目的**：完成可及性、效能、文件與整體回歸驗證。

- [ ] T049 [P] 在 `src/app/journey-timeline/components/user-journey-timeline.component.spec.ts` 與 `src/app/journey-timeline/dialogs/journey-event-dialog.component.spec.ts` 補上鍵盤操作、焦點返回、ARIA label 及窄螢幕回歸測試
- [ ] T050 [P] 建立 `tools/journey-event-attachment-orphan-audit.js` 與 `tools/journey-event-attachment-orphan-audit.test.js`，實作事件附件 dry-run 稽核並驗證 event/session/cleanup 三類合法 reference 與真正孤兒判定
- [ ] T051 [P] 更新 `README.md` 與 `CHANGELOG.md`，以繁體中文記錄時間軸入口、authenticated read／Admin-only CRUD 權限、附件限制、索引部署及稽核指令
- [ ] T052 在 `specs/006-user-journey-timeline/quickstart.md` 記錄實際測試指令、Emulator project、production index/rules 部署順序與 smoke test 結果
- [ ] T053 以 100 筆混合資料執行至少 20 次冷啟動，驗證第 95 百分位首批呈現不超過 3 秒、只有兩個有界查詢、每來源每批最多 20 documents、無常駐 listener、無餐費查詢，並將量測結果記錄於 `specs/006-user-journey-timeline/quickstart.md`
- [ ] T054 執行 `npm test -- --watch=false --browsers=ChromeHeadless`、`node --test tools/journey-event-attachment-orphan-audit.test.js`、Firestore／Storage Emulator 測試與 `npm run build`，將任何環境限制及最終結果記錄於 `specs/006-user-journey-timeline/quickstart.md`
- [ ] T055 由未熟悉功能的測試者量測含附件事件建立流程並確認不超過 2 分鐘，再依 `specs/006-user-journey-timeline/spec.md` 逐項核對 FR-001～FR-015 與 SC-001～SC-005，確認 Rules、索引、測試與繁體中文文件同步後才進入合併審查

---

## 相依性與執行順序

### Phase 相依性

- Phase 1 無相依，可立即開始。
- Phase 2 依賴 Phase 1，且阻塞所有使用者故事。
- US1、US2 理論上可在 Phase 2 後分工，但 US2 的 component 整合 T035 依賴 US1 的 T020～T022。
- US3 依賴 US1 的分頁 service 骨架與 US2 的事件 CRUD；附件 service 測試 T039、T040 可先平行撰寫。
- Phase 6 依賴欲交付的所有使用者故事完成。

### 故事完成順序

1. **US1（P1，MVP）**：先交付唯讀混合時間軸，驗證資訊架構、資料隔離與排序。
2. **US2（P1）**：加入 Admin CRUD 與平坦稽核，仍可不含附件獨立驗證。
3. **US3（P2）**：加入附件治理、預覽與完整雙來源游標分頁。

### 故事內部順序

- 每個故事先完成並執行失敗測試，再依「service → component/dialog → integration」實作。
- Rules 與索引在任何依賴它們的 UI 完成前即需通過 Emulator 測試。
- 同時修改相同檔案的任務不得平行，例如 T023/T025、T033/T034、T042/T019。

### 可平行工作範例

- Phase 1：T002、T003、T004 可由不同開發者平行處理。
- Phase 2：T006、T007、T008 可平行撰寫測試；T011、T012、T013 可在契約確認後平行。
- US1：T015～T018 可平行撰寫；T020～T022 分屬 TS/HTML/SCSS，但合併前須協調元件 API。
- US2：T027～T030 可平行撰寫；T031/T032 可與 T033/T034 分工。
- US3：T038～T041 可平行撰寫；T045 可在 T044 API 固定後進行。

## 實作策略

### MVP 優先

1. 完成 Phase 1、Phase 2。
2. 完成 US1，先驗證兩入口、排序、空狀態與權限隔離。
3. 在沒有事件管理 UI 的情況下，以 Emulator fixture 展示新事件與補助混合時間軸。
4. US1 通過後再加入 Admin 寫入能力，縮小一次交付的風險面。

### 漸進式交付

1. US1：唯讀時間軸。
2. US2：無附件事件 CRUD 與稽核。
3. US3：附件、完整分頁與治理。
4. 每完成一個故事，重新執行前述故事的單元、整合與 Rules 回歸測試。

## 憲章檢查

- **Firebase-only**：所有資料、附件、驗證與 Hosting 均使用 Firebase 官方服務。
- **Authentication／Rules**：Firebase UID 是唯一身份來源，Admin 僅以目前登入者的 `users/{request.auth.uid}.role == "admin"` 判定；新集合及 Storage 路徑皆有 Rules 與 Emulator 測試。
- **資料與成本**：平坦事件集合、兩個有界游標查詢、每批 20 筆、不使用 offset 或常駐監聽。
- **測試**：每個故事均包含 business logic 單元測試與 Angular＋Firebase 整合測試。
- **文件**：spec、plan、tasks、quickstart 與使用者文件皆以繁體中文維護。
