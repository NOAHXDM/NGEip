import { Timestamp } from '@angular/fire/firestore';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { AttachmentMetadata } from '../../attachments/attachment.models';
import { mergeAttachmentChanges } from '../../services/attachment.service';
import { StorageService } from '../../services/storage.service';
import {
  JOURNEY_EVENT_FIRESTORE_OPS,
  JourneyEventFirestoreOps,
  JourneyEventService,
  changedJourneyEventFields,
  exceedsJourneyEventAttachmentLimit,
  hasMatchingJourneyEventUpdatedAt,
  isValidJourneyEventAttachmentMetadata,
  journeyCreateChangedFields,
  mapJourneyEventAttachmentValidationError,
  mapJourneyEventUpdateError,
  normalizeJourneyEventInput,
  processJourneyEventAttachmentCleanup,
  recoverJourneyEventAttachmentMetadata,
  toUtcDayStartTimestamp,
} from './journey-event.service';

function attachment(id: string): AttachmentMetadata {
  return {
    id,
    storagePath: `journey-event-attachments/u/e/s/${id}`,
    originalName: `${id}.pdf`,
    contentType: 'application/pdf',
    size: 1,
    uploadedBy: 'u',
    uploadedAt: Timestamp.now(),
  };
}

function eventSnapshot(data: Record<string, unknown>, id = 'event-1') {
  return {
    id,
    exists: () => true,
    data: () => data,
  };
}

function missingSnapshot(id = 'event-1') {
  return {
    id,
    exists: () => false,
    data: () => ({}),
  };
}

function createFakeFirestoreOps(snapshot = eventSnapshot({})): JourneyEventFirestoreOps & {
  batches: Array<{ sets: any[]; updates: any[]; deletes: any[]; commit: jasmine.Spy }>;
  transactions: Array<{ sets: any[]; updates: any[]; deletes: any[] }>;
  setDoc: jasmine.Spy;
  updateDoc: jasmine.Spy;
  deleteDoc: jasmine.Spy;
} {
  const batches: Array<{ sets: any[]; updates: any[]; deletes: any[]; commit: jasmine.Spy }> = [];
  const transactions: Array<{ sets: any[]; updates: any[]; deletes: any[] }> = [];
  const ref = (collectionName: string, id: string) => ({ id, path: `${collectionName}/${id}` });
  return {
    batches,
    transactions,
    eventRef: () => ref('userJourneyEvents', 'event-new'),
    uploadSessionRef: () => ref('journeyEventAttachmentUploadSessions', 'session-new'),
    ref,
    setDoc: jasmine.createSpy('setDoc').and.resolveTo(),
    updateDoc: jasmine.createSpy('updateDoc').and.resolveTo(),
    deleteDoc: jasmine.createSpy('deleteDoc').and.resolveTo(),
    writeBatch: () => {
      const batch = {
        sets: [] as any[],
        updates: [] as any[],
        deletes: [] as any[],
        commit: jasmine.createSpy('commit').and.resolveTo(),
      };
      batches.push(batch);
      return {
        set: (docRef: unknown, data: unknown) => batch.sets.push({ ref: docRef, data }),
        update: (docRef: unknown, data: unknown) => batch.updates.push({ ref: docRef, data }),
        delete: (docRef: unknown) => batch.deletes.push(docRef),
        commit: batch.commit,
      };
    },
    runTransaction: async (updateFunction) => {
      const transaction = {
        sets: [] as any[],
        updates: [] as any[],
        deletes: [] as any[],
      };
      transactions.push(transaction);
      return updateFunction({
        get: async () => snapshot,
        set: (docRef: unknown, data: unknown) => transaction.sets.push({ ref: docRef, data }),
        update: (docRef: unknown, data: unknown) => transaction.updates.push({ ref: docRef, data }),
        delete: (docRef: unknown) => transaction.deletes.push(docRef),
      } as any);
    },
  };
}

function createService(
  ops: JourneyEventFirestoreOps,
  storage = jasmine.createSpyObj<StorageService>('StorageService', [
    'journeyEventAttachmentPath',
    'uploadJourneyEventAttachment',
    'deleteAttachment',
  ])
) {
  TestBed.resetTestingModule();
  storage.journeyEventAttachmentPath.and.callFake(
    (targetUserId: string, eventId: string, sessionId: string, attachmentId: string) =>
      `journey-event-attachments/${targetUserId}/${eventId}/${sessionId}/${attachmentId}`
  );
  storage.uploadJourneyEventAttachment.and.returnValue(of(undefined));
  storage.deleteAttachment.and.returnValue(of(undefined));
  TestBed.configureTestingModule({
    providers: [
      JourneyEventService,
      { provide: JOURNEY_EVENT_FIRESTORE_OPS, useValue: ops },
      { provide: StorageService, useValue: storage },
    ],
  });
  return { service: TestBed.inject(JourneyEventService), storage };
}

