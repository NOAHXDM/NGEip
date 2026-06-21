import { AttendanceStatusChangeComponent } from './attendance-status-change.component';

describe('AttendanceStatusChangeComponent attachments', () => {
  it('retains attachments as readonly dialog data for the attachment list', () => {
    const attendance = { status: 'pending', type: 1, attachments: [{ id: 'a1' }] } as any;
    const component = new AttendanceStatusChangeComponent(
      {} as any, {} as any, {} as any, { attendance, newStatus: 'approved' }
    );
    expect((component as any).data.attendance.attachments).toEqual([{ id: 'a1' }]);
    expect('removeExisting' in component).toBeFalse();
  });
});
