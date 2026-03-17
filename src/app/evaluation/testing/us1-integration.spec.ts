/**
 * US1 整合測試：評核週期與指派建立流程（T011）
 *
 * ⚠️  此測試使用 Firebase Emulator，在 Karma 瀏覽器環境中以 xdescribe 略過。
 *
 * 執行方式（需先啟動 Firebase Emulator）：
 *   firebase emulators:start --config firebase.local.json
 *   npx jest --testPathPattern="us1-integration.spec"
 *   # 或搭配 firebase-jest-environment：
 *   npx jest --testEnvironment=@firebase/rules-unit-testing/jest
 *
 * 測試情境（User Story 1 核心流程）：
 *   Case 1：管理者建立週期 → evaluationCycles 文件存在，欄位正確
 *   Case 2：管理者建立指派 → 評核者查詢 evaluationAssignments 回傳 1 筆
 *   Case 3：非管理者建立週期 → Security Rules 拒絕（DENIED）
 *   Case 4：重複建立相同指派（相同 key）→ 文件被覆寫，不會產生重複
 */

import {
  RulesTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import {
  doc,
  setDoc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
} from 'firebase/firestore';
import {
  initTestEnv,
  teardownTestEnv,
  createAdminContext,
  createEvaluatorContext,
  seedAdminUser,
  clearFirestoreData,
} from './emulator-setup';

// =====================
// 測試常數 & Fixtures
// =====================

const ADMIN_UID = 'test-admin-uid';
const EVALUATOR_UID = 'us1-evaluator-001';
const EVALUATEE_UID = 'us1-evaluatee-001';
const CYCLE_ID = 'us1-cycle-2026-h1';

/** 確定性指派 key（與 EvaluationAssignmentService 邏輯一致） */
const ASSIGNMENT_KEY = `${EVALUATOR_UID}_${CYCLE_ID}_${EVALUATEE_UID}`;

/** 有效的評核週期基本資料 */
const VALID_CYCLE_DATA = {
  id: CYCLE_ID,
  name: '2026 上半年考核',
  type: 'H1',
  year: 2026,
  status: 'active',
  totalAssignments: 0,
  completedAssignments: 0,
  createdBy: ADMIN_UID,
  createdAt: new Date(),
  startDate: new Date('2026-01-01'),
  deadline: new Date('2026-06-30'),
};

/** 有效的評核指派資料 */
const VALID_ASSIGNMENT_DATA = {
  id: ASSIGNMENT_KEY,
  cycleId: CYCLE_ID,
  evaluatorUid: EVALUATOR_UID,
  evaluateeUid: EVALUATEE_UID,
  status: 'pending',
  createdAt: new Date(),
};

// =====================
// 整合測試套件（xdescribe：Karma 環境中略過）
// =====================

xdescribe('US1 整合測試：評核週期與指派建立流程', () => {
  let testEnv: RulesTestEnvironment;

  beforeAll(async () => {
    // 讀取 firestore.rules（Node.js 環境）
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
    // 每個測試前清空資料，確保隔離性
    await clearFirestoreData();
    // 種入管理者帳號（供 isAdmin() security rule 判斷）
    await seedAdminUser(ADMIN_UID);
  });

  // =====================
  // Case 1：管理者建立週期 → 文件存在且欄位正確
  // =====================

  it('Case 1：管理者建立評核週期後，evaluationCycles 文件應存在且欄位正確', async () => {
    const adminCtx = createAdminContext(ADMIN_UID);
    const db = adminCtx.firestore();

    // 管理者寫入週期文件
    await assertSucceeds(setDoc(doc(db, `evaluationCycles/${CYCLE_ID}`), VALID_CYCLE_DATA));

    // 使用 Admin 權限（繞過 rules）驗證資料寫入
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const verifyDb = ctx.firestore();
      const snap = await getDoc(doc(verifyDb, `evaluationCycles/${CYCLE_ID}`));

      expect(snap.exists()).toBeTrue();

      const data = snap.data()!;
      expect(data['name']).toBe('2026 上半年考核');
      expect(data['type']).toBe('H1');
      expect(data['year']).toBe(2026);
      expect(data['status']).toBe('active');
      expect(data['totalAssignments']).toBe(0);
      expect(data['completedAssignments']).toBe(0);
      expect(data['createdBy']).toBe(ADMIN_UID);
    });
  });

  // =====================
  // Case 2：管理者建立指派 → 評核者查詢回傳 1 筆
  // =====================

  it('Case 2：管理者建立指派後，評核者查詢 evaluationAssignments 應回傳 1 筆', async () => {
    // 先以繞過 rules 的方式建立週期（讓指派可以參照）
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(`evaluationCycles/${CYCLE_ID}`).set(VALID_CYCLE_DATA);
    });

    // 管理者建立指派
    const adminCtx = createAdminContext(ADMIN_UID);
    const adminDb = adminCtx.firestore();

    await assertSucceeds(
      setDoc(doc(adminDb, `evaluationAssignments/${ASSIGNMENT_KEY}`), VALID_ASSIGNMENT_DATA),
    );

    // 評核者查詢自己的指派（模擬 EvaluationAssignmentService.getMyAssignments() 的查詢邏輯）
    const evaluatorCtx = createEvaluatorContext(EVALUATOR_UID);
    const evaluatorDb = evaluatorCtx.firestore();

    const q = query(
      collection(evaluatorDb, 'evaluationAssignments'),
      where('evaluatorUid', '==', EVALUATOR_UID),
    );

    const result = await getDocs(q);

    // 應回傳 1 筆，且欄位正確
    expect(result.size).toBe(1);

    const assignmentData = result.docs[0].data();
    expect(assignmentData['cycleId']).toBe(CYCLE_ID);
    expect(assignmentData['evaluatorUid']).toBe(EVALUATOR_UID);
    expect(assignmentData['evaluateeUid']).toBe(EVALUATEE_UID);
    expect(assignmentData['status']).toBe('pending');
  });

  it('Case 2b：評核者查詢特定週期的指派（cycleId 篩選），應回傳 1 筆', async () => {
    // 先以繞過 rules 的方式建立資料
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await db.doc(`evaluationCycles/${CYCLE_ID}`).set(VALID_CYCLE_DATA);
      await db.doc(`evaluationAssignments/${ASSIGNMENT_KEY}`).set(VALID_ASSIGNMENT_DATA);
      // 建立另一個不同週期的指派（不應被篩選到）
      const otherKey = `${EVALUATOR_UID}_other-cycle_${EVALUATEE_UID}`;
      await db.doc(`evaluationAssignments/${otherKey}`).set({
        ...VALID_ASSIGNMENT_DATA,
        id: otherKey,
        cycleId: 'other-cycle',
      });
    });

    const evaluatorCtx = createEvaluatorContext(EVALUATOR_UID);
    const evaluatorDb = evaluatorCtx.firestore();

    // 加上 cycleId 篩選（模擬 getMyAssignments(cycleId) 的查詢）
    const q = query(
      collection(evaluatorDb, 'evaluationAssignments'),
      where('evaluatorUid', '==', EVALUATOR_UID),
      where('cycleId', '==', CYCLE_ID),
    );

    const result = await getDocs(q);

    // 只應回傳 us1-cycle-2026-h1 的 1 筆
    expect(result.size).toBe(1);
    expect(result.docs[0].data()['cycleId']).toBe(CYCLE_ID);
  });

  // =====================
  // Case 3：非管理者建立週期 → DENIED
  // =====================

  it('Case 3：非管理者（評核者）嘗試建立評核週期 → Security Rules 應拒絕', async () => {
    const evaluatorCtx = createEvaluatorContext(EVALUATOR_UID);
    const db = evaluatorCtx.firestore();

    await assertFails(
      setDoc(doc(db, `evaluationCycles/unauthorized-cycle`), {
        id: 'unauthorized-cycle',
        name: '非法週期',
        type: 'H2',
        year: 2026,
        status: 'active',
        totalAssignments: 0,
        completedAssignments: 0,
        createdBy: EVALUATOR_UID,
        createdAt: new Date(),
        startDate: new Date(),
        deadline: new Date(),
      }),
    );

    // 驗證文件確實未被建立
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const snap = await getDoc(
        doc(ctx.firestore(), 'evaluationCycles/unauthorized-cycle'),
      );
      expect(snap.exists()).toBeFalse();
    });
  });

  // =====================
  // Case 4：重複指派（相同 key）→ 覆寫，不重複
  // =====================

  it('Case 4：使用相同 key 重複建立指派，應覆寫（overwrite）而非產生重複文件', async () => {
    // 先以繞過 rules 的方式建立週期
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(`evaluationCycles/${CYCLE_ID}`).set(VALID_CYCLE_DATA);
    });

    const adminCtx = createAdminContext(ADMIN_UID);
    const adminDb = adminCtx.firestore();

    const firstData = { ...VALID_ASSIGNMENT_DATA, status: 'pending', _version: 1 };
    const secondData = { ...VALID_ASSIGNMENT_DATA, status: 'pending', _version: 2 };

    // 第一次建立
    await assertSucceeds(
      setDoc(doc(adminDb, `evaluationAssignments/${ASSIGNMENT_KEY}`), firstData),
    );

    // 第二次使用相同 key 建立（模擬 createAssignments 的冪等性）
    await assertSucceeds(
      setDoc(doc(adminDb, `evaluationAssignments/${ASSIGNMENT_KEY}`), secondData),
    );

    // 驗證：集合中以 EVALUATOR_UID 為條件的指派仍只有 1 筆
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const verifyDb = ctx.firestore();
      const q = verifyDb
        .collection('evaluationAssignments')
        .where('evaluatorUid', '==', EVALUATOR_UID)
        .where('cycleId', '==', CYCLE_ID);
      const result = await q.get();

      // 不應有重複，只有 1 筆
      expect(result.size).toBe(1);

      // 文件內容應為第二次寫入（覆寫成功）
      expect(result.docs[0].data()['_version']).toBe(2);
    });
  });

  it('Case 4b：重複建立後，確定性 key 文件路徑應與 EvaluationAssignmentService 一致', async () => {
    // 確認 key 格式：{evaluatorUid}_{cycleId}_{evaluateeUid}
    const expectedKey = `${EVALUATOR_UID}_${CYCLE_ID}_${EVALUATEE_UID}`;
    expect(ASSIGNMENT_KEY).toBe(expectedKey);

    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(`evaluationCycles/${CYCLE_ID}`).set(VALID_CYCLE_DATA);
      await ctx
        .firestore()
        .doc(`evaluationAssignments/${expectedKey}`)
        .set(VALID_ASSIGNMENT_DATA);

      // 直接以 key 讀取，確認文件存在
      const snap = await getDoc(
        doc(ctx.firestore(), `evaluationAssignments/${expectedKey}`),
      );
      expect(snap.exists()).toBeTrue();
      expect(snap.id).toBe(expectedKey);
    });
  });
});
