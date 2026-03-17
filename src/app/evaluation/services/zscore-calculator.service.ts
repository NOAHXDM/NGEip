import { Injectable } from '@angular/core';
import {
  EvaluationForm,
  AttributeScores,
  ComputedCycleResults,
  UserAttributeSnapshot,
} from '../models/evaluation.models';

/**
 * Z-score 防灌水校正演算法常數
 * Per-rater normalization：校正個別評核者評分偏高/偏低的習慣
 */
const TARGET_MEAN = 5.5;
const TARGET_SD = 1.5;

/**
 * 職業原型對照表（RO 仙境傳說風格）
 * Key 格式：'屬性A+屬性B'（雙向均對應同一原型）
 */
const ARCHETYPE_MAP: Record<string, string> = {
  'EXE+STB': '⚔️ 劍士',
  'STB+EXE': '⚔️ 劍士',
  'INS+INN': '🧙 法師',
  'INN+INS': '🧙 法師',
  'ADP+COL': '🏹 弓手',
  'COL+ADP': '🏹 弓手',
  'COL+STB': '✨ 牧師',
  'STB+COL': '✨ 牧師',
  'ADP+INN': '🗡️ 盜賊',
  'INN+ADP': '🗡️ 盜賊',
  'EXE+INS': '🔨 商人',
  'INS+EXE': '🔨 商人',
};

/**
 * 六大屬性題目對應（依 data-model.md 規格）
 * 每個屬性對應的題目索引（1-based）
 */
const ATTRIBUTE_QUESTIONS: Record<keyof AttributeScores, (keyof import('../models/evaluation.models').EvaluationFormScores)[]> = {
  EXE: ['q10'],           // 執行力：Q10（工作效率與結果導向）
  INS: ['q2', 'q7'],      // 洞察力：Q2（問題解決能力）+ Q7（積極學習與成長）
  ADP: ['q3', 'q9'],      // 應變力：Q3（自我管理）+ Q9（壓力應對）
  COL: ['q1', 'q6'],      // 協作力：Q1（溝通協作）+ Q6（團隊精神）
  STB: ['q5', 'q8'],      // 穩定力：Q5（責任心）+ Q8（專業態度）
  INN: ['q4'],            // 創新力：Q4（創新與主動性）
};

/**
 * ZScoreCalculatorService
 *
 * 純計算服務（無 Firestore 依賴）
 * 由 EvaluationCycleService.closeAndPublish() 內部呼叫
 *
 * 功能：
 * 1. Per-rater Z-score 校正（消除評核者系統性偏差）
 * 2. 六大屬性彙整（Q題目平均 → 屬性分數）
 * 3. 職業原型判定（勇者/初心者/8原型並列邏輯）
 *    - 初心者判定使用原始平均分數（未經 Z-score 校正），門檻為任 3 項屬性 < 5
 * 4. 互惠高分對偵測（A→B ≥8 且 B→A ≥8）
 * 5. 離群評核者偵測（Tukey fence on SD）
 */
