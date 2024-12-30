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

import {
  AttendanceService,
  SelectOption,
  AttendanceType,
} from '../services/attendance.service';

@Component({
  selector: 'app-attendance',
  standalone: true,
  imports: [
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
  });
  reasonPriorityVisible = signal(false);

  constructor(
    private dialogRef: MatDialogRef<AttendanceComponent>,
    private attendanceService: AttendanceService,
    @Inject(MAT_DIALOG_DATA) protected data: any
  ) {}

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
  }

  cancel() {
    this.dialogRef.close();
  }

  save() {
    console.log(this.attendanceForm.value);
  }
}
