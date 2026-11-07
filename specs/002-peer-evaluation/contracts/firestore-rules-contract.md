# Firestore Security Rules 契約：評量考核系統

**分支**：`002-peer-evaluation` | **日期**：2026-03-17

> 本文件定義新增集合的完整 Security Rules 規格，作為實作前的正式契約。  
> **匿名性設計原則**：`evaluationForms` 集合對 evaluatee 完全阻斷讀取，確保評核者身份在 DB 層面無法被受評者查詢。

---

## 新增規則概要

| 集合 | Read | Create | Update | Delete |
|------|------|--------|--------|--------|
| `evaluationCycles` | 已登入使用者 | Admin only | Admin or 已登入（僅限 `completedAssignments`） | Admin only |
| `evaluationAssignments` | 相關評核者 or Admin | Admin only | 評核者（自己）or Admin | Admin only |
| `evaluationForms` | **本人評核者** or Admin（**受評者拒絕讀取**） | 已存在指派的評核者（本人、受評者與週期一致，禁止自評） | Admin 或仍符合指派的評核者本人（僅截止日前、且不可改關聯欄位） | 禁止 |
| `userAttributeSnapshots` | 本人受評者 or Admin | 評核者（建立預覽）or Admin | 評核者（更新預覽）or Admin | 禁止 |

---

## 詳細規則規格

### `evaluationCycles`
```
match /evaluationCycles/{cycleId} {
  // 所有已登入使用者可讀（需要看週期清單）
  allow read: if isSignedIn();

  // 僅管理者可建立/刪除
  allow create, delete: if isAdmin();

  // 管理者可修改任何欄位；評核者提交表單的 batch 寫入可原子性遞增 completedAssignments
  allow update: if isAdmin() ||
    (isSignedIn() &&
     request.resource.data.diff(resource.data).affectedKeys().hasOnly(['completedAssignments']));
}
```

### `evaluationAssignments`
```
match /evaluationAssignments/{assignmentId} {
  // 管理者可讀所有；評核者只能讀自己的指派
  allow read: if isAdmin() ||
    (isSignedIn() && resource.data.evaluatorUid == request.auth.uid);

  // 僅管理者可建立（指派評核關係）
  allow create: if isAdmin();

  // 評核者只能更新自己的任務狀態（pending → completed）
  // 確保不能更改 evaluatorUid / evaluateeUid / cycleId
  allow update: if isAdmin() ||
    (isSignedIn() &&
     resource.data.evaluatorUid == request.auth.uid &&
     request.resource.data.evaluatorUid == resource.data.evaluatorUid &&
     request.resource.data.evaluateeUid == resource.data.evaluateeUid &&
     request.resource.data.cycleId == resource.data.cycleId);

  // 僅管理者可刪除（刪除未提交的指派）
  allow delete: if isAdmin();
}
```

### `evaluationForms` ⚠️ 匿名性關鍵

```
match /evaluationForms/{formId} {
  // 信任已存在的管理者指派，不信任表單自行宣告的身分與關聯。
  // 使用寫入前的指派資料，允許正常 batch 同時將 pending 改為 completed。
  function matchesExistingAssignment(form) {
    let assignment = get(/databases/$(database)/documents/evaluationAssignments/$(form.assignmentId)).data;
    return form.evaluatorUid == request.auth.uid &&
      form.evaluateeUid != request.auth.uid &&
      assignment.evaluatorUid == request.auth.uid &&
      assignment.evaluateeUid == form.evaluateeUid &&
      assignment.cycleId == form.cycleId;
  }

  allow read: if isAdmin() ||
    (isSignedIn() && resource.data.evaluatorUid == request.auth.uid);

  allow create: if isSignedIn() &&
    request.resource.data.assignmentId is string &&
    exists(/databases/$(database)/documents/evaluationAssignments/$(request.resource.data.assignmentId)) &&
    matchesExistingAssignment(request.resource.data) &&
    // 確保 10 道題分數值在合法範圍（1–10）
    isValidScores(request.resource.data.scores) &&
    // 確保整體評價字數在範圍內（20–500 字）
    request.resource.data.overallComment.size() >= 20 &&
    request.resource.data.overallComment.size() <= 500;

  // 管理者可更新；評核者可在截止日前更新自己提交的表單（不可改身分與關聯欄位）
  allow update: if isAdmin() ||
    (isSignedIn() &&
     request.resource.data.assignmentId is string &&
     exists(/databases/$(database)/documents/evaluationAssignments/$(request.resource.data.assignmentId)) &&
     matchesExistingAssignment(request.resource.data) &&
     resource.data.evaluatorUid == request.auth.uid &&
     request.resource.data.evaluatorUid == resource.data.evaluatorUid &&
     request.resource.data.evaluateeUid == resource.data.evaluateeUid &&
     request.resource.data.cycleId == resource.data.cycleId &&
     request.resource.data.assignmentId == resource.data.assignmentId &&
     request.resource.data.anomalyFlags == resource.data.anomalyFlags &&
     isValidScores(request.resource.data.scores) &&
     request.resource.data.overallComment.size() >= 20 &&
     request.resource.data.overallComment.size() <= 500 &&
     exists(/databases/$(database)/documents/evaluationCycles/$(resource.data.cycleId)) &&
     get(/databases/$(database)/documents/evaluationCycles/$(resource.data.cycleId)).data.deadline > request.time);

  // 禁止任何人刪除考評表（資料完整性）
  allow delete: if false;
}

// 輔助函數：驗證 10 道題目分數範圍
function isValidScores(scores) {
  return scores.q1 >= 1 && scores.q1 <= 10 &&
         scores.q2 >= 1 && scores.q2 <= 10 &&
         scores.q3 >= 1 && scores.q3 <= 10 &&
         scores.q4 >= 1 && scores.q4 <= 10 &&
         scores.q5 >= 1 && scores.q5 <= 10 &&
         scores.q6 >= 1 && scores.q6 <= 10 &&
         scores.q7 >= 1 && scores.q7 <= 10 &&
         scores.q8 >= 1 && scores.q8 <= 10 &&
         scores.q9 >= 1 && scores.q9 <= 10 &&
         scores.q10 >= 1 && scores.q10 <= 10;
}
```

