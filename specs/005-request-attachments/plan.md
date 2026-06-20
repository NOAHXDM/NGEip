# 實作計畫：申請附件管理

**分支**：`005-request-attachments` | **日期**：2026-06-19 | **規格**：[spec.md](./spec.md)
**輸入**：來自 `/specs/005-request-attachments/spec.md` 的功能規格

**注意**：所有內容 MUST 以繁體中文（zh-TW）撰寫，且技術實作與決策必須記錄於本檔，不得回寫到 spec.md。

## 摘要

為既有 attendance 與 subsidy 新增共用附件能力，讓使用者可在新增／編輯申請時管理最多五個 PDF、JPEG、PNG 或 WebP（每檔 ≤ 3 MiB），並於表單及審核狀態變更 dialog 內安全預覽。附件 metadata 嵌入原申請文件，實體檔由 Firebase Storage 保存；新增、刪除與替換採補償式工作流，配合短生命週期的上傳工作階段與清理佇列，確保任何實體檔在全生命週期中均有資料關聯。所有登入者可讀，只有申請人本人在 pending 狀態或 admin 可管理；完整異動寫入既有 audit trail。

## 技術背景

**語言／版本**：Angular 20、TypeScript 5.8、Firebase JavaScript SDK 11.10
**主要依賴**：Angular standalone components、Angular Material、AngularFire 20.0.1、RxJS 7.8、瀏覽器 File／Blob／Object URL API；不新增第三方套件；production bucket 需套用 CORS allowlist
**資料儲存**：Cloud Firestore（原申請內嵌 attachment metadata、上傳工作階段、清理佇列、既有 auditTrail）＋ Firebase Storage（附件實體）
**測試策略**：Karma/Jasmine 單元與元件測試；Firebase Auth／Firestore／Storage Emulator 整合測試與 Rules 測試；孤兒稽核工具 dry-run 測試
**目標平台**：Firebase Hosting 上的 Angular SPA，桌面與行動瀏覽器
**專案型態**：單一 Angular 前端應用程式，無 Cloud Functions 或自建後端
**效能目標**：附件選取驗證在 100ms 內完成（檔頭讀取除外）；預覽 95% 在一般網路三秒內開始呈現；附件清單不新增額外常駐監聽；單次預覽最多下載 3 MiB
**限制條件**：只使用 Firebase 官方服務；所有讀寫受 Rules 保護；Firestore 與 Storage 無跨服務原子交易；每筆最終最多五檔、每檔 ≤ 3 MiB；所有登入者可讀；不保存永久 download URL；magic bytes 僅由官方 client 驗證
**規模／範圍**：兩個申請集合、四個 dialog、兩套既有 audit trail、一個共用附件元件、一個共用附件協調服務、兩個短生命週期治理集合與一支稽核工具

## 憲章檢查

*Gate：Phase 0 研究前與 Phase 1 設計後皆已通過。*

- [x] 僅使用 Firebase Authentication、Cloud Firestore、Firebase Storage、Firebase Hosting；無新增 Cloudinary、Realtime Database 或其他後端。
- [x] 所有驗證流程均以 Firebase Authentication 為唯一來源，且角色由 `users/{uid}` 判定。
- [x] Firestore 資料模型已說明集合、文件鍵、查詢路徑、索引與成本影響，並將最多五筆 metadata 內嵌於原申請以避免額外列表讀取。
- [x] 已定義 Firestore／Storage Rules 契約、模擬器驗證方式與 owner／admin／signed-in 授權邊界。
- [x] 前端 Firebase 互動只用官方 SDK；檔案驗證與預覽使用原生 Web API，不新增外部套件。
- [x] 已列出預覽流量、跨服務 Rules 讀取、工作階段寫入與清理成本，並限制單檔與數量。
- [x] 已規劃驗證器、補償流程、權限、Rules、跨服務失敗及孤兒稽核的單元與整合測試。
- [x] 本檔與 spec.md 均為繁體中文，產品需求留在 spec.md，技術決策留在本檔。

## 專案結構

### 文件（本功能）

```text
specs/005-request-attachments/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── angular-interfaces.md
│   ├── firestore-rules-contract.md
│   ├── storage-rules-contract.md
│   └── storage-cors-contract.md
├── checklists/requirements.md
└── tasks.md                    # 由 /speckit.tasks 產出
```

### 原始碼（儲存庫根目錄）

