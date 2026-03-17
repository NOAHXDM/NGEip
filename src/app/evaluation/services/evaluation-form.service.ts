/**
 * EvaluationFormService（T018）
 *
 * 評核表單提交與查詢服務
 *
 * 職責：
 *  - validateDraft(draft)                          驗證表單草稿（私有）
 *  - submitForm(cycleId, assignmentId, evaluateeUid, draft)
 *      1. 驗證草稿（overallComment 字數、極端分數說明）
 *      2. 確認指派狀態非 completed（防止重複提交）
 *      3. Firestore Batch Write：
 *         a. evaluationForms/{auto-id}              建立表單文件
 *         b. userAttributeSnapshots/{cycleId}_{evaluateeUid}
 *                                                   arrayUnion overallComment、
 *                                                   更新預覽屬性、increment validEvaluatorCount
 *         c. evaluationAssignments/{assignmentId}   status=completed, completedAt
 *         d. evaluationCycles/{cycleId}             completedAssignments increment(1)
 *  - getMyForm(cycleId, evaluateeUid)              目前登入者對特定受評者提交的表單
 *  - getAllFormsByCycle(cycleId)                    週期所有表單（管理者專用）
 *  - getFormsByEvaluatee(cycleId, evaluateeUid)    特定受評者的所有表單（管理者專用）
 *
 * 測試性設計：
 *  所有 Firebase SDK 模組層級函式均封裝於 protected 方法（firestoreGet、firestoreCreateBatch 等）。
 *  Angular Fire v20 的模組層級函式為 configurable:false 的 getter-only 屬性，
 *  無法透過 spyOn 攔截；使用 protected 方法讓測試可直接對實例方法進行 spyOn。
 *
 * 屬性題目對應（依 data-model.md）：
 *   EXE: q10 | INS: q2, q7 | ADP: q3, q9 | COL: q1, q6 | STB: q5, q8 | INN: q4
 */

