const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { collection, doc, setDoc, updateDoc, writeBatch } = require('firebase/firestore');

// GitHub issue #34：任一已登入者可變更 attendance status；附件更新仍維持 owner/admin 邊界。
// GitHub issue #38：內容欄位另開放給代理人代改，但代理人不得改派代理人或動附件。
// 驗證矩陣涵蓋 owner、proxy、other-user、admin、未登入者、status transition 與特休餘額連動。
const projectId = 'demo-attendance-permission';
const ownerUid = 'attendance-owner';
const otherUid = 'attendance-other';
const adminUid = 'attendance-admin';
const proxyUid = 'attendance-proxy';

async function main() {
  const env = await initializeTestEnvironment({ projectId });
  try {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await Promise.all([
        setDoc(doc(db, 'users', ownerUid), { role: 'user', remainingLeaveHours: 16 }),
        setDoc(doc(db, 'users', otherUid), { role: 'user' }),
        setDoc(doc(db, 'users', adminUid), { role: 'admin' }),
        setDoc(doc(db, 'users', proxyUid), { role: 'user' }),
      ]);
    });

    const owner = env.authenticatedContext(ownerUid);
    const other = env.authenticatedContext(otherUid);
    const admin = env.authenticatedContext(adminUid);
    const proxy = env.authenticatedContext(proxyUid);
    const anonymous = env.unauthenticatedContext();
    const ownerDb = owner.firestore();

    const attachment = {
      id: 'a1', storagePath: 'request-attachments/attendance/pending/session/a1',
      originalName: 'proof.pdf', contentType: 'application/pdf', size: 5,
      uploadedBy: ownerUid, uploadedAt: new Date(),
    };

    // 申請人於 pending 建立自己的 attendance 申請。
    await assertSucceeds(setDoc(doc(ownerDb, 'attendanceLogs', 'pending'), {
      userId: ownerUid, status: 'pending', type: 1, reason: 'origin', hours: 8, attachments: [],
    }));

    // 1. 申請人本人可在 pending 編輯非附件欄位（既有合法流程不得回歸）。
    await assertSucceeds(updateDoc(doc(ownerDb, 'attendanceLogs', 'pending'), { reason: 'owner edit' }));
    // 2. 申請人本人可在 pending 管理自己的附件。
    await assertSucceeds(updateDoc(doc(ownerDb, 'attendanceLogs', 'pending'), { attachments: [attachment] }));
    // 3. 任一已登入者可變更 status，包含申請人自我核准。
    await assertSucceeds(updateDoc(doc(ownerDb, 'attendanceLogs', 'pending'), { status: 'approved' }));
    await assertSucceeds(updateDoc(doc(other.firestore(), 'attendanceLogs', 'pending'), { status: 'pending' }));
    // 4. 申請人不得竄改 userId 將申請轉移。
    await assertFails(updateDoc(doc(ownerDb, 'attendanceLogs', 'pending'), { userId: otherUid }));

    // 5. 其他登入者不得修改他人的非附件欄位（issue #22 核心修正）。
    await assertFails(updateDoc(doc(other.firestore(), 'attendanceLogs', 'pending'), { reason: 'hijack' }));
    await assertFails(updateDoc(doc(other.firestore(), 'attendanceLogs', 'pending'), { type: 3 }));
    // 6. 其他登入者亦不得修改他人附件。
    await assertFails(updateDoc(doc(other.firestore(), 'attendanceLogs', 'pending'), { attachments: [] }));

    // 7. 未登入者一律拒絕更新。
    await assertFails(updateDoc(doc(anonymous.firestore(), 'attendanceLogs', 'pending'), { reason: 'anon' }));

    // 8. admin 可核准（pending -> approved）。
    await assertSucceeds(updateDoc(doc(admin.firestore(), 'attendanceLogs', 'pending'), { status: 'approved' }));

    // 9. 申請已核准後，申請人不得再編輯非附件欄位或附件（僅 admin 可代辦）。
    await assertFails(updateDoc(doc(ownerDb, 'attendanceLogs', 'pending'), { reason: 'late edit' }));
    await assertFails(updateDoc(doc(ownerDb, 'attendanceLogs', 'pending'), { attachments: [] }));
    // 10. admin 可在任何狀態下編輯非附件欄位與退回待審。
    await assertSucceeds(updateDoc(doc(admin.firestore(), 'attendanceLogs', 'pending'), { reason: 'admin amend' }));
    await assertSucceeds(updateDoc(doc(admin.firestore(), 'attendanceLogs', 'pending'), { status: 'pending' }));

    // 11. 其他登入者可將他人申請退回待審，但仍不可同時修改其他欄位。
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), 'attendanceLogs', 'pending'), { status: 'rejected' });
    });
    await assertSucceeds(updateDoc(doc(other.firestore(), 'attendanceLogs', 'pending'), { status: 'pending' }));
    await assertFails(updateDoc(doc(other.firestore(), 'attendanceLogs', 'pending'), { status: 'approved', reason: 'mixed update' }));

    // 12. 任一已登入者可在同一 transaction 內核准他人特休並扣除該使用者剩餘特休時數。
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'attendanceLogs', 'annual'), {
        userId: ownerUid, status: 'pending', type: 4, reason: 'annual', hours: 8, attachments: [],
      });
    });
    const otherDb = other.firestore();
    const annualApproval = writeBatch(otherDb);
    annualApproval.update(doc(otherDb, 'attendanceLogs', 'annual'), { status: 'approved' });
    annualApproval.update(doc(otherDb, 'users', ownerUid), {
      remainingLeaveHours: 8,
      lastAttendanceLeaveAdjustmentId: 'annual',
      lastAttendanceLeaveAdjustmentBy: otherUid,
    });
    annualApproval.set(doc(collection(otherDb, 'users', ownerUid, 'leaveTransactionHistory')), {
      actionBy: otherUid,
      attendanceId: 'annual',
      hours: -8,
      reason: '來自出勤申請#annual',
      statusChange: 'pending->approved',
    });
    await assertSucceeds(annualApproval.commit());

    // 13. 餘額調整必須與同一筆合法 attendance status transition 對齊，不能單獨任意改。
    await assertFails(updateDoc(doc(other.firestore(), 'users', ownerUid), {
      remainingLeaveHours: 99,
      lastAttendanceLeaveAdjustmentId: 'annual',
      lastAttendanceLeaveAdjustmentBy: otherUid,
    }));

    // GitHub issue #38：代理人可在 pending 期間代改申請內容，
    // 但不得改派代理人（避免把編輯權轉發給第三方）、不得動附件、不得改 userId/status。
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'attendanceLogs', 'proxied'), {
        userId: ownerUid, status: 'pending', type: 1, reason: 'origin',
        hours: 8, attachments: [], proxyUserId: proxyUid,
      });
    });
    const proxyDb = proxy.firestore();
    // 14. 代理人可代改結束時間等內容欄位（issue #38 的產品需求）。
    await assertSucceeds(updateDoc(doc(proxyDb, 'attendanceLogs', 'proxied'), { reason: 'proxy amend' }));
    await assertSucceeds(updateDoc(doc(proxyDb, 'attendanceLogs', 'proxied'), { hours: 4 }));
    // 15. 代理人不得改派代理人（含改成自己以外的人與清空）。
    await assertFails(updateDoc(doc(proxyDb, 'attendanceLogs', 'proxied'), { proxyUserId: otherUid }));
    await assertFails(updateDoc(doc(proxyDb, 'attendanceLogs', 'proxied'), { proxyUserId: '' }));
    // 16. 代理人不得動附件（附件仍由 upload session 鏈以申請人為準）。
    await assertFails(updateDoc(doc(proxyDb, 'attendanceLogs', 'proxied'), { attachments: [attachment] }));
    // 17. 代理人不得轉移申請人。
    await assertFails(updateDoc(doc(proxyDb, 'attendanceLogs', 'proxied'), { userId: proxyUid }));
    // 18. 代理人不得在改 status 的同時夾帶內容變更。
    await assertFails(updateDoc(doc(proxyDb, 'attendanceLogs', 'proxied'), { status: 'approved', reason: 'mixed' }));
    // 19. 申請人本人仍可改派代理人。
    await assertSucceeds(updateDoc(doc(ownerDb, 'attendanceLogs', 'proxied'), { proxyUserId: otherUid }));
    // 20. 已被改派後，原代理人失去編輯權。
    await assertFails(updateDoc(doc(proxyDb, 'attendanceLogs', 'proxied'), { reason: 'stale proxy' }));
    // 21. 非 pending 時代理人亦不得編輯。
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), 'attendanceLogs', 'proxied'), {
        status: 'approved', proxyUserId: proxyUid,
      });
    });
    await assertFails(updateDoc(doc(proxyDb, 'attendanceLogs', 'proxied'), { reason: 'approved edit' }));

    // 22. 舊文件沒有 proxyUserId 欄位時，申請人本人的既有流程不得因缺欄位而被誤拒。
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'attendanceLogs', 'legacy'), {
        userId: ownerUid, status: 'pending', type: 1, reason: 'legacy', hours: 8,
      });
    });
    await assertSucceeds(updateDoc(doc(ownerDb, 'attendanceLogs', 'legacy'), { reason: 'legacy edit' }));
    await assertFails(updateDoc(doc(proxyDb, 'attendanceLogs', 'legacy'), { reason: 'legacy hijack' }));

    // 23. 代理人編輯「已有附件」的申請：AttachmentService 每次更新都會把 attachments
    // 原樣寫回，因此規則的 list-of-maps 相等比較必須成立，否則帶附件的申請一律改不了。
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'attendanceLogs', 'proxied-with-files'), {
        userId: ownerUid, status: 'pending', type: 1, reason: 'origin',
        hours: 8, attachments: [attachment], proxyUserId: proxyUid,
      });
    });
    // 只改內容、不帶 attachments。
    await assertSucceeds(updateDoc(doc(proxyDb, 'attendanceLogs', 'proxied-with-files'), { reason: 'proxy amend' }));
    // 內容變更 + 原樣寫回 attachments（實際客戶端的寫入形狀）。
    await assertSucceeds(updateDoc(doc(proxyDb, 'attendanceLogs', 'proxied-with-files'), {
      reason: 'proxy amend again', attachments: [attachment],
    }));
    // 但變更附件內容仍必須被拒。
    await assertFails(updateDoc(doc(proxyDb, 'attendanceLogs', 'proxied-with-files'), { attachments: [] }));

    console.log('Attendance permission emulator matrix: PASS');
  } finally {
    await env.cleanup();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
