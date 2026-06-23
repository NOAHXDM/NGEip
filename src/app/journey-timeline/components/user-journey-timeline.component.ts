import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, DestroyRef, Input, OnChanges, SimpleChanges, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';

import { AttachmentListComponent } from '../../attachments/attachment-list.component';
import { SubsidyType } from '../../services/subsidy.service';
import { UserService } from '../../services/user.service';
import { JourneyDeleteConfirmDialogComponent } from '../dialogs/journey-delete-confirm-dialog.component';
import { JourneyEventDialogComponent } from '../dialogs/journey-event-dialog.component';
import {
  JourneyEventDialogResult,
  JourneyEventPermissions,
  JourneyTimelineItem,
  UserJourneyEvent,
} from '../models/journey-timeline.models';
import { JourneyEventService } from '../services/journey-event.service';
import { JourneyTimelineService, JourneyTimelineSession } from '../services/journey-timeline.service';

@Component({
  selector: 'app-user-journey-timeline',
  standalone: true,
  imports: [
    DatePipe,
    DecimalPipe,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatDialogModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    AttachmentListComponent,
  ],
  templateUrl: './user-journey-timeline.component.html',
  styleUrl: './user-journey-timeline.component.scss',
})
export class UserJourneyTimelineComponent implements OnChanges {
  private static readonly TIMELINE_COLORS = [
    '#0891b2',
    '#ea580c',
    '#db2777',
    '#4f46e5',
    '#0f766e',
    '#7c3aed',
    '#ca8a04',
    '#0284c7',
  ] as const;
  private static readonly DAY_GAP_SCALE = 0.16;
  private static readonly MINIMUM_ITEM_GAP = 32;

  @Input({ required: true }) userId!: string;
  @Input({ required: true }) eventPermissions!: JourneyEventPermissions;

  readonly items = signal<JourneyTimelineItem[]>([]);
  readonly loading = signal(false);
  readonly loadingMore = signal(false);
  readonly hasMore = signal(false);
  readonly error = signal('');
  readonly eventActionPending = signal(false);
  private session?: JourneyTimelineSession;
  private actorUid = '';
  private readonly timelineColors = new Map<string, string>();
  private readonly destroyRef = inject(DestroyRef);
  private readonly timeline = inject(JourneyTimelineService);
  private readonly events = inject(JourneyEventService);
  private readonly users = inject(UserService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  constructor() {
    this.users.currentUser$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((user) => this.actorUid = user?.uid ?? '');
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['userId'] && this.userId) void this.reload();
  }

  async reload(): Promise<void> {
    this.session = this.timeline.createSession(this.userId);
    this.items.set([]);
    this.timelineColors.clear();
    this.hasMore.set(false);
    this.loading.set(true);
    this.error.set('');
    try {
      const page = await this.timeline.loadNext(this.session);
      this.items.set(page.items);
      this.hasMore.set(page.hasMore);
    } catch (error) {
      console.error('使用者歷程載入失敗', error);
      this.error.set('歷程資料暫時無法載入，請稍後重試。');
    } finally {
      this.loading.set(false);
    }
  }

  async loadMore(): Promise<void> {
    if (!this.session || this.loadingMore() || !this.hasMore()) return;
    this.loadingMore.set(true);
    this.error.set('');
    try {
      const page = await this.timeline.loadNext(this.session);
      this.items.update((items) => [...items, ...page.items]);
      this.hasMore.set(page.hasMore);
    } catch (error) {
      console.error('更早歷程載入失敗', error);
      this.error.set('更早的歷程暫時無法載入，請重試。');
    } finally {
      this.loadingMore.set(false);
    }
  }

  async openCreate(): Promise<void> {
    if (!this.eventPermissions.canCreate || this.eventActionPending()) return;
    const actorUid = this.requireActorUid();
    if (!actorUid) return;
    this.eventActionPending.set(true);
    try {
      const ref = this.dialog.open(JourneyEventDialogComponent, {
        data: { targetUserId: this.userId, actorUid, permissions: this.eventPermissions },
        width: '720px',
        maxWidth: '95vw',
      });
      const result = await firstValueFrom(ref.afterClosed());
      if (result) await this.createEvent(result, actorUid);
    } finally {
      this.eventActionPending.set(false);
    }
  }

