/**
 * 申請附件 reference 稽核。預設僅回報；只有明確旗標才會變更資料。
 *
 * 前置：GOOGLE_APPLICATION_CREDENTIALS 與 firebase-admin。
 * 用法：
 *   node tools/request-attachment-orphan-audit.js
 *   node tools/request-attachment-orphan-audit.js --delete-orphans
 *   node tools/request-attachment-orphan-audit.js --process-cleanup
 */

const PREFIX = 'request-attachments/';

function classifyReferences(storagePaths, parentPaths, sessionPaths, queuePaths) {
  const storage = new Set(storagePaths);
  const governed = new Set([...parentPaths, ...sessionPaths, ...queuePaths]);
  return {
    formal: [...storage].filter((path) => parentPaths.has(path)),
    sessions: [...storage].filter((path) => sessionPaths.has(path)),
    cleanup: [...storage].filter((path) => queuePaths.has(path)),
    orphans: [...storage].filter((path) => !governed.has(path)),
    brokenReferences: [...governed].filter((path) => !storage.has(path)),
  };
}

async function main() {
  const fixtureIndex = process.argv.indexOf('--fixture');
  if (fixtureIndex >= 0) {
    const fixturePath = process.argv[fixtureIndex + 1];
    if (!fixturePath) throw new Error('--fixture requires a JSON path');
    const fixture = JSON.parse(require('node:fs').readFileSync(fixturePath, 'utf8'));
    const report = classifyReferences(
      new Set(fixture.storagePaths), new Set(fixture.parentPaths),
      new Set(fixture.sessionPaths), new Set(fixture.queuePaths)
    );
    console.log(JSON.stringify(report, null, 2));
    if (report.orphans.length) process.exitCode = 2;
    return;
  }
  const { initializeApp, applicationDefault } = require('firebase-admin/app');
  const { getFirestore, FieldValue } = require('firebase-admin/firestore');
  const { getStorage } = require('firebase-admin/storage');
  const deleteOrphans = process.argv.includes('--delete-orphans');
  const processCleanup = process.argv.includes('--process-cleanup');

  initializeApp({
    credential: applicationDefault(),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'noahxdm-eip.firebasestorage.app',
  });
  const db = getFirestore();
  const bucket = getStorage().bucket();
  const [attendance, subsidies, sessions, cleanup, [files]] = await Promise.all([
    db.collection('attendanceLogs').get(),
    db.collection('subsidyApplications').get(),
    db.collection('requestAttachmentUploadSessions').get(),
    db.collection('requestAttachmentCleanupQueue').get(),
    bucket.getFiles({ prefix: PREFIX }),
  ]);

  const parentPaths = new Set();
  for (const snapshot of [attendance, subsidies]) {
    snapshot.forEach((item) => (item.data().attachments || []).forEach((a) => parentPaths.add(a.storagePath)));
  }
  const sessionPaths = new Set();
  sessions.forEach((item) => (item.data().plannedPaths || []).forEach((path) => sessionPaths.add(path)));
  const queuePaths = new Set();
  const queueByPath = new Map();
  cleanup.forEach((item) => {
    const path = item.data().attachment?.storagePath;
    if (path) { queuePaths.add(path); queueByPath.set(path, item); }
  });

  const report = classifyReferences(new Set(files.map((file) => file.name)), parentPaths, sessionPaths, queuePaths);
  console.log(JSON.stringify({
    formal: report.formal.length,
    sessionHeld: report.sessions.length,
    cleanupPending: report.cleanup.length,
    orphans: report.orphans,
    brokenReferences: report.brokenReferences,
  }, null, 2));

  if (deleteOrphans) {
    for (const path of report.orphans) {
      try { await bucket.file(path).delete({ ignoreNotFound: true }); console.log(`[DELETED ORPHAN] ${path}`); }
      catch (error) { console.error(`[DELETE FAILED] ${path}`, error.message); }
    }
  }
  if (processCleanup) {
    for (const path of queuePaths) {
      const queueDoc = queueByPath.get(path);
      try {
        await bucket.file(path).delete({ ignoreNotFound: true });
        await queueDoc.ref.delete();
        console.log(`[CLEANED] ${path}`);
      } catch (error) {
        await queueDoc.ref.update({
          attemptCount: FieldValue.increment(1), lastAttemptAt: FieldValue.serverTimestamp(),
          lastErrorCode: error.code || 'storage-delete-failed',
        });
        console.error(`[CLEANUP FAILED] ${path}`, error.message);
      }
    }
  }
}

module.exports = { classifyReferences };
if (require.main === module) main().catch((error) => { console.error('稽核中止：', error); process.exitCode = 1; });
