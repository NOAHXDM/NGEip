import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { Timestamp } from 'firebase/firestore';
import { Auth } from '@angular/fire/auth';
import { Firestore } from '@angular/fire/firestore';

import { User } from '../../services/user.service';
import {
  EVALUATION_ASSIGNMENT_FIRESTORE_FNS,
  EVALUATION_ASSIGNMENT_RANDOM_FN,
  EvaluationAssignmentFirestoreFns,
  EvaluationAssignmentService,
} from './evaluation-assignment.service';
import { EvaluationAssignment } from '../models/evaluation.models';

const CYCLE_ID = 'cycle-001';
const DEFAULT_RANDOM_OPTIONS = {
  targetEvaluatorCount: 10,
  sameJobTitleMax: null,
};

function makeUser(uid: string, name: string, jobTitle: string, role: User['role'] = 'user'): User {
  return {
    uid,
    email: `${uid}@test.com`,
    name,
    jobTitle,
    remainingLeaveHours: 0,
    remoteWorkEligibility: 'N/A',
    remoteWorkRecommender: [],
    role,
  };
}

function makeAssignment(
  evaluatorUid: string,
  evaluateeUid: string,
  status: EvaluationAssignment['status'] = 'pending',
): EvaluationAssignment {
  return {
    id: `${evaluatorUid}_${CYCLE_ID}_${evaluateeUid}`,
    cycleId: CYCLE_ID,
    evaluatorUid,
    evaluateeUid,
    status,
    createdAt: {} as Timestamp,
  };
}

function makeSnapshot(exists: boolean): { exists: () => boolean } {
  return { exists: () => exists };
}

