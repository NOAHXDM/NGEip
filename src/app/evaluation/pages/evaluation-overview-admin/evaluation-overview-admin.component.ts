/**
 * EvaluationOverviewAdminComponent（T033）
 *
 * 管理者評核總覽頁面。
 * 路由：/evaluation/admin/overview
 *
 * 功能：
 *  - 週期選擇下拉（MatSelect）
 *  - 完成率進度條（completedAssignments / totalAssignments）
 *  - 受評者卡片清單：
 *    - 預設：屬性分數、職業原型、評核人數、異常標記 icon
 *    - 可展開查看該受評者的所有考評表明細
 *  - 「開啟排名視圖」toggle：
 *    - 排序欄位選擇（totalScore/EXE/INS/ADP/COL/STB/INN）
 *    - 升降冪選擇
 *    - 顯示名次
 *  - 「結束並發布」按鈕（週期 status=closed 後停用）
 *  - 空狀態引導
 */

import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { firstValueFrom, switchMap, of } from 'rxjs';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';

import { MatCardModule } from '@angular/material/card';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatChipsModule } from '@angular/material/chips';
import { MatExpansionModule } from '@angular/material/expansion';
import { DecimalPipe } from '@angular/common';

import {
  AttributeKey,
  EvaluationCycle,
  EvaluationForm,
  UserAttributeSnapshot,
} from '../../models/evaluation.models';
import { EvaluationCycleService } from '../../services/evaluation-cycle.service';
import { UserAttributeSnapshotService } from '../../services/user-attribute-snapshot.service';
import { EvaluationFormService } from '../../services/evaluation-form.service';
import { CareerArchetypeBadgeComponent } from '../../components/career-archetype-badge/career-archetype-badge.component';

// ── 排序欄位定義 ──────────────────────────────────────────────────────────────

type SortField = 'totalScore' | AttributeKey;

const SORT_FIELDS: { value: SortField; label: string }[] = [
  { value: 'totalScore', label: '總分' },
  { value: 'EXE', label: 'EXE 執行力' },
  { value: 'INS', label: 'INS 洞察力' },
  { value: 'ADP', label: 'ADP 應變力' },
  { value: 'COL', label: 'COL 協作力' },
  { value: 'STB', label: 'STB 穩定力' },
  { value: 'INN', label: 'INN 創新力' },
];

const ATTRIBUTE_KEYS: AttributeKey[] = ['EXE', 'INS', 'ADP', 'COL', 'STB', 'INN'];

// ── 受評者卡片資料結構 ────────────────────────────────────────────────────────

interface EvaluateeCard {
  snapshot: UserAttributeSnapshot;
  evaluateeName: string;
  forms?: EvaluationForm[];
  formsLoaded: boolean;
  isExpanded: boolean;
}

