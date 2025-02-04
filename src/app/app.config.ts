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
import { SystemConfigService } from './services/system-config.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideFirebaseApp(() =>
      initializeApp({
        apiKey: 'AIzaSyAAfL4F-eSuDLeDrgppC-jcNqAqE5dwqKY',
        authDomain: 'noah-eip.firebaseapp.com',
        projectId: 'noah-eip',
        storageBucket: 'noah-eip.firebasestorage.app',
        messagingSenderId: '596868888265',
        appId: '1:596868888265:web:521cbfab9471bd2aa0ff18',
        measurementId: 'G-8GHHDKZNPE',
      })
    ),
    provideAuth(() => getAuth()),
    provideFirestore(() => getFirestore()),
    provideAuth(() => {
      const auth = getAuth();
      connectAuthEmulator(auth, 'http://localhost:9099', {
        disableWarnings: true,
      });
      return auth;
    }),
    provideFirestore(() => {
      const firestore = getFirestore();
      connectFirestoreEmulator(firestore, 'localhost', 8080);
      return firestore;
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
  ],
};
