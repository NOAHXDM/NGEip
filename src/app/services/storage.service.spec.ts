/**
 * StorageService 單元測試
 *
 * 透過 spyOn(service, protectedMethod) 攔截 Angular Fire 模組層級函式包裝，
 * 避免直接 spyOn 模組匯出（getter-only）的限制（與 evaluation 服務相同策略）。
 *
 * 覆蓋：
 *  1. avatarPath 為確定性路徑。
 *  2. uploadAvatar：壓縮 → 取得 ref → 上傳（帶 contentType/cacheControl）→ 回傳下載 URL。
 *  3. deleteAvatar：object-not-found 視為已清理，不拋錯。
 *  4. deleteAvatar：其他錯誤應拋出。
 */

import { TestBed } from '@angular/core/testing';
import { Storage } from '@angular/fire/storage';
import { firstValueFrom } from 'rxjs';

import { StorageService } from './storage.service';

describe('StorageService', () => {
  let service: StorageService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [StorageService, { provide: Storage, useValue: {} }],
    });
    service = TestBed.inject(StorageService);
  });

  it('avatarPath 應為確定性路徑', () => {
    expect(service.avatarPath('abc')).toBe('avatars/abc/avatar.webp');
  });

  it('uploadAvatar：壓縮→取得 ref→上傳→回傳下載 URL，且帶正確 metadata', async () => {
    const fakeBlob = new Blob(['x'], { type: 'image/webp' });
    const fakeRef = { fullPath: 'avatars/u1/avatar.webp' } as any;

    const resizeSpy = spyOn<any>(service, 'resize').and.returnValue(
      Promise.resolve(fakeBlob)
    );
    const refSpy = spyOn<any>(service, 'storageRef').and.returnValue(fakeRef);
    const uploadSpy = spyOn<any>(service, 'storageUploadBytes').and.returnValue(
      Promise.resolve({})
    );
    spyOn<any>(service, 'storageGetDownloadURL').and.returnValue(
      Promise.resolve('https://download/u1')
    );

    const file = new File(['x'], 'a.png', { type: 'image/png' });
    const url = await firstValueFrom(service.uploadAvatar('u1', file));

    expect(url).toBe('https://download/u1');
    expect(resizeSpy).toHaveBeenCalledWith(file, undefined);
    expect(refSpy).toHaveBeenCalledWith('avatars/u1/avatar.webp');
    expect(uploadSpy).toHaveBeenCalledWith(fakeRef, fakeBlob, {
      contentType: 'image/webp',
      cacheControl: 'public,max-age=604800',
    });
  });

  it('deleteAvatar：object-not-found 視為已清理，不拋錯', async () => {
    spyOn<any>(service, 'storageRef').and.returnValue({});
    spyOn<any>(service, 'storageDeleteObject').and.returnValue(
      Promise.reject({ code: 'storage/object-not-found' })
    );

    await expectAsync(firstValueFrom(service.deleteAvatar('u1'))).toBeResolved();
  });

  it('deleteAvatar：其他錯誤應拋出', async () => {
    spyOn<any>(service, 'storageRef').and.returnValue({});
    spyOn<any>(service, 'storageDeleteObject').and.returnValue(
      Promise.reject({ code: 'storage/unauthorized' })
    );

    await expectAsync(firstValueFrom(service.deleteAvatar('u1'))).toBeRejected();
  });

  it('attachmentPath 應包含 kind、request、session 與 attachment id', () => {
    expect(service.attachmentPath('attendance', 'r1', 's1', 'a1')).toBe(
      'request-attachments/attendance/r1/s1/a1'
    );
  });

  it('uploadAttachment 應帶齊可稽核且可由 Rules 核對的 metadata', async () => {
    const fakeRef = {} as any;
    spyOn<any>(service, 'storageRef').and.returnValue(fakeRef);
    const uploadSpy = spyOn<any>(service, 'storageUploadBytes').and.resolveTo({});
    const file = new File(['%PDF-'], 'proof.pdf', { type: 'application/pdf' });
    const attachment = {
      id: 'a1', storagePath: 'request-attachments/attendance/r1/s1/a1', originalName: 'proof.pdf',
      contentType: 'application/pdf' as const, size: file.size, uploadedBy: 'actor', uploadedAt: {} as any,
    };

    await firstValueFrom(service.uploadAttachment(attachment, file, {
      requestKind: 'attendance', requestId: 'r1', ownerUid: 'owner',
    }));

    expect(uploadSpy).toHaveBeenCalledWith(fakeRef, file, {
      contentType: 'application/pdf',
      cacheControl: 'private,max-age=3600',
      customMetadata: {
        requestKind: 'attendance', requestId: 'r1', attachmentId: 'a1', ownerUid: 'owner', uploadedBy: 'actor',
      },
    });
  });

  it('getAttachmentBlob 應限制最大下載為 3 MiB', async () => {
    const fakeRef = {} as any;
    spyOn<any>(service, 'storageRef').and.returnValue(fakeRef);
    const blob = new Blob(['x']);
    const getBlobSpy = spyOn<any>(service, 'storageGetBlob').and.resolveTo(blob);
    const result = await firstValueFrom(service.getAttachmentBlob({
      id: 'a1', storagePath: 'p', originalName: 'a.pdf', contentType: 'application/pdf',
      size: 1, uploadedBy: 'u1', uploadedAt: {} as any,
    }));
    expect(result).toBe(blob);
    expect(getBlobSpy).toHaveBeenCalledWith(fakeRef, 3 * 1024 * 1024);
  });
});
