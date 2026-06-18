/**
 * 指派管理對話框（T015）
 *
 * 功能：
 *  - 顯示特定週期的現有指派（受評者姓名 ← 評核者姓名）
 *  - 新增指派：選擇受評者 + 一或多名評核者
 *  - 刪除 pending 狀態的指派
 *  - 截止日已過時停用新增功能
 *  - 受評者與評核者選單僅列出在職使用者（exitDate 未設定者）
 *
 * 對話框輸入（MAT_DIALOG_DATA）：
 *  { cycleId: string; cycleName: string; deadline: Timestamp }
 */

import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import {
  Firestore,
  Timestamp,
  collection,
  collectionData,
} from '@angular/fire/firestore';

import { map } from 'rxjs';

import {
  EvaluationAssignment,
  RandomAssignmentPreview,
  RandomAssignmentPreviewRow,
} from '../../models/evaluation.models';
import { EvaluationAssignmentService } from '../../services/evaluation-assignment.service';
import { User } from '../../../services/user.service';

// =====================================================================
// 型別定義
// =====================================================================

/** 對話框輸入資料介面 */
interface DialogData {
  cycleId: string;
  cycleName: string;
  deadline: Timestamp;
}

/** 附有使用者顯示名稱的指派列表項目 */
interface AssignmentRow {
  id: string;
  status: EvaluationAssignment['status'];
  /** 受評者顯示名稱（uid fallback） */
  evaluateeName: string;
  /** 評核者顯示名稱（uid fallback） */
  evaluatorName: string;
  /** 僅 pending 狀態允許刪除 */
  canDelete: boolean;
}

/** 隨機快選預覽列表項目 */
interface PreviewRowView extends RandomAssignmentPreviewRow {
  evaluateeName: string;
  lockedEvaluatorNames: string[];
  warningsText: string;
}

// =====================================================================
// 狀態對應
// =====================================================================

/** 指派狀態 → 中文顯示文字 */
const ASSIGNMENT_STATUS_LABEL: Record<EvaluationAssignment['status'], string> = {
  pending: '待完成',
  completed: '已完成',
  overdue: '逾期',
};

// =====================================================================
// 元件
// =====================================================================

/**
 * 指派管理對話框
 * 路由外直接由 MatDialog.open() 開啟
 */
