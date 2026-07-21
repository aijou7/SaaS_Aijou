import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  executeDatabaseOperationWithReadRetry,
  getTransientDatabaseErrorCode,
  isRetryableDatabaseReadOperation,
  isTransientDatabaseError,
  runInDatabaseTransactionContext,
} from "../src/lib/database-read-retry";

function transientError(code = "P1001") {
  return Object.assign(new Error("temporary database failure"), { code });
}

describe("database read retry classification", () => {
  test("recognizes safe Prisma reads and excludes every write/raw execute", () => {
    for (const operation of [
      "findUnique",
      "findFirst",
      "findMany",
      "count",
      "aggregate",
      "groupBy",
      "rawRead",
    ]) {
      assert.equal(isRetryableDatabaseReadOperation(operation), true, operation);
    }

    for (const operation of [
      "create",
      "createMany",
      "update",
      "updateMany",
      "upsert",
      "delete",
      "deleteMany",
      "$executeRaw",
      "$executeRawUnsafe",
      "$queryRaw",
      "$queryRawUnsafe",
    ]) {
      assert.equal(isRetryableDatabaseReadOperation(operation), false, operation);
    }
  });

  test("recognizes Prisma, nested adapter, PostgreSQL, and network transients", () => {
    assert.equal(isTransientDatabaseError(transientError("P2024")), true);
    assert.equal(
      getTransientDatabaseErrorCode({
        meta: {
          driverAdapterError: {
            cause: { originalCode: "57P03" },
          },
        },
      }),
      "57P03",
    );
    assert.equal(isTransientDatabaseError({ code: "ECONNRESET" }), true);
    assert.equal(
      isTransientDatabaseError(
        new Error("Timed out fetching a new connection from the connection pool"),
      ),
      true,
    );
  });

  test("does not classify validation, auth, or data conflicts as transient", () => {
    assert.equal(isTransientDatabaseError(transientError("P2002")), false);
    assert.equal(isTransientDatabaseError(transientError("28P01")), false);
    assert.equal(isTransientDatabaseError(new Error("column does not exist")), false);
  });
});

describe("database read retry behavior", () => {
  test("retries a transient read with bounded exponential backoff", async () => {
    let calls = 0;
    const delays: number[] = [];
    const result = await executeDatabaseOperationWithReadRetry(
      "findMany",
      async () => {
        calls += 1;

        if (calls < 3) {
          throw transientError();
        }

        return "recovered";
      },
      {
        baseDelayMs: 100,
        maxAttempts: 3,
        maxDelayMs: 1_000,
        random: () => 1,
        sleep: async (delayMs) => {
          delays.push(delayMs);
        },
      },
    );

    assert.equal(result, "recovered");
    assert.equal(calls, 3);
    assert.deepEqual(delays, [100, 200]);
  });

  test("does not retry writes, raw execution, or non-transient failures", async () => {
    for (const [operation, error] of [
      ["update", transientError()],
      ["$executeRaw", transientError()],
      ["findMany", transientError("P2002")],
    ] as const) {
      let calls = 0;

      await assert.rejects(
        executeDatabaseOperationWithReadRetry(
          operation,
          async () => {
            calls += 1;
            throw error;
          },
          { maxAttempts: 3, sleep: async () => undefined },
        ),
        (actual) => actual === error,
      );
      assert.equal(calls, 1, operation);
    }
  });

  test("never retries reads inside a transaction context", async () => {
    let calls = 0;
    const error = transientError();

    await assert.rejects(
      runInDatabaseTransactionContext(() =>
        executeDatabaseOperationWithReadRetry(
          "findMany",
          async () => {
            calls += 1;
            throw error;
          },
          { maxAttempts: 3, sleep: async () => undefined },
        ),
      ),
      (actual) => actual === error,
    );
    assert.equal(calls, 1);
  });

  test("stops after the configured maximum and rethrows the original error", async () => {
    let calls = 0;
    const error = transientError("P1017");

    await assert.rejects(
      executeDatabaseOperationWithReadRetry(
        "rawRead",
        async () => {
          calls += 1;
          throw error;
        },
        { maxAttempts: 2, sleep: async () => undefined },
      ),
      (actual) => actual === error,
    );
    assert.equal(calls, 2);
  });
});
