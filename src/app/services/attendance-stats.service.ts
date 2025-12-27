import { inject, Injectable, EnvironmentInjector, runInInjectionContext } from '@angular/core';
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

import {
  AttendanceLog,
  AttendanceService,
  AttendanceType,
} from './attendance.service';
import { UserService } from './user.service';
import { SystemConfigService } from './system-config.service';

@Injectable({
  providedIn: 'root',
})
export class AttendanceStatsService {
  readonly firestore: Firestore = inject(Firestore);
  readonly systemConfigService = inject(SystemConfigService);
  private readonly injector = inject(EnvironmentInjector);

  constructor(
    private attendanceService: AttendanceService,
    private userService: UserService
  ) {}

  getAttendanceStatsMonthly(yearMonth: string) {
    return runInInjectionContext(this.injector, () =>
      docData(doc(this.firestore, 'attendanceStats', yearMonth), {
        idField: 'id',
      }).pipe(
        map((data) =>
          data ? new AttendanceStatsModel(data as AttendanceStats) : null
        )
      )
    );
  }

  getAttendanceStatsTemporary() {
    return this.calcuateAttendanceStatsMonthly().pipe(
      map((data) => new AttendanceStatsModel(data))
    );
  }

  updateAttendanceStatsMonthly(yearMonth: string) {
    return this.calcuateAttendanceStatsMonthly(yearMonth).pipe(
      concatMap((data) => {
        const statDocRef = doc(this.firestore, 'attendanceStats', yearMonth);
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

  private calcuateAttendanceStatsMonthly(yearMonth?: string) {
    let attendanceLogsRef = this.attendanceService.getCurrentMonth;
    if (yearMonth) {
      const startDate = startOfMonth(parse(yearMonth, 'yyyy-MM', new Date()));
      const endDate = startOfMonth(addMonths(startDate, 1));
      attendanceLogsRef = this.attendanceService.search(startDate, endDate);
    }

    return combineLatest([
      this.userService.list$,
      attendanceLogsRef,
      this.systemConfigService.license$,
    ]).pipe(
      map(([users, attendances, license]) => {
        const resolver = new AttendanceLogResolver(
          attendances as any,
          license.overtimePriorityReplacedByLeave
        );
        const data: AttendanceStats = {
          lastUpdated: serverTimestamp(),
          stats: users.map((user) => {
            return {
              userId: user.uid,
              attendances: this.attendanceService.typeList.map((type) => {
                return {
                  type: type.value,
                  hours: resolver.getAttendanceHoursByType(
                    user.uid!,
                    type.value
                  ),
                  offset: resolver.getOffsetHours(user.uid!, type.value),
                };
              }),
            };
          }),
        };

        return data;
      })
    );
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
  offset: number;
}

class AttendanceLogResolver {
  constructor(
    protected logs: AttendanceLog[],
    protected overtimePriorityReplacedByLeave: number[]
  ) {}

  getAttendanceHoursByType(uid: string, type: AttendanceType) {
    return this.logs
      .filter((attendance) => attendance.userId == uid)
      .filter((attendance) => attendance.status == 'approved')
      .filter((attendance) => attendance.type == type)
      .map((attendance) => attendance.hours)
      .reduce((acc, curr) => acc + curr, 0);
  }

  getOverTimeHoursReplaced(uid: string) {
    return this.logs
      .filter((attendance) => attendance.userId == uid)
      .filter((attendance) => attendance.status == 'approved')
      .filter((attendance) => attendance.type == AttendanceType.Overtime)
      .filter((attendance) =>
        this.overtimePriorityReplacedByLeave.includes(
          attendance.reasonPriority!
        )
      )
      .map((attendance) => attendance.hours)
      .reduce((acc, curr) => acc + curr, 0);
  }

  getOffsetHours(uid: string, type: AttendanceType) {
    if (
      [AttendanceType.PersonalLeave, AttendanceType.Overtime].includes(type)
    ) {
      const personalLeaveHours = this.getAttendanceHoursByType(
        uid,
        AttendanceType.PersonalLeave
      );
      const overtimeHoursReplaced = this.getOverTimeHoursReplaced(uid);

      switch (type) {
        case AttendanceType.PersonalLeave:
          return personalLeaveHours >= overtimeHoursReplaced
            ? overtimeHoursReplaced
            : personalLeaveHours;
        case AttendanceType.Overtime:
          return overtimeHoursReplaced >= personalLeaveHours
            ? personalLeaveHours
            : overtimeHoursReplaced;
        default:
          return 0;
      }
    }

    return 0;
  }
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

    data.attendances.forEach((attendance) => {
      const key = AttendanceType[attendance.type];
      const needOffset = attendance.offset > 0;
      if (needOffset) {
        this[`_${key}`] = attendance.hours;
        this[key] = attendance.hours - attendance.offset;
      } else {
        this[key] = attendance.hours;
      }
    });
  }
}
