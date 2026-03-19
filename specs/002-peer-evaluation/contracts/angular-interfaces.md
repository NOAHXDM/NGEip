# Angular 服務介面契約：評量考核系統

**分支**：`002-peer-evaluation` | **日期**：2026-03-17

> 本文件定義與 Firestore 互動的 Angular service、component inputs、以及 UI 組件的 TypeScript 介面契約。

---

## 1. Domain 型別定義

```typescript
// src/app/evaluation/models/evaluation.models.ts

export type CycleStatus = 'active' | 'expired_pending' | 'closed';
export type AssignmentStatus = 'pending' | 'completed' | 'overdue';
export type SnapshotStatus = 'preview' | 'final';
export type AttributeKey = 'EXE' | 'INS' | 'ADP' | 'COL' | 'STB' | 'INN';
export type JobRankKey = 'J' | 'M' | 'S';

export interface AttributeScores {
  EXE: number;
  INS: number;
  ADP: number;
  COL: number;
  STB: number;
  INN: number;
}

export interface EvaluationCycle {
  id: string;
  name: string;
  type: 'H1' | 'H2';
  year: number;
  startDate: Timestamp;
  deadline: Timestamp;
  status: CycleStatus;
  totalAssignments: number;
  completedAssignments: number;
  createdBy: string;
  createdAt: Timestamp;
  closedAt?: Timestamp;
}

export interface EvaluationAssignment {
  id: string;
  cycleId: string;
  evaluatorUid: string;
  evaluateeUid: string;
  status: AssignmentStatus;
  createdAt: Timestamp;
  completedAt?: Timestamp;
}

export interface EvaluationFormScores {
  q1: number; q2: number; q3: number; q4: number; q5: number;
  q6: number; q7: number; q8: number; q9: number; q10: number;
}

export interface EvaluationFormFeedbacks {
  q1?: string; q2?: string; q3?: string; q4?: string; q5?: string;
  q6?: string; q7?: string; q8?: string; q9?: string; q10?: string;
}

export interface EvaluationForm {
  id: string;
  assignmentId: string;
  cycleId: string;
  evaluatorUid: string;   // Admin-only readable
  evaluateeUid: string;
  submittedAt: Timestamp;
  scores: EvaluationFormScores;
  feedbacks: EvaluationFormFeedbacks;
  overallComment: string;
  anomalyFlags: {
    reciprocalHighScore: boolean;
    outlierEvaluator: boolean;
  };
}

export interface UserAttributeSnapshot {
  id: string;
  cycleId: string;
  userId: string;
  jobRank: string;
  status: SnapshotStatus;
  computedAt: Timestamp;
  validEvaluatorCount: number;
  attributes: AttributeScores;
  totalScore: number;
  careerArchetypes: string[];
  overallComments: string[];
  rankingScore?: number;
}

// 評核表單填寫用的 DTO（前端表單狀態）
export interface EvaluationFormDraft {
  scores: EvaluationFormScores;
  feedbacks: EvaluationFormFeedbacks;
  overallComment: string;
}
```

---

## 2. Service 介面

### `EvaluationCycleService`
```typescript
// src/app/evaluation/services/evaluation-cycle.service.ts
interface EvaluationCycleService {
  // 列出所有週期
  getCycles(): Observable<EvaluationCycle[]>;

  // 建立週期
  createCycle(data: Omit<EvaluationCycle, 'id' | 'createdAt' | 'status' | 'totalAssignments' | 'completedAssignments'>): Promise<string>;

  // 更新截止日
  updateDeadline(cycleId: string, deadline: Date): Promise<void>;

  // 結束並發布（觸發 Z-score 批次計算）
  closeAndPublish(cycleId: string): Promise<void>;  // 複雜操作，內部呼叫 ZScoreCalculatorService

  // 取得週期（單筆）
  getCycleById(cycleId: string): Observable<EvaluationCycle | null>;
}
```

### `EvaluationAssignmentService`
```typescript
// src/app/evaluation/services/evaluation-assignment.service.ts
interface EvaluationAssignmentService {
  // 評核者：取得自己的任務清單
  getMyAssignments(cycleId?: string): Observable<EvaluationAssignment[]>;

  // 管理者：取得週期的所有指派
  getAssignmentsByCycle(cycleId: string): Observable<EvaluationAssignment[]>;

  // 管理者：建立指派（單筆或批次）
  createAssignments(cycleId: string, assignments: {evaluatorUid: string; evaluateeUid: string}[]): Promise<void>;

  // 管理者：刪除指派
  deleteAssignment(assignmentId: string): Promise<void>;
}
```

### `EvaluationFormService`
```typescript
// src/app/evaluation/services/evaluation-form.service.ts
interface EvaluationFormService {
  // 評核者：查看自己的已提交表單
  getMyForm(cycleId: string, evaluateeUid: string): Observable<EvaluationForm | null>;

  // 評核者：提交考評表（Firestore batch：寫入 form + 更新 snapshot preview + 更新 assignment status）
  submitForm(cycleId: string, assignmentId: string, evaluateeUid: string, draft: EvaluationFormDraft): Promise<void>;

  // 管理者：取得週期所有表單（含評核者身份）
  getAllFormsByCycle(cycleId: string): Observable<EvaluationForm[]>;

  // 管理者：取得某受評者在某週期的所有表單
  getFormsByEvaluatee(cycleId: string, evaluateeUid: string): Observable<EvaluationForm[]>;
}
```

