import { of, Subject, throwError } from 'rxjs';
import {
  AttendanceComponent,
  attendanceDateTimeOrderValidator,
} from './attendance.component';

describe('attendanceDateTimeOrderValidator', () => {
  function group(start: unknown, end: unknown): any {
    return { get: (name: string) => ({ value: name === 'startDateTime' ? start : end }) };
  }

  it('accepts an end strictly after the start', () => {
    expect(attendanceDateTimeOrderValidator(
      group(new Date('2026-08-09T16:30:00'), new Date('2026-08-10T00:30:00'))
    )).toBeNull();
  });

  // GitHub issue #38 的原始資料就是把 00:30 打成 12:30，區間並未反轉；
  // 這個驗證器只擋反向與零長度，時數與區間的一致性另案處理。
  it('rejects an end before or equal to the start', () => {
    const start = new Date('2026-08-10T00:30:00');
    expect(attendanceDateTimeOrderValidator(
      group(start, new Date('2026-08-09T16:30:00'))
    )).toEqual({ endBeforeStart: true });
    expect(attendanceDateTimeOrderValidator(group(start, new Date(start))))
      .toEqual({ endBeforeStart: true });
  });

  it('stays silent until both sides are real dates', () => {
    expect(attendanceDateTimeOrderValidator(group('', ''))).toBeNull();
    expect(attendanceDateTimeOrderValidator(group(new Date('2026-08-09T16:30:00'), ''))).toBeNull();
    expect(attendanceDateTimeOrderValidator(
      group(new Date('nope'), new Date('2026-08-10T00:30:00'))
    )).toBeNull();
  });
});

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

  // GitHub issue #38：UI 必須先鎖住 rules 不允許的欄位，否則送出會被拒絕，
  // 使用者只會看到通用錯誤訊息，回到原本難以判讀的狀況。
  describe('field locking on edit', () => {
    function edit(actor: any, attendance: any): AttendanceComponent {
      const component = new AttendanceComponent(
        { close: jasmine.createSpy() } as any,
        { typeList: [], reasonPriorityList: [] } as any,
        { list$: of([]), getUsersWithinExitWindow: () => of([]), currentUser$: of(actor) } as any,
        { convertDateByClientTimezone: (value: unknown) => value } as any,
        { title: 'edit', attendance }
      );
      component.ngOnInit();
      return component;
    }

    const attendance = {
      userId: 'owner', status: 'pending', proxyUserId: 'proxy', attachments: [],
      type: 1, reason: 'reason', hours: 8,
      startDateTime: new Date('2026-08-09T16:30:00'),
      endDateTime: new Date('2026-08-10T00:30:00'),
    };

    it('lets the proxy edit content but not reassign the proxy or the requester', () => {
      const component = edit({ uid: 'proxy', role: 'user' }, attendance);
      expect(component.attendanceForm.get('userId')?.disabled).toBeTrue();
      expect(component.attendanceForm.get('proxyUserId')?.disabled).toBeTrue();
      expect(component.attendanceForm.get('endDateTime')?.disabled).toBeFalse();
      expect(component.canManageAttachments).toBeFalse();
      // 鎖住的欄位不得進入 patch，否則 rules 的 userId/proxyUserId 不變量會被觸發。
      expect(Object.keys(component.attendanceForm.value)).not.toContain('userId');
      expect(Object.keys(component.attendanceForm.value)).not.toContain('proxyUserId');
    });

    it('lets the requester reassign the proxy but not the requester', () => {
      const component = edit({ uid: 'owner', role: 'user' }, attendance);
      expect(component.attendanceForm.get('userId')?.disabled).toBeTrue();
      expect(component.attendanceForm.get('proxyUserId')?.enabled).toBeTrue();
      expect(component.canManageAttachments).toBeTrue();
    });

    it('leaves every field open for admin', () => {
      const component = edit({ uid: 'admin', role: 'admin' }, attendance);
      expect(component.attendanceForm.get('userId')?.enabled).toBeTrue();
      expect(component.attendanceForm.get('proxyUserId')?.enabled).toBeTrue();
    });
  });

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
    const result = new Subject<string>();
    const service = { typeList: [], reasonPriorityList: [], create: jasmine.createSpy().and.returnValue(result) };
    const dialogRef = { close: jasmine.createSpy(), disableClose: false };
    const component = new AttendanceComponent(
      dialogRef as any, service as any,
      { list$: of([]), getUsersWithinExitWindow: () => of([]), currentUser$: of({ uid: 'owner' }) } as any,
      { convertTimestampByClientTimezone: (value: unknown) => value } as any,
      { title: 'new' }
    );
    component.attendanceForm.patchValue({
      type: 1, reason: 'reason', userId: 'owner', startDateTime: new Date('2026-08-09T16:30:00') as any,
      endDateTime: new Date('2026-08-10T00:30:00') as any,
    });
    const files = [new File(['%PDF-'], 'one.pdf', { type: 'application/pdf' })];
    component.addFiles(files);
    component.currentUser = { uid: 'owner' } as any;
    component.save();
    expect(service.create).toHaveBeenCalledWith(component.attendanceForm.value, 'owner', files);
    expect(component.saving).toBeTrue();
    expect(dialogRef.disableClose).toBeTrue();
    result.next('id');
    result.complete();
    expect(component.saving).toBeFalse();
    expect(dialogRef.disableClose).toBeFalse();
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
      type: 1, reason: 'reason', userId: 'owner', startDateTime: new Date('2026-08-09T16:30:00') as any,
      endDateTime: new Date('2026-08-10T00:30:00') as any,
    });
    const pending = new File(['%PDF-'], 'new.pdf', { type: 'application/pdf' });
    component.addFiles([pending]);
    component.removeExisting('old');

    component.save();

    expect(service.update).toHaveBeenCalledWith(
      component.attendanceForm.value, attendance, 'owner', [pending], ['old']
    );
  });

  it('closes with the updated message after a successful edit', () => {
    const service = {
      typeList: [], reasonPriorityList: [],
      update: jasmine.createSpy().and.returnValue(of(true)),
    };
    const dialogRef = { close: jasmine.createSpy(), disableClose: false };
    const attendance = {
      id: 'request-1', userId: 'owner', status: 'pending', attachments: [],
      type: 1, reason: 'reason', hours: 1, auditTrail: [],
      startDateTime: new Date(), endDateTime: new Date(),
    } as any;
    const component = new AttendanceComponent(
      dialogRef as any, service as any,
      { list$: of([]), getUsersWithinExitWindow: () => of([]), currentUser$: of(null) } as any,
      {} as any,
      { title: 'edit', attendance }
    );
    component.currentUser = { uid: 'owner', role: 'user' } as any;
    component.attendanceForm.patchValue({
      type: 1, reason: 'new reason', userId: 'owner', startDateTime: new Date('2026-08-09T16:30:00') as any,
      endDateTime: new Date('2026-08-10T00:30:00') as any,
    });

    component.save();

    expect(dialogRef.close).toHaveBeenCalledWith('申請已成功更新');
  });

  it('blocks save when the login session no longer has an actor uid', () => {
    const service = { typeList: [], reasonPriorityList: [], create: jasmine.createSpy() };
    const component = create(undefined, service);
    component.attendanceForm.patchValue({
      type: 1, reason: 'reason', userId: 'owner', startDateTime: new Date('2026-08-09T16:30:00') as any,
      endDateTime: new Date('2026-08-10T00:30:00') as any,
    });

    component.save();

    expect(service.create).not.toHaveBeenCalled();
    expect(component.saving).toBeFalse();
    expect(component.saveError).toContain('登入狀態已逾期');
  });

  it('re-enables dialog closing after a save error', () => {
    const service = {
      typeList: [], reasonPriorityList: [],
      create: jasmine.createSpy().and.returnValue(throwError(() => new Error('儲存失敗'))),
    };
    const dialogRef = { close: jasmine.createSpy(), disableClose: false };
    const component = new AttendanceComponent(
      dialogRef as any, service as any,
      { list$: of([]), getUsersWithinExitWindow: () => of([]), currentUser$: of(null) } as any,
      {} as any,
      { title: 'new' }
    );
    component.currentUser = { uid: 'owner' } as any;
    component.attendanceForm.patchValue({
      type: 1, reason: 'reason', userId: 'owner', startDateTime: new Date('2026-08-09T16:30:00') as any,
      endDateTime: new Date('2026-08-10T00:30:00') as any,
    });

    component.save();

    expect(component.saving).toBeFalse();
    expect(dialogRef.disableClose).toBeFalse();
    expect(component.saveError).toBe('儲存失敗');
  });

  it('shows a safe fallback when create rejects with a non-Error value', () => {
    const service = {
      typeList: [], reasonPriorityList: [],
      create: jasmine.createSpy().and.returnValue(throwError(() => 'firebase-rejected')),
    };
    const component = create(undefined, service);
    component.currentUser = { uid: 'owner' } as any;
    component.attendanceForm.patchValue({
      type: 1, reason: 'reason', userId: 'owner', startDateTime: new Date('2026-08-09T16:30:00') as any,
      endDateTime: new Date('2026-08-10T00:30:00') as any,
    });

    component.save();

    expect(component.saveError).toBe('操作失敗，請重試。');
  });

  it('shows a safe fallback when update rejects with a non-Error value', () => {
    const service = {
      typeList: [], reasonPriorityList: [],
      update: jasmine.createSpy().and.returnValue(throwError(() => ({ code: 'firebase-rejected' }))),
    };
    const attendance = {
      id: 'request-1', userId: 'owner', status: 'pending', attachments: [],
      type: 1, reason: 'reason', startDateTime: new Date(), endDateTime: new Date(),
    };
    const component = create(attendance, service);
    component.currentUser = { uid: 'owner' } as any;
    component.attendanceForm.patchValue({
      type: 1, reason: 'reason', userId: 'owner', startDateTime: new Date('2026-08-09T16:30:00') as any,
      endDateTime: new Date('2026-08-10T00:30:00') as any,
    });

    component.save();

    expect(service.update).toHaveBeenCalled();
    expect(component.saveError).toBe('操作失敗，請重試。');
  });
});
