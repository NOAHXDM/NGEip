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

import { Injectable, InjectionToken, inject } from '@angular/core';
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
  runTransaction,
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
// Firestore transaction 最多 500 writes（reads 不計入）：498 sets + 1 cycleRef update = 499 writes。
const TRANSACTION_SET_LIMIT = 498;
const WARNING_COMPLETED_EVALUATOR_INELIGIBLE =
  '已完成指派包含管理員、已離職或不在候選名單中的評核者，系統已保留並計入。';
const WARNING_COMPLETED_OVER_TARGET =
  '已完成指派已超過本次目標人數，系統已保留並不再補派。';

export interface EvaluationAssignmentFirestoreFns {
  collection: typeof collection;
  collectionData: typeof collectionData;
  doc: typeof doc;
  getDoc: typeof getDoc;
  query: typeof query;
  where: typeof where;
  serverTimestamp: typeof serverTimestamp;
  increment: typeof increment;
  writeBatch: typeof writeBatch;
  runTransaction: typeof runTransaction;
}

export const EVALUATION_ASSIGNMENT_FIRESTORE_FNS = new InjectionToken<EvaluationAssignmentFirestoreFns>(
  'EVALUATION_ASSIGNMENT_FIRESTORE_FNS',
  {
    providedIn: 'root',
    factory: () => ({
      collection,
      collectionData,
      doc,
      getDoc,
      query,
      where,
      serverTimestamp,
      increment,
      writeBatch,
      runTransaction,
    }),
  },
);

@Injectable({ providedIn: 'root' })
export class EvaluationAssignmentService {
  private readonly firestore = inject(Firestore);
  private readonly auth = inject(Auth);
  private readonly firestoreFns = inject(EVALUATION_ASSIGNMENT_FIRESTORE_FNS);

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

        const assignmentsRef = this.firestoreFns.collection(this.firestore, ASSIGNMENTS_COLLECTION);

        // 依是否提供 cycleId 選擇查詢條件
        const q = cycleId
          ? this.firestoreFns.query(
              assignmentsRef,
              this.firestoreFns.where('evaluatorUid', '==', user.uid),
              this.firestoreFns.where('cycleId', '==', cycleId),
            )
          : this.firestoreFns.query(assignmentsRef, this.firestoreFns.where('evaluatorUid', '==', user.uid));

        return this.firestoreFns.collectionData(q, { idField: 'id' }) as Observable<EvaluationAssignment[]>;
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
    const assignmentsRef = this.firestoreFns.collection(this.firestore, ASSIGNMENTS_COLLECTION);
    const q = this.firestoreFns.query(assignmentsRef, this.firestoreFns.where('cycleId', '==', cycleId));
    return this.firestoreFns.collectionData(q, { idField: 'id' }) as Observable<EvaluationAssignment[]>;
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
        if (this.addUnique(evaluatorUids, assignment.evaluatorUid)) {
          evaluatorLoads[assignment.evaluatorUid] = (evaluatorLoads[assignment.evaluatorUid] ?? 0) + 1;
        }
        this.addUnique(lockedEvaluatorUids, assignment.evaluatorUid);

