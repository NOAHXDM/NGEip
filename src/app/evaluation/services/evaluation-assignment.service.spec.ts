import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { Timestamp } from 'firebase/firestore';
import { Auth } from '@angular/fire/auth';
import { Firestore } from '@angular/fire/firestore';

import { User } from '../../services/user.service';
import { EvaluationAssignmentService } from './evaluation-assignment.service';
import { EvaluationAssignment } from '../models/evaluation.models';

const CYCLE_ID = 'cycle-001';

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
  let mockBatch: {
    set: jasmine.Spy;
    update: jasmine.Spy;
    delete: jasmine.Spy;
    commit: jasmine.Spy;
  };

  beforeEach(() => {
    mockFirestore = jasmine.createSpyObj('Firestore', ['_dummy']);
    mockAuth = jasmine.createSpyObj('Auth', ['_dummy']);
    mockBatch = {
      set: jasmine.createSpy('batch.set'),
      update: jasmine.createSpy('batch.update'),
      delete: jasmine.createSpy('batch.delete'),
      commit: jasmine.createSpy('batch.commit').and.returnValue(Promise.resolve()),
    };

    TestBed.configureTestingModule({
      providers: [
        EvaluationAssignmentService,
        { provide: Firestore, useValue: mockFirestore },
        { provide: Auth, useValue: mockAuth },
      ],
    });

    service = TestBed.inject(EvaluationAssignmentService);

    service._fn.collection = jasmine.createSpy('collection').and.returnValue({} as any) as any;
    service._fn.collectionData = jasmine.createSpy('collectionData').and.returnValue(of([])) as any;
    service._fn.doc = jasmine.createSpy('doc').and.callFake(
      (_firestore: unknown, collectionName: string, id: string) => ({ collectionName, id }) as any,
    ) as any;
    service._fn.getDoc = jasmine.createSpy('getDoc').and.returnValue(Promise.resolve(makeSnapshot(false) as any)) as any;
    service._fn.query = jasmine.createSpy('query').and.returnValue({} as any) as any;
    service._fn.where = jasmine.createSpy('where').and.returnValue({} as any) as any;
    service._fn.serverTimestamp = jasmine.createSpy('serverTimestamp').and.returnValue({ serverTimestamp: true } as any) as any;
    service._fn.increment = jasmine.createSpy('increment').and.callFake((value: number) => ({ increment: value }) as any) as any;
    service._fn.writeBatch = jasmine.createSpy('writeBatch').and.returnValue(mockBatch as any) as any;
  });

  describe('generateRandomAssignmentPreview()', () => {
    it('應排除管理員與自評，且每位受評者取得 min(10, 可用使用者總數 - 1) 位評核者', () => {
      const users = [
        makeUser('u1', '使用者1', '工程師'),
        makeUser('u2', '使用者2', '工程師'),
        makeUser('u3', '使用者3', '設計師'),
        makeUser('admin', '管理員', '工程師', 'admin'),
      ];

      const preview = service.generateRandomAssignmentPreview(CYCLE_ID, users, []);

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
      ], []);

      expect(preview.rows).toEqual([]);
      expect(preview.evaluatorLoads['u1']).toBe(0);
    });

    it('只有 2 位可用使用者時應彼此互評', () => {
      const preview = service.generateRandomAssignmentPreview(CYCLE_ID, [
        makeUser('u1', '使用者1', '工程師'),
        makeUser('u2', '使用者2', '工程師'),
      ], []);

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

      const preview = service.generateRandomAssignmentPreview(CYCLE_ID, users, []);
      const row = preview.rows.find((item) => item.evaluateeUid === 'u1')!;

      expect(row.evaluatorUids.length).toBe(2);
      expect(row.warnings).toEqual([]);
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

      const preview = service.generateRandomAssignmentPreview(CYCLE_ID, users, existing);
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

      const preview = service.generateRandomAssignmentPreview(CYCLE_ID, users, existing);
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
      (service._fn.getDoc as jasmine.Spy).and.callFake((ref: { id: string }) =>
        Promise.resolve(makeSnapshot(ref.id.startsWith('u2_')) as any),
      );

      await service.createAssignments(CYCLE_ID, [
        { evaluatorUid: 'u1', evaluateeUid: 'target' },
        { evaluatorUid: 'u1', evaluateeUid: 'target' },
        { evaluatorUid: 'u2', evaluateeUid: 'target' },
        { evaluatorUid: 'target', evaluateeUid: 'target' },
      ]);

      expect(mockBatch.set).toHaveBeenCalledTimes(1);
      expect(mockBatch.update).toHaveBeenCalledTimes(1);
      expect(service._fn.increment).toHaveBeenCalledWith(1);
      expect(mockBatch.commit).toHaveBeenCalled();
    });

    it('全部指派都已存在時不應 commit batch 或遞增應提交總數', async () => {
      (service._fn.getDoc as jasmine.Spy).and.returnValue(Promise.resolve(makeSnapshot(true) as any));

      await service.createAssignments(CYCLE_ID, [
        { evaluatorUid: 'u1', evaluateeUid: 'target' },
      ]);

      expect(mockBatch.set).not.toHaveBeenCalled();
      expect(mockBatch.update).not.toHaveBeenCalled();
      expect(mockBatch.commit).not.toHaveBeenCalled();
      expect(service._fn.increment).not.toHaveBeenCalled();
    });
  });
});
