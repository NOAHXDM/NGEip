import { Timestamp } from '@angular/fire/firestore';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { TestBed } from '@angular/core/testing';

import { JourneyEventDialogComponent, trimMaxLength } from './journey-event-dialog.component';
import { JourneyEventDialogData } from '../models/journey-timeline.models';

describe('JourneyEventDialogComponent', () => {
  function createComponent(data: JourneyEventDialogData) {
    const dialogRef = jasmine.createSpyObj<MatDialogRef<JourneyEventDialogComponent>>('MatDialogRef', ['close']);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialogRef, useValue: dialogRef },
      ],
    });
    return {
      component: TestBed.runInInjectionContext(() => new JourneyEventDialogComponent(data, dialogRef)),
      dialogRef,
    };
  }

  it('編輯既有 UTC 日期時以同一曆日回填 date input', () => {
    const { component } = createComponent({
      targetUserId: 'u1',
      actorUid: 'admin',
      permissions: { canCreate: true, canUpdate: true, canDelete: true },
      event: {
        id: 'e1',
        targetUserId: 'u1',
        eventDate: Timestamp.fromDate(new Date('2026-06-23T00:00:00Z')),
        title: '既有事件',
        content: '內容',
        attachments: [],
        createdBy: 'admin',
        createdAt: Timestamp.now(),
        updatedBy: 'admin',
        updatedAt: Timestamp.now(),
        lastAuditId: 'a1',
        deleteAuditId: 'd1',
      },
    });

    expect(component.form.controls.eventDate.value).toBe('2026-06-23');
  });

  it('submit 會 trim 文字並以 UTC 零點輸出事件日期', () => {
    const { component, dialogRef } = createComponent({
      targetUserId: 'u1',
      actorUid: 'admin',
      permissions: { canCreate: true, canUpdate: true, canDelete: true },
    });
    component.form.setValue({
      eventDate: '2026-06-23',
      title: '  標題  ',
      content: '  內容  ',
    });

    component.submit();

    expect(dialogRef.close).toHaveBeenCalledOnceWith(jasmine.objectContaining({
      input: jasmine.objectContaining({
        targetUserId: 'u1',
        title: '標題',
        content: '內容',
        eventDate: new Date('2026-06-23T00:00:00Z'),
      }),
      files: [],
      removedAttachmentIds: [],
    }));
  });

  it('純空白標題會標記為 invalid 並顯示錯誤條件', () => {
    const { component, dialogRef } = createComponent({
      targetUserId: 'u1',
      actorUid: 'admin',
      permissions: { canCreate: true, canUpdate: true, canDelete: true },
    });
    component.form.setValue({
      eventDate: '2026-06-23',
      title: '   ',
      content: '內容',
    });

    component.submit();

    expect(dialogRef.close).not.toHaveBeenCalled();
    expect(component.form.touched).toBeTrue();
    expect(component.form.controls.title.invalid).toBeTrue();
    expect(component.form.controls.title.hasError('pattern')).toBeTrue();
  });

  it('純空白內容會標記為 invalid 並顯示錯誤條件', () => {
    const { component, dialogRef } = createComponent({
      targetUserId: 'u1',
      actorUid: 'admin',
      permissions: { canCreate: true, canUpdate: true, canDelete: true },
    });
    component.form.setValue({
      eventDate: '2026-06-23',
      title: '標題',
      content: '   ',
    });

    component.submit();

    expect(dialogRef.close).not.toHaveBeenCalled();
    expect(component.form.touched).toBeTrue();
    expect(component.form.controls.content.invalid).toBeTrue();
    expect(component.form.controls.content.hasError('pattern')).toBeTrue();
  });

  it('超過標題或內容上限時不會關閉 dialog', () => {
    const { component, dialogRef } = createComponent({
      targetUserId: 'u1',
      actorUid: 'admin',
      permissions: { canCreate: true, canUpdate: true, canDelete: true },
    });
    component.form.setValue({
      eventDate: '2026-06-23',
      title: 'x'.repeat(101),
      content: '內容',
    });

    component.submit();

    expect(dialogRef.close).not.toHaveBeenCalled();

    component.form.setValue({
      eventDate: '2026-06-23',
      title: '標題',
      content: 'x'.repeat(5001),
    });

    component.submit();

    expect(dialogRef.close).not.toHaveBeenCalled();
  });

  it('長度驗證以 trim 後文字計算', () => {
    const validator = trimMaxLength(10);

    expect(validator({ value: `有效標題${' '.repeat(20)}` } as any)).toBeNull();
    expect(validator({ value: `${' '.repeat(2)}${'x'.repeat(11)}${' '.repeat(2)}` } as any))
      .toEqual({ trimMaxLength: { requiredLength: 10, actualLength: 11 } });
  });

  it('submit 接受 trim 後未超過上限的標題與內容', () => {
    const { component, dialogRef } = createComponent({
      targetUserId: 'u1',
      actorUid: 'admin',
      permissions: { canCreate: true, canUpdate: true, canDelete: true },
    });
    component.form.setValue({
      eventDate: '2026-06-23',
      title: `${'標'.repeat(100)} `,
      content: `${'內'.repeat(5000)} `,
    });

    component.submit();

    expect(dialogRef.close).toHaveBeenCalled();
    expect(dialogRef.close.calls.mostRecent().args[0]?.input.title).toBe('標'.repeat(100));
    expect(dialogRef.close.calls.mostRecent().args[0]?.input.content).toBe('內'.repeat(5000));
  });
});
