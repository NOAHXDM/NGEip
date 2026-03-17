/**
 * 考核週期管理頁面（T014）
 *
 * 功能：
 *  - 列出所有考核週期卡片（名稱、類型、年份、截止日、狀態、完成率）
 *  - 新增週期（對話框）
 *  - 修改截止日期（對話框）
 *  - 結束並發布週期
 *  - 開啟指派管理對話框
 *
 * 包含三個 Component（同一檔案）：
 *  1. CreateCycleDialogComponent     — 新增週期對話框
 *  2. UpdateDeadlineDialogComponent  — 修改截止日期對話框
 *  3. EvaluationCyclesAdminComponent — 主頁面
 */

import { AsyncPipe, DatePipe, NgClass } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatNativeDateModule, provideNativeDateAdapter } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogModule,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { Timestamp } from '@angular/fire/firestore';

import { CycleStatus, EvaluationCycle } from '../../models/evaluation.models';
import { EvaluationCycleService } from '../../services/evaluation-cycle.service';
import { AssignmentManagementDialogComponent } from './assignment-management-dialog.component';

// =====================================================================
// 新增週期對話框
// =====================================================================

/**
 * 新增考核週期對話框
 * 包含欄位：名稱、年份、類型（H1/H2）、開始日期、截止日期
 */
@Component({
  selector: 'app-create-cycle-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogTitle,
    MatDialogContent,
    MatDialogActions,
    MatDialogClose,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    MatNativeDateModule,
  ],
  providers: [provideNativeDateAdapter()],
  template: `
    <h2 mat-dialog-title>新增考核週期</h2>

    <mat-dialog-content>
      <form [formGroup]="form" class="dialog-form">

        <!-- 週期名稱 -->
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>週期名稱</mat-label>
          <input matInput formControlName="name" placeholder="例：2025 上半年度考核" />
          @if (form.controls.name.hasError('required') && form.controls.name.touched) {
            <mat-error>週期名稱為必填</mat-error>
          }
        </mat-form-field>

        <!-- 年份 -->
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>年份</mat-label>
          <input matInput type="number" formControlName="year" placeholder="例：2025" />
          @if (form.controls.year.hasError('required') && form.controls.year.touched) {
            <mat-error>年份為必填</mat-error>
          }
        </mat-form-field>

        <!-- 類型 -->
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>類型</mat-label>
          <mat-select formControlName="type">
            <mat-option value="H1">H1（上半年）</mat-option>
            <mat-option value="H2">H2（下半年）</mat-option>
          </mat-select>
          @if (form.controls.type.hasError('required') && form.controls.type.touched) {
            <mat-error>請選擇類型</mat-error>
          }
        </mat-form-field>

        <!-- 開始日期 -->
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>開始日期</mat-label>
          <input matInput [matDatepicker]="startPicker" formControlName="startDate" />
          <mat-datepicker-toggle matIconSuffix [for]="startPicker" />
          <mat-datepicker #startPicker />
          @if (form.controls.startDate.hasError('required') && form.controls.startDate.touched) {
            <mat-error>開始日期為必填</mat-error>
          }
        </mat-form-field>

        <!-- 截止日期 -->
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>截止日期</mat-label>
          <input matInput [matDatepicker]="deadlinePicker" formControlName="deadline" />
          <mat-datepicker-toggle matIconSuffix [for]="deadlinePicker" />
          <mat-datepicker #deadlinePicker />
          @if (form.controls.deadline.hasError('required') && form.controls.deadline.touched) {
            <mat-error>截止日期為必填</mat-error>
          }
        </mat-form-field>

      </form>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>取消</button>
      <button
        mat-raised-button
        color="primary"
        [disabled]="form.invalid || isSubmitting()"
        (click)="submit()"
      >
        {{ isSubmitting() ? '建立中…' : '建立' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .dialog-form {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 360px;
      padding-top: 8px;
    }
    .full-width { width: 100%; }
  `],
})
export class CreateCycleDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<CreateCycleDialogComponent>);
  private readonly cycleService = inject(EvaluationCycleService);

  /** 提交中狀態 */
  readonly isSubmitting = signal(false);

  readonly form = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    year: new FormControl<number>(new Date().getFullYear(), {
      nonNullable: true,
      validators: [Validators.required],
    }),
    type: new FormControl<'H1' | 'H2'>('H1', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    startDate: new FormControl<Date | null>(null, [Validators.required]),
    deadline: new FormControl<Date | null>(null, [Validators.required]),
  });

  /** 提交表單：呼叫 EvaluationCycleService.createCycle() */
  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);
    try {
      const raw = this.form.getRawValue();
      await this.cycleService.createCycle({
        name: raw.name,
        year: raw.year,
        type: raw.type,
        startDate: Timestamp.fromDate(raw.startDate!),
        deadline: Timestamp.fromDate(raw.deadline!),
      });
      this.dialogRef.close(true);
    } catch (err) {
      console.error('建立週期失敗：', err);
    } finally {
      this.isSubmitting.set(false);
    }
  }
}

