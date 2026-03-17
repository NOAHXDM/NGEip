/**
 * EvaluationFormComponent（T020）
 *
 * 考評表單填寫頁面。
 *
 * 路由：/evaluation/tasks/:assignmentId/form
 *
 * 功能：
 *  - 從路由參數讀取 assignmentId，載入指派與週期資料
 *  - 若 assignment.status === 'completed' → 唯讀模式展示已提交的分數與整體評語
 *  - 若截止日期已過 → 顯示警示，表單停用
 *  - 主表單：
 *    ① EvaluationFormQuestionsComponent（10 道題）
 *    ② 整體評語文字框（20–500 字，即時字數計數）
 *    ③ 提交按鈕（表單合法前停用）
 *  - 提交成功 → MatSnackBar 通知 + 導回任務清單
 */

import {
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import {
  EvaluationAssignment,
  EvaluationCycle,
  EvaluationForm,
  EvaluationFormDraft,
  EvaluationFormFeedbacks,
  EvaluationFormScores,
} from '../../models/evaluation.models';
import { EvaluationFormService } from '../../services/evaluation-form.service';
import { EvaluationCycleService } from '../../services/evaluation-cycle.service';
import { EvaluationFormQuestionsComponent } from '../../components/evaluation-form-questions/evaluation-form-questions.component';

// ── 預設值 ────────────────────────────────────────────────────────────────────

const DEFAULT_SCORES: EvaluationFormScores = {
  q1: 5, q2: 5, q3: 5, q4: 5, q5: 5,
  q6: 5, q7: 5, q8: 5, q9: 5, q10: 5,
};

const EMPTY_FEEDBACKS: EvaluationFormFeedbacks = {};

const ASSIGNMENTS_COLLECTION = 'evaluationAssignments';
const OVERALL_COMMENT_MIN = 20;
const OVERALL_COMMENT_MAX = 500;

// ── 元件 ──────────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-evaluation-form',
  standalone: true,
  imports: [
    DatePipe,
    MatCardModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatChipsModule,
    MatIconModule,
    MatProgressSpinnerModule,
    EvaluationFormQuestionsComponent,
  ],
  template: `
    <div class="page-container">

      <!-- ── 載入中 ──────────────────────────────────────────── -->
      @if (isLoading()) {
        <div class="loading-state">
          <mat-spinner diameter="48"></mat-spinner>
          <p>載入考評資料中…</p>
        </div>
      }

      <!-- ── 錯誤狀態 ────────────────────────────────────────── -->
      @else if (errorMessage()) {
        <div class="error-state">
          <mat-icon class="error-icon">error_outline</mat-icon>
          <p class="error-message">{{ errorMessage() }}</p>
          <button mat-stroked-button (click)="goBack()">
            <mat-icon>arrow_back</mat-icon>
            返回任務清單
          </button>
        </div>
      }

      <!-- ── 主要內容 ────────────────────────────────────────── -->
      @else {
        <!-- 頁面標題列 -->
        <div class="page-header">
          <button mat-icon-button (click)="goBack()" class="back-btn" aria-label="返回">
            <mat-icon>arrow_back</mat-icon>
          </button>
          <div class="header-info">
            <h1 class="page-title">
              {{ isReadonly() ? '考評表單（唯讀）' : '填寫考評表單' }}
            </h1>
            @if (cycle()) {
              <p class="cycle-label">
                {{ cycle()!.name }}・
                截止日：{{ cycle()!.deadline.toDate() | date:'yyyy/MM/dd' }}
              </p>
            }
          </div>
          <!-- 狀態 chip -->
          @if (isReadonly()) {
            <mat-chip class="status-chip status-chip--completed">
              <mat-icon matChipTrailingIcon>task_alt</mat-icon>
              已填寫
            </mat-chip>
          } @else if (isDeadlinePassed()) {
            <mat-chip class="status-chip status-chip--overdue">
              <mat-icon matChipTrailingIcon>warning_amber</mat-icon>
              已截止
            </mat-chip>
          }
        </div>

        <!-- 截止日期警示橫幅（未完成但已截止） -->
        @if (!isReadonly() && isDeadlinePassed()) {
          <div class="deadline-banner">
            <mat-icon>warning_amber</mat-icon>
            <span>考核截止日期已過，無法填寫此考評表單。</span>
          </div>
        }

        <!-- ── 唯讀模式：展示已提交內容 ────────────────────── -->
        @if (isReadonly()) {
          <mat-card class="form-card readonly-card">
            <mat-card-header>
              <mat-card-title>已提交的考評內容</mat-card-title>
              @if (existingForm()?.submittedAt) {
                <mat-card-subtitle>
                  提交時間：{{ existingForm()!.submittedAt.toDate() | date:'yyyy/MM/dd HH:mm' }}
                </mat-card-subtitle>
              }
            </mat-card-header>
            <mat-card-content>
              <app-evaluation-form-questions
                [scores]="existingForm()?.scores ?? defaultScores"
                [feedbacks]="existingForm()?.feedbacks ?? emptyFeedbacks"
                [readonly]="true"
              />

              <!-- 整體評語（唯讀） -->
              <div class="overall-comment-readonly">
                <h3 class="section-title">
                  <mat-icon>comment</mat-icon>
                  整體評語
                </h3>
                <p class="readonly-comment-text">
                  {{ existingForm()?.overallComment ?? '（無整體評語）' }}
                </p>
              </div>
            </mat-card-content>
          </mat-card>
        }

        <!-- ── 填寫模式 ──────────────────────────────────────── -->
        @else {
          <mat-card class="form-card">
            <mat-card-content>

              <!-- 10 道考評題目 -->
              <app-evaluation-form-questions
                [scores]="scores()"
                [feedbacks]="feedbacks()"
                [readonly]="isDeadlinePassed()"
                (scoresChange)="scores.set($event)"
                (feedbacksChange)="feedbacks.set($event)"
              />

              <!-- 整體評語區塊 -->
              <div class="overall-comment-section">
                <h3 class="section-title">
                  <mat-icon>comment</mat-icon>
                  整體評語
                  <span class="required-mark">*</span>
                </h3>
                <p class="section-hint">請針對此人的整體表現提供綜合性評語（{{ commentMin }}–{{ commentMax }} 字）</p>

                <mat-form-field appearance="outline" class="full-width">
                  <mat-label>整體評語（必填）</mat-label>
                  <textarea
                    matInput
                    #commentRef
                    [value]="overallComment()"
                    [disabled]="isDeadlinePassed()"
                    [placeholder]="'請輸入對此人整體工作表現的評估，包括優點、改進空間及具體事例…（' + commentMin + '–' + commentMax + ' 字）'"
                    (input)="overallComment.set(commentRef.value)"
                    rows="6"
                  ></textarea>

                  <!-- 字數計數 -->
                  <mat-hint align="end">
                    <span [class.counter--warn]="commentLength() < commentMin"
                          [class.counter--error]="commentLength() > commentMax">
                      {{ remainingChars() }}/{{ commentMax }}
                    </span>
                  </mat-hint>

                  <!-- 驗證提示 -->
                  @if (commentLength() > 0 && commentLength() < commentMin) {
                    <mat-hint class="validation-hint validation-hint--warn">
                      <mat-icon class="hint-icon">info</mat-icon>
                      至少需要 {{ commentMin }} 字（目前 {{ commentLength() }} 字，還需 {{ commentMin - commentLength() }} 字）
                    </mat-hint>
                  }
                  @if (commentLength() > commentMax) {
                    <mat-hint class="validation-hint validation-hint--error">
                      <mat-icon class="hint-icon">error</mat-icon>
                      超出上限 {{ commentLength() - commentMax }} 字，請刪減至 {{ commentMax }} 字以內
                    </mat-hint>
                  }
                </mat-form-field>
              </div>

            </mat-card-content>

            <!-- 提交按鈕列 -->
            @if (!isDeadlinePassed()) {
              <mat-card-actions align="end" class="form-actions">
                <button mat-stroked-button (click)="goBack()" [disabled]="isSubmitting()">
                  取消
                </button>
                <button
                  mat-raised-button
                  color="primary"
                  [disabled]="!isFormValid() || isSubmitting()"
                  (click)="submit()"
                  class="submit-btn"
                >
                  @if (isSubmitting()) {
                    <mat-spinner diameter="18" class="btn-spinner"></mat-spinner>
                    提交中…
                  } @else {
                    <ng-container>
                      <mat-icon>send</mat-icon>
                      提交考評表單
                    </ng-container>
                  }
                </button>
              </mat-card-actions>
            }

          </mat-card>
        }
      }

    </div>
  `,
  styles: [`
    /* ── 頁面容器 ────────────────────────────────────────────── */
    .page-container {
      padding: 24px;
      max-width: 860px;
      margin: 0 auto;
    }

    /* ── 載入 / 錯誤狀態 ──────────────────────────────────────── */
    .loading-state,
    .error-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 80px 24px;
      gap: 16px;
      color: #666;
      text-align: center;
    }
    .error-icon {
      font-size: 56px;
      width: 56px;
      height: 56px;
      color: #d32f2f;
    }
    .error-message {
      font-size: 1rem;
      color: #d32f2f;
      margin: 0;
    }

    /* ── 頁面標題列 ──────────────────────────────────────────── */
    .page-header {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 20px;
    }
    .back-btn {
      flex-shrink: 0;
      margin-top: 2px;
    }
    .header-info {
      flex: 1;
    }
    .page-title {
      margin: 0 0 4px;
      font-size: 1.4rem;
      font-weight: 600;
      color: #212121;
    }
    .cycle-label {
      margin: 0;
      font-size: 0.85rem;
      color: #757575;
    }

    /* ── 狀態 chip ───────────────────────────────────────────── */
    .status-chip {
      pointer-events: none;
      align-self: center;
      font-weight: 500;
    }
    .status-chip--completed {
      background: #e8f5e9 !important;
      color: #2e7d32 !important;
    }
    .status-chip--overdue {
      background: #fff3e0 !important;
      color: #e65100 !important;
    }

    /* ── 截止日期警示橫幅 ──────────────────────────────────────── */
    .deadline-banner {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 18px;
      background: #fff3e0;
      border: 1px solid #ffe0b2;
      border-radius: 8px;
      color: #e65100;
      font-weight: 500;
      margin-bottom: 20px;
    }

    /* ── 表單卡片 ────────────────────────────────────────────── */
    .form-card {
      margin-bottom: 24px;
    }
    .readonly-card {
      border-left: 4px solid #43a047;
    }

    /* ── 整體評語區塊 ──────────────────────────────────────────── */
    .overall-comment-section {
      margin-top: 32px;
      padding-top: 24px;
      border-top: 1px solid #e0e0e0;
    }
    .section-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 1rem;
      font-weight: 600;
      color: #333;
      margin: 0 0 6px;
    }
    .required-mark {
      color: #d32f2f;
    }
    .section-hint {
      font-size: 0.82rem;
      color: #757575;
      margin: 0 0 14px;
    }
    .full-width { width: 100%; }

    /* ── 字數計數 ────────────────────────────────────────────── */
    .counter--warn  { color: #f57c00; font-weight: 600; }
    .counter--error { color: #d32f2f; font-weight: 600; }

    .validation-hint {
      display: flex;
      align-items: center;
      gap: 4px;
      margin-top: 4px;
      font-size: 0.78rem;
    }
    .validation-hint--warn  { color: #f57c00 !important; }
    .validation-hint--error { color: #d32f2f !important; }
    .hint-icon {
      font-size: 14px;
      width: 14px;
      height: 14px;
    }

    /* ── 唯讀整體評語 ──────────────────────────────────────────── */
    .overall-comment-readonly {
      margin-top: 28px;
      padding-top: 20px;
      border-top: 1px solid #e0e0e0;
    }
    .readonly-comment-text {
      background: #f9f9f9;
      border-radius: 6px;
      padding: 14px 16px;
      font-size: 0.95rem;
      line-height: 1.7;
      color: #333;
      white-space: pre-wrap;
      margin: 0;
    }

    /* ── 提交按鈕列 ──────────────────────────────────────────── */
    .form-actions {
      padding: 12px 16px !important;
      gap: 10px;
      border-top: 1px solid #f0f0f0;
    }
    .submit-btn {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .btn-spinner {
      display: inline-block;
    }
  `],
})
export class EvaluationFormComponent implements OnInit {
  // ── 相依注入 ─────────────────────────────────────────────────────────────