@Component({
  selector: 'app-assignment-management-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogTitle,
    MatDialogContent,
    MatDialogActions,
    MatDialogClose,
    MatDividerModule,
    MatFormFieldModule,
    MatIconModule,
    MatListModule,
    MatProgressBarModule,
    MatSelectModule,
  ],
  template: `
    <h2 mat-dialog-title>指派管理 — {{ data.cycleName }}</h2>

    <mat-dialog-content>

      <!-- 截止日已過警告 -->
      @if (isDeadlinePassed()) {
        <div class="deadline-warning">
          <mat-icon>warning</mat-icon>
          <span>考核截止日已過，目前無法新增指派。</span>
        </div>
      }

      <!-- ── 新增指派區域（截止日前才顯示）── -->
      @if (!isDeadlinePassed()) {
        <section class="add-section">
          <h3 class="section-title">新增指派</h3>

          <form [formGroup]="addForm" class="add-form">
            <!-- 受評者 -->
            <mat-form-field appearance="outline" class="form-field">
              <mat-label>受評者</mat-label>
              <mat-select formControlName="evaluateeUid">
                @for (user of users(); track user.uid) {
                  <mat-option [value]="user.uid">{{ user.name }}</mat-option>
                }
              </mat-select>
              @if (
                addForm.controls.evaluateeUid.hasError('required') &&
                addForm.controls.evaluateeUid.touched
              ) {
                <mat-error>請選擇受評者</mat-error>
              }
            </mat-form-field>

            <!-- 評核者（可多選） -->
            <mat-form-field appearance="outline" class="form-field">
              <mat-label>評核者（可多選）</mat-label>
              <mat-select formControlName="evaluatorUids" multiple>
                @for (user of users(); track user.uid) {
                  <mat-option
                    [value]="user.uid"
                    [disabled]="user.uid === addForm.controls.evaluateeUid.value"
                  >
                    {{ user.name }}
                  </mat-option>
                }
              </mat-select>
              @if (
                addForm.controls.evaluatorUids.hasError('required') &&
                addForm.controls.evaluatorUids.touched
              ) {
                <mat-error>請至少選擇一位評核者</mat-error>
              }
            </mat-form-field>

            <!-- 新增按鈕 -->
            <button
              mat-raised-button
              color="primary"
              type="button"
              [disabled]="addForm.invalid || isAdding()"
              (click)="addAssignments()"
            >
              @if (isAdding()) {
                <mat-progress-bar mode="indeterminate" class="btn-loader" />
              }
              新增
            </button>
          </form>

          <div class="quick-actions">
            <button
              mat-stroked-button
              color="primary"
              type="button"
              [disabled]="isGeneratingPreview()"
              (click)="generateRandomPreview()"
            >
              <mat-icon>shuffle</mat-icon>
              {{ randomPreview() ? '重新隨機' : '隨機快選' }}
            </button>
            @if (previewMessage()) {
              <span class="preview-message">{{ previewMessage() }}</span>
            }
          </div>
        </section>

        @if (randomPreview()) {
          <section class="preview-section">
            <div class="preview-header">
              <h3 class="section-title">隨機快選預覽</h3>
              <button
                mat-raised-button
                color="primary"
                type="button"
                [disabled]="isSavingPreview() || previewRows().length === 0"
                (click)="saveRandomPreview()"
              >
                @if (isSavingPreview()) {
                  <mat-progress-bar mode="indeterminate" class="btn-loader" />
                }
                確認儲存
              </button>
            </div>

            @if (previewRows().length === 0) {
              <p class="empty-list">可用使用者不足，無法產生隨機指派。</p>
            } @else {
              <div class="preview-list">
                @for (row of previewRows(); track row.evaluateeUid) {
                  <div class="preview-row">
                    <div class="preview-title">
                      <span class="role-hint">受評：</span>
                      <span class="user-name">{{ row.evaluateeName }}</span>
                      <span class="target-count">
                        目標 {{ row.targetEvaluatorCount }} 人，目前 {{ row.evaluatorUids.length }} 人
                      </span>
                    </div>

                    @if (row.lockedEvaluatorNames.length > 0) {
                      <div class="locked-line">
                        <mat-icon>lock</mat-icon>
                        <span>已完成鎖定：{{ row.lockedEvaluatorNames.join('、') }}</span>
                      </div>
                    }

                    <mat-form-field appearance="outline" class="preview-select">
                      <mat-label>可調整評核者</mat-label>
                      <mat-select
                        multiple
                        [value]="getEditableEvaluatorUids(row)"
                        (selectionChange)="updatePreviewEvaluators(row, $event.value)"
                      >
                        @for (user of randomCandidateUsers(); track user.uid) {
                          <mat-option
                            [value]="user.uid"
                            [disabled]="user.uid === row.evaluateeUid || row.lockedEvaluatorUids.includes(user.uid!)"
                          >
                            {{ user.name }}{{ user.jobTitle ? ' / ' + user.jobTitle : '' }}
                          </mat-option>
                        }
                      </mat-select>
                    </mat-form-field>

                    @if (row.warningsText) {
                      <p class="preview-warning">{{ row.warningsText }}</p>
                    }
                  </div>
                }
              </div>
            }
          </section>
        }

        <mat-divider class="section-divider" />
      }

      <!-- ── 現有指派清單 ── -->
      <section class="list-section">
        <h3 class="section-title">現有指派清單</h3>

        @if (isLoading()) {
          <!-- 載入中 -->
          <div class="loading-placeholder">
            <mat-progress-bar mode="indeterminate" />
            <p>載入中…</p>
          </div>
        } @else if (rows().length === 0) {
          <!-- 空清單 -->
          <p class="empty-list">尚無指派紀錄。</p>
        } @else {
          <div class="assignment-list">
            @for (row of rows(); track row.id) {
              <div class="assignment-row">

                <!-- 受評者 → 評核者 -->
                <div class="assignment-names">
                  <span class="role-hint">受評：</span>
                  <span class="user-name">{{ row.evaluateeName }}</span>
                  <mat-icon class="arrow">arrow_forward</mat-icon>
                  <span class="role-hint">評核：</span>
                  <span class="user-name">{{ row.evaluatorName }}</span>
                </div>

                <!-- 狀態 + 刪除 -->
                <div class="assignment-meta">
                  <span class="status-chip" [class]="'status-chip--' + row.status">
                    {{ getStatusLabel(row.status) }}
                  </span>
                  @if (row.canDelete) {
                    <button
                      mat-icon-button
                      color="warn"
                      title="刪除此指派"
                      [disabled]="deletingId() === row.id"
                      (click)="deleteAssignment(row.id)"
                    >
                      <mat-icon>delete</mat-icon>
                    </button>
                  }
                </div>

              </div>
            }
          </div>
        }
      </section>

    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>關閉</button>
    </mat-dialog-actions>
  `,
  styles: [`
    mat-dialog-content {
      min-width: 560px;
    }

    /* 截止日警告 */
    .deadline-warning {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: #fff3e0;
      color: #e65100;
      border-radius: 8px;
      margin-bottom: 16px;
      font-size: 0.9rem;
    }

    /* 區段標題 */
    .section-title {
      font-size: 0.9rem;
      font-weight: 600;
      color: #444;
      margin: 12px 0 10px;
    }

    /* 新增指派 */
    .add-section { margin-bottom: 12px; }
    .add-form {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      align-items: flex-start;
    }
    .form-field { flex: 1; min-width: 180px; }

    .quick-actions {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-top: 6px;
      flex-wrap: wrap;
    }
    .quick-actions button {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .preview-message {
      color: #757575;
      font-size: 0.82rem;
    }

    .preview-section {
      margin: 14px 0 12px;
      padding: 10px 12px;
      border: 1px solid #d7e3f5;
      border-radius: 8px;
      background: #f7fbff;
    }
    .preview-header {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: center;
      margin-bottom: 8px;
    }
    .preview-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
      max-height: 360px;
      overflow: auto;
      padding-right: 4px;
    }
    .preview-row {
      padding: 10px;
      border: 1px solid #e3edf8;
      border-radius: 8px;
      background: #fff;
    }
    .preview-title {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
      margin-bottom: 8px;
    }
    .target-count {
      color: #607d8b;
      font-size: 0.78rem;
    }
    .locked-line {
      display: flex;
      align-items: center;
      gap: 5px;
      color: #607d8b;
      font-size: 0.8rem;
      margin-bottom: 8px;
    }
    .locked-line mat-icon {
      width: 16px;
      height: 16px;
      font-size: 16px;
    }
    .preview-select {
      width: 100%;
    }
    .preview-warning {
      margin: 0;
      color: #b26a00;
      font-size: 0.8rem;
      line-height: 1.5;
    }

    /* 按鈕載入條定位 */
    button { position: relative; overflow: hidden; }
    .btn-loader {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 3px;
    }

    .section-divider { margin: 8px 0 4px; }
    .list-section { margin-top: 8px; }

    /* 指派列表 */
    .assignment-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .assignment-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 12px;
      border-radius: 8px;
      background: #fafafa;
      border: 1px solid #e0e0e0;
    }
    .assignment-names {
      display: flex;
      align-items: center;
      gap: 4px;
      flex-wrap: wrap;
    }
    .role-hint { font-size: 0.78rem; color: #9e9e9e; }
    .user-name { font-weight: 500; font-size: 0.9rem; }
    .arrow {
      font-size: 16px;
      width: 16px;
      height: 16px;
      color: #bdbdbd;
      margin: 0 4px;
    }

    /* 狀態 + 刪除 */
    .assignment-meta {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
    }
    .status-chip {
      padding: 2px 9px;
      border-radius: 10px;
      font-size: 0.74rem;
      font-weight: 500;
    }
    .status-chip--pending   { background: #e3f2fd; color: #1565c0; }
    .status-chip--completed { background: #e8f5e9; color: #2e7d32; }
    .status-chip--overdue   { background: #fce4ec; color: #b71c1c; }

    /* 空 / 載入 */
    .empty-list {
      color: #bdbdbd;
      font-style: italic;
      text-align: center;
      padding: 20px 0;
    }
    .loading-placeholder {
      padding: 16px 0;
      text-align: center;
      color: #757575;
    }
    .loading-placeholder p { margin-top: 10px; }
  `],
})
export class AssignmentManagementDialogComponent {
  /** 對話框輸入資料 */
  readonly data: DialogData = inject(MAT_DIALOG_DATA);