```text
src/app/
├── attachments/
│   ├── attachment-list.component.{ts,html,scss,spec.ts}
│   └── attachment-preview-dialog.component.{ts,html,scss,spec.ts}
├── services/
│   ├── attachment.service.ts
│   ├── attachment.service.spec.ts
│   ├── storage.service.ts
│   ├── attendance.service.ts
│   └── subsidy.service.ts
├── utils/
│   ├── attachment-validation.ts
│   └── attachment-validation.spec.ts
├── attendance/
│   ├── attendance.component.{ts,html,scss}
│   └── attendance-status-change/
└── subsidy/
    ├── subsidy-application/
    └── subsidy-status-change/

firestore.rules
storage.rules
storage.cors.json
tools/request-attachment-orphan-audit.js
```

**結構決策**：附件清單與預覽為 attendance、subsidy 共用的 standalone 元件；檔案型別、驗證與跨服務協調集中於共用 service／utility。兩個既有 domain service 仍負責各自申請欄位與 audit trail，避免共用附件層承擔業務欄位差異。沿用現有 `src/app/services` 扁平結構，不為單一功能全面搬動既有模組。

## 技術設計

### Storage 路徑

```text
request-attachments/{kind}/{requestId}/{sessionId}/{attachmentId}
```

- `kind` 僅允許 `attendance` 或 `subsidy`。
- `requestId` 在送出前由 client 預先產生，與正式申請文件 ID 相同。
- `sessionId` 讓 Storage Rules 能精確讀取對應 upload session，不需執行 Rules 不支援的查詢。
- `attachmentId` 使用隨機文件 ID；原始檔名只存 metadata，不進路徑，避免特殊字元、同名覆寫與路徑注入。
- 附件物件不可覆寫；替換一律建立新 ID，再刪舊 ID。
- metadata 設為實際 `contentType`、`cacheControl: private,max-age=3600`，不建立或保存 token 型永久下載 URL。

### 檔案驗證與預覽

- 官方 client 先驗證最終數量、`file.size <= 3 * 1024 * 1024`、副檔名、`file.type` 與 magic bytes：PDF `%PDF-`、JPEG `FF D8 FF`、PNG 八位元簽章、WebP `RIFF....WEBP`。
- Storage Rules 再驗證 authenticated、create-only、大小與 MIME allowlist。Rules 無法讀取 magic bytes，因此內容簽章屬 client 驗證；此限制由 emulator 測試 MIME 邊界並在風險章節記錄。
- 預覽使用 `getBlob(ref, 3 MiB)`，產生短生命週期 Object URL；圖片使用 `<img>`，PDF 使用受信任的 blob resource URL。dialog 關閉或切換附件時呼叫 `URL.revokeObjectURL()`。
- 不使用 `getDownloadURL()`，避免 token URL 在登出後仍可能被持有者直接存取。

### 全生命週期關聯模型

每個 Storage 物件在任一時刻 MUST 由以下一種 Firestore 資料持有：

1. `requestAttachmentUploadSessions/{sessionId}`：尚未正式提交的新檔。
2. `attendanceLogs/{requestId}.attachments[]` 或 `subsidyApplications/{requestId}.attachments[]`：正式附件。
3. `requestAttachmentCleanupQueue/{attachmentId}`：已從申請移除、等待刪除的實體檔。

這三種狀態間以 Firestore batch／transaction 原子轉移 reference；三者皆屬有效資料關聯。Storage 操作失敗時保留治理文件，讓後續重試與稽核可找到檔案；「真正孤兒」專指三者皆無 reference 的物件。

### 新增申請流程

1. UI 只保存本機 `File[]`，取消 dialog 不執行任何遠端操作。
2. 按儲存後產生 `requestId`、`sessionId`、attachment IDs 與 upload session，session 記錄 kind、ownerUid、actorUid、預計路徑、建立時間與 `uploading` 狀態；session 建立成功後讀回已解析的 server `createdAt`，作為本批正式附件的 `uploadedAt`。
3. 逐檔上傳；任一失敗即刪除本批已上傳檔。全部刪除成功後刪 session；若清理失敗，session 改為 `cleanup-pending` 並保留路徑。
4. 全部上傳成功後，以單一 Firestore batch 建立申請、建立既有 audit trail（含附件新增摘要）、刪除 upload session。
5. batch 失敗時走第 3 步補償，不產生部分可見申請。

### 編輯與替換流程