### `userAttributeSnapshots`

```
match /userAttributeSnapshots/{snapshotId} {
  // 受評者讀取自己的快照；管理者可讀所有
  allow read: if isAdmin() ||
    (isSignedIn() && resource.data.userId == request.auth.uid);

  // 管理者可隨時建立/更新（final 狀態由管理者寫入）
  allow create, update: if isAdmin();

  // 評核者可建立預覽快照（status 必須為 preview）
  allow create: if isSignedIn() &&
    request.resource.data.status == 'preview' &&
    request.resource.data.userId != request.auth.uid;  // 不能建立自己的快照

  // 評核者可更新預覽快照（append overallComment + 更新預覽分數）
  // 條件：只能更新 preview 狀態 → preview（不能升格為 final）
  allow update: if isSignedIn() &&
    resource.data.status == 'preview' &&
    request.resource.data.status == 'preview' &&
    request.resource.data.userId == resource.data.userId &&   // 不能換人
    request.resource.data.cycleId == resource.data.cycleId && // 不能換週期
    resource.data.userId != request.auth.uid;                 // 評核者不能更新自己的快照

  // 禁止刪除（歷史快照永久保留）
  allow delete: if false;
}
```

---

## Security Rules 驗證矩陣

| 操作 | Admin | 評核者（自己任務） | 受評者（自己） | 其他使用者 |
|------|-------|-------------------|--------------|-----------|
| 讀取 evaluationCycles | ✅ | ✅ | ✅ | ✅ |
| 建立 evaluationCycle | ✅ | ❌ | ❌ | ❌ |
| 修改 evaluationCycles（任意欄位） | ✅ | ❌ | ❌ | ❌ |
| 遞增 evaluationCycles.completedAssignments（僅此欄位） | ✅ | ✅ | ✅ | ✅ |
| 讀取 evaluationAssignments（自己） | ✅ | ✅ | ❌ | ❌ |
| 讀取自己的 evaluationForm | ✅ | ✅ | **❌（關鍵）** | ❌ |
| 建立 evaluationForm | ✅ | ✅ | ❌ | ❌ |
| 讀取 userAttributeSnapshot（自己） | ✅ | ❌（除非也是受評者） | ✅ | ❌ |
| 更新 userAttributeSnapshot preview | ✅ | ✅（非自己）| ❌ | ❌ |
| 將 snapshot 改為 final | ✅ | ❌ | ❌ | ❌ |

---

## 完整 firestore.rules 新增區塊（整合至現有規則中）

