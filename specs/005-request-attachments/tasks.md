# 任務清單：申請附件管理

**輸入**：來自 `/specs/005-request-attachments/` 的設計文件
**前置條件**：plan.md、spec.md、research.md、data-model.md、contracts/、quickstart.md

**測試要求**：本功能涉及檔案驗證、權限、跨 Firestore／Storage 工作流與補償邏輯；所有故事 MUST 先建立失敗測試，再完成實作，並同時具備單元／元件測試與 Emulator 整合／Rules 測試。

**組織原則**：任務依四個使用者故事分組；每個故事完成後皆可獨立展示與驗證。

## 格式：`[ID] [P?] [Story] 說明`

- **[P]**：可平行執行（不同檔案、無相依）
- **[Story]**：使用者故事 US1～US4
- 每項任務均包含精確檔案路徑

## Phase 1：準備（共享基礎）

**目的**：建立附件功能目錄、測試位置與既有流程基線。

- [X] T001 建立共用附件元件與測試目錄骨架於 `src/app/attachments/`、`src/app/attachments/testing/` 及 `src/app/utils/`
- [X] T002 [P] 記錄 attendance、subsidy、audit trail 與既有 Storage API 的回歸基線於 `specs/005-request-attachments/quickstart.md`
- [X] T003 [P] 建立附件測試檔案工廠與 PDF/JPEG/PNG/WebP magic-byte fixtures 於 `src/app/attachments/testing/attachment-test-files.ts`

---

## Phase 2：基礎能力（阻塞性前置）

**目的**：完成所有故事共同依賴的型別、驗證、Storage primitive、Rules 與測試支援。

**⚠️ CRITICAL**：本階段完成前不得開始使用者故事實作。

- [X] T004 定義 `RequestKind`、`AttachmentMetadata`、`PlannedAttachmentMetadata`、`PendingAttachment`、`AttachmentChanges` 與錯誤 union 於 `src/app/attachments/attachment.models.ts`
- [X] T005 [P] 先撰寫副檔名、MIME、magic bytes、空檔、3 MiB 邊界與最終五檔規則的失敗測試於 `src/app/utils/attachment-validation.spec.ts`
- [X] T006 [P] 先撰寫 attachment path、create-only upload、3 MiB getBlob 上限與 object-not-found 冪等刪除測試於 `src/app/services/storage.service.spec.ts`
- [X] T007 [P] 建立 owner、other-user、admin 與 unauthenticated 測試帳號／文件 fixture 於 `src/app/attachments/testing/emulator-setup.ts`
- [X] T008 實作四種格式 magic-byte 驗證、數量計算與繁體中文錯誤映射於 `src/app/utils/attachment-validation.ts`
- [X] T009 擴充附件 path、create-only upload、authenticated Blob 讀取與冪等刪除 primitive 於 `src/app/services/storage.service.ts`
- [X] T010 [P] 先建立 parent request、upload session、cleanup queue 與 audit trail 的 Firestore Rules 契約測試於 `src/app/attachments/testing/firestore-rules.spec.ts`
- [X] T011 [P] 先建立 signed-in get、list deny、session create、MIME/size、overwrite deny 與 queue delete 的 Storage Rules 契約測試於 `src/app/attachments/testing/storage-rules.spec.ts`
- [X] T012 實作 attachment 欄位的 owner-pending/admin 邊界、治理集合與 audit 不可竄改規則於 `firestore.rules`，並維持 attendance 既有非附件業務權限但全面要求 authenticated
- [X] T013 實作 `request-attachments/{kind}/{requestId}/{sessionId}/{attachmentId}` 邊界且保留 avatars 規則於 `storage.rules`，並依 `specs/005-request-attachments/contracts/storage-cors-contract.md` 新增 `storage.cors.json`
- [X] T014 建立 AttachmentService 的 SDK seam、錯誤分類與共用 session/queue reference helpers 於 `src/app/services/attachment.service.ts`

