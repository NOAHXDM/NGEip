import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, runTransaction, updateDoc, writeBatch } from 'firebase/firestore';
import { OWNER_UID } from './emulator-setup';

// The queue transfer and concurrency boundary also run in tools/request-attachment-emulator-tests.cjs.
xdescribe('request attachment update integration', () => {
  it('moves an old reference to cleanup queue in the same atomic commit', async () => {
    const db = (globalThis as any).attachmentRuleContexts.owner.firestore();
    const requestRef = doc(db, 'attendanceLogs', 'pending');
    const old = { id: 'old', storagePath: 'request-attachments/attendance/pending/session/old' };
    const batch = writeBatch(db);
    batch.update(requestRef, { attachments: [] });
    batch.set(doc(db, 'requestAttachmentCleanupQueue', 'old'), {
      requestKind: 'attendance', requestId: 'pending', ownerUid: OWNER_UID,
      actorUid: OWNER_UID, attachment: old, attemptCount: 0,
    });
    await assertSucceeds(batch.commit());
  });

  it('rejects stale removal when the attachment disappeared concurrently', async () => {
    const db = (globalThis as any).attachmentRuleContexts.owner.firestore();
    const requestRef = doc(db, 'attendanceLogs', 'pending');
    await updateDoc(requestRef, { attachments: [] });
    await expectAsync(runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(requestRef);
      const current = snapshot.data()?.['attachments'] ?? [];
      if (!current.some((item: any) => item.id === 'old')) throw new Error('attachment-conflict');
    })).toBeRejectedWithError('attachment-conflict');
  });

  it('rejects a cleanup queue record that is not paired with parent removal', async () => {
    const db = (globalThis as any).attachmentRuleContexts.owner.firestore();
    await assertFails(updateDoc(doc(db, 'requestAttachmentCleanupQueue', 'old'), {
      attachment: { id: 'other', storagePath: 'request-attachments/attendance/pending/session/other' },
    }));
  });
});
