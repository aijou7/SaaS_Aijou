import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { getSessionCookieClearOptions } from "../src/lib/session-cookie";

describe("session cookie lifecycle", () => {
  test("expires the production __Host cookie with attributes browsers accept", () => {
    const options = getSessionCookieClearOptions(
      "__Host-aijou_session",
      "production",
    );

    assert.equal(options.secure, true);
    assert.equal(options.path, "/");
    assert.equal(options.httpOnly, true);
    assert.equal(options.sameSite, "lax");
    assert.equal(options.maxAge, 0);
    assert.equal(options.expires.getTime(), 0);
  });

  test("keeps __Host deletion secure even in a local environment", () => {
    assert.equal(
      getSessionCookieClearOptions("__Host-aijou_session", "development").secure,
      true,
    );
    assert.equal(
      getSessionCookieClearOptions("aijou_session", "development").secure,
      false,
    );
  });
});
