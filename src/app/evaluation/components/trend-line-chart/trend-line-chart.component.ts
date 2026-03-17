/**
 * TrendLineChartComponent（T026）
 *
 * 純 SVG 趨勢折線圖元件
 *
 * 功能：
 *  - X 軸：週期標籤
 *  - Y 軸：0–10 刻度，含水平格線
 *  - 6 條彩色折線（EXE/INS/ADP/COL/STB/INN）
 *  - 選中週期以垂直虛線高亮
 *  - 圖例顯示屬性名稱與顏色
 *  - 空狀態處理
 */

import { Component, Input, OnChanges } from '@angular/core';
import { PeriodDataPoint, AttributeKey } from '../../models/evaluation.models';

/** 六大屬性顏色配置 */
const ATTRIBUTE_COLORS: Record<AttributeKey, string> = {
  EXE: '#4285F4', // 藍
  INS: '#EA4335', // 紅
  ADP: '#FBBC05', // 黃
  COL: '#34A853', // 綠
  STB: '#9C27B0', // 紫
  INN: '#FF5722', // 橘
};

/** 六大屬性中文名稱 */
const ATTRIBUTE_LABELS: Record<AttributeKey, string> = {
  EXE: '執行力',
  INS: '洞察力',
  ADP: '應變力',
  COL: '協作力',
  STB: '穩定力',
  INN: '創新力',
};

const ATTRIBUTE_KEYS: AttributeKey[] = ['EXE', 'INS', 'ADP', 'COL', 'STB', 'INN'];

interface ChartLine {
  key: AttributeKey;
  color: string;
  label: string;
  points: string;
}

@Component({
  selector: 'app-trend-line-chart',
  standalone: true,
  imports: [],
  template: `
    @if (data && data.length > 0) {
      <div class="trend-chart-container">
        <svg
          [attr.width]="width"
          [attr.height]="chartHeight"
          [attr.viewBox]="'0 0 ' + width + ' ' + chartHeight"
          class="trend-chart"
          aria-label="歷史趨勢折線圖">

          <!-- Y 軸格線與刻度 -->
          @for (tick of yTicks; track tick) {
            <line
              [attr.x1]="paddingLeft"
              [attr.y1]="getYPos(tick)"
              [attr.x2]="paddingLeft + plotWidth"
              [attr.y2]="getYPos(tick)"
              stroke="#eeeeee"
              stroke-width="1" />
            <text
              [attr.x]="paddingLeft - 6"
              [attr.y]="getYPos(tick)"
              text-anchor="end"
              dominant-baseline="middle"
              font-size="10"
              fill="#666666">
              {{ tick }}
            </text>
          }

          <!-- Y 軸線 -->
          <line
            [attr.x1]="paddingLeft"
            [attr.y1]="paddingTop"
            [attr.x2]="paddingLeft"
            [attr.y2]="paddingTop + plotHeight"
            stroke="#cccccc"
            stroke-width="1" />

          <!-- X 軸線 -->
          <line
            [attr.x1]="paddingLeft"
            [attr.y1]="paddingTop + plotHeight"
            [attr.x2]="paddingLeft + plotWidth"
            [attr.y2]="paddingTop + plotHeight"
            stroke="#cccccc"
            stroke-width="1" />

          <!-- X 軸標籤 -->
          @for (item of data; track $index) {
            <text
              [attr.x]="getXPos($index)"
              [attr.y]="paddingTop + plotHeight + 16"
              text-anchor="middle"
              font-size="10"
              fill="#666666">
              {{ item.cycleLabel }}
            </text>
          }

          <!-- 選中週期垂直虛線 -->
          @if (selectedCycleIndex >= 0) {
            <line
              [attr.x1]="getXPos(selectedCycleIndex)"
              [attr.y1]="paddingTop"
              [attr.x2]="getXPos(selectedCycleIndex)"
              [attr.y2]="paddingTop + plotHeight"
              stroke="#FF8C00"
              stroke-width="1.5"
              stroke-dasharray="4,3"
              opacity="0.8" />
          }

          <!-- 六條屬性折線 -->
          @for (line of chartLines; track line.key) {
            <polyline
              [attr.points]="line.points"
              [attr.stroke]="line.color"
              stroke-width="2"
              fill="none"
              stroke-linejoin="round"
              stroke-linecap="round" />

            <!-- 資料點圓點 -->
            @for (item of data; track $index) {
              <circle
                [attr.cx]="getXPos($index)"
                [attr.cy]="getYPos(item.scores[line.key])"
                r="3"
                [attr.fill]="line.color" />
            }
          }
        </svg>

        <!-- 圖例 -->
        <div class="legend">
          @for (key of attributeKeys; track key) {
            <div class="legend-item">
              <span class="legend-color" [style.background-color]="getColor(key)"></span>
              <span class="legend-label">{{ getLabel(key) }}</span>
            </div>
          }
        </div>
      </div>
    } @else {
      <div class="empty-state">
        <p>尚無歷史趨勢資料</p>
      </div>
    }
  `,
  styles: [`
    :host {
      display: block;
    }
    .trend-chart-container {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .trend-chart {
      display: block;
      overflow: visible;
    }
    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      padding: 0 8px;
    }
    .legend-item {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 12px;
    }
    .legend-color {
      display: inline-block;
      width: 12px;
      height: 12px;
      border-radius: 2px;
    }
    .legend-label {
      color: #555;
    }
    .empty-state {
      text-align: center;
      color: #999;
      padding: 24px;
      font-size: 14px;
    }
  `],
})
export class TrendLineChartComponent implements OnChanges {
  @Input() data: PeriodDataPoint[] = [];
  @Input() width: number = 600;
  @Input() height: number = 300;
  @Input() selectedCycleLabel?: string;

