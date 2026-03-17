/**
 * RadarChartComponent 單元測試（T022）
 *
 * 測試案例：
 *  1. 6 軸幾何座標計算正確（每軸 60°，從 12 點鐘順時針）
 *  2. 分數低於及格線時 warningPoints 有資料
 *  3. 空 axes 不崩潰（不產生警示點、資料點字串為空）
 *  4. maxValue 邊界（value 超過 maxValue 時 clamp 到 maxValue）
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RadarChartComponent } from './radar-chart.component';
import { RadarAxis } from '../../models/evaluation.models';

// =====================
// 測試輔助工具
// =====================

/** 建立預設的 6 個雷達軸 */
function makeAxes(overrides: Partial<RadarAxis>[] = []): RadarAxis[] {
  const keys: RadarAxis['key'][] = ['EXE', 'INS', 'ADP', 'COL', 'STB', 'INN'];
  return keys.map((key, i) => ({
    key,
    label: `${key} 屬性`,
    value: overrides[i]?.value ?? 7,
    passingMark: overrides[i]?.passingMark ?? 6,
  }));
}

/** 期望兩個浮點數在容差範圍內相等 */
function expectClose(actual: number, expected: number, tolerance = 0.01): void {
  expect(Math.abs(actual - expected)).toBeLessThan(tolerance);
}

// =====================
// 測試套件
// =====================