import { Injectable, inject } from '@angular/core';
import {
  CollectionReference,
  DocumentData,
  DocumentReference,
  DocumentSnapshot,
  WriteBatch,
} from '@angular/fire/firestore';
import { Observable as RxObservable, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import {
  Firestore,
  FieldValue,
  collection,
  collectionData,
  doc,
  getDoc,
  query,
  where,
  writeBatch,
  serverTimestamp,
  arrayUnion,
  increment,
} from '@angular/fire/firestore';
import { Auth, authState } from '@angular/fire/auth';
import {
  AttributeScores,
  EvaluationAssignment,
  EvaluationForm,
  EvaluationFormDraft,
  EvaluationFormScores,
} from '../models/evaluation.models';

// =====================
// Firestore 集合路徑常數
// =====================

const FORMS_COLLECTION = 'evaluationForms';
const ASSIGNMENTS_COLLECTION = 'evaluationAssignments';
const SNAPSHOTS_COLLECTION = 'userAttributeSnapshots';
const CYCLES_COLLECTION = 'evaluationCycles';

// =====================
// 六大屬性題目對應表
// =====================

/**
 * 六大屬性與評分題目的對應關係
 * 與 ZScoreCalculatorService 的 ATTRIBUTE_QUESTIONS 保持一致
 */
const ATTRIBUTE_QUESTIONS: Record<keyof AttributeScores, (keyof EvaluationFormScores)[]> = {
  EXE: ['q10'],         // 執行力：工作效率與結果導向
  INS: ['q2', 'q7'],    // 洞察力：問題解決 + 積極學習
  ADP: ['q3', 'q9'],    // 應變力：自我管理 + 壓力應對
  COL: ['q1', 'q6'],    // 協作力：溝通協作 + 團隊精神
  STB: ['q5', 'q8'],    // 穩定力：責任心 + 專業態度
  INN: ['q4'],          // 創新力：創新與主動性
};

// =====================
// 服務本體
// =====================

@Injectable({ providedIn: 'root' })
export class EvaluationFormService {
  private readonly firestore = inject(Firestore);
  private readonly auth = inject(Auth);

  // =====================================================================
  // Protected Firebase 操作包裝方法
  //
  // Angular Fire v20 的模組層級函式（doc, collection, getDoc 等）在 webpack
  // 測試包中為 configurable:false 的 getter-only 屬性，無法以 spyOn 攔截。
  // 封裝為 protected 實例方法後，測試可直接使用 spyOn(service, 'methodName')。
  // =====================================================================

  /** 取得指定路徑的 DocumentReference */
  protected firestoreDocRef(path: string, ...segments: string[]): DocumentReference<DocumentData> {
    return doc(this.firestore, path, ...segments);
  }

  /** 取得新文件的自動 ID DocumentReference（用於 evaluationForms auto-id）*/
  protected firestoreNewDocRef(collRef: CollectionReference<DocumentData>): DocumentReference<DocumentData> {
    return doc(collRef);
  }

  /** 取得指定路徑的 CollectionReference */
  protected firestoreCollectionRef(path: string): CollectionReference<DocumentData> {
    return collection(this.firestore, path);
  }

  /** 讀取 DocumentSnapshot（包裝 getDoc） */
  protected firestoreGet(ref: DocumentReference<DocumentData>): Promise<DocumentSnapshot<DocumentData>> {
    return getDoc(ref);
  }

  /** 建立 WriteBatch（包裝 writeBatch） */
  protected firestoreCreateBatch(): WriteBatch {
    return writeBatch(this.firestore);
  }

  /** 建立查詢（包裝 query + where + collectionData） */
  protected firestoreQuery<T>(
    path: string,
    ...constraints: ReturnType<typeof where>[]
  ): RxObservable<T[]> {
    const colRef = this.firestoreCollectionRef(path);
    const q = query(colRef, ...constraints);
    return collectionData(q, { idField: 'id' }) as RxObservable<T[]>;
  }

  /** 建立 where 條件子句 */
  protected firestoreWhere(
    field: string,
    op: '<' | '<=' | '==' | '!=' | '>=' | '>' | 'array-contains' | 'in' | 'array-contains-any' | 'not-in',
    value: unknown,
  ): ReturnType<typeof where> {
    return where(field, op, value);
  }

  /** 取得伺服器時間戳記 FieldValue */
  protected firestoreServerTimestamp(): FieldValue {
    return serverTimestamp();
  }

  /** 建立 arrayUnion FieldValue */
  protected firestoreArrayUnion(...elements: unknown[]): FieldValue {
    return arrayUnion(...elements);
  }

  /** 建立 increment FieldValue */
  protected firestoreIncrement(n: number): FieldValue {
    return increment(n);
  }

  // =====================
  // 私有驗證方法
  // =====================

  /**
   * 驗證評核表單草稿
   *
   * 規則：
   *  1. overallComment：20–500 個字元（必填）
   *  2. 分數 ≥ 9 或 ≤ 3 的題目，必須填寫對應的具體說明（feedbacks[qN] 非空）
   *
   * @param draft 表單草稿（分數、回饋文字、整體評語）
   * @throws Error 任一驗證規則不符時拋出，錯誤訊息包含具體原因
   */
  private validateDraft(draft: EvaluationFormDraft): void {
    // ── 驗證整體評語字數 ──────────────────────────────────────────────────
    const comment = draft.overallComment?.trim() ?? '';

    if (comment.length < 20) {
      throw new Error(
        `整體評語至少需要 20 個字元（目前 ${comment.length} 個字元）`,
      );
    }

    if (comment.length > 500) {
      throw new Error(
        `整體評語不得超過 500 個字元（目前 ${comment.length} 個字元）`,
      );
    }

    // ── 驗證極端分數須填寫說明 ────────────────────────────────────────────
    const scoreKeys = Object.keys(draft.scores) as (keyof EvaluationFormScores)[];

    for (const key of scoreKeys) {
      const score = draft.scores[key];
      const feedback = draft.feedbacks[key]?.trim() ?? '';

      if ((score >= 9 || score <= 3) && feedback.length === 0) {
        throw new Error(
          `題目 ${key} 的分數（${score}）屬於極端值（≥9 或 ≤3），需填寫具體說明`,
        );
      }
    }
  }

  // =====================
  // 私有計算方法
  // =====================

  /**
   * 依六大屬性題目對應表，計算本份表單的原始平均分數（未校正）
   *
   * 此分數僅用於 userAttributeSnapshot 的預覽（preview）階段。
   * 週期關閉時，ZScoreCalculatorService 會以 per-rater Z-score 校正值覆蓋。
   */
  private computePreviewAttributes(scores: EvaluationFormScores): AttributeScores {
    const result = {} as AttributeScores;

    for (const [attr, questions] of Object.entries(ATTRIBUTE_QUESTIONS) as [
      keyof AttributeScores,
      (keyof EvaluationFormScores)[],
    ][]) {
      const sum = questions.reduce((acc, q) => acc + (scores[q] ?? 0), 0);
      result[attr] = sum / questions.length;
    }

    return result;
  }

  // =====================
  // 表單提交
  // =====================

  /**
   * 提交評核表單
   *
   * @param cycleId       評核週期 ID
   * @param assignmentId  評核指派 ID
   * @param evaluateeUid  受評者 UID
   * @param draft         表單草稿
   * @throws Error 驗證失敗、使用者未登入或指派已完成時
   */
  async submitForm(
    cycleId: string,
    assignmentId: string,
    evaluateeUid: string,
    draft: EvaluationFormDraft,
  ): Promise<void> {
    // Step 1：驗證草稿（同步，驗證失敗直接拋錯）
    this.validateDraft(draft);

    // Step 2：確認登入狀態
    const currentUser = this.auth.currentUser;
    if (!currentUser) {
      throw new Error('使用者未登入，無法提交評核表單');
    }

    // Step 3：讀取指派文件，檢查狀態
    const assignmentRef = this.firestoreDocRef(ASSIGNMENTS_COLLECTION, assignmentId);
    const assignmentSnap = await this.firestoreGet(assignmentRef);

    if (!assignmentSnap.exists()) {
      throw new Error(`考評指派 ${assignmentId} 不存在`);
    }

    const assignment = assignmentSnap.data() as EvaluationAssignment;

    if (assignment.status === 'completed') {
      throw new Error('此考評指派已完成提交，不得重複提交');
    }

    // Step 4：計算本份表單的預覽屬性分數（原始平均，未校正）
    const previewAttributes = this.computePreviewAttributes(draft.scores);

    // Step 5：Firestore Batch Write（四個操作原子性提交）
    const batch = this.firestoreCreateBatch();

    // 4a. 建立 evaluationForms 文件（auto-id）
    const formsColRef = this.firestoreCollectionRef(FORMS_COLLECTION);
    const formRef = this.firestoreNewDocRef(formsColRef);

    batch.set(formRef, {
      id: formRef.id,
      assignmentId,
      cycleId,
      evaluatorUid: currentUser.uid,
      evaluateeUid,
      submittedAt: this.firestoreServerTimestamp(),
      scores: draft.scores,
      feedbacks: draft.feedbacks,
      overallComment: draft.overallComment,
      anomalyFlags: {
        reciprocalHighScore: false,
        outlierEvaluator: false,
      },
    });

    // 4b. 合併更新 userAttributeSnapshots（merge:true 保留已有欄位）
    const snapshotId = `${cycleId}_${evaluateeUid}`;
    const snapshotRef = this.firestoreDocRef(SNAPSHOTS_COLLECTION, snapshotId);

    batch.set(
      snapshotRef,
      {
        cycleId,
        userId: evaluateeUid,
        overallComments: this.firestoreArrayUnion(draft.overallComment),
        attributes: previewAttributes,
        validEvaluatorCount: this.firestoreIncrement(1),
      },
      { merge: true },
    );

    // 4c. 更新指派狀態為 completed
    batch.update(assignmentRef, {
      status: 'completed' as const,
      completedAt: this.firestoreServerTimestamp(),
    });

    // 4d. 原子性遞增週期的已完成指派計數
    const cycleRef = this.firestoreDocRef(CYCLES_COLLECTION, cycleId);
    batch.update(cycleRef, {
      completedAssignments: this.firestoreIncrement(1),
    });

    await batch.commit();
  }

  // =====================
  // 查詢方法
  // =====================

  /**
   * 取得目前登入者對指定受評者在特定週期提交的表單
   * 未提交或未登入時回傳 null
   */
  getMyForm(cycleId: string, evaluateeUid: string): RxObservable<EvaluationForm | null> {
    return authState(this.auth).pipe(
      switchMap((user) => {
        if (!user) {
          return of<EvaluationForm | null>(null);
        }

        return this.firestoreQuery<EvaluationForm>(
          FORMS_COLLECTION,
          this.firestoreWhere('evaluatorUid', '==', user.uid),
          this.firestoreWhere('cycleId', '==', cycleId),
          this.firestoreWhere('evaluateeUid', '==', evaluateeUid),
        ).pipe(
          map((forms) => forms[0] ?? null),
        );
      }),
    );
  }

  /**
   * 取得特定週期的所有評核表單（管理者專用）
   */
  getAllFormsByCycle(cycleId: string): RxObservable<EvaluationForm[]> {
    return this.firestoreQuery<EvaluationForm>(
      FORMS_COLLECTION,
      this.firestoreWhere('cycleId', '==', cycleId),
    );
  }

  /**
   * 取得特定受評者在指定週期的所有評核表單（管理者專用）
   */
  getFormsByEvaluatee(cycleId: string, evaluateeUid: string): RxObservable<EvaluationForm[]> {
    return this.firestoreQuery<EvaluationForm>(
      FORMS_COLLECTION,
      this.firestoreWhere('cycleId', '==', cycleId),
      this.firestoreWhere('evaluateeUid', '==', evaluateeUid),
    );
  }
}
