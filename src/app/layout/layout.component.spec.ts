import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { of } from 'rxjs';

import { ClientPreferencesService } from '../services/client-preferences.service';
import { NotificationService } from '../services/notification.service';
import { UserService } from '../services/user.service';
import { LayoutComponent } from './layout.component';

describe('LayoutComponent 通知初始化', () => {
  let component: LayoutComponent;
  let notificationService: jasmine.SpyObj<NotificationService>;
  let clientPreferences: jasmine.SpyObj<ClientPreferencesService>;
  let dialog: jasmine.SpyObj<MatDialog>;

  beforeEach(async () => {
    notificationService = jasmine.createSpyObj<NotificationService>(
      'NotificationService',
      [
        'isMessagingSupported',
        'initializeNotificationLifecycle',
        'getPermissionState',
      ]
    );
    notificationService.isMessagingSupported.and.resolveTo(true);
    notificationService.initializeNotificationLifecycle.and.resolveTo();
    notificationService.getPermissionState.and.returnValue('default');

    clientPreferences = jasmine.createSpyObj<ClientPreferencesService>(
      'ClientPreferencesService',
      ['getPreference']
    );
    clientPreferences.getPreference.and.returnValue(false);
    dialog = jasmine.createSpyObj<MatDialog>('MatDialog', ['open']);

    await TestBed.configureTestingModule({
      imports: [LayoutComponent],
      providers: [
        {
          provide: UserService,
          useValue: {
            isAdmin$: of(false),
            currentUser$: of({ uid: 'user-001' }),
            logout: jasmine.createSpy(),
          },
        },
        { provide: NotificationService, useValue: notificationService },
        { provide: ClientPreferencesService, useValue: clientPreferences },
        { provide: MatDialog, useValue: dialog },
        { provide: Router, useValue: jasmine.createSpyObj('Router', ['navigate']) },
      ],
    })
      .overrideComponent(LayoutComponent, { set: { template: '' } })
      .compileComponents();

    component = TestBed.createComponent(LayoutComponent).componentInstance;
  });

  it('瀏覽器不支援時不初始化生命週期也不開啟引導', async () => {
    notificationService.isMessagingSupported.and.resolveTo(false);

    await component.ngOnInit();

    expect(notificationService.initializeNotificationLifecycle).not.toHaveBeenCalled();
    expect(dialog.open).not.toHaveBeenCalled();
  });

  it('先恢復已 opt-in 生命週期，再判斷是否顯示引導', async () => {
    await component.ngOnInit();

    expect(notificationService.initializeNotificationLifecycle).toHaveBeenCalled();
    expect(dialog.open).toHaveBeenCalled();
  });

  it('瀏覽器權限已不是 default 時不顯示引導', async () => {
    notificationService.getPermissionState.and.returnValue('granted');

    await component.ngOnInit();

    expect(dialog.open).not.toHaveBeenCalled();
    expect(clientPreferences.getPreference).not.toHaveBeenCalled();
  });

  it('此瀏覽器已看過引導時不重複顯示', async () => {
    clientPreferences.getPreference.and.returnValue(true);

    await component.ngOnInit();

    expect(clientPreferences.getPreference).toHaveBeenCalledWith(
      'notificationPromptDismissed'
    );
    expect(dialog.open).not.toHaveBeenCalled();
  });
});
