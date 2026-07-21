import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { getSafeInternalRedirectPath } from "../src/lib/safe-navigation";
import { isTeamManagementEnabled } from "../src/lib/team-feature";

describe("safe internal navigation", () => {
  test("keeps internal paths with query strings", () => {
    assert.equal(
      getSafeInternalRedirectPath("/team/accept?token=abc_123"),
      "/team/accept?token=abc_123",
    );
    assert.equal(getSafeInternalRedirectPath(" /dashboard#today "), "/dashboard#today");
  });

  test("rejects external, protocol-relative, malformed, and oversized targets", () => {
    assert.equal(getSafeInternalRedirectPath("https://evil.example/team"), null);
    assert.equal(getSafeInternalRedirectPath("//evil.example/team"), null);
    assert.equal(getSafeInternalRedirectPath("/\\evil.example/team"), null);
    assert.equal(getSafeInternalRedirectPath("/team\n/accept"), null);
    assert.equal(getSafeInternalRedirectPath(`/${"x".repeat(2_048)}`), null);
    assert.equal(getSafeInternalRedirectPath(null), null);
  });
});

describe("team management feature gate", () => {
  test("is disabled by default and only accepts an explicit true value", () => {
    assert.equal(isTeamManagementEnabled(undefined), false);
    assert.equal(isTeamManagementEnabled("false"), false);
    assert.equal(isTeamManagementEnabled("1"), false);
    assert.equal(isTeamManagementEnabled(" true "), true);
  });
});
