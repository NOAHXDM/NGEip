import { Injectable, inject, EnvironmentInjector, runInInjectionContext } from '@angular/core';
import {
  FieldValue,
  Firestore,
  Timestamp,
  deleteField,
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
  private injector = inject(EnvironmentInjector);
  license$ = runInInjectionContext(this.injector, () =>
    docData(
      doc(this.firestore, 'systemConfig', 'license')
    ) as Observable<License>
  );
  constructor() {}

  createLicenseIfNotExists() {
    const systemConfigRef = doc(this.firestore, 'systemConfig', 'license');

    return from(
      runTransaction(this.firestore, async (transaction) => {
        const systemConfigDoc = await transaction.get(systemConfigRef);
        if (systemConfigDoc.exists()) {
          if ('currentUsers' in systemConfigDoc.data()) {
            transaction.update(systemConfigRef, {
              currentUsers: deleteField(),
            });
          }
          return;
        }

        // Initialize the license
        const license = {
          maxUsers: 10,
          lastUpdated: serverTimestamp(),
          initialSettlementYear: new Date().getFullYear(),
          timeFilterRange: false,
          overtimePriorityReplacedByLeave: [],
          cloudinaryCloudName: '',
          cloudinaryUploadPresetp: '',
        };
        transaction.set(systemConfigRef, license);
      })
    ).pipe(catchError((error) => of()));
  }

  updateLicense(
    maxUsers: number,
    initialSettlementYear: number,
    timeFilterRange: boolean,
    overtimePriorityReplacedByLeave: number[],
    cloudinaryCloudName: string,
    cloudinaryUploadPreset: string
  ) {
    const systemConfigRef = doc(this.firestore, 'systemConfig', 'license');
    return from(
      setDoc(
        systemConfigRef,
        {
          maxUsers,
          initialSettlementYear,
          timeFilterRange,
          overtimePriorityReplacedByLeave,
          cloudinaryCloudName,
          cloudinaryUploadPreset,
        },
        { merge: true }
      )
    );
  }
}

export interface License {
  maxUsers: number;
  lastUpdated: Timestamp | FieldValue;
  initialSettlementYear: number;
  timeFilterRange: boolean;
  overtimePriorityReplacedByLeave: number[];
  cloudinaryCloudName: string;
  cloudinaryUploadPreset: string;
}