// =====================================================================
// 修改截止日期對話框
// =====================================================================

/** 修改截止日期對話框的輸入資料 */
interface UpdateDeadlineDialogData {
  cycleId: string;
  cycleName: string;
  currentDeadline: Date;
}

/**
 * 修改考核截止日期對話框
 */
@Component({
  selector: 'app-update-deadline-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogTitle,
    MatDialogContent,
    MatDialogActions,
    MatDialogClose,
    MatFormFieldModule,
    MatInputModule,
    MatDatepickerModule,
    MatNativeDateModule,
  ],
  template: `
    <h2 mat-dialog-title>修改截止日期</h2>

    <mat-dialog-content>
      <p class="cycle-name-hint">週期：{{ data.cycleName }}</p>
      <form [formGroup]="form" class="dialog-form">
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>新截止日期</mat-label>
          <input matInput [matDatepicker]="deadlinePicker" formControlName="deadline" />
          <mat-datepicker-toggle matIconSuffix [for]="deadlinePicker" />
          <mat-datepicker #deadlinePicker />
          @if (form.controls.deadline.hasError('required') && form.controls.deadline.touched) {
            <mat-error>截止日期為必填</mat-error>
          }
        </mat-form-field>
      </form>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>取消</button>
      <button
        mat-raised-button
        color="primary"
        [disabled]="form.invalid || isSubmitting()"
        (click)="submit()"
      >
        {{ isSubmitting() ? '更新中…' : '儲存' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .cycle-name-hint {
      color: #666;
      font-size: 0.9em;
      margin: 4px 0 16px;
    }
    .dialog-form { padding-top: 4px; min-width: 320px; }
    .full-width { width: 100%; }
  `],
})
export class UpdateDeadlineDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<UpdateDeadlineDialogComponent>);
  private readonly cycleService = inject(EvaluationCycleService);
  readonly data: UpdateDeadlineDialogData = inject(MAT_DIALOG_DATA);

  /** 提交中狀態 */
  readonly isSubmitting = signal(false);

  readonly form = new FormGroup({
    deadline: new FormControl<Date | null>(this.data.currentDeadline, [
      Validators.required,
    ]),
  });

  /** 提交表單：呼叫 EvaluationCycleService.updateDeadline() */
  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);
    try {
      const deadline = this.form.getRawValue().deadline!;
      await this.cycleService.updateDeadline(
        this.data.cycleId,
        Timestamp.fromDate(deadline),
      );
      this.dialogRef.close(true);
    } catch (err) {
      console.error('更新截止日期失敗：', err);
    } finally {
      this.isSubmitting.set(false);
    }
  }
}

// =====================================================================
// 狀態對應表（顯示文字）
// =====================================================================

/** 週期狀態 → 中文顯示文字 */
const STATUS_LABEL: Record<CycleStatus, string> = {
  active: '進行中',
  expired_pending: '已截止，待確認',
  closed: '已結束',
};

// =====================================================================
// 主頁面：考核週期管理
// =====================================================================

