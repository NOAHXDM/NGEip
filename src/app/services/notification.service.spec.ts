import { TestBed } from '@angular/core/testing';

import { Messaging } from '@angular/fire/messaging';
import { MatSnackBar } from '@angular/material/snack-bar';

import { ClientPreferencesService } from './client-preferences.service';
import { NotificationService } from './notification.service';

const MOCK_MESSAGING = {} as Messaging;
const MOCK_TOKEN = 'fcm-token-abc';
const MOCK_REGISTRATION = {} as ServiceWorkerRegistration;

describe('NotificationService', () => {
  let service: NotificationService;
  let preferences: Record<string, unknown>;
  let preferencesSpy: jasmine.SpyObj<ClientPreferencesService>;

  function configure(messagingProvider: Messaging | null) {
    preferences = {};
    preferencesSpy = jasmine.createSpyObj<ClientPreferencesService>(
      'ClientPreferencesService',
      ['getPreference', 'setPreference']
    );
    preferencesSpy.getPreference.and.callFake((key: string) => preferences[key]);
    preferencesSpy.setPreference.and.callFake((key: string, value: unknown) => {
      preferences[key] = value;
    });

    TestBed.configureTestingModule({
      providers: [
        NotificationService,
        { provide: Messaging, useValue: messagingProvider },
        { provide: ClientPreferencesService, useValue: preferencesSpy },
        { provide: MatSnackBar, useValue: jasmine.createSpyObj('MatSnackBar', ['open']) },
      ],
    });
    service = TestBed.inject(NotificationService);
  }

  describe('不支援推播', () => {
    beforeEach(() => configure(null));

    it('不會要求瀏覽器權限', async () => {
      const requestPermission = spyOn(Notification, 'requestPermission');

      expect(await service.enableNotifications()).toBeFalse();
      expect(requestPermission).not.toHaveBeenCalled();
    });
  });

  describe('支援推播', () => {
    beforeEach(() => {
      configure(MOCK_MESSAGING);
      service._fn.isSupported = jasmine
        .createSpy('isSupported')
        .and.resolveTo(true);
      service._fn.onMessage = jasmine.createSpy('onMessage');
      spyOn(service, 'registerServiceWorker').and.resolveTo(MOCK_REGISTRATION);
    });

    it('拒絕授權時保存此瀏覽器不啟用的意圖', async () => {
      spyOn(Notification, 'requestPermission').and.resolveTo('denied');
      service._fn.getToken = jasmine.createSpy('getToken');

      expect(await service.enableNotifications()).toBeFalse();
      expect(preferences['notificationOptIn']).toBeFalse();
      expect(service._fn.getToken).not.toHaveBeenCalled();
    });

    it('授權成功後建立訂閱，且不寫入使用者資料', async () => {
      spyOn(Notification, 'requestPermission').and.resolveTo('granted');
      spyOnProperty(Notification, 'permission', 'get').and.returnValue('granted');
      service._fn.getToken = jasmine
        .createSpy('getToken')
        .and.resolveTo(MOCK_TOKEN);

      expect(await service.enableNotifications()).toBeTrue();
      expect(preferences['notificationOptIn']).toBeTrue();
      expect(service._fn.getToken).toHaveBeenCalled();
    });

    it('背景初始化只恢復已 opt-in 且瀏覽器仍授權的訂閱', async () => {
      preferences['notificationOptIn'] = true;
      spyOnProperty(Notification, 'permission', 'get').and.returnValue('granted');
      const sync = spyOn(service, 'syncNotificationSubscription').and.resolveTo(true);

      await service.initializeNotificationLifecycle();

      expect(sync).toHaveBeenCalled();
    });

    it('未 opt-in 時背景初始化不會建立訂閱', async () => {
      preferences['notificationOptIn'] = false;
      const sync = spyOn(service, 'syncNotificationSubscription').and.resolveTo(true);

      await service.initializeNotificationLifecycle();

      expect(sync).not.toHaveBeenCalled();
    });

    it('停用時先保存 opt-out，即使裝置沒有 Service Worker 也不會自動重建', async () => {
      await service.disableNotifications();

      expect(preferences['notificationOptIn']).toBeFalse();
    });
  });
});
