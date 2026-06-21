const ATTACHMENT_AUDIT_ACTIONS = ['新增附件', '刪除附件'];

export function formatAttachmentSize(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
}

export function getAttachmentAuditContentLabel(content: string | undefined, action: string): string {
  if (!content || !ATTACHMENT_AUDIT_ACTIONS.includes(action)) return content ?? '';

  try {
    const items: unknown = JSON.parse(content).attachments;
    if (!Array.isArray(items)) return content;
    return items
      .map((item: unknown) => {
        if (typeof item !== 'object' || item === null) return '';
        const { originalName, size } = item as Record<string, unknown>;
        if (typeof originalName !== 'string' || typeof size !== 'number' || !Number.isFinite(size)) return '';
        return `${originalName}（${formatAttachmentSize(size)}）`;
      })
      .filter(Boolean)
      .join('、');
  } catch {
    return content;
  }
}