**Checkpoint**：驗證 utility、Storage primitive 與兩套 Rules 測試通過後，四個使用者故事可開始開發。

---

## Phase 3：使用者故事 1 - 在申請中加入附件 (Priority: P1) 🎯 MVP

**目標**：attendance 與 subsidy 可選填零至五個合法附件；整批成功才建立申請，取消或失敗不留下部分申請。

**獨立驗證方式**：分別建立含四種格式及不含附件的 attendance/subsidy；模擬中途上傳與 Firestore commit 失敗，確認申請與正式附件皆不會部分成功。

### 測試

- [X] T015 [P] [US1] 先撰寫 upload session、批次上傳、commit、補償成功與 cleanup-pending fallback 的 AttachmentService 測試於 `src/app/services/attachment.service.spec.ts`
- [X] T016 [P] [US1] 先撰寫 attendance 無附件、合法多檔、驗證失敗、取消零遠端寫入與儲存中狀態測試於 `src/app/attendance/attendance.component.spec.ts`
- [X] T017 [P] [US1] 先撰寫 subsidy 無附件、合法五檔、驗證失敗、取消零遠端寫入與儲存中狀態測試於 `src/app/subsidy/subsidy-application/subsidy-application.component.spec.ts`
- [X] T018 [US1] 先撰寫兩種申請從 session 到正式 attachments/audit 的 Emulator 整合測試於 `src/app/attachments/testing/create-request-integration.spec.ts`

### 實作

- [X] T019 [US1] 實作建立 session、讀回 server createdAt、批次 upload、正式 commit 與失敗補償流程於 `src/app/services/attachment.service.ts`
- [X] T020 [P] [US1] 將 AttendanceService.create 改為預產 request ID、原子建立申請與「新增附件」audit 於 `src/app/services/attendance.service.ts`
- [X] T021 [P] [US1] 將 SubsidyService.create 改為預產 request ID、原子建立申請與「新增附件」audit 於 `src/app/services/subsidy.service.ts`
- [X] T022 [US1] 實作共用選檔清單、數量顯示、待上傳移除與錯誤呈現於 `src/app/attachments/attachment-list.component.ts`、`src/app/attachments/attachment-list.component.html` 及 `src/app/attachments/attachment-list.component.scss`
- [X] T023 [P] [US1] 將附件清單與全有或全無儲存狀態整合至 `src/app/attendance/attendance.component.ts` 及 `src/app/attendance/attendance.component.html`
- [X] T024 [P] [US1] 將附件清單與全有或全無儲存狀態整合至 `src/app/subsidy/subsidy-application/subsidy-application.component.ts` 及 `src/app/subsidy/subsidy-application/subsidy-application.component.html`
- [X] T025 [US1] 執行並修正 US1 單元與整合測試，將驗證結果補入 `specs/005-request-attachments/quickstart.md`

**Checkpoint**：US1 可獨立展示新增申請、選填附件、整批失敗復原與零附件回歸。

---

## Phase 4：使用者故事 2 - 預覽申請附件 (Priority: P1)

**目標**：所有登入者能在新增／編輯表單及兩種審核 dialog 內預覽圖片與 PDF，未登入者無法取得內容。

**獨立驗證方式**：使用不同登入帳號預覽他人申請中的圖片/PDF；登出後重試應失敗，且切換或關閉預覽會釋放 Object URL。

### 測試

- [X] T026 [P] [US2] 先撰寫正式附件 getBlob、載入錯誤、最大下載量與本機 pending File 預覽測試於 `src/app/services/attachment.service.spec.ts`
- [X] T027 [P] [US2] 先撰寫圖片/PDF 呈現、重試、fallback、切換與 destroy revokeObjectURL 測試於 `src/app/attachments/attachment-preview-dialog.component.spec.ts`
- [X] T028 [P] [US2] 先撰寫 attendance 審核 dialog 唯讀附件顯示與預覽入口測試於 `src/app/attendance/attendance-status-change/attendance-status-change.component.spec.ts`
- [X] T029 [P] [US2] 先撰寫 subsidy 審核 dialog 唯讀附件顯示與預覽入口測試於 `src/app/subsidy/subsidy-status-change/subsidy-status-change.component.spec.ts`

