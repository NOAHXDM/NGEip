/**
 * RadarChartComponent（T025）
 *
 * 純 SVG 六角雷達圖元件
 *
 * 功能：
 *  - 6 軸六角形，每軸 60°，從 12 點鐘順時針
 *  - 5 層背景六角（scales: 0.2, 0.4, 0.6, 0.8, 1.0）灰色半透明
 *  - 6 條軸線從中心到最大值
 *  - 橘色虛線及格線（scale 6/10 = 0.6）
 *  - 半透明藍色資料六角形
 *  - 低於及格線的頂點顯示紅色警示圓點
 *  - 軸標籤：屬性代號 + 分數（小數兩位）
 */

import { Component, Input, OnChanges } from '@angular/core';
import { RadarAxis } from '../../models/evaluation.models';

interface Point {
  x: number;
  y: number;
}

@Component({
  selector: 'app-radar-chart',
  standalone: true,
  imports: [],
  template: `
    <svg
      [attr.viewBox]="'0 0 ' + size + ' ' + size"
      [attr.width]="size"
      [attr.height]="size"
      class="radar-chart"
      aria-label="六角雷達圖">

      @if (axes && axes.length > 0) {

        <!-- 背景層：5 個灰色六角形（scales 0.2, 0.4, 0.6, 0.8, 1.0） -->
        @for (scale of backgroundScales; track scale) {
          <polygon
            [attr.points]="getHexPoints(scale)"
            fill="none"
            stroke="#cccccc"
            stroke-width="1"
            opacity="0.6" />
        }

        <!-- 橘色虛線及格線（scale 0.6 = 6/10） -->
        <polygon
          [attr.points]="getHexPoints(passingScale)"
          fill="none"
          stroke="#FF8C00"
          stroke-width="1.5"
          stroke-dasharray="5,3"
          opacity="0.8" />

        <!-- 6 條軸線（從中心到邊緣） -->
        @for (axisPoint of maxPoints; track $index) {
          <line
            [attr.x1]="cx"
            [attr.y1]="cy"
            [attr.x2]="axisPoint.x"
            [attr.y2]="axisPoint.y"
            stroke="#aaaaaa"
            stroke-width="1" />
        }

        <!-- 資料六角形（半透明藍色） -->
        <polygon
          [attr.points]="dataPoints"
          fill="rgba(66, 133, 244, 0.25)"
          stroke="#4285F4"
          stroke-width="2" />

        <!-- 警示圓點（低於及格線的頂點，紅色） -->
        @if (showWarning) {
          @for (point of warningPoints; track $index) {
            <circle
              [attr.cx]="point.x"
              [attr.cy]="point.y"
              r="5"
              fill="#EA4335"
              class="warning-dot" />
          }
        }

        <!-- 軸標籤（屬性代號 + 分數） -->
        @for (label of axisLabels; track $index) {
          <text
            [attr.x]="label.x"
            [attr.y]="label.y"
            [attr.text-anchor]="label.anchor"
            [attr.dominant-baseline]="label.baseline"
            font-size="11"
            font-family="sans-serif"
            fill="#333333">
            {{ label.text }}
          </text>
        }

      } @else {
        <!-- 空狀態 -->
        <text
          [attr.x]="size / 2"
          [attr.y]="size / 2"
          text-anchor="middle"
          dominant-baseline="middle"
          font-size="13"
          fill="#999999">
          暫無資料
        </text>
      }
    </svg>
  `,
  styles: [`
    :host {
      display: inline-block;
    }
    .radar-chart {
      display: block;
    }
    .warning-dot {
      filter: drop-shadow(0 0 2px rgba(234, 67, 53, 0.5));
    }
  `],
})
export class RadarChartComponent implements OnChanges {
  @Input() axes: RadarAxis[] = [];
  @Input() maxValue: number = 10;
  @Input() size: number = 300;
  @Input() showWarning: boolean = true;

  /** 背景六角形的比例 */
  readonly backgroundScales = [0.2, 0.4, 0.6, 0.8, 1.0];

  /** 及格線比例（6/10 = 0.6） */
  get passingScale(): number {
    return 6 / this.maxValue;
  }

  /** 中心點 */
  get cx(): number {
    return this.size / 2;
  }

  get cy(): number {
    return this.size / 2;
  }

  /** 最大半徑（留一些 padding 給標籤） */
  get radius(): number {
    return this.size * 0.35;
  }

  /** 6 個最大點座標（用於畫軸線） */
  maxPoints: Point[] = [];

  /** 資料多邊形座標字串 */
  dataPoints: string = '';

  /** 警示圓點位置（低於及格線的頂點） */
  warningPoints: Point[] = [];

  /** 軸標籤 */
  axisLabels: { x: number; y: number; text: string; anchor: string; baseline: string }[] = [];

  ngOnChanges(): void {
    this.recalculate();
  }

  /**
   * 重新計算所有幾何資料
   */
  private recalculate(): void {
    if (!this.axes || this.axes.length === 0) {
      this.maxPoints = [];
      this.dataPoints = '';
      this.warningPoints = [];
      this.axisLabels = [];
      return;
    }

    const numAxes = 6; // 固定 6 軸
    this.maxPoints = [];
    const dataCoords: Point[] = [];
    this.warningPoints = [];
    this.axisLabels = [];

    for (let i = 0; i < numAxes; i++) {
      // 每軸 60°，從 12 點鐘（-90°）順時針
      const angle = (i * 60 - 90) * (Math.PI / 180);
      const maxX = this.cx + this.radius * Math.cos(angle);
      const maxY = this.cy + this.radius * Math.sin(angle);
      this.maxPoints.push({ x: maxX, y: maxY });

      // 資料點
      const axis = this.axes[i];
      if (axis) {
        const value = Math.max(0, Math.min(axis.value, this.maxValue));
        const scale = value / this.maxValue;
        const dataX = this.cx + this.radius * scale * Math.cos(angle);
        const dataY = this.cy + this.radius * scale * Math.sin(angle);
        dataCoords.push({ x: dataX, y: dataY });

        // 警示：低於及格線
        if (axis.value < axis.passingMark) {
          this.warningPoints.push({ x: dataX, y: dataY });
        }

        // 標籤位置（稍微超出最大半徑）
        const labelRadius = this.radius + 22;
        const labelX = this.cx + labelRadius * Math.cos(angle);
        const labelY = this.cy + labelRadius * Math.sin(angle);

        // 根據位置決定文字對齊
        let anchor = 'middle';
        let baseline = 'middle';

        const cosVal = Math.cos(angle);
        const sinVal = Math.sin(angle);

        if (cosVal > 0.1) anchor = 'start';
        else if (cosVal < -0.1) anchor = 'end';

        if (sinVal < -0.1) baseline = 'auto';
        else if (sinVal > 0.1) baseline = 'hanging';

        this.axisLabels.push({
          x: labelX,
          y: labelY,
          text: `${axis.key} ${axis.value.toFixed(2)}`,
          anchor,
          baseline,
        });
      }
    }

    this.dataPoints = dataCoords.map((p) => `${p.x},${p.y}`).join(' ');
  }

  /**
   * 產生六角形的 SVG points 字串
   * @param scale 比例（0–1）
   */
  getHexPoints(scale: number): string {
    const points: string[] = [];
    for (let i = 0; i < 6; i++) {
      const angle = (i * 60 - 90) * (Math.PI / 180);
      const x = this.cx + this.radius * scale * Math.cos(angle);
      const y = this.cy + this.radius * scale * Math.sin(angle);
      points.push(`${x},${y}`);
    }
    return points.join(' ');
  }
}
