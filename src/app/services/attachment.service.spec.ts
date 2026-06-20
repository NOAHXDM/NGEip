import { of, throwError } from 'rxjs';
import { AttachmentService } from './attachment.service';

describe('AttachmentService', () => {
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

  it('extracts diagnostic codes without logging an error message or storage path', () => {
    const service = serviceWithStorage({});
    expect((service as any).errorCode({ code: 'storage/unauthorized', message: 'private/path' }))
      .toBe('storage/unauthorized');
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
