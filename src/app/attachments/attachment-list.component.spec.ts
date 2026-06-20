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

  it('shows a format error and emits nothing for a file without an extension', async () => {
    const component = new AttachmentListComponent({} as any);
    const emitted = jasmine.createSpy('filesSelected');
    component.filesSelected.subscribe(emitted);

    await component.onSelected(selectionEvent(pdf('receipt')));

    expect(component.error).toBe('僅支援 PDF、JPEG、PNG、WebP 檔案。');
    expect(emitted).not.toHaveBeenCalled();
  });

  it('emits pending and existing removal events in request order', () => {
    const component = new AttachmentListComponent({} as any);
    const pending = pdf('pending.pdf');
    const events: string[] = [];
    component.pendingFileRemoved.subscribe((file) => events.push(`pending:${file.name}`));
    component.existingAttachmentRemoved.subscribe((id) => events.push(`existing:${id}`));

    component.removePending(pending);
    component.removeExisting('formal-1');

    expect(events).toEqual(['pending:pending.pdf', 'existing:formal-1']);
  });

  it('opens the correct preview source for formal and pending attachments', () => {
    const dialog = { open: jasmine.createSpy('open') };
    const component = new AttachmentListComponent(dialog as any);
    const formal = { id: 'formal', originalName: 'formal.pdf' } as any;
    const pending = pdf('pending.pdf');

    component.previewAttachment(formal);
    component.previewFile(pending);

    expect(dialog.open.calls.argsFor(0)[1].data).toEqual({ attachment: formal });
    expect(dialog.open.calls.argsFor(1)[1].data).toEqual({ file: pending });
  });
});
