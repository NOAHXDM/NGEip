import { User } from '../services/user.service';
import { UserListComponent } from './user-list.component';

describe('UserListComponent Telegram 圖示連結', () => {
  it('未設定 Telegram 名稱時不建立連結', () => {
    const component = Object.create(UserListComponent.prototype);

    expect(component.telegramUrl({ name: '陳小華' } as User)).toBeNull();
  });
});
