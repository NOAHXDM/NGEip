import {
  processAttachmentCleanup,
  rollbackPreparedAttachments,
} from './attachment-session';
import { AttachmentMetadata } from './attachment.models';

describe('rollbackPreparedAttachments', () => {
  const attachment = (id: string) => ({ id, storagePath: `path/${id}` } as Pick<AttachmentMetadata, 'id' | 'storagePath'>);

  function operations(overrides: Partial<Parameters<typeof rollbackPreparedAttachments>[1]> = {}) {
    return {
      deleteAttachment: jasmine.createSpy('deleteAttachment').and.resolveTo(),
      onDeleteError: jasmine.createSpy('onDeleteError'),
      markSessionCleanupPending: jasmine.createSpy('markSessionCleanupPending').and.resolveTo(),
      deleteSession: jasmine.createSpy('deleteSession').and.resolveTo(),
      ...overrides,
    };
  }

  it('刪除每個附件後在全部成功時移除 session', async () => {
    const ops = operations();

    await rollbackPreparedAttachments([attachment('a'), attachment('b')], ops);

    expect(ops.deleteAttachment).toHaveBeenCalledTimes(2);
    expect(ops.deleteAttachment).toHaveBeenCalledWith('path/a');
    expect(ops.deleteAttachment).toHaveBeenCalledWith('path/b');
    expect(ops.deleteSession).toHaveBeenCalledTimes(1);
    expect(ops.markSessionCleanupPending).not.toHaveBeenCalled();
    expect(ops.onDeleteError).not.toHaveBeenCalled();
  });

  it('任一附件刪除失敗時改標記 session 為 cleanup-pending 並仍嘗試其餘附件', async () => {
    const deleteAttachment = jasmine.createSpy('deleteAttachment')
      .and.returnValues(Promise.reject(new Error('storage/retry-limit-exceeded')), Promise.resolve());
    const ops = operations({ deleteAttachment });

    await rollbackPreparedAttachments([attachment('a'), attachment('b')], ops);

    expect(deleteAttachment).toHaveBeenCalledTimes(2);
    expect(ops.onDeleteError).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({ id: 'a' }),
      jasmine.any(Error)
    );
    expect(ops.markSessionCleanupPending).toHaveBeenCalledTimes(1);
    expect(ops.deleteSession).not.toHaveBeenCalled();
  });

  it('空批次仍視為成功並移除 session', async () => {
    const ops = operations();

    await rollbackPreparedAttachments([], ops);

    expect(ops.deleteAttachment).not.toHaveBeenCalled();
    expect(ops.deleteSession).toHaveBeenCalledTimes(1);
    expect(ops.markSessionCleanupPending).not.toHaveBeenCalled();
  });
});

describe('processAttachmentCleanup', () => {
  const attachment = (id: string) => ({ id, storagePath: `path/${id}` });

  function operations(overrides: Partial<Parameters<typeof processAttachmentCleanup>[1]> = {}) {
    return {
      deleteAttachment: jasmine.createSpy('deleteAttachment').and.resolveTo(),
      deleteQueue: jasmine.createSpy('deleteQueue').and.resolveTo(),
      recordFailure: jasmine.createSpy('recordFailure').and.resolveTo(),
      errorCode: (error: unknown) => error instanceof Error ? error.message : 'unknown',
      ...overrides,
    };
  }

  it('正常清理 Storage 與 queue 後回傳 true', async () => {
    const ops = operations();

    await expectAsync(processAttachmentCleanup(attachment('a'), ops)).toBeResolvedTo(true);

    expect(ops.deleteAttachment).toHaveBeenCalledTimes(1);
    expect(ops.deleteQueue).toHaveBeenCalledTimes(1);
    expect(ops.recordFailure).not.toHaveBeenCalled();
  });

  it('Storage object-not-found 視為冪等成功並繼續刪除 queue', async () => {
    const ops = operations({
      deleteAttachment: jasmine.createSpy('deleteAttachment')
        .and.rejectWith(new Error('storage/object-not-found')),
    });

    await expectAsync(processAttachmentCleanup(attachment('a'), ops)).toBeResolvedTo(true);

    expect(ops.deleteQueue).toHaveBeenCalledTimes(1);
    expect(ops.recordFailure).not.toHaveBeenCalled();
  });

  it('Storage 刪除失敗時記錄 storage-delete-failed 並停止 queue 刪除', async () => {
    const ops = operations({
      deleteAttachment: jasmine.createSpy('deleteAttachment')
        .and.rejectWith(new Error('storage/retry-limit-exceeded')),
    });

    await expectAsync(processAttachmentCleanup(attachment('a'), ops)).toBeResolvedTo(false);

    expect(ops.deleteQueue).not.toHaveBeenCalled();
    expect(ops.recordFailure).toHaveBeenCalledOnceWith('storage-delete-failed', jasmine.objectContaining({
      attachmentId: 'a',
      storageErrorCode: 'storage/retry-limit-exceeded',
    }));
  });

  it('queue 刪除失敗時記錄 queue-delete-failed', async () => {
    const ops = operations({
      deleteQueue: jasmine.createSpy('deleteQueue').and.rejectWith(new Error('permission-denied')),
    });

    await expectAsync(processAttachmentCleanup(attachment('a'), ops)).toBeResolvedTo(false);

    expect(ops.recordFailure).toHaveBeenCalledOnceWith('queue-delete-failed', jasmine.objectContaining({
      attachmentId: 'a',
      queueErrorCode: 'permission-denied',
    }));
  });
});
