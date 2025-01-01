import { Component } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatGridListModule } from '@angular/material/grid-list';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatToolbarModule } from '@angular/material/toolbar';

import { Observable, take } from 'rxjs';

import { AttendanceService } from '../services/attendance.service';
import { UserService } from '../services/user.service';
import { AttendanceComponent } from '../attendance/attendance.component';
import { DataSource } from '@angular/cdk/collections';
import { AttendanceTypePipe } from '../pipes/attendance-type.pipe';
import { FirestoreTimestampPipe } from '../pipes/firestore-timestamp.pipe';
import { ReasonPriorityPipe } from '../pipes/reason-priority.pipe';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatDialogModule,
    MatGridListModule,
    MatIconModule,
    MatMenuModule,
    MatSnackBarModule,
    MatTableModule,
    MatToolbarModule,
    AttendanceTypePipe,
    FirestoreTimestampPipe,
    ReasonPriorityPipe,
  ],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
})
export class HomeComponent {
  dataSource: AttendanceDataSource<any>;
  displayedColumns: string[] = [
    'status',
    'userName',
    'type',
    'startDateTime',
    'endDateTime',
    'hours',
    'reason',
    'reasonPriority',
    'proxyUserName',
    'callout',
    'history',
  ];

  constructor(
    private attendanceService: AttendanceService,
    private userService: UserService,
    private _router: Router,
    private _dialog: MatDialog,
    private _snackBar: MatSnackBar
  ) {
    this.dataSource = new AttendanceDataSource(this.attendanceService.search());
  }

  logout() {
    this.userService
      .logout()
      .pipe(take(1))
      .subscribe({
        next: () => this._router.navigate(['/Login']),
        error: (error) => {},
      });
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
