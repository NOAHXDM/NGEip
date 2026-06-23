const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { deleteDoc, doc, getDoc, serverTimestamp, setDoc, writeBatch } = require('firebase/firestore');
const { deleteObject, getBytes, ref, uploadBytes } = require('firebase/storage');

const projectId = 'demo-user-journey';
const ownerUid = 'journey-owner';
const otherUid = 'journey-other';
const adminUid = 'journey-admin';
const eventId = 'event-1';

function eventData(auditId, overrides = {}) {
  return {
    targetUserId: ownerUid,
    eventDate: new Date('2026-06-20T00:00:00Z'),
    title: '到職事件',
    content: '完成到職程序',
    attachments: [],
    createdBy: adminUid,
    createdAt: serverTimestamp(),
    updatedBy: adminUid,
    updatedAt: serverTimestamp(),
    lastAuditId: auditId,
    deleteAuditId: 'audit-delete',
    ...overrides,
  };
}

function auditData(auditId, action, actorUid, title = '到職事件') {
  return {
    eventId,
    targetUserId: ownerUid,
    action,
    actorUid,
    actionAt: serverTimestamp(),
    title,
    changedFields: action === 'delete' ? [] : ['title'],
    attachmentSummary: [],
  };
}

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
    const eventRef = doc(admin.firestore(), 'userJourneyEvents', eventId);

    // 只有 admin 可建立，且事件與不可變 audit 必須原子寫入。
    const ownerCreate = writeBatch(owner.firestore());
    ownerCreate.set(doc(owner.firestore(), 'userJourneyEvents', 'owner-create'), eventData('owner-audit'));
    await assertFails(ownerCreate.commit());

    const create = writeBatch(admin.firestore());
    create.set(eventRef, eventData('audit-create'));
    create.set(
      doc(admin.firestore(), 'userJourneyEventAudits', 'audit-create'),
      auditData('audit-create', 'create', adminUid)
    );
    await assertSucceeds(create.commit());

    // 已登入使用者皆可跨使用者讀取；未登入不可讀取。
    await assertSucceeds(getDoc(doc(owner.firestore(), 'userJourneyEvents', eventId)));
    await assertSucceeds(getDoc(doc(other.firestore(), 'userJourneyEvents', eventId)));
    await assertSucceeds(getDoc(eventRef));
    await assertFails(getDoc(doc(anonymous.firestore(), 'userJourneyEvents', eventId)));

    // 只有 admin 可更新；目標使用者與非目標使用者均只能讀取。更新必須伴隨新 audit。
    const ownerUpdate = writeBatch(owner.firestore());
    ownerUpdate.update(doc(owner.firestore(), 'userJourneyEvents', eventId), {
      title: '到職事件（更新）', updatedBy: ownerUid, updatedAt: serverTimestamp(), lastAuditId: 'audit-owner-update',
    });
    ownerUpdate.set(
      doc(owner.firestore(), 'userJourneyEventAudits', 'audit-owner-update'),
      auditData('audit-owner-update', 'update', ownerUid, '到職事件（更新）')
    );
    await assertFails(ownerUpdate.commit());

    const adminUpdate = writeBatch(admin.firestore());
    adminUpdate.update(eventRef, {
      title: '到職事件（更新）', updatedBy: adminUid, updatedAt: serverTimestamp(), lastAuditId: 'audit-admin-update',
    });
    adminUpdate.set(
      doc(admin.firestore(), 'userJourneyEventAudits', 'audit-admin-update'),
      auditData('audit-admin-update', 'update', adminUid, '到職事件（更新）')
    );
    await assertSucceeds(adminUpdate.commit());

    const otherUpdate = writeBatch(other.firestore());
    otherUpdate.update(doc(other.firestore(), 'userJourneyEvents', eventId), {
      title: '越權修改', updatedBy: otherUid, updatedAt: serverTimestamp(), lastAuditId: 'audit-other-update',
    });
    otherUpdate.set(
      doc(other.firestore(), 'userJourneyEventAudits', 'audit-other-update'),
      auditData('audit-other-update', 'update', otherUid, '越權修改')
    );
    await assertFails(otherUpdate.commit());

    // 新附件路徑沿用既有附件限制：session 綁定、登入者可讀、禁止覆寫。
    const attachmentId = 'proof';
    const sessionId = 'session-1';
    const storagePath = `journey-event-attachments/${ownerUid}/${eventId}/${sessionId}/${attachmentId}`;
    await assertFails(setDoc(doc(owner.firestore(), 'journeyEventAttachmentUploadSessions', 'owner-session'), {
      eventId, targetUserId: ownerUid, actorUid: ownerUid, status: 'uploading',
      plannedAttachments: [{ id: attachmentId }], plannedPaths: [storagePath],
    }));
    await assertSucceeds(setDoc(doc(admin.firestore(), 'journeyEventAttachmentUploadSessions', sessionId), {
      eventId, targetUserId: ownerUid, actorUid: adminUid, status: 'uploading',
      plannedAttachments: [{ id: attachmentId }], plannedPaths: [storagePath],
    }));
    const fileRef = ref(admin.storage(), storagePath);
    const metadata = {
      contentType: 'application/pdf',
      customMetadata: { eventId, targetUserId: ownerUid, attachmentId, uploadedBy: adminUid },
    };
    await assertSucceeds(uploadBytes(fileRef, new Blob(['%PDF-'], { type: 'application/pdf' }), metadata));
    await assertSucceeds(getBytes(ref(other.storage(), storagePath), 3 * 1024 * 1024));
    await assertFails(getBytes(ref(anonymous.storage(), storagePath)));
    await assertFails(uploadBytes(fileRef, new Blob(['%PDF-'], { type: 'application/pdf' }), metadata));
    await assertSucceeds(deleteDoc(doc(admin.firestore(), 'journeyEventAttachmentUploadSessions', sessionId)));
    await assertFails(deleteObject(fileRef));

    // admin 可刪除，且必須在同一批次留下預先綁定的 delete audit。
    const attachmentMeta = {
      id: attachmentId,
      storagePath,
      originalName: 'proof.pdf',
      contentType: 'application/pdf',
      size: 5,
      uploadedBy: adminUid,
      uploadedAt: new Date('2026-06-20T00:00:00Z'),
    };
    const remove = writeBatch(admin.firestore());
    remove.update(eventRef, {
      attachments: [attachmentMeta],
      updatedBy: adminUid,
      updatedAt: serverTimestamp(),
      lastAuditId: 'audit-attach',
    });
    remove.set(
      doc(admin.firestore(), 'userJourneyEventAudits', 'audit-attach'),
      auditData('audit-attach', 'update', adminUid, '到職事件（更新）')
    );
    await assertSucceeds(remove.commit());

    const removeWithCleanup = writeBatch(admin.firestore());
    removeWithCleanup.set(
      doc(admin.firestore(), 'journeyEventAttachmentCleanupQueue', attachmentId),
      {
        eventId,
        targetUserId: ownerUid,
        actorUid: adminUid,
        attachment: attachmentMeta,
        createdAt: serverTimestamp(),
        attemptCount: 0,
      }
    );
    removeWithCleanup.set(
      doc(admin.firestore(), 'userJourneyEventAudits', 'audit-delete'),
      auditData('audit-delete', 'delete', adminUid, '到職事件（更新）')
    );
    removeWithCleanup.delete(eventRef);
    await assertSucceeds(removeWithCleanup.commit());
    await assertSucceeds(deleteObject(fileRef));
    await assertFails(getDoc(doc(anonymous.firestore(), 'userJourneyEventAudits', 'audit-delete')));

    console.log('Journey event Firestore/Storage rules tests passed.');
  } finally {
    await env.cleanup();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