describe('JourneyEvent attachment rules', () => {
  it('新增與刪除後產生正確最終集合', () => {
    const result = mergeAttachmentChanges(
      [attachment('a'), attachment('b')],
      ['a'],
      [attachment('c')]
    );
    expect(result.finalItems.map((item) => item.id)).toEqual(['b', 'c']);
    expect(result.removedItems.map((item) => item.id)).toEqual(['a']);
  });

  it('過期附件 ID 視為衝突', () => {
    expect(() => mergeAttachmentChanges([attachment('a')], ['missing'], []))
      .toThrowError('attachment-conflict');
  });

  it('最終附件不得超過五個', () => {
    const existing = ['a', 'b', 'c', 'd', 'e'].map(attachment);
    expect(() => mergeAttachmentChanges(existing, [], [attachment('f')]))
      .toThrowError('attachment-count-conflict');
  });
});

describe('JourneyEventService business rules', () => {
  it('正規化事件輸入時會 trim 文字並轉成 Timestamp', () => {
    const result = normalizeJourneyEventInput({
      targetUserId: 'u1',
      eventDate: new Date('2026-06-23T00:00:00Z'),
      title: '  完成訓練  ',
      content: '  通過課程  ',
    });

    expect(result.title).toBe('完成訓練');
    expect(result.content).toBe('通過課程');
    expect(result.eventDate).toEqual(jasmine.any(Timestamp));
    expect(result.eventDate.toDate().toISOString()).toBe('2026-06-23T00:00:00.000Z');
  });

  it('事件日期會正規化為 UTC 日起點，避免編輯匯入資料時保留非日界時間', () => {
    const result = toUtcDayStartTimestamp(Timestamp.fromDate(new Date('2026-06-23T09:30:00Z')));

    expect(result.toDate().toISOString()).toBe('2026-06-23T00:00:00.000Z');
  });

  it('拒絕空白或超長事件欄位', () => {
    expect(() => normalizeJourneyEventInput({
      targetUserId: 'u1',
      eventDate: new Date('2026-06-23T00:00:00Z'),
      title: '   ',
      content: '內容',
    })).toThrowError('invalid-event-fields');

    expect(() => normalizeJourneyEventInput({
      targetUserId: 'u1',
      eventDate: new Date('2026-06-23T00:00:00Z'),
      title: '標題',
      content: 'x'.repeat(5001),
    })).toThrowError('invalid-event-fields');
  });

  it('將更新衝突轉成可理解的繁體中文訊息', () => {
    expect(mapJourneyEventUpdateError(new Error('event-conflict'))?.message)
      .toBe('事件已被其他人更新，請重新載入後再試。');
    expect(mapJourneyEventUpdateError(new Error('event-not-found'))?.message)
      .toBe('事件已不存在，請重新整理頁面。');
    expect(mapJourneyEventUpdateError(new Error('attachment-conflict'))?.message)
      .toBe('附件已被其他人變更，請重新載入後再試。');
    expect(mapJourneyEventUpdateError(new Error('attachment-count-conflict'))?.message)
      .toBe('另一個視窗已新增附件，請重新載入後再試。');
    expect(mapJourneyEventUpdateError(new Error('other'))).toBeNull();
  });

  it('將附件驗證錯誤轉成可操作的繁體中文訊息', () => {
    expect(mapJourneyEventAttachmentValidationError(new Error('file-too-large'))?.message)
      .toBe('附件超過 3 MiB 上限。');
    expect(mapJourneyEventAttachmentValidationError(new Error('unsupported-mime'))?.message)
      .toBe('附件格式不支援，僅接受 PDF、JPEG、PNG、WebP。');
    expect(mapJourneyEventAttachmentValidationError(new Error('signature-mismatch'))?.message)
      .toBe('附件內容與宣告格式不符，請重新選擇檔案。');
    expect(mapJourneyEventAttachmentValidationError(new Error('invalid-event-fields'))?.message)
      .toBe('事件標題或內容格式不正確，請確認必填、字數與空白內容。');
    expect(mapJourneyEventAttachmentValidationError(new Error('other'))).toBeNull();
  });

  it('更新稽核只記錄實際變更欄位', () => {
    const current: any = {
      id: 'event-1',
      targetUserId: 'u1',
      eventDate: Timestamp.fromDate(new Date('2026-06-23T00:00:00Z')),
      title: '原標題',
      content: '原內容',
      attachments: [attachment('a')],
    };
    const normalized = {
      targetUserId: 'u1',
      eventDate: Timestamp.fromDate(new Date('2026-06-23T00:00:00Z')),
      title: '新標題',
      content: '原內容',
    };

    expect(changedJourneyEventFields(current, normalized, [], [])).toEqual(['title']);
    expect(changedJourneyEventFields(
      current,
      { ...normalized, eventDate: Timestamp.fromDate(new Date('2026-06-24T00:00:00Z')), content: '新內容' },
      [attachment('a')],
      [attachment('b')]
    )).toEqual(['eventDate', 'title', 'content', 'attachments']);
  });

  it('缺少 eventDate 的異常快照不會被誤記為 eventDate 變更', () => {
    const current: any = {
      id: 'event-1',
      targetUserId: 'u1',
      title: '標題',
      content: '內容',
      attachments: [],
    };
    const normalized = {
      targetUserId: 'u1',
      eventDate: Timestamp.fromDate(new Date('2026-06-23T00:00:00Z')),
      title: '標題',
      content: '內容',
    };

    expect(changedJourneyEventFields(current, normalized, [], [])).toEqual([]);
  });

  it('更新前會以既有附件、移除附件與新檔案預檢附件數量', () => {
    const event = { attachments: ['a', 'b', 'c', 'd'].map(attachment) };
    const files = Array.from({ length: 2 }, (_, index) => new File(['x'], `${index}.pdf`, { type: 'application/pdf' }));

    expect(exceedsJourneyEventAttachmentLimit(event, [], files)).toBeTrue();
    expect(exceedsJourneyEventAttachmentLimit(event, ['a'], files)).toBeFalse();
    expect(exceedsJourneyEventAttachmentLimit(event, ['a', 'a'], files)).toBeFalse();
    expect(exceedsJourneyEventAttachmentLimit(event, ['missing'], files)).toBeTrue();
  });

  it('建立稽核只在實際有附件時記錄 attachments 欄位', () => {
    expect(journeyCreateChangedFields([])).toEqual(['eventDate', 'title', 'content']);
    expect(journeyCreateChangedFields([attachment('a')])).toEqual(['eventDate', 'title', 'content', 'attachments']);
  });

  it('辨識完整附件 metadata，避免刪除流程使用無效 attachment id', () => {
    expect(isValidJourneyEventAttachmentMetadata(attachment('a'))).toBeTrue();
    expect(isValidJourneyEventAttachmentMetadata({ rogue: 'data' })).toBeFalse();
    expect(isValidJourneyEventAttachmentMetadata({ ...attachment('b'), id: '' })).toBeFalse();
    expect(isValidJourneyEventAttachmentMetadata({ ...attachment('c'), uploadedAt: new Date() })).toBeFalse();
  });

  it('可從含 storagePath 的歷史異常附件 metadata 補回 cleanup queue 所需欄位', () => {
    const recovered = recoverJourneyEventAttachmentMetadata({
      storagePath: 'journey-event-attachments/u/e/s/recovered',
    }, 'admin');

    expect(recovered).toEqual(jasmine.objectContaining({
      id: 'recovered',
      storagePath: 'journey-event-attachments/u/e/s/recovered',
      originalName: 'recovered.pdf',
      contentType: 'application/pdf',
      size: 1,
      uploadedBy: 'admin',
    }));
    expect(recovered?.uploadedAt).toEqual(jasmine.any(Timestamp));
    expect(recoverJourneyEventAttachmentMetadata({ rogue: 'data' }, 'admin')).toBeNull();
  });

  it('樂觀鎖只接受兩側皆為 Timestamp 且毫秒值相同', () => {
    const timestamp = Timestamp.fromMillis(1000);

    expect(hasMatchingJourneyEventUpdatedAt(timestamp, Timestamp.fromMillis(1000))).toBeTrue();
    expect(hasMatchingJourneyEventUpdatedAt(timestamp, Timestamp.fromMillis(2000))).toBeFalse();
    expect(hasMatchingJourneyEventUpdatedAt(undefined, undefined)).toBeFalse();
    expect(hasMatchingJourneyEventUpdatedAt(timestamp, undefined)).toBeFalse();
  });
});

