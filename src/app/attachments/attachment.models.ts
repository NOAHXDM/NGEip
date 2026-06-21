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

export interface PreparedAttachmentBatch {
  sessionId: string | null;
  attachments: AttachmentMetadata[];
}

export const MAX_ATTACHMENT_COUNT = 5;
export const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024;
export const ATTACHMENT_CONTENT_TYPES: readonly AttachmentContentType[] = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
];
