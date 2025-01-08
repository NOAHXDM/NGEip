import { AfterViewInit, Component, ViewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';

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
  dataSource = new MatTableDataSource<any>();
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

  constructor(
    private attendanceService: AttendanceService,
    private _dialog: MatDialog,
    private _snackBar: MatSnackBar
  ) {
    this.attendanceService
      .search()
      .pipe(takeUntilDestroyed())
      .subscribe({ next: (data) => (this.dataSource.data = data) });
  }

  ngAfterViewInit() {
    this.dataSource.sort = this.sort!;
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

  openAttendanceStatusChangeDialog(attendance: AttendanceLog, newStatus: string) {
    const dialogRef = this._dialog.open(AttendanceStatusChangeComponent, {
      data: { attendance, newStatus },
      width: '65vw',
      maxWidth: '400px'
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
