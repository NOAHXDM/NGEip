/**
 * EvaluationAssignmentService（T013）
 *
 * 評核指派 CRUD 服務
 *
 * 職責：
 *  - getMyAssignments(cycleId?)          取得目前登入者的指派清單（可選週期篩選）
 *  - getAssignmentsByCycle(cycleId)      取得特定週期的所有指派
 *  - createAssignments(cycleId, [...])   批次建立指派 + 遞增週期 totalAssignments
 *  - deleteAssignment(assignmentId)      刪除指派 + 遞減週期 totalAssignments
 *
 * 指派文件 Key 格式（確定性，防止重複）：
 *   {evaluatorUid}_{cycleId}_{evaluateeUid}
 */

import { Injectable, inject } from '@angular/core';
import { Observable, of, switchMap } from 'rxjs';
import { shareReplay } from 'rxjs/operators';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  getDoc,
  query,
  where,
  serverTimestamp,
  increment,
  writeBatch,
} from '@angular/fire/firestore';
import { Auth, authState } from '@angular/fire/auth';
import { EvaluationAssignment } from '../models/evaluation.models';

/** Firestore 集合路徑 */
const ASSIGNMENTS_COLLECTION = 'evaluationAssignments';
const CYCLES_COLLECTION = 'evaluationCycles';

@Injectable({ providedIn: 'root' })
export class EvaluationAssignmentService {
  private readonly firestore = inject(Firestore);
  private readonly auth = inject(Auth);

  // =====================
  // 讀取方法
  // =====================

  /**
   * 取得目前登入者的評核指派清單
   *
   * 使用 authState 確保 Firebase Auth 狀態初始化後才發出資料，
   * 以 shareReplay(1) 快取避免重複訂閱。
   *
   * @param cycleId 可選。若指定，只回傳該週期的指派
   * @returns Observable，使用者未登入時回傳空陣列
   */
  getMyAssignments(cycleId?: string): Observable<EvaluationAssignment[]> {
    return authState(this.auth).pipe(
      switchMap((user) => {
        if (!user) {
          // 使用者未登入，回傳空陣列
          return of<EvaluationAssignment[]>([]);
        }

        const assignmentsRef = collection(this.firestore, ASSIGNMENTS_COLLECTION);

        // 依是否提供 cycleId 選擇查詢條件
        const q = cycleId
          ? query(
              assignmentsRef,
              where('evaluatorUid', '==', user.uid),
              where('cycleId', '==', cycleId),
            )
          : query(assignmentsRef, where('evaluatorUid', '==', user.uid));

        return collectionData(q, { idField: 'id' }) as Observable<EvaluationAssignment[]>;
      }),
      shareReplay(1),
    );
  }

  /**
   * 取得特定週期的所有評核指派
   *
   * @param cycleId 目標週期 ID
   */
  getAssignmentsByCycle(cycleId: string): Observable<EvaluationAssignment[]> {
    const assignmentsRef = collection(this.firestore, ASSIGNMENTS_COLLECTION);
    const q = query(assignmentsRef, where('cycleId', '==', cycleId));
    return collectionData(q, { idField: 'id' }) as Observable<EvaluationAssignment[]>;
  }

  // =====================
  // 寫入方法
  // =====================

  /**
   * 批次建立評核指派
   *
   * 指派文件使用確定性 Key：{evaluatorUid}_{cycleId}_{evaluateeUid}
   * 若相同 Key 的文件已存在，setDoc 會覆寫（防止重複記錄）
   *
   * 同時以原子性操作遞增週期的 totalAssignments 計數。
   *
   * @param cycleId    目標週期 ID
   * @param assignments 要建立的指派清單（evaluatorUid + evaluateeUid）
   */
  async createAssignments(
    cycleId: string,
    assignments: { evaluatorUid: string; evaluateeUid: string }[],
  ): Promise<void> {
    // 空陣列直接返回，避免空 batch commit
    if (assignments.length === 0) return;

    const batch = writeBatch(this.firestore);

    for (const assignment of assignments) {
      // 確定性 Key：確保相同組合不會產生重複文件
      const key = `${assignment.evaluatorUid}_${cycleId}_${assignment.evaluateeUid}`;
      const assignmentRef = doc(this.firestore, ASSIGNMENTS_COLLECTION, key);

      batch.set(assignmentRef, {
        id: key,
        cycleId,
        evaluatorUid: assignment.evaluatorUid,
        evaluateeUid: assignment.evaluateeUid,
        status: 'pending' as const,
        createdAt: serverTimestamp(),
      });
    }

    // 原子性遞增週期的 totalAssignments 計數
    const cycleRef = doc(this.firestore, CYCLES_COLLECTION, cycleId);
    batch.update(cycleRef, {
      totalAssignments: increment(assignments.length),
    });

    await batch.commit();
  }

  /**
   * 刪除評核指派，並原子性遞減週期的 totalAssignments 計數
   *
   * 流程：
   *  1. 取得指派文件（需要 cycleId 欄位）
   *  2. writeBatch：刪除指派 + 遞減週期計數
   *
   * @param assignmentId 指派文件 ID（格式：{evaluatorUid}_{cycleId}_{evaluateeUid}）
   * @throws Error 指派文件不存在時
   */
  async deleteAssignment(assignmentId: string): Promise<void> {
    const assignmentRef = doc(this.firestore, ASSIGNMENTS_COLLECTION, assignmentId);
    const assignmentSnap = await getDoc(assignmentRef);

    if (!assignmentSnap.exists()) {
      throw new Error(`考評指派 ${assignmentId} 不存在`);
    }

    const assignment = assignmentSnap.data() as EvaluationAssignment;
    const batch = writeBatch(this.firestore);

    // 刪除指派文件
    batch.delete(assignmentRef);

    // 遞減週期的 totalAssignments 計數（不低於 0 由業務邏輯保障）
    const cycleRef = doc(this.firestore, CYCLES_COLLECTION, assignment.cycleId);
    batch.update(cycleRef, {
      totalAssignments: increment(-1),
    });

    await batch.commit();
  }
}
