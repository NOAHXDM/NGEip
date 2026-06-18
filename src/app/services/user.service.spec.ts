/**
 * UserService 單元測試（聚焦離職流程 updateUserAdvanced）
 *
 * 重點覆蓋 PR#13 移植 Storage 後新增的「離職孤兒檔第二道防線」邏輯：
 *  1. 無 exitDate：僅更新一般欄位，不清 photoUrl、不刪 Storage 頭像。
 *  2. 有 exitDate：更新時一併清空 photoUrl，並於更新成功後呼叫 deleteAvatar。
 *  3. 有 exitDate 且 deleteAvatar 失敗：整條流程仍視為成功完成（清理失敗不阻斷離職）。
 *
 * Firestore 模組函式透過 service._fn 介面攔截（與 evaluation 服務同策略，
 * 規避 ES module non-configurable 限制）。StorageService 以 DI 注入 spy。
 */

import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of, throwError } from 'rxjs';

import { Auth } from '@angular/fire/auth';
import { Firestore } from '@angular/fire/firestore';

import { User, UserService } from './user.service';
import { StorageService } from './storage.service';
import { TimezoneService } from './timezone.service';

const MOCK_UID = 'user-001';
const MOCK_DOC_REF = { path: `users/${MOCK_UID}` } as const;

describe('UserService（離職流程 updateUserAdvanced）', () => {
  let service: UserService;
  let storageServiceSpy: jasmine.SpyObj<StorageService>;
  let docSpy: jasmine.Spy;
  let updateDocSpy: jasmine.Spy;

  beforeEach(() => {
    storageServiceSpy = jasmine.createSpyObj<StorageService>('StorageService', [
      'deleteAvatar',
    ]);
    storageServiceSpy.deleteAvatar.and.returnValue(of(void 0));

    TestBed.configureTestingModule({
      providers: [
        UserService,
        { provide: Firestore, useValue: jasmine.createSpyObj('Firestore', ['_dummy']) },
        { provide: Auth, useValue: { onAuthStateChanged: () => () => {} } },
        { provide: StorageService, useValue: storageServiceSpy },
        {
          provide: TimezoneService,
          useValue: jasmine.createSpyObj('TimezoneService', [
            'convertTimestampByClientTimezone',
            'convertDateByClientTimezone',
          ]),
        },
      ],
    });

    service = TestBed.inject(UserService);

    // 攔截 Firestore 函式（instance 屬性，可直接替換）
    docSpy = service._fn.doc = jasmine
      .createSpy('doc')
      .and.returnValue(MOCK_DOC_REF as any) as any;
    updateDocSpy = service._fn.updateDoc = jasmine
      .createSpy('updateDoc')
      .and.returnValue(Promise.resolve()) as any;
  });

  it('無 exitDate：僅更新欄位，不清 photoUrl、不刪 Storage 頭像', async () => {
    const user = {
      uid: MOCK_UID,
      jobRank: 'R1',
      jobTitle: 'Engineer',
      role: 'user',
      startDate: 'start-ts' as any,
      exitDate: undefined,
    } as unknown as User;

    await firstValueFrom(service.updateUserAdvanced(user));

    expect(updateDocSpy).toHaveBeenCalledTimes(1);
    const writtenData = updateDocSpy.calls.mostRecent().args[1] as Record<string, unknown>;
    expect('photoUrl' in writtenData).toBeFalse();
    expect(storageServiceSpy.deleteAvatar).not.toHaveBeenCalled();
  });

  it('有 exitDate：更新時清空 photoUrl，並於成功後刪除 Storage 頭像', async () => {
    const user = {
      uid: MOCK_UID,
      jobRank: 'R1',
      jobTitle: 'Engineer',
      role: 'user',
      startDate: 'start-ts' as any,
      exitDate: 'exit-ts' as any,
    } as unknown as User;

    await firstValueFrom(service.updateUserAdvanced(user));

    expect(updateDocSpy).toHaveBeenCalledTimes(1);
    const writtenData = updateDocSpy.calls.mostRecent().args[1] as Record<string, unknown>;
    expect(writtenData['photoUrl']).toBe('');
    expect(storageServiceSpy.deleteAvatar).toHaveBeenCalledOnceWith(MOCK_UID);
  });

  it('有 exitDate 且 deleteAvatar 失敗：整條流程仍成功完成（不阻斷離職）', async () => {
    storageServiceSpy.deleteAvatar.and.returnValue(
      throwError(() => ({ code: 'storage/unauthorized' }))
    );

    const user = {
      uid: MOCK_UID,
      jobRank: 'R1',
      jobTitle: 'Engineer',
      role: 'user',
      startDate: 'start-ts' as any,
      exitDate: 'exit-ts' as any,
    } as unknown as User;

    await expectAsync(
      firstValueFrom(service.updateUserAdvanced(user))
    ).toBeResolved();

    // Firestore 仍已寫入（photoUrl 清空），離職本身視為成功
    expect(updateDocSpy).toHaveBeenCalledTimes(1);
    expect(storageServiceSpy.deleteAvatar).toHaveBeenCalledOnceWith(MOCK_UID);
  });
});
