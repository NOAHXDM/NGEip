import { of, throwError } from 'rxjs';
import { SubsidyApplicationComponent } from './subsidy-application.component';

describe('SubsidyApplicationComponent attachments', () => {
  function create(application?: any): SubsidyApplicationComponent {
    return new SubsidyApplicationComponent(
      { close: jasmine.createSpy() } as any,
      { typeList: [] } as any,
      { list$: of([]), currentUser$: of(null) } as any,
      { title: 'test', application }
    );
  }

  it('allows only pending owner or admin to manage an existing application', () => {
    const component = create({ userId: 'owner', status: 'pending', attachments: [] });
    component.currentUser = { uid: 'owner', role: 'user' } as any;
    expect(component.canManageAttachments).toBeTrue();
    (component as any).data.application.status = 'rejected';
    expect(component.canManageAttachments).toBeFalse();
    component.currentUser = { uid: 'other', role: 'user' } as any;
    expect(component.canManageAttachments).toBeFalse();
    component.currentUser = { uid: 'admin', role: 'admin' } as any;
    expect(component.canManageAttachments).toBeTrue();
  });

  it('supports a five-for-five local replacement set', () => {
    const attachments = Array.from({ length: 5 }, (_, i) => ({ id: `old-${i}` }));
    const component = create({ userId: 'owner', status: 'pending', attachments });
    attachments.forEach((item) => component.removeExisting(item.id));
    const replacements = Array.from({ length: 5 }, (_, i) => new File(['x'], `${i}.pdf`, { type: 'application/pdf' }));
    component.addFiles(replacements);
    expect(component.visibleAttachments.length).toBe(0);
    expect(component.pendingFiles.length).toBe(5);
  });

  it('submits optional files once and locks while saving', () => {
    const service = { typeList: [], create: jasmine.createSpy().and.returnValue(of('id')) };
    const dialogRef = { close: jasmine.createSpy(), disableClose: false };
    const component = new SubsidyApplicationComponent(
      dialogRef as any, service as any,
      { list$: of([]), currentUser$: of({ uid: 'owner', role: 'user' }) } as any,
      { title: 'new' }
    );
    component.currentUser = { uid: 'owner', role: 'user' } as any;
    component.subsidyForm.patchValue({ type: 1, userId: 'owner', applicationDate: new Date() });
    const files = [new File(['%PDF-'], 'one.pdf', { type: 'application/pdf' })];
    component.addFiles(files);
    component.onSubmit();
    expect(service.create).toHaveBeenCalledWith(jasmine.any(Object), 'owner', files);
    expect(component.saving).toBeTrue();
    expect(dialogRef.disableClose).toBeTrue();
  });

  it('re-enables dialog closing after a save error', () => {
    const service = {
      typeList: [],
      create: jasmine.createSpy().and.returnValue(throwError(() => new Error('建立失敗'))),
    };
    const dialogRef = { close: jasmine.createSpy(), disableClose: false };
    const component = new SubsidyApplicationComponent(
      dialogRef as any, service as any,
      { list$: of([]), currentUser$: of(null) } as any,
      { title: 'new' }
    );
    component.currentUser = { uid: 'owner', role: 'user' } as any;
    component.subsidyForm.patchValue({ type: 1, userId: 'owner', applicationDate: new Date() });

    component.onSubmit();

    expect(component.saving).toBeFalse();
    expect(dialogRef.disableClose).toBeFalse();
    expect(component.saveError).toBe('建立失敗');
  });

  it('shows a clear error when authentication expires before submit', () => {
    const service = { typeList: [], create: jasmine.createSpy() };
    const component = new SubsidyApplicationComponent(
      { close: jasmine.createSpy(), disableClose: false } as any,
      service as any,
      { list$: of([]), currentUser$: of(null) } as any,
      { title: 'new' }
    );
    component.subsidyForm.patchValue({ type: 1, userId: 'owner', applicationDate: new Date() });

    component.onSubmit();

    expect(component.saveError).toBe('登入狀態已逾期，請重新整理後再試。');
    expect(service.create).not.toHaveBeenCalled();
  });
});
