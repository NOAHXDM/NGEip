import { InjectionToken, Injectable, inject } from '@angular/core';
import {
  Firestore,
  Timestamp,
  collection,
  deleteDoc,
  doc,
  increment,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from '@angular/fire/firestore';
import { firstValueFrom } from 'rxjs';

import {
  AttachmentContentType,
  AttachmentMetadata,
  MAX_ATTACHMENT_COUNT,
  PreparedAttachmentBatch,
} from '../../attachments/attachment.models';
import { mergeAttachmentChanges } from '../../services/attachment.service';
import { StorageService } from '../../services/storage.service';
import { validateAttachmentFile } from '../../utils/attachment-validation';
import {
  JourneyEventInput,
  UserJourneyEvent,
} from '../models/journey-timeline.models';

interface JourneyEventDocRef {
  id: string;
}

interface JourneyEventSnapshot {
  id: string;
  exists(): boolean;
  data(): unknown;
}

interface JourneyEventWriteBatch {
  set(ref: JourneyEventDocRef, data: unknown): void;
  update(ref: JourneyEventDocRef, data: unknown): void;
  delete(ref: JourneyEventDocRef): void;
  commit(): Promise<void>;
}

interface JourneyEventTransaction {
  get(ref: JourneyEventDocRef): Promise<JourneyEventSnapshot>;
  set(ref: JourneyEventDocRef, data: unknown): void;
  update(ref: JourneyEventDocRef, data: unknown): void;
  delete(ref: JourneyEventDocRef): void;
}

export interface JourneyEventFirestoreOps {
  eventRef(): JourneyEventDocRef;
  uploadSessionRef(): JourneyEventDocRef;
  ref(collectionName: string, id: string): JourneyEventDocRef;
  setDoc(ref: JourneyEventDocRef, data: unknown): Promise<void>;
  updateDoc(ref: JourneyEventDocRef, data: unknown): Promise<void>;
  deleteDoc(ref: JourneyEventDocRef): Promise<void>;
  writeBatch(): JourneyEventWriteBatch;
  runTransaction<T>(updateFunction: (transaction: JourneyEventTransaction) => Promise<T>): Promise<T>;
}

export const JOURNEY_EVENT_FIRESTORE_OPS = new InjectionToken<JourneyEventFirestoreOps>('JourneyEventFirestoreOps', {
  providedIn: 'root',
  factory: () => {
    const firestore = inject(Firestore);
    return {
      eventRef: () => doc(collection(firestore, 'userJourneyEvents')),
      uploadSessionRef: () => doc(collection(firestore, 'journeyEventAttachmentUploadSessions')),
      ref: (collectionName: string, id: string) => doc(firestore, collectionName, id),
      setDoc: (ref, data) => setDoc(ref as ReturnType<typeof doc>, data as Record<string, unknown>),
      updateDoc: (ref, data) => updateDoc(ref as never, data as never),
      deleteDoc: (ref) => deleteDoc(ref as ReturnType<typeof doc>),
      writeBatch: () => writeBatch(firestore) as unknown as JourneyEventWriteBatch,
      runTransaction: (updateFunction) => runTransaction(
        firestore,
        (transaction) => updateFunction(transaction as unknown as JourneyEventTransaction)
      ),
    };
  },
});

export function toUtcDayStartTimestamp(value: Date | Timestamp): Timestamp {
  const date = value instanceof Timestamp ? value.toDate() : value;
  return Timestamp.fromDate(new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate()
  )));
}

export function normalizeJourneyEventInput(input: JourneyEventInput): JourneyEventInput & { eventDate: Timestamp } {
  const title = input.title.trim();
  const content = input.content.trim();
  if (!title || title.length > 100 || !content || content.length > 5000) {
    throw new Error('invalid-event-fields');
  }
  return {
    targetUserId: input.targetUserId,
    eventDate: toUtcDayStartTimestamp(input.eventDate),
    title,
    content,
  };
}

