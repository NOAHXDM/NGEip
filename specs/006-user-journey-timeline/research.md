# 研究紀錄：使用者歷程時間軸

## 決策 1：事件是獨立集合

**決策**：新增 `userJourneyEvents`，不使用補助 audit、evaluation snapshot 或 users 子集合。  
**理由**：事件是可獨立排序、編輯、附檔與授權的新業務實體；平坦集合可用 `targetUserId + eventDate` 有界查詢。  
**未採用**：將事件放進 `users/{uid}` array 會造成文件成長、無法有效分頁；放子集合會讓 Admin 跨使用者稽核與 Rules 契約較分散。

## 決策 2：兩個來源分別查詢後在 client 合併

**決策**：保留既有 `subsidyApplications`，新事件另查詢，轉成共同 view model 後 stable merge。  
**理由**：不複製補助資料，不需要 Cloud Functions 維護 projection，符合 Firebase-only 與低寫入放大。  
**未採用**：建立統一 timeline projection 會要求所有補助變更同步雙寫；client-only 環境難以保證所有歷史及未來入口一致。

## 決策 3：補助的業務時間使用 applicationDate

**決策**：補助依 `applicationDate` 排序，事件依 `eventDate` 排序。  
**理由**：既有補助「我的申請」已用 applicationDate 排序；updatedAt 不應因審核或編輯讓舊事件跳到最前。

## 決策 4：事件附件重用申請附件體驗、獨立治理集合

**決策**：重用 metadata、驗證與預覽，Storage path 及 session/cleanup collections 則以事件 domain 分開。  
**理由**：避免更名現有治理集合造成搬遷風險，同時維持五檔、3 MiB、四種格式與孤兒治理的一致性。

## 決策 5：不新增獨立時間軸路由

**決策**：用 standalone component 嵌入兩個既有職場屬性報告入口。  
**理由**：符合指定資訊架構，也讓個人與 Admin 看到同一套排序與呈現邏輯。

## 決策 6：事件稽核一律使用平坦集合

**決策**：create、update、delete 全部寫入 append-only `userJourneyEventAudits`，不建立 parent 下的 audit 子集合。  
**理由**：Firestore 刪除 parent 不會遞迴刪除子集合；平坦 audit 可在事件刪除後持續查核，也不會留下必須另行遞迴治理的子集合文件。  
**未採用**：create/update 使用子集合、delete 另存 archive 會產生兩套查詢與 Rules 契約，且 parent 刪除後子集合仍實際存在。

## 決策 7：以事件內 audit ID 建立 Rules 可驗證關聯

**決策**：create/update 將唯一 `lastAuditId` 寫入 event；delete 使用建立事件時預先產生且不可變的 `deleteAuditId`。  
**理由**：Firestore Rules 無法查詢未知 audit ID；保存確切 ID 後，update/delete audit Rules 可使用 `getAfter()` / `get()` 驗證同一 batch／transaction 的 parent event 狀態。GitHub issue #36 後，event create 與 create audit Rules 都不再跨文件反查同批次新 event，以避免正式環境對 create batch 的 `getAfter()` 驗證誤判權限不足；create audit 改由 `JourneyEventService` 在事件建立後 best-effort 補寫。  
**未採用**：隨機建立 audit 但不在 event 保存 ID，會讓 Rules 與稽核工具無法以確定性 ID 對應事件異動。
