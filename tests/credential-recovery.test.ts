import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  readCredentialSnapshot,
  requireCompleteCredentialReplacement,
} from "../src/server/integrations/credential-recovery";

describe("integration credential recovery", () => {
  test("keeps a readable credential snapshot", () => {
    const snapshot = readCredentialSnapshot(
      () => ({ token: "readable" }),
      { token: null as string | null },
    );

    assert.deepEqual(snapshot, {
      value: { token: "readable" },
      recoveryRequired: false,
    });
  });

  test("discards an unreadable credential snapshot", () => {
    const cleared = { token: null as string | null, isActive: false };
    const snapshot = readCredentialSnapshot(() => {
      throw new Error("ciphertext failure");
    }, cleared);

    assert.deepEqual(snapshot, { value: cleared, recoveryRequired: true });
  });

  test("requires every replacement field only during recovery", () => {
    assert.throws(
      () => requireCompleteCredentialReplacement(true, ["new-token", ""], "replace all"),
      /replace all/,
    );
    assert.doesNotThrow(() =>
      requireCompleteCredentialReplacement(true, ["new-token", "new-secret"], "replace all"),
    );
    assert.doesNotThrow(() =>
      requireCompleteCredentialReplacement(false, [null, undefined], "replace all"),
    );
  });
});
