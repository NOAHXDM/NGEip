import { Injectable, inject } from '@angular/core';
import {
  Messaging,
  deleteToken,
  getToken,
  isSupported,
  onMessage,
} from '@angular/fire/messaging';
import { MatSnackBar } from '@angular/material/snack-bar';

import { environment } from '../../environments/environment';
import { ClientPreferencesService } from './client-preferences.service';

@Injectable({
  providedIn: 'root',
})
export class NotificationService {
  private readonly messaging = inject(Messaging, { optional: true });
  private readonly snackBar = inject(MatSnackBar);
  private readonly clientPreferences = inject(ClientPreferencesService);

  /**
   * @angular/fire/messaging 模組層級函式的 seam：以 instance 屬性持有，
   * 供單元測試直接覆寫攔截，規避 ES module 匯出 non-configurable 無法 spyOn 的限制
   * （與 UserService._fn 同策略）。
   */
  readonly _fn = { getToken, onMessage, isSupported, deleteToken };

  private swRegistration: ServiceWorkerRegistration | null = null;
  private foregroundListenerRegistered = false;

  /** 瀏覽器 + 環境是否支援 Web Push（HTTPS/localhost、Notification API、messaging provider 等）*/
  isMessagingSupported(): Promise<boolean> {
    if (!this.messaging || typeof Notification === 'undefined') {
      return Promise.resolve(false);
    }
    return this._fn.isSupported();
  }

  getPermissionState(): NotificationPermission | 'unsupported' {
    if (typeof Notification === 'undefined') return 'unsupported';
    return Notification.permission;
  }

  /** 使用者在此瀏覽器表達的通知意願，不代表 Token 或投遞狀態。 */
  isOptedIn(): boolean {
    return this.clientPreferences.getPreference('notificationOptIn') === true;
  }

  /** 註冊 firebase-messaging-sw.js（若尚未註冊），回傳 registration */
  async registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
    if (!('serviceWorker' in navigator)) return null;
    if (this.swRegistration) return this.swRegistration;

    // 清除 Firebase SDK 自動註冊的預設 scope 殘留：早期版本在 SDK 不知道任何
    // registration 的情況下呼叫 deleteToken()，SDK 會自行註冊一支掛在
    // /firebase-cloud-messaging-push-scope 的 SW，與我們根 scope 的正規註冊
    // 並存，造成同源兩支 SW 搶收 push。正規註冊只認根 scope 這一支。
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      registrations
        .filter((reg) => reg.scope.includes('firebase-cloud-messaging-push-scope'))
        .map((reg) => reg.unregister())
    );

    this.swRegistration = await navigator.serviceWorker.register(
      '/firebase-messaging-sw.js'
    );
    // getToken() 內部會呼叫 pushManager.subscribe()，部分瀏覽器要求 registration
    // 已經是 active 狀態才能訂閱；register() 本身只保證安裝已觸發，未必已 active。
    await navigator.serviceWorker.ready;
    return this.swRegistration;
  }

  /** 使用者手勢觸發的正式啟用流程；背景初始化不得呼叫此方法。 */
  async enableNotifications(): Promise<boolean> {
    const supported = await this.isMessagingSupported();
    if (!supported || !this.messaging) return false;

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      this.clientPreferences.setPreference('notificationOptIn', false);
      return false;
    }

    const enabled = await this.syncNotificationSubscription();
    this.clientPreferences.setPreference('notificationOptIn', enabled);
    return enabled;
  }

  /** 應用程式啟動時恢復此瀏覽器已明確啟用的訂閱。 */
  async initializeNotificationLifecycle(): Promise<void> {
    if (!this.isOptedIn()) return;
    if (!(await this.isMessagingSupported())) return;
    if (this.getPermissionState() !== 'granted') return;
    await this.syncNotificationSubscription();
  }

  /** 已授權情境下靜默建立或修復 SW 與 FCM 訂閱。 */
  async syncNotificationSubscription(): Promise<boolean> {
    if (!this.messaging || this.getPermissionState() !== 'granted') return false;
    const registration = await this.registerServiceWorker();
    if (!registration) return false;

    try {
      const token = await this._fn.getToken(this.messaging, {
        vapidKey: environment.vapidKey,
        serviceWorkerRegistration: registration,
      });
      if (!token) return false;
      this.registerForegroundHandler();
      return true;
    } catch (error) {
      console.error('[NotificationService] 無法建立推播訂閱', error);
      return false;
    }
  }

  /** 撤銷此瀏覽器的 FCM/Push 訂閱；瀏覽器層級 permission 仍可能是 granted。 */
  async disableNotifications(): Promise<void> {
    // 先記錄使用者意圖，即使清理失敗，下次啟動也不會自動重建訂閱。
    this.clientPreferences.setPreference('notificationOptIn', false);
    if (!('serviceWorker' in navigator)) return;

    const registration =
      this.swRegistration ?? (await navigator.serviceWorker.getRegistration('/')) ?? null;
    if (!registration) return;
    this.swRegistration = registration;

    const subscription = await registration.pushManager.getSubscription();
    if (subscription && this.messaging) {
      try {
        await this._fn.deleteToken(this.messaging);
      } catch {
        // SDK 狀態可能已失效，仍繼續解除瀏覽器底層訂閱。
      }
    }
    const remainingSubscription = await registration.pushManager.getSubscription();
    await remainingSubscription?.unsubscribe();
  }

  /** 前景訊息：頁面開啟中收到推播時不會自動跳系統通知，改用 MatSnackBar 呈現 */
  private registerForegroundHandler() {
    if (this.foregroundListenerRegistered || !this.messaging) return;
    this.foregroundListenerRegistered = true;
    this._fn.onMessage(this.messaging, (payload) => {
      const title = payload.notification?.title ?? '新通知';
      this.snackBar.open(title, '關閉', { duration: 5000 });
    });
  }
}
