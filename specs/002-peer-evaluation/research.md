# 研究紀錄：評量考核系統

**分支**：`002-peer-evaluation` | **日期**：2026-03-17  
**用途**：記錄 Phase 0 研究決策，消除 plan.md 技術背景中的所有 NEEDS CLARIFICATION。

---

## 1. 雷達圖實作方式

**問題**：六角雷達圖（RO 仙境傳說風格）如何在 Angular 20 中實作？

**Decision**：純 Angular SVG 元件，不引入外部圖表庫。

**Rationale**：
- 六角雷達圖的六軸定義固定（每軸 60°），幾何計算量已知且有限。
- 本專案憲章要求「外部套件 MUST 維持最少，新增套件前 MUST 先證明既有能力不足」。
- Angular 模板原生支援 SVG binding；`@for` + `ng-content` 可驅動多邊形節點計算。
- 歷史趨勢折線圖（單一SVG `<polyline>` + 軸線）同樣可純 SVG 實現。

**Alternatives considered**：
- Chart.js（radar + line 兩種圖都支援）→ 需加入 `chart.js` 套件（~200KB）；憲章要求先排除 native 方案。
- ng2-charts（Chart.js Angular wrapper）→ 額外包一層，增加升級耦合。
- D3.js → 功能過強，bundle 過大，學習曲線高。

**實作模式**：
```
src/app/evaluation/components/radar-chart/
  radar-chart.component.ts    // 接受 axes: RadarAxis[] 輸入，計算 SVG polygon 點
  radar-chart.component.html  // SVG 模板，6 層背景六角 + 資料六角 + 軸線標籤
  radar-chart.component.scss  // RO 風格顏色（半透明藍/紅警示）

src/app/evaluation/components/trend-line-chart/
  trend-line-chart.component.ts  // 接受 periods: PeriodScore[] 輸入
```

---

## 2. Z-score 防灌水校正演算法

**問題**：如何實作 FR-018 的 Z-score 統計標準化校正？

**Decision**：以「每位評核者的評分視角正規化(per-rater Z-score)」為基礎，校正個別評核者評分偏高/偏低的習慣，再重新映射回 1–10 分。

**Algorithm**：

```
輸入：evaluationForms（某週期所有已提交考評表）

for each evaluator E in cycle:
  S_E = E 在本週期提交的所有題目分數（最多 10題 × N受評者）
  mean_E = mean(S_E)
  sd_E = population_SD(S_E)

  for each score s(E, T, Q) [評核者E給受評者T第Q題]:
    if sd_E == 0:
      calibrated = s (不校正，該評核者評分完全一致)
    else:
      z = (s - mean_E) / sd_E
      calibrated = TARGET_MEAN + z * TARGET_SD   // TARGET_MEAN=5.5, TARGET_SD=1.5
      calibrated = clamp(calibrated, 1.0, 10.0)

for each evaluatee T:
  收集當週期所有評核者對 T 的校正後分數
  EXE = calibrated(Q10)                              // 僅一題，取所有評核者平均
  INS = (calibrated(Q2) + calibrated(Q7)) / 2        // 兩題，取平均後再平均
  ADP = (calibrated(Q3) + calibrated(Q9)) / 2
  COL = (calibrated(Q1) + calibrated(Q6)) / 2
  STB = (calibrated(Q5) + calibrated(Q8)) / 2
  INN = calibrated(Q4)
  totalScore = EXE + INS + ADP + COL + STB + INN     // 滿分 60
```

**Rationale**：
- Per-rater normalization 是評核系統標準做法，可消除「習慣給高分者」vs「習慣給低分者」的系統偏差。
- TARGET_MEAN=5.5（1–10 中點），TARGET_SD=1.5 保留適度區分度。
- 純 TypeScript 實作，在 Angular service 中執行，不需後端或 Cloud Functions。

**異常偵測**：
1. **互惠高分對**：若 A 給 B 平均分 ≥ 8 且 B 給 A 平均分 ≥ 8 → 標記。
2. **離群評核者**：某評核者 SD > `全體評核者 SD 的 Q3 + 1.5*IQR`（Tukey fence）→ 標記。

---

## 3. Firestore 匿名性強制執行方案

**問題**：如何在 Security Rules 層面確保受評者看不到評核者身份？

**Decision**：`evaluationForms` 安全規則只允許 evaluator 讀取自己的表單，完全拒絕 evaluatee 讀取包含 evaluatorUid 的表單。整體評價（overallComments）以匿名字串陣列形式存於 `userAttributeSnapshots`，由 evaluator batch 寫入。

**方案架構**：
- `evaluationForms`：evaluator 只能讀寫自己提交的表單（`evaluatorUid == request.auth.uid`）；evaluatee 即使是 `evaluateeUid == request.auth.uid` 也無法讀取。
- `userAttributeSnapshots`：evaluatee 讀自己的快照（含匿名 `overallComments` 字串陣列）；evaluator 在提交表單時用 Firestore `batch()` 同步 arrayUnion 到此快照。
- 快照寫入規則：status 為 `preview` 時，非本人的已登入使用者可更新（arrayUnion overallComment + 更新預覽分數）；admin 任何時候可寫；`final` 後只有 admin 可更新。

