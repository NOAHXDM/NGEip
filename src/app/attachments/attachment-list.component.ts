import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

import { AttachmentMetadata, MAX_ATTACHMENT_COUNT } from './attachment.models';
import { ATTACHMENT_ERROR_MESSAGES, validateAttachmentSelection } from '../utils/attachment-validation';
import { formatAttachmentSize } from '../utils/attachment-format';
import { AttachmentPreviewDialogComponent } from './attachment-preview-dialog.component';

@Component({
  selector: 'app-attachment-list',
  standalone: true,
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './attachment-list.component.html',
  styleUrl: './attachment-list.component.scss',
})
export class AttachmentListComponent {
  /** 父元件須先排除已標記刪除的正式附件，讓此清單直接代表儲存後仍保留的項目。 */
  @Input() attachments: readonly AttachmentMetadata[] = [];
  @Input() pendingFiles: readonly File[] = [];
  @Input() canManage = false;
  @Output() filesSelected = new EventEmitter<File[]>();
  @Output() pendingFileRemoved = new EventEmitter<File>();
  @Output() existingAttachmentRemoved = new EventEmitter<string>();
  error = '';
  readonly maxFiles = MAX_ATTACHMENT_COUNT;

  constructor(private readonly dialog: MatDialog) {}

  readonly formatSize = formatAttachmentSize;

  async onSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    // attachments 已由父元件排除標記刪除項，因此無需再扣除 removedCount。
    const errors = await validateAttachmentSelection(files, this.attachments.length + this.pendingFiles.length, 0);
    if (errors.size) {
      this.error = [...new Set([...errors.values()].map((e) => ATTACHMENT_ERROR_MESSAGES[e]))].join(' ');
      return;
    }
    this.error = '';
    this.filesSelected.emit(files);
  }

  previewAttachment(attachment: AttachmentMetadata): void {
    this.dialog.open(AttachmentPreviewDialogComponent, { data: { attachment }, width: '80vw', maxWidth: '900px' });
  }

  previewFile(file: File): void {
    this.dialog.open(AttachmentPreviewDialogComponent, { data: { file }, width: '80vw', maxWidth: '900px' });
  }

  removePending(file: File): void {
    this.pendingFileRemoved.emit(file);
  }

  removeExisting(id: string): void {
    this.existingAttachmentRemoved.emit(id);
  }
}
