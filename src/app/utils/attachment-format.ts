const ATTACHMENT_AUDIT_ACTIONS = ['新增附件', '刪除附件'];

interface AuditAttachmentItem {
  originalName: string;
  size: number;
}

function isAuditAttachmentItem(item: unknown): item is AuditAttachmentItem {
  if (typeof item !== 'object' || item === null) return false;
  const { originalName, size } = item as Record<string, unknown>;
  return typeof originalName === 'string' && typeof size === 'number' && Number.isFinite(size);
}

export function formatAttachmentSize(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
}

export function getAttachmentAuditContentLabel(content: string | undefined, action: string): string {
  if (!content || !ATTACHMENT_AUDIT_ACTIONS.includes(action)) return content ?? '';

  try {
    const parsed: unknown = JSON.parse(content);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return content;
    const items: unknown = (parsed as Record<string, unknown>)['attachments'];
    if (!Array.isArray(items)) return content;
    const labels = items
      .filter(isAuditAttachmentItem)
      .map(({ originalName, size }) => `${originalName}（${formatAttachmentSize(size)}）`);
    // 沒有可顯示項目時保留原始 JSON，避免空陣列或損壞內容在 audit trail 中靜默消失。
    return labels.length === 0 ? content : labels.join('、');
  } catch {
    return content;
  }
}
