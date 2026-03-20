/**
 * EvaluationCycleService（T012 + T032）
 *
 * 評核週期 CRUD 服務
 *
 * 職責：
 *  - getCycles()                          取得所有週期（依建立時間倒序）
 *  - getCycleById(cycleId)                依 ID 取得單一週期
 *  - createCycle(data)                    建立新週期
 *  - updateDeadline(cycleId, deadline)    更新截止日期
 *  - incrementCompletedAssignments(cycleId) 遞增已完成指派計數（由表單提交服務呼叫）
 *  - closeAndPublish(cycleId)             關閉並發布週期（完整 Z-score 批次計算）
 */

import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map, shareReplay } from 'rxjs/operators';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  docData,
  query,
  orderBy,
  where,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  writeBatch,
  serverTimestamp,
  increment,
} from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';
import { Timestamp } from 'firebase/firestore';
import {
  EvaluationAssignment,
  EvaluationCycle,
  EvaluationForm,
} from '../models/evaluation.models';
import { ZScoreCalculatorService } from './zscore-calculator.service';

/** Firestore 集合路徑 */
const CYCLES_COLLECTION = 'evaluationCycles';
const FORMS_COLLECTION = 'evaluationForms';
const ASSIGNMENTS_COLLECTION = 'evaluationAssignments';
const SNAPSHOTS_COLLECTION = 'userAttributeSnapshots';

/** 允許執行 closeAndPublish 的週期狀態 */
const CLOSEABLE_STATUSES: EvaluationCycle['status'][] = ['active', 'expired_pending'];

/** Firestore batch 寫入上限（500 筆操作） */
const BATCH_SIZE_LIMIT = 490;

@Injectable({ providedIn: 'root' })
export class EvaluationCycleService {
  private readonly firestore = inject(Firestore);
  private readonly auth = inject(Auth);
  private readonly zScoreCalculator = inject(ZScoreCalculatorService);

  /**
   * Firestore 函式參照（instance 屬性）
   *
   * 設計為 public 以便單元測試中直接替換為 jasmine.createSpy，
   * 避免 ES module 非可寫屬性（configurable: false）導致 spyOn 失敗。
   */
  readonly _fn = {
    setDoc,
    updateDoc,
    doc,
    collection,
    collectionData,
    docData,
    query,
    orderBy,
    where,
    getDoc,
    getDocs,
    writeBatch,
    serverTimestamp,
    increment,
  };

  // =====================
  // 讀取方法
  // =====================

  /**
   * 取得所有評核週期，依建立時間倒序排列
   * 結果以 shareReplay(1) 快取，避免重複訂閱觸發多次讀取
   */
  getCycles(): Observable<EvaluationCycle[]> {
    const colRef = this._fn.collection(this.firestore, CYCLES_COLLECTION);
    const q = this._fn.query(colRef, this._fn.orderBy('createdAt', 'desc'));
    return (this._fn.collectionData(q, { idField: 'id' }) as Observable<EvaluationCycle[]>).pipe(
      shareReplay(1),
    );
  }

  /**
   * 依 ID 取得單一評核週期
   * 文件不存在時回傳 null（而非拋出例外）
   *
   * @param cycleId 評核週期的 Firestore document ID
   */
  getCycleById(cycleId: string): Observable<EvaluationCycle | null> {
    const docRef = this._fn.doc(this.firestore, CYCLES_COLLECTION, cycleId);
    return (this._fn.docData(docRef, { idField: 'id' }) as Observable<EvaluationCycle | undefined>).pipe(
      map((cycle) => cycle ?? null),
    );
  }

  // =====================
  // 寫入方法
  // =====================

  /**
   * 建立新評核週期
   *
   * 自動填入：
   *  - status = 'active'
   *  - totalAssignments = 0
   *  - completedAssignments = 0
   *  - createdBy = 目前登入者 UID
   *  - createdAt = 伺服器時間戳記
   *
   * @param data 週期基本資料
   * @returns 新建立週期的 document ID
   * @throws Error 使用者未登入時
   */
  async createCycle(data: {
    name: string;
    type: 'H1' | 'H2';
    year: number;
    startDate: Timestamp;
    deadline: Timestamp;
  }): Promise<string> {
    const currentUser = this.auth.currentUser;
    if (!currentUser) {
      throw new Error('使用者未登入，無法建立評核週期');
    }

    // 產生具有隨機 ID 的新文件參考
    const colRef = this._fn.collection(this.firestore, CYCLES_COLLECTION);
    const newDocRef = this._fn.doc(colRef);
    const cycleId = newDocRef.id;

    await this._fn.setDoc(newDocRef, {
      id: cycleId,
      name: data.name,
      type: data.type,
      year: data.year,
      startDate: data.startDate,
      deadline: data.deadline,
      status: 'active' as const,
      totalAssignments: 0,
      completedAssignments: 0,
      createdBy: currentUser.uid,
      createdAt: this._fn.serverTimestamp(),
    });

    return cycleId;
  }

