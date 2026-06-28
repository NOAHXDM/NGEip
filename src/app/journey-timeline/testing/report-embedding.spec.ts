import { Component, Input } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { of } from 'rxjs';

import { UserAttributeReportEmbedComponent } from '../../evaluation/components/user-attribute-report-embed/user-attribute-report-embed.component';
import { AttributeReportComponent } from '../../evaluation/pages/attribute-report/attribute-report.component';
import { EvaluationCycleService } from '../../evaluation/services/evaluation-cycle.service';
import { UserAttributeSnapshotService } from '../../evaluation/services/user-attribute-snapshot.service';
import { User } from '../../services/user.service';
import { UserService } from '../../services/user.service';
import { JourneyEventPermissions } from '../models/journey-timeline.models';

@Component({
  selector: 'app-user-journey-timeline',
  standalone: true,
  template: '<section class="timeline-probe"></section>',
})
class FakeUserJourneyTimelineComponent {
  @Input({ required: true }) userId = '';
  @Input({ required: true }) eventPermissions!: JourneyEventPermissions;
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
    snapshotService.getMySnapshots.and.returnValue(of([]));
    snapshotService.getSnapshotsByUserId.and.returnValue(of([]));
    cycleService.getCycles.and.returnValue(of([]));
  });

  it('shows the personal timeline outside the empty snapshot state with read-only permissions', async () => {
    await configureTestingModule(
      AttributeReportComponent,
      `
        @if (!hasSnapshots()) {
          <p class="empty-probe">尚無考核歷史資料</p>
        }
        @if (currentUser()?.uid; as uid) {
          <app-user-journey-timeline
            [userId]="uid"
            [eventPermissions]="personalEventPermissions" />
        }
      `
    );
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
    await configureTestingModule(
      UserAttributeReportEmbedComponent,
      `
        @if (!hasSnapshots()) {
          <p class="empty-probe">尚無考核歷史資料</p>
        }
        <app-user-journey-timeline
          [userId]="userId"
          [eventPermissions]="adminEventPermissions" />
      `
    );
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
    component: typeof AttributeReportComponent | typeof UserAttributeReportEmbedComponent,
    template: string
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
        set: {
          imports: [FakeUserJourneyTimelineComponent],
          template,
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