```
// === 評量考核系統 ===

match /evaluationCycles/{cycleId} {
  allow read: if isSignedIn();
  allow create, delete: if isAdmin();
  allow update: if isAdmin() ||
    (isSignedIn() &&
     request.resource.data.diff(resource.data).affectedKeys().hasOnly(['completedAssignments']));
}

match /evaluationAssignments/{assignmentId} {
  allow read: if isAdmin() ||
    (isSignedIn() && resource.data.evaluatorUid == request.auth.uid);
  allow create: if isAdmin();
  allow update: if isAdmin() ||
    (isSignedIn() &&
     resource.data.evaluatorUid == request.auth.uid &&
     request.resource.data.evaluatorUid == resource.data.evaluatorUid &&
     request.resource.data.evaluateeUid == resource.data.evaluateeUid &&
     request.resource.data.cycleId == resource.data.cycleId);
  allow delete: if isAdmin();
}

match /evaluationForms/{formId} {
  // 信任已存在的管理者指派，不信任表單自行宣告的身分與關聯。
  // 使用寫入前的指派資料，允許正常 batch 同時將 pending 改為 completed。
  function matchesExistingAssignment(form) {
    let assignment = get(/databases/$(database)/documents/evaluationAssignments/$(form.assignmentId)).data;
    return form.evaluatorUid == request.auth.uid &&
      form.evaluateeUid != request.auth.uid &&
      assignment.evaluatorUid == request.auth.uid &&
      assignment.evaluateeUid == form.evaluateeUid &&
      assignment.cycleId == form.cycleId;
  }

  allow read: if isAdmin() ||
    (isSignedIn() && resource.data.evaluatorUid == request.auth.uid);

  allow create: if isSignedIn() &&
    request.resource.data.assignmentId is string &&
    exists(/databases/$(database)/documents/evaluationAssignments/$(request.resource.data.assignmentId)) &&
    matchesExistingAssignment(request.resource.data) &&
    // 確保 10 道題分數值在合法範圍（1–10）
    isValidScores(request.resource.data.scores) &&
    // 確保整體評價字數在範圍內（20–500 字）
    request.resource.data.overallComment.size() >= 20 &&
    request.resource.data.overallComment.size() <= 500;

  // 管理者可更新；評核者可在截止日前更新自己提交的表單（不可改身分與關聯欄位）
  allow update: if isAdmin() ||
    (isSignedIn() &&
     request.resource.data.assignmentId is string &&
     exists(/databases/$(database)/documents/evaluationAssignments/$(request.resource.data.assignmentId)) &&
     matchesExistingAssignment(request.resource.data) &&
     resource.data.evaluatorUid == request.auth.uid &&
     request.resource.data.evaluatorUid == resource.data.evaluatorUid &&
     request.resource.data.evaluateeUid == resource.data.evaluateeUid &&
     request.resource.data.cycleId == resource.data.cycleId &&
     request.resource.data.assignmentId == resource.data.assignmentId &&
     request.resource.data.anomalyFlags == resource.data.anomalyFlags &&
     isValidScores(request.resource.data.scores) &&
     request.resource.data.overallComment.size() >= 20 &&
     request.resource.data.overallComment.size() <= 500 &&
     exists(/databases/$(database)/documents/evaluationCycles/$(resource.data.cycleId)) &&
     get(/databases/$(database)/documents/evaluationCycles/$(resource.data.cycleId)).data.deadline > request.time);

  // 禁止任何人刪除考評表（資料完整性）
  allow delete: if false;
}

match /userAttributeSnapshots/{snapshotId} {
  allow read: if isAdmin() ||
    (isSignedIn() && resource.data.userId == request.auth.uid);
  allow create: if isAdmin() ||
    (isSignedIn() &&
     request.resource.data.status == 'preview' &&
     request.resource.data.userId != request.auth.uid);
  allow update: if isAdmin() ||
    (isSignedIn() &&
     resource.data.status == 'preview' &&
     request.resource.data.status == 'preview' &&
     request.resource.data.userId == resource.data.userId &&
     request.resource.data.cycleId == resource.data.cycleId &&
     resource.data.userId != request.auth.uid);
  allow delete: if false;
}
```

---

## Firebase Emulator 驗證測試案例

實作時需以 Firebase Emulator + `@firebase/rules-unit-testing` 驗證：

| 測試案例 | 預期結果 |
|---------|---------|
| 受評者讀取自己的 evaluationForms | ❌ DENIED |
| 評核者讀取他人的 evaluationForms | ❌ DENIED |
| 評核者讀取自己提交的 evaluationForms | ✅ ALLOWED |
| Admin 讀取任何 evaluationForms | ✅ ALLOWED |
| 受評者讀取自己的 userAttributeSnapshot | ✅ ALLOWED |
| 受評者讀取他人的 userAttributeSnapshot | ❌ DENIED |
| 評核者更新受評者的 snapshot（preview → preview） | ✅ ALLOWED |
| 評核者更新受評者的 snapshot（preview → final） | ❌ DENIED |
| 受評者更新自己的 snapshot | ❌ DENIED |
| 已登入使用者遞增 evaluationCycles.completedAssignments | ✅ ALLOWED |
| 已登入使用者修改 evaluationCycles 其他欄位（如 name） | ❌ DENIED |
| 未登入使用者讀取任何集合 | ❌ DENIED |

## 2026-11-07 指派一致性修正

- 建立表單與一般評核者修改表單，皆驗證 `assignmentId` 指向既有指派，且指派的 `evaluatorUid` 等於登入者、`evaluateeUid` 與 `cycleId` 等於表單；禁止自評。管理者既有更新權限保留，不新增管理者建立表單的 bypass。
- 讀取寫入前的指派資料，允許服務的四筆 batch 同時寫表單／快照／completed 狀態／完成計數。實測合法首次提交與完成後修改皆通過。
- 缺失／已刪除或關聯不一致的歷史指派將阻止一般使用者修改對應表單；管理者可維護歷史資料，不自動補造指派。
- 本次只收緊表單與指派關聯，不更改新建表單的截止日／指派狀態政策、計數與快照 Rules。
- 發布時需包含 `firestore.rules`，建議先部署 Rules 再前端；只部署 Hosting 不會生效。Hosting rollback 不會回復 Rules，前端回復時仍保留本權限修正。
