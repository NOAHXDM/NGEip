import {
  APP_INITIALIZER,
  ApplicationConfig,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { getAuth, provideAuth, connectAuthEmulator } from '@angular/fire/auth';
import {
  getFirestore,
  provideFirestore,
  connectFirestoreEmulator,
} from '@angular/fire/firestore';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { environment } from '../environments/environment';
import { SystemConfigService } from './services/system-config.service';
import { LEAVE_POLICY_CONFIG, TAIWAN_POLICY } from './tokens/leave-policy.token';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideFirebaseApp(() =>
      initializeApp({
        apiKey: 'AIzaSyB_uE1Ij0dNDkxB5cpsMT1qvSWsYfnhF_g',
        authDomain: 'noahxdm-eip.firebaseapp.com',
        projectId: 'noahxdm-eip',
        storageBucket: 'noahxdm-eip.firebasestorage.app',
        messagingSenderId: '498650578048',
        appId: '1:498650578048:web:a53ddd4109481f3ee67a65',
        measurementId: 'G-XXSMLYXYDS',
      })
    ),
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
    provideAnimationsAsync(),
    {
      provide: APP_INITIALIZER,
      deps: [SystemConfigService],
      useFactory: (systemConfigService: SystemConfigService) => {
        return () => systemConfigService.createLicenseIfNotExists();
      },
      multi: true,
    },
    { provide: LEAVE_POLICY_CONFIG, useValue: TAIWAN_POLICY }
  ],
};
