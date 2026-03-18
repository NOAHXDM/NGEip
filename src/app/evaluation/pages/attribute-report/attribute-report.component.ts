/**
 * AttributeReportComponent（T029）
 *
 * 受評者個人職場屬性報告頁面。
 * 路由：/evaluation/my-report
 *
 * 功能：
 *  - 頂部 MarqueeCommentsComponent（顯示本週期的 overallComments）
 *  - 週期選擇器 MatSelect（切換後跑馬燈同步更新）
 *  - FR-015：評核人數不足警示（validEvaluatorCount < 3）
 *  - 基本資訊卡：CareerArchetypeBadgeComponent、totalScore、validEvaluatorCount
 *  - RadarChartComponent（6 軸分數，小數兩位）
 *  - FR-017：職等及格行為標準說明（依 jobRank J/M/S）
 *  - TrendLineChartComponent（歷史折線圖）
 *  - 「最終結果尚未發布」banner（status=preview 時）
 *  - 空狀態（無快照資料）
 */

import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatCardModule } from '@angular/material/card';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';

import {
  AttributeKey,
  PeriodDataPoint,
  RadarAxis,
  UserAttributeSnapshot,
} from '../../models/evaluation.models';
import { UserAttributeSnapshotService } from '../../services/user-attribute-snapshot.service';
import { RadarChartComponent } from '../../components/radar-chart/radar-chart.component';
import { TrendLineChartComponent } from '../../components/trend-line-chart/trend-line-chart.component';
import { MarqueeCommentsComponent } from '../../components/marquee-comments/marquee-comments.component';
import { CareerArchetypeBadgeComponent } from '../../components/career-archetype-badge/career-archetype-badge.component';

// ── 職等及格說明 ──────────────────────────────────────────────────────────────

const JOB_RANK_DESCRIPTIONS: Record<string, { title: string; description: string }> = {
  J: {
    title: '初階（J）達標說明',
    description:
      '初階員工的基本達標標準：各屬性分數平均達 6 分以上（及格線），能在指導下完成日常工作任務，' +
      '具備基礎溝通與協作能力。建議持續精進技術深度與主動性，以達成中階晉升條件。',
  },
  M: {
    title: '中階（M）達標說明',
    description:
      '中階員工達標標準：六大屬性整體均衡，核心屬性（EXE、COL）建議達 7 分以上。' +
      '具備獨立解決問題的能力，能帶領小組協作並主動分享知識。' +
      '如有 2 項以上屬性低於 6 分，建議制定個人成長計畫。',
  },
  S: {
    title: '資深（S）達標說明',
    description:
      '資深員工達標標準：六大屬性全面均衡且高標，多數屬性應達 7.5 分以上。' +
      '能在組織層面發揮影響力，主導跨部門協作，並具備創新思維與策略洞察力。' +
      '建議以「勇者 Hero」原型為長期目標（全屬性 ≥ 8）。',
  },
};

// ── 屬性 key → 中文標籤 ───────────────────────────────────────────────────────

const ATTRIBUTE_DISPLAY: Record<AttributeKey, string> = {
  EXE: '執行力',
  INS: '洞察力',
  ADP: '應變力',
  COL: '協作力',
  STB: '穩定力',
  INN: '創新力',
};

const ATTRIBUTE_KEYS: AttributeKey[] = ['EXE', 'INS', 'ADP', 'COL', 'STB', 'INN'];

