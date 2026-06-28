import {
  RulesTestContext,
  RulesTestEnvironment,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';

const PROJECT_ID = 'demo-user-journey-angular';
const FIRESTORE_HOST = '127.0.0.1';
const FIRESTORE_PORT = 8080;

let testEnv: RulesTestEnvironment | null = null;

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

export async function initJourneyTimelineTestEnv(): Promise<RulesTestEnvironment> {
  if (testEnv) return testEnv;

  const browserGlobal = globalThis as any;
  browserGlobal.process ??= { env: {} };
  browserGlobal.process.env ??= {};
  browserGlobal.process.env['FIRESTORE_EMULATOR_HOST'] = `${FIRESTORE_HOST}:${FIRESTORE_PORT}`;

  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: FIRESTORE_HOST,
      port: FIRESTORE_PORT,
    },
  });
  return testEnv;
}

export async function teardownJourneyTimelineTestEnv(): Promise<void> {
  if (!testEnv) return;
  await testEnv.cleanup();
  testEnv = null;
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
