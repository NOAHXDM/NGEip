# 實作計畫：使用者歷程時間軸

**分支**：`006-user-journey-timeline` | **日期**：2026-06-22 | **規格**：[spec.md](./spec.md)  
**輸入**：來自 `/specs/006-user-journey-timeline/spec.md` 的功能規格

## 摘要

建立可重用的 `UserJourneyTimelineComponent`，嵌入「我的職場屬性報告」頁面與 Admin 編輯使用者的「職場屬性報告」Tab。元件分頁讀取既有 `subsidyApplications` 與新建 `userJourneyEvents`，在 client 轉換為共同 view model 後依業務日期由近到遠合併。Admin 可建立、更新、刪除任意事件；目標使用者與非目標使用者只能讀取事件與附件。

## 技術背景

**語言／版本**：Angular 20、TypeScript 5.8、Firebase JavaScript SDK 11.10  
**主要依賴**：Angular standalone components、Angular Material、AngularFire 20.0.1、RxJS 7.8；不新增第三方套件  
**資料儲存**：Cloud Firestore（既有補助、新事件、事件 audit 與附件治理 metadata）＋ Firebase Storage（事件附件）  
**測試策略**：Karma/Jasmine 單元與元件測試；Firebase Firestore／Storage Emulator Rules 與整合測試  
**目標平台**：Firebase Hosting 上的 Angular SPA，桌面與行動瀏覽器  
**效能目標**：每批最多 20 個合併項目；首批最多執行兩個有界查詢；95% 於一般網路三秒內進入內容或明確載入狀態  
**限制條件**：Firebase-only；Admin 僅由 `users/{request.auth.uid}.role == "admin"` 判定；事件建立／更新／刪除僅 Admin、事件與附件開放所有已登入者跨使用者讀取；無跨 Firestore／Storage 原子交易  
**規模／範圍**：兩個嵌入點、一個時間軸元件、一個事件 dialog、兩個 service、四個新頂層集合與一組 Storage 路徑

## 憲章檢查

*Gate：Phase 0 與 Phase 1 均通過。*

- [x] 僅使用 Firebase Authentication、Cloud Firestore、Firebase Storage、Firebase Hosting。
- [x] 身分來源沿用 Firebase Authentication，Admin 僅由目前登入者的 `users/{request.auth.uid}.role == "admin"` 判定。
- [x] 已定義平坦事件集合、查詢、索引與讀寫成本。
- [x] 已規劃 Firestore／Storage Rules、Emulator 驗證與 authenticated read／Admin-only write 邊界。
- [x] 前端只使用 Angular、Material、原生 Web API 與官方 Firebase SDK，不新增依賴。
- [x] 使用兩個有界游標查詢與 client buffer，避免全量讀取及常駐監聽。
- [x] 已規劃排序／分頁／權限／附件補償的單元與整合測試。
- [x] spec 與 plan 均以繁體中文撰寫，產品需求與技術決策分離。

## 專案結構

```text
specs/006-user-journey-timeline/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── contracts/angular-interfaces.md

src/app/journey-timeline/
├── components/user-journey-timeline.component.{ts,html,scss,spec.ts}
├── dialogs/journey-event-dialog.component.{ts,html,scss,spec.ts}
├── models/journey-timeline.models.ts
└── services/
    ├── journey-event.service.{ts,spec.ts}
    └── journey-timeline.service.{ts,spec.ts}

src/app/evaluation/pages/attribute-report/attribute-report.component.ts
src/app/evaluation/components/user-attribute-report-embed/user-attribute-report-embed.component.ts
firestore.rules
firestore.indexes.json
storage.rules
```

**結構決策**：時間軸是跨 evaluation 與 subsidy 的組合功能，放在獨立 feature 目錄，避免讓 evaluation service 承擔補助或事件領域。個人報告與嵌入報告只負責傳入 `userId` 與明確的 `eventPermissions`。

## 技術設計

### 嵌入與權限

- `AttributeReportComponent` 在既有報告內容後加入時間軸，`userId` 取 Firebase Auth 當前 UID，使用唯讀權限：不可新增、編輯或刪除事件。
- `UserAttributeReportEmbedComponent` 在既有報告內容後加入時間軸，沿用輸入的 `userId`；Admin 顯示新增／編輯／刪除操作。
- 不新增獨立側欄路由；即使尚無考核快照，時間軸仍要顯示，不能被現有報告空狀態的條件分支遮蔽。
- UI 權限只控制按鈕可見性，真正授權由 Firestore 與 Storage Rules 執行。

