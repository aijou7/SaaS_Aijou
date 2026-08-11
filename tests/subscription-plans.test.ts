import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { afterEach, describe, test } from "node:test";
import {
  getAnnualPrice,
  getPlanPrice,
  getSubscriptionPlan,
  normalizeBillingCycle,
  normalizePublicPlanId,
} from "../src/lib/subscription-plans";
import {
  isMidtransProduction,
  verifyMidtransSignature,
} from "../src/server/subscriptions/midtrans";

const originalServerKey = process.env.MIDTRANS_SERVER_KEY;
const originalEnvironment = process.env.MIDTRANS_ENVIRONMENT;

afterEach(() => {
  if (originalServerKey === undefined) delete process.env.MIDTRANS_SERVER_KEY;
  else process.env.MIDTRANS_SERVER_KEY = originalServerKey;
  if (originalEnvironment === undefined) delete process.env.MIDTRANS_ENVIRONMENT;
  else process.env.MIDTRANS_ENVIRONMENT = originalEnvironment;
});

describe("workspace subscription plans", () => {
  test("defaults invalid public selection safely to Starter monthly", () => {
    assert.equal(normalizePublicPlanId("unknown"), "starter");
    assert.equal(normalizeBillingCycle("weekly"), "monthly");
  });

  test("annual pricing charges ten months for twelve months of access", () => {
    const growth = getSubscriptionPlan("growth");
    assert.ok(growth);
    assert.equal(getPlanPrice("growth", "annual"), getAnnualPrice(growth.monthlyPrice));
    assert.equal(getPlanPrice("growth", "annual"), 6_990_000);
  });

  test("Business has no free trial while Starter and Growth do", () => {
    assert.equal(getSubscriptionPlan("starter")?.trialDays, 30);
    assert.equal(getSubscriptionPlan("growth")?.trialDays, 30);
    assert.equal(getSubscriptionPlan("business")?.trialDays, 0);
  });
});

describe("Midtrans notification verification", () => {
  test("accepts only the SHA-512 signature produced with the server key", () => {
    process.env.MIDTRANS_SERVER_KEY = "SB-Mid-server-test-secret";
    const payload = {
      order_id: "AIJOU-TEST-123",
      status_code: "200",
      gross_amount: "299000.00",
      signature_key: "",
    };
    payload.signature_key = createHash("sha512")
      .update(payload.order_id + payload.status_code + payload.gross_amount + process.env.MIDTRANS_SERVER_KEY)
      .digest("hex");
    assert.equal(verifyMidtransSignature(payload), true);
    assert.equal(verifyMidtransSignature({ ...payload, gross_amount: "1.00" }), false);
  });

  test("uses sandbox unless production is explicit", () => {
    process.env.MIDTRANS_ENVIRONMENT = "sandbox";
    assert.equal(isMidtransProduction(), false);
    process.env.MIDTRANS_ENVIRONMENT = "production";
    assert.equal(isMidtransProduction(), true);
  });
});
