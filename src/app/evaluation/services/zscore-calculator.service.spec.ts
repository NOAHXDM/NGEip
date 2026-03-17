/**
 * ZScoreCalculatorService 單元測試（T009）
 *
 * 覆蓋：
 * 1. sd=0 邊界（不校正）
 * 2. 多評核者 Z-score 結果正確
 * 3. 屬性分數 clamp(1,10)
 * 4. 6 種單一原型（EXE+STB=劍士, INS+INN=法師, ADP+COL=弓手, COL+STB=牧師, ADP+INN=盜賊, EXE+INS=商人）
 * 5. 勇者判定（全部屬性 ≥ 8）
 * 6. 初心者判定（3 項以上原始平均分數 < 5，優先）
 * 7. 並列輸出多原型
 * 8. 互惠高分對偵測
 * 9. 離群評核者偵測
 */

import { TestBed } from '@angular/core/testing';
import { ZScoreCalculatorService } from './zscore-calculator.service';
import { EvaluationForm, AttributeScores } from '../models/evaluation.models';
import { Timestamp } from 'firebase/firestore';

// =====================
// 測試輔助函數
// =====================

function makeScores(value: number): import('../models/evaluation.models').EvaluationFormScores {
  return { q1: value, q2: value, q3: value, q4: value, q5: value, q6: value, q7: value, q8: value, q9: value, q10: value };
}

function makeForm(
  id: string,
  evaluatorUid: string,
  evaluateeUid: string,
  scores: import('../models/evaluation.models').EvaluationFormScores,
  overallComment = '這是一段符合長度要求的整體評語，測試用途。'
): EvaluationForm {
  return {
    id,
    assignmentId: `${evaluatorUid}_cycle1_${evaluateeUid}`,
    cycleId: 'cycle1',
    evaluatorUid,
    evaluateeUid,
    submittedAt: { toDate: () => new Date() } as unknown as Timestamp,
    scores,
    feedbacks: {},
    overallComment,
    anomalyFlags: { reciprocalHighScore: false, outlierEvaluator: false },
  };
}

// =====================
// 測試套件
// =====================

