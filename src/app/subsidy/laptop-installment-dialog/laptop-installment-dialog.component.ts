import { AsyncPipe, CommonModule } from '@angular/common';
import { Component, Inject, inject } from '@angular/core';
import {
  MAT_DIALOG_DATA,
  MatDialogTitle,
  MatDialogContent,
  MatDialogActions,
  MatDialogClose,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Observable, take, switchMap, map } from 'rxjs';

import {
  LaptopInstallment,
  SubsidyApplication,
  SubsidyService,
} from '../../services/subsidy.service';
import { UserService } from '../../services/user.service';
import { FirestoreTimestampPipe } from '../../pipes/firestore-timestamp.pipe';
import { UserNamePipe } from '../../pipes/user-name.pipe';

@Component({
  selector: 'app-laptop-installment-dialog',
  standalone: true,
  imports: [
    AsyncPipe,
    CommonModule,
    MatDialogTitle,
    MatDialogContent,
    MatDialogActions,
    MatDialogClose,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatSnackBarModule,
    FirestoreTimestampPipe,
    UserNamePipe,
  ],
  templateUrl: './laptop-installment-dialog.component.html',
  styleUrl: './laptop-installment-dialog.component.scss',
})
export class LaptopInstallmentDialogComponent {
  readonly subsidyService = inject(SubsidyService);
  readonly userService = inject(UserService);
  readonly snackBar = inject(MatSnackBar);

  installmentsList$: Observable<LaptopInstallment[]>;
  displayedColumns: string[] = [
    'installmentNumber',
    'receivedDate',
    'amount',
    'recordedBy',
  ];

  // 計算補助資訊
  subsidyInfo: {
    totalSubsidy: number;
    installmentAmounts: number[];
  };

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: { application: SubsidyApplication }
  ) {
    this.installmentsList$ = this.subsidyService.getInstallments(
      this.data.application.id!
    );

    // 計算筆電補助資訊
    const invoiceAmount = this.data.application.invoiceAmount || 0;
    this.subsidyInfo = this.subsidyService.calculateLaptopSubsidy(invoiceAmount);
  }

  getInstallmentAmount(installmentNumber: number): number {
    return this.subsidyInfo.installmentAmounts[installmentNumber - 1] || 0;
  }

  recordNextInstallment() {
    this.installmentsList$.pipe(take(1)).subscribe({
      next: (installments) => {
        const nextNumber = installments.length + 1;

        // 檢查是否超過36期
        if (nextNumber > 36) {
          this.openSnackBar('All 36 installment records have been completed');
          return;
        }

        // 取得該期應領取的金額
        const installmentAmount = this.getInstallmentAmount(nextNumber);

        // 如果該期金額為0，表示補助已領完
        if (installmentAmount === 0) {
          this.openSnackBar('All subsidy amount has been received');
          return;
        }

        this.userService.currentUser$
          .pipe(
            take(1),
            switchMap((user) =>
              this.subsidyService.recordInstallment(
                this.data.application.id!,
                nextNumber,
                installmentAmount,
                user.uid!
              )
            )
          )
          .subscribe({
            next: () => {
              this.openSnackBar(`Period ${nextNumber} recorded ($${installmentAmount})`);
            },
            error: (error) => {
              this.openSnackBar(`Failed to record: ${error.message}`);
            },
          });
      },
    });
  }

  openSnackBar(message: string) {
    this.snackBar.open(message, 'Close', {
      horizontalPosition: 'center',
      verticalPosition: 'top',
      duration: 5000,
    });
  }
}
