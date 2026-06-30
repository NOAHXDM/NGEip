const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { collection, doc, setDoc, updateDoc, writeBatch } = require('firebase/firestore');

// GitHub issue #34：任一已登入者可變更 attendance status；內容/附件更新仍維持 owner/admin 邊界。
// 驗證矩陣涵蓋 owner、other-user、admin、未登入者、status transition 與特休餘額連動。
const projectId = 'demo-attendance-permission';
const ownerUid = 'attendance-owner';
const otherUid = 'attendance-other';
const adminUid = 'attendance-admin';

async function main() {
  const env = await initializeTestEnvironment({ projectId });
  try {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await Promise.all([
        setDoc(doc(db, 'users', ownerUid), { role: 'user', remainingLeaveHours: 16 }),
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

    console.log('Attendance permission emulator matrix: PASS');
  } finally {
    await env.cleanup();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