  private readonly firestore = inject(Firestore);
  private readonly assignmentService = inject(EvaluationAssignmentService);

  // ── 狀態訊號 ──

  /** 是否已過截止日 */
  readonly isDeadlinePassed = computed(() => this.data.deadline.toDate() < new Date());

  /** 新增中旗標 */
  readonly isAdding = signal(false);

  /** 是否正在產生隨機預覽 */
  readonly isGeneratingPreview = signal(false);

  /** 是否正在儲存隨機預覽 */
  readonly isSavingPreview = signal(false);

  /** 目前正在刪除的指派 ID */
  readonly deletingId = signal<string | null>(null);

  /** 隨機快選預覽 */
  readonly randomPreview = signal<RandomAssignmentPreview | null>(null);

  /** 預覽提示文字 */
  readonly previewMessage = signal('');

  // ── 資料訊號 ──

  /**
   * 在職使用者清單，由 Firestore users 集合即時串流，
   * 自動排除已離職使用者（exitDate 已設定者）。
   * 未發出前初始值為空陣列。
   */
  readonly users = toSignal(
    (collectionData(collection(this.firestore, 'users'), { idField: 'uid' }) as unknown as import('rxjs').Observable<User[]>).pipe(
      map(users => users.filter(u => !u.exitDate)),
    ),
    { initialValue: [] as User[] },
  );