### 實作

- [X] T030 [US2] 實作 AttachmentService 正式 Blob 與 pending File 預覽來源、固定錯誤分類於 `src/app/services/attachment.service.ts`
- [X] T031 [US2] 實作圖片/PDF 預覽、載入/重試/fallback 與 Object URL 清理於 `src/app/attachments/attachment-preview-dialog.component.ts`、`src/app/attachments/attachment-preview-dialog.component.html` 及 `src/app/attachments/attachment-preview-dialog.component.scss`
- [X] T032 [US2] 將唯讀 attachment-list 與 preview dialog 整合至 `src/app/attendance/attendance-status-change/`、`src/app/subsidy/subsidy-status-change/` 及兩個新增／編輯表單，且不新增 attendance/subsidy 列表的獨立附件入口
- [X] T033 [US2] 執行並修正 US2 元件與 authenticated/unauthenticated Storage 測試，將瀏覽器 fallback 結果補入 `specs/005-request-attachments/quickstart.md`

**Checkpoint**：US2 可不依賴附件編輯功能，獨立展示登入者跨申請預覽與未登入拒絕。

---

## Phase 5：使用者故事 3 - 編輯附件且保留原狀安全網 (Priority: P1)

**目標**：owner 只能管理自己的 pending 附件，admin 可管理任意狀態；新增後刪舊、暫時第六檔、並行衝突與失敗復原皆符合規格。

**獨立驗證方式**：以 owner、他人與 admin 對 pending/approved/rejected 申請操作，並模擬新檔失敗、transaction 衝突與刪除失敗，確認原附件或治理 reference 正確保留。

### 測試

- [X] T034 [P] [US3] 先撰寫最終集合計算、五換五、transaction 重讀、衝突、queue 轉移與刪除重試測試於 `src/app/services/attachment.service.spec.ts`
- [X] T035 [P] [US3] 先撰寫 attendance owner-pending、他人唯讀、非 pending owner 唯讀與 admin 管理 UI 測試於 `src/app/attendance/attendance.component.spec.ts`
- [X] T036 [P] [US3] 先撰寫 subsidy owner-pending、他人唯讀、非 pending owner 唯讀與 admin 管理 UI 測試於 `src/app/subsidy/subsidy-application/subsidy-application.component.spec.ts`
- [X] T037 [P] [US3] 擴充 owner/other/admin、狀態、五檔上限與 queue 權限矩陣，並驗證 attendance 非附件既有操作不回歸於 `src/app/attachments/testing/firestore-rules.spec.ts` 及 `src/app/attachments/testing/storage-rules.spec.ts`
- [X] T038 [US3] 先撰寫新檔失敗保留舊檔、transaction 失敗不刪舊檔、刪檔失敗保留 queue 與並行編輯拒絕的 Emulator 測試於 `src/app/attachments/testing/update-request-integration.spec.ts`

### 實作

- [X] T039 [US3] 實作 latest-snapshot transaction、attachment ID 合併、最終五檔驗證、session 轉正式與 parent 轉 queue 於 `src/app/services/attachment.service.ts`
- [X] T040 [US3] 實作 queue 後置刪除、object-not-found 成功、失敗 attempt 記錄與安全重試於 `src/app/services/attachment.service.ts`
- [X] T041 [P] [US3] 將 AttendanceService.update 改為附件 transaction、updatedAt 與新增/刪除 audit 同步提交於 `src/app/services/attendance.service.ts`
- [X] T042 [P] [US3] 將 SubsidyService.update 改為附件 transaction、updatedAt 與新增/刪除 audit 同步提交於 `src/app/services/subsidy.service.ts`
- [X] T043 [P] [US3] 實作 attendance 的 canManage 判斷、標記刪除、暫時第六檔、衝突重載與儲存鎖定於 `src/app/attendance/attendance.component.ts` 及 `src/app/attendance/attendance.component.html`
- [X] T044 [P] [US3] 實作 subsidy 既有表單內的 canManage 判斷、標記刪除、暫時第六檔、衝突重載與儲存鎖定於 `src/app/subsidy/subsidy-application/subsidy-application.component.ts` 及 `src/app/subsidy/subsidy-application/subsidy-application.component.html`，不新增 subsidy-list 任意狀態編輯入口
- [X] T045 [US3] 執行並修正 US3 權限、並行與補償測試，將 owner/admin 三狀態矩陣結果補入 `specs/005-request-attachments/quickstart.md`

