const ATTACHMENT_AUDIT_ACTIONS = ['新增附件', '刪除附件'];

export function formatAttachmentSize(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
}

export function getAttachmentAuditContentLabel(content: string | undefined, action: string): string {
  if (!content || !ATTACHMENT_AUDIT_ACTIONS.includes(action)) return content ?? '';

  try {
    const items = JSON.parse(content).attachments;
    if (!Array.isArray(items)) return content;
    return items
      .map((item) => `${item.originalName}（${formatAttachmentSize(item.size)}）`)
      .join('、');
  } catch {
    return content;
  }
}
