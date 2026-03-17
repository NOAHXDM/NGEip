/**
 * Security Rules 整合測試：評量考核系統（T007）
 *
 * 驗證 10 個關鍵安全規則案例，使用 Firebase Emulator + @firebase/rules-unit-testing
 *
 * ⚠️ 此測試需要 Firebase Emulator 才能執行，在 Karma 瀏覽器環境中會被略過（xdescribe）。
 *
 * 執行方式（Node.js + Jest / firebase-jest-environment）：
 *   firebase emulators:start --config firebase.local.json
 *   npx jest --testPathPattern="firestore-rules.spec"
 *
 * 若要在 Karma 中啟用，將 xdescribe 改為 describe 並確保 emulator 已啟動。
 */

import {
  RulesTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import {
  initTestEnv,
  teardownTestEnv,
  createAdminContext,
  createEvaluatorContext,
  createEvaluateeContext,
  createUnauthenticatedContext,
  seedAdminUser,
  clearFirestoreData,
} from './emulator-setup';

// =====================
// テスト用資料 Fixtures
// =====================

const CYCLE_ID = 'cycle-2026-h1';
const EVALUATOR_UID = 'evaluator-001';
const EVALUATEE_UID = 'evaluatee-001';
const ADMIN_UID = 'test-admin-uid';
const FORM_ID = 'form-001';
const SNAPSHOT_ID = `${CYCLE_ID}_${EVALUATEE_UID}`;
const ASSIGNMENT_ID = `${EVALUATOR_UID}_${CYCLE_ID}_${EVALUATEE_UID}`;

const VALID_SCORES = {
  q1: 7, q2: 8, q3: 6, q4: 7, q5: 8,
  q6: 7, q7: 6, q8: 8, q9: 7, q10: 9,
};

const VALID_FEEDBACKS = {};

const VALID_OVERALL_COMMENT = '這位同事在專案合作中展現出優秀的溝通能力和執行力，建議繼續保持這份積極的態度。'; // > 20 chars

const VALID_FORM_DATA = {
  assignmentId: ASSIGNMENT_ID,
  cycleId: CYCLE_ID,
  evaluatorUid: EVALUATOR_UID,
  evaluateeUid: EVALUATEE_UID,
  submittedAt: new Date(),
  scores: VALID_SCORES,
  feedbacks: VALID_FEEDBACKS,
  overallComment: VALID_OVERALL_COMMENT,
  anomalyFlags: { reciprocalHighScore: false, outlierEvaluator: false },
};

const VALID_SNAPSHOT_DATA = {
  cycleId: CYCLE_ID,
  userId: EVALUATEE_UID,
  jobRank: 'J',
  status: 'preview' as const,
  computedAt: new Date(),
  validEvaluatorCount: 1,
  attributes: { EXE: 7, INS: 7, ADP: 6.5, COL: 7, STB: 7, INN: 7 },
  totalScore: 41.5,
  careerArchetypes: [],
  overallComments: [VALID_OVERALL_COMMENT],
};

// =====================
// 測試套件（使用 xdescribe 在 Karma 環境中略過，需 Firebase Emulator）
// =====================

xdescribe('Security Rules 整合測試 - 評量考核系統', () => {
  let testEnv: RulesTestEnvironment;

  beforeAll(async () => {
    // 讀取 firestore.rules 文件（Node.js 環境）
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
    // 種入管理者帳號（讓 isAdmin() rule 可正確判斷）
    await seedAdminUser(ADMIN_UID);
    // 預先建立必要的基礎資料（使用管理者權限繞過 rules）
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      // 建立週期
      await db.doc(`evaluationCycles/${CYCLE_ID}`).set({
        id: CYCLE_ID, name: '2026 上半年考核', type: 'H1', year: 2026,
        status: 'active', totalAssignments: 1, completedAssignments: 0,
        createdBy: ADMIN_UID, createdAt: new Date(),
      });
      // 建立指派
      await db.doc(`evaluationAssignments/${ASSIGNMENT_ID}`).set({
        id: ASSIGNMENT_ID, cycleId: CYCLE_ID,
        evaluatorUid: EVALUATOR_UID, evaluateeUid: EVALUATEE_UID,
        status: 'pending', createdAt: new Date(),
      });
      // 建立一份已提交表單
      await db.doc(`evaluationForms/${FORM_ID}`).set(VALID_FORM_DATA);
      // 建立 preview 快照
      await db.doc(`userAttributeSnapshots/${SNAPSHOT_ID}`).set(VALID_SNAPSHOT_DATA);
    });
  });

  // =====================
  // 測試案例 1：受評者讀 evaluationForms → DENIED（匿名性核心）
  // =====================
  it('案例 1：受評者讀取 evaluationForms → DENIED（匿名性關鍵）', async () => {
    const evaluateeCtx = createEvaluateeContext(EVALUATEE_UID);
    const db = evaluateeCtx.firestore();
    await assertFails(getDoc(doc(db, `evaluationForms/${FORM_ID}`)));
  });

  // =====================
  // 測試案例 2：評核者讀取他人的 evaluationForm → DENIED
  // =====================
  it('案例 2：評核者讀取他人提交的 evaluationForms → DENIED', async () => {
    const otherEvaluator = createEvaluatorContext('other-evaluator-999');
    const db = otherEvaluator.firestore();
    await assertFails(getDoc(doc(db, `evaluationForms/${FORM_ID}`)));
  });

  // =====================
  // 測試案例 3：Admin 讀取任何集合 → ALLOWED
  // =====================
  it('案例 3：Admin 讀取 evaluationForms → ALLOWED', async () => {
    const adminCtx = createAdminContext(ADMIN_UID);
    const db = adminCtx.firestore();
    await assertSucceeds(getDoc(doc(db, `evaluationForms/${FORM_ID}`)));
  });

  it('案例 3b：Admin 讀取 evaluationCycles → ALLOWED', async () => {
    const adminCtx = createAdminContext(ADMIN_UID);
    const db = adminCtx.firestore();
    await assertSucceeds(getDoc(doc(db, `evaluationCycles/${CYCLE_ID}`)));
  });

  // =====================
  // 測試案例 4：受評者讀取自己的 userAttributeSnapshot → ALLOWED
  // =====================
  it('案例 4：受評者讀取自己的 userAttributeSnapshot → ALLOWED', async () => {
    const evaluateeCtx = createEvaluateeContext(EVALUATEE_UID);
    const db = evaluateeCtx.firestore();
    await assertSucceeds(getDoc(doc(db, `userAttributeSnapshots/${SNAPSHOT_ID}`)));
  });

  // =====================
  // 測試案例 5：評核者試圖寫入 final 狀態的 snapshot → DENIED
  // =====================
  it('案例 5：評核者試圖將 snapshot 升格為 final → DENIED', async () => {
    const evaluatorCtx = createEvaluatorContext(EVALUATOR_UID);
    const db = evaluatorCtx.firestore();
    await assertFails(
      updateDoc(doc(db, `userAttributeSnapshots/${SNAPSHOT_ID}`), {
        status: 'final',
      })
    );
  });

  // =====================
  // 測試案例 6：評核者更新自己的 snapshot → DENIED（不能更新自己的快照）
  // =====================
  it('案例 6：評核者更新自己的 userAttributeSnapshot → DENIED', async () => {
    // 先建立以評核者為受評者的快照
    const selfSnapshotId = `${CYCLE_ID}_${EVALUATOR_UID}`;
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(`userAttributeSnapshots/${selfSnapshotId}`).set({
        ...VALID_SNAPSHOT_DATA,
        userId: EVALUATOR_UID,
        id: selfSnapshotId,
      });
    });

    const evaluatorCtx = createEvaluatorContext(EVALUATOR_UID);
    const db = evaluatorCtx.firestore();
    // 評核者不能更新自己的快照（即使是 preview → preview）
    await assertFails(
      updateDoc(doc(db, `userAttributeSnapshots/${selfSnapshotId}`), {
        overallComments: ['某評語'],
      })
    );
  });

  // =====================
  // 測試案例 7：Admin 建立 evaluationCycle → ALLOWED
  // =====================
  it('案例 7：Admin 建立 evaluationCycle → ALLOWED', async () => {
    const adminCtx = createAdminContext(ADMIN_UID);
    const db = adminCtx.firestore();
    await assertSucceeds(
      setDoc(doc(db, 'evaluationCycles/new-cycle-test'), {
        id: 'new-cycle-test',
        name: '2026 下半年考核',
        type: 'H2',
        year: 2026,
        status: 'active',
        totalAssignments: 0,
        completedAssignments: 0,
        createdBy: ADMIN_UID,
        createdAt: new Date(),
      })
    );
  });

  // =====================
  // 測試案例 8：非 Admin 建立 evaluationCycle → DENIED
  // =====================
  it('案例 8：非管理者建立 evaluationCycle → DENIED', async () => {
    const evaluatorCtx = createEvaluatorContext(EVALUATOR_UID);
    const db = evaluatorCtx.firestore();
    await assertFails(
      setDoc(doc(db, 'evaluationCycles/unauthorized-cycle'), {
        id: 'unauthorized-cycle',
        name: '未授權週期',
        type: 'H1',
        year: 2026,
        status: 'active',
        totalAssignments: 0,
        completedAssignments: 0,
        createdBy: EVALUATOR_UID,
        createdAt: new Date(),
      })
    );
  });

  // =====================
  // 測試案例 9：有效表單提交（分數 1-10、overallComment 20-500 字）→ ALLOWED
  // =====================
  it('案例 9：有效表單提交（合法分數 + overallComment 合法字數）→ ALLOWED', async () => {
    const evaluatorCtx = createEvaluatorContext(EVALUATOR_UID);
    const db = evaluatorCtx.firestore();
    await assertSucceeds(
      setDoc(doc(db, 'evaluationForms/new-valid-form'), {
        ...VALID_FORM_DATA,
        evaluatorUid: EVALUATOR_UID,
      })
    );
  });

  // =====================
  // 測試案例 10：無效表單（分數=0 或 overallComment 太短）→ DENIED
  // =====================
  it('案例 10a：無效表單（分數 = 0）→ DENIED', async () => {
    const evaluatorCtx = createEvaluatorContext(EVALUATOR_UID);
    const db = evaluatorCtx.firestore();
    await assertFails(
      setDoc(doc(db, 'evaluationForms/invalid-score-form'), {
        ...VALID_FORM_DATA,
        evaluatorUid: EVALUATOR_UID,
        scores: { ...VALID_SCORES, q1: 0 }, // q1 = 0，超出合法範圍
      })
    );
  });

  it('案例 10b：無效表單（overallComment 太短，< 20 字）→ DENIED', async () => {
    const evaluatorCtx = createEvaluatorContext(EVALUATOR_UID);
    const db = evaluatorCtx.firestore();
    await assertFails(
      setDoc(doc(db, 'evaluationForms/short-comment-form'), {
        ...VALID_FORM_DATA,
        evaluatorUid: EVALUATOR_UID,
        overallComment: '太短了', // < 20 字
      })
    );
  });
});