/**
 * 考核週期管理主頁面（管理者專用）
 *
 * 路由：/evaluation/admin/cycles
 */
@Component({
  selector: 'app-evaluation-cycles-admin',
  standalone: true,
  imports: [
    AsyncPipe,
    DatePipe,
    NgClass,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatDialogModule,
    MatIconModule,
    MatProgressBarModule,
  ],
  template: `
    <div class="page-container">

      <!-- 頁面標題列 -->
      <div class="page-header">
        <h1 class="page-title">考核週期管理</h1>
        <button mat-raised-button color="primary" (click)="openCreateDialog()">
          <mat-icon>add</mat-icon>
          新增週期
        </button>
      </div>

      <!-- 週期清單（Async Pipe 處理載入/空狀態） -->
      @if (cycles$ | async; as cycles) {

        @if (cycles.length === 0) {
          <!-- 空狀態提示 -->
          <div class="empty-state">
            <mat-icon class="empty-icon">event_note</mat-icon>
            <p>目前尚無考核週期。請點擊「新增週期」建立第一個考核。</p>
          </div>
        } @else {
          <!-- 週期卡片格 -->
          <div class="cycles-grid">
            @for (cycle of cycles; track cycle.id) {
              <mat-card class="cycle-card">

                <mat-card-header>
                  <mat-card-title>{{ cycle.name }}</mat-card-title>
                  <mat-card-subtitle>{{ cycle.year }} · {{ cycle.type }}</mat-card-subtitle>
                  <!-- 狀態標籤 -->
                  <span
                    class="status-badge"
                    [ngClass]="'status-badge--' + cycle.status"
                  >
                    {{ getStatusLabel(cycle.status) }}
                  </span>
                </mat-card-header>

                <mat-card-content>
                  <!-- 截止日期資訊 -->
                  <div class="info-row">
                    <mat-icon class="info-icon">schedule</mat-icon>
                    <span>截止日期：{{ cycle.deadline.toDate() | date:'yyyy/MM/dd' }}</span>
                  </div>

                  <!-- 完成率進度條 -->
                  <div class="progress-section">
                    <div class="progress-label">
                      <span>完成進度</span>
                      <span>
                        {{ cycle.completedAssignments }} / {{ cycle.totalAssignments }}
                        （{{ getCompletionRate(cycle) }}%）
                      </span>
                    </div>
                    <mat-progress-bar
                      mode="determinate"
                      [value]="getCompletionRate(cycle)"
                    />
                  </div>
                </mat-card-content>

                <mat-card-actions>
                  <!-- 指派管理 -->
                  <button mat-button (click)="openAssignmentDialog(cycle)">
                    <mat-icon>group</mat-icon>
                    指派管理
                  </button>

                  <!-- 修改截止日（已結束週期不可修改） -->
                  <button
                    mat-button
                    [disabled]="cycle.status === 'closed'"
                    (click)="openUpdateDeadlineDialog(cycle)"
                  >
                    <mat-icon>edit_calendar</mat-icon>
                    修改截止日
                  </button>

                  <!-- 結束並發布（僅限 active / expired_pending） -->
                  <button
                    mat-raised-button
                    color="warn"
                    [disabled]="cycle.status === 'closed' || closingCycleId() === cycle.id"
                    (click)="closeAndPublish(cycle)"
                  >
                    <mat-icon>publish</mat-icon>
                    {{ closingCycleId() === cycle.id ? '處理中…' : '結束並發布' }}
                  </button>
                </mat-card-actions>

              </mat-card>
            }
          </div>
        }

      } @else {
        <!-- 資料載入中 -->
        <div class="loading-state">
          <mat-progress-bar mode="indeterminate" />
          <p>載入中…</p>
        </div>
      }

    </div>
  `,
  styles: [`
    .page-container {
      padding: 24px;
      max-width: 1200px;
      margin: 0 auto;
    }

    /* 標題列 */
    .page-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 24px;
    }
    .page-title {
      margin: 0;
      font-size: 1.5rem;
      font-weight: 600;
    }

    /* 卡片格線 */
    .cycles-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
      gap: 20px;
    }

    /* 週期卡片 */
    .cycle-card { position: relative; }

    mat-card-header { position: relative; }

    /* 狀態標籤（右上角浮動） */
    .status-badge {
      position: absolute;
      top: 0;
      right: 0;
      padding: 3px 10px;
      border-radius: 12px;
      font-size: 0.75rem;
      font-weight: 500;
      white-space: nowrap;
    }
    .status-badge--active {
      background-color: #e8f5e9;
      color: #2e7d32;
    }
    .status-badge--expired_pending {
      background-color: #fff3e0;
      color: #e65100;
    }
    .status-badge--closed {
      background-color: #f5f5f5;
      color: #757575;
    }

    /* 資訊列 */
    .info-row {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-top: 12px;
      color: #555;
      font-size: 0.9rem;
    }
    .info-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }

    /* 完成率 */
    .progress-section { margin-top: 16px; }
    .progress-label {
      display: flex;
      justify-content: space-between;
      font-size: 0.82rem;
      color: #666;
      margin-bottom: 6px;
    }

    /* 空狀態 */
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 64px 24px;
      color: #9e9e9e;
      text-align: center;
    }
    .empty-icon {
      font-size: 64px;
      width: 64px;
      height: 64px;
      margin-bottom: 16px;
      opacity: 0.35;
    }

    /* 載入中 */
    .loading-state {
      padding: 32px 0;
      text-align: center;
      color: #666;
    }
    .loading-state p { margin-top: 12px; }
  `],
})
export class EvaluationCyclesAdminComponent {
  private readonly cycleService = inject(EvaluationCycleService);
  private readonly dialog = inject(MatDialog);

