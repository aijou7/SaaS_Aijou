import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  autoRecoveryCooldownMs,
  claimAutomaticRecovery,
  getErrorDigest,
  getRuntimeErrorCode,
  sanitizeErrorReference,
  sanitizeRuntimePath,
} from "../src/lib/runtime-errors";

function memoryStorage() {
  const values = new Map<string, string>();

  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

describe("runtime error safety", () => {
  test("removes query data and redacts identifier-like path segments", () => {
    assert.equal(
      sanitizeRuntimePath(
        "https://app.example.com/reset-password/clxyz01234567890123456789?token=secret#private",
      ),
      "/reset-password/:id",
    );
    assert.equal(
      sanitizeRuntimePath("/conversations/123456789?access_token=secret"),
      "/conversations/:id",
    );
    assert.equal(sanitizeRuntimePath("/invite/short-secret"), "/invite/:id");
  });

  test("only accepts bounded digest characters", () => {
    assert.equal(sanitizeErrorReference(" 987654321 "), "987654321");
    assert.equal(sanitizeErrorReference("secret value\nnext-line"), "unavailable");
    assert.equal(getErrorDigest({ digest: "route-error:42" }), "route-error:42");
    assert.equal(getErrorDigest(new Error("sensitive message")), "unavailable");
  });

  test("extracts only a bounded machine-readable error code", () => {
    assert.equal(getRuntimeErrorCode({ code: "P2022" }), "P2022");
    assert.equal(getRuntimeErrorCode({ cause: { sqlState: "57P01" } }), "57P01");
    assert.equal(getRuntimeErrorCode({ code: "secret value\nnext-line" }), "unknown");
  });

  test("claims one automatic recovery per route and digest during the cooldown", () => {
    const storage = memoryStorage();
    const now = 2_000_000;

    assert.equal(claimAutomaticRecovery(storage, "/leads", "digest-1", now), true);
    assert.equal(claimAutomaticRecovery(storage, "/leads", "digest-1", now + 1_000), false);
    assert.equal(claimAutomaticRecovery(storage, "/leads", "digest-2", now + 1_000), true);
    assert.equal(
      claimAutomaticRecovery(storage, "/leads", "digest-1", now + autoRecoveryCooldownMs),
      true,
    );
  });

  test("fails closed when browser storage is unavailable", () => {
    const unavailableStorage = {
      getItem() {
        throw new Error("storage disabled");
      },
      setItem() {
        throw new Error("storage disabled");
      },
    };

    assert.equal(claimAutomaticRecovery(unavailableStorage, "/dashboard", "digest", 1), false);
  });
});
