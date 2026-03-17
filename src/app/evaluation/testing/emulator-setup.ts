/**
 * Firebase Emulator 測試輔助設定
 * T004: 評量考核系統 Security Rules 整合測試基礎設施
 *
 * 使用方式：
 *   import { initTestEnv, teardownTestEnv, createAdminContext, createEvaluatorContext, createEvaluateeContext } from './emulator-setup';
 *
 * 前提：Firebase Emulator 必須已啟動（firebase emulators:start --config firebase.local.json）
 */

import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  RulesTestContext,
  TokenOptions,
} from '@firebase/rules-unit-testing';

// =====================
// 全域測試環境實例
// =====================

let testEnv: RulesTestEnvironment | null = null;

/**
 * 初始化 Firebase Emulator 測試環境
 * 需在 beforeAll / beforeEach 中呼叫
 *
 * @param rules Firestore Security Rules 字串（必填）
 *              在 Node.js 環境可用 readFileSync('firestore.rules', 'utf8') 讀取
 */
export async function initTestEnv(rules: string): Promise<RulesTestEnvironment> {
  testEnv = await initializeTestEnvironment({
    projectId: 'ngeip-test',
    firestore: {
      rules,
      host: 'localhost',
      port: 8080,
    },
  });
  return testEnv;
}

/**
 * 清理 Firebase Emulator 測試環境
 * 需在 afterAll / afterEach 中呼叫
 */
export async function teardownTestEnv(): Promise<void> {
  if (testEnv) {
    await testEnv.cleanup();
    testEnv = null;
  }
}

/**
 * 取得目前測試環境實例
 * @throws Error 若尚未初始化
 */
export function getTestEnv(): RulesTestEnvironment {
  if (!testEnv) {
    throw new Error('測試環境尚未初始化，請先呼叫 initTestEnv(rules)');
  }
  return testEnv;
}

// =====================
// 測試帳號工廠函數
// =====================

/**
 * 建立管理者測試上下文（role: admin）
 * 需搭配 Firestore Emulator 中已存在 users/{adminUid} 且 role === 'admin' 的文件
 */
export function createAdminContext(adminUid = 'test-admin-uid'): RulesTestContext {
  const env = getTestEnv();
  const tokenOptions: TokenOptions = { email: 'admin@test.ngeip' };
  return env.authenticatedContext(adminUid, tokenOptions);
}

/**
 * 建立評核者（Evaluator）測試上下文
 * @param uid 評核者的 Firebase UID
 */
export function createEvaluatorContext(uid = 'test-evaluator-uid'): RulesTestContext {
  const env = getTestEnv();
  const tokenOptions: TokenOptions = { email: `evaluator-${uid}@test.ngeip` };
  return env.authenticatedContext(uid, tokenOptions);
}

/**
 * 建立受評者（Evaluatee）測試上下文
 * @param uid 受評者的 Firebase UID
 */
export function createEvaluateeContext(uid = 'test-evaluatee-uid'): RulesTestContext {
  const env = getTestEnv();
  const tokenOptions: TokenOptions = { email: `evaluatee-${uid}@test.ngeip` };
  return env.authenticatedContext(uid, tokenOptions);
}

/**
 * 建立未登入使用者測試上下文
 */
export function createUnauthenticatedContext(): RulesTestContext {
  const env = getTestEnv();
  return env.unauthenticatedContext();
}

/**
 * 在 Firestore Emulator 中種入管理者使用者資料
 * 讓 isAdmin() rule function 可以正確判斷
 */
export async function seedAdminUser(adminUid = 'test-admin-uid'): Promise<void> {
  const env = getTestEnv();
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await db.doc(`users/${adminUid}`).set({
      uid: adminUid,
      email: 'admin@test.ngeip',
      role: 'admin',
      name: '測試管理者',
    });
  });
}

/**
 * 清除 Firestore Emulator 中的所有資料
 * 通常在 beforeEach 中呼叫以確保測試隔離
 */
export async function clearFirestoreData(): Promise<void> {
  const env = getTestEnv();
  await env.clearFirestore();
}
