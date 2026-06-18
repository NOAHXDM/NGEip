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
  getDocs,
  query,
  where,
  serverTimestamp,
  increment,
  writeBatch,
} from '@angular/fire/firestore';
import { Auth, authState } from '@angular/fire/auth';
import {
  EvaluationAssignment,
  RandomAssignmentPreview,
  RandomAssignmentPreviewRow,
} from '../models/evaluation.models';
import { User } from '../../services/user.service';

/** Firestore 集合路徑 */
const ASSIGNMENTS_COLLECTION = 'evaluationAssignments';
const CYCLES_COLLECTION = 'evaluationCycles';

@Injectable({ providedIn: 'root' })
export class EvaluationAssignmentService {
  private readonly firestore = inject(Firestore);
  private readonly auth = inject(Auth);

  /**
   * Firestore 函式參照（instance 屬性），供單元測試替換。
   */
  readonly _fn = {
    collection,
    collectionData,
    doc,
    getDoc,
    getDocs,
    query,
    where,
    serverTimestamp,
    increment,
    writeBatch,
  };

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

        const assignmentsRef = this._fn.collection(this.firestore, ASSIGNMENTS_COLLECTION);

        // 依是否提供 cycleId 選擇查詢條件
        const q = cycleId
          ? this._fn.query(
              assignmentsRef,
              this._fn.where('evaluatorUid', '==', user.uid),
              this._fn.where('cycleId', '==', cycleId),
            )
          : this._fn.query(assignmentsRef, this._fn.where('evaluatorUid', '==', user.uid));

