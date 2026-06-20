import { of } from 'rxjs';
import { AttendanceComponent } from './attendance.component';

describe('AttendanceComponent attachments', () => {
  function create(attendance?: any, service: any = { typeList: [], reasonPriorityList: [] }): AttendanceComponent {
    return new AttendanceComponent(
      { close: jasmine.createSpy() } as any,
      service as any,
      { list$: of([]), getUsersWithinExitWindow: () => of([]), currentUser$: of(null) } as any,
      {} as any,
      { title: 'test', attendance }
    );
  }

  it('allows attachments on a new request', () => expect(create().canManageAttachments).toBeTrue());

  it('allows only pending owner or admin to manage existing attachments', () => {
    const owner = create({ userId: 'owner', status: 'pending', attachments: [] });
    owner.currentUser = { uid: 'owner', role: 'user' } as any;
    expect(owner.canManageAttachments).toBeTrue();
    (owner as any).data.attendance.status = 'approved';
    expect(owner.canManageAttachments).toBeFalse();
    owner.currentUser = { uid: 'other', role: 'user' } as any;
    expect(owner.canManageAttachments).toBeFalse();
    owner.currentUser = { uid: 'admin', role: 'admin' } as any;
    expect(owner.canManageAttachments).toBeTrue();
  });

  it('marks old files for removal while retaining newly selected files locally', () => {
    const component = create({ userId: 'owner', status: 'pending', attachments: [{ id: 'old' }] });
    const file = new File(['x'], 'new.pdf', { type: 'application/pdf' });
    component.addFiles([file]);
    component.removeExisting('old');
    expect(component.pendingFiles).toEqual([file]);
    expect(component.visibleAttachments).toEqual([]);
  });

  it('submits zero or multiple optional files and locks while saving', () => {
    const service = { typeList: [], reasonPriorityList: [], create: jasmine.createSpy().and.returnValue(of('id')) };
    const component = new AttendanceComponent(
      { close: jasmine.createSpy() } as any, service as any,
      { list$: of([]), getUsersWithinExitWindow: () => of([]), currentUser$: of({ uid: 'owner' }) } as any,
      { convertTimestampByClientTimezone: (value: unknown) => value } as any,
      { title: 'new' }
    );
    component.attendanceForm.patchValue({
      type: 1, reason: 'reason', userId: 'owner', startDateTime: new Date() as any, endDateTime: new Date() as any,
    });
    const files = [new File(['%PDF-'], 'one.pdf', { type: 'application/pdf' })];
    component.addFiles(files);
    component.currentUser = { uid: 'owner' } as any;
    component.save();
    expect(service.create).toHaveBeenCalledWith(component.attendanceForm.value, 'owner', files);
    expect(component.saving).toBeTrue();
  });

  it('submits update attachment changes with the current actor', () => {
    const service = {
      typeList: [], reasonPriorityList: [],
      update: jasmine.createSpy().and.returnValue(of(true)),
    };
    const attendance = {
      id: 'request-1', userId: 'owner', status: 'pending', attachments: [{ id: 'old' }],
      type: 1, reason: 'reason', startDateTime: new Date(), endDateTime: new Date(),
    };
    const component = create(attendance, service);
    component.currentUser = { uid: 'owner', role: 'user' } as any;
    component.attendanceForm.patchValue({
      type: 1, reason: 'reason', userId: 'owner', startDateTime: new Date() as any, endDateTime: new Date() as any,
    });
    const pending = new File(['%PDF-'], 'new.pdf', { type: 'application/pdf' });
    component.addFiles([pending]);
    component.removeExisting('old');

    component.save();

    expect(service.update).toHaveBeenCalledWith(
      component.attendanceForm.value, attendance, 'owner', [pending], ['old']
    );
  });

  it('blocks save when the login session no longer has an actor uid', () => {
    const service = { typeList: [], reasonPriorityList: [], create: jasmine.createSpy() };
    const component = create(undefined, service);
    component.attendanceForm.patchValue({
      type: 1, reason: 'reason', userId: 'owner', startDateTime: new Date() as any, endDateTime: new Date() as any,
    });

    component.save();

    expect(service.create).not.toHaveBeenCalled();
    expect(component.saving).toBeFalse();
    expect(component.saveError).toContain('登入狀態已逾期');
  });
});
