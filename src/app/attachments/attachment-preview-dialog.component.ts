import { Component, Inject, OnDestroy, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { MAT_DIALOG_DATA, MatDialogClose, MatDialogContent, MatDialogTitle } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { firstValueFrom } from 'rxjs';

import { AttachmentMetadata } from './attachment.models';
import { AttachmentService } from '../services/attachment.service';

@Component({
  selector: 'app-attachment-preview-dialog',
  standalone: true,
  imports: [MatButtonModule, MatDialogClose, MatDialogTitle, MatDialogContent, MatProgressSpinnerModule],
  templateUrl: './attachment-preview-dialog.component.html',
  styleUrl: './attachment-preview-dialog.component.scss',
})
export class AttachmentPreviewDialogComponent implements OnInit, OnDestroy {
  objectUrl?: string;
  safeUrl?: SafeResourceUrl;
  loading = true;
  error = '';
  private loadGeneration = 0;

  constructor(
    @Inject(MAT_DIALOG_DATA) readonly data: { attachment?: AttachmentMetadata; file?: File },
    private readonly attachments: AttachmentService,
    private readonly sanitizer: DomSanitizer
  ) {}

  ngOnInit(): void { void this.load(); }

  async load(): Promise<void> {
    const generation = ++this.loadGeneration;
    this.revoke();
    this.loading = true;
    this.error = '';
    try {
      let blob: Blob;
      if (this.data.file) {
        blob = this.data.file;
      } else if (this.data.attachment) {
        blob = await firstValueFrom(this.attachments.loadPreview(this.data.attachment));
      } else {
        throw new Error('missing-attachment-preview-source');
      }
      if (generation !== this.loadGeneration) return;
      const previewBlob = this.withExpectedContentType(blob);
      this.objectUrl = URL.createObjectURL(previewBlob);
      this.safeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.objectUrl);
    } catch (error) {
      if (generation !== this.loadGeneration) return;
      console.error('附件預覽失敗', error);
      this.error = '附件暫時無法載入，請稍後重試。';
    } finally {
      if (generation === this.loadGeneration) this.loading = false;
    }
  }

  get contentType(): string { return this.data.file?.type ?? this.data.attachment?.contentType ?? ''; }
  get name(): string { return this.data.file?.name ?? this.data.attachment?.originalName ?? ''; }
  get isImage(): boolean { return this.contentType.startsWith('image/'); }

  ngOnDestroy(): void {
    ++this.loadGeneration;
    this.revoke();
  }

  private revoke(): void {
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = undefined;
    this.safeUrl = undefined;
  }

  private withExpectedContentType(blob: Blob): Blob {
    const expectedContentType = this.contentType;
    if (!expectedContentType || blob.type === expectedContentType) return blob;
    return new Blob([blob], { type: expectedContentType });
  }
}