  /**
   * 更新評核週期的截止日期
   *
   * @param cycleId 目標週期 ID
   * @param deadline 新截止日期（Firestore Timestamp）
   */
  async updateDeadline(cycleId: string, deadline: Timestamp): Promise<void> {
    const cycleRef = this._fn.doc(this.firestore, CYCLES_COLLECTION, cycleId);
    await this._fn.updateDoc(cycleRef, { deadline });
  }

  /**
   * 遞增週期的已完成指派計數
   * 由 EvaluationFormService 在表單提交後呼叫，使用原子性 increment 操作
   *
   * @param cycleId 目標週期 ID
   */
  async incrementCompletedAssignments(cycleId: string): Promise<void> {
    const cycleRef = this._fn.doc(this.firestore, CYCLES_COLLECTION, cycleId);
    await this._fn.updateDoc(cycleRef, {
      completedAssignments: this._fn.increment(1),
    });
  }

  /**
   * 關閉並發布評核週期
   *
   * 前置條件：status 必須為 'active' 或 'expired_pending'
   *  - 若為 'closed' → 拋出錯誤（防止重複關閉）
   *  - 若文件不存在  → 拋出錯誤
   *
   * 關閉後：
   *  - status = 'closed'
   *  - closedAt = 伺服器時間戳記
   *
   * @param cycleId 目標週期 ID
   * @throws Error 狀態不符合前置條件時
   */
  async closeAndPublish(cycleId: string): Promise<void> {
    const cycleRef = this._fn.doc(this.firestore, CYCLES_COLLECTION, cycleId);
    const snapshot = await this._fn.getDoc(cycleRef);

    if (!snapshot.exists()) {
      throw new Error(`評核週期 ${cycleId} 不存在`);
    }

    const cycle = snapshot.data() as EvaluationCycle;

    if (!CLOSEABLE_STATUSES.includes(cycle.status)) {
      throw new Error(
        `評核週期狀態為 '${cycle.status}'，無法關閉發布（僅允許 active 或 expired_pending）`,
      );
    }

    // ── Step 1：讀取本週期所有已提交考評表 ───────────────────────────────────
    const formsQuery = this._fn.query(
      this._fn.collection(this.firestore, FORMS_COLLECTION),
      this._fn.where('cycleId', '==', cycleId),
    );
    const formsSnap = await this._fn.getDocs(formsQuery);
    const forms: EvaluationForm[] = formsSnap.docs.map(
      (d) => ({ ...d.data(), id: d.id } as EvaluationForm),
    );

    // ── Step 2：讀取本週期所有評核指派（用於標記 overdue） ─────────────────────
    const assignmentsQuery = this._fn.query(
      this._fn.collection(this.firestore, ASSIGNMENTS_COLLECTION),
      this._fn.where('cycleId', '==', cycleId),
      this._fn.where('status', '==', 'pending'),
    );
    const assignmentsSnap = await this._fn.getDocs(assignmentsQuery);
    const pendingAssignments: EvaluationAssignment[] = assignmentsSnap.docs.map(
      (d) => ({ ...d.data(), id: d.id } as EvaluationAssignment),
    );

    // ── Step 3：讀取本週期所有快照（用於更新） ───────────────────────────────
    const snapshotsQuery = this._fn.query(
      this._fn.collection(this.firestore, SNAPSHOTS_COLLECTION),
      this._fn.where('cycleId', '==', cycleId),
    );
    const snapshotsSnap = await this._fn.getDocs(snapshotsQuery);

    // ── Step 4：Z-score 計算（空表單時跳過） ─────────────────────────────────
    const computedResults = this.zScoreCalculator.compute(forms);

    // ── Step 5：Firestore Batch 寫入 ─────────────────────────────────────────
    // 因為操作數量可能超過 500（Firestore batch 上限），需要分批
    let currentBatch = this._fn.writeBatch(this.firestore);
    let opCount = 0;
    const batches: ReturnType<typeof writeBatch>[] = [currentBatch];

    const addOp = (fn: (b: ReturnType<typeof writeBatch>) => void) => {
      if (opCount >= BATCH_SIZE_LIMIT) {
        currentBatch = this._fn.writeBatch(this.firestore);
        batches.push(currentBatch);
        opCount = 0;
      }
      fn(currentBatch);
      opCount++;
    };

    // 5a. 更新週期狀態 → closed
    addOp((b) => {
      b.update(cycleRef, {
        status: 'closed',
        closedAt: this._fn.serverTimestamp(),
      });
    });

    // 5b. 更新每位受評者的 userAttributeSnapshot → final
    for (const existingSnap of snapshotsSnap.docs) {
      const snapData = existingSnap.data();
      const userId = snapData['userId'] as string;
      const snapshotRef = this._fn.doc(this.firestore, SNAPSHOTS_COLLECTION, existingSnap.id);

      const computed = computedResults.snapshots.get(userId);

      if (computed) {
        // Z-score 校正後的資料
        addOp((b) => {
          b.update(snapshotRef, {
            status: 'final',
            attributes: computed.attributes ?? snapData['attributes'],
            totalScore: computed.totalScore ?? snapData['totalScore'],
            rawAttributes: computed.rawAttributes ?? snapData['rawAttributes'] ?? snapData['attributes'],
            rawTotalScore: computed.rawTotalScore ?? snapData['rawTotalScore'] ?? snapData['totalScore'],
            careerArchetypes: computed.careerArchetypes ?? snapData['careerArchetypes'],
            rankingScore: computed.rankingScore ?? computed.totalScore ?? snapData['totalScore'],
            validEvaluatorCount: computed.validEvaluatorCount ?? snapData['validEvaluatorCount'],
            computedAt: this._fn.serverTimestamp(),
          });
        });
      } else {
        // 無表單資料，僅標記為 final
        addOp((b) => {
          b.update(snapshotRef, {
            status: 'final',
            computedAt: this._fn.serverTimestamp(),
          });
        });
      }
    }

    // 5c. 更新有異常標記的考評表
    for (const [formId, flags] of computedResults.anomalousFormIds) {
      if (flags.reciprocalHighScore || flags.outlierEvaluator) {
        const formRef = this._fn.doc(this.firestore, FORMS_COLLECTION, formId);
        addOp((b) => {
          b.update(formRef, { anomalyFlags: flags });
        });
      }
    }

    // 5d. 逾期未提交的指派標記為 overdue
    for (const assignment of pendingAssignments) {
      const assignmentRef = this._fn.doc(this.firestore, ASSIGNMENTS_COLLECTION, assignment.id);
      addOp((b) => {
        b.update(assignmentRef, { status: 'overdue' });
      });
    }

    // ── Step 6：提交所有 batches ──────────────────────────────────────────────
    for (const batch of batches) {
      await batch.commit();
    }
  }

