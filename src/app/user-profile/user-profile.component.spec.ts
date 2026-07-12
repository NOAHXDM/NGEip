import { signal } from '@angular/core';

import { NotificationService } from '../services/notification.service';
import { UserProfileComponent } from './user-profile.component';

describe('UserProfileComponent 通知設定', () => {
  let component: UserProfileComponent;
  let notificationService: jasmine.SpyObj<NotificationService>;
  let snackBar: jasmine.SpyObj<{ open: (...args: unknown[]) => void }>;

  beforeEach(() => {
    notificationService = jasmine.createSpyObj<NotificationService>(
      'NotificationService',
      [
        'isMessagingSupported',
        'getPermissionState',
        'isOptedIn',
        'enableNotifications',
        'disableNotifications',
      ]
    );
    notificationService.isMessagingSupported.and.resolveTo(true);
    notificationService.getPermissionState.and.returnValue('granted');
    notificationService.isOptedIn.and.returnValue(true);
    notificationService.enableNotifications.and.resolveTo(true);
    notificationService.disableNotifications.and.resolveTo();
    snackBar = jasmine.createSpyObj('MatSnackBar', ['open']);

    component = Object.create(UserProfileComponent.prototype);
    Object.assign(component as object, {
      notificationSupported: signal(false),
      notificationPermission: signal<NotificationPermission | 'unsupported'>(
        'unsupported'
      ),
      notificationOptIn: signal(false),
      notificationService,
      _snackBar: snackBar,
    });
  });

  it('刷新此瀏覽器的支援度、權限與 opt-in 狀態', async () => {
    await component.refreshNotificationState();

    expect(component.notificationSupported()).toBeTrue();
    expect(component.notificationPermission()).toBe('granted');
    expect(component.notificationOptIn()).toBeTrue();
  });

  it('啟用成功後刷新狀態並顯示結果', async () => {
    const refresh = spyOn(component, 'refreshNotificationState').and.resolveTo();

    await component.enableNotifications();

    expect(notificationService.enableNotifications).toHaveBeenCalled();
    expect(refresh).toHaveBeenCalled();
    expect(snackBar.open).toHaveBeenCalledWith(
      '推播通知已啟用',
      'Close',
      jasmine.any(Object)
    );
  });

  it('停用後刷新狀態並顯示結果', async () => {
    const refresh = spyOn(component, 'refreshNotificationState').and.resolveTo();

    await component.disableNotifications();

    expect(notificationService.disableNotifications).toHaveBeenCalled();
    expect(refresh).toHaveBeenCalled();
    expect(snackBar.open).toHaveBeenCalledWith(
      '已停用此裝置的推播通知',
      'Close',
      jasmine.any(Object)
    );
  });
});