export function mapJourneyEventUpdateError(error: unknown): Error | null {
  if (!(error instanceof Error)) return null;
  if (error.message === 'event-conflict') {
    return new Error('事件已被其他人更新，請重新載入後再試。');
  }
  if (error.message === 'event-not-found') {
    return new Error('事件已不存在，請重新整理頁面。');
  }
  if (error.message === 'attachment-conflict') {
    return new Error('附件已被其他人變更，請重新載入後再試。');
  }
  if (error.message === 'attachment-count-conflict') {
    return new Error('另一個視窗已新增附件，請重新載入後再試。');
  }
  return null;
}

export function mapJourneyEventAttachmentValidationError(error: unknown): Error | null {
  if (!(error instanceof Error)) return null;
  const messages: Record<string, string> = {
    'unsupported-extension': '僅支援 PDF、JPEG、PNG、WebP 檔案。',
    'unsupported-mime': '附件格式不支援，僅接受 PDF、JPEG、PNG、WebP。',
    'signature-mismatch': '附件內容與宣告格式不符，請重新選擇檔案。',
    'empty-file': '不可上傳空白附件。',
    'file-too-large': '附件超過 3 MiB 上限。',
    'too-many-files': '每筆事件最多五個附件，請刪除部分附件後再試。',
    'invalid-event-fields': '事件標題或內容格式不正確，請確認必填、字數與空白內容。',
  };
  return error.message in messages
    ? new Error(messages[error.message])
    : null;
}

export function changedJourneyEventFields(
  current: UserJourneyEvent,
  normalized: JourneyEventInput & { eventDate: Timestamp },
  removedAttachments: readonly AttachmentMetadata[],
  addedAttachments: readonly AttachmentMetadata[]
): string[] {
  const changedFields: string[] = [];
  if (current.eventDate instanceof Timestamp && current.eventDate.toMillis() !== normalized.eventDate.toMillis()) {
    changedFields.push('eventDate');
  }
  if (current.title !== normalized.title) changedFields.push('title');
  if (current.content !== normalized.content) changedFields.push('content');
  if (removedAttachments.length || addedAttachments.length) changedFields.push('attachments');
  return changedFields;
}

export function exceedsJourneyEventAttachmentLimit(
  event: Pick<UserJourneyEvent, 'attachments'>,
  removedAttachmentIds: readonly string[],
  files: readonly File[]
): boolean {
  const existingIds = new Set((event.attachments ?? []).map((attachment) => attachment.id));
  const removedCount = new Set(removedAttachmentIds.filter((id) => existingIds.has(id))).size;
  const retainedCount = Math.max(0, (event.attachments?.length ?? 0) - removedCount);
  return retainedCount + files.length > MAX_ATTACHMENT_COUNT;
}

export function journeyCreateChangedFields(attachments: readonly AttachmentMetadata[]): string[] {
  // Must stay in sync with changedJourneyEventFields() when JourneyEventInput adds auditable fields.
  return attachments.length
    ? ['eventDate', 'title', 'content', 'attachments']
    : ['eventDate', 'title', 'content'];
}

export function isValidJourneyEventAttachmentMetadata(value: unknown): value is AttachmentMetadata {
  if (!value || typeof value !== 'object') return false;
  const attachment = value as Partial<AttachmentMetadata>;
  return typeof attachment.id === 'string' && attachment.id.length > 0
    && typeof attachment.storagePath === 'string' && attachment.storagePath.length > 0
    && typeof attachment.originalName === 'string' && attachment.originalName.length > 0
    && typeof attachment.contentType === 'string' && attachment.contentType.length > 0
    && typeof attachment.size === 'number' && attachment.size > 0
    && typeof attachment.uploadedBy === 'string' && attachment.uploadedBy.length > 0
    && attachment.uploadedAt instanceof Timestamp;
}

