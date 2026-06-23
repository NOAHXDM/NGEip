import { Timestamp } from '@angular/fire/firestore';

import { AttachmentMetadata } from '../../attachments/attachment.models';
import { mergeAttachmentChanges } from '../../services/attachment.service';
import {
  changedJourneyEventFields,
  exceedsJourneyEventAttachmentLimit,
  mapJourneyEventAttachmentValidationError,
  mapJourneyEventUpdateError,
  normalizeJourneyEventInput,
  processJourneyEventAttachmentCleanup,
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

  it('更新前會以既有附件、移除附件與新檔案預檢附件數量', () => {
    const event = { attachments: ['a', 'b', 'c', 'd'].map(attachment) };
    const files = Array.from({ length: 2 }, (_, index) => new File(['x'], `${index}.pdf`, { type: 'application/pdf' }));

    expect(exceedsJourneyEventAttachmentLimit(event, [], files)).toBeTrue();
    expect(exceedsJourneyEventAttachmentLimit(event, ['a'], files)).toBeFalse();
    expect(exceedsJourneyEventAttachmentLimit(event, ['a', 'a'], files)).toBeFalse();
    expect(exceedsJourneyEventAttachmentLimit(event, ['missing'], files)).toBeTrue();
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
