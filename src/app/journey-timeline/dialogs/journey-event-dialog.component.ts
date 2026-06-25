import { ChangeDetectionStrategy, Component, Inject, computed, signal } from '@angular/core';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogActions, MatDialogClose, MatDialogContent, MatDialogRef, MatDialogTitle } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

import { AttachmentMetadata } from '../../attachments/attachment.models';
import { AttachmentListComponent } from '../../attachments/attachment-list.component';
import {
  JourneyEventDialogData,
  JourneyEventDialogResult,
} from '../models/journey-timeline.models';

export function trimMaxLength(maxLength: number): ValidatorFn {
  return (control: AbstractControl<string>): ValidationErrors | null => {
    const value = control.value ?? '';
    return value.trim().length > maxLength
      ? { trimMaxLength: { requiredLength: maxLength, actualLength: value.trim().length } }
      : null;
  };
}

@Component({
  selector: 'app-journey-event-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogActions,
    MatDialogClose,
    MatDialogContent,
    MatDialogTitle,
    MatFormFieldModule,
    MatInputModule,
    AttachmentListComponent,
  ],
  templateUrl: './journey-event-dialog.component.html',
  styleUrl: './journey-event-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JourneyEventDialogComponent {
  readonly form = new FormGroup({
    eventDate: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    title: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/\S/), trimMaxLength(100)],
    }),
    content: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/\S/), trimMaxLength(5000)],
    }),
  });
  readonly pendingFiles = signal<File[]>([]);
  readonly removedAttachmentIds = signal<string[]>([]);
  readonly visibleAttachments = computed<AttachmentMetadata[]>(() => {
    const removed = new Set(this.removedAttachmentIds());
    return (this.data.event?.attachments ?? []).filter((item) => !removed.has(item.id));
  });

  constructor(
    @Inject(MAT_DIALOG_DATA) readonly data: JourneyEventDialogData,
    private readonly dialogRef: MatDialogRef<JourneyEventDialogComponent, JourneyEventDialogResult>
  ) {
    if (data.event) {
      const date = data.event.eventDate.toDate();
      this.form.setValue({
        eventDate: [
          date.getUTCFullYear(),
          String(date.getUTCMonth() + 1).padStart(2, '0'),
          String(date.getUTCDate()).padStart(2, '0'),
        ].join('-'),
        title: data.event.title,
        content: data.event.content,
      });
    }
  }

  addFiles(files: File[]): void {
    this.pendingFiles.update((current) => [...current, ...files]);
  }

  removePending(file: File): void {
    this.pendingFiles.update((current) => current.filter((item) => item !== file));
  }

  removeExisting(id: string): void {
    this.removedAttachmentIds.update((current) => current.includes(id) ? current : [...current, id]);
  }

  submit(): void {
    const raw = this.form.getRawValue();
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const title = raw.title.trim();
    const content = raw.content.trim();
    this.dialogRef.close({
      input: {
        targetUserId: this.data.targetUserId,
        eventDate: new Date(`${raw.eventDate}T00:00:00Z`),
        title,
        content,
      },
      files: this.pendingFiles(),
      removedAttachmentIds: this.removedAttachmentIds(),
    });
  }
}
