/**
 * EvaluationCycleService 單元測試（T010）
 *
 * 使用 Karma/Jasmine + jasmine.createSpyObj 模擬 Firestore 與 Auth。
 * 透過 spyOn 攔截 @angular/fire/firestore 的模組層級函式，
 * 搭配 TestBed.configureTestingModule 支援 inject() 相依注入。
 *
 * 測試案例：
 *  1. createCycle：驗證寫入欄位正確（name, type, year, status, totalAssignments,
 *                  completedAssignments, createdBy, startDate, deadline, createdAt）
 *  2. createCycle：使用者未登入時拋出錯誤
 *  3. updateDeadline：正確呼叫 updateDoc 並傳入新截止日期
 *  4. incrementCompletedAssignments：使用 increment(1) 遞增 completedAssignments
 *  5. closeAndPublish（status=active）：更新 status=closed + closedAt
 *  6. closeAndPublish（status=expired_pending）：允許關閉
 *  7. closeAndPublish（status=closed）：拋出錯誤（拒絕重複關閉）
 *  8. closeAndPublish（文件不存在）：拋出錯誤
 *
 * T030 補充測試案例（closeAndPublish 完整流程）：
 *  9.  mock ZScoreCalculatorService → batch 寫入正確快照（status=final, 校正後 totalScore）
 *  10. anomalyFlags 正確更新
 *  11. cycle status → closed
 *  12. 逾期 assignment status → overdue
 */

import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { Timestamp } from 'firebase/firestore';

import { Firestore } from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';

import { EvaluationCycleService } from './evaluation-cycle.service';
import { ZScoreCalculatorService } from './zscore-calculator.service';
import {
  EvaluationCycle,
  EvaluationForm,
  EvaluationFormScores,
  AttributeScores,
} from '../models/evaluation.models';

// =====================
// 測試常數
// =====================

const MOCK_CYCLE_ID = 'mock-cycle-id-001';
const MOCK_USER_UID = 'mock-user-uid-001';

/** 模擬 DocumentReference（含 id 屬性供 createCycle 讀取） */
const MOCK_DOC_REF = { id: MOCK_CYCLE_ID, path: `evaluationCycles/${MOCK_CYCLE_ID}` } as const;

/** 模擬 CollectionReference */
const MOCK_COLLECTION_REF = {} as any;

/** 模擬 serverTimestamp 回傳值 */
const MOCK_SERVER_TIMESTAMP = { _type: 'serverTimestamp' } as unknown as ReturnType<
  typeof import('@angular/fire/firestore').serverTimestamp
>;

/** 建立 active 狀態週期的模擬快照 */
function makeDocSnapshot(status: EvaluationCycle['status'], exists = true) {
  return {
    exists: () => exists,
    data: () =>
      exists
        ? ({
            id: MOCK_CYCLE_ID,
            name: '模擬週期',
            type: 'H1',
            year: 2026,
            status,
            totalAssignments: 5,
            completedAssignments: 3,
            createdBy: MOCK_USER_UID,
            createdAt: {} as Timestamp,
          } as EvaluationCycle)
        : undefined,
  };
}

// =====================
// 測試套件
// =====================

