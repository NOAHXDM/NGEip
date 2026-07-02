import { AssignmentManagementDialogComponent } from './assignment-management-dialog.component';

describe('AssignmentManagementDialogComponent random preview controls contract', () => {
  it('應提供移除整位受評者預覽 row 的方法', () => {
    expect(typeof AssignmentManagementDialogComponent.prototype.removePreviewEvaluatee).toBe('function');
  });
});