  /** 隨機快選候選人：在職且非管理員 */
  readonly randomCandidateUsers = computed(() =>
    (this.users() as User[]).filter((user) => user.uid && user.role !== 'admin'),
  );

  /**
   * 該週期所有指派，未發出前為 undefined（用於判斷載入中）
   * 使用 toSignal 不帶 initialValue → Signal<EvaluationAssignment[] | undefined>
   */
  private readonly rawAssignments = toSignal(
    this.assignmentService.getAssignmentsByCycle(this.data.cycleId),
  );

  /** 是否仍在載入指派 */
  readonly isLoading = computed(() => this.rawAssignments() === undefined);

  /**
   * 指派顯示列表：將 UID 對應為使用者名稱
   * 依 rawAssignments 與 users 的訊號變化自動重新計算
   */
  readonly rows = computed((): AssignmentRow[] => {
    const assignments = this.rawAssignments() ?? [];
    const usersArr = this.users() as User[];
    const userMap = new Map(usersArr.map((u) => [u.uid!, u.name]));

    return assignments.map((a) => ({
      id: a.id,
      status: a.status,
      evaluateeName: userMap.get(a.evaluateeUid) ?? a.evaluateeUid,
      evaluatorName: userMap.get(a.evaluatorUid) ?? a.evaluatorUid,
      canDelete: a.status === 'pending',
    }));
  });

  /** 隨機快選預覽顯示列表 */
  readonly previewRows = computed((): PreviewRowView[] => {
    const preview = this.randomPreview();
    if (!preview) return [];

    const usersArr = this.users() as User[];
    const userMap = new Map(usersArr.map((u) => [u.uid!, u.name]));

    return preview.rows.map((row) => ({
      ...row,
      evaluateeName: userMap.get(row.evaluateeUid) ?? row.evaluateeUid,
      lockedEvaluatorNames: row.lockedEvaluatorUids.map((uid) => userMap.get(uid) ?? uid),
      warningsText: row.warnings.join('；'),
    }));
  });

  // ── 新增表單 ──

