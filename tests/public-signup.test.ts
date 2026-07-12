import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  isPublicSignupEnabled,
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

  test("normalizes a valid isolated workspace registration", () => {
    assert.deepEqual(
      normalizePublicSignupInput({
        name: "  Aijou   Owner ",
        email: " OWNER@Example.COM ",
        phoneNumber: "+62 812-3456-7890",
        businessName: "  Aijou   Studio ",
        password: "BetaAijou2026!",
      }),
      {
        name: "Aijou Owner",
        email: "owner@example.com",
        phoneNumber: "6281234567890",
        businessName: "Aijou Studio",
        password: "BetaAijou2026!",
      },
    );
  });

  test("rejects malformed identity and weak passwords before database work", () => {
    assert.throws(
      () =>
        normalizePublicSignupInput({
          name: "A",
          email: "not-an-email",
          businessName: "X",
          password: "short",
        }),
      PublicSignupError,
    );

    assert.throws(
      () =>
        normalizePublicSignupInput({
          name: "Aijou Owner",
          email: "owner@example.com",
          businessName: "Aijou Studio",
          password: "password1234",
        }),
      /mudah ditebak/i,
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