1. 以 `existingAttachments`、`newFiles`、`removedAttachmentIds` 計算最終集合；最終數量必須 ≤5，允許新增上傳期間暫時存在第六個物件。
2. UI 與共用 service 先以當前快照的現有數、待刪數與新檔數阻擋明顯超過五檔的儲存；通過後新檔才由 upload session 持有並上傳，舊檔保持不動；任一新檔失敗時補償刪除新檔，原申請不變。transaction 仍以最新 snapshot 執行最終五檔與並行衝突檢查。
3. 以 Firestore transaction 重新讀取申請，重新檢查 owner、status、最新 attachment IDs 與最終數量，避免兩個編輯視窗互相覆蓋。
4. transaction 同時更新申請欄位／attachments、建立每批新增與刪除 audit trail、為待刪舊檔建立 cleanup queue、刪除 upload session；純附件異動時不另寫入內容為空的一般「更新」audit。
5. transaction 成功代表使用者可見變更已全部完成；之後才執行舊 Storage 物件治理清理。每個刪除成功即刪除對應 cleanup queue；失敗項目保留在 queue，供相同 client 重試或稽核工具處理，不把治理清理延遲回報為正式申請交易部分失敗。

### 權限與 Rules

- Storage read：任何 `request.auth != null` 可 get；禁止 list，UI 只依 Firestore metadata 取得確切路徑。
- Storage create：檔案必須有 actor 可操作的 upload session，或已存在且可管理的 parent request；限 allowlist、≤3 MiB、create-only。
- Storage delete：必須有對應 cleanup queue 且操作者為 queue actor，或為 admin；object-not-found 視為已清理。
- Firestore attachment read：隨原申請，僅 authenticated；治理集合不得由一般使用者列舉。只在既有表單／審核 dialog 顯示，不新增列表入口。
- 一般使用者只可建立自己的 upload session、只可修改自己的 pending 申請，且不得修改 owner／status；對已存在 parent 建立 session 時必須同時匹配 parent owner 與 pending 狀態，避免借用他人 requestId 佔用 Storage 路徑。admin 可代辦並管理任意狀態。
- `requestAttachmentUploadSessions` 與 `requestAttachmentCleanupQueue` 的欄位、路徑及不可變欄位由 Rules 驗證，避免偽造他人路徑或擴權。
- attendance 僅針對 `attachments` 欄位變更套用 owner-pending/admin 限制，既有非附件 create/update/status 行為維持原業務權限但至少要求 authenticated，避免本功能暗中改變出勤流程；全面權限重構另案處理。subsidy 延續既有 parent 權限並補上 attachment 欄位限制。
- 管理員的附件 Rules 不受 parent status 限制，但 UI 僅沿用既有表單／dialog 入口；不新增 subsidy-list 對 approved/rejected 的編輯入口。
- audit action allowlist 保留 `create`、`update`、`status_change` 等歷史英文值，新功能則寫入繁體中文動作；這是向下相容的過渡安排，新增動作時必須同步檢查 Rules allowlist 與歷程 UI。

### Storage CORS

- `getBlob()` 在瀏覽器需 bucket CORS allowlist；新增 `storage.cors.json`，允許 Firebase Hosting 正式網域與本機開發來源執行 `GET`／`HEAD`，暴露預覽所需 response headers，max age 3600 秒。
- CORS 不由 `firebase deploy` 自動發布；部署步驟使用 `gcloud storage buckets update gs://noahxdm-eip.firebasestorage.app --cors-file=storage.cors.json`，並在正式 Hosting origin 執行 Blob 預覽 smoke test。
- CORS 只處理瀏覽器跨來源限制，實際讀取授權仍由 Storage Rules 的 authenticated get 判定。

## 資料查詢、索引與成本

- `attachments` 最多五筆，直接隨申請文件讀取；列表與 dialog 不新增 query 或 listener。
- 不需要新增複合索引。治理集合正常流程以確切 document ID 讀寫；稽核工具用 Admin SDK 全量掃描，不進一般 UI。
- 每次含新附件的儲存增加：一個 session create/delete、每檔一個 Storage upload、Storage Rules 對 session/parent 的 Firestore lookup、申請與 audit 寫入。
- 每次刪除增加：每檔一個 cleanup queue create/delete、Storage delete 與 Rules lookup。
- cleanup queue create 的 `validCleanupTransfer` 在同一種 request kind 會對 parent 執行兩次 `get()` 與一次 `getAfter()`；Rules runtime 可快取相同文件的 access call，但仍將此視為每次刪除的最壞評估成本，以原子驗證 parent 移除與 queue 建立為優先。
- 預覽每次最多下載 3 MiB；一小時 private cache 降低同一使用者重複預覽流量，但不公開共用快取。
- audit trail 不保存二進位內容或 URL，只保存名稱、大小、ID 與操作者，控制文件成長。

## 稽核與清理工具

新增 `tools/request-attachment-orphan-audit.js`，預設 dry-run：

1. 列出 `request-attachments/` 全部物件。
2. 建立正式申請 attachments、upload sessions、cleanup queue 三類合法 path set。
3. 報告真正無任何資料關聯的物件、逾時 upload sessions、待處理 cleanup jobs 與指向不存在物件的 metadata。
4. `--delete-orphans` 只刪真正孤兒；`--process-cleanup` 重試 cleanup queue；破壞性操作須顯式旗標，逐筆輸出結果且可安全重跑。

