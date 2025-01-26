import { Component } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';

import { AttendanceStatsService } from '../../services/attendance-stats.service';

@Component({
  selector: 'app-attendance-stats',
  standalone: true,
  imports: [MatCardModule, MatChipsModule],
  templateUrl: './attendance-stats.component.html',
  styleUrl: './attendance-stats.component.scss',
})
export class AttendanceStatsComponent {
  quickPickOptions: string[];
  quickPickOption: string = '2025-01';

  constructor(private attendanceStatsService: AttendanceStatsService) {
    this.quickPickOptions = this.attendanceStatsService.getAllMonthByToday();
  }
}