  private readonly route         = inject(ActivatedRoute);
  private readonly router        = inject(Router);
  private readonly firestore     = inject(Firestore);
  private readonly formService   = inject(EvaluationFormService);
  private readonly cycleService  = inject(EvaluationCycleService);
  private readonly snackBar      = inject(MatSnackBar);

  // ── 路由參數 ─────────────────────────────────────────────────────────────

  private readonly assignmentId: string = this.route.snapshot.params['assignmentId'];

  // ── 靜態預設值（template 直接讀取） ──────────────────────────────────────

  readonly defaultScores  = DEFAULT_SCORES;
  readonly emptyFeedbacks = EMPTY_FEEDBACKS;
  readonly commentMin     = OVERALL_COMMENT_MIN;
  readonly commentMax     = OVERALL_COMMENT_MAX;

  // ── 頁面狀態 ──────────────────────────────────────────────────────────────

  readonly isLoading    = signal(true);
  readonly errorMessage = signal<string | null>(null);

  // 載入後的資料
  readonly assignment   = signal<EvaluationAssignment | null>(null);
  readonly cycle        = signal<EvaluationCycle | null>(null);
  readonly existingForm = signal<EvaluationForm | null>(null);

  // ── 表單狀態（Signal） ────────────────────────────────────────────────────

