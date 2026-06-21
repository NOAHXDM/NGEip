import { SubsidyStatusChangeComponent } from './subsidy-status-change.component';

describe('SubsidyStatusChangeComponent attachments', () => {
  it('retains attachments as readonly dialog data for the attachment list', () => {
    const application = { status: 'pending', attachments: [{ id: 's1' }] } as any;
    const component = new SubsidyStatusChangeComponent(
      {} as any, {} as any, {} as any, { application, newStatus: 'rejected' }
    );
    expect((component as any).data.application.attachments).toEqual([{ id: 's1' }]);
    expect('removeExisting' in component).toBeFalse();
  });
});
