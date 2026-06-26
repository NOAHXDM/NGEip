/**
 * 一次性資料腳本：薪資調整核定歷程事件
 *
 * 依 `tmp/salary/salary.xlsx`（逐月本薪矩陣）偵測每位使用者本薪變動，為每一次
 * 調整在 `userJourneyEvents` 建立一筆唯讀的「薪資調整核定」事件，並同交易寫入
 * `userJourneyEventAudits` 的 create 稽核，與 feat:使用者歷程時間軸
 * （JourneyEventService.create）相同的文件結構，使時間軸可正確讀取。
 *
 * 調幅定義（與文案 xx.xx% 一致）：
 *   pct = (新本薪 − 前次本薪) / 前次本薪 × 100，四捨五入至小數兩位。
 *   - 每位使用者首月薪資為基準（非調整），不產生事件；自第一次「金額變動」起算。
 *   - salary.xlsx 全部變動皆為調升，無調降；文案正向語氣與此一致。
 *   - eventDate 取該次新本薪生效當月（矩陣欄位日期，當月 1 日 UTC）。
 *
 * 資料來源：salary.xlsx 為均勻逐月網格，已於本機解析、人工核對後彙整為「已驗證
 * 數據表」，存於 tools/data/salary-adjustments.json（含 from/to 供核對）。該檔含員工
 * 薪酬個資，已於 .gitignore 排除、不納入版控；執行期讀入，不在版控原始碼內嵌任何
 * 薪資。格式見同目錄 salary-adjustments.example.json，亦可用環境變數
 * SALARY_ADJUSTMENTS_FILE 覆寫路徑。
 *
 * 對應使用者：以 salary.xlsx 內「姓名」對應 Firestore `users.name` 取得 UID。
 *   - 找不到對應姓名 → 略過並警示。
 *   - 同名多筆（無法判定唯一 UID）→ 略過並警示。
 *
 * 冪等：事件採確定性 doc id `salaryAdjustment_{YYYYMMDD}_{uid}`；已存在者跳過，可安全重跑。
 *
 * 前置：
 *   1. npm i -D firebase-admin        （若尚未安裝）
 *   2. export GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json
 *   3. Node 18+（內建 crypto.randomUUID）
 *
 * 用法：
 *   node tools/seed-salary-adjustment-events.js --actor=<adminUid>            # dry-run（預設）
 *   node tools/seed-salary-adjustment-events.js --actor=<adminUid> --apply    # 實際寫入
 *
 *   --actor 必填，須為 users/{uid}.role == 'admin'，作為事件 createdBy/updatedBy 與稽核 actorUid。
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore, Timestamp, FieldValue } = require('firebase-admin/firestore');

const APPLY = process.argv.includes('--apply');
const actorArg = process.argv.find((a) => a.startsWith('--actor='));
const ACTOR_UID = actorArg ? actorArg.slice('--actor='.length) : process.env.ACTOR_UID;

/**
 * 薪資調整資料來源檔（每筆＝一次本薪變動，含員工姓名與本薪，屬個人資料）。
 *   - 預設 tools/data/salary-adjustments.json，已於 .gitignore 排除，不得 commit。
 *   - 可用環境變數 SALARY_ADJUSTMENTS_FILE 覆寫路徑（例：自 Secret Manager 解密後的暫存檔）。
 *   - 格式見 tools/data/salary-adjustments.example.json：陣列，每筆
 *     { name, date(YYYY-MM-01), pct, from, to }；from/to 僅供人工核對，不寫入 Firestore。
 */
const DATA_FILE =
  process.env.SALARY_ADJUSTMENTS_FILE || path.join(__dirname, 'data', 'salary-adjustments.json');

/** 讀取並驗證薪資調整資料檔；缺檔或格式錯誤時以清楚訊息中止。 */
function loadAdjustments(file) {
  if (!fs.existsSync(file)) {
    throw new Error(
      `找不到薪資調整資料檔：${file}\n` +
        '此檔含員工個人薪酬資料，不納入版控。請依 tools/data/salary-adjustments.example.json 格式\n' +
        '建立 tools/data/salary-adjustments.json，或以環境變數 SALARY_ADJUSTMENTS_FILE 指定路徑。'
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`薪資調整資料檔解析失敗（${file}）：${err.message}`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`薪資調整資料檔格式錯誤（${file}）：應為 [ { name, date, pct, from, to } ]。`);
  }
  // 容忍範本檔的 _comment 物件：僅保留具備必要欄位者。
  return parsed.filter((row) => row && row.name && row.date && typeof row.pct === 'number');
}

const SALARY_ADJUSTMENTS = loadAdjustments(DATA_FILE);

/** 文案：標題。 */
const EVENT_TITLE = '薪資調整核定';