@Injectable({ providedIn: 'root' })
export class ZScoreCalculatorService {
  /**
   * 主計算入口
   * @param forms 某週期的所有已提交考評表
   * @returns 每位受評者的校正後屬性分數 + 職業原型 + 異常標記
   */
  compute(forms: EvaluationForm[]): ComputedCycleResults {
    if (forms.length === 0) {
      return {
        snapshots: new Map(),
        anomalousFormIds: new Map(),
      };
    }

    // Step 1：計算每位評核者的校正後分數映射表
    // calibratedScores[evaluatorUid][formId][questionKey] = calibratedScore
    const calibratedScores = this.calibratePerRater(forms);

    // Step 2：偵測異常（互惠高分對 + 離群評核者）
    const reciprocalPairs = this.detectReciprocalHighScores(forms);
    const outlierEvaluators = this.detectOutlierEvaluators(forms);

    // Step 3：建立異常標記映射（formId → anomalyFlags）
    const anomalousFormIds = new Map<string, { reciprocalHighScore: boolean; outlierEvaluator: boolean }>();
    for (const form of forms) {
      anomalousFormIds.set(form.id, {
        reciprocalHighScore: reciprocalPairs.has(form.id),
        outlierEvaluator: outlierEvaluators.has(form.evaluatorUid),
      });
    }

    // Step 4：彙整每位受評者的屬性分數
    // 分組：evaluateeUid → forms[]
    const formsByEvaluatee = new Map<string, EvaluationForm[]>();
    for (const form of forms) {
      const arr = formsByEvaluatee.get(form.evaluateeUid) ?? [];
      arr.push(form);
      formsByEvaluatee.set(form.evaluateeUid, arr);
    }

    const snapshots = new Map<string, Partial<UserAttributeSnapshot>>();

    for (const [evaluateeUid, evaluateeForms] of formsByEvaluatee) {
      const attributes = this.computeAttributeScores(evaluateeForms, calibratedScores);
      const rawAttributes = this.computeRawAttributeScores(evaluateeForms);
      const totalScore = Object.values(attributes).reduce((sum, v) => sum + v, 0);
      const careerArchetypes = this.determineArchetypes(attributes, rawAttributes);

      snapshots.set(evaluateeUid, {
        attributes,
        totalScore: Math.round(totalScore * 100) / 100,
        careerArchetypes,
        validEvaluatorCount: evaluateeForms.length,
        rankingScore: Math.round(totalScore * 100) / 100,
      });
    }

    return { snapshots, anomalousFormIds };
  }

  /**
   * Per-rater Z-score 校正
   * 對每位評核者的所有分數進行標準化，消除評分習慣偏差
   *
   * @returns Map<evaluatorUid, Map<formId, Map<questionKey, calibratedScore>>>
   */
  private calibratePerRater(
    forms: EvaluationForm[]
  ): Map<string, Map<string, Record<string, number>>> {
    // 依評核者分組
    const byEvaluator = new Map<string, EvaluationForm[]>();
    for (const form of forms) {
      const arr = byEvaluator.get(form.evaluatorUid) ?? [];
      arr.push(form);
      byEvaluator.set(form.evaluatorUid, arr);
    }

    const result = new Map<string, Map<string, Record<string, number>>>();

    for (const [evaluatorUid, evaluatorForms] of byEvaluator) {
      // 收集該評核者本週期的所有分數
      const allScores: number[] = [];
      for (const form of evaluatorForms) {
        for (const score of Object.values(form.scores)) {
          allScores.push(score as number);
        }
      }

      const mean = this.mean(allScores);
      const sd = this.populationSD(allScores, mean);

      // 校正每道題的分數
      const evaluatorCalibrated = new Map<string, Record<string, number>>();
      for (const form of evaluatorForms) {
        const calibrated: Record<string, number> = {};
        for (const [key, score] of Object.entries(form.scores)) {
          if (sd === 0) {
            // SD=0：所有分數相同，不校正（維持原分）
            calibrated[key] = score as number;
          } else {
            const z = ((score as number) - mean) / sd;
            const raw = TARGET_MEAN + z * TARGET_SD;
            calibrated[key] = this.clamp(raw, 1, 10);
          }
        }
        evaluatorCalibrated.set(form.id, calibrated);
      }
      result.set(evaluatorUid, evaluatorCalibrated);
    }

    return result;
  }

  /**
   * 計算受評者的六大屬性分數
   * 依據 data-model.md 六大屬性計算對照表
   */
  private computeAttributeScores(
    evaluateeForms: EvaluationForm[],
    calibratedScores: Map<string, Map<string, Record<string, number>>>
  ): AttributeScores {
    const attributeValues: Record<keyof AttributeScores, number[]> = {
      EXE: [], INS: [], ADP: [], COL: [], STB: [], INN: [],
    };

    for (const form of evaluateeForms) {
      const formCalibrated = calibratedScores.get(form.evaluatorUid)?.get(form.id);
      if (!formCalibrated) continue;

      for (const [attr, questions] of Object.entries(ATTRIBUTE_QUESTIONS) as [keyof AttributeScores, string[]][]) {
        // 取該屬性相關題目的平均值
        const questionScores = questions.map((q) => formCalibrated[q] ?? 0);
        const attrScore = this.mean(questionScores);
        attributeValues[attr].push(attrScore);
      }
    }

    // 對每個屬性，取所有評核者的平均，並 clamp 到 [1, 10]
    const result: AttributeScores = {
      EXE: 0, INS: 0, ADP: 0, COL: 0, STB: 0, INN: 0,
    };

    for (const attr of Object.keys(result) as (keyof AttributeScores)[]) {
      const values = attributeValues[attr];
      if (values.length === 0) {
        result[attr] = 0;
      } else {
        result[attr] = Math.round(this.clamp(this.mean(values), 1, 10) * 100) / 100;
      }
    }

    return result;
  }

