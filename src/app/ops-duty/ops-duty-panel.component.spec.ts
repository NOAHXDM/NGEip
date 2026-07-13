import { signal } from '@angular/core';

import { OpsDutyPanelComponent } from './ops-duty-panel.component';

describe('OpsDutyPanelComponent Telegram 聯繫連結', () => {
  let component: OpsDutyPanelComponent;

  beforeEach(() => {
    component = Object.create(OpsDutyPanelComponent.prototype);
    Object.assign(component as object, {
      telegramByName: signal<Record<string, string>>({
        王小明: 'ops_user',
      }),
    });
  });

  it('有 Telegram 使用者名稱時回傳 t.me 連結', () => {
    expect(component.telegramUrl('王小明')).toBe('https://t.me/ops_user');
  });

  it('沒有 Telegram 使用者名稱時維持純文字', () => {
    expect(component.telegramUrl('陳小華')).toBeNull();
  });
});
