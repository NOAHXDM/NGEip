const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { deleteDoc, doc, getDoc, setDoc, updateDoc, writeBatch } = require('firebase/firestore');
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
    await assertFails(setDoc(doc(ownerDb, 'subsidyApplications', 'forged-owner'), {
      userId: otherUid, status: 'pending', attachments: [attachment],
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
    const metadata = {
      contentType: 'application/pdf',
      cacheControl: 'private,max-age=3600',
      customMetadata: {
        requestKind: 'attendance', requestId: 'pending', attachmentId: 'a1', ownerUid, uploadedBy: ownerUid,
      },
    };
    await assertSucceeds(uploadBytes(fileRef, new Blob(['%PDF-'], { type: 'application/pdf' }), metadata));
    await assertSucceeds(getBytes(ref(other.storage(), attachment.storagePath), 3 * 1024 * 1024));
    await assertFails(getBytes(ref(anonymous.storage(), attachment.storagePath)));
    await assertFails(listAll(ref(owner.storage(), 'request-attachments')));
    await assertFails(uploadBytes(fileRef, new Blob(['%PDF-'], { type: 'application/pdf' }), metadata));
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), 'requestAttachmentUploadSessions', 'session'), { status: 'completed' });
    });
    await assertFails(deleteObject(fileRef));
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), 'requestAttachmentUploadSessions', 'session'), { status: 'uploading' });
    });

    const invalidPath = 'request-attachments/attendance/pending/invalid/bad';
    await assertSucceeds(setDoc(doc(ownerDb, 'requestAttachmentUploadSessions', 'invalid'), {
      requestKind: 'attendance', requestId: 'pending', ownerUid, actorUid: ownerUid, status: 'uploading',
      plannedAttachments: [{ id: 'bad' }], plannedPaths: [invalidPath],
    }));
    const invalidRef = ref(owner.storage(), invalidPath);
    const invalidMetadata = {
      cacheControl: 'private,max-age=3600',
      customMetadata: {
        requestKind: 'attendance', requestId: 'pending', attachmentId: 'bad', ownerUid, uploadedBy: ownerUid,
      },
    };
    await assertFails(uploadBytes(invalidRef, new Blob(['text'], { type: 'text/plain' }), {
      ...invalidMetadata, contentType: 'text/plain',
    }));
    await assertFails(uploadBytes(invalidRef, new Blob([new Uint8Array(3 * 1024 * 1024 + 1)], { type: 'application/pdf' }), {
      ...invalidMetadata, contentType: 'application/pdf',
    }));
    await assertFails(uploadBytes(invalidRef, new Blob(['%PDF-'], { type: 'application/pdf' }), {
      contentType: 'application/pdf', cacheControl: 'private,max-age=3600',
      customMetadata: { attachmentId: 'bad', uploadedBy: ownerUid },
    }));

    // plannedPaths 即使被惡意填入其他 session 路徑，Storage 仍以 URL 中的 sessionId
    // 讀取同名 session 並比對完整路徑，因此不能跨 session 注入。
    const injectedPath = 'request-attachments/attendance/pending/other-session/cross';
    await assertSucceeds(setDoc(doc(ownerDb, 'requestAttachmentUploadSessions', 'malicious-session'), {
      requestKind: 'attendance', requestId: 'pending', ownerUid, actorUid: ownerUid, status: 'uploading',
      plannedAttachments: [{ id: 'cross' }], plannedPaths: [injectedPath],
    }));
    await assertFails(uploadBytes(ref(owner.storage(), injectedPath), new Blob(['%PDF-'], { type: 'application/pdf' }), {
      contentType: 'application/pdf', cacheControl: 'private,max-age=3600',
      customMetadata: {
        requestKind: 'attendance', requestId: 'pending', attachmentId: 'cross', ownerUid, uploadedBy: ownerUid,
      },
    }));

    // Admin 代辦時 actorUid/uploadedBy 是 admin，而 ownerUid 維持申請人。
    const adminPath = 'request-attachments/attendance/approved/admin-session/admin-file';
    await assertSucceeds(setDoc(doc(admin.firestore(), 'requestAttachmentUploadSessions', 'admin-session'), {
      requestKind: 'attendance', requestId: 'approved', ownerUid, actorUid: adminUid, status: 'uploading',
      plannedAttachments: [{ id: 'admin-file' }], plannedPaths: [adminPath],
    }));
    const adminFileRef = ref(admin.storage(), adminPath);
    await assertSucceeds(uploadBytes(adminFileRef, new Blob(['%PDF-'], { type: 'application/pdf' }), {
      contentType: 'application/pdf', cacheControl: 'private,max-age=3600',
      customMetadata: {
        requestKind: 'attendance', requestId: 'approved', attachmentId: 'admin-file',
        ownerUid, uploadedBy: adminUid,
      },
    }));

    // 執行 session -> Storage -> parent/audit/session delete 的正式建立工作流。
    const createRequestId = 'subsidy-create-flow';
    const createSessionId = 'create-flow-session';
    const createAttachment = {
      id: 'receipt',
      storagePath: `request-attachments/subsidy/${createRequestId}/${createSessionId}/receipt`,
      originalName: 'receipt.pdf', contentType: 'application/pdf', size: 5,
      uploadedBy: ownerUid, uploadedAt: new Date(),
    };
    const createSessionRef = doc(ownerDb, 'requestAttachmentUploadSessions', createSessionId);
    await assertSucceeds(setDoc(createSessionRef, {
      requestKind: 'subsidy', requestId: createRequestId, ownerUid, actorUid: ownerUid,
      status: 'uploading', plannedAttachments: [createAttachment], plannedPaths: [createAttachment.storagePath],
    }));
    await assertSucceeds(uploadBytes(ref(owner.storage(), createAttachment.storagePath), new Blob(['%PDF-'], { type: 'application/pdf' }), {
      contentType: 'application/pdf', cacheControl: 'private,max-age=3600',
      customMetadata: {
        requestKind: 'subsidy', requestId: createRequestId, attachmentId: 'receipt',
        ownerUid, uploadedBy: ownerUid,
      },
    }));
    const createRequestRef = doc(ownerDb, 'subsidyApplications', createRequestId);
    const createBatch = writeBatch(ownerDb);
    createBatch.set(createRequestRef, { userId: ownerUid, status: 'pending', attachments: [createAttachment] });
    createBatch.set(doc(ownerDb, 'subsidyApplications', createRequestId, 'auditTrail', 'add'), {
      action: '新增附件', actionBy: ownerUid, actionDateTime: new Date(),
    });
    createBatch.delete(createSessionRef);
    await assertSucceeds(createBatch.commit());
    const createdRequest = await getDoc(createRequestRef);
    if (createdRequest.data().attachments.length !== 1) throw new Error('Create workflow did not persist attachment metadata');
    await env.withSecurityRulesDisabled(async (ctx) => {
      if ((await getDoc(doc(ctx.firestore(), 'requestAttachmentUploadSessions', createSessionId))).exists()) {
        throw new Error('Create workflow did not remove upload session');
      }
    });

    const persistedRequest = await getDoc(doc(ownerDb, 'attendanceLogs', 'pending'));
    const persistedAttachment = persistedRequest.data().attachments[0];
    const invalidCleanupBatch = writeBatch(ownerDb);
    invalidCleanupBatch.update(doc(ownerDb, 'attendanceLogs', 'pending'), { attachments: [] });
    invalidCleanupBatch.set(doc(ownerDb, 'requestAttachmentCleanupQueue', 'a1'), {
      requestKind: 'attendance', requestId: 'pending', ownerUid: otherUid, actorUid: ownerUid,
      attachment: persistedAttachment, attemptCount: 0,
    });
    await assertFails(invalidCleanupBatch.commit());

    const cleanupBatch = writeBatch(ownerDb);
    cleanupBatch.update(doc(ownerDb, 'attendanceLogs', 'pending'), { attachments: [] });
    cleanupBatch.set(doc(ownerDb, 'requestAttachmentCleanupQueue', 'a1'), {
      requestKind: 'attendance', requestId: 'pending', ownerUid, actorUid: ownerUid,
      attachment: persistedAttachment, attemptCount: 0,
    });
    await assertSucceeds(cleanupBatch.commit());
    const cleanupRef = doc(ownerDb, 'requestAttachmentCleanupQueue', 'a1');
    await assertSucceeds(updateDoc(cleanupRef, { attemptCount: 1, lastAttemptAt: new Date(), lastErrorCode: 'storage-delete-failed' }));
    await assertFails(updateDoc(cleanupRef, { actorUid: otherUid }));
    await assertSucceeds(deleteDoc(sessionRef));
    await assertSucceeds(deleteObject(fileRef));
    await assertSucceeds(deleteObject(adminFileRef));
    await assertSucceeds(deleteObject(ref(admin.storage(), createAttachment.storagePath)));
    await assertFails(updateDoc(cleanupRef, { attachment: { id: 'evil' } }));

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
