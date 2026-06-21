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

  it('returns an empty string for missing content or an empty attachment list', () => {
    expect(getAttachmentAuditContentLabel(undefined, '新增附件')).toBe('');
    expect(getAttachmentAuditContentLabel('{"attachments":[]}', '新增附件')).toBe('');
  });

  it('omits malformed attachment items without rendering undefined or NaN', () => {
    const content = JSON.stringify({
      attachments: [null, {}, { originalName: '缺少大小.pdf' }, { originalName: '合法.pdf', size: 524288 }],
    });

    const result = getAttachmentAuditContentLabel(content, '刪除附件');
    expect(result).toBe('合法.pdf（0.50 MiB）');
    expect(result).not.toContain('undefined');
    expect(result).not.toContain('NaN');
  });

  it('preserves JSON whose root is null, an array, or another non-object value', () => {
    expect(getAttachmentAuditContentLabel('null', '新增附件')).toBe('null');
    expect(getAttachmentAuditContentLabel('[]', '新增附件')).toBe('[]');
    expect(getAttachmentAuditContentLabel('"legacy"', '新增附件')).toBe('"legacy"');
  });

  it('preserves the raw audit content when every attachment item is malformed', () => {
    const content = JSON.stringify({
      attachments: [null, {}, { originalName: '缺少大小.pdf' }],
    });

    expect(getAttachmentAuditContentLabel(content, '刪除附件')).toBe(content);
  });
});
