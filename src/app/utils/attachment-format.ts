const ATTACHMENT_AUDIT_ACTIONS = ['新增附件', '刪除附件'];

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
      .map((item: unknown) => {
        if (typeof item !== 'object' || item === null) return '';
        const { originalName, size } = item as Record<string, unknown>;
        if (typeof originalName !== 'string' || typeof size !== 'number' || !Number.isFinite(size)) return '';
        return `${originalName}（${formatAttachmentSize(size)}）`;
      })
      .filter(Boolean);
    // 非空陣列若沒有任何合法標籤，保留原始 JSON，避免損壞的 audit trail 在畫面上靜默消失。
    const allItemsMalformed = labels.length === 0 && items.length > 0;
    return allItemsMalformed ? content : labels.join('、');
  } catch {
    return content;
  }
}
