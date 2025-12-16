import { inject, Injectable } from '@angular/core';
import {
  DocumentReference,
  FieldValue,
  Firestore,
  Timestamp,
  addDoc,
  and,
  collection,
  collectionData,
  doc,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
} from '@angular/fire/firestore';
import { from, Observable, of, switchMap } from 'rxjs';

export interface SelectOption {
  text: string;
  value: number;
}

@Injectable({
  providedIn: 'root',
})
export class SubsidyService {
  readonly firestore: Firestore = inject(Firestore);

  // 補助類型顯示名稱對應
  private readonly typeNameMap: Record<SubsidyType, string> = {
    [SubsidyType.Laptop]: 'Laptop Subsidy',
    [SubsidyType.HealthCheck]: 'Health Check',
    [SubsidyType.Training]: 'Training Course',
    [SubsidyType.AITool]: 'AI Tool',
    [SubsidyType.Travel]: 'Travel Subsidy',
  };

  readonly typeList = Object.keys(SubsidyType)
    .filter((key) => isNaN(Number(key)))
    .map((key) => {
      const value = SubsidyType[key as keyof typeof SubsidyType];
      return {
        text: this.typeNameMap[value],
        value: value,
      } as SelectOption;
    });

  create(formValue: any) {
    const data = {
      ...formValue,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const auditTrail: SubsidyAuditTrail = {
      action: 'create',
      actionBy: formValue.userId,
      actionDateTime: serverTimestamp(),
    };

    return from(
      addDoc(collection(this.firestore, 'subsidyApplications'), data)
    ).pipe(switchMap((docRef) => this.addAuditTrail(docRef, auditTrail)));
  }

  update(formValue: any, originValue: any): Observable<any> {
    const data = {
      ...formValue,
      updatedAt: serverTimestamp(),
    };
    const diff = this.diff(data, originValue);
    if (!diff) {
      return of(null);
    }

    const auditTrail: SubsidyAuditTrail = {
      action: 'update',
      actionBy: formValue.userId,
      actionDateTime: serverTimestamp(),
      content: JSON.stringify(diff),
    };

    const docRef = doc(this.firestore, 'subsidyApplications', originValue.id);
    return from(updateDoc(docRef, diff)).pipe(
      switchMap(() => this.addAuditTrail(docRef, auditTrail))
    );
  }

  updateStatus(
    data: SubsidyApplication,
    status: SubsidyStatus,
    actionBy: string,
    approvedAmount?: number
  ) {
    const diff: any = { status, updatedAt: serverTimestamp() };
    if (approvedAmount !== undefined) {
      diff.approvedAmount = approvedAmount;
    }

    const auditTrail: SubsidyAuditTrail = {
      action: 'status_change',
      actionBy: actionBy,
      actionDateTime: serverTimestamp(),
      previousStatus: data.status,
      newStatus: status,
      content: JSON.stringify(diff),
    };

    return from(
      runTransaction(this.firestore, async (transaction) => {
        const subsidyDocRef = doc(
          this.firestore,
          'subsidyApplications',
          data.id!
        );
        const auditTrailRef = doc(collection(subsidyDocRef, 'auditTrail'));
        transaction.update(subsidyDocRef, diff).set(auditTrailRef, auditTrail);
      })
    );
  }

  getMyApplications(userId: string): Observable<SubsidyApplication[]> {
    const collectRef = collection(this.firestore, 'subsidyApplications');
    return collectionData(
      query(
        collectRef,
        where('userId', '==', userId),
        orderBy('applicationDate', 'desc')
      ),
      { idField: 'id' }
    ) as Observable<SubsidyApplication[]>;
  }

  getMyApplicationsByType(
    userId: string,
    type: SubsidyType
  ): Observable<SubsidyApplication[]> {
    const collectRef = collection(this.firestore, 'subsidyApplications');
    return collectionData(
      query(
        collectRef,
        and(where('userId', '==', userId), where('type', '==', type)),
        orderBy('applicationDate', 'desc')
      ),
      { idField: 'id' }
    ) as Observable<SubsidyApplication[]>;
  }

  getPendingApplications(): Observable<SubsidyApplication[]> {
    const collectRef = collection(this.firestore, 'subsidyApplications');
    return collectionData(
      query(
        collectRef,
        where('status', '==', 'pending'),
        orderBy('applicationDate', 'desc')
      ),
      { idField: 'id' }
    ) as Observable<SubsidyApplication[]>;
  }

  searchByTypeAndDate(
    type: SubsidyType | null,
    startDate: Date,
    endDate: Date
  ): Observable<SubsidyApplication[]> {
    const collectRef = collection(this.firestore, 'subsidyApplications');
    const startTimestamp = Timestamp.fromDate(startDate);
    const endTimestamp = Timestamp.fromDate(endDate);

    const constraints = [
      where('applicationDate', '>=', startTimestamp),
      where('applicationDate', '<', endTimestamp),
    ];

    if (type !== null) {
      constraints.unshift(where('type', '==', type));
    }

    return collectionData(
      query(collectRef, ...constraints, orderBy('applicationDate', 'desc')),
      { idField: 'id' }
    ) as Observable<SubsidyApplication[]>;
  }

  /**
   * 取得當月所有申請
   */
  getCurrentMonthApplications(): Observable<SubsidyApplication[]> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return this.searchByTypeAndDate(null, startOfMonth, startOfNextMonth);
  }

