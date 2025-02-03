import { inject, Injectable } from '@angular/core';
import {
  doc,
  FieldValue,
  Firestore,
  serverTimestamp,
  setDoc,
  Timestamp,
  docData,
} from '@angular/fire/firestore';
import {
  format,
  eachMonthOfInterval,
  parse,
  startOfMonth,
  addMonths,
  subMonths,
} from 'date-fns';
import { combineLatest, concatMap, from, map } from 'rxjs';

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

  getAttendanceStatsMonthly(yearMonth: string) {
    return docData(doc(this.firestore, 'attendanceStats', yearMonth), {
      idField: 'id',
    }).pipe(
      map((data) =>
        data ? new AttendanceStatsModel(data as AttendanceStats) : null
      )
    );
  }

  getAttendanceStatsTemporary() {
    return combineLatest([
      this.userService.list$,
      this.attendanceService.getCurrentMonth,
    ]).pipe(
      map(([users, attendances]) => {
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
        return new AttendanceStatsModel(data);
      })
    );
  }

  updateAttendanceStatsMonthly(yearMonth: string) {
    const startDate = startOfMonth(parse(yearMonth, 'yyyy-MM', new Date()));
    const endDate = startOfMonth(addMonths(startDate, 1));

    return combineLatest([
      this.userService.list$,
      this.attendanceService.search(startDate, endDate),
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
    const endDate = subMonths(new Date(), 1);
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

class AttendanceStatsModel {
  lastUpdated: Timestamp | FieldValue;
  stats: UserAttendanceStatsModel[];

  constructor(data: AttendanceStats) {
    this.lastUpdated = data.lastUpdated;
    this.stats = data.stats.map((stat) => new UserAttendanceStatsModel(stat));
  }
}

export class UserAttendanceStatsModel {
  userId: string;
  [key: string]: number | string;

  constructor(data: UserAttendanceStats) {
    this.userId = data.userId!;
    const needOffset = data.attendances
      .filter(
        (attendance) =>
          attendance.type == AttendanceType.PersonalLeave ||
          attendance.type == AttendanceType.Overtime
      )
      .every((attendance) => attendance.hours > 0);
    let personalLeave = data.attendances.find(
      (item) => item.type == AttendanceType.PersonalLeave
    )!;
    let overtime = data.attendances.find(
      (item) => item.type == AttendanceType.Overtime
    )!;

    data.attendances.forEach((attendance) => {
      const key = AttendanceType[attendance.type];
      if (needOffset && attendance.type == AttendanceType.PersonalLeave) {
        this[`_${key}`] = attendance.hours;
        this[key] =
          personalLeave.hours > overtime.hours
            ? personalLeave.hours - overtime.hours
            : 0;
      } else if (needOffset && attendance.type == AttendanceType.Overtime) {
        this[`_${key}`] = attendance.hours;
        this[key] =
          overtime.hours > personalLeave.hours
            ? overtime.hours - personalLeave.hours
            : 0;
      } else {
        this[key] = attendance.hours;
      }
    });
  }
}
