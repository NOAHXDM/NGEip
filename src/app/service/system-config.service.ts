import { Injectable, inject } from '@angular/core';
import {
  doc,
  Firestore,
  runTransaction,
  serverTimestamp,
} from '@angular/fire/firestore';
import { catchError, from, of } from 'rxjs';
import { License } from '../models/system.config';

@Injectable({
  providedIn: 'root',
})
export class SystemConfigService {
  firestore: Firestore = inject(Firestore);
  license: License | undefined;
  constructor() {}

  createLicenseIfNotExists() {
    const systemConfigRef = doc(this.firestore, 'systemConfig', 'license');

    return from(
      runTransaction(this.firestore, async (transaction) => {
        const systemConfigDoc = await transaction.get(systemConfigRef);
        // If the document does not exist, create it
        if (systemConfigDoc.exists()) {
          this.license = systemConfigDoc.data() as License;
          throw new Error('License already exists');
        }

        const initialLicense: License = {
          maxUsers: 10,
          currentUsers: 0,
          lastUpdated: serverTimestamp(),
        };
        transaction.set(systemConfigRef, initialLicense);
      })
    ).pipe(
      catchError((error) => {
        console.log('Creating license failed:', error);
        return of(null);
      })
    );
  }
}
