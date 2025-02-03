import { Component, inject, signal, ViewChild } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import {
  MatChipListbox,
  MatChipSelectionChange,
  MatChipsModule,
} from '@angular/material/chips';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { Timestamp } from '@angular/fire/firestore';

import { format } from 'date-fns';
import { map, Observable, take } from 'rxjs';

import { AttendanceService } from '../../services/attendance.service';
import {
  UserAttendanceStatsModel,
  AttendanceStatsService,
} from '../../services/attendance-stats.service';
import { ClientPreferencesService } from '../../services/client-preferences.service';
import { SystemConfigService } from '../../services/system-config.service';
import { UserNamePipe } from '../../pipes/user-name.pipe';
import { UserService } from '../../services/user.service';
import { FirestoreTimestampPipe } from '../../pipes/firestore-timestamp.pipe';

@Component({
  selector: 'app-attendance-stats',
  standalone: true,
  imports: [
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatSnackBarModule,
    MatTableModule,
    AsyncPipe,
    UserNamePipe,
    FirestoreTimestampPipe,
  ],
  providers: [UserNamePipe],
  templateUrl: './attendance-stats.component.html',
  styleUrl: './attendance-stats.component.scss',
})
export class AttendanceStatsComponent {
  displayedColumns: string[];
  list$?: Observable<UserAttendanceStatsModel[]>;
  listLastUpdated?: Timestamp;
  @ViewChild(MatChipListbox) chipList?: MatChipListbox;
  quickPickOptions: string[];
  quickPickOption: string;
  settlementDisabled = signal(false);
  readonly isAdmin$: Observable<boolean>;
  readonly userNamePipe = inject(UserNamePipe);

  constructor(
    private clientPreferencesService: ClientPreferencesService,
    private attendanceService: AttendanceService,
    private attendanceStatsService: AttendanceStatsService,
    private userService: UserService,
    private systemConfigService: SystemConfigService,
    private _snackBar: MatSnackBar
  ) {
    this.isAdmin$ = this.userService.isAdmin$;
    this.displayedColumns = [
      'Name',
      ...this.attendanceService.typeList.map((item) => item.text),
    ];
    this.quickPickOptions = this.attendanceStatsService.getAllMonthsFromYear(
      this.systemConfigService.license?.initialSettlementYear ||
        new Date().getFullYear()
    );
    this.quickPickOption =
      this.clientPreferencesService.getPreference('statQuickPickOption') ||
      this.quickPickOptions[0];
  }

  ngAfterViewInit() {
    this.chipList?.chipSelectionChanges.subscribe({
      next: (change: MatChipSelectionChange) => {
        if (change.selected) {
          this.quickPickChanged(change.source.value);
        }
      },
    });
  }

  quickPickChanged(option: string) {
    this.quickPickOption = option;
    this.clientPreferencesService.setPreference(
      'statQuickPickOption',
      this.quickPickOption
    );
    this.settlementDisabled.set(option == 'CURRENT');

    if (option != 'CURRENT') {
      this.list$ = this.attendanceStatsService
        .getAttendanceStatsMonthly(option)
        .pipe(
          map((summary) => {
            if (!summary) {
              return [];
            }
            this.listLastUpdated = summary.lastUpdated as Timestamp;
            return summary.stats;
          })
        );
    } else {
      this.list$ = this.attendanceStatsService
        .getAttendanceStatsTemporary()
        .pipe(
          map((summary) => {
            this.listLastUpdated = undefined;
            return summary.stats;
          })
        );
    }
  }

  settlement() {
    this.attendanceStatsService
      .updateAttendanceStatsMonthly(this.quickPickOption)
      .pipe(take(1))
      .subscribe({
        next: () => this.openSnackBar('Settlement completed.'),
      });
  }

  openSnackBar(message: string) {
    this._snackBar.open(message, 'Close', {
      horizontalPosition: 'center',
      verticalPosition: 'top',
      duration: 5000,
    });
  }

  downloadCsv() {
    this.list$
      ?.pipe(
        take(1),
        map((data) => {
          const filename = this.listLastUpdated
            ? format(this.listLastUpdated.toDate(), 'yyyy_MM_dd_HH_mm_ss') +
              '.csv'
            : format(new Date(), 'yyyy_MM_dd_HH_mm_ss') + '.csv';
          const csvContent = this.convertToCsv(data);
          const blob = new Blob([csvContent], {
            type: 'text/csv;charset=utf-8;',
          });
          const link = document.createElement('a');

          link.href = URL.createObjectURL(blob);
          link.download = filename;
          link.click();
          URL.revokeObjectURL(link.href);
        })
      )
      .subscribe();
  }

  convertToCsv(data: UserAttendanceStatsModel[]) {
    const headers = this.displayedColumns.join(',');
    const rows = data.map((row) => {
      return [
        `"${this.userNamePipe.transform(row.userId)}"`.replace(/"/g, '""'),
        ...this.attendanceService.typeList.map((type) =>
          `"${row[type.text]}"`.replace(/"/g, '""')
        ),
      ].join(',');
    });

    return [headers, ...rows].join('\n');
  }
}