  readonly scores        = signal<EvaluationFormScores>({ ...DEFAULT_SCORES });
  readonly feedbacks     = signal<EvaluationFormFeedbacks>({});
  readonly overallComment = signal('');
  readonly isSubmitting  = signal(false);

  // ── 計算屬性 ─────────────────────────────────────────────────────────────

  /** 已完成指派 → 唯讀展示 */
  readonly isReadonly = computed(() => this.assignment()?.status === 'completed');

  /** 截止日期是否已過 */
  readonly isDeadlinePassed = computed(() => {
    const c = this.cycle();
    return c ? c.deadline.toDate() < new Date() : false;
  });

  /** 整體評語目前字數 */
  readonly commentLength = computed(() => this.overallComment().length);

  /** 剩餘可用字數（500 - 已輸入） */
  readonly remainingChars = computed(() => this.commentMax - this.commentLength());

  /**
   * 整體評語是否合法（20–500 字）
   */
  readonly isCommentValid = computed(
    () => this.commentLength() >= this.commentMin && this.commentLength() <= this.commentMax,
  );

  /**
   * 分數驗證：所有極端值（≥9 或 ≤3）的題目必須填寫補充說明
   */
  readonly areScoresValid = computed(() => {
    const s = this.scores();
    const f = this.feedbacks();
    const keys: (keyof EvaluationFormScores)[] = [
      'q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q9', 'q10',
    ];
    return keys.every((k) => {
      const score = s[k];
      if (score >= 9 || score <= 3) {
        return (f[k]?.trim().length ?? 0) > 0;
      }
      return true;
    });
  });