describe('EvaluationAssignmentService', () => {
  let service: EvaluationAssignmentService;
  let mockFirestore: jasmine.SpyObj<Firestore>;
  let mockAuth: jasmine.SpyObj<Auth>;
  let mockFns: EvaluationAssignmentFirestoreFns;
  let mockBatch: {
    set: jasmine.Spy;
    update: jasmine.Spy;
    delete: jasmine.Spy;
    commit: jasmine.Spy;
  };
  let mockTransaction: {
    get: jasmine.Spy;
    set: jasmine.Spy;
    update: jasmine.Spy;
  };

  function makeBatch() {
    return {
      set: jasmine.createSpy('batch.set'),
      update: jasmine.createSpy('batch.update'),
      delete: jasmine.createSpy('batch.delete'),
      commit: jasmine.createSpy('batch.commit').and.returnValue(Promise.resolve()),
    };
  }

  function makeTransaction() {
    return {
      get: jasmine.createSpy('transaction.get').and.returnValue(Promise.resolve(makeSnapshot(false) as any)),
      set: jasmine.createSpy('transaction.set'),
      update: jasmine.createSpy('transaction.update'),
    };
  }

  beforeEach(() => {
    mockFirestore = jasmine.createSpyObj('Firestore', ['_dummy']);
    mockAuth = jasmine.createSpyObj('Auth', ['_dummy']);
    mockBatch = makeBatch();
    mockTransaction = makeTransaction();
    mockFns = {
      collection: jasmine.createSpy('collection').and.returnValue({} as any) as any,
      collectionData: jasmine.createSpy('collectionData').and.returnValue(of([])) as any,
      doc: jasmine.createSpy('doc').and.callFake(
        (_firestore: unknown, collectionName: string, id: string) => ({ collectionName, id }) as any,
      ) as any,
      getDoc: jasmine.createSpy('getDoc').and.returnValue(Promise.resolve(makeSnapshot(false) as any)) as any,
      query: jasmine.createSpy('query').and.returnValue({} as any) as any,
      where: jasmine.createSpy('where').and.returnValue({} as any) as any,
      serverTimestamp: jasmine.createSpy('serverTimestamp').and.returnValue({ serverTimestamp: true } as any) as any,
      increment: jasmine.createSpy('increment').and.callFake((value: number) => ({ increment: value }) as any) as any,
      writeBatch: jasmine.createSpy('writeBatch').and.returnValue(mockBatch as any) as any,
      runTransaction: jasmine.createSpy('runTransaction').and.callFake(
        (_firestore: unknown, updateFn: (transaction: typeof mockTransaction) => Promise<unknown>) =>
          updateFn(mockTransaction),
      ) as any,
    };

    TestBed.configureTestingModule({
      providers: [
        EvaluationAssignmentService,
        { provide: Firestore, useValue: mockFirestore },
        { provide: Auth, useValue: mockAuth },
        { provide: EVALUATION_ASSIGNMENT_FIRESTORE_FNS, useValue: mockFns },
        { provide: EVALUATION_ASSIGNMENT_RANDOM_FN, useValue: () => 0.5 },
      ],
    });

    service = TestBed.inject(EvaluationAssignmentService);
  });

  describe('generateRandomAssignmentPreview()', () => {
    it('應排除管理員與自評，且每位受評者取得 min(10, 可用使用者總數 - 1) 位評核者', () => {
      const users = [
        makeUser('u1', '使用者1', '工程師'),
        makeUser('u2', '使用者2', '工程師'),
        makeUser('u3', '使用者3', '設計師'),
        makeUser('admin', '管理員', '工程師', 'admin'),
      ];

      const preview = service.generateRandomAssignmentPreview(CYCLE_ID, users, [], DEFAULT_RANDOM_OPTIONS);

      expect(preview.rows.length).toBe(3);
      for (const row of preview.rows) {
        expect(row.targetEvaluatorCount).toBe(2);
        expect(row.evaluatorUids.length).toBe(2);
        expect(row.evaluatorUids).not.toContain(row.evaluateeUid);
        expect(row.evaluatorUids).not.toContain('admin');
      }
    });

    it('可用使用者少於 2 位時應回傳空預覽', () => {
      const preview = service.generateRandomAssignmentPreview(CYCLE_ID, [
        makeUser('u1', '使用者1', '工程師'),
        makeUser('admin', '管理員', '工程師', 'admin'),
      ], [], DEFAULT_RANDOM_OPTIONS);

      expect(preview.rows).toEqual([]);
      expect(preview.evaluatorLoads['u1']).toBe(0);
    });

    it('只有 2 位可用使用者時應彼此互評', () => {
      const preview = service.generateRandomAssignmentPreview(CYCLE_ID, [
        makeUser('u1', '使用者1', '工程師'),
        makeUser('u2', '使用者2', '工程師'),
      ], [], DEFAULT_RANDOM_OPTIONS);

      expect(preview.rows.length).toBe(2);
      expect(preview.rows.find((row) => row.evaluateeUid === 'u1')?.evaluatorUids).toEqual(['u2']);
      expect(preview.rows.find((row) => row.evaluateeUid === 'u2')?.evaluatorUids).toEqual(['u1']);
    });

    it('缺 jobTitle 不應被視為同職稱群組', () => {
      const users = [
        makeUser('u1', '使用者1', ''),
        makeUser('u2', '使用者2', ''),
        makeUser('u3', '使用者3', '工程師'),
      ];

      const preview = service.generateRandomAssignmentPreview(CYCLE_ID, users, [], DEFAULT_RANDOM_OPTIONS);
      const row = preview.rows.find((item) => item.evaluateeUid === 'u1')!;

      expect(row.evaluatorUids.length).toBe(2);
      expect(row.warnings).toEqual([]);
    });

    it('可用使用者超過 10 位時，每位受評者最多只取 10 位評核者', () => {
      const users = Array.from({ length: 12 }, (_, index) =>
        makeUser(`u${index + 1}`, `使用者${index + 1}`, '工程師'),
      );

      const preview = service.generateRandomAssignmentPreview(CYCLE_ID, users, [], DEFAULT_RANDOM_OPTIONS);

      expect(preview.rows.length).toBe(12);
      for (const row of preview.rows) {
        expect(row.targetEvaluatorCount).toBe(10);
        expect(row.evaluatorUids.length).toBe(10);
        expect(row.evaluatorUids).not.toContain(row.evaluateeUid);
      }
    });

    it('指定受評採樣人數時，每位受評者應依介面輸入人數產生評核者', () => {
      const users = Array.from({ length: 12 }, (_, index) =>
        makeUser(`u${index + 1}`, `使用者${index + 1}`, '工程師'),
      );

      const preview = service.generateRandomAssignmentPreview(CYCLE_ID, users, [], {
        targetEvaluatorCount: 6,
        sameJobTitleMax: null,
      });

      expect(preview.rows.length).toBe(12);
      for (const row of preview.rows) {
        expect(row.targetEvaluatorCount).toBe(6);
        expect(row.evaluatorUids.length).toBe(6);
        expect(row.evaluatorUids).not.toContain(row.evaluateeUid);
      }
    });

    it('指定同職稱最大數時，每位受評者同 jobTitle 評核者不得超過上限', () => {
      const users = [
        makeUser('eng1', '工程師1', '工程師'),
        makeUser('eng2', '工程師2', '工程師'),
        makeUser('eng3', '工程師3', '工程師'),
        makeUser('eng4', '工程師4', '工程師'),
        makeUser('des1', '設計師1', '設計師'),
        makeUser('des2', '設計師2', '設計師'),
        makeUser('des3', '設計師3', '設計師'),
        makeUser('des4', '設計師4', '設計師'),
      ];
      const userMap = new Map(users.map((user) => [user.uid!, user]));

      const preview = service.generateRandomAssignmentPreview(CYCLE_ID, users, [], {
        targetEvaluatorCount: 4,
        sameJobTitleMax: 1,
      });

      for (const row of preview.rows) {
        const evaluateeJobTitle = userMap.get(row.evaluateeUid)?.jobTitle;
        const sameJobTitleCount = row.evaluatorUids.filter((uid) =>
          userMap.get(uid)?.jobTitle === evaluateeJobTitle,
        ).length;
        expect(row.sameJobTitleMax).toBe(1);
        expect(sameJobTitleCount).toBeLessThanOrEqual(1);
        expect(row.evaluatorUids.length).toBe(4);
      }
    });

    it('未指定同職稱最大數時，應依每位受評者同 jobTitle 人數扣除本人自動計算', () => {
      const users = [
        makeUser('eng1', '工程師1', '工程師'),
        makeUser('eng2', '工程師2', '工程師'),
        makeUser('eng3', '工程師3', '工程師'),
        makeUser('eng4', '工程師4', '工程師'),
        makeUser('eng5', '工程師5', '工程師'),
        makeUser('des1', '設計師1', '設計師'),
        makeUser('des2', '設計師2', '設計師'),
      ];

      const preview = service.generateRandomAssignmentPreview(CYCLE_ID, users, [], {
        targetEvaluatorCount: 4,
        sameJobTitleMax: null,
      });

      for (const row of preview.rows.filter((item) => item.evaluateeUid.startsWith('eng'))) {
        expect(row.sameJobTitleMax).toBe(4);
      }
      for (const row of preview.rows.filter((item) => item.evaluateeUid.startsWith('des'))) {
        expect(row.sameJobTitleMax).toBe(1);
      }
    });

    it('缺 jobTitle 的受評者同職稱最大數應為 0，且空白 jobTitle 不互相視為同職稱', () => {
      const users = [
        makeUser('u1', '使用者1', ''),
        makeUser('u2', '使用者2', ''),
        makeUser('u3', '使用者3', '工程師'),
        makeUser('u4', '使用者4', '設計師'),
      ];

      const preview = service.generateRandomAssignmentPreview(CYCLE_ID, users, [], {
        targetEvaluatorCount: 2,
        sameJobTitleMax: null,
      });
      const row = preview.rows.find((item) => item.evaluateeUid === 'u1')!;

      expect(row.sameJobTitleMax).toBe(0);
      expect(row.evaluatorUids.length).toBe(2);
    });

    it('多人隨機快選時評核者負載差距應不超過 1', () => {
      const users = Array.from({ length: 12 }, (_, index) =>
        makeUser(`u${index + 1}`, `使用者${index + 1}`, index % 2 === 0 ? '工程師' : '設計師'),
      );

      const preview = service.generateRandomAssignmentPreview(CYCLE_ID, users, [], DEFAULT_RANDOM_OPTIONS);
      const loads = Object.values(preview.evaluatorLoads);
      const minLoad = Math.min(...loads);
      const maxLoad = Math.max(...loads);

      expect(maxLoad - minLoad).toBeLessThanOrEqual(1);
    });

    it('負載相同時應優先選擇相同 jobTitle 且非空白的評核者', () => {
      const users = [
        makeUser('u1', '使用者1', '工程師'),
        makeUser('u2', '使用者2', '工程師'),
        makeUser('u3', '使用者3', '設計師'),
      ];

      const preview = service.generateRandomAssignmentPreview(CYCLE_ID, users, [], DEFAULT_RANDOM_OPTIONS);
      const row = preview.rows.find((item) => item.evaluateeUid === 'u1')!;

      expect(row.evaluatorUids[0]).toBe('u2');
    });

    it('產生預覽時應優先保留既有 pending 指派且不超過目標人數', () => {
      const users = [
        makeUser('u1', '使用者1', '工程師'),
        makeUser('u2', '使用者2', '工程師'),
        makeUser('u3', '使用者3', '設計師'),
      ];
      const existing = [
        makeAssignment('u3', 'u1', 'pending'),
      ];

      const preview = service.generateRandomAssignmentPreview(CYCLE_ID, users, existing, DEFAULT_RANDOM_OPTIONS);
      const row = preview.rows.find((item) => item.evaluateeUid === 'u1')!;

      expect(row.targetEvaluatorCount).toBe(2);
      expect(row.evaluatorUids).toContain('u3');
      expect(row.evaluatorUids.length).toBe(2);
      expect(row.lockedEvaluatorUids).toEqual([]);
    });

    it('已完成指派超過目標人數時應保留並警示且不補派', () => {
      const users = [
        makeUser('u1', '使用者1', '工程師'),
        makeUser('u2', '使用者2', '工程師'),
      ];
      const existing = [
        makeAssignment('u2', 'u1', 'completed'),
        makeAssignment('legacy-admin', 'u1', 'completed'),
      ];

      const preview = service.generateRandomAssignmentPreview(CYCLE_ID, users, existing, DEFAULT_RANDOM_OPTIONS);
      const row = preview.rows.find((item) => item.evaluateeUid === 'u1')!;

      expect(row.targetEvaluatorCount).toBe(1);
      expect(row.evaluatorUids).toEqual(['u2', 'legacy-admin']);
      expect(row.lockedEvaluatorUids).toEqual(['u2', 'legacy-admin']);
      expect(row.warnings.join(' ')).toContain('超過本次目標人數');
      expect(row.warnings.join(' ')).toContain('管理員、已離職或不在候選名單');
    });

    it('已完成指派包含管理員或已離職者時應保留且計入並警示', () => {
      const exitedUser = makeUser('u3', '離職者', '工程師');
      exitedUser.exitDate = {} as Timestamp;
      const users = [
        makeUser('u1', '使用者1', '工程師'),
        makeUser('u2', '使用者2', '工程師'),
        exitedUser,
        makeUser('admin', '管理員', '工程師', 'admin'),
      ];
      const existing = [
        makeAssignment('admin', 'u1', 'completed'),
        makeAssignment('u3', 'u1', 'completed'),
      ];

      const preview = service.generateRandomAssignmentPreview(CYCLE_ID, users, existing, DEFAULT_RANDOM_OPTIONS);
      const row = preview.rows.find((item) => item.evaluateeUid === 'u1')!;

      expect(row.evaluatorUids).toContain('admin');
      expect(row.evaluatorUids).toContain('u3');
      expect(row.lockedEvaluatorUids).toContain('admin');
      expect(row.lockedEvaluatorUids).toContain('u3');
      expect(row.warnings.join(' ')).toContain('管理員、已離職或不在候選名單');
    });
  });

  describe('createAssignments()', () => {
    it('應只建立實際不存在的指派，並依實際新增數遞增應提交總數', async () => {
      mockTransaction.get.and.callFake((ref: { id: string }) =>
        Promise.resolve(makeSnapshot(ref.id.startsWith('u2_')) as any),
      );

      const createdCount = await service.createAssignments(CYCLE_ID, [
        { evaluatorUid: 'u1', evaluateeUid: 'target' },
        { evaluatorUid: 'u1', evaluateeUid: 'target' },
        { evaluatorUid: 'u2', evaluateeUid: 'target' },
        { evaluatorUid: 'target', evaluateeUid: 'target' },
      ]);

      expect(mockFns.runTransaction).toHaveBeenCalledTimes(1);
      expect(mockTransaction.set).toHaveBeenCalledTimes(1);
      expect(mockTransaction.update).toHaveBeenCalledTimes(1);
      expect(mockFns.increment).toHaveBeenCalledWith(1);
      expect(mockFns.writeBatch).not.toHaveBeenCalled();
      expect(createdCount).toBe(1);
    });

    it('全部指派都已存在時不應建立指派或遞增應提交總數', async () => {
      mockTransaction.get.and.returnValue(Promise.resolve(makeSnapshot(true) as any));

      const createdCount = await service.createAssignments(CYCLE_ID, [
        { evaluatorUid: 'u1', evaluateeUid: 'target' },
      ]);

      expect(mockFns.runTransaction).toHaveBeenCalledTimes(1);
      expect(mockTransaction.set).not.toHaveBeenCalled();
      expect(mockTransaction.update).not.toHaveBeenCalled();
      expect(mockFns.increment).not.toHaveBeenCalled();
      expect(createdCount).toBe(0);
    });

    it('超過單一 Firestore transaction 寫入上限時應分批執行，且每批各自遞增實際新增數', async () => {
      const transactions = [makeTransaction(), makeTransaction()];
      let transactionIndex = 0;
      (mockFns.runTransaction as jasmine.Spy).and.callFake(
        (_firestore: unknown, updateFn: (transaction: typeof mockTransaction) => Promise<unknown>) =>
          updateFn(transactions[transactionIndex++]),
      );
      const assignments = Array.from({ length: 500 }, (_, index) => ({
        evaluatorUid: `u${index}`,
        evaluateeUid: 'target',
      }));

      const createdCount = await service.createAssignments(CYCLE_ID, assignments);

      expect(mockFns.runTransaction).toHaveBeenCalledTimes(2);
      expect(transactions[0].set).toHaveBeenCalledTimes(498);
      expect(transactions[1].set).toHaveBeenCalledTimes(2);
      expect(mockFns.increment).toHaveBeenCalledWith(498);
      expect(mockFns.increment).toHaveBeenCalledWith(2);
      expect(transactions[0].update).toHaveBeenCalled();
      expect(transactions[1].update).toHaveBeenCalled();
      expect(mockFns.writeBatch).not.toHaveBeenCalled();
      expect(createdCount).toBe(500);
    });
  });

  describe('saveRandomAssignmentPreview()', () => {
    it('應跳過 lockedEvaluatorUids，避免對已完成指派做多餘存在性檢查', async () => {
      const createdCount = await service.saveRandomAssignmentPreview({
        cycleId: CYCLE_ID,
        generatedAt: new Date(),
        evaluatorLoads: {},
        rows: [
          {
            evaluateeUid: 'target',
            evaluatorUids: ['locked', 'new-evaluator'],
            lockedEvaluatorUids: ['locked'],
            targetEvaluatorCount: 2,
            sameJobTitleMax: 1,
            warnings: [],
          },
        ],
      });

      expect(mockTransaction.get).toHaveBeenCalledTimes(1);
      expect(mockFns.doc as jasmine.Spy).toHaveBeenCalledWith(
        mockFirestore,
        'evaluationAssignments',
        `new-evaluator_${CYCLE_ID}_target`,
      );
      expect(mockTransaction.set).toHaveBeenCalledTimes(1);
      expect(createdCount).toBe(1);
    });

    it('應排除自評，且非鎖定指派若已存在也不應重複寫入或遞增', async () => {
      mockTransaction.get.and.returnValue(Promise.resolve(makeSnapshot(true) as any));

      const createdCount = await service.saveRandomAssignmentPreview({
        cycleId: CYCLE_ID,
        generatedAt: new Date(),
        evaluatorLoads: {},
        rows: [
          {
            evaluateeUid: 'target',
            evaluatorUids: ['target', 'existing-evaluator'],
            lockedEvaluatorUids: [],
            targetEvaluatorCount: 2,
            sameJobTitleMax: 1,
            warnings: [],
          },
        ],
      });

      expect(mockTransaction.get).toHaveBeenCalledTimes(1);
      expect(mockFns.doc as jasmine.Spy).toHaveBeenCalledWith(
        mockFirestore,
        'evaluationAssignments',
        `existing-evaluator_${CYCLE_ID}_target`,
      );
      expect(mockTransaction.set).not.toHaveBeenCalled();
      expect(mockTransaction.update).not.toHaveBeenCalled();
      expect(mockFns.increment).not.toHaveBeenCalled();
      expect(createdCount).toBe(0);
    });

    it('預覽中已移除的受評者 row 不應在儲存時建立任何指派', async () => {
      const createdCount = await service.saveRandomAssignmentPreview({
        cycleId: CYCLE_ID,
        generatedAt: new Date(),
        evaluatorLoads: {},
        rows: [
          {
            evaluateeUid: 'kept-evaluatee',
            evaluatorUids: ['kept-evaluator'],
            lockedEvaluatorUids: [],
            targetEvaluatorCount: 1,
            sameJobTitleMax: 0,
            warnings: [],
          },
        ],
      });

      expect(mockTransaction.get).toHaveBeenCalledTimes(1);
      expect(mockFns.doc as jasmine.Spy).toHaveBeenCalledWith(
        mockFirestore,
        'evaluationAssignments',
        `kept-evaluator_${CYCLE_ID}_kept-evaluatee`,
      );
      expect(mockFns.doc as jasmine.Spy).not.toHaveBeenCalledWith(
        mockFirestore,
        'evaluationAssignments',
        `removed-evaluator_${CYCLE_ID}_removed-evaluatee`,
      );
      expect(mockTransaction.set).toHaveBeenCalledTimes(1);
      expect(createdCount).toBe(1);
    });
  });
});
