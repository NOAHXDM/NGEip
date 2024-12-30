import { Component, OnInit, Inject } from '@angular/core';
import { MatButton } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';

@Component({
  selector: 'app-attendance',
  standalone: true,
  imports: [
    MatButton,
    MatDialogActions,
    MatDialogClose,
    MatDialogContent,
    MatDialogTitle,
  ],
  templateUrl: './attendance.component.html',
  styleUrl: './attendance.component.scss',
})
export class AttendanceComponent implements OnInit {
  constructor(
    private dialogRef: MatDialogRef<AttendanceComponent>,
    @Inject(MAT_DIALOG_DATA) protected data: any
  ) {}

  ngOnInit() {}

  cancel() {
    this.dialogRef.close();
  }
}
