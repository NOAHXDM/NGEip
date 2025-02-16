import { AsyncPipe } from '@angular/common';
import { AfterViewInit, Component, Inject, inject, ViewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatListModule, MatSelectionList } from '@angular/material/list';
import { filter } from 'rxjs';

import { ClientPreferencesService } from '../../services/client-preferences.service';
import { UserService } from '../../services/user.service';

@Component({
  selector: 'app-attendance-filter-requester',
  standalone: true,
  imports: [AsyncPipe, MatDialogModule, MatListModule],
  templateUrl: './attendance-filter-requester.component.html',
  styleUrl: './attendance-filter-requester.component.scss',
})
export class AttendanceFilterRequesterComponent implements AfterViewInit {
  readonly list$ = inject(UserService).list$;
  @ViewChild(MatSelectionList) selectionList?: MatSelectionList;

  constructor(
    private dialogRef: MatDialogRef<AttendanceFilterRequesterComponent>,
    private clientPreferencesService: ClientPreferencesService,
    @Inject(MAT_DIALOG_DATA) protected data: any
  ) {
    // Close dialog on escape key
    this.dialogRef
      .keydownEvents()
      .pipe(
        filter((event) => event.key === 'Escape'),
        takeUntilDestroyed()
      )
      .subscribe({
        next: () => this.close(),
      });
    // Close dialog on backdrop click
    this.dialogRef
      .backdropClick()
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: () => this.close(),
      });
  }

  close() {
    const selected = this.selectionList?._value;
    this.clientPreferencesService.setPreference(
      'filterRequesters',
      JSON.stringify(selected)
    );
    this.dialogRef.close(selected);
  }

  ngAfterViewInit() {
    // Avoid NG0100: Expression has side effects
    setTimeout(() => {
      this.selectionList?.writeValue(this.data.requesters);
    });
  }
}
