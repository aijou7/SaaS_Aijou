import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { resolve } from "node:path";
import {
  buildReceiptMediaCleanupPlan,
  cleanupPersistedReceiptMedia,
  type PersistedReceiptMedia,
  receiptMediaSnapshotsMatch,
} from "../src/server/auth/account-media-cleanup";

const cwd = resolve("C:/aijou-app");
const businessId = "workspace:default";

describe("account receipt media cleanup", () => {
  test("plans only workspace-scoped blob and local receipt media", () => {
    const localFile = resolve(cwd, "storage", "receipts", businessId, "receipt.jpg");
    const plan = buildReceiptMediaCleanupPlan(
      [
        media({
          storagePath: `receipts/${businessId}/receipt-random.jpg`,
          fileUrl:
            `https://store.private.blob.vercel-storage.com/receipts/${businessId}/receipt-random.jpg`,
        }),
        media({ storagePath: localFile }),
        media({
          storagePath: null,
          fileUrl:
            `https://store.private.blob.vercel-storage.com/receipts/${businessId}/legacy.jpg`,
        }),
      ],
      cwd,
    );

    assert.deepEqual(plan.blobTargets, [
      `receipts/${businessId}/receipt-random.jpg`,
      `https://store.private.blob.vercel-storage.com/receipts/${businessId}/legacy.jpg`,
    ]);
    assert.deepEqual(plan.localFiles, [
      {
        businessId,
        path: localFile,
        allowedDirectory: resolve(cwd, "storage", "receipts", businessId),
      },
    ]);
  });

  test("rejects foreign blob prefixes, encoded traversal, and local paths outside the workspace", () => {
    const invalid: PersistedReceiptMedia[] = [
      media({ storagePath: "receipts/another-workspace/receipt.jpg" }),
      media({
        storagePath: null,
        fileUrl:
          `https://store.private.blob.vercel-storage.com/receipts/${businessId}/%2e%2e/secret.jpg`,
      }),
      media({ storagePath: resolve(cwd, "storage", "receipts", "other", "receipt.jpg") }),
    ];

    for (const item of invalid) {
      assert.throws(
        () => buildReceiptMediaCleanupPlan([item], cwd),
        /outside|verified/i,
      );
    }
  });

  test("propagates cleanup failures so the account row can be retried", async () => {
    const calls: string[][] = [];
    await assert.rejects(
      cleanupPersistedReceiptMedia(
        [media({ storagePath: `receipts/${businessId}/receipt.jpg` })],
        {
          cwd,
          operations: {
            deleteBlobs: async (targets) => {
              calls.push(targets);
              throw new Error("blob provider unavailable");
            },
          },
        },
      ),
      /blob provider unavailable/,
    );
    assert.deepEqual(calls, [[`receipts/${businessId}/receipt.jpg`]]);
  });

  test("requires the final database snapshot to match every cleaned media row", () => {
    const first = {
      id: "media-1",
      ...media({ storagePath: `receipts/${businessId}/first.jpg` }),
    };
    const second = {
      id: "media-2",
      ...media({ storagePath: `receipts/${businessId}/second.jpg` }),
    };

    assert.equal(receiptMediaSnapshotsMatch([first, second], [second, first]), true);
    assert.equal(receiptMediaSnapshotsMatch([first], [first, second]), false);
    assert.equal(
      receiptMediaSnapshotsMatch(
        [first],
        [{ ...first, storagePath: `receipts/${businessId}/late.jpg` }],
      ),
      false,
    );
  });

  test("honors an expired cleanup deadline before deleting a batch", async () => {
    let deleteCalls = 0;
    await assert.rejects(
      cleanupPersistedReceiptMedia(
        [media({ storagePath: `receipts/${businessId}/receipt.jpg` })],
        {
          cwd,
          abortSignal: AbortSignal.abort(),
          operations: {
            deleteBlobs: async () => {
              deleteCalls += 1;
            },
          },
        },
      ),
      { name: "AbortError" },
    );
    assert.equal(deleteCalls, 0);
  });
});

function media(
  overrides: Partial<PersistedReceiptMedia>,
): PersistedReceiptMedia {
  return {
    businessId,
    storagePath: null,
    fileUrl: null,
    ...overrides,
  };
}