  /** 整體表單是否合法（可提交） */
  readonly isFormValid = computed(
    () => this.isCommentValid() && this.areScoresValid(),
  );

  // ── 生命週期 ─────────────────────────────────────────────────────────────

  ngOnInit(): void {
    void this.loadPageData();
  }

  // ── 資料載入 ─────────────────────────────────────────────────────────────

  private async loadPageData(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    try {
      // 1. 載入考評指派
      const assignmentSnap = await getDoc(
        doc(this.firestore, ASSIGNMENTS_COLLECTION, this.assignmentId),
      );

      if (!assignmentSnap.exists()) {
        this.errorMessage.set('找不到此考評指派，請確認連結是否正確。');
        return;
      }

      const assignment = {
        ...assignmentSnap.data(),
        id: assignmentSnap.id,
      } as EvaluationAssignment;
      this.assignment.set(assignment);

      // 2. 載入評核週期（取第一次發射）
      const cycle = await firstValueFrom(
        this.cycleService.getCycleById(assignment.cycleId),
      );
      this.cycle.set(cycle);

      // 3. 若已完成，載入已提交的表單內容（唯讀展示）
      if (assignment.status === 'completed') {
        const form = await firstValueFrom(
          this.formService.getMyForm(assignment.cycleId, assignment.evaluateeUid),
        );
        this.existingForm.set(form);
      }
    } catch (err) {
      console.error('[EvaluationFormComponent] 載入資料失敗：', err);
      this.errorMessage.set('載入資料時發生錯誤，請稍後重試。');
    } finally {
      this.isLoading.set(false);
    }
  }

  // ── 表單提交 ─────────────────────────────────────────────────────────────

  async submit(): Promise<void> {
    if (!this.isFormValid() || this.isSubmitting()) return;

    const assignment = this.assignment();
    if (!assignment) return;

    this.isSubmitting.set(true);
    try {
      const draft: EvaluationFormDraft = {
        scores:         this.scores(),
        feedbacks:      this.feedbacks(),
        overallComment: this.overallComment().trim(),
      };

      await this.formService.submitForm(
        assignment.cycleId,
        this.assignmentId,
        assignment.evaluateeUid,
        draft,
      );

      this.snackBar.open('考評表單已成功提交！', '關閉', {
        duration: 4000,
        panelClass: ['snack-success'],
      });

      this.router.navigate(['/evaluation/tasks']);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : '提交失敗，請稍後再試。';
      console.error('[EvaluationFormComponent] 提交失敗：', err);
      this.snackBar.open(message, '關閉', {
        duration: 6000,
        panelClass: ['snack-error'],
      });
    } finally {
      this.isSubmitting.set(false);
    }
  }

  // ── 導航 ─────────────────────────────────────────────────────────────────

  goBack(): void {
    this.router.navigate(['/evaluation/tasks']);
  }
}