  recordInstallment(
    applicationId: string,
    installmentNumber: number,
    amount: number,
    recordedBy: string
  ): Observable<void> {
    const installment: Omit<LaptopInstallment, 'id'> = {
      installmentNumber,
      receivedDate: serverTimestamp(),
      amount,
      recordedBy,
      createdAt: serverTimestamp(),
    };

    const subsidyDocRef = doc(
      this.firestore,
      'subsidyApplications',
      applicationId
    );
    const installmentsRef = collection(subsidyDocRef, 'installments');

    return from(addDoc(installmentsRef, installment)).pipe(
      switchMap(() => of(void 0))
    );
  }

  getInstallments(applicationId: string): Observable<LaptopInstallment[]> {
    const subsidyDocRef = doc(
      this.firestore,
      'subsidyApplications',
      applicationId
    );
    const installmentsRef = collection(subsidyDocRef, 'installments');
    return collectionData(
      query(installmentsRef, orderBy('installmentNumber', 'asc')),
      { idField: 'id' }
    ) as Observable<LaptopInstallment[]>;
  }

  addAuditTrail(
    docRef: DocumentReference,
    auditTrail: SubsidyAuditTrail
  ): Observable<any> {
    return from(addDoc(collection(docRef, 'auditTrail'), auditTrail));
  }

  getAuditTrail(id: string): Observable<SubsidyAuditTrail[]> {
    const subsidyDocRef = doc(this.firestore, 'subsidyApplications', id);
    const auditTrailCollection = collection(subsidyDocRef, 'auditTrail');
    return collectionData(
      query(auditTrailCollection, orderBy('actionDateTime', 'desc')),
      { idField: 'id' }
    ) as Observable<SubsidyAuditTrail[]>;
  }

  /**
   * 計算筆電補助的總額和每期金額
   * 規則：
   * - 補助總額 = min(發票金額 * 0.8, 54000)
   * - 第1~12期：1000/期
   * - 第13~24期：1500/期
   * - 第25~36期：2000/期
   */
  calculateLaptopSubsidy(invoiceAmount: number) {
    const totalSubsidy = Math.min(invoiceAmount * 0.8, 54000);
    const installmentAmounts: number[] = [];
    let remainingAmount = totalSubsidy;

    for (let i = 1; i <= 36; i++) {
      let amount = 0;
      if (i <= 12) {
        amount = Math.min(1000, remainingAmount);
      } else if (i <= 24) {
        amount = Math.min(1500, remainingAmount);
      } else {
        amount = Math.min(2000, remainingAmount);
      }

      installmentAmounts.push(amount);
      remainingAmount -= amount;

      if (remainingAmount <= 0) {
        break;
      }
    }

    return {
      totalSubsidy,
      installmentAmounts,
    };
  }

  /**
   * 取得特定期數的筆電補助金額
   */
  getLaptopInstallmentAmount(installmentNumber: number, invoiceAmount: number): number {
    const { installmentAmounts } = this.calculateLaptopSubsidy(invoiceAmount);
    return installmentAmounts[installmentNumber - 1] || 0;
  }

  private diff(targetValue: any, originValue: any) {
    const target = { ...targetValue };
    const origin = { ...originValue };

    let diff = {} as any;
    let changed = false;
    Object.keys(target).forEach((key) => {
      if (target[key] != origin[key]) {
        diff[key] = target[key];
        changed = true;
      }
    });

    return changed ? diff : null;
  }
}

export interface SubsidyApplication {
  id?: string;
  userId: string;
  type: SubsidyType;
  status: SubsidyStatus;
  applicationDate: Timestamp | FieldValue;
  approvedAmount?: number;
  createdAt: Timestamp | FieldValue;
  updatedAt: Timestamp | FieldValue;

  content?: string;
  invoiceAmount?: number;

  quarter?: 1 | 2 | 3 | 4;
  carryOverAmount?: number;
}

export enum SubsidyType {
  Laptop = 1,
  HealthCheck = 2,
  Training = 3,
  AITool = 4,
  Travel = 5,
}

export type SubsidyStatus = 'pending' | 'approved' | 'rejected';

export interface LaptopInstallment {
  id?: string;
  installmentNumber: number;
  receivedDate: Timestamp | FieldValue;
  amount: number;
  recordedBy: string;
  createdAt: Timestamp | FieldValue;
}

export interface SubsidyAuditTrail {
  id?: string;
  action: 'create' | 'update' | 'status_change';
  actionBy: string;
  actionDateTime: Timestamp | FieldValue;
  content?: string;
  previousStatus?: SubsidyStatus;
  newStatus?: SubsidyStatus;
}
