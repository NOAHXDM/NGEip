/**
 * US3 整合測試：受評者查看個人職場屬性報告（T023）
 *
 * ⚠️  此測試使用 Firebase Emulator，在 Karma 瀏覽器環境中以 xdescribe 略過。
 *
 * 執行方式（需先啟動 Firebase Emulator）：
 *   firebase emulators:start --config firebase.local.json
 *   npx jest --testPathPattern="us3-integration.spec"
 *
 * 測試情境（User Story 3 核心流程）：
 *   Case 1：受評者讀取自己的 userAttributeSnapshot → ALLOWED（含 overallComments 陣列）
 *   Case 2：受評者讀取他人的 snapshot → DENIED
 *   Case 3：snapshot 切換週期資料一致性（不同 cycleId 對應不同快照）
 *   Case 4：snapshot 的 overallComments 陣列不含任何 evaluatorUid
 */

import {
  RulesTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import {
  initTestEnv,
  teardownTestEnv,
  createAdminContext,
  createEvaluateeContext,
  seedAdminUser,
  clearFirestoreData,
} from './emulator-setup';

// =====================
// 測試常數 & Fixtures
// =====================

const ADMIN_UID = 'test-admin-uid';
const EVALUATEE_UID_A = 'us3-evaluatee-a';
const EVALUATEE_UID_B = 'us3-evaluatee-b';
const EVALUATOR_UID = 'us3-evaluator-001';

const CYCLE_ID_1 = 'us3-cycle-2025-h1';
const CYCLE_ID_2 = 'us3-cycle-2025-h2';

/** 快照 ID 格式：{cycleId}_{userId} */
const SNAPSHOT_ID_A_C1 = `${CYCLE_ID_1}_${EVALUATEE_UID_A}`;
const SNAPSHOT_ID_A_C2 = `${CYCLE_ID_2}_${EVALUATEE_UID_A}`;
const SNAPSHOT_ID_B_C1 = `${CYCLE_ID_1}_${EVALUATEE_UID_B}`;

/** 受評者 A 在週期 1 的快照（不含 evaluatorUid） */
const SNAPSHOT_A_CYCLE_1 = {
  id: SNAPSHOT_ID_A_C1,
  cycleId: CYCLE_ID_1,
  userId: EVALUATEE_UID_A,
  jobRank: 'M',
  status: 'preview',
  validEvaluatorCount: 3,
  attributes: {
    EXE: 7.50,
    INS: 6.25,
    ADP: 6.80,
    COL: 7.10,
    STB: 8.00,
    INN: 5.90,
  },
  totalScore: 41.55,
  careerArchetypes: ['⚔️ 劍士'],
  // ⚠️ overallComments 只含評語文字，不含 evaluatorUid
  overallComments: [
    '工作態度認真，能按時完成任務，在團隊溝通方面仍有進步空間。',
    '積極主動，能提出建設性意見，建議在創新思維方面多加鍛鍊。',
    '技術能力強，穩定輸出品質，希望能更主動分享知識給團隊。',
  ],
  computedAt: new Date(),
};

/** 受評者 A 在週期 2 的快照 */
const SNAPSHOT_A_CYCLE_2 = {
  ...SNAPSHOT_A_CYCLE_1,
  id: SNAPSHOT_ID_A_C2,
  cycleId: CYCLE_ID_2,
  status: 'final',
  totalScore: 43.20,
  careerArchetypes: ['✨ 牧師'],
  overallComments: [
    '成長明顯，主動協作能力大幅提升，繼續保持。',
  ],
  computedAt: new Date(),
};

/** 受評者 B 在週期 1 的快照 */
const SNAPSHOT_B_CYCLE_1 = {
  ...SNAPSHOT_A_CYCLE_1,
  id: SNAPSHOT_ID_B_C1,
  cycleId: CYCLE_ID_1,
  userId: EVALUATEE_UID_B,
  totalScore: 38.00,
};

// =====================
// 整合測試套件（xdescribe：Karma 環境中略過）
// =====================

xdescribe('US3 整合測試：受評者查看個人職場屬性報告', () => {
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

    // 預先種入快照資料（使用 Admin 繞過 rules）
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await db.doc(`userAttributeSnapshots/${SNAPSHOT_ID_A_C1}`).set(SNAPSHOT_A_CYCLE_1);
      await db.doc(`userAttributeSnapshots/${SNAPSHOT_ID_A_C2}`).set(SNAPSHOT_A_CYCLE_2);
      await db.doc(`userAttributeSnapshots/${SNAPSHOT_ID_B_C1}`).set(SNAPSHOT_B_CYCLE_1);
    });
  });

  // =====================
  // Case 1：受評者讀取自己的快照 → ALLOWED（含 overallComments）
  // =====================

  it('Case 1：受評者讀取自己的 userAttributeSnapshot → ALLOWED，且 overallComments 可讀取', async () => {
    const evaluateeCtx = createEvaluateeContext(EVALUATEE_UID_A);
    const db = evaluateeCtx.firestore();

    // 讀取自己的快照
    const snapRef = doc(db, `userAttributeSnapshots/${SNAPSHOT_ID_A_C1}`);
    const result = await assertSucceeds(getDoc(snapRef));

    expect(result.exists()).toBeTrue();

    const data = result.data()!;

    // 驗證基本欄位
    expect(data['userId']).toBe(EVALUATEE_UID_A);
    expect(data['cycleId']).toBe(CYCLE_ID_1);
    expect(data['status']).toBe('preview');
    expect(data['validEvaluatorCount']).toBe(3);

    // 驗證 overallComments 陣列可讀取
    expect(Array.isArray(data['overallComments'])).toBeTrue();
    expect((data['overallComments'] as string[]).length).toBe(3);
  });

  it('Case 1b：受評者讀取自己另一個週期的快照 → ALLOWED', async () => {
    const evaluateeCtx = createEvaluateeContext(EVALUATEE_UID_A);
    const db = evaluateeCtx.firestore();

    const snapRef = doc(db, `userAttributeSnapshots/${SNAPSHOT_ID_A_C2}`);
    const result = await assertSucceeds(getDoc(snapRef));

    expect(result.exists()).toBeTrue();
    expect(result.data()!['cycleId']).toBe(CYCLE_ID_2);
    expect(result.data()!['status']).toBe('final');
  });

  // =====================
  // Case 2：受評者讀取他人快照 → DENIED
  // =====================

  it('Case 2：受評者讀取他人的 userAttributeSnapshot → DENIED', async () => {
    // 受評者 A 嘗試讀取受評者 B 的快照
    const evaluateeCtx = createEvaluateeContext(EVALUATEE_UID_A);
    const db = evaluateeCtx.firestore();

    const otherSnapRef = doc(db, `userAttributeSnapshots/${SNAPSHOT_ID_B_C1}`);
    await assertFails(getDoc(otherSnapRef));
  });

  it('Case 2b：未登入者讀取任何快照 → DENIED', async () => {
    const unauthCtx = testEnv.unauthenticatedContext();
    const db = unauthCtx.firestore();

    const snapRef = doc(db, `userAttributeSnapshots/${SNAPSHOT_ID_A_C1}`);
    await assertFails(getDoc(snapRef));
  });

  it('Case 2c：管理者讀取任何快照 → ALLOWED', async () => {
    const adminCtx = createAdminContext(ADMIN_UID);
    const db = adminCtx.firestore();

    const snapRef = doc(db, `userAttributeSnapshots/${SNAPSHOT_ID_B_C1}`);
    const result = await assertSucceeds(getDoc(snapRef));

    expect(result.exists()).toBeTrue();
  });

  // =====================
  // Case 3：快照切換週期資料一致性
  // =====================

  it('Case 3：不同 cycleId 的快照對應不同資料（資料一致性驗證）', async () => {
    const evaluateeCtx = createEvaluateeContext(EVALUATEE_UID_A);
    const db = evaluateeCtx.firestore();

    // 讀取週期 1 的快照
    const snap1Ref = doc(db, `userAttributeSnapshots/${SNAPSHOT_ID_A_C1}`);
    const result1 = await assertSucceeds(getDoc(snap1Ref));

    // 讀取週期 2 的快照
    const snap2Ref = doc(db, `userAttributeSnapshots/${SNAPSHOT_ID_A_C2}`);
    const result2 = await assertSucceeds(getDoc(snap2Ref));

    const data1 = result1.data()!;
    const data2 = result2.data()!;

    // 兩個快照的 cycleId 不同
    expect(data1['cycleId']).toBe(CYCLE_ID_1);
    expect(data2['cycleId']).toBe(CYCLE_ID_2);

    // 兩個快照的 overallComments 內容不同
    expect(data1['overallComments']).not.toEqual(data2['overallComments']);

    // 週期 2 的狀態為 final
    expect(data2['status']).toBe('final');
  });

  // =====================
  // Case 4：snapshot overallComments 不含 evaluatorUid
  // =====================

  it('Case 4：snapshot 的 overallComments 陣列中不應包含任何 evaluatorUid', async () => {
    const evaluateeCtx = createEvaluateeContext(EVALUATEE_UID_A);
    const db = evaluateeCtx.firestore();

    const snapRef = doc(db, `userAttributeSnapshots/${SNAPSHOT_ID_A_C1}`);
    const result = await assertSucceeds(getDoc(snapRef));
    const data = result.data()!;

    const comments = data['overallComments'] as string[];

    // 每條評語都不應包含 evaluatorUid
    for (const comment of comments) {
      expect(comment).not.toContain(EVALUATOR_UID);
      // 確保只是純文字評語
      expect(typeof comment).toBe('string');
    }

    // 快照本身不應有 evaluatorUid 欄位
    expect(data['evaluatorUid']).toBeUndefined();
  });

  it('Case 4b：snapshot 文件中不應直接存有 evaluator 識別資訊', async () => {
    const evaluateeCtx = createEvaluateeContext(EVALUATEE_UID_A);
    const db = evaluateeCtx.firestore();

    const snapRef = doc(db, `userAttributeSnapshots/${SNAPSHOT_ID_A_C1}`);
    const result = await assertSucceeds(getDoc(snapRef));
    const data = result.data()!;

    // 快照不應包含 evaluatorUid 或 evaluatorName 等識別欄位
    expect(data['evaluatorUid']).toBeUndefined();
    expect(data['evaluatorUids']).toBeUndefined();
    expect(data['evaluators']).toBeUndefined();
  });

  // =====================
  // Case 5：受評者不可寫入 snapshot（匿名性保護）
  // =====================

  it('Case 5：受評者不可直接覆蓋寫入 userAttributeSnapshot → DENIED', async () => {
    const evaluateeCtx = createEvaluateeContext(EVALUATEE_UID_A);
    const db = evaluateeCtx.firestore();

    // 嘗試覆蓋自己的快照（受評者不應有此權限）
    await assertFails(
      setDoc(doc(db, `userAttributeSnapshots/${SNAPSHOT_ID_A_C1}`), {
        ...SNAPSHOT_A_CYCLE_1,
        totalScore: 99, // 試圖竄改分數
      }),
    );
  });
});
