import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { mapKeyedSequential } from "../src/lib/keyed-concurrency";

describe("keyed concurrency", () => {
  test("preserves order within one sender while parallelizing other senders", async () => {
    const items = [
      { key: "owner", id: "create" },
      { key: "customer", id: "hello" },
      { key: "owner", id: "confirm" },
      { key: "customer", id: "details" },
    ];
    const activeKeys = new Set<string>();
    const completedByKey = new Map<string, string[]>();
    let peak = 0;

    const result = await mapKeyedSequential(
      items,
      4,
      (item) => item.key,
      async (item) => {
        assert.equal(activeKeys.has(item.key), false, `overlap for ${item.key}`);
        activeKeys.add(item.key);
        peak = Math.max(peak, activeKeys.size);
        await new Promise((resolve) => setTimeout(resolve, 5));
        const completed = completedByKey.get(item.key) ?? [];
        completed.push(item.id);
        completedByKey.set(item.key, completed);
        activeKeys.delete(item.key);
        return item.id;
      },
    );

    assert.deepEqual(result, ["create", "hello", "confirm", "details"]);
    assert.deepEqual(completedByKey.get("owner"), ["create", "confirm"]);
    assert.deepEqual(completedByKey.get("customer"), ["hello", "details"]);
    assert.equal(peak, 2);
  });
});
