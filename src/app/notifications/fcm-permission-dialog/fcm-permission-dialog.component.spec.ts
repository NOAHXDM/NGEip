import { TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';

import { ClientPreferencesService } from '../../services/client-preferences.service';
import { NotificationService } from '../../services/notification.service';
import { FcmPermissionDialogComponent } from './fcm-permission-dialog.component';

describe('FcmPermissionDialogComponent', () => {
  let component: FcmPermissionDialogComponent;
  let notificationService: jasmine.SpyObj<NotificationService>;
  let clientPreferences: jasmine.SpyObj<ClientPreferencesService>;
  let dialogRef: jasmine.SpyObj<MatDialogRef<FcmPermissionDialogComponent>>;

  beforeEach(async () => {
    notificationService = jasmine.createSpyObj<NotificationService>(
      'NotificationService',
      ['enableNotifications']
    );
    notificationService.enableNotifications.and.resolveTo(true);
    clientPreferences = jasmine.createSpyObj<ClientPreferencesService>(
      'ClientPreferencesService',
      ['setPreference']
    );
    dialogRef = jasmine.createSpyObj('MatDialogRef', ['close']);

    await TestBed.configureTestingModule({
      imports: [FcmPermissionDialogComponent],
      providers: [
        { provide: NotificationService, useValue: notificationService },
        { provide: ClientPreferencesService, useValue: clientPreferences },
        { provide: MatDialogRef, useValue: dialogRef },
      ],
    })
      .overrideComponent(FcmPermissionDialogComponent, { set: { template: '' } })
      .compileComponents();

    component = TestBed.createComponent(
      FcmPermissionDialogComponent
    ).componentInstance;
  });

  it('使用者啟用後記錄此瀏覽器已完成一次性引導', async () => {
    await component.enable();

    expect(notificationService.enableNotifications).toHaveBeenCalled();
    expect(clientPreferences.setPreference).toHaveBeenCalledWith(
      'notificationPromptDismissed',
      true
    );
    expect(dialogRef.close).toHaveBeenCalled();
    expect(component.requesting).toBeFalse();
  });

  it('使用者暫不開啟時記錄此瀏覽器已看過引導', () => {
    component.dismiss();

    expect(notificationService.enableNotifications).not.toHaveBeenCalled();
    expect(clientPreferences.setPreference).toHaveBeenCalledWith(
      'notificationPromptDismissed',
      true
    );
    expect(dialogRef.close).toHaveBeenCalled();
  });
});
