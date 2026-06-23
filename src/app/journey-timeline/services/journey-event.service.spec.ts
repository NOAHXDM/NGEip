import { Timestamp } from '@angular/fire/firestore';

import { AttachmentMetadata } from '../../attachments/attachment.models';
import { mergeAttachmentChanges } from '../../services/attachment.service';

function attachment(id: string): AttachmentMetadata {
  return {
    id,
    storagePath: `journey-event-attachments/u/e/s/${id}`,
    originalName: `${id}.pdf`,
    contentType: 'application/pdf',
    size: 1,
    uploadedBy: 'u',
    uploadedAt: Timestamp.now(),
  };
}

describe('JourneyEvent attachment rules', () => {
  it('新增與刪除後產生正確最終集合', () => {
    const result = mergeAttachmentChanges(
      [attachment('a'), attachment('b')],
      ['a'],
      [attachment('c')]
    );
    expect(result.finalItems.map((item) => item.id)).toEqual(['b', 'c']);
    expect(result.removedItems.map((item) => item.id)).toEqual(['a']);
  });

  it('過期附件 ID 視為衝突', () => {
    expect(() => mergeAttachmentChanges([attachment('a')], ['missing'], []))
      .toThrowError('attachment-conflict');
  });

  it('最終附件不得超過五個', () => {
    const existing = ['a', 'b', 'c', 'd', 'e'].map(attachment);
    expect(() => mergeAttachmentChanges(existing, [], [attachment('f')]))
      .toThrowError('attachment-count-conflict');
  });
});

