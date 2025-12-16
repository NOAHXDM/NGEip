import { AsyncPipe } from '@angular/common';
import { Component, OnInit, Inject, signal } from '@angular/core';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Timestamp } from '@angular/fire/firestore';
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
import { MatDatepickerModule } from '@angular/material/datepicker';
import { provideNativeDateAdapter } from '@angular/material/core';
import { Observable, take } from 'rxjs';

import {
  SubsidyApplication,
  SubsidyService,
  SubsidyType,
  SelectOption,
} from '../../services/subsidy.service';
import { UserService, User } from '../../services/user.service';

@Component({
  selector: 'app-subsidy-application',
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
    MatDatepickerModule,
  ],
  providers: [provideNativeDateAdapter()],
  templateUrl: './subsidy-application.component.html',
  styleUrl: './subsidy-application.component.scss',
})
export class SubsidyApplicationComponent implements OnInit {
  typeList: SelectOption[] = [];
  subsidyForm = new FormGroup({
    type: new FormControl<number | null>(null, [Validators.required]),
    userId: new FormControl('', [Validators.required]),
    status: new FormControl<'pending'>('pending'),
    applicationDate: new FormControl(new Date(), [Validators.required]),
    content: new FormControl(''),
    invoiceAmount: new FormControl<number | null>(null, [Validators.min(0)]),
    approvedAmount: new FormControl<number | null>(null, [Validators.min(0)]),
    quarter: new FormControl<1 | 2 | 3 | 4 | null>(null),
    carryOverAmount: new FormControl<number | null>(null, [Validators.min(0)]),
  });

  readonly userList$: Observable<User[]>;
  readonly currentUser$: Observable<User | null>;

  // 動態欄位顯示控制
  showContent = signal(false);
  showInvoiceAmount = signal(false);
  showApprovedAmount = signal(false);
  showQuarter = signal(false);
  showCarryOverAmount = signal(false);

  constructor(
    private dialogRef: MatDialogRef<SubsidyApplicationComponent>,
    private subsidyService: SubsidyService,
    private userService: UserService,
    @Inject(MAT_DIALOG_DATA)
    protected data: { title: string; application?: SubsidyApplication }
  ) {
    this.userList$ = this.userService.list$;
    this.currentUser$ = this.userService.currentUser$;
  }

  ngOnInit() {
    this.typeList = this.subsidyService.typeList;

    // 監聽類型變更，動態調整表單欄位
    this.subsidyForm.get('type')?.valueChanges.subscribe({
      next: (type) => {
        this.updateFormByType(type);
      },
    });

    // 設定當前使用者為預設申請人
    this.currentUser$.pipe(take(1)).subscribe({
      next: (user) => {
        if (user && !this.data.application) {
          this.subsidyForm.patchValue({ userId: user.uid });
        }
      },
    });

    // 如果是編輯模式，載入現有資料
    if (this.data.application) {
      const app = this.data.application;
      this.subsidyForm.patchValue({
        type: app.type,
        userId: app.userId,
        status: app.status as 'pending',
        applicationDate: (app.applicationDate as Timestamp).toDate(),
        content: app.content,
        invoiceAmount: app.invoiceAmount,
        approvedAmount: app.approvedAmount,
        quarter: app.quarter,
        carryOverAmount: app.carryOverAmount,
      });
      this.updateFormByType(app.type);
    }
  }