// ── 元件 ──────────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-evaluation-overview-admin',
  standalone: true,
  imports: [
    DecimalPipe,
    MatCardModule,
    MatSelectModule,
    MatFormFieldModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    MatSlideToggleModule,
    MatDividerModule,
    MatTooltipModule,
    MatChipsModule,
    MatExpansionModule,
    CareerArchetypeBadgeComponent,
  ],
  template: `
    <div class="page-container">

      <!-- 頁面標題 -->
      <div class="page-header">
        <h1 class="page-title">
          <mat-icon class="title-icon">assessment</mat-icon>
          評核總覽（管理者）
        </h1>
      </div>

      <!-- 週期選擇 -->
      <mat-card class="control-card">
        <mat-card-content>
          <div class="controls-row">
            <mat-form-field appearance="outline" class="cycle-selector">
              <mat-label>選擇考核週期</mat-label>
              <mat-select
                [value]="selectedCycleId()"
                (selectionChange)="onCycleChange($event.value)">
                @for (cycle of cycles(); track cycle.id) {
                  <mat-option [value]="cycle.id">
                    {{ cycle.name }}（{{ cycle.status === 'closed' ? '已關閉' : cycle.status === 'expired_pending' ? '待確認' : '進行中' }}）
                  </mat-option>
                }
              </mat-select>
            </mat-form-field>

            <!-- 結束並發布按鈕 -->
            @if (selectedCycle()) {
              <button
                mat-raised-button
                color="warn"
                [disabled]="selectedCycle()!.status === 'closed' || isClosing()"
                (click)="closeAndPublish()">
                @if (isClosing()) {
                  <mat-spinner diameter="16" />
                } @else {
                  <mat-icon>publish</mat-icon>
                }
                {{ selectedCycle()!.status === 'closed' ? '已發布' : '結束並發布' }}
              </button>
            }
          </div>

          <!-- 完成率進度條 -->
          @if (selectedCycle()) {
            <div class="progress-section">
              <div class="progress-label">
                完成率：{{ selectedCycle()!.completedAssignments }} / {{ selectedCycle()!.totalAssignments }} 份
                （{{ completionRate() | number: '1.0-0' }}%）
              </div>
              <mat-progress-bar
                mode="determinate"
                [value]="completionRate()" />
            </div>
          }
        </mat-card-content>
      </mat-card>

      @if (!selectedCycleId()) {
        <!-- 未選擇週期空狀態 -->
        <mat-card class="empty-state-card">
          <mat-card-content>
            <div class="empty-state">
              <mat-icon class="empty-icon">search</mat-icon>
              <p>請選擇考核週期以查看總覽</p>
            </div>
          </mat-card-content>
        </mat-card>

      } @else if (isLoadingSnapshots()) {
        <div class="loading-state">
          <mat-spinner diameter="40"></mat-spinner>
          <p>載入考評資料中…</p>
        </div>

      } @else if (evaluateeCards().length === 0) {
        <!-- 無快照空狀態 -->
        <mat-card class="empty-state-card">
          <mat-card-content>
            <div class="empty-state">
              <mat-icon class="empty-icon">people</mat-icon>
              <p>此週期尚無考評資料</p>
            </div>
          </mat-card-content>
        </mat-card>

      } @else {

        <!-- 排名視圖控制項 -->
        <mat-card class="ranking-control-card">
          <mat-card-content>
            <div class="ranking-row">
              <mat-slide-toggle
                [checked]="rankingViewEnabled()"
                (change)="rankingViewEnabled.set($event.checked)">
                開啟排名視圖
              </mat-slide-toggle>

              @if (rankingViewEnabled()) {
                <mat-form-field appearance="outline" class="sort-field-selector">
                  <mat-label>排序欄位</mat-label>
                  <mat-select
                    [value]="sortField()"
                    (selectionChange)="sortField.set($event.value)">
                    @for (field of sortFields; track field.value) {
                      <mat-option [value]="field.value">{{ field.label }}</mat-option>
                    }
                  </mat-select>
                </mat-form-field>

                <button
                  mat-icon-button
                  [matTooltip]="sortOrder() === 'desc' ? '目前：由高到低' : '目前：由低到高'"
                  (click)="toggleSortOrder()">
                  <mat-icon>{{ sortOrder() === 'desc' ? 'arrow_downward' : 'arrow_upward' }}</mat-icon>
                </button>
              }
            </div>
          </mat-card-content>
        </mat-card>

        <!-- 受評者卡片清單 -->
        <div class="evaluatee-list">
          @for (card of sortedCards(); track card.snapshot.userId; let i = $index) {
            <mat-card
              class="evaluatee-card"
              [class.anomaly]="hasAnomaly(card)">

              <mat-card-header>
                <div class="card-header-row">

                  <!-- 排名（排名視圖開啟時） -->
                  @if (rankingViewEnabled()) {
                    <span class="rank-badge">#{{ i + 1 }}</span>
                  }

                  <mat-card-title class="evaluatee-name">{{ card.evaluateeName }}</mat-card-title>

                  <!-- 異常標記 -->
                  @if (hasAnomaly(card)) {
                    <mat-icon
                      class="anomaly-icon"
                      color="warn"
                      [matTooltip]="'此考評結果包含異常標記（互惠高分對/離群評核者）'">
                      warning
                    </mat-icon>
                  }

                  <span class="spacer"></span>

                  <!-- 評核人數 -->
                  <span class="evaluator-count-badge">
                  {{ card.snapshot.validEvaluatorCount }} 位評核
                  </span>
                </div>
              </mat-card-header>

              <mat-card-content>
                <div class="card-body">

                  <!-- 職業原型 -->
                  <app-career-archetype-badge [archetypes]="card.snapshot.careerArchetypes" />

                  <!-- 總分 -->
                  <div class="score-row">
                    <span class="score-label">總分</span>
                    <span class="score-value">{{ card.snapshot.totalScore.toFixed(2) }}</span>
                  </div>

                  <!-- 六大屬性分數 -->
                  <div class="attributes-grid">
                    @for (key of attributeKeys; track key) {
                      <div class="attr-item">
                        <span class="attr-key">{{ key }}</span>
                        <span class="attr-score"
                          [class.below-passing]="card.snapshot.attributes[key] < 6">
                          {{ card.snapshot.attributes[key].toFixed(2) }}
                        </span>
                      </div>
                    }
                  </div>
                </div>

                <!-- 展開考評表明細按鈕 -->
                <div class="expand-section">
                  <button
                    mat-button
                    color="primary"
                    (click)="toggleExpandCard(card)">
                    <mat-icon>{{ card.isExpanded ? 'expand_less' : 'expand_more' }}</mat-icon>
                    {{ card.isExpanded ? '收合考評表明細' : '展開考評表明細' }}
                  </button>
                </div>

                <!-- 考評表明細（展開後） -->
                @if (card.isExpanded) {
                  <mat-divider class="form-divider" />

                  @if (!card.formsLoaded) {
                    <div class="forms-loading">
                      <mat-spinner diameter="24"></mat-spinner>
                      <span>載入考評表中…</span>
                    </div>
                  } @else if (!card.forms || card.forms.length === 0) {
                    <p class="no-forms">此受評者本週期無考評表記錄</p>
                  } @else {
                    <div class="forms-list">
                      @for (form of card.forms; track form.id) {
                        <div class="form-detail-card">
                          <div class="form-header">
                            <span class="evaluator-label">評核者：{{ form.evaluatorUid }}</span>

                            <!-- 異常標記 -->
                            @if (form.anomalyFlags.reciprocalHighScore || form.anomalyFlags.outlierEvaluator) {
                              <span
                                class="form-anomaly-badge"
                                [matTooltip]="'此評核表已被標記為異常（互惠高分對/離群評核者）'">
                                <mat-icon color="warn" class="small-icon">warning</mat-icon>
                                異常
                              </span>
                            }
                          </div>

                          <!-- 10 題分數摘要 -->
                          <div class="form-scores">
                            @for (q of questionKeys; track q) {
                              <span class="q-score">{{ q }}: {{ form.scores[q] }}</span>
                            }
                          </div>

                          <!-- 整體評語 -->
                          <div class="form-comment">
                            <span class="comment-label">整體評語：</span>
                            <span class="comment-text">{{ form.overallComment }}</span>
                          </div>
                        </div>
                      }
                    </div>
                  }
                }
              </mat-card-content>
            </mat-card>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    :host {
      display: block;
    }

    .page-container {
      max-width: 1000px;
      margin: 0 auto;
      padding: 24px 16px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .page-header {
      margin-bottom: 4px;
    }

    .page-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 24px;
      font-weight: 500;
      margin: 0;
    }

    .title-icon {
      font-size: 28px;
      height: 28px;
      width: 28px;
      color: #1A73E8;
    }

    .control-card mat-card-content {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .controls-row {
      display: flex;
      align-items: center;
      gap: 16px;
      flex-wrap: wrap;
    }

    .cycle-selector {
      min-width: 280px;
    }

    .progress-section {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .progress-label {
      font-size: 13px;
      color: #555;
    }

    .loading-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      padding: 40px;
      color: #666;
    }

    .empty-state-card {
      margin: 8px 0;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 32px;
      gap: 8px;
      color: #999;
    }

    .empty-icon {
      font-size: 40px;
      height: 40px;
      width: 40px;
    }

    .ranking-control-card mat-card-content {
      padding: 12px 16px;
    }

    .ranking-row {
      display: flex;
      align-items: center;
      gap: 16px;
      flex-wrap: wrap;
    }

    .sort-field-selector {
      min-width: 180px;
    }

    .evaluatee-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .evaluatee-card {
      transition: box-shadow 0.2s;
    }

    .evaluatee-card.anomaly {
      border-left: 3px solid #FF9800;
    }

    .card-header-row {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      flex-wrap: wrap;
    }

    .rank-badge {
      font-size: 18px;
      font-weight: 700;
      color: #1A73E8;
      min-width: 36px;
    }

    .evaluatee-name {
      font-size: 16px;
    }

    .anomaly-icon {
      font-size: 20px;
      height: 20px;
      width: 20px;
    }

    .spacer {
      flex: 1;
    }

    .evaluator-count-badge {
      font-size: 12px;
      color: #666;
      background: #f5f5f5;
      padding: 2px 8px;
      border-radius: 12px;
    }

    .card-body {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .score-row {
      display: flex;
      align-items: baseline;
      gap: 6px;
    }

    .score-label {
      font-size: 12px;
      color: #666;
    }

    .score-value {
      font-size: 22px;
      font-weight: 700;
      color: #1A73E8;
    }

    .attributes-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .attr-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      min-width: 56px;
      padding: 4px 8px;
      background: #f8f9fa;
      border-radius: 4px;
    }

    .attr-key {
      font-size: 11px;
      font-weight: 700;
      color: #555;
    }

    .attr-score {
      font-size: 14px;
      font-weight: 500;
      color: #333;
    }

    .attr-score.below-passing {
      color: #EA4335;
    }

    .expand-section {
      margin-top: 8px;
    }

    .form-divider {
      margin: 12px 0;
    }

    .forms-loading {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px;
      color: #666;
      font-size: 13px;
    }

    .no-forms {
      font-size: 13px;
      color: #999;
      font-style: italic;
      padding: 8px;
    }

    .forms-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .form-detail-card {
      background: #f8f9fa;
      border-radius: 6px;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .form-header {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .evaluator-label {
      font-size: 12px;
      color: #555;
      font-weight: 500;
    }

    .form-anomaly-badge {
      display: flex;
      align-items: center;
      gap: 2px;
      font-size: 12px;
      color: #E65100;
      cursor: help;
    }

    .small-icon {
      font-size: 16px;
      height: 16px;
      width: 16px;
    }

    .form-scores {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .q-score {
      font-size: 12px;
      background: #e8eaf6;
      padding: 2px 6px;
      border-radius: 3px;
      color: #333;
    }

    .form-comment {
      font-size: 13px;
      line-height: 1.5;
    }

    .comment-label {
      color: #666;
      font-weight: 500;
    }

    .comment-text {
      color: #333;
    }
  `],
})
export class EvaluationOverviewAdminComponent implements OnInit {
  private readonly cycleService = inject(EvaluationCycleService);
  private readonly snapshotService = inject(UserAttributeSnapshotService);
  private readonly formService = inject(EvaluationFormService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly firestore = inject(Firestore);

  readonly sortFields = SORT_FIELDS;
  readonly attributeKeys = ATTRIBUTE_KEYS;
  readonly questionKeys = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q9', 'q10'] as const;

  // ── 狀態 ──────────────────────────────────────────────────────────────────

  selectedCycleId = signal<string | null>(null);
  isLoadingSnapshots = signal(false);
  isClosing = signal(false);
  rankingViewEnabled = signal(false);
  sortField = signal<SortField>('totalScore');
  sortOrder = signal<'asc' | 'desc'>('desc');

  // ── 資料 ──────────────────────────────────────────────────────────────────

  cycles = toSignal(this.cycleService.getCycles(), { initialValue: [] as EvaluationCycle[] });
  private readonly _evaluateeCards = signal<EvaluateeCard[]>([]);
  evaluateeCards = this._evaluateeCards.asReadonly();

  // ── 衍生計算 ──────────────────────────────────────────────────────────────

  selectedCycle = computed<EvaluationCycle | null>(() => {
    const id = this.selectedCycleId();
    if (!id) return null;
    return this.cycles().find((c) => c.id === id) ?? null;
  });

  completionRate = computed<number>(() => {
    const cycle = this.selectedCycle();
    if (!cycle || !cycle.totalAssignments) return 0;
    return (cycle.completedAssignments / cycle.totalAssignments) * 100;
  });

  /** 排序後的受評者卡片 */
  sortedCards = computed<EvaluateeCard[]>(() => {
    const cards = [...this._evaluateeCards()];
    if (!this.rankingViewEnabled()) return cards;

    const field = this.sortField();
    const order = this.sortOrder();

    return cards.sort((a, b) => {
      let aVal: number;
      let bVal: number;

      if (field === 'totalScore') {
        aVal = a.snapshot.totalScore ?? 0;
        bVal = b.snapshot.totalScore ?? 0;
      } else {
        aVal = a.snapshot.attributes?.[field] ?? 0;
        bVal = b.snapshot.attributes?.[field] ?? 0;
      }

      return order === 'desc' ? bVal - aVal : aVal - bVal;
    });
  });

  // ── 生命週期 ──────────────────────────────────────────────────────────────

  ngOnInit(): void {
    // 自動選擇第一個週期
    this.cycleService.getCycles().subscribe((cycles) => {
      if (cycles.length > 0 && !this.selectedCycleId()) {
        this.onCycleChange(cycles[0].id);
      }
    });
  }

  // ── 事件處理 ──────────────────────────────────────────────────────────────

  async onCycleChange(cycleId: string): Promise<void> {
    this.selectedCycleId.set(cycleId);
    this.isLoadingSnapshots.set(true);
    this._evaluateeCards.set([]);

    try {
      const snapshots = await firstValueFrom(
        this.snapshotService.getAllSnapshotsByCycle(cycleId),
      );

      const cards: EvaluateeCard[] = await Promise.all(
        snapshots.map(async (snapshot) => {
          // 嘗試從 users 集合取得受評者姓名
          const userName = await this.fetchUserName(snapshot.userId);
          return {
            snapshot,
            evaluateeName: userName,
            formsLoaded: false,
            isExpanded: false,
          };
        }),
      );

      this._evaluateeCards.set(cards);
    } finally {
      this.isLoadingSnapshots.set(false);
    }
  }

  async toggleExpandCard(card: EvaluateeCard): Promise<void> {
    card.isExpanded = !card.isExpanded;

    if (card.isExpanded && !card.formsLoaded) {
      const cycleId = this.selectedCycleId();
      if (!cycleId) return;

      const forms = await firstValueFrom(
        this.formService.getFormsByEvaluatee(cycleId, card.snapshot.userId),
      );
      card.forms = forms;
      card.formsLoaded = true;
    }

    // 觸發更新
    this._evaluateeCards.set([...this._evaluateeCards()]);
  }

  async closeAndPublish(): Promise<void> {
    const cycleId = this.selectedCycleId();
    if (!cycleId) return;

    const confirmed = window.confirm(
      `確定要結束並發布週期「${this.selectedCycle()?.name}」嗎？\n` +
      `此操作將計算所有受評者的最終 Z-score 校正分數，且無法復原。`,
    );
    if (!confirmed) return;

    this.isClosing.set(true);
    try {
      await this.cycleService.closeAndPublish(cycleId);
      this.snackBar.open('週期已成功結束並發布！快照狀態已更新為 final。', '關閉', {
        duration: 5000,
      });
      // 重新載入資料
      await this.onCycleChange(cycleId);
    } catch (error) {
      const msg = error instanceof Error ? error.message : '發布失敗，請稍後再試';
      this.snackBar.open(`❌ ${msg}`, '關閉', { duration: 8000 });
    } finally {
      this.isClosing.set(false);
    }
  }

  toggleSortOrder(): void {
    this.sortOrder.set(this.sortOrder() === 'desc' ? 'asc' : 'desc');
  }

  hasAnomaly(card: EvaluateeCard): boolean {
    if (!card.forms || card.forms.length === 0) return false;
    return card.forms.some(
      (f) => f.anomalyFlags.reciprocalHighScore || f.anomalyFlags.outlierEvaluator,
    );
  }

  // ── 私有輔助 ──────────────────────────────────────────────────────────────

  private async fetchUserName(uid: string): Promise<string> {
    try {
      const userDoc = await getDoc(doc(this.firestore, 'users', uid));
      if (userDoc.exists()) {
        const data = userDoc.data();
        return (data['displayName'] ?? data['name'] ?? uid) as string;
      }
    } catch {
      // 無法取得，使用 uid 作為 fallback
    }
    return uid;
  }
}
