# 資料模型：使用者歷程時間軸

## `userJourneyEvents/{eventId}`

| 欄位 | 型別 | 規則 |
|---|---|---|
| `targetUserId` | string | 必填，Firebase UID；建立後不可修改 |
| `eventDate` | Timestamp | 必填，時間軸主要排序時間 |
| `title` | string | trim 後 1–100 字 |
| `content` | string | trim 後 1–5,000 字 |
| `attachments` | AttachmentMetadata[] | 0–5 筆；既有附件 metadata 契約 |
| `createdBy` | string | 必須等於建立當下 Admin UID |
| `createdAt` | Timestamp | server timestamp；不可修改 |
| `updatedBy` | string | 最近修改 Admin UID |
| `updatedAt` | Timestamp | server timestamp |
| `lastAuditId` | string | create/update 同交易 audit ID；每次更新時必須替換且不可重用 |
| `deleteAuditId` | string | 建立事件前預先產生；建立後不可修改，供 delete Rules 精確驗證 |

## `userJourneyEventAudits/{auditId}`

| 欄位 | 型別 | 說明 |
|---|---|---|
| `eventId` | string | 對應事件 ID |
| `targetUserId` | string | 事件目標使用者 UID |
| `action` | `create \| update \| delete` | 異動種類 |
| `actorUid` | string | 實際 Admin actor |
| `actionAt` | Timestamp | server timestamp |
| `title` | string | 異動當下事件標題，刪除後仍可查核 |
| `changedFields` | string[] | 修改欄位名稱，不保存附件內容 |
| `attachmentSummary` | object[] | id、name、size 的必要摘要 |

所有異動均使用此平坦集合；文件只能建立，不能更新或刪除。create/update audit ID 必須等於 event 同交易寫入且每次改變的 `lastAuditId`；delete audit ID 必須等於 event 建立時保存的不可變 `deleteAuditId`。各 action 均必填 `eventId`、`targetUserId`、`action`、`actorUid`、`actionAt`、`title`、`changedFields` 與 `attachmentSummary`，其中 `actionAt` 與對應事件寫入時間均等於 Rules `request.time`。

## 附件治理

- `journeyEventAttachmentUploadSessions/{sessionId}`：Admin 建立或更新事件前的暫時關聯。
- `journeyEventAttachmentCleanupQueue/{attachmentId}`：事件移除 metadata 後至 Storage 物件刪除完成前的關聯。
- Storage：`journey-event-attachments/{targetUserId}/{eventId}/{sessionId}/{attachmentId}`。

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
