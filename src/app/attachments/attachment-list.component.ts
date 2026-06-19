import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

import { AttachmentMetadata, MAX_ATTACHMENT_COUNT } from './attachment.models';
import { ATTACHMENT_ERROR_MESSAGES, validateAttachmentSelection } from '../utils/attachment-validation';
import { AttachmentPreviewDialogComponent } from './attachment-preview-dialog.component';

@Component({
  selector: 'app-attachment-list',
  standalone: true,
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './attachment-list.component.html',
  styleUrl: './attachment-list.component.scss',
})
export class AttachmentListComponent {
  @Input() attachments: readonly AttachmentMetadata[] = [];
  @Input() pendingFiles: readonly File[] = [];
  @Input() canManage = false;
  @Output() filesSelected = new EventEmitter<File[]>();
  @Output() pendingFileRemoved = new EventEmitter<File>();
  @Output() existingAttachmentRemoved = new EventEmitter<string>();
  error = '';
  readonly maxFiles = MAX_ATTACHMENT_COUNT;

  constructor(private readonly dialog: MatDialog) {}

  formatSize(bytes: number): string {
    return `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
  }

  async onSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
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
}