### 查詢與合併分頁

1. 補助查詢：`subsidyApplications where userId == targetUserId orderBy applicationDate desc, documentId desc limit 20`。餐費在 `mealSubsidies`／`userMealStats`，不查詢即排除。
2. 事件查詢：`userJourneyEvents where targetUserId == targetUserId orderBy eventDate desc, documentId desc limit 20`。
3. 兩來源各維護 cursor、buffer 與 `hasMore`。service 將資料轉成 `JourneyTimelineItem`，以 `occurredAt desc → source(event before subsidy) → sourceId desc` 做穩定 merge，與 Firestore cursor 方向一致。
4. 每次對 UI 輸出最多 20 筆；先消耗 buffer，當某來源可能仍有更近期資料且 buffer 不足時才抓下一批。不得只固定取兩來源各 20 筆後永久丟棄未顯示資料。
5. 使用 `getDocs()` 的一次性游標查詢，不建立常駐 listener。重新整理會重設 cursors 並重抓首批。

### 事件寫入與稽核

- 所有 create／update／delete audit 均寫入平坦且 append-only 的 `userJourneyEventAudits/{auditId}`，不建立事件 audit 子集合，避免刪除 parent 後留下無法治理的子集合文件。
- 建立事件前由 client 預先產生 event ID。無附件時，以 Firestore batch 同時寫入事件與 create audit；create 僅允許 Admin。
- 每個事件建立前預先產生不可變的 `deleteAuditId`；每次 create/update 另產生唯一 `lastAuditId`。事件文件保存兩者，使 Rules 不需查詢即可定位同交易的 audit 文件。
- 編輯時用 transaction 讀取最新事件，驗證 actor 為 Admin，更新業務欄位與 `lastAuditId` 並建立同 ID 的 update audit；以 `updatedAt`／最新 attachment IDs 防止過期畫面覆寫。
- 刪除使用 transaction 在 `userJourneyEventAudits/{deleteAuditId}` 建立 delete audit 後刪除事件；delete 僅允許 Admin。audit 保存 eventId、targetUserId、title、attachmentSummary、actorUid、action 與 actionAt，不保存附件內容。
- Rules 允許所有 authenticated read 事件；create/update/delete 僅 Admin。audit 只允許合法事件交易中的 actor create，Admin read，禁止 update/delete。

### 事件附件

- metadata 使用既有 `AttachmentMetadata`；完整重用 attendance/subsidy 的數量、大小、extension/MIME/magic bytes 驗證、預覽、替換、上傳 session、失敗補償、cleanup queue 與孤兒稽核規章。
- Storage 路徑：`journey-event-attachments/{targetUserId}/{eventId}/{sessionId}/{attachmentId}`。原始檔名不進路徑。
- 擴充既有 `AttachmentService` 與附件 models 支援 `journey-event` domain adapter；共用驗證、預覽及協調演算法，不複製另一套政策。事件使用自己的 session／cleanup 集合與 Storage prefix，但狀態轉移及限制必須與 attendance/subsidy 一致。
- 事件附件只使用 `journeyEventAttachmentUploadSessions` 持有正式寫入前的上傳；僅 Admin 在建立或更新事件時可建立合法 session。正式 transaction 將 metadata 轉入事件。刪除／替換先建立 `journeyEventAttachmentCleanupQueue` 再移除 metadata，Storage 刪除失敗時保留 queue 供重試及稽核。
- 事件刪除會為每個附件建立 cleanup queue，待事件與 delete audit transaction 成功後再刪實體檔。附件治理延遲不回滾已成功的事件刪除，但每個物件始終具有 event、session 或 cleanup queue 關聯。

### 狀態與畫面

- 項目 header：日期、事件／補助 icon、標題、狀態 chip；body 顯示內容摘要與附件，補助顯示發票金額／核准金額（存在時）。
- event title 直接使用事件標題；subsidy title 使用既有 `SubsidyTypePipe` 對應名稱。
- 具備 loading、partial-page loading、error、empty、end-of-list 五種狀態。「載入更早歷程」期間保留既有項目。
- event dialog 使用 reactive form；`eventDate`、`title`、`content` 必填，trim 後再次驗證；關閉未儲存 dialog 不產生遠端資料。

