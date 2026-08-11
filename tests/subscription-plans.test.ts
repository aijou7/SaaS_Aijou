import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  ANNUAL_ACCESS_MONTHS,
  ANNUAL_BILLING_MONTHS,
  getAnnualMonthlyEquivalent,
  getAnnualPrice,
  getAnnualSavings,
  subscriptionPlans,
} from "../src/lib/subscription-plans";

describe("subscription plans", () => {
  test("annual access charges exactly ten monthly fees for twelve months", () => {
    assert.equal(ANNUAL_BILLING_MONTHS, 10);
    assert.equal(ANNUAL_ACCESS_MONTHS, 12);

    assert.deepEqual(
      subscriptionPlans.map((plan) => getAnnualPrice(plan.monthlyPrice)),
      [2_990_000, 6_990_000, 14_990_000],
    );
    assert.deepEqual(
      subscriptionPlans.map((plan) => getAnnualSavings(plan.monthlyPrice)),
      [598_000, 1_398_000, 2_998_000],
    );
    assert.equal(getAnnualMonthlyEquivalent(699_000), 582_500);
  });

  test("only Starter and Growth receive a thirty day free trial", () => {
    assert.deepEqual(
      subscriptionPlans.map(({ id, trialDays }) => ({ id, trialDays })),
      [
        { id: "starter", trialDays: 30 },
        { id: "growth", trialDays: 30 },
        { id: "business", trialDays: 0 },
      ],
    );
  });
});
