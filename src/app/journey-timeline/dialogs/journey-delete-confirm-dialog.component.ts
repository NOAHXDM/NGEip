import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';

export interface JourneyDeleteConfirmDialogData {
  title: string;
}

@Component({
  selector: 'app-journey-delete-confirm-dialog',
  standalone: true,
  imports: [MatButtonModule, MatDialogModule],
  template: `
    <h2 mat-dialog-title>刪除事件</h2>
    <mat-dialog-content>
      確定要刪除事件「{{ data.title }}」嗎？此操作會移除時間軸中的事件與附件關聯。
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="close(false)">取消</button>
      <button mat-flat-button color="warn" type="button" (click)="close(true)">刪除</button>
    </mat-dialog-actions>
  `,
})
export class JourneyDeleteConfirmDialogComponent {
  readonly data = inject<JourneyDeleteConfirmDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject<MatDialogRef<JourneyDeleteConfirmDialogComponent, boolean>>(MatDialogRef);

  close(result: boolean): void {
    this.dialogRef.close(result);
  }
}
