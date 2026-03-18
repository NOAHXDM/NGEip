# 實作計畫：評量考核系統

**分支**：`002-peer-evaluation` | **日期**：2026-03-17 | **規格**：[spec.md](./spec.md)  
**輸入**：來自 `/specs/002-peer-evaluation/spec.md` 的功能規格

**注意**：所有內容 MUST 以繁體中文（zh-TW）撰寫，且技術實作與決策必須記錄於本檔，不得回寫到 spec.md。

## 摘要

建立匿名互評考核系統（Peer Evaluation），核心差異化體驗為仿 RO 仙境傳說風格的六角職場屬性雷達圖與職業原型判定。本功能涵蓋：

- **管理者**：建立半年度考核週期、指派評核關係、查閱考評表、執行 Z-score 結束並發布、選擇性排名視圖。
- **評核者**：填寫含 10 道評分題、選填文字回饋與必填整體評價（20–500 字）的匿名考評表。
- **受評者**：查看六角雷達圖屬性報告（EXE/INS/ADP/COL/STB/INN）、RO 職業原型標籤、跨週期趨勢折線圖、整體評價跑馬燈（匿名）。
- **防灌水**：Z-score per-rater 標準化 + 互惠高分對偵測 + 離群評核者標記。

**技術方向**：純 Angular 20 + Cloud Firestore，不引入外部圖表套件（SVG 實作）；前端執行 Z-score 批次計算（無 Cloud Functions）。

## 技術背景

**語言／版本**：Angular 20、TypeScript 5.x、Firebase JS SDK v10+  
**主要依賴**：`@angular/core`、`@angular/material`、`@angular/forms`、`@angular/cdk`、`firebase`（官方 SDK）、`rxjs`、`date-fns`；不新增任何圖表套件  
**資料儲存**：Cloud Firestore（平坦模型，4 個頂層集合）；無 Firebase Storage（本功能無附件）  
**測試策略**：Karma/Jasmine 單元測試（business logic、Z-score 演算法、職業原型判定、字數驗證）；Firebase Emulator + `@firebase/rules-unit-testing` 整合測試（Security Rules 驗證、匿名性驗證）  
**目標平台**：Firebase Hosting 上的 Angular SPA（WebApp）  
**專案型態**：Angular 20 standalone components（已採用）  
**效能目標**：屬性報告首次載入 ≤ 2 次 Firestore reads；評核者任務列表單次查詢延遲 < 1s；管理者結束並發布（30 份表單）< 5s 完成  
**限制條件**：僅可使用 Firebase 官方服務；前端計算（Z-score）不依賴 Cloud Functions；外部套件最少化；Security Rules 須同步維護  
**規模／範圍**：預估每週期 20–50 受評者，每人 3–10 位評核者；新增 4 個 Firestore 集合，新增 1 個 Angular feature 模組（`evaluation/`）；受影響路由：2 個使用者頁面 + 2 個管理者頁面

## 憲章檢查

*Gate：Phase 0 研究前必須通過；Phase 1 設計後需再次複核。*

- [x] 僅使用 Firebase Authentication、Cloud Firestore、Firebase Storage、Firebase Hosting；無新增 Cloudinary、Realtime Database 或其他後端。
- [x] 所有驗證流程均以 Firebase Authentication 為唯一來源，且使用者資料以 Firebase UID 對應 Firestore 文件。
- [x] Firestore 資料模型已說明集合、文件鍵、查詢路徑、索引與成本影響，並優先採平坦結構（見 data-model.md）。
- [x] 已定義或更新 Firestore Security Rules、模擬器驗證方式與授權邊界（見 contracts/firestore-rules-contract.md）。
- [x] 前端 Firebase 互動僅使用官方 Firebase JavaScript SDK；不新增任何外部圖表套件，採純 Angular SVG 實作。
- [x] 已列出效能／成本熱點：屬性報告 `shareReplay(1)` 快取；管理者排名視圖前端分頁（pageSize=20）；評核者任務列表依 `evaluatorUid` + 索引查詢（見 data-model.md）。
- [x] 已規劃 business logic 的單元測試（Z-score 演算法、職業原型判定、字數驗證）與整合測試（Security Rules、匿名性），兩者為交付門檻。
- [x] 本檔與對應 spec.md 均以繁體中文撰寫，且產品需求留在 spec.md、技術決策留在 plan.md。

## 專案結構

### 文件（本功能）

