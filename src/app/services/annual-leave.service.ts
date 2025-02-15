import { inject, Injectable } from '@angular/core';
import { differenceInDays } from 'date-fns';

import { LEAVE_POLICY_CONFIG } from '../tokens/leave-policy.token';

@Injectable({
  providedIn: 'root',
})
export class AnnualLeaveService {
  private readonly leavePolicy = inject(LEAVE_POLICY_CONFIG);

  constructor() {}

  reasonIdentity(yearsCompleted: number) {
    return `SYSADDWITH${yearsCompleted}YRS`;
  }

  calculateLeaveDaysAndYearsCompleted(
    startDate: Date,
    targetDate: Date = new Date()
  ) {
    const leaveDays = this.calculateLeaveDays(startDate, targetDate);
    let yearCompleted = this.calculateYearsOfService(startDate, targetDate);
    if (yearCompleted < 1 && leaveDays > 0) {
      yearCompleted = this.leavePolicy.policies.find(
        (policy) => policy.days == leaveDays
      )!.minimumYears;
    } else {
      yearCompleted = Math.floor(yearCompleted);
    }

    return { leaveDays, yearCompleted };
  }

  private calculateLeaveDays(
    startDate: Date,
    targetDate: Date = new Date()
  ): number {
    const yearsOfService = this.calculateYearsOfService(startDate, targetDate);
    return this.calculateAnnualLeaveByYears(yearsOfService);
  }

  private calculateYearsOfService(startDate: Date, currentDate: Date): number {
    const totalDays = differenceInDays(currentDate, startDate);
    return +(totalDays / 365.25).toFixed(2);
  }

  private calculateAnnualLeaveByYears(years: number): number {
    let baseDays = 0;

    for (const policy of this.leavePolicy.policies) {
      if (years >= policy.minimumYears) {
        baseDays = policy.days;
      }
    }

    if (
      this.leavePolicy.yearlyIncrease &&
      years > this.leavePolicy.yearlyIncrease.afterYears
    ) {
      const additionalDays = Math.floor(
        (years - this.leavePolicy.yearlyIncrease.afterYears) *
          this.leavePolicy.yearlyIncrease.daysPerYear
      );
      baseDays += additionalDays;
    }

    return Math.min(baseDays, this.leavePolicy.maxDays);
  }
}
