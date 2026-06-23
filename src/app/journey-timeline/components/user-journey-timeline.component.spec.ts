import { Timestamp } from '@angular/fire/firestore';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of } from 'rxjs';

import { SubsidyType } from '../../services/subsidy.service';
import { UserService } from '../../services/user.service';
import { JourneyTimelineItem } from '../models/journey-timeline.models';
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

describe('UserJourneyTimelineComponent', () => {
  function createComponent(): UserJourneyTimelineComponent {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: JourneyTimelineService, useValue: {} },
        { provide: JourneyEventService, useValue: {} },
        { provide: UserService, useValue: { currentUser$: of({ uid: 'admin' }) } },
        { provide: MatDialog, useValue: {} },
        { provide: MatSnackBar, useValue: {} },
      ],
    });
    return TestBed.runInInjectionContext(() => new UserJourneyTimelineComponent());
  }

  it('五種補助類型會對應不同 icon', () => {
    const component = createComponent();

    expect(component.timelineIcon(item('laptop', 1, SubsidyType.Laptop))).toBe('laptop_mac');
    expect(component.timelineIcon(item('health', 1, SubsidyType.HealthCheck))).toBe('health_and_safety');
    expect(component.timelineIcon(item('training', 1, SubsidyType.Training))).toBe('school');
    expect(component.timelineIcon(item('ai', 1, SubsidyType.AITool))).toBe('smart_toy');
    expect(component.timelineIcon(item('travel', 1, SubsidyType.Travel))).toBe('flight_takeoff');
  });

  it('事件使用事件 icon，未知補助使用 fallback icon', () => {
    const component = createComponent();

    expect(component.timelineIcon(item('event', 1))).toBe('event_note');
    expect(component.timelineIcon({ ...item('unknown', 1), source: 'subsidy', subsidyType: undefined })).toBe('payments');
  });

  it('依相鄰日期差距拉開垂直距離', () => {
    const component = createComponent();
    component.items.set([
      item('recent', Timestamp.fromDate(new Date('2026-06-23T00:00:00Z')).toMillis()),
      item('older', Timestamp.fromDate(new Date('2026-06-13T00:00:00Z')).toMillis()),
    ]);

    expect(component.timelineGap(0)).toBe(0);
    expect(component.timelineGap(1)).toBeGreaterThan(32);
  });
});