  /** 所有考核週期（即時串流） */
  readonly cycles$ = this.cycleService.getCycles();

  /** 目前正在執行「結束並發布」的週期 ID */
  readonly closingCycleId = signal<string | null>(null);

  /** 取得狀態的中文顯示文字 */
  getStatusLabel(status: CycleStatus): string {
    return STATUS_LABEL[status];
  }

  /**
   * 計算完成率（整數百分比）
   * 避免除以零：totalAssignments 為 0 時回傳 0
   */
  getCompletionRate(cycle: EvaluationCycle): number {
    if (!cycle.totalAssignments) return 0;
    return Math.round((cycle.completedAssignments / cycle.totalAssignments) * 100);
  }

  /** 開啟新增週期對話框 */
  openCreateDialog(): void {
    this.dialog.open(CreateCycleDialogComponent, {
      width: '480px',
      disableClose: true,
    });
  }

  /** 開啟修改截止日期對話框 */
  openUpdateDeadlineDialog(cycle: EvaluationCycle): void {
    this.dialog.open(UpdateDeadlineDialogComponent, {
      width: '420px',
      disableClose: true,
      data: {
        cycleId: cycle.id,
        cycleName: cycle.name,
        currentDeadline: cycle.deadline.toDate(),
      } satisfies UpdateDeadlineDialogData,
    });
  }

  /** 開啟指派管理對話框 */
  openAssignmentDialog(cycle: EvaluationCycle): void {
    this.dialog.open(AssignmentManagementDialogComponent, {
      width: '720px',
      maxHeight: '85vh',
      data: {
        cycleId: cycle.id,
        cycleName: cycle.name,
        deadline: cycle.deadline,
      },
    });
  }

  /**
   * 結束並發布週期
   * 確認後呼叫 EvaluationCycleService.closeAndPublish()
   */
  async closeAndPublish(cycle: EvaluationCycle): Promise<void> {
    if (cycle.status === 'closed') return;

    const confirmed = window.confirm(
      `確認要結束並發布「${cycle.name}」嗎？此操作完成後無法還原。`,
    );
    if (!confirmed) return;

    this.closingCycleId.set(cycle.id);
    try {
      await this.cycleService.closeAndPublish(cycle.id);
    } catch (err) {
      console.error('結束並發布失敗：', err);
      alert('操作失敗，請稍後再試。');
    } finally {
      this.closingCycleId.set(null);
    }
  }
}

