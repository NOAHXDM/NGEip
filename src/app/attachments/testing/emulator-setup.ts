import { initializeTestEnvironment, RulesTestContext, RulesTestEnvironment } from '@firebase/rules-unit-testing';

export const ATTACHMENT_TEST_PROJECT = 'demo-request-attachments';
export const OWNER_UID = 'attachment-owner';
export const OTHER_UID = 'attachment-other';
export const ADMIN_UID = 'attachment-admin';

let environment: RulesTestEnvironment | undefined;

export async function initAttachmentTestEnvironment(firestoreRules: string, storageRules: string) {
  environment = await initializeTestEnvironment({
    projectId: ATTACHMENT_TEST_PROJECT,
    firestore: { rules: firestoreRules, host: '127.0.0.1', port: 8080 },
    storage: { rules: storageRules, host: '127.0.0.1', port: 9199 },
  });
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      db.doc(`users/${OWNER_UID}`).set({ role: 'user' }),
      db.doc(`users/${OTHER_UID}`).set({ role: 'user' }),
      db.doc(`users/${ADMIN_UID}`).set({ role: 'admin' }),
    ]);
  });
  return environment;
}

export function attachmentContext(uid?: string): RulesTestContext {
  if (!environment) throw new Error('attachment emulator environment not initialized');
  return uid ? environment.authenticatedContext(uid) : environment.unauthenticatedContext();
}

export async function clearAttachmentTestData(): Promise<void> { await environment?.clearFirestore(); await environment?.clearStorage(); }
export async function destroyAttachmentTestEnvironment(): Promise<void> { await environment?.cleanup(); environment = undefined; }
