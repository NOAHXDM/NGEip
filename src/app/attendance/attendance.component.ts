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
import {
  MatOption,
  MatSelectChange,
  MatSelectModule,
} from '@angular/material/select';
import { Observable, take } from 'rxjs';

import {
  AttendanceService,
  SelectOption,
  AttendanceType,
} from '../services/attendance.service';
import { UserService } from '../services/user.service';

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
    userId: new FormControl(''),
    userName: new FormControl(''),
    callout: new FormControl(''),
    hours: new FormControl(0, [Validators.min(0)]),
    proxyUserId: new FormControl(''),
    proxyUserName: new FormControl(''),
  });
  reasonPriorityVisible = signal(false);
  userList$: Observable<any[]>;

  constructor(
    private dialogRef: MatDialogRef<AttendanceComponent>,
    private attendanceService: AttendanceService,
    private userService: UserService,
    @Inject(MAT_DIALOG_DATA) protected data: any
  ) {
    this.userList$ = this.userService.list();
  }

  ngOnInit() {
    this.typeList = this.attendanceService.typeList();
    this.reasonPriorityList = this.attendanceService.reasonPriorityList();
    // Detect attendanceForm type changes
    this.attendanceForm.get('type')?.valueChanges.subscribe({
      next: (value) => {
        if (value == AttendanceType.Overtime) {
          this.attendanceForm
            .get('reasonPriority')
            ?.setValidators([Validators.required]);
          this.reasonPriorityVisible.set(true);
        } else {
          this.attendanceForm.get('reasonPriority')?.clearValidators();
          this.reasonPriorityVisible.set(false);
        }

        this.attendanceForm.get('reasonPriority')?.updateValueAndValidity();
      },
    });
    // Set current user to the form
    this.userService.currentUser$.pipe(take(1)).subscribe({
      next: (user) => {
        this.attendanceForm.get('userId')?.setValue(user.uid);
        this.attendanceForm.get('userName')?.setValue(user.name);
      },
    });
  }

  cancel() {
    this.dialogRef.close();
  }

  save() {
    console.log(this.attendanceForm.value);
  }

  proxyUserChange(event: MatSelectChange) {
    this.attendanceForm
      .get('proxyUserName')
      ?.setValue((event.source.selected as MatOption).viewValue);
  }
}
