import { AsyncPipe } from '@angular/common';
import { Component, Inject, Optional } from '@angular/core';
import { STEPPER_GLOBAL_OPTIONS } from '@angular/cdk/stepper';
import {
  MAT_DIALOG_DATA,
  MatDialogContent,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatStepperModule } from '@angular/material/stepper';
import { Observable } from 'rxjs';

import { AttendanceService } from '../../services/attendance.service';
import { FirestoreTimestampPipe } from '../../pipes/firestore-timestamp.pipe';
import { UserNamePipe } from '../../pipes/user-name.pipe';

@Component({
  selector: 'app-attendance-history',
  standalone: true,
  imports: [
    AsyncPipe,
    FirestoreTimestampPipe,
    UserNamePipe,
    MatDialogTitle,
    MatDialogContent,
    MatIconModule,
    MatStepperModule,
  ],
  templateUrl: './attendance-history.component.html',
  styleUrl: './attendance-history.component.scss',
  providers: [
    {
      provide: STEPPER_GLOBAL_OPTIONS,
      useValue: { displayDefaultIndicatorType: false },
    },
  ],
})
export class AttendanceHistoryComponent {
  list$: Observable<any>;

  constructor(
    private attendanceService: AttendanceService,
    @Optional() @Inject(MAT_DIALOG_DATA) protected data: any
  ) {
    this.list$ = this.attendanceService.getAuditTrail(this.data.id);
  }
}
