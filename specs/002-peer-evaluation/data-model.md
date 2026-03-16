# 資料模型：評量考核系統

**分支**：`002-peer-evaluation` | **日期**：2026-03-17

> 本文件記錄所有 Firestore 集合的完整欄位定義、文件鍵規則、查詢模式與索引需求。  
> 所有集合均為頂層（top-level）平坦結構，避免深層巢狀。

---

## Firestore 集合總覽

| 集合名稱 | 文件鍵格式 | 主要用途 |
|----------|-----------|---------|
| `evaluationCycles` | 自動ID（UUID） | 考核週期 |
| `evaluationAssignments` | `{evaluatorUid}_{cycleId}_{evaluateeUid}` | 評核指派關係 |
| `evaluationForms` | 自動ID（UUID） | 評核者提交的完整考評表 |
| `userAttributeSnapshots` | `{cycleId}_{userId}` | 受評者屬性報告快照（含跑馬燈文字） |

---

## 集合 1：`evaluationCycles`

**文件鍵**：Firestore 自動 UUID

```typescript
interface EvaluationCycle {
  // 識別
  id: string;               // Firestore document ID

  // 基本資訊
  name: string;             // 例如「2026 上半年考核」
  type: 'H1' | 'H2';        // H1=上半年 H2=下半年
  year: number;             // 例如 2026

  // 時程
  startDate: Timestamp;     // 週期建立（開始）日
  deadline: Timestamp;      // 截止日期（到達後前端鎖定提交）

  // 狀態
  // active          = 進行中（deadline 未到）
  // expired_pending = 已截止，待管理者確認（deadline 已過，結束並發布未觸發）
  // closed          = 已結束（管理者已執行結束並發布，Z-score 完成）
  status: 'active' | 'expired_pending' | 'closed';

  // 統計（前端計算後寫入，方便 list 顯示）
  totalAssignments: number;      // 應提交總數
  completedAssignments: number;  // 已提交數

  // 建立資訊
  createdBy: string;        // 管理者 UID
  createdAt: Timestamp;
  closedAt?: Timestamp;     // 結束並發布的時間
}
```

**查詢模式**：
- 管理者建立/管理：直接讀/寫
- 列出所有週期（排序）：`orderBy('createdAt', 'desc')`
- 篩選進行中：`where('status', '==', 'active')`

**所需索引**：無（單一欄位 orderBy/where 不需複合索引）

---

## 集合 2：`evaluationAssignments`

**文件鍵**：`{evaluatorUid}_{cycleId}_{evaluateeUid}`（確定性鍵，防止重複指派）

```typescript
interface EvaluationAssignment {
  // 識別
  id: string;               // = `${evaluatorUid}_${cycleId}_${evaluateeUid}`
  cycleId: string;
  evaluatorUid: string;     // 評核者 Firebase UID
  evaluateeUid: string;     // 受評者 Firebase UID

  // 狀態
  // pending   = 待填寫（截止日未到）
  // completed = 已完成（表單已提交）
  // overdue   = 逾期未完成（截止日到達時未提交）
  status: 'pending' | 'completed' | 'overdue';

  // 時間
  createdAt: Timestamp;
  completedAt?: Timestamp;  // 提交表單的時間
}
```

**查詢模式**：
- 評核者查看自己的任務：`where('evaluatorUid', '==', uid).orderBy('createdAt', 'desc')`
- 管理者查看某週期狀況：`where('cycleId', '==', cycleId)`
- 管理者查看某受評者：`where('cycleId', '==', cycleId).where('evaluateeUid', '==', uid)`
- 刪除指派（管理者）：直接按 document ID 刪除

**所需索引**：
```json
{
  "collectionGroup": "evaluationAssignments",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "evaluatorUid", "order": "ASCENDING" },
    { "fieldPath": "status", "order": "ASCENDING" }
  ]
},
{
  "collectionGroup": "evaluationAssignments",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "cycleId", "order": "ASCENDING" },
    { "fieldPath": "evaluateeUid", "order": "ASCENDING" }
  ]
},
{
  "collectionGroup": "evaluationAssignments",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "evaluatorUid", "order": "ASCENDING" },
    { "fieldPath": "cycleId", "order": "ASCENDING" }
  ]
}
```

---

## 集合 3：`evaluationForms`

**文件鍵**：Firestore 自動 UUID  
**⚠️ 匿名性關鍵**：Security Rules 禁止 `evaluateeUid` 使用者讀取此集合。

```typescript
interface EvaluationForm {
  // 識別
  id: string;               // Firestore document ID
  assignmentId: string;     // 對應的 EvaluationAssignment ID
  cycleId: string;
  evaluatorUid: string;     // ⚠️ 受評者無法讀取此欄位（由規則強制）
  evaluateeUid: string;

  // 提交資訊
  submittedAt: Timestamp;

  // 評分（10 道題固定題目）
  scores: {
    q1: number;   // 1–10，COL：溝通與協作能力
    q2: number;   // 1–10，INS：問題解決能力
    q3: number;   // 1–10，ADP：自我管理與組織能力
    q4: number;   // 1–10，INN：創新與主動性
    q5: number;   // 1–10，STB：責任心與承諾
    q6: number;   // 1–10，COL：團隊精神與合作
    q7: number;   // 1–10，INS：積極學習與成長
    q8: number;   // 1–10，STB：專業態度與品質意識
    q9: number;   // 1–10，ADP：壓力應對能力
    q10: number;  // 1–10，EXE：工作效率與結果導向
  };

  // 各題選填文字回饋（當分數 ≥9 或 ≤3 時，對應欄位轉為必填）
  feedbacks: {
    q1?: string;
    q2?: string;
    q3?: string;
    q4?: string;
    q5?: string;
    q6?: string;
    q7?: string;
    q8?: string;
    q9?: string;
    q10?: string;
  };

  // 整體評價（必填，20–500字）
  overallComment: string;

  // 管理者異常標記（由 Z-score 計算時批次更新，不影響受評者報告）
  anomalyFlags: {
    reciprocalHighScore: boolean;   // 互惠高分對標記（A→B≥8 且 B→A≥8）
    outlierEvaluator: boolean;      // 該評核者評分標準差異常（Tukey fence）
  };
}
```

