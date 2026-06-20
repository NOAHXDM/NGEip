import { of, throwError } from 'rxjs';
import { AttachmentService, mergeAttachmentChanges } from './attachment.service';

describe('AttachmentService', () => {
  const attachment = (id: string) => ({ id } as any);
  function serviceWithStorage(storage: any): AttachmentService {
    const service = Object.create(AttachmentService.prototype) as AttachmentService;
    (service as any).storage = storage;
    return service;
  }

  it('loads a formal attachment using the bounded Storage primitive', (done) => {
    const blob = new Blob(['%PDF-']);
    const storage = { getAttachmentBlob: jasmine.createSpy().and.returnValue(of(blob)) };
    const service = serviceWithStorage(storage);
    service.loadPreview({ id: 'a' } as any).subscribe((result) => {
      expect(result).toBe(blob);
      expect(storage.getAttachmentBlob).toHaveBeenCalled();
      done();
    });
  });

  it('keeps preview errors observable to the fallback UI', (done) => {
    const service = serviceWithStorage({ getAttachmentBlob: () => throwError(() => new Error('denied')) });
    service.loadPreview({ id: 'a' } as any).subscribe({ error: (error) => { expect(error.message).toBe('denied'); done(); } });
  });

  it('merges removals and additions from the transaction snapshot', () => {
    const result = mergeAttachmentChanges(
      [attachment('keep'), attachment('remove')],
      ['remove'],
      [attachment('new')]
    );
    expect(result.finalItems.map((item) => item.id)).toEqual(['keep', 'new']);
    expect(result.removedItems.map((item) => item.id)).toEqual(['remove']);
  });

  it('rejects stale removals and concurrent additions beyond five', () => {
    expect(() => mergeAttachmentChanges([attachment('current')], ['missing'], []))
      .toThrowError('attachment-conflict');
    expect(() => mergeAttachmentChanges(
      Array.from({ length: 5 }, (_, index) => attachment(`${index}`)),
      [],
      [attachment('new')]
    )).toThrowError('attachment-count-conflict');
  });

  it('rolls back only files uploaded before a later upload fails', async () => {
    const first = attachment('first');
    const second = attachment('second');
    const storage = {
      uploadAttachment: jasmine.createSpy()
        .and.returnValues(of(undefined), throwError(() => new Error('upload-failed'))),
    };
    const service = serviceWithStorage(storage);
    const rollback = spyOn<any>(service, 'rollbackPrepared').and.resolveTo();

    await expectAsync((service as any).uploadPreparedFiles(
      { sessionId: 'session', attachments: [first, second] },
      [new File(['1'], '1.pdf'), new File(['2'], '2.pdf')],
      { requestKind: 'attendance', requestId: 'request', ownerUid: 'owner' }
    )).toBeRejectedWithError('upload-failed');

    expect(rollback).toHaveBeenCalledWith({ sessionId: 'session', attachments: [first] });
  });

  it('builds attachment audit content without storage path or download URL', () => {
    const service = serviceWithStorage({});
    const audit = (service as any).audit('新增附件', 'admin', [{
      id: 'a', originalName: 'invoice.pdf', size: 123, contentType: 'application/pdf',
      storagePath: 'request-attachments/private', downloadUrl: 'https://secret', uploadedBy: 'admin',
    }]);
    expect(audit.actionBy).toBe('admin');
    expect(audit.content).toContain('invoice.pdf');
    expect(audit.content).not.toContain('storagePath');
    expect(audit.content).not.toContain('secret');
  });

  it('returns a specific message when the saved attachment count exceeds five', () => {
    const service = serviceWithStorage({});
    const message = (service as any).updateErrorMessage(new Error('too-many-files'));
    expect(message).toBe('每筆申請最多五個附件，請刪除部分附件後再試。');
  });

  it('distinguishes a concurrent count conflict from local selection validation', () => {
    const service = serviceWithStorage({});
    const message = (service as any).updateErrorMessage(new Error('attachment-count-conflict'));
    expect(message).toBe('另一個視窗已新增附件，請重新載入後再試。');
  });

  it('extracts diagnostic codes without logging an error message or storage path', () => {
    const service = serviceWithStorage({});
    expect((service as any).errorCode({ code: 'storage/unauthorized', message: 'private/path' }))
      .toBe('storage/unauthorized');
    expect((service as any).errorCode(new Error('storage-delete-failed')))
      .toBe('storage-delete-failed');
    expect((service as any).errorCode(new Error('private/path'))).toBe('Error');
    expect((service as any).errorCode(null)).toBe('unknown');
  });

  it('keeps best-effort governance failures from rejecting the saved request flow', async () => {
    const service = serviceWithStorage({});
    const consoleSpy = spyOn(console, 'error');

    await expectAsync((service as any).bestEffort(
      () => Promise.reject({ code: 'unavailable' }),
      '治理更新失敗',
      { attachmentId: 'a-1' }
    )).toBeResolved();

    expect(consoleSpy).toHaveBeenCalledWith('治理更新失敗', {
      attachmentId: 'a-1',
      errorCode: 'unavailable',
    });
  });
});
