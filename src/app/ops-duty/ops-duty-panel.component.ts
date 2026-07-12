import { CdkDrag, CdkDragHandle } from '@angular/cdk/drag-drop';
import { Component, inject, OnInit, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

import { DutyRoster, DutyRosterService } from './duty-roster.service';

@Component({
  selector: 'app-ops-duty-panel',
  standalone: true,
  imports: [CdkDrag, CdkDragHandle, MatIconModule],
  templateUrl: './ops-duty-panel.component.html',
  styleUrl: './ops-duty-panel.component.scss',
})
export class OpsDutyPanelComponent implements OnInit {
  private readonly rosterService = inject(DutyRosterService);

  readonly roster = signal<DutyRoster | null>(null);
  readonly loading = signal(true);
  readonly errorMessage = signal('');
  readonly visible = signal(true);

  ngOnInit(): void {
    void this.refresh();
  }

  async refresh(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set('');
    try {
      this.roster.set(await this.rosterService.loadToday());
    } catch (error) {
      this.roster.set(null);
      this.errorMessage.set(
        error instanceof Error ? error.message : '班表載入失敗，請稍後再試'
      );
    } finally {
      this.loading.set(false);
    }
  }

  close(): void {
    this.visible.set(false);
  }
}
