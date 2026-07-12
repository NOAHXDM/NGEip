import {
  APP_INITIALIZER,
  ApplicationConfig,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';

import { routes } from './app.routes';
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { getAuth, provideAuth, connectAuthEmulator } from '@angular/fire/auth';
import {
  getFirestore,
  provideFirestore,
  connectFirestoreEmulator,
} from '@angular/fire/firestore';
import {
  getStorage,
  provideStorage,
  connectStorageEmulator,
} from '@angular/fire/storage';
import {
  getMessaging,
  Messaging,
  provideMessaging,
} from '@angular/fire/messaging';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { environment } from '../environments/environment';
import firebaseConfig from '../firebase-config.json';
import { SystemConfigService } from './services/system-config.service';
import { LEAVE_POLICY_CONFIG, TAIWAN_POLICY } from './tokens/leave-policy.token';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideFirebaseApp(() => initializeApp(firebaseConfig)),
    environment.useEmulators
      ? provideAuth(() => {
        const auth = getAuth();
        connectAuthEmulator(auth, 'http://localhost:9099', {
          disableWarnings: true,
        });
        return auth;
      })
      : provideAuth(() => getAuth()),
    environment.useEmulators
      ? provideFirestore(() => {
        const firestore = getFirestore();
        connectFirestoreEmulator(firestore, 'localhost', 8080);
        return firestore;
      })
      : provideFirestore(() => getFirestore()),
    environment.useEmulators
      ? provideStorage(() => {
        const storage = getStorage();
        connectStorageEmulator(storage, 'localhost', 9199);
        return storage;
      })
      : provideStorage(() => getStorage()),
    provideMessaging(() => {
      // 非所有瀏覽器/情境都支援 Messaging（例如舊版 Safari、非安全來源），
      // getMessaging() 可能直接 throw；擋在這裡避免拖垮整個 Firebase provider 鏈。
      // 實際的支援度判斷交給 NotificationService 的 isSupported() gate。
      try {
        return getMessaging();
      } catch {
        return null as unknown as Messaging;
      }
    }),
    provideAnimationsAsync(),
    {
      provide: APP_INITIALIZER,
      deps: [SystemConfigService],
      useFactory: (systemConfigService: SystemConfigService) => {
        return () => systemConfigService.createLicenseIfNotExists();
      },
      multi: true,
    },
    { provide: LEAVE_POLICY_CONFIG, useValue: TAIWAN_POLICY },
    provideHttpClient(),
  ],
};
