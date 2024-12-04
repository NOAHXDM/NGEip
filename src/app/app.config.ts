import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { getAuth, provideAuth } from '@angular/fire/auth';
import { getFirestore, provideFirestore } from '@angular/fire/firestore';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideFirebaseApp(() =>
      initializeApp({
        projectId: 'noah-eip',
        appId: '1:596868888265:web:521cbfab9471bd2aa0ff18',
        storageBucket: 'noah-eip.firebasestorage.app',
        apiKey: 'AIzaSyAAfL4F-eSuDLeDrgppC-jcNqAqE5dwqKY',
        authDomain: 'noah-eip.firebaseapp.com',
        messagingSenderId: '596868888265',
        measurementId: 'G-8GHHDKZNPE',
      })
    ),
    provideAuth(() => getAuth()),
    provideFirestore(() => getFirestore()),
  ],
};
