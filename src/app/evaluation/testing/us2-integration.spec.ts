/**
 * US2 整合測試：評核表單提交流程（T017）
 *
 * ⚠️  此測試使用 Firebase Emulator，在 Karma 瀏覽器環境中以 xdescribe 略過。
 *
 * 執行方式（需先啟動 Firebase Emulator）：
 *   firebase emulators:start --config firebase.local.json
 *   npx jest --testPathPattern="us2-integration.spec"
 *
 * 測試情境（User Story 2 核心流程）：
 *   Case 1：表單提交批次寫入驗證
 *           Case 1a：evaluationForms 文件存在且欄位正確
 *           Case 1b：userAttributeSnapshots 的 overallComments 包含 arrayUnion 後的評語
 *           Case 1c：evaluationAssignments 狀態更新為 completed
 *
 *   Case 2：受評者讀取 evaluationForms → DENIED（匿名性安全規則）
 *           Case 2a：受評者讀取針對自己的表單 → DENIED
 *           Case 2b：受評者讀取其他評核者提交的表單 → DENIED
 *           Case 2c：評核者讀取自己提交的表單 → ALLOWED（對照組）
 *
 *   Case 3：截止日已過情境 → 前端守衛攔截
 *           Case 3a：overdue 指派可被評核者讀取（前端顯示用），狀態為 overdue
 *           Case 3b：Security Rules 層面不檢查截止日（防護責任在 EvaluationFormService）
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
  updateDoc,
  collection,
  arrayUnion,
  increment,
} from 'firebase/firestore';
import {
  initTestEnv,
  teardownTestEnv,
  createAdminContext,
  createEvaluatorContext,
  createEvaluateeContext,
  seedAdminUser,
  clearFirestoreData,
  getTestEnv,
} from './emulator-setup';

// =====================
// 測試常數 & Fixtures
// =====================

const ADMIN_UID = 'test-admin-uid';
const EVALUATOR_UID = 'us2-evaluator-001';
const EVALUATEE_UID = 'us2-evaluatee-001';
const CYCLE_ID = 'us2-cycle-2026-h1';
const SNAPSHOT_ID = `${CYCLE_ID}_${EVALUATEE_UID}`;
const ASSIGNMENT_ID = `${EVALUATOR_UID}_${CYCLE_ID}_${EVALUATEE_UID}`;

/** 有效分數（所有題目 1–10，無極端值，無需說明） */
const VALID_SCORES = {
  q1: 7, q2: 6, q3: 7, q4: 6, q5: 8,
  q6: 7, q7: 6, q8: 7, q9: 6, q10: 7,
};

/** 有效整體評語（20–500 字元） */
const VALID_OVERALL_COMMENT =
  '這位同事在過去半年展現出優秀的執行力與協作能力，遇到困難時總能冷靜應對，是團隊重要的支柱。';

/**
 * 有效的 evaluationForms 文件資料（模擬 EvaluationFormService.submitForm 寫入的格式）
 * 注意：submittedAt 在 emulator 測試中使用 Date 物件（serverTimestamp 不適用於直接寫入）
 */
const VALID_FORM_DATA = {
  assignmentId: ASSIGNMENT_ID,
  cycleId: CYCLE_ID,
  evaluatorUid: EVALUATOR_UID,
  evaluateeUid: EVALUATEE_UID,
  submittedAt: new Date(),
  scores: VALID_SCORES,
  feedbacks: {},
  overallComment: VALID_OVERALL_COMMENT,
  anomalyFlags: { reciprocalHighScore: false, outlierEvaluator: false },
};

/** 有效的評核週期資料 */
const VALID_CYCLE_DATA = {
  id: CYCLE_ID,
  name: '2026 上半年考核',
  type: 'H1',
  year: 2026,
  status: 'active',
  totalAssignments: 1,
  completedAssignments: 0,
  createdBy: ADMIN_UID,
  createdAt: new Date(),
  startDate: new Date('2026-01-01'),
  deadline: new Date('2026-06-30'),
};