```text
specs/002-peer-evaluation/
├── spec.md            # 功能規格（產品需求、情境、驗收）
├── plan.md            # 本檔（技術實作與決策）
├── research.md        # 研究紀錄（圖表方案、Z-score 演算法、匿名性設計）
├── data-model.md      # Firestore 資料模型與欄位說明
├── quickstart.md      # 手動驗證流程
├── contracts/
│   ├── firestore-rules-contract.md  # Security Rules 規格與驗證矩陣
│   └── angular-interfaces.md        # TypeScript 介面、Service 與元件 Input 契約
└── tasks.md           # 任務拆解（由 /speckit.tasks 產出）
```

### 原始碼（儲存庫根目錄）

```text
src/
├── app/
│   ├── evaluation/                            # 本功能模組
│   │   ├── evaluation.routes.ts               # 路由定義
│   │   ├── models/
│   │   │   └── evaluation.models.ts           # 所有 TypeScript 介面/型別
│   │   ├── services/
│   │   │   ├── evaluation-cycle.service.ts    # EvaluationCycle CRUD
│   │   │   ├── evaluation-assignment.service.ts
│   │   │   ├── evaluation-form.service.ts     # 含批次提交邏輯
│   │   │   ├── user-attribute-snapshot.service.ts
│   │   │   └── zscore-calculator.service.ts   # 純計算服務（無 Firestore）
│   │   ├── components/                        # 可重用 UI 元件
│   │   │   ├── radar-chart/                   # 純 SVG 六角雷達圖
│   │   │   ├── trend-line-chart/              # 純 SVG 趨勢折線圖
│   │   │   ├── marquee-comments/              # CSS keyframes 跑馬燈
│   │   │   ├── career-archetype-badge/        # RO 職業原型標籤顯示
│   │   │   └── evaluation-form-questions/     # 10 道題目表單片段
│   │   └── pages/
│   │       ├── evaluation-tasks/              # 評核者：我的考評任務
│   │       ├── evaluation-form/               # 評核者：填寫考評表
│   │       ├── attribute-report/              # 受評者：我的屬性報告
│   │       ├── evaluation-cycles-admin/       # 管理者：週期管理
│   │       └── evaluation-overview-admin/     # 管理者：總覽 + 排名視圖
│   └── guards/
│       └── admin.guard.ts                     # 現有守衛（確認是否已建立）

firestore.rules    # 新增 4 個集合的 Security Rules
firestore.indexes.json  # 新增本功能的複合索引
```

**結構決策**：
- `evaluation/` 為獨立功能資料夾，採 lazy-load 路由。
- `services/` 與 `pages/` 分層，所有 Firestore 操作集中在 services，pages 不直接呼叫 Firebase SDK。
- `zscore-calculator.service.ts` 為純計算服務（可單元測試，無 Firestore 依賴）。
- `components/` 內的 5 個可重用元件可被不同 pages 引入（standalone imports）。

---

## Firestore 架構設計

> 完整欄位定義請見 [data-model.md](./data-model.md)

### 集合拓撲

```
evaluationCycles/{cycleId}
evaluationAssignments/{evaluatorUid}_{cycleId}_{evaluateeUid}
evaluationForms/{formId}                          ← ⚠️ evaluatee 無法讀取
userAttributeSnapshots/{cycleId}_{userId}
```

### 文件生命週期

```
[管理者建立週期]
  → evaluationCycles 建立（status: 'active'）

[管理者指派]
  → evaluationAssignments 批次建立（status: 'pending'）
  → evaluationCycles.totalAssignments += N

[評核者提交表單]
  → Firestore batch():
    1. evaluationForms 建立（含 scores, feedbacks, overallComment）
    2. userAttributeSnapshots upsert（status: 'preview'，computedAt: serverTimestamp()，arrayUnion overallComment，更新原始平均分）
    3. evaluationAssignments 更新（status: 'completed', completedAt）
    4. evaluationCycles.completedAssignments += 1

[截止日到達（前端檢查）]
  → 前端 isDeadlinePassed = deadline.toDate() < new Date()
  → 阻止新提交，顯示「考核截止日期已過」
  → 週期在 UI 顯示「已截止，待確認」（status 仍為 'active'，前端依 deadline 判斷）

[管理者結束並發布]
  → EvaluationCycleService.closeAndPublish():
    1. 讀取所有 evaluationForms（where cycleId==）
    2. ZScoreCalculatorService.compute() → 校正分數、職業原型、異常標記
    3. Firestore batch():
       - evaluationCycles 更新（status: 'closed', closedAt）
       - 每位受評者的 userAttributeSnapshots 更新（status: 'final'，校正後分數）
       - 更新有異常標記的 evaluationForms（anomalyFlags）
       - 逾期任務的 evaluationAssignments 更新（status: 'overdue'）
```

### 讀寫成本分析