// ── 元件 ──────────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-attribute-report',
  standalone: true,
  imports: [
    MatCardModule,
    MatSelectModule,
    MatFormFieldModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatDividerModule,
    RadarChartComponent,
    TrendLineChartComponent,
    MarqueeCommentsComponent,
    CareerArchetypeBadgeComponent,
  ],
  template: `
    <div class="page-container">

      <!-- 頁面標題 -->
      <div class="page-header">
        <h1 class="page-title">
          <mat-icon class="title-icon">insights</mat-icon>
          我的職場屬性報告
        </h1>
      </div>

      <!-- 載入中 -->
      @if (isLoading()) {
        <div class="loading-state">
          <mat-spinner diameter="48"></mat-spinner>
          <p>載入報告資料中…</p>
        </div>
      } @else if (!hasSnapshots()) {

        <!-- 空狀態：尚無考核歷史資料 -->
        <mat-card class="empty-state-card">
          <mat-card-content>
            <div class="empty-state">
              <mat-icon class="empty-icon">bar_chart</mat-icon>
              <p class="empty-title">尚無考核歷史資料，您的屬性報告將在第一次考核結束後顯示。</p>
            </div>
          </mat-card-content>
        </mat-card>

      } @else {

        <!-- 跑馬燈：顯示本週期的 overallComments -->
        <div class="marquee-section">
          <app-marquee-comments [comments]="currentComments()" />
        </div>

        <!-- 週期選擇器 -->
        <div class="cycle-selector-section">
          <mat-form-field appearance="outline" class="cycle-selector">
            <mat-label>選擇考核週期</mat-label>
            <mat-select
              [value]="selectedCycleId()"
              (selectionChange)="onCycleChange($event.value)">
              @for (snapshot of allSnapshots(); track snapshot.cycleId) {
                <mat-option [value]="snapshot.cycleId">
                  {{ snapshot.cycleId }}
                  @if (snapshot.status === 'final') {
                    （已發布）
                  } @else {
                    （預覽）
                  }
                </mat-option>
              }
            </mat-select>
          </mat-form-field>
        </div>

        @if (currentSnapshot()) {

          <!-- preview 狀態 banner -->
          @if (currentSnapshot()!.status === 'preview') {
            <div class="status-banner preview-banner">
              <mat-icon>warning</mat-icon>
              <span>最終結果尚未發布，目前顯示為預覽資料</span>
            </div>
          }

          <!-- FR-015：評核人數不足警示 -->
          @if (currentSnapshot()!.validEvaluatorCount < 3) {
            <div class="status-banner warning-banner">
              <mat-icon>info</mat-icon>
              <span>
                評核人數不足（{{ currentSnapshot()!.validEvaluatorCount }} 人），結果僅供參考
              </span>
            </div>
          }

          <!-- 基本資訊卡 -->
          <mat-card class="info-card">
            <mat-card-header>
              <mat-card-title>本期概覽</mat-card-title>
            </mat-card-header>
            <mat-card-content>
              <div class="info-grid">
                <div class="info-item">
                  <span class="info-label">職業原型</span>
                  <app-career-archetype-badge
                    [archetypes]="currentSnapshot()!.careerArchetypes" />
                </div>
                <div class="info-item">
                  <span class="info-label">綜合總分</span>
                  <span class="total-score">{{ safeScore(currentSnapshot()!.totalScore) }}</span>
                  <span class="total-score-max">/ 60</span>
                </div>
                <div class="info-item">
                  <span class="info-label">有效評核人數</span>
                  <span class="evaluator-count">{{ currentSnapshot()!.validEvaluatorCount }} 人</span>
                </div>
              </div>
            </mat-card-content>
          </mat-card>

          <!-- 雷達圖區域 -->
          <mat-card class="chart-card radar-card">
            <mat-card-header>
              <mat-card-title>六大職場屬性雷達圖</mat-card-title>
              <mat-card-subtitle>及格線（橘色虛線）= 6 分；紅色圓點 = 低於及格</mat-card-subtitle>
            </mat-card-header>
            <mat-card-content class="radar-content">
              <app-radar-chart
                [axes]="currentRadarAxes()"
                [maxValue]="10"
                [size]="320"
                [showWarning]="true" />

              <!-- 屬性分數明細 -->
              <div class="attribute-details">
                @for (key of attributeKeys; track key) {
                  <div class="attribute-row">
                    <span class="attr-key">{{ key }}</span>
                    <span class="attr-label">{{ getAttributeLabel(key) }}</span>
                    <span class="attr-score"
                      [class.below-passing]="safeNum(currentSnapshot()!.attributes[key]) < 6">
                      {{ safeScore(currentSnapshot()!.attributes[key]) }}
                    </span>
                  </div>
                }
              </div>
            </mat-card-content>
          </mat-card>

          <!-- FR-017：職等達標說明 -->
          <mat-card class="chart-card rank-card">
            <mat-card-header>
              <mat-card-title>職等達標行為標準</mat-card-title>
            </mat-card-header>
            <mat-card-content>
              @if (rankDescription()) {
                <div class="rank-description">
                  <h3 class="rank-title">{{ rankDescription()!.title }}</h3>
                  <p class="rank-desc">{{ rankDescription()!.description }}</p>
                </div>
              } @else {
                <p class="rank-not-set">職等未設定，無法顯示達標說明</p>
              }
            </mat-card-content>
          </mat-card>

        }

        <!-- 跨週期趨勢折線圖 -->
        @if (trendData().length > 0) {
          <mat-card class="chart-card trend-card">
            <mat-card-header>
              <mat-card-title>歷史成長趨勢</mat-card-title>
              <mat-card-subtitle>各週期六大屬性分數變化</mat-card-subtitle>
            </mat-card-header>
            <mat-card-content>
              <app-trend-line-chart
                [data]="trendData()"
                [width]="560"
                [height]="280"
                [selectedCycleLabel]="selectedCycleId() ?? ''" />
            </mat-card-content>
          </mat-card>
        }
      }
    </div>
  `,
  styles: [`
    :host {
      display: block;
    }

    .page-container {
      max-width: 900px;
      margin: 0 auto;
      padding: 24px 16px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .page-header {
      margin-bottom: 8px;
    }

    .page-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 24px;
      font-weight: 500;
      margin: 0;
      color: #1a1a1a;
    }

    .title-icon {
      font-size: 28px;
      height: 28px;
      width: 28px;
      color: #4285F4;
    }

    .loading-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      padding: 48px;
      color: #666;
    }

    .empty-state-card {
      margin: 24px 0;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 32px;
      gap: 8px;
      color: #666;
    }

    .empty-icon {
      font-size: 48px;
      height: 48px;
      width: 48px;
      color: #ccc;
    }

    .empty-title {
      font-size: 18px;
      font-weight: 500;
      margin: 0;
    }

    .empty-desc {
      font-size: 14px;
      color: #999;
      margin: 0;
    }

    .marquee-section {
      border-radius: 8px;
      overflow: hidden;
    }

    .cycle-selector-section {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .cycle-selector {
      min-width: 240px;
    }

    .status-banner {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 16px;
      border-radius: 6px;
      font-size: 14px;

      mat-icon {
        font-size: 18px;
        height: 18px;
        width: 18px;
      }
    }

    .preview-banner {
      background-color: #FFF8E1;
      color: #E65100;
      border: 1px solid #FFE0B2;
    }

    .warning-banner {
      background-color: #FFF3E0;
      color: #BF360C;
      border: 1px solid #FFCCBC;
    }

    .info-card mat-card-content {
      padding-top: 8px;
    }

    .info-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 24px;
    }

    .info-item {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .info-label {
      font-size: 12px;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .total-score {
      font-size: 28px;
      font-weight: 700;
      color: #1A73E8;
    }

    .total-score-max {
      font-size: 14px;
      color: #999;
    }

    .evaluator-count {
      font-size: 18px;
      font-weight: 500;
      color: #333;
    }

    .chart-card mat-card-content {
      padding-top: 8px;
    }

    .radar-content {
      display: flex;
      flex-wrap: wrap;
      gap: 24px;
      align-items: flex-start;
    }

    .attribute-details {
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-width: 200px;
    }

    .attribute-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .attr-key {
      font-weight: 700;
      font-size: 13px;
      color: #555;
      min-width: 36px;
    }

    .attr-label {
      font-size: 13px;
      color: #666;
      flex: 1;
    }

    .attr-score {
      font-size: 14px;
      font-weight: 500;
      color: #333;
      min-width: 40px;
      text-align: right;
    }

    .attr-score.below-passing {
      color: #EA4335;
    }

    .rank-description {
      padding: 4px 0;
    }

    .rank-title {
      font-size: 16px;
      font-weight: 600;
      color: #333;
      margin: 0 0 8px;
    }

    .rank-desc {
      font-size: 14px;
      color: #555;
      line-height: 1.7;
      margin: 0;
    }

    .rank-not-set {
      font-size: 14px;
      color: #999;
      font-style: italic;
    }

    .trend-card mat-card-content {
      overflow-x: auto;
    }
  `],
})
export class AttributeReportComponent implements OnInit {
  private readonly snapshotService = inject(UserAttributeSnapshotService);