/** 有效的 pending 狀態指派資料 */
const VALID_ASSIGNMENT_DATA = {
  id: ASSIGNMENT_ID,
  cycleId: CYCLE_ID,
  evaluatorUid: EVALUATOR_UID,
  evaluateeUid: EVALUATEE_UID,
  status: 'pending',
  createdAt: new Date(),
};

// =====================
// 整合測試套件（xdescribe：Karma 環境中略過，需 Firebase Emulator）
// =====================

xdescribe('US2 整合測試：評核表單提交流程', () => {
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

    // 預先建立必要的基礎資料（繞過 rules 以確保獨立性）
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      // 建立評核週期
      await db.doc(`evaluationCycles/${CYCLE_ID}`).set(VALID_CYCLE_DATA);
      // 建立評核指派（初始狀態為 pending）
      await db.doc(`evaluationAssignments/${ASSIGNMENT_ID}`).set(VALID_ASSIGNMENT_DATA);
    });
  });

  // =======================================================================
  // Case 1：表單提交批次寫入驗證
  //
  // 此組測試模擬 EvaluationFormService.submitForm() 的批次寫入行為，
  // 分別驗證三個受影響集合的狀態正確性。
  // =======================================================================

  describe('Case 1：表單提交批次寫入驗證', () => {

    it('Case 1a：評核者提交有效表單後，evaluationForms 文件應存在且所有欄位正確', async () => {
      const evaluatorCtx = createEvaluatorContext(EVALUATOR_UID);
      const db = evaluatorCtx.firestore();

      // 模擬 EvaluationFormService 批次寫入中的表單建立步驟
      // （auto-id 由 collection() + doc() 產生，這裡使用固定 ID 方便驗證）
      const formId = 'us2-form-case1a';
      const formRef = doc(db, `evaluationForms/${formId}`);

      await assertSucceeds(
        setDoc(formRef, { ...VALID_FORM_DATA, id: formId }),
      );

      // 使用 Admin 權限（繞過 rules）驗證文件內容
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        const snap = await getDoc(doc(ctx.firestore(), `evaluationForms/${formId}`));

        expect(snap.exists()).toBeTrue();

        const data = snap.data()!;
        expect(data['id']).toBe(formId);
        expect(data['cycleId']).toBe(CYCLE_ID);
        expect(data['evaluatorUid']).toBe(EVALUATOR_UID);
        expect(data['evaluateeUid']).toBe(EVALUATEE_UID);
        expect(data['overallComment']).toBe(VALID_OVERALL_COMMENT);
        expect(data['scores']).toEqual(VALID_SCORES);
        expect(data['feedbacks']).toEqual({});
        expect(data['anomalyFlags']).toEqual({
          reciprocalHighScore: false,
          outlierEvaluator: false,
        });
      });
    });

    it('Case 1b：批次提交後，userAttributeSnapshots 的 overallComments 應包含 arrayUnion 後的評語', async () => {
      // 先建立初始快照（validEvaluatorCount=0，overallComments 為空）
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await ctx.firestore().doc(`userAttributeSnapshots/${SNAPSHOT_ID}`).set({
          cycleId: CYCLE_ID,
          userId: EVALUATEE_UID,
          status: 'preview',
          validEvaluatorCount: 0,
          overallComments: [],
          attributes: { EXE: 0, INS: 0, ADP: 0, COL: 0, STB: 0, INN: 0 },
          totalScore: 0,
          careerArchetypes: [],
        });
      });

      // 模擬批次寫入中的快照更新（使用管理者上下文，繞過「不可更新自己快照」的規則）
      // 在實際服務中，由評核者執行（security rule 允許：userId != evaluatorUid）
      const adminCtx = createAdminContext(ADMIN_UID);
      const db = adminCtx.firestore();

      await assertSucceeds(
        updateDoc(doc(db, `userAttributeSnapshots/${SNAPSHOT_ID}`), {
          overallComments: arrayUnion(VALID_OVERALL_COMMENT),
          validEvaluatorCount: increment(1),
          attributes: { EXE: 7, INS: 6, ADP: 6.5, COL: 7, STB: 7.5, INN: 6 },
        }),
      );

      // 驗證快照更新結果
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        const snap = await getDoc(
          doc(ctx.firestore(), `userAttributeSnapshots/${SNAPSHOT_ID}`),
        );

        expect(snap.exists()).toBeTrue();

        const data = snap.data()!;
        // overallComments 應包含 arrayUnion 後的評語
        expect(data['overallComments']).toContain(VALID_OVERALL_COMMENT);
        // validEvaluatorCount 應遞增為 1
        expect(data['validEvaluatorCount']).toBe(1);
        // attributes 應有預覽屬性分數
        expect(data['attributes']).toEqual({ EXE: 7, INS: 6, ADP: 6.5, COL: 7, STB: 7.5, INN: 6 });
      });
    });

    it('Case 1b-2：多次 arrayUnion 同一評語不應產生重複項目', async () => {
      // 建立已含有評語的快照
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await ctx.firestore().doc(`userAttributeSnapshots/${SNAPSHOT_ID}`).set({
          cycleId: CYCLE_ID,
          userId: EVALUATEE_UID,
          status: 'preview',
          validEvaluatorCount: 1,
          overallComments: [VALID_OVERALL_COMMENT], // 已含有評語
          attributes: { EXE: 7, INS: 6, ADP: 6.5, COL: 7, STB: 7.5, INN: 6 },
        });
      });

      // 再次以相同評語執行 arrayUnion
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await updateDoc(doc(ctx.firestore(), `userAttributeSnapshots/${SNAPSHOT_ID}`), {
          overallComments: arrayUnion(VALID_OVERALL_COMMENT),
        });
      });

      // 驗證：overallComments 應仍只有一筆（arrayUnion 的去重特性）
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        const snap = await getDoc(
          doc(ctx.firestore(), `userAttributeSnapshots/${SNAPSHOT_ID}`),
        );
        const comments: string[] = snap.data()!['overallComments'];
        const duplicates = comments.filter((c) => c === VALID_OVERALL_COMMENT);
        expect(duplicates.length).toBe(1);
      });
    });

    it('Case 1c：評核者可更新自己的指派狀態為 completed（Security Rules 允許）', async () => {
      const evaluatorCtx = createEvaluatorContext(EVALUATOR_UID);
      const db = evaluatorCtx.firestore();

      // 模擬批次寫入中的指派狀態更新
      await assertSucceeds(
        updateDoc(doc(db, `evaluationAssignments/${ASSIGNMENT_ID}`), {
          status: 'completed',
        }),
      );

      // 驗證指派狀態已更新
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        const snap = await getDoc(
          doc(ctx.firestore(), `evaluationAssignments/${ASSIGNMENT_ID}`),
        );

        expect(snap.exists()).toBeTrue();
        expect(snap.data()!['status']).toBe('completed');
      });
    });

    it('Case 1c-2：評核者不可更新他人的指派狀態（Security Rules 拒絕）', async () => {
      const otherEvaluatorUid = 'us2-other-evaluator-002';
      const otherAssignmentId = `${otherEvaluatorUid}_${CYCLE_ID}_${EVALUATEE_UID}`;

      // 建立其他評核者的指派
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await ctx.firestore().doc(`evaluationAssignments/${otherAssignmentId}`).set({
          id: otherAssignmentId,
          cycleId: CYCLE_ID,
          evaluatorUid: otherEvaluatorUid,
          evaluateeUid: EVALUATEE_UID,
          status: 'pending',
          createdAt: new Date(),
        });
      });

      // 原評核者嘗試更新他人的指派 → 應拒絕
      const evaluatorCtx = createEvaluatorContext(EVALUATOR_UID);
      const db = evaluatorCtx.firestore();

      await assertFails(
        updateDoc(doc(db, `evaluationAssignments/${otherAssignmentId}`), {
          status: 'completed',
        }),
      );
    });
  });

  // =======================================================================
  // Case 2：受評者讀取 evaluationForms → DENIED（匿名性安全規則）
  //
  // 核心安全需求：evaluateeUid 的使用者完全無法讀取 evaluationForms，
  // 確保評核者身份與具體評分對受評者保持匿名。
  // =======================================================================

  describe('Case 2：受評者讀取 evaluationForms → DENIED（匿名性安全規則）', () => {

    const SEED_FORM_ID = 'us2-form-case2';

    beforeEach(async () => {
      // 預先種入表單（繞過 rules）
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await ctx.firestore().doc(`evaluationForms/${SEED_FORM_ID}`).set({
          ...VALID_FORM_DATA,
          id: SEED_FORM_ID,
        });
      });
    });

    it('Case 2a：受評者讀取針對自己的 evaluationForms 文件 → DENIED（匿名性關鍵）', async () => {
      const evaluateeCtx = createEvaluateeContext(EVALUATEE_UID);
      const db = evaluateeCtx.firestore();

      // 即使表單的 evaluateeUid 就是自己，也不得讀取（確保評核者匿名）
      await assertFails(getDoc(doc(db, `evaluationForms/${SEED_FORM_ID}`)));
    });

    it('Case 2b：受評者讀取由其他評核者提交的表單 → DENIED', async () => {
      const otherEvaluatorUid = 'us2-other-evaluator-003';
      const otherFormId = 'us2-form-other-evaluator';

      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await ctx.firestore().doc(`evaluationForms/${otherFormId}`).set({
          ...VALID_FORM_DATA,
          id: otherFormId,
          evaluatorUid: otherEvaluatorUid, // 不同評核者
        });
      });

      const evaluateeCtx = createEvaluateeContext(EVALUATEE_UID);
      const db = evaluateeCtx.firestore();

      await assertFails(getDoc(doc(db, `evaluationForms/${otherFormId}`)));
    });

    it('Case 2c：評核者讀取自己提交的 evaluationForms 文件 → ALLOWED（對照組）', async () => {
      const evaluatorCtx = createEvaluatorContext(EVALUATOR_UID);
      const db = evaluatorCtx.firestore();

      // 評核者可讀取自己提交的表單（evaluatorUid == request.auth.uid）
      await assertSucceeds(getDoc(doc(db, `evaluationForms/${SEED_FORM_ID}`)));
    });

    it('Case 2d：管理者讀取任何 evaluationForms 文件 → ALLOWED', async () => {
      const adminCtx = createAdminContext(ADMIN_UID);
      const db = adminCtx.firestore();

      await assertSucceeds(getDoc(doc(db, `evaluationForms/${SEED_FORM_ID}`)));
    });

    it('Case 2e：未認證使用者讀取 evaluationForms → DENIED', async () => {
      const env = getTestEnv();
      const unauthCtx = env.unauthenticatedContext();
      const db = unauthCtx.firestore();

      await assertFails(getDoc(doc(db, `evaluationForms/${SEED_FORM_ID}`)));
    });

    it('Case 2f：受評者試圖寫入 evaluationForms（偽造評核） → DENIED', async () => {
      const evaluateeCtx = createEvaluateeContext(EVALUATEE_UID);
      const db = evaluateeCtx.firestore();

      // 受評者偽造評語（evaluatorUid 填自己但 evaluateeUid 填他人）
      await assertFails(
        setDoc(doc(db, 'evaluationForms/forged-form'), {
          ...VALID_FORM_DATA,
          evaluatorUid: EVALUATEE_UID,    // 偽造：評核者 = 受評者（自評）
          evaluateeUid: 'some-other-uid',
        }),
      );
    });
  });

  // =======================================================================
  // Case 3：截止日已過 → 前端守衛攔截
  //
  // 重要說明：
  //   Firestore Security Rules 本身不直接檢查 evaluationCycle 的 deadline 欄位。
  //   截止日過期的防護責任在於 EvaluationFormService.submitForm()，
  //   該方法會在批次寫入前讀取指派狀態（overdue），並拒絕繼續操作。
  //
  // 此組測試驗證：
  //   1. 過期指派的資料狀態可被正確讀取（供前端顯示警告）
  //   2. Security Rules 層面不阻擋過期週期的寫入（確認防護層次正確）
  // =======================================================================

  describe('Case 3：截止日已過情境 → 前端守衛攔截', () => {

    const OVERDUE_CYCLE_ID = 'us2-overdue-cycle-2025-h1';
    const OVERDUE_ASSIGNMENT_ID = `${EVALUATOR_UID}_${OVERDUE_CYCLE_ID}_${EVALUATEE_UID}`;

    beforeEach(async () => {
      // 建立已逾期的週期與指派
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();

        // 截止日為過去的評核週期（status=expired_pending 表示已逾期待關閉）
        await db.doc(`evaluationCycles/${OVERDUE_CYCLE_ID}`).set({
          id: OVERDUE_CYCLE_ID,
          name: '2025 上半年考核（已逾期）',
          type: 'H1',
          year: 2025,
          status: 'expired_pending',  // 已逾期待關閉
          totalAssignments: 1,
          completedAssignments: 0,
          createdBy: ADMIN_UID,
          createdAt: new Date('2025-01-01'),
          startDate: new Date('2025-01-01'),
          deadline: new Date('2025-06-30'), // 截止日已過
        });

        // 指派狀態為 overdue（由後端定時函數標記，截止日過後仍未完成）
        await db.doc(`evaluationAssignments/${OVERDUE_ASSIGNMENT_ID}`).set({
          id: OVERDUE_ASSIGNMENT_ID,
          cycleId: OVERDUE_CYCLE_ID,
          evaluatorUid: EVALUATOR_UID,
          evaluateeUid: EVALUATEE_UID,
          status: 'overdue',          // 由後端排程標記為逾期
          createdAt: new Date('2025-01-01'),
        });
      });
    });

    it('Case 3a：評核者可讀取自己的 overdue 指派（前端用於顯示逾期警告）', async () => {
      const evaluatorCtx = createEvaluatorContext(EVALUATOR_UID);
      const db = evaluatorCtx.firestore();

      // 評核者可讀取自己的指派，以確認是否逾期
      const snapResult = await assertSucceeds(
        getDoc(doc(db, `evaluationAssignments/${OVERDUE_ASSIGNMENT_ID}`)),
      );

      // 驗證前端可讀取 overdue 狀態，由 EvaluationFormService 決定是否攔截提交
      const data = (await snapResult).data();
      expect(data?.['status']).toBe('overdue');
      expect(data?.['cycleId']).toBe(OVERDUE_CYCLE_ID);
    });

    it('Case 3b：Security Rules 不阻擋截止日已過週期的 evaluationForms 寫入（防護在服務層）', async () => {
      // 說明：
      //   Security Rules 的 evaluationForms create 規則只驗證：
      //     - 使用者已認證
      //     - evaluatorUid == request.auth.uid
      //     - 分數範圍 1–10
      //     - overallComment 長度 20–500
      //   【不檢查】指派的 deadline 或 status=overdue
      //
      //   EvaluationFormService.submitForm() 才是真正的防線：
      //     - 讀取指派狀態（getDoc）
      //     - 若 status === 'completed' 或 status === 'overdue' → 拋出錯誤，不執行批次寫入
      //
      //   此測試確認規格分工正確：rules 不重複業務邏輯，前端服務負責截止日守衛。
      const evaluatorCtx = createEvaluatorContext(EVALUATOR_UID);
      const db = evaluatorCtx.firestore();

      const overdueFormId = 'us2-overdue-form-test';

      // Security Rules 層面：即使週期已逾期，有效格式的表單仍可寫入
      // （service 層才會因讀到 overdue 狀態而攔截）
      await assertSucceeds(
        setDoc(doc(db, `evaluationForms/${overdueFormId}`), {
          ...VALID_FORM_DATA,
          id: overdueFormId,
          evaluatorUid: EVALUATOR_UID,
          cycleId: OVERDUE_CYCLE_ID,     // 使用逾期週期 ID
          assignmentId: OVERDUE_ASSIGNMENT_ID,
        }),
      );
    });

    it('Case 3c：overdue 狀態的週期（expired_pending）所有已登入者均可讀取', async () => {
      const evaluatorCtx = createEvaluatorContext(EVALUATOR_UID);
      const db = evaluatorCtx.firestore();

      // 評核週期對所有已登入使用者可讀（security rule：allow read: if isSignedIn()）
      await assertSucceeds(
        getDoc(doc(db, `evaluationCycles/${OVERDUE_CYCLE_ID}`)),
      );
    });

    it('Case 3d：overdue 指派中，evaluatorUid 欄位不可被評核者篡改', async () => {
      const evaluatorCtx = createEvaluatorContext(EVALUATOR_UID);
      const db = evaluatorCtx.firestore();

      // 嘗試竄改 evaluatorUid → Security Rules 應拒絕（欄位不可變更）
      await assertFails(
        updateDoc(doc(db, `evaluationAssignments/${OVERDUE_ASSIGNMENT_ID}`), {
          evaluatorUid: 'another-user-uid', // 企圖更換評核者
          status: 'pending',
        }),
      );
    });
  });

  // =======================================================================
  // 附加驗證：批次寫入後的週期計數一致性
  // =======================================================================

  describe('補充：批次寫入後整體資料一致性', () => {

    it('管理者可遞增週期的 completedAssignments 計數', async () => {
      const adminCtx = createAdminContext(ADMIN_UID);
      const db = adminCtx.firestore();

      await assertSucceeds(
        updateDoc(doc(db, `evaluationCycles/${CYCLE_ID}`), {
          completedAssignments: increment(1),
        }),
      );

      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        const snap = await getDoc(doc(ctx.firestore(), `evaluationCycles/${CYCLE_ID}`));
        expect(snap.data()!['completedAssignments']).toBe(1);
      });
    });

    it('非管理者不可更新 evaluationCycles 計數', async () => {
      const evaluatorCtx = createEvaluatorContext(EVALUATOR_UID);
      const db = evaluatorCtx.firestore();

      // Security Rules：evaluationCycles 的 update 僅限管理者
      await assertFails(
        updateDoc(doc(db, `evaluationCycles/${CYCLE_ID}`), {
          completedAssignments: increment(1),
        }),
      );
    });

    it('表單提交後：evaluationForms 文件禁止被一般使用者刪除', async () => {
      const formId = 'us2-form-no-delete';

      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await ctx.firestore().doc(`evaluationForms/${formId}`).set({
          ...VALID_FORM_DATA,
          id: formId,
        });
      });

      const evaluatorCtx = createEvaluatorContext(EVALUATOR_UID);
      const db = evaluatorCtx.firestore();

      // 即使是提交者，也不可刪除已提交的表單（資料完整性保護）
      // Firestore 的 delete 操作對應 allow delete: if false
      const formDocRef = doc(db, `evaluationForms/${formId}`);
      await assertFails(
        // 使用 firebase/firestore 的 deleteDoc
        (async () => {
          const { deleteDoc } = await import('firebase/firestore');
          return deleteDoc(formDocRef);
        })(),
      );
    });
  });
});
