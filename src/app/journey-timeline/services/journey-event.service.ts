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
  if (error.message === 'attachment-conflict') {
    return new Error('附件已被其他人變更，請重新載入後再試。');
  }
  if (error.message === 'attachment-count-conflict') {
    return new Error('另一個視窗已新增附件，請重新載入後再試。');
  }
  return null;
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
      const normalized = this.normalize(input);
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
      prepared = await this.prepareUploads(event.id, event.targetUserId, actorUid, files);
      const normalized = this.normalize(input);
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
          ['eventDate', 'title', 'content', 'attachments'], merged.finalItems
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
      throw this.friendly('事件未能刪除，原資料未變更。', error);
    }
    await this.processCommittedCleanup(removed, '事件已刪除，但部分附件清理失敗，已保留清理佇列供稍後重試。');
  }

  private normalize(input: JourneyEventInput): JourneyEventInput & { eventDate: Timestamp } {
    return normalizeJourneyEventInput(input);
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
      } catch {
        failed = true;
      }
    }
    const sessionRef = doc(this.firestore, 'journeyEventAttachmentUploadSessions', batch.sessionId);
    if (failed) {
      await updateDoc(sessionRef, {
        status: 'cleanup-pending',
        updatedAt: serverTimestamp(),
        lastErrorCode: 'cleanup-failed',
      });
    } else {
      await deleteDoc(sessionRef);
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
    try {
      await firstValueFrom(this.storage.deleteAttachment(attachment.storagePath));
      await deleteDoc(queueRef);
      return true;
    } catch {
      try {
        await updateDoc(queueRef, {
          attemptCount: increment(1),
          lastAttemptAt: serverTimestamp(),
          lastErrorCode: 'storage-delete-failed',
        });
      } catch (error) {
        console.warn('附件清理佇列更新失敗', error);
      }
      return false;
    }
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
}
