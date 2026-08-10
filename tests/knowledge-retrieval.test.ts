import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { rankRelevantKnowledge } from "../src/lib/knowledge-retrieval";

describe("knowledge retrieval", () => {
  const entries = [
    {
      id: "wifi",
      title: "Instalasi WiFi villa",
      category: "services",
      content: "Survey lokasi diperlukan untuk menentukan access point dan topologi jaringan.",
      priority: 80,
    },
    {
      id: "web",
      title: "Website company profile",
      category: "services",
      content: "Website profile mulai dari satu juta rupiah.",
      priority: 80,
    },
  ];

  test("selects only the context relevant to the latest customer question", () => {
    const ranked = rankRelevantKnowledge(entries, "berapa harga website company profile?", 1);
    assert.equal(ranked[0]?.id, "web");
  });

  test("uses owner priority as the conflict tiebreaker", () => {
    const ranked = rankRelevantKnowledge(
      [
        { id: "old", title: "Harga dashboard", content: "Mulai 10 juta", priority: 60 },
        { id: "official", title: "Harga dashboard", content: "Mulai 12 juta", priority: 95 },
      ],
      "harga dashboard",
      2,
    );
    assert.equal(ranked[0]?.id, "official");
  });
});