describe('JourneyEventService public methods', () => {
  const event = {
    id: 'event-1',
    targetUserId: 'u1',
    eventDate: Timestamp.fromDate(new Date('2026-06-23T00:00:00Z')),
    title: '原標題',
    content: '原內容',
    attachments: [attachment('a')],
    createdBy: 'admin',
    createdAt: Timestamp.now(),
    updatedBy: 'admin',
    updatedAt: Timestamp.fromMillis(1000),
    lastAuditId: 'audit-old',
    deleteAuditId: 'audit-delete',
  };

  it('create 會以 batch 建立事件與 create audit', async () => {
    const ops = createFakeFirestoreOps();
    const { service } = createService(ops);

    const eventId = await service.create({
      targetUserId: 'u1',
      eventDate: new Date('2026-06-23T09:30:00Z'),
      title: '  新事件  ',
      content: '  內容  ',
    }, 'admin', []);

    expect(eventId).toBe('event-new');
    expect(ops.batches.length).toBe(1);
    expect(ops.batches[0].sets[0]).toEqual(jasmine.objectContaining({
      ref: jasmine.objectContaining({ path: 'userJourneyEvents/event-new' }),
      data: jasmine.objectContaining({
        targetUserId: 'u1',
        title: '新事件',
        content: '內容',
        attachments: [],
        createdBy: 'admin',
        updatedBy: 'admin',
      }),
    }));
    expect(ops.batches[0].sets[0].data.eventDate.toDate().toISOString()).toBe('2026-06-23T00:00:00.000Z');
    expect(ops.batches[0].sets[1]).toEqual(jasmine.objectContaining({
      ref: jasmine.objectContaining({ path: jasmine.stringMatching(/^userJourneyEventAudits\//) }),
      data: jasmine.objectContaining({
        eventId: 'event-new',
        action: 'create',
        actorUid: 'admin',
        changedFields: ['eventDate', 'title', 'content'],
      }),
    }));
    expect(ops.batches[0].commit).toHaveBeenCalled();
  });

  it('update 會檢查樂觀鎖、寫入 update audit、建立 cleanup queue 並清理移除附件', async () => {
    const current = { ...event };
    const ops = createFakeFirestoreOps(eventSnapshot(current));
    const { service, storage } = createService(ops);

    await service.update(event, {
      targetUserId: 'u1',
      eventDate: new Date('2026-06-24T00:00:00Z'),
      title: '新標題',
      content: '原內容',
    }, 'admin', [], ['a']);

    expect(ops.transactions.length).toBe(1);
    expect(ops.transactions[0].updates[0]).toEqual(jasmine.objectContaining({
      ref: jasmine.objectContaining({ path: 'userJourneyEvents/event-1' }),
      data: jasmine.objectContaining({
        title: '新標題',
        attachments: [],
        updatedBy: 'admin',
      }),
    }));
    expect(ops.transactions[0].sets.some((entry) =>
      entry.ref.path.startsWith('userJourneyEventAudits/')
      && entry.data.action === 'update'
      && entry.data.changedFields.includes('attachments')
    )).toBeTrue();
    expect(ops.transactions[0].sets.some((entry) =>
      entry.ref.path === 'journeyEventAttachmentCleanupQueue/a'
      && entry.data.attachment.id === 'a'
    )).toBeTrue();
    expect(storage.deleteAttachment).toHaveBeenCalledWith('journey-event-attachments/u/e/s/a');
    expect(ops.deleteDoc).toHaveBeenCalledWith(jasmine.objectContaining({
      path: 'journeyEventAttachmentCleanupQueue/a',
    }));
  });

  it('delete 會寫入 delete audit、建立 cleanup queue、刪除事件並清理附件', async () => {
    const current = { ...event };
    const ops = createFakeFirestoreOps(eventSnapshot(current));
    const { service, storage } = createService(ops);

    await service.delete(event, 'admin');

    expect(ops.transactions[0].sets.some((entry) =>
      entry.ref.path === 'userJourneyEventAudits/audit-delete'
      && entry.data.action === 'delete'
      && entry.data.attachmentSummary[0].id === 'a'
    )).toBeTrue();
    expect(ops.transactions[0].sets.some((entry) =>
      entry.ref.path === 'journeyEventAttachmentCleanupQueue/a'
      && entry.data.actorUid === 'admin'
    )).toBeTrue();
    expect(ops.transactions[0].deletes).toContain(jasmine.objectContaining({
      path: 'userJourneyEvents/event-1',
    }));
    expect(storage.deleteAttachment).toHaveBeenCalledWith('journey-event-attachments/u/e/s/a');
  });

  it('update 遇到樂觀鎖衝突時回傳可理解訊息', async () => {
    const stale = { ...event, updatedAt: Timestamp.fromMillis(2000) };
    const ops = createFakeFirestoreOps(eventSnapshot(stale));
    const { service } = createService(ops);

    await expectAsync(service.update(event, {
      targetUserId: 'u1',
      eventDate: event.eventDate.toDate(),
      title: '新標題',
      content: '原內容',
    }, 'admin', [], [])).toBeRejectedWithError('事件已被其他人更新，請重新載入後再試。');
  });

  it('create 上傳失敗時會回滾所有 planned storage paths 並移除 session', async () => {
    const ops = createFakeFirestoreOps(missingSnapshot());
    const storage = jasmine.createSpyObj<StorageService>('StorageService', [
      'journeyEventAttachmentPath',
      'uploadJourneyEventAttachment',
      'deleteAttachment',
    ]);
    storage.journeyEventAttachmentPath.and.callFake(
      (targetUserId: string, eventId: string, sessionId: string, attachmentId: string) =>
        `journey-event-attachments/${targetUserId}/${eventId}/${sessionId}/${attachmentId}`
    );
    storage.deleteAttachment.and.returnValue(of(undefined));
    const { service } = createService(ops, storage);
    storage.uploadJourneyEventAttachment.and.returnValue(throwError(() => new Error('storage/retry-limit-exceeded')));
    const file = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])], 'proof.pdf', {
      type: 'application/pdf',
    });

    await expectAsync(service.create({
      targetUserId: 'u1',
      eventDate: new Date('2026-06-23T00:00:00Z'),
      title: '事件',
      content: '內容',
    }, 'admin', [file])).toBeRejectedWithError('事件與附件未能建立，請稍後重試。');

    expect(storage.deleteAttachment).toHaveBeenCalledWith(jasmine.stringMatching(
      /^journey-event-attachments\/u1\/event-new\/session-new\//
    ));
    expect(ops.deleteDoc).toHaveBeenCalledWith(jasmine.objectContaining({
      path: 'journeyEventAttachmentUploadSessions/session-new',
    }));
  });
});