工具不取代正常補償流程，而是處理瀏覽器關閉、離線或歷史異常的安全網。

## 測試策略

### 單元／元件

- 檔案驗證：四種合法簽章、偽造 MIME／副檔名、3 MiB 邊界、最終五檔與替換暫時第六檔。
- AttachmentService：路徑、session、批次上傳、任一失敗補償、transaction 衝突、cleanup queue、object-not-found 冪等。
- 預覽 dialog：圖片/PDF blob URL、載入錯誤、切換與 destroy 時 revoke。
- attendance/subsidy 表單：取消零寫入、無附件回歸、全有或全無、owner/status/admin UI 狀態。
- status-change dialogs：所有登入者可預覽但只有 admin 顯示管理操作。

### Emulator 整合與 Rules

- authenticated read、unauthenticated deny、Storage list deny。
- owner pending create/delete、他人 deny、owner approved/rejected deny、admin 全狀態 allow。
- 3 MiB 等於上限 allow、超一位元組 deny；四 MIME allow、其他 deny；overwrite deny。
- session → application、application → cleanup queue 的 reference 轉移；失敗後 session/queue 可被稽核找到。
- 一般使用者不可改 owner/status 或偽造 session actor/path；admin 代辦記錄 actorUid。
- 既有無 attachments 欄位的文件讀寫相容。

## 上線順序與回退

1. 先部署 Firestore／Storage Rules 與治理集合契約，於 emulator 完成 rules test。
2. 套用 `storage.cors.json` 至 production bucket 並從 Hosting origin 驗證 `getBlob()`。
3. 部署含 service 與 UI 的前端；既有文件缺少 attachments 時預設空陣列，不需搬遷。
4. 以一般使用者與 admin smoke test attendance、subsidy 新增／編輯／審核預覽。
5. 執行 orphan audit dry-run，基線應為零真正孤兒。
6. 回退前端時，新版寫入的 attachments 欄位不影響舊版讀取；Rules 與 CORS 必須保留 signed-in read 與既有流程所需設定，直到前端完成回退。

## 風險與緩解

- **跨服務無原子交易**：用 upload session／cleanup queue 保持 reference，並以補償、重試與 audit 工具兜底。
- **Storage cacheControl 無法由 Rules 驗證**：client 固定寫入 `private,max-age=3600` 並以 `StorageService` 單元測試保護；Rules 僅能驗證 Firebase 公開的 size、contentType 與 customMetadata。若 client 回歸漏寫 cacheControl，安全性仍由 authenticated get 與不可列舉路徑維持，但瀏覽器快取策略可能偏離預期。
- **magic bytes 無法由 Storage Rules 驗證**：官方 client 驗證實際簽章，Rules 限制 MIME/size；依使用者決策接受 client-only 內容驗證的殘餘風險。若未來要求阻擋繞過 UI 的惡意偽造，需另提後端掃描能力與憲章修訂。
- **Firestore Rules 無法驗證 Storage 物件存在**：繞過官方 client 直接寫入 parent 的惡意呼叫可能建立指向不存在物件的附件 metadata；這不會產生未受治理的實體孤兒檔，也不會繞過 Storage 的 authenticated read，但會造成 broken reference。正式流程由 upload session 與 transaction 建立 metadata，稽核工具則將缺少實體物件的 reference 列為 `brokenReferences` 供管理者處理；若未來要求 Rules 在寫入當下跨服務驗證實體存在，需新增受信任後端能力並先處理憲章限制。
- **production CORS 漏部署**：emulator 測試可能通過但正式 `getBlob()` 失敗；將 CORS 套用與 Hosting-origin smoke test 列為上線 gate。
- **所有登入者可讀的隱私範圍大**：此為已確認產品政策；不保存永久 URL、禁止 list，降低附件連結外流面。
- **並行編輯**：transaction 以最新 attachment IDs 計算，發現已刪／新增衝突則拒絕並要求重新載入。
- **瀏覽器中途關閉**：session 或 cleanup queue 保留待處理狀態，稽核工具可辨識與清理。
- **PDF 預覽瀏覽器差異**：blob inline 預覽失敗時提供下載/另開 fallback，仍受 authenticated 讀取流程保護。

## 複雜度追蹤

本功能沒有憲章例外。新增兩個短生命週期治理集合是為在無 Cloud Functions、無跨服務 transaction 的限制下滿足「不得產生孤兒檔」；較簡單的單一 attachments array 無法在瀏覽器中斷或補償刪除失敗時保留可追蹤關聯。