export function recoverJourneyEventAttachmentMetadata(value: unknown, fallbackUploadedBy: string): AttachmentMetadata | null {
  if (isValidJourneyEventAttachmentMetadata(value)) return value;
  if (!value || typeof value !== 'object') return null;
  const partial = value as Partial<AttachmentMetadata>;
  if (typeof partial.storagePath !== 'string' || !partial.storagePath.length) return null;
  const id = partial.id && partial.id.length ? partial.id : partial.storagePath.split('/').filter(Boolean).at(-1);
  if (!id) return null;
  return {
    id,
    storagePath: partial.storagePath,
    originalName: partial.originalName && partial.originalName.length ? partial.originalName : `${id}.pdf`,
    contentType: partial.contentType && partial.contentType.length
      ? partial.contentType
      : 'application/pdf',
    size: typeof partial.size === 'number' && partial.size > 0 ? partial.size : 1,
    uploadedBy: partial.uploadedBy && partial.uploadedBy.length ? partial.uploadedBy : fallbackUploadedBy,
    uploadedAt: partial.uploadedAt instanceof Timestamp ? partial.uploadedAt : Timestamp.now(),
  };
}

export function hasMatchingJourneyEventUpdatedAt(current: unknown, expected: unknown): boolean {
  return current instanceof Timestamp
    && expected instanceof Timestamp
    && current.toMillis() === expected.toMillis();
}

export type JourneyEventCleanupFailureCode = 'storage-delete-failed' | 'queue-delete-failed';

interface JourneyEventCleanupOperations {
  deleteAttachment: () => Promise<void>;
  deleteQueue: () => Promise<void>;
  recordFailure: (lastErrorCode: JourneyEventCleanupFailureCode, context: Record<string, unknown>) => Promise<void>;
  errorCode: (error: unknown) => string;
}

export async function processJourneyEventAttachmentCleanup(
  attachment: AttachmentMetadata,
  operations: JourneyEventCleanupOperations
): Promise<boolean> {
  try {
    await operations.deleteAttachment();
  } catch (storageError) {
    const storageErrorCode = operations.errorCode(storageError);
    if (storageErrorCode !== 'storage/object-not-found') {
      await operations.recordFailure('storage-delete-failed', {
        attachmentId: attachment.id,
        storagePath: attachment.storagePath,
        storageErrorCode,
      });
      return false;
    }
  }

  try {
    await operations.deleteQueue();
    return true;
  } catch (queueError) {
    await operations.recordFailure('queue-delete-failed', {
      attachmentId: attachment.id,
      storagePath: attachment.storagePath,
      queueErrorCode: operations.errorCode(queueError),
    });
    return false;
  }
}

@Injectable({ providedIn: 'root' })
export class JourneyEventService {
  private readonly firestoreOps = inject(JOURNEY_EVENT_FIRESTORE_OPS);
  private readonly storage = inject(StorageService);

  async create(
    input: JourneyEventInput,
    actorUid: string,
    files: readonly File[]
  ): Promise<string> {
    const eventRef = this.firestoreOps.eventRef();
    const lastAuditId = crypto.randomUUID();
    const deleteAuditId = crypto.randomUUID();
    let prepared: PreparedAttachmentBatch | null = null;
    try {
      const normalized = normalizeJourneyEventInput(input);
      prepared = await this.prepareUploads(eventRef.id, normalized.targetUserId, actorUid, files);
      const batch = this.firestoreOps.writeBatch();
      batch.set(eventRef, {
        ...normalized,
        attachments: prepared.attachments,
        createdBy: actorUid,
        createdAt: serverTimestamp(),
        updatedBy: actorUid,
        updatedAt: serverTimestamp(),
        lastAuditId,
        deleteAuditId,
      });
      batch.set(this.firestoreOps.ref('userJourneyEventAudits', lastAuditId), this.audit(
        eventRef.id, normalized.targetUserId, 'create', actorUid, normalized.title,
        journeyCreateChangedFields(prepared.attachments), prepared.attachments
      ));
      if (prepared.sessionId) {
        batch.delete(this.firestoreOps.ref('journeyEventAttachmentUploadSessions', prepared.sessionId));
      }
      await batch.commit();
      return eventRef.id;
    } catch (error) {
      if (prepared?.sessionId) await this.rollbackPrepared(prepared);
      const validationError = mapJourneyEventAttachmentValidationError(error);
      if (validationError) throw validationError;
      throw this.friendly('事件與附件未能建立，請稍後重試。', error);
    }
  }

