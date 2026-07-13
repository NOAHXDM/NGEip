import { CdkDrag, CdkDragHandle } from '@angular/cdk/drag-drop';
import { Component, inject, OnInit, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { firstValueFrom } from 'rxjs';

import {
  normalizeTelegramUsername,
  TELEGRAM_USERNAME_PATTERN,
  telegramProfileUrl,
  UserService,
} from '../services/user.service';
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
  private readonly userService = inject(UserService);

  readonly roster = signal<DutyRoster | null>(null);
  readonly loading = signal(true);
  readonly errorMessage = signal('');
  readonly visible = signal(true);
  readonly telegramByName = signal<Record<string, string>>({});

  ngOnInit(): void {
    void this.refresh();
  }

  async refresh(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set('');
    try {
      const [roster, users] = await Promise.all([
        this.rosterService.loadToday(),
        firstValueFrom(this.userService.list$).catch(() => []),
      ]);
      this.roster.set(roster);
      this.telegramByName.set(
        Object.fromEntries(
          users
            .map((user) => [
              user.name,
              normalizeTelegramUsername(user.telegramUsername),
            ])
            .filter((entry) => TELEGRAM_USERNAME_PATTERN.test(entry[1]))
        )
      );
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

  telegramUrl(name: string): string | null {
    return telegramProfileUrl(this.telegramByName()[name]);
  }
}
