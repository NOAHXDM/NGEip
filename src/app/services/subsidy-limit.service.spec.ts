import { TestBed } from '@angular/core/testing';
import { Firestore, Timestamp } from '@angular/fire/firestore';
import { of } from 'rxjs';
import {
  calculateTrainingAiSharedQuota,
  SubsidyLimitService,
  TRAINING_AI_SHARED_LIMIT,
} from './subsidy-limit.service';
import { SubsidyStatsService } from './subsidy-stats.service';
import { SubsidyType } from './subsidy.service';

describe('Training + AI Tool shared quota', () => {
  it('uses one 24,000 pool for both subsidy types', () => {
    const quota = calculateTrainingAiSharedQuota(4000, 8000);

    expect(quota).toEqual({
      totalLimit: TRAINING_AI_SHARED_LIMIT,
      usedAmount: 12000,
      availableAmount: 12000,
      trainingUsedAmount: 4000,
      aiToolUsedAmount: 8000,
    });
  });

  it('allows AI Tool to consume more than the removed 10,000 sublimit', () => {
    const quota = calculateTrainingAiSharedQuota(0, 20000);

    expect(quota.usedAmount).toBe(20000);
    expect(quota.availableAmount).toBe(4000);
  });

  it('allows Training to consume the remaining amount after AI Tool usage', () => {
    const quota = calculateTrainingAiSharedQuota(14000, 10000);

    expect(quota.usedAmount).toBe(24000);
    expect(quota.availableAmount).toBe(0);
  });

  it('clamps the available amount to zero when approved usage exceeds the pool', () => {
    const quota = calculateTrainingAiSharedQuota(18000, 8000);

    expect(quota.usedAmount).toBe(26000);
    expect(quota.availableAmount).toBe(0);
  });

  it('returns one combined card instead of a separate AI Tool card', (done) => {
    const statsService = {
      getUserAllSubsidyStats: () =>
        of({
          userId: 'user-1',
          totalAmount: 12000,
          totalCount: 2,
          byType: [
            { type: SubsidyType.Laptop, totalAmount: 0, count: 0, applications: [] },
            { type: SubsidyType.HealthCheck, totalAmount: 0, count: 0, applications: [] },
            { type: SubsidyType.Training, totalAmount: 4000, count: 1, applications: [] },
            { type: SubsidyType.AITool, totalAmount: 8000, count: 1, applications: [] },
            { type: SubsidyType.Travel, totalAmount: 0, count: 0, applications: [] },
          ],
        }),
      getUserSubsidyStatsByType: () =>
        of({
          type: SubsidyType.HealthCheck,
          totalAmount: 0,
          count: 0,
          applications: [],
        }),
    };

    TestBed.configureTestingModule({
      providers: [
        SubsidyLimitService,
        { provide: SubsidyStatsService, useValue: statsService },
        { provide: Firestore, useValue: {} },
      ],
    });

    const service = TestBed.inject(SubsidyLimitService);
    spyOn(service, 'getUserLaptopInstallmentStatus').and.returnValue(
      of({
        totalReceivedAmount: 0,
        totalReceivedCount: 0,
        hasOngoingApplication: false,
        ongoingApplicationInfo: null,
      })
    );

    service
      .getUserSubsidyLimitStatus(
        'user-1',
        Timestamp.fromDate(new Date(2020, 0, 1))
      )
      .subscribe((status) => {
        const sharedCard = status.subsidies.find(
          (subsidy) => subsidy.type === SubsidyType.Training
        );

        expect(sharedCard?.displayName).toBe('Training + AI Tool');
        expect(sharedCard?.usedAmount).toBe(12000);
        expect(sharedCard?.availableAmount).toBe(12000);
        expect(
          status.subsidies.some(
            (subsidy) => subsidy.type === SubsidyType.AITool
          )
        ).toBeFalse();
        done();
      });
  });
});