**Rationale**：此設計在 evaluatee 的 Security Rules 讀取路徑上完全阻斷 evaluatorUid 欄位；overallComments 陣列僅含純文字，不含評核者識別資訊。

---

## 4. 職業原型判定演算法

**問題**：如何實作 FR-016 的並列處理邏輯？

**Decision**：枚舉所有「前兩高屬性組合」對，對對應至職業原型表，去重後輸出多個原型。

**演算法（TypeScript 邏輯）**：
```typescript
const ARCHETYPE_MAP: Record<string, string> = {
  'EXE+STB': '⚔️ 劍士', 'STB+EXE': '⚔️ 劍士',
  'INS+INN': '🧙 法師', 'INN+INS': '🧙 法師',
  'ADP+COL': '🏹 弓手', 'COL+ADP': '🏹 弓手',
  'COL+STB': '✨ 牧師', 'STB+COL': '✨ 牧師',
  'ADP+INN': '🗡️ 盜賊', 'INN+ADP': '🗡️ 盜賊',
  'EXE+INS': '🔨 商人', 'INS+EXE': '🔨 商人',
};

function determineArchetypes(attrs: AttributeScores): string[] {
  if (Object.values(attrs).every(v => v >= 8)) return ['🌟 勇者 Hero'];
  if (Object.values(attrs).filter(v => v < 6).length >= 3) return ['🌱 初心者 Novice'];

  const sorted = Object.entries(attrs).sort((a, b) => b[1] - a[1]);
  const top2Score = sorted[1][1]; // 第二高的分數
  const candidates = sorted.filter(([,v]) => v >= top2Score);

  // 從 candidates 中取所有雙組合
  const archetypes = new Set<string>();
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const key = `${candidates[i][0]}+${candidates[j][0]}`;
      if (ARCHETYPE_MAP[key]) archetypes.add(ARCHETYPE_MAP[key]);
    }
  }
  return [...archetypes];
}
```

---

## 5. 職等欄位（jobRank）現況與映射

**問題**：現有 User model 的 `jobRank?: string` 欄位是否符合 FR-017 所需的 J/M/S 三分類？

**Findings**：
- `jobRank` 在 User interface 中定義為 `string`（自由格式），無 enum 約束。
- 現有系統未強制 J/M/S 格式；現有資料的 jobRank 值型式不明。

**Decision**：
1. 本功能使用 `jobRank` 欄位，在屬性報告中以 `J`/`M`/`S` 判斷及格標準說明。
2. 在評核快照（`userAttributeSnapshots`）建立時，複製 User 的 `jobRank` 當下值；若值不符合 `J/M/S`，屬性報告的及格標準塊顯示「職等未設定」提示。
3. FR-017 展示「行為標準對照說明」為靜態內容（hard-coded），依 `jobRank` 值選擇對應文字段落；不影響分數計算。
4. **遷移建議**（非本 PR 範圍）：管理者在使用者設定中統一更新員工 `jobRank` 為 J/M/S 格式。

---

## 6. 跑馬燈（Marquee）實作

**問題**：整體評價跑馬燈如何實作？

**Decision**：純 Angular standalone 元件搭配 CSS `@keyframes` 動畫，不引入任何套件。

**Pattern**：
- `marquee-comments.component.ts`：接受 `comments: string[]` 輸入，將所有評語串接（以分隔符號隔開），用 `overflow: hidden` + `translateX` 動畫。
- 當 comments 為空陣列 → 元件不渲染（`@if (comments.length > 0)`）。
- 切換週期 → 父元件更新 `comments` input → Angular 重新渲染 → CSS 動畫重新啟動（透過 key-binding 強制 re-render）。

---

## 7. 截止日期自動鎖定機制

**問題**：Angular SPA 如何偵測「截止日期到達」並自動更新週期狀態？

**Decision**：前端「軟鎖定」+ 管理者主動操作「硬結束」。

**Pattern**：
- 不使用 Cloud Functions（無後端支援）。
- 評核者進入表單前，Angular service 檢查 `cycle.deadline < now()`，若已過期則阻止提交（顯示提示）。
- 評核者清單頁面即時計算 `isExpired = deadline.toDate() < new Date()`，渲染「已截止」標籤。
- 管理者頁面顯示「已截止，待確認」的週期清單，主動操作「結束並發布」觸發正式狀態更新與 Z-score 計算。
- **不更動** `evaluationCycle.status` 在截止日到達時自動更新——依靠前端邏輯判斷，避免需要 Cloud Functions 或定時任務。

---

## 決策摘要表

| 主題 | 決策 |
|------|------|
| 雷達圖 | 純 Angular SVG 元件，不新增外部套件 |
| 趨勢折線圖 | 純 Angular SVG 元件 |
| Z-score 演算法 | Per-rater normalization，TARGET_MEAN=5.5, TARGET_SD=1.5，前端計算 |
| 匿名性保護 | Security Rules 層阻斷 evaluatee 讀取 evaluationForms；overallComments 以純文字陣列存於 snapshot |
| 職業原型並列 | 枚舉所有前兩高屬性對，去重後輸出 |
| jobRank 映射 | 沿用現有欄位，J/M/S 為預期值，不符則顯示「職等未設定」 |
| 跑馬燈 | 純 CSS keyframes + Angular binding |
| 截止鎖定 | 前端守衛（不需 Cloud Functions） |
