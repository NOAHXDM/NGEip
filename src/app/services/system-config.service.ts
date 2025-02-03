import { Injectable, inject } from '@angular/core';
import {
  FieldValue,
  Firestore,
  Timestamp,
  doc,
  runTransaction,
  serverTimestamp,
  setDoc,
} from '@angular/fire/firestore';
import { catchError, from, of } from 'rxjs';

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

        // Initialize the license
        this.license = {
          maxUsers: 10,
          currentUsers: 0,
          lastUpdated: serverTimestamp(),
          initialSettlementYear: new Date().getFullYear(),
        };
        transaction.set(systemConfigRef, this.license);
      })
    ).pipe(catchError((error) => of()));
  }

  updateLicense(maxUsers: number, initialSettlementYear: number) {
    const systemConfigRef = doc(this.firestore, 'systemConfig', 'license');
    return from(
      setDoc(
        systemConfigRef,
        { maxUsers, initialSettlementYear },
        { merge: true }
      )
    );
  }
}

export interface License {
  maxUsers: number;
  currentUsers: number;
  lastUpdated: Timestamp | FieldValue;
  initialSettlementYear: number;
}