        return this._fn.collectionData(q, { idField: 'id' }) as Observable<EvaluationAssignment[]>;
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
    const assignmentsRef = this._fn.collection(this.firestore, ASSIGNMENTS_COLLECTION);
    const q = this._fn.query(assignmentsRef, this._fn.where('cycleId', '==', cycleId));
    return this._fn.collectionData(q, { idField: 'id' }) as Observable<EvaluationAssignment[]>;
  }

  // =====================
  // 寫入方法
  // =====================

  /**
   * 產生隨機快選預覽，不寫入 Firestore。
   */
  generateRandomAssignmentPreview(
    cycleId: string,
    users: User[],
    existingAssignments: EvaluationAssignment[],
  ): RandomAssignmentPreview {
    const eligibleUsers = users
      .filter((user) => user.uid && !user.exitDate && user.role !== 'admin')
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'zh-Hant'));

    const targetEvaluatorCount = eligibleUsers.length < 2
      ? 0
      : Math.min(10, eligibleUsers.length - 1);

    const userByUid = new Map(users.filter((user) => user.uid).map((user) => [user.uid!, user]));
    const eligibleUidSet = new Set(eligibleUsers.map((user) => user.uid!));
    const assignmentsByEvaluatee = this.groupAssignmentsByEvaluatee(existingAssignments);
    const evaluatorLoads: Record<string, number> = {};

    for (const user of eligibleUsers) {
      evaluatorLoads[user.uid!] = 0;
    }

    if (eligibleUsers.length < 2) {
      return {
        cycleId,
        rows: [],
        evaluatorLoads,
        generatedAt: new Date(),
      };
    }

    const rows = eligibleUsers.map((evaluatee): RandomAssignmentPreviewRow => {
      const evaluateeUid = evaluatee.uid!;
      const existingForEvaluatee = assignmentsByEvaluatee.get(evaluateeUid) ?? [];
      const completed = existingForEvaluatee.filter((assignment) => assignment.status === 'completed');
      const pending = existingForEvaluatee.filter((assignment) => assignment.status === 'pending');
      const warnings: string[] = [];
      const evaluatorUids: string[] = [];
      const lockedEvaluatorUids: string[] = [];

      for (const assignment of completed) {
        if (assignment.evaluatorUid === evaluateeUid) continue;
        this.addUnique(evaluatorUids, assignment.evaluatorUid);
        this.addUnique(lockedEvaluatorUids, assignment.evaluatorUid);

        const evaluator = userByUid.get(assignment.evaluatorUid);
        if (!evaluator || evaluator.exitDate || evaluator.role === 'admin') {
          warnings.push('已完成指派包含管理員、已離職或不在候選名單中的評核者，系統已保留並計入。');
        }
      }

      if (lockedEvaluatorUids.length > targetEvaluatorCount) {
        warnings.push('已完成指派已超過本次目標人數，系統已保留並不再補派。');
      }

      for (const assignment of pending) {
        if (evaluatorUids.length >= targetEvaluatorCount) break;
        if (assignment.evaluatorUid === evaluateeUid) continue;
        if (!eligibleUidSet.has(assignment.evaluatorUid)) continue;
        this.addUnique(evaluatorUids, assignment.evaluatorUid);
      }

      while (evaluatorUids.length < targetEvaluatorCount) {
        const candidate = this.pickEvaluator(evaluatee, eligibleUsers, evaluatorUids, evaluatorLoads);
        if (!candidate?.uid) break;
        evaluatorUids.push(candidate.uid);
      }

      for (const evaluatorUid of evaluatorUids) {
        evaluatorLoads[evaluatorUid] = (evaluatorLoads[evaluatorUid] ?? 0) + 1;
      }

      return {
        evaluateeUid,
        evaluatorUids,
        lockedEvaluatorUids,
        targetEvaluatorCount,
        warnings: Array.from(new Set(warnings)),
      };
    });

    return {
      cycleId,
      rows,
      evaluatorLoads,
      generatedAt: new Date(),
    };
  }

  /**
   * 儲存隨機快選預覽。
   * 僅建立新的 pending 指派，不刪除或覆寫既有 completed 指派。
   */
  async saveRandomAssignmentPreview(preview: RandomAssignmentPreview): Promise<void> {
    const assignments = preview.rows.flatMap((row) =>
      row.evaluatorUids.map((evaluatorUid) => ({
        evaluatorUid,
        evaluateeUid: row.evaluateeUid,
      })),
    );

    await this.createAssignments(preview.cycleId, assignments);
  }

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

    const uniqueAssignments = this.dedupeAssignments(assignments)
      .filter((assignment) => assignment.evaluatorUid !== assignment.evaluateeUid);
    const assignmentsToCreate: { evaluatorUid: string; evaluateeUid: string; key: string }[] = [];

    for (const assignment of uniqueAssignments) {
      const key = this.buildAssignmentKey(assignment.evaluatorUid, cycleId, assignment.evaluateeUid);
      const assignmentRef = this._fn.doc(this.firestore, ASSIGNMENTS_COLLECTION, key);
      const existingSnap = await this._fn.getDoc(assignmentRef);

      if (!existingSnap.exists()) {
        assignmentsToCreate.push({ ...assignment, key });
      }
    }

    if (assignmentsToCreate.length === 0) return;

    const batch = this._fn.writeBatch(this.firestore);

    for (const assignment of assignmentsToCreate) {
      // 確定性 Key：確保相同組合不會產生重複文件
      const assignmentRef = this._fn.doc(this.firestore, ASSIGNMENTS_COLLECTION, assignment.key);

      batch.set(assignmentRef, {
        id: assignment.key,
        cycleId,
        evaluatorUid: assignment.evaluatorUid,
        evaluateeUid: assignment.evaluateeUid,
        status: 'pending' as const,
        createdAt: this._fn.serverTimestamp(),
      });
    }

    // 原子性遞增週期的 totalAssignments 計數
    const cycleRef = this._fn.doc(this.firestore, CYCLES_COLLECTION, cycleId);
    batch.update(cycleRef, {
      totalAssignments: this._fn.increment(assignmentsToCreate.length),
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
    const assignmentRef = this._fn.doc(this.firestore, ASSIGNMENTS_COLLECTION, assignmentId);
    const assignmentSnap = await this._fn.getDoc(assignmentRef);

    if (!assignmentSnap.exists()) {
      throw new Error(`考評指派 ${assignmentId} 不存在`);
    }

    const assignment = assignmentSnap.data() as EvaluationAssignment;
    const batch = this._fn.writeBatch(this.firestore);

    // 刪除指派文件
    batch.delete(assignmentRef);

    // 遞減週期的 totalAssignments 計數（不低於 0 由業務邏輯保障）
    const cycleRef = this._fn.doc(this.firestore, CYCLES_COLLECTION, assignment.cycleId);
    batch.update(cycleRef, {
      totalAssignments: this._fn.increment(-1),
    });

    await batch.commit();
  }

  private buildAssignmentKey(evaluatorUid: string, cycleId: string, evaluateeUid: string): string {
    return `${evaluatorUid}_${cycleId}_${evaluateeUid}`;
  }

  private dedupeAssignments(
    assignments: { evaluatorUid: string; evaluateeUid: string }[],
  ): { evaluatorUid: string; evaluateeUid: string }[] {
    const seen = new Set<string>();
    const result: { evaluatorUid: string; evaluateeUid: string }[] = [];

    for (const assignment of assignments) {
      const key = `${assignment.evaluatorUid}_${assignment.evaluateeUid}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(assignment);
    }

    return result;
  }

  private groupAssignmentsByEvaluatee(assignments: EvaluationAssignment[]): Map<string, EvaluationAssignment[]> {
    const grouped = new Map<string, EvaluationAssignment[]>();

    for (const assignment of assignments) {
      const rows = grouped.get(assignment.evaluateeUid) ?? [];
      rows.push(assignment);
      grouped.set(assignment.evaluateeUid, rows);
    }

    return grouped;
  }

  private pickEvaluator(
    evaluatee: User,
    candidates: User[],
    selectedEvaluatorUids: string[],
    evaluatorLoads: Record<string, number>,
  ): User | undefined {
    const selected = new Set(selectedEvaluatorUids);
    const evaluateeJobTitle = evaluatee.jobTitle?.trim();

    return candidates
      .filter((candidate) => candidate.uid && candidate.uid !== evaluatee.uid && !selected.has(candidate.uid))
      .map((candidate) => ({
        user: candidate,
        load: evaluatorLoads[candidate.uid!] ?? 0,
        sameJobTitle: Boolean(evaluateeJobTitle && candidate.jobTitle?.trim() === evaluateeJobTitle),
        random: Math.random(),
      }))
      .sort((a, b) =>
        a.load - b.load ||
        Number(b.sameJobTitle) - Number(a.sameJobTitle) ||
        a.random - b.random,
      )[0]?.user;
  }

  private addUnique(target: string[], value: string): void {
    if (!target.includes(value)) {
      target.push(value);
    }
  }
}