  readonly attributeKeys = ATTRIBUTE_KEYS;

  // ── 狀態 ──────────────────────────────────────────────────────────────────

  isLoading = signal(true);
  selectedCycleId = signal<string | null>(null);

  // ── 快照資料（來自 service） ──────────────────────────────────────────────

  private readonly snapshots$ = this.snapshotService.getMySnapshots();
  allSnapshots = toSignal(this.snapshots$, { initialValue: [] as UserAttributeSnapshot[] });

  // ── 衍生計算值 ────────────────────────────────────────────────────────────

  hasSnapshots = computed(() => this.allSnapshots().length > 0);

  /** 目前選中的快照 */
  currentSnapshot = computed<UserAttributeSnapshot | null>(() => {
    const cycleId = this.selectedCycleId();
    if (!cycleId) return null;
    return this.allSnapshots().find((s) => s.cycleId === cycleId) ?? null;
  });

  /** 目前跑馬燈評語 */
  currentComments = computed<string[]>(() => {
    const snapshot = this.currentSnapshot();
    if (!snapshot) return [];
    return snapshot.overallComments ?? [];
  });

  /** 目前雷達圖 axes */
  currentRadarAxes = computed<RadarAxis[]>(() => {
    const snapshot = this.currentSnapshot();
    if (!snapshot) return [];

    return ATTRIBUTE_KEYS.map((key) => ({
      key,
      label: `${key} ${ATTRIBUTE_DISPLAY[key]}`,
      value: snapshot.attributes?.[key] ?? 0,
      passingMark: 6,
    }));
  });

