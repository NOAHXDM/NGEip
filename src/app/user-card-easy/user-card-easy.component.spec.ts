import { User } from '../services/user.service';
import { UserCardEasyComponent } from './user-card-easy.component';

describe('UserCardEasyComponent Telegram 圖示連結', () => {
  it('使用者有合法 Telegram 名稱時建立 t.me 連結', () => {
    const component = Object.create(UserCardEasyComponent.prototype);
    component.user = {
      name: '王小明',
      telegramUsername: 'ops_user',
    } as User;

    expect(component.telegramUrl()).toBe('https://t.me/ops_user');
  });
});
