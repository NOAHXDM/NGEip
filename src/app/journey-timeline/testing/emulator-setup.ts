import {
  RulesTestContext,
  RulesTestEnvironment,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';

const PROJECT_ID = 'demo-user-journey-angular';
const FIRESTORE_HOST = '127.0.0.1';
const FIRESTORE_PORT = 8080;

let testEnv: RulesTestEnvironment | null = null;
let initPromise: Promise<RulesTestEnvironment> | null = null;

declare global {
  interface Window {
    __karma__?: {
      config?: {
        args?: unknown[];
      };
    };
  }
}

export function journeyIntegrationEnabled(): boolean {
  return globalThis.window?.__karma__?.config?.args?.includes('journeyIntegration') ?? false;
}

export function initJourneyTimelineTestEnv(): Promise<RulesTestEnvironment> {
  if (testEnv) return Promise.resolve(testEnv);
  if (initPromise) return initPromise;

  const browserGlobal = globalThis as unknown as {
    process?: { env?: Record<string, string> };
  };
  browserGlobal.process ??= {};
  browserGlobal.process.env ??= {};

  initPromise = loadFirestoreRules()
    .then((rules) =>
      initializeTestEnvironment({
        projectId: PROJECT_ID,
        firestore: {
          host: FIRESTORE_HOST,
          port: FIRESTORE_PORT,
          rules,
        },
      })
    )
    .then((env) => {
      testEnv = env;
      return env;
    })
    .catch((error) => {
      initPromise = null;
      throw error;
    });

  return initPromise;
}

export async function teardownJourneyTimelineTestEnv(): Promise<void> {
  const env = testEnv ?? (await initPromise);
  if (!env) return;
  await env.cleanup();
  if (testEnv === env) {
    testEnv = null;
  }
  initPromise = null;
}

export function getJourneyTimelineTestEnv(): RulesTestEnvironment {
  if (!testEnv) {
    throw new Error('Journey timeline emulator test environment has not been initialized.');
  }
  return testEnv;
}

export async function clearJourneyTimelineData(): Promise<void> {
  await getJourneyTimelineTestEnv().clearFirestore();
}

export function authenticatedJourneyContext(uid: string): RulesTestContext {
  return getJourneyTimelineTestEnv().authenticatedContext(uid, {
    email: `${uid}@test.ngeip`,
  });
}

async function loadFirestoreRules(): Promise<string> {
  const response = await fetch('/base/firestore.rules');
  if (!response.ok) {
    throw new Error(`Unable to load firestore.rules for journey integration tests: ${response.status}`);
  }
  return response.text();
}
