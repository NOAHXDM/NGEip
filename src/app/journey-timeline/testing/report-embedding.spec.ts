import { Component, Input } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { of } from 'rxjs';

import { UserAttributeReportEmbedComponent } from '../../evaluation/components/user-attribute-report-embed/user-attribute-report-embed.component';
import { AttributeReportComponent } from '../../evaluation/pages/attribute-report/attribute-report.component';
import { EvaluationCycleService } from '../../evaluation/services/evaluation-cycle.service';
import { UserAttributeSnapshotService } from '../../evaluation/services/user-attribute-snapshot.service';
import { CareerArchetypeBadgeComponent } from '../../evaluation/components/career-archetype-badge/career-archetype-badge.component';
import { RadarChartComponent } from '../../evaluation/components/radar-chart/radar-chart.component';
import { TrendLineChartComponent } from '../../evaluation/components/trend-line-chart/trend-line-chart.component';
import { User } from '../../services/user.service';
import { UserService } from '../../services/user.service';
import { JourneyEventPermissions } from '../models/journey-timeline.models';
import { UserJourneyTimelineComponent } from '../components/user-journey-timeline.component';

@Component({
  selector: 'app-user-journey-timeline',
  standalone: true,
  template: '<section class="timeline-probe"></section>',
})
class FakeUserJourneyTimelineComponent {
  @Input({ required: true }) userId = '';
  @Input({ required: true }) eventPermissions!: JourneyEventPermissions;
}

@Component({
  selector: 'app-radar-chart',
  standalone: true,
  template: '',
})
class FakeRadarChartComponent {
  @Input() axes: unknown;
  @Input() maxValue: unknown;
  @Input() size: unknown;
  @Input() showWarning: unknown;
}

@Component({
  selector: 'app-trend-line-chart',
  standalone: true,
  template: '',
})
class FakeTrendLineChartComponent {
  @Input() data: unknown;
  @Input() width: unknown;
  @Input() height: unknown;
  @Input() selectedCycleLabel: unknown;
}

@Component({
  selector: 'app-career-archetype-badge',
  standalone: true,
  template: '',
})
class FakeCareerArchetypeBadgeComponent {
  @Input() archetypes: unknown;
}

describe('report timeline embedding regression', () => {
  const snapshotService = jasmine.createSpyObj<UserAttributeSnapshotService>(
    'UserAttributeSnapshotService',
    ['getMySnapshots', 'getSnapshotsByUserId']
  );
  const cycleService = jasmine.createSpyObj<EvaluationCycleService>('EvaluationCycleService', ['getCycles']);
  const userService = {
    currentUser$: of({ uid: 'current-user', role: 'user' } as User),
  };

  beforeEach(() => {
    snapshotService.getMySnapshots.calls.reset();
    snapshotService.getSnapshotsByUserId.calls.reset();
    cycleService.getCycles.calls.reset();
    snapshotService.getMySnapshots.and.returnValue(of([]));
    snapshotService.getSnapshotsByUserId.and.returnValue(of([]));
    cycleService.getCycles.and.returnValue(of([]));
  });

  it('shows the personal timeline outside the empty snapshot state with read-only permissions', async () => {
    await configureTestingModule(AttributeReportComponent);
    const fixture = TestBed.createComponent(AttributeReportComponent);

    fixture.detectChanges();

    const timeline = findTimeline(fixture);
    expect(timeline.userId).toBe('current-user');
    expect(timeline.eventPermissions).toEqual({
      canCreate: false,
      canUpdate: false,
      canDelete: false,
    });
    expect(fixture.nativeElement.textContent).toContain('尚無考核歷史資料');
  });

  it('passes the edited user id and admin permissions in the embedded admin report tab', async () => {
    await configureTestingModule(UserAttributeReportEmbedComponent);
    const fixture = TestBed.createComponent(UserAttributeReportEmbedComponent);
    fixture.componentRef.setInput('userId', 'edited-user');

    fixture.detectChanges();

    const timeline = findTimeline(fixture);
    expect(timeline.userId).toBe('edited-user');
    expect(timeline.eventPermissions).toEqual({
      canCreate: true,
      canUpdate: true,
      canDelete: true,
    });
    expect(fixture.nativeElement.textContent).toContain('尚無考核歷史資料');
  });

  async function configureTestingModule(
    component: typeof AttributeReportComponent | typeof UserAttributeReportEmbedComponent
  ): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [component],
      providers: [
        { provide: UserAttributeSnapshotService, useValue: snapshotService },
        { provide: EvaluationCycleService, useValue: cycleService },
        { provide: UserService, useValue: userService },
      ],
    })
      .overrideComponent(component, {
        remove: {
          imports: [
            UserJourneyTimelineComponent,
            RadarChartComponent,
            TrendLineChartComponent,
            CareerArchetypeBadgeComponent,
          ],
        },
        add: {
          imports: [
            FakeUserJourneyTimelineComponent,
            FakeRadarChartComponent,
            FakeTrendLineChartComponent,
            FakeCareerArchetypeBadgeComponent,
          ],
        },
      })
      .compileComponents();
  }

  function findTimeline<T>(fixture: ComponentFixture<T>): FakeUserJourneyTimelineComponent {
    const debugElement = fixture.debugElement.query(By.directive(FakeUserJourneyTimelineComponent));
    expect(debugElement).withContext('timeline component should be rendered').not.toBeNull();
    return debugElement.componentInstance as FakeUserJourneyTimelineComponent;
  }
});
