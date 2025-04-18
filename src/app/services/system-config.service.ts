import { Injectable, inject } from '@angular/core';
import {
  FieldValue,
  Firestore,
  Timestamp,
  doc,
  docData,
  runTransaction,
  serverTimestamp,
  setDoc,
} from '@angular/fire/firestore';
import { catchError, from, Observable, of } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class SystemConfigService {
  firestore: Firestore = inject(Firestore);
  license$ = docData(
    doc(this.firestore, 'systemConfig', 'license')
  ) as Observable<License>;
  constructor() {}

  createLicenseIfNotExists() {
    const systemConfigRef = doc(this.firestore, 'systemConfig', 'license');

    return from(
      runTransaction(this.firestore, async (transaction) => {
        const systemConfigDoc = await transaction.get(systemConfigRef);
        // If the document does not exist, create it
        if (systemConfigDoc.exists()) {
          throw new Error('License already exists');
        }

        // Initialize the license
        const license = {
          maxUsers: 10,
          currentUsers: 0,
          lastUpdated: serverTimestamp(),
          initialSettlementYear: new Date().getFullYear(),
          timeFilterRange: false,
        };
        transaction.set(systemConfigRef, license);
      })
    ).pipe(catchError((error) => of()));
  }

  updateLicense(
    maxUsers: number,
    initialSettlementYear: number,
    timeFilterRange: boolean
  ) {
    const systemConfigRef = doc(this.firestore, 'systemConfig', 'license');
    return from(
      setDoc(
        systemConfigRef,
        { maxUsers, initialSettlementYear, timeFilterRange },
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
  timeFilterRange: boolean;
}
