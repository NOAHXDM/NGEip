import { Component, Inject, OnDestroy, OnInit } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { MAT_DIALOG_DATA, MatDialogContent, MatDialogTitle } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { firstValueFrom } from 'rxjs';

import { AttachmentMetadata } from './attachment.models';
import { AttachmentService } from '../services/attachment.service';

@Component({
  selector: 'app-attachment-preview-dialog',
  standalone: true,
  imports: [MatDialogTitle, MatDialogContent, MatProgressSpinnerModule],
  templateUrl: './attachment-preview-dialog.component.html',
  styleUrl: './attachment-preview-dialog.component.scss',
})
export class AttachmentPreviewDialogComponent implements OnInit, OnDestroy {
  objectUrl?: string;
  safeUrl?: SafeResourceUrl;
  loading = true;
  error = '';

  constructor(
    @Inject(MAT_DIALOG_DATA) readonly data: { attachment?: AttachmentMetadata; file?: File },
    private readonly attachments: AttachmentService,
    private readonly sanitizer: DomSanitizer
  ) {}

  ngOnInit(): void { void this.load(); }

  async load(): Promise<void> {
    this.revoke();
    this.loading = true;
    this.error = '';
    try {
      const blob = this.data.file ?? await firstValueFrom(this.attachments.loadPreview(this.data.attachment!));
      this.objectUrl = URL.createObjectURL(blob);
      this.safeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.objectUrl);
    } catch (error) {
      console.error('附件預覽失敗', error);
      this.error = '附件暫時無法載入，請稍後重試。';
    } finally {
      this.loading = false;
    }
  }

  get contentType(): string { return this.data.file?.type ?? this.data.attachment?.contentType ?? ''; }
  get name(): string { return this.data.file?.name ?? this.data.attachment?.originalName ?? ''; }
  get isImage(): boolean { return this.contentType.startsWith('image/'); }

  ngOnDestroy(): void { this.revoke(); }

  private revoke(): void {
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = undefined;
    this.safeUrl = undefined;
  }
}