  /** 歷史趨勢資料 */
  trendData = computed<PeriodDataPoint[]>(() => {
    const snapshots = [...this.allSnapshots()].reverse(); // 由舊到新
    return snapshots.map((s) => ({
      cycleLabel: s.cycleId,
      scores: s.attributes ?? { EXE: 0, INS: 0, ADP: 0, COL: 0, STB: 0, INN: 0 },
    }));
  });

  /** 職等達標說明 */
  rankDescription = computed(() => {
    const snapshot = this.currentSnapshot();
    if (!snapshot) return null;
    const rank = snapshot.jobRank;
    return JOB_RANK_DESCRIPTIONS[rank] ?? null;
  });

  // ── 生命週期 ──────────────────────────────────────────────────────────────

  ngOnInit(): void {
    // 監聽快照，自動選擇最新週期
    this.snapshots$.subscribe((snapshots) => {
      this.isLoading.set(false);
      if (snapshots.length > 0 && !this.selectedCycleId()) {
        this.selectedCycleId.set(snapshots[0].cycleId);
      }
    });
  }

  // ── 事件處理 ──────────────────────────────────────────────────────────────

  onCycleChange(cycleId: string): void {
    this.selectedCycleId.set(cycleId);
  }

  getAttributeLabel(key: AttributeKey): string {
    return ATTRIBUTE_DISPLAY[key];
  }

  /** Firestore 文件欄位可能缺失，提供 runtime 安全的 toFixed(2) */
  safeScore(value: number | undefined | null): string {
    return (value ?? 0).toFixed(2);
  }

  safeNum(value: number | undefined | null): number {
    return value ?? 0;
  }
}