  async update(
    event: UserJourneyEvent,
    input: JourneyEventInput,
    actorUid: string,
    files: readonly File[],
    removedAttachmentIds: readonly string[]
  ): Promise<void> {
    const eventRef = this.firestoreOps.ref('userJourneyEvents', event.id);
    const lastAuditId = crypto.randomUUID();
    let prepared: PreparedAttachmentBatch | null = null;
    let removed: AttachmentMetadata[] = [];
    try {
      const normalized = normalizeJourneyEventInput(input);
      if (exceedsJourneyEventAttachmentLimit(event, removedAttachmentIds, files)) throw new Error('too-many-files');
      prepared = await this.prepareUploads(event.id, event.targetUserId, actorUid, files);
      const preparedBatch = prepared;
      removed = await this.firestoreOps.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(eventRef);
        if (!snapshot.exists()) throw new Error('event-not-found');
        const current = { id: snapshot.id, ...(snapshot.data() as Record<string, unknown>) } as UserJourneyEvent;
        if (!hasMatchingJourneyEventUpdatedAt(current.updatedAt, event.updatedAt)) throw new Error('event-conflict');
        const merged = mergeAttachmentChanges(
          current.attachments ?? [],
          removedAttachmentIds,
          preparedBatch.attachments
        );
        transaction.update(eventRef, {
          eventDate: normalized.eventDate,
          title: normalized.title,
          content: normalized.content,
          attachments: merged.finalItems,
          updatedBy: actorUid,
          updatedAt: serverTimestamp(),
          lastAuditId,
        });
        transaction.set(this.firestoreOps.ref('userJourneyEventAudits', lastAuditId), this.audit(
          event.id, event.targetUserId, 'update', actorUid, normalized.title,
          changedJourneyEventFields(current, normalized, merged.removedItems, preparedBatch.attachments),
          merged.finalItems
        ));
        if (preparedBatch.sessionId) {
          transaction.delete(this.firestoreOps.ref('journeyEventAttachmentUploadSessions', preparedBatch.sessionId));
        }
        for (const attachment of merged.removedItems) {
          transaction.set(this.firestoreOps.ref('journeyEventAttachmentCleanupQueue', attachment.id), {
            eventId: event.id,
            targetUserId: event.targetUserId,
            actorUid,
            attachment,
            createdAt: serverTimestamp(),
            attemptCount: 0,
          });
        }
        return merged.removedItems;
      });
      prepared = null;
    } catch (error) {
      if (prepared?.sessionId) await this.rollbackPrepared(prepared);
      const mapped = mapJourneyEventUpdateError(error);
      if (mapped) throw mapped;
      const validationError = mapJourneyEventAttachmentValidationError(error);
      if (validationError) throw validationError;
      throw this.friendly('事件與附件未能更新，原資料未變更。', error);
    }
    await this.processCommittedCleanup(removed, '事件已更新，但部分附件清理失敗，已保留清理佇列供稍後重試。');
  }

  async delete(event: UserJourneyEvent, actorUid: string): Promise<void> {
    const eventRef = this.firestoreOps.ref('userJourneyEvents', event.id);
    let removed: AttachmentMetadata[] = [];
    try {
      removed = await this.firestoreOps.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(eventRef);
        if (!snapshot.exists()) throw new Error('event-not-found');
        const current = { id: snapshot.id, ...(snapshot.data() as Record<string, unknown>) } as UserJourneyEvent;
        if (!hasMatchingJourneyEventUpdatedAt(current.updatedAt, event.updatedAt)) throw new Error('event-conflict');
        const attachments = (current.attachments ?? []).flatMap((attachment) => {
          const recovered = recoverJourneyEventAttachmentMetadata(attachment, actorUid);
          if (recovered) return [recovered];
          console.error('事件含有無效附件 metadata，刪除事件時略過 cleanup queue 建立', {
            eventId: current.id,
            storagePath: (attachment as Partial<AttachmentMetadata> | null)?.storagePath,
            attachment,
          });
          return [];
        });
        transaction.set(this.firestoreOps.ref('userJourneyEventAudits', current.deleteAuditId), this.audit(
          current.id, current.targetUserId, 'delete', actorUid, current.title, [], attachments
        ));
        for (const attachment of attachments) {
          transaction.set(this.firestoreOps.ref('journeyEventAttachmentCleanupQueue', attachment.id), {
            eventId: current.id,
            targetUserId: current.targetUserId,
            actorUid,
            attachment,
            createdAt: serverTimestamp(),
            attemptCount: 0,
          });
        }
        transaction.delete(eventRef);
        return attachments;
      });
    } catch (error) {
      const mapped = mapJourneyEventUpdateError(error);
      if (mapped) throw mapped;
      throw this.friendly('事件未能刪除，原資料未變更。', error);
    }
    await this.processCommittedCleanup(removed, '事件已刪除，但部分附件清理失敗，已保留清理佇列供稍後重試。');
  }

  private async prepareUploads(
    eventId: string,
    targetUserId: string,
    actorUid: string,
    files: readonly File[]
  ): Promise<PreparedAttachmentBatch> {
    if (!files.length) return { sessionId: null, attachments: [] };
    if (files.length > MAX_ATTACHMENT_COUNT) throw new Error('too-many-files');
    for (const file of files) {
      const validationError = await validateAttachmentFile(file);
      if (validationError) throw new Error(validationError);
    }
    const sessionRef = this.firestoreOps.uploadSessionRef();
    const planned = files.map((file) => {
      const id = crypto.randomUUID();
      return {
        id,
        storagePath: this.storage.journeyEventAttachmentPath(targetUserId, eventId, sessionRef.id, id),
        originalName: file.name,
        contentType: file.type as AttachmentContentType,
        size: file.size,
        uploadedBy: actorUid,
      };
    });
    await this.firestoreOps.setDoc(sessionRef, {
      eventId,
      targetUserId,
      actorUid,
      status: 'uploading',
      plannedAttachments: planned,
      plannedPaths: planned.map((item) => item.storagePath),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    const uploadResults = await Promise.allSettled(
      planned.map(async (item, index) => {
        const pendingAttachment: AttachmentMetadata = { ...item, uploadedAt: Timestamp.now() };
        await firstValueFrom(this.storage.uploadJourneyEventAttachment(
          pendingAttachment, files[index], { targetUserId, eventId }
        ));
        return { ...pendingAttachment, uploadedAt: Timestamp.now() };
      })
    );
    const attachments = uploadResults.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
    const failedUpload = uploadResults.find((result): result is PromiseRejectedResult => result.status === 'rejected');
    if (failedUpload) {
      try {
        await this.rollbackPreparedPaths(sessionRef.id, planned);
      } catch (rollbackError) {
        console.error('事件附件平行上傳失敗後回滾未完全成功', {
          sessionId: sessionRef.id,
          eventId,
          targetUserId,
          rollbackError,
        });
      }
      throw failedUpload.reason;
    }
    return { sessionId: sessionRef.id, attachments };
  }

  private async rollbackPrepared(batch: PreparedAttachmentBatch): Promise<void> {
    await this.rollbackPreparedPaths(batch.sessionId, batch.attachments);
  }

  private async rollbackPreparedPaths(
    sessionId: string | null,
    attachments: readonly Pick<AttachmentMetadata, 'id' | 'storagePath'>[]
  ): Promise<void> {
    if (!sessionId) return;
    let failed = false;
    for (const attachment of attachments) {
      try {
        await firstValueFrom(this.storage.deleteAttachment(attachment.storagePath));
      } catch (error) {
        failed = true;
        console.error('事件附件上傳回滾清理失敗', {
          sessionId,
          attachmentId: attachment.id,
          storagePath: attachment.storagePath,
          errorCode: this.errorCode(error),
        });
      }
    }
    const sessionRef = this.firestoreOps.ref('journeyEventAttachmentUploadSessions', sessionId);
    if (failed) {
      await this.bestEffort(
        () => this.firestoreOps.updateDoc(sessionRef, {
          status: 'cleanup-pending',
          updatedAt: serverTimestamp(),
          lastErrorCode: 'cleanup-failed',
        }),
        '事件附件上傳回滾 session 狀態更新失敗',
        { sessionId }
      );
    } else {
      await this.bestEffort(
        () => this.firestoreOps.deleteDoc(sessionRef),
        '事件附件上傳回滾 session 移除失敗',
        { sessionId }
      );
    }
  }

  private async processCommittedCleanup(attachments: readonly AttachmentMetadata[], warningMessage: string): Promise<void> {
    const results = await Promise.all(attachments.map((attachment) => this.processCleanup(attachment)));
    if (results.some((cleaned) => !cleaned)) {
      console.warn(warningMessage);
    }
  }

  private async processCleanup(attachment: AttachmentMetadata): Promise<boolean> {
    const queueRef = this.firestoreOps.ref('journeyEventAttachmentCleanupQueue', attachment.id);
    return processJourneyEventAttachmentCleanup(attachment, {
      deleteAttachment: () => firstValueFrom(this.storage.deleteAttachment(attachment.storagePath)),
      deleteQueue: () => this.firestoreOps.deleteDoc(queueRef),
      recordFailure: (lastErrorCode, context) => this.recordCleanupFailure(queueRef, lastErrorCode, context),
      errorCode: (error) => this.errorCode(error),
    });
  }

  private async recordCleanupFailure(
    queueRef: JourneyEventDocRef,
    lastErrorCode: 'storage-delete-failed' | 'queue-delete-failed',
    context: Record<string, unknown>
  ): Promise<void> {
    await this.bestEffort(
      () => this.firestoreOps.updateDoc(queueRef, {
        attemptCount: increment(1),
        lastAttemptAt: serverTimestamp(),
        lastErrorCode,
      }),
      '事件附件清理佇列更新失敗',
      { ...context, lastErrorCode }
    );
  }

  private audit(
    eventId: string,
    targetUserId: string,
    action: 'create' | 'update' | 'delete',
    actorUid: string,
    title: string,
    changedFields: string[],
    attachments: readonly AttachmentMetadata[]
  ) {
    return {
      eventId,
      targetUserId,
      action,
      actorUid,
      actionAt: serverTimestamp(),
      title,
      changedFields,
      attachmentSummary: attachments.map(({ id, originalName, size }) => ({ id, originalName, size })),
    };
  }

  private friendly(message: string, error: unknown): Error {
    console.error(message, error);
    return new Error(message);
  }

  private errorCode(error: unknown): string {
    if (typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string') {
      return error.code;
    }
    if (error instanceof Error && /^[a-z]+(?:[/-][a-z]+)+$/.test(error.message)) {
      return error.message;
    }
    return error instanceof Error ? error.name : 'unknown';
  }

  private async bestEffort(
    operation: () => Promise<void>,
    message: string,
    context: Record<string, unknown>
  ): Promise<void> {
    try {
      await operation();
    } catch (error) {
      console.error(message, { ...context, errorCode: this.errorCode(error) });
    }
  }
}
