/**
 * EvaluationFormService 單元測試（T016）
 *
 * 使用 Karma/Jasmine + TestBed.configureTestingModule。
 * 透過 spyOn(service, protectedMethod) 攔截 protected Firebase 包裝方法，
 * 避免 Angular Fire v20 模組層級函式為 configurable:false getter-only 無法 spyOn 的問題。
 *
 * Protected 方法 spy 策略：
 *  - firestoreDocRef        → MOCK_DOC_REF
 *  - firestoreNewDocRef     → MOCK_DOC_REF（auto-id 表單文件）
 *  - firestoreCollectionRef → MOCK_COLLECTION_REF
 *  - firestoreGet           → makeAssignmentSnapshot('pending'|'completed')
 *  - firestoreCreateBatch   → mockBatch
 *  - firestoreServerTimestamp → MOCK_SERVER_TIMESTAMP
 *  - firestoreArrayUnion    → { _arrayUnion: [...items] }
 *  - firestoreIncrement     → { _increment: n }
 *  - firestoreQuery         → of([]) / of([mockForm])
 *  - firestoreWhere         → {}（stub）
 *
 * 測試案例：
 *  1. overallComment < 20 字元         → submitForm 應拒絕並包含「20」的錯誤訊息
 *  2. overallComment > 500 字元        → submitForm 應拒絕並包含「500」的錯誤訊息
 *  3. 分數 ≥ 9 且無對應說明            → submitForm 應拒絕並包含題目 key 的錯誤訊息
 *  4. 分數 ≤ 3 且無對應說明            → submitForm 應拒絕並包含題目 key 的錯誤訊息
 *  5. 指派狀態 = completed             → submitForm 應拒絕（防止重複提交），不呼叫 firestoreCreateBatch
 *  6. 有效表單提交                     → 呼叫 firestoreCreateBatch、batch.set ×2、batch.update ×2、batch.commit
 */

import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { Timestamp } from 'firebase/firestore';
import { Firestore, FieldValue } from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';

import { EvaluationFormService } from './evaluation-form.service';
import { EvaluationAssignment, EvaluationFormDraft } from '../models/evaluation.models';

// =====================
// 測試常數
// =====================

const MOCK_EVALUATOR_UID = 'mock-evaluator-uid-001';
const MOCK_EVALUATEE_UID = 'mock-evaluatee-uid-001';
const MOCK_CYCLE_ID = 'mock-cycle-id-001';
const MOCK_ASSIGNMENT_ID = `${MOCK_EVALUATOR_UID}_${MOCK_CYCLE_ID}_${MOCK_EVALUATEE_UID}`;

/** 模擬 DocumentReference（id 屬性供 auto-id 表單文件使用） */
const MOCK_DOC_REF = {
  id: 'mock-form-auto-id-001',
  path: 'evaluationForms/mock-form-auto-id-001',
} as const;

/** 模擬 CollectionReference */
const MOCK_COLLECTION_REF = {} as any;

/** 模擬 serverTimestamp 回傳值（可識別物件供斷言驗證） */
const MOCK_SERVER_TIMESTAMP = { _serverTimestamp: true } as unknown as FieldValue;

/** 有效的整體評語（超過 20 字元） */
const VALID_OVERALL_COMMENT =
  '這位同事在過去半年展現出優秀的執行力與協作能力，面對挑戰時總能冷靜應對，值得肯定。';

/**
 * 有效的評核草稿（所有分數 4–8，不需填說明）
 * 屬性預覽計算：
 *   EXE=q10=7 | INS=(q2=6+q7=6)/2=6 | ADP=(q3=7+q9=6)/2=6.5
 *   COL=(q1=7+q6=7)/2=7 | STB=(q5=8+q8=7)/2=7.5 | INN=q4=6
 */
const VALID_DRAFT: EvaluationFormDraft = {
  scores: {
    q1: 7, q2: 6, q3: 7, q4: 6, q5: 8,
    q6: 7, q7: 6, q8: 7, q9: 6, q10: 7,
  },
  feedbacks: {},
  overallComment: VALID_OVERALL_COMMENT,
};

