import { AsyncPipe } from '@angular/common';
import { Component, OnInit, Inject, signal } from '@angular/core';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButton } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Observable, take } from 'rxjs';
import { MtxDatetimepickerModule } from '@ng-matero/extensions/datetimepicker';
import { provideMomentDatetimeAdapter } from '@ng-matero/extensions-moment-adapter';

import {
  AttendanceService,
  SelectOption,
  AttendanceType,
} from '../services/attendance.service';
import { UserService, User } from '../services/user.service';

@Component({
  selector: 'app-attendance',
  standalone: true,
  imports: [
    AsyncPipe,
    ReactiveFormsModule,
    MatButton,
    MatDialogActions,
    MatDialogClose,
    MatDialogContent,
    MatDialogTitle,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MtxDatetimepickerModule,
  ],
  providers: [
    provideMomentDatetimeAdapter({
      parse: {
        dateInput: 'YYYY-MM-DD',
        monthInput: 'MMMM',
        yearInput: 'YYYY',
        timeInput: 'HH:mm:ss',
        datetimeInput: 'YYYY-MM-DD HH:mm:ss',
      },
      display: {
        dateInput: 'YYYY-MM-DD',
        monthInput: 'MMMM',
        yearInput: 'YYYY',
        timeInput: 'HH:mm:ss',
        datetimeInput: 'YYYY-MM-DD HH:mm:ss',
        monthYearLabel: 'YYYY MMMM',
        dateA11yLabel: 'LL',
        monthYearA11yLabel: 'MMMM YYYY',
        popupHeaderDateLabel: 'MMM DD, ddd',
      },
    }),
  ],
  templateUrl: './attendance.component.html',
  styleUrl: './attendance.component.scss',
})
export class AttendanceComponent implements OnInit {
  typeList: SelectOption[] = [];
  reasonPriorityList: SelectOption[] = [];
  attendanceForm = new FormGroup({
    type: new FormControl<string | number>('', [Validators.required]),
    reason: new FormControl('', [
      Validators.required,
      Validators.maxLength(400),
    ]),
    reasonPriority: new FormControl<string | number>(''),
    status: new FormControl('pending'),
    userId: new FormControl('', [Validators.required]),
    callout: new FormControl(''),
    hours: new FormControl(0.5, [Validators.min(0.5)]),
    proxyUserId: new FormControl(''),
    startDateTime: new FormControl('', [Validators.required]),
    endDateTime: new FormControl('', [Validators.required]),
  });
  reasonPriorityVisible = signal(false);
  calloutVisible = signal(false);
  proxyVisible = signal(true);
  userList$: Observable<User[]>;

  constructor(
    private dialogRef: MatDialogRef<AttendanceComponent>,
    private attendanceService: AttendanceService,
    private userService: UserService,
    @Inject(MAT_DIALOG_DATA) protected data: any
  ) {
    this.userList$ = this.userService.list$ as Observable<User[]>;
  }

  ngOnInit() {
    this.typeList = this.attendanceService.typeList;
    this.reasonPriorityList = this.attendanceService.reasonPriorityList;
    // Detect attendanceForm type changes
    this.attendanceForm.get('type')?.valueChanges.subscribe({
      next: (value) => {
        if (
          value == AttendanceType.Overtime ||
          value == AttendanceType.RemoteWork
        ) {
          this.attendanceForm
            .get('reasonPriority')
            ?.setValidators([Validators.required]);
          this.reasonPriorityVisible.set(true);
          this.calloutVisible.set(true);
          this.proxyVisible.set(false);
        } else {
          this.attendanceForm.get('reasonPriority')?.clearValidators();
          this.reasonPriorityVisible.set(false);
          this.calloutVisible.set(false);
          this.proxyVisible.set(true);
        }

        this.attendanceForm.get('reasonPriority')?.updateValueAndValidity();
      },
    });
    // Set current user to the form
    this.userService.currentUser$.pipe(take(1)).subscribe({
      next: (user) => {
        this.attendanceForm.get('userId')?.setValue(user.uid!);
      },
    });
  }

  cancel() {
    this.dialogRef.close();
  }

  save() {
    this.attendanceService.create(this.attendanceForm.value).subscribe({
      next: () => this.dialogRef.close(true),
    });
  }
}