  /**
   * 計算受評者的六大屬性原始平均分數（未經 Z-score 校正）
   * 用於初心者判定（以原始分數為準，避免校正後分數偏移導致誤判）
   */
  private computeRawAttributeScores(
    evaluateeForms: EvaluationForm[]
  ): AttributeScores {
    const attributeValues: Record<keyof AttributeScores, number[]> = {
      EXE: [], INS: [], ADP: [], COL: [], STB: [], INN: [],
    };

    for (const form of evaluateeForms) {
      for (const [attr, questions] of Object.entries(ATTRIBUTE_QUESTIONS) as [keyof AttributeScores, (keyof import('../models/evaluation.models').EvaluationFormScores)[]][]) {
        const questionScores = questions.map((q) => form.scores[q] ?? 0);
        const attrScore = this.mean(questionScores);
        attributeValues[attr].push(attrScore);
      }
    }

    const result: AttributeScores = {
      EXE: 0, INS: 0, ADP: 0, COL: 0, STB: 0, INN: 0,
    };

    for (const attr of Object.keys(result) as (keyof AttributeScores)[]) {
      const values = attributeValues[attr];
      if (values.length === 0) {
        result[attr] = 0;
      } else {
        result[attr] = Math.round(this.clamp(this.mean(values), 1, 10) * 100) / 100;
      }
    }

    return result;
  }

  /**
   * 判定職業原型
   *
   * 優先順序：
   * 1. 全部屬性 ≥ 8 → 🌟 勇者 Hero（特殊全能原型）
   * 2. 任意 3 項以上屬性 < 5（使用原始平均分數） → 🌱 初心者 Novice（待成長原型）
   * 3. 取前兩高屬性的所有組合，查詢 ARCHETYPE_MAP，去重後輸出並列原型
   *
   * @param attributes 校正後屬性分數（用於勇者判定與一般原型判定）
   * @param rawAttributes 原始平均屬性分數（用於初心者判定），未提供時以 attributes 代替
   */
  determineArchetypes(attributes: AttributeScores, rawAttributes?: AttributeScores): string[] {
    const values = Object.values(attributes);
    const rawValues = Object.values(rawAttributes ?? attributes);

    // 條件 1：全部 ≥ 8 → 勇者
    if (values.every((v) => v >= 8)) {
      return ['🌟 勇者 Hero'];
    }

    // 條件 2：3 項以上原始平均分數 < 5 → 初心者（優先於一般原型判定）
    if (rawValues.filter((v) => v < 5).length >= 3) {
      return ['🌱 初心者 Novice'];
    }

    // 條件 3：枚舉所有「前兩高屬性組合」對
    const sorted = Object.entries(attributes).sort((a, b) => b[1] - a[1]);
    const top2Score = sorted[1][1]; // 第二高的分數
    // 取所有分數 ≥ 第二高分數的屬性（可能超過 2 個，並列高分）
    const candidates = sorted.filter(([, v]) => v >= top2Score);

    const archetypes = new Set<string>();
    for (let i = 0; i < candidates.length; i++) {
      for (let j = i + 1; j < candidates.length; j++) {
        const key = `${candidates[i][0]}+${candidates[j][0]}`;
        if (ARCHETYPE_MAP[key]) {
          archetypes.add(ARCHETYPE_MAP[key]);
        }
      }
    }

    return [...archetypes];
  }

