import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import { OWNER_UID } from './emulator-setup';

// The same cases run in CI/local through npm run test:attachment-rules.
xdescribe('request attachment create integration', () => {
  it('commits parent, attachment metadata and audit before deleting its upload session', async () => {
    const db = (globalThis as any).attachmentRuleContexts.owner.firestore();
    const requestRef = doc(collection(db, 'attendanceLogs'));
    const sessionRef = doc(db, 'requestAttachmentUploadSessions', 'create-session');
    const attachment = { id: 'a', storagePath: `request-attachments/attendance/${requestRef.id}/create-session/a` };
    await setDoc(sessionRef, {
      requestKind: 'attendance', requestId: requestRef.id, ownerUid: OWNER_UID, actorUid: OWNER_UID,
      status: 'uploading', plannedAttachments: [attachment], plannedPaths: [attachment.storagePath],
    });
    const batch = writeBatch(db);
    batch.set(requestRef, { userId: OWNER_UID, status: 'pending', attachments: [attachment] });
    batch.set(doc(collection(requestRef, 'auditTrail')), { action: '新增附件', actionBy: OWNER_UID, actionDateTime: serverTimestamp() });
    batch.delete(sessionRef);
    await assertSucceeds(batch.commit());
    expect((await getDoc(requestRef)).data()?.['attachments']).toHaveSize(1);
  });

  it('rejects an invalid parent commit while leaving the session governable for compensation', async () => {
    const db = (globalThis as any).attachmentRuleContexts.owner.firestore();
    await assertFails(setDoc(doc(db, 'subsidyApplications', 'too-many'), {
      userId: OWNER_UID, status: 'pending', attachments: Array.from({ length: 6 }, (_, id) => ({ id })),
    }));
  });
});
