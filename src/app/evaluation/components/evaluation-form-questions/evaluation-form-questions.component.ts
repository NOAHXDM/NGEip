/**
 * EvaluationFormQuestionsComponent（T021）
 *
 * 可重用的 10 道考評題目元件。
 * 被 EvaluationFormComponent 嵌入，也可在唯讀模式下展示已提交的結果。
 *
 * 介面：
 *  @Input()  scores       — 各題分數
 *  @Input()  feedbacks    — 各題補充說明
 *  @Input()  readonly     — 唯讀模式（預設 false）
 *  @Output() scoresChange   — 分數變更通知（不可變更新）
 *  @Output() feedbacksChange — 補充說明變更通知（不可變更新）
 *
 * 分數說明對應：
 *   1–3  → 明顯不足
 *   4–6  → 符合期待
 *   7–8  → 優於水準
 *   9–10 → 卓越表現
 *
 * 極端分數（≥9 或 ≤3）補充說明自動變為必填。
 */

import { Component, Input, Output, EventEmitter } from '@angular/core';
import { NgClass } from '@angular/common';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';

import {
  EvaluationFormScores,
  EvaluationFormFeedbacks,
} from '../../models/evaluation.models';

// ── 題目定義 ──────────────────────────────────────────────────────────────────

interface QuestionDef {
  key: keyof EvaluationFormScores;
  index: number;
  attribute: string;
  text: string;
}

const QUESTIONS: QuestionDef[] = [
  { key: 'q1',  index: 1,  attribute: 'COL', text: '請評估此人與團隊成員的溝通與協作能力' },
  { key: 'q2',  index: 2,  attribute: 'INS', text: '請評估此人分析問題並找到有效解決方案的能力' },
  { key: 'q3',  index: 3,  attribute: 'ADP', text: '請評估此人的自我管理與工作組織能力' },
  { key: 'q4',  index: 4,  attribute: 'INN', text: '請評估此人主動提出創新想法或改善流程的積極性' },
  { key: 'q5',  index: 5,  attribute: 'STB', text: '請評估此人對工作的責任心與承諾度' },
  { key: 'q6',  index: 6,  attribute: 'COL', text: '請評估此人與跨部門或不同背景同仁的團隊合作精神' },
  { key: 'q7',  index: 7,  attribute: 'INS', text: '請評估此人積極學習新知識或技能的態度' },
  { key: 'q8',  index: 8,  attribute: 'EXE', text: '請評估此人將計畫或任務有效執行到位的能力' },
  { key: 'q9',  index: 9,  attribute: 'EXE', text: '請評估此人在壓力或複雜情境下維持高效能的能力' },
  { key: 'q10', index: 10, attribute: 'STB', text: '請評估此人在長期專案或任務中的穩定性與持續投入' },
];

const SCORE_BUTTONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

