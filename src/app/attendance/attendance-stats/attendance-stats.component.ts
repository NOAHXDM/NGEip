import { Component, ViewChild } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import {
  MatChipListbox,
  MatChipSelectionChange,
  MatChipsModule,
} from '@angular/material/chips';

import { AttendanceStatsService } from '../../services/attendance-stats.service';
import { ClientPreferencesService } from '../../services/client-preferences.service';

@Component({
  selector: 'app-attendance-stats',
  standalone: true,
  imports: [MatCardModule, MatChipsModule],
  templateUrl: './attendance-stats.component.html',
  styleUrl: './attendance-stats.component.scss',
})
export class AttendanceStatsComponent {
  @ViewChild(MatChipListbox) chipList?: MatChipListbox;
  quickPickOptions: string[];
  quickPickOption: string;

  constructor(
    private clientPreferencesService: ClientPreferencesService,
    private attendanceStatsService: AttendanceStatsService
  ) {
    this.quickPickOptions =
      this.attendanceStatsService.getAllMonthsFromYear(2025);
    this.quickPickOption =
      this.clientPreferencesService.getPreference('statQuickPickOption') ||
      this.quickPickOptions[0];
  }

  ngAfterViewInit() {
    this.chipList?.chipSelectionChanges.subscribe({
      next: (change: MatChipSelectionChange) => {
        if (change.selected) {
          this.quickPickChanged(change.source.value);
        }
      },
    });
  }

  quickPickChanged(option: string) {
    this.clientPreferencesService.setPreference('statQuickPickOption', option);
  }
}
