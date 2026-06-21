import { formatAttachmentSize, getAttachmentAuditContentLabel } from './attachment-format';

describe('attachment formatting', () => {
  it('formats bytes as MiB with two decimal places', () => {
    expect(formatAttachmentSize(1572864)).toBe('1.50 MiB');
  });

  it('formats structured attachment audit content', () => {
    const content = JSON.stringify({
      attachments: [{ originalName: '證明.pdf', size: 1048576 }],
    });

    expect(getAttachmentAuditContentLabel(content, '新增附件')).toBe('證明.pdf（1.00 MiB）');
  });

  it('preserves legacy or malformed audit content', () => {
    expect(getAttachmentAuditContentLabel('legacy', '更新')).toBe('legacy');
    expect(getAttachmentAuditContentLabel('{invalid', '刪除附件')).toBe('{invalid');
  });
});
