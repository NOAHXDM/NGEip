import { MAX_ATTACHMENT_BYTES } from '../attachments/attachment.models';
import { validateAttachmentFile, validateAttachmentSelection } from './attachment-validation';

describe('attachment validation', () => {
  const file = (bytes: number[], name: string, type: string, size?: number) =>
    new File([new Uint8Array(size ? Array(size).fill(bytes[0] ?? 0) : bytes)], name, { type });

  it('接受四種合法簽章', async () => {
    const cases = [
      file([0x25, 0x50, 0x44, 0x46, 0x2d], 'a.pdf', 'application/pdf'),
      file([0xff, 0xd8, 0xff], 'a.jpeg', 'image/jpeg'),
      file([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'a.png', 'image/png'),
      file([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50], 'a.webp', 'image/webp'),
    ];
    for (const value of cases) expect(await validateAttachmentFile(value)).toBeNull();
  });

  it('拒絕偽造內容', async () => {
    expect(await validateAttachmentFile(file([1, 2, 3], 'a.pdf', 'application/pdf'))).toBe('signature-mismatch');
  });

  it('允許 3 MiB 並拒絕多一位元組', async () => {
    const jpeg = (size: number) => new File([
      new Uint8Array([0xff, 0xd8, 0xff]),
      new Uint8Array(size - 3),
    ], 'a.jpg', { type: 'image/jpeg' });
    expect(await validateAttachmentFile(jpeg(MAX_ATTACHMENT_BYTES))).toBeNull();
    expect(await validateAttachmentFile(jpeg(MAX_ATTACHMENT_BYTES + 1))).toBe('file-too-large');
  });

  it('以最終數量限制五檔並允許五換一', async () => {
    const f = file([0x25, 0x50, 0x44, 0x46, 0x2d], 'a.pdf', 'application/pdf');
    expect((await validateAttachmentSelection([f], 5, 1)).size).toBe(0);
    expect((await validateAttachmentSelection([f], 5, 0)).get(f)).toBe('too-many-files');
  });
});
