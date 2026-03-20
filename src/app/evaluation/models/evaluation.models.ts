// src/app/evaluation/models/evaluation.models.ts
// 評量考核系統 TypeScript 介面定義

import { Timestamp } from 'firebase/firestore';

// =====================
// Domain 型別定義
// =====================

export type CycleStatus = 'active' | 'expired_pending' | 'closed';
export type AssignmentStatus = 'pending' | 'completed' | 'overdue';
export type SnapshotStatus = 'preview' | 'final';
export type AttributeKey = 'EXE' | 'INS' | 'ADP' | 'COL' | 'STB' | 'INN';
export type JobRankKey = 'J' | 'M' | 'S';

// =====================
// 六大屬性分數介面
// =====================

export interface AttributeScores {
  EXE: number; // 執行力
  INS: number; // 洞察力
  ADP: number; // 應變力
  COL: number; // 協作力
  STB: number; // 穩定力
  INN: number; // 創新力
}

// =====================
// Firestore 資料模型介面
// =====================

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
  q1: number;  // COL：溝通與協作能力
  q2: number;  // INS：問題解決能力
  q3: number;  // ADP：自我管理與組織能力
  q4: number;  // INN：創新與主動性
  q5: number;  // STB：責任心與承諾
  q6: number;  // COL：團隊精神與合作
  q7: number;  // INS：積極學習與成長
  q8: number;  // STB：專業態度與品質意識
  q9: number;  // ADP：壓力應對能力
  q10: number; // EXE：工作效率與結果導向
}

export interface EvaluationFormFeedbacks {
  q1?: string;
  q2?: string;
  q3?: string;
  q4?: string;
  q5?: string;
  q6?: string;
  q7?: string;
  q8?: string;
  q9?: string;
  q10?: string;
}

export interface EvaluationForm {
  id: string;
  assignmentId: string;
  cycleId: string;
  evaluatorUid: string;   // ⚠️ Admin-only readable（受評者無法讀取此欄位）
  evaluateeUid: string;
  submittedAt: Timestamp;
  scores: EvaluationFormScores;
  feedbacks: EvaluationFormFeedbacks;
  overallComment: string; // 必填，20–500字
  anomalyFlags: {
    reciprocalHighScore: boolean; // 互惠高分對標記（A→B平均≥8 且 B→A平均≥8）
    outlierEvaluator: boolean;    // 離群評核者標記（Tukey fence）
  };
}

export interface UserAttributeSnapshot {
  id: string;
  cycleId: string;
  userId: string;
  jobRank: string; // 預期 'J' | 'M' | 'S'，不符時顯示「職等未設定」
  status: SnapshotStatus;
  computedAt: Timestamp;
  validEvaluatorCount: number;
  attributes: AttributeScores;
  totalScore: number; // EXE+INS+ADP+COL+STB+INN，最大 60
  careerArchetypes: string[]; // 職業原型，可能多個並列
  overallComments: string[];  // 匿名整體評價（arrayUnion），跑馬燈顯示
  rankingScore?: number;      // final 後由 Z-score 計算寫入
  rawAttributes?: AttributeScores;  // 不經 Z-score 校正的加總平均分數
  rawTotalScore?: number;           // rawAttributes 六大屬性加總，最大 60
}

// 評核表單填寫用的 DTO（前端表單狀態）
export interface EvaluationFormDraft {
  scores: EvaluationFormScores;
  feedbacks: EvaluationFormFeedbacks;
  overallComment: string;
}

// =====================
// 計算結果介面（ZScoreCalculatorService）
// =====================

export interface ComputedCycleResults {
  snapshots: Map<string, Partial<UserAttributeSnapshot>>; // userId → computed data
  anomalousFormIds: Map<string, { reciprocalHighScore: boolean; outlierEvaluator: boolean }>;
}

// =====================
// UI 元件輸入介面
// =====================

export interface RadarAxis {
  key: AttributeKey;
  label: string;       // 例如 'EXE 執行力'
  value: number;       // 0–10
  passingMark: number; // 一般為 6
}

export interface PeriodDataPoint {
  cycleLabel: string;    // 例如 '2025 H1'
  scores: AttributeScores;
}
