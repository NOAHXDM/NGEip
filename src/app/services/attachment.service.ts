import { Injectable, inject } from '@angular/core';
import {
  DocumentData,
  DocumentReference,
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
  MAX_ATTACHMENT_COUNT,
  PreparedAttachmentBatch,
  RequestKind,
} from '../attachments/attachment.models';
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
        batch.delete(doc(this.firestore, 'requestAttachmentUploadSessions', prepared.sessionId));
      }
      await batch.commit();
      return requestRef.id;
    } catch (error) {
      if (prepared?.sessionId) await this.rollbackPrepared(prepared);
      throw this.friendlyError('申請與附件未能儲存，原資料未變更。', error);
    }
  }

  private async updateRequestAsync<T>(options: UpdateRequestOptions<T>): Promise<void> {
    let prepared: PreparedAttachmentBatch | null = null;
    const requestRef = doc(this.firestore, options.collectionName, options.requestId);
    try {
      prepared = await this.prepareUploads(
        options.kind, options.requestId, options.ownerUid, options.actorUid, options.changes.newFiles
      );
      const preparedBatch = prepared;
      const removed = await runTransaction(this.firestore, async (transaction) => {
        const snapshot = await transaction.get(requestRef);
        if (!snapshot.exists()) throw new Error('request-not-found');
        const current = snapshot.data() as { attachments?: AttachmentMetadata[] };
        const attachments = current.attachments ?? [];
        const removeSet = new Set(options.changes.removedAttachmentIds);
        if ([...removeSet].some((id) => !attachments.some((item) => item.id === id))) {
          throw new Error('attachment-conflict');
        }
        const removedItems = attachments.filter((item) => removeSet.has(item.id));
        const finalItems = attachments.filter((item) => !removeSet.has(item.id)).concat(preparedBatch.attachments);
        if (finalItems.length > MAX_ATTACHMENT_COUNT) throw new Error('too-many-files');

        transaction.update(requestRef, { ...options.patch as object, attachments: finalItems, updatedAt: serverTimestamp() });
        transaction.set(doc(collection(requestRef, 'auditTrail')), {
          action: '更新', actionBy: options.actorUid, actionDateTime: serverTimestamp(), content: JSON.stringify(options.patch),
        });
        if (preparedBatch.attachments.length) {
          transaction.set(doc(collection(requestRef, 'auditTrail')), this.audit('新增附件', options.actorUid, preparedBatch.attachments));
          transaction.delete(doc(this.firestore, 'requestAttachmentUploadSessions', preparedBatch.sessionId));
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

      for (const attachment of removed) await this.processCleanup(attachment);
    } catch (error) {
      if (prepared?.sessionId) await this.rollbackPrepared(prepared);
      throw this.friendlyError(
        error instanceof Error && error.message === 'attachment-conflict'
          ? '附件已被其他人變更，請重新載入後再試。'
          : '申請與附件未能更新，原資料未變更。',
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
    if (!files.length) return { sessionId: '', attachments: [] };
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
    const uploaded: AttachmentMetadata[] = [];
    try {
      for (let i = 0; i < attachments.length; i++) {
        await firstValueFrom(this.storage.uploadAttachment(attachments[i], files[i], {
          requestKind: kind,
          requestId,
          ownerUid,
        }));
        uploaded.push(attachments[i]);
      }
      return { sessionId: sessionRef.id, attachments };
    } catch (error) {
      await this.rollbackPrepared({ sessionId: sessionRef.id, attachments: uploaded });
      throw error;
    }
  }

  private async rollbackPrepared(batch: PreparedAttachmentBatch): Promise<void> {
    if (!batch.sessionId) return;
    let failed = false;
    for (const attachment of batch.attachments) {
      try { await firstValueFrom(this.storage.deleteAttachment(attachment.storagePath)); }
      catch { failed = true; }
    }
    const sessionRef = doc(this.firestore, 'requestAttachmentUploadSessions', batch.sessionId);
    if (failed) {
      await updateDoc(sessionRef, { status: 'cleanup-pending', updatedAt: serverTimestamp(), lastErrorCode: 'cleanup-failed' });
    } else {
      await deleteDoc(sessionRef);
    }
  }

  private async processCleanup(attachment: AttachmentMetadata): Promise<void> {
    const queueRef = doc(this.firestore, 'requestAttachmentCleanupQueue', attachment.id);
    try {
      await firstValueFrom(this.storage.deleteAttachment(attachment.storagePath));
      await deleteDoc(queueRef);
    } catch (error) {
      await updateDoc(queueRef, {
        attemptCount: increment(1),
        lastAttemptAt: serverTimestamp(),
        lastErrorCode: 'storage-delete-failed',
      });
    }
  }

  private audit(action: '新增附件' | '刪除附件', actorUid: string, attachments: AttachmentMetadata[]): DocumentData {
    return {
      action, actionBy: actorUid, actionDateTime: serverTimestamp(),
      content: JSON.stringify({ attachments: attachments.map(({ id, originalName, size, contentType }) => ({ id, originalName, size, contentType })) }),
    };
  }

  private friendlyError(message: string, error: unknown): Error {
    console.error(message, error);
    return new Error(message);
  }
}
