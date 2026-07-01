const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { Timestamp, deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc, writeBatch } = require('firebase/firestore');
const { deleteObject, getBytes, ref, uploadBytes } = require('firebase/storage');

const projectId = 'demo-user-journey';
const ownerUid = 'journey-owner';
const otherUid = 'journey-other';
const adminUid = 'journey-admin';
const admin2Uid = 'journey-admin-2';
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

function auditData(auditId, action, actorUid, title = '到職事件', overrides = {}) {
  return {
    eventId,
    targetUserId: ownerUid,
    action,
    actorUid,
    actionAt: serverTimestamp(),
    title,
    changedFields: action === 'delete' ? [] : ['title'],
    attachmentSummary: [],
    ...overrides,
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
        setDoc(doc(db, 'users', admin2Uid), { role: 'admin' }),
      ]);
    });

    const owner = env.authenticatedContext(ownerUid);
    const other = env.authenticatedContext(otherUid);
    const admin = env.authenticatedContext(adminUid);
    const admin2 = env.authenticatedContext(admin2Uid);
    const anonymous = env.unauthenticatedContext();
    const eventRef = doc(admin.firestore(), 'userJourneyEvents', eventId);

    // issue #36 mitigation：create 暫時降到 signed-in only，用來排除正式環境 schema/admin 評估差異。
    await assertFails(setDoc(doc(anonymous.firestore(), 'userJourneyEvents', 'anonymous-create'), eventData('anonymous-audit')));
    const ownerCreate = writeBatch(owner.firestore());
    ownerCreate.set(doc(owner.firestore(), 'userJourneyEvents', 'owner-create'), eventData('owner-audit'));
    await assertSucceeds(ownerCreate.commit());
    await assertSucceeds(setDoc(doc(owner.firestore(), 'userJourneyEvents', 'owner-self-create'), eventData(
      'owner-self-audit',
      {
        createdBy: ownerUid,
        updatedBy: ownerUid,
        deleteAuditId: 'owner-self-delete',
      }
    )));

    await assertFails(setDoc(
      doc(owner.firestore(), 'userJourneyEventAudits', 'owner-audit-create'),
      auditData('owner-audit-create', 'create', ownerUid, '非 Admin 稽核', { eventId: 'missing-event' })
    ));
    await assertSucceeds(setDoc(
      doc(admin.firestore(), 'userJourneyEventAudits', 'orphan-audit'),
      auditData('orphan-audit', 'create', adminUid, '孤立稽核', { eventId: 'missing-event' })
    ));

    const create = writeBatch(admin.firestore());
    create.set(eventRef, eventData('audit-create'));
    create.set(
      doc(admin.firestore(), 'userJourneyEventAudits', 'audit-create'),
      auditData('audit-create', 'create', adminUid)
    );
    await assertSucceeds(create.commit());

    // GitHub issue #36：正式環境曾發生「新 user、尚無任何補助紀錄」時，
    // Admin 在使用者歷程建立第一筆無附件事件被 rules 誤拒。
    const freshUserUid = 'journey-fresh-user';
    const freshEventId = 'fresh-user-first-event';
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', freshUserUid), { role: 'user' });
    });
    const freshCreate = writeBatch(admin.firestore());
    freshCreate.set(doc(admin.firestore(), 'userJourneyEvents', freshEventId), eventData('audit-fresh-create', {
      targetUserId: freshUserUid,
      title: '新人到職',
      content: '建立第一筆使用者歷程',
      deleteAuditId: 'audit-fresh-delete',
    }));
    freshCreate.set(
      doc(admin.firestore(), 'userJourneyEventAudits', 'audit-fresh-create'),
      auditData('audit-fresh-create', 'create', adminUid, '新人到職', {
        eventId: freshEventId,
        targetUserId: freshUserUid,
        changedFields: ['eventDate', 'title', 'content'],
      })
    );
    await assertSucceeds(freshCreate.commit());

    // issue #36 後續：Production 對新 event batch 內的 create audit `getAfter()` 仍回 permission denied。
    // event Rules 不反向讀 audit，create audit Rules 也不反查新 parent event；create audit 由 service best-effort 補寫。
    await assertSucceeds(setDoc(doc(admin.firestore(), 'userJourneyEvents', 'admin-event-without-audit'), eventData(
      'audit-created-by-service',
      { deleteAuditId: 'audit-delete-created-by-service' }
    )));
    const postCreateUpdate = writeBatch(admin.firestore());
    postCreateUpdate.update(doc(admin.firestore(), 'userJourneyEvents', 'admin-event-without-audit'), {
      content: '建立後修改內容',
      updatedBy: adminUid,
      updatedAt: serverTimestamp(),
      lastAuditId: 'audit-post-create-update',
    });
    postCreateUpdate.set(
      doc(admin.firestore(), 'userJourneyEventAudits', 'audit-post-create-update'),
      auditData('audit-post-create-update', 'update', adminUid, '到職事件', {
        eventId: 'admin-event-without-audit',
        changedFields: ['content'],
      })
    );
    await assertSucceeds(postCreateUpdate.commit());

    // Production regression：create path 不再要求 serverTimestamp transform 必須等於 request.time；
    // 只要求 timestamp 型別與 actor/admin/schema 正確，避免合法寫入因時間比對誤拒。
    await assertSucceeds(setDoc(
      doc(admin.firestore(), 'userJourneyEvents', 'admin-event-client-timestamps'),
      eventData('audit-client-timestamps', {
        createdAt: Timestamp.fromDate(new Date('2026-06-20T01:00:00Z')),
        updatedAt: Timestamp.fromDate(new Date('2026-06-20T01:00:00Z')),
        deleteAuditId: 'audit-client-timestamps-delete',
      })
    ));
    await assertSucceeds(setDoc(
      doc(admin.firestore(), 'userJourneyEventAudits', 'audit-client-timestamps'),
      auditData('audit-client-timestamps', 'create', adminUid, '用戶端時間稽核', {
        eventId: 'admin-event-client-timestamps',
        actionAt: Timestamp.fromDate(new Date('2026-06-20T01:00:00Z')),
      })
    ));

    // 已登入使用者皆可跨使用者讀取；未登入不可讀取。
    await assertSucceeds(getDoc(doc(owner.firestore(), 'userJourneyEvents', eventId)));
    await assertSucceeds(getDoc(doc(other.firestore(), 'userJourneyEvents', eventId)));
    await assertSucceeds(getDoc(eventRef));
    await assertFails(getDoc(doc(anonymous.firestore(), 'userJourneyEvents', eventId)));

    // issue #36 production mitigation：更新暫時改以 signed-in actor 驗證，前端入口仍只顯示給 Admin。
    const ownerUpdate = writeBatch(owner.firestore());
    ownerUpdate.update(doc(owner.firestore(), 'userJourneyEvents', eventId), {
      title: '到職事件（更新）', updatedBy: ownerUid, updatedAt: serverTimestamp(), lastAuditId: 'audit-owner-update',
    });
    ownerUpdate.set(
      doc(owner.firestore(), 'userJourneyEventAudits', 'audit-owner-update'),
      auditData('audit-owner-update', 'update', ownerUid, '到職事件（更新）')
    );
    await assertSucceeds(ownerUpdate.commit());

    const adminUpdate = writeBatch(admin.firestore());
    adminUpdate.update(eventRef, {
      title: '到職事件（更新）', updatedBy: adminUid, updatedAt: serverTimestamp(), lastAuditId: 'audit-admin-update',
    });
    adminUpdate.set(
      doc(admin.firestore(), 'userJourneyEventAudits', 'audit-admin-update'),
      auditData('audit-admin-update', 'update', adminUid, '到職事件（更新）')
    );
    await assertSucceeds(adminUpdate.commit());

    const immutableUpdate = writeBatch(admin.firestore());
    immutableUpdate.update(eventRef, {
      targetUserId: otherUid,
      updatedBy: adminUid,
      updatedAt: serverTimestamp(),
      lastAuditId: 'audit-immutable-update',
    });
    immutableUpdate.set(
      doc(admin.firestore(), 'userJourneyEventAudits', 'audit-immutable-update'),
      auditData('audit-immutable-update', 'update', adminUid, '到職事件（更新）')
    );
    await assertFails(immutableUpdate.commit());

    const otherUpdate = writeBatch(other.firestore());
    otherUpdate.update(doc(other.firestore(), 'userJourneyEvents', eventId), {
      title: '越權修改', updatedBy: otherUid, updatedAt: serverTimestamp(), lastAuditId: 'audit-other-update',
    });
    otherUpdate.set(
      doc(other.firestore(), 'userJourneyEventAudits', 'audit-other-update'),
      auditData('audit-other-update', 'update', otherUid, '越權修改')
    );
    await assertSucceeds(otherUpdate.commit());

    const delegatedUpdate = writeBatch(admin.firestore());
    delegatedUpdate.update(eventRef, {
      content: '代填 updatedBy 也不阻擋正式更新',
      updatedBy: admin2Uid,
      updatedAt: serverTimestamp(),
      lastAuditId: 'audit-delegated-updated-by',
    });
    delegatedUpdate.set(
      doc(admin.firestore(), 'userJourneyEventAudits', 'audit-delegated-updated-by'),
      auditData('audit-delegated-updated-by', 'update', adminUid, '到職事件（更新）')
    );
    await assertSucceeds(delegatedUpdate.commit());

    // 新附件路徑沿用既有附件限制：session 綁定、登入者可讀、禁止覆寫。
    const attachmentId = 'proof';
    const sessionId = 'session-1';
    const storagePath = `journey-event-attachments/${ownerUid}/${eventId}/${sessionId}/${attachmentId}`;
    await assertSucceeds(setDoc(doc(owner.firestore(), 'journeyEventAttachmentUploadSessions', 'owner-session'), {
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

    const adminOverrideSessionId = 'owner-session-admin-override';
    const adminOverrideAttachmentId = 'admin-override-proof';
    const adminOverrideStoragePath = `journey-event-attachments/${ownerUid}/${eventId}/${adminOverrideSessionId}/${adminOverrideAttachmentId}`;
    await assertSucceeds(setDoc(doc(owner.firestore(), 'journeyEventAttachmentUploadSessions', adminOverrideSessionId), {
      eventId, targetUserId: ownerUid, actorUid: ownerUid, status: 'uploading',
      plannedAttachments: [{ id: adminOverrideAttachmentId }], plannedPaths: [adminOverrideStoragePath],
    }));
    const adminOverrideFileRef = ref(admin.storage(), adminOverrideStoragePath);
    await assertSucceeds(uploadBytes(
      adminOverrideFileRef,
      new Blob(['%PDF-admin-override'], { type: 'application/pdf' }),
      {
        contentType: 'application/pdf',
        customMetadata: {
          eventId,
          targetUserId: ownerUid,
          attachmentId: adminOverrideAttachmentId,
          uploadedBy: adminUid,
        },
      }
    ));
    await assertSucceeds(deleteObject(adminOverrideFileRef));

    const altSessionId = 'session-2';
    const altStoragePath = `journey-event-attachments/${ownerUid}/${eventId}/${altSessionId}/${attachmentId}`;
    await assertSucceeds(setDoc(doc(admin.firestore(), 'journeyEventAttachmentUploadSessions', altSessionId), {
      eventId, targetUserId: ownerUid, actorUid: adminUid, status: 'uploading',
      plannedAttachments: [{ id: attachmentId }], plannedPaths: [altStoragePath],
    }));
    const altFileRef = ref(admin.storage(), altStoragePath);
    await assertSucceeds(uploadBytes(altFileRef, new Blob(['%PDF-alt'], { type: 'application/pdf' }), metadata));
    await assertSucceeds(deleteDoc(doc(admin.firestore(), 'journeyEventAttachmentUploadSessions', altSessionId)));

    const adminCleanupSessionId = 'owner-cleanup-admin-override';
    const adminCleanupAttachmentId = 'admin-cleanup-proof';
    const adminCleanupStoragePath = `journey-event-attachments/${ownerUid}/${eventId}/${adminCleanupSessionId}/${adminCleanupAttachmentId}`;
    await assertSucceeds(setDoc(doc(owner.firestore(), 'journeyEventAttachmentUploadSessions', adminCleanupSessionId), {
      eventId, targetUserId: ownerUid, actorUid: ownerUid, status: 'uploading',
      plannedAttachments: [{ id: adminCleanupAttachmentId }], plannedPaths: [adminCleanupStoragePath],
    }));
    const adminCleanupFileRef = ref(owner.storage(), adminCleanupStoragePath);
    await assertSucceeds(uploadBytes(
      adminCleanupFileRef,
      new Blob(['%PDF-admin-cleanup'], { type: 'application/pdf' }),
      {
        contentType: 'application/pdf',
        customMetadata: {
          eventId,
          targetUserId: ownerUid,
          attachmentId: adminCleanupAttachmentId,
          uploadedBy: ownerUid,
        },
      }
    ));
    await assertSucceeds(deleteDoc(doc(owner.firestore(), 'journeyEventAttachmentUploadSessions', adminCleanupSessionId)));
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'journeyEventAttachmentCleanupQueue', adminCleanupAttachmentId), {
        eventId,
        targetUserId: ownerUid,
        actorUid: ownerUid,
        attachment: {
          id: adminCleanupAttachmentId,
          storagePath: adminCleanupStoragePath,
          originalName: 'admin-cleanup.pdf',
          contentType: 'application/pdf',
          size: 18,
          uploadedBy: ownerUid,
          uploadedAt: new Date('2026-06-20T00:00:00Z'),
        },
        createdAt: new Date('2026-06-20T00:00:00Z'),
        attemptCount: 0,
      });
    });
    await assertSucceeds(deleteObject(ref(admin.storage(), adminCleanupStoragePath)));

    // admin 可刪除；delete audit 仍必須使用預先綁定的 deleteAuditId 才能建立。
    const attachmentMeta = {
      id: attachmentId,
      storagePath,
      originalName: 'proof.pdf',
      contentType: 'application/pdf',
      size: 5,
      uploadedBy: adminUid,
      uploadedAt: new Date('2026-06-20T00:00:00Z'),
    };
    const relaxedAttachmentSchemaUpdate = writeBatch(admin.firestore());
    relaxedAttachmentSchemaUpdate.update(eventRef, {
      attachments: [{ rogue: 'data' }],
      updatedBy: adminUid,
      updatedAt: serverTimestamp(),
      lastAuditId: 'audit-relaxed-attachment-schema',
    });
    relaxedAttachmentSchemaUpdate.set(
      doc(admin.firestore(), 'userJourneyEventAudits', 'audit-relaxed-attachment-schema'),
      auditData('audit-relaxed-attachment-schema', 'update', adminUid, '到職事件（更新）')
    );
    await assertSucceeds(relaxedAttachmentSchemaUpdate.commit());

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

    const mismatchedPathCleanup = writeBatch(admin.firestore());
    mismatchedPathCleanup.set(
      doc(admin.firestore(), 'journeyEventAttachmentCleanupQueue', attachmentId),
      {
        eventId,
        targetUserId: ownerUid,
        actorUid: adminUid,
        attachment: { ...attachmentMeta, storagePath: altStoragePath },
        createdAt: serverTimestamp(),
        attemptCount: 0,
      }
    );
    mismatchedPathCleanup.update(eventRef, {
      attachments: [],
      updatedBy: adminUid,
      updatedAt: serverTimestamp(),
      lastAuditId: 'audit-mismatched-cleanup-path',
    });
    mismatchedPathCleanup.set(
      doc(admin.firestore(), 'userJourneyEventAudits', 'audit-mismatched-cleanup-path'),
      auditData('audit-mismatched-cleanup-path', 'update', adminUid, '到職事件（更新）')
    );
    await assertFails(mismatchedPathCleanup.commit());

    const relaxedTimestampCleanup = writeBatch(admin.firestore());
    relaxedTimestampCleanup.set(
      doc(admin.firestore(), 'journeyEventAttachmentCleanupQueue', attachmentId),
      {
        eventId,
        targetUserId: ownerUid,
        actorUid: adminUid,
        attachment: { ...attachmentMeta, uploadedAt: new Date('2026-06-20T00:00:01Z') },
        createdAt: serverTimestamp(),
        attemptCount: 0,
      }
    );
    relaxedTimestampCleanup.update(eventRef, {
      attachments: [],
      updatedBy: adminUid,
      updatedAt: serverTimestamp(),
      lastAuditId: 'audit-relaxed-cleanup-timestamp',
    });
    relaxedTimestampCleanup.set(
      doc(admin.firestore(), 'userJourneyEventAudits', 'audit-relaxed-cleanup-timestamp'),
      auditData('audit-relaxed-cleanup-timestamp', 'update', adminUid, '到職事件（更新）')
    );
    await assertSucceeds(relaxedTimestampCleanup.commit());
    await assertFails(updateDoc(doc(admin2.firestore(), 'journeyEventAttachmentCleanupQueue', attachmentId), {
      attemptCount: 1,
      lastErrorCode: 'storage-delete-failed',
    }));
    await assertSucceeds(updateDoc(doc(admin.firestore(), 'journeyEventAttachmentCleanupQueue', attachmentId), {
      attemptCount: 1,
      lastErrorCode: 'storage-delete-failed',
    }));
    await assertFails(deleteDoc(doc(admin2.firestore(), 'journeyEventAttachmentCleanupQueue', attachmentId)));
    await assertSucceeds(deleteDoc(doc(admin.firestore(), 'journeyEventAttachmentCleanupQueue', attachmentId)));
    await assertFails(updateDoc(doc(admin.firestore(), 'journeyEventAttachmentCleanupQueue', attachmentId), {
      attemptCount: 2,
    }));

    const restoreAttachment = writeBatch(admin.firestore());
    restoreAttachment.update(eventRef, {
      attachments: [attachmentMeta],
      updatedBy: adminUid,
      updatedAt: serverTimestamp(),
      lastAuditId: 'audit-restore-attachment',
    });
    restoreAttachment.set(
      doc(admin.firestore(), 'userJourneyEventAudits', 'audit-restore-attachment'),
      auditData('audit-restore-attachment', 'update', adminUid, '到職事件（更新）')
    );
    await assertSucceeds(restoreAttachment.commit());

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
    await assertFails(deleteObject(altFileRef));
    await assertSucceeds(deleteObject(ref(admin.storage(), storagePath)));
    await assertFails(getDoc(doc(anonymous.firestore(), 'userJourneyEventAudits', 'audit-delete')));
    await assertFails(getDoc(doc(owner.firestore(), 'userJourneyEventAudits', 'audit-delete')));
    await assertFails(getDoc(doc(other.firestore(), 'userJourneyEventAudits', 'audit-delete')));

    const legacyEventId = 'legacy-event';
    const legacyAttachmentId = 'legacy-proof';
    const legacyStoragePath = `journey-event-attachments/${ownerUid}/${legacyEventId}/legacy-session/${legacyAttachmentId}`;
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'userJourneyEvents', legacyEventId), eventData('audit-legacy-create', {
        title: '歷史附件事件',
        attachments: [{
          storagePath: legacyStoragePath,
          originalName: 'legacy.pdf',
          contentType: 'application/pdf',
          size: 5,
          uploadedBy: adminUid,
          uploadedAt: new Date('2026-06-20T00:00:00Z'),
        }],
        lastAuditId: 'audit-legacy-create',
        deleteAuditId: 'audit-legacy-delete',
      }));
    });
    const deleteLegacy = writeBatch(admin.firestore());
    deleteLegacy.set(
      doc(admin.firestore(), 'journeyEventAttachmentCleanupQueue', legacyAttachmentId),
      {
        eventId: legacyEventId,
        targetUserId: ownerUid,
        actorUid: adminUid,
        attachment: {
          id: legacyAttachmentId,
          storagePath: legacyStoragePath,
          originalName: 'legacy.pdf',
          contentType: 'application/pdf',
          size: 5,
          uploadedBy: adminUid,
          uploadedAt: new Date('2026-06-20T00:00:00Z'),
        },
        createdAt: serverTimestamp(),
        attemptCount: 0,
      }
    );
    deleteLegacy.set(
      doc(admin.firestore(), 'userJourneyEventAudits', 'audit-legacy-delete'),
      auditData('audit-legacy-delete', 'delete', adminUid, '歷史附件事件', { eventId: legacyEventId })
    );
    deleteLegacy.delete(doc(admin.firestore(), 'userJourneyEvents', legacyEventId));
    await assertSucceeds(deleteLegacy.commit());

    console.log('Journey event Firestore/Storage rules tests passed.');
  } finally {
    await env.cleanup();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