  /**
   * 偵測互惠高分對
   * 若 A 給 B 所有題目平均分 ≥ 8 且 B 給 A 所有題目平均分 ≥ 8 → 標記兩份表單
   *
   * @returns Set<formId>（被標記為互惠高分的表單 ID）
   */
  detectReciprocalHighScores(forms: EvaluationForm[]): Set<string> {
    // 建立 Map：evaluatorUid → evaluateeUid → { formId, avgScore }
    const scoreMap = new Map<string, Map<string, { formId: string; avgScore: number }>>();

    for (const form of forms) {
      const scores = Object.values(form.scores) as number[];
      const avg = this.mean(scores);

      if (!scoreMap.has(form.evaluatorUid)) {
        scoreMap.set(form.evaluatorUid, new Map());
      }
      scoreMap.get(form.evaluatorUid)!.set(form.evaluateeUid, {
        formId: form.id,
        avgScore: avg,
      });
    }

    const flaggedFormIds = new Set<string>();

    // 檢查每對 (A→B) 和 (B→A) 是否均 ≥ 8
    for (const form of forms) {
      const aToB = scoreMap.get(form.evaluatorUid)?.get(form.evaluateeUid);
      const bToA = scoreMap.get(form.evaluateeUid)?.get(form.evaluatorUid);

      if (
        aToB !== undefined &&
        bToA !== undefined &&
        aToB.avgScore >= 8 &&
        bToA.avgScore >= 8
      ) {
        flaggedFormIds.add(aToB.formId);
        flaggedFormIds.add(bToA.formId);
      }
    }

    return flaggedFormIds;
  }

  /**
   * 偵測離群評核者
   * 使用 Tukey fence 法：某評核者的分數 SD > Q3 + 1.5 * IQR（全體評核者 SD 的四分位距）
   *
   * @returns Set<evaluatorUid>（被標記為離群的評核者 UID）
   */
  detectOutlierEvaluators(forms: EvaluationForm[]): Set<string> {
    // 計算每位評核者的評分 SD
    const evaluatorSDs = new Map<string, number>();

    const byEvaluator = new Map<string, EvaluationForm[]>();
    for (const form of forms) {
      const arr = byEvaluator.get(form.evaluatorUid) ?? [];
      arr.push(form);
      byEvaluator.set(form.evaluatorUid, arr);
    }

    for (const [evaluatorUid, evaluatorForms] of byEvaluator) {
      const allScores: number[] = [];
      for (const form of evaluatorForms) {
        allScores.push(...(Object.values(form.scores) as number[]));
      }
      const mean = this.mean(allScores);
      const sd = this.populationSD(allScores, mean);
      evaluatorSDs.set(evaluatorUid, sd);
    }

    if (evaluatorSDs.size < 2) {
      // 評核者數量不足，無法判斷離群
      return new Set();
    }

    const sdValues = [...evaluatorSDs.values()].sort((a, b) => a - b);
    const q1 = this.percentile(sdValues, 25);
    const q3 = this.percentile(sdValues, 75);
    const iqr = q3 - q1;
    const upperFence = q3 + 1.5 * iqr;

    const outliers = new Set<string>();
    for (const [uid, sd] of evaluatorSDs) {
      if (sd > upperFence) {
        outliers.add(uid);
      }
    }

    return outliers;
  }

  // =====================
  // 統計輔助函數
  // =====================

  /** 計算算術平均值 */
  private mean(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }

  /** 計算母體標準差（population SD） */
  private populationSD(values: number[], mean: number): number {
    if (values.length === 0) return 0;
    const variance =
      values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
  }

  /** 將值限制在 [min, max] 範圍內 */
  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  /** 計算百分位數（線性插值） */
  private percentile(sortedValues: number[], p: number): number {
    if (sortedValues.length === 0) return 0;
    const index = (p / 100) * (sortedValues.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    if (lower === upper) return sortedValues[lower];
    return (
      sortedValues[lower] * (upper - index) +
      sortedValues[upper] * (index - lower)
    );
  }
}