describe('processJourneyEventAttachmentCleanup', () => {
  function operations(options: {
    deleteAttachment?: () => Promise<void>;
    deleteQueue?: () => Promise<void>;
  } = {}) {
    return {
      deleteAttachment: options.deleteAttachment ?? (async () => undefined),
      deleteQueue: options.deleteQueue ?? (async () => undefined),
      recordFailure: jasmine.createSpy('recordFailure').and.resolveTo(),
      errorCode: (error: unknown) => error instanceof Error ? error.message : 'unknown',
    };
  }

  it('Storage object-not-found 視為冪等成功並繼續刪除 queue', async () => {
    const ops = operations({
      deleteAttachment: async () => { throw new Error('storage/object-not-found'); },
    });

    await expectAsync(processJourneyEventAttachmentCleanup(attachment('a'), ops)).toBeResolvedTo(true);

    expect(ops.recordFailure).not.toHaveBeenCalled();
  });

  it('Storage 刪除失敗時記錄 storage-delete-failed 並停止 queue 刪除', async () => {
    const deleteQueue = jasmine.createSpy('deleteQueue').and.resolveTo();
    const ops = operations({
      deleteAttachment: async () => { throw new Error('storage/retry-limit-exceeded'); },
      deleteQueue,
    });

    await expectAsync(processJourneyEventAttachmentCleanup(attachment('a'), ops)).toBeResolvedTo(false);

    expect(deleteQueue).not.toHaveBeenCalled();
    expect(ops.recordFailure).toHaveBeenCalledOnceWith('storage-delete-failed', jasmine.objectContaining({
      attachmentId: 'a',
      storageErrorCode: 'storage/retry-limit-exceeded',
    }));
  });

  it('queue 刪除失敗時記錄 queue-delete-failed', async () => {
    const ops = operations({
      deleteQueue: async () => { throw new Error('permission-denied'); },
    });

    await expectAsync(processJourneyEventAttachmentCleanup(attachment('a'), ops)).toBeResolvedTo(false);

    expect(ops.recordFailure).toHaveBeenCalledOnceWith('queue-delete-failed', jasmine.objectContaining({
      attachmentId: 'a',
      queueErrorCode: 'permission-denied',
    }));
  });
});