describe('EvaluationCycleService', () => {
  let service: EvaluationCycleService;

  // 模擬 DI 相依
  let mockFirestore: jasmine.SpyObj<Firestore>;
  let mockAuth: { currentUser: { uid: string } | null };
  let mockZScoreCalculator: jasmine.SpyObj<ZScoreCalculatorService>;

  // 模擬 Firestore 函式（透過 service._fn 介面，避免 ES module non-configurable 限制）
  let setDocSpy: jasmine.Spy;
  let updateDocSpy: jasmine.Spy;
  let docSpy: jasmine.Spy;
  let collectionSpy: jasmine.Spy;
  let getDocSpy: jasmine.Spy;
  let getDocsSpy: jasmine.Spy;
  let serverTimestampSpy: jasmine.Spy;
  let collectionDataSpy: jasmine.Spy;
  let docDataSpy: jasmine.Spy;
  let querySpy: jasmine.Spy;
  let orderBySpy: jasmine.Spy;
  let whereSpy: jasmine.Spy;
  let incrementSpy: jasmine.Spy;
  let writeBatchSpy: jasmine.Spy;

  /** 模擬 WriteBatch */
  const MOCK_BATCH = {
    update: jasmine.createSpy('batch.update'),
    set: jasmine.createSpy('batch.set'),
    delete: jasmine.createSpy('batch.delete'),
    commit: jasmine.createSpy('batch.commit').and.returnValue(Promise.resolve()),
  };

  beforeEach(() => {
    // ── 建立 DI token 的模擬物件 ──────────────────────────────────────────
    mockFirestore = jasmine.createSpyObj('Firestore', ['_dummy']);
    mockAuth = { currentUser: { uid: MOCK_USER_UID } };
    mockZScoreCalculator = jasmine.createSpyObj('ZScoreCalculatorService', ['compute']);

    // 預設 compute 回傳空結果
    mockZScoreCalculator.compute.and.returnValue({
      snapshots: new Map(),
      anomalousFormIds: new Map(),
    });

    // 重置 batch spies
    MOCK_BATCH.update.calls.reset();
    MOCK_BATCH.set.calls.reset();
    MOCK_BATCH.commit.calls.reset();

    // ── TestBed 設定（支援 inject() 相依注入）────────────────────────────
    TestBed.configureTestingModule({
      providers: [
        EvaluationCycleService,
        { provide: Firestore, useValue: mockFirestore },
        { provide: Auth, useValue: mockAuth },
        { provide: ZScoreCalculatorService, useValue: mockZScoreCalculator },
      ],
    });

    service = TestBed.inject(EvaluationCycleService);

    // ── 攔截 service._fn 物件的函式參照（instance 屬性，可直接替換，不受 ES module 限制）
    setDocSpy = service._fn.setDoc = jasmine.createSpy('setDoc').and.returnValue(Promise.resolve()) as any;
    updateDocSpy = service._fn.updateDoc = jasmine.createSpy('updateDoc').and.returnValue(Promise.resolve()) as any;
    docSpy = service._fn.doc = jasmine.createSpy('doc').and.returnValue(MOCK_DOC_REF as any) as any;
    collectionSpy = service._fn.collection = jasmine.createSpy('collection').and.returnValue(MOCK_COLLECTION_REF as any) as any;
    getDocSpy = service._fn.getDoc = jasmine.createSpy('getDoc').and.returnValue(
      Promise.resolve(makeDocSnapshot('active') as any),
    ) as any;
    getDocsSpy = service._fn.getDocs = jasmine.createSpy('getDocs').and.returnValue(
      Promise.resolve({ docs: [] } as any),
    ) as any;
    serverTimestampSpy = service._fn.serverTimestamp = jasmine.createSpy('serverTimestamp').and.returnValue(
      MOCK_SERVER_TIMESTAMP,
    ) as any;
    collectionDataSpy = service._fn.collectionData = jasmine.createSpy('collectionData').and.returnValue(of([])) as any;
    docDataSpy = service._fn.docData = jasmine.createSpy('docData').and.returnValue(of(undefined)) as any;
    querySpy = service._fn.query = jasmine.createSpy('query').and.returnValue({} as any) as any;
    orderBySpy = service._fn.orderBy = jasmine.createSpy('orderBy').and.returnValue({} as any) as any;
    whereSpy = service._fn.where = jasmine.createSpy('where').and.returnValue({} as any) as any;
    incrementSpy = service._fn.increment = jasmine.createSpy('increment').and.callFake(
      (n: number) => ({ _increment: n }) as any,
    ) as any;
    writeBatchSpy = service._fn.writeBatch = jasmine.createSpy('writeBatch').and.returnValue(MOCK_BATCH as any) as any;
  });

  // =====================
  // 測試 1 & 2：createCycle
  // =====================

  describe('createCycle()', () => {
    const MOCK_START_DATE = { seconds: 1740787200, nanoseconds: 0 } as Timestamp;
    const MOCK_DEADLINE = { seconds: 1743379200, nanoseconds: 0 } as Timestamp;

    const CYCLE_INPUT = {
      name: '2026 上半年考核',
      type: 'H1' as const,
      year: 2026,
      startDate: MOCK_START_DATE,
      deadline: MOCK_DEADLINE,
    };

    it('應寫入正確欄位：name, type, year, status=active, totalAssignments=0, completedAssignments=0, createdBy, startDate, deadline, createdAt', async () => {
      const cycleId = await service.createCycle(CYCLE_INPUT);

      // 回傳值應為模擬 doc ref 的 id
      expect(cycleId).toBe(MOCK_CYCLE_ID);

      // 驗證 setDoc 被呼叫一次，且傳入的資料欄位正確
      expect(setDocSpy).toHaveBeenCalledOnceWith(
        MOCK_DOC_REF,
        jasmine.objectContaining({
          id: MOCK_CYCLE_ID,
          name: '2026 上半年考核',
          type: 'H1',
          year: 2026,
          startDate: MOCK_START_DATE,
          deadline: MOCK_DEADLINE,
          status: 'active',
          totalAssignments: 0,
          completedAssignments: 0,
          createdBy: MOCK_USER_UID,
          createdAt: MOCK_SERVER_TIMESTAMP,
        }),
      );
    });

    it('應呼叫 serverTimestamp() 以產生 createdAt 伺服器時間', async () => {
      await service.createCycle(CYCLE_INPUT);
      expect(serverTimestampSpy).toHaveBeenCalled();
    });

    it('使用者未登入時應拋出「使用者未登入」錯誤，且不應呼叫 setDoc', async () => {
      // 模擬未登入
      mockAuth.currentUser = null;

      await expectAsync(service.createCycle(CYCLE_INPUT)).toBeRejectedWithError(
        '使用者未登入，無法建立評核週期',
      );
      expect(setDocSpy).not.toHaveBeenCalled();
    });
  });

  // =====================
  // 測試 3：updateDeadline
  // =====================

  describe('updateDeadline()', () => {
    it('應正確呼叫 updateDoc，傳入新截止日期', async () => {
      const newDeadline = { seconds: 1746057600, nanoseconds: 0 } as Timestamp;

      await service.updateDeadline(MOCK_CYCLE_ID, newDeadline);

      // 驗證 doc() 以正確路徑被呼叫
      expect(docSpy).toHaveBeenCalledWith(mockFirestore, 'evaluationCycles', MOCK_CYCLE_ID);

      // 驗證 updateDoc 被呼叫一次，且只更新 deadline
      expect(updateDocSpy).toHaveBeenCalledOnceWith(MOCK_DOC_REF, { deadline: newDeadline });
    });

    it('應不更動 deadline 以外的其他欄位', async () => {
      const newDeadline = { seconds: 1746057600, nanoseconds: 0 } as Timestamp;
      await service.updateDeadline(MOCK_CYCLE_ID, newDeadline);

      const callArgs = updateDocSpy.calls.mostRecent().args[1] as Record<string, unknown>;
      // 更新物件中只應含有 deadline 鍵
      expect(Object.keys(callArgs)).toEqual(['deadline']);
    });
  });

  // =====================
  // 測試 4：completedAssignments increment 邏輯
  // =====================

  describe('incrementCompletedAssignments()', () => {
    it('應呼叫 updateDoc，並以 increment(1) 遞增 completedAssignments', async () => {
      await service.incrementCompletedAssignments(MOCK_CYCLE_ID);

      // 驗證 increment 以 1 被呼叫
      expect(incrementSpy).toHaveBeenCalledOnceWith(1);

      // 驗證 updateDoc 的第二個參數包含 increment(1) 回傳值
      expect(updateDocSpy).toHaveBeenCalledOnceWith(
        MOCK_DOC_REF,
        jasmine.objectContaining({
          completedAssignments: { _increment: 1 },
        }),
      );
    });

    it('每次呼叫只遞增 1（不批次遞增）', async () => {
      await service.incrementCompletedAssignments(MOCK_CYCLE_ID);
      const passedValue = (updateDocSpy.calls.mostRecent().args[1] as Record<string, unknown>)[
        'completedAssignments'
      ] as { _increment: number };
      expect(passedValue._increment).toBe(1);
    });
  });

  // =====================
  // 測試 5–8：closeAndPublish 前置條件驗證
  // =====================

  describe('closeAndPublish()', () => {
    it('status=active 時應將 status 設為 closed，並寫入 closedAt', async () => {
      getDocSpy.and.returnValue(Promise.resolve(makeDocSnapshot('active') as any));

      await service.closeAndPublish(MOCK_CYCLE_ID);

      // closeAndPublish 使用 writeBatch，週期狀態更新透過 batch.update()
      expect(MOCK_BATCH.update).toHaveBeenCalledWith(
        MOCK_DOC_REF,
        jasmine.objectContaining({
          status: 'closed',
          closedAt: MOCK_SERVER_TIMESTAMP,
        }),
      );
    });

    it('status=expired_pending 時也應允許關閉（不拋出錯誤）', async () => {
      getDocSpy.and.returnValue(Promise.resolve(makeDocSnapshot('expired_pending') as any));

      await expectAsync(service.closeAndPublish(MOCK_CYCLE_ID)).toBeResolved();
      expect(MOCK_BATCH.update).toHaveBeenCalled();
    });

    it('關閉時應呼叫 serverTimestamp() 以產生 closedAt', async () => {
      getDocSpy.and.returnValue(Promise.resolve(makeDocSnapshot('active') as any));

      await service.closeAndPublish(MOCK_CYCLE_ID);

      // serverTimestamp 應至少被呼叫一次（供 closedAt 使用）
      expect(serverTimestampSpy).toHaveBeenCalled();
    });

    it('status=closed 時應拋出錯誤，且不應呼叫 updateDoc（防止重複關閉）', async () => {
      getDocSpy.and.returnValue(Promise.resolve(makeDocSnapshot('closed') as any));

      await expectAsync(service.closeAndPublish(MOCK_CYCLE_ID)).toBeRejectedWithError(
        /closed/,
      );
      expect(updateDocSpy).not.toHaveBeenCalled();
    });

    it('status 非 active/expired_pending 時，錯誤訊息應包含目前狀態', async () => {
      getDocSpy.and.returnValue(Promise.resolve(makeDocSnapshot('closed') as any));

      let caughtError: Error | undefined;
      try {
        await service.closeAndPublish(MOCK_CYCLE_ID);
      } catch (e) {
        caughtError = e as Error;
      }

      expect(caughtError).toBeDefined();
      expect(caughtError!.message).toContain('closed');
    });

    it('週期文件不存在時應拋出錯誤', async () => {
      // exists() 回傳 false
      getDocSpy.and.returnValue(
        Promise.resolve({ exists: () => false, data: () => undefined } as any),
      );

      await expectAsync(service.closeAndPublish('non-existent-cycle')).toBeRejected();
      expect(updateDocSpy).not.toHaveBeenCalled();
    });
  });

  // =====================
  // 測試：getCycles
  // =====================

  describe('getCycles()', () => {
    it('應呼叫 collection 和 orderBy，並回傳 Observable', (done) => {
      const mockCycles: EvaluationCycle[] = [];
      collectionDataSpy.and.returnValue(of(mockCycles));

      service.getCycles().subscribe((cycles) => {
        expect(cycles).toEqual(mockCycles);
        expect(collectionSpy).toHaveBeenCalledWith(mockFirestore, 'evaluationCycles');
        expect(orderBySpy).toHaveBeenCalledWith('createdAt', 'desc');
        done();
      });
    });
  });

  // =====================
  // 測試：getCycleById
  // =====================

  describe('getCycleById()', () => {
    it('文件存在時應回傳 EvaluationCycle', (done) => {
      const mockCycle: EvaluationCycle = {
        id: MOCK_CYCLE_ID,
        name: '模擬週期',
        type: 'H1',
        year: 2026,
        status: 'active',
        totalAssignments: 0,
        completedAssignments: 0,
        createdBy: MOCK_USER_UID,
        createdAt: {} as Timestamp,
        startDate: {} as Timestamp,
        deadline: {} as Timestamp,
      };
      docDataSpy.and.returnValue(of(mockCycle));

      service.getCycleById(MOCK_CYCLE_ID).subscribe((cycle) => {
        expect(cycle).toEqual(mockCycle);
        done();
      });
    });

    it('文件不存在（docData 回傳 undefined）時應回傳 null', (done) => {
      docDataSpy.and.returnValue(of(undefined));

      service.getCycleById('ghost-id').subscribe((cycle) => {
        expect(cycle).toBeNull();
        done();
      });
    });
  });

  // =====================
  // T030：closeAndPublish 完整流程單元測試
  // =====================

  describe('closeAndPublish() 完整流程（T030）', () => {
    /** 建立模擬考評表 */
    function makeMockForm(evaluatorUid: string, evaluateeUid: string): EvaluationForm {
      const scores: EvaluationFormScores = {
        q1: 7, q2: 7, q3: 7, q4: 7, q5: 7,
        q6: 7, q7: 7, q8: 7, q9: 7, q10: 7,
      };
      return {
        id: `form-${evaluatorUid}-${evaluateeUid}`,
        assignmentId: `assign-${evaluatorUid}`,
        cycleId: MOCK_CYCLE_ID,
        evaluatorUid,
        evaluateeUid,
        submittedAt: {} as Timestamp,
        scores,
        feedbacks: {},
        overallComment: '整體表現良好，持續保持。',
        anomalyFlags: { reciprocalHighScore: false, outlierEvaluator: false },
      };
    }

    /** 建立模擬快照 QueryDocumentSnapshot */
    function makeMockSnapshotDoc(userId: string, snapshotId: string) {
      return {
        id: snapshotId,
        data: () => ({
          id: snapshotId,
          cycleId: MOCK_CYCLE_ID,
          userId,
          status: 'preview',
          validEvaluatorCount: 2,
          attributes: { EXE: 7, INS: 7, ADP: 7, COL: 7, STB: 7, INN: 7 },
          totalScore: 42,
          careerArchetypes: [],
          overallComments: [],
        }),
      };
    }

    const EVALUATEE_UID_1 = 'evaluatee-t030-001';
    const EVALUATEE_UID_2 = 'evaluatee-t030-002';
    const SNAPSHOT_ID_1 = `${MOCK_CYCLE_ID}_${EVALUATEE_UID_1}`;
    const SNAPSHOT_ID_2 = `${MOCK_CYCLE_ID}_${EVALUATEE_UID_2}`;

    beforeEach(() => {
      // 讓 getDoc（用於讀取週期）回傳 active 狀態
      getDocSpy.and.returnValue(Promise.resolve(makeDocSnapshot('active') as any));
    });

    it('應呼叫 ZScoreCalculatorService.compute 並傳入表單陣列', async () => {
      const mockForms = [makeMockForm('evaluator-1', EVALUATEE_UID_1)];

      // getDocs 第一次（forms）回傳 1 筆，後續（assignments, snapshots）回傳空
      getDocsSpy.and.returnValues(
        Promise.resolve({ docs: mockForms.map(f => ({ id: f.id, data: () => f })) } as any),
        Promise.resolve({ docs: [] } as any),
        Promise.resolve({ docs: [] } as any),
      );

      await service.closeAndPublish(MOCK_CYCLE_ID);

      expect(mockZScoreCalculator.compute).toHaveBeenCalledOnceWith(
        jasmine.arrayContaining([jasmine.objectContaining({ evaluateeUid: EVALUATEE_UID_1 })])
      );
    });

    it('應建立 WriteBatch 並呼叫 commit', async () => {
      getDocsSpy.and.returnValue(Promise.resolve({ docs: [] } as any));

      await service.closeAndPublish(MOCK_CYCLE_ID);

      expect(writeBatchSpy).toHaveBeenCalled();
      expect(MOCK_BATCH.commit).toHaveBeenCalled();
    });

    it('batch 應更新 cycle 狀態為 closed + closedAt', async () => {
      getDocsSpy.and.returnValue(Promise.resolve({ docs: [] } as any));

      await service.closeAndPublish(MOCK_CYCLE_ID);

      expect(MOCK_BATCH.update).toHaveBeenCalledWith(
        MOCK_DOC_REF,
        jasmine.objectContaining({
          status: 'closed',
          closedAt: MOCK_SERVER_TIMESTAMP,
        }),
      );
    });

    it('存在快照時，batch 應更新快照 status=final 並包含校正後的 totalScore', async () => {
      const computedAttributes: AttributeScores = {
        EXE: 8.0, INS: 7.5, ADP: 7.2, COL: 8.1, STB: 7.8, INN: 6.9,
      };
      const computedTotalScore = 45.5;

      // mock ZScoreCalculatorService 回傳校正後結果
      mockZScoreCalculator.compute.and.returnValue({
        snapshots: new Map([
          [EVALUATEE_UID_1, {
            attributes: computedAttributes,
            totalScore: computedTotalScore,
            rankingScore: computedTotalScore,
            careerArchetypes: ['⚔️ 劍士'],
            validEvaluatorCount: 3,
          }],
        ]),
        anomalousFormIds: new Map(),
      });

      // getDocs：forms → 空，assignments → 空，snapshots → 1 筆
      getDocsSpy.and.returnValues(
        Promise.resolve({ docs: [] } as any),
        Promise.resolve({ docs: [] } as any),
        Promise.resolve({
          docs: [makeMockSnapshotDoc(EVALUATEE_UID_1, SNAPSHOT_ID_1)],
        } as any),
      );

      await service.closeAndPublish(MOCK_CYCLE_ID);

      // 驗證 batch.update 被呼叫時，包含 status=final 和校正後的 totalScore
      const updateCalls = MOCK_BATCH.update.calls.allArgs();
      const snapshotUpdateCall = updateCalls.find(
        (args: unknown[]) =>
          typeof (args[1] as Record<string, unknown>)?.['status'] === 'string' &&
          (args[1] as Record<string, unknown>)['status'] === 'final',
      );
      expect(snapshotUpdateCall).toBeDefined();
      expect((snapshotUpdateCall![1] as Record<string, unknown>)['totalScore']).toBe(computedTotalScore);
    });

    it('anomalyFlags 應正確寫入有異常的考評表', async () => {
      const formId = `form-evaluator-anomaly-${EVALUATEE_UID_1}`;
      const anomalyFlags = { reciprocalHighScore: true, outlierEvaluator: false };

      mockZScoreCalculator.compute.and.returnValue({
        snapshots: new Map(),
        anomalousFormIds: new Map([[formId, anomalyFlags]]),
      });

      getDocsSpy.and.returnValue(Promise.resolve({ docs: [] } as any));

      await service.closeAndPublish(MOCK_CYCLE_ID);

      // 應更新有異常的表單
      const updateCalls = MOCK_BATCH.update.calls.allArgs();
      const anomalyCall = updateCalls.find(
        (args: unknown[]) =>
          !!(args[1] as Record<string, unknown>)?.['anomalyFlags'],
      );
      expect(anomalyCall).toBeDefined();
      expect((anomalyCall![1] as Record<string, unknown>)['anomalyFlags']).toEqual(anomalyFlags);
    });

    it('pending 狀態的 assignment 應被更新為 overdue', async () => {
      const pendingAssignment = {
        id: 'pending-assignment-001',
        data: () => ({
          id: 'pending-assignment-001',
          cycleId: MOCK_CYCLE_ID,
          evaluatorUid: 'evaluator-pending',
          evaluateeUid: EVALUATEE_UID_1,
          status: 'pending',
        }),
      };

      // getDocs：forms → 空，assignments → 1 筆 pending，snapshots → 空
      getDocsSpy.and.returnValues(
        Promise.resolve({ docs: [] } as any),
        Promise.resolve({ docs: [pendingAssignment] } as any),
        Promise.resolve({ docs: [] } as any),
      );

      await service.closeAndPublish(MOCK_CYCLE_ID);

      // 應有一個 batch.update 呼叫更新為 overdue
      const updateCalls = MOCK_BATCH.update.calls.allArgs();
      const overdueCall = updateCalls.find(
        (args: unknown[]) =>
          (args[1] as Record<string, unknown>)?.['status'] === 'overdue',
      );
      expect(overdueCall).toBeDefined();
    });

    it('無考評表時（空週期）應仍能成功完成，不拋出錯誤', async () => {
      getDocsSpy.and.returnValue(Promise.resolve({ docs: [] } as any));

      await expectAsync(service.closeAndPublish(MOCK_CYCLE_ID)).toBeResolved();
      expect(MOCK_BATCH.commit).toHaveBeenCalled();
    });
  });
});