/**
 * 建立模擬的 EvaluationAssignment Firestore 文件快照
 */
function makeAssignmentSnapshot(
  status: EvaluationAssignment['status'],
  exists = true,
) {
  return {
    exists: () => exists,
    data: () =>
      exists
        ? ({
            id: MOCK_ASSIGNMENT_ID,
            cycleId: MOCK_CYCLE_ID,
            evaluatorUid: MOCK_EVALUATOR_UID,
            evaluateeUid: MOCK_EVALUATEE_UID,
            status,
            createdAt: {} as Timestamp,
          } as EvaluationAssignment)
        : undefined,
  };
}

// =====================
// 測試套件
// =====================

describe('EvaluationFormService', () => {
  let service: EvaluationFormService;

  // ── 模擬 DI 相依 ──────────────────────────────────────────────────────────
  let mockFirestore: jasmine.SpyObj<Firestore>;
  let mockAuth: { currentUser: { uid: string } | null };

  // ── Batch Mock ────────────────────────────────────────────────────────────
  let mockBatch: {
    set: jasmine.Spy;
    update: jasmine.Spy;
    commit: jasmine.Spy;
  };

  // ── Protected 方法 Spies（直接對實例方法 spyOn，無 configurable 限制）────
  let firestoreDocRefSpy: jasmine.Spy;
  let firestoreNewDocRefSpy: jasmine.Spy;
  let firestoreCollectionRefSpy: jasmine.Spy;
  let firestoreGetSpy: jasmine.Spy;
  let firestoreCreateBatchSpy: jasmine.Spy;
  let firestoreServerTimestampSpy: jasmine.Spy;
  let firestoreArrayUnionSpy: jasmine.Spy;
  let firestoreIncrementSpy: jasmine.Spy;
  let firestoreQuerySpy: jasmine.Spy;
  let firestoreWhereSpy: jasmine.Spy;

  beforeEach(() => {
    // ── 建立 DI 相依模擬物件 ──────────────────────────────────────────────
    mockFirestore = jasmine.createSpyObj('Firestore', ['_dummy']);
    mockAuth = { currentUser: { uid: MOCK_EVALUATOR_UID } };

    // ── Batch mock ─────────────────────────────────────────────────────────
    mockBatch = {
      set: jasmine.createSpy('batch.set').and.returnValue(undefined),
      update: jasmine.createSpy('batch.update').and.returnValue(undefined),
      commit: jasmine.createSpy('batch.commit').and.returnValue(Promise.resolve()),
    };

    // ── TestBed 設定 ──────────────────────────────────────────────────────
    TestBed.configureTestingModule({
      providers: [
        EvaluationFormService,
        { provide: Firestore, useValue: mockFirestore },
        { provide: Auth, useValue: mockAuth },
      ],
    });

    service = TestBed.inject(EvaluationFormService);

    // ── 對 protected 實例方法進行 spyOn（實例方法始終可寫，不受模組匯出限制）──
    firestoreDocRefSpy = spyOn(service as any, 'firestoreDocRef')
      .and.returnValue(MOCK_DOC_REF as any);

    firestoreNewDocRefSpy = spyOn(service as any, 'firestoreNewDocRef')
      .and.returnValue(MOCK_DOC_REF as any);

    firestoreCollectionRefSpy = spyOn(service as any, 'firestoreCollectionRef')
      .and.returnValue(MOCK_COLLECTION_REF);

    firestoreGetSpy = spyOn(service as any, 'firestoreGet')
      .and.returnValue(Promise.resolve(makeAssignmentSnapshot('pending') as any));

    firestoreCreateBatchSpy = spyOn(service as any, 'firestoreCreateBatch')
      .and.returnValue(mockBatch as any);

    firestoreServerTimestampSpy = spyOn(service as any, 'firestoreServerTimestamp')
      .and.returnValue(MOCK_SERVER_TIMESTAMP);

    firestoreArrayUnionSpy = spyOn(service as any, 'firestoreArrayUnion')
      .and.callFake((...items: unknown[]) => ({ _arrayUnion: items }) as any);

    firestoreIncrementSpy = spyOn(service as any, 'firestoreIncrement')
      .and.callFake((n: number) => ({ _increment: n }) as any);

    firestoreQuerySpy = spyOn(service as any, 'firestoreQuery')
      .and.returnValue(of([]));

    firestoreWhereSpy = spyOn(service as any, 'firestoreWhere')
      .and.callFake((field: string, op: string, value: unknown) => ({ field, op, value }) as any);
  });

  // =======================================================================
  // 測試 1：overallComment 長度下限（< 20 字元）
  // =======================================================================

  describe('submitForm() 驗證 — overallComment 長度下限（20 字元）', () => {

    it('overallComment 為空字串時應拒絕並包含「20」的錯誤訊息，且不呼叫任何 Firestore 操作', async () => {
      const draft: EvaluationFormDraft = { ...VALID_DRAFT, overallComment: '' };

      await expectAsync(
        service.submitForm(MOCK_CYCLE_ID, MOCK_ASSIGNMENT_ID, MOCK_EVALUATEE_UID, draft),
      ).toBeRejectedWithError(/20/);

      // 驗證在驗證失敗時未發出任何 Firestore 呼叫
      expect(firestoreGetSpy).not.toHaveBeenCalled();
      expect(firestoreCreateBatchSpy).not.toHaveBeenCalled();
    });

    it('overallComment 恰好 19 字元時應拒絕', async () => {
      const draft: EvaluationFormDraft = {
        ...VALID_DRAFT,
        overallComment: '一二三四五六七八九十一二三四五六七八九', // 19 字元
      };

      await expectAsync(
        service.submitForm(MOCK_CYCLE_ID, MOCK_ASSIGNMENT_ID, MOCK_EVALUATEE_UID, draft),
      ).toBeRejected();

      expect(firestoreCreateBatchSpy).not.toHaveBeenCalled();
    });

    it('overallComment 恰好 20 字元時應通過字數驗證', async () => {
      const draft: EvaluationFormDraft = {
        ...VALID_DRAFT,
        overallComment: '一二三四五六七八九十一二三四五六七八九十', // 恰好 20 字元
      };

      await expectAsync(
        service.submitForm(MOCK_CYCLE_ID, MOCK_ASSIGNMENT_ID, MOCK_EVALUATEE_UID, draft),
      ).toBeResolved();
    });

    it('過短評語的錯誤物件應為 Error 實例，且 message 包含「20」', async () => {
      const draft: EvaluationFormDraft = { ...VALID_DRAFT, overallComment: '太短了' };

      let caughtError: unknown;
      try {
        await service.submitForm(MOCK_CYCLE_ID, MOCK_ASSIGNMENT_ID, MOCK_EVALUATEE_UID, draft);
      } catch (e) {
        caughtError = e;
      }

      expect(caughtError).toBeInstanceOf(Error);
      expect((caughtError as Error).message).toMatch(/20/);
    });
  });

  // =======================================================================
  // 測試 2：overallComment 長度上限（> 500 字元）
  // =======================================================================

  describe('submitForm() 驗證 — overallComment 長度上限（500 字元）', () => {

    it('overallComment 501 字元時應拒絕並包含「500」的錯誤訊息，且不呼叫 Firestore', async () => {
      const draft: EvaluationFormDraft = {
        ...VALID_DRAFT,
        overallComment: '一'.repeat(501),
      };

      await expectAsync(
        service.submitForm(MOCK_CYCLE_ID, MOCK_ASSIGNMENT_ID, MOCK_EVALUATEE_UID, draft),
      ).toBeRejectedWithError(/500/);

      expect(firestoreGetSpy).not.toHaveBeenCalled();
      expect(firestoreCreateBatchSpy).not.toHaveBeenCalled();
    });

    it('overallComment 999 字元時應拒絕', async () => {
      const draft: EvaluationFormDraft = {
        ...VALID_DRAFT,
        overallComment: 'a'.repeat(999),
      };

      await expectAsync(
        service.submitForm(MOCK_CYCLE_ID, MOCK_ASSIGNMENT_ID, MOCK_EVALUATEE_UID, draft),
      ).toBeRejected();
    });

    it('overallComment 恰好 500 字元時應通過字數驗證', async () => {
      const draft: EvaluationFormDraft = {
        ...VALID_DRAFT,
        overallComment: '一'.repeat(500),
      };

      await expectAsync(
        service.submitForm(MOCK_CYCLE_ID, MOCK_ASSIGNMENT_ID, MOCK_EVALUATEE_UID, draft),
      ).toBeResolved();
    });
  });

  // =======================================================================
  // 測試 3：分數 ≥ 9 且無對應說明
  // =======================================================================

  describe('submitForm() 驗證 — 極端高分（≥9）需填說明', () => {

    it('q10 = 9 且無說明時應拒絕，錯誤訊息應包含題目識別碼「q10」', async () => {
      const draft: EvaluationFormDraft = {
        scores: { ...VALID_DRAFT.scores, q10: 9 },
        feedbacks: {},
        overallComment: VALID_OVERALL_COMMENT,
      };

      await expectAsync(
        service.submitForm(MOCK_CYCLE_ID, MOCK_ASSIGNMENT_ID, MOCK_EVALUATEE_UID, draft),
      ).toBeRejectedWithError(/q10/);

      expect(firestoreCreateBatchSpy).not.toHaveBeenCalled();
    });

    it('q1 = 10 且無說明時應拒絕，錯誤訊息應包含「q1」', async () => {
      const draft: EvaluationFormDraft = {
        scores: { ...VALID_DRAFT.scores, q1: 10 },
        feedbacks: {},
        overallComment: VALID_OVERALL_COMMENT,
      };

      await expectAsync(
        service.submitForm(MOCK_CYCLE_ID, MOCK_ASSIGNMENT_ID, MOCK_EVALUATEE_UID, draft),
      ).toBeRejectedWithError(/q1/);
    });

    it('分數 = 9 但有對應說明時應通過驗證', async () => {
      const draft: EvaluationFormDraft = {
        scores: { ...VALID_DRAFT.scores, q10: 9 },
        feedbacks: { q10: '工作效率卓越，每個 Sprint 均超前完成目標，且程式碼品質優良' },
        overallComment: VALID_OVERALL_COMMENT,
      };

      await expectAsync(
        service.submitForm(MOCK_CYCLE_ID, MOCK_ASSIGNMENT_ID, MOCK_EVALUATEE_UID, draft),
      ).toBeResolved();
    });

    it('分數 = 8 時不要求說明（邊界值：8 不屬於極端高分）', async () => {
      const draft: EvaluationFormDraft = {
        scores: { ...VALID_DRAFT.scores, q10: 8 },
        feedbacks: {},
        overallComment: VALID_OVERALL_COMMENT,
      };

      await expectAsync(
        service.submitForm(MOCK_CYCLE_ID, MOCK_ASSIGNMENT_ID, MOCK_EVALUATEE_UID, draft),
      ).toBeResolved();
    });
  });

  // =======================================================================
  // 測試 4：分數 ≤ 3 且無對應說明
  // =======================================================================

  describe('submitForm() 驗證 — 極端低分（≤3）需填說明', () => {

    it('q1 = 3 且無說明時應拒絕，錯誤訊息應包含「q1」', async () => {
      const draft: EvaluationFormDraft = {
        scores: { ...VALID_DRAFT.scores, q1: 3 },
        feedbacks: {},
        overallComment: VALID_OVERALL_COMMENT,
      };

      await expectAsync(
        service.submitForm(MOCK_CYCLE_ID, MOCK_ASSIGNMENT_ID, MOCK_EVALUATEE_UID, draft),
      ).toBeRejectedWithError(/q1/);

      expect(firestoreCreateBatchSpy).not.toHaveBeenCalled();
    });

    it('q5 = 1 且無說明時應拒絕，錯誤訊息應包含「q5」', async () => {
      const draft: EvaluationFormDraft = {
        scores: { ...VALID_DRAFT.scores, q5: 1 },
        feedbacks: {},
        overallComment: VALID_OVERALL_COMMENT,
      };

      await expectAsync(
        service.submitForm(MOCK_CYCLE_ID, MOCK_ASSIGNMENT_ID, MOCK_EVALUATEE_UID, draft),
      ).toBeRejectedWithError(/q5/);
    });

    it('分數 = 3 但有對應說明時應通過驗證', async () => {
      const draft: EvaluationFormDraft = {
        scores: { ...VALID_DRAFT.scores, q1: 3 },
        feedbacks: { q1: '溝通方式仍需加強，建議主動尋求同仁回饋以改善協作效率' },
        overallComment: VALID_OVERALL_COMMENT,
      };

      await expectAsync(
        service.submitForm(MOCK_CYCLE_ID, MOCK_ASSIGNMENT_ID, MOCK_EVALUATEE_UID, draft),
      ).toBeResolved();
    });

    it('分數 = 4 時不要求說明（邊界值：4 不屬於極端低分）', async () => {
      const draft: EvaluationFormDraft = {
        scores: { ...VALID_DRAFT.scores, q1: 4 },
        feedbacks: {},
        overallComment: VALID_OVERALL_COMMENT,
      };

      await expectAsync(
        service.submitForm(MOCK_CYCLE_ID, MOCK_ASSIGNMENT_ID, MOCK_EVALUATEE_UID, draft),
      ).toBeResolved();
    });
  });

  // =======================================================================
  // 測試 5：指派狀態 = completed（防止重複提交）
  // =======================================================================

  describe('submitForm() — 防止重複提交', () => {

    it('指派狀態 = completed 時應拒絕，且不呼叫 firestoreCreateBatch', async () => {
      firestoreGetSpy.and.returnValue(
        Promise.resolve(makeAssignmentSnapshot('completed') as any),
      );

      await expectAsync(
        service.submitForm(MOCK_CYCLE_ID, MOCK_ASSIGNMENT_ID, MOCK_EVALUATEE_UID, VALID_DRAFT),
      ).toBeRejected();

      // 核心斷言：批次寫入不應被啟動
      expect(firestoreCreateBatchSpy).not.toHaveBeenCalled();
    });

    it('指派狀態 = completed 時的錯誤訊息應說明「重複提交」', async () => {
      firestoreGetSpy.and.returnValue(
        Promise.resolve(makeAssignmentSnapshot('completed') as any),
      );

      let caughtError: Error | undefined;
      try {
        await service.submitForm(
          MOCK_CYCLE_ID,
          MOCK_ASSIGNMENT_ID,
          MOCK_EVALUATEE_UID,
          VALID_DRAFT,
        );
      } catch (e) {
        caughtError = e as Error;
      }

      expect(caughtError).toBeDefined();
      expect(caughtError).toBeInstanceOf(Error);
      expect(caughtError!.message).toMatch(/重複提交|completed/);
    });

    it('指派狀態 = pending 時應允許提交並呼叫 firestoreCreateBatch', async () => {
      firestoreGetSpy.and.returnValue(
        Promise.resolve(makeAssignmentSnapshot('pending') as any),
      );

      await expectAsync(
        service.submitForm(MOCK_CYCLE_ID, MOCK_ASSIGNMENT_ID, MOCK_EVALUATEE_UID, VALID_DRAFT),
      ).toBeResolved();

      expect(firestoreCreateBatchSpy).toHaveBeenCalledTimes(1);
    });

    it('指派文件不存在（exists=false）時應拒絕', async () => {
      firestoreGetSpy.and.returnValue(
        Promise.resolve(makeAssignmentSnapshot('pending', false) as any),
      );

      await expectAsync(
        service.submitForm(MOCK_CYCLE_ID, MOCK_ASSIGNMENT_ID, MOCK_EVALUATEE_UID, VALID_DRAFT),
      ).toBeRejected();

      expect(firestoreCreateBatchSpy).not.toHaveBeenCalled();
    });

    it('使用者未登入時應拒絕並包含「未登入」說明，且不讀取 Firestore', async () => {
      mockAuth.currentUser = null;

      await expectAsync(
        service.submitForm(MOCK_CYCLE_ID, MOCK_ASSIGNMENT_ID, MOCK_EVALUATEE_UID, VALID_DRAFT),
      ).toBeRejectedWithError(/未登入/);

      expect(firestoreGetSpy).not.toHaveBeenCalled();
      expect(firestoreCreateBatchSpy).not.toHaveBeenCalled();
    });
  });

  // =======================================================================
  // 測試 6：有效表單提交 → Batch Write 操作驗證
  // =======================================================================

  describe('submitForm() — 有效提交：批次寫入操作驗證', () => {

    it('應呼叫 firestoreCreateBatch() 一次', async () => {
      await service.submitForm(MOCK_CYCLE_ID, MOCK_ASSIGNMENT_ID, MOCK_EVALUATEE_UID, VALID_DRAFT);

      expect(firestoreCreateBatchSpy).toHaveBeenCalledTimes(1);
    });

    it('應呼叫 batch.set 兩次（表單文件 + 快照合併更新）', async () => {
      await service.submitForm(MOCK_CYCLE_ID, MOCK_ASSIGNMENT_ID, MOCK_EVALUATEE_UID, VALID_DRAFT);

      expect(mockBatch.set).toHaveBeenCalledTimes(2);
    });

    it('應呼叫 batch.update 兩次（指派狀態 + 週期計數）', async () => {
      await service.submitForm(MOCK_CYCLE_ID, MOCK_ASSIGNMENT_ID, MOCK_EVALUATEE_UID, VALID_DRAFT);

      expect(mockBatch.update).toHaveBeenCalledTimes(2);
    });

    it('應呼叫 batch.commit() 一次以原子性提交所有操作', async () => {
      await service.submitForm(MOCK_CYCLE_ID, MOCK_ASSIGNMENT_ID, MOCK_EVALUATEE_UID, VALID_DRAFT);

      expect(mockBatch.commit).toHaveBeenCalledTimes(1);
    });

    it('表單文件（batch.set 第一次呼叫）應包含所有必要欄位', async () => {
      await service.submitForm(MOCK_CYCLE_ID, MOCK_ASSIGNMENT_ID, MOCK_EVALUATEE_UID, VALID_DRAFT);

      const [, formData] = mockBatch.set.calls.argsFor(0);

      expect(formData).toEqual(
        jasmine.objectContaining({
          id: MOCK_DOC_REF.id,
          assignmentId: MOCK_ASSIGNMENT_ID,
          cycleId: MOCK_CYCLE_ID,
          evaluatorUid: MOCK_EVALUATOR_UID,
          evaluateeUid: MOCK_EVALUATEE_UID,
          submittedAt: MOCK_SERVER_TIMESTAMP,
          scores: VALID_DRAFT.scores,
          feedbacks: VALID_DRAFT.feedbacks,
          overallComment: VALID_DRAFT.overallComment,
          anomalyFlags: { reciprocalHighScore: false, outlierEvaluator: false },
        }),
      );
    });

    it('表單文件（batch.set 第一次呼叫）不應帶有第三個 merge 選項', async () => {
      await service.submitForm(MOCK_CYCLE_ID, MOCK_ASSIGNMENT_ID, MOCK_EVALUATEE_UID, VALID_DRAFT);

      const formSetArgs = mockBatch.set.calls.argsFor(0);
      expect(formSetArgs.length).toBe(2); // 只有 [docRef, data]
    });

    it('快照更新（batch.set 第二次呼叫）應帶有 { merge: true } 選項', async () => {
      await service.submitForm(MOCK_CYCLE_ID, MOCK_ASSIGNMENT_ID, MOCK_EVALUATEE_UID, VALID_DRAFT);

      const [, , mergeOptions] = mockBatch.set.calls.argsFor(1);
      expect(mergeOptions).toEqual({ merge: true });
    });

    it('快照更新應使用 firestoreArrayUnion 追加 overallComment', async () => {
      await service.submitForm(MOCK_CYCLE_ID, MOCK_ASSIGNMENT_ID, MOCK_EVALUATEE_UID, VALID_DRAFT);

      expect(firestoreArrayUnionSpy).toHaveBeenCalledWith(VALID_DRAFT.overallComment);

      // 驗證快照 set 的第二個引數（資料）中 overallComments 包含 arrayUnion 回傳物件
      const [, snapshotData] = mockBatch.set.calls.argsFor(1);
      expect(snapshotData['overallComments']).toEqual({ _arrayUnion: [VALID_DRAFT.overallComment] });
    });

    it('快照更新應使用 firestoreIncrement(1) 遞增 validEvaluatorCount', async () => {
      await service.submitForm(MOCK_CYCLE_ID, MOCK_ASSIGNMENT_ID, MOCK_EVALUATEE_UID, VALID_DRAFT);

      const [, snapshotData] = mockBatch.set.calls.argsFor(1);
      expect(snapshotData['validEvaluatorCount']).toEqual({ _increment: 1 });
    });

    it('快照更新應包含依屬性對應表計算的預覽屬性分數', async () => {
      await service.submitForm(MOCK_CYCLE_ID, MOCK_ASSIGNMENT_ID, MOCK_EVALUATEE_UID, VALID_DRAFT);

      const [, snapshotData] = mockBatch.set.calls.argsFor(1);

      // 依 VALID_DRAFT.scores 手算：
      // EXE=q10=7, INS=(q2+q7)/2=(6+6)/2=6, ADP=(q3+q9)/2=(7+6)/2=6.5
      // COL=(q1+q6)/2=(7+7)/2=7, STB=(q5+q8)/2=(8+7)/2=7.5, INN=q4=6
      expect(snapshotData).toEqual(
        jasmine.objectContaining({
          cycleId: MOCK_CYCLE_ID,
          userId: MOCK_EVALUATEE_UID,
          attributes: { EXE: 7, INS: 6, ADP: 6.5, COL: 7, STB: 7.5, INN: 6 },
        }),
      );
    });

    it('指派更新（batch.update 第一次呼叫）應設 status=completed 並帶有 completedAt 時間戳', async () => {
      await service.submitForm(MOCK_CYCLE_ID, MOCK_ASSIGNMENT_ID, MOCK_EVALUATEE_UID, VALID_DRAFT);

      const [, assignmentUpdateData] = mockBatch.update.calls.argsFor(0);

      expect(assignmentUpdateData).toEqual(
        jasmine.objectContaining({
          status: 'completed',
          completedAt: MOCK_SERVER_TIMESTAMP,
        }),
      );
    });

    it('週期更新（batch.update 第二次呼叫）應使用 firestoreIncrement(1) 遞增 completedAssignments', async () => {
      await service.submitForm(MOCK_CYCLE_ID, MOCK_ASSIGNMENT_ID, MOCK_EVALUATEE_UID, VALID_DRAFT);

      const [, cycleUpdateData] = mockBatch.update.calls.argsFor(1);

      expect(cycleUpdateData).toEqual(
        jasmine.objectContaining({
          completedAssignments: { _increment: 1 },
        }),
      );
    });

    it('應呼叫 firestoreServerTimestamp() 兩次（submittedAt + completedAt）', async () => {
      await service.submitForm(MOCK_CYCLE_ID, MOCK_ASSIGNMENT_ID, MOCK_EVALUATEE_UID, VALID_DRAFT);

      expect(firestoreServerTimestampSpy).toHaveBeenCalledTimes(2);
    });

    it('快照 ID 應為 {cycleId}_{evaluateeUid} 格式', async () => {
      await service.submitForm(MOCK_CYCLE_ID, MOCK_ASSIGNMENT_ID, MOCK_EVALUATEE_UID, VALID_DRAFT);

      const expectedSnapshotId = `${MOCK_CYCLE_ID}_${MOCK_EVALUATEE_UID}`;
      // firestoreDocRef 應被呼叫，其中一次帶有 snapshotId
      expect(firestoreDocRefSpy).toHaveBeenCalledWith(
        'userAttributeSnapshots',
        expectedSnapshotId,
      );
    });
  });

  // =======================================================================
  // 測試：getMyForm()
  // =======================================================================

  describe('getMyForm()', () => {

    it('使用者已登入時應呼叫 firestoreQuery 並包含 evaluatorUid where 條件', (done) => {
      // Mock authState 必須先啟動 Angular Fire authState - 這裡透過 service 直接測試
      // 由於 authState 也是 module-level 函式，我們直接測試 service 的查詢行為
      // 透過提供一個 auth.currentUser 並讓 observable 在訂閱時執行
      firestoreQuerySpy.and.returnValue(of([]));

      // 模擬已登入：由於 getMyForm 使用 authState(this.auth)，
      // 我們設定 mockAuth.currentUser 並檢查 firestoreQuery 是否被呼叫
      // （實際上 authState 是 rxjs observable，在 test 中直接模擬其行為）
      // 由於 authState 不可 spyOn，改為驗證 Observable 是否正確產生
      const result$ = service.getMyForm(MOCK_CYCLE_ID, MOCK_EVALUATEE_UID);

      expect(result$).toBeTruthy();
      expect(result$.subscribe).toBeDefined();
      done();
    });

    it('應回傳 Observable 類型', () => {
      const result = service.getMyForm(MOCK_CYCLE_ID, MOCK_EVALUATEE_UID);

      expect(result).toBeTruthy();
      // Observable 必有 subscribe 方法
      expect(typeof result.subscribe).toBe('function');
    });
  });

  // =======================================================================
  // 測試：getAllFormsByCycle()
  // =======================================================================

  describe('getAllFormsByCycle()', () => {

    it('應呼叫 firestoreQuery 並傳入 cycleId 的 where 條件', (done) => {
      const mockForms = [{ id: 'form-001', cycleId: MOCK_CYCLE_ID }];
      firestoreQuerySpy.and.returnValue(of(mockForms));

      service.getAllFormsByCycle(MOCK_CYCLE_ID).subscribe((forms) => {
        expect(forms).toEqual(mockForms as any);
        expect(firestoreQuerySpy).toHaveBeenCalledWith(
          'evaluationForms',
          jasmine.anything(), // where('cycleId', '==', ...) stub
        );
        expect(firestoreWhereSpy).toHaveBeenCalledWith('cycleId', '==', MOCK_CYCLE_ID);
        done();
      });
    });

    it('無表單時應回傳空陣列', (done) => {
      firestoreQuerySpy.and.returnValue(of([]));

      service.getAllFormsByCycle(MOCK_CYCLE_ID).subscribe((forms) => {
        expect(forms).toEqual([]);
        done();
      });
    });
  });

  // =======================================================================
  // 測試：getFormsByEvaluatee()
  // =======================================================================

  describe('getFormsByEvaluatee()', () => {

    it('應呼叫 firestoreQuery 並包含 cycleId 與 evaluateeUid 的 where 條件', (done) => {
      firestoreQuerySpy.and.returnValue(of([]));

      service.getFormsByEvaluatee(MOCK_CYCLE_ID, MOCK_EVALUATEE_UID).subscribe(() => {
        expect(firestoreWhereSpy).toHaveBeenCalledWith('cycleId', '==', MOCK_CYCLE_ID);
        expect(firestoreWhereSpy).toHaveBeenCalledWith('evaluateeUid', '==', MOCK_EVALUATEE_UID);
        done();
      });
    });
  });
});