**查詢模式**：
- 評核者查看自己的表單：`where('evaluatorUid', '==', uid).where('cycleId', '==', cycleId)`
- 管理者查看某週期所有表單：`where('cycleId', '==', cycleId)` 
- 管理者查看某受評者：`where('cycleId', '==', cycleId).where('evaluateeUid', '==', uid)`
- Z-score 計算時讀取全週期：`where('cycleId', '==', cycleId)`

**所需索引**：
```json
{
  "collectionGroup": "evaluationForms",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "evaluatorUid", "order": "ASCENDING" },
    { "fieldPath": "cycleId", "order": "ASCENDING" }
  ]
},
{
  "collectionGroup": "evaluationForms",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "cycleId", "order": "ASCENDING" },
    { "fieldPath": "evaluateeUid", "order": "ASCENDING" }
  ]
}
```

---

## 集合 4：`userAttributeSnapshots`

**文件鍵**：`{cycleId}_{userId}`（確定性鍵，一個週期一個受評者只有一份快照）

```typescript
interface UserAttributeSnapshot {
  // 識別
  id: string;               // = `${cycleId}_${userId}`
  cycleId: string;
  userId: string;           // 受評者 Firebase UID

  // 職等（建立快照時從 User 文件複製；僅用於 FR-017 及格標準展示）
  jobRank: string;          // 理想值 'J' | 'M' | 'S'，不匹配時顯示「職等未設定」

  // 狀態
  // preview = 即時預覽（截止前或「已截止待確認」期間；使用未校正的原始平均分）
  // final   = 最終報告（管理者執行「結束並發布」後；使用 Z-score 校正分數）
  status: 'preview' | 'final';

  computedAt: Timestamp;           // 最後更新時間
  validEvaluatorCount: number;     // 有效評核者人數（影響 FR-015 警示顯示）

  // 六大屬性分數（小數兩位）
  attributes: {
    EXE: number;   // 執行力
    INS: number;   // 洞察力
    ADP: number;   // 應變力
    COL: number;   // 協作力
    STB: number;   // 穩定力
    INN: number;   // 創新力
  };

  totalScore: number;              // EXE+INS+ADP+COL+STB+INN，最大 60

  // 職業原型（可能多個，並列時顯示全部）
  careerArchetypes: string[];      // 例如 ['⚔️ 劍士'] 或 ['⚔️ 劍士', '🔨 商人']

  // 整體評價（匿名，跑馬燈顯示）
  // 僅含純文字，無評核者識別資訊
  overallComments: string[];       // 每位評核者提交時 arrayUnion，管理者確認後不變

  // 管理者排名輔助欄（final 後由 Z-score 計算寫入）
  rankingScore?: number;           // totalScore（Z-score 校正後）
}
```

**查詢模式**：
- 受評者查看自己的快照：`where('userId', '==', uid).orderBy('cycleId', 'desc')`
- 管理者查看某週期所有快照：`where('cycleId', '==', cycleId)`
- 管理者排名視圖：`where('cycleId', '==', cycleId).orderBy('totalScore', 'desc')`
- 評核者提交表單後更新快照（arrayUnion）：直接 `updateDoc` by document ID

**所需索引**：
```json
{
  "collectionGroup": "userAttributeSnapshots",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "userId", "order": "ASCENDING" },
    { "fieldPath": "cycleId", "order": "DESCENDING" }
  ]
},
{
  "collectionGroup": "userAttributeSnapshots",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "cycleId", "order": "ASCENDING" },
    { "fieldPath": "totalScore", "order": "DESCENDING" }
  ]
}
```

---

## 六大屬性計算對照表

| 屬性 | 代號 | 題目 | 計算公式 |
|------|------|------|---------|
| 執行力 | EXE | Q10 | avg(calibrated_Q10) across all evaluators |
| 洞察力 | INS | Q2, Q7 | avg((calibrated_Q2 + calibrated_Q7)/2) |
| 應變力 | ADP | Q3, Q9 | avg((calibrated_Q3 + calibrated_Q9)/2) |
| 協作力 | COL | Q1, Q6 | avg((calibrated_Q1 + calibrated_Q6)/2) |
| 穩定力 | STB | Q5, Q8 | avg((calibrated_Q5 + calibrated_Q8)/2) |
| 創新力 | INN | Q4 | avg(calibrated_Q4) |

---

## Firestore 讀寫成本估算

| 操作 | 讀次數 | 寫次數 | 頻率 |
|------|-------|-------|------|
| 評核者查看任務列表 | ~1–20 reads | 0 | 每次登入 |
| 評核者提交表單 | 1 read (assignment check) | 3 writes (form + snapshot update + assignment update) | 一次性 |
| 受評者查看屬性報告 | 1–6 reads (snapshot history) | 0 | 每次查看 |
| 管理者結束並發布 | N reads (all forms/assignments) | N+1 writes (snapshots + cycle) | 半年一次 |
| 管理者排名視圖 | up to 100 reads | 0 | 偶爾 |

**成本控制措施**：
- 受評者屬性報告快照以 `shareReplay(1)` 快取，避免重複讀取
- 管理者排名視圖使用前端分頁（pageSize=20），避免一次讀取所有快照
- 評核者任務列表 query by `evaluatorUid` 使用索引，不做 collection-wide scan
