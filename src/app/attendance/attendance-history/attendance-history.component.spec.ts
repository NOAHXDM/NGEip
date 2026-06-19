import { of } from 'rxjs';
import { AttendanceHistoryComponent } from './attendance-history.component';

describe('AttendanceHistoryComponent attachment audit', () => {
  it('renders structured add/remove audit content in Traditional Chinese', () => {
    const component = new AttendanceHistoryComponent({ getAuditTrail: () => of([]) } as any, { id: 'a' });
    const content = JSON.stringify({ attachments: [{ originalName: '證明.pdf', size: 1048576 }] });
    expect(component.getContentLabel(content, '新增附件')).toBe('證明.pdf（1.00 MiB）');
    expect(component.getContentLabel(content, '刪除附件')).toContain('證明.pdf');
  });
});
