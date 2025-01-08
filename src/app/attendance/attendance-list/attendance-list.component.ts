import { AsyncPipe } from '@angular/common';
import { AfterViewInit, Component, ViewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatCardModule } from '@angular/material/card';
import {
  MatChipListbox,
  MatChipSelectionChange,
  MatChipsModule,
} from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { map, Observable } from 'rxjs';

import {
  AttendanceLog,
  AttendanceService,
} from '../../services/attendance.service';
import { AttendanceComponent } from '../attendance.component';
import { AttendanceTypePipe } from '../../pipes/attendance-type.pipe';
import { FirestoreTimestampPipe } from '../../pipes/firestore-timestamp.pipe';
import { ReasonPriorityPipe } from '../../pipes/reason-priority.pipe';
import { UserNamePipe } from '../../pipes/user-name.pipe';
import { AttendanceStatusChangeComponent } from '../attendance-status-change/attendance-status-change.component';

@Component({
  selector: 'app-attendance-list',
  standalone: true,
  imports: [
    AsyncPipe,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatDialogModule,
    MatIconModule,
    MatMenuModule,
    MatSnackBarModule,
    MatSortModule,
    MatTableModule,
    AttendanceTypePipe,
    FirestoreTimestampPipe,
    ReasonPriorityPipe,
    UserNamePipe,
  ],
  templateUrl: './attendance-list.component.html',
  styleUrl: './attendance-list.component.scss',
})
export class AttendanceListComponent implements AfterViewInit {
  attendanceList$: Observable<MatTableDataSource<any>>;
  displayedColumns: string[] = [
    'status',
    'userId',
    'type',
    'startDateTime',
    'endDateTime',
    'hours',
    'reason',
    'reasonPriority',
    'proxyUserId',
    'callout',
    'history',
  ];

  @ViewChild(MatSort) sort?: MatSort;
  @ViewChild(MatChipListbox) chipList?: MatChipListbox;

  constructor(
    private attendanceService: AttendanceService,
    private _dialog: MatDialog,
    private _snackBar: MatSnackBar
  ) {
    this.attendanceList$ = this.attendanceService
      .getCurrentDay()
      .pipe(map((data) => this.transformToDataSource(data)));
  }

  ngAfterViewInit() {
    this.chipList?.chipSelectionChanges.subscribe({
      next: (change: MatChipSelectionChange) => {
        if (change.selected) {
          switch (change.source.value) {
            case '0':
              this.attendanceList$ = this.attendanceService
                .getCurrentDay()
                .pipe(map((data) => this.transformToDataSource(data)));
              break;
            case '1':
              this.attendanceList$ = this.attendanceService
                .getCurrentWeek()
                .pipe(map((data) => this.transformToDataSource(data)));
              break;
            case '2':
              this.attendanceList$ = this.attendanceService
                .getCurrentMonth()
                .pipe(map((data) => this.transformToDataSource(data)));
              break;
            default:
              break;
          }
        }
      },
    });
  }

  transformToDataSource(data: any[]): MatTableDataSource<any> {
    const dataSource = new MatTableDataSource(data);
    dataSource.sort = this.sort!;
    return dataSource;
  }

  openNewAttendanceDialog() {
    const dialogRef = this._dialog.open(AttendanceComponent, {
      data: { title: 'Create a new request' },
      width: '65vw',
    });

    dialogRef.afterClosed().subscribe({
      next: (result) => {
        if (result) {
          this.openSnackBar('Request created successfully');
        }
      },
    });
  }

  openEditAttendanceDialog(attendance: AttendanceLog) {
    const dialogRef = this._dialog.open(AttendanceComponent, {
      data: { title: 'Edit request', attendance },
      width: '65vw',
    });

    dialogRef.afterClosed().subscribe({
      next: (message) => {
        if (message) {
          this.openSnackBar(message);
        }
      },
    });
  }

  openAttendanceStatusChangeDialog(
    attendance: AttendanceLog,
    newStatus: string
  ) {
    const dialogRef = this._dialog.open(AttendanceStatusChangeComponent, {
      data: { attendance, newStatus },
      width: '65vw',
      maxWidth: '400px',
    });

    dialogRef.afterClosed().subscribe({
      next: (message) => {
        if (message) {
          this.openSnackBar(message);
        }
      },
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
