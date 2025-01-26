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
  or,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
} from '@angular/fire/firestore';
import { startOfWeek, addDays, startOfDay } from 'date-fns';
import { from, Observable, of, shareReplay, switchMap } from 'rxjs';

import { User } from './user.service';

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
  readonly getCurrentDay = this._getCurrentDay().pipe(shareReplay(1));
  readonly getCurrentWeek = this._getCurrentWeek().pipe(shareReplay(1));
  readonly getCurrentMonth = this._getCurrentMonth().pipe(shareReplay(1));

  constructor() {}

  create(formValue: any) {
    const data = {
      ...formValue,
      startDateTime: Timestamp.fromDate(formValue.startDateTime),
      endDateTime: Timestamp.fromDate(formValue.endDateTime),
    };

    const auditTrail: AttendanceLogAuditTrail = {
      action: 'create',
      actionBy: formValue.userId,
      actionDateTime: serverTimestamp(),
    };

    return from(
      addDoc(collection(this.firestore, 'attendanceLogs'), data)
    ).pipe(switchMap((docRef) => this.addAuditTrail(docRef, auditTrail)));
  }

  update(formValue: any, originValue: any): Observable<any> {
    const data = {
      ...formValue,
      startDateTime: Timestamp.fromDate(formValue.startDateTime),
      endDateTime: Timestamp.fromDate(formValue.endDateTime),
    };
    const diff = this.diff(data, originValue);
    if (!diff) {
      return of(null);
    }

    const auditTrail: AttendanceLogAuditTrail = {
      action: 'update',
      actionBy: formValue.userId,
      actionDateTime: serverTimestamp(),
      content: this.maskCotent(diff),
    };

    const docRef = doc(this.firestore, 'attendanceLogs', originValue.id);
    return from(updateDoc(docRef, diff)).pipe(
      switchMap(() => this.addAuditTrail(docRef, auditTrail))
    );
  }

  updateStatus(
    data: AttendanceLog,
    status: 'pending' | 'approved' | 'rejected',
    actionBy: string
  ) {
    const diff = { status };
    const auditTrail: AttendanceLogAuditTrail = {
      action: 'update',
      actionBy: actionBy,
      actionDateTime: serverTimestamp(),
      content: this.maskCotent(diff),
    };

    return from(
      runTransaction(this.firestore, async (transaction) => {
        const leaveTransactionHistory =
          this.shouldUpdateUserRemainingLeaveHours(data, status, actionBy);
        if (leaveTransactionHistory) {
          const userRef = doc(this.firestore, 'users', data.userId);
          const userSnapshot = await transaction.get(userRef);
          const { remainingLeaveHours } = userSnapshot.data() as User;
          if (remainingLeaveHours + leaveTransactionHistory.hours < 0) {
            throw new Error('Insufficient leave hours');
          }

          const leaveTransactionHistoryCollectionRef = collection(
            userRef,
            'leaveTransactionHistory'
          );
          const newleaveTransactionHistoryDocRef = doc(
            leaveTransactionHistoryCollectionRef
          );

          transaction
            .update(userRef, {
              remainingLeaveHours:
                remainingLeaveHours + leaveTransactionHistory.hours,
            })
            .set(newleaveTransactionHistoryDocRef, leaveTransactionHistory);
        }

        const attendanceLogDocRef = doc(
          this.firestore,
          'attendanceLogs',
          data.id!
        );
        const auditTrailRef = doc(
          collection(attendanceLogDocRef, 'auditTrail')
        );
        transaction
          .update(attendanceLogDocRef, diff)
          .set(auditTrailRef, auditTrail);
      })
    );
  }

  private shouldUpdateUserRemainingLeaveHours(
    data: AttendanceLog,
    status: 'pending' | 'approved' | 'rejected',
    actionBy: string
  ) {
    const deduct = data.status == 'pending' && status == 'approved';
    const add = data.status == 'approved' && status == 'pending';
    if (data.type == AttendanceType.AnnualLeave && (add || deduct)) {
      return {
        actionBy: actionBy,
        date: serverTimestamp(),
        hours: deduct ? 0 - data.hours : data.hours,
        reason: `From attendance#${data.id}`,
      };
    }

    return null;
  }

  search(startDateTime: Date, endDateTime: Date) {
    const startTimestamp = Timestamp.fromDate(startDateTime);
    const endTimestamp = Timestamp.fromDate(endDateTime);

    const collectRef = collection(this.firestore, 'attendanceLogs');
    return collectionData(
      query(
        collectRef,
        or(
          and(
            where('startDateTime', '>=', startTimestamp),
            where('startDateTime', '<', endTimestamp)
          ),
          and(
            where('endDateTime', '>=', startTimestamp),
            where('endDateTime', '<', endTimestamp)
          )
        ),
        orderBy('startDateTime', 'desc')
      ),
      { idField: 'id' }
    );
  }

  private _getCurrentDay() {
    const today = new Date();
    const dayStart = startOfDay(today);
    const dayEnd = startOfDay(addDays(today, 1));
    return this.search(dayStart, dayEnd);
  }

  private _getCurrentWeek() {
    const today = new Date();
    const weekStart = startOfWeek(today, { weekStartsOn: 1 });
    const weekEnd = startOfDay(addDays(weekStart, 7));
    return this.search(weekStart, weekEnd);
  }

  private _getCurrentMonth() {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const startOfNextMonth = new Date(startOfMonth);
    startOfNextMonth.setMonth(startOfMonth.getMonth() + 1);
    return this.search(startOfMonth, startOfNextMonth);
  }

  addAuditTrail(
    docRef: DocumentReference,
    auditTrail: AttendanceLogAuditTrail
  ) {
    return from(addDoc(collection(docRef, 'auditTrail'), auditTrail));
  }

  getAuditTrail(id: string) {
    const attendanceLogRef = doc(this.firestore, 'attendanceLogs', id);
    const auditTrailCollection = collection(attendanceLogRef, 'auditTrail');
    return collectionData(
      query(auditTrailCollection, orderBy('actionDateTime', 'desc')),
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
        if (key === 'startDateTime' || key === 'endDateTime') {
          diff[key] = targetValue[key];
        } else {
          diff[key] = target[key];
        }
        changed = true;
      }
    });

    return changed ? diff : null;
  }

  private maskCotent(diff: any) {
    const masked = { ...diff };
    if (masked.callout) {
      masked.callout = maskString(masked.callout);
    }
    if (masked.proxyUserId) {
      masked.proxyUserId = maskString(masked.proxyUserId);
    }
    if (masked.userId) {
      masked.userId = maskString(masked.userId);
    }

    return JSON.stringify(masked);

    function maskString(str: string) {
      return str.replace(
        /^(.{3})(.*)(.{3})$/,
        (match, p1, p2, p3) => `${p1}${'*'.repeat(p2.length)}${p3}`
      );
    }
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
  id?: string;
}

export interface SelectOption {
  text: string;
  value: number;
}
