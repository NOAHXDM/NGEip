# 資料模型：使用者歷程時間軸

## `userJourneyEvents/{eventId}`

| 欄位 | 型別 | 規則 |
|---|---|---|
| `targetUserId` | string | 必填，Firebase UID；建立後不可修改 |
| `eventDate` | Timestamp | 必填，時間軸主要排序時間 |
| `title` | string | trim 後 1–100 字 |
| `content` | string | trim 後 1–5,000 字 |
| `attachments` | AttachmentMetadata[] | 0–5 筆；既有附件 metadata 契約 |
| `createdBy` | string | 必須等於建立當下 Firebase Auth UID；前端入口仍僅 Admin |
| `createdAt` | Timestamp | server timestamp；不可修改 |
| `updatedBy` | string | 最近修改 Firebase Auth UID；前端入口仍僅 Admin |
| `updatedAt` | Timestamp | server timestamp |
| `lastAuditId` | string | create/update 同交易 audit ID；每次更新時必須替換且不可重用 |
| `deleteAuditId` | string | 建立事件前預先產生；建立後不可修改，供 delete Rules 精確驗證 |

## `userJourneyEventAudits/{auditId}`

| 欄位 | 型別 | 說明 |
|---|---|---|
| `eventId` | string | 對應事件 ID |
| `targetUserId` | string | 事件目標使用者 UID |
| `action` | `create \| update \| delete` | 異動種類 |
| `actorUid` | string | 實際 Firebase Auth actor |
| `actionAt` | Timestamp | server timestamp |
| `title` | string | 異動當下事件標題，刪除後仍可查核 |
| `changedFields` | string[] | 修改欄位名稱，不保存附件內容 |
| `attachmentSummary` | object[] | id、name、size 的必要摘要 |

所有異動均使用此平坦集合；文件只能建立，不能更新或刪除。前端 service 在 create 時先建立 event 本體，再 best-effort 補 create audit；若 event-first 被正式 Rules 拒絕，回退 legacy event+audit batch。event create/update Rules 暫時允許 signed-in ownership 作為 issue #36 mitigation；有附件 create/update 的 upload session 與 cleanup queue 同樣暫時採 actor ownership。update 時以 event transaction 同批次建立新的 `lastAuditId` audit；delete audit ID 必須等於 event 建立時保存的不可變 `deleteAuditId`。Rules 對 create audit 仍驗證 Admin；update audit 驗證 audit id 與 action，不跨文件反查同批次 event，也不要求時間等於 `request.time`，以避免正式環境對 batch/transaction 的 `getAfter()`、server timestamp transform 或附件 summary schema 驗證誤判權限不足；event update 本體僅保留登入、不可變欄位與 `lastAuditId` 變更驗證，欄位格式與附件 metadata 暫由前端 service 保證；delete audit 仍由 audit 文件單向驗證 parent event 的同批次 before/after 狀態。各 action 均必填 `eventId`、`targetUserId`、`action`、`actorUid`、`actionAt`、`title`、`changedFields` 與 `attachmentSummary`。

## 附件治理

- `journeyEventAttachmentUploadSessions/{sessionId}`：signed-in actor 建立或更新事件前的暫時關聯；前端入口仍僅 Admin。
- `journeyEventAttachmentCleanupQueue/{attachmentId}`：事件移除 metadata 後至 Storage 物件刪除完成前的關聯。
- Storage：`journey-event-attachments/{targetUserId}/{eventId}/{sessionId}/{attachmentId}`；上傳與刪除可由 session/cleanup actor 或現任 Admin 操作，但 Admin 仍必須透過 session/cleanup queue 治理文件。

每個實體物件必須被 session、正式事件 attachments 或 cleanup queue 至少一者引用。

## 畫面 View Model

`JourneyTimelineItem` 不寫入 Firestore，由兩來源轉換：

- `source`: `event | subsidy`
- `sourceId`: 原文件 ID
- `occurredAt`: eventDate 或 applicationDate
- `title`, `content`, `status`, `amount`, `attachments`
- `subsidyType`: 補助項目對應圖示使用
- `stableKey`: occurredAt + source priority + sourceId

## 查詢與索引

- events：`targetUserId == uid`，`eventDate desc`，`documentId desc`，limit 20。
- subsidies：`userId == uid`，`applicationDate desc`，`documentId desc`，limit 20。
- 所有後續頁使用各來源最後一筆 snapshot 作 `startAfter`，不使用 offset。