/** 文案：內容；xx.xx% 以該次調幅代入（固定兩位小數）。 */
function eventContent(pct) {
  return (
    '經綜合考量年度績效成果、職務責任範圍、市場薪酬競爭力及人才發展規劃，' +
    `核准進行薪酬調整。本次薪酬調整幅度為 ${pct.toFixed(2)}%，` +
    '反映您持續創造之組織價值與專業影響力。'
  );
}

/** 確定性事件 doc id（供冪等與跳過判斷）。 */
function eventId(date, uid) {
  return `salaryAdjustment_${date.replace(/-/g, '')}_${uid}`;
}

/** 生效當月日期：以 YYYY-MM-01 UTC 日界為事件 eventDate。 */
function effectiveTimestamp(date) {
  const [y, m, d] = date.split('-').map(Number);
  return Timestamp.fromDate(new Date(Date.UTC(y, m - 1, d)));
}

// 認證取自環境變數 GOOGLE_APPLICATION_CREDENTIALS（applicationDefault）
initializeApp({ credential: applicationDefault() });
const db = getFirestore();

/** 建立 name → uid 對應；偵測同名多筆。 */
async function buildNameIndex() {
  const snapshot = await db.collection('users').get();
  const index = new Map();
  const ambiguous = new Set();
  snapshot.forEach((docSnap) => {
    const name = docSnap.data().name;
    if (!name) return;
    if (index.has(name)) {
      ambiguous.add(name);
      return;
    }
    index.set(name, docSnap.id);
  });
  for (const name of ambiguous) index.delete(name);
  return { index, ambiguous };
}

/** 驗證 actor 為 admin。 */
async function assertActorIsAdmin(uid) {
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists) throw new Error(`--actor=${uid} 不存在於 users。`);
  if (snap.data().role !== 'admin') throw new Error(`--actor=${uid} 角色非 admin，無法作為事件建立者。`);
}

/**
 * 建立單筆事件＋稽核（同 JourneyEventService.create 結構），冪等跳過已存在者。
 * @returns {'created'|'skipped'}
 */
async function seedOne(uid, date, pct) {
  const eventRef = db.collection('userJourneyEvents').doc(eventId(date, uid));
  const existing = await eventRef.get();
  if (existing.exists) return 'skipped';
  if (!APPLY) return 'created';

  const lastAuditId = crypto.randomUUID();
  const deleteAuditId = crypto.randomUUID();
  const now = FieldValue.serverTimestamp();

  const batch = db.batch();
  batch.set(eventRef, {
    targetUserId: uid,
    eventDate: effectiveTimestamp(date),
    title: EVENT_TITLE,
    content: eventContent(pct),
    attachments: [],
    createdBy: ACTOR_UID,
    createdAt: now,
    updatedBy: ACTOR_UID,
    updatedAt: now,
    lastAuditId,
    deleteAuditId,
  });
  batch.set(db.collection('userJourneyEventAudits').doc(lastAuditId), {
    eventId: eventRef.id,
    targetUserId: uid,
    action: 'create',
    actorUid: ACTOR_UID,
    actionAt: now,
    title: EVENT_TITLE,
    // 無附件，與 journeyCreateChangedFields([]) 對齊
    changedFields: ['eventDate', 'title', 'content'],
    attachmentSummary: [],
  });
  await batch.commit();
  return 'created';
}

async function main() {
  console.log(`=== 薪資調整核定事件 ${APPLY ? '（APPLY 實際寫入）' : '（DRY-RUN 僅預覽）'} ===`);
  if (!ACTOR_UID) {
    throw new Error('缺少 --actor=<adminUid>（或環境變數 ACTOR_UID）。');
  }
  await assertActorIsAdmin(ACTOR_UID);

  const { index, ambiguous } = await buildNameIndex();
  if (ambiguous.size) {
    console.warn(`同名多筆（無法判定 UID，全數略過）：${[...ambiguous].join('、')}`);
  }

  let created = 0;
  let skipped = 0;
  let unmatched = 0;
  const missingNames = new Set();

  for (const { name, date, pct } of SALARY_ADJUSTMENTS) {
    const uid = index.get(name);
    if (!uid) {
      unmatched++;
      missingNames.add(name);
      continue;
    }
    const result = await seedOne(uid, date, pct);
    if (result === 'created') {
      created++;
      const tag = APPLY ? '[OK] ' : '[DRY]';
      console.log(`  ${tag} ${date}｜${name}（${uid}）｜${pct.toFixed(2)}%`);
    } else {
      skipped++;
    }
  }

  if (missingNames.size) {
    console.warn(`找不到對應 users.name（略過）：${[...missingNames].join('、')}`);
  }
  console.log(
    `=== ${APPLY ? '完成' : 'DRY-RUN 結束'}：${APPLY ? '已建立' : '待建立'} ${created}` +
      `｜已存在略過 ${skipped}｜查無使用者 ${unmatched}（共 ${SALARY_ADJUSTMENTS.length} 筆）===`
  );
  if (!APPLY) console.log('確認名單與數字無誤後，加 --apply 實際寫入。');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('腳本中止：', err.message || err);
    process.exit(1);
  });