        const evaluator = userByUid.get(assignment.evaluatorUid);
        if (!evaluator || evaluator.exitDate || evaluator.role === 'admin') {
          warnings.push(WARNING_COMPLETED_EVALUATOR_INELIGIBLE);
        }
      }

      if (lockedEvaluatorUids.length > targetEvaluatorCount) {
        warnings.push(WARNING_COMPLETED_OVER_TARGET);
      }

      for (const assignment of pending) {
        if (evaluatorUids.length >= targetEvaluatorCount) break;
        if (assignment.evaluatorUid === evaluateeUid) continue;
        if (!eligibleUidSet.has(assignment.evaluatorUid)) continue;
        if (this.addUnique(evaluatorUids, assignment.evaluatorUid)) {
          evaluatorLoads[assignment.evaluatorUid] = (evaluatorLoads[assignment.evaluatorUid] ?? 0) + 1;
        }
      }

      while (evaluatorUids.length < targetEvaluatorCount) {
        const candidate = this.pickEvaluator(evaluatee, eligibleUsers, evaluatorUids, evaluatorLoads);
        if (!candidate?.uid) break;
        evaluatorUids.push(candidate.uid);
        evaluatorLoads[candidate.uid] = (evaluatorLoads[candidate.uid] ?? 0) + 1;
      }

      return {
        evaluateeUid,
        evaluatorUids,
        lockedEvaluatorUids,
        targetEvaluatorCount,
        warnings: Array.from(new Set(warnings)),
      };
    });

    this.rebalancePreviewLoads(rows, eligibleUsers, evaluatorLoads);

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
      row.evaluatorUids
        .filter((evaluatorUid) => !row.lockedEvaluatorUids.includes(evaluatorUid))
        .map((evaluatorUid) => ({
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
   * 若相同 Key 的文件已存在，交易會略過該筆（防止重複記錄與統計失真）。
   *
   * 同時在同一個 Firestore transaction 內遞增週期的 totalAssignments 計數，
   * 避免並發儲存造成 check-then-write race condition。
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

    const cycleRef = this.firestoreFns.doc(this.firestore, CYCLES_COLLECTION, cycleId);

    for (const chunk of this.chunkAssignments(uniqueAssignments, TRANSACTION_SET_LIMIT)) {
      await this.firestoreFns.runTransaction(this.firestore, async (transaction) => {
        const checkedAssignments = await Promise.all(chunk.map(async (assignment) => {
          const key = this.buildAssignmentKey(assignment.evaluatorUid, cycleId, assignment.evaluateeUid);
          const assignmentRef = this.firestoreFns.doc(this.firestore, ASSIGNMENTS_COLLECTION, key);
          const existingSnap = await transaction.get(assignmentRef);
          return {
            ...assignment,
            key,
            ref: assignmentRef,
            exists: existingSnap.exists(),
          };
        }));

        const assignmentsToCreate = checkedAssignments.filter((assignment) => !assignment.exists);

        if (assignmentsToCreate.length === 0) return;

        for (const assignment of assignmentsToCreate) {
          // 確定性 Key：確保相同組合不會產生重複文件
          transaction.set(assignment.ref, {
            id: assignment.key,
            cycleId,
            evaluatorUid: assignment.evaluatorUid,
            evaluateeUid: assignment.evaluateeUid,
            status: 'pending' as const,
            createdAt: this.firestoreFns.serverTimestamp(),
          });
        }

        // 原子性遞增週期的 totalAssignments 計數
        transaction.update(cycleRef, {
          totalAssignments: this.firestoreFns.increment(assignmentsToCreate.length),
        });
      });
    }
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
    const assignmentRef = this.firestoreFns.doc(this.firestore, ASSIGNMENTS_COLLECTION, assignmentId);
    const assignmentSnap = await this.firestoreFns.getDoc(assignmentRef);

    if (!assignmentSnap.exists()) {
      throw new Error(`考評指派 ${assignmentId} 不存在`);
    }

    const assignment = assignmentSnap.data() as EvaluationAssignment;
    const batch = this.firestoreFns.writeBatch(this.firestore);

    // 刪除指派文件
    batch.delete(assignmentRef);

    // 遞減週期的 totalAssignments 計數（不低於 0 由業務邏輯保障）
    const cycleRef = this.firestoreFns.doc(this.firestore, CYCLES_COLLECTION, assignment.cycleId);
    batch.update(cycleRef, {
      totalAssignments: this.firestoreFns.increment(-1),
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
      const key = `${assignment.evaluatorUid}\u0000${assignment.evaluateeUid}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(assignment);
    }

    return result;
  }

  private chunkAssignments<T>(items: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];

    for (let i = 0; i < items.length; i += chunkSize) {
      chunks.push(items.slice(i, i + chunkSize));
    }

    return chunks;
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

  /**
   * 就地微調 preview rows 的可編輯評核者，使整體負載差距盡量收斂至 1 以內。
   * 不替換 locked completed 指派，也不產生自評或重複評核者。
   */
  private rebalancePreviewLoads(
    rows: RandomAssignmentPreviewRow[],
    eligibleUsers: User[],
    evaluatorLoads: Record<string, number>,
  ): void {
    const eligibleUids = eligibleUsers
      .map((user) => user.uid)
      .filter((uid): uid is string => Boolean(uid));
    const maxIterations = rows.length * eligibleUids.length;

    for (let iteration = 0; iteration < maxIterations; iteration += 1) {
      const loads = eligibleUids.map((uid) => ({ uid, load: evaluatorLoads[uid] ?? 0 }));
      const min = loads.reduce((best, item) => item.load < best.load ? item : best);
      const max = loads.reduce((best, item) => item.load > best.load ? item : best);

      if (max.load - min.load <= 1) return;

      const swapped = this.swapOverloadedEvaluator(rows, evaluatorLoads, max.uid, min.uid);
      if (!swapped) return;
    }
  }

  private swapOverloadedEvaluator(
    rows: RandomAssignmentPreviewRow[],
    evaluatorLoads: Record<string, number>,
    overloadedUid: string,
    underloadedUid: string,
  ): boolean {
    for (const row of rows) {
      if (row.evaluateeUid === underloadedUid) continue;
      if (row.lockedEvaluatorUids.includes(overloadedUid)) continue;
      if (row.evaluatorUids.includes(underloadedUid)) continue;

      const replaceIndex = row.evaluatorUids.indexOf(overloadedUid);
      if (replaceIndex === -1) continue;

      // rows 是本次預覽的局部資料；回傳前就地替換以同步 evaluatorLoads。
      row.evaluatorUids[replaceIndex] = underloadedUid;
      evaluatorLoads[overloadedUid] = (evaluatorLoads[overloadedUid] ?? 0) - 1;
      evaluatorLoads[underloadedUid] = (evaluatorLoads[underloadedUid] ?? 0) + 1;
      return true;
    }

    return false;
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

  private addUnique(target: string[], value: string): boolean {
    if (!target.includes(value)) {
      target.push(value);
      return true;
    }

    return false;
  }
}