**Checkpoint**：US3 可獨立展示安全替換、admin 代辦、狀態權限與所有失敗分支。

---

## Phase 6：使用者故事 4 - 附件異動可追溯且不殘留 (Priority: P2)

**目標**：新增／刪除附件完整記錄實際操作者；工具可辨識正式、session、queue、真正孤兒及破損 reference，且預設不刪資料。

**獨立驗證方式**：完成新增、刪除與 admin 代辦後檢查歷程；建立各種稽核 fixture 執行 dry-run，確認分類正確且真正孤兒為零。

### 測試

- [X] T046 [P] [US4] 先撰寫 audit content 不含 URL/path、記錄原始檔名/大小/actor/time 與新增/刪除分批行為測試於 `src/app/services/attachment.service.spec.ts`
- [X] T047 [P] [US4] 先撰寫兩種歷程 UI 對「新增附件」「刪除附件」結構化內容的顯示測試於 `src/app/attendance/attendance-history/attendance-history.component.spec.ts` 及 `src/app/subsidy/subsidy-history/subsidy-history.component.spec.ts`
- [X] T048 [P] [US4] 建立正式/session/queue/orphan/broken-reference fixture 與 dry-run 分類測試於 `tools/request-attachment-orphan-audit.test.js`

### 實作

- [X] T049 [US4] 完成不含 storagePath/download URL 的附件 audit payload builder 與 actor UID 強制規則於 `src/app/services/attachment.service.ts`
- [X] T050 [P] [US4] 將附件 audit 轉為可讀繁體中文內容並相容既有 action 值於 `src/app/attendance/attendance-history/attendance-history.component.ts`、`src/app/attendance/attendance-history/attendance-history.component.html`、`src/app/subsidy/subsidy-history/subsidy-history.component.ts` 及 `src/app/subsidy/subsidy-history/subsidy-history.component.html`
- [X] T051 [US4] 實作預設 dry-run 的三方 reference 比對、stale session、pending cleanup、真正 orphan 與 broken reference 報告於 `tools/request-attachment-orphan-audit.js`
- [X] T052 [US4] 實作顯式 `--delete-orphans`、`--process-cleanup`、逐筆結果與可重跑保護於 `tools/request-attachment-orphan-audit.js`
- [X] T053 [US4] 新增可重現的 audit 測試命令與 Admin SDK 工具說明於 `package.json` 及 `specs/005-request-attachments/quickstart.md`
- [X] T054 [US4] 執行並修正 US4 audit/history/tool 測試，將 dry-run 基線與真正孤兒數記錄於 `specs/005-request-attachments/quickstart.md`

**Checkpoint**：四個故事皆可獨立運作，任一保留檔案均可追溯至 parent、session 或 queue。

---

## Phase 7：潤飾與跨故事交付

**目的**：完成整體回歸、可用性、成本、安全與文件驗證。

