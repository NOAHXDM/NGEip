/**
 * UserAttributeSnapshotService（T024）
 *
 * 受評者職場屬性快照查詢服務
 *
 * 職責：
 *  - getMySnapshots()              取得目前登入者的所有快照（依 cycleId DESC）
 *  - getMySnapshot(cycleId)        取得目前登入者指定週期的快照
 *  - getAllSnapshotsByCycle(cycleId) 取得指定週期的所有快照（管理者專用）
 */

import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { map, shareReplay, switchMap } from 'rxjs/operators';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  docData,
  query,
  where,
  orderBy,
} from '@angular/fire/firestore';
import { Auth, authState } from '@angular/fire/auth';
import { UserAttributeSnapshot } from '../models/evaluation.models';

/** Firestore 集合路徑 */
const SNAPSHOTS_COLLECTION = 'userAttributeSnapshots';

@Injectable({ providedIn: 'root' })
export class UserAttributeSnapshotService {
  private readonly firestore = inject(Firestore);
  private readonly auth = inject(Auth);

  /**
   * 取得目前登入者的所有快照，依 cycleId 倒序排列
   * 結果以 shareReplay(1) 快取
   */
  getMySnapshots(): Observable<UserAttributeSnapshot[]> {
    return authState(this.auth).pipe(
      switchMap((user) => {
        if (!user) {
          return of<UserAttributeSnapshot[]>([]);
        }

        const colRef = collection(this.firestore, SNAPSHOTS_COLLECTION);
        const q = query(
          colRef,
          where('userId', '==', user.uid),
          orderBy('cycleId', 'desc'),
        );
        return (collectionData(q, { idField: 'id' }) as Observable<UserAttributeSnapshot[]>).pipe(
          shareReplay(1),
        );
      }),
    );
  }

  /**
   * 取得目前登入者指定週期的快照
   * 不存在時回傳 null
   *
   * @param cycleId 評核週期 ID
   */
  getMySnapshot(cycleId: string): Observable<UserAttributeSnapshot | null> {
    return authState(this.auth).pipe(
      switchMap((user) => {
        if (!user) {
          return of<UserAttributeSnapshot | null>(null);
        }

        const snapshotId = `${cycleId}_${user.uid}`;
        const docRef = doc(this.firestore, SNAPSHOTS_COLLECTION, snapshotId);
        return (docData(docRef, { idField: 'id' }) as Observable<UserAttributeSnapshot | undefined>).pipe(
          map((snapshot) => snapshot ?? null),
        );
      }),
    );
  }

  /**
   * 取得指定週期的所有受評者快照（管理者專用）
   *
   * @param cycleId 評核週期 ID
   */
  getAllSnapshotsByCycle(cycleId: string): Observable<UserAttributeSnapshot[]> {
    const colRef = collection(this.firestore, SNAPSHOTS_COLLECTION);
    const q = query(
      colRef,
      where('cycleId', '==', cycleId),
    );
    return collectionData(q, { idField: 'id' }) as Observable<UserAttributeSnapshot[]>;
  }
}
