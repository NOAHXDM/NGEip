import { Timestamp } from '@angular/fire/firestore';

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
  existingAttachmentIds: string[];
  newFiles: File[];
  removedAttachmentIds: string[];
}

export interface AttachmentUploadContext {
  requestKind: RequestKind;
  requestId: string;
  ownerUid: string;
}

/**
 * 附件批次以 discriminated union 在編譯期表達不變量，判別欄位為 `sessionId`：
 * - {@link EmptyAttachmentBatch}：sessionId 為 null 且無附件，代表未建立遠端上傳 session。
 * - {@link UploadedAttachmentBatch}：sessionId 必為非空字串，attachments 為已建立 session 的附件。
 * 使用端可透過 `if (batch.sessionId)` 進行型別縮窄，取得有 session 的批次。
 */
export interface EmptyAttachmentBatch {
  sessionId: null;
  attachments: readonly [];
}

export interface UploadedAttachmentBatch {
  sessionId: string;
  attachments: AttachmentMetadata[];
}

export type PreparedAttachmentBatch = EmptyAttachmentBatch | UploadedAttachmentBatch;

/** 共用的空批次常數，避免各處重複建立並確保 narrowing 行為一致。 */
export const EMPTY_ATTACHMENT_BATCH: EmptyAttachmentBatch = {
  sessionId: null,
  attachments: [],
};

export const MAX_ATTACHMENT_COUNT = 5;
export const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024;
export const ATTACHMENT_CONTENT_TYPES: readonly AttachmentContentType[] = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
];