  async openEdit(event: UserJourneyEvent): Promise<void> {
    if (!this.eventPermissions.canUpdate || this.eventActionPending()) return;
    const actorUid = this.requireActorUid();
    if (!actorUid) return;
    this.eventActionPending.set(true);
    try {
      const ref = this.dialog.open(JourneyEventDialogComponent, {
        data: { targetUserId: this.userId, actorUid, event, permissions: this.eventPermissions },
        width: '720px',
        maxWidth: '95vw',
      });
      const result = await firstValueFrom(ref.afterClosed());
      if (result) await this.updateEvent(event, result, actorUid);
    } finally {
      this.eventActionPending.set(false);
    }
  }

  async deleteEvent(event: UserJourneyEvent): Promise<void> {
    if (!this.eventPermissions.canDelete || this.eventActionPending()) return;
    const actorUid = this.requireActorUid();
    if (!actorUid) return;
    this.eventActionPending.set(true);
    try {
      const confirmed = await firstValueFrom(this.dialog
        .open(JourneyDeleteConfirmDialogComponent, {
          data: { title: event.title },
          width: '420px',
          maxWidth: '92vw',
        })
        .afterClosed());
      if (!confirmed) return;
      try {
        await this.events.delete(event, actorUid);
        this.snackBar.open('事件已刪除', '關閉', { duration: 3000 });
        await this.reload();
      } catch (error) {
        this.showError(error);
      }
    } finally {
      this.eventActionPending.set(false);
    }
  }

  statusLabel(status?: string): string {
    return status === 'approved' ? '已核准' : status === 'rejected' ? '已拒絕' : '審核中';
  }

  timelineIcon(item: JourneyTimelineItem): string {
    if (item.source === 'event') return 'event_note';
    switch (item.subsidyType) {
      case SubsidyType.Laptop:
        return 'laptop_mac';
      case SubsidyType.HealthCheck:
        return 'health_and_safety';
      case SubsidyType.Training:
        return 'school';
      case SubsidyType.AITool:
        return 'smart_toy';
      case SubsidyType.Travel:
        return 'flight_takeoff';
      default:
        return 'payments';
    }
  }

  timelineColor(item: JourneyTimelineItem): string {
    const key = `${item.source}:${item.sourceId}`;
    const cached = this.timelineColors.get(key);
    if (cached) return cached;
    let hash = 0;
    for (const character of key) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
    const color = UserJourneyTimelineComponent.TIMELINE_COLORS[
      Math.abs(hash) % UserJourneyTimelineComponent.TIMELINE_COLORS.length
    ];
    this.timelineColors.set(key, color);
    return color;
  }

  timelineGap(index: number): number {
    if (index === 0) return 0;
    const current = this.items()[index];
    const previous = this.items()[index - 1];
    if (!current || !previous) return UserJourneyTimelineComponent.MINIMUM_ITEM_GAP;
    const days = Math.abs(previous.occurredAt.toMillis() - current.occurredAt.toMillis()) / 86_400_000;
    return Math.round(
      UserJourneyTimelineComponent.MINIMUM_ITEM_GAP
      + days * UserJourneyTimelineComponent.DAY_GAP_SCALE
    );
  }

  private async createEvent(result: JourneyEventDialogResult, actorUid: string): Promise<void> {
    try {
      await this.events.create(result.input, actorUid, result.files);
      this.snackBar.open('事件已建立', '關閉', { duration: 3000 });
      await this.reload();
    } catch (error) {
      this.showError(error);
    }
  }

  private async updateEvent(event: UserJourneyEvent, result: JourneyEventDialogResult, actorUid: string): Promise<void> {
    try {
      await this.events.update(event, result.input, actorUid, result.files, result.removedAttachmentIds);
      this.snackBar.open('事件已更新', '關閉', { duration: 3000 });
      await this.reload();
    } catch (error) {
      this.showError(error);
    }
  }

  private showError(error: unknown): void {
    const message = error instanceof Error ? error.message : '操作失敗，請稍後重試。';
    this.snackBar.open(message, '關閉', { duration: 5000 });
  }

  private requireActorUid(): string | null {
    if (this.actorUid) return this.actorUid;
    this.snackBar.open('登入狀態確認中，請稍後再試。', '關閉', { duration: 3000 });
    return null;
  }
}
