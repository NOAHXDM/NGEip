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
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';

import { UserService } from '../../services/user.service';
import {
  SubsidyApplication,
  SubsidyService,
  SubsidyStatus,
} from '../../services/subsidy.service';
import { switchMap, take } from 'rxjs';

@Component({
  selector: 'app-subsidy-status-change',
  standalone: true,
  imports: [
    MatButton,
    MatDialogActions,
    MatDialogClose,
    MatDialogContent,
    MatDialogTitle,
    MatIconModule,
    MatProgressBarModule,
    MatFormFieldModule,
    MatInputModule,
    ReactiveFormsModule,
  ],
  templateUrl: './subsidy-status-change.component.html',
  styleUrl: './subsidy-status-change.component.scss',
})
export class SubsidyStatusChangeComponent {
  readonly statusIconMap = new Map<SubsidyStatus, StatusIcon>();
  sourceStatusIcon: StatusIcon;
  targetStatusIcon: StatusIcon;
  approvedAmountControl = new FormControl<number | null>(null, [
    Validators.required,
    Validators.min(0),
  ]);

  constructor(
    private dialogRef: MatDialogRef<SubsidyStatusChangeComponent>,
    private userService: UserService,
    private subsidyService: SubsidyService,
    @Inject(MAT_DIALOG_DATA)
    protected data: {
      application: SubsidyApplication;
      newStatus: SubsidyStatus;
    }
  ) {
    this.statusIconMap.set('pending', {
      color: 'gray',
      name: 'pending_actions',
      text: 'Pending',
    });
    this.statusIconMap.set('approved', {
      color: 'green',
      name: 'check_circle',
      text: 'Approved',
    });
    this.statusIconMap.set('rejected', {
      color: 'red',
      name: 'cancel',
      text: 'Rejected',
    });

    const originalStatus = this.data.application.status;
    const newStatus = this.data.newStatus;
    this.sourceStatusIcon = this.statusIconMap.get(originalStatus)!;
    this.targetStatusIcon = this.statusIconMap.get(newStatus)!;

    // 如果核准，預設填入申請補助金額
    if (newStatus === 'approved' && this.data.application.approvedAmount) {
      this.approvedAmountControl.setValue(
        this.data.application.approvedAmount
      );
    }
  }

  updateStatus() {
    if (this.data.newStatus === 'approved' && this.approvedAmountControl.invalid) {
      return;
    }

    const approvedAmount =
      this.data.newStatus === 'approved'
        ? this.approvedAmountControl.value
        : undefined;

    this.userService.currentUser$
      .pipe(
        take(1),
        switchMap((user) =>
          this.subsidyService.updateStatus(
            this.data.application,
            this.data.newStatus,
            user.uid!,
            approvedAmount!
          )
        )
      )
      .subscribe({
        next: () => this.dialogRef.close('Status updated successfully'),
        error: (error) => this.dialogRef.close(error.message),
      });
  }
}

interface StatusIcon {
  color: string;
  name: string;
  text: string;
}
