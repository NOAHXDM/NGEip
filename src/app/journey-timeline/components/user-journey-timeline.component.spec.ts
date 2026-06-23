import { Timestamp } from '@angular/fire/firestore';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Subject, of } from 'rxjs';

import { SubsidyType } from '../../services/subsidy.service';
import { UserService } from '../../services/user.service';
import { JourneyEventDialogResult, JourneyTimelineItem, UserJourneyEvent } from '../models/journey-timeline.models';
import { JourneyEventService } from '../services/journey-event.service';
import { JourneyTimelineService } from '../services/journey-timeline.service';
import { UserJourneyTimelineComponent } from './user-journey-timeline.component';

function item(sourceId: string, millis: number, subsidyType?: SubsidyType): JourneyTimelineItem {
  return {
    source: subsidyType ? 'subsidy' : 'event',
    sourceId,
    occurredAt: Timestamp.fromMillis(millis),
    title: sourceId,
    subsidyType,
    attachments: [],
  };
}

function journeyEvent(): UserJourneyEvent {
  return {
    id: 'event-1',
    targetUserId: 'u1',
    eventDate: Timestamp.now(),
    title: '待刪事件',
    content: '內容',
    attachments: [],
    createdBy: 'admin',
    createdAt: Timestamp.now(),
    updatedBy: 'admin',
    updatedAt: Timestamp.now(),
    lastAuditId: 'audit-1',
    deleteAuditId: 'audit-delete',
  };
}

describe('UserJourneyTimelineComponent', () => {
  function createComponent(currentUser$ = of<{ uid?: string } | null>({ uid: 'admin' })) {
    const dialog = jasmine.createSpyObj<MatDialog>('MatDialog', ['open']);
    const events = jasmine.createSpyObj<JourneyEventService>('JourneyEventService', ['create', 'update', 'delete']);
    const timeline = jasmine.createSpyObj<JourneyTimelineService>('JourneyTimelineService', ['createSession', 'loadNext']);
    const snackBar = jasmine.createSpyObj<MatSnackBar>('MatSnackBar', ['open']);
    events.create.and.resolveTo('event-new');
    events.update.and.resolveTo();
    events.delete.and.resolveTo();
    timeline.createSession.and.returnValue({
      userId: 'u1',
      events: { buffer: [], done: true },
      subsidies: { buffer: [], done: true },
    });
    timeline.loadNext.and.resolveTo({ items: [], hasMore: false });
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: JourneyTimelineService, useValue: timeline },
        { provide: JourneyEventService, useValue: events },
        { provide: UserService, useValue: { currentUser$ } },
        { provide: MatDialog, useValue: dialog },
        { provide: MatSnackBar, useValue: snackBar },
      ],
    });
    return {
      component: TestBed.runInInjectionContext(() => new UserJourneyTimelineComponent()),
      dialog,
      events,
      snackBar,
      timeline,
    };
  }

  it('五種補助類型會對應不同 icon', () => {
    const { component } = createComponent();

    expect(component.timelineIcon(item('laptop', 1, SubsidyType.Laptop))).toBe('laptop_mac');
    expect(component.timelineIcon(item('health', 1, SubsidyType.HealthCheck))).toBe('health_and_safety');
    expect(component.timelineIcon(item('training', 1, SubsidyType.Training))).toBe('school');
    expect(component.timelineIcon(item('ai', 1, SubsidyType.AITool))).toBe('smart_toy');
    expect(component.timelineIcon(item('travel', 1, SubsidyType.Travel))).toBe('flight_takeoff');
  });

  it('事件使用事件 icon，未知補助使用 fallback icon', () => {
    const { component } = createComponent();

    expect(component.timelineIcon(item('event', 1))).toBe('event_note');
    expect(component.timelineIcon({ ...item('unknown', 1), source: 'subsidy', subsidyType: undefined })).toBe('payments');
  });

  it('依相鄰日期差距拉開垂直距離', () => {
    const { component } = createComponent();
    component.items.set([
      item('recent', Timestamp.fromDate(new Date('2026-06-23T00:00:00Z')).toMillis()),
      item('older', Timestamp.fromDate(new Date('2026-06-13T00:00:00Z')).toMillis()),
    ]);

    expect(component.timelineGap(0)).toBe(0);
    expect(component.timelineGap(1)).toBeGreaterThan(32);
  });

  it('相同時間軸項目會重用同一個隨機色碼結果', () => {
    const { component } = createComponent();
    const timelineItem = item('cached-color', 1);

    expect(component.timelineColor(timelineItem)).toBe(component.timelineColor(timelineItem));
  });

  it('刪除事件在 Material Dialog 取消時不會呼叫刪除服務', async () => {
    const { component, dialog, events } = createComponent();
    component.userId = 'u1';
    component.eventPermissions = { canCreate: true, canUpdate: true, canDelete: true };
    dialog.open.and.returnValue({ afterClosed: () => of(false) } as never);

    await component.deleteEvent(journeyEvent());

    expect(dialog.open).toHaveBeenCalled();
    expect(events.delete).not.toHaveBeenCalled();
  });

  it('登入狀態 emit null 時不會因讀取 uid 拋出錯誤，並提示稍後再試', async () => {
    const { component, dialog, snackBar } = createComponent(of(null));
    component.userId = 'u1';
    component.eventPermissions = { canCreate: true, canUpdate: true, canDelete: true };

    await component.openCreate();

    expect(dialog.open).not.toHaveBeenCalled();
    expect(snackBar.open).toHaveBeenCalledOnceWith('登入狀態確認中，請稍後再試。', '關閉', { duration: 3000 });
  });

  it('新增事件使用 firstValueFrom 等待 dialog 結果並送出', async () => {
    const closed$ = new Subject<JourneyEventDialogResult | undefined>();
    const { component, dialog, events } = createComponent();
    component.userId = 'u1';
    component.eventPermissions = { canCreate: true, canUpdate: true, canDelete: true };
    dialog.open.and.returnValue({ afterClosed: () => closed$.asObservable() } as never);
    const result: JourneyEventDialogResult = {
      input: {
        targetUserId: 'u1',
        eventDate: new Date('2026-06-23T00:00:00Z'),
        title: '新增事件',
        content: '內容',
      },
      files: [],
      removedAttachmentIds: [],
    };

    const pending = component.openCreate();
    closed$.next(result);
    closed$.complete();
    await pending;

    expect(events.create).toHaveBeenCalledOnceWith(result.input, 'admin', []);
  });

  it('編輯事件使用 firstValueFrom 等待 dialog 結果並送出', async () => {
    const closed$ = new Subject<JourneyEventDialogResult | undefined>();
    const { component, dialog, events } = createComponent();
    const event = journeyEvent();
    component.userId = 'u1';
    component.eventPermissions = { canCreate: true, canUpdate: true, canDelete: true };
    dialog.open.and.returnValue({ afterClosed: () => closed$.asObservable() } as never);
    const result: JourneyEventDialogResult = {
      input: {
        targetUserId: 'u1',
        eventDate: new Date('2026-06-24T00:00:00Z'),
        title: '更新事件',
        content: '新內容',
      },
      files: [],
      removedAttachmentIds: ['old-file'],
    };

    const pending = component.openEdit(event);
    closed$.next(result);
    closed$.complete();
    await pending;

    expect(events.update).toHaveBeenCalledOnceWith(event, result.input, 'admin', [], ['old-file']);
  });
});
