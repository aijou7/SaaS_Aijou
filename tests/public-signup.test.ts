import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  isPublicSignupEnabled,
  isPublicSignupReady,
  normalizePublicSignupInput,
  PublicSignupError,
  publicSignupRateRules,
} from "../src/server/auth/public-signup-validation";

describe("public beta signup", () => {
  test("is enabled by default but supports an explicit kill switch", () => {
    assert.equal(isPublicSignupEnabled(undefined), true);
    assert.equal(isPublicSignupEnabled("true"), true);
    assert.equal(isPublicSignupEnabled("false"), false);
    assert.equal(isPublicSignupEnabled("OFF"), false);
    assert.equal(isPublicSignupEnabled("0"), false);
  });

  test("is ready only when signup and transactional email are both available", () => {
    assert.equal(isPublicSignupReady(true, undefined), true);
    assert.equal(isPublicSignupReady(false, undefined), false);
    assert.equal(isPublicSignupReady(true, "false"), false);
  });

  test("normalizes a valid isolated workspace registration", () => {
    assert.deepEqual(
      normalizePublicSignupInput({
        name: "  Aijou   Owner ",
        email: " OWNER@Example.COM ",
        phoneNumber: "+62 812-3456-7890",
        businessName: "  Aijou   Studio ",
      }),
      {
        name: "Aijou Owner",
        email: "owner@example.com",
        phoneNumber: "6281234567890",
        businessName: "Aijou Studio",
      },
    );
  });

  test("rejects malformed identity before database work", () => {
    assert.throws(
      () =>
        normalizePublicSignupInput({
          name: "A",
          email: "not-an-email",
          businessName: "X",
        }),
      PublicSignupError,
    );
  });

  test("uses both IP and email windows without a single-account IP cap", () => {
    assert.deepEqual(
      publicSignupRateRules.map(({ subject, max }) => [subject, max]),
      [
        ["ip", 8],
        ["ip", 30],
        ["email", 5],
        ["email", 10],
      ],
    );
  });
});
