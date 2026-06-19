import { AttachmentListComponent } from './attachment-list.component';

describe('AttachmentListComponent', () => {
  function pdf(name: string): File {
    return new File(['%PDF-1.7'], name, { type: 'application/pdf' });
  }

  function selectionEvent(file: File): Event {
    return { target: { files: [file], value: 'selected' } } as unknown as Event;
  }

  it('allows a replacement after the parent filters the removed attachment', async () => {
    const component = new AttachmentListComponent({} as any);
    component.attachments = Array.from({ length: 4 }, (_, index) => ({ id: `a-${index}` } as any));
    const replacement = pdf('replacement.pdf');
    let emitted: File[] | undefined;
    component.filesSelected.subscribe((files) => emitted = files);

    await component.onSelected(selectionEvent(replacement));

    expect(component.error).toBe('');
    expect(emitted).toEqual([replacement]);
  });

  it('rejects a sixth attachment when none of the existing five is removed', async () => {
    const component = new AttachmentListComponent({} as any);
    component.attachments = Array.from({ length: 5 }, (_, index) => ({ id: `a-${index}` } as any));
    const emitted = jasmine.createSpy('filesSelected');
    component.filesSelected.subscribe(emitted);

    await component.onSelected(selectionEvent(pdf('sixth.pdf')));

    expect(component.error).toBe('每筆申請最多五個附件。');
    expect(emitted).not.toHaveBeenCalled();
  });
});