describe('ZScoreCalculatorService', () => {
  let service: ZScoreCalculatorService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ZScoreCalculatorService);
  });

  // =====================
  // 測試 1：sd=0 邊界（評核者所有分數相同，不校正）
  // =====================
  describe('sd=0 邊界', () => {
    it('評核者所有題目給分相同（sd=0），不應進行 Z-score 校正，應維持原分', () => {
      // 評核者 E1 給所有題目都是 7（sd=0）
      const form = makeForm('f1', 'E1', 'T1', makeScores(7));
      const result = service.compute([form]);

      const snapshot = result.snapshots.get('T1');
      expect(snapshot).toBeDefined();
      // 所有屬性的分數應接近 7（原分，無校正）
      expect(snapshot!.attributes!.EXE).toBeCloseTo(7, 1);
      expect(snapshot!.attributes!.COL).toBeCloseTo(7, 1);
    });

    it('sd=0 時，即使 target_mean=5.5，分數不應被映射至 5.5', () => {
      const form = makeForm('f1', 'E1', 'T1', makeScores(9));
      const result = service.compute([form]);
      const snapshot = result.snapshots.get('T1');
      // sd=0，不校正，應維持 9
      expect(snapshot!.attributes!.EXE).toBeCloseTo(9, 1);
    });
  });

  // =====================
  // 測試 2：多評核者 Z-score 結果
  // =====================
  describe('多評核者 Z-score 校正', () => {
    it('偏高評核者的分數應被向下校正', () => {
      // 評核者 HIGH 習慣給高分（9-10），評核者 LOW 習慣給低分（1-2）
      // 兩人都評同一位受評者
      const highScores = { q1: 10, q2: 10, q3: 10, q4: 10, q5: 10, q6: 10, q7: 10, q8: 10, q9: 10, q10: 10 };
      const lowScores = { q1: 1, q2: 1, q3: 1, q4: 1, q5: 1, q6: 1, q7: 1, q8: 1, q9: 1, q10: 1 };

      // 但我們需要讓 sd != 0，所以給評核者混合分數
      const highEvaluatorForms = [
        makeForm('f-high', 'E-HIGH', 'T1', { q1: 10, q2: 10, q3: 9, q4: 10, q5: 10, q6: 9, q7: 10, q8: 10, q9: 9, q10: 10 }),
      ];
      const lowEvaluatorForms = [
        makeForm('f-low', 'E-LOW', 'T1', { q1: 1, q2: 2, q3: 1, q4: 2, q5: 1, q6: 2, q7: 1, q8: 2, q9: 1, q10: 2 }),
      ];

      const result = service.compute([...highEvaluatorForms, ...lowEvaluatorForms]);
      const snapshot = result.snapshots.get('T1');

      // 校正後兩者平均應在 5.5 附近
      expect(snapshot).toBeDefined();
      // 校正後分數不應維持在極端值（10 or 1），應向 5.5 靠攏
      // 由於兩者均值相反，平均後應在中間
      expect(snapshot!.attributes!.EXE).toBeGreaterThan(1);
      expect(snapshot!.attributes!.EXE).toBeLessThan(10);
    });

    it('評核者分數 z-score 校正後應 clamp 在 [1, 10]', () => {
      // 創造一個極端情況，讓計算分數超出邊界
      // 評核者給出非常偏斜的分數（全高除了一題很低），讓 Z-score 推算到邊界
      const extremeScores = { q1: 10, q2: 10, q3: 10, q4: 10, q5: 10, q6: 10, q7: 10, q8: 10, q9: 10, q10: 1 };
      const form = makeForm('f-extreme', 'E1', 'T1', extremeScores);

      const result = service.compute([form]);
      const snapshot = result.snapshots.get('T1');

      // 所有分數應在 [1, 10] 範圍內
      if (snapshot?.attributes) {
        for (const score of Object.values(snapshot.attributes)) {
          expect(score).toBeGreaterThanOrEqual(1);
          expect(score).toBeLessThanOrEqual(10);
        }
      }
    });
  });

  // =====================
  // 測試 3：屬性分數 clamp(1,10)
  // =====================
  describe('屬性分數 clamp(1,10)', () => {
    it('計算後的屬性分數應在 [1, 10] 範圍內', () => {
      const form = makeForm('f1', 'E1', 'T1', { q1: 1, q2: 1, q3: 10, q4: 10, q5: 1, q6: 10, q7: 1, q8: 10, q9: 1, q10: 5 });
      const result = service.compute([form]);
      const attrs = result.snapshots.get('T1')?.attributes;
      expect(attrs).toBeDefined();
      for (const score of Object.values(attrs!)) {
        expect(score).toBeGreaterThanOrEqual(1);
        expect(score).toBeLessThanOrEqual(10);
      }
    });
  });

  // =====================
  // 測試 4：6 種單一原型判定
  // =====================
  describe('職業原型 - 6 種單一原型', () => {
    function makeAttrs(overrides: Partial<AttributeScores>): AttributeScores {
      // 預設值 6（剛好不觸發初心者條件），再以 overrides 覆蓋
      return { EXE: 6, INS: 6, ADP: 6, COL: 6, STB: 6, INN: 6, ...overrides };
    }

    it('EXE+STB 最高 → ⚔️ 劍士', () => {
      const attrs = makeAttrs({ EXE: 9, STB: 8 });
      expect(service.determineArchetypes(attrs)).toEqual(jasmine.arrayContaining(['⚔️ 劍士']));
    });

    it('INS+INN 最高 → 🧙 法師', () => {
      const attrs = makeAttrs({ INS: 9, INN: 8 });
      expect(service.determineArchetypes(attrs)).toEqual(jasmine.arrayContaining(['🧙 法師']));
    });

    it('ADP+COL 最高 → 🏹 弓手', () => {
      const attrs = makeAttrs({ ADP: 9, COL: 8 });
      expect(service.determineArchetypes(attrs)).toEqual(jasmine.arrayContaining(['🏹 弓手']));
    });

    it('COL+STB 最高 → ✨ 牧師', () => {
      const attrs = makeAttrs({ COL: 9, STB: 8 });
      expect(service.determineArchetypes(attrs)).toEqual(jasmine.arrayContaining(['✨ 牧師']));
    });

    it('ADP+INN 最高 → 🗡️ 盜賊', () => {
      const attrs = makeAttrs({ ADP: 9, INN: 8 });
      expect(service.determineArchetypes(attrs)).toEqual(jasmine.arrayContaining(['🗡️ 盜賊']));
    });

    it('EXE+INS 最高 → 🔨 商人', () => {
      const attrs = makeAttrs({ EXE: 9, INS: 8 });
      expect(service.determineArchetypes(attrs)).toEqual(jasmine.arrayContaining(['🔨 商人']));
    });
  });

  // =====================
  // 測試 5：勇者判定（全部屬性 ≥ 8）
  // =====================
  describe('勇者判定', () => {
    it('所有屬性 ≥ 8 → 🌟 勇者 Hero', () => {
      const attrs: AttributeScores = { EXE: 8, INS: 9, ADP: 8, COL: 8.5, STB: 8, INN: 8 };
      expect(service.determineArchetypes(attrs)).toEqual(['🌟 勇者 Hero']);
    });

    it('所有屬性剛好 = 8 → 🌟 勇者 Hero', () => {
      const attrs: AttributeScores = { EXE: 8, INS: 8, ADP: 8, COL: 8, STB: 8, INN: 8 };
      expect(service.determineArchetypes(attrs)).toEqual(['🌟 勇者 Hero']);
    });

    it('有一屬性 < 8 → 不是勇者', () => {
      const attrs: AttributeScores = { EXE: 8, INS: 8, ADP: 8, COL: 8, STB: 7.9, INN: 8 };
      expect(service.determineArchetypes(attrs)).not.toContain('🌟 勇者 Hero');
    });
  });

  // =====================
  // 測試 6：初心者判定（3 項以上原始平均分數 < 5，優先於一般原型）
  // =====================
  describe('初心者判定（原始平均分數 < 5，優先邏輯）', () => {
    it('3 項原始平均屬性 < 5 → 🌱 初心者 Novice', () => {
      // 明確設定 3 個原始屬性 < 5（ADP=4, COL=4, STB=4），其餘 ≥ 5
      // EXE+INS 雖然是最高 pair → 商人，但初心者規則優先
      const attrs: AttributeScores = { EXE: 9, INS: 9, ADP: 6, COL: 6, STB: 6, INN: 7 };
      const rawAttrs: AttributeScores = { EXE: 9, INS: 9, ADP: 4, COL: 4, STB: 4, INN: 7 };
      const result = service.determineArchetypes(attrs, rawAttrs);
      expect(result).toEqual(['🌱 初心者 Novice']);
    });

    it('4 項原始平均屬性 < 5 → 🌱 初心者 Novice', () => {
      const attrs: AttributeScores = { EXE: 8, INS: 8, ADP: 6, COL: 5, STB: 6, INN: 5 };
      const rawAttrs: AttributeScores = { EXE: 8, INS: 8, ADP: 4, COL: 3, STB: 4, INN: 2 };
      expect(service.determineArchetypes(attrs, rawAttrs)).toEqual(['🌱 初心者 Novice']);
    });

    it('剛好 2 項原始平均屬性 < 5 → 不是初心者（正常原型判定）', () => {
      const attrs: AttributeScores = { EXE: 9, INS: 8, ADP: 5, COL: 5, STB: 7, INN: 7 };
      const rawAttrs: AttributeScores = { EXE: 9, INS: 8, ADP: 4, COL: 4, STB: 7, INN: 7 };
      const result = service.determineArchetypes(attrs, rawAttrs);
      expect(result).not.toContain('🌱 初心者 Novice');
    });

    it('原始分數 3 項 < 5 但校正後分數 ≥ 5 → 仍判定為初心者（以原始分數為準）', () => {
      // 校正後分數全部 ≥ 5，但原始分數有 3 項 < 5
      const attrs: AttributeScores = { EXE: 7, INS: 7, ADP: 5.5, COL: 5.5, STB: 5.5, INN: 7 };
      const rawAttrs: AttributeScores = { EXE: 7, INS: 7, ADP: 4, COL: 4, STB: 4, INN: 7 };
      const result = service.determineArchetypes(attrs, rawAttrs);
      expect(result).toEqual(['🌱 初心者 Novice']);
    });

    it('原始分數全部 ≥ 5 但校正後 3 項 < 5 → 不是初心者（以原始分數為準）', () => {
      // 校正後分數有 3 項 < 5，但原始分數全部 ≥ 5
      const attrs: AttributeScores = { EXE: 7, INS: 7, ADP: 4, COL: 4, STB: 4, INN: 7 };
      const rawAttrs: AttributeScores = { EXE: 7, INS: 7, ADP: 5, COL: 5, STB: 5, INN: 7 };
      const result = service.determineArchetypes(attrs, rawAttrs);
      expect(result).not.toContain('🌱 初心者 Novice');
    });

    it('未提供 rawAttributes 時 fallback 使用 attributes 判定', () => {
      const attrs: AttributeScores = { EXE: 9, INS: 9, ADP: 4, COL: 4, STB: 4, INN: 7 };
      const result = service.determineArchetypes(attrs);
      expect(result).toEqual(['🌱 初心者 Novice']);
    });
  });

  // =====================
  // 測試 7：並列輸出多原型
  // =====================
  describe('並列輸出多原型', () => {
    it('前三高屬性分數相同時，應輸出多個原型', () => {
      // EXE=INS=STB=9（三者並列），其他屬性 ≥ 6（不觸發初心者）
      // 組合：EXE+STB=劍士, EXE+INS=商人, INS+STB=(未定義) → 只輸出劍士+商人
      const attrs: AttributeScores = { EXE: 9, INS: 9, ADP: 6, COL: 6, STB: 9, INN: 6 };
      const result = service.determineArchetypes(attrs);
      expect(result.length).toBeGreaterThan(1);
      expect(result).toContain('⚔️ 劍士'); // EXE+STB
      expect(result).toContain('🔨 商人'); // EXE+INS
    });
  });

  // =====================
  // 測試 8：互惠高分對偵測
  // =====================
  describe('互惠高分對偵測（detectReciprocalHighScores）', () => {
    it('A→B 平均 ≥ 8 且 B→A 平均 ≥ 8 → 兩份表單均標記', () => {
      const formAtoB = makeForm('form-AB', 'A', 'B', makeScores(9)); // avg=9
      const formBtoA = makeForm('form-BA', 'B', 'A', makeScores(8)); // avg=8

      const result = service.detectReciprocalHighScores([formAtoB, formBtoA]);
      expect(result.has('form-AB')).toBeTrue();
      expect(result.has('form-BA')).toBeTrue();
    });

    it('A→B 平均 ≥ 8 但 B→A 平均 < 8 → 不標記', () => {
      const formAtoB = makeForm('form-AB', 'A', 'B', makeScores(9)); // avg=9
      const formBtoA = makeForm('form-BA', 'B', 'A', makeScores(7)); // avg=7

      const result = service.detectReciprocalHighScores([formAtoB, formBtoA]);
      expect(result.size).toBe(0);
    });

    it('只有單向表單（沒有互惠）→ 不標記', () => {
      const form = makeForm('form-AB', 'A', 'B', makeScores(10));
      const result = service.detectReciprocalHighScores([form]);
      expect(result.size).toBe(0);
    });

    it('空表單列表 → 空集合', () => {
      const result = service.detectReciprocalHighScores([]);
      expect(result.size).toBe(0);
    });
  });

  // =====================
  // 測試 9：離群評核者偵測
  // =====================
  describe('離群評核者偵測（detectOutlierEvaluators）', () => {
    it('評核者數量 < 2 → 空集合（無法判斷離群）', () => {
      const form = makeForm('f1', 'E1', 'T1', makeScores(7));
      const result = service.detectOutlierEvaluators([form]);
      expect(result.size).toBe(0);
    });

    it('有一位評核者分數標準差極大（超過 Tukey fence）→ 標記為離群', () => {
      // 正常評核者：分數集中（低 SD）
      const normalForms = [
        makeForm('f1', 'E1', 'T1', { q1: 6, q2: 7, q3: 6, q4: 7, q5: 6, q6: 7, q7: 6, q8: 7, q9: 6, q10: 7 }),
        makeForm('f2', 'E2', 'T1', { q1: 7, q2: 7, q3: 8, q4: 7, q5: 7, q6: 8, q7: 7, q8: 8, q9: 7, q10: 8 }),
        makeForm('f3', 'E3', 'T1', { q1: 5, q2: 6, q3: 5, q4: 6, q5: 5, q6: 6, q7: 5, q8: 6, q9: 5, q10: 6 }),
        makeForm('f4', 'E4', 'T2', { q1: 6, q2: 6, q3: 7, q4: 7, q5: 6, q6: 6, q7: 7, q8: 7, q9: 6, q10: 6 }),
      ];

      // 離群評核者：分數極度分散（高 SD）— 給 1 和 10 交替
      const outlierForm = makeForm('f-outlier', 'E-OUTLIER', 'T2', {
        q1: 1, q2: 10, q3: 1, q4: 10, q5: 1, q6: 10, q7: 1, q8: 10, q9: 1, q10: 10,
      });

      const result = service.detectOutlierEvaluators([...normalForms, outlierForm]);
      expect(result.has('E-OUTLIER')).toBeTrue();
    });

    it('所有評核者分數標準差相似 → 無離群', () => {
      // 所有評核者給分均勻分散（SD 相似）
      const forms = [
        makeForm('f1', 'E1', 'T1', { q1: 5, q2: 7, q3: 5, q4: 7, q5: 5, q6: 7, q7: 5, q8: 7, q9: 5, q10: 7 }),
        makeForm('f2', 'E2', 'T1', { q1: 6, q2: 8, q3: 6, q4: 8, q5: 6, q6: 8, q7: 6, q8: 8, q9: 6, q10: 8 }),
        makeForm('f3', 'E3', 'T1', { q1: 4, q2: 6, q3: 4, q4: 6, q5: 4, q6: 6, q7: 4, q8: 6, q9: 4, q10: 6 }),
      ];
      const result = service.detectOutlierEvaluators(forms);
      expect(result.size).toBe(0);
    });
  });

  // =====================
  // 測試整合：compute() 完整流程
  // =====================
  describe('compute() 完整流程', () => {
    it('空表單列表 → 空結果', () => {
      const result = service.compute([]);
      expect(result.snapshots.size).toBe(0);
      expect(result.anomalousFormIds.size).toBe(0);
    });

    it('單一表單 → 正確快照，包含 attributes + totalScore + careerArchetypes', () => {
      const form = makeForm('f1', 'E1', 'T1', makeScores(7));
      const result = service.compute([form]);

      const snapshot = result.snapshots.get('T1');
      expect(snapshot).toBeDefined();
      expect(snapshot!.attributes).toBeDefined();
      expect(snapshot!.totalScore).toBeDefined();
      expect(snapshot!.careerArchetypes).toBeDefined();
      expect(snapshot!.validEvaluatorCount).toBe(1);
    });

    it('多受評者 → 每位受評者均有獨立快照', () => {
      const forms = [
        makeForm('f1', 'E1', 'T1', makeScores(7)),
        makeForm('f2', 'E1', 'T2', makeScores(8)),
        makeForm('f3', 'E2', 'T1', makeScores(6)),
      ];
      const result = service.compute(forms);

      expect(result.snapshots.has('T1')).toBeTrue();
      expect(result.snapshots.has('T2')).toBeTrue();
      // T1 有 2 位評核者，T2 有 1 位
      expect(result.snapshots.get('T1')!.validEvaluatorCount).toBe(2);
      expect(result.snapshots.get('T2')!.validEvaluatorCount).toBe(1);
    });
  });
});
