import { Injectable, inject } from '@angular/core';
import {
  DocumentData,
  Firestore,
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  increment,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from '@angular/fire/firestore';
import { Observable, firstValueFrom, from } from 'rxjs';

import {
  AttachmentChanges,
  AttachmentContentType,
  AttachmentMetadata,
  EMPTY_ATTACHMENT_BATCH,
  MAX_ATTACHMENT_COUNT,
  PreparedAttachmentBatch,
  RequestKind,
  UploadedAttachmentBatch,
} from '../attachments/attachment.models';
import {
  attachmentErrorCode,
  processAttachmentCleanup,
  rollbackPreparedAttachments,
} from '../attachments/attachment-session';
import { StorageService } from './storage.service';
import { validateAttachmentFile } from '../utils/attachment-validation';

interface CreateRequestOptions<T> {
  kind: RequestKind;
  collectionName: 'attendanceLogs' | 'subsidyApplications';
  data: T & { userId: string };
  actorUid: string;
  files: readonly File[];
}

interface UpdateRequestOptions<T> {
  kind: RequestKind;
  collectionName: 'attendanceLogs' | 'subsidyApplications';
  requestId: string;
  patch: T;
  ownerUid: string;
  actorUid: string;
  changes: AttachmentChanges;
}

export function mergeAttachmentChanges(
  current: readonly AttachmentMetadata[],
  removedIds: readonly string[],
  additions: readonly AttachmentMetadata[]
): { finalItems: AttachmentMetadata[]; removedItems: AttachmentMetadata[] } {
  const removeSet = new Set(removedIds);
  if ([...removeSet].some((id) => !current.some((item) => item.id === id))) {
    throw new Error('attachment-conflict');
  }
  const removedItems = current.filter((item) => removeSet.has(item.id));
  const finalItems = current.filter((item) => !removeSet.has(item.id)).concat(additions);
  if (finalItems.length > MAX_ATTACHMENT_COUNT) throw new Error('attachment-count-conflict');
  return { finalItems, removedItems };
}

export function hasRequestFieldChanges(patch: unknown): boolean {
  return typeof patch === 'object' && patch !== null && Object.keys(patch).length > 0;
}

export function exceedsAttachmentLimit(changes: AttachmentChanges): boolean {
  const existingIds = new Set(changes.existingAttachmentIds);
  const removedCount = new Set(changes.removedAttachmentIds.filter((id) => existingIds.has(id))).size;
  return existingIds.size - removedCount + changes.newFiles.length > MAX_ATTACHMENT_COUNT;
}

@Injectable({ providedIn: 'root' })
export class AttachmentService {
  private readonly firestore = inject(Firestore);
  private readonly storage = inject(StorageService);

  createRequest<T>(options: CreateRequestOptions<T>): Observable<string> {
    return from(this.createRequestAsync(options));
  }

  updateRequest<T>(options: UpdateRequestOptions<T>): Observable<void> {
    return from(this.updateRequestAsync(options));
  }

  loadPreview(attachment: AttachmentMetadata): Observable<Blob> {
    return this.storage.getAttachmentBlob(attachment);
  }

  private async createRequestAsync<T>(options: CreateRequestOptions<T>): Promise<string> {
    const requestRef = doc(collection(this.firestore, options.collectionName));
    let prepared: PreparedAttachmentBatch | null = null;
    try {
      prepared = await this.prepareUploads(
        options.kind,
        requestRef.id,
        options.data.userId,
        options.actorUid,
        options.files
      );
      const batch = writeBatch(this.firestore);
      batch.set(requestRef, { ...options.data, attachments: prepared.attachments });
      batch.set(doc(collection(requestRef, 'auditTrail')), {
        action: '建立', actionBy: options.actorUid, actionDateTime: serverTimestamp(),
      });
      if (prepared.attachments.length) {
        batch.set(doc(collection(requestRef, 'auditTrail')), this.audit('新增附件', options.actorUid, prepared.attachments));
        if (prepared.sessionId !== null) {
          batch.delete(doc(this.firestore, 'requestAttachmentUploadSessions', prepared.sessionId));
        }
      }
      await batch.commit();
      return requestRef.id;
    } catch (error) {
      if (prepared && prepared.sessionId !== null) await this.rollbackPrepared(prepared);
      throw this.friendlyError('申請與附件未能儲存，原資料未變更。', error);
    }
  }

  private async updateRequestAsync<T>(options: UpdateRequestOptions<T>): Promise<void> {
    let prepared: PreparedAttachmentBatch | null = null;
    const requestRef = doc(this.firestore, options.collectionName, options.requestId);
    try {
      // UI 已在選檔時驗證；此處再於上傳前阻擋，避免明顯超量仍浪費頻寬。
      if (exceedsAttachmentLimit(options.changes)) throw new Error('too-many-files');
      prepared = await this.prepareUploads(
        options.kind, options.requestId, options.ownerUid, options.actorUid, options.changes.newFiles
      );
      const preparedBatch = prepared;
      const removed = await runTransaction(this.firestore, async (transaction) => {
        const snapshot = await transaction.get(requestRef);
        if (!snapshot.exists()) throw new Error('request-not-found');
        const current = snapshot.data() as { attachments?: AttachmentMetadata[] };
        const attachments = current.attachments ?? [];
        const { finalItems, removedItems } = mergeAttachmentChanges(
          attachments,
          options.changes.removedAttachmentIds,
          preparedBatch.attachments
        );

        transaction.update(requestRef, { ...options.patch as object, attachments: finalItems, updatedAt: serverTimestamp() });
        // 純附件異動由附件專屬 audit 完整記錄，不再另寫一筆空的「更新」。
        if (hasRequestFieldChanges(options.patch)) {
          transaction.set(doc(collection(requestRef, 'auditTrail')), {
            action: '更新', actionBy: options.actorUid, actionDateTime: serverTimestamp(), content: JSON.stringify(options.patch),
          });
        }
        if (preparedBatch.attachments.length) {
          transaction.set(doc(collection(requestRef, 'auditTrail')), this.audit('新增附件', options.actorUid, preparedBatch.attachments));
          if (preparedBatch.sessionId !== null) {
            transaction.delete(doc(this.firestore, 'requestAttachmentUploadSessions', preparedBatch.sessionId));
          }
        }
        if (removedItems.length) {
          transaction.set(doc(collection(requestRef, 'auditTrail')), this.audit('刪除附件', options.actorUid, removedItems));
          for (const attachment of removedItems) {
            transaction.set(doc(this.firestore, 'requestAttachmentCleanupQueue', attachment.id), {
              requestKind: options.kind, requestId: options.requestId, ownerUid: options.ownerUid,
              actorUid: options.actorUid, attachment, createdAt: serverTimestamp(), attemptCount: 0,
            });
          }
        }
        return removedItems;
      });

      // Transaction 已正式接管新附件；後續治理失敗不得再回滾已提交的檔案。
      prepared = null;
      const cleanupResults = await Promise.all(removed.map((attachment) => this.processCleanup(attachment)));
      if (cleanupResults.some((cleaned) => !cleaned)) {
        console.warn('申請已更新，但部分附件清理失敗，已保留清理佇列供稍後重試。');
      }
    } catch (error) {
      if (prepared && prepared.sessionId !== null) await this.rollbackPrepared(prepared);
      throw this.friendlyError(
        this.updateErrorMessage(error),
        error
      );
    }
  }

  private async prepareUploads(
    kind: RequestKind,
    requestId: string,
    ownerUid: string,
    actorUid: string,
    files: readonly File[]
  ): Promise<PreparedAttachmentBatch> {
    if (!files.length) return EMPTY_ATTACHMENT_BATCH;
    if (files.length > MAX_ATTACHMENT_COUNT) throw new Error('too-many-files');
    for (const file of files) {
      const validationError = await validateAttachmentFile(file);
      if (validationError) throw new Error(validationError);
    }
    const sessionRef = doc(collection(this.firestore, 'requestAttachmentUploadSessions'));
    const planned = files.map((file) => {
      const id = crypto.randomUUID();
      return {
        id,
        storagePath: this.storage.attachmentPath(kind, requestId, sessionRef.id, id),
        originalName: file.name,
        contentType: file.type as AttachmentContentType,
        size: file.size,
        uploadedBy: actorUid,
      };
    });
    await setDoc(sessionRef, {
      requestKind: kind, requestId, ownerUid, actorUid, status: 'uploading',
      plannedAttachments: planned, plannedPaths: planned.map((item) => item.storagePath),
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    const session = await getDoc(sessionRef);
    const uploadedAt = (session.data()?.['createdAt'] as Timestamp | undefined) ?? Timestamp.now();
    const attachments = planned.map((item) => ({ ...item, uploadedAt }));
    await this.uploadPreparedFiles(
      { sessionId: sessionRef.id, attachments },
      files,
      { requestKind: kind, requestId, ownerUid }
    );
    return { sessionId: sessionRef.id, attachments };
  }

  private async uploadPreparedFiles(
    batch: UploadedAttachmentBatch,
    files: readonly File[],
    metadata: { requestKind: RequestKind; requestId: string; ownerUid: string }
  ): Promise<void> {
    const uploaded: AttachmentMetadata[] = [];
    try {
      for (let i = 0; i < batch.attachments.length; i++) {
        await firstValueFrom(this.storage.uploadAttachment(batch.attachments[i], files[i], metadata));
        uploaded.push(batch.attachments[i]);
      }
    } catch (error) {
      await this.rollbackPrepared({ sessionId: batch.sessionId, attachments: uploaded });
      throw error;
    }
  }

  private async rollbackPrepared(batch: UploadedAttachmentBatch): Promise<void> {
    const sessionRef = doc(this.firestore, 'requestAttachmentUploadSessions', batch.sessionId);
    await rollbackPreparedAttachments(batch.attachments, {
      deleteAttachment: (storagePath) => firstValueFrom(this.storage.deleteAttachment(storagePath)),
      onDeleteError: (attachment, error) => console.error('附件回復清理失敗', {
        sessionId: batch.sessionId,
        attachmentId: attachment.id,
        errorCode: this.errorCode(error),
      }),
      markSessionCleanupPending: () => this.bestEffort(
        () => updateDoc(sessionRef, { status: 'cleanup-pending', updatedAt: serverTimestamp(), lastErrorCode: 'cleanup-failed' }),
        '附件回復狀態更新失敗',
        { sessionId: batch.sessionId }
      ),
      deleteSession: () => this.bestEffort(
        () => deleteDoc(sessionRef),
        '附件回復 session 移除失敗',
        { sessionId: batch.sessionId }
      ),
    });
  }

  private processCleanup(attachment: AttachmentMetadata): Promise<boolean> {
    const queueRef = doc(this.firestore, 'requestAttachmentCleanupQueue', attachment.id);
    return processAttachmentCleanup(attachment, {
      deleteAttachment: (storagePath) => firstValueFrom(this.storage.deleteAttachment(storagePath)),
      deleteQueue: () => deleteDoc(queueRef),
      // 刻意保留 request domain 既有寫入語意，與 journey 的 recordFailure 在此分歧：
      // - storage-delete-failed：更新 queue 文件（attemptCount++ / lastErrorCode），維持原有重試治理。
      // - queue-delete-failed：僅記錄 log，不寫回文件。此為既有行為；request domain 的 cleanup queue
      //   不依賴 queue 文件本身的 attemptCount/lastErrorCode 來判斷 queue 刪除重試，且該文件本就刪除失敗，
      //   再對其 updateDoc 並無治理價值。統一兩 domain 的寫入語意留待後續 adapter 增量處理。
      recordFailure: (lastErrorCode, context) => {
        if (lastErrorCode === 'storage-delete-failed') {
          return this.bestEffort(
            () => updateDoc(queueRef, { attemptCount: increment(1), lastAttemptAt: serverTimestamp(), lastErrorCode }),
            '附件清理佇列更新失敗',
            context
          );
        }
        console.error('附件已清理但佇列移除失敗', context);
        return Promise.resolve();
      },
      errorCode: (error) => this.errorCode(error),
    });
  }

  private audit(action: '新增附件' | '刪除附件', actorUid: string, attachments: readonly AttachmentMetadata[]): DocumentData {
    return {
      action, actionBy: actorUid, actionDateTime: serverTimestamp(),
      content: JSON.stringify({ attachments: attachments.map(({ id, originalName, size, contentType }) => ({ id, originalName, size, contentType })) }),
    };
  }

  private friendlyError(message: string, error: unknown): Error {
    console.error(message, error);
    return new Error(message);
  }

  private errorCode(error: unknown): string {
    return attachmentErrorCode(error);
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

  private updateErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message === 'attachment-conflict') {
      return '附件已被其他人變更，請重新載入後再試。';
    }
    if (error instanceof Error && error.message === 'attachment-count-conflict') {
      return '另一個視窗已新增附件，請重新載入後再試。';
    }
    if (error instanceof Error && error.message === 'too-many-files') {
      return '每筆申請最多五個附件，請刪除部分附件後再試。';
    }
    return '申請與附件未能更新，原資料未變更。';
  }
}