// ── 元件 ──────────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-evaluation-form-questions',
  standalone: true,
  imports: [
    NgClass,
    MatButtonToggleModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
  ],
  template: `
    <div class="questions-container">
      @for (question of questions; track question.key) {
        <div class="question-card">

          <!-- 題目標題 -->
          <div class="question-header">
            <span class="question-number">Q{{ question.index }}</span>
            <span
              class="attribute-badge"
              [ngClass]="'attribute-badge--' + question.attribute"
            >
              {{ question.attribute }}
            </span>
            <span class="question-text">{{ question.text }}</span>
          </div>

          <!-- 分數按鈕列 -->
          <div class="score-row">
            <mat-button-toggle-group
              [value]="scores[question.key]"
              [disabled]="readonly"
              (change)="onScoreChange(question.key, $event.value)"
              class="score-toggle-group"
            >
              @for (btn of scoreButtons; track btn) {
                <mat-button-toggle
                  [value]="btn"
                  [ngClass]="getScoreBtnClass(btn)"
                  class="score-btn"
                >
                  {{ btn }}
                </mat-button-toggle>
              }
            </mat-button-toggle-group>

            <!-- 分數說明標籤 -->
            <div
              class="score-description"
              [ngClass]="'score-description--' + getScoreLevel(scores[question.key])"
            >
              <mat-icon class="score-desc-icon">
                {{ getScoreIcon(scores[question.key]) }}
              </mat-icon>
              <span>{{ getScoreDescription(scores[question.key]) }}</span>
            </div>
          </div>

          <!-- 補充說明文字框 -->
          <mat-form-field appearance="outline" class="full-width feedback-field">
            <mat-label>
              {{ isFeedbackRequired(scores[question.key]) ? '補充說明（必填）' : '補充說明（選填）' }}
            </mat-label>
            <textarea
              matInput
              #feedbackRef
              [value]="feedbacks[question.key] ?? ''"
              [disabled]="readonly"
              [placeholder]="isFeedbackRequired(scores[question.key])
                ? '分數屬於極端值（≥9 或 ≤3），請填寫具體說明或事例'
                : '可補充具體事例或觀察（選填）'"
              (input)="onFeedbackChange(question.key, feedbackRef.value)"
              rows="3"
            ></textarea>
            @if (isFeedbackRequired(scores[question.key])) {
              <mat-hint class="feedback-required-hint">
                <mat-icon class="hint-icon">warning_amber</mat-icon>
                分數屬於極端值，需填寫具體說明
              </mat-hint>
            }
          </mat-form-field>

        </div>
      }
    </div>
  `,
  styles: [`
    /* ── 容器 ──────────────────────────────────────────────── */
    .questions-container {
      display: flex;
      flex-direction: column;
      gap: 24px;
    }

    /* ── 題目卡片 ────────────────────────────────────────────── */
    .question-card {
      background: #fff;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      padding: 20px 24px 16px;
      transition: box-shadow 0.2s ease;
    }
    .question-card:hover {
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }

    /* ── 題目標題 ────────────────────────────────────────────── */
    .question-header {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      margin-bottom: 16px;
    }
    .question-number {
      font-size: 0.85rem;
      font-weight: 700;
      color: #666;
      white-space: nowrap;
      padding-top: 2px;
    }
    .attribute-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 600;
      white-space: nowrap;
      flex-shrink: 0;
    }
    /* 六大屬性顏色 */
    .attribute-badge--COL { background: #e3f2fd; color: #1565c0; }
    .attribute-badge--INS { background: #f3e5f5; color: #6a1b9a; }
    .attribute-badge--ADP { background: #e8f5e9; color: #2e7d32; }
    .attribute-badge--INN { background: #fff3e0; color: #e65100; }
    .attribute-badge--STB { background: #fce4ec; color: #880e4f; }
    .attribute-badge--EXE { background: #e0f2f1; color: #00695c; }

    .question-text {
      font-size: 0.95rem;
      color: #333;
      line-height: 1.5;
    }

    /* ── 分數列 ──────────────────────────────────────────────── */
    .score-row {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 16px;
      margin-bottom: 16px;
    }

    /* 按鈕切換群組 */
    .score-toggle-group {
      flex-shrink: 0;
    }
    .score-toggle-group ::ng-deep .mat-button-toggle {
      min-width: 36px;
    }
    .score-btn {
      font-weight: 600;
    }
    /* 分數區間色調（非選中時） */
    .score-btn--low  ::ng-deep .mat-button-toggle-label-content { color: #d32f2f; }
    .score-btn--mid  ::ng-deep .mat-button-toggle-label-content { color: #f57c00; }
    .score-btn--high ::ng-deep .mat-button-toggle-label-content { color: #1976d2; }
    .score-btn--excellent ::ng-deep .mat-button-toggle-label-content { color: #388e3c; }

    /* ── 分數說明 ────────────────────────────────────────────── */
    .score-description {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 4px 12px;
      border-radius: 16px;
      font-size: 0.85rem;
      font-weight: 500;
    }
    .score-desc-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }
    .score-description--low       { background: #ffebee; color: #c62828; }
    .score-description--mid       { background: #fff8e1; color: #e65100; }
    .score-description--high      { background: #e3f2fd; color: #1565c0; }
    .score-description--excellent { background: #e8f5e9; color: #2e7d32; }

    /* ── 補充說明欄位 ────────────────────────────────────────── */
    .full-width { width: 100%; }
    .feedback-field { margin-top: 4px; }

    .feedback-required-hint {
      display: flex;
      align-items: center;
      gap: 4px;
      color: #f57c00 !important;
      font-size: 0.78rem;
    }
    .hint-icon {
      font-size: 14px;
      width: 14px;
      height: 14px;
    }
  `],
})
export class EvaluationFormQuestionsComponent {
  // ── Inputs / Outputs ──────────────────────────────────────────────────────

  @Input() scores!: EvaluationFormScores;
  @Input() feedbacks!: EvaluationFormFeedbacks;
  @Input() readonly: boolean = false;

  @Output() scoresChange = new EventEmitter<EvaluationFormScores>();
  @Output() feedbacksChange = new EventEmitter<EvaluationFormFeedbacks>();

  // ── 靜態資料 ──────────────────────────────────────────────────────────────

  readonly questions: QuestionDef[] = QUESTIONS;
  readonly scoreButtons = SCORE_BUTTONS;

  // ── 分數變更事件 ─────────────────────────────────────────────────────────

  onScoreChange(key: keyof EvaluationFormScores, value: number): void {
    this.scoresChange.emit({ ...this.scores, [key]: value });
  }

  onFeedbackChange(key: keyof EvaluationFormFeedbacks, value: string): void {
    this.feedbacksChange.emit({ ...this.feedbacks, [key]: value || undefined });
  }

  // ── 分數工具方法 ─────────────────────────────────────────────────────────

  /** 判斷補充說明是否為必填（極端值：≥9 或 ≤3） */
  isFeedbackRequired(score: number): boolean {
    return score >= 9 || score <= 3;
  }

  /** 取得分數區間 key（用於 CSS class） */
  getScoreLevel(score: number): 'low' | 'mid' | 'high' | 'excellent' {
    if (score <= 3) return 'low';
    if (score <= 6) return 'mid';
    if (score <= 8) return 'high';
    return 'excellent';
  }

  /** 取得分數說明文字 */
  getScoreDescription(score: number): string {
    if (score <= 3) return '明顯不足';
    if (score <= 6) return '符合期待';
    if (score <= 8) return '優於水準';
    return '卓越表現';
  }

  /** 取得分數說明對應的 Material icon */
  getScoreIcon(score: number): string {
    if (score <= 3) return 'sentiment_very_dissatisfied';
    if (score <= 6) return 'sentiment_neutral';
    if (score <= 8) return 'sentiment_satisfied';
    return 'sentiment_very_satisfied';
  }

  /** 取得分數按鈕的 CSS class（依區間上色） */
  getScoreBtnClass(btn: number): string {
    if (btn <= 3) return 'score-btn--low';
    if (btn <= 6) return 'score-btn--mid';
    if (btn <= 8) return 'score-btn--high';
    return 'score-btn--excellent';
  }
}
