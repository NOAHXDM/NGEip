# Storage Rules 契約：申請附件

## 路徑

```text
request-attachments/{kind}/{requestId}/{sessionId}/{attachmentId}
```

kind 只接受 attendance/subsidy；原始檔名不進 path。

## Read

| Operation | Rule |
|-----------|------|
| get | `request.auth != null` |
| list | always deny |

所有已登入使用者可在已知完整路徑時讀取附件，是本功能已確認的產品政策，以支援既有審核表單與狀態變更 dialog 預覽他人附件。此政策的隱私範圍較大；系統以禁止 list、不保存永久 download URL、僅由既有 Firestore 流程提供確切路徑降低外流面，但不把這些措施視為 owner-only 授權。

## Create

全部條件成立：signed-in、物件不存在、size `1..3145728`、MIME 為四種 allowlist、`requestAttachmentUploadSessions/{sessionId}` 為 uploading 且 plannedPaths 包含完整 path，session 的 kind/requestId/actor 皆相符或 auth 為 admin。

Rules 只驗證 MIME 與 size，magic bytes 由 client 驗證。

## Update

永遠拒絕。替換建立新 attachment ID。

## Delete

以下任一成立：對應 cleanup queue 的 actor 為 auth；對應 upload session 的 actor 為 auth、status 為 `uploading` 或 `cleanup-pending` 且正在補償；auth 為 admin。

object-not-found 視為冪等完成。

## Metadata

create 必須設定：

```text
contentType: allowlist MIME
cacheControl: private,max-age=3600
customMetadata: requestKind, requestId, attachmentId, ownerUid, uploadedBy
```

- Rules 驗證 `contentType` 與五個 customMetadata，且 customMetadata 必須與 path、登入者及 upload session 一致；不保存 originalName。
- Client 固定設定 `cacheControl: private,max-age=3600`，並由 `StorageService` 單元測試保護。
- Firebase Storage Rules 的 `request.resource` 僅公開 `name`、`bucket`、`metadata`、`size`、`contentType`，無法讀取或驗證標準 `cacheControl` 欄位；這是平台限制下接受的殘餘風險，不應將 `cacheControl` 複製進 customMetadata 冒充標準 response header。

## 必測矩陣

| Case | Expected |
|------|----------|
| 未登入 get | deny |
| 已登入 get 已知附件 | allow |
| 已登入 list prefix | deny |
| 無 session create | deny |
| session actor create 合法 MIME | allow |
| 缺少任一必要 customMetadata | deny |
| 他人 session create | deny |
| size = 3145728 | allow |
| size = 3145729 或 0 | deny |
| 非 allowlist MIME | deny |
| overwrite | deny |
| upload session kind/requestId 與 path 不一致時 delete | deny |
| upload session ownerUid 與 object metadata ownerUid 不一致時 delete | deny |
| cleanup actor delete | allow |
| cleanup queue 缺失或缺少 actorUid 時 delete | deny |
| actor 透過非補償狀態 upload session delete | deny |
| 無 queue/session 的一般使用者 delete | deny |
| admin delete | allow |
