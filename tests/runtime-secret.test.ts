import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  areCriticalRuntimeSecretsReady,
  isStrongRuntimeSecret,
} from "../src/lib/runtime-secret";

describe("runtime secret configuration", () => {
  test("rejects placeholders, short strings, and repeated characters", () => {
    assert.equal(isStrongRuntimeSecret("short"), false);
    assert.equal(isStrongRuntimeSecret("a".repeat(64)), false);
    assert.equal(
      isStrongRuntimeSecret("replace-with-at-least-32-random-bytes"),
      false,
    );
    assert.equal(
      isStrongRuntimeSecret("f2da9a27a9ef4d64b14efeb7164af3a84cd426e63c9d1c01"),
      true,
    );
  });

  test("requires three strong and distinct production secrets", () => {
    const environment = {
      AUTH_SECRET: "auth-9fA3mK7qP2vX8nL4sD6cR1wY5zB0hJ",
      WIDGET_SIGNING_SECRET: "widget-4tG8pN2xQ7mV5kR9dL1sC6yH3bF0",
      CRON_SECRET: "cron-7zP3mX9qL5vK1dR8sN4hC2yG6bT0",
    };
    assert.equal(areCriticalRuntimeSecretsReady(environment, true), true);
    assert.equal(
      areCriticalRuntimeSecretsReady(
        { ...environment, CRON_SECRET: environment.AUTH_SECRET },
        true,
      ),
      false,
    );
    assert.equal(areCriticalRuntimeSecretsReady({}, false), true);
  });
});
