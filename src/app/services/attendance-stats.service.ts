import { inject, Injectable } from '@angular/core';
import {
  doc,
  FieldValue,
  Firestore,
  serverTimestamp,
  setDoc,
  Timestamp,
} from '@angular/fire/firestore';
import { format, eachMonthOfInterval } from 'date-fns';
import { combineLatest, concatMap, from } from 'rxjs';

import { AttendanceService, AttendanceType } from './attendance.service';
import { UserService } from './user.service';

@Injectable({
  providedIn: 'root',
})
export class AttendanceStatsService {
  readonly firestore: Firestore = inject(Firestore);

  constructor(
    private attendanceService: AttendanceService,
    private userService: UserService
  ) {}

  updateAttendanceStatsMonthly(yearMonth: string = '2025-01') {
    return combineLatest([
      this.userService.list$,
      this.attendanceService.getCurrentMonth,
    ]).pipe(
      concatMap(([users, attendances]) => {
        const statDocRef = doc(this.firestore, 'attendanceStats', yearMonth);
        const data: AttendanceStats = {
          lastUpdated: serverTimestamp(),
          stats: users.map((user) => {
            return {
              userId: user.uid,
              attendances: this.attendanceService.typeList.map((type) => {
                return {
                  type: type.value,
                  hours: attendances
                    .filter((attendance) => attendance['userId'] == user.uid)
                    .filter((attendance) => attendance['status'] == 'approved')
                    .filter((attendance) => attendance['type'] == type.value)
                    .map((attendance) => attendance['hours'])
                    .reduce((acc, curr) => acc + curr, 0),
                };
              }),
            };
          }),
        };

        return from(setDoc(statDocRef, data));
      })
    );
  }

  getAllMonthsFromYear(year: number) {
    const startDate = new Date(year, 0, 1);
    const endDate = new Date();
    return eachMonthOfInterval({
      start: startDate,
      end: endDate,
    }).map((date) => format(date, 'yyyy-MM'));
  }
}

interface AttendanceStats {
  id?: string;
  lastUpdated: Timestamp | FieldValue;
  stats: UserAttendanceStats[];
}

interface UserAttendanceStats {
  userId?: string;
  attendances: Attendance[];
}

interface Attendance {
  type: AttendanceType;
  hours: number;
}
