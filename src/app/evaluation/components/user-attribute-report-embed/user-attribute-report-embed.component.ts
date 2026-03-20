/**
 * UserAttributeReportEmbedComponent
 *
 * 可嵌入版本的職場屬性報告，供管理者在 UserProfileDialog 中檢視指定使用者的報告。
 * 接受 userId 作為 Input，直接查詢該使用者的快照資料。
 */

import { Component, Input, OnInit, computed, inject, signal } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';

import {
  AttributeKey,
  AttributeScores,
  PeriodDataPoint,
  RadarAxis,
  UserAttributeSnapshot,
} from '../../models/evaluation.models';
import { UserAttributeSnapshotService } from '../../services/user-attribute-snapshot.service';
import { RadarChartComponent } from '../radar-chart/radar-chart.component';
import { TrendLineChartComponent } from '../trend-line-chart/trend-line-chart.component';
import { MarqueeCommentsComponent } from '../marquee-comments/marquee-comments.component';
import { CareerArchetypeBadgeComponent } from '../career-archetype-badge/career-archetype-badge.component';

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

const ATTRIBUTE_DISPLAY: Record<AttributeKey, string> = {
  EXE: '執行力',
  INS: '洞察力',
  ADP: '應變力',
  COL: '協作力',
  STB: '穩定力',
  INN: '創新力',
};

const ATTRIBUTE_KEYS: AttributeKey[] = ['EXE', 'INS', 'ADP', 'COL', 'STB', 'INN'];

@Component({
  selector: 'app-user-attribute-report-embed',
  standalone: true,
  imports: [
    MatCardModule,
    MatSelectModule,
    MatFormFieldModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatDividerModule,
    MatSlideToggleModule,
    RadarChartComponent,
    TrendLineChartComponent,
    MarqueeCommentsComponent,
    CareerArchetypeBadgeComponent,
  ],
  template: `
    <div class="embed-container">

      @if (isLoading()) {
        <div class="loading-state">
          <mat-spinner diameter="40"></mat-spinner>
          <p>載入報告資料中…</p>
        </div>
      } @else if (!hasSnapshots()) {
        <mat-card class="empty-state-card">
          <mat-card-content>
            <div class="empty-state">
              <mat-icon class="empty-icon">bar_chart</mat-icon>
              <p class="empty-title">尚無考核歷史資料，屬性報告將在第一次考核結束後顯示。</p>
            </div>
          </mat-card-content>
        </mat-card>
      } @else {

        <!-- 跑馬燈 -->
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

          @if (currentSnapshot()!.status === 'preview') {
            <div class="status-banner preview-banner">
              <mat-icon>warning</mat-icon>
              <span>最終結果尚未發布，目前顯示為預覽資料</span>
            </div>
          }

          @if (currentSnapshot()!.validEvaluatorCount < 5) {
            <div class="status-banner warning-banner">
              <mat-icon>info</mat-icon>
              <span>
                評核人數不足（{{ currentSnapshot()!.validEvaluatorCount }} 人），結果僅供參考
              </span>
            </div>
          }

          <!-- 分數模式切換 -->
          <div class="score-mode-toggle">
            <mat-slide-toggle
              [checked]="showRawScores()"
              (change)="showRawScores.set($event.checked)">
              {{ showRawScores() ? '顯示加總平均分數（原始）' : '顯示 Z-score 校正分數' }}
            </mat-slide-toggle>
            @if (showRawScores() && !hasRawData()) {
              <span class="no-raw-hint">⚠ 此週期尚無加總平均分數資料，請聯繫管理者進行結算</span>
            }
          </div>

          <!-- 基本資訊卡 -->
          <mat-card class="info-card">
            <mat-card-header>
              <mat-card-title>本期概覽{{ showRawScores() ? '（加總平均）' : '（Z-score 校正）' }}</mat-card-title>
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
                  <span class="total-score">{{ safeScore(displayTotalScore()) }}</span>
                  <span class="total-score-max">/ 60</span>
                </div>
                <div class="info-item">
                  <span class="info-label">有效評核人數</span>
                  <span class="evaluator-count">{{ currentSnapshot()!.validEvaluatorCount }} 人</span>
                </div>
              </div>
            </mat-card-content>
          </mat-card>

          <!-- 雷達圖 -->
          <mat-card class="chart-card radar-card">
            <mat-card-header>
              <mat-card-title>六大職場屬性雷達圖{{ showRawScores() ? '（加總平均）' : '' }}</mat-card-title>
              <mat-card-subtitle>及格線（橘色虛線）= 6 分；紅色圓點 = 低於及格</mat-card-subtitle>
            </mat-card-header>
            <mat-card-content class="radar-content">
              <app-radar-chart
                [axes]="currentRadarAxes()"
                [maxValue]="10"
                [size]="300"
                [showWarning]="true" />
              <div class="attribute-details">
                @for (key of attributeKeys; track key) {
                  <div class="attribute-row">
                    <span class="attr-key">{{ key }}</span>
                    <span class="attr-label">{{ getAttributeLabel(key) }}</span>
                    <span class="attr-score"
                      [class.below-passing]="safeNum(displayAttributes()[key]) < 6">
                      {{ safeScore(displayAttributes()[key]) }}
                    </span>
                  </div>
                }
              </div>
            </mat-card-content>
          </mat-card>

          <!-- 職等達標說明 -->
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
              <mat-card-title>歷史成長趨勢{{ showRawScores() ? '（加總平均）' : '' }}</mat-card-title>
              <mat-card-subtitle>各週期六大屬性分數變化</mat-card-subtitle>
            </mat-card-header>
            <mat-card-content>
              <app-trend-line-chart
                [data]="trendData()"
                [width]="520"
                [height]="260"
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

    .embed-container {
      padding: 16px 8px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .loading-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      padding: 32px;
      color: #666;
    }

    .empty-state-card {
      margin: 16px 0;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 24px;
      gap: 8px;
      color: #666;
    }

    .empty-icon {
      font-size: 40px;
      height: 40px;
      width: 40px;
      color: #ccc;
    }

    .empty-title {
      font-size: 16px;
      font-weight: 500;
      margin: 0;
      text-align: center;
    }

    .marquee-section {
      border-radius: 8px;
      overflow: hidden;
    }

    .cycle-selector-section {
      display: flex;
      align-items: center;
    }

    .cycle-selector {
      min-width: 220px;
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

    .info-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 24px;
      padding-top: 8px;
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
      font-size: 26px;
      font-weight: 700;
      color: #1A73E8;
    }

    .total-score-max {
      font-size: 13px;
      color: #999;
    }

    .evaluator-count {
      font-size: 16px;
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
      min-width: 180px;
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

    .score-mode-toggle {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }

    .no-raw-hint {
      font-size: 12px;
      color: #E65100;
    }

    .trend-card mat-card-content {
      overflow-x: auto;
    }
  `],
})
export class UserAttributeReportEmbedComponent implements OnInit {
  @Input({ required: true }) userId!: string;

