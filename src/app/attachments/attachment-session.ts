import { AttachmentMetadata } from './attachment.models';

/**
 * 附件上傳 session 的共用流程骨架。
 *
 * request（attendance/subsidy）與 journey-event 兩個 domain 的附件上傳 session
 * 各自維護 collection 名稱、Storage path 結構、Firestore 存取機制與 log 訊息，
 * 但「上傳失敗回滾」與「已提交附件清理」兩段演算法在兩個 service 中是逐步驟相同的。
 *
 * 本模組以策略注入（strategy injection）將該演算法骨架抽出為純函式，由各 service
 * 注入自身的 IO 操作；此舉只收斂重複的控制流程，不改變任一 domain 既有的
 * Firestore／Storage 寫入行為。
 */

/** 回滾單一 session 時所需的注入操作；皆由呼叫端綁定各自的 IO 與 log。 */
export interface PreparedAttachmentRollbackOperations {
  /** 刪除指定 Storage 路徑的檔案（object-not-found 視為成功，由 StorageService 處理）。 */
  deleteAttachment: (storagePath: string) => Promise<void>;
  /** 當某個附件刪除失敗時呼叫，供呼叫端記錄 domain 特有的 log 內容。 */
  onDeleteError: (attachment: Pick<AttachmentMetadata, 'id' | 'storagePath'>, error: unknown) => void;
  /** 有任一附件刪除失敗時呼叫：將 session 標記為 cleanup-pending（best-effort）。 */
  markSessionCleanupPending: () => Promise<void>;
  /** 全部附件皆成功刪除時呼叫：移除 session 文件（best-effort）。 */
  deleteSession: () => Promise<void>;
}

/**
 * 回滾一批已（部分）上傳的附件：逐一刪除其 Storage 檔案；只要有任一刪除失敗，
 * 即將 session 標記為 cleanup-pending 供後續重試，否則移除 session 文件。
 *
 * 與兩個 service 原本各自內嵌的回滾流程行為等價，差異僅在注入的 IO／collection／log。
 */
export async function rollbackPreparedAttachments(
  attachments: readonly Pick<AttachmentMetadata, 'id' | 'storagePath'>[],
  operations: PreparedAttachmentRollbackOperations
): Promise<void> {
  let failed = false;
  for (const attachment of attachments) {
    try {
      await operations.deleteAttachment(attachment.storagePath);
    } catch (error) {
      failed = true;
      operations.onDeleteError(attachment, error);
    }
  }
  if (failed) {
    await operations.markSessionCleanupPending();
  } else {
    await operations.deleteSession();
  }
}

export type AttachmentCleanupFailureCode = 'storage-delete-failed' | 'queue-delete-failed';

/** 清理單一已提交附件時所需的注入操作。 */
export interface AttachmentCleanupOperations {
  /** 刪除附件的 Storage 檔案。 */
  deleteAttachment: () => Promise<void>;
  /** 刪除附件於 cleanup queue 的文件。 */
  deleteQueue: () => Promise<void>;
  /** 記錄清理失敗；由呼叫端決定各 domain 既有的持久化／log 行為。 */
  recordFailure: (lastErrorCode: AttachmentCleanupFailureCode, context: Record<string, unknown>) => Promise<void>;
  /** 從錯誤物件解析錯誤代碼，用於判斷 object-not-found 冪等性。 */
  errorCode: (error: unknown) => string;
}

/**
 * 清理單一已提交（交易已接管）的附件：先刪除 Storage 檔案，再移除 cleanup queue 文件。
 *
 * - Storage 回報 object-not-found 視為冪等成功，繼續刪除 queue。
 * - Storage 其他錯誤：記錄 storage-delete-failed 並保留 queue 供後續重試，回傳 false。
 * - queue 刪除失敗：記錄 queue-delete-failed，回傳 false。
 *
 * 回傳是否完成清理（true 表示 Storage 與 queue 皆已處理）。
 */
export async function processAttachmentCleanup(
  attachment: AttachmentMetadata,
  operations: AttachmentCleanupOperations
): Promise<boolean> {
  try {
    await operations.deleteAttachment();
  } catch (storageError) {
    const storageErrorCode = operations.errorCode(storageError);
    if (storageErrorCode !== 'storage/object-not-found') {
      await operations.recordFailure('storage-delete-failed', {
        attachmentId: attachment.id,
        storagePath: attachment.storagePath,
        storageErrorCode,
      });
      return false;
    }
  }

  try {
    await operations.deleteQueue();
    return true;
  } catch (queueError) {
    await operations.recordFailure('queue-delete-failed', {
      attachmentId: attachment.id,
      storagePath: attachment.storagePath,
      queueErrorCode: operations.errorCode(queueError),
    });
    return false;
  }
}
