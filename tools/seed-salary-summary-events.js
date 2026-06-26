/**
 * 一次性資料腳本：年度總薪酬統計歷程事件
 *
 * 依 `tmp/stat/Bonus_Report_YYYY.*` 計算之每位使用者「N 個月本薪」，為
 * 2021–2025 各年度在 `userJourneyEvents` 建立一筆唯讀的「年度總薪酬統計」事件，
 * 並同交易寫入 `userJourneyEventAudits` 的 create 稽核，與 feat:使用者歷程時間軸
 * （JourneyEventService.create）相同的文件結構，使時間軸可正確讀取。
 *
 * N 的定義（與文案一致）：
 *   N = 12（全年固定本薪／固定薪資）+ 該年度所有獎金之「發放比例（佔成）」總和
 *   - bonusMonths 為各 Bonus_Report 內每項獎金「發放比例」加總，即獎金相當於幾個月本薪。
 *   - months（= 12 + bonusMonths，四捨五入至小數一位）即文案中的 N。
 *
 * 資料來源：各年度 Bonus_Report 版面互不相容（2021 僅年終、2022 為中文 PDF、
 * 2023 多區塊、2024 實發/比例雙列、2025 逐月佔成），故採「已驗證靜態數據表」內嵌，
 * 數字可人工核對，不在執行期解析 xlsx。
 *
 * 2022：原始檔為無法可靠解析的中文 CID PDF，數據暫缺，已於下方留待補資料槽；
 *       未填妥前該年度自動略過（會於輸出提示）。
 *
 * 對應使用者：以 Bonus_Report 內「姓名」對應 Firestore `users.name` 取得 UID。
 *   - 找不到對應姓名 → 略過並警示。
 *   - 同名多筆（無法判定唯一 UID）→ 略過並警示。
 *
 * 冪等：事件採確定性 doc id `salarySummary_{year}_{uid}`；已存在者跳過，可安全重跑。
 *
 * 前置：
 *   1. npm i -D firebase-admin        （若尚未安裝）
 *   2. export GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json
 *   3. Node 18+（內建 crypto.randomUUID）
 *
 * 用法：
 *   node tools/seed-salary-summary-events.js --actor=<adminUid>            # dry-run（預設）
 *   node tools/seed-salary-summary-events.js --actor=<adminUid> --apply    # 實際寫入
 *
 *   --actor 必填，須為 users/{uid}.role == 'admin'，作為事件 createdBy/updatedBy 與稽核 actorUid。
 *   --year=2024 可選，只處理單一年度。
 */

const crypto = require('crypto');
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore, Timestamp, FieldValue } = require('firebase-admin/firestore');

const APPLY = process.argv.includes('--apply');
const actorArg = process.argv.find((a) => a.startsWith('--actor='));
const ACTOR_UID = actorArg ? actorArg.slice('--actor='.length) : process.env.ACTOR_UID;
const yearArg = process.argv.find((a) => a.startsWith('--year='));
const ONLY_YEAR = yearArg ? yearArg.slice('--year='.length) : null;

/**
 * 已驗證的每年度每人「個月本薪」數據表。
 *   bonusMonths：該年度所有獎金發放比例（佔成）總和。
 *   months：N = 12 + bonusMonths，四捨五入至小數一位，即文案數字。
 *
 * 2022 待補：請以 Bonus_Report_2022.pdf 內每人各項獎金發放比例加總，
 * 依下列格式補入（months 可留待腳本計算，亦可直接填寫）。
 */
const SALARY_DATA = {
  '2021': [
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
  ],
  // 2022 資料暫缺（原始為無法解析的中文 PDF），補齊後移除本註解並填入下列陣列：
  // { name: '姓名', bonusMonths: <該年度獎金發放比例總和>, months: <12 + bonusMonths> },
  '2022': [
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
  ],
  '2023': [
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
  ],
  '2024': [
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
  ],
  '2025': [
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
    { /* salary data redacted from history */ },
  ],
};

