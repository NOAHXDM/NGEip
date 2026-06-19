const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, updateDoc, writeBatch } = require('firebase/firestore');
const { ref, uploadBytes, getBytes, listAll, deleteObject } = require('firebase/storage');

const projectId = 'demo-request-attachments';
const ownerUid = 'attachment-owner';
const otherUid = 'attachment-other';
const adminUid = 'attachment-admin';

async function main() {
  const env = await initializeTestEnvironment({ projectId });
  try {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await Promise.all([
        setDoc(doc(db, 'users', ownerUid), { role: 'user' }),
        setDoc(doc(db, 'users', otherUid), { role: 'user' }),
        setDoc(doc(db, 'users', adminUid), { role: 'admin' }),
      ]);
    });
    const owner = env.authenticatedContext(ownerUid);
    const other = env.authenticatedContext(otherUid);
    const admin = env.authenticatedContext(adminUid);
    const anonymous = env.unauthenticatedContext();
    const ownerDb = owner.firestore();

    const attachment = {
      id: 'a1', storagePath: 'request-attachments/attendance/pending/session/a1',
      originalName: 'proof.pdf', contentType: 'application/pdf', size: 5,
      uploadedBy: ownerUid, uploadedAt: new Date(),
    };
    await assertSucceeds(setDoc(doc(ownerDb, 'attendanceLogs', 'pending'), {
      userId: ownerUid, status: 'pending', reason: 'test', attachments: [attachment],
    }));
    await assertSucceeds(getDoc(doc(other.firestore(), 'attendanceLogs', 'pending')));
    await assertFails(getDoc(doc(anonymous.firestore(), 'attendanceLogs', 'pending')));
    await assertFails(updateDoc(doc(other.firestore(), 'attendanceLogs', 'pending'), { attachments: [] }));
    await assertSucceeds(updateDoc(doc(ownerDb, 'attendanceLogs', 'pending'), { reason: 'non-attachment regression' }));

    await assertSucceeds(setDoc(doc(ownerDb, 'attendanceLogs', 'approved'), {
      userId: ownerUid, status: 'approved', attachments: [],
    }));
    await assertFails(updateDoc(doc(ownerDb, 'attendanceLogs', 'approved'), { attachments: [attachment] }));
    await assertSucceeds(updateDoc(doc(admin.firestore(), 'attendanceLogs', 'approved'), { attachments: [attachment] }));
    await assertFails(setDoc(doc(ownerDb, 'subsidyApplications', 'six'), {
      userId: ownerUid, status: 'pending', attachments: Array.from({ length: 6 }, (_, i) => ({ id: `${i}` })),
    }));

    const auditRef = doc(ownerDb, 'attendanceLogs', 'pending', 'auditTrail', 'audit');
    await assertSucceeds(setDoc(auditRef, { action: '更新', actionBy: ownerUid }));
    await assertFails(updateDoc(auditRef, { action: 'tamper' }));

    const sessionRef = doc(ownerDb, 'requestAttachmentUploadSessions', 'session');
    await assertSucceeds(setDoc(sessionRef, {
      requestKind: 'attendance', requestId: 'pending', ownerUid, actorUid: ownerUid,
      status: 'uploading', plannedAttachments: [attachment], plannedPaths: [attachment.storagePath],
    }));

    const fileRef = ref(owner.storage(), attachment.storagePath);
    const metadata = { contentType: 'application/pdf', customMetadata: { attachmentId: 'a1', uploadedBy: ownerUid } };
    await assertSucceeds(uploadBytes(fileRef, new Blob(['%PDF-'], { type: 'application/pdf' }), metadata));
    await assertSucceeds(getBytes(ref(other.storage(), attachment.storagePath), 3 * 1024 * 1024));
    await assertFails(getBytes(ref(anonymous.storage(), attachment.storagePath)));
    await assertFails(listAll(ref(owner.storage(), 'request-attachments')));
    await assertFails(uploadBytes(fileRef, new Blob(['%PDF-'], { type: 'application/pdf' }), metadata));

    const invalidPath = 'request-attachments/attendance/pending/invalid/bad';
    await assertSucceeds(setDoc(doc(ownerDb, 'requestAttachmentUploadSessions', 'invalid'), {
      requestKind: 'attendance', requestId: 'pending', ownerUid, actorUid: ownerUid, status: 'uploading',
      plannedAttachments: [{ id: 'bad' }], plannedPaths: [invalidPath],
    }));
    const invalidRef = ref(owner.storage(), invalidPath);
    await assertFails(uploadBytes(invalidRef, new Blob(['text'], { type: 'text/plain' }), {
      contentType: 'text/plain', customMetadata: { attachmentId: 'bad', uploadedBy: ownerUid },
    }));
    await assertFails(uploadBytes(invalidRef, new Blob([new Uint8Array(3 * 1024 * 1024 + 1)], { type: 'application/pdf' }), {
      contentType: 'application/pdf', customMetadata: { attachmentId: 'bad', uploadedBy: ownerUid },
    }));

    const cleanupBatch = writeBatch(ownerDb);
    cleanupBatch.update(doc(ownerDb, 'attendanceLogs', 'pending'), { attachments: [] });
    cleanupBatch.set(doc(ownerDb, 'requestAttachmentCleanupQueue', 'a1'), {
      requestKind: 'attendance', requestId: 'pending', ownerUid, actorUid: ownerUid,
      attachment, attemptCount: 0,
    });
    await assertSucceeds(cleanupBatch.commit());
    await assertSucceeds(deleteObject(fileRef));
    await assertFails(updateDoc(doc(ownerDb, 'requestAttachmentCleanupQueue', 'a1'), { attachment: { id: 'evil' } }));

    const avatarRef = ref(owner.storage(), `avatars/${ownerUid}/avatar.webp`);
    await assertSucceeds(uploadBytes(avatarRef, new Blob(['RIFFxxxxWEBP'], { type: 'image/webp' }), { contentType: 'image/webp' }));
    await assertSucceeds(getBytes(avatarRef));
    await assertSucceeds(deleteObject(ref(admin.storage(), `avatars/${ownerUid}/avatar.webp`)));
    console.log('Attachment emulator rules matrix: PASS');
  } finally {
    await env.cleanup();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