  readonly attributeKeys = ATTRIBUTE_KEYS;

  /** 內邊距 */
  readonly paddingLeft = 36;
  readonly paddingTop = 16;
  readonly paddingBottom = 32;
  readonly paddingRight = 16;

  chartLines: ChartLine[] = [];
  selectedCycleIndex: number = -1;

  get chartHeight(): number {
    return this.height;
  }

  get plotWidth(): number {
    return this.width - this.paddingLeft - this.paddingRight;
  }

  get plotHeight(): number {
    return this.height - this.paddingTop - this.paddingBottom;
  }

  /** Y 軸刻度（0, 2, 4, 6, 8, 10） */
  readonly yTicks = [0, 2, 4, 6, 8, 10];

  ngOnChanges(): void {
    this.recalculate();
  }

  /** 將 score（0–10）轉換為 SVG Y 座標 */
  getYPos(score: number): number {
    const clampedScore = Math.max(0, Math.min(score, 10));
    return this.paddingTop + this.plotHeight * (1 - clampedScore / 10);
  }

  /** 將資料點索引轉換為 SVG X 座標 */
  getXPos(index: number): number {
    if (!this.data || this.data.length <= 1) {
      return this.paddingLeft + this.plotWidth / 2;
    }
    return this.paddingLeft + (index / (this.data.length - 1)) * this.plotWidth;
  }

  getColor(key: AttributeKey): string {
    return ATTRIBUTE_COLORS[key];
  }

  getLabel(key: AttributeKey): string {
    return `${key} ${ATTRIBUTE_LABELS[key]}`;
  }

  private recalculate(): void {
    if (!this.data || this.data.length === 0) {
      this.chartLines = [];
      this.selectedCycleIndex = -1;
      return;
    }

    // 找出選中週期索引
    this.selectedCycleIndex = this.selectedCycleLabel
      ? this.data.findIndex((d) => d.cycleLabel === this.selectedCycleLabel)
      : -1;

    // 為每個屬性建立折線資料
    this.chartLines = ATTRIBUTE_KEYS.map((key) => {
      const points = this.data
        .map((item, i) => `${this.getXPos(i)},${this.getYPos(item.scores[key])}`)
        .join(' ');

      return {
        key,
        color: ATTRIBUTE_COLORS[key],
        label: ATTRIBUTE_LABELS[key],
        points,
      };
    });
  }
}
