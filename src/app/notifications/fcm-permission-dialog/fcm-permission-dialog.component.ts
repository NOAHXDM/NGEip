import { Component, inject } from '@angular/core';
import {
  MatDialogActions,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';

import { ClientPreferencesService } from '../../services/client-preferences.service';
import { NotificationService } from '../../services/notification.service';

@Component({
  selector: 'app-fcm-permission-dialog',
  standalone: true,
  imports: [
    MatDialogTitle,
    MatDialogContent,
    MatDialogActions,
    MatButtonModule,
  ],
  templateUrl: './fcm-permission-dialog.component.html',
  styleUrl: './fcm-permission-dialog.component.scss',
})
export class FcmPermissionDialogComponent {
  private readonly notificationService = inject(NotificationService);
  private readonly clientPreferences = inject(ClientPreferencesService);
  private readonly dialogRef = inject(
    MatDialogRef<FcmPermissionDialogComponent>
  );

  requesting = false;

  async enable() {
    this.requesting = true;
    await this.notificationService.enableNotifications();
    this.requesting = false;
    this.clientPreferences.setPreference('notificationPromptDismissed', true);
    this.dialogRef.close();
  }

  dismiss() {
    this.clientPreferences.setPreference('notificationPromptDismissed', true);
    this.dialogRef.close();
  }
}