  updateFormByType(type: number | null) {
    // 重置所有動態欄位
    this.showContent.set(false);
    this.showInvoiceAmount.set(false);
    this.showApprovedAmount.set(false);
    this.showQuarter.set(false);
    this.showCarryOverAmount.set(false);

    // 清除驗證器
    this.subsidyForm.get('content')?.clearValidators();
    this.subsidyForm.get('invoiceAmount')?.clearValidators();
    this.subsidyForm.get('approvedAmount')?.clearValidators();
    this.subsidyForm.get('quarter')?.clearValidators();
    this.subsidyForm.get('carryOverAmount')?.clearValidators();

    switch (type) {
      case SubsidyType.Laptop: // 個人筆電
        this.showContent.set(true);
        this.showInvoiceAmount.set(true);
        this.showApprovedAmount.set(true);
        this.subsidyForm.get('content')?.setValidators([Validators.required]);
        this.subsidyForm
          .get('invoiceAmount')
          ?.setValidators([Validators.required, Validators.min(0)]);
        this.subsidyForm
          .get('approvedAmount')
          ?.setValidators([Validators.required, Validators.min(0)]);
        break;

      case SubsidyType.HealthCheck: // 健檢
        this.showContent.set(true);
        this.showInvoiceAmount.set(true);
        this.showApprovedAmount.set(true);
        this.subsidyForm.get('content')?.setValidators([Validators.required]);
        this.subsidyForm
          .get('invoiceAmount')
          ?.setValidators([Validators.required, Validators.min(0)]);
        this.subsidyForm
          .get('approvedAmount')
          ?.setValidators([Validators.required, Validators.min(0)]);
        break;

      case SubsidyType.Training: // 進修課程
        this.showContent.set(true);
        this.showInvoiceAmount.set(true);
        this.showApprovedAmount.set(true);
        this.subsidyForm.get('content')?.setValidators([Validators.required]);
        this.subsidyForm
          .get('invoiceAmount')
          ?.setValidators([Validators.required, Validators.min(0)]);
        this.subsidyForm
          .get('approvedAmount')
          ?.setValidators([Validators.required, Validators.min(0)]);
        break;

      case SubsidyType.AITool: // AI 工具
        this.showContent.set(true);
        this.showInvoiceAmount.set(true);
        this.showApprovedAmount.set(true);
        this.showQuarter.set(true);
        this.showCarryOverAmount.set(true);
        this.subsidyForm.get('content')?.setValidators([Validators.required]);
        this.subsidyForm
          .get('invoiceAmount')
          ?.setValidators([Validators.required, Validators.min(0)]);
        this.subsidyForm
          .get('approvedAmount')
          ?.setValidators([Validators.required, Validators.min(0)]);
        this.subsidyForm.get('quarter')?.setValidators([Validators.required]);
        break;

      case SubsidyType.Travel: // 旅遊
        this.showContent.set(true);
        this.showInvoiceAmount.set(true);
        this.showApprovedAmount.set(true);
        this.subsidyForm.get('content')?.setValidators([Validators.required]);
        this.subsidyForm
          .get('invoiceAmount')
          ?.setValidators([Validators.required, Validators.min(0)]);
        this.subsidyForm
          .get('approvedAmount')
          ?.setValidators([Validators.required, Validators.min(0)]);
        break;

      default:
        break;
    }

    // 更新驗證狀態
    this.subsidyForm.get('content')?.updateValueAndValidity();
    this.subsidyForm.get('invoiceAmount')?.updateValueAndValidity();
    this.subsidyForm.get('approvedAmount')?.updateValueAndValidity();
    this.subsidyForm.get('quarter')?.updateValueAndValidity();
    this.subsidyForm.get('carryOverAmount')?.updateValueAndValidity();
  }

  onSubmit() {
    if (this.subsidyForm.invalid) {
      return;
    }

    const formValue = {
      ...this.subsidyForm.value,
      applicationDate: Timestamp.fromDate(
        this.subsidyForm.value.applicationDate!
      ),
    };

    if (this.data.application) {
      // 更新模式
      this.subsidyService
        .update(formValue, this.data.application)
        .pipe(take(1))
        .subscribe({
          next: () => {
            this.dialogRef.close('Subsidy application updated');
          },
          error: (error) => {
            console.error('更新失敗：', error);
            this.dialogRef.close('Update failed');
          },
        });
    } else {
      // 新增模式
      this.subsidyService
        .create(formValue)
        .pipe(take(1))
        .subscribe({
          next: () => {
            this.dialogRef.close('Subsidy application created');
          },
          error: (error) => {
            console.error('建立失敗：', error);
            this.dialogRef.close('Creation failed');
          },
        });
    }
  }
}
