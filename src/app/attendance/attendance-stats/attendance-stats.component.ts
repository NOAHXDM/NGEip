import { Component, ViewChild } from '@angular/core';
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

import { map, Observable, take } from 'rxjs';

import { AttendanceService } from '../../services/attendance.service';
import { AttendanceStatsService } from '../../services/attendance-stats.service';
import { ClientPreferencesService } from '../../services/client-preferences.service';
import { SystemConfigService } from '../../services/system-config.service';
import { UserNamePipe } from '../../pipes/user-name.pipe';
import { UserService } from '../../services/user.service';

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
  ],
  templateUrl: './attendance-stats.component.html',
  styleUrl: './attendance-stats.component.scss',
})
export class AttendanceStatsComponent {
  displayedColumns: string[];
  list$?: Observable<any[]>;
  listLastUpdated?: Timestamp;  // TODO: display last updated date
  @ViewChild(MatChipListbox) chipList?: MatChipListbox;
  quickPickOptions: string[];
  quickPickOption: string;
  readonly isAdmin$: Observable<boolean>;

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
    this.clientPreferencesService.setPreference('statQuickPickOption', option);
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
}
