import { Component, Inject, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';

import { UserService } from '../../services/user.service';
import {
  AttendanceLog,
  AttendanceService,
  AttendanceType,
} from '../../services/attendance.service';
import { switchMap, take } from 'rxjs';

@Component({
  selector: 'app-attendance-status-change',
  standalone: true,
  imports: [
    MatButton,
    MatDialogActions,
    MatDialogClose,
    MatDialogContent,
    MatDialogTitle,
    MatIconModule,
    MatProgressBarModule,
  ],
  templateUrl: './attendance-status-change.component.html',
  styleUrl: './attendance-status-change.component.scss',
})
export class AttendanceStatusChangeComponent {
  readonly warningVisible = signal(false);
  readonly statusIconMap = new Map<string, StatusIcon>();
  sourceStatusIcon: StatusIcon;
  targetStatusIcon: StatusIcon;

  constructor(
    private dialogRef: MatDialogRef<AttendanceStatusChangeComponent>,
    private userService: UserService,
    private attendanceService: AttendanceService,
    @Inject(MAT_DIALOG_DATA)
    protected data: {
      attendance: AttendanceLog;
      newStatus: 'pending' | 'approved' | 'rejected';
    }
  ) {
    this.statusIconMap.set('pending', {
      color: 'gray',
      name: 'pending_actions',
    });
    this.statusIconMap.set('approved', { color: 'green', name: 'recommend' });
    this.statusIconMap.set('rejected', { color: 'red', name: 'cancel' });
    const originalStatus = this.data.attendance.status;
    const newStatus = this.data.newStatus;
    this.sourceStatusIcon = this.statusIconMap.get(originalStatus)!;
    this.targetStatusIcon = this.statusIconMap.get(newStatus)!;

    this.warningVisible.set(
      this.data.attendance.type == AttendanceType.AnnualLeave &&
        ((originalStatus == 'pending' && newStatus == 'approved') ||
          (originalStatus == 'approved' && newStatus == 'pending'))
    );
  }

  updateStatus() {
    this.userService.currentUser$
      .pipe(
        take(1),
        switchMap((user) =>
          this.attendanceService.updateStatus(
            this.data.attendance,
            this.data.newStatus,
            user.uid!
          )
        )
      )
      .subscribe({
        next: () => this.dialogRef.close('Update status successfully'),
        error: (error) => this.dialogRef.close(error.message),
      });
  }
}

interface StatusIcon {
  color: string;
  name: string;
}
