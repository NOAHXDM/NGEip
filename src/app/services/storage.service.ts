import { Injectable, inject } from '@angular/core';
import {
  Storage,
  StorageReference,
  UploadMetadata,
  UploadResult,
  ref,
  uploadBytes,
  getDownloadURL,
  getBlob,
  deleteObject,
} from '@angular/fire/storage';
import { from, Observable } from 'rxjs';

import { resizeImage, ResizeOptions } from '../utils/image-resize';
import {
  AttachmentMetadata,
  AttachmentUploadContext,
  MAX_ATTACHMENT_BYTES,
  RequestKind,
} from '../attachments/attachment.models';

/**
 * 集中所有 Firebase Storage 存取的服務層（憲章：Firebase 存取集中於可測試的服務）。
 *
 * 頭像採確定性路徑 `avatars/{uid}/avatar.webp`：每位使用者只有一個物件，
 * 重新上傳即覆寫舊檔，先天不會產生孤兒檔。
 *
 * 註：Angular Fire v20 的模組層級函式（ref/uploadBytes/...）為 getter-only，
 * 無法直接 spyOn，故統一包成 protected 方法，供單元測試攔截。
 */
@Injectable({
  providedIn: 'root',
})
export class StorageService {
  private readonly storage = inject(Storage);

  /** 一週瀏覽器快取，降低顯示端重複下載的 egress 成本。 */
  private static readonly AVATAR_CACHE_CONTROL = 'public,max-age=604800';
  private static readonly AVATAR_CONTENT_TYPE = 'image/webp';

  /** 取得指定使用者頭像的確定性 Storage 路徑。 */
  avatarPath(uid: string): string {
    return `avatars/${uid}/avatar.webp`;
  }

  attachmentPath(kind: RequestKind, requestId: string, sessionId: string, attachmentId: string): string {
    return `request-attachments/${kind}/${requestId}/${sessionId}/${attachmentId}`;
  }

  journeyEventAttachmentPath(
    targetUserId: string,
    eventId: string,
    sessionId: string,
    attachmentId: string
  ): string {
    return `journey-event-attachments/${targetUserId}/${eventId}/${sessionId}/${attachmentId}`;
  }

  uploadAttachment(
    metadata: AttachmentMetadata,
    file: File,
    context: AttachmentUploadContext
  ): Observable<void> {
    const storageRef = this.storageRef(metadata.storagePath);
    return from(
      this.storageUploadBytes(storageRef, file, {
        contentType: metadata.contentType,
        cacheControl: 'private,max-age=3600',
        customMetadata: {
          requestKind: context.requestKind,
          requestId: context.requestId,
          attachmentId: metadata.id,
          ownerUid: context.ownerUid,
          uploadedBy: metadata.uploadedBy,
        },
      }).then(() => void 0)
    );
  }

  uploadJourneyEventAttachment(
    metadata: AttachmentMetadata,
    file: File,
    context: { targetUserId: string; eventId: string }
  ): Observable<void> {
    return from(
      this.storageUploadBytes(this.storageRef(metadata.storagePath), file, {
        contentType: metadata.contentType,
        cacheControl: 'private,max-age=3600',
        customMetadata: {
          targetUserId: context.targetUserId,
          eventId: context.eventId,
          attachmentId: metadata.id,
          uploadedBy: metadata.uploadedBy,
        },
      }).then(() => void 0)
    );
  }

  getAttachmentBlob(metadata: AttachmentMetadata): Observable<Blob> {
    return from(this.storageGetBlob(this.storageRef(metadata.storagePath), MAX_ATTACHMENT_BYTES));
  }

  deleteAttachment(storagePath: string): Observable<void> {
    return from(this.deleteAttachmentAsync(storagePath));
  }

  private async deleteAttachmentAsync(storagePath: string): Promise<void> {
    try {
      await this.storageDeleteObject(this.storageRef(storagePath));
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && (error as { code?: string }).code === 'storage/object-not-found') return;
      throw error;
    }
  }

  /**
   * 壓縮並上傳頭像，回傳可直接寫入 Firestore `photoUrl` 的下載 URL。
   *
   * @param uid 目標使用者 UID（同時決定 Storage 路徑與寫入授權）
   * @param file 使用者選取的原始圖片檔
   */
  uploadAvatar(
    uid: string,
    file: File,
    resizeOptions?: ResizeOptions
  ): Observable<string> {
    return from(this.uploadAvatarAsync(uid, file, resizeOptions));
  }

  private async uploadAvatarAsync(
    uid: string,
    file: File,
    resizeOptions?: ResizeOptions
  ): Promise<string> {
    const blob = await this.resize(file, resizeOptions);
    const storageRef = this.storageRef(this.avatarPath(uid));
    await this.storageUploadBytes(storageRef, blob, {
      contentType: StorageService.AVATAR_CONTENT_TYPE,
      cacheControl: StorageService.AVATAR_CACHE_CONTROL,
    });
    return this.storageGetDownloadURL(storageRef);
  }

  /**
   * 刪除使用者頭像（離職清理或稽核用）。
   * 找不到檔案視為已清理，不視為錯誤。
   */
  deleteAvatar(uid: string): Observable<void> {
    return from(this.deleteAvatarAsync(uid));
  }

  private async deleteAvatarAsync(uid: string): Promise<void> {
    const storageRef = this.storageRef(this.avatarPath(uid));
    try {
      await this.storageDeleteObject(storageRef);
    } catch (error: unknown) {
      // 檔案不存在時 Storage 會回 'storage/object-not-found'，視為已清理
      if (
        typeof error === 'object' &&
        error !== null &&
        (error as { code?: string }).code === 'storage/object-not-found'
      ) {
        return;
      }
      throw error;
    }
  }

  // === Firebase SDK 包裝（protected，供單元測試 spyOn 攔截） ===

  protected resize(file: File, options?: ResizeOptions): Promise<Blob> {
    return resizeImage(file, options);
  }

  protected storageRef(path: string): StorageReference {
    return ref(this.storage, path);
  }

  protected storageUploadBytes(
    storageRef: StorageReference,
    data: Blob,
    metadata: UploadMetadata
  ): Promise<UploadResult> {
    return uploadBytes(storageRef, data, metadata);
  }

  protected storageGetDownloadURL(storageRef: StorageReference): Promise<string> {
    return getDownloadURL(storageRef);
  }

  protected storageGetBlob(storageRef: StorageReference, maxDownloadSizeBytes: number): Promise<Blob> {
    return getBlob(storageRef, maxDownloadSizeBytes);
  }

  protected storageDeleteObject(storageRef: StorageReference): Promise<void> {
    return deleteObject(storageRef);
  }
}
