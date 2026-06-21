# Firestore Rules 契約：申請附件

## 共用語意

```text
isSignedIn()         := request.auth != null
isAdmin()            := users/{auth.uid}.role == 'admin'
isOwner(data)        := data.userId == request.auth.uid
isOwnerPending(data) := isOwner(data) && data.status == 'pending'
```

## Parent requests

### attendanceLogs/{requestId}

| 操作 | 允許條件 |
|------|----------|
| read | signed-in |
| create | signed-in；若建立時包含 attachments，attachment actor 必須為 owner 或 admin |
| update 非附件欄位 | 維持既有 attendance 業務權限但至少 signed-in |
| update attachments | admin，或原 owner + pending；一般使用者不得藉此改 userId/status |
| status update | 維持既有 attendance 業務權限但至少 signed-in |
| delete | 維持既有治理權限；UI 不新增刪除操作 |

本功能只收斂 attachment 欄位授權，不把 attendance 全面權限重構夾帶進本次交付。

### subsidyApplications/{requestId}

沿用既有 signed-in read、owner-pending/admin update 與 admin status/delete 邊界；建立含附件的申請時，`userId` 必須為本人或操作者為 admin；attachment 變更亦套用 owner-pending/admin。Rules 支援 admin 管理任意狀態，但本功能不新增 subsidy-list 的任意狀態編輯入口。

共同驗證：attachments 可缺少；若存在必須為 list 且 size ≤5；一般使用者更新後 `userId/status` 必須與原資料相同；audit create 的 `actionBy == auth.uid`。

## requestAttachmentUploadSessions/{sessionId}

### create

- signed-in，`actorUid == auth.uid`。
- `ownerUid == auth.uid` 或 isAdmin()。
- 若 `requestId` 已對應 parent，`ownerUid` 必須等於 parent `userId`，且一般申請人僅能對 pending parent 建立 session。新增申請在 parent 尚未建立時仍可預先建立 session。
- kind 僅 attendance/subsidy；status 必須為 uploading。
- plannedAttachments 與 plannedPaths 為 1..5 筆且一一對應，每筆 path 符合 kind/requestId/sessionId/id。
- size `1..3145728`，contentType 在 allowlist。

### get/update/delete

- actor 本人或 admin；一般使用者不可 list。
- 一般使用者不可改 actorUid、ownerUid、kind、requestId、planned IDs/paths。
- update 規則明確比對 `ownerUid` 與原文件相同，並以 affected keys allowlist 作為雙重不變性防護。
- status 只允許一次性的 `uploading -> cleanup-pending`；已是 cleanup-pending 的 session 不得再次 update。

## requestAttachmentCleanupQueue/{attachmentId}

### create

- 必須與 parent attachment 移除同 transaction/batch。
- `actorUid == auth.uid`，且 actor 是 parent owner + pending 或 admin。
- `ownerUid` 必須等於 parent request 的 `userId`。
- document ID、attachment.id 與 path 尾段一致；kind/requestId 與 queue 相符。

### get/update/delete

- actor 本人或 admin；一般使用者不可 list。
- update 只允許 attemptCount 遞增、lastAttemptAt/lastErrorCode 變更。

## Audit Trail

- signed-in 可 read；create 必須 `actionBy == auth.uid`。
- create 的 `action` 必須屬於 attendance/subsidy 現行中英文相容 allowlist，不得寫入任意稽核動作。
- 新增／刪除附件 audit 與 parent metadata 同 transaction。
- audit 文件不可 update/delete。

## 必測拒絕案例

1. 未登入讀取任一申請或治理文件。
2. 一般使用者建立 ownerUid 為他人的 session。
3. 一般使用者修改他人或非 pending attachments。
4. owner 偷改 userId/status。
5. kind/requestId/path 不一致的 session 或 queue。
6. parent 最終 attachments 超過五筆。
7. 一般使用者 list 治理集合。
8. actionBy 與 auth.uid 不一致的 audit。
9. 一般使用者以他人既有 requestId 或自己非 pending requestId 建立 upload session。