- [X] T055 [P] 執行完整 Firestore/Storage Rules 測試並確認 avatars 規則無回歸，修正結果於 `firestore.rules`、`storage.rules` 及 `src/app/attachments/testing/`
- [X] T056 [P] 驗證鍵盤操作、focus、螢幕閱讀器標籤、長檔名截斷與行動版 dialog 版面於 `src/app/attachments/attachment-list.component.html`、`src/app/attachments/attachment-preview-dialog.component.html` 及其 SCSS
- [X] T057 依 `specs/005-request-attachments/contracts/storage-cors-contract.md` 套用 `storage.cors.json` 至 production bucket，從 Hosting origin 驗證 getBlob/CORS，並記錄列表零額外 query、3 MiB 上限、private cache 與治理寫入成本於 `specs/005-request-attachments/quickstart.md`
- [X] T058 [P] 更新功能交付摘要、權限與附件限制於 `CHANGELOG.md` 及必要的 `README.md`
- [X] T059 依 `specs/005-request-attachments/quickstart.md` 完成 attendance/subsidy、owner/admin、四種格式、五檔替換與失敗案例手動 smoke test，確認未新增列表附件入口或 subsidy-list 任意狀態編輯入口
- [X] T060 執行 `npm test -- --watch=false`、`npm run build` 與 orphan audit dry-run，將最終結果及任何已知限制補入 `specs/005-request-attachments/quickstart.md`

---

## 相依性與執行順序

### Phase 相依性

- **Phase 1**：無相依，可立即開始。
- **Phase 2**：依賴 Phase 1；阻塞所有使用者故事。
- **US1**：依賴 Phase 2，是附件提交 MVP。
- **US2**：依賴 Phase 2 與正式 metadata/Storage primitive；可與 US1 後半平行，但整合測試需 US1 能建立正式附件。
- **US3**：依賴 US1 的 session/commit 與 US2 的附件清單/預覽基礎。
- **US4**：audit payload 可與 US3 平行；完整 orphan 分類依賴 US1 session 與 US3 cleanup queue。
- **Phase 7**：依賴所有欲交付故事完成。

### 使用者故事相依圖

```text
Foundation
   └─ US1 提交附件（MVP）
       ├─ US2 預覽附件
       └─ US3 編輯／替換
            └─ US4 稽核／清理
```

### 每個故事內部順序

1. 先寫單元／元件／Rules／整合測試並確認會失敗。
2. 型別與 service contract 先於 domain service 與 UI 整合。
3. Firestore reference transaction 成功前不得刪除舊實體檔。
4. Story checkpoint 測試通過後才進入下一故事。

## 可平行執行範例

### US1

```text
平行：T015 AttachmentService 測試、T016 attendance 測試、T017 subsidy 測試
之後平行：T020 attendance service、T021 subsidy service
最後平行：T023 attendance UI、T024 subsidy UI
```

### US2

```text
平行：T026 service 測試、T027 preview 測試、T028/T029 兩個 status dialog 測試
T030 完成後實作 T031，再進行 T032 整合
```

### US3

```text
平行：T034 service、T035 attendance、T036 subsidy、T037 Rules 測試
T039/T040 完成後平行：T041/T043 attendance 與 T042/T044 subsidy
```

### US4

```text
平行：T046 audit payload、T047 history UI、T048 audit tool 測試
T049 與 T050 可平行；T051 後接 T052
```

## 實作策略

### MVP 優先

1. 完成 Phase 1、Phase 2。
2. 完成 US1，先交付可選填、多檔、全有或全無的申請附件提交。
3. 在擴充預覽與編輯前，確認取消、上傳失敗與 commit 失敗不產生部分結果。

### 漸進式交付

1. US1：建立正式附件與治理 session。
2. US2：加入 authenticated Blob 預覽，不改變提交語意。
3. US3：加入 owner/admin 編輯、替換與 cleanup queue。
4. US4：完成歷程與 audit 工具，封閉生命週期。
5. 每階段重跑既有 attendance 特休、subsidy 核准/分期與 avatar Storage 回歸。

## 任務完整性摘要

- **總任務數**：60
- **US1**：11 項（T015–T025）
- **US2**：8 項（T026–T033）
- **US3**：12 項（T034–T045）
- **US4**：9 項（T046–T054）
- **準備／基礎／潤飾**：20 項
- 所有任務均含 checkbox、連續 ID、適用的 `[P]`／`[USn]` 標籤與精確路徑。