  readonly addForm = new FormGroup({
    evaluateeUid: new FormControl<string>('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    evaluatorUids: new FormControl<string[]>([], {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(1)],
    }),
  });

  // ── 公開方法 ──

  /** 取得指派狀態的中文顯示文字 */
  getStatusLabel(status: EvaluationAssignment['status']): string {
    return ASSIGNMENT_STATUS_LABEL[status] ?? status;
  }

  /** 取得預覽列中可編輯的評核者 UID */
  getEditableEvaluatorUids(row: RandomAssignmentPreviewRow): string[] {
    return row.evaluatorUids.filter((uid) => !row.lockedEvaluatorUids.includes(uid));
  }

  /** 產生隨機快選預覽 */
  generateRandomPreview(): void {
    this.isGeneratingPreview.set(true);
    try {
      const preview = this.assignmentService.generateRandomAssignmentPreview(
        this.data.cycleId,
        this.users() as User[],
        this.rawAssignments() ?? [],
      );
      this.randomPreview.set(preview);
      this.previewMessage.set(
        preview.rows.length === 0
          ? '可用使用者不足，無法產生隨機指派。'
          : `已產生 ${preview.rows.length} 位受評者的預覽清單，確認儲存後才會寫入。`,
      );
    } finally {
      this.isGeneratingPreview.set(false);
    }
  }

  /** 更新單一受評者的預覽評核者 */
  updatePreviewEvaluators(row: RandomAssignmentPreviewRow, editableEvaluatorUids: string[]): void {
    const preview = this.randomPreview();
    if (!preview) return;

    const sanitizedEditable = editableEvaluatorUids.filter((uid) =>
      uid !== row.evaluateeUid && !row.lockedEvaluatorUids.includes(uid),
    );
    const nextRows = preview.rows.map((previewRow) => {
      if (previewRow.evaluateeUid !== row.evaluateeUid) return previewRow;
      return {
        ...previewRow,
        evaluatorUids: Array.from(new Set([
          ...previewRow.lockedEvaluatorUids,
          ...sanitizedEditable,
        ])),
      };
    });

    this.randomPreview.set({
      ...preview,
      rows: nextRows,
      evaluatorLoads: this.calculatePreviewLoads(nextRows),
    });
  }

  /** 儲存隨機快選預覽 */
  async saveRandomPreview(): Promise<void> {
    const preview = this.randomPreview();
    if (!preview) return;

    this.isSavingPreview.set(true);
    try {
      await this.assignmentService.saveRandomAssignmentPreview(preview);
      this.randomPreview.set(null);
      this.previewMessage.set('隨機快選指派已儲存。');
    } catch (err) {
      console.error('儲存隨機快選失敗：', err);
      this.previewMessage.set('儲存隨機快選失敗，請稍後再試。');
    } finally {
      this.isSavingPreview.set(false);
    }
  }

  /**
   * 批次新增指派
   * 使用 EvaluationAssignmentService.createAssignments()
   */
  async addAssignments(): Promise<void> {
    if (this.addForm.invalid) {
      this.addForm.markAllAsTouched();
      return;
    }

    this.isAdding.set(true);
    try {
      const { evaluateeUid, evaluatorUids } = this.addForm.getRawValue();
      const assignments = evaluatorUids
        .filter((evaluatorUid) => evaluatorUid !== evaluateeUid)
        .map((evaluatorUid) => ({
          evaluatorUid,
          evaluateeUid,
        }));
      await this.assignmentService.createAssignments(this.data.cycleId, assignments);
      // 成功後重置表單
      this.addForm.reset({ evaluateeUid: '', evaluatorUids: [] });
    } catch (err) {
      console.error('新增指派失敗：', err);
    } finally {
      this.isAdding.set(false);
    }
  }

  /**
   * 刪除指定指派
   * 僅允許刪除 pending 狀態
   */
  async deleteAssignment(assignmentId: string): Promise<void> {
    const confirmed = window.confirm('確認要刪除此指派嗎？');
    if (!confirmed) return;

    this.deletingId.set(assignmentId);
    try {
      await this.assignmentService.deleteAssignment(assignmentId);
    } catch (err) {
      console.error('刪除指派失敗：', err);
    } finally {
      this.deletingId.set(null);
    }
  }

  private calculatePreviewLoads(rows: RandomAssignmentPreviewRow[]): Record<string, number> {
    const loads: Record<string, number> = {};
    for (const user of this.randomCandidateUsers()) {
      loads[user.uid!] = 0;
    }
    for (const row of rows) {
      for (const evaluatorUid of row.evaluatorUids) {
        loads[evaluatorUid] = (loads[evaluatorUid] ?? 0) + 1;
      }
    }
    return loads;
  }
}
