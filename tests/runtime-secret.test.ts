import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  areCriticalRuntimeSecretsReady,
  isValidDataEncryptionKey,
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

  test("validates exact 32-byte data encryption keys", () => {
    assert.equal(isValidDataEncryptionKey(undefined), false);
    assert.equal(isValidDataEncryptionKey("too-short"), false);
    assert.equal(isValidDataEncryptionKey("A".repeat(43)), false);
    assert.equal(
      isValidDataEncryptionKey("f2da9a27a9ef4d64b14efeb7164af3a84cd426e63c9d1c01821a5e42f7c938b0"),
      true,
    );
    assert.equal(
      isValidDataEncryptionKey("MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY"),
      true,
    );
  });

  test("requires four strong and distinct production secrets", () => {
    const environment = {
      AUTH_SECRET: "auth-9fA3mK7qP2vX8nL4sD6cR1wY5zB0hJ",
      WIDGET_SIGNING_SECRET: "widget-4tG8pN2xQ7mV5kR9dL1sC6yH3bF0",
      CRON_SECRET: "cron-7zP3mX9qL5vK1dR8sN4hC2yG6bT0",
      DATA_ENCRYPTION_KEY: "f2da9a27a9ef4d64b14efeb7164af3a84cd426e63c9d1c01821a5e42f7c938b0",
    };
    assert.equal(areCriticalRuntimeSecretsReady(environment, true), true);
    assert.equal(
      areCriticalRuntimeSecretsReady(
        { ...environment, CRON_SECRET: environment.AUTH_SECRET },
        true,
      ),
      false,
    );
    assert.equal(
      areCriticalRuntimeSecretsReady(
        { ...environment, AUTH_SECRET: environment.DATA_ENCRYPTION_KEY },
        true,
      ),
      false,
    );
    assert.equal(areCriticalRuntimeSecretsReady({}, false), true);
  });
});