| 操作 | 估算讀次 | 估算寫次 |
|------|---------|---------|
| 評核者查看任務列表（50 筆） | ~50 | 0 |
| 評核者提交表單 | 1 | ~4（form + snapshot + assignment + cycle） |
| 受評者查看報告（6 週期歷史） | ~6 | 0 |
| 管理者結束並發布（30 份表單，20 受評者） | ~30 | ~52 |
| 管理者排名視圖（第一頁 20 筆） | ~20 | 0 |

---

## Z-Score 演算法

> 詳見 [research.md](./research.md#2-z-score-防灌水校正演算法)

**執行時機**：管理者按下「結束並發布考核」，在 Angular service 中同步執行。

```typescript
// ZScoreCalculatorService 核心邏輯概述
function calibrateCycleScores(forms: EvaluationForm[]): CalibratedScores {
  const TARGET_MEAN = 5.5;
  const TARGET_SD = 1.5;

  // Step 1：計算各評核者的均值與標準差
  const raterStats = computePerRaterStats(forms);  // Map<evaluatorUid, {mean, sd}>

  // Step 2：對每筆分數進行 Z-score 校正
  const calibrated = forms.flatMap(form =>
    Object.entries(form.scores).map(([q, rawScore]) => {
      const { mean, sd } = raterStats.get(form.evaluatorUid)!;
      if (sd === 0) return { form, q, value: rawScore };
      const z = (rawScore - mean) / sd;
      return { form, q, value: clamp(TARGET_MEAN + z * TARGET_SD, 1, 10) };
    })
  );

  // Step 3：以校正後分數計算各受評者的六大屬性
  return aggregateByEvaluatee(calibrated);  // AttributeScores per evaluateeUid
}
```

**邊界案例**：
- 評核者多位受評者但均給相同分 → sd=0，不校正（保留原始分）。
- 週期只有 1 位評核者 → Z-score 技術上可行，但 FR-015 顯示「人數不足」警示。

---

## 職業原型判定演算法

> 詳見 [research.md](./research.md#4-職業原型判定演算法)

**判定優先序**（FR-016）：
1. 全部屬性 ≥ 8 → 🌟 勇者 Hero
2. 任三項以上原始平均分數 < 5 → 🌱 初心者 Novice（優先於第 3 條，使用未經 Z-score 校正的原始平均分數）
3. 前兩高屬性組合 → 對應原型（並列時輸出多個）

| 組合 | 原型 |
|------|------|
| EXE + STB | ⚔️ 劍士 Swordsman |
| INS + INN | 🧙 法師 Mage |
| ADP + COL | 🏹 弓手 Archer |
| COL + STB | ✨ 牧師 Priest |
| ADP + INN | 🗡️ 盜賊 Rogue |
| EXE + INS | 🔨 商人 Merchant |

---

## 雷達圖 SVG 設計

**幾何計算**（6 軸，每軸 60°）：

```typescript
// axes[i] 的 SVG 座標（從 12 點鐘方向，順時針）
function toSvgPoint(value: number, max: number, index: number, radius: number, cx: number, cy: number) {
  const angle = (index * 60 - 90) * (Math.PI / 180);  // -90° = 12 點鐘
  const r = (value / max) * radius;
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
}
```

**SVG 結構**：
```html
<svg viewBox="0 0 300 300">
  <!-- 5 層背景六角（2, 4, 6, 8, 10 分線）-->
  <polygon *ngFor="let scale of [0.2, 0.4, 0.6, 0.8, 1.0]" .../>
  <!-- 6 條軸線 -->
  <line *ngFor="let axis of axes" .../>
  <!-- 及格線六角（6/10 = 0.6）-->
  <polygon class="passing-hexagon" .../>
  <!-- 資料六角（低於及格線部分塗警示色）-->
  <polygon class="data-polygon" .../>
  <!-- 各軸標籤 -->
  <text *ngFor="let axis of axes" .../>
</svg>
```

**視覺規格**：
- 背景六角：灰色半透明線條
- 及格線（6 分）：橘色虛線
- 資料六角整體：半透明藍填色，藍色邊框
- 低於及格線的頂點：紅色警示點（`<circle r="5" fill="red">`）

---

## 跑馬燈設計

```scss
// marquee-comments.component.scss
.marquee-wrapper {
  overflow: hidden;
  white-space: nowrap;
}
.marquee-content {
  display: inline-block;
  animation: marquee var(--duration, 30s) linear infinite;
}
@keyframes marquee {
  from { transform: translateX(100%); }
  to   { transform: translateX(-100%); }
}
```

```typescript
// 動畫速度依文字總長度動態計算
get duration(): string {
  const totalChars = this.comments.join('　|　').length;
  const seconds = Math.max(10, totalChars / this.speedPx * 8);
  return `${seconds}s`;
}
```

**週期切換**：父元件更新 `comments` input → Angular 重新渲染 `@if (comments.length > 0)` 區塊 → 動畫重新啟動。

---

## Security Rules 變更

> 完整規則規格見 [contracts/firestore-rules-contract.md](./contracts/firestore-rules-contract.md)

**新增至 `firestore.rules`**：4 個新集合的規則區塊（evaluationCycles / evaluationAssignments / evaluationForms / userAttributeSnapshots）。

**關鍵安全決策**：
- `evaluationForms` 的 `read` 規則完全排除 `evaluateeUid == request.auth.uid` 的判斷，確保匿名性在 DB 層面強制執行。
- `userAttributeSnapshots` 的 write 規則限制：evaluator 只能在 `status == 'preview'` 時 update，且不能修改 `status`；防止受評者自己修改快照。
- `evaluationForms` 的 `delete` 規則設為 `if false`，永久保留考評數據。
- `evaluationCycles` 的 `update` 開放已登入使用者僅限修改 `completedAssignments` 欄位，允許評核者提交表單的原子性 batch 寫入（遞增完成計數）；其餘欄位付管理者操作。

---

## Firestore Indexes 變更

> 完整索引 JSON 見 [data-model.md](./data-model.md)

新增至 `firestore.indexes.json` 的複合索引（6 個）：

| 集合 | 欄位組合 | 用途 |
|------|---------|------|
| evaluationAssignments | (evaluatorUid ASC, status ASC) | 評核者按狀態篩選任務 |
| evaluationAssignments | (cycleId ASC, evaluateeUid ASC) | 管理者查受評者指派 |
| evaluationAssignments | (evaluatorUid ASC, cycleId ASC) | 評核者按週期篩選 |
| evaluationForms | (evaluatorUid ASC, cycleId ASC) | 評核者查自己的表單 |
| evaluationForms | (cycleId ASC, evaluateeUid ASC) | 管理者查受評者表單 |
| userAttributeSnapshots | (userId ASC, cycleId DESC) | 受評者查歷史快照 |
| userAttributeSnapshots | (cycleId ASC, totalScore DESC) | 管理者排名視圖 |

---

## 測試策略

### 單元測試（Karma/Jasmine）

| 測試目標 | 測試內容 |
|---------|---------|
| `ZScoreCalculatorService.compute()` | sd=0 邊界；多評核者校正；分數夾縮(clamp)；滿分60計算 |
| `ZScoreCalculatorService.determineArchetypes()` | 勇者(全≥8)、初心者(原始平均分數 3項<5)、並列輸出多個、各原型組合 |
| `ZScoreCalculatorService.detectReciprocalHighScores()` | A→B高+B→A高 → 標記；單向高分 → 不標記 |
| `RadarChartComponent` | 6 軸幾何計算；warn 色觸發條件；空資料不崩潰 |
| `MarqueeCommentsComponent` | 空陣列不渲染；切換 comments 重新動畫 |
| `EvaluationFormComponent` | 極端分數(≥9/≤3)觸發文字必填；整體評價字數 <20 阻止提交；>500 阻止提交 |
| `EvaluationFormService.submitForm()` | Firestore batch 寫入正確文件數；重複提交阻止 |

### 整合測試（Firebase Emulator）

| 測試目標 | 驗證項目 |
|---------|---------|
| 匿名性 | evaluatee 讀 evaluationForms → DENIED |
| 匿名性 | 評核者讀他人 evaluationForms → DENIED |
| 角色控制 | 一般使用者建立 evaluationCycles → DENIED |
| 資料完整性 | 刪除 evaluationForms → DENIED |
| preview → final | evaluator 試圖更新 snapshot 為 final → DENIED |
| 自評防止 | evaluator 試圖更新自己的 snapshot → DENIED |

---

## 複雜度追蹤

> **以下為憲章有必要說明的例外項目**

| 例外項目 | 為何需要 | 已拒絕的較簡方案 |
|----------|----------|------------------|
| 前端執行 Z-score 批次計算（非 Cloud Functions） | 專案無 Cloud Functions，無法後端觸發 | Cloud Functions（不可用）；Cloud Scheduler（不可用） |
| `userAttributeSnapshots` 允許非本人的已登入使用者 update（preview 狀態） | 評核者需原子性批次寫入 form + snapshot，且沒有 server-side trigger | 另建 `evaluationOverallComments` 集合（引入額外集合與複雜度）；Cloud Functions（不可用） |


