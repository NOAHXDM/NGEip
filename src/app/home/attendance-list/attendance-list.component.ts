import { Component } from '@angular/core';
import { DataSource } from '@angular/cdk/collections';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';

import { Observable } from 'rxjs';

import { AttendanceService } from '../../services/attendance.service';
import { AttendanceComponent } from '../../attendance/attendance.component';
import { AttendanceTypePipe } from '../../pipes/attendance-type.pipe';
import { FirestoreTimestampPipe } from '../../pipes/firestore-timestamp.pipe';
import { ReasonPriorityPipe } from '../../pipes/reason-priority.pipe';
import { UserNamePipe } from '../../pipes/user-name.pipe';

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
    MatTableModule,
    AttendanceTypePipe,
    FirestoreTimestampPipe,
    ReasonPriorityPipe,
    UserNamePipe,
  ],
  templateUrl: './attendance-list.component.html',
  styleUrl: './attendance-list.component.scss',
})
export class AttendanceListComponent {
  dataSource: AttendanceDataSource<any>;
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

  constructor(
    private attendanceService: AttendanceService,
    private _dialog: MatDialog,
    private _snackBar: MatSnackBar
  ) {
    this.dataSource = new AttendanceDataSource(this.attendanceService.search());
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

  openSnackBar(message: string) {
    this._snackBar.open(message, 'Close', {
      horizontalPosition: 'center',
      verticalPosition: 'top',
      duration: 5000,
    });
  }
}

class AttendanceDataSource<T> extends DataSource<T> {
  private _dataSource: Observable<T[]>;

  constructor(source$: Observable<T[]>) {
    super();
    this._dataSource = source$;
  }

  connect() {
    return this._dataSource;
  }

  disconnect() {}
}