### `UserAttributeSnapshotService`
```typescript
// src/app/evaluation/services/user-attribute-snapshot.service.ts
interface UserAttributeSnapshotService {
  // 受評者：查看自己的歷史快照（所有週期）
  getMySnapshots(): Observable<UserAttributeSnapshot[]>;

  // 受評者：查看特定週期快照
  getMySnapshot(cycleId: string): Observable<UserAttributeSnapshot | null>;

  // 管理者：取得某週期所有受評者快照（排名視圖用）
  getAllSnapshotsByCycle(cycleId: string): Observable<UserAttributeSnapshot[]>;
}
```

### `ZScoreCalculatorService`
```typescript
// src/app/evaluation/services/zscore-calculator.service.ts
// 純計算服務，無 Firestore 依賴；由 EvaluationCycleService.closeAndPublish 內部呼叫
interface ZScoreCalculatorService {
  // 輸入：某週期的所有 EvaluationForms
  // 輸出：每位受評者的校正後屬性分數 + 職業原型 + 異常標記
  compute(forms: EvaluationForm[]): ComputedCycleResults;

  // 計算職業原型（初心者判定使用原始平均分數，門檻 < 5）
  determineArchetypes(attributes: AttributeScores, rawAttributes?: AttributeScores): string[];

  // 偵測互惠高分對
  detectReciprocalHighScores(forms: EvaluationForm[]): Set<string>;  // Set of formId

  // 偵測離群評核者
  detectOutlierEvaluators(forms: EvaluationForm[]): Set<string>;     // Set of evaluatorUid
}

interface ComputedCycleResults {
  snapshots: Map<string, Partial<UserAttributeSnapshot>>;  // userId → computed data
  anomalousFormIds: Map<string, {reciprocalHighScore: boolean; outlierEvaluator: boolean}>;
}
```

---

## 3. UI 元件輸入介面

### RadarChartComponent
```typescript
// src/app/evaluation/components/radar-chart/radar-chart.component.ts
export interface RadarAxis {
  key: AttributeKey;
  label: string;           // 例如 'EXE 執行力'
  value: number;           // 0–10
  passingMark: number;     // 一般為 6
}

@Component({...})
export class RadarChartComponent {
  @Input() axes: RadarAxis[] = [];         // 6 個軸定義
  @Input() maxValue: number = 10;
  @Input() size: number = 300;             // SVG 正方形大小（px）
  @Input() showWarning: boolean = true;    // 是否標示警示色（低於 passing mark）
}
```

### TrendLineChartComponent
```typescript
// src/app/evaluation/components/trend-line-chart/trend-line-chart.component.ts
export interface PeriodDataPoint {
  cycleLabel: string;       // 例如 '2025 H1'
  scores: AttributeScores;
}

@Component({...})
export class TrendLineChartComponent {
  @Input() data: PeriodDataPoint[] = [];
  @Input() width: number = 600;
  @Input() height: number = 300;
  @Input() selectedCycleLabel?: string;   // 高亮顯示的週期
}
```

### MarqueeCommentsComponent
```typescript
// src/app/evaluation/components/marquee-comments/marquee-comments.component.ts
@Component({...})
export class MarqueeCommentsComponent {
  @Input() comments: string[] = [];
  @Input() speedPx: number = 120;   // pixels/second（約每秒 8–9 個中文字，適合一般閱讀速率）
  // 若 comments 為空陣列，元件自身不渲染
  // 點擊跑馬燈可開啟完整評語彈窗（MarqueeCommentsDialogComponent）
  // hover 時暫停動畫
}
```

### CareerArchetypeBadgeComponent
```typescript
// src/app/evaluation/components/career-archetype-badge/career-archetype-badge.component.ts
@Component({...})
export class CareerArchetypeBadgeComponent {
  @Input() archetypes: string[] = [];   // 例如 ['⚔️ 劍士', '🔨 商人']
}
```

---

## 4. 路由設計

```typescript
// src/app/evaluation/evaluation.routes.ts
export const EVALUATION_ROUTES: Routes = [
  {
    path: 'evaluation',
    component: LayoutComponent,
    canActivate: [authGuard],
    children: [
      // 評核者：我的考評任務
      { path: 'tasks',             component: EvaluationTasksComponent },
      // 評核者：填寫考評表
      { path: 'tasks/:assignmentId/form', component: EvaluationFormComponent },
      // 受評者：我的屬性報告
      { path: 'my-report',         component: AttributeReportComponent },
      // 管理者：週期管理
      { path: 'admin/cycles',      component: EvaluationCyclesAdminComponent, canActivate: [adminGuard] },
      // 管理者：評核總覽（含排名視圖）
      { path: 'admin/overview',    component: EvaluationOverviewAdminComponent, canActivate: [adminGuard] },
      { path: '',                  redirectTo: 'tasks', pathMatch: 'full' },
    ]
  }
];
```
