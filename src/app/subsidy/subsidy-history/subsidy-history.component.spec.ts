import { of } from 'rxjs';
import { SubsidyHistoryComponent } from './subsidy-history.component';

describe('SubsidyHistoryComponent attachment audit', () => {
  it('renders structured add/remove audit content while retaining legacy content', () => {
    const component = new SubsidyHistoryComponent({ getAuditTrail: () => of([]) } as any, { id: 's' });
    const content = JSON.stringify({ attachments: [{ originalName: '發票.png', size: 524288 }] });
    expect(component.getContentLabel(content, '新增附件')).toBe('發票.png（0.50 MiB）');
    expect(component.getContentLabel('legacy', '更新')).toBe('legacy');
  });
});
