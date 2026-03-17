/**
 * US4 整合測試：管理者總覽與查閱考評表（T031）
 *
 * ⚠️  此測試使用 Firebase Emulator，在 Karma 瀏覽器環境中以 xdescribe 略過。
 *
 * 執行方式（需先啟動 Firebase Emulator）：
 *   firebase emulators:start --config firebase.local.json
 *   npx jest --testPathPattern="us4-integration.spec"
 *
 * 測試情境（User Story 4 核心流程）：
 *   Case 1：管理者執行 closeAndPublish 後，userAttributeSnapshots status===final 且 rankingScore 已填
 *   Case 2：非管理者存取 admin/overview 路由 → canActivate 返回 false（Guard 層驗證）
 *   Case 3：管理者排名查詢（cycleId + totalScore DESC 索引）回傳正確排序
 *   Case 4：管理者可讀取所有考評表詳情（含 evaluatorUid）
 */

import {
  RulesTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import {
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  orderBy,
} from 'firebase/firestore';
import {
  initTestEnv,
  teardownTestEnv,
  createAdminContext,
  createEvaluatorContext,
  createEvaluateeContext,
  seedAdminUser,
  clearFirestoreData,
} from './emulator-setup';

// =====================
// 測試常數 & Fixtures
// =====================

const ADMIN_UID = 'test-admin-uid';
const EVALUATOR_UID_1 = 'us4-evaluator-001';
const EVALUATOR_UID_2 = 'us4-evaluator-002';
const EVALUATEE_UID_1 = 'us4-evaluatee-001';
const EVALUATEE_UID_2 = 'us4-evaluatee-002';
const EVALUATEE_UID_3 = 'us4-evaluatee-003';
const NON_ADMIN_UID = 'us4-regular-user-001';

const CYCLE_ID = 'us4-cycle-2026-h1';

const SNAPSHOT_ID_1 = `${CYCLE_ID}_${EVALUATEE_UID_1}`;
const SNAPSHOT_ID_2 = `${CYCLE_ID}_${EVALUATEE_UID_2}`;
const SNAPSHOT_ID_3 = `${CYCLE_ID}_${EVALUATEE_UID_3}`;

const FORM_ID_1 = `form-${EVALUATOR_UID_1}-${EVALUATEE_UID_1}`;
const FORM_ID_2 = `form-${EVALUATOR_UID_2}-${EVALUATEE_UID_1}`;

/** 建立 preview 狀態快照的基本資料 */
function makePreviewSnapshot(userId: string, snapshotId: string, totalScore: number) {
  return {
    id: snapshotId,
    cycleId: CYCLE_ID,
    userId,
    jobRank: 'M',
    status: 'preview',
    validEvaluatorCount: 2,
    attributes: {
      EXE: totalScore / 6,
      INS: totalScore / 6,
      ADP: totalScore / 6,
      COL: totalScore / 6,
      STB: totalScore / 6,
      INN: totalScore / 6,
    },
    totalScore,
    careerArchetypes: [],
    overallComments: ['整體表現良好。'],
    computedAt: new Date(),
  };
}

/** 建立考評表資料 */
function makeFormData(formId: string, evaluatorUid: string, evaluateeUid: string) {
  return {
    id: formId,
    assignmentId: `assign-${evaluatorUid}-${evaluateeUid}`,
    cycleId: CYCLE_ID,
    evaluatorUid,
    evaluateeUid,
    submittedAt: new Date(),
    scores: {
      q1: 7, q2: 7, q3: 7, q4: 7, q5: 7,
      q6: 7, q7: 7, q8: 7, q9: 7, q10: 7,
    },
    feedbacks: {},
    overallComment: '工作表現穩定，持續進步中。',
    anomalyFlags: { reciprocalHighScore: false, outlierEvaluator: false },
  };
}

// =====================
// 整合測試套件（xdescribe：Karma 環境中略過）
// =====================

xdescribe('US4 整合測試：管理者總覽與查閱考評表', () => {
  let testEnv: RulesTestEnvironment;

  beforeAll(async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = (eval('require') as NodeRequire)('fs') as { readFileSync: (path: string, enc: string) => string };
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const path = (eval('require') as NodeRequire)('path') as { resolve: (...args: string[]) => string };
    const rules = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');
    testEnv = await initTestEnv(rules);
  });

  afterAll(async () => {
    await teardownTestEnv();
  });

  beforeEach(async () => {
    await clearFirestoreData();
    await seedAdminUser(ADMIN_UID);

    // 預先種入測試資料
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();

      // 種入週期
      await db.doc(`evaluationCycles/${CYCLE_ID}`).set({
        id: CYCLE_ID,
        name: '2026 上半年考核',
        type: 'H1',
        year: 2026,
        status: 'active',
        totalAssignments: 3,
        completedAssignments: 2,
        createdBy: ADMIN_UID,
        createdAt: new Date(),
        startDate: new Date('2026-01-01'),
        deadline: new Date('2026-06-30'),
      });

      // 種入 preview 快照（三位受評者，不同 totalScore）
      await db.doc(`userAttributeSnapshots/${SNAPSHOT_ID_1}`).set(
        makePreviewSnapshot(EVALUATEE_UID_1, SNAPSHOT_ID_1, 42.0),
      );
      await db.doc(`userAttributeSnapshots/${SNAPSHOT_ID_2}`).set(
        makePreviewSnapshot(EVALUATEE_UID_2, SNAPSHOT_ID_2, 38.5),
      );
      await db.doc(`userAttributeSnapshots/${SNAPSHOT_ID_3}`).set(
        makePreviewSnapshot(EVALUATEE_UID_3, SNAPSHOT_ID_3, 45.2),
      );

      // 種入考評表
      await db.doc(`evaluationForms/${FORM_ID_1}`).set(
        makeFormData(FORM_ID_1, EVALUATOR_UID_1, EVALUATEE_UID_1),
      );
      await db.doc(`evaluationForms/${FORM_ID_2}`).set(
        makeFormData(FORM_ID_2, EVALUATOR_UID_2, EVALUATEE_UID_1),
      );
    });
  });

  // =====================
  // Case 1：管理者更新快照 → status=final + rankingScore
  // =====================

  it('Case 1：管理者更新 userAttributeSnapshot → status=final 且 rankingScore 已填', async () => {
    const adminCtx = createAdminContext(ADMIN_UID);
    const db = adminCtx.firestore();

    // 模擬 closeAndPublish 對快照的寫入（管理者更新快照為 final）
    await assertSucceeds(
      updateDoc(doc(db, `userAttributeSnapshots/${SNAPSHOT_ID_1}`), {
        status: 'final',
        rankingScore: 42.0,
        computedAt: new Date(),
      }),
    );

    // 驗證快照狀態已更新
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const snap = await getDoc(ctx.firestore().doc(`userAttributeSnapshots/${SNAPSHOT_ID_1}`));
      expect(snap.exists()).toBeTrue();
      expect(snap.data()!['status']).toBe('final');
      expect(snap.data()!['rankingScore']).toBe(42.0);
    });
  });

  it('Case 1b：批次更新所有快照後，所有 status 應均為 final', async () => {
    // 模擬 closeAndPublish 批次更新
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();

      // 更新三個快照
      await db.doc(`userAttributeSnapshots/${SNAPSHOT_ID_1}`).update({ status: 'final', rankingScore: 42.0 });
      await db.doc(`userAttributeSnapshots/${SNAPSHOT_ID_2}`).update({ status: 'final', rankingScore: 38.5 });
      await db.doc(`userAttributeSnapshots/${SNAPSHOT_ID_3}`).update({ status: 'final', rankingScore: 45.2 });
    });

    // 管理者查詢所有快照，驗證全為 final
    const adminCtx = createAdminContext(ADMIN_UID);
    const db = adminCtx.firestore();

    const q = query(
      collection(db, 'userAttributeSnapshots'),
      where('cycleId', '==', CYCLE_ID),
    );
    const result = await getDocs(q);

    expect(result.size).toBe(3);

    for (const snapDoc of result.docs) {
      expect(snapDoc.data()['status']).toBe('final');
      expect(snapDoc.data()['rankingScore']).toBeDefined();
    }
  });

  // =====================
  // Case 2：非管理者存取 admin 路由 → 拒絕
  // =====================

  it('Case 2：非管理者嘗試更新 evaluationCycle 狀態 → DENIED', async () => {
    const nonAdminCtx = createEvaluatorContext(NON_ADMIN_UID);
    const db = nonAdminCtx.firestore();

    // 非管理者不應能更新週期狀態
    await assertFails(
      updateDoc(doc(db, `evaluationCycles/${CYCLE_ID}`), { status: 'closed' }),
    );
  });

  it('Case 2b：非管理者嘗試更新 userAttributeSnapshot → DENIED', async () => {
    const nonAdminCtx = createEvaluatorContext(NON_ADMIN_UID);
    const db = nonAdminCtx.firestore();

    await assertFails(
      updateDoc(doc(db, `userAttributeSnapshots/${SNAPSHOT_ID_1}`), {
        status: 'final',
        rankingScore: 100,
      }),
    );
  });

  it('Case 2c：受評者本人嘗試竄改自己的 snapshot rankingScore → DENIED', async () => {
    const evaluateeCtx = createEvaluateeContext(EVALUATEE_UID_1);
    const db = evaluateeCtx.firestore();

    // 受評者可以讀取但不應能寫入
    await assertFails(
      updateDoc(doc(db, `userAttributeSnapshots/${SNAPSHOT_ID_1}`), {
        rankingScore: 999,
      }),
    );
  });

  // =====================
  // Case 3：管理者排名查詢（cycleId + totalScore DESC）
  // =====================

  it('Case 3：管理者排名查詢（cycleId + totalScore DESC 索引）應回傳正確排序', async () => {
    // 先將快照更新為 final 並設定 rankingScore
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await db.doc(`userAttributeSnapshots/${SNAPSHOT_ID_1}`).update({ status: 'final', rankingScore: 42.0 });
      await db.doc(`userAttributeSnapshots/${SNAPSHOT_ID_2}`).update({ status: 'final', rankingScore: 38.5 });
      await db.doc(`userAttributeSnapshots/${SNAPSHOT_ID_3}`).update({ status: 'final', rankingScore: 45.2 });
    });

    const adminCtx = createAdminContext(ADMIN_UID);
    const db = adminCtx.firestore();

    // 依 rankingScore 降序查詢
    const q = query(
      collection(db, 'userAttributeSnapshots'),
      where('cycleId', '==', CYCLE_ID),
      orderBy('rankingScore', 'desc'),
    );

    const result = await assertSucceeds(getDocs(q));

    expect(result.size).toBe(3);

    const scores = result.docs.map((d) => d.data()['rankingScore'] as number);

    // 驗證排序正確（降序）
    expect(scores[0]).toBe(45.2);
    expect(scores[1]).toBe(42.0);
    expect(scores[2]).toBe(38.5);
  });

  // =====================
  // Case 4：管理者可讀取考評表（含 evaluatorUid）
  // =====================

  it('Case 4：管理者可讀取所有考評表，包含 evaluatorUid 欄位', async () => {
    const adminCtx = createAdminContext(ADMIN_UID);
    const db = adminCtx.firestore();

    // 管理者查詢特定週期的所有表單
    const q = query(
      collection(db, 'evaluationForms'),
      where('cycleId', '==', CYCLE_ID),
    );

    const result = await assertSucceeds(getDocs(q));

    expect(result.size).toBe(2);

    // 管理者可見 evaluatorUid
    for (const formDoc of result.docs) {
      expect(formDoc.data()['evaluatorUid']).toBeDefined();
      expect(typeof formDoc.data()['evaluatorUid']).toBe('string');
    }
  });

  it('Case 4b：受評者嘗試讀取自己的考評表 → DENIED（匿名性保護）', async () => {
    const evaluateeCtx = createEvaluateeContext(EVALUATEE_UID_1);
    const db = evaluateeCtx.firestore();

    // 受評者嘗試直接讀取表單文件
    await assertFails(getDoc(doc(db, `evaluationForms/${FORM_ID_1}`)));
  });

  // =====================
  // Case 5：管理者更新週期狀態 → 允許
  // =====================

  it('Case 5：管理者更新 evaluationCycle 狀態為 closed → ALLOWED', async () => {
    const adminCtx = createAdminContext(ADMIN_UID);
    const db = adminCtx.firestore();

    await assertSucceeds(
      updateDoc(doc(db, `evaluationCycles/${CYCLE_ID}`), {
        status: 'closed',
        closedAt: new Date(),
      }),
    );

    // 驗證狀態已更新
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const snap = await getDoc(ctx.firestore().doc(`evaluationCycles/${CYCLE_ID}`));
      expect(snap.data()!['status']).toBe('closed');
    });
  });
});
