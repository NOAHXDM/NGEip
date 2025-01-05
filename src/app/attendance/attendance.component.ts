import { AsyncPipe } from '@angular/common';
import { Component, OnInit, Inject, signal } from '@angular/core';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MAT_DATE_LOCALE } from "@angular/material/core";
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
import { provideDateFnsDatetimeAdapter } from '@ng-matero/extensions-date-fns-adapter';
import { Timestamp } from '@angular/fire/firestore';
import { enUS } from "date-fns/locale";

import {
  AttendanceLog,
  AttendanceService,
  AttendanceType,
  SelectOption,
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
    provideDateFnsDatetimeAdapter({
      parse: {
        dateInput: 'yyyy-MM-dd',
        monthInput: 'MMMM',
        yearInput: 'yyyy',
        timeInput: 'HH:mm:ss',
        datetimeInput: 'yyyy-MM-dd HH:mm:ss',
      },
      display: {
        dateInput: 'yyyy-MM-dd',
        monthInput: 'MMMM',
        yearInput: 'yyyy',
        timeInput: 'HH:mm:ss',
        datetimeInput: 'yyyy-MM-dd HH:mm:ss',
        monthYearLabel: 'yyyy MMMM',
        dateA11yLabel: 'PP',
        monthYearA11yLabel: 'MMMM yyyy',
        popupHeaderDateLabel: 'MMM dd, EEE',
      },
    }),
    { provide: MAT_DATE_LOCALE, useValue: enUS}
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
  readonly userList$: Observable<User[]>;

  constructor(
    private dialogRef: MatDialogRef<AttendanceComponent>,
    private attendanceService: AttendanceService,
    private userService: UserService,
    @Inject(MAT_DIALOG_DATA)
    protected data: { title: string; attendance?: AttendanceLog }
  ) {
    this.userList$ = this.userService.list$ as Observable<User[]>;
  }

  ngOnInit() {
    this.typeList = this.attendanceService.typeList;
    this.reasonPriorityList = this.attendanceService.reasonPriorityList;
    // Detect attendanceForm type changes
    this.attendanceForm.get('type')?.valueChanges.subscribe({
      next: (value) => {
        if (value == AttendanceType.Overtime) {
          this.attendanceForm
            .get('reasonPriority')
            ?.setValidators([Validators.required]);
          this.reasonPriorityVisible.set(true);
          this.calloutVisible.set(true);
          this.proxyVisible.set(false);
          // Clear proxyUserId value
          this.attendanceForm.get('proxyUserId')?.setValue('');
        } else {
          this.attendanceForm.get('reasonPriority')?.clearValidators();
          this.reasonPriorityVisible.set(false);
          this.calloutVisible.set(false);
          this.proxyVisible.set(true);
          // Clear reasonPriority value and callout value
          this.attendanceForm.get('reasonPriority')?.setValue('');
          this.attendanceForm.get('callout')?.setValue('');
        }

        this.attendanceForm.get('reasonPriority')?.updateValueAndValidity();
      },
    });

    if (this.data.attendance) {
      // Set attendance data to the form
      const value: any = {
        ...this.data.attendance,
        startDateTime: (
          this.data.attendance.startDateTime as Timestamp
        ).toDate(),
        endDateTime: (this.data.attendance.endDateTime as Timestamp).toDate(),
      };
      this.attendanceForm.patchValue(value);
    } else {
      // Set current user to the form
      this.userService.currentUser$.pipe(take(1)).subscribe({
        next: (user) => {
          this.attendanceForm.get('userId')?.setValue(user.uid!);
        },
      });
    }
  }

  cancel() {
    this.dialogRef.close();
  }

  save() {
    if (!this.data.attendance) {
      // Create new attendance
      this.attendanceService
        .create(this.attendanceForm.value)
        .pipe(take(1))
        .subscribe({
          next: () => this.dialogRef.close(true),
        });
    } else {
      // Update attendance
      this.attendanceService
        .update(this.attendanceForm.value, this.data.attendance)
        .pipe(take(1))
        .subscribe({
          next: (result: any) =>
            this.dialogRef.close(
              result ? 'Request updated successfully' : 'No changes'
            ),
        });
    }
  }
}