## Firestore Rules、索引與成本

- `userJourneyEvents/{eventId}`：所有 authenticated 可 get/list；create/update/delete 僅 `users/{request.auth.uid}.role == "admin"`，且 `targetUserId`、`createdBy`、`createdAt`、`deleteAuditId` 不可修改。
- client 在儲存前 trim title/content；Rules 驗證欄位 allowlist、Timestamp 型別、title 1–100 字、content 1–5,000 字且各至少包含一個非空白字元、attachments 0–5 筆，以及 `createdBy/updatedBy == request.auth.uid`。對應 Emulator 測試覆蓋每個邊界。
- create/update Rules 要求 `lastAuditId` 每次改變，並以它精確 `getAfter()` 對應 `userJourneyEventAudits/{lastAuditId}`；delete Rules 以刪除前不可變的 `deleteAuditId` 精確 `getAfter()`。event `createdAt/updatedAt` 與 audit `actionAt` 必須等於 `request.time`；audit Rules 同時驗證 action、eventId、targetUserId、actorUid、title 與 parent before/after 狀態，拒絕孤立、重用或偽造 audit。audit 僅 Admin 可讀，禁止 update/delete。
- 附件 Storage get：任何 authenticated 均可讀取確切路徑，未登入拒絕，且禁止 list。create/delete 必須匹配 Admin 建立的 session／cleanup queue；Rules 驗證每檔 ≤3 MiB、PDF/JPEG/PNG/WebP MIME allowlist，Firestore Rules 驗證最終最多五檔及 metadata schema。
- 新增複合索引 `userJourneyEvents(targetUserId ASC, eventDate DESC, __name__ DESC)`；既有 subsidy 查詢若加入 `__name__` tie-breaker，需確認／新增 `subsidyApplications(userId ASC, applicationDate DESC, __name__ DESC)`。
- 首批通常為兩次 Firestore query，各最多 20 documents；事件管理每次另有 event + audit 寫入，附件依檔數增加 session、Storage 與 cleanup 寫入。無全集合 scan、無重複常駐監聽。

## 測試策略

- 純函數：兩來源 merge、同時間 tie-break、跨頁 buffer、空頁、Timestamp 正規化。
- Service：正確 query/cursor、餐費不進來源、重試不重複、event transaction 衝突、flat delete audit、附件補償。
- Component：兩嵌入點、無考核快照仍顯示、五種 UI 狀態、Admin controls、一般使用者 read-only、dialog 驗證。
- Rules／Emulator：authenticated cross-user read、非 Admin write deny、Admin CRUD、完整 schema/長度/附件限制、targetUserId 不可變、flat audit immutable、Storage authenticated read 與 Admin session/cleanup transfer。
- 回歸：既有職場屬性報告、UserProfile dialog、補助列表與申請附件預覽保持正常。

## 上線與回退

1. 先部署 Firestore／Storage Rules 與 indexes，等待複合索引完成。
2. 部署事件 service、dialog 與時間軸元件，再接上兩個報告嵌入點。
3. 以目標使用者、非目標使用者與 Admin 執行 quickstart smoke test，確認跨使用者讀取、目標使用者查詢範圍、非 Admin 寫入隔離與附件治理。
4. 回退前端時保留新集合 Rules 與 Storage 路徑；資料不影響舊版頁面。確認無進行中的 session 後才可移除後端規則。

## 風險與緩解

- **兩來源游標合併容易遺漏或重複**：以各自 buffer/cursor 與全域 stable key 實作，針對跨頁交錯資料做純函數測試。
- **現有報告空狀態包住整頁**：時間軸放在報告條件區塊之外，確保沒有考核資料也能查看職場歷程。
- **事件附件跨服務無原子交易**：採 session → event → cleanup queue 的可追蹤狀態與補償流程。
- **刪除 parent 不會遞迴刪除子集合**：所有事件 audit 從一開始即寫入平坦 `userJourneyEventAudits`，不建立事件子集合。
- **既有 users Rules 過度寬鬆與本功能無關**：新集合採最小權限 Rules；不藉本功能擴張或重構既有 users 權限。

## 複雜度追蹤

本功能沒有憲章例外。兩個附件治理集合是 Firebase client-only 架構中避免跨服務孤兒檔所需；沿用既有附件治理模式可降低額外複雜度。
