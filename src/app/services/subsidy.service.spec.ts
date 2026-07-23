import {
  calculateLaptopSubsidyPlan,
  hasOutstandingLaptopInstallments,
} from './subsidy.service';

describe('laptop subsidy installments', () => {
  it('keeps an approved laptop application outstanding until every planned installment is recorded', () => {
    const plan = calculateLaptopSubsidyPlan(30000);

    expect(hasOutstandingLaptopInstallments(30000, 0)).toBeTrue();
    expect(
      hasOutstandingLaptopInstallments(
        30000,
        plan.installmentAmounts.length - 1
      )
    ).toBeTrue();
    expect(
      hasOutstandingLaptopInstallments(30000, plan.installmentAmounts.length)
    ).toBeFalse();
  });

  it('does not show applications without a payable laptop subsidy', () => {
    expect(hasOutstandingLaptopInstallments(0, 0)).toBeFalse();
  });
});
