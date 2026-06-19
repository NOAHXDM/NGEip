import { of, throwError } from 'rxjs';
import { AttachmentPreviewDialogComponent } from './attachment-preview-dialog.component';

describe('AttachmentPreviewDialogComponent', () => {
  const sanitizer = { bypassSecurityTrustResourceUrl: (url: string) => url };
  let createSpy: jasmine.Spy;
  let revokeSpy: jasmine.Spy;

  beforeEach(() => {
    createSpy = spyOn(URL, 'createObjectURL').and.returnValue('blob:preview');
    revokeSpy = spyOn(URL, 'revokeObjectURL');
  });

  it('previews a pending image File without a remote read', async () => {
    const service = { loadPreview: jasmine.createSpy('loadPreview') };
    const file = new File([new Uint8Array([0xff])], 'photo.jpg', { type: 'image/jpeg' });
    const component = new AttachmentPreviewDialogComponent({ file }, service as any, sanitizer as any);
    await component.load();
    expect(service.loadPreview).not.toHaveBeenCalled();
    expect(component.isImage).toBeTrue();
    expect(component.safeUrl).toBe('blob:preview' as any);
  });

  it('loads a remote PDF and revokes its URL on destroy', async () => {
    const service = { loadPreview: () => of(new Blob(['%PDF-'], { type: 'application/pdf' })) };
    const attachment = { originalName: 'a.pdf', contentType: 'application/pdf' } as any;
    const component = new AttachmentPreviewDialogComponent({ attachment }, service as any, sanitizer as any);
    await component.load();
    expect(component.isImage).toBeFalse();
    component.ngOnDestroy();
    expect(revokeSpy).toHaveBeenCalledWith('blob:preview');
  });

  it('shows a fallback and succeeds when retried', async () => {
    const loadPreview = jasmine.createSpy().and.returnValues(
      throwError(() => new Error('offline')),
      of(new Blob(['%PDF-']))
    );
    const component = new AttachmentPreviewDialogComponent(
      { attachment: { originalName: 'a.pdf', contentType: 'application/pdf' } as any },
      { loadPreview } as any,
      sanitizer as any
    );
    await component.load();
    expect(component.error).toContain('無法載入');
    await component.load();
    expect(component.error).toBe('');
    expect(createSpy).toHaveBeenCalledTimes(1);
  });
});
