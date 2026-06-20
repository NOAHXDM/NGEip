import {
  AttachmentContentType,
  AttachmentValidationError,
  ATTACHMENT_CONTENT_TYPES,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENT_COUNT,
} from '../attachments/attachment.models';

const EXTENSIONS: Record<AttachmentContentType, readonly string[]> = {
  'application/pdf': ['pdf'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
};

export const ATTACHMENT_ERROR_MESSAGES: Record<AttachmentValidationError, string> = {
  'unsupported-extension': '僅支援 PDF、JPEG、PNG、WebP 檔案。',
  'unsupported-mime': '檔案格式不受支援。',
  'signature-mismatch': '檔案內容與宣告格式不符。',
  'empty-file': '不可上傳空白檔案。',
  'file-too-large': '單一檔案不可超過 3 MiB。',
  'too-many-files': '每筆申請最多五個附件。',
};

export async function validateAttachmentFile(
  file: File
): Promise<AttachmentValidationError | null> {
  if (file.size === 0) return 'empty-file';
  if (file.size > MAX_ATTACHMENT_BYTES) return 'file-too-large';
  if (!ATTACHMENT_CONTENT_TYPES.includes(file.type as AttachmentContentType)) {
    return 'unsupported-mime';
  }

  const contentType = file.type as AttachmentContentType;
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (!EXTENSIONS[contentType].includes(extension)) {
    return 'unsupported-extension';
  }

  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  return matchesSignature(contentType, bytes) ? null : 'signature-mismatch';
}

export async function validateAttachmentSelection(
  files: readonly File[],
  existingCount = 0,
  removedCount = 0
): Promise<Map<File, AttachmentValidationError>> {
  const errors = new Map<File, AttachmentValidationError>();
  const retainedCount = Math.max(0, existingCount - Math.max(0, removedCount));
  if (retainedCount + files.length > MAX_ATTACHMENT_COUNT) {
    files.forEach((file) => errors.set(file, 'too-many-files'));
    return errors;
  }
  await Promise.all(
    files.map(async (file) => {
      const error = await validateAttachmentFile(file);
      if (error) errors.set(file, error);
    })
  );
  return errors;
}

function matchesSignature(type: AttachmentContentType, b: Uint8Array): boolean {
  switch (type) {
    case 'application/pdf':
      return b.length >= 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d;
    case 'image/jpeg':
      return b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    case 'image/png':
      return b.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v);
    case 'image/webp':
      return b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50;
  }
}