  /**
   * 重新計算指定週期所有受評者的加總平均分數（rawAttributes / rawTotalScore）
   *
   * 適用情境：舊週期資料在新增 rawAttributes 欄位前已結算，
   * 管理者可透過此方法回填缺失的原始平均分數。
   *
   * @param cycleId 目標週期 ID
   * @throws Error 週期不存在時
   */
  async recalculateRawScores(cycleId: string): Promise<void> {
    // Step 1：讀取本週期所有已提交考評表
    const formsQuery = this._fn.query(
      this._fn.collection(this.firestore, FORMS_COLLECTION),
      this._fn.where('cycleId', '==', cycleId),
    );
    const formsSnap = await this._fn.getDocs(formsQuery);
    const forms: EvaluationForm[] = formsSnap.docs.map(
      (d) => ({ ...d.data(), id: d.id } as EvaluationForm),
    );

    // Step 2：依受評者分組
    const formsByEvaluatee = new Map<string, EvaluationForm[]>();
    for (const form of forms) {
      const arr = formsByEvaluatee.get(form.evaluateeUid) ?? [];
      arr.push(form);
      formsByEvaluatee.set(form.evaluateeUid, arr);
    }

    // Step 3：讀取本週期所有快照
    const snapshotsQuery = this._fn.query(
      this._fn.collection(this.firestore, SNAPSHOTS_COLLECTION),
      this._fn.where('cycleId', '==', cycleId),
    );
    const snapshotsSnap = await this._fn.getDocs(snapshotsQuery);

    if (snapshotsSnap.docs.length === 0) return;

    // Step 4：Batch 更新每份快照的 rawAttributes / rawTotalScore
    let currentBatch = this._fn.writeBatch(this.firestore);
    let opCount = 0;
    const batches: ReturnType<typeof writeBatch>[] = [currentBatch];

    const addOp = (fn: (b: ReturnType<typeof writeBatch>) => void) => {
      if (opCount >= BATCH_SIZE_LIMIT) {
        currentBatch = this._fn.writeBatch(this.firestore);
        batches.push(currentBatch);
        opCount = 0;
      }
      fn(currentBatch);
      opCount++;
    };

    for (const existingSnap of snapshotsSnap.docs) {
      const snapData = existingSnap.data();
      const userId = snapData['userId'] as string;
      const snapshotRef = this._fn.doc(this.firestore, SNAPSHOTS_COLLECTION, existingSnap.id);

      const evaluateeForms = formsByEvaluatee.get(userId);
      if (evaluateeForms && evaluateeForms.length > 0) {
        const rawAttributes = this.zScoreCalculator.computeRawAttributeScores(evaluateeForms);
        const rawTotalScore = Math.round(
          Object.values(rawAttributes).reduce((sum, v) => sum + v, 0) * 100,
        ) / 100;

        addOp((b) => {
          b.update(snapshotRef, { rawAttributes, rawTotalScore });
        });
      }
    }

    for (const batch of batches) {
      await batch.commit();
    }
  }
}
