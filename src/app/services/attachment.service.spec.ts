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
});
