import { AsyncPipe } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatToolbarModule } from '@angular/material/toolbar';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { take } from 'rxjs';

import { FcmPermissionDialogComponent } from '../notifications/fcm-permission-dialog/fcm-permission-dialog.component';
import { ClientPreferencesService } from '../services/client-preferences.service';
import { NotificationService } from '../services/notification.service';
import { UserService } from '../services/user.service';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [
    AsyncPipe,
    RouterLink,
    RouterOutlet,
    MatButtonModule,
    MatDividerModule,
    MatIconModule,
    MatMenuModule,
    MatToolbarModule,
  ],
  templateUrl: './layout.component.html',
  styleUrl: './layout.component.scss',
})
export class LayoutComponent implements OnInit {
  userService = inject(UserService);
  readonly isAdmin$ = this.userService.isAdmin$;
  readonly currentUser$ = this.userService.currentUser$;

  private readonly notificationService = inject(NotificationService);
  private readonly clientPreferences = inject(ClientPreferencesService);
  private readonly dialog = inject(MatDialog);

  constructor(private _router: Router) {}

  async ngOnInit() {
    const supported = await this.notificationService.isMessagingSupported();
    if (!supported) return;

    await this.notificationService.initializeNotificationLifecycle();
    const permission = this.notificationService.getPermissionState();
    if (permission !== 'default') return;

    // 登入後一次性詢問是否開啟推播通知；使用者已互動過（同意/拒絕）或瀏覽器
    // 授權狀態已非 'default' 就不再打擾，避免每次登入都跳出。
    if (this.clientPreferences.getPreference('notificationPromptDismissed')) return;

    this.dialog.open(FcmPermissionDialogComponent);
  }

  logout() {
    this.userService
      .logout()
      .pipe(take(1))
      .subscribe({
        next: () => this._router.navigate(['/Login']),
        error: (error) => {},
      });
  }
}