  private readonly snapshotService = inject(UserAttributeSnapshotService);

  readonly attributeKeys = ATTRIBUTE_KEYS;

  isLoading = signal(true);
  selectedCycleId = signal<string | null>(null);
  showRawScores = signal(false);
  allSnapshots = signal<UserAttributeSnapshot[]>([]);

  hasSnapshots = computed(() => this.allSnapshots().length > 0);

  currentSnapshot = computed<UserAttributeSnapshot | null>(() => {
    const cycleId = this.selectedCycleId();
    if (!cycleId) return null;
    return this.allSnapshots().find((s) => s.cycleId === cycleId) ?? null;
  });

  currentComments = computed<string[]>(() => {
    return this.currentSnapshot()?.overallComments ?? [];
  });

  /** 是否有原始加總平均分數資料 */
  hasRawData = computed<boolean>(() => {
    const snapshot = this.currentSnapshot();
    if (!snapshot) return false;
    return !!snapshot.rawAttributes;
  });

  /** 目前顯示的屬性分數（依 toggle 切換） */
  displayAttributes = computed<AttributeScores>(() => {
    const snapshot = this.currentSnapshot();
    if (!snapshot) return { EXE: 0, INS: 0, ADP: 0, COL: 0, STB: 0, INN: 0 };
    if (this.showRawScores() && snapshot.rawAttributes) {
      return snapshot.rawAttributes;
    }
    return snapshot.attributes ?? { EXE: 0, INS: 0, ADP: 0, COL: 0, STB: 0, INN: 0 };
  });

  /** 目前顯示的總分（依 toggle 切換） */
  displayTotalScore = computed<number>(() => {
    const snapshot = this.currentSnapshot();
    if (!snapshot) return 0;
    if (this.showRawScores() && snapshot.rawTotalScore != null) {
      return snapshot.rawTotalScore;
    }
    return snapshot.totalScore ?? 0;
  });

  currentRadarAxes = computed<RadarAxis[]>(() => {
    const snapshot = this.currentSnapshot();
    if (!snapshot) return [];
    const attrs = this.displayAttributes();
    return ATTRIBUTE_KEYS.map((key) => ({
      key,
      label: `${key} ${ATTRIBUTE_DISPLAY[key]}`,
      value: attrs[key] ?? 0,
      passingMark: 6,
    }));
  });

  trendData = computed<PeriodDataPoint[]>(() => {
    const useRaw = this.showRawScores();
    return [...this.allSnapshots()].reverse().map((s) => ({
      cycleLabel: s.cycleId,
      scores: (useRaw && s.rawAttributes)
        ? s.rawAttributes
        : (s.attributes ?? { EXE: 0, INS: 0, ADP: 0, COL: 0, STB: 0, INN: 0 }),
    }));
  });

  rankDescription = computed(() => {
    const rank = this.currentSnapshot()?.jobRank;
    if (!rank) return null;
    return JOB_RANK_DESCRIPTIONS[rank] ?? null;
  });

  ngOnInit(): void {
    this.snapshotService.getSnapshotsByUserId(this.userId).subscribe((snapshots) => {
      this.isLoading.set(false);
      this.allSnapshots.set(snapshots);
      if (snapshots.length > 0 && !this.selectedCycleId()) {
        this.selectedCycleId.set(snapshots[0].cycleId);
      }
    });
  }

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
