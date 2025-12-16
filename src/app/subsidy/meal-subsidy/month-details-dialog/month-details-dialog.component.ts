import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';

import { UserMealStats } from '../../../services/meal-subsidy.service';

@Component({
  selector: 'app-month-details-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatTableModule, MatIconModule],
  templateUrl: './month-details-dialog.component.html',
  styleUrl: './month-details-dialog.component.scss',
})
export class MonthDetailsDialogComponent {
  displayedColumns: string[] = ['date', 'amount'];

  constructor(@Inject(MAT_DIALOG_DATA) public data: { stats: UserMealStats }) {}
}
