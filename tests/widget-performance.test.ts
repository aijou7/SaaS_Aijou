import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Script } from "node:vm";
import { describe, test } from "node:test";

describe("website widget performance guardrails", () => {
  test("ships valid standalone JavaScript with visibility-aware adaptive polling", async () => {
    const source = await readFile(new URL("../public/aijou-widget.js", import.meta.url), "utf8");

    assert.doesNotThrow(() => new Script(source));
    assert.doesNotMatch(source, /setInterval\s*\(/);
    assert.match(source, /visibilitychange/);
    assert.match(source, /window\.addEventListener\("offline", stopPolling\)/);
    assert.match(source, /pollDelays\s*=\s*\[4000, 5000, 7000, 10000\]/);
  });
});
