import assert from "node:assert/strict";
import test from "node:test";
import { formatAiConfidence, getAiActivityCopy } from "../src/lib/ai-activity-labels";

test("AI activity labels never expose common internal event keys", () => {
  const cases = [
    ["lead_summary_upserted", "lead_summary", "Ringkasan calon pelanggan diperbarui"],
    ["customer_service_reply_created", "customer_service_reply", "Pelanggan sudah dibalas"],
    ["customer_media_acknowledged", "customer_media", "Lampiran pelanggan diterima"],
    ["handoff_reply_created", "handoff_request", "Percakapan diteruskan ke tim"],
  ] as const;

  for (const [action, intent, expected] of cases) {
    const copy = getAiActivityCopy(action, intent);
    assert.equal(copy.title, expected);
    assert.doesNotMatch(copy.title, /_/);
    assert.doesNotMatch(copy.description, /_/);
  }
});

test("unknown activity keys still receive a readable fallback", () => {
  const copy = getAiActivityCopy("conversation_resolved", "conversation_resolved");
  assert.equal(copy.title, "Percakapan diselesaikan");
  assert.equal(formatAiConfidence(0.84), "Yakin 84%");
  assert.equal(formatAiConfidence(null), "Belum dinilai");
});
