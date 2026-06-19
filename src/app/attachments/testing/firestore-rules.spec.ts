import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { Timestamp, doc, getDoc, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { ADMIN_UID, OTHER_UID, OWNER_UID } from './emulator-setup';

// Executed by tools/request-attachment-emulator-tests.cjs; retained as a typed contract beside the feature.
xdescribe('request attachment Firestore rules contract', () => {
  it('defines owner/other/admin and unauthenticated boundaries', async () => {
    const contexts = (globalThis as any).attachmentRuleContexts;
    const ownerDb = contexts.owner.firestore();
    const otherDb = contexts.other.firestore();
    const adminDb = contexts.admin.firestore();
    const anonymousDb = contexts.anonymous.firestore();
    const request = doc(ownerDb, 'attendanceLogs', 'pending');
    await assertSucceeds(setDoc(request, { userId: OWNER_UID, status: 'pending', attachments: [] }));
    await assertFails(getDoc(doc(anonymousDb, 'attendanceLogs', 'pending')));
    await assertSucceeds(getDoc(doc(otherDb, 'attendanceLogs', 'pending')));
    await assertFails(updateDoc(doc(otherDb, 'attendanceLogs', 'pending'), { attachments: [{ id: 'x' }] }));
    await assertSucceeds(updateDoc(doc(adminDb, 'attendanceLogs', 'pending'), { attachments: [] }));
  });

  it('enforces five files and immutable attachment audit records', async () => {
    const contexts = (globalThis as any).attachmentRuleContexts;
    const ownerDb = contexts.owner.firestore();
    const attachments = Array.from({ length: 6 }, (_, i) => ({ id: `${i}` }));
    await assertFails(setDoc(doc(ownerDb, 'subsidyApplications', 'six'), { userId: OWNER_UID, status: 'pending', attachments }));
    const audit = doc(ownerDb, 'attendanceLogs', 'pending', 'auditTrail', 'a1');
    await assertSucceeds(setDoc(audit, { action: '更新', actionBy: OWNER_UID }));
    await assertFails(updateDoc(audit, { action: '竄改' }));
  });

  it('atomically transfers a removed attachment to cleanup queue', async () => {
    const contexts = (globalThis as any).attachmentRuleContexts;
    const db = contexts.owner.firestore();
    const request = doc(db, 'attendanceLogs', 'cleanup-source');
    await assertSucceeds(setDoc(request, {
      userId: OWNER_UID,
      status: 'pending',
      attachments: [{
        id: 'old',
        storagePath: 'request-attachments/attendance/cleanup-source/session/old',
        uploadedAt: Timestamp.now(),
      }],
    }));
    const attachment = ((await getDoc(request)).data()?.['attachments'] ?? [])[0];
    const batch = writeBatch(db);
    batch.update(request, { attachments: [] });
    batch.set(doc(db, 'requestAttachmentCleanupQueue', 'old'), {
      requestKind: 'attendance', requestId: 'cleanup-source', actorUid: OWNER_UID, attachment,
    });
    await assertSucceeds(batch.commit());
    const cleanup = doc(db, 'requestAttachmentCleanupQueue', 'old');
    await assertSucceeds(updateDoc(cleanup, { attemptCount: 1 }));
    await assertFails(updateDoc(cleanup, { actorUid: OTHER_UID }));
  });
});
