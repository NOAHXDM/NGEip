# Angular 介面契約：申請附件

## 公開型別

```ts
export type RequestKind = 'attendance' | 'subsidy';
export type RequestStatus = 'pending' | 'approved' | 'rejected';
export type AttachmentContentType =
  | 'application/pdf'
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp';

export interface AttachmentMetadata {
  id: string;
  storagePath: string;
  originalName: string;
  contentType: AttachmentContentType;
  size: number;
  uploadedBy: string;
  uploadedAt: Timestamp;
}

export type PlannedAttachmentMetadata = Omit<AttachmentMetadata, 'uploadedAt'>;

export interface PendingAttachment {
  id: string;
  file: File;
  validationState: 'checking' | 'valid' | 'invalid';
  validationError?: AttachmentValidationError;
}

export type AttachmentValidationError =
  | 'unsupported-extension'
  | 'unsupported-mime'
  | 'signature-mismatch'
  | 'empty-file'
  | 'file-too-large'
  | 'too-many-files';

export interface AttachmentChanges {
  newFiles: PendingAttachment[];
  removedAttachmentIds: string[];
}

export interface AttachmentContext {
  requestKind: RequestKind;
  requestId?: string;
  ownerUid: string;
  status: RequestStatus;
  actorUid: string;
  isAdmin: boolean;
}
```

## AttachmentService 契約

```ts
export abstract class AttachmentService {
  validateFiles(
    files: readonly File[],
    existingCount: number,
    removedCount: number
  ): Promise<PendingAttachment[]>;

  createRequestWithAttachments<T>(
    context: AttachmentContext,
    requestData: T,
    files: readonly File[]
  ): Observable<string>;

  updateRequestWithAttachments<T>(
    context: AttachmentContext,
    requestPatch: Partial<T>,
    existingAttachments: readonly AttachmentMetadata[],
    changes: AttachmentChanges
  ): Observable<void>;

  loadPreview(attachment: AttachmentMetadata): Observable<Blob>;
  retryPendingCleanup(queueId: string): Observable<void>;
}
```

行為保證：驗證不做遠端寫入；create/update 成功前完成正式 reference 轉移；任一步驟失敗回傳固定友善錯誤；update 失敗不先刪舊檔；component 使用 `takeUntilDestroyed`，但已開始的補償 Promise 不因 UI 關閉而中斷。

## StorageService 擴充契約

```ts
attachmentPath(kind: RequestKind, requestId: string, attachmentId: string): string;
uploadAttachment(metadata: AttachmentMetadata, file: File): Observable<void>;
getAttachmentBlob(attachment: AttachmentMetadata): Observable<Blob>;
deleteAttachment(storagePath: string): Observable<void>;
```

- upload 使用 create-only；path 已存在即失敗。
- getBlob 最大讀取量固定 3 MiB。
- delete 遇到 `storage/object-not-found` 視為成功。

## 共用元件契約

### AttachmentListComponent

Inputs：`attachments`、`pendingFiles`、`canManage`、`maxFiles=5`。

Outputs：`filesSelected`、`pendingFileRemoved`、`existingAttachmentRemoved`、`previewRequested`。

- readonly 模式仍顯示原始檔名、大小、格式與預覽。
- manage 模式才顯示選檔與刪除。
- 最終數量以 `existing - markedRemoved + pending` 計算。

### AttachmentPreviewDialogComponent

Input：`AttachmentMetadata | PendingAttachment`。

- pending file 直接由本機 File 建 Object URL。
- 正式 metadata 透過 service 取得 Blob。
- 圖片用 img；PDF 用 object/iframe；載入失敗可重試。
- 每次替換 URL 與 destroy 都必須 revoke。