/** 文案：標題。 */
function eventTitle(year) {
  return `${year} 年度總薪酬統計`;
}

/** 文案：內容；N 以該年度該員之 months 代入。 */
function eventContent(year, months) {
  return (
    `${year} 年度累計發放總薪酬相當於 ${months} 個月本薪，` +
    '包含固定薪資、績效獎金、年終獎金及其他經核定之獎勵給付'
  );
}

/** 確定性事件 doc id（供冪等與跳過判斷）。 */
function eventId(year, uid) {
  return `salarySummary_${year}_${uid}`;
}

/** 年度業務日期：以該年 12/31 UTC 日界為事件 eventDate。 */
function yearEndTimestamp(year) {
  return Timestamp.fromDate(new Date(Date.UTC(Number(year), 11, 31)));
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
async function seedOne(year, uid, months) {
  const eventRef = db.collection('userJourneyEvents').doc(eventId(year, uid));
  const existing = await eventRef.get();
  if (existing.exists) return 'skipped';

  const lastAuditId = crypto.randomUUID();
  const deleteAuditId = crypto.randomUUID();
  const title = eventTitle(year);
  const now = FieldValue.serverTimestamp();

  if (!APPLY) return 'created';

  const batch = db.batch();
  batch.set(eventRef, {
    targetUserId: uid,
    eventDate: yearEndTimestamp(year),
    title,
    content: eventContent(year, months),
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
    title,
    // 無附件，與 journeyCreateChangedFields([]) 對齊
    changedFields: ['eventDate', 'title', 'content'],
    attachmentSummary: [],
  });
  await batch.commit();
  return 'created';
}

async function main() {
  console.log(`=== 年度總薪酬統計事件 ${APPLY ? '（APPLY 實際寫入）' : '（DRY-RUN 僅預覽）'} ===`);
  if (!ACTOR_UID) {
    throw new Error('缺少 --actor=<adminUid>（或環境變數 ACTOR_UID）。');
  }
  await assertActorIsAdmin(ACTOR_UID);

  const { index, ambiguous } = await buildNameIndex();
  if (ambiguous.size) {
    console.warn(`同名多筆（無法判定 UID，全數略過）：${[...ambiguous].join('、')}`);
  }

  const years = ONLY_YEAR ? [ONLY_YEAR] : Object.keys(SALARY_DATA);
  let created = 0;
  let skipped = 0;
  let unmatched = 0;
  const missingNames = new Set();

  for (const year of years) {
    const rows = SALARY_DATA[year] || [];
    if (!rows.length) {
      console.warn(`  [略過] ${year}：無數據（2022 待補或未指定年度）。`);
      continue;
    }
    console.log(`--- ${year}（${rows.length} 人）---`);
    for (const { name, months } of rows) {
      const uid = index.get(name);
      if (!uid) {
        unmatched++;
        missingNames.add(name);
        continue;
      }
      const result = await seedOne(year, uid, months);
      if (result === 'created') {
        created++;
        if (!APPLY) console.log(`  [DRY]  ${eventTitle(year)}｜${name}（${uid}）｜${months} 個月本薪`);
        else console.log(`  [OK]   ${eventTitle(year)}｜${name}（${uid}）｜${months} 個月本薪`);
      } else {
        skipped++;
      }
    }
  }

  if (missingNames.size) {
    console.warn(`找不到對應 users.name（略過）：${[...missingNames].join('、')}`);
  }
  console.log(
    `=== ${APPLY ? '完成' : 'DRY-RUN 結束'}：${APPLY ? '已建立' : '待建立'} ${created}` +
      `｜已存在略過 ${skipped}｜查無使用者 ${unmatched} ===`
  );
  if (!APPLY) console.log('確認名單與數字無誤後，加 --apply 實際寫入。');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('腳本中止：', err.message || err);
    process.exit(1);
  });
