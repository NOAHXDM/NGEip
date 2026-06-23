import { Injectable, inject } from '@angular/core';
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
  AttachmentValidationError,
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

export function normalizeJourneyEventInput(input: JourneyEventInput): JourneyEventInput & { eventDate: Timestamp } {
  const title = input.title.trim();
  const content = input.content.trim();
  if (!title || title.length > 100 || !content || content.length > 5000) {
    throw new Error('invalid-event-fields');
  }
  return {
    targetUserId: input.targetUserId,
    eventDate: input.eventDate instanceof Timestamp ? input.eventDate : Timestamp.fromDate(input.eventDate),
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
  const messages: Partial<Record<AttachmentValidationError, string>> = {
    'unsupported-extension': '僅支援 PDF、JPEG、PNG、WebP 檔案。',
    'unsupported-mime': '附件格式不支援，僅接受 PDF、JPEG、PNG、WebP。',
    'signature-mismatch': '附件內容與宣告格式不符，請重新選擇檔案。',
    'empty-file': '不可上傳空白附件。',
    'file-too-large': '附件超過 3 MiB 上限。',
    'too-many-files': '每筆事件最多五個附件，請刪除部分附件後再試。',
  };
  return error.message in messages
    ? new Error(messages[error.message as AttachmentValidationError])
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
  private readonly firestore = inject(Firestore);
  private readonly storage = inject(StorageService);

  create(input: JourneyEventInput, actorUid: string, files: readonly File[]): Promise<string> {
    return this.createAsync(input, actorUid, files);
  }

  update(
    event: UserJourneyEvent,
    input: JourneyEventInput,
    actorUid: string,
    files: readonly File[],
    removedAttachmentIds: readonly string[]
  ): Promise<void> {
    return this.updateAsync(event, input, actorUid, files, removedAttachmentIds);
  }

  delete(event: UserJourneyEvent, actorUid: string): Promise<void> {
    return this.deleteAsync(event, actorUid);
  }

  private async createAsync(
    input: JourneyEventInput,
    actorUid: string,
    files: readonly File[]
  ): Promise<string> {
    const eventRef = doc(collection(this.firestore, 'userJourneyEvents'));
    const lastAuditId = crypto.randomUUID();
    const deleteAuditId = crypto.randomUUID();
    let prepared: PreparedAttachmentBatch | null = null;
    try {
      prepared = await this.prepareUploads(eventRef.id, input.targetUserId, actorUid, files);
      const normalized = normalizeJourneyEventInput(input);
      const batch = writeBatch(this.firestore);
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
      batch.set(doc(this.firestore, 'userJourneyEventAudits', lastAuditId), this.audit(
        eventRef.id, normalized.targetUserId, 'create', actorUid, normalized.title,
        ['eventDate', 'title', 'content', 'attachments'], prepared.attachments
      ));
      if (prepared.sessionId) {
        batch.delete(doc(this.firestore, 'journeyEventAttachmentUploadSessions', prepared.sessionId));
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

  private async updateAsync(
    event: UserJourneyEvent,
    input: JourneyEventInput,
    actorUid: string,
    files: readonly File[],
    removedAttachmentIds: readonly string[]
  ): Promise<void> {
    const eventRef = doc(this.firestore, 'userJourneyEvents', event.id);
    const lastAuditId = crypto.randomUUID();
    let prepared: PreparedAttachmentBatch | null = null;
    let removed: AttachmentMetadata[] = [];
    try {
      if (exceedsJourneyEventAttachmentLimit(event, removedAttachmentIds, files)) throw new Error('too-many-files');
      prepared = await this.prepareUploads(event.id, event.targetUserId, actorUid, files);
      const normalized = normalizeJourneyEventInput(input);
      const preparedBatch = prepared;
      removed = await runTransaction(this.firestore, async (transaction) => {
        const snapshot = await transaction.get(eventRef);
        if (!snapshot.exists()) throw new Error('event-not-found');
        const current = { id: snapshot.id, ...snapshot.data() } as UserJourneyEvent;
        if (current.updatedAt?.toMillis() !== event.updatedAt?.toMillis()) throw new Error('event-conflict');
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
        transaction.set(doc(this.firestore, 'userJourneyEventAudits', lastAuditId), this.audit(
          event.id, event.targetUserId, 'update', actorUid, normalized.title,
          changedJourneyEventFields(current, normalized, merged.removedItems, preparedBatch.attachments),
          merged.finalItems
        ));
        if (preparedBatch.sessionId) {
          transaction.delete(doc(this.firestore, 'journeyEventAttachmentUploadSessions', preparedBatch.sessionId));
        }
        for (const attachment of merged.removedItems) {
          transaction.set(doc(this.firestore, 'journeyEventAttachmentCleanupQueue', attachment.id), {
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

  private async deleteAsync(event: UserJourneyEvent, actorUid: string): Promise<void> {
    const eventRef = doc(this.firestore, 'userJourneyEvents', event.id);
    let removed: AttachmentMetadata[] = [];
    try {
      removed = await runTransaction(this.firestore, async (transaction) => {
        const snapshot = await transaction.get(eventRef);
        if (!snapshot.exists()) throw new Error('event-not-found');
        const current = { id: snapshot.id, ...snapshot.data() } as UserJourneyEvent;
        if (current.updatedAt?.toMillis() !== event.updatedAt?.toMillis()) throw new Error('event-conflict');
        transaction.set(doc(this.firestore, 'userJourneyEventAudits', current.deleteAuditId), this.audit(
          current.id, current.targetUserId, 'delete', actorUid, current.title, [], current.attachments ?? []
        ));
        for (const attachment of current.attachments ?? []) {
          transaction.set(doc(this.firestore, 'journeyEventAttachmentCleanupQueue', attachment.id), {
            eventId: current.id,
            targetUserId: current.targetUserId,
            actorUid,
            attachment,
            createdAt: serverTimestamp(),
            attemptCount: 0,
          });
        }
        transaction.delete(eventRef);
        return current.attachments ?? [];
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
    const sessionRef = doc(collection(this.firestore, 'journeyEventAttachmentUploadSessions'));
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
    await setDoc(sessionRef, {
      eventId,
      targetUserId,
      actorUid,
      status: 'uploading',
      plannedAttachments: planned,
      plannedPaths: planned.map((item) => item.storagePath),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    const uploadedAt = Timestamp.now();
    const attachments: AttachmentMetadata[] = planned.map((item) => ({ ...item, uploadedAt }));
    const uploaded: AttachmentMetadata[] = [];
    try {
      for (let index = 0; index < attachments.length; index++) {
        await firstValueFrom(this.storage.uploadJourneyEventAttachment(
          attachments[index], files[index], { targetUserId, eventId }
        ));
        uploaded.push(attachments[index]);
      }
    } catch (error) {
      await this.rollbackPrepared({ sessionId: sessionRef.id, attachments: uploaded });
      throw error;
    }
    return { sessionId: sessionRef.id, attachments };
  }

  private async rollbackPrepared(batch: PreparedAttachmentBatch): Promise<void> {
    if (!batch.sessionId) return;
    let failed = false;
    for (const attachment of batch.attachments) {
      try {
        await firstValueFrom(this.storage.deleteAttachment(attachment.storagePath));
      } catch (error) {
        failed = true;
        console.error('事件附件上傳回滾清理失敗', {
          sessionId: batch.sessionId,
          attachmentId: attachment.id,
          storagePath: attachment.storagePath,
          errorCode: this.errorCode(error),
        });
      }
    }
    const sessionRef = doc(this.firestore, 'journeyEventAttachmentUploadSessions', batch.sessionId);
    if (failed) {
      await this.bestEffort(
        () => updateDoc(sessionRef, {
          status: 'cleanup-pending',
          updatedAt: serverTimestamp(),
          lastErrorCode: 'cleanup-failed',
        }),
        '事件附件上傳回滾 session 狀態更新失敗',
        { sessionId: batch.sessionId }
      );
    } else {
      await this.bestEffort(
        () => deleteDoc(sessionRef),
        '事件附件上傳回滾 session 移除失敗',
        { sessionId: batch.sessionId }
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
    const queueRef = doc(this.firestore, 'journeyEventAttachmentCleanupQueue', attachment.id);
    return processJourneyEventAttachmentCleanup(attachment, {
      deleteAttachment: () => firstValueFrom(this.storage.deleteAttachment(attachment.storagePath)),
      deleteQueue: () => deleteDoc(queueRef),
      recordFailure: (lastErrorCode, context) => this.recordCleanupFailure(queueRef, lastErrorCode, context),
      errorCode: (error) => this.errorCode(error),
    });
  }

  private async recordCleanupFailure(
    queueRef: ReturnType<typeof doc>,
    lastErrorCode: 'storage-delete-failed' | 'queue-delete-failed',
    context: Record<string, unknown>
  ): Promise<void> {
    await this.bestEffort(
      () => updateDoc(queueRef, {
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