describe('RadarChartComponent', () => {
  let component: RadarChartComponent;
  let fixture: ComponentFixture<RadarChartComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RadarChartComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(RadarChartComponent);
    component = fixture.componentInstance;
  });

  // =====================
  // 測試 1：6 軸幾何座標計算正確
  // =====================

  describe('6 軸幾何座標計算', () => {
    beforeEach(() => {
      component.axes = makeAxes();
      component.maxValue = 10;
      component.size = 300;
      component.ngOnChanges(); // 直接觸發 recalculate（Angular 測試中直接設 @Input 不觸發 ngOnChanges）
      fixture.detectChanges();
    });

    it('應產生 6 個最大點座標', () => {
      expect(component.maxPoints.length).toBe(6);
    });

    it('第 0 軸（12 點鐘，-90°）的最大點應在中心正上方', () => {
      const point = component.maxPoints[0];
      const cx = component.cx;
      const cy = component.cy;
      const r = component.radius;

      // angle = (0 * 60 - 90) * π/180 = -π/2
      // x = cx + r * cos(-π/2) = cx + r * 0 = cx
      // y = cy + r * sin(-π/2) = cy - r
      expectClose(point.x, cx);
      expectClose(point.y, cy - r);
    });

    it('第 1 軸（60° from 12 o\'clock）的最大點應在右上方', () => {
      const point = component.maxPoints[1];
      const cx = component.cx;
      const cy = component.cy;
      const r = component.radius;

      // angle = (1 * 60 - 90) * π/180 = -30° = -π/6
      // x = cx + r * cos(-π/6) = cx + r * (√3/2)
      // y = cy + r * sin(-π/6) = cy - r * 0.5
      expectClose(point.x, cx + r * Math.cos(-Math.PI / 6));
      expectClose(point.y, cy + r * Math.sin(-Math.PI / 6));
    });

    it('第 3 軸（180° from 12 o\'clock）的最大點應在中心正下方', () => {
      const point = component.maxPoints[3];
      const cx = component.cx;
      const cy = component.cy;
      const r = component.radius;

      // angle = (3 * 60 - 90) * π/180 = 90° = π/2
      // x = cx + r * cos(π/2) = cx
      // y = cy + r * sin(π/2) = cy + r
      expectClose(point.x, cx);
      expectClose(point.y, cy + r);
    });

    it('六個軸最大點距中心的距離應等於 radius', () => {
      const cx = component.cx;
      const cy = component.cy;
      const r = component.radius;

      for (const point of component.maxPoints) {
        const dist = Math.sqrt(Math.pow(point.x - cx, 2) + Math.pow(point.y - cy, 2));
        expectClose(dist, r);
      }
    });

    it('相鄰軸之間的夾角應為 60°', () => {
      const cx = component.cx;
      const cy = component.cy;

      for (let i = 0; i < 6; i++) {
        const p1 = component.maxPoints[i];
        const p2 = component.maxPoints[(i + 1) % 6];

        const angle1 = Math.atan2(p1.y - cy, p1.x - cx);
        const angle2 = Math.atan2(p2.y - cy, p2.x - cx);

        let diff = ((angle2 - angle1) * 180) / Math.PI;
        // 標準化到 [0, 360)
        if (diff < 0) diff += 360;

        expectClose(diff, 60);
      }
    });

    it('getHexPoints(1.0) 應回傳 6 個頂點的座標字串', () => {
      const points = component.getHexPoints(1.0);
      const pairs = points.split(' ');
      expect(pairs.length).toBe(6);
    });

    it('getHexPoints(0.6) 的每個頂點距中心距離應為 radius * 0.6', () => {
      const scale = 0.6;
      const cx = component.cx;
      const cy = component.cy;
      const r = component.radius;

      const points = component.getHexPoints(scale);
      const pairs = points.split(' ');

      for (const pair of pairs) {
        const [x, y] = pair.split(',').map(Number);
        const dist = Math.sqrt(Math.pow(x - cx, 2) + Math.pow(y - cy, 2));
        expectClose(dist, r * scale);
      }
    });
  });

  // =====================
  // 測試 2：分數低於及格線時顯示警示
  // =====================

  describe('warning class 與警示點', () => {
    it('分數低於 passingMark 時，warningPoints 應包含該頂點', () => {
      component.axes = makeAxes([
        { value: 5, passingMark: 6 }, // EXE 低於及格線
        { value: 7, passingMark: 6 },
        { value: 7, passingMark: 6 },
        { value: 7, passingMark: 6 },
        { value: 7, passingMark: 6 },
        { value: 7, passingMark: 6 },
      ]);
      component.maxValue = 10;
      component.size = 300;
      component.showWarning = true;
      component.ngOnChanges();
      fixture.detectChanges();

      expect(component.warningPoints.length).toBe(1);
    });

    it('所有分數均高於 passingMark 時，warningPoints 應為空', () => {
      component.axes = makeAxes(Array(6).fill({ value: 8, passingMark: 6 }));
      component.maxValue = 10;
      component.size = 300;
      component.showWarning = true;
      component.ngOnChanges();
      fixture.detectChanges();

      expect(component.warningPoints.length).toBe(0);
    });

    it('多個分數低於及格線時，warningPoints 應包含全部', () => {
      component.axes = makeAxes([
        { value: 4, passingMark: 6 },
        { value: 5, passingMark: 6 },
        { value: 7, passingMark: 6 },
        { value: 8, passingMark: 6 },
        { value: 3, passingMark: 6 },
        { value: 9, passingMark: 6 },
      ]);
      component.maxValue = 10;
      component.size = 300;
      component.ngOnChanges();
      fixture.detectChanges();

      expect(component.warningPoints.length).toBe(3);
    });

    it('showWarning = false 時不應顯示警示點（DOM 不渲染）', () => {
      component.axes = makeAxes([
        { value: 3, passingMark: 6 }, // 應警示
        ...Array(5).fill({ value: 7, passingMark: 6 }),
      ]);
      component.showWarning = false;
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      const warningDots = compiled.querySelectorAll('.warning-dot');
      expect(warningDots.length).toBe(0);
    });
  });

  // =====================
  // 測試 3：空 axes 不崩潰
  // =====================

  describe('空 axes 邊界案例', () => {
    it('axes 為空陣列時不應崩潰', () => {
      expect(() => {
        component.axes = [];
        component.maxValue = 10;
        component.size = 300;
        fixture.detectChanges();
      }).not.toThrow();
    });

    it('axes 為空陣列時，maxPoints 應為空', () => {
      component.axes = [];
      fixture.detectChanges();

      expect(component.maxPoints.length).toBe(0);
    });

    it('axes 為空陣列時，dataPoints 應為空字串', () => {
      component.axes = [];
      fixture.detectChanges();

      expect(component.dataPoints).toBe('');
    });

    it('axes 為空陣列時，warningPoints 應為空', () => {
      component.axes = [];
      fixture.detectChanges();

      expect(component.warningPoints.length).toBe(0);
    });

    it('axes 為 undefined 等效空時，不應崩潰', () => {
      expect(() => {
        (component as any).axes = undefined;
        fixture.detectChanges();
      }).not.toThrow();
    });
  });

  // =====================
  // 測試 4：maxValue 邊界
  // =====================

  describe('maxValue 邊界', () => {
    it('value 超過 maxValue 時，資料點應 clamp 到最大半徑', () => {
      component.axes = makeAxes([
        { value: 15, passingMark: 6 }, // 超出 maxValue=10
        ...Array(5).fill({ value: 7, passingMark: 6 }),
      ]);
      component.maxValue = 10;
      component.size = 300;
      component.ngOnChanges();
      fixture.detectChanges();

      // 資料點應成功產生，不崩潰
      expect(component.dataPoints).toBeTruthy();

      // 第 0 個資料點距中心不應超過 radius
      const points = component.dataPoints.split(' ');
      const [x, y] = points[0].split(',').map(Number);
      const dist = Math.sqrt(
        Math.pow(x - component.cx, 2) + Math.pow(y - component.cy, 2),
      );
      expect(dist).toBeLessThanOrEqual(component.radius + 0.01);
    });

    it('value 為 0 時，資料點應在中心點', () => {
      component.axes = makeAxes([
        { value: 0, passingMark: 6 },
        ...Array(5).fill({ value: 7, passingMark: 6 }),
      ]);
      component.maxValue = 10;
      component.size = 300;
      component.ngOnChanges();
      fixture.detectChanges();

      const points = component.dataPoints.split(' ');
      const [x, y] = points[0].split(',').map(Number);

      expectClose(x, component.cx);
      expectClose(y, component.cy);
    });

    it('passingScale 應等於 6 / maxValue', () => {
      component.maxValue = 10;
      expect(component.passingScale).toBeCloseTo(0.6);

      component.maxValue = 8;
      expect(component.passingScale).toBeCloseTo(0.75);
    });

    it('dataPoints 字串應包含 6 個座標對', () => {
      component.axes = makeAxes();
      component.maxValue = 10;
      component.size = 300;
      component.ngOnChanges();
      fixture.detectChanges();

      const pairs = component.dataPoints.split(' ');
      expect(pairs.length).toBe(6);
    });
  });
});
