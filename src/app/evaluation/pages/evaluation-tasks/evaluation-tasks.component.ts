/**
 * EvaluationTasksComponent（T019）
 *
 * 評核者的考評任務清單頁面。
 *
 * 功能：
 *  - 兩個分頁：「待填寫」（pending / overdue）、「已填寫」（completed）
 *  - 從 EvaluationAssignmentService 取得所有指派
 *  - 合併受評者姓名（Firestore users/{uid}）與週期資訊（EvaluationCycleService）
 *  - 截止日期已過 → 顯示警示 chip
 *  - 已完成 → 顯示「已填寫」chip
 *  - 待填寫且未截止 → 顯示「填寫考評表」按鈕
 *  - 各分頁空狀態提示
 */

import { Component, computed, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { combineLatest, from, of, switchMap } from 'rxjs';
import { map, take } from 'rxjs/operators';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';
import { Timestamp } from 'firebase/firestore';

import { MatTabsModule } from '@angular/material/tabs';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { EvaluationAssignment } from '../../models/evaluation.models';
import { EvaluationAssignmentService } from '../../services/evaluation-assignment.service';
import { EvaluationCycleService } from '../../services/evaluation-cycle.service';
import { User } from '../../../services/user.service';

// ── 資料結構 ──────────────────────────────────────────────────────────────────

interface EnrichedAssignment {
  assignment: EvaluationAssignment;
  evaluateeName: string;
  cycleName: string;
  deadline: Timestamp | null;
  isDeadlinePassed: boolean;
}

// ── 元件 ──────────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-evaluation-tasks',
  standalone: true,
  imports: [
    DatePipe,
    MatTabsModule,
    MatCardModule,
    MatButtonModule,
    MatChipsModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <div class="page-container">

      <!-- 頁面標題 -->
      <div class="page-header">
        <h1 class="page-title">
          <mat-icon class="title-icon">assignment</mat-icon>
          我的考評任務
        </h1>
      </div>

      <!-- 載入中 -->
      @if (isLoading()) {
        <div class="loading-state">
          <mat-spinner diameter="48"></mat-spinner>
          <p>載入任務清單中…</p>
        </div>
      } @else {

        <!-- 分頁列 -->
        <mat-tab-group animationDuration="200ms" class="tasks-tabs">

          <!-- 待填寫 -->
          <mat-tab>
            <ng-template mat-tab-label>
              <mat-icon class="tab-icon">edit_note</mat-icon>
              待填寫
              @if (pendingAssignments().length > 0) {
                <span class="tab-badge tab-badge--pending">
                  {{ pendingAssignments().length }}
                </span>
              }
            </ng-template>

            <div class="tab-content">
              @if (pendingAssignments().length === 0) {
                <!-- 待填寫空狀態 -->
                <div class="empty-state">
                  <mat-icon class="empty-icon">check_circle_outline</mat-icon>
                  <p class="empty-title">目前沒有待填寫的考評任務。</p>
                </div>
              } @else {
                <div class="assignments-list">
                  @for (item of pendingAssignments(); track item.assignment.id) {
                    <mat-card class="assignment-card"
                      [class.assignment-card--overdue]="item.isDeadlinePassed">

                      <mat-card-content class="card-content">

                        <!-- 受評者名稱 -->
                        <div class="card-main">
                          <div class="evaluatee-info">
                            <mat-icon class="person-icon">person</mat-icon>
                            <div>
                              <div class="evaluatee-name">{{ item.evaluateeName }}</div>
                              <div class="cycle-name">{{ item.cycleName }}</div>
                            </div>
                          </div>

                          <!-- 操作區：chips + 按鈕 -->
                          <div class="card-actions">
                            <!-- 截止日期已過 chip -->
                            @if (item.isDeadlinePassed) {
                              <mat-chip class="chip chip--overdue">
                                <mat-icon matChipTrailingIcon>warning_amber</mat-icon>
                                考核截止日期已過
                              </mat-chip>
                            } @else {
                              <!-- 填寫按鈕 -->
                              <button
                                mat-raised-button
                                color="primary"
                                (click)="navigateToForm(item.assignment.id)"
                              >
                                <mat-icon>edit</mat-icon>
                                填寫考評表
                              </button>
                            }
                          </div>
                        </div>

                        <!-- 截止日期 -->
                        @if (item.deadline) {
                          <div class="deadline-row" [class.deadline-row--overdue]="item.isDeadlinePassed">
                            <mat-icon class="deadline-icon">schedule</mat-icon>
                            <span>截止日期：{{ item.deadline.toDate() | date:'yyyy/MM/dd' }}</span>
                            @if (item.isDeadlinePassed) {
                              <span class="overdue-label">（已截止）</span>
                            }
                          </div>
                        }

                      </mat-card-content>
                    </mat-card>
                  }
                </div>
              }
            </div>
          </mat-tab>

          <!-- 已填寫 -->
          <mat-tab>
            <ng-template mat-tab-label>
              <mat-icon class="tab-icon">task_alt</mat-icon>
              已填寫
              @if (completedAssignments().length > 0) {
                <span class="tab-badge tab-badge--completed">
                  {{ completedAssignments().length }}
                </span>
              }
            </ng-template>

            <div class="tab-content">
              @if (completedAssignments().length === 0) {
                <!-- 已填寫空狀態 -->
                <div class="empty-state">
                  <mat-icon class="empty-icon">inbox</mat-icon>
                  <p class="empty-title">目前沒有已完成的考評任務。</p>
                </div>
              } @else {
                <div class="assignments-list">
                  @for (item of completedAssignments(); track item.assignment.id) {
                    <mat-card class="assignment-card assignment-card--completed">

                      <mat-card-content class="card-content">

                        <div class="card-main">
                          <div class="evaluatee-info">
                            <mat-icon class="person-icon">person</mat-icon>
                            <div>
                              <div class="evaluatee-name">{{ item.evaluateeName }}</div>
                              <div class="cycle-name">{{ item.cycleName }}</div>
                            </div>
                          </div>

                          <!-- 已填寫 chip -->
                          <div class="card-actions">
                            <mat-chip class="chip chip--completed">
                              <mat-icon matChipTrailingIcon>check_circle</mat-icon>
                              已填寫
                            </mat-chip>
                          </div>
                        </div>

                        <!-- 完成時間 -->
                        @if (item.assignment.completedAt) {
                          <div class="deadline-row">
                            <mat-icon class="deadline-icon">event_available</mat-icon>
                            <span>
                              完成時間：{{ item.assignment.completedAt.toDate() | date:'yyyy/MM/dd HH:mm' }}
                            </span>
                          </div>
                        }

                      </mat-card-content>
                    </mat-card>
                  }
                </div>
              }
            </div>
          </mat-tab>

        </mat-tab-group>
      }

    </div>
  `,
  styles: [`
    /* ── 頁面容器 ────────────────────────────────────────────── */
    .page-container {
      padding: 24px;
      max-width: 900px;
      margin: 0 auto;
    }

    /* ── 頁面標題 ────────────────────────────────────────────── */
    .page-header {
      margin-bottom: 24px;
    }
    .page-title {
      display: flex;
      align-items: center;
      gap: 10px;
      margin: 0;
      font-size: 1.5rem;
      font-weight: 600;
      color: #333;
    }
    .title-icon {
      font-size: 28px;
      width: 28px;
      height: 28px;
      color: #1976d2;
    }

    /* ── 載入狀態 ────────────────────────────────────────────── */
    .loading-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 80px 24px;
      color: #666;
      gap: 16px;
    }

    /* ── Tab 樣式 ────────────────────────────────────────────── */
    .tasks-tabs {
      background: transparent;
    }
    .tab-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
      margin-right: 6px;
      vertical-align: middle;
    }
    .tab-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 20px;
      height: 20px;
      padding: 0 6px;
      border-radius: 10px;
      font-size: 0.75rem;
      font-weight: 700;
      margin-left: 8px;
    }
    .tab-badge--pending   { background: #fff3e0; color: #e65100; }
    .tab-badge--completed { background: #e8f5e9; color: #2e7d32; }

    /* ── Tab 內容區 ──────────────────────────────────────────── */
    .tab-content {
      padding: 20px 0;
    }

    /* ── 任務列表 ────────────────────────────────────────────── */
    .assignments-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    /* ── 任務卡片 ────────────────────────────────────────────── */
    .assignment-card {
      border-left: 4px solid #1976d2;
      transition: box-shadow 0.2s ease;
    }
    .assignment-card:hover {
      box-shadow: 0 3px 12px rgba(0,0,0,0.12);
    }
    .assignment-card--overdue {
      border-left-color: #f57c00;
      background: #fffde7;
    }
    .assignment-card--completed {
      border-left-color: #43a047;
      opacity: 0.85;
    }

    .card-content {
      padding: 16px 20px !important;
    }

    /* ── 卡片主列（左：人員資訊，右：操作） ────────────────────── */
    .card-main {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
    }

    /* ── 受評者資訊 ──────────────────────────────────────────── */
    .evaluatee-info {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .person-icon {
      color: #757575;
      font-size: 28px;
      width: 28px;
      height: 28px;
    }
    .evaluatee-name {
      font-size: 1rem;
      font-weight: 600;
      color: #212121;
    }
    .cycle-name {
      font-size: 0.82rem;
      color: #757575;
      margin-top: 2px;
    }

    /* ── 操作區 ──────────────────────────────────────────────── */
    .card-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }

    /* ── 截止日期列 ──────────────────────────────────────────── */
    .deadline-row {
      display: flex;
      align-items: center;
      gap: 5px;
      margin-top: 12px;
      font-size: 0.82rem;
      color: #757575;
    }
    .deadline-row--overdue {
      color: #e65100;
    }
    .deadline-icon {
      font-size: 15px;
      width: 15px;
      height: 15px;
    }
    .overdue-label {
      font-weight: 600;
    }

    /* ── Chip 樣式 ───────────────────────────────────────────── */
    .chip {
      font-size: 0.8rem;
      font-weight: 500;
      pointer-events: none;
    }
    .chip--overdue {
      background: #fff3e0 !important;
      color: #e65100 !important;
    }
    .chip--completed {
      background: #e8f5e9 !important;
      color: #2e7d32 !important;
    }

    /* ── 空狀態 ──────────────────────────────────────────────── */
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 60px 24px;
      color: #9e9e9e;
      text-align: center;
    }
    .empty-icon {
      font-size: 56px;
      width: 56px;
      height: 56px;
      margin-bottom: 16px;
      opacity: 0.4;
    }
    .empty-title {
      font-size: 1rem;
      font-weight: 500;
      margin: 0 0 6px;
    }
    .empty-subtitle {
      font-size: 0.85rem;
      margin: 0;
    }
  `],
})
export class EvaluationTasksComponent {
  // ── 相依注入 ─────────────────────────────────────────────────────────────

  private readonly assignmentService = inject(EvaluationAssignmentService);
  private readonly cycleService       = inject(EvaluationCycleService);
  private readonly firestore          = inject(Firestore);
  private readonly router             = inject(Router);

  // ── 資料串流：指派 + 受評者姓名 + 週期資訊 ───────────────────────────────

  private readonly enrichedAssignments$ = this.assignmentService.getMyAssignments().pipe(
    switchMap((assignments: EvaluationAssignment[]) => {
      if (!assignments.length) {
        return of([] as EnrichedAssignment[]);
      }

      // 為每一筆指派並行取得受評者姓名與週期資訊
      const enriched$ = assignments.map((assignment) =>
        combineLatest([
          // 受評者姓名：直接讀取 users/{uid}（單次快照）
          from(
            getDoc(doc(this.firestore, 'users', assignment.evaluateeUid)).then(
              (snap) => (snap.exists() ? (snap.data() as User).name : '未知用戶'),
            ),
          ),
          // 週期資訊：取第一次發射值即完成
          this.cycleService.getCycleById(assignment.cycleId).pipe(take(1)),
        ]).pipe(
          map(([evaluateeName, cycle]) => {
            const deadline = cycle?.deadline ?? null;
            return {
              assignment,
              evaluateeName,
              cycleName: cycle?.name ?? '未知週期',
              deadline,
              isDeadlinePassed: deadline ? deadline.toDate() < new Date() : false,
            } satisfies EnrichedAssignment;
          }),
        ),
      );

      return combineLatest(enriched$);
    }),
  );

  // ── Signal 狀態 ──────────────────────────────────────────────────────────

  /** null 表示尚未收到第一次資料（載入中） */
  readonly enrichedAssignments = toSignal(this.enrichedAssignments$, {
    initialValue: null,
  });

  readonly isLoading = computed(() => this.enrichedAssignments() === null);

  /** 待填寫：pending（含 overdue，表示截止後仍未提交） */
  readonly pendingAssignments = computed(() =>
    (this.enrichedAssignments() ?? []).filter(
      (a) => a.assignment.status === 'pending' || a.assignment.status === 'overdue',
    ),
  );

  /** 已填寫：completed */
  readonly completedAssignments = computed(() =>
    (this.enrichedAssignments() ?? []).filter(
      (a) => a.assignment.status === 'completed',
    ),
  );

  // ── 導航 ─────────────────────────────────────────────────────────────────

  navigateToForm(assignmentId: string): void {
    this.router.navigate(['/evaluation/tasks', assignmentId, 'form']);
  }
}

