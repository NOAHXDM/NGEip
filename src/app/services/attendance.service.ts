import { inject, Injectable } from '@angular/core';
import {
  Firestore,
  Timestamp,
  addDoc,
  collection,
  serverTimestamp,
} from '@angular/fire/firestore';
import { from, switchMap } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class AttendanceService {
  readonly firestore: Firestore = inject(Firestore);
  constructor() { }

  typeList() {
    return attendanceTypeMapping;
  }

  reasonPriorityList() {
    return reasonPriorityMapping;
  }

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
      actionBy: formValue.userName,
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
}

interface AttendanceLog {
  approver?: string;
  auditTrail: AttendanceLogAuditTrail[];
  callout?: string; // 外援呼叫
  endDateTime: Date;
  hours: number;
  proxyUserId?: string;
  proxyUserName?: string;
  reason: string;
  reasonPriority?: ReasonPriority;
  startDateTime: Date;
  status: 'pending' | 'approved' | 'rejected';
  type: AttendanceType;
  userId: string;
  userName: string;
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

const attendanceTypeMapping = [
  { value: AttendanceType.SickLeave, text: '病假' },
  { value: AttendanceType.PersonalLeave, text: '事假' },
  { value: AttendanceType.Overtime, text: '加班' },
  { value: AttendanceType.AnnualLeave, text: '特休' },
  { value: AttendanceType.RemoteWork, text: '遠距工作' },
  { value: AttendanceType.MenstrualLeave, text: '生理假' },
  { value: AttendanceType.BereavementLeave, text: '喪假' },
  { value: AttendanceType.OfficialLeave, text: '公假' },
  { value: AttendanceType.MarriageLeave, text: '婚假' },
  { value: AttendanceType.MaternityLeave, text: '產假' },
  { value: AttendanceType.PaternityLeave, text: '陪產假' },
]

enum ReasonPriority {
  OnlineDisaster = 1, // 線上災難
  UnscheduledTask = 2, // 插件
  UrgentRoutine = 3, // 緊迫的例行
  Compensatory = 4, // 補時數
  Creative = 5, // 創意性質
}

const reasonPriorityMapping = [
  { value: ReasonPriority.OnlineDisaster, text: '線上災難' },
  { value: ReasonPriority.UnscheduledTask, text: '插件' },
  { value: ReasonPriority.UrgentRoutine, text: '緊迫的例行' },
  { value: ReasonPriority.Compensatory, text: '補時數' },
  { value: ReasonPriority.Creative, text: '創意性質' },
]

interface AttendanceLogAuditTrail {
  action: 'create' | 'update' | 'delete';
  actionBy: string;
  actionDateTime: Date;
}

export interface SelectOption {
  text: string;
  value: number;
}
