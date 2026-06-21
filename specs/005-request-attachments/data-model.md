# 資料模型：申請附件管理

**日期**：2026-06-19
**規格**：[spec.md](./spec.md) | **計畫**：[plan.md](./plan.md)

## 關係概覽

```text
attendanceLogs/{requestId} ─┐
                            ├─ attachments[0..5] ── Storage object
subsidyApplications/{id} ───┘
            │
            └─ auditTrail/{auditId}

requestAttachmentUploadSessions/{sessionId}
   └─ plannedAttachments[] ── Storage object（正式提交前）

requestAttachmentCleanupQueue/{attachmentId}
   └─ attachment ──────────── Storage object（正式移除後、實體刪除前）
```

## 共用型別

```ts
type RequestKind = 'attendance' | 'subsidy';
type RequestStatus = 'pending' | 'approved' | 'rejected';
type AttachmentContentType =
  | 'application/pdf'
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp';
```

## AttachmentMetadata

嵌入 `attendanceLogs/{requestId}.attachments[]` 或 `subsidyApplications/{requestId}.attachments[]`。

| 欄位 | 型別 | 必填 | 規則 |
|------|------|------|------|
| `id` | string | 是 | 隨機且在申請內唯一；與 Storage path 尾段一致 |
| `storagePath` | string | 是 | `request-attachments/{kind}/{requestId}/{sessionId}/{id}` |
| `originalName` | string | 是 | 保留使用者檔名；顯示時當純文字處理 |
| `contentType` | AttachmentContentType | 是 | 僅四種 allowlist |
| `size` | number | 是 | `1..3145728` bytes |
| `uploadedBy` | string | 是 | 實際操作人的 Firebase UID |
| `uploadedAt` | Timestamp | 是 | server timestamp |

不變量：parent `attachments` 缺少時讀為 `[]`；最終長度 `0..5`；ID/path 唯一；path 與 parent/metadata 相符；不含 download URL、Blob、base64 或 Object URL。

## Parent requests

### attendanceLogs/{requestId}

沿用既有欄位，新增：

| 欄位 | 型別 | 必填 | 預設 |
|------|------|------|------|
| `attachments` | AttachmentMetadata[] | 否 | `[]` |
| `updatedAt` | Timestamp | 否 | 新增／附件變更寫 server timestamp；舊文件可缺少 |

### subsidyApplications/{requestId}

沿用既有欄位，新增可缺少的 `attachments: AttachmentMetadata[]`，預設 `[]`；既有 `updatedAt` 於附件變更同步更新。

attachments 不參與 where/orderBy，現有查詢與索引不變，也不新增 query。

## requestAttachmentUploadSessions/{sessionId}

Session 內使用不含 `uploadedAt` 的 `PlannedAttachmentMetadata`；session 建立後讀回已解析的 `createdAt`，正式提交時將該 Timestamp 寫入 parent 的 `AttachmentMetadata.uploadedAt`。這避免在 array element 中使用 server timestamp transform。

```ts
type PlannedAttachmentMetadata = Omit<AttachmentMetadata, 'uploadedAt'>;
```

| 欄位 | 型別 | 必填 | 規則 |
|------|------|------|------|
| `requestKind` | RequestKind | 是 | 僅 attendance/subsidy |
| `requestId` | string | 是 | 預先產生或既有 parent ID |
| `ownerUid` | string | 是 | 申請人 UID |
| `actorUid` | string | 是 | 實際登入者 UID |
| `status` | `'uploading' \| 'cleanup-pending'` | 是 | 只可向 cleanup-pending 轉移 |
| `plannedAttachments` | PlannedAttachmentMetadata[] | 是 | 本次新檔，`1..5`；不含 uploadedAt |
| `plannedPaths` | string[] | 是 | 與 plannedAttachments 一一對應，供 Storage Rules 精確檢查 |
| `createdAt` | Timestamp | 是 | server timestamp |
| `updatedAt` | Timestamp | 是 | server timestamp |
| `lastErrorCode` | string | 否 | 歸類後錯誤碼 |

一般使用者只能存取 actorUid 為自己的 session；admin 可代辦。生命週期：

```text
uploading
  ├─ 上傳成功 + 正式 commit ──> 刪除
  ├─ 失敗 + 補償成功 ─────────> 刪除
  └─ 失敗 + 補償未完成 ───────> cleanup-pending ──> 稽核工具清理
```

## requestAttachmentCleanupQueue/{attachmentId}

| 欄位 | 型別 | 必填 | 規則 |
|------|------|------|------|
| `requestKind` | RequestKind | 是 | 所屬 domain |
| `requestId` | string | 是 | 原 parent ID |
| `ownerUid` | string | 是 | 原申請人 |
| `actorUid` | string | 是 | 執行移除的登入者 |
| `attachment` | AttachmentMetadata | 是 | 待刪 path 與 metadata |
| `createdAt` | Timestamp | 是 | server timestamp |
| `lastAttemptAt` | Timestamp | 否 | 最近一次嘗試 |
| `attemptCount` | number | 是 | 初始 0，只能遞增 |
| `lastErrorCode` | string | 否 | 歸類後錯誤碼 |

```text
transaction 建 queue + parent 移除 metadata
  ├─ Storage delete 成功/object-not-found ──> 刪除 queue
  └─ delete 失敗 ───────────────────────────> 保留 queue、遞增 attemptCount
```

## Audit Trail 擴充

```ts
type AttachmentAuditAction = '新增附件' | '刪除附件';
interface AttachmentAuditContent {
  attachments: Array<{
    id: string;
    originalName: string;
    size: number;
    contentType: AttachmentContentType;
  }>;
}
```

`auditTrail.content` 為歷程畫面的純展示快照，不支援 Firestore 欄位查詢或索引；若未來出現依附件異動條件查詢的需求，應另行設計可查詢的結構化欄位。

`actionBy` 保存 actor UID、`actionDateTime` 為 server timestamp；content 不含 storagePath/download URL。每批新增與刪除各一筆，與 parent metadata 同 transaction。

## 一致性不變量

1. 每個 Storage path 必須出現在正式 parent、upload session 或 cleanup queue至少一處。
2. session 刪除與 parent reference 新增同 batch/transaction。
3. cleanup queue 建立與 parent reference 移除同 transaction。
4. 正式 parent 最多五檔；session 新檔不計入正式上限。
5. object-not-found 在刪除時視為冪等成功；正式 metadata 指向不存在物件時只由 audit 報告，不自動移除。
