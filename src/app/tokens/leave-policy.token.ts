import { InjectionToken } from '@angular/core';

export const LEAVE_POLICY_CONFIG = new InjectionToken<LeavePolicyConfig>(
  'LEAVE_POLICY_CONFIG'
);

export const TAIWAN_POLICY: LeavePolicyConfig = {
  policies: [
    { minimumYears: 0.25, days: 3 },
    { minimumYears: 1, days: 7 },
    { minimumYears: 2, days: 10 },
    { minimumYears: 3, days: 14 },
    { minimumYears: 5, days: 15 },
  ],
  maxDays: 30,
  yearlyIncrease: {
    afterYears: 10,
    daysPerYear: 1,
  },
};

export interface LeavePolicy {
  minimumYears: number;
  days: number;
}

export interface LeavePolicyConfig {
  policies: LeavePolicy[];
  maxDays: number;
  yearlyIncrease?: {
    afterYears: number;
    daysPerYear: number;
  };
}
