import { inject, Injectable } from '@angular/core';
import {
  FieldValue,
  Firestore,
  Timestamp,
  addDoc,
  collection,
  collectionData,
  doc,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from '@angular/fire/firestore';
import { from, Observable, of, switchMap } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class AttendanceService {
  readonly firestore: Firestore = inject(Firestore);
  readonly typeList = Object.keys(AttendanceType)
    .filter((key) => isNaN(Number(key)))
    .map((key) => {
      return {
        text: key,
        value: AttendanceType[key as keyof typeof AttendanceType],
      } as SelectOption;
    });
  readonly reasonPriorityList = Object.keys(ReasonPriority)
    .filter((key) => isNaN(Number(key)))
    .map((key) => {
      return {
        text: key,
        value: ReasonPriority[key as keyof typeof ReasonPriority],
      } as SelectOption;
    });

  constructor() {}

  create(formValue: any) {
    const data = {
      ...formValue,
      startDateTime: Timestamp.fromDate(
        (formValue.startDateTime as any).toDate()
      ),
      endDateTime: Timestamp.fromDate((formValue.endDateTime as any).toDate()),
    };

    const auditTrail = {
      action: 'create',
      actionBy: formValue.userId,
      actionDateTime: serverTimestamp(),
    };

    return from(
      addDoc(collection(this.firestore, 'attendanceLogs'), data)
    ).pipe(
      switchMap((docRef) => {
        return from(addDoc(collection(docRef, 'auditTrail'), auditTrail));
      })
    );
  }

  update(formValue: any, originValue: any): Observable<any> {
    const data = {
      ...formValue,
      startDateTime: Timestamp.fromDate(
        formValue.startDateTime instanceof Date
          ? formValue.startDateTime
          : (formValue.startDateTime as any).toDate()
      ),
      endDateTime: Timestamp.fromDate(
        formValue.endDateTime instanceof Date
          ? formValue.endDateTime
          : (formValue.endDateTime as any).toDate()
      ),
    };
    const diff = this.diff(data, originValue);
    if (!diff) {
      return of(null);
    }

    const auditTrail = {
      action: 'update',
      actionBy: formValue.userId,
      actionDateTime: serverTimestamp(),
      content: JSON.stringify(diff),
    };

    const docRef = doc(this.firestore, 'attendanceLogs', originValue.id);
    return from(updateDoc(docRef, diff)).pipe(
      switchMap(() => {
        return from(addDoc(collection(docRef, 'auditTrail'), auditTrail));
      })
    );
  }

  search(query?: any) {
    // TODO: query
    return this.getCurrentMonth();
  }

  getCurrentMonth() {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const startOfNextMonth = new Date(startOfMonth);
    startOfNextMonth.setMonth(startOfMonth.getMonth() + 1);

    const startTimestamp = Timestamp.fromDate(startOfMonth);
    const endTimestamp = Timestamp.fromDate(startOfNextMonth);

    const collectRef = collection(this.firestore, 'attendanceLogs');
    return collectionData(
      query(
        collectRef,
        where('startDateTime', '>=', startTimestamp),
        where('startDateTime', '<', endTimestamp),
        orderBy('startDateTime', 'desc')
      ),
      { idField: 'id' }
    );
  }

  private diff(targetValue: any, originValue: any) {
    const target = {
      ...targetValue,
      startDateTime: targetValue.startDateTime.valueOf(),
      endDateTime: targetValue.endDateTime.valueOf(),
    };
    const origin = {
      ...originValue,
      startDateTime: originValue.startDateTime.valueOf(),
      endDateTime: originValue.endDateTime.valueOf(),
    };

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

export interface AttendanceLog {
  auditTrail: AttendanceLogAuditTrail[];
  callout?: string; // 外援呼叫
  endDateTime: Timestamp | FieldValue;
  hours: number;
  id?: string;
  proxyUserId?: string;
  reason: string;
  reasonPriority?: ReasonPriority;
  startDateTime: Timestamp | FieldValue;
  status: 'pending' | 'approved' | 'rejected';
  type: AttendanceType;
  userId: string;
}

export enum AttendanceType {
  SickLeave = 1, // 病假
  PersonalLeave = 2, // 事假
  Overtime = 3, // 加班
  AnnualLeave = 4, // 特休
  RemoteWork = 5, // 遠距工作
  MenstrualLeave = 6, // 生理假
  BereavementLeave = 7, // 喪假
  OfficialLeave = 8, // 公假
  MarriageLeave = 9, // 婚假
  MaternityLeave = 10, // 產假
  PaternityLeave = 11, // 陪產假
}

enum ReasonPriority {
  OnlineDisaster = 1, // 線上災難
  UnscheduledTask = 2, // 插件
  UrgentRoutine = 3, // 緊迫的例行
  Compensatory = 4, // 補時數
  Creative = 5, // 創意性質
}

interface AttendanceLogAuditTrail {
  action: 'create' | 'update';
  actionBy: string;
  actionDateTime: Timestamp | FieldValue;
  content?: string;
}

export interface SelectOption {
  text: string;
  value: number;
}
